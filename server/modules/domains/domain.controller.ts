import crypto from "node:crypto";
import dns from "node:dns/promises";
import { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../../db.js";
import { storefrontDomains, storefronts } from "@shared/schema";
import { validateDnsLabel, validateDomain } from "./dnsValidators.js";
import { logger } from "../../logger.js";

const BASE_DOMAIN = process.env.BASE_DOMAIN || "maxboostermusic.com";

// ─── Managed subdomains ────────────────────────────────────────────────────

export async function checkManaged(req: Request, res: Response) {
  try {
    const { desiredLabel } = req.body as { desiredLabel?: string };
    const result = validateDnsLabel(desiredLabel || "");
    if (!result.ok) return res.status(400).json(result);

    const fqdn = `${result.normalized}.${BASE_DOMAIN}`;
    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, fqdn))
      .limit(1);

    return res.json({ ok: true, available: existing.length === 0, domain: fqdn });
  } catch (err: any) {
    logger.error({ err }, "[domains] checkManaged error");
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

export async function reserveManaged(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId, desiredLabel } = req.body as { storefrontId?: string; desiredLabel?: string };
    if (!storefrontId) return res.status(400).json({ ok: false, error: "storefrontId required." });

    const labelResult = validateDnsLabel(desiredLabel || "");
    if (!labelResult.ok) return res.status(400).json(labelResult);

    const fqdn = `${labelResult.normalized}.${BASE_DOMAIN}`;

    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, storefrontId))
      .limit(1);

    if (!sf) return res.status(404).json({ ok: false, error: "Storefront not found." });
    if (sf.userId !== (req.user as any).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, fqdn))
      .limit(1);

    if (existing.length > 0)
      return res.status(409).json({ ok: false, error: "Domain already taken." });

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

    logger.info(`[domains] Managed subdomain reserved: ${fqdn} → storefront ${storefrontId}`);
    return res.status(201).json({ ok: true, domain: record.domain, id: record.id });
  } catch (err) {
    logger.error("[domains] reserveManaged error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

// ─── Custom domains ────────────────────────────────────────────────────────

export async function requestCustomDomain(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId, domain: rawDomain } = req.body as { storefrontId?: string; domain?: string };
    if (!storefrontId) return res.status(400).json({ ok: false, error: "storefrontId required." });

    const domResult = validateDomain(rawDomain || "");
    if (!domResult.ok) return res.status(400).json(domResult);

    const [sf] = await db
      .select({ id: storefronts.id, userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, storefrontId))
      .limit(1);

    if (!sf) return res.status(404).json({ ok: false, error: "Storefront not found." });
    if (sf.userId !== (req.user as any).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const domain = domResult.normalized;
    const token = `mb-${crypto.randomUUID()}`;

    const existing = await db
      .select({ id: storefrontDomains.id })
      .from(storefrontDomains)
      .where(eq(storefrontDomains.domain, domain))
      .limit(1);

    if (existing.length > 0)
      return res.status(409).json({ ok: false, error: "Domain already registered." });

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
      instructions: {
        txt: {
          name: `_maxbooster.${domain}`,
          value: token,
        },
        cname: {
          name: `www.${domain}`,
          value: `${storefrontId}.${BASE_DOMAIN}`,
        },
      },
    });
  } catch (err) {
    logger.error("[domains] requestCustomDomain error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

export async function verifyCustomDomain(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { domain } = req.body as { domain?: string };
    if (!domain) return res.status(400).json({ ok: false, error: "domain required." });

    const [record] = await db
      .select()
      .from(storefrontDomains)
      .where(and(eq(storefrontDomains.domain, domain.toLowerCase()), eq(storefrontDomains.type, "custom_domain")))
      .limit(1);

    if (!record) return res.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, record.storefrontId))
      .limit(1);

    if (sf?.userId !== (req.user as any).id)
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

    logger.info(`[domains] Custom domain verified and activated: ${domain}`);
    return res.json({ ok: true, verified: true, domain });
  } catch (err) {
    logger.error("[domains] verifyCustomDomain error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

// ─── Domain list for a storefront ─────────────────────────────────────────

export async function listDomains(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { storefrontId } = req.params;
    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, storefrontId))
      .limit(1);

    if (!sf) return res.status(404).json({ ok: false, error: "Storefront not found." });
    if (sf.userId !== (req.user as any).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    const domains = await db
      .select()
      .from(storefrontDomains)
      .where(eq(storefrontDomains.storefrontId, storefrontId));

    return res.json({ ok: true, domains });
  } catch (err) {
    logger.error("[domains] listDomains error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}

export async function deleteDomain(req: Request, res: Response) {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { domainId } = req.params;
    const [record] = await db
      .select()
      .from(storefrontDomains)
      .where(eq(storefrontDomains.id, domainId))
      .limit(1);

    if (!record) return res.status(404).json({ ok: false, error: "Domain not found." });

    const [sf] = await db
      .select({ userId: storefronts.userId })
      .from(storefronts)
      .where(eq(storefronts.id, record.storefrontId))
      .limit(1);

    if (sf?.userId !== (req.user as any).id)
      return res.status(403).json({ ok: false, error: "Unauthorized." });

    await db.delete(storefrontDomains).where(eq(storefrontDomains.id, domainId));

    return res.json({ ok: true });
  } catch (err) {
    logger.error("[domains] deleteDomain error:", err);
    return res.status(500).json({ ok: false, error: "Internal error." });
  }
}
