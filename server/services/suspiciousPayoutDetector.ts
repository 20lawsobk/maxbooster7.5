// @ts-nocheck
/**
 * Suspicious Payout Detector
 *
 * Before a royalty split is disbursed via Stripe Transfer, this service
 * evaluates the payout against the collaborator's 90-day history to detect
 * anomalous patterns that may indicate fraud or impending chargebacks:
 *
 *   • Single-payout spike  — payout > 10× the user's 90-day rolling average
 *   • Frequency spike      — ≥3 payouts in the last 24 hours for the same user
 *   • Large absolute value — single transfer > $2,000 with no prior history
 *
 * Returns { risk: "high" | "low" | "unknown", reason, score } synchronously
 * from DB. The caller (royaltySplitsDispatcher) decides whether to hold or
 * proceed — "unknown" means the check itself could not run (e.g. a DB
 * error) and must NOT be treated as a "low"/passed verdict: a broken
 * detector is not evidence a payout is safe, so the caller holds it the
 * same way it holds a "high" verdict, just with a distinguishable reason so
 * ops can tell "flagged as suspicious" apart from "we couldn't check".
 */

import { db } from "../db.js";
import { splitPayments } from "@shared/schema";
import { eq, gte, and, sql } from "drizzle-orm";
import { logger } from "../logger.js";

// ─── Thresholds ───────────────────────────────────────────────────────────────
const SPIKE_MULTIPLIER = 10; // flag if > 10× 90-day average
const FREQUENCY_WINDOW_HOURS = 24; // look-back window for frequency check
const FREQUENCY_MAX_PAYOUTS = 3; // max payouts per user per window
const LARGE_ABSOLUTE_CENTS = 200_000; // $2,000 with no prior history

export interface PayoutRiskResult {
  risk: "high" | "low" | "unknown";
  reason: string;
  score: number; // 0–100; higher = more suspicious. -1 when risk === "unknown".
  checks: {
    spikeCheck: boolean;
    frequencyCheck: boolean;
    absoluteCheck: boolean;
  };
}

export interface PayoutCheckParams {
  /** The collaborator receiving the transfer */
  collaboratorId: string;
  /** Amount of this proposed transfer in cents */
  amountCents: number;
}

export async function checkPayoutRisk(
  params: PayoutCheckParams,
): Promise<PayoutRiskResult> {
  const { collaboratorId, amountCents } = params;

  const checks = { spikeCheck: false, frequencyCheck: false, absoluteCheck: false };
  const reasons: string[] = [];
  let score = 0;

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - FREQUENCY_WINDOW_HOURS * 60 * 60 * 1000);

    // ── 1. Fetch 90-day history ──────────────────────────────────────────────
    const history = await db
      .select({ amountCents: splitPayments.amountCents, createdAt: splitPayments.createdAt })
      .from(splitPayments)
      .where(
        and(
          eq(splitPayments.collaboratorId, collaboratorId),
          eq(splitPayments.status, "transferred"),
          gte(splitPayments.createdAt, ninetyDaysAgo),
        ),
      );

    const totalHistorical = history.reduce((s, r) => s + Number(r.amountCents), 0);
    const avgPayout = history.length > 0 ? totalHistorical / (history.length || 1) : 0;

    // ── 2. Spike check ───────────────────────────────────────────────────────
    if (avgPayout > 0 && amountCents > avgPayout * SPIKE_MULTIPLIER) {
      checks.spikeCheck = true;
      reasons.push(
        `Payout ($${(amountCents / 100).toFixed(2)}) is ${(amountCents / avgPayout).toFixed(1)}× the 90-day average ($${(avgPayout / 100).toFixed(2)})`,
      );
      score += 50;
    }

    // ── 3. Absolute value with no history ────────────────────────────────────
    if (history.length === 0 && amountCents > LARGE_ABSOLUTE_CENTS) {
      checks.absoluteCheck = true;
      reasons.push(
        `First-ever payout of $${(amountCents / 100).toFixed(2)} exceeds the $${(LARGE_ABSOLUTE_CENTS / 100).toFixed(0)} new-account threshold`,
      );
      score += 40;
    }

    // ── 4. Frequency check ───────────────────────────────────────────────────
    const recentPayouts = history.filter(
      (r) => new Date(r.createdAt) >= twentyFourHoursAgo,
    );
    if (recentPayouts.length >= FREQUENCY_MAX_PAYOUTS) {
      checks.frequencyCheck = true;
      reasons.push(
        `${recentPayouts.length} payouts in the last ${FREQUENCY_WINDOW_HOURS}h (max ${FREQUENCY_MAX_PAYOUTS - 1})`,
      );
      score += 30;
    }

    const risk = score >= 40 ? "high" : "low";
    const reason =
      reasons.length > 0 ? reasons.join("; ") : "No anomalies detected";

    if (risk === "high") {
      logger.warn(
        { collaboratorId, amountCents, score, reason },
        "[SuspiciousPayoutDetector] High-risk payout flagged",
      );
    }

    return { risk, reason, score: Math.min(100, score), checks };
  } catch (err) {
    logger.error(
      { err, collaboratorId, amountCents },
      "[SuspiciousPayoutDetector] risk check failed — reporting unknown risk so the caller holds the payout instead of assuming it's safe",
    );
    // Fail closed: a broken detector is not evidence the payout is safe.
    // "unknown" is distinguishable from "low" so the caller can hold the
    // payout for review without falsely logging it as a confirmed high-risk
    // fraud flag.
    return {
      risk: "unknown",
      reason: `Risk check unavailable (${err instanceof Error ? err.message : String(err)}) — held pending manual review`,
      score: -1,
      checks,
    };
  }
}
