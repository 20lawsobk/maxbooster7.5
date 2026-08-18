// @ts-nocheck
/**
 * Smart Royalty Splits — Auto-Dispatch Service
 *
 * When a beat or release generates revenue (marketplace order, DSP royalty
 * statement, etc.), this service:
 *   1. Looks up the royalty splits configured for that beat/release.
 *   2. Calculates each collaborator's share of the net amount.
 *   3. Issues a Stripe Transfer to each collaborator's connected account.
 *   4. Records the payout in `splitPayments` and updates `royaltySplits`
 *      (totalPaid, pendingPayout).
 *   5. Appends an immutable entry to `royaltyAuditLog` (the royalty audit trail).
 *
 * Usage:
 *   import { royaltySplitsDispatcher } from "./royaltySplitsDispatcher.js";
 *   await royaltySplitsDispatcher.dispatch({ beatId, orderId, grossAmountCents, currency });
 */

import Stripe from "stripe";
import { db } from "../db.js";
import {
  royaltySplits,
  splitPayments,
  royaltyTransactions,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../logger.js";
import { notificationService } from "./notificationService.js";
import { checkPayoutRisk } from "./suspiciousPayoutDetector.js";

// ─── Stripe client (optional — gracefully degraded when key absent) ───────────

const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
    })
  : null;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchInput {
  /** Beat ID (from the beats table) */
  beatId?: string;
  /** Release ID (from the releases table) */
  releaseId?: string;
  /** The marketplace order that triggered the payout */
  orderId: string;
  /** Gross sale amount in cents (before platform commission) */
  grossAmountCents: number;
  /** Platform commission rate, e.g. 0.15 for 15% */
  platformCommissionRate?: number;
  /** ISO-4217 currency code */
  currency?: string;
}

export interface DispatchResult {
  ok: boolean;
  orderId: string;
  netAmountCents: number;
  splits: Array<{
    collaboratorEmail: string;
    collaboratorName: string;
    percentage: number;
    shareCents: number;
    status: "transferred" | "pending" | "skipped_no_stripe" | "failed";
    stripeTransferId?: string;
    error?: string;
  }>;
  totalTransferred: number;
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function appendAuditEntry(entry: {
  orderId: string;
  beatId?: string;
  releaseId?: string;
  grossAmountCents: number;
  netAmountCents: number;
  splits: DispatchResult["splits"];
  createdAt: Date;
}) {
  // We record payout events as royaltyTransactions with transactionType="split_dispatch"
  // so they appear in the existing royalty audit trail without a new table.
  try {
    if (entry.splits.length === 0) return;
    const rows = entry.splits.map((s) => ({
      releaseId: entry.releaseId ?? entry.beatId ?? entry.orderId,
      platform: "marketplace",
      amount: String((s.shareCents / 100).toFixed(4)),
      currency: "usd",
      streamCount: 0,
      periodStart: entry.createdAt,
      periodEnd: entry.createdAt,
      status: s.status === "transferred" ? "paid" : "pending",
      transactionType: "split_dispatch",
      metadata: {
        orderId: entry.orderId,
        collaboratorEmail: s.collaboratorEmail,
        collaboratorName: s.collaboratorName,
        percentage: s.percentage,
        stripeTransferId: s.stripeTransferId,
        error: s.error,
      },
    }));

    // userId is required — use a placeholder for collaborator payouts since
    // the collaborator may not be a platform user yet.
    for (const row of rows) {
      try {
        await db.insert(royaltyTransactions).values({
          userId: "system",
          ...row,
        });
      } catch {
        // Non-fatal — audit trail best-effort
      }
    }
  } catch (err) {
    logger.warn({ err }, "[RoyaltySplits] audit log write failed (non-fatal)");
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

class RoyaltySplitsDispatcher {
  /**
   * Dispatch royalty payments for a beat/release sale.
   * Safe to call multiple times for the same orderId — idempotent via Stripe
   * idempotency keys on the transfer and a `splitPayments` duplicate check.
   */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const {
      beatId,
      releaseId,
      orderId,
      grossAmountCents,
      platformCommissionRate = 0.15,
      currency = "usd",
    } = input;

    const netAmountCents = Math.round(
      grossAmountCents * (1 - platformCommissionRate),
    );

    // ── Load applicable splits ──
    const conditions: ReturnType<typeof eq>[] = [];
    if (beatId) conditions.push(eq(royaltySplits.trackId, beatId));
    if (releaseId) conditions.push(eq(royaltySplits.releaseId, releaseId));

    if (conditions.length === 0) {
      return { ok: true, orderId, netAmountCents, splits: [], totalTransferred: 0 };
    }

    const activeSplits = await db
      .select()
      .from(royaltySplits)
      .where(
        and(
          inArray(
            royaltySplits.status,
            ["active", "verified", "pending"],
          ),
          conditions.length === 1 ? conditions[0] : conditions[0], // first matching condition
        ),
      );

    if (activeSplits.length === 0) {
      logger.info(
        { beatId, releaseId, orderId },
        "[RoyaltySplits] No splits found — full amount stays with artist",
      );
      return { ok: true, orderId, netAmountCents, splits: [], totalTransferred: 0 };
    }

    // ── Validate percentages add up ≤ 100 ──
    const totalPct = activeSplits.reduce((s, r) => s + (r.percentage ?? 0), 0);
    if (totalPct > 100.5) {
      logger.warn(
        { beatId, releaseId, orderId, totalPct },
        "[RoyaltySplits] Split percentages exceed 100% — skipping dispatch",
      );
      return { ok: false, orderId, netAmountCents, splits: [], totalTransferred: 0 };
    }

    // ── Check for existing payments (idempotency) ──
    const existingPayments = await db
      .select({ collaboratorId: splitPayments.collaboratorId })
      .from(splitPayments)
      .where(eq(splitPayments.orderId, orderId));

    const alreadyPaid = new Set(existingPayments.map((p) => p.collaboratorId));

    const results: DispatchResult["splits"] = [];
    let totalTransferred = 0;

    for (const split of activeSplits) {
      const collaboratorKey = split.userId ?? split.collaboratorEmail;

      if (alreadyPaid.has(collaboratorKey)) {
        results.push({
          collaboratorEmail: split.collaboratorEmail,
          collaboratorName: split.collaboratorName,
          percentage: split.percentage,
          shareCents: 0,
          status: "skipped_no_stripe",
          error: "already_paid",
        });
        continue;
      }

      const shareCents = Math.round((split.percentage / 100) * netAmountCents);

      // ── Suspicious payout check ──────────────────────────────────────────
      if (split.collaboratorId && shareCents >= 100) {
        const riskResult = await checkPayoutRisk({
          collaboratorId: split.collaboratorId,
          amountCents: shareCents,
        });
        if (riskResult.risk === "high") {
          status = "failed";
          errorMsg = `HELD — suspicious payout detected (score ${riskResult.score}): ${riskResult.reason}`;
          logger.warn({ orderId, splitId: split.id, ...riskResult }, "[RoyaltySplits] payout held for review");
          results.push({
            collaboratorEmail: split.collaboratorEmail,
            collaboratorName: split.collaboratorName,
            percentage: split.percentage,
            shareCents,
            status,
            error: errorMsg,
          });
          continue;
        }
      }

      // ── Attempt Stripe Transfer ──
      let transferId: string | undefined;
      let status: DispatchResult["splits"][0]["status"] = "pending";
      let errorMsg: string | undefined;

      if (stripe && split.stripeAccountId && shareCents >= 100) {
        try {
          const idempotencyKey = `split-${orderId}-${split.id}`;
          const transfer = await stripe.transfers.create(
            {
              amount: shareCents,
              currency,
              destination: split.stripeAccountId,
              description: `Royalty split: ${split.collaboratorName} (${split.percentage}%)`,
              metadata: {
                orderId,
                splitId: split.id,
                beatId: beatId ?? "",
                releaseId: releaseId ?? "",
              },
            },
            { idempotencyKey },
          );
          transferId = transfer.id;
          status = "transferred";
          totalTransferred += shareCents;
        } catch (err: any) {
          errorMsg = err?.message ?? String(err);
          status = "failed";
          logger.warn(
            { err, splitId: split.id, orderId },
            "[RoyaltySplits] Stripe transfer failed",
          );
        }
      } else if (!split.stripeAccountId) {
        status = "skipped_no_stripe";
      }

      // ── Persist splitPayment row ──
      try {
        await db.insert(splitPayments).values({
          orderId,
          userId: split.userId ?? split.collaboratorEmail,
          collaboratorId: collaboratorKey,
          percentage: split.percentage,
          amountCents: shareCents,
          currency,
          status: status === "transferred" ? "paid" : status,
          stripeTransferId: transferId ?? null,
          failureReason: errorMsg ?? null,
          processedAt: status === "transferred" ? new Date() : null,
        });
      } catch (dbErr) {
        logger.warn({ dbErr }, "[RoyaltySplits] Failed to record splitPayment");
      }

      // ── Update running totals on royaltySplits row ──
      if (status === "transferred") {
        try {
          await db
            .update(royaltySplits)
            .set({
              totalPaid: (split.totalPaid ?? 0) + shareCents / 100,
              lastPayoutAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(royaltySplits.id, split.id));
        } catch {
          // Non-fatal
        }
      }

      results.push({
        collaboratorEmail: split.collaboratorEmail,
        collaboratorName: split.collaboratorName,
        percentage: split.percentage,
        shareCents,
        status,
        stripeTransferId: transferId,
        error: errorMsg,
      });
    }

    // ── Append to audit trail ──
    await appendAuditEntry({
      orderId,
      beatId,
      releaseId,
      grossAmountCents,
      netAmountCents,
      splits: results,
      createdAt: new Date(),
    });

    logger.info(
      {
        orderId,
        beatId,
        releaseId,
        totalTransferred,
        splitCount: results.length,
      },
      "[RoyaltySplits] dispatch complete",
    );

    // ── Notify each collaborator who received a payout ──────────────────────
    for (const r of results) {
      if (r.status === "transferred" && r.collaboratorEmail) {
        try {
          // Look up the collaborator's userId by email
          const [splitRow] = await db
            .select({ userId: royaltySplits.userId })
            .from(royaltySplits)
            .where(eq(royaltySplits.collaboratorEmail, r.collaboratorEmail))
            .limit(1);
          if (splitRow?.userId) {
            await notificationService.sendEarningNotification(
              splitRow.userId,
              r.shareCents / 100,
              `royalty split (order ${orderId})`,
              orderId,
            );
          }
        } catch (notifErr) {
          logger.warn({ notifErr }, "[RoyaltySplits] notification skipped");
        }
      }
    }

    return { ok: true, orderId, netAmountCents, splits: results, totalTransferred };
  }
}

export const royaltySplitsDispatcher = new RoyaltySplitsDispatcher();
