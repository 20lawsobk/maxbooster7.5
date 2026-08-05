import { Router, type IRouter } from "express";
import { getAutoResolverStatus } from "../services/autoResolver.js";

const router: IRouter = Router();

/**
 * GET /api/auto-resolver/status
 *
 * Returns the current state of the production deployment auto-resolver:
 * consecutive failure count, last probe result, last redeploy attempt, etc.
 * Only meaningful when running in the dev workspace (it's a no-op in prod).
 */
router.get("/auto-resolver/status", (_req, res) => {
  res.json(getAutoResolverStatus());
});

export default router;
