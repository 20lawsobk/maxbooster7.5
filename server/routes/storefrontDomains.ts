import { Router } from "express";
import { eq, and } from "drizzle-orm";
import dns from "dns";
import {
  checkManaged,
  reserveManaged,
  requestCustomDomain,
  verifyCustomDomain,
  listDomains,
  deleteDomain,
} from "../modules/domains/domain.controller.js";
import { publishStorefront, unpublishStorefront } from "../modules/publish/publish.service.js";
import { logger } from "../logger.js";
import { db } from "../db.js";
import { storefrontDomains, storefronts } from "@shared/schema";
import { validateFreeDomain } from "@shared/domainValidation.js";

const dnsResolve = dns.promises.resolve;

/**
 * Returns true if the domain already has real-world DNS records (NS or A/AAAA),
 * meaning it is already registered by someone externally.
 * A timeout prevents slow lookups from blocking the request.
 */
async function isDomainRegisteredExternally(domain: string): Promise<boolean> {
  const timeout = <T>(ms: number, promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);

  // Check NS records first — set by registrars even for parked domains
  for (const type of ["NS", "A", "AAAA"] as const) {
    try {
      const records = await timeout(3000, dnsResolve(domain, type));
      if (records && records.length > 0) return true;
    } catch {
      // ENOTFOUND / ENODATA / timeout — keep checking next type
    }
  }
  return false;
}

const BASE_DOMAIN = process.env.BASE_DOMAIN || "maxbooster.replit.app";

const router = Router();

// Resolve a managed label to its storefront slug (used by client-side /s/:label route)
router.get("/resolve/:label", async (req, res) => {
  try {
    const label = req.params.label.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const fqdn = `${label}.${BASE_DOMAIN}`;
    const [row] = await db
      .select({ slug: storefronts.slug, isActive: storefronts.isActive })
      .from(storefrontDomains)
      .innerJoin(storefronts, eq(storefrontDomains.storefrontId, storefronts.id))
      .where(and(eq(storefrontDomains.domain, fqdn), eq(storefrontDomains.type, "managed_subdomain")))
      .limit(1);
    if (!row) return res.status(404).json({ ok: false, error: "Not found." });
    return res.json({ ok: true, slug: row.slug, label });
  } catch (err) {
    logger.warn("[domains] resolve error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
});

router.post("/managed/check", checkManaged);
router.post("/managed/reserve", reserveManaged);

router.post("/custom/request", requestCustomDomain);
router.post("/custom/verify", verifyCustomDomain);

router.get("/storefront/:storefrontId", listDomains);
router.delete("/:domainId", deleteDomain);

router.post("/storefront/:storefrontId/publish", async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });
    await publishStorefront(req.params.storefrontId, (req.user as any).id);
    return res.json({ ok: true, status: "live" });
  } catch (err: any) {
    logger.warn("[storefrontDomains] publish error:", err);
    const status = err.message === "Unauthorized." ? 403 : err.message === "Storefront not found." ? 404 : 500;
    return res.status(status).json({ ok: false, error: err.message || "Internal error." });
  }
});

router.post("/storefront/:storefrontId/unpublish", async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });
    await unpublishStorefront(req.params.storefrontId, (req.user as any).id);
    return res.json({ ok: true, status: "draft" });
  } catch (err: any) {
    logger.warn("[storefrontDomains] unpublish error:", err);
    const status = err.message === "Unauthorized." ? 403 : err.message === "Storefront not found." ? 404 : 500;
    return res.status(status).json({ ok: false, error: err.message || "Internal error." });
  }
});

// ── Free Platform Domain (user's own full domain, e.g. mybeats.com) ─────────
// Check availability of a full domain name (no auth required).
// Performs two checks in parallel:
//   1. Internal DB — is the domain already claimed on Max Booster?
//   2. Real-world DNS — is the domain already registered globally?
router.post("/platform/check", async (req, res) => {
  try {
    const { sld, tld } = req.body;
    const v = validateFreeDomain(sld, tld);
    if (!v.valid) {
      return res.status(400).json({ ok: false, available: false, error: v.error });
    }
    const domain = v.domain!;

    // Run DB lookup and external DNS check in parallel for speed
    const [dbResult, externallyRegistered] = await Promise.all([
      db.select({ id: storefrontDomains.id })
        .from(storefrontDomains)
        .where(eq(storefrontDomains.domain, domain))
        .limit(1),
      isDomainRegisteredExternally(domain),
    ]);

    if (dbResult.length > 0) {
      return res.json({ ok: true, available: false, domain, reason: "claimed" });
    }
    if (externallyRegistered) {
      return res.json({ ok: true, available: false, domain, reason: "registered_externally" });
    }
    return res.json({ ok: true, available: true, domain });
  } catch (err) {
    logger.warn("[domains] platform check error:", err);
    return res.status(500).json({ ok: false, available: false, error: "Internal error." });
  }
});

// Public registry lookup — lets any external party verify if a domain is claimed on Max Booster.
// GET /api/storefront-domains/registry/:domain
router.get("/registry/:domain", async (req, res) => {
  try {
    const domain = req.params.domain?.toLowerCase().trim();
    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) {
      return res.status(400).json({ ok: false, error: "Invalid domain." });
    }
    const [row] = await db
      .select({
        domain: storefrontDomains.domain,
        status: storefrontDomains.status,
        claimedAt: storefrontDomains.createdAt,
      })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, domain))
      .limit(1);
    if (!row) {
      return res.json({ ok: true, claimed: false, domain });
    }
    return res.json({
      ok: true,
      claimed: true,
      domain: row.domain,
      status: row.status,
      claimedAt: row.claimedAt,
      managedBy: "Max Booster DNS (maxboostermusic.com)",
    });
  } catch (err) {
    logger.warn("[domains] registry lookup error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
});

// Claim a free full domain — provisioned immediately, managed by Max Booster DNS
router.post("/platform/claim", async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { sld, tld, storefrontId } = req.body;
    if (!storefrontId) {
      return res.status(400).json({ ok: false, error: "storefrontId is required." });
    }
    const v = validateFreeDomain(sld, tld);
    if (!v.valid) {
      return res.status(400).json({ ok: false, error: v.error });
    }

    const domain = v.domain!;

    // Verify storefront belongs to this user
    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, storefrontId))
      .limit(1);
    if (!sf || sf.userId !== (req.user as any).id) {
      return res.status(403).json({ ok: false, error: "Storefront not found or access denied." });
    }

    // Check the domain isn't taken
    const [existing] = await db
      .select({ id: storefrontDomains.id, storefrontId: storefrontDomains.storefrontId })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, domain))
      .limit(1);
    if (existing) {
      if (existing.storefrontId === storefrontId) {
        return res.json({ ok: true, domain, url: `https://${domain}`, alreadyOwned: true });
      }
      return res.status(409).json({ ok: false, error: "This domain is already registered on another storefront." });
    }

    // Remove any existing platform domain entries for this storefront first (one free domain at a time)
    await db
      .delete(storefrontDomains)
      .where(and(eq(storefrontDomains.storefrontId, storefrontId), eq(storefrontDomains.type, "platform_subdomain")));

    // Register — immediately active (provisioned via Max Booster's managed DNS)
    await db.insert(storefrontDomains).values({
      storefrontId,
      domain,
      type: "platform_subdomain",
      status: "active",
      isPrimary: true,
    });

    logger.info(`[domains] Free domain claimed: ${domain} → storefront ${storefrontId}`);
    return res.json({ ok: true, domain, url: `https://${domain}` });
  } catch (err: any) {
    logger.warn("[domains] platform claim error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal error." });
  }
});

// Get current platform subdomain for a storefront
router.get("/platform/:storefrontId", async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });
    const [row] = await db
      .select({ domain: storefrontDomains.domain, status: storefrontDomains.status })
      .from(storefrontDomains)
      .where(
        and(
          eq(storefrontDomains.storefrontId, req.params.storefrontId),
          eq(storefrontDomains.type, "platform_subdomain"),
        ),
      )
      .limit(1);
    return res.json({ ok: true, domain: row?.domain ?? null, status: row?.status ?? null });
  } catch (err) {
    logger.warn("[domains] platform get error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
});

// DNS server status & configuration info
router.get("/dns/status", async (req, res) => {
  try {
    const { getDNSInfo, isDNSRunning } = await import("../services/dnsServer.js");
    return res.json({ ok: true, ...getDNSInfo(), running: isDNSRunning() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "DNS service unavailable." });
  }
});

export default router;
