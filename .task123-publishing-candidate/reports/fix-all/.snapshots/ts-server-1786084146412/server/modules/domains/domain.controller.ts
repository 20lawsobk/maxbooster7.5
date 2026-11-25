import crypto from "node:crypto";
import dns from "node:dns/promises";
import { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../../db.js";
import {
  storefrontDomains,
  storefronts,
  storefrontHosts,
} from "@shared/schema";
import { validateDnsLabel, validateDomain } from "./dnsValidators.js";
import { logger } from "../../logger.js";

const BASE_DOMAIN = process.env.BASE_DOMAIN || "max-booster.com";
const PLATFORM_IP = process.env.DNS_SERVER_IP || "34.111.179.208";

const SUBDOMAIN_MIN = 3;
const SUBDOMAIN_MAX = 30;

const RESERVED_SUBDOMAIN_LABELS = new Set([
  "ns",
  "ns1",
  "ns2",
  "ns3",
  "ns4",
  "ns5",
  "ns6",
  "dns",
  "mx",
  "mx1",
  "mx2",
  "www",
  "ftp",
  "smtp",
  "pop",
  "pop3",
  "imap",
  "mail",
  "email",
  "webmail",
  "admin",
  "administrator",
  "root",
  "system",
  "server",
  "cpanel",
  "host",
  "hostmaster",
  "postmaster",
  "abuse",
  "noc",
  "api",
  "app",
  "auth",
  "login",
  "signin",
  "signup",
  "register",
  "account",
  "dashboard",
  "portal",
  "panel",
  "control",
  "manage",
  "support",
  "help",
  "docs",
  "status",
  "health",
  "blog",
  "news",
  "press",
  "media",
  "assets",
  "cdn",
  "static",
  "dev",
  "staging",
  "test",
  "beta",
  "alpha",
  "demo",
  "sandbox",
  "localhost",
  "store",
  "shop",
  "market",
  "marketplace",
]);

function validateSubdomainLabel(
  raw: string,
): { ok: false; error: string } | { ok: true; normalized: string } {
  const result = validateDnsLabel(raw);
  if (!result?.ok) return result;

  const { normalized } = result;

  if (normalized?.length < SUBDOMAIN_MIN) {
    return {
      ok: false,
      error: `Label must be at least ${SUBDOMAIN_MIN} characters.`,
    };
  }
  if (normalized?.length > SUBDOMAIN_MAX) {
    return {
      ok: false,
      error: `Label cannot exceed ${SUBDOMAIN_MAX} characters.`,
    };
  }
  if (RESERVED_SUBDOMAIN_LABELS?.has(normalized)) {
    return {
      ok: false,
      error: `"${normalized}" is a reserved name and cannot be used.`,
    };
  }

  return { ok: true, normalized };
}

// ─── Managed subdomains ────────────────────────────────────────────────────

export async function checkManaged(req: Request, res: Response) {
  try {
    const { desiredLabel } = req.body as { desiredLabel?: string };
    const result = validateSubdomainLabel(desiredLabel || "");
    if (!result?.ok)
      return res.status(400).json({ ok: false, error: result.error });

    const fqdn = `${result?.normalized}.${BASE_DOMAIN}`;
    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.domain, fqdn))
      .limit(1);

    return res.json({
      ok: true,
      available: existing.length === 0,
      domain: fqdn,
    });
  } catch (err) {
    logger.warn({ err }, "[domains] checkManaged error");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

export async function reserveManaged(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId, desiredLabel } = req.body as {
      storefrontId?: string;
      desiredLabel?: string;
    };
    if (!storefrontId)
      return res
        .status(400)
        .json({ ok: false, error: "storefrontId required." });

    const labelResult = validateSubdomainLabel(desiredLabel || "");
    if (!labelResult?.ok)
      return res.status(400).json({ ok: false, error: labelResult.error });

    const fqdn = `${labelResult?.normalized}.${BASE_DOMAIN}`;

    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, storefrontId))
      .limit(1);

    if (!sf)
      return res
        .status(404)
        .json({ ok: false, error: "Storefront not found." });
    if (sf?.userId !== (req.user as unknown as Record<string, unknown>).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const label = labelResult?.normalized;

    // Check storefront_domains uniqueness on the full FQDN.
    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.domain, fqdn))
      .limit(1);

    if (existing?.length > 0)
      return res
        .status(409)
        .json({ ok: false, error: "Domain already taken." });

    // Also check storefronts?.subdomain uniqueness early — the column has a DB
    // unique constraint.  Without this check, the INSERT below can succeed but
    // the subsequent UPDATE throws a constraint violation (unlogged 500).
    const subdomainTaken = await db
      .select({ id: storefronts.id })
      .from(storefronts)
      .where(
        and(
          eq(storefronts?.subdomain, label),
          eq(storefronts?.isSubdomainActive, true),
        ),
      )
      .limit(1);

    if (subdomainTaken?.length > 0)
      return res
        .status(409)
        .json({ ok: false, error: "Subdomain label already in use." });

    const [record] = await db
      .insert(storefrontDomains)
      .values({
        storefrontId,
        domain: fqdn,
        type: "managed_subdomain",
        status: "active",
        isPrimary: true,
      })
      .returning();

    // Activate subdomain routing: update the storefront row so static?.ts can resolve it
    // by querying storefronts?.subdomain + isSubdomainActive (only set if not already taken).
    await db
      .update(storefronts)
      .set({ subdomain: label, isSubdomainActive: true, updatedAt: new Date() })
      .where(
        and(
          eq(storefronts?.id, storefrontId),
          eq(storefronts?.isSubdomainActive, false),
        ),
      );

    // Write storefront_hosts row so multiTenantRouter can resolve the full hostname too.
    await db
      .insert(storefrontHosts)
      .values({ host: fqdn, storefrontId, certStatus: "pending" })
      .onConflictDoUpdate({
        target: storefrontHosts.host,
        set: { storefrontId, updatedAt: new Date() },
      });

    // The canonical public URL for the store is the platform subdomain.
    // Requests to {label}.max-booster?.com reach the Express server via the
    // wildcard A/CNAME record and are routed by the Host-header middleware.
    const publicShortUrl = `https://${label}.${BASE_DOMAIN}`;

    logger.info(
      `[domains] Managed subdomain reserved: ${fqdn} → storefront ${storefrontId} (public: ${publicShortUrl})`,
    );
    return res
      .status(201)
      .json({
        ok: true,
        domain: record.domain,
        id: record.id,
        publicUrl: publicShortUrl,
        label,
      });
  } catch (err) {
    // Use pino's (object, message) signature so the full error is captured in logs.
    logger.warn({ err }, "[domains] reserveManaged error");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

// ─── Custom domains ────────────────────────────────────────────────────────

export async function requestCustomDomain(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId, domain: rawDomain } = req.body as {
      storefrontId?: string;
      domain?: string;
    };
    if (!storefrontId)
      return res
        .status(400)
        .json({ ok: false, error: "storefrontId required." });

    const domResult = validateDomain(rawDomain || "");
    if (!domResult.ok) return res.status(400).json(domResult);

    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, storefrontId))
      .limit(1);

    if (!sf)
      return res
        .status(404)
        .json({ ok: false, error: "Storefront not found." });
    if (sf.userId !== (req.user as unknown as Record<string, unknown>).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const domain = domResult.normalized;
    const token = `mb-${crypto.randomUUID()}`;

    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, domain))
      .limit(1);

    if (existing.length > 0)
      return res
        .status(409)
        .json({ ok: false, error: "Domain already registered." });

    const [record] = await db
      .insert(storefrontDomains)
      .values({
        storefrontId,
        domain,
        type: "custom_domain",
        status: "pending",
        verificationToken: token,
      })
      .returning();

    return res.status(201).json({
      ok: true,
      domain: record.domain,
      verificationToken: token,
      platformIp: PLATFORM_IP,
      instructions: {
        txt: {
          name: `_maxbooster.${domain}`,
          value: token,
        },
        cname: {
          name: `www.${domain}`,
          value: `${storefrontId}.${BASE_DOMAIN}`,
          note: "Use this if your registrar supports CNAME at the root or for the www subdomain",
        },
        a: {
          name: `@`,
          value: PLATFORM_IP,
          note: "Point your root domain A record to this IP address",
        },
      },
    });
  } catch (err) {
    logger.warn({ err: err }, "[domains] requestCustomDomain error:");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

export async function verifyCustomDomain(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { domain } = req.body as { domain?: string };
    if (!domain)
      return res.status(400).json({ ok: false, error: "domain required." });

    const [record] = await db
      .select()
      .from(storefrontDomains)
      .where(
        and(
          eq(storefrontDomains.domain, domain.toLowerCase()),
          eq(storefrontDomains.type, "custom_domain"),
        ),
      )
      .limit(1);

    if (!record)
      return res.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, record.storefrontId))
      .limit(1);

    if (sf.userId !== (req.user as unknown as Record<string, unknown>).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const txtName = `_maxbooster.${domain}`;
    let verified = false;

    try {
      const txtRecords = await dns.resolveTxt(txtName);
      const flat = txtRecords.flat().map((v) => v.toString());
      if (flat.includes(record.verificationToken!)) verified = true;
    } catch {
      // no TXT record found — verification failed
    }

    if (!verified) {
      await db
        .update(storefrontDomains)
        .set({ status: "verification_failed", updatedAt: new Date() })
        .where(eq(storefrontDomains.id, record.id));
      return res.json({ ok: true, verified: false });
    }

    await db
      .update(storefrontDomains)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(storefrontDomains.id, record.id));

    // Write storefront_hosts so edge routing + lookupStorefrontByHost pick this up
    await db
      .insert(storefrontHosts)
      .values({
        host: domain,
        storefrontId: record.storefrontId,
        certStatus: "pending",
      })
      .onConflictDoUpdate({
        target: storefrontHosts.host,
        set: { storefrontId: record.storefrontId, updatedAt: new Date() },
      });

    // Also add www variant for root domains
    if (!domain.startsWith("www.") && domain.split(".").length === 2) {
      await db
        .insert(storefrontHosts)
        .values({
          host: `www.${domain}`,
          storefrontId: record.storefrontId,
          certStatus: "pending",
        })
        .onConflictDoUpdate({
          target: storefrontHosts.host,
          set: { storefrontId: record.storefrontId, updatedAt: new Date() },
        });
    }

    // Update storefront's customDomain tracking fields
    await db
      .update(storefronts)
      .set({
        customDomain: domain,
        isCustomDomainActive: true,
        updatedAt: new Date(),
      })
      .where(eq(storefronts?.id, record?.storefrontId));

    logger.info(`[domains] Custom domain verified and activated: ${domain}`);
    return res.json({ ok: true, verified: true, domain });
  } catch (err) {
    logger.warn({ err: err }, "[domains] verifyCustomDomain error:");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

// ─── Domain list for a storefront ─────────────────────────────────────────

export async function listDomains(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId } = req.params;
    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, storefrontId))
      .limit(1);

    if (!sf)
      return res
        .status(404)
        .json({ ok: false, error: "Storefront not found." });
    if (sf?.userId !== (req.user as unknown as Record<string, unknown>).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const domains = await db
      .select()
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.storefrontId, storefrontId));

    return res.json({ ok: true, domains });
  } catch (err) {
    logger.warn({ err: err }, "[domains] listDomains error:");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

export async function deleteDomain(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated())
      return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { domainId } = req.params;
    const [record] = await db
      .select()
      .from(storefrontDomains)
      .where(eq(storefrontDomains?.id, domainId))
      .limit(1);

    if (!record)
      return res.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts?.id, record?.storefrontId))
      .limit(1);

    if (sf?.userId !== (req.user as unknown as Record<string, unknown>).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    await db
      .delete(storefrontDomains)
      .where(eq(storefrontDomains?.id, domainId));

    // Clean up storefront_hosts so edge routing stops serving this domain
    await db
      .delete(storefrontHosts)
      .where(eq(storefrontHosts?.host, record?.domain));
    if (
      !record?.domain.startsWith("www.") &&
      record?.domain.split(".").length === 2
    ) {
      await db
        .delete(storefrontHosts)
        .where(eq(storefrontHosts?.host, `www.${record?.domain}`));
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.warn({ err: err }, "[domains] deleteDomain error:");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}
