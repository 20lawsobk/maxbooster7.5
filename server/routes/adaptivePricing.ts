// @ts-nocheck
/**
 * Adaptive Pricing Routes
 *
 * Exposes the adaptive beat pricing engine to authenticated users.
 * Mounted at /api/adaptive-pricing
 */

import { Router } from "express";
import { db } from "../db.js";
import { beatPricingSnapshots } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { adaptivePricingEngine } from "../services/adaptivePricingEngine.js";

const router = Router();
router.use(requireAuth);

/**
 * POST /api/adaptive-pricing/run
 * Trigger an adaptive pricing cycle for the authenticated user's catalog.
 */
router.post("/run", async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await adaptivePricingEngine.runForUser(userId);
    res.json(result);
  } catch (err) {
    logger.warn({ err }, "[AdaptivePricing] POST /run failed");
    res.status(500).json({ error: "Failed to run adaptive pricing" });
  }
});

/**
 * GET /api/adaptive-pricing/history
 * Return recent pricing snapshots for the user's catalog.
 */
router.get("/history", async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(200, parseInt(String(req.query.limit ?? "50"), 10));

    const snapshots = await db
      .select()
      .from(beatPricingSnapshots)
      .where(eq(beatPricingSnapshots.userId, userId))
      .orderBy(desc(beatPricingSnapshots.appliedAt))
      .limit(limit);

    res.json(snapshots);
  } catch (err) {
    logger.warn({ err }, "[AdaptivePricing] GET /history failed");
    res.status(500).json({ error: "Failed to fetch pricing history" });
  }
});

export default router;
