import { Router } from "express";
import { eq, and } from "drizzle-orm";
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
