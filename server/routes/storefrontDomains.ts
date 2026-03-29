import { Router } from "express";
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

const router = Router();

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
    logger.error("[storefrontDomains] publish error:", err);
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
    logger.error("[storefrontDomains] unpublish error:", err);
    const status = err.message === "Unauthorized." ? 403 : err.message === "Storefront not found." ? 404 : 500;
    return res.status(status).json({ ok: false, error: err.message || "Internal error." });
  }
});

export default router;
