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

export interface QualityGateResult {
  winner: ContentVariant;
  passedOnAttempt: number;
  totalVariantsTried: number;
  rejectedVariants: ContentVariant[];
  thresholdUsed: number;
  storedKey: string | null;
}

const DEFAULT_THRESHOLD    = 81;   // 90% of Veo's ~90 baseline score
const VEO_PRESSURE_FLOOR   = 73;   // absolute minimum — never publish below this
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
          logger.warn('[QualityGate] AdvancedAI round failed, falling back to template:', err);
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

      if (!best || best.scores.overall < VEO_PRESSURE_FLOOR) {
        logger.warn(
          `[QualityGate] user=${userId} exhausted ${MAX_ROUNDS} rounds — ` +
          `best score ${best?.scores.overall.toFixed(1) ?? 'N/A'} is below ` +
          `VEO_PRESSURE_FLOOR (${VEO_PRESSURE_FLOOR}). Content rejected to protect quality.`
        );
        return null;
      }

      winner = best;
      passedOnAttempt = MAX_ROUNDS;
      logger.warn(
        `[QualityGate] user=${userId} exhausted ${MAX_ROUNDS} rounds — ` +
        `using best available: score=${winner.scores.overall.toFixed(1)} ` +
        `(above pressure floor ${VEO_PRESSURE_FLOOR}, below threshold ${threshold})`
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
    try {
      const [prefs] = await db
        .select({ contentQualityThreshold: autopilotPreferences.contentQualityThreshold })
        .from(autopilotPreferences)
        .where(eq(autopilotPreferences.userId, userId))
        .limit(1);
      const stored = prefs?.contentQualityThreshold ?? DEFAULT_THRESHOLD;
      return Math.max(stored, DEFAULT_THRESHOLD);
    } catch {
      return DEFAULT_THRESHOLD;
    }
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
      logger.warn('[QualityGate] Pocket Dimension archive failed (non-fatal):', err);
      return null;
    }
  }
}

export const contentQualityGate = ContentQualityGate.getInstance();
