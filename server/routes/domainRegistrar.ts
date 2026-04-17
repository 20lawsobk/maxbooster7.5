/**
 * Domain Registrar API — Max Booster Built-In DNS
 *
 * Domains are claimed and managed entirely by Max Booster's internal DNS
 * system.  No external registrar API is required or called.
 *
 * Endpoints:
 *   GET  /api/domain-registrar/config                 — nameserver info
 *   GET  /api/domain-registrar/search?name=mybeats    — availability check
 *   POST /api/domain-registrar/claim                  — claim a domain
 *   GET  /api/domain-registrar/my-domains             — list user's domains
 *   DELETE /api/domain-registrar/my-domains/:id       — remove a domain record
 */

import { Router } from 'express';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '../db.js';
import { claimedDomains, storefronts } from '@shared/schema';
import { logger } from '../logger.js';
import {
  checkDomainAvailability,
  logClaim,
  SEARCH_TLDS,
  NS,
  NS1,
  NS2,
  PLATFORM_DOMAIN,
} from '../services/domainRegistrarService.js';

const router = Router();

// ── Config / nameserver info (public) ────────────────────────────────────────

router.get('/config', (_req, res) => {
  return res.json({
    ok:             true,
    ns:             NS,
    ns1:            NS1,
    ns2:            NS2,
    platformDomain: PLATFORM_DOMAIN,
    supportedTlds:  SEARCH_TLDS,
    builtIn:        true,
  });
});

// ── Domain availability search ────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const raw = ((req.query.name as string) || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!raw || raw.length < 2 || raw.length > 63) {
      return res.status(400).json({ ok: false, error: 'Name must be 2–63 characters.' });
    }

    // Check DNS availability for all TLDs in parallel
    const dnsResults = await checkDomainAvailability(raw, SEARCH_TLDS);

    // Also check which of those domains are already claimed in Max Booster
    const candidateDomains = dnsResults.map(r => r.domain);
    const alreadyClaimed = await db
      .select({ domain: claimedDomains.domain })
      .from(claimedDomains)
      .where(inArray(claimedDomains.domain, candidateDomains));

    const claimedSet = new Set(alreadyClaimed.map(r => r.domain));

    // Mark claimed-by-us domains as unavailable
    const results = dnsResults.map(r => ({
      ...r,
      available: r.available && !claimedSet.has(r.domain),
      claimedByPlatform: claimedSet.has(r.domain),
    }));

    // Sort: available first, then by TLD popularity order
    const tldOrder = ['.com', '.io', '.music', '.band', '.studio', '.net', '.co', '.org'];
    results.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const ai = tldOrder.indexOf(a.tld);
      const bi = tldOrder.indexOf(b.tld);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return res.json({ ok: true, name: raw, results, ns: NS });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] search error');
    return res.status(500).json({ ok: false, error: 'Search temporarily unavailable.' });
  }
});

// ── Claim a domain — registers with built-in DNS ──────────────────────────────

router.post('/claim', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

    const userId = (req.user as any).id;
    const { domain, storefrontId } = req.body;

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ ok: false, error: 'domain is required.' });
    }

    const domainLower = domain.toLowerCase().trim();

    if (!/^[a-z0-9][a-z0-9-]*\.[a-z.]+$/.test(domainLower)) {
      return res.status(400).json({ ok: false, error: 'Invalid domain format.' });
    }

    // Check if already claimed in our system
    const [existing] = await db
      .select({ id: claimedDomains.id, userId: claimedDomains.userId })
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, domainLower))
      .limit(1);

    if (existing) {
      if (existing.userId === userId) {
        return res.json({ ok: true, domain: domainLower, status: 'already_owned', alreadyOwned: true });
      }
      return res.status(409).json({ ok: false, error: 'This domain is already registered by another user.' });
    }

    // Enforce 2-domain limit per user
    const MAX_DOMAINS_PER_USER = 2;
    const [{ count: domainCount }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(claimedDomains)
      .where(eq(claimedDomains.userId, userId));

    if (Number(domainCount) >= MAX_DOMAINS_PER_USER) {
      return res.status(403).json({
        ok: false,
        error: `You have reached the maximum of ${MAX_DOMAINS_PER_USER} custom domains. Remove an existing domain before claiming a new one.`,
        limitReached: true,
        limit: MAX_DOMAINS_PER_USER,
      });
    }

    const tld = '.' + domainLower.split('.').slice(1).join('.');
    const sld = domainLower.split('.')[0];

    const isPlatformSubdomain = domainLower.endsWith(`.${PLATFORM_DOMAIN}`);
    const status = isPlatformSubdomain ? 'active' : 'platform_managed';

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // 1. Create the claimed_domains record
    const [record] = await db
      .insert(claimedDomains)
      .values({
        userId,
        storefrontId: storefrontId || null,
        domain:       domainLower,
        sld,
        tld,
        status,
        registrarName:  'maxbooster',
        nameserver1:    NS,
        nameserver2:    NS,
        expiresAt,
        yearsRegistered: 1,
        pricePaidCents:  0,
      })
      .returning();

    // 2. If a storefront was specified AND this domain is immediately active
    //    (platform subdomain), push custom_domain into the storefront row so
    //    the storefront URL shows the claimed domain right away.
    if (storefrontId && status === 'active') {
      try {
        await db
          .update(storefronts)
          .set({ customDomain: domainLower, isCustomDomainActive: true })
          .where(eq(storefronts.id, storefrontId));
        logger.info({ domain: domainLower, storefrontId }, '[domainRegistrar] storefront custom_domain activated');
      } catch (sfErr: any) {
        logger.warn({ err: sfErr, storefrontId }, '[domainRegistrar] storefront custom_domain update failed (non-fatal)');
      }
    }

    // 3. Auto-create a DNS zone for this domain (idempotent)
    try {
      const existingZone = await pool.query(
        'SELECT id FROM dns_zones WHERE domain = $1 LIMIT 1',
        [domainLower]
      );
      if (existingZone.rows.length === 0) {
        const zoneResult = await pool.query(
          `INSERT INTO dns_zones (user_id, domain, status, is_verified, nameserver1, nameserver2)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [userId, domainLower, isPlatformSubdomain ? 'active' : 'pending', isPlatformSubdomain, NS, NS]
        );
        const zoneId = zoneResult.rows[0].id;

        // Add default NS + SOA records for the zone
        await pool.query(
          `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl) VALUES
           ($1, $2, $3, 'NS',  '@', $4, 3600),
           ($1, $2, $3, 'SOA', '@', $5, 3600)`,
          [
            zoneId, userId, domainLower,
            NS,
            `${NS} hostmaster.${PLATFORM_DOMAIN} 1 3600 900 604800 300`,
          ]
        );
        logger.info({ domain: domainLower, zoneId }, '[domainRegistrar] DNS zone auto-created');
      }
    } catch (zoneErr: any) {
      // DNS zone creation failing should not block the claim response
      logger.warn({ err: zoneErr, domain: domainLower }, '[domainRegistrar] DNS zone auto-create failed (non-fatal)');
    }

    logClaim(domainLower, userId);

    const message = isPlatformSubdomain
      ? 'Your Max Booster subdomain is active. DNS zone created — you can manage records now.'
      : `Domain reserved. Set your nameserver to ${NS} to activate Max Booster DNS. Your DNS zone is ready.`;

    return res.status(201).json({
      ok:        true,
      domain:    record.domain,
      status:    record.status,
      expiresAt: record.expiresAt,
      ns:        NS,
      message,
    });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] claim error');
    const httpStatus = err.message?.includes('already') ? 409 : 500;
    return res.status(httpStatus).json({ ok: false, error: err.message || 'Registration failed.' });
  }
});

// ── List user's domains ───────────────────────────────────────────────────────

router.get('/my-domains', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

    const userId = (req.user as any).id;
    const domains = await db
      .select()
      .from(claimedDomains)
      .where(eq(claimedDomains.userId, userId))
      .orderBy(claimedDomains.createdAt);

    return res.json({ ok: true, domains });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] my-domains error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

// ── Remove a claimed domain ───────────────────────────────────────────────────

router.delete('/my-domains/:id', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

    const userId = (req.user as any).id;
    const [row] = await db
      .select({ userId: claimedDomains.userId, domain: claimedDomains.domain })
      .from(claimedDomains)
      .where(eq(claimedDomains.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Domain not found.' });
    if (row.userId !== userId) return res.status(403).json({ ok: false, error: 'Forbidden.' });

    // Remove the claimed_domains record
    await db.delete(claimedDomains).where(eq(claimedDomains.id, req.params.id));

    // Also remove the associated DNS zone (non-fatal if missing)
    try {
      await pool.query('DELETE FROM dns_zones WHERE domain = $1 AND user_id = $2', [row.domain, userId]);
    } catch (zoneErr: any) {
      logger.warn({ err: zoneErr }, '[domainRegistrar] DNS zone cleanup failed (non-fatal)');
    }

    return res.json({ ok: true });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] delete error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

export default router;
