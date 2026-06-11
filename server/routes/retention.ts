/**
 * RETENTION API ROUTES
 *
 * Endpoints for NPS surveys, cancellation feedback, feature event tracking,
 * and customer health score retrieval. These form the backbone of the
 * data-driven retention system.
 */

import { Router } from "express";
import { db } from "../db.js";
import {
  npsResponses,
  cancellationFeedback,
  customerHealthScores,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { customerHealthScoreService } from "../services/customerHealthScoreService.js";
import { pushFeatureEvent } from "../services/featureEventBuffer.js";

const router = Router();

const npsSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
  triggerContext: z.string().max(100).optional(),
});

const cancellationSchema = z.object({
  reason: z.enum([
    "too_expensive",
    "missing_features",
    "switched_to_competitor",
    "not_using_enough",
    "technical_issues",
    "temporary_pause",
    "other",
  ]),
  elaboration: z.string().max(2000).optional(),
  competitorMentioned: z.string().max(200).optional(),
  wouldReturn: z.boolean().optional(),
  planAtCancellation: z.string().max(100).optional(),
});

const featureEventSchema = z.object({
  featureName: z.string().max(200),
  action: z
    .enum(["used", "discovered", "completed", "skipped"])
    .default("used"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.post("/nps", requireAuth, async (req: Record<string, unknown>, res) => {
  try {
    const parsed = npsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid NPS data", details: parsed.error.flatten() });
    }

    const { score, comment, triggerContext } = parsed.data;
    const userId = req.user!.id;

    await db.insert(npsResponses).values({
      userId,
      score,
      comment: comment ?? null,
      triggerContext: triggerContext ?? "30_day",
    });

    await customerHealthScoreService.computeAndStore(userId);

    const category =
      score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
    logger.info(
      `[Retention] NPS submitted: user=${userId} score=${score} category=${category}`,
    );

    return res.json({ success: true, category });
  } catch (err) {
    logger.warn({ err: err }, "[Retention] NPS submission failed:");
    return res.status(500).json({ error: "Failed to save NPS response" });
  }
});

router.post(
  "/cancellation-feedback",
  requireAuth,
  async (req: Record<string, unknown>, res) => {
    try {
      const parsed = cancellationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid feedback data",
          details: parsed.error.flatten(),
        });
      }

      const userId = req.user!.id;

      await db.insert(cancellationFeedback).values({
        userId,
        ...parsed.data,
      });

      logger.info(
        `[Retention] Cancellation feedback: user=${userId} reason=${parsed.data.reason}`,
      );
      return res.json({ success: true });
    } catch (err) {
      logger.warn({ err: err }, "[Retention] Cancellation feedback failed:");
      return res
        .status(500)
        .json({ error: "Failed to save cancellation feedback" });
    }
  },
);

router.post(
  "/feature-event",
  requireAuth,
  async (req: Record<string, unknown>, res) => {
    try {
      const parsed = featureEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid event data" });
      }

      const userId = req.user!.id;

      await pushFeatureEvent({
        userId,
        featureName: parsed.data.featureName,
        action: parsed.data.action,
        metadata: parsed.data.metadata ?? null,
      });

      return res.json({ success: true });
    } catch (err) {
      logger.warn({ err: err }, "[Retention] Feature event tracking failed:");
      return res.status(500).json({ error: "Failed to track feature event" });
    }
  },
);

router.get(
  "/health-score",
  requireAuth,
  async (req: Record<string, unknown>, res) => {
    try {
      const userId = req.user!.id;

      const [existing] = await db
        .select()
        .from(customerHealthScores)
        .where(eq(customerHealthScores.userId, userId))
        .limit(1);

      if (!existing) {
        const fresh = await customerHealthScoreService.computeAndStore(userId);
        return res.json(fresh);
      }

      const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (existing.computedAt! < staleCutoff) {
        const fresh = await customerHealthScoreService.computeAndStore(userId);
        return res.json(fresh);
      }

      return res.json(existing);
    } catch (err) {
      logger.warn({ err: err }, "[Retention] Health score retrieval failed:");
      return res.status(500).json({ error: "Failed to get health score" });
    }
  },
);

router.get(
  "/admin/at-risk",
  requireAuth,
  async (req: Record<string, unknown>, res) => {
    try {
      if (req.user?.role !== "admin")
        return res.status(403).json({ error: "Forbidden" });

      const atRisk = await db
        .select()
        .from(customerHealthScores)
        .where(eq(customerHealthScores.riskLevel, "at_risk"))
        .orderBy(desc(customerHealthScores.score))
        .limit(100);

      const churning = await db
        .select()
        .from(customerHealthScores)
        .where(eq(customerHealthScores.riskLevel, "churning"))
        .orderBy(desc(customerHealthScores.computedAt))
        .limit(100);

      return res.json({ atRisk, churning });
    } catch (err) {
      logger.warn({ err: err }, "[Retention] Admin at-risk query failed:");
      return res.status(500).json({ error: "Failed to get at-risk users" });
    }
  },
);

export default router;
