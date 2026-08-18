// @ts-nocheck
/**
 * MaxCore Sync Service
 *
 * Manages the active connection between Max Booster and the MaxCore / PDIM
 * triangle:
 *
 *   1. Boot-time health probe — logs PDIM + MaxCore reachability on startup.
 *   2. Periodic weight sync — pulls updated base model states from MaxCore
 *      every 6 h and stores them in modelWeightStorage so per-user models
 *      are seeded with the latest trained intelligence.
 *   3. Training feedback push — pushes anonymised engagement signals to both
 *      MaxCore (/train/feedback) and the PDIM queue (mbs:training:feedback)
 *      so MaxCore can consume them on its own schedule.
 */

import { logger } from "../logger.js";
import { modelWeightStorage } from "./modelWeightStorage.js";
import { getPdimClient, isPdimConfigured } from "../lib/pdimClient.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOrigin,
} from "./maxcoreConnector.js";
import {
  invalidateCalibrationCache,
  runCalibration,
} from "./maxcoreScoreCalibrator.js";

// ── Timeout-guarded fetch: adds a 10s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (
  url: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(10_000), ...init });

// Resolved through the shared connector (single MaxCore contract boundary).
const AI_SERVER_URL = getMaxcoreOrigin();
const AI_SERVER_KEY = getMaxcoreGenerationKey();
const PEER_NODE = process.env.PEER_TRAINING_NODE || "";
const MBS_KEY = process.env.MBS_AI_TRAINING_KEY || "";

// Sync every 10 minutes — aligned with the continuous training session cycle.
// Each training session takes ~10 real minutes and produces 10 simulated years
// of experience; pulling weights after each session keeps Max Booster models
// continuously up to date with the latest MaxCore-trained intelligence.
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const HEALTH_TIMEOUT = 6_000;
const INFER_TIMEOUT = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMaxCore<T = any>(
  endpoint: string,
  opts: {
    method?: string;
    body?: unknown;
    key?: string;
    timeout?: number;
  } = {},
): Promise<{ ok: boolean; data: T | null; status?: number }> {
  const url = opts?.key === "peer" ? PEER_NODE : AI_SERVER_URL;
  const key = opts?.key === "peer" ? MBS_KEY : AI_SERVER_KEY;
  if (!url || !key) return { ok: false, data: null };
  try {
    const init: RequestInit = {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(opts?.timeout ?? INFER_TIMEOUT),
    };
    if (opts?.body !== undefined) init.body = JSON.stringify(opts?.body);
    const r = await timedFetch(`${url}${endpoint}`, init);
    if (!r?.ok) return { ok: false, data: null, status: r.status };
    const text = await r?.text().catch(() => null);
    if (!text) return { ok: false, data: null, status: r.status };
    try {
      const data = JSON.parse(text) as T;
      return { ok: true, data, status: r.status };
    } catch {
      logger.debug(
        `[MaxCoreSync] ${endpoint} JSON parse failed — body: ${text?.slice(0, 120)}`,
      );
      return { ok: false, data: null, status: r.status };
    }
  } catch (networkErr) {
    logger.debug(
      `[MaxCoreSync] ${endpoint} network error: ${(networkErr as Error).message ?? String(networkErr)}`,
    );
    return { ok: false, data: null };
  }
}

async function pdimRpush(
  key: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!isPdimConfigured()) return false;
  try {
    const client = getPdimClient();
    await (client as unknown as Record<string, unknown>).rpush(
      key,
      JSON.stringify({ ...payload, ts: Date.now() }),
    );
    return true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err?.message : String(err) }, `[MaxCoreSync] PDIM rpush to ${key} failed:`,
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Boot-time health probe
// ─────────────────────────────────────────────────────────────────────────────

async function probeConnectivity(): Promise<void> {
  // PDIM
  if (isPdimConfigured()) {
    // Use native fetch to probe PDIM — NOT getPdimClient().ping().
    // The exec()-based ping queues a 4 s AbortSignal request on a cold PDIM
    // and generates "exec error [PING]" warnings.  Native fetch bypasses the
    // exec chain entirely and is the same approach used by waitForPdimReady().
    const pdimUrl = process.env.PDIM_HTTP_EXEC_URL || process.env.PDIM_EXEC_URL || "";
    const pdimToken = process.env.PDIM_BEARER_TOKEN || process.env.PDIM_EXEC_TOKEN || "";
    try {
      const res = await fetch(pdimUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pdimToken}` },
        body: JSON.stringify({ cmd: "PING", args: [] }),
        signal: AbortSignal.timeout(5_000),
        redirect: "manual",
      });
      if (res.ok) {
        logger.info("[MaxCoreSync] PDIM ✅ reachable — Redis-compatible layer active");
      } else {
        logger.info(`[MaxCoreSync] PDIM ⚠️ local server still initialising (HTTP ${res.status}) — will retry`);
      }
    } catch (err) {
      logger.info(
        `[MaxCoreSync] PDIM ⚠️ not yet reachable (${(err as Error).message}) — will retry`,
      );
    }
  } else {
    logger.warn(
      "[MaxCoreSync] PDIM not configured — PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN missing",
    );
  }

  // MaxCore inference node
  if (AI_SERVER_URL && AI_SERVER_KEY) {
    const { ok } = await fetchMaxCore("/api/health", {
      timeout: HEALTH_TIMEOUT,
    });
    if (ok) {
      logger.info(
        `[MaxCoreSync] MaxCore inference ✅ reachable — ${AI_SERVER_URL}`,
      );
    } else {
      logger.warn(
        `[MaxCoreSync] MaxCore inference ⚠️ unreachable — ${AI_SERVER_URL} (will retry on first inference request)`,
      );
    }
  } else {
    logger.warn(
      "[MaxCoreSync] MaxCore inference not configured — AI_SERVER_URL / AI_SERVER_KEY missing",
    );
  }

  // Training peer node
  if (PEER_NODE && MBS_KEY) {
    const peerUrl = PEER_NODE?.startsWith("pdim://") ? null : PEER_NODE;
    if (peerUrl) {
      const { ok } = await fetchMaxCore("/api/health", {
        key: "peer",
        timeout: HEALTH_TIMEOUT,
      });
      if (ok) {
        logger.info(`[MaxCoreSync] Training peer ✅ reachable — ${PEER_NODE}`);
      } else {
        logger.warn(
          `[MaxCoreSync] Training peer ⚠️ unreachable — ${PEER_NODE}`,
        );
      }
    } else {
      logger.info(
        `[MaxCoreSync] Training peer — PDIM-bus mode (pdim://…) — no HTTP health check needed`,
      );
    }
  } else {
    logger.warn(
      "[MaxCoreSync] Training peer not configured — PEER_TRAINING_NODE / MBS_AI_TRAINING_KEY missing",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Weight sync — pull trained base states from MaxCore
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_ENDPOINTS: Array<{ name: string; endpoint: string }> = [
  { name: "social_base", endpoint: "/api/models/social/state" },
  { name: "advertising_base", endpoint: "/api/models/advertising/state" },
  { name: "content_base", endpoint: "/api/models/content/state" },
  { name: "engagement_base", endpoint: "/api/models/engagement/state" },
];

async function syncWeightsFromMaxCore(): Promise<void> {
  if (!AI_SERVER_URL || !AI_SERVER_KEY) {
    logger.debug("[MaxCoreSync] Weight sync skipped — MaxCore not configured");
    return;
  }

  logger.info("[MaxCoreSync] Starting weight sync from MaxCore…");
  let updated = 0;
  let skipped = 0;

  for (const { name, endpoint } of MODEL_ENDPOINTS) {
    // MaxCore is a local in-process subsystem — no remote wake-up retries.
    // A single bounded attempt suffices; the next scheduled sync will pick up
    // anything missed while the child was restarting.
    const result = await fetchMaxCore<Record<string, unknown>>(endpoint, {
      timeout: 15_000,
    });

    const { ok, data } = result;
    if (!ok || !data) {
      skipped++;
      logger.debug(
        `[MaxCoreSync] ${name}: no state (status: ${result?.status ?? "no-response"}) — endpoint unavailable`,
      );
      continue;
    }

    try {
      await modelWeightStorage?.save(name, {
        ...(data as object),
        syncedFromMaxCore: true,
        syncedAt: new Date().toISOString(),
      });
      updated++;
      logger.info(
        `[MaxCoreSync] ${name} ✅ synced from MaxCore (${Object.keys(data).length} keys)`,
      );
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err?.message : String(err) }, `[MaxCoreSync] ${name} save failed:`,
      );
      skipped++;
    }
  }

  logger.info(
    `[MaxCoreSync] Weight sync complete — updated: ${updated}, skipped/unavailable: ${skipped}`,
  );

  // Close the training loop: if any model weights changed, invalidate the
  // 6-hour calibration TTL and immediately re-run calibration (non-blocking).
  // This ensures quality gate thresholds reflect the latest MaxCore training
  // within the same 10-minute cycle, not up to 6 hours later.
  // With the A/B system (30+ variants × 10 rounds × rotating objectives) the
  // gate will clear on round 1 as soon as calibrated thresholds are in effect.
  if (updated > 0) {
    invalidateCalibrationCache();
    runCalibration().catch(() => {});
    logger.info(
      `[MaxCoreSync] ${updated} model(s) updated — calibration cache invalidated, ` +
        `re-calibrating quality gate thresholds now (loop closes within this 10-min cycle)`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Training feedback push
// ─────────────────────────────────────────────────────────────────────────────

export interface TrainingFeedbackPayload {
  content: string; // The actual post text — required by MaxCore
  source: string;
  trigger: string;
  engagement_rate: number;
  platform: string;
  content_type: string;
  hook_type: string;
  media_type: string;
  curriculum_hint: string;
  dispatched_at: string;
}

/**
 * Push a training feedback signal to both MaxCore (HTTP) and PDIM (queue).
 * Called by autopilotLearningService when a post achieves high engagement.
 */
export async function pushTrainingFeedback(
  payload: TrainingFeedbackPayload,
): Promise<void> {
  const enriched = { ...payload, source_node: "maxbooster", version: "1.0" };

  // HTTP push to training peer (with auth)
  const peerIsPdim = PEER_NODE?.startsWith("pdim://");
  if (PEER_NODE && MBS_KEY && !peerIsPdim) {
    try {
      const r = await timedFetch(`${PEER_NODE}/api/train/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MBS_KEY}`,
        },
        body: JSON.stringify(enriched),
        signal: AbortSignal.timeout(5_000),
      });
      if (r?.ok) {
        logger.info(
          `[MaxCoreSync] Training feedback sent — ${payload?.platform} ` +
            `${payload?.content_type} at ${payload?.engagement_rate.toFixed(2)}% engagement`,
        );
      } else {
        logger.warn(
          `[MaxCoreSync] Training peer returned ${r?.status} — queuing to PDIM`,
        );
      }
    } catch {
      logger.warn("[MaxCoreSync] Training peer unreachable — queuing to PDIM");
    }
  }

  // PDIM queue push (durable, MaxCore picks up on its schedule)
  await pdimRpush("mbs:training:feedback", enriched);

  // Also notify inference server if different from training peer
  if (AI_SERVER_URL && AI_SERVER_KEY && AI_SERVER_URL !== PEER_NODE) {
    fetchMaxCore("/api/train/feedback", {
      method: "POST",
      body: enriched,
      timeout: 3_000,
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// On-demand sync (called by baseModelTrainer before synthetic seeding)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull model weights from MaxCore immediately (no timer — used at training
 * boot time so MaxCore weights are present before local fallback runs).
 * Returns the number of models successfully synced.
 */
export async function syncWeightsNow(): Promise<number> {
  if (!AI_SERVER_URL || !AI_SERVER_KEY) return 0;
  let updated = 0;
  for (const { name, endpoint } of MODEL_ENDPOINTS) {
    const result = await fetchMaxCore<Record<string, unknown>>(endpoint, {
      timeout: 20_000,
    });
    if (!result?.ok || !result?.data) continue;
    try {
      await modelWeightStorage?.save(name, {
        ...(result?.data as object),
        syncedFromMaxCore: true,
        syncedAt: new Date().toISOString(),
      });
      logger.info(`[MaxCoreSync] ${name} ✅ eagerly synced from MaxCore`);
      updated++;
    } catch {
      /* non-critical */
    }
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let _syncTimer: NodeJS.Timeout | null = null;
let _initialSyncTimer: NodeJS.Timeout | null = null;

export async function initMaxCoreSync(): Promise<void> {
  // 1. Health probe (non-blocking — don't hold up server startup)
  probeConnectivity().catch((err) =>
    logger.warn({ err: err instanceof Error ? err?.message : String(err) }, "[MaxCoreSync] Connectivity probe error:",
    ),
  );

  // 2. Initial weight sync after 15 s — MaxCore is a local in-process child
  //    that binds within seconds of boot; no remote wake-up window applies.
  _initialSyncTimer = setTimeout(() => {
    _initialSyncTimer = null;
    syncWeightsFromMaxCore().catch((err) =>
      logger.warn({ err: err instanceof Error ? err?.message : String(err) }, "[MaxCoreSync] Initial weight sync error:",
      ),
    );
  }, 15_000);
  // Background maintenance must never hold the process open during shutdown.
  _initialSyncTimer.unref();

  // 3. Periodic weight sync every 10 min (aligned with each training session)
  _syncTimer = setInterval(() => {
    syncWeightsFromMaxCore().catch((err) =>
      logger.warn({ err: err instanceof Error ? err?.message : String(err) }, "[MaxCoreSync] Periodic weight sync error:",
      ),
    );
  }, SYNC_INTERVAL_MS);
  _syncTimer.unref();

  logger.info(
    "[MaxCoreSync] Initialized — health probe running, weight sync scheduled every 10 min (aligned with 10-min training sessions)",
  );
}

export function stopMaxCoreSync(): void {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
  if (_initialSyncTimer) {
    clearTimeout(_initialSyncTimer);
    _initialSyncTimer = null;
  }
}
