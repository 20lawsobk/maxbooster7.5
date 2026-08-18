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
import { beatMoneyLoopCycles, beatMoneyLoopState } from "@shared/schema";
import { desc, gte } from "drizzle-orm";
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

// ── Loop Health Score ──────────────────────────────────────────────────────
//
// GET /api/admin/beat-money-loop/health-score
//
// Computes a single 0–100 "Loop Health Score" from four dimensions:
//   1. Success Rate        (40 pts) — successfulCycles / totalCycles
//   2. Revenue Momentum    (25 pts) — trailing-7-day revenue vs prior 7 days
//   3. Catalog Freshness   (20 pts) — cycles in last 7 days vs expected cadence
//   4. Payout Velocity     (15 pts) — plays→downloads conversion in recent cycles
//
// Each dimension returns a 0–1 signal which is multiplied by its max points.
// Returns score, per-dimension breakdown, dragging factors, and fix actions.

router.get("/health-score", async (_req, res) => {
  try {
    // Fetch loop state singleton
    const [state] = await db.select().from(beatMoneyLoopState).limit(1);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Recent cycles (last 14 days) for momentum calculations
    const recentCycles = await db
      .select()
      .from(beatMoneyLoopCycles)
      .where(gte(beatMoneyLoopCycles.startedAt, fourteenDaysAgo))
      .orderBy(desc(beatMoneyLoopCycles.startedAt))
      .limit(200);

    const last7 = recentCycles.filter(
      (c) => new Date(c.startedAt) >= sevenDaysAgo,
    );
    const prev7 = recentCycles.filter(
      (c) =>
        new Date(c.startedAt) >= fourteenDaysAgo &&
        new Date(c.startedAt) < sevenDaysAgo,
    );

    // ── Dimension 1: Success Rate (40 pts) ──
    const totalCycles = state?.totalCycles ?? 0;
    const successfulCycles = state?.successfulCycles ?? 0;
    const successRate =
      totalCycles > 0 ? successfulCycles / (totalCycles || 1) : 0;
    const successScore = Math.round(successRate * 40);

    // ── Dimension 2: Revenue Momentum (25 pts) ──
    const last7Revenue = last7.reduce((s, c) => s + (c.revenueCents ?? 0), 0);
    const prev7Revenue = prev7.reduce((s, c) => s + (c.revenueCents ?? 0), 0);
    let momentumSignal: number;
    if (prev7Revenue === 0 && last7Revenue === 0) {
      momentumSignal = 0;
    } else if (prev7Revenue === 0) {
      momentumSignal = 1;
    } else {
      // Cap at 2× growth = 100%
      momentumSignal = Math.min(last7Revenue / prev7Revenue, 2) / 2;
    }
    const momentumScore = Math.round(momentumSignal * 25);

    // ── Dimension 3: Catalog Freshness (20 pts) ──
    // Expected: at least 1 successful cycle every 6 hours (4/day = 28/week)
    const expectedCyclesPerWeek = 28;
    const last7Successful = last7.filter((c) => c.status === "completed").length;
    const freshnessSignal = Math.min(
      last7Successful / expectedCyclesPerWeek,
      1,
    );
    const freshnessScore = Math.round(freshnessSignal * 20);

    // ── Dimension 4: Payout Velocity (15 pts) ──
    // plays → downloads conversion across last 14 days
    const totalPlays = recentCycles.reduce((s, c) => s + (c.plays ?? 0), 0);
    const totalDownloads = recentCycles.reduce(
      (s, c) => s + (c.downloads ?? 0),
      0,
    );
    const conversionRate =
      totalPlays > 0
        ? Math.min(totalDownloads / (totalPlays || 1), 0.1) / 0.1
        : 0;
    const velocityScore = Math.round(conversionRate * 15);

    const totalScore = successScore + momentumScore + freshnessScore + velocityScore;

    // ── Dragging factors + fix actions ──
    const draggingFactors: Array<{ dimension: string; message: string; fix: string; fixAction: string }> = [];

    if (successScore < 24) {
      const failCount = (state?.consecutiveFailures ?? 0);
      draggingFactors.push({
        dimension: "Success Rate",
        message: `Only ${Math.round(successRate * 100)}% of cycles complete (${failCount} consecutive failures)`,
        fix: "Run a manual cycle to reset failures",
        fixAction: "run-now",
      });
    }
    if (momentumScore < 15) {
      draggingFactors.push({
        dimension: "Revenue Momentum",
        message:
          prev7Revenue > 0
            ? `Revenue down ${Math.round((1 - momentumSignal * 2) * 100)}% vs last week`
            : "No revenue generated in the last 14 days",
        fix: "Enable advertising on new cycles or lower beat prices",
        fixAction: "enable",
      });
    }
    if (freshnessScore < 12) {
      draggingFactors.push({
        dimension: "Catalog Freshness",
        message: `Only ${last7Successful} new beats added this week (target: ${expectedCyclesPerWeek})`,
        fix: "Enable the loop or shorten the run cadence",
        fixAction: "enable",
      });
    }
    if (velocityScore < 9) {
      draggingFactors.push({
        dimension: "Payout Velocity",
        message: `${Math.round(conversionRate * 10)}% plays→downloads conversion (target: 10%)`,
        fix: "Adjust pricing tiers — beats may be over-priced for current audience",
        fixAction: "run-now",
      });
    }

    const grade =
      totalScore >= 85
        ? "A"
        : totalScore >= 70
          ? "B"
          : totalScore >= 50
            ? "C"
            : totalScore >= 30
              ? "D"
              : "F";

    res.json({
      score: totalScore,
      grade,
      enabled: state?.enabled ?? false,
      dimensions: {
        successRate: {
          score: successScore,
          max: 40,
          signal: successRate,
          label: "Success Rate",
        },
        revenueMomentum: {
          score: momentumScore,
          max: 25,
          signal: momentumSignal,
          label: "Revenue Momentum",
        },
        catalogFreshness: {
          score: freshnessScore,
          max: 20,
          signal: freshnessSignal,
          label: "Catalog Freshness",
        },
        payoutVelocity: {
          score: velocityScore,
          max: 15,
          signal: conversionRate,
          label: "Payout Velocity",
        },
      },
      draggingFactors,
      snapshot: {
        totalCycles,
        successfulCycles,
        totalRevenueCents: state?.totalRevenueCents ?? 0,
        last7RevenueCents: last7Revenue,
        prev7RevenueCents: prev7Revenue,
        last7Successful,
        totalPlays,
        totalDownloads,
      },
    });
  } catch (err) {
    logger.warn({ err }, "[BeatMoneyLoop] /health-score failed");
    res.status(500).json({ error: "Failed to compute health score" });
  }
});
