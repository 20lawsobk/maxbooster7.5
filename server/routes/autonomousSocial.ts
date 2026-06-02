import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";

const router = Router();

interface AutonomousSocialState {
  isRunning: boolean;
  totalContentPublished: number;
  lastPublishedAt: string | null;
  config: {
    enabled: boolean;
    platforms: string[];
    contentFrequency: string;
    autoApprove: boolean;
  };
}

const autonomousStates: Map<string, AutonomousSocialState> = new Map();
// Companion access-time map — needed for LRU eviction without mutating the state shape.
const autonomousStateLastAccessed: Map<string, number> = new Map();
// At 90M users, even 1% using autonomous social = 900K entries × ~300B each ≈ 270MB.
// Evict entries inactive for >24h; hard-cap at 50K to prevent runaway growth on spikes.
const AUTONOMOUS_STATE_MAX = 50_000;
const AUTONOMOUS_STATE_TTL_MS = 24 * 60 * 60 * 1000;

setInterval(
  () => {
    const cutoff = Date.now() - AUTONOMOUS_STATE_TTL_MS;
    for (const [uid, ts] of autonomousStateLastAccessed) {
      if (ts < cutoff) {
        autonomousStates.delete(uid);
        autonomousStateLastAccessed.delete(uid);
      }
    }
    // Hard size cap: if still over limit, evict oldest entries first.
    if (autonomousStates.size > AUTONOMOUS_STATE_MAX) {
      const sorted = [...autonomousStateLastAccessed.entries()].sort(
        (a, b) => a[1] - b[1],
      );
      for (const [uid] of sorted) {
        autonomousStates.delete(uid);
        autonomousStateLastAccessed.delete(uid);
        if (autonomousStates.size <= AUTONOMOUS_STATE_MAX) break;
      }
    }
  },
  60 * 60 * 1000,
).unref(); // hourly

function getState(userId: string): AutonomousSocialState {
  if (!autonomousStates.has(userId)) {
    autonomousStates.set(userId, {
      isRunning: false,
      totalContentPublished: 0,
      lastPublishedAt: null,
      config: {
        enabled: false,
        platforms: ["twitter", "instagram", "facebook"],
        contentFrequency: "daily",
        autoApprove: false,
      },
    });
  }
  autonomousStateLastAccessed.set(userId, Date.now());
  return autonomousStates.get(userId)!;
}

router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);

    res.json(state);
  } catch (error) {
    logger.warn({ err: error }, "Failed to get autonomous social status:");
    res.status(500).json({ error: "Failed to get autonomous social status" });
  }
});

router.post("/start", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);

    state.isRunning = true;
    state.config.enabled = true;

    logger.info(`✅ Autonomous social mode started for user ${userId}`);

    res.json({
      success: true,
      message: "Autonomous social mode activated",
      ...state,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to start autonomous social:");
    res.status(500).json({ error: "Failed to start autonomous social mode" });
  }
});

router.post("/stop", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const state = getState(userId);

    state.isRunning = false;
    state.config.enabled = false;

    logger.info(`⏸️ Autonomous social mode stopped for user ${userId}`);

    res.json({
      success: true,
      message: "Autonomous social mode paused",
      ...state,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to stop autonomous social:");
    res.status(500).json({ error: "Failed to stop autonomous social mode" });
  }
});

export default router;
