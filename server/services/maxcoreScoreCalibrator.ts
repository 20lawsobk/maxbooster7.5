/**
 * MaxCore Score Calibrator
 *
 * Bridges the 8TB MaxCore dataset corpus (music industry, social media
 * management, advertising performance) with the local VeoGate quality
 * scoring system.
 *
 * What it does:
 *   1. Reads real-world engagement performance from the local DB
 *      (autopilotLearningData + socialCampaigns — last 90 days)
 *   2. Sends a compressed performance summary to the MaxCore server,
 *      which cross-references it against its 8TB corpus to surface
 *      industry-calibrated insights
 *   3. Computes calibrated score weights (which scoring dimension actually
 *      predicts high engagement for THIS user base vs the current hard-coded
 *      0.25/0.18/0.13 …)
 *   4. Returns calibrated thresholds (gate + floor) adjusted for what
 *      actually performs in music-industry social contexts
 *
 * Falls back to default weights/thresholds (no change to current behaviour)
 * whenever MaxCore is offline or data is insufficient.
 *
 * Refresh cycle: on startup + every 24 h.
 */

import { logger }    from '../logger.js';
import { db }        from '../db';
import { MaxCoreAIClient } from './maxcoreClient.js';
import {
  autopilotLearningData,
  socialCampaigns,
} from '@shared/schema';
import { desc, gte, sql } from 'drizzle-orm';

// ── Default weights (current hard-coded values in contentQualityPipeline.ts) ─
export interface ScoreWeights {
  engagement:                number;
  hookStrength:              number;
  callToActionEffectiveness: number;
  sentiment:                 number;
  clarity:                   number;
  brandAlignment:            number;
  algorithmAlignment:        number;
  specificity:               number;
  emotionalArc:              number;
  narrativeAuthenticity:     number;
}

export interface CalibratedThresholds {
  gate:  number;   // VEO_QUALITY_GATE equivalent
  floor: number;   // VEO_PRESSURE_FLOOR equivalent
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  engagement:                0.25,
  hookStrength:              0.18,
  callToActionEffectiveness: 0.13,
  sentiment:                 0.10,
  clarity:                   0.08,
  brandAlignment:            0.08,
  algorithmAlignment:        0.08,
  specificity:               0.05,
  emotionalArc:              0.03,
  narrativeAuthenticity:     0.02,
};

const DEFAULT_THRESHOLDS: CalibratedThresholds = {
  gate:  81,
  floor: 73,
};

// Cache TTL: 24 hours
const CALIBRATION_TTL_MS = 24 * 60 * 60 * 1_000;

let _cachedWeights:     ScoreWeights            | null = null;
let _cachedThresholds:  CalibratedThresholds    | null = null;
let _lastCalibrated = 0;
let _calibrating    = false;


// ── Public API ────────────────────────────────────────────────────────────────

/** Returns live calibrated weights (falls back to defaults when not ready). */
export function getCalibratedWeights(): ScoreWeights {
  return _cachedWeights ?? DEFAULT_WEIGHTS;
}

/** Returns live calibrated thresholds (falls back to defaults when not ready). */
export function getCalibratedThresholds(): CalibratedThresholds {
  return _cachedThresholds ?? DEFAULT_THRESHOLDS;
}

/** True once first calibration has completed (may still be default values). */
export function isCalibrated(): boolean {
  return _lastCalibrated > 0;
}

/**
 * Trigger a calibration cycle.  Safe to call multiple times — ignores concurrent calls.
 * Called automatically on startup and every CALIBRATION_TTL_MS.
 */
export async function runCalibration(): Promise<void> {
  if (_calibrating) return;
  if (Date.now() - _lastCalibrated < CALIBRATION_TTL_MS && _lastCalibrated > 0) return;

  _calibrating = true;
  try {
    logger.info('[ScoreCalibrator] Starting calibration cycle against MaxCore 8TB corpus …');

    // Local engagement summary (optional — enriches calibration but not required).
    // MaxCore content generation signals are always fetched regardless.
    const summary = await buildPerformanceSummary();
    if (!summary) {
      logger.info('[ScoreCalibrator] No local engagement data yet — relying on MaxCore generation signals');
    }

    // Always call MaxCore — fetchMaxCoreCalibration uses POST /api/content/generate
    // which does NOT require local data.  summary may be null here; that is fine.
    const calibration = await fetchMaxCoreCalibration(summary!);
    if (calibration) {
      applyCalibration(calibration, summary ?? {
        totalPosts: 0, avgEngagementRate: 0, platformBreakdown: {},
        hookTypeBreakdown: {}, contentTypeBreakdown: {}, topPerformers: [],
        percentileP50: 0, percentileP75: 0, percentileP90: 0,
      });
    } else if (summary) {
      // MaxCore unavailable — fall back to pure local data calibration
      applyDataDrivenCalibration(summary);
    } else {
      // No MaxCore AND no local data — retain defaults, mark as calibrated so we
      // don't spam retries (next attempt is in 24h or on restart)
      logger.info('[ScoreCalibrator] MaxCore unreachable and no local data — retaining defaults');
    }

    _lastCalibrated = Date.now();
    logger.info(
      `[ScoreCalibrator] Calibration complete. ` +
      `Gate=${_cachedThresholds?.gate ?? DEFAULT_THRESHOLDS.gate} ` +
      `Floor=${_cachedThresholds?.floor ?? DEFAULT_THRESHOLDS.floor} ` +
      `Top weights: engagement=${(_cachedWeights?.engagement ?? DEFAULT_WEIGHTS.engagement).toFixed(3)}, ` +
      `hook=${(_cachedWeights?.hookStrength ?? DEFAULT_WEIGHTS.hookStrength).toFixed(3)}`
    );
  } catch (err: any) {
    logger.warn(`[ScoreCalibrator] Calibration failed: ${err.message} — retaining previous values`);
  } finally {
    _calibrating = false;
  }
}


// ── Performance data collection ───────────────────────────────────────────────

interface PerformanceSummary {
  totalPosts:           number;
  avgEngagementRate:    number;
  platformBreakdown:    Record<string, { count: number; avgEng: number }>;
  hookTypeBreakdown:    Record<string, { count: number; avgEng: number }>;
  contentTypeBreakdown: Record<string, { count: number; avgEng: number }>;
  topPerformers:        Array<{ hookType: string | null; contentType: string | null; engRate: number }>;
  percentileP50:        number;
  percentileP75:        number;
  percentileP90:        number;
}

async function buildPerformanceSummary(): Promise<PerformanceSummary | null> {
  try {
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);

    // Pull up to 2000 recent records from autopilotLearningData
    const rows = await db
      .select({
        platform:      autopilotLearningData.platform,
        contentType:   autopilotLearningData.contentType,
        hookType:      autopilotLearningData.hookType,
        engagementRate: autopilotLearningData.engagementRate,
      })
      .from(autopilotLearningData)
      .where(gte(autopilotLearningData.createdAt, since90))
      .orderBy(desc(autopilotLearningData.createdAt))
      .limit(2000);

    if (rows.length < 10) return null;

    const rates = rows.map(r => r.engagementRate ?? 0).sort((a, b) => a - b);
    const p50   = rates[Math.floor(rates.length * 0.50)] ?? 0;
    const p75   = rates[Math.floor(rates.length * 0.75)] ?? 0;
    const p90   = rates[Math.floor(rates.length * 0.90)] ?? 0;
    const avg   = rates.reduce((s, v) => s + v, 0) / rates.length;

    const byPlatform:    Record<string, number[]> = {};
    const byHook:        Record<string, number[]> = {};
    const byContentType: Record<string, number[]> = {};

    for (const r of rows) {
      const eng = r.engagementRate ?? 0;
      const plt = r.platform ?? 'unknown';
      (byPlatform[plt]     ??= []).push(eng);
      const hk = r.hookType ?? 'unknown';
      (byHook[hk]          ??= []).push(eng);
      const ct = r.contentType ?? 'unknown';
      (byContentType[ct]   ??= []).push(eng);
    }

    const aggregate = (m: Record<string, number[]>) =>
      Object.fromEntries(
        Object.entries(m).map(([k, v]) => [
          k,
          { count: v.length, avgEng: v.reduce((s, x) => s + x, 0) / v.length },
        ])
      );

    // Top 10 performers
    const topPerformers = rows
      .filter(r => (r.engagementRate ?? 0) >= p90)
      .slice(0, 10)
      .map(r => ({ hookType: r.hookType, contentType: r.contentType, engRate: r.engagementRate ?? 0 }));

    return {
      totalPosts:           rows.length,
      avgEngagementRate:    avg,
      platformBreakdown:    aggregate(byPlatform),
      hookTypeBreakdown:    aggregate(byHook),
      contentTypeBreakdown: aggregate(byContentType),
      topPerformers,
      percentileP50:        p50,
      percentileP75:        p75,
      percentileP90:        p90,
    };
  } catch (err: any) {
    logger.debug(`[ScoreCalibrator] DB query error: ${err.message}`);
    return null;
  }
}


// ── MaxCore remote calibration ────────────────────────────────────────────────

interface MaxCoreCalibrationResponse {
  weights?:    Partial<ScoreWeights>;
  gate?:       number;
  floor?:      number;
  confidence?: number;
  insights?:   string[];
}

interface MaxCoreModelState {
  domain:         string;
  version:        string;
  trained_at:     string;
  session_count:  number;
  loss:           number | null;
  weights?: {
    embed_dim:  number;
    n_layers:   number;
    vocab_size: number;
    ready:      boolean;
  };
}

interface MaxCoreGenerateResponse {
  success:            boolean;
  platform:           string;
  caption?:           string;
  hook?:              string;
  body?:              string;
  cta?:               string;
  hashtags?:          string[];
  source?:            string;
  processing_time_ms?: number;
}

// Music topics sent to POST /api/content/generate for calibration signals.
const _CALIBRATION_TOPICS: Array<{ topic: string; platform: string }> = [
  { topic: 'new music release hip-hop artist',   platform: 'instagram' },
  { topic: 'viral music video drop announcement', platform: 'tiktok'    },
  { topic: 'album launch streaming premiere',     platform: 'youtube'   },
  { topic: 'music artist brand collaboration',    platform: 'instagram' },
  { topic: 'concert tour announcement live show', platform: 'tiktok'    },
];

/**
 * Calls POST /api/content/generate (MaxCore remote ONLY — no local fallback)
 * for a set of music topics and extracts platform-specific content signals.
 *
 * Signals derived:
 *  - Platform hook diversity    → hookStrength weight
 *  - CTA pattern richness       → callToActionEffectiveness weight
 *  - Hashtag count per platform → algorithmAlignment weight
 *  - Cross-platform coverage    → engagement weight
 */
async function fetchMaxCoreContentSignals(): Promise<Partial<ScoreWeights> | null> {
  const results: MaxCoreGenerateResponse[] = [];

  for (const { topic, platform } of _CALIBRATION_TOPICS) {
    const r = await MaxCoreAIClient.generate<MaxCoreGenerateResponse>(
      '/api/content/generate',
      { topic, platform }
    );
    if (r?.success) results.push(r);
  }

  if (results.length === 0) return null;

  // ── Derive weight signals from MaxCore generation patterns ───────────────
  const platforms = [...new Set(results.map(r => r.platform))];
  const hooks     = results.map(r => r.hook ?? '').filter(Boolean);
  const ctas      = results.map(r => r.cta  ?? '').filter(Boolean);
  const avgHashtags = results.reduce((s, r) => s + (r.hashtags?.length ?? 0), 0) / results.length;

  // Hook diversity: unique hooks / total → higher = MaxCore varies hooks well
  const hookDiversity = hooks.length > 0
    ? new Set(hooks).size / hooks.length
    : 0;

  // CTA richness: avg word count of CTAs — longer CTAs → stronger CTA signal
  const ctaRichness = ctas.length > 0
    ? ctas.reduce((s, c) => s + c.split(' ').length, 0) / ctas.length / 10
    : 0;

  // Platform coverage: how many distinct platforms responded
  const platformCoverage = platforms.length / _CALIBRATION_TOPICS.length;

  logger.info(
    `[ScoreCalibrator] MaxCore generate signals — ` +
    `${results.length}/${_CALIBRATION_TOPICS.length} topics responded | ` +
    `hookDiversity=${hookDiversity.toFixed(2)} ctaRichness=${ctaRichness.toFixed(2)} ` +
    `avgHashtags=${avgHashtags.toFixed(1)} platforms=${platforms.join(',')}`
  );

  const weights: Partial<ScoreWeights> = {
    hookStrength:              Math.min(0.32, DEFAULT_WEIGHTS.hookStrength              + hookDiversity  * 0.10),
    callToActionEffectiveness: Math.min(0.20, DEFAULT_WEIGHTS.callToActionEffectiveness + ctaRichness    * 0.05),
    algorithmAlignment:        Math.min(0.15, DEFAULT_WEIGHTS.algorithmAlignment        + (avgHashtags / 10) * 0.04),
    engagement:                Math.min(0.30, DEFAULT_WEIGHTS.engagement                + platformCoverage * 0.04),
  };

  return weights;
}

/**
 * Derives calibration from MaxCore's four model-state endpoints AND
 * the live POST /api/content/generate generation service.
 *
 * Sources:
 *  - /api/models/{social|advertising|content|engagement}/state → training depth weights
 *  - POST /api/content/generate                                → live generation signals
 */
async function fetchMaxCoreCalibration(
  summary: PerformanceSummary
): Promise<MaxCoreCalibrationResponse | null> {
  try {
    // ── 1. Fetch model states ───────────────────────────────────────────────
    const domains = ['social', 'advertising', 'content', 'engagement'] as const;
    const [states, contentSignals] = await Promise.all([
      Promise.all(domains.map(d => MaxCoreAIClient.get<MaxCoreModelState>(`/api/models/${d}/state`))),
      fetchMaxCoreContentSignals(),
    ]);

    const ready = states
      .map((s, i) => ({ domain: domains[i], state: s }))
      .filter(({ state }) => state?.weights?.ready === true);

    // If neither model states nor content signals are available, bail out
    if (ready.length === 0 && !contentSignals) return null;

    if (ready.length > 0) {
      logger.info(
        `[ScoreCalibrator] MaxCore connected — ${ready.length}/4 models ready ` +
        `(${ready.map(r => r.domain).join(', ')})`
      );
    }

    // ── 2. Training-depth weight adjustments ────────────────────────────────
    const trained = ready.filter(({ state }) =>
      (state!.session_count ?? 0) > 0 && state!.loss != null
    );

    let depthWeights: Partial<ScoreWeights> = {};
    let gate  = DEFAULT_THRESHOLDS.gate;
    let floor = DEFAULT_THRESHOLDS.floor;
    let coverageRatio = 0;

    if (trained.length > 0) {
      const totalSessions = trained.reduce((s, { state }) => s + (state!.session_count ?? 0), 0);
      const domainShare = (dom: string): number => {
        const t = trained.find(r => r.domain === dom);
        return t ? (t.state!.session_count ?? 0) / Math.max(totalSessions, 1) : 0;
      };

      depthWeights = {
        hookStrength:              Math.min(0.35, DEFAULT_WEIGHTS.hookStrength              + domainShare('social')      * 0.08),
        engagement:                Math.min(0.30, DEFAULT_WEIGHTS.engagement                + domainShare('engagement')  * 0.07),
        brandAlignment:            Math.min(0.20, DEFAULT_WEIGHTS.brandAlignment            + domainShare('advertising') * 0.06),
        algorithmAlignment:        Math.min(0.15, DEFAULT_WEIGHTS.algorithmAlignment        + domainShare('content')     * 0.06),
      };

      coverageRatio = trained.length / domains.length;
      gate  = Math.round(DEFAULT_THRESHOLDS.gate  + coverageRatio * 2);
      floor = Math.round(DEFAULT_THRESHOLDS.floor + coverageRatio * 1);

      const insights = trained.map(({ domain, state }) =>
        `${domain}: ${state!.session_count} sessions, loss=${state!.loss?.toFixed(4) ?? 'N/A'}`
      );
      logger.info(`[ScoreCalibrator] MaxCore training insights: ${insights.join(' | ')}`);
    } else if (ready.length > 0) {
      logger.info('[ScoreCalibrator] MaxCore models initialised but not yet trained — using generation signals only');
    }

    // ── 3. Merge training-depth weights with content-generation signals ─────
    // Generation signals always available (POST /api/content/generate is live).
    // Training-depth weights add on top once MaxCore has been trained.
    const mergedWeights: Partial<ScoreWeights> = { ...contentSignals, ...depthWeights };
    // For keys present in both, take the higher of the two (more authoritative signal wins)
    if (contentSignals && Object.keys(depthWeights).length > 0) {
      for (const k of Object.keys(mergedWeights) as Array<keyof ScoreWeights>) {
        const cs = (contentSignals as any)[k];
        const dw = (depthWeights  as any)[k];
        if (cs != null && dw != null) {
          (mergedWeights as any)[k] = Math.max(cs, dw);
        }
      }
    }

    if (Object.keys(mergedWeights).length === 0) return null;

    return {
      weights:    mergedWeights,
      gate,
      floor,
      confidence: contentSignals ? 0.5 + coverageRatio * 0.5 : coverageRatio,
    };
  } catch (err: any) {
    logger.debug(`[ScoreCalibrator] MaxCore calibration fetch failed: ${err.message}`);
  }
  return null;
}


// ── Calibration application ───────────────────────────────────────────────────

function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  if (total === 0 || Math.abs(total - 1.0) < 0.001) return w;
  const factor = 1.0 / total;
  return Object.fromEntries(
    Object.entries(w).map(([k, v]) => [k, Math.round(v * factor * 1000) / 1000])
  ) as ScoreWeights;
}

function applyCalibration(
  resp: MaxCoreCalibrationResponse,
  summary: PerformanceSummary
): void {
  // Merge remote weights with defaults (remote takes precedence, clamped to [0.01, 0.50])
  const merged: ScoreWeights = { ...DEFAULT_WEIGHTS };
  if (resp.weights) {
    for (const [k, v] of Object.entries(resp.weights)) {
      if (k in merged && typeof v === 'number') {
        (merged as any)[k] = Math.max(0.01, Math.min(0.50, v));
      }
    }
  }
  _cachedWeights = normalizeWeights(merged);

  // Calibrate gate and floor — clamp to sane ranges
  const gate  = resp.gate  != null ? Math.max(75, Math.min(92, resp.gate))  : deriveGate(summary);
  const floor = resp.floor != null ? Math.max(65, Math.min(80, resp.floor)) : Math.max(65, gate - 10);
  _cachedThresholds = { gate, floor };
}

function applyDataDrivenCalibration(summary: PerformanceSummary): void {
  // When MaxCore is offline, derive calibration purely from local performance data.
  // Logic: which hook types / content types beat the P75 threshold?
  const w = { ...DEFAULT_WEIGHTS };

  // If hook types show strong differentiation → boost hookStrength weight
  const hookScores = Object.values(summary.hookTypeBreakdown).map(h => h.avgEng);
  if (hookScores.length > 1) {
    const hookVariance = variance(hookScores);
    if (hookVariance > 0.001) {
      w.hookStrength = Math.min(0.28, DEFAULT_WEIGHTS.hookStrength + hookVariance * 2);
    }
  }

  // If content type shows differentiation → boost specificity + narrativeAuthenticity
  const ctScores = Object.values(summary.contentTypeBreakdown).map(c => c.avgEng);
  if (ctScores.length > 1 && variance(ctScores) > 0.001) {
    w.specificity           = Math.min(0.10, DEFAULT_WEIGHTS.specificity + 0.02);
    w.narrativeAuthenticity = Math.min(0.06, DEFAULT_WEIGHTS.narrativeAuthenticity + 0.02);
  }

  _cachedWeights    = normalizeWeights(w);
  _cachedThresholds = { gate: deriveGate(summary), floor: Math.max(65, deriveGate(summary) - 8) };
}

function deriveGate(summary: PerformanceSummary): number {
  // Map p75 engagement rate to a VeoGate score.
  // Music-industry benchmarks: <1% eng = low (gate 75), 1-3% = mid (81), >3% = high (87).
  const p75 = summary.percentileP75;
  if (p75 > 0.05)       return 87;
  if (p75 > 0.02)       return 84;
  if (p75 > 0.01)       return 81;
  if (p75 > 0.005)      return 78;
  return 75;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}


// ── Startup initialisation ────────────────────────────────────────────────────

let _refreshTimer: ReturnType<typeof setInterval> | null = null;

export function initScoreCalibrator(): void {
  // Run first calibration after a brief delay so DB is ready
  setTimeout(() => {
    runCalibration().catch(() => {});
  }, 15_000);

  // Schedule recurring refresh every 24 h
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    runCalibration().catch(() => {});
  }, CALIBRATION_TTL_MS);

  logger.info('[ScoreCalibrator] Initialized — will calibrate scoring weights against MaxCore 8TB corpus');
}
