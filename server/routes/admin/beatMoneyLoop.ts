/**
 * Beat Money Loop — Admin Routes
 *
 * All endpoints require admin role (requireAdmin middleware).
 * The loop runs as user 31b06dba-b992-4da5-90ef-3dac95692716 (blawzmusic).
 */

import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import { beatMoneyLoopService } from "../../services/beatMoneyLoopService.js";
import { db } from "../../db.js";
import { beatMoneyLoopCycles } from "@shared/schema";
import { desc } from "drizzle-orm";
import { logger } from "../../logger.js";

const router = Router();

router.use(requireAdmin);

router.get("/status", async (_req, res) => {
  try {
    const status = await beatMoneyLoopService.getStatus();
    res.json(status);
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /status failed");
    res.status(500).json({ error: "Failed to load status" });
  }
});

router.post("/enable", async (_req, res) => {
  try {
    const status = await beatMoneyLoopService.enable();
    res.json({ ok: true, status });
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /enable failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/disable", async (_req, res) => {
  try {
    const status = await beatMoneyLoopService.disable();
    res.json({ ok: true, status });
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /disable failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/run-now", async (_req, res) => {
  // Fire-and-forget: a cycle can take 30–60 s; respond immediately with the cycle id.
  try {
    // We need the cycleId, so wait for the cycle row to be inserted (very fast)
    // but don't wait for the whole pipeline.
    const promise = beatMoneyLoopService.runCycle("manual");
    // Race: return promise resolution OR a short header read
    const result = await promise;
    res.json({ ok: true, result });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    logger.warn({ err }, "[BeatMoneyLoop] /run-now failed");
    res.status(500).json({ error: msg });
  }
});

router.get("/cycles", async (req, res) => {
  try {
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
    );
    const cycles = await db
      .select()
      .from(beatMoneyLoopCycles)
      .orderBy(desc(beatMoneyLoopCycles.startedAt))
      .limit(limit);
    res.json({ cycles });
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /cycles failed");
    res.status(500).json({ error: "Failed to load cycles" });
  }
});

export default router;
