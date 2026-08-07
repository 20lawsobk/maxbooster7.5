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
    const status = await beatMoneyLoopService?.getStatus();
    res.json(status);
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /status failed");
    res.status(500).json({ error: "Failed to load status" });
  }
});

router.post("/enable", async (_req, res) => {
  try {
    const status = await beatMoneyLoopService?.enable();
    res.json({ ok: true, status });
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /enable failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/disable", async (_req, res) => {
  try {
    const status = await beatMoneyLoopService?.disable();
    res.json({ ok: true, status });
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /disable failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/run-now", async (req, res) => {
  // 202 Accepted pattern: a cycle can take 10+ minutes (MaxCore audio jobs have
  // no server-side timeouts). Holding the HTTP connection open would get killed
  // by the proxy (~120 s). Kick off the cycle in the background and return
  // immediately; the client tracks progress via GET /status and /cycles.
  //
  // Optional body: { genre, mood, key } to override the random scan selection.
  const { genre, mood, key } = (req.body ?? {}) as {
    genre?: string;
    mood?: string;
    key?: string;
  };
  const overrides = (genre || mood || key) ? { genre, mood, key } : undefined;
  try {
    beatMoneyLoopService
      ?.runCycle("manual", overrides)
      .then((result) => {
        logger.info(
          `[BeatMoneyLoop] manual cycle finished: ${JSON.stringify(result)?.slice(0, 300)}`,
        );
      })
      .catch((err) => {
        logger.warn({ err }, "[BeatMoneyLoop] manual cycle failed");
      });
    res.status(202).json({
      ok: true,
      status: "started",
      message:
        "Cycle started in background. Poll GET /api/admin/beat-money-loop/status for progress.",
    });
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
