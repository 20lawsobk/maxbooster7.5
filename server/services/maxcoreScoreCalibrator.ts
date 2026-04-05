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
    const summary = await buildPerformanceSummary();
    if (!summary) {
      logger.info('[ScoreCalibrator] Insufficient local data — using default weights/thresholds');
      return;
    }

    const calibration = await fetchMaxCoreCalibration(summary);
    if (calibration) {
      applyCalibration(calibration, summary);
    } else {
      applyDataDrivenCalibration(summary);
    }

    _lastCalibrated = Date.now();
    logger.info(
      `[ScoreCalibrator] Calibration complete. ` +
      `Gate=${_cachedThresholds!.gate} Floor=${_cachedThresholds!.floor} ` +
      `Top weights: engagement=${_cachedWeights!.engagement.toFixed(3)}, ` +
      `hook=${_cachedWeights!.hookStrength.toFixed(3)}`
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

async function fetchMaxCoreCalibration(
  summary: PerformanceSummary
): Promise<MaxCoreCalibrationResponse | null> {
  try {
    const resp = await MaxCoreAIClient.infer<MaxCoreCalibrationResponse>(
      '/api/calibrate/scoring',
      {
        domain:    'music_social_media',
        industry:  'music_artist',
        datasetSize: '8TB',
        localData: {
          totalPosts:        summary.totalPosts,
          avgEngagementRate: summary.avgEngagementRate,
          platformBreakdown: summary.platformBreakdown,
          hookTypePerformance: summary.hookTypeBreakdown,
          contentTypePerformance: summary.contentTypeBreakdown,
          topPerformerPatterns: summary.topPerformers,
          percentiles: {
            p50: summary.percentileP50,
            p75: summary.percentileP75,
            p90: summary.percentileP90,
          },
        },
        currentWeights:    DEFAULT_WEIGHTS,
        currentThresholds: DEFAULT_THRESHOLDS,
        requestedOutputs:  ['weights', 'gate', 'floor', 'insights'],
      }
    );

    if (resp && (resp.weights || resp.gate !== undefined)) {
      if (resp.insights?.length) {
        logger.info(`[ScoreCalibrator] MaxCore insights: ${resp.insights.slice(0, 3).join(' | ')}`);
      }
      return resp;
    }
  } catch (err: any) {
    logger.debug(`[ScoreCalibrator] MaxCore calibration endpoint failed: ${err.message}`);
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
