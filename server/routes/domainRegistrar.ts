/**
 * Domain Registrar API — Max Booster first-person DNS provider
 *
 * Endpoints:
 *   GET  /api/domain-registrar/search?name=mybeats     — availability + pricing
 *   POST /api/domain-registrar/claim                   — register a real domain
 *   GET  /api/domain-registrar/my-domains              — list user's domains
 *   POST /api/domain-registrar/set-nameservers         — point domain to Max Booster NS
 *   GET  /api/domain-registrar/config                  — registrar configuration status
 */

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { claimedDomains, storefronts, users } from '@shared/schema';
import { logger } from '../logger.js';
import {
  isConfigured,
  checkDomainAvailability,
  registerDomain,
  setMaxBoosterNameservers,
  SEARCH_TLDS,
  DOMAIN_PRICES,
  NS1,
  NS2,
} from '../services/domainRegistrarService.js';
import dns from 'dns';

const dnsResolve = dns.promises.resolve;

const router = Router();

// ── Registrar config status (no auth) ────────────────────────────────────────

router.get('/config', (_req, res) => {
  return res.json({
    ok: true,
    configured: isConfigured(),
    ns1: NS1,
    ns2: NS2,
    supportedTlds: SEARCH_TLDS,
    prices: DOMAIN_PRICES,
  });
});

// ── Domain search + availability ─────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const raw = ((req.query.name as string) || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!raw || raw.length < 2 || raw.length > 63) {
      return res.status(400).json({ ok: false, error: 'name must be 2–63 characters.' });
    }

    let results: any[];

    if (isConfigured()) {
      // Live Namecheap availability check
      results = await checkDomainAvailability(raw, SEARCH_TLDS);
    } else {
      // Fallback: DNS-based availability check (no registrar credentials needed)
      const timeout = <T>(ms: number, p: Promise<T>): Promise<T> =>
        Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

      async function dnsAvailable(domain: string): Promise<boolean> {
        for (const type of ['NS', 'A'] as const) {
          try {
            const records = await timeout(2500, dnsResolve(domain, type));
            if (records && records.length > 0) return false;
          } catch { /* ENOTFOUND = not registered */ }
        }
        return true;
      }

      const checks = await Promise.allSettled(
        SEARCH_TLDS.map(async (tld) => {
          const domain    = `${raw}${tld}`;
          const available = await dnsAvailable(domain);
          const price     = DOMAIN_PRICES[tld];
          return { domain, tld, available, isPremium: false, priceCents: price?.registrationCents ?? null, renewalCents: price?.renewalCents ?? null };
        })
      );

      results = checks
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
    }

    // Sort: available first, then by price asc
    results.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.priceCents ?? 99999) - (b.priceCents ?? 99999);
    });

    return res.json({ ok: true, name: raw, results, registrarConfigured: isConfigured() });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] search error');
    return res.status(500).json({ ok: false, error: 'Search temporarily unavailable.' });
  }
});

// ── Register / claim a domain ─────────────────────────────────────────────────

router.post('/claim', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

    const userId = (req.user as any).id;
    const { domain, storefrontId, years = 1, contact } = req.body;

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ ok: false, error: 'domain is required.' });
    }

    const domainLower = domain.toLowerCase().trim();

    // Validate the domain format
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

    const tld   = '.' + domainLower.split('.').slice(1).join('.');
    const sld   = domainLower.split('.')[0];
    const price = DOMAIN_PRICES[tld];

    if (isConfigured() && contact) {
      // Actual registration via Namecheap
      const result = await registerDomain(domainLower, years, contact);

      const expiresAt = result.expiresAt;

      const [record] = await db
        .insert(claimedDomains)
        .values({
          userId,
          storefrontId: storefrontId || null,
          domain: domainLower,
          sld,
          tld,
          status: result.registered ? 'active' : 'pending',
          registrarOrderId: result.orderId,
          registrarName: 'namecheap',
          nameserver1: NS1,
          nameserver2: NS2,
          expiresAt,
          yearsRegistered: years,
          pricePaidCents: price?.registrationCents ?? null,
          registrationData: { contact: { ...contact, phone: '***' } },
        })
        .returning();

      logger.info({ domain: domainLower, userId, orderId: result.orderId }, '[domainRegistrar] domain registered');
      return res.status(201).json({
        ok: true,
        domain: record.domain,
        status: record.status,
        expiresAt: record.expiresAt,
        nameservers: { ns1: NS1, ns2: NS2 },
        message: 'Domain registered! DNS is already configured — your site will be live within minutes.',
      });
    } else {
      // No registrar configured or no contact info — save as platform_managed
      // (user buys domain externally, we manage DNS)
      const [record] = await db
        .insert(claimedDomains)
        .values({
          userId,
          storefrontId: storefrontId || null,
          domain: domainLower,
          sld,
          tld,
          status: 'platform_managed',
          registrarName: 'external',
          nameserver1: NS1,
          nameserver2: NS2,
          yearsRegistered: years,
          pricePaidCents: 0,
        })
        .returning();

      logger.info({ domain: domainLower, userId }, '[domainRegistrar] domain claimed (platform managed)');
      return res.status(201).json({
        ok: true,
        domain: record.domain,
        status: 'platform_managed',
        nameservers: { ns1: NS1, ns2: NS2 },
        message: 'Domain reserved on Max Booster. Purchase it from any registrar, then point nameservers to Max Booster.',
      });
    }
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

// ── Point an externally-purchased domain to Max Booster NS ───────────────────

router.post('/set-nameservers', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

    const { domain } = req.body;
    if (!domain) return res.status(400).json({ ok: false, error: 'domain is required.' });

    if (isConfigured()) {
      await setMaxBoosterNameservers(domain.toLowerCase().trim());
    }

    return res.json({
      ok: true,
      ns1: NS1,
      ns2: NS2,
      message: isConfigured()
        ? 'Nameservers updated. DNS will propagate within 1–48 hours.'
        : 'Log into your registrar and set these nameservers manually.',
    });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] set-nameservers error');
    return res.status(500).json({ ok: false, error: err.message || 'Internal error.' });
  }
});

// ── Remove / release a domain record ─────────────────────────────────────────

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
