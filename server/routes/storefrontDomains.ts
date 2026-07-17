import { Router } from "express";
import { eq, and } from "drizzle-orm";
import dns from "dns";
import { checkManaged, reserveManaged, listDomains, deleteDomain } from "../modules/domains/domain.controller.js";
import {
  publishStorefront,
  unpublishStorefront,
} from "../modules/publish/publish.service.js";
import { logger } from "../logger.js";
import { db, pool } from "../db.js";
import {
  storefrontDomains,
  storefronts,
  storefrontHosts,
} from "@shared/schema";
import { validateFreeDomain } from "@shared/domainValidation.js";
import { validateDomain } from "../modules/domains/dnsValidators.js";

const dnsResolve = dns?.promises.resolve;

const DOMAIN_LIMIT = 2;

async function getUserDomainUsage(
  userId: string,
): Promise<{ zones: number; claimed: number; total: number }> {
  const uniqueResult = await pool?.query(
    `SELECT COUNT(DISTINCT domain)::int AS n FROM (
       SELECT domain FROM dns_zones WHERE user_id = $1
       UNION
       SELECT sd.domain
       FROM storefront_domains sd
       JOIN storefronts s ON s.id = sd.storefront_id
       WHERE s.user_id = $1 AND sd.type = 'platform_subdomain'
     ) combined`,
    [userId],
  );
  const total = uniqueResult?.rows[0]?.n ?? 0;
  const zonesResult = await pool?.query(
    "SELECT COUNT(*)::int AS n FROM dns_zones WHERE user_id = $1",
    [userId],
  );
  const zones = zonesResult?.rows[0]?.n ?? 0;
  return { zones, claimed: 0, total };
}

async function userHasActiveSubscription(userId: string): Promise<boolean> {
  const result = await pool?.query(
    `SELECT subscription_status, role FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const user = result?.rows[0];
  if (!user) return false;
  if (user?.role === "admin") return true;
  return ["active", "trialing"].includes(user?.subscription_status ?? "");
}

/**
 * Returns true if the domain already has real-world DNS records (NS or A/AAAA),
 * meaning it is already registered by someone externally.
 * A timeout prevents slow lookups from blocking the request.
 */
async function isDomainRegisteredExternally(domain: string): Promise<boolean> {
  const timeout = <T>(ms: number, promise: Promise<T>): Promise<T> =>
    Promise?.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), ms),
      ),
    ]);

  // Check NS records first — set by registrars even for parked domains
  for (const type of ["NS", "A", "AAAA"] as const) {
    try {
      const records = await timeout(3000, dnsResolve(domain, type));
      if (records && records?.length > 0) return true;
    } catch {
      // ENOTFOUND / ENODATA / timeout — keep checking next type
    }
  }
  return false;
}

const BASE_DOMAIN = process?.env.BASE_DOMAIN || "max-booster.com";

const router = Router();

// Resolve a managed label to its storefront slug (used by client-side /s/:label route)
router?.get("/resolve/:label", async (req, res) => {
  try {
    const label = req?.params.label?.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const fqdn = `${label}.${BASE_DOMAIN}`;
    const [row] = await db
      .select({ slug: storefronts.slug, isActive: storefronts.isActive })
      .from(storefrontDomains)
      .innerJoin(
        storefronts,
        eq(storefrontDomains?.storefrontId, storefronts?.id),
      )
      .where(
        and(
          eq(storefrontDomains?.domain, fqdn),
          eq(storefrontDomains?.type, "managed_subdomain"),
        ),
      )
      .limit(1);
    if (!row) return res?.status(404).json({ ok: false, error: "Not found." });
    return res?.json({ ok: true, slug: row.slug, label });
  } catch (err) {
    logger?.warn("[domains] resolve error:", err);
    return res?.status(500).json({ ok: false, error: "Internal error." });
  }
});

router?.post("/managed/check", checkManaged);
router?.post("/managed/reserve", reserveManaged);

/**
 * POST /api/storefront-domains/custom/request
 *
 * Attach a custom domain to a storefront and return DNS setup instructions.
 * Backed by the multi-method DoH verification service (replaces the old
 * system-resolver-based handler which always failed in Replit/cloud envs).
 */
router?.post("/custom/request", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId, domain: rawDomain } = req?.body as {
      storefrontId?: string;
      domain?: string;
    };
    if (!storefrontId)
      return res
        .status(400)
        .json({ ok: false, error: "storefrontId required." });

    const domResult = validateDomain(rawDomain || "");
    if (!domResult?.ok) return res?.status(400).json(domResult);

    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, storefrontId))
      .limit(1);
    if (!sf)
      return res
        .status(404)
        .json({ ok: false, error: "Storefront not found." });
    if (sf?.userId !== (req?.user as Record<string, unknown>).id)
      return res?.status(403).json({ ok: false, error: "Unauthorized." });

    const { attachDomainToStorefront } = await import(
      "../services/storefrontDnsService.js"
    );
    const result = await attachDomainToStorefront(
      storefrontId,
      (req?.user as Record<string, unknown>).id,
      domResult?.normalized,
    );

    // Return a response the UI understands (domain + verificationToken + rich instructions)
    return res?.status(201).json({
      ok: true,
      storefrontDomainId: result.storefrontDomainId,
      domain: result.domain,
      verificationToken: result.verificationToken,
      nameservers: result.nameservers,
      instructions: result.instructions,
      // Legacy-compat fields the old controller used to return
      platformIp: process.env.DNS_SERVER_IP || "34.111.179.208",
    });
  } catch (err) {
    logger?.warn({ err }, "[storefrontDomains] custom/request error");
    const msg: string = err?.message || "";
    const status =
      msg?.includes("already active") ||
      msg?.includes("already being set up") ||
      msg?.includes("DNS zone is already owned")
        ? 409
        : 500;
    return res
      .status(status)
      .json({ ok: false, error: msg || "Internal error." });
  }
});

/**
 * POST /api/storefront-domains/custom/verify
 *
 * Trigger an on-demand verification check for a pending custom domain.
 * Accepts { domain } (old format) or { domainId } (new format).
 * Uses Cloudflare/Google DoH — works in all environments.
 */
router?.post("/custom/verify", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const { domain, domainId } = req?.body as {
      domain?: string;
      domainId?: string;
    };

    let resolvedId: string | null = null;

    if (domainId) {
      // Ownership check when caller supplies a raw domainId
      const [row] = await db
        .select({
          id: storefrontDomains.id,
          storefrontId: storefrontDomains.storefrontId,
        })
        .from(storefrontDomains)
        .where(eq(storefrontDomains?.id, domainId))
        .limit(1);
      if (!row)
        return res
          .status(404)
          .json({ ok: false, verified: false, error: "Domain not found." });

      const [sf] = await db
        .select({ userId: storefronts.userId })
        .from(storefronts)
        .where(eq(storefronts?.id, row?.storefrontId))
        .limit(1);
      if (sf?.userId !== (req?.user as Record<string, unknown>).id)
        return res?.status(403).json({ ok: false, error: "Unauthorized." });

      resolvedId = row?.id;
    } else if (domain) {
      const normalized = domain?.trim().toLowerCase();
      const [row] = await db
        .select({
          id: storefrontDomains.id,
          storefrontId: storefrontDomains.storefrontId,
        })
        .from(storefrontDomains)
        .where(eq(storefrontDomains?.domain, normalized))
        .limit(1);
      if (!row)
        return res
          .status(404)
          .json({ ok: false, verified: false, error: "Domain not found." });

      // Ownership check
      const [sf] = await db
        .select({ userId: storefronts.userId })
        .from(storefronts)
        .where(eq(storefronts?.id, row?.storefrontId))
        .limit(1);
      if (sf?.userId !== (req?.user as Record<string, unknown>).id)
        return res?.status(403).json({ ok: false, error: "Unauthorized." });

      resolvedId = row?.id;
    }

    if (!resolvedId)
      return res
        .status(400)
        .json({ ok: false, error: "domain or domainId required." });

    const { verifyStorefrontDomain } = await import(
      "../services/storefrontDnsService.js"
    );
    const result = await verifyStorefrontDomain(resolvedId);

    return res?.json({
      ok: true,
      verified: result === "verified",
      status: result,
    });
  } catch (err) {
    logger?.warn({ err }, "[storefrontDomains] custom/verify error");
    return res
      .status(500)
      .json({
        ok: false,
        verified: false,
        error: err.message || "Internal error.",
      });
  }
});

router?.get("/storefront/:storefrontId", listDomains);
router?.delete("/:domainId", deleteDomain);

router?.post("/storefront/:storefrontId/publish", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });
    await publishStorefront(
      req?.params.storefrontId,
      (req?.user as Record<string, unknown>).id,
    );
    return res?.json({ ok: true, status: "live" });
  } catch (err) {
    logger?.warn("[storefrontDomains] publish error:", err);
    const status =
      err?.message === "Unauthorized."
        ? 403
        : err?.message === "Storefront not found."
          ? 404
          : 500;
    return res
      .status(status)
      .json({ ok: false, error: err.message || "Internal error." });
  }
});

router?.post("/storefront/:storefrontId/unpublish", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });
    await unpublishStorefront(
      req?.params.storefrontId,
      (req?.user as Record<string, unknown>).id,
    );
    return res?.json({ ok: true, status: "draft" });
  } catch (err) {
    logger?.warn("[storefrontDomains] unpublish error:", err);
    const status =
      err?.message === "Unauthorized."
        ? 403
        : err?.message === "Storefront not found."
          ? 404
          : 500;
    return res
      .status(status)
      .json({ ok: false, error: err.message || "Internal error." });
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
      return res
        .status(400)
        .json({ ok: false, available: false, error: v.error });
    }
    const domain = v.domain!;

    // Run DB lookup and external DNS check in parallel for speed
    const [dbResult, externallyRegistered] = await Promise.all([
      db
        .select({ id: storefrontDomains.id })
        .from(storefrontDomains)
        .where(eq(storefrontDomains.domain, domain))
        .limit(1),
      isDomainRegisteredExternally(domain),
    ]);

    if (dbResult.length > 0) {
      return res.json({
        ok: true,
        available: false,
        domain,
        reason: "claimed",
      });
    }
    if (externallyRegistered) {
      return res.json({
        ok: true,
        available: false,
        domain,
        reason: "registered_externally",
      });
    }
    return res.json({ ok: true, available: true, domain });
  } catch (err) {
    logger.warn("[domains] platform check error:", err);
    return res
      .status(500)
      .json({ ok: false, available: false, error: "Internal error." });
  }
});

// Public registry lookup — lets any external party verify if a domain is claimed on Max Booster.
// GET /api/storefront-domains/registry/:domain
router.get("/registry/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase().trim();
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
      managedBy: `Max Booster DNS (${BASE_DOMAIN})`,
    });
  } catch (err) {
    logger.warn("[domains] registry lookup error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
});

// Claim a free full domain — provisioned immediately, managed by Max Booster DNS
// Subscription required; limit: 2 custom domains per user (shared with Bring Your Own Domain slots)
router.post("/platform/claim", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    const userId = (req.user as Record<string, unknown>).id;

    const { sld, tld, storefrontId } = req.body;
    if (!storefrontId) {
      return res
        .status(400)
        .json({ ok: false, error: "storefrontId is required." });
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
    if (!sf || sf.userId !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: "Storefront not found or access denied." });
    }

    // Subscription required
    const hasSubscription = await userHasActiveSubscription(userId);
    if (!hasSubscription) {
      return res.status(403).json({
        ok: false,
        error:
          "An active Max Booster subscription is required to claim free custom domains.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    // Check domain isn't taken
    const [existing] = await db
      .select({
        id: storefrontDomains.id,
        storefrontId: storefrontDomains.storefrontId,
      })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.domain, domain))
      .limit(1);
    if (existing) {
      if (existing?.storefrontId === storefrontId) {
        // Heal any prior claim that never wrote the routing projection so the
        // already-owned domain actually resolves via the multi-tenant router.
        await db
          .insert(storefrontHosts)
          .values({ host: domain, storefrontId, certStatus: "pending" })
          .onConflictDoUpdate({
            target: storefrontHosts.host,
            set: { storefrontId, updatedAt: new Date() },
          });
        return res?.json({
          ok: true,
          domain,
          url: `https://${domain}`,
          alreadyOwned: true,
        });
      }
      return res
        .status(409)
        .json({
          ok: false,
          error: "This domain is already registered on another storefront.",
        });
    }

    // Enforce 2-domain limit — count BEFORE removing the old one for this storefront
    // so a swap within the same slot doesn't consume an extra slot.
    const usage = await getUserDomainUsage(userId);
    const claimedForThisStorefront = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(
        and(
          eq(storefrontDomains.storefrontId, storefrontId),
          eq(storefrontDomains.type, "platform_subdomain"),
        ),
      )
      .limit(1);
    // If this storefront already has a platform domain, the swap won't increase total
    const wouldIncrease = claimedForThisStorefront?.length === 0;
    if (wouldIncrease && usage?.total >= DOMAIN_LIMIT) {
      return res?.status(403).json({
        ok: false,
        error: `Domain limit reached. Your subscription includes up to ${DOMAIN_LIMIT} custom domains. Remove an existing domain to add a new one.`,
        code: "DOMAIN_LIMIT_REACHED",
        limit: DOMAIN_LIMIT,
        used: usage.total,
      });
    }

    // Swap is allowed within the same slot. Do the domain row + routing projection
    // (storefront_hosts) mutations atomically so the two tables can never diverge —
    // a divergence (domain written, host missing) is exactly the bug this fixes.
    await db?.transaction(async (tx) => {
      // Fetch the old domain(s) first so we can drop their stale routing rows.
      const oldPlatform = await tx
        .select({ domain: storefrontDomains.domain })
        .from(storefrontDomains)
        .where(
          and(
            eq(storefrontDomains?.storefrontId, storefrontId),
            eq(storefrontDomains?.type, "platform_subdomain"),
          ),
        );
      await tx
        .delete(storefrontDomains)
        .where(
          and(
            eq(storefrontDomains?.storefrontId, storefrontId),
            eq(storefrontDomains?.type, "platform_subdomain"),
          ),
        );
      for (const old of oldPlatform) {
        if (old?.domain && old?.domain !== domain) {
          await tx
            .delete(storefrontHosts)
            .where(eq(storefrontHosts?.host, old?.domain));
        }
      }

      // Register — immediately active (provisioned via Max Booster's managed DNS)
      await tx.insert(storefrontDomains).values({
        storefrontId,
        domain,
        type: "platform_subdomain",
        status: "active",
        isPrimary: true,
      });

      // Write the routing projection so the multi-tenant router + lookupStorefrontByHost
      // can actually resolve this host. Without this the domain shows "live" but 404s.
      await tx
        .insert(storefrontHosts)
        .values({ host: domain, storefrontId, certStatus: "pending" })
        .onConflictDoUpdate({
          target: storefrontHosts.host,
          set: { storefrontId, updatedAt: new Date() },
        });
    });

    logger.info(
      `[domains] Free domain claimed: ${domain} → storefront ${storefrontId}`,
    );
    return res.json({ ok: true, domain, url: `https://${domain}` });
  } catch (err) {
    logger.warn("[domains] platform claim error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Internal error." });
  }
});

// Get current platform subdomain for a storefront
router.get("/platform/:storefrontId", async (req, res) => {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    const [row] = await db
      .select({
        domain: storefrontDomains.domain,
        status: storefrontDomains.status,
      })
      .from(storefrontDomains)
      .where(
        and(
          eq(storefrontDomains.storefrontId, req.params.storefrontId),
          eq(storefrontDomains.type, "platform_subdomain"),
        ),
      )
      .limit(1);
    return res.json({
      ok: true,
      domain: row.domain ?? null,
      status: row.status ?? null,
    });
  } catch (err) {
    logger.warn("[domains] platform get error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
});

// ── Domain availability search ────────────────────────────────────────────────
// GET /api/storefront-domains/search?name=mybeats
// Returns availability of the platform subdomain + popular external TLDs.
// Designed for first-time domain holders discovering what's available.
router?.get("/search", async (req, res) => {
  try {
    const raw = ((req?.query.name as string) || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "");
    if (!raw || raw?.length < 2 || raw?.length > 63) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "name must be 2–63 alphanumeric characters.",
        });
    }

    const timeout = <T>(ms: number, p: Promise<T>): Promise<T> =>
      Promise?.race([
        p,
        new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), ms)),
      ]);

    async function externalAvailable(domain: string): Promise<boolean> {
      for (const type of ["NS", "A"] as const) {
        try {
          const records = await timeout(2500, dnsResolve(domain, type));
          if (records && records?.length > 0) return false;
        } catch {
          /* ENOTFOUND = not registered */
        }
      }
      return true;
    }

    const platformFqdn = `${raw}.${BASE_DOMAIN}`;

    // Check platform subdomain availability in DB
    const [dbRow] = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.domain, platformFqdn))
      .limit(1);

    const platformAvailable = !dbRow;

    // Check external TLDs in parallel (popular music/creator domain extensions)
    const externalTlds = [
      ".com",
      ".net",
      ".io",
      ".music",
      ".band",
      ".studio",
      ".co",
      ".org",
    ];
    const externalChecks = await Promise?.allSettled(
      externalTlds?.map(async (tld) => {
        const domain = `${raw}${tld}`;
        const available = await externalAvailable(domain);
        return { domain, tld, available };
      }),
    );

    const results = [
      {
        domain: platformFqdn,
        type: "platform",
        tld: `.${BASE_DOMAIN}`,
        available: platformAvailable,
        isFree: true,
        label: "Free — Instant, no setup required",
        registrar: null,
      },
      ...externalChecks
        .filter(
          (
            r,
          ): r is PromiseFulfilledResult<{
            domain: string;
            tld: string;
            available: boolean;
          }> => r?.status === "fulfilled",
        )
        .map((r) => ({
          domain: r.value.domain,
          type: "external",
          tld: r.value.tld,
          available: r.value.available,
          isFree: false,
          label: r.value.available
            ? "Available — purchase from a registrar"
            : "Already registered",
          registrar: r.value.available
            ? `https://www.namecheap.com/domains/registration/results/?domain=${r.value.domain}`
            : null,
        })),
    ];

    return res?.json({ ok: true, name: raw, results });
  } catch (err) {
    logger?.warn({ err }, "[domains] search error");
    return res?.status(500).json({ ok: false, error: "Search unavailable." });
  }
});

// ── DNS propagation check ─────────────────────────────────────────────────────
/**
 * GET /api/storefront-domains/propagation?domain=mybeats.com&type=A&expected=34?.x.x?.x
 *
 * Returns real-time propagation status from 4 global DoH resolvers.
 * Same concept as Vercel's domain propagation checker.
 */
router?.get("/propagation", async (req, res) => {
  try {
    const domain = ((req?.query.domain as string) || "").toLowerCase().trim();
    const type = ((req?.query.type as string) || "A").toUpperCase();
    const expected = req?.query.expected as string | undefined;

    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid or missing domain." });
    }

    const { checkPropagation } = await import(
      "../services/dnsPropagationCheck.js"
    );
    const result = await checkPropagation(domain, type, expected);
    return res?.json({ ok: true, ...result });
  } catch (err) {
    logger?.warn({ err }, "[domains] propagation check error");
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Propagation check failed." });
  }
});

/**
 * GET /api/storefront-domains/propagation/setup?domain=mybeats.com&storefrontId=xxx
 *
 * Checks all DNS record types needed for full domain setup (NS, A, www CNAME).
 * Returns a composite propagation report the UI can use to show a progress bar.
 */
router?.get("/propagation/setup", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const domain = ((req?.query.domain as string) || "").toLowerCase().trim();
    const storefrontId = req?.query.storefrontId as string;

    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid or missing domain." });
    }
    if (!storefrontId) {
      return res
        .status(400)
        .json({ ok: false, error: "storefrontId required." });
    }

    const platformIp = process?.env.DNS_SERVER_IP || "34.111.179.208";
    const ns1 = `ns1.${BASE_DOMAIN}`;
    const ns2 = `ns2.${BASE_DOMAIN}`;

    const { checkDomainSetupPropagation } = await import(
      "../services/dnsPropagationCheck.js"
    );
    const result = await checkDomainSetupPropagation(
      domain,
      platformIp,
      ns1,
      ns2,
      storefrontId,
      BASE_DOMAIN,
    );
    return res?.json({ ok: true, domain, ...result });
  } catch (err) {
    logger?.warn({ err }, "[domains] propagation setup check error");
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Propagation check failed." });
  }
});

/**
 * GET /api/storefront-domains/domain-status/:domainId
 *
 * Returns rich domain status including health, cert status, and setup instructions.
 */
router?.get("/domain-status/:domainId", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const domainId = req?.params.domainId;

    // Ownership check — ensure the domain belongs to a storefront owned by the caller
    const [domainRow] = await db
      .select({ storefrontId: storefrontDomains.storefrontId })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.id, domainId))
      .limit(1);
    if (!domainRow)
      return res?.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, domainRow?.storefrontId))
      .limit(1);
    if (sf?.userId !== (req?.user as Record<string, unknown>).id)
      return res?.status(403).json({ ok: false, error: "Unauthorized." });

    const { getDomainStatus } = await import(
      "../services/storefrontDnsService.js"
    );
    const status = await getDomainStatus(domainId);
    return res?.json({ ok: true, ...status });
  } catch (err) {
    logger?.warn({ err }, "[domains] domain-status error");
    const code = err?.message === "Domain not found" ? 404 : 500;
    return res
      .status(code)
      .json({ ok: false, error: err.message || "Internal error." });
  }
});

// DNS server status & configuration info — authenticated users only (internal config)
router?.get("/dns/status", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });
    const { getDNSInfo, isDNSRunning } = await import(
      "../services/dnsServer.js"
    );
    return res?.json({ ok: true, ...getDNSInfo(), running: isDNSRunning() });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, error: "DNS service unavailable." });
  }
});

// ── Marketplace DNS provider endpoints ───────────────────────────────────────

/**
 * POST /api/storefront-domains/storefront/:storefrontId/attach-domain
 *
 * Attach a custom domain to a storefront.  Creates a DNS zone, adds default
 * records (NS, TXT verification, A, www CNAME), and returns nameserver info
 * so the artist can point their registrar.
 */
router?.post("/storefront/:storefrontId/attach-domain", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId } = req?.params;
    const { domain: rawDomain } = req?.body;

    if (!rawDomain || typeof rawDomain !== "string") {
      return res?.status(400).json({ ok: false, error: "domain is required." });
    }

    const domResult = validateDomain(rawDomain);
    if (!domResult?.ok) return res?.status(400).json(domResult);
    const domain = domResult?.normalized;

    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, storefrontId))
      .limit(1);

    if (!sf || sf?.userId !== (req?.user as Record<string, unknown>).id) {
      return res
        .status(403)
        .json({ ok: false, error: "Storefront not found or access denied." });
    }

    const { attachDomainToStorefront } = await import(
      "../services/storefrontDnsService.js"
    );
    const result = await attachDomainToStorefront(
      storefrontId,
      (req?.user as Record<string, unknown>).id,
      domain,
    );

    logger?.info(
      { storefrontId, domain },
      "[storefrontDomains] domain attached via DNS provider",
    );
    return res?.status(201).json({ ok: true, ...result });
  } catch (err) {
    logger?.warn({ err }, "[storefrontDomains] attach-domain error");
    const msg: string = err?.message || "";
    const status =
      msg?.includes("already active") ||
      msg?.includes("already being set up") ||
      msg?.includes("DNS zone is already owned")
        ? 409
        : 500;
    return res
      .status(status)
      .json({ ok: false, error: msg || "Internal error." });
  }
});

/**
 * POST /api/storefront-domains/custom/verify-status/:domainId
 *
 * Trigger an on-demand verification check for one pending domain.
 * The background worker also runs this automatically every 60 s.
 */
router?.post("/custom/verify-status/:domainId", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const { domainId } = req?.params;

    // Ownership check — ensure the domain belongs to a storefront owned by the caller
    const [domainRow] = await db
      .select({ storefrontId: storefrontDomains.storefrontId })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.id, domainId))
      .limit(1);
    if (!domainRow)
      return res?.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, domainRow?.storefrontId))
      .limit(1);
    if (sf?.userId !== (req?.user as Record<string, unknown>).id)
      return res?.status(403).json({ ok: false, error: "Unauthorized." });

    const { verifyStorefrontDomain } = await import(
      "../services/storefrontDnsService.js"
    );
    const result = await verifyStorefrontDomain(domainId);
    return res?.json({ ok: true, result });
  } catch (err) {
    logger?.warn({ err }, "[storefrontDomains] verify-status error");
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Internal error." });
  }
});

/**
 * DELETE /api/storefront-domains/custom/detach/:domainId
 *
 * Remove a custom domain from a storefront, deleting its DNS zone and
 * host routing entry.
 */
router?.delete("/custom/detach/:domainId", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });

    const { domainId } = req?.params;

    // Verify the domain belongs to a storefront owned by the requesting user
    const [domainRow] = await db
      .select({ storefrontId: storefrontDomains.storefrontId })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.id, domainId))
      .limit(1);
    if (!domainRow)
      return res?.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, domainRow?.storefrontId))
      .limit(1);
    if (!sf || sf?.userId !== (req?.user as Record<string, unknown>).id) {
      return res?.status(403).json({ ok: false, error: "Access denied." });
    }

    const { detachDomainFromStorefront } = await import(
      "../services/storefrontDnsService.js"
    );
    await detachDomainFromStorefront(domainId);
    return res?.json({ ok: true });
  } catch (err) {
    logger?.warn({ err }, "[storefrontDomains] detach error");
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Internal error." });
  }
});

/**
 * GET /api/storefront-domains/hosts/:host
 *
 * Internal host-based routing lookup.  Returns the storefront ID for the
 * given hostname.  Requires authentication to prevent enumeration of
 * configured custom domains.
 */
router?.get("/hosts/:host", async (req, res) => {
  try {
    if (!req?.isAuthenticated())
      return res?.status(401).json({ ok: false, error: "Unauthorized." });
    const { lookupStorefrontByHost } = await import(
      "../services/storefrontDnsService.js"
    );
    const storefrontId = await lookupStorefrontByHost(req?.params.host);
    if (!storefrontId)
      return res?.status(404).json({ ok: false, error: "host_not_found" });
    return res?.json({ ok: true, storefrontId });
  } catch (err) {
    logger?.warn({ err }, "[storefrontDomains] host lookup error");
    return res?.status(500).json({ ok: false, error: "Internal error." });
  }
});

export default router;
