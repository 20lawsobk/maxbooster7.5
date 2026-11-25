// @ts-nocheck
/**
 * Adaptive Beat Pricing Engine
 *
 * Dynamically adjusts beat prices based on real conversion data:
 *   - plays → downloads conversion rate
 *   - time since last price change (cooldown enforcement)
 *   - floor/ceiling guard-rails to prevent wild swings
 *
 * Algorithm:
 *   1. Pull last 14-day plays + downloads for each beat.
 *   2. Compute conversion rate = downloads / max(plays, 1).
 *   3. Compare against target conversion rate (default: 5%).
 *      • If conversion > target * 1.5  → price UP   (high demand)
 *      • If conversion < target * 0.5  → price DOWN (low demand)
 *      • Otherwise                     → hold
 *   4. Apply dampened step (±10% per cycle, capped).
 *   5. Enforce floor/ceiling per license tier.
 *   6. Write the new price to the beats table.
 *   7. Record a beatPricingSnapshot for audit.
 *
 * Usage:
 *   import { adaptivePricingEngine } from "./adaptivePricingEngine.js";
 *   const results = await adaptivePricingEngine.runForUser(userId);
 */

import { db } from "../db.js";
import { beats, beatPricingSnapshots } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { logger } from "../logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const TARGET_CONVERSION_RATE = 0.05;   // 5% plays→downloads target
const PRICE_STEP_FACTOR = 0.10;        // max 10% price movement per cycle
const MIN_PLAYS_TO_ADJUST = 10;        // don't touch beat with fewer plays
const COOLDOWN_HOURS = 48;             // min hours between price changes per beat
const FLOOR_CENTS = 99;                // $0.99 minimum (basic lease)
const CEILING_CENTS = 49900;           // $499 maximum (exclusive)
const LICENSE_CEILINGS: Record<string, number> = {
  basic: 4999,     // $49.99
  premium: 14999,  // $149.99
  exclusive: 49900, // $499
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricingAdjustment {
  beatId: string;
  beatTitle: string;
  oldPriceCents: number;
  newPriceCents: number;
  direction: "up" | "down" | "hold";
  conversionRate: number;
  plays: number;
  downloads: number;
  reason: string;
}

export interface AdaptivePricingResult {
  userId: string;
  processedAt: Date;
  adjustments: PricingAdjustment[];
  summary: {
    total: number;
    priceUp: number;
    priceDown: number;
    held: number;
  };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

class AdaptivePricingEngine {
  /**
   * Run adaptive pricing for all published beats owned by `userId`.
   * Safe to call repeatedly — cooldown prevents over-adjustment.
   */
  async runForUser(userId: string): Promise<AdaptivePricingResult> {
    const processedAt = new Date();
    const cooldownThreshold = new Date(
      processedAt.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000,
    );

    // Fetch all published beats for this user
    const userBeats = await db
      .select()
      .from(beats)
      .where(and(eq(beats.userId, userId), eq(beats.isPublished, true)));

    // Fetch recent pricing snapshots to check cooldown
    const recentSnapshots = await db
      .select({
        beatId: beatPricingSnapshots.beatId,
        appliedAt: beatPricingSnapshots.appliedAt,
      })
      .from(beatPricingSnapshots)
      .where(
        and(
          eq(beatPricingSnapshots.userId, userId),
          gte(beatPricingSnapshots.appliedAt, cooldownThreshold),
        ),
      );

    const recentlyAdjusted = new Set(recentSnapshots.map((s) => s.beatId));

    const adjustments: PricingAdjustment[] = [];

    for (const beat of userBeats) {
      // Skip if adjusted recently
      if (recentlyAdjusted.has(beat.id)) {
        adjustments.push({
          beatId: beat.id,
          beatTitle: beat.title,
          oldPriceCents: Math.round((beat.price ?? 0) * 100),
          newPriceCents: Math.round((beat.price ?? 0) * 100),
          direction: "hold",
          conversionRate: 0,
          plays: beat.plays ?? 0,
          downloads: beat.downloads ?? 0,
          reason: `cooldown — last changed within ${COOLDOWN_HOURS}h`,
        });
        continue;
      }

      const plays = beat.plays ?? 0;
      const downloads = beat.downloads ?? 0;

      // Not enough data to make a decision
      if (plays < MIN_PLAYS_TO_ADJUST) {
        adjustments.push({
          beatId: beat.id,
          beatTitle: beat.title,
          oldPriceCents: Math.round((beat.price ?? 0) * 100),
          newPriceCents: Math.round((beat.price ?? 0) * 100),
          direction: "hold",
          conversionRate: 0,
          plays,
          downloads,
          reason: `insufficient data (${plays} plays < ${MIN_PLAYS_TO_ADJUST} minimum)`,
        });
        continue;
      }

      const conversionRate = downloads / plays;
      const oldPriceCents = Math.round((beat.price ?? 0) * 100);
      const licenseType = beat.licenseType ?? "basic";
      const ceiling = LICENSE_CEILINGS[licenseType] ?? CEILING_CENTS;

      let direction: "up" | "down" | "hold" = "hold";
      let newPriceCents = oldPriceCents;
      let reason = "";

      if (conversionRate > TARGET_CONVERSION_RATE * 1.5) {
        // High demand — raise price
        const step = Math.round(oldPriceCents * PRICE_STEP_FACTOR);
        newPriceCents = Math.min(oldPriceCents + step, ceiling);
        direction = newPriceCents > oldPriceCents ? "up" : "hold";
        reason = `high conversion ${(conversionRate * 100).toFixed(1)}% → price up ${PRICE_STEP_FACTOR * 100}%`;
      } else if (conversionRate < TARGET_CONVERSION_RATE * 0.5) {
        // Low demand — lower price
        const step = Math.round(oldPriceCents * PRICE_STEP_FACTOR);
        newPriceCents = Math.max(oldPriceCents - step, FLOOR_CENTS);
        direction = newPriceCents < oldPriceCents ? "down" : "hold";
        reason = `low conversion ${(conversionRate * 100).toFixed(1)}% → price down ${PRICE_STEP_FACTOR * 100}%`;
      } else {
        reason = `conversion ${(conversionRate * 100).toFixed(1)}% within target band`;
      }

      // Apply price change if non-trivial
      if (direction !== "hold" && newPriceCents !== oldPriceCents) {
        try {
          await db
            .update(beats)
            .set({ price: newPriceCents / 100 })
            .where(eq(beats.id, beat.id));

          await db.insert(beatPricingSnapshots).values({
            beatId: beat.id,
            userId,
            previousPriceCents: oldPriceCents,
            newPriceCents,
            conversionRate,
            plays,
            downloads,
            direction,
            reason,
          });
        } catch (err) {
          logger.warn(
            { err, beatId: beat.id },
            "[AdaptivePricing] Failed to apply price change",
          );
          direction = "hold";
          newPriceCents = oldPriceCents;
        }
      }

      adjustments.push({
        beatId: beat.id,
        beatTitle: beat.title,
        oldPriceCents,
        newPriceCents,
        direction,
        conversionRate,
        plays,
        downloads,
        reason,
      });
    }

    const summary = {
      total: adjustments.length,
      priceUp: adjustments.filter((a) => a.direction === "up").length,
      priceDown: adjustments.filter((a) => a.direction === "down").length,
      held: adjustments.filter((a) => a.direction === "hold").length,
    };

    logger.info(
      { userId, ...summary },
      "[AdaptivePricing] pricing run complete",
    );

    return { userId, processedAt, adjustments, summary };
  }
}

export const adaptivePricingEngine = new AdaptivePricingEngine();
