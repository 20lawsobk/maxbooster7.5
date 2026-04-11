/**
 * CONTENT QUALITY GATE
 *
 * Sits between the auto-generator and the auto-poster.
 * Keeps regenerating with A/B testing batches until the best variant
 * meets the Veo-quality threshold, then hands the winner off for posting.
 * Every attempt (pass and fail) is archived in Pocket Dimension.
 *
 * ── Threshold calibration ────────────────────────────────────────────────────
 * Google's Veo model scores ~90–95 on this pipeline's rubric.
 * "At least 90% of Veo quality" = 90% × 90 = 81.
 * DEFAULT_THRESHOLD is therefore 81 — the minimum score a winning variant must
 * achieve before being allowed through to the scheduler.
 *
 * ── A/B strategy ─────────────────────────────────────────────────────────────
 * Round 1  — Advanced Social AI (highest quality, semantic understanding)
 * Rounds 2+ — Template/Python AI with rotated objectives (broader search space)
 *
 * Up to MAX_ROUNDS are attempted.  After exhausting all rounds the best variant
 * found is used only if it cleared VEO_PRESSURE_FLOOR (73); otherwise the run
 * returns null and the caller must skip posting rather than lower the bar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { logger } from '../logger.js';
import { db } from '../db.js';
import { autopilotPreferences } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  contentQualityPipeline,
  type ContentVariant,
  type ContentContext,
} from './contentQualityPipeline.js';
import { pocketManager } from '../pocket-dimension/index.js';
import { isPdimConfigured, getPdimClient } from '../lib/pdimClient.js';
import { pushTrainingFeedback } from './maxcoreSync.js';
import { getCalibratedThresholds } from './maxcoreScoreCalibrator.js';

export interface QualityGateResult {
  winner: ContentVariant;
  passedOnAttempt: number;
  totalVariantsTried: number;
  rejectedVariants: ContentVariant[];
  thresholdUsed: number;
  storedKey: string | null;
}

const _DEFAULT_THRESHOLD    = 81;   // 90% of Veo's ~90 baseline score (overridden by calibrator)
const _VEO_PRESSURE_FLOOR   = 73;   // absolute minimum — overridden by MaxCore calibration
const DEFAULT_THRESHOLD  = () => getCalibratedThresholds().gate  ?? _DEFAULT_THRESHOLD;
const VEO_PRESSURE_FLOOR = () => getCalibratedThresholds().floor ?? _VEO_PRESSURE_FLOOR;
const MAX_ROUNDS           = 10;   // A/B retry budget
const VARIANTS_PER_ROUND   = 30;   // 30+ variants per batch — maximises quality hit rate
                                   // and shortens the time to reach the 81/100 threshold

export class ContentQualityGate {
  private static instance: ContentQualityGate;

  static getInstance(): ContentQualityGate {
    if (!ContentQualityGate.instance) {
      ContentQualityGate.instance = new ContentQualityGate();
    }
    return ContentQualityGate.instance;
  }

  /**
   * Run content generation with a quality gate retry loop.
   *
   * Flow:
   *  Round 1: Advanced Social AI — best semantic quality.
   *  Rounds 2+: Template/Python AI with rotated objective (wider search space).
   *  If best score ≥ threshold → winner found, archive and return.
   *  After MAX_ROUNDS the best found is used IFF it ≥ VEO_PRESSURE_FLOOR,
   *  otherwise null is returned so the caller can skip posting.
   *  All attempts are stored in Pocket Dimension for training feedback.
   */
  async run(
    userId: string,
    baseContext: Partial<ContentContext>,
    overrideThreshold?: number
  ): Promise<QualityGateResult | null> {
    const threshold = overrideThreshold ?? (await this.getUserThreshold(userId));

    const rejectedVariants: ContentVariant[] = [];
    let allTriedVariants: ContentVariant[] = [];
    let passedOnAttempt = 0;
    let winner: ContentVariant | null = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      let variants: ContentVariant[];

      if (round === 1) {
        // ── Round 1: Advanced Social AI ──────────────────────────────────────
        try {
          const advResult = await contentQualityPipeline.generateWithAdvancedAI(
            userId,
            { ...baseContext, objective: baseContext.objective || 'engagement' },
            VARIANTS_PER_ROUND
          );
          variants = advResult.variants;
          logger.info(
            `[QualityGate] user=${userId} round 1/${MAX_ROUNDS} [AdvancedAI] ` +
            `— generated ${variants.length} variants, ` +
            `best=${variants[0]?.scores.overall.toFixed(1) ?? 'N/A'}`
          );
        } catch (err) {
          logger.warn({ err: err }, '[QualityGate] AdvancedAI round failed, falling back to template:');
          const res = await contentQualityPipeline.generateAndSelect(
            userId,
            { ...baseContext, objective: this.rotateObjective(baseContext.objective, round) },
            VARIANTS_PER_ROUND,
            threshold
          );
          variants = res.variants;
        }
      } else {
        // ── Rounds 2+: Template / Python AI with rotated objective ────────────
        const variantCount = VARIANTS_PER_ROUND + round;   // more variants each retry
        const res = await contentQualityPipeline.generateAndSelect(
          userId,
          { ...baseContext, objective: this.rotateObjective(baseContext.objective, round) },
          variantCount,
          threshold
        );
        variants = res.variants;
      }

      allTriedVariants = allTriedVariants.concat(variants);

      const candidate = variants[0];

      if (candidate && candidate.scores.overall >= threshold) {
        winner = candidate;
        passedOnAttempt = round;
        rejectedVariants.push(...variants.slice(1));
        logger.info(
          `[QualityGate] user=${userId} PASSED round ${round}/${MAX_ROUNDS} ` +
          `— score=${candidate.scores.overall.toFixed(1)} threshold=${threshold}`
        );
        break;
      }

      rejectedVariants.push(...variants);
      logger.info(
        `[QualityGate] user=${userId} round ${round}/${MAX_ROUNDS} ` +
        `— best score=${candidate?.scores.overall.toFixed(1) ?? 'N/A'} ` +
        `below threshold=${threshold}, A/B testing next round...`
      );
    }

    if (!winner) {
      const best = allTriedVariants.sort((a, b) => b.scores.overall - a.scores.overall)[0];

      const pressureFloor = VEO_PRESSURE_FLOOR();
      if (!best || best.scores.overall < pressureFloor) {
        logger.warn(
          `[QualityGate] user=${userId} exhausted ${MAX_ROUNDS} rounds — ` +
          `best score ${best?.scores.overall.toFixed(1) ?? 'N/A'} is below ` +
          `VEO_PRESSURE_FLOOR (${pressureFloor}). Content rejected to protect quality.`
        );
        return null;
      }

      winner = best;
      passedOnAttempt = MAX_ROUNDS;
      logger.warn(
        `[QualityGate] user=${userId} exhausted ${MAX_ROUNDS} rounds — ` +
        `using best available: score=${winner.scores.overall.toFixed(1)} ` +
        `(above pressure floor ${pressureFloor}, below threshold ${threshold})`
      );
    }

    const storedKey = await this.archiveToStorage(userId, {
      winner,
      threshold,
      passedOnAttempt,
      totalVariantsTried: allTriedVariants.length,
      rejectedVariants,
    });

    return {
      winner,
      passedOnAttempt,
      totalVariantsTried: allTriedVariants.length,
      rejectedVariants,
      thresholdUsed: threshold,
      storedKey,
    };
  }

  private async getUserThreshold(userId: string): Promise<number> {
    // 1. PDIM first — holds the live adaptive value updated by engagement feedback
    try {
      if (isPdimConfigured()) {
        const pdim = getPdimClient();
        const pdimVal = await pdim.get(`mbs:quality:threshold:${userId}`);
        if (pdimVal !== null) {
          const parsed = parseFloat(pdimVal);
          if (!isNaN(parsed) && parsed >= VEO_PRESSURE_FLOOR()) {
            return parsed;
          }
        }
      }
    } catch (e: any) {
      logger.debug(`[QualityGate] PDIM threshold read failed (non-fatal): ${e.message}`);
    }

    // 2. DB fallback — user-configured threshold
    try {
      const [prefs] = await db
        .select({ contentQualityThreshold: autopilotPreferences.contentQualityThreshold })
        .from(autopilotPreferences)
        .where(eq(autopilotPreferences.userId, userId))
        .limit(1);
      const stored = prefs?.contentQualityThreshold ?? DEFAULT_THRESHOLD();
      return Math.max(stored, DEFAULT_THRESHOLD());
    } catch {
      return DEFAULT_THRESHOLD();
    }
  }

  /**
   * Record real engagement outcome for a published post.
   *
   * Adapts the per-user quality threshold stored in PDIM using platform-specific
   * engagement benchmarks — because each platform has its own engagement economy:
   *
   *   Platform   │ Avg rate │ High trigger │ Low trigger │ Why
   *   ───────────┼──────────┼──────────────┼─────────────┼────────────────────────────
   *   Twitter/X  │ 0.5–1 %  │    ≥ 2 %     │   < 0.5 %   │ Follow-based, noisy feed
   *   Instagram  │ 1–3 %    │    ≥ 5 %     │   < 1 %     │ Mixed algo + follow
   *   TikTok     │ 5–9 %    │    ≥ 8 %     │   < 3 %     │ FYP exposes to strangers
   *   LinkedIn   │ 2–5 %    │    ≥ 4 %     │   < 1 %     │ Professional, lower volume
   *   Facebook   │ 0.5–1 %  │    ≥ 2 %     │   < 0.5 %   │ Heavily pay-to-play
   *   Threads    │ 1–3 %    │    ≥ 3 %     │   < 1 %     │ New, algo still maturing
   *   YouTube    │ 1–3 %    │    ≥ 4 %     │   < 1 %     │ Long-form, lower rate
   *
   * High engagement → raise threshold 1 pt (ceiling 95) — content is punching above its weight
   * Low engagement  → lower threshold 1 pt (floor 73)   — relax before the gate over-rejects
   * Neutral zone    → no change — normal performance, no signal either way
   *
   * Also pushes a training feedback signal to MaxCore + PDIM queue so the
   * inference model learns what actually resonated on each platform.
   */

  private getPlatformEngagementBenchmarks(platform: string): { high: number; low: number } {
    const p = platform.toLowerCase().replace(/[^a-z]/g, '');
    const benchmarks: Record<string, { high: number; low: number }> = {
      twitter:   { high: 2.0, low: 0.5 },
      x:         { high: 2.0, low: 0.5 },
      instagram: { high: 5.0, low: 1.0 },
      tiktok:    { high: 8.0, low: 3.0 },
      linkedin:  { high: 4.0, low: 1.0 },
      facebook:  { high: 2.0, low: 0.5 },
      threads:   { high: 3.0, low: 1.0 },
      youtube:   { high: 4.0, low: 1.0 },
    };
    return benchmarks[p] ?? { high: 5.0, low: 2.0 };
  }

  async recordEngagementOutcome(
    userId: string,
    platform: string,
    contentType: string,
    hookType: string,
    engagementRate: number,
    qualityScore: number
  ): Promise<void> {
    try {
      const { high, low } = this.getPlatformEngagementBenchmarks(platform);
      const currentThreshold = await this.getUserThreshold(userId);
      let newThreshold = currentThreshold;

      if (engagementRate >= high) {
        // Punching above the platform's norm → raise the bar by 1 point (max 95)
        newThreshold = Math.min(95, currentThreshold + 1);
      } else if (engagementRate < low) {
        // Below the platform's floor → relax by 1 point (floor = calibrated pressure floor)
        newThreshold = Math.max(VEO_PRESSURE_FLOOR(), currentThreshold - 1);
      }

      if (newThreshold !== currentThreshold && isPdimConfigured()) {
        const pdim = getPdimClient();
        await pdim.set(
          `mbs:quality:threshold:${userId}`,
          String(newThreshold),
          'EX',
          60 * 60 * 24 * 30   // 30-day TTL — persists across restarts
        );
        logger.info(
          `[QualityGate] Threshold adapted for user ${userId} on ${platform}: ` +
          `${currentThreshold} → ${newThreshold} ` +
          `(engagement=${engagementRate.toFixed(2)}% vs high=${high}%/low=${low}%, ` +
          `qualityScore=${qualityScore.toFixed(1)})`
        );
      }

      // Push training signal to MaxCore + PDIM training queue
      const isHigh = engagementRate >= high;
      const isLow  = engagementRate < low;
      const curriculum = isHigh ? 'reinforce_winner' : isLow ? 'improve_weak' : 'neutral';

      await pushTrainingFeedback({
        content:         `${contentType} post on ${platform}`,
        source:          'quality_gate_outcome',
        trigger:         isHigh ? 'high_engagement' : isLow ? 'low_engagement' : 'normal',
        engagement_rate: engagementRate,
        platform,
        content_type:    contentType,
        hook_type:       hookType,
        media_type:      'text',
        curriculum_hint: curriculum,
        dispatched_at:   new Date().toISOString(),
      });
    } catch (e: any) {
      logger.warn(`[QualityGate] recordEngagementOutcome failed (non-fatal): ${e.message}`);
    }
  }

  /**
   * Score already-generated content and gate it.
   * Used by the trained-model path which produces content itself —
   * runs the content through the Veo-calibrated pipeline scorer,
   * and if it fails, falls through to the full A/B retry gate.
   *
   * Returns null only when nothing clears VEO_PRESSURE_FLOOR.
   */
  async scoreAndGateExisting(
    userId: string,
    existingContent: string,
    platform: string,
    baseContext: Partial<ContentContext>
  ): Promise<QualityGateResult | null> {
    const threshold = await this.getUserThreshold(userId);
    const context   = await contentQualityPipeline.buildContext(userId, {
      ...baseContext,
      platform,
    });

    const platformOpt = contentQualityPipeline.validatePlatformConstraints(
      existingContent,
      [],
      platform
    );
    const scores = contentQualityPipeline.scoreContent(
      existingContent,
      existingContent.split('\n')[0] || existingContent.substring(0, 80),
      '',
      context,
      platformOpt
    );

    if (scores.overall >= threshold) {
      logger.info(
        `[QualityGate] Trained-model content passed gate — score=${scores.overall.toFixed(1)} threshold=${threshold} platform=${platform}`
      );
      // Wrap in a synthetic QualityGateResult so callers have a uniform interface
      return {
        winner: {
          id:                  `trained_model_${Date.now()}`,
          content:             existingContent,
          headline:            existingContent.split('\n')[0] || '',
          hashtags:            [],
          callToAction:        '',
          scores,
          platformOptimizations: platformOpt,
        },
        passedOnAttempt:    0,
        totalVariantsTried: 1,
        rejectedVariants:   [],
        thresholdUsed:      threshold,
        storedKey:          null,
      };
    }

    logger.info(
      `[QualityGate] Trained-model content scored ${scores.overall.toFixed(1)} < threshold ${threshold} ` +
      `— handing off to A/B gate for ${platform}`
    );
    // Content didn't clear the bar — run the full A/B generation gate
    return this.run(userId, baseContext, threshold);
  }

  /**
   * Rotate objective on retry rounds to force different generation strategies.
   * This is the A/B testing driver — each round tries a different optimization angle.
   */
  private rotateObjective(
    base: string | undefined,
    round: number
  ): 'awareness' | 'engagement' | 'conversions' | 'viral' {
    const rotation: Array<'awareness' | 'engagement' | 'conversions' | 'viral'> = [
      'engagement',
      'viral',
      'awareness',
      'conversions',
      'engagement',
      'viral',
      'awareness',
      'conversions',
      'engagement',
    ];
    if (round === 1 && base) return base as any;
    return rotation[(round - 1) % rotation.length];
  }

  /**
   * Archive the full quality gate session to Pocket Dimension.
   * Stored under the `quality-gate` namespace so it doesn't pollute user files.
   * These records feed back into model training.
   */
  private async archiveToStorage(
    userId: string,
    data: {
      winner: ContentVariant;
      threshold: number;
      passedOnAttempt: number;
      totalVariantsTried: number;
      rejectedVariants: ContentVariant[];
    }
  ): Promise<string | null> {
    try {
      const pocket = await pocketManager.openPocket('content-quality-gate', {
        compressionLevel: 9,
        enableDeduplication: true,
      });

      const key = `${userId}/${Date.now()}.json`;
      await pocket.write(
        key,
        JSON.stringify({
          userId,
          timestamp: new Date().toISOString(),
          threshold: data.threshold,
          passedOnAttempt: data.passedOnAttempt,
          totalVariantsTried: data.totalVariantsTried,
          winner: {
            id: data.winner.id,
            headline: data.winner.headline,
            scores: data.winner.scores,
          },
          rejected: data.rejectedVariants.map(v => ({
            id: v.id,
            headline: v.headline,
            scores: v.scores,
          })),
        })
      );

      logger.info(`[QualityGate] Archived session to Pocket Dimension: quality-gate/${key}`);
      return `quality-gate/${key}`;
    } catch (err) {
      logger.warn({ err: err }, '[QualityGate] Pocket Dimension archive failed (non-fatal):');
      return null;
    }
  }
}

export const contentQualityGate = ContentQualityGate.getInstance();
