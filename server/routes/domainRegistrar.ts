/**
 * Domain Registrar API — Max Booster Built-In DNS
 *
 * Domains are claimed and managed entirely by Max Booster's internal DNS
 * system.  No external registrar API is required or called.
 *
 * Endpoints:
 *   GET  /api/domain-registrar/search?name=mybeats   — availability check
 *   POST /api/domain-registrar/claim                  — claim a domain
 *   GET  /api/domain-registrar/my-domains             — list user's domains
 *   DELETE /api/domain-registrar/my-domains/:id       — remove a domain record
 *   GET  /api/domain-registrar/config                 — nameserver info
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { claimedDomains, users } from '@shared/schema';
import { logger } from '../logger.js';
import {
  checkDomainAvailability,
  logClaim,
  SEARCH_TLDS,
  DOMAIN_PRICES,
  NS,
  NS1,
  NS2,
  PLATFORM_DOMAIN,
} from '../services/domainRegistrarService.js';

const router = Router();

// ── Config / nameserver info (public) ────────────────────────────────────────

router.get('/config', (_req, res) => {
  return res.json({
    ok: true,
    ns: NS,
    ns1: NS1,
    ns2: NS2,
    platformDomain: PLATFORM_DOMAIN,
    supportedTlds: SEARCH_TLDS,
    builtIn: true,
  });
});

// ── Domain availability search ────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const raw = ((req.query.name as string) || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!raw || raw.length < 2 || raw.length > 63) {
      return res.status(400).json({ ok: false, error: 'name must be 2–63 characters.' });
    }

    const results = await checkDomainAvailability(raw, SEARCH_TLDS);

    // Sort: available first, then by TLD popularity
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

// ── Claim a domain (register with built-in DNS) ───────────────────────────────

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

    // Check if already claimed
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

    const tld = '.' + domainLower.split('.').slice(1).join('.');
    const sld = domainLower.split('.')[0];

    // Determine if platform subdomain (*.maxboostermusic.com) or external domain
    const isPlatformSubdomain = domainLower.endsWith(`.${PLATFORM_DOMAIN}`);
    const status = isPlatformSubdomain ? 'active' : 'platform_managed';

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const [record] = await db
      .insert(claimedDomains)
      .values({
        userId,
        storefrontId: storefrontId || null,
        domain: domainLower,
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

    logClaim(domainLower, userId);

    const message = isPlatformSubdomain
      ? 'Your Max Booster subdomain is active and ready to use.'
      : `Domain reserved. Point your nameserver to ${NS} to activate Max Booster DNS.`;

    return res.status(201).json({
      ok: true,
      domain: record.domain,
      status: record.status,
      expiresAt: record.expiresAt,
      ns: NS,
      message,
    });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] claim error');
    const status = err.message?.includes('already') ? 409 : 500;
    return res.status(status).json({ ok: false, error: err.message || 'Registration failed.' });
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
      .select({ userId: claimedDomains.userId })
      .from(claimedDomains)
      .where(eq(claimedDomains.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Domain not found.' });
    if (row.userId !== userId) return res.status(403).json({ ok: false, error: 'Forbidden.' });

    await db.delete(claimedDomains).where(eq(claimedDomains.id, req.params.id));
    return res.json({ ok: true });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] delete error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

export default router;
