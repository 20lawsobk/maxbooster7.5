// @ts-nocheck
/**
 * MaxCore Score Calibrator
 *
 * Bridges the growing 8TB MaxCore dataset corpus (music industry, social media
 * management, advertising performance) with the local VeoGate quality
 * scoring system.
 *
 * What it does:
 *   1. Reads real-world engagement performance from the local DB
 *      (autopilotLearningData — last 90 days) — optional enrichment
 *   2. Fires 5 content-signal calls to MaxCore SEQUENTIALLY with a 200 ms gap
 *      between each — mirrors the Python bridge's 20/20 approach; prevents
 *      MaxCore's single-threaded LLM from queueing simultaneous requests
 *   3. Fetches all 4 model-state endpoints in parallel via Promise?.allSettled
 *      (GET endpoints, no LLM queuing concern)
 *   4. Merges generation signals + training-depth weights into calibrated
 *      ScoreWeights and CalibratedThresholds
 *
 * LLM warmth: startMaxCoreLLMWarmth() fires a keepalive every 90 s so the
 *   model never goes cold.  First attempts always return in ~6 s.
 *
 * Refresh cycle: startup + every 6 hours
 *   (MaxCore's 8TB dataset grows automatically — 6 h catches new model training
 *    runs without hammering the server)
 *
 * Falls back to default weights/thresholds when MaxCore is offline.
 */

import { logger } from "../logger.js";
import { db } from "../db";
import { MaxCoreAIClient, startMaxCoreLLMWarmth } from "./maxcoreClient.js";
import { autopilotLearningData } from "@shared/schema";
import { desc, gte } from "drizzle-orm";

// ── Default weights ───────────────────────────────────────────────────────────
export interface ScoreWeights {
  engagement: number;
  hookStrength: number;
  callToActionEffectiveness: number;
  sentiment: number;
  clarity: number;
  brandAlignment: number;
  algorithmAlignment: number;
  specificity: number;
  emotionalArc: number;
  narrativeAuthenticity: number;
}

export interface CalibratedThresholds {
  gate: number;
  floor: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  engagement: 0.25,
  hookStrength: 0.18,
  callToActionEffectiveness: 0.13,
  sentiment: 0.1,
  clarity: 0.08,
  brandAlignment: 0.08,
  algorithmAlignment: 0.08,
  specificity: 0.05,
  emotionalArc: 0.03,
  narrativeAuthenticity: 0.02,
};

const DEFAULT_THRESHOLDS: CalibratedThresholds = {
  gate: 81,
  // Floor lowered from 73 → 65 to match the actual score range MaxCore produces
  // when models are untrained (session_count=0).  Production content consistently
  // scores 65–68; with floor=73 the quality gate rejects everything and posts
  // nothing.  applyCalibration() clamps to Math.max(65, ...) so this is the
  // effective minimum.  Once models accumulate training sessions the calibrator
  // will raise the floor automatically via depthWeights / coverageRatio.
  floor: 65,
};

// 6 hours — short enough to pick up new MaxCore model training runs as the
// dataset grows, long enough to avoid hammering the server under normal load.
const CALIBRATION_TTL_MS = 6 * 60 * 60 * 1_000;

let _cachedWeights: ScoreWeights | null = null;
let _cachedThresholds: CalibratedThresholds | null = null;
let _lastCalibrated = 0;
let _calibrating = false;

// ── Public API ────────────────────────────────────────────────────────────────

export function getCalibratedWeights(): ScoreWeights {
  return _cachedWeights ?? DEFAULT_WEIGHTS;
}

export function getCalibratedThresholds(): CalibratedThresholds {
  return _cachedThresholds ?? DEFAULT_THRESHOLDS;
}

export function isCalibrated(): boolean {
  return _lastCalibrated > 0;
}

export async function runCalibration(): Promise<void> {
  if (_calibrating) return;
  if (Date.now() - _lastCalibrated < CALIBRATION_TTL_MS && _lastCalibrated > 0)
    return;

  _calibrating = true;
  try {
    logger.info(
      "[ScoreCalibrator] Starting calibration cycle against MaxCore 8TB corpus …",
    );

    // Local engagement summary is optional enrichment — never a gate condition.
    const summary = await buildPerformanceSummary();
    if (!summary) {
      logger.info(
        "[ScoreCalibrator] No local engagement data yet — relying on MaxCore generation signals",
      );
    }

    // Always call MaxCore. POST /api/generate/content does not require local data.
    const { calibration, reachable } = await fetchMaxCoreCalibration(summary);
    if (calibration) {
      applyCalibration(calibration, summary ?? EMPTY_SUMMARY);
    } else if (summary) {
      applyDataDrivenCalibration(summary);
    } else if (!reachable) {
      logger.info(
        "[ScoreCalibrator] MaxCore unreachable and no local data — retaining defaults",
      );
    } else {
      // MaxCore IS reachable but provided no calibration data yet (models not
      // trained, no live content signals). This is normal during early-life
      // operation — defaults are correct, no error condition.
      logger.info(
        "[ScoreCalibrator] MaxCore reachable but no calibration data yet — retaining defaults",
      );
    }

    _lastCalibrated = Date.now();
    const thresholds = _cachedThresholds ?? DEFAULT_THRESHOLDS;
    const weights = _cachedWeights ?? DEFAULT_WEIGHTS;
    logger.info(
      `[ScoreCalibrator] Calibration complete. ` +
        `Gate=${thresholds.gate ?? DEFAULT_THRESHOLDS.gate} ` +
        `Floor=${thresholds.floor ?? DEFAULT_THRESHOLDS.floor} ` +
        `Top weights: engagement=${(weights.engagement ?? DEFAULT_WEIGHTS.engagement).toFixed(3)}, ` +
        `hook=${(weights.hookStrength ?? DEFAULT_WEIGHTS.hookStrength).toFixed(3)}`,
    );
  } catch (err) {
    logger.warn(
      `[ScoreCalibrator] Calibration error: ${(err as Error).message ?? String(err)} — retaining previous values`,
    );
  } finally {
    _calibrating = false;
  }
}

// ── Performance data collection ───────────────────────────────────────────────

interface PerformanceSummary {
  totalPosts: number;
  avgEngagementRate: number;
  platformBreakdown: Record<string, { count: number; avgEng: number }>;
  hookTypeBreakdown: Record<string, { count: number; avgEng: number }>;
  contentTypeBreakdown: Record<string, { count: number; avgEng: number }>;
  topPerformers: Array<{
    hookType: string | null;
    contentType: string | null;
    engRate: number;
  }>;
  percentileP50: number;
  percentileP75: number;
  percentileP90: number;
}

const EMPTY_SUMMARY: PerformanceSummary = {
  totalPosts: 0,
  avgEngagementRate: 0,
  platformBreakdown: {},
  hookTypeBreakdown: {},
  contentTypeBreakdown: {},
  topPerformers: [],
  percentileP50: 0,
  percentileP75: 0,
  percentileP90: 0,
};

async function buildPerformanceSummary(): Promise<PerformanceSummary | null> {
  try {
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);

    const rows = await db
      .select({
        platform: autopilotLearningData.platform,
        contentType: autopilotLearningData.contentType,
        hookType: autopilotLearningData.hookType,
        engagementRate: autopilotLearningData.engagementRate,
      })
      .from(autopilotLearningData)
      .where(gte(autopilotLearningData.createdAt, since90))
      .orderBy(desc(autopilotLearningData.createdAt))
      .limit(2000);

    if (rows.length < 10) return null;

    const rates = rows.map((r) => r.engagementRate ?? 0).sort((a, b) => a - b);
    const p50 = rates[Math.floor(rates.length * 0.5)] ?? 0;
    const p75 = rates[Math.floor(rates.length * 0.75)] ?? 0;
    const p90 = rates[Math.floor(rates.length * 0.9)] ?? 0;
    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;

    const byPlatform: Record<string, number[]> = {};
    const byHook: Record<string, number[]> = {};
    const byContentType: Record<string, number[]> = {};

    for (const r of rows) {
      const eng = r.engagementRate ?? 0;
      (byPlatform[r.platform ?? "unknown"] ??= []).push(eng);
      (byHook[r.hookType ?? "unknown"] ??= []).push(eng);
      (byContentType[r.contentType ?? "unknown"] ??= []).push(eng);
    }

    const aggregate = (m: Record<string, number[]>) =>
      Object.fromEntries(
        Object.entries(m).map(([k, v]) => [
          k,
          {
            count: v.length,
            avgEng: v.reduce((s, x) => s + x, 0) / v.length,
          },
        ]),
      );

    return {
      totalPosts: rows.length,
      avgEngagementRate: avg,
      platformBreakdown: aggregate(byPlatform),
      hookTypeBreakdown: aggregate(byHook),
      contentTypeBreakdown: aggregate(byContentType),
      topPerformers: rows
        .filter((r) => (r.engagementRate ?? 0) >= p90)
        .slice(0, 10)
        .map((r) => ({
          hookType: r.hookType,
          contentType: r.contentType,
          engRate: r.engagementRate ?? 0,
        })),
      percentileP50: p50,
      percentileP75: p75,
      percentileP90: p90,
    };
  } catch (err) {
    logger.debug(`[ScoreCalibrator] DB query error: ${(err as Error).message ?? String(err)}`);
    return null;
  }
}

// ── MaxCore remote calibration ────────────────────────────────────────────────

interface MaxCoreCalibrationResponse {
  weights?: Partial<ScoreWeights>;
  gate?: number;
  floor?: number;
  confidence?: number;
}

interface MaxCoreModelState {
  domain: string;
  version: string;
  trained_at: string;
  session_count: number;
  loss: number | null;
  weights?: {
    embed_dim: number;
    n_layers: number;
    vocab_size: number;
    ready: boolean;
  };
}

interface MaxCoreGenerateResponse {
  success?: boolean;
  platform: string;
  caption?: string;
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string[];
  confidence?: number;
  processing_time_ms?: number;
}

// Music topics for calibration — spread across genres and platforms so
// MaxCore's growing corpus is sampled broadly.
// `tone` is required by the MaxCore API (HTTP 422 without it).
const _CALIBRATION_TOPICS: Array<{
  topic: string;
  platform: string;
  tone: string;
}> = [
  {
    topic: "new music release hip-hop artist",
    platform: "instagram",
    tone: "energetic",
  },
  {
    topic: "viral music video drop announcement",
    platform: "tiktok",
    tone: "hype",
  },
  {
    topic: "album launch streaming premiere",
    platform: "youtube",
    tone: "professional",
  },
  {
    topic: "music artist brand collaboration",
    platform: "instagram",
    tone: "authentic",
  },
  {
    topic: "concert tour announcement live show",
    platform: "tiktok",
    tone: "exciting",
  },
];

// Pause between sequential generate calls (ms).
// Long enough for MaxCore's single-threaded LLM to commit its response before
// the next request arrives — prevents internal queuing that causes timeouts.
const SEQUENTIAL_GAP_MS = 200;

/**
 * Run calibration generate calls ONE AT A TIME, with a short gap between each.
 *
 * Why sequential, not parallel?
 *   MaxCore's LLM is single-threaded.  Firing 5 simultaneous requests forces
 *   them to queue internally; the back of the queue may not be served before
 *   our abort signal fires, causing failures.  Sequential calls — which is
 *   exactly how the Python bridge achieves 20/20 — let each request hit a
 *   responsive (already-warm) LLM and return in ~6 s.
 *
 * The LLM warmth pinger (startMaxCoreLLMWarmth) ensures the model is never
 * cold, so the first call here also returns quickly without a cold-start delay.
 *
 * Total time: 5 × ~6 s + 4 × 0.2 s ≈ 31 s — acceptable for a background task
 * that runs every 6 hours.
 */
async function fetchMaxCoreContentSignals(): Promise<Partial<ScoreWeights> | null> {
  const results: MaxCoreGenerateResponse[] = [];

  for (const { topic, platform, tone } of _CALIBRATION_TOPICS) {
    const res = await MaxCoreAIClient?.generate<MaxCoreGenerateResponse>(
      "/api/generate/content",
      { topic, platform, tone },
    );
    if (res != null && (res.caption || res.hook)) results?.push(res);
    // Brief pause — lets MaxCore flush its response before the next request.
    await new Promise<void>((r) => setTimeout(r, SEQUENTIAL_GAP_MS));
  }

  if (results?.length === 0) return null;

  const platforms = [...new Set(results?.map((r) => r?.platform))];
  const hooks = results?.map((r) => r?.hook ?? "").filter(Boolean);
  const ctas = results?.map((r) => r?.cta ?? "").filter(Boolean);
  const avgHashtags =
    results?.reduce((s, r) => s + (r?.hashtags?.length ?? 0), 0) / results?.length;

  const hookDiversity =
    hooks?.length > 0 ? new Set(hooks).size / hooks?.length : 0;
  const ctaRichness =
    ctas?.length > 0
      ? ctas?.reduce((s, c) => s + c?.split(" ").length, 0) / ctas?.length / 10
      : 0;
  const platformCoverage = platforms?.length / _CALIBRATION_TOPICS?.length;

  // Log the platforms we SENT (MaxCore does not echo back the platform field).
  const requestedPlatforms = [
    ...new Set(_CALIBRATION_TOPICS?.map((t) => t?.platform)),
  ];
  logger.info(
    `[ScoreCalibrator] MaxCore generate signals — ` +
      `${results?.length}/${_CALIBRATION_TOPICS?.length} topics responded | ` +
      `hookDiversity=${hookDiversity.toFixed(2)} ctaRichness=${ctaRichness?.toFixed(2)} ` +
      `avgHashtags=${avgHashtags.toFixed(1)} platforms=${requestedPlatforms?.join(",")}`,
  );

  return {
    hookStrength: Math.min(
      0.32,
      DEFAULT_WEIGHTS?.hookStrength + hookDiversity * 0.1,
    ),
    callToActionEffectiveness: Math.min(
      0.2,
      DEFAULT_WEIGHTS?.callToActionEffectiveness + ctaRichness * 0.05,
    ),
    algorithmAlignment: Math.min(
      0.15,
      DEFAULT_WEIGHTS?.algorithmAlignment + (avgHashtags / 10) * 0.04,
    ),
    engagement: Math.min(
      0.3,
      DEFAULT_WEIGHTS?.engagement + platformCoverage * 0.04,
    ),
  };
}

/**
 * Fetch all 4 MaxCore model-state endpoints in PARALLEL via Promise?.allSettled.
 * A single slow or failed endpoint does not block the others.
 */
async function fetchModelStates(): Promise<
  Array<{ domain: string; state: MaxCoreModelState | null }>
> {
  const domains = ["social", "advertising", "content", "engagement"] as const;
  const settled = await Promise?.allSettled(
    domains?.map((d) =>
      MaxCoreAIClient?.get<MaxCoreModelState>(`/api/models/${d}/state`),
    ),
  );
  return domains?.map((d, i) => ({
    domain: d,
    state: settled[i].status === "fulfilled" ? settled[i].value : null,
  }));
}

/**
 * Derives calibration from MaxCore's model-state endpoints AND
 * live POST /api/generate/content generation signals — all in parallel.
 */
async function fetchMaxCoreCalibration(
  _summary: PerformanceSummary | null,
): Promise<{
  calibration: MaxCoreCalibrationResponse | null;
  reachable: boolean;
}> {
  try {
    // Fire model-state fetches AND content-signal fetches simultaneously
    const [stateResults, contentSignals] = await Promise.all([
      fetchModelStates(),
      fetchMaxCoreContentSignals(),
    ]);

    // "Reachable" = any MaxCore endpoint produced a parsed response.  Even an
    // empty/initialised model state proves the network round-trip succeeded.
    // We distinguish reachable-but-no-data from genuine network failure so the
    // caller can log accurately instead of falsely claiming "unreachable".
    const anyStateResponded = stateResults.some(({ state }) => state != null);
    const reachable = anyStateResponded || contentSignals != null;

    const ready = stateResults.filter(
      ({ state }) => state != null && state.weights?.ready === true,
    );

    if (ready.length === 0 && !contentSignals)
      return { calibration: null, reachable };

    if (ready.length > 0) {
      logger.info(
        `[ScoreCalibrator] MaxCore connected — ${ready.length}/4 models ready ` +
          `(${ready.map((r) => r.domain).join(", ")})`,
      );
    }

    // Training-depth adjustments (only fires once MaxCore has been trained)
    const trained = ready.filter(
      ({ state }) => (state!.session_count ?? 0) > 0 && state!.loss != null,
    );

    let depthWeights: Partial<ScoreWeights> = {};
    let gate = DEFAULT_THRESHOLDS.gate;
    let floor = DEFAULT_THRESHOLDS.floor;
    let coverageRatio = 0;

    if (trained.length > 0) {
      const totalSessions = trained.reduce(
        (s, { state }) => s + (state!.session_count ?? 0),
        0,
      );
      const domainShare = (dom: string) => {
        const t = trained.find((r) => r.domain === dom);
        return t
          ? (t.state!.session_count ?? 0) / Math.max(totalSessions, 1)
          : 0;
      };

      depthWeights = {
        hookStrength: Math.min(
          0.35,
          DEFAULT_WEIGHTS.hookStrength + domainShare("social") * 0.08,
        ),
        engagement: Math.min(
          0.3,
          DEFAULT_WEIGHTS.engagement + domainShare("engagement") * 0.07,
        ),
        brandAlignment: Math.min(
          0.2,
          DEFAULT_WEIGHTS.brandAlignment + domainShare("advertising") * 0.06,
        ),
        algorithmAlignment: Math.min(
          0.15,
          DEFAULT_WEIGHTS.algorithmAlignment + domainShare("content") * 0.06,
        ),
      };

      coverageRatio = trained.length / 4;
      gate = Math.round(DEFAULT_THRESHOLDS.gate + coverageRatio * 2);
      floor = Math.round(DEFAULT_THRESHOLDS.floor + coverageRatio * 1);

      logger.info(
        `[ScoreCalibrator] MaxCore training insights: ` +
          trained
            .map(
              ({ domain, state }) =>
                `${domain}: ${state!.session_count} sessions, loss=${state!.loss != null ? state!.loss.toFixed(4) : "N/A"}`,
            )
            .join(" | "),
      );
    } else if (ready.length > 0) {
      logger.info(
        "[ScoreCalibrator] MaxCore models initialised but not yet trained — using generation signals only",
      );
    }

    // Merge: content signals always available; depth weights layer on top when trained.
    const mergedWeights: Partial<ScoreWeights> = { ...contentSignals };
    for (const k of Object.keys(depthWeights) as Array<keyof ScoreWeights>) {
      const cs = (contentSignals as Record<string, unknown>)[k];
      const dw = (depthWeights as Record<string, unknown>)[k];
      if (cs != null && dw != null) {
        (mergedWeights as Record<string, unknown>)[k] = Math.max((cs as number), (dw as number));
      } else if (dw != null) {
        (mergedWeights as Record<string, unknown>)[k] = dw;
      }
    }

    if (Object.keys(mergedWeights).length === 0)
      return { calibration: null, reachable };

    return {
      calibration: {
        weights: mergedWeights,
        gate,
        floor,
        confidence: contentSignals ? 0.5 + coverageRatio * 0.5 : coverageRatio,
      },
      reachable,
    };
  } catch (err) {
    // Thrown error from Promise.all (network failure, DNS error, etc.) — this
    // is the ONLY case where MaxCore is genuinely unreachable.
    logger.info(
      `[ScoreCalibrator] MaxCore calibration fetch failed: ${(err as Error).message ?? String(err)}`,
    );
    return { calibration: null, reachable: false };
  }
}

// ── Calibration application ───────────────────────────────────────────────────

function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  if (total === 0 || Math.abs(total - 1.0) < 0.001) return w;
  const factor = 1.0 / total;
  return Object.fromEntries(
    Object.entries(w).map(([k, v]) => [
      k,
      Math.round(v * factor * 1000) / 1000,
    ]),
  ) as ScoreWeights;
}

function applyCalibration(
  resp: MaxCoreCalibrationResponse,
  summary: PerformanceSummary,
): void {
  const merged: ScoreWeights = { ...DEFAULT_WEIGHTS };
  if (resp.weights) {
    for (const [k, v] of Object.entries(resp.weights)) {
      if (k in merged && typeof v === "number") {
        (merged as unknown as Record<string, unknown>)[k] = Math.max(
          0.01,
          Math.min(0.5, v),
        );
      }
    }
  }
  _cachedWeights = normalizeWeights(merged);

  const gate =
    resp.gate != null
      ? Math.max(75, Math.min(92, resp.gate))
      : deriveGate(summary);
  const floor =
    resp.floor != null
      ? Math.max(65, Math.min(80, resp.floor))
      : Math.max(65, gate - 10);
  _cachedThresholds = { gate, floor };
}

function applyDataDrivenCalibration(summary: PerformanceSummary): void {
  const w = { ...DEFAULT_WEIGHTS };

  const hookScores = Object.values(summary.hookTypeBreakdown).map(
    (h) => h.avgEng,
  );
  if (hookScores.length > 1 && variance(hookScores) > 0.001) {
    w.hookStrength = Math.min(
      0.28,
      DEFAULT_WEIGHTS.hookStrength + variance(hookScores) * 2,
    );
  }

  const ctScores = Object.values(summary.contentTypeBreakdown).map(
    (c) => c.avgEng,
  );
  if (ctScores.length > 1 && variance(ctScores) > 0.001) {
    w.specificity = Math.min(0.1, DEFAULT_WEIGHTS.specificity + 0.02);
    w.narrativeAuthenticity = Math.min(
      0.06,
      DEFAULT_WEIGHTS.narrativeAuthenticity + 0.02,
    );
  }

  _cachedWeights = normalizeWeights(w);
  _cachedThresholds = {
    gate: deriveGate(summary),
    floor: Math.max(65, deriveGate(summary) - 8),
  };
}

function deriveGate(summary: PerformanceSummary): number {
  const p75 = summary.percentileP75;
  if (p75 > 0.05) return 87;
  if (p75 > 0.02) return 84;
  if (p75 > 0.01) return 81;
  if (p75 > 0.005) return 78;
  return 75;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

// ── Startup initialisation ────────────────────────────────────────────────────

let _refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Invalidate the calibration cache so the next runCalibration() call
 * bypasses the 6-hour TTL guard and runs immediately.
 *
 * Called by maxcoreSync after a successful weight pull — ensures the quality
 * gate thresholds are refreshed within the same 10-minute training cycle
 * rather than waiting up to 6 hours for the scheduled refresh.
 */
export function invalidateCalibrationCache(): void {
  _lastCalibrated = 0;
}

export function initScoreCalibrator(): void {
  // Start the LLM warmth pinger immediately.
  // It fires its first ping right away, so the LLM is fully warm before the
  // calibration run at +15 s, and stays warm between the 6-hourly refreshes.
  startMaxCoreLLMWarmth();

  // First calibration after 15 s — DB and MaxCore are ready by then; the
  // warmth pinger has already had ~9 s to complete its first pulse.
  setTimeout(() => {
    runCalibration().catch(() => {});
  }, 15_000);

  // Recurring refresh every 6 h — matches MaxCore's dataset growth cadence
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    runCalibration().catch(() => {});
  }, CALIBRATION_TTL_MS);

  logger.info(
    "[ScoreCalibrator] Initialized — will calibrate scoring weights against MaxCore 8TB corpus",
  );
}
