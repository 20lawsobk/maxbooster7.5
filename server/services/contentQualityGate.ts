/**
 * CONTENT QUALITY GATE
 *
 * Sits between the auto-generator and the auto-poster.
 * Keeps regenerating with A/B testing batches until the best variant
 * meets the user's quality threshold, then hands the winner off for posting.
 * Every attempt (pass and fail) is archived in Pocket Dimension.
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

const DEFAULT_THRESHOLD = 90;
const MAX_ROUNDS = 8;
const VARIANTS_PER_ROUND = 5;

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
   *  Round 1: generate VARIANTS_PER_ROUND variants normally.
   *  If best score < threshold → Round 2+ uses higher variant count (A/B mode)
   *  with a fresh context strategy rotation to avoid repeating the same output.
   *  After MAX_ROUNDS the best found is used regardless, so posting is never
   *  blocked forever.
   *  All attempts are stored in Pocket Dimension for training feedback.
   */
  async run(
    userId: string,
    baseContext: Partial<ContentContext>,
    overrideThreshold?: number
  ): Promise<QualityGateResult> {
    const threshold = overrideThreshold ?? (await this.getUserThreshold(userId));

    const rejectedVariants: ContentVariant[] = [];
    let allTriedVariants: ContentVariant[] = [];
    let passedOnAttempt = 0;
    let winner: ContentVariant | null = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const variantCount = round === 1 ? VARIANTS_PER_ROUND : VARIANTS_PER_ROUND + round;

      const { variants, context } = await contentQualityPipeline.generateAndSelect(
        userId,
        { ...baseContext, objective: this.rotateObjective(baseContext.objective, round) },
        variantCount,
        threshold
      );

      allTriedVariants = allTriedVariants.concat(variants);

      const candidate = variants[0];

      if (candidate && candidate.scores.overall >= threshold) {
        winner = candidate;
        passedOnAttempt = round;
        const roundRejected = variants.slice(1);
        rejectedVariants.push(...roundRejected);
        logger.info(
          `[QualityGate] user=${userId} PASSED round ${round}/${MAX_ROUNDS} — score=${candidate.scores.overall.toFixed(1)} threshold=${threshold}`
        );
        break;
      }

      rejectedVariants.push(...variants);
      logger.info(
        `[QualityGate] user=${userId} round ${round}/${MAX_ROUNDS} — best score=${candidate?.scores.overall.toFixed(1) ?? 'N/A'} below threshold=${threshold}, retrying with A/B variants...`
      );
    }

    if (!winner) {
      winner = allTriedVariants.sort((a, b) => b.scores.overall - a.scores.overall)[0];
      passedOnAttempt = MAX_ROUNDS;
      logger.warn(
        `[QualityGate] user=${userId} exhausted ${MAX_ROUNDS} rounds — using best found: score=${winner?.scores.overall.toFixed(1) ?? 'N/A'}`
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
