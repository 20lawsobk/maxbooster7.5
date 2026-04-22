/**
 * Domain Registrar API — Max Booster Built-In DNS
 *
 * Domains are claimed and managed entirely within Max Booster's registrar
 * infrastructure.  The RegistrarService abstraction means the underlying
 * provider (internal DB or EPP) can be swapped without changing these routes.
 *
 * Endpoints:
 *   GET    /api/domain-registrar/config                  — nameserver info + provider
 *   GET    /api/domain-registrar/search?name=mybeats     — availability check
 *   POST   /api/domain-registrar/claim                   — claim / register a domain
 *   GET    /api/domain-registrar/my-domains              — list user's domains
 *   GET    /api/domain-registrar/my-domains/:id          — single domain detail
 *   POST   /api/domain-registrar/my-domains/:id/release  — soft-release (frees quota)
 *   POST   /api/domain-registrar/my-domains/:id/renew    — manual renew
 *   GET    /api/domain-registrar/my-domains/:id/events   — lifecycle event history
 *   DELETE /api/domain-registrar/my-domains/:id          — hard remove record
 *   GET    /api/domain-registrar/contacts                — list contact profiles
 *   PUT    /api/domain-registrar/contacts                — upsert default contact
 */

import { Router }    from 'express';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool }  from '../db.js';
import { claimedDomains, domainContacts, storefronts } from '@shared/schema';
import { logger }    from '../logger.js';
import {
  checkDomainAvailability,
  logClaim,
  SEARCH_TLDS,
  NS,
  NS1,
  NS2,
  PLATFORM_DOMAIN,
} from '../services/domainRegistrarService.js';
import { getRegistrarProvider }      from '../services/registrar/index.js';
import {
  enforceQuota,
  softReleaseDomain,
  buildContactProfile,
  emitDomainEvent,
  getDomainEvents,
  getDomainQuota,
} from '../services/domainPolicyEngine.js';

const router = Router();

// ── Auth gate ─────────────────────────────────────────────────────────────────
// /config and /search are intentionally public (availability checks, NS info).
// Every route defined below router.use(requireAuth) requires an active session —
// already guaranteed by Max Booster's protected-route wrapper on the frontend,
// but enforced here as well for direct API callers.
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  next();
};

// ── Config / nameserver info (public) ────────────────────────────────────────

router.get('/config', async (_req, res) => {
  const provider = getRegistrarProvider();
  const health   = await provider.healthCheck().catch(() => ({ ok: false }));
  return res.json({
    ok:             true,
    ns:             NS,
    ns1:            NS1,
    ns2:            NS2,
    platformDomain: PLATFORM_DOMAIN,
    supportedTlds:  SEARCH_TLDS,
    builtIn:        true,
    provider:       provider.name,
    providerHealthy: health.ok,
  });
});

// ── Domain availability search ────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const raw = ((req.query.name as string) || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!raw || raw.length < 2 || raw.length > 63) {
      return res.status(400).json({ ok: false, error: 'Name must be 2–63 characters.' });
    }

    const dnsResults = await checkDomainAvailability(raw, SEARCH_TLDS);

    const candidateDomains = dnsResults.map(r => r.domain);
    const alreadyClaimed   = await db
      .select({ domain: claimedDomains.domain })
      .from(claimedDomains)
      .where(inArray(claimedDomains.domain, candidateDomains));

    const claimedSet = new Set(alreadyClaimed.map(r => r.domain));

    const results = dnsResults.map(r => ({
      ...r,
      available:         r.available && !claimedSet.has(r.domain),
      claimedByPlatform: claimedSet.has(r.domain),
    }));

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

// All routes below this line require an authenticated session.
router.use(requireAuth);

// ── Claim a domain ────────────────────────────────────────────────────────────

router.post('/claim', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { domain, storefrontId } = req.body;

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ ok: false, error: 'domain is required.' });
    }

    const domainLower = domain.toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]*\.[a-z.]+$/.test(domainLower)) {
      return res.status(400).json({ ok: false, error: 'Invalid domain format.' });
    }

    // Already owned by this user?
    const [existing] = await db
      .select({ id: claimedDomains.id, userId: claimedDomains.userId, status: claimedDomains.status })
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, domainLower))
      .limit(1);

    if (existing) {
      if (existing.userId === userId) {
        return res.json({ ok: true, domain: domainLower, status: 'already_owned', alreadyOwned: true });
      }
      return res.status(409).json({ ok: false, error: 'This domain is already registered by another user.' });
    }

    // Enforce quota + subscription (throws on violation)
    try {
      await enforceQuota(userId);
    } catch (e: any) {
      return res.status(403).json({ ok: false, error: e.message, code: e.code });
    }

    const isPlatformSubdomain = domainLower.endsWith(`.${PLATFORM_DOMAIN}`);

    // Build contact profile from user account data
    const contact = await buildContactProfile(userId);

    // Register via RegistrarService
    const registrar = getRegistrarProvider();
    const result    = await registrar.registerDomain({
      fqdn:           domainLower,
      userId,
      contact,
      nameservers:    [NS1, NS2],
      years:          1,
      privacyEnabled: true,
    });

    // Fetch the newly created record
    const [record] = await db
      .select()
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, domainLower))
      .limit(1);

    // If storefront specified + immediately active subdomain, update storefront
    if (storefrontId && isPlatformSubdomain) {
      try {
        await db
          .update(storefronts)
          .set({ customDomain: domainLower, isCustomDomainActive: true })
          .where(eq(storefronts.id, storefrontId));
      } catch (sfErr: any) {
        logger.warn({ err: sfErr, storefrontId }, '[domainRegistrar] storefront update failed (non-fatal)');
      }
    }

    // Emit event
    if (record) {
      await emitDomainEvent('DomainRegistered', record.id, userId, domainLower, {
        isPlatformSubdomain,
        years: 1,
        expiresAt: result.expiresAt,
        provider: registrar.name,
      });
    }

    logClaim(domainLower, userId);

    return res.status(201).json({
      ok:        true,
      domain:    domainLower,
      status:    result.status,
      expiresAt: result.expiresAt,
      ns:        NS,
      message:   result.message,
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
    const userId = (req.user as any).id;
    const domains = await db
      .select()
      .from(claimedDomains)
      .where(eq(claimedDomains.userId, userId))
      .orderBy(claimedDomains.createdAt);

    const quota = await getDomainQuota(userId);

    return res.json({ ok: true, domains, quota });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] my-domains error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

// ── Single domain detail ──────────────────────────────────────────────────────

router.get('/my-domains/:id', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const [row] = await db
      .select()
      .from(claimedDomains)
      .where(eq(claimedDomains.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Domain not found.' });
    if (row.userId !== userId) return res.status(403).json({ ok: false, error: 'Forbidden.' });

    return res.json({ ok: true, domain: row });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] get-domain error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

// ── Soft-release a domain (frees quota slot) ──────────────────────────────────

router.post('/my-domains/:id/release', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    await softReleaseDomain(req.params.id, userId);

    return res.json({
      ok:      true,
      message: 'Domain released. It will remain registered until natural expiry but no longer counts toward your quota.',
    });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] release error');
    const status = err.message?.includes('Forbidden') ? 403
      : err.message?.includes('not found') ? 404
      : err.message?.includes('already released') ? 409 : 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
});

// ── Manual domain renewal ─────────────────────────────────────────────────────

router.post('/my-domains/:id/renew', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const years  = Math.max(1, Math.min(10, Number(req.body.years ?? 1)));

    const [row] = await db
      .select({ userId: claimedDomains.userId, domain: claimedDomains.domain, status: claimedDomains.status })
      .from(claimedDomains)
      .where(eq(claimedDomains.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Domain not found.' });
    if (row.userId !== userId) return res.status(403).json({ ok: false, error: 'Forbidden.' });
    if (row.status === 'released' || row.status === 'expired') {
      return res.status(409).json({ ok: false, error: `Cannot renew a ${row.status} domain.` });
    }

    const result = await getRegistrarProvider().renewDomain(row.domain, years);

    await emitDomainEvent('DomainRenewed', req.params.id, userId, row.domain, {
      years,
      newExpiresAt: result.expiresAt,
      manual: true,
    });

    return res.json({ ok: true, expiresAt: result.expiresAt, years });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] renew error');
    return res.status(500).json({ ok: false, error: err.message || 'Renewal failed.' });
  }
});

// ── Domain event history ──────────────────────────────────────────────────────

router.get('/my-domains/:id/events', async (req, res) => {
  try {
    const userId = (req.user as any).id;

    // Verify ownership
    const [row] = await db
      .select({ userId: claimedDomains.userId })
      .from(claimedDomains)
      .where(eq(claimedDomains.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Domain not found.' });
    if (row.userId !== userId) return res.status(403).json({ ok: false, error: 'Forbidden.' });

    const events = await getDomainEvents(req.params.id, userId);
    return res.json({ ok: true, events });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] events error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

// ── Hard remove a claimed domain record ───────────────────────────────────────

router.delete('/my-domains/:id', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const [row] = await db
      .select({ userId: claimedDomains.userId, domain: claimedDomains.domain })
      .from(claimedDomains)
      .where(eq(claimedDomains.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Domain not found.' });
    if (row.userId !== userId) return res.status(403).json({ ok: false, error: 'Forbidden.' });

    await emitDomainEvent('DomainReleased', req.params.id, userId, row.domain, { hardDelete: true });
    await db.delete(claimedDomains).where(eq(claimedDomains.id, req.params.id));

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

// ── Contact profiles ──────────────────────────────────────────────────────────

router.get('/contacts', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const contacts = await db
      .select()
      .from(domainContacts)
      .where(eq(domainContacts.userId, userId))
      .orderBy(domainContacts.createdAt);

    // If none exist, derive one from the user account
    if (contacts.length === 0) {
      const derived = await buildContactProfile(userId);
      return res.json({ ok: true, contacts: [], derived });
    }

    return res.json({ ok: true, contacts });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] contacts error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

router.put('/contacts', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { name, org, email, phone, address } = req.body;

    if (!name || !email) {
      return res.status(400).json({ ok: false, error: 'name and email are required.' });
    }

    // Upsert default registrant contact
    const existing = await db
      .select({ id: domainContacts.id })
      .from(domainContacts)
      .where(eq(domainContacts.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db.update(domainContacts)
        .set({ name, org, email, phone, address, isDefault: true, updatedAt: new Date() })
        .where(eq(domainContacts.id, existing[0].id));
    } else {
      await db.insert(domainContacts).values({
        userId,
        contactType: 'registrant',
        name,
        org,
        email,
        phone,
        address,
        isDefault: true,
      });
    }

    await emitDomainEvent('DomainContactUpdated', '_contact', userId, '_profile', { name, email });

    return res.json({ ok: true });
  } catch (err: any) {
    logger.warn({ err }, '[domainRegistrar] contacts update error');
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

export default router;
