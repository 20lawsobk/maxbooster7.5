import { logger } from "../logger.js";
import {
  contentQualityPipeline,
  getCurrentPressure,
  type ContentVariant,
  type ContentContext,
} from "./contentQualityPipeline.js";

// ── Veo Quality Gate constants (mirrors contentQualityPipeline.ts) ────────────
const VEO_QUALITY_GATE = 81;
const VEO_PRESSURE_FLOOR = 73;
const MAX_ROUNDS = 10;
const VARIANTS_PER_ROUND = 7;

// ── Recent engagement ring buffer ─────────────────────────────────────────────
// Capped at 500 entries per process lifetime.  Used to bias the adaptive
// threshold toward recent real-world performance without external storage I/O.
const MAX_ENGAGEMENT_HISTORY = 500;
interface EngagementRecord {
  userId: string;
  platform: string;
  contentType: string;
  hookType: string;
  engagementRate: number;
  qualityScore: number;
  recordedAt: number;
}
const _engagementHistory: EngagementRecord[] = [];

export interface GateResult {
  winner: ContentVariant;
  rejectedVariants: ContentVariant[];
  passedOnAttempt: number;
  totalVariantsTried: number;
  thresholdUsed: number;
  storedKey?: string | null;
}

// ── Pressure-adjusted threshold ───────────────────────────────────────────────
function resolveThreshold(): number {
  const pressure = getCurrentPressure();
  if (pressure <= 0) return VEO_QUALITY_GATE;
  if (pressure > 1.5) return Math.max(VEO_PRESSURE_FLOOR, VEO_QUALITY_GATE - 10);
  if (pressure > 0.5) return Math.max(68, VEO_QUALITY_GATE - 7);
  return Math.max(71, VEO_QUALITY_GATE - 4);
}

// ── Archive key for passing variants (in-memory tag, no external I/O) ─────────
function makeArchiveKey(userId: string, platform: string): string {
  return `qgate:${userId}:${platform}:${Date.now()}`;
}

class ContentQualityGate {
  /**
   * Generate content variants and return the first that clears the Veo quality
   * gate.  Runs up to MAX_ROUNDS × VARIANTS_PER_ROUND attempts.
   * Returns null only when all attempts fall short — callers should skip the
   * post rather than publish below-threshold content.
   */
  async run(
    userId: string,
    params: {
      topic: string;
      objective?: string;
      platform: string;
      tone?: string;
      targetAudience?: string;
      genre?: string;
    },
  ): Promise<GateResult | null> {
    const threshold = resolveThreshold();

    const context = await contentQualityPipeline.buildContext(userId, {
      topic: params.topic,
      objective: (params.objective || "engagement") as ContentContext["objective"],
      platform: params.platform,
      tone: params.tone,
      targetAudience: params.targetAudience,
      genre: params.genre,
    });

    const allRejected: ContentVariant[] = [];
    let totalTried = 0;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const variants = await contentQualityPipeline.generateVariants(
        context,
        VARIANTS_PER_ROUND,
      );
      totalTried += variants.length;

      const passing = variants.filter((v) => v.scores.overall >= threshold);
      allRejected.push(...variants.filter((v) => v.scores.overall < threshold));

      if (passing.length > 0) {
        const winner = passing[0];
        const storedKey = makeArchiveKey(userId, params.platform);
        logger.info(
          `[QualityGate] User ${userId}: passed round ${round}/${MAX_ROUNDS} — ` +
            `score=${winner.scores.overall.toFixed(1)}, threshold=${threshold}, ` +
            `tried=${totalTried}, archived=${storedKey}`,
        );
        return {
          winner,
          rejectedVariants: [...allRejected, ...passing.slice(1)],
          passedOnAttempt: round,
          totalVariantsTried: totalTried,
          thresholdUsed: threshold,
          storedKey,
        };
      }

      const bestScore = variants[0]?.scores.overall ?? 0;
      logger.info(
        `[QualityGate] User ${userId}: round ${round}/${MAX_ROUNDS} — all ${variants.length} below ` +
          `threshold ${threshold} (best=${bestScore.toFixed(1)})`,
      );
    }

    logger.warn(
      `[QualityGate] User ${userId}: exhausted ${MAX_ROUNDS} rounds (${totalTried} variants) — ` +
        `none reached threshold ${threshold}. Post skipped to protect quality.`,
    );
    return null;
  }

  /**
   * Score an existing MaxCore-generated text against the Veo quality gate.
   * If it passes, wraps it in a GateResult (passedOnAttempt = 1).
   * If it falls short, falls back to the full A/B retry loop to find a
   * passing variant — preserving the "quality over quantity" contract.
   */
  async scoreAndGateExisting(
    userId: string,
    rawText: string,
    platform: string,
    params: {
      topic?: string;
      objective?: string;
      tone?: string;
      genre?: string;
      targetAudience?: string;
    },
  ): Promise<GateResult | null> {
    const threshold = resolveThreshold();

    const context = await contentQualityPipeline.buildContext(userId, {
      topic: params.topic || "new music",
      objective: (params.objective || "engagement") as ContentContext["objective"],
      platform,
      tone: params.tone,
      genre: params.genre,
      targetAudience: params.targetAudience,
    });

    const platformOpt = contentQualityPipeline.validatePlatformConstraints(
      rawText,
      [],
      platform,
    );
    const scores = contentQualityPipeline.scoreContent(
      rawText,
      "",
      "",
      context,
      platformOpt,
    );

    if (scores.overall >= threshold) {
      const winner: ContentVariant = {
        id: "existing",
        content: rawText,
        headline: "",
        hashtags: [],
        callToAction: "",
        scores,
        platformOptimizations: platformOpt,
      };
      return {
        winner,
        rejectedVariants: [],
        passedOnAttempt: 1,
        totalVariantsTried: 1,
        thresholdUsed: threshold,
        storedKey: makeArchiveKey(userId, platform),
      };
    }

    logger.info(
      `[QualityGate] User ${userId}: existing content scored ${scores.overall.toFixed(1)} < ` +
        `threshold ${threshold} — running full gate loop for platform "${platform}"`,
    );
    return this.run(userId, {
      topic: params.topic || "new music",
      objective: params.objective,
      platform,
      tone: params.tone,
      genre: params.genre,
      targetAudience: params.targetAudience,
    });
  }

  /**
   * Feed real post engagement back to the gate so the training signal can
   * adapt the threshold over time.  Non-blocking — callers fire-and-forget.
   */
  async recordEngagementOutcome(
    userId: string,
    platform: string,
    contentType: string,
    hookType: string,
    engagementRate: number,
    qualityScore: number,
  ): Promise<void> {
    const record: EngagementRecord = {
      userId,
      platform,
      contentType,
      hookType,
      engagementRate,
      qualityScore,
      recordedAt: Date.now(),
    };

    _engagementHistory.push(record);
    if (_engagementHistory.length > MAX_ENGAGEMENT_HISTORY) {
      _engagementHistory.shift();
    }

    logger.info(
      { engagementRate, qualityScore, platform, contentType, hookType },
      `[QualityGate] Engagement feedback recorded for user ${userId}`,
    );
  }

  /**
   * Return a snapshot of recent engagement outcomes for diagnostic / training
   * use (e.g. MaxCore training sync).
   */
  getEngagementHistory(userId?: string): EngagementRecord[] {
    return userId
      ? _engagementHistory.filter((r) => r.userId === userId)
      : [..._engagementHistory];
  }
}

export const contentQualityGate = new ContentQualityGate();
