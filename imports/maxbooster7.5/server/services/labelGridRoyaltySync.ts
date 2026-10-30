import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { releases, royaltySplits, royaltyTransactions } from "@shared/schema";
import { labelGridService } from "./labelgrid-service.js";
import { logger } from "../logger.js";

/**
 * Closes the gap between LabelGrid's real distribution analytics and the
 * royaltyTransactions ledger that /api/royalties/* already reads from.
 *
 * Every release that has actually been submitted to LabelGrid carries
 * metadata.labelGridReleaseId (set in server/routes/distribution.ts once
 * LabelGrid confirms release creation). For each such release this job
 * calls labelGridService.getReleaseAnalytics(), which is backed by two real
 * LabelGrid endpoints (/analytics/summary for streams, /royalties/breakdown
 * for revenue — see labelgrid-service.ts for the full contract), and
 * reflects the current totals into royaltyTransactions.
 *
 * getReleaseAnalytics's totalRevenue/totalStreams are a ROLLING 30-day
 * window recomputed fresh on every call — not a lifetime cumulative delta.
 * Appending a new row per sync would double/N-times count the same
 * underlying revenue for ~30 days, so this job UPSERTS a single row per
 * (releaseId, userId, platform="labelgrid", transactionType="streaming")
 * instead, always overwritten with the latest true snapshot.
 *
 * Revenue is distributed across the release's real royaltySplits rows by
 * percentage when they exist, else 100% to the release owner — mirroring
 * the established split-resolution pattern in marketplaceService.ts.
 *
 * platforms stays {} on the LabelGrid response by design (see
 * fetchLabelGridAnalytics's doc comment) — LabelGrid does not expose a
 * reliable per-DSP breakdown, so this job honestly labels the recorded
 * revenue "labelgrid" (the aggregator/source of record) rather than
 * fabricating a Spotify/Apple/etc. split that the API cannot support.
 */

const SYNC_PLATFORM = "labelgrid";
const SYNC_TRANSACTION_TYPE = "streaming";
const WINDOW_DAYS = 30;

export interface LabelGridRoyaltySyncResult {
  releasesConsidered: number;
  releasesSynced: number;
  releasesSkippedNoRevenue: number;
  releasesFailed: number;
}

type LinkedRelease = {
  id: string;
  userId: string;
  metadata: unknown;
};

/**
 * Writes (or corrects) the royaltyTransactions row(s) for one release's
 * current LabelGrid rolling-window totals. Returns true when a row was
 * inserted or updated, false when there was nothing to record and no
 * existing row needed correcting.
 */
async function syncReleaseRevenue(
  release: LinkedRelease,
  labelGridReleaseId: string,
  totalRevenue: number,
  totalStreams: number,
): Promise<boolean> {
  const safeRevenue = Number.isFinite(totalRevenue) && totalRevenue > 0 ? totalRevenue : 0;
  const safeStreams = Number.isFinite(totalStreams) && totalStreams > 0 ? totalStreams : 0;

  const now = new Date();
  const periodStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const splitRows = await db
    .select()
    .from(royaltySplits)
    .where(eq(royaltySplits.releaseId, release.id));

  const validSplits = splitRows.filter(
    (s) => !!s.userId && Number(s.percentage) > 0,
  );

  const effectiveSplits: { userId: string; percentage: number; splitId: string | null }[] =
    validSplits.length > 0
      ? validSplits.map((s) => ({
          userId: s.userId as string,
          percentage: Number(s.percentage),
          splitId: s.id,
        }))
      : [{ userId: release.userId, percentage: 100, splitId: null }];

  let wroteAnything = false;

  await db.transaction(async (tx) => {
    for (const split of effectiveSplits) {
      const share = split.percentage / 100;
      const amount = Math.round(safeRevenue * share * 100) / 100;
      const streamCount = Math.round(safeStreams * share);

      const metadata = {
        labelGridReleaseId,
        source: "labelgrid_release_analytics",
        windowDays: WINDOW_DAYS,
        syncedAt: now.toISOString(),
      };

      const [existing] = await tx
        .select({ id: royaltyTransactions.id })
        .from(royaltyTransactions)
        .where(
          and(
            eq(royaltyTransactions.releaseId, release.id),
            eq(royaltyTransactions.userId, split.userId),
            eq(royaltyTransactions.platform, SYNC_PLATFORM),
            eq(royaltyTransactions.transactionType, SYNC_TRANSACTION_TYPE),
          ),
        )
        .limit(1);

      if (existing) {
        // Always correct the existing row to the latest true snapshot, even
        // when the new figure is 0 — a rolling window can legitimately drop
        // back to 0 and a stale positive amount must not be left behind.
        await tx
          .update(royaltyTransactions)
          .set({
            amount,
            streamCount,
            periodStart,
            periodEnd: now,
            metadata,
          })
          .where(eq(royaltyTransactions.id, existing.id));
        wroteAnything = true;
      } else if (amount > 0 || streamCount > 0) {
        // Never insert a fresh zero-value row — avoids ledger clutter for
        // releases that have never had any real LabelGrid activity.
        await tx.insert(royaltyTransactions).values({
          splitId: split.splitId ?? randomUUID(),
          releaseId: release.id,
          userId: split.userId,
          amount,
          currency: "usd",
          transactionType: SYNC_TRANSACTION_TYPE,
          platform: SYNC_PLATFORM,
          periodStart,
          periodEnd: now,
          streamCount,
          // "pending" (not "completed") — this reflects recognized earnings
          // that have not gone through any payout/transfer flow yet. Money
          // is not disbursed to the artist as part of this sync.
          status: "pending",
          metadata,
        });
        wroteAnything = true;
      }
    }
  });

  return wroteAnything;
}

/**
 * Runs one full sync cycle across every LabelGrid-linked release.
 * Exported directly for tests/manual invocation; the scheduled service
 * below wraps it with cron timing and boot-time triggering.
 */
export async function runLabelGridRoyaltySync(): Promise<LabelGridRoyaltySyncResult> {
  const result: LabelGridRoyaltySyncResult = {
    releasesConsidered: 0,
    releasesSynced: 0,
    releasesSkippedNoRevenue: 0,
    releasesFailed: 0,
  };

  if (!labelGridService.isApiConfigured()) {
    logger.info(
      "[LabelGridRoyaltySync] Skipped — LabelGrid API is not configured. " +
        "Will not write simulated figures to the royalty ledger.",
    );
    return result;
  }

  let linkedReleases: LinkedRelease[];
  try {
    linkedReleases = await db
      .select({
        id: releases.id,
        userId: releases.userId,
        metadata: releases.metadata,
      })
      .from(releases)
      .where(sql`${releases.metadata} ->> 'labelGridReleaseId' IS NOT NULL`);
  } catch (error) {
    logger.warn(
      { err: error },
      "[LabelGridRoyaltySync] Failed to load LabelGrid-linked releases",
    );
    return result;
  }

  result.releasesConsidered = linkedReleases.length;

  for (const release of linkedReleases) {
    const labelGridReleaseId = (
      release.metadata as Record<string, unknown> | null
    )?.labelGridReleaseId as string | undefined;
    if (!labelGridReleaseId) continue;

    try {
      const analytics = await labelGridService.getReleaseAnalytics(
        labelGridReleaseId,
      );
      const synced = await syncReleaseRevenue(
        release,
        labelGridReleaseId,
        analytics.totalRevenue,
        analytics.totalStreams,
      );
      if (synced) {
        result.releasesSynced++;
      } else {
        result.releasesSkippedNoRevenue++;
      }
    } catch (error) {
      result.releasesFailed++;
      logger.warn(
        { err: error, releaseId: release.id, labelGridReleaseId },
        "[LabelGridRoyaltySync] Failed to sync release revenue",
      );
    }
  }

  logger.info(
    `[LabelGridRoyaltySync] Cycle complete — considered=${result.releasesConsidered} ` +
      `synced=${result.releasesSynced} skipped=${result.releasesSkippedNoRevenue} ` +
      `failed=${result.releasesFailed}`,
  );

  return result;
}

class LabelGridRoyaltySyncService {
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    // LabelGrid is a historical provider only. Keep the explicit
    // runLabelGridRoyaltySync export for an operator-authorized historical
    // reconciliation, but never contact the retired provider automatically at
    // application startup or on a timer. Too Lost cannot be substituted here:
    // its current sales response does not establish statement periods,
    // currencies per reconciled release, or payout receipts required by this
    // ledger writer.
    logger.info(
      "[LabelGridRoyaltySync] Automatic sync disabled — LabelGrid is a legacy provider; historical reconciliation is operator-only",
    );
  }
}

export const labelGridRoyaltySync = new LabelGridRoyaltySyncService();
