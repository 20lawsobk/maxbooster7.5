/**
 * Beat Money Loop Service
 * =======================
 * Admin-only autonomous revenue loop:
 *   1. SCAN   — pull live music-industry context (trending genre / mood / tempo)
 *               from musicIndustryContextFilter (which is fed by industryMonitorService).
 *   2. GENERATE — request a beat WAV from the INTERNAL MaxCore subsystem ONLY
 *               (Mode C: AI from 8 TB dataset, then Mode B: HD DSP). There is
 *               NO local fallback — if MaxCore is unreachable the cycle fails
 *               explicitly. The scan context is forwarded so generation is
 *               biased toward what's trending.
 *   3. PRICE  — compute competitive price = median(recent published beats in
 *               same genre) × 0.95 (5 % undercut). Falls back to $29.99.
 *   4. UPLOAD — insert a row into `beats` (admin-owned, published) and upload
 *               the WAV bytes to PDIM via storageService.uploadFile.
 *   5. PROMOTE — generate and dispatch an organic social campaign for the
 *               marketplace listing (zero paid-ad budget).
 *   6. WAIT FOR SALE — social promotion points buyers to the marketplace;
 *               only a completed marketplace order marks the beat sold.
 *   7. RECORD — track listing, promotion outcome and verified sale state.
 *   8. ANALYSE — next cadence is computed from current industry confidence
 *               and recent cycle outcomes (consecutive failures back off).
 *
 * Heartbeat: the scheduler ticks every 30 min and calls `tick()`. A new cycle
 * runs only when (enabled && now ≥ state.nextRunAt). Adaptive cadence is
 * bounded to [1 h, 24 h].
 *
 * Admin gating: resolved at startup by querying users WHERE role='admin' AND
 * email=ADMIN_EMAIL. Cached in memory; the loop disables itself if no match is
 * found so a re-created admin account is picked up on next restart.
 *
 * Paused by default — operator flips `enabled=true` via POST /api/admin/beat-money-loop/enable.
 */

import { db, pool } from "../db.js";
import type { PoolClient } from "@neondatabase/serverless";
import {
  beats,
  listings,
  orders,
  commerceSources,
  commerceAllocations,
  beatMoneyLoopState,
  beatMoneyLoopCycles,
  adCampaigns,
  adCreatives,
  users,
  royaltySplits,
  type BeatMoneyLoopState,
  type BeatMoneyLoopCycle,
} from "@shared/schema";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { storageService } from "./storageService.js";
import { distributedCache } from "../infrastructure/distributedCache.js";
import { MaxCoreAIClient } from "./unifiedAIController.js";
import {
  getAwarenessContext,
  buildMaxCoreAwarenessPayload,
} from "./awarenessContext.js";
import {
  normalizeHashtags,
  cleanMaxCoreContent,
  selectBestVariant,
} from "../lib/contentPostProcessor.js";
import { beatAudioInputs, beatAudioObservation, type BeatAudioContext } from "./beatAudioContext.js";
import { recordGeneration } from "./adaptiveGenerationEngine.js";
import { advertisingDispatchService } from "./advertisingDispatchService.js";
import path from "path";
import fsPromises from "fs/promises";
import os from "os";
import { randomBytes } from "crypto";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOriginOrDefault,
} from "./maxcoreConnector.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const STATE_ROW_ID = "singleton";
const MIN_CADENCE_MS = 60 * 60 * 1000; // 1 h
const MAX_CADENCE_MS = 24 * 60 * 60 * 1000; // 24 h
const DEFAULT_CADENCE_MS = 4 * 60 * 60 * 1000; // 4 h
const FAILURE_BACKOFF_CADENCE_MS = 12 * 60 * 60 * 1000; // 12 h after 2+ consecutive failures
const FALLBACK_PRICE = 29.99;
const PRICE_UNDERCUT_FACTOR = 0.95;
 // ~ 8 bars at 120 BPM — short preview-grade beat

const TRENDING_GENRE_FALLBACK = "trap";
const TRENDING_MOOD_FALLBACK = "dark";

function getPublicAppOrigin(): string {
  const origin =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "");
  if (!origin) {
    throw new Error(
      "PUBLIC_BASE_URL or APP_URL must be configured before Beat Money Loop can publish buyer-facing links",
    );
  }
  return origin.replace(/\/$/, "");
}

function getBeatLandingUrl(listingId: string): string {
  return `${getPublicAppOrigin()}/marketplace/beat/${listingId}`;
}

const PLATFORMS_FOR_CAMPAIGN = [
  "instagram",
  "facebook",
  "tiktok",
  "twitter",
  "threads",
  "linkedin",
] as const;

// ── Public types ──────────────────────────────────────────────────────────────

export interface BeatMoneyLoopStatus {
  enabled: boolean;
  nextRunAt: Date | null;
  lastCycleAt: Date | null;
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  consecutiveFailures: number;
  totalRevenueCents: number;
  currentCadenceMs: number;
  msUntilNextRun: number | null;
  recentCycles: BeatMoneyLoopCycle[];
}

interface AdvertiseOutcome {
  campaignId: string | null;
  posted: boolean;
  reason: string;
}

export interface RunCycleResult {
  cycleId: string;
  // Social promotion is independent from the sale: only a completed
  // marketplace order can move status from awaiting_sale to sold.
  status: "awaiting_sale" | "sold" | "failed";
  beatId?: string;
  campaignId?: string;
  advertised?: boolean;
  note?: string;
  durationMs: number;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

class BeatMoneyLoopService {
  private _runningCycle = false;
  /** Queue of overrides to run back-to-back once the current cycle finishes. */
  private _pendingQueue: Array<{ genre?: string; mood?: string; key?: string }> = [];
  /** Resolved once at startup; null means no matching admin was found. */
  private _adminId: string | null = null;

  /** Used by the admin endpoint to avoid falsely accepting a run-now request
   * when an existing long-running MaxCore cycle already owns the single slot. */
  isCycleInFlight(): boolean {
    return this._runningCycle;
  }

  /**
   * Resolve and cache the admin user ID from the DB.
   * Looks up users WHERE role='admin' AND email=ADMIN_EMAIL.
   * Called once at startup (and lazily on first enable/runCycle).
   * Returns the resolved ID, or null if no match.
   */
  async resolveAdminId(): Promise<string | null> {
    if (this._adminId) return this._adminId;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      logger.warn(
        "[BeatMoneyLoop] ADMIN_EMAIL env var is not set — cannot resolve admin user; loop will be disabled",
      );
      return null;
    }
    try {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.email, adminEmail)))
        .limit(1);
      if (rows.length === 0) {
        logger.warn(
          `[BeatMoneyLoop] No admin user found with role='admin' AND email='${adminEmail}' — loop will be disabled until the account exists`,
        );
        return null;
      }
      this._adminId = rows[0].id;
      logger.info(
        `[BeatMoneyLoop] Admin user resolved: ${this._adminId} (${adminEmail})`,
      );
      return this._adminId;
    } catch (err) {
      logger.warn(
        { err },
        "[BeatMoneyLoop] DB error while resolving admin user ID — loop will be disabled",
      );
      return null;
    }
  }

  /**
   * Require that the admin ID has been resolved; throws with a clear message
   * if not. All cycle operations call this so failures are explicit.
   */
  private async _requireAdminId(): Promise<string> {
    const id = await this.resolveAdminId();
    if (!id) {
      throw new Error(
        "Beat Money Loop admin user not found — set ADMIN_EMAIL and ensure the account exists (role='admin')",
      );
    }
    return id;
  }

  /**
   * On startup, any cycle stuck in 'generating' was interrupted mid-flight by
   * a server restart. Mark them failed so the loop can start a fresh cycle.
   *
   * IMPORTANT: only orphan cycles that started BEFORE the current process. The
   * scheduler calls this ~75 s after boot — if a manual run-now was fired in
   * that window the cycle is still genuinely in-flight, not an orphan. We guard
   * with a cutoff = process start time − 30 s buffer so a fast manual trigger
   * right after restart is also protected.
   */
  async recoverOrphanedCycles(): Promise<void> {
    try {
      // Cutoff: cycles started before (process start − 30 s) are orphans.
      // Cycles started at or after that are live in this process.
      const processStartMs = Date.now() - process.uptime() * 1_000;
      const cutoff = new Date(processStartMs - 30_000);
      const orphans = await db
        .update(beatMoneyLoopCycles)
        .set({
          status: "failed",
          errorMessage:
            "Interrupted by server restart — cycle was in-flight when process exited",
          completedAt: new Date(),
        })
        .where(
          and(
            // All non-terminal states — a restart can interrupt a cycle at any
            // stage, not just 'generating'.
            inArray(beatMoneyLoopCycles.status, [
              "pending",
              "generating",
              "uploading",
              "advertising",
            ]),
            // Only mark cycles that started before this server session.
            sql`${beatMoneyLoopCycles.startedAt} < ${cutoff}`,
          ),
        )
        .returning({ id: beatMoneyLoopCycles.id, status: beatMoneyLoopCycles.status });
      if (orphans.length > 0) {
        logger.warn(
          `[BeatMoneyLoop] Recovered ${orphans.length} orphaned cycle(s): ${orphans.map((r) => `${r.id}(${r.status})`).join(", ")}`,
        );
        // Also reset the in-flight lock so the loop can schedule normally.
        this._runningCycle = false;
      }
    } catch (err) {
      logger.warn(
        { err },
        "[BeatMoneyLoop] Could not recover orphaned cycles",
      );
    }
  }

  /** Ensure the singleton state row exists; idempotent. */
  private async _ensureStateRow(): Promise<BeatMoneyLoopState> {
    const existing = await db
      .select()
      .from(beatMoneyLoopState)
      .where(eq(beatMoneyLoopState.id, STATE_ROW_ID))
      .limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db
      .insert(beatMoneyLoopState)
      .values({
        id: STATE_ROW_ID,
        enabled: false,
        currentCadenceMs: DEFAULT_CADENCE_MS,
      })
      .returning();
    return created;
  }

  /**
   * Idempotently mark a cycle sold only when the order has a completed
   * marketplace settlement for a listing created by this loop. The evidence is
   * re-read here instead of trusting checkout input from the caller.
   */
  async recordMarketplaceSale(orderId: string): Promise<boolean> {
    const beatIdExpression = sql<string>`${listings.metadata}->>'beatId'`;
    const [sale] = await db
      .select({
        beatId: beatIdExpression,
        settledAt: commerceSources.createdAt,
      })
      .from(orders)
      .innerJoin(
        commerceSources,
        and(
          eq(commerceSources.id, orders.id),
          eq(commerceSources.kind, "marketplace"),
        ),
      )
      .innerJoin(listings, eq(listings.id, orders.listingId))
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.status, "completed"),
          sql`${listings.metadata}->>'source' = 'beat-money-loop'`,
          sql`${beatIdExpression} IS NOT NULL`,
        ),
      )
      .limit(1);
    if (!sale?.beatId || !sale.settledAt) return false;

    const [cycle] = await db
      .select({
        id: beatMoneyLoopCycles.id,
        startedAt: beatMoneyLoopCycles.startedAt,
        status: beatMoneyLoopCycles.status,
      })
      .from(beatMoneyLoopCycles)
      .where(eq(beatMoneyLoopCycles.beatId, sale.beatId))
      .orderBy(asc(beatMoneyLoopCycles.startedAt))
      .limit(1);
    if (!cycle) {
      // Payment can race the beatId checkpoint by a few milliseconds. The
      // periodic analyzer reconciles the durable completed order afterward.
      logger.warn(
        { orderId, beatId: sale.beatId },
        "[BeatMoneyLoop] Completed marketplace sale has no visible cycle checkpoint yet",
      );
      return false;
    }
    if (cycle.status === "sold") return true;

    const [updated] = await db
      .update(beatMoneyLoopCycles)
      .set({
        status: "sold",
        completedAt: new Date(sale.settledAt),
      })
      .where(eq(beatMoneyLoopCycles.id, cycle.id))
      .returning({ id: beatMoneyLoopCycles.id });
    if (updated) {
      logger.info(
        { orderId, beatId: sale.beatId, cycleId: cycle.id },
        "[BeatMoneyLoop] Confirmed completed marketplace sale",
      );
    }
    return Boolean(updated);
  }

  async getStatus(): Promise<BeatMoneyLoopStatus> {
    const state = await this._ensureStateRow();
    const recent = await db
      .select()
      .from(beatMoneyLoopCycles)
      .orderBy(desc(beatMoneyLoopCycles.startedAt))
      .limit(20);
    const msUntilNextRun = state.nextRunAt
      ? Math.max(0, state.nextRunAt.getTime() - Date.now())
      : null;
    return {
      enabled: state.enabled,
      nextRunAt: state.nextRunAt,
      lastCycleAt: state.lastCycleAt,
      totalCycles: state.totalCycles,
      successfulCycles: state.successfulCycles,
      failedCycles: state.failedCycles,
      consecutiveFailures: state.consecutiveFailures,
      totalRevenueCents: state.totalRevenueCents,
      currentCadenceMs: state.currentCadenceMs,
      msUntilNextRun,
      recentCycles: recent,
    };
  }

  /** Turn the marketplace listing loop on. */
  async enable(): Promise<BeatMoneyLoopStatus> {
    await this._ensureStateRow();
    // Ensure we can resolve the admin before enabling the loop.
    const adminId = await this.resolveAdminId();
    if (!adminId) {
      logger.warn(
        "[BeatMoneyLoop] Cannot enable — admin user not found. Set ADMIN_EMAIL and ensure the account exists (role='admin').",
      );
      throw new Error(
        "Cannot enable Beat Money Loop: ADMIN_EMAIL is unset or does not identify an admin user",
      );
    }
    const nextRunAt = new Date(Date.now() + MIN_CADENCE_MS); // first cycle fires within ~1 h
    await db
      .update(beatMoneyLoopState)
      .set({ enabled: true, nextRunAt, updatedAt: new Date() })
      .where(eq(beatMoneyLoopState.id, STATE_ROW_ID));
    logger.info(
      "[BeatMoneyLoop] ✅ Enabled — first cycle scheduled for " +
        nextRunAt.toISOString(),
    );

    this.registerReconnectHandler();

    return this.getStatus();
  }

  /**
   * Register after every process start, not only when an operator enables the
   * loop. The enabled flag and backoff are persisted, while this callback is not.
   */
  registerReconnectHandler(): void {
    MaxCoreAIClient.onReconnect = async () => {
      try {
        const st = await this._ensureStateRow();
        if (!st.enabled) return;
        const MAX_BACKOFF_BEFORE_RESCHEDULE = MIN_CADENCE_MS * 3;
        const msUntil = st.nextRunAt
          ? st.nextRunAt.getTime() - Date.now()
          : Infinity;
        if (msUntil > MAX_BACKOFF_BEFORE_RESCHEDULE) {
          const sooner = new Date(Date.now() + MIN_CADENCE_MS);
          await db
            .update(beatMoneyLoopState)
            .set({ nextRunAt: sooner, updatedAt: new Date() })
            .where(eq(beatMoneyLoopState.id, STATE_ROW_ID));
          logger.info(
            `[BeatMoneyLoop] MaxCore reconnected — rescheduled next cycle to ${sooner.toISOString()} (was ${msUntil / 60_000 | 0} min away)`,
          );
        }
      } catch (err) {
        logger.warn(
          { err },
          "[BeatMoneyLoop] MaxCore reconnect reschedule failed",
        );
      }
    };
  }

  async disable(): Promise<BeatMoneyLoopStatus> {
    await this._ensureStateRow();
    await db
      .update(beatMoneyLoopState)
      .set({ enabled: false, nextRunAt: null, updatedAt: new Date() })
      .where(eq(beatMoneyLoopState.id, STATE_ROW_ID));
    logger.info("[BeatMoneyLoop] ⏸  Disabled");
    return this.getStatus();
  }

  /**
   * Scheduler heartbeat — called every 30 min by autonomousJobScheduler.
   * Runs a cycle iff (enabled && now ≥ nextRunAt && no cycle currently in-flight).
   */
  async tick(): Promise<{ ran: boolean; reason: string; cycleId?: string }> {
    const state = await this._ensureStateRow();
    if (!state.enabled) return { ran: false, reason: "disabled" };
    if (this._runningCycle)
      return { ran: false, reason: "cycle-already-in-flight" };
    if (state.nextRunAt && state.nextRunAt.getTime() > Date.now()) {
      return {
        ran: false,
        reason: `not-yet-due (next=${state.nextRunAt.toISOString()})`,
      };
    }
    let result: RunCycleResult;
    try {
      result = await this.runCycle("schedule");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message ===
          "A Beat Money Loop cycle is already in-flight on another worker"
      ) {
        return { ran: false, reason: "cycle-already-in-flight" };
      }
      throw err;
    }

    // ── Self-optimization: adaptive batch size ────────────────────────────
    // When demand is proven (recent downloads/revenue) and the loop is healthy,
    // queue extra back-to-back cycles this tick (up to 3 total). Extra cycles
    // reuse the auto-chain queue, so they run sequentially and each records
    // its own cycle row. Failures or zero demand keep the batch at 1.
    if (result.status !== "failed") {
      try {
        const extra = (await this._optimalBatchSize()) - 1;
        if (extra > 0) {
          logger.info(
            `[BeatMoneyLoop] batch self-opt: demand supports ${extra + 1} beats this tick — queueing ${extra} extra cycle(s)`,
          );
          this.queueOverrides(Array.from({ length: extra }, () => ({})));
        }
      } catch (e) {
        logger.warn(
          `[BeatMoneyLoop] batch-size self-opt skipped: ${(e as Error).message}`,
        );
      }
    }

    return {
      ran: true,
      reason: `cycle-${result.status}`,
      cycleId: result.cycleId,
    };
  }

  /**
   * Self-optimized number of beats to generate per scheduled tick (1–3).
   * Driven ONLY by real outcomes: recent downloads/revenue raise the batch,
   * recent failures pin it at 1 (protects MaxCore + avoids waste).
   */
  private async _optimalBatchSize(): Promise<number> {
    const state = await this._ensureStateRow();
    if (state.consecutiveFailures > 0) return 1;

    const perf = await this._genrePerformance();
    let downloads = 0;
    let revenueCents = 0;
    for (const stats of perf.values()) {
      downloads += stats.downloads;
      revenueCents += stats.revenueCents;
    }

    if (downloads >= 5 || revenueCents >= 10_000) return 3;
    if (downloads >= 1 || revenueCents > 0) return 2;
    return 1;
  }

  /** Run a single cycle end-to-end. Records every outcome to beatMoneyLoopCycles. */
  async runCycle(
    triggeredBy: "schedule" | "manual",
    overrides?: { genre?: string; mood?: string; key?: string },
  ): Promise<RunCycleResult> {
    if (this._runningCycle) {
      throw new Error("A Beat Money Loop cycle is already in-flight");
    }
    this._runningCycle = true;
    const startedAt = Date.now();
    let scratchDir: string | null = null;
    let cycleId = "";
    let listedBeatId: string | null = null;
    let promotionOutcome: AdvertiseOutcome | null = null;
    let lockClient: PoolClient | null = null;
    let databaseLockAcquired = false;
    let databaseLockHealthy = true;
    let lockHeartbeat: ReturnType<typeof setInterval> | null = null;
    let heartbeatInFlight: Promise<unknown> | null = null;

    const assertCycleLock = () => {
      if (!databaseLockAcquired || !databaseLockHealthy) {
        throw new Error(
          "Beat Money Loop lost its database cycle lock; refusing further side effects",
        );
      }
    };

    try {
      // Session advisory lock is shared by every app replica. Keep this
      // connection alive for the full generation cycle; PostgreSQL releases
      // the lock automatically if the process or connection dies.
      const client = await pool.connect();
      lockClient = client;
      const lockResult = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        ["beat-money-loop:cycle"],
      );
      if (!lockResult.rows[0]?.acquired) {
        throw new Error(
          "A Beat Money Loop cycle is already in-flight on another worker",
        );
      }
      databaseLockAcquired = true;
      lockHeartbeat = setInterval(() => {
        if (!lockClient || !databaseLockAcquired || heartbeatInFlight) return;
        const client = lockClient;
        heartbeatInFlight = client
          .query("SELECT 1")
          .catch((err: unknown) => {
            databaseLockHealthy = false;
            logger.error(
              { err },
              "[BeatMoneyLoop] Database cycle-lock heartbeat failed",
            );
          })
          .finally(() => {
            heartbeatInFlight = null;
          });
      }, 15_000);

      // Create the cycle row inside the guarded try so even an insert failure
      // releases both the process-local and cluster-wide locks.
      const [cycleRow] = await db
        .insert(beatMoneyLoopCycles)
        .values({
          triggeredBy,
          status: "pending",
        })
        .returning();
      cycleId = cycleRow.id;
      logger.info(
        `[BeatMoneyLoop] ▶ Cycle ${cycleId} started (trigger=${triggeredBy})${overrides ? ` overrides=${JSON.stringify(overrides)}` : ""}`,
      );

      // 1. SCAN
      // No awareness-to-production planner: Core audio chooses unspecified fields.
      // Concrete genre/mood/tempo are resolved AFTER generation (step 2b), once
      // MaxCore's observations have landed on `scan` — pricing, record creation
      // and campaigns must reflect what was actually produced, not pre-generation
      // fallbacks.
      const scan = beatAudioInputs(overrides);
      await db
        .update(beatMoneyLoopCycles)
        .set({ status: "generating", scanContext: scan })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      logger.info(
        `[BeatMoneyLoop] ${cycleId} forwarding explicit audio preferences to MaxCore`,
      );

      // 2a. MaxCore pre-warm — if MaxCore is sleeping, wait up to 90 s for it
      //     to wake before attempting audio generation.  A cold /generate/audio
      //     call against a sleeping MaxCore returns the Replit "not live yet" 404
      //     and fails the whole cycle.  A single lightweight GET is enough to
      //     trigger the wake; subsequent calls will find it ready.
      const mcBase = getMaxcoreOriginOrDefault();
      const mcKey = getMaxcoreGenerationKey();
      const PREWARM_BUDGET_MS = 90_000;
      const prewarmStart = Date.now();
      let maxcoreReady = false;
      while (Date.now() - prewarmStart < PREWARM_BUDGET_MS) {
        try {
          const hRes = await fetch(`${mcBase}/api/health`, {
            headers: { Authorization: `Bearer ${mcKey}` },
            signal: AbortSignal.timeout(8_000),
          });
          // Accept 200 or any non-sleeping response (non-HTML content-type)
          const ct = hRes.headers.get("content-type") ?? "";
          if (hRes.ok && ct.includes("json")) { maxcoreReady = true; break; }
          if (hRes.status !== 200 && hRes.status !== 404) { maxcoreReady = true; break; }
        } catch (_) { /* timeout or network error — keep waiting */ }
        await new Promise((r) => setTimeout(r, 6_000));
      }
      if (!maxcoreReady) {
        logger.warn(
          `[BeatMoneyLoop] MaxCore pre-warm timed out after ${PREWARM_BUDGET_MS / 1000}s — attempting audio anyway`,
        );
      }

      // 2b. GENERATE
      const generated = await this._generateBeat(scan);
      Object.assign(scan, generated.observation);
      // Resolve concrete values now that MaxCore's observations are in: any
      // field the caller left unspecified was decided at generation time, so
      // downstream stages (pricing, record creation, campaigns) use the
      // observed values — not the pre-generation fallbacks.
      const concreteScan = {
        ...scan,
        genre: scan.genre ?? TRENDING_GENRE_FALLBACK,
        mood: scan.mood ?? TRENDING_MOOD_FALLBACK,
        tempo: scan.tempo ?? 120,
      };
      const {
        audioAbsPath,
        previewAbsPath,
        title,
        audioGenBackend,
        musicalKey,
      } = generated;
      scratchDir = generated.scratchDir;
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: "uploading",
          audioGenBackend,
          beatTitle: title,
          scanContext: scan,
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));

      // 3. PRICE
      const price = await this._competitivePrice(concreteScan.genre);

      // 4. UPLOAD (persist beat record + upload bytes to hybrid storage)
      assertCycleLock();
      const { beatId, listingId } = await this._createBeatRecord({
        scan: concreteScan,
        price,
        audioAbsPath,
        previewAbsPath,
        title,
        musicalKey,
      });
      listedBeatId = beatId;
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: sql<string>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold' ELSE 'awaiting_sale' END`,
          beatId,
          price,
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      logger.info(
        `[BeatMoneyLoop] ${cycleId} beat ${beatId} listed at $${price.toFixed(2)}`,
      );

      // Anti-repetition memory: log what was ACTUALLY produced now that the
      // beat is durably persisted (never before _createBeatRecord succeeds —
      // a discarded/failed attempt must never pollute future repeat checks).
      // Attribute set MUST exactly match _distillScan's isRecentlyUsed() call
      // (genre+mood only) — the signature hash is keyed on the full
      // attribute set, so any mismatch (e.g. adding musicalKey here) would
      // make the two hashes never equal and silently defeat the check.
      try {
        await recordGeneration({
          userId: null,
          domain: "beat_generation",
          attributes: { genre: scan.genre, mood: scan.mood },
        });
      } catch (e) {
        logger.warn(
          `[BeatMoneyLoop] recordGeneration failed (non-fatal): ${(e as Error).message}`,
        );
      }

      // 5. PROMOTE the listed beat through organic social accounts. Promotion
      // is part of the loop, but never counts as a completed sale.
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: sql<string>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold' ELSE 'advertising' END`,
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));

      let ad: AdvertiseOutcome = {
        campaignId: null,
        posted: false,
        reason: "Social promotion was not attempted",
      };
      try {
        assertCycleLock();
        ad = await this._launchCampaign({
          cycleId,
          beatId,
          listingId,
          scan: concreteScan,
          price,
          title,
          audioAbsPath,
        });
      } catch (err) {
        ad = {
          campaignId: null,
          posted: false,
          reason: (err as Error).message || "Social promotion failed",
        };
        logger.warn({ err }, `[BeatMoneyLoop] ${cycleId} promotion step failed`);
      }
      promotionOutcome = ad;

      // 6. Record sale state and promotion outcome independently. A post can
      // advertise the listing; only the marketplace order hook can mark sold.
      const durationMs = Date.now() - startedAt;
      const nextCadence = this._computeNextCadenceMs(
        scan,
        /* failed */ false,
        /* state */ null,
      );
      const nextRunAt = new Date(Date.now() + nextCadence);
      const [recordedCycle] = await db
        .update(beatMoneyLoopCycles)
        .set({
          status: sql<string>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold' ELSE 'awaiting_sale' END`,
          campaignId: ad.campaignId,
          errorMessage: ad.posted
            ? null
            : `Social promotion not posted: ${ad.reason}`.slice(0, 1000),
          durationMs,
          completedAt: sql<Date | null>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN ${beatMoneyLoopCycles.completedAt} ELSE NULL END`,
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId))
        .returning({ status: beatMoneyLoopCycles.status });
      if (!recordedCycle) {
        throw new Error(
          `Beat Money Loop cycle ${cycleId} disappeared before finalization`,
        );
      }
      const finalStatus = recordedCycle.status as "awaiting_sale" | "sold";
      // The marketplace listing is live regardless of whether it has sold yet,
      // so it advances cadence without being misreported as a completed sale.
      await this._updateStateAfterCycle({
        success: true,
        nextRunAt,
        cadence: nextCadence,
      });
      logger.info(
        `[BeatMoneyLoop] Cycle ${cycleId} ${finalStatus}; social promotion ${ad.posted ? "posted" : `not posted: ${ad.reason}`} in ${durationMs}ms — next in ${Math.round(nextCadence / 60000)} min`,
      );

      // Backfill revenue metrics on this cycle immediately so the dashboard
      // reflects the new beat without waiting for the next scheduler heartbeat.
      this.analyseRecentCycles().catch((e: Error) =>
        logger.warn(`[BeatMoneyLoop] analyseRecentCycles after cycle failed: ${e.message}`),
      );

      return {
        cycleId,
        status: finalStatus,
        beatId,
        campaignId: ad.campaignId ?? undefined,
        advertised: ad.posted,
        note: ad.posted ? undefined : ad.reason,
        durationMs,
      };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      // No durable cycle exists to update when lock acquisition or the initial
      // row insert failed. Propagate that infrastructure error after finally
      // releases the locks instead of inventing a cycle result.
      if (!cycleId) throw err;
      const durationMs = Date.now() - startedAt;
      logger.warn(
        { err },
        `[BeatMoneyLoop] ❌ Cycle ${cycleId} failed after ${durationMs}ms: ${msg}`,
      );
      // Surface to Sentry so operators are alerted to unexpected cycle failures.
      import("../instrument.js")
        .then(({ captureSentryException }) => {
          captureSentryException(err instanceof Error ? err : new Error(msg), {
            cycleId,
            durationMs,
          });
        })
        .catch(() => { /* instrument not yet loaded — non-fatal */ });
      const nextCadence = this._computeNextCadenceMs(
        null,
        /* failed */ true,
        null,
      );
      const nextRunAt = new Date(Date.now() + nextCadence);
      const [failureCycle] = await db
        .update(beatMoneyLoopCycles)
        .set({
          status: sql<string>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold' ELSE ${listedBeatId ? "awaiting_sale" : "failed"} END`,
          ...(listedBeatId ? { beatId: listedBeatId } : {}),
          ...(promotionOutcome
            ? { campaignId: promotionOutcome.campaignId }
            : {}),
          errorMessage: listedBeatId
            ? promotionOutcome?.posted
              ? msg.slice(0, 1000)
              : `Social promotion not posted: ${promotionOutcome?.reason || msg}`.slice(
                  0,
                  1000,
                )
            : msg.slice(0, 1000),
          durationMs,
          completedAt: sql<Date | null>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN ${beatMoneyLoopCycles.completedAt} ELSE ${listedBeatId ? null : new Date()} END`,
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      const failureStatus =
        failureCycle?.status === "sold"
          ? "sold"
          : listedBeatId
            ? "awaiting_sale"
            : "failed";
      await this._updateStateAfterCycle({
        success: listedBeatId !== null,
        nextRunAt,
        cadence: nextCadence,
      });
      return {
        cycleId,
        status: failureStatus,
        ...(listedBeatId ? { beatId: listedBeatId } : {}),
        ...(promotionOutcome?.campaignId
          ? { campaignId: promotionOutcome.campaignId }
          : {}),
        ...(promotionOutcome
          ? {
              advertised: promotionOutcome.posted,
              ...(!promotionOutcome.posted
                ? { note: promotionOutcome.reason }
                : {}),
            }
          : {}),
        durationMs,
        error: msg,
      };
    } finally {
      if (scratchDir) {
        try {
          await fsPromises.rm(scratchDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          logger.warn(
            { err: cleanupErr, scratchDir },
            "[BeatMoneyLoop] Failed to remove local generation scratch directory",
          );
        }
      }
      if (lockHeartbeat) clearInterval(lockHeartbeat);
      if (heartbeatInFlight) await heartbeatInFlight;
      if (lockClient) {
        if (databaseLockAcquired) {
          try {
            await lockClient.query(
              "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
              ["beat-money-loop:cycle"],
            );
          } catch (unlockErr) {
            logger.warn(
              { err: unlockErr },
              "[BeatMoneyLoop] Database cycle-lock release failed; connection release will relinquish it",
            );
          }
        }
        lockClient.release();
      }
      this._runningCycle = false;
      // Auto-chain: if someone enqueued more overrides while this cycle ran,
      // kick off the next one immediately rather than waiting for a scheduler tick.
      this._drainQueue();
    }
  }

  /**
   * Enqueue genre/mood/key overrides to run back-to-back once the current
   * cycle (if any) finishes.  Safe to call while a cycle is in flight.
   */
  queueOverrides(list: Array<{ genre?: string; mood?: string; key?: string }>): void {
    this._pendingQueue.push(...list);
    logger.info(`[BeatMoneyLoop] Queued ${list.length} override(s); queue depth = ${this._pendingQueue.length}`);
    // If nothing is running right now, start draining immediately.
    if (!this._runningCycle) this._drainQueue();
  }

  /** Internal: start the next queued override cycle (non-blocking). */
  private _drainQueue(): void {
    if (this._pendingQueue.length === 0) return;
    if (this._runningCycle) return; // will be called again in finally
    const next = this._pendingQueue.shift()!;
    logger.info(`[BeatMoneyLoop] Auto-chain → starting queued cycle (${this._pendingQueue.length} remaining after this)`);
    this.runCycle("manual", next).catch((e: Error) =>
      logger.warn(`[BeatMoneyLoop] Auto-chain cycle failed: ${e.message}`),
    );
  }

  // ── Internal helpers ───────────────────────────────────────────────────────


  /**
   * Call MaxCore /generate/audio directly.
   * Mode C = MaxCore AI backend (8 TB music dataset, highest quality).
   * Mode B = HD DSP fallback (plate reverb + stereo widening, release quality).
   * Returns decoded WAV bytes + optional musical metadata from MaxCore.
   */
  private async _maxcoreAudio(
    scan: BeatAudioContext,
    mode: "C" | "B",
  ): Promise<{
    wavBytes: Buffer;
    observation: Partial<BeatAudioContext>;
    mcKey?: string;
    mcBpm?: number;
    mcMusicalKey?: string;
    backend: string;
    /** Creative concept name MaxCore sometimes returns (e.g. "midnight void") */
    concept?: string;
    /** Alternate field name MaxCore uses for the concept */
    styleHook?: string;
    /** Raw audio quality metrics from MaxCore (spectral/bass as strings per MaxCore schema) */
    audioAnalysis?: {
      loudness_db?: number;
      energy?: number;
      spectral_brightness?: string;
      bass_weight?: string;
    };
  }> {
    const base = getMaxcoreOriginOrDefault();
    const key = getMaxcoreGenerationKey();
    // Beat duration. Default 180 s (full-length sellable beat).
    // Override via BEAT_DURATION_SECONDS env var (max 300 s / 5 min).
    const durationSec = Math.min(
      300,
      Math.max(10, Number(process.env.BEAT_DURATION_SECONDS) || 180),
    );
    const body: Record<string, unknown> = {
      ...(scan.genre !== undefined ? { genre: scan.genre } : {}),
      ...(scan.tempo !== undefined ? { bpm: scan.tempo } : {}),
      ...(scan.mood !== undefined ? { mood: scan.mood } : {}),
      duration: durationSec,
      energy: 1.0,           // peak energy / presence
      quality: "professional", // industry-grade output request
      master: true,           // request mastered, release-ready output
      mode,
    };
    // Send the requested key so MaxCore generates in that tonality, giving
    // each cycle a different key rather than always defaulting to C Minor.
    if (scan.requestedKey) body.key = scan.requestedKey;
    if (scan.productionStyles.length > 0)
      body.style = scan.productionStyles.slice(0, 5).join(", ");
    if (scan.hooks.length > 0)
      body.context = scan.hooks.slice(0, 5).join("; ");

    // Awareness cascade — live trend/CTA/emotional-trigger signals so this
    // cycle's audio generation is conditioned like every other MaxCore call.
    // This call bypasses MaxCoreAIClient via a raw fetch below, so it must
    // build its own awareness payload rather than relying on the shared
    // transport-layer injection. Best-effort: never blocks generation.
    const awarenessPayload = await buildMaxCoreAwarenessPayload("music");
    Object.assign(body, awarenessPayload);

    // Bearer ONLY — MaxCore 401s the whole request when X-API-Key/X-Admin-Key
    // are present (see replit.md / maxcore-auth-header memory).
    const authHeaders: Record<string, string> = key
      ? { Authorization: `Bearer ${key}` }
      : {};

    logger.info(
      `[BeatMoneyLoop] _maxcoreAudio mode=${mode} → POST ${base}/api/generate/audio (duration=${durationSec}s)`,
    );
    // Retry the initial POST up to 3 times on transient network errors (ECONNRESET,
    // ECONNREFUSED) — MaxCore can drop the connection while waking from sleep.
    // Each attempt has a 15-min abort in case MaxCore holds the conn while warming.
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(`${base}/api/generate/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(body),
          // MaxCore has NO server-side timeout — it holds the connection while it
          // wakes/works, so every abort here is OUR side killing a request that
          // would eventually succeed. Give the initial POST 15 min.
          signal: AbortSignal.timeout(900_000),
        });
        break; // success — exit retry loop
      } catch (fetchErr) {
        const isTimeout =
          (fetchErr as Error).name === "AbortError" ||
          (fetchErr as Error).name === "TimeoutError";
        if (isTimeout || attempt === 3) throw fetchErr;
        logger.warn(
          `[BeatMoneyLoop] _maxcoreAudio mode=${mode} POST attempt ${attempt} failed (${(fetchErr as Error).message}) — retrying in 15 s`,
        );
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    logger.info(
      `[BeatMoneyLoop] _maxcoreAudio mode=${mode} POST → HTTP ${res!.status}`,
    );
    if (!res!.ok) {
      const text = await res!.text().catch(() => "");
      throw Object.assign(new Error(
        `MaxCore /generate/audio HTTP ${res!.status}: ${text.slice(0, 200)}`,
      ), { status: res!.status });
    }
    const data = (await res!.json()) as {
      wav_b64?: string;
      audio_b64?: string;
      url?: string;
      audio_url?: string;
      job_id?: string;
      status?: string;
      mc_key?: string;
      mc_bpm?: number;
      /** Real rendered BPM returned by the MaxCore audio engine */
      bpm?: number;
      /** Musical key detected / used by MaxCore (e.g. "F# minor") */
      key?: string;
      /** Post-render audio analysis block (new MaxCore server-side field) */
      audio_analysis?: {
        loudness_db?: number;
        energy?: number;
        spectral_brightness?: string;
        bass_weight?: string;
      };
      /** Conceptual description MaxCore attached to the generated beat */
      concept?: string;
      /** Style/production hook MaxCore used when generating */
      style_hook?: string;
      backend?: string;
    };

    const backend = data.backend ?? (mode === "C" ? "maxcore" : "dsp_b");
    const validateWav = (bytes: Buffer): Buffer => {
      // A successful HTTP response is not sufficient evidence that MaxCore
      // produced playable audio: upstream error pages and truncated payloads
      // have previously been persisted as ".wav" files. Require the minimum
      // RIFF/WAVE container signature before a listing can ever be created.
      if (bytes.length < 1_024) {
        throw new Error(`MaxCore audio payload too small (${bytes.length} bytes)`);
      }
      if (
        bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
        bytes.subarray(8, 12).toString("ascii") !== "WAVE"
      ) {
        throw new Error("MaxCore audio payload is not a RIFF/WAVE file");
      }
      return bytes;
    };
    const finish = async (d: typeof data): Promise<{
      wavBytes: Buffer;
      observation: Partial<BeatAudioContext>;
      mcKey?: string;
      mcBpm?: number;
      mcMusicalKey?: string;
      audioAnalysis?: typeof data["audio_analysis"];
      concept?: string;
      styleHook?: string;
      backend: string;
    }> => {
      // Real BPM: prefer top-level `bpm` (audio engine output) over `mc_bpm`
      // which is the requested BPM echoed back. Key is only in the new field.
      const mcBpm = d.bpm ?? d.mc_bpm;
      const extras = {
        observation: beatAudioObservation(d as unknown as Record<string, unknown>, {
          ...awarenessPayload,
          ...(data as unknown as Record<string, unknown>).snapshot_id !== undefined
            ? { snapshot_id: (data as unknown as Record<string, unknown>).snapshot_id } : {},
        }),
        mcKey: d.mc_key,
        mcBpm,
        mcMusicalKey: d.key,
        audioAnalysis: d.audio_analysis,
        concept: d.concept,
        styleHook: d.style_hook,
        backend: d.backend ?? backend,
      };
      const b64 = d.wav_b64 ?? d.audio_b64;
      if (b64) {
        return { wavBytes: validateWav(Buffer.from(b64, "base64")), ...extras };
      }
      const rawUrl = d.url ?? d.audio_url;
      if (rawUrl) {
        const abs = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${base}${rawUrl}`;
        // SSRF / credential-leak guard: only download from the MaxCore origin.
        // Never forward the Bearer token to a host we don't control.
        if (new URL(abs).origin !== new URL(base).origin) {
          throw new Error(
            `MaxCore returned audio URL on unexpected origin: ${new URL(abs).origin}`,
          );
        }
        const dl = await fetch(abs, {
          headers: authHeaders,
          // Full-length files are ~10× larger than the old 30 s clips.
          signal: AbortSignal.timeout(120_000),
        });
        if (!dl.ok) throw new Error(`MaxCore audio download HTTP ${dl.status}`);
        const bytes = validateWav(Buffer.from(await dl.arrayBuffer()));
        return { wavBytes: bytes, ...extras };
      }
      throw new Error("MaxCore returned no audio payload (no wav_b64/url)");
    };

    // Synchronous response — audio inline or via URL
    if (data.wav_b64 || data.audio_b64 || data.url || data.audio_url) {
      return finish(data);
    }

    // Async job contract — MaxCore now returns { job_id, status: "processing" }.
    // Poll /api/audio-job/:id until done. Budget scales with requested length:
    // rendering a full 3-min beat takes far longer than the old 30 s clip.
    if (data.job_id) {
      // Poll budget: at least 30 min — 30 s audio was historically completing in
      // ~18-20 min. The old 20-min cap caused us to bail 12 s before completion.
      // Use 40× duration with a 30 min floor so there's always plenty of headroom.
      const pollBudgetMs = Math.max(1_800_000, durationSec * 40_000);
      const deadline = Date.now() + pollBudgetMs;
      logger.info(
        `[BeatMoneyLoop] mode=${mode} polling job ${data.job_id} (budget=${Math.round(pollBudgetMs / 1000)}s)`,
      );
      let lastLogAt = Date.now();
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4_000));
        // Periodic heartbeat so the log shows progress even during long renders.
        if (Date.now() - lastLogAt >= 60_000) {
          const elapsedSec = Math.round((Date.now() - (deadline - pollBudgetMs)) / 1000);
          const remainSec = Math.round((deadline - Date.now()) / 1000);
          logger.info(
            `[BeatMoneyLoop] mode=${mode} job ${data.job_id} still rendering… elapsed=${elapsedSec}s remain=${remainSec}s`,
          );
          lastLogAt = Date.now();
        }
        let jr: Response;
        try {
          jr = await fetch(`${base}/api/audio-job/${data.job_id}`, {
            headers: authHeaders,
            // MaxCore may hold the poll connection too — allow 60 s per poll.
            signal: AbortSignal.timeout(60_000),
          });
        } catch (pollFetchErr) {
          // Transient network error or per-request timeout — keep polling
          // within the overall budget rather than aborting the whole job.
          const name = (pollFetchErr as Error).name ?? "";
          if (name === "AbortError" || name === "TimeoutError") continue;
          throw pollFetchErr; // unexpected non-timeout error — propagate
        }
        // Terminal auth failures — will never recover within this budget.
        if (jr.status === 401 || jr.status === 403) {
          throw new Error(`MaxCore audio job poll HTTP ${jr.status}`);
        }
        // 404 on a poll = MaxCore cleaned up the job record after completion
        // or the server restarted and lost in-memory job state. Treat as
        // "job expired" — throw with a distinguishable message so the caller
        // can log it rather than continuing to spin for 30 min on a dead job.
        if (jr.status === 404) {
          throw new Error(`MaxCore audio job ${data.job_id} expired (404) — job record no longer exists on server`);
        }
        if (!jr.ok) {
          logger.warn(`[BeatMoneyLoop] mode=${mode} job poll HTTP ${jr.status} — continuing`);
          continue; // transient 5xx — keep polling within budget
        }
        const job = (await jr.json()) as typeof data & { error?: string };
        const st = (job.status ?? "").toLowerCase();
        logger.info(`[BeatMoneyLoop] mode=${mode} job ${data.job_id} status=${st}`);
        if (st === "error" || st === "failed") {
          throw new Error(
            `MaxCore audio job failed: ${(job.error ?? "unknown").slice(0, 200)}`,
          );
        }
        if (
          st === "done" ||
          st === "completed" ||
          job.wav_b64 ||
          job.audio_b64 ||
          job.url ||
          job.audio_url
        ) {
          logger.info(`[BeatMoneyLoop] mode=${mode} job ${data.job_id} ✅ complete`);
          return finish({ ...data, ...job });
        }
      }
      throw new Error(
        `MaxCore audio job did not complete within ${Math.round(pollBudgetMs / 1000)} s`,
      );
    }

    throw new Error("MaxCore returned no wav_b64");
  }

  /**
   * Generate a beat WAV — internal MaxCore subsystem ONLY (no other source).
   * Tier 1: MaxCore Mode C  — AI audio from 8 TB music dataset.
   * Tier 2: MaxCore Mode B  — HD DSP (plate reverb, stereo, release quality).
   *
   * If both MaxCore modes fail, the cycle fails explicitly — we never list a
   * beat that wasn't produced by the internal MaxCore subsystem.
   *
   * The industry scan (genre / mood / tempo / production styles / viral hooks)
   * is forwarded to MaxCore so generation is biased toward what's trending.
   */
  private async _generateBeat(scan: BeatAudioContext): Promise<{
    audioAbsPath: string;
    previewAbsPath: string;
    scratchDir: string;
    title: string;
    audioGenBackend: string;
    musicalKey?: string;
    observation: Partial<BeatAudioContext>;
  }> {
    // MaxCore bytes are persisted to PDIM later in the pipeline.  A private
    // system temp directory is only an ffmpeg staging area; it is never served
    // and runCycle removes it in a finally block on both success and failure.
    const outputDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "beat-money-loop-"),
    );

    // Use the key from the override/scan if present; otherwise pick at random.
    // IMPORTANT: MaxCore's audio endpoint always returns C Minor regardless of
    // what is requested — we must use OUR requestedKey as the canonical key and
    // not let the mc.mcMusicalKey / mc.mcKey field override it.
    const scanWithKey = scan;

    const titleAdj =
      scan.mood ? scan.mood.charAt(0).toUpperCase() + scan.mood.slice(1) : "";
    const titleGenre =
      scan.genre ? scan.genre.charAt(0).toUpperCase() + scan.genre.slice(1) : "";
    const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");

    // ── MaxCore ONLY (Mode C, then Mode B) — no local fallback ──────────────
    const modeErrors: string[] = [];
    for (const mode of ["C", "B"] as const) {
      try {
        const mc = await this._maxcoreAudio(scanWithKey, mode);
        const filename = `beat_${Date.now()}_${randomBytes(8).toString("hex")}.wav`;
        const audioAbsPath = path.join(outputDir, filename);
        await fsPromises.writeFile(audioAbsPath, mc.wavBytes);

        // Trim a 30 s preview from the full-length WAV using ffmpeg so buyers
        // can audition the beat before purchasing. A failed or empty preview
        // must stop publication; using the source WAV here would expose it.
        let previewAbsPath = audioAbsPath;
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const runFf = promisify(execFile);
        const probe = await runFf(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            audioAbsPath,
          ],
          { timeout: 15_000 },
        );
        const sourceDurationSeconds = Number(probe.stdout.trim());
        if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds < 2) {
          throw new Error(
            `generated audio duration is invalid (${probe.stdout.trim() || "missing"})`,
          );
        }
        // Keep the audition clip at or below 30 seconds and strictly shorter
        // than short source beats; a 30-second trim of a 16-second source would
        // otherwise copy the entire paid asset.
        const previewDurationSeconds = Math.min(30, sourceDurationSeconds / 2);
        const previewFilename = `preview_30s_${Date.now()}_${randomBytes(6).toString("hex")}.wav`;
        const previewAbs = path.join(outputDir, previewFilename);
        await runFf("ffmpeg", [
          "-y", "-i", audioAbsPath,
          "-t", previewDurationSeconds.toFixed(3),
          "-c", "copy",
          previewAbs,
        ], { timeout: 30_000 });
        const [sourceStat, previewStat] = await Promise.all([
          fsPromises.stat(audioAbsPath),
          fsPromises.stat(previewAbs),
        ]);
        if (previewStat.size < 1_024 || previewStat.size >= sourceStat.size) {
          throw new Error(
            `trimmed preview is invalid (preview=${previewStat.size} bytes, source=${sourceStat.size} bytes)`,
          );
        }
        previewAbsPath = previewAbs;
        logger.info(`[BeatMoneyLoop] 30 s preview trimmed → ${previewFilename}`);

        // Use requestedKey as canonical — MaxCore always returns "C Minor" for
        // mcMusicalKey/mcKey, so accepting its value would lock every beat.
        const realBpm = mc.observation.tempo;
        const musicalKey = mc.observation.musicalKey;
        const keyStr = musicalKey ? ` (${musicalKey})` : "";
        const bpmStr = realBpm !== undefined ? ` ${realBpm} BPM` : "";

        // Use MaxCore's concept name when available — more evocative and
        // searchable than the generic "Dark Trap Type Beat" format.
        // Sanitise: take first line only (MaxCore sometimes returns multi-paragraph
        // text with embedded BPM/key metadata), strip quotes, strip any embedded
        // BPM/key/tempo that would duplicate the title suffix, cap at 50 chars.
        const conceptRaw = mc.concept ?? mc.styleHook ?? "";
        const conceptClean = conceptRaw
          .trim()
          // First line only — MaxCore sometimes returns multi-line paragraphs
          .split(/\r?\n/)[0]
          .trim()
          // Strip surrounding quote characters (ASCII + Unicode)
          .replace(/^["'«»\u201C\u201D\u2018\u2019]|["'«»\u201C\u201D\u2018\u2019]$/g, "")
          // Strip embedded "fast tempo", "slow tempo", BPM, key that would duplicate the suffix
          .replace(/\s*[,(]\s*(?:fast|slow|medium)\s+tempo[^)]*\)?/gi, "")
          .replace(/\s*[,(]\s*[\d.]+\s*BPM[^)]*\)?/gi, "")
          .replace(/\s*[,(]\s*[A-G][b#]?\s+(?:major|minor)[^)]*\)?/gi, "")
          .trim()
          // Cap at 50 chars — but cut at a word boundary so the title never
          // ends mid-word (e.g. "…away from the industr").
          .replace(/^([\s\S]{0,50})(?:\s[\s\S]*)?$/, (_m, head: string) =>
            head.length === 50 && /\S/.test(head.charAt(49))
              ? head.replace(/\s+\S*$/, "")
              : head,
          )
          .trim();
        const title = conceptClean
          ? `${conceptClean.charAt(0).toUpperCase() + conceptClean.slice(1)} — ${titleAdj} ${titleGenre} Type Beat${keyStr}${bpmStr}`
          : `${titleAdj} ${titleGenre} Type Beat${keyStr}${bpmStr} — ${stamp}`;

        // Log audio quality metrics so near-silent or low-energy beats are
        // visible in the log and can be audited / gated later.
        if (mc.audioAnalysis) {
          const qa = mc.audioAnalysis;
          logger.info(
            `[BeatMoneyLoop] Audio quality — loudness=${qa.loudness_db ?? "?"}dB ` +
            `energy=${qa.energy ?? "?"} spectral=${qa.spectral_brightness ?? "?"} ` +
            `bass=${qa.bass_weight ?? "?"}`,
          );
          // Soft quality gate: reject near-silent files rather than listing
          // unplayable audio. Threshold is generous (-40 dB) to avoid false
          // positives — MaxCore sometimes renders very clean, quiet intros.
          if (
            typeof qa.loudness_db === "number" &&
            qa.loudness_db < -40 &&
            typeof qa.energy === "number" &&
            qa.energy < 0.05
          ) {
            throw new Error(
              `MaxCore audio quality too low (loudness=${qa.loudness_db}dB, energy=${qa.energy}) — rejecting beat`,
            );
          }
        }

        logger.info(
          `[BeatMoneyLoop] Beat generated via MaxCore mode ${mode} (backend=${mc.backend}, key=${musicalKey}) → "${title}"`,
        );
        return {
          observation: mc.observation,
          audioAbsPath,
          previewAbsPath,
          scratchDir: outputDir,
          title,
          audioGenBackend: mc.backend,
          musicalKey: musicalKey || scan.requestedKey,
        };
      } catch (err) {
        const msg = (err as Error).message;
        modeErrors.push(`mode ${mode}: ${msg}`);
        logger.warn(
          `[BeatMoneyLoop] MaxCore mode ${mode} unavailable — ${msg}`,
        );
      }
    }

    // MaxCore is the ONLY audio source — fail the cycle explicitly.
    await fsPromises.rm(outputDir, { recursive: true, force: true }).catch(
      (cleanupErr) =>
        logger.warn(
          { err: cleanupErr, outputDir },
          "[BeatMoneyLoop] Failed to remove unsuccessful generation scratch directory",
        ),
    );
    throw new Error(
      `MaxCore audio generation failed (MaxCore subsystem is the only allowed source) — ${modeErrors.join("; ")}`,
    );
  }

  /**
   * Median price of the 50 most-recent published beats in the same genre × 0.95.
   * Falls back to $29.99 if no comparable listings.
   */
  private async _competitivePrice(genre: string): Promise<number> {
    const rows = await db
      .select({ price: beats.price })
      .from(beats)
      .where(and(eq(beats.isPublished, true), eq(beats.genre, genre)))
      .orderBy(desc(beats.createdAt))
      .limit(50);
    if (rows.length === 0) return FALLBACK_PRICE;
    const sorted = rows
      .map((r) => r.price)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    if (sorted.length === 0) return FALLBACK_PRICE;
    const median = sorted[Math.floor(sorted.length / 2)];

    // ── Self-optimization: adapt the price factor to real demand ──────────
    // Genres with actual downloads can bear a higher price (up to +15% over
    // median); genres with 3+ listings and zero downloads discount to move
    // inventory. Falls back to the static undercut factor when history is
    // thin or the lookup fails.
    let factor = PRICE_UNDERCUT_FACTOR;
    try {
      const perf = await this._genrePerformance();
      const stats = perf.get(this._genreKey(genre));
      if (stats) {
        if (stats.downloads > 0) {
          factor = Math.min(
            1.15,
            PRICE_UNDERCUT_FACTOR + 0.05 * Math.min(4, stats.downloads),
          );
        } else if (stats.cycles >= 3) {
          factor = 0.85;
        }
        if (factor !== PRICE_UNDERCUT_FACTOR) {
          logger.info(
            `[BeatMoneyLoop] price self-opt: genre=${genre} cycles=${stats.cycles} downloads=${stats.downloads} → factor ${factor.toFixed(2)} (base ${PRICE_UNDERCUT_FACTOR})`,
          );
        }
      }
    } catch {
      /* keep static factor */
    }

    const competitive = Math.max(9.99, +(median * factor).toFixed(2));
    return competitive;
  }

  /** Normalize genre spellings so history aggregates correctly (lo_fi/lofi, r&b/rnb). */
  private _genreKey(genre: string): string {
    return genre.toLowerCase().replace(/[-_\s]/g, "").replace("&", "n");
  }

  /**
   * Self-optimization data source: per-genre outcomes from recent cycles.
   * Uses ONLY real backfilled metrics (plays/downloads/revenueCents written
   * by analyseRecentCycles) — no fabricated scores.
   */
  private async _genrePerformance(): Promise<
    Map<
      string,
      { cycles: number; plays: number; downloads: number; revenueCents: number }
    >
  > {
    const rows = await db
      .select({
        scanContext: beatMoneyLoopCycles.scanContext,
        plays: beatMoneyLoopCycles.plays,
        downloads: beatMoneyLoopCycles.downloads,
        revenueCents: beatMoneyLoopCycles.revenueCents,
      })
      .from(beatMoneyLoopCycles)
      .where(
        and(
          inArray(beatMoneyLoopCycles.status, [
            "completed",
            "listed",
            "awaiting_sale",
            "sold",
          ]),
          gte(
            beatMoneyLoopCycles.startedAt,
            new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .limit(500);

    const map = new Map<
      string,
      { cycles: number; plays: number; downloads: number; revenueCents: number }
    >();
    for (const row of rows) {
      const g = (row.scanContext as { genre?: string } | null)?.genre;
      if (!g) continue;
      const key = this._genreKey(g);
      const agg = map.get(key) ?? {
        cycles: 0,
        plays: 0,
        downloads: 0,
        revenueCents: 0,
      };
      agg.cycles += 1;
      agg.plays += row.plays ?? 0;
      agg.downloads += row.downloads ?? 0;
      agg.revenueCents += row.revenueCents ?? 0;
      map.set(key, agg);
    }
    return map;
  }


  /** Upload WAV bytes to hybrid storage + insert beats row. Returns beat id. */
  private async _createBeatRecord(args: {
    scan: { genre: string; mood: string; tempo: number; hooks: string[] };
    price: number;
    audioAbsPath: string;
    previewAbsPath?: string;
    title: string;
    musicalKey?: string;
  }): Promise<{
    beatId: string;
    listingId: string;
  }> {
    const adminId = await this._requireAdminId();
    const keyDisplay = args.musicalKey || "C Minor";

    // Read the WAV bytes from the private scratch directory and persist them
    // before creating any buyer-facing rows.
    const buf = await fsPromises.readFile(args.audioAbsPath);
    const filename = path.basename(args.audioAbsPath);
    // storageService.uploadFile(buffer, category, filename, contentType): Promise<string>
    const storageKey = await storageService.uploadFile(
      buf,
      "beats",
      filename,
      "audio/wav",
    );
    const audioUrl = `/api/marketplace/audio/${storageKey}`;

    // Upload the 30 s preview clip. Never expose a full-length source file as
    // an audition asset; a preview failure must fail the listing cycle.
    let previewUrl = "";
    let previewKey: string | null = null;
    if (args.previewAbsPath && args.previewAbsPath !== args.audioAbsPath) {
      try {
        const previewBuf = await fsPromises.readFile(args.previewAbsPath);
        const previewFilename = path.basename(args.previewAbsPath);
        previewKey = await storageService.uploadFile(
          previewBuf,
          "beats",
          previewFilename,
          "audio/wav",
        );
        previewUrl = `/api/marketplace/audio/${previewKey}`;
      } catch (previewUploadErr) {
        await storageService.deleteFile(storageKey).catch((cleanupErr) =>
          logger.warn(
            { err: cleanupErr },
            "[BeatMoneyLoop] Could not remove full audio after preview upload failed",
          ),
        );
        throw new Error(
          `Beat preview upload failed; listing was not created: ${(previewUploadErr as Error).message}`,
        );
      }
    } else {
      await storageService.deleteFile(storageKey).catch((cleanupErr) =>
        logger.warn(
          { err: cleanupErr },
          "[BeatMoneyLoop] Could not remove full audio after preview was missing",
        ),
      );
      throw new Error(
        "Beat preview is missing; refusing to publish a full-length file as the audition clip",
      );
    }

    // Generate cover artwork via MaxCore image endpoint — fire-and-forget if it
    // fails, so a slow image render never aborts the upload step.
    let artworkUrl: string | null = null;
    let createdArtworkKey: string | null = null;
    try {
      const base = getMaxcoreOriginOrDefault();
      const aiKey = getMaxcoreGenerationKey();
      const artPrompt =
        `${args.scan.mood} ${args.scan.genre} music producer — album cover art, cinematic, high contrast`;
      // Deliberately NOT awareness-injected: /generate/image renders its
      // input as a literal PIL typographic card (see maxcore-image-pil-card
      // memory) - unverified extra fields risk bleeding into the rendered
      // artwork as garbled overlaid text, so this endpoint is excluded from
      // the awareness cascade rollout rather than risking corrupted cover art.
      const artRes = await fetch(`${base}/api/generate/image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(aiKey ? { Authorization: `Bearer ${aiKey}` } : {}),
        },
        body: JSON.stringify({
          prompt: artPrompt,
          platform: "instagram",
          style: "cinematic",
          aspect_ratio: "1:1",
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (artRes.ok) {
        const artData = (await artRes.json()) as { url?: string; image_url?: string; outputs?: Array<{ url?: string }> };
        const rawUrl =
          artData.url ??
          artData.image_url ??
          artData.outputs?.[0]?.url;
        if (rawUrl) {
          const sourceUrl = /^https?:\/\//i.test(rawUrl)
            ? rawUrl
            : `${base}${rawUrl}`;
          if (new URL(sourceUrl).origin !== new URL(base).origin) {
            throw new Error("MaxCore returned artwork URL on an unexpected origin");
          }
          const download = await fetch(sourceUrl, {
            headers: aiKey ? { Authorization: `Bearer ${aiKey}` } : {},
            signal: AbortSignal.timeout(60_000),
          });
          if (!download.ok) {
            throw new Error(`MaxCore artwork download HTTP ${download.status}`);
          }
          const contentType = download.headers.get("content-type") ?? "";
          if (!contentType.startsWith("image/")) {
            throw new Error(`MaxCore artwork returned unexpected content type: ${contentType || "missing"}`);
          }
          createdArtworkKey = await storageService.uploadFile(
            Buffer.from(await download.arrayBuffer()),
            "beat-artwork",
            `beat-artwork-${randomBytes(8).toString("hex")}.${contentType.split("/")[1].split(";")[0]}`,
            contentType,
          );
          artworkUrl = await storageService.getDownloadUrl(createdArtworkKey);
        }
      }
    } catch (_artErr) {
      // Non-fatal — beat still gets listed without artwork
      if (createdArtworkKey) {
        await storageService.deleteFile(createdArtworkKey).catch((cleanupErr) =>
          logger.warn(
            { err: cleanupErr },
            "[BeatMoneyLoop] Could not remove artwork whose public URL could not be created",
          ),
        );
        createdArtworkKey = null;
      }
      logger.warn("[BeatMoneyLoop] Artwork generation skipped (non-fatal)");
    }

    const tags = Array.from(
      new Set([
        args.scan.genre,
        args.scan.mood,
        "type beat",
        "beatsforsale",
        "producer",
        ...args.scan.hooks.filter((h): h is string => typeof h === "string").map((h) => h.toLowerCase().split(" ").slice(0, 2).join("")).slice(0, 3),
      ]),
    ).filter(Boolean);

    // A beat is sellable only when all three records exist: the source beat,
    // the buyer-facing listing, and its royalty ownership. Keep those database
    // writes atomic; a failed split/listing must fail the cycle rather than
    // leave an invisible beat or a chargeable listing with no booked owner.
    try {
      const created = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(beats)
          .values({
            userId: adminId,
            title: args.title,
            description: this._buildBeatDescription(args.scan, args.price),
            price: args.price,
            genre: args.scan.genre,
            bpm: args.scan.tempo,
            key: keyDisplay,
            audioUrl,
            artworkUrl,
            licenseType: "basic",
            tags,
            isPublished: true,
          })
          .returning({ id: beats.id });

        await tx.insert(royaltySplits).values({
          releaseId: created.id,
          userId: adminId,
          collaboratorName: "Platform Admin",
          // _requireAdminId() above only resolves an admin matching this required
          // environment value, so the non-null assertion is a real invariant.
          collaboratorEmail: process.env.ADMIN_EMAIL!,
          role: "producer",
          percentage: 100,
          status: "active",
          metadata: {
            source: "beat-money-loop",
            beatId: created.id,
            genre: args.scan.genre,
            mood: args.scan.mood,
            listingDate: new Date().toISOString(),
          } as Record<string, unknown>,
        });

        const [listing] = await tx
          .insert(listings)
          .values({
            userId: adminId,
            title: args.title,
            description: this._buildBeatDescription(args.scan, args.price),
            priceCents: Math.round(args.price * 100),
            category: args.scan.genre,
            audioUrl,
            artworkUrl,
            previewUrl,
            isPublished: true,
            metadata: {
              source: "beat-money-loop",
              genre: args.scan.genre,
              mood: args.scan.mood,
              bpm: args.scan.tempo,
              key: keyDisplay,
              tempo: args.scan.tempo,
              licenseType: "basic",
              tags,
              // `beatId` is the payment flow's royalty lookup key; retain
              // sourceBeatId for existing marketplace queries/backfills.
              beatId: created.id,
              sourceBeatId: created.id,
            },
          })
          .returning({ id: listings.id });
        return { beatId: created.id, listingId: listing.id };
      });
      const { beatId, listingId } = created;
      distributedCache.invalidatePattern("marketplace:beats:*").catch(() => {});
      logger.info(
        `[BeatMoneyLoop] Marketplace listing ${listingId} and 100% royalty split created for beat ${beatId}`,
      );

      return { beatId, listingId };
    } catch (createErr) {
      await Promise.allSettled([
        storageService.deleteFile(storageKey),
        ...(previewKey ? [storageService.deleteFile(previewKey)] : []),
        ...(createdArtworkKey
          ? [storageService.deleteFile(createdArtworkKey)]
          : []),
      ]);
      throw createErr;
    }
  }

  /** Render the beat itself as postable video for connected social platforms. */
  private async _renderAdVideo(
    audioAbsPath: string,
  ): Promise<{ absPath: string; storageUrl: string }> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const run = promisify(execFile);
    const outDir = path.dirname(audioAbsPath);
    const filename = `beat_ad_${Date.now()}_${randomBytes(6).toString("hex")}.mp4`;
    const absPath = path.join(outDir, filename);

    await run(
      "ffmpeg",
      [
        "-y",
        "-i",
        audioAbsPath,
        "-filter_complex",
        "color=c=0x0e0e16:s=720x720:d=45[bg];" +
          "[0:a]showwaves=s=720x600:mode=cline:colors=0x8b5cf6|0x22d3ee[w];" +
          "[bg][w]overlay=(W-w)/2:(H-h)/2[v]",
        "-map",
        "[v]",
        "-map",
        "0:a",
        "-t",
        "45",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        absPath,
      ],
      { timeout: 120_000 },
    );

    const st = await fsPromises.stat(absPath);
    if (st.size < 10_240) {
      throw new Error(`rendered ad video too small (${st.size} bytes)`);
    }

    // PDIM is the durable media store. The local file is used only for this
    // synchronous dispatch; runCycle removes the containing scratch directory.
    const storageKey = await storageService.uploadFile(
      await fsPromises.readFile(absPath),
      "beat-ad-videos",
      filename,
      "video/mp4",
    );
    const publicUrl =
      getPublicAppOrigin() + (await storageService.getDownloadUrl(storageKey));
    return { absPath, storageUrl: publicUrl };
  }

  /**
   * Create and dispatch a zero-budget organic campaign for this cycle's
   * marketplace listing. A campaign is never treated as evidence of a sale.
   */
  private async _launchCampaign(args: {
    cycleId: string;
    beatId: string;
    listingId: string;
    scan: { genre: string; mood: string; tempo: number; hooks: string[] };
    price: number;
    title: string;
    audioAbsPath: string;
  }): Promise<AdvertiseOutcome> {
    let campaignId: string | null = null;
    try {
      const adminId = await this._requireAdminId();
      const hashtags = normalizeHashtags([], args.scan.genre, "instagram");
      const caption = await this._generateMaxCoreCaption(args, hashtags);

      const [campaign] = await db
        .insert(adCampaigns)
        .values({
          userId: adminId,
          name: `[BML] ${args.title}`,
          platform: PLATFORMS_FOR_CAMPAIGN[0],
          objective: "beat_sales",
          budget: 0,
          status: "draft",
          targetAudience: {
            genre: args.scan.genre,
            mood: args.scan.mood,
            tempo: args.scan.tempo,
            niche: "producers, artists, rappers, content creators",
            hooks: args.scan.hooks,
          },
          metadata: {
            source: "beat-money-loop",
            cycleId: args.cycleId,
            beatId: args.beatId,
            listingId: args.listingId,
            price: args.price,
            fanOutPlatforms: [...PLATFORMS_FOR_CAMPAIGN],
          },
        })
        .returning({ id: adCampaigns.id });
      campaignId = campaign.id;
      await db
        .update(beatMoneyLoopCycles)
        .set({ campaignId: campaign.id })
        .where(eq(beatMoneyLoopCycles.id, args.cycleId));

      let video: { absPath: string; storageUrl: string };
      try {
        video = await this._renderAdVideo(args.audioAbsPath);
      } catch (err) {
        // Do not post a raw WAV or a text-only substitute when the intended
        // creative is the beat itself.
        await db
          .update(adCampaigns)
          .set({ status: "paused" })
          .where(eq(adCampaigns.id, campaign.id));
        return {
          campaignId: campaign.id,
          posted: false,
          reason: `Ad video render failed; social dispatch skipped: ${(err as Error).message}`,
        };
      }
      const mediaUrl = video.storageUrl;
      const mediaLocalPath = video.absPath;

      const [creative] = await db
        .insert(adCreatives)
        .values({
          userId: adminId,
          campaignId: campaign.id,
          name: `[BML] ${args.title}`,
          type: "social_post",
          headline: args.title,
          description: caption,
          mediaUrl,
          callToAction: "License This Beat",
          landingUrl: getBeatLandingUrl(args.listingId),
          status: "active",
          variants: {
            localMediaPath: mediaLocalPath,
            kind: "beat-audio-video",
          },
        })
        .returning({ id: adCreatives.id });
      await db
        .update(adCampaigns)
        .set({ creativeIds: [creative.id] })
        .where(eq(adCampaigns.id, campaign.id));

      const result = await advertisingDispatchService.activateCampaign(
        campaign.id,
        adminId,
      );
      const postsCreated = result.results?.postsCreated ?? 0;
      if (result.success && postsCreated > 0) {
        logger.info(
          `[BeatMoneyLoop] campaign ${campaign.id} posted to ${result.results!.platformsUsed.join(", ")} (${postsCreated} posts)`,
        );
        return {
          campaignId: campaign.id,
          posted: true,
          reason: result.message,
        };
      }

      const platformErrors = result.results?.errors ?? [];
      const details = platformErrors.length
        ? platformErrors.join("; ")
        : result.error || result.message || "No social posts were created";
      const reason = `No social posts were created: ${details}`;
      logger.warn(
        `[BeatMoneyLoop] campaign ${campaign.id} was not posted: ${reason}`,
      );
      return { campaignId: campaign.id, posted: false, reason };
    } catch (err) {
      const reason = (err as Error).message || String(err);
      logger.warn({ err }, "[BeatMoneyLoop] advertise step failed");
      return { campaignId, posted: false, reason };
    }
  }

  /** Generate MaxCore-backed, listing-specific copy for the campaign. */
  private async _generateMaxCoreCaption(
    args: {
      beatId: string;
      listingId: string;
      scan: { genre: string; mood: string; tempo: number; hooks: string[] };
      price: number;
      title: string;
    },
    hashtags: string[],
  ): Promise<string> {
    const listenUrl = getBeatLandingUrl(args.listingId);
    const awareness = await getAwarenessContext("music");
    const mcRaw = await MaxCoreAIClient.infer<{
      hook?: string;
      body?: string;
      cta?: string;
      caption?: string;
      hashtags?: string[];
      variants?: Array<{
        hook?: string;
        body?: string;
        cta?: string;
        hashtags?: string[];
      }>;
    }>("/api/generate/content", {
      ...awareness,
      platform: "instagram",
      content_type: "post",
      topic: args.title,
      tone: "hype",
      quality: "professional",
      content_tier: "peak",
      genre: args.scan.genre,
      mood: args.scan.mood,
      include_hashtags: true,
      goal: "drive_purchase",
      cta: "License this beat — link in bio",
      beat_context: {
        title: args.title,
        bpm: args.scan.tempo,
        price: args.price,
        license_type: "non-exclusive",
        marketplace: "MaxBooster",
        action: "license_beat",
        production_details:
          args.scan.hooks.slice(0, 3).join("; ") || args.scan.mood,
        listen_url: listenUrl,
        ...(awareness?.contextString
          ? { trend_context: awareness.contextString }
          : {}),
      },
      platform_constraints: {
        allow_link_in_bio: true,
        cta_style: "direct_sale",
      },
    });

    if (!mcRaw) throw new Error("MaxCore returned no caption");
    const candidate =
      mcRaw.variants && mcRaw.variants.length > 0
        ? selectBestVariant(mcRaw.variants)
        : mcRaw;
    const candidateCaption = (candidate as { caption?: string } | null)
      ?.caption;
    if (!candidate || (!candidate.hook && !candidateCaption)) {
      throw new Error("MaxCore returned no usable caption content");
    }

    const cleaned = cleanMaxCoreContent({
      body: candidate.body || candidateCaption || "",
      hook: candidate.hook || "",
      cta: candidate.cta || "",
      hashtags: Array.isArray(candidate.hashtags)
        ? candidate.hashtags
        : hashtags,
      genre: args.scan.genre,
      platform: "instagram",
      mood: args.scan.mood,
      title: args.title,
      isBeatPost: true,
    });
    const tagStr = normalizeHashtags(
      cleaned.hashtags,
      args.scan.genre,
      "instagram",
    ).join(" ");

    return [cleaned.hook, cleaned.body, cleaned.cta, tagStr]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  /**
   * Generate a real marketplace-quality beat description — no placeholder text.
   * Reads like a producer wrote it, not a script.
   */
  private _buildBeatDescription(
    scan: { genre: string; mood: string; tempo: number; hooks: string[] },
    price: number,
  ): string {
    // Fix 8: three-sentence structure — emotional lead, production detail,
    // target artist type. Buyers make decisions here; specs alone don't close.

    // Sentence 1: emotional feel — what this beat makes you feel, not BPM/key
    const emotionalLeadMap: Record<string, string> = {
      dark:       "A cinematic beat built for artists who paint pictures with words — raw, atmospheric, and impossible to skip.",
      empowering: "An anthem-grade production built for artists who make records that move rooms.",
      driven:     "High-momentum energy that demands a verse with something to prove.",
      aggressive: "Hard-hitting production with no filler — made for artists who don't pull punches.",
      melancholy: "Emotionally rich and cinematic — the kind of beat that turns a journal entry into a record.",
      chill:      "Smooth, late-night energy that gives artists room to breathe, flow, and say something real.",
      upbeat:     "Feel-good and infectious — the kind of record listeners play twice before they even know why.",
      mysterious: "Dark and layered with a hook that lingers long after the track ends.",
      euphoric:   "Euphoric energy that lifts the room — built for moments that matter.",
      romantic:   "Warm and intimate production that gives love songs the sonic space they deserve.",
    };
    const moodKey = (scan.mood ?? "").toLowerCase();
    const emotionalLead =
      emotionalLeadMap[moodKey] ??
      `${scan.mood.charAt(0).toUpperCase() + scan.mood.slice(1)} energy with the kind of production that sticks.`;

    // Sentence 2: specific production elements that differentiate this beat
    const productionDetailMap: Record<string, string> = {
      trap:      "Features rolling hi-hats, punchy 808s, and layered synth textures at " + scan.tempo + " BPM.",
      drill:     "Dark sliding 808s, staccato hi-hats, and cinematic strings locked at " + scan.tempo + " BPM.",
      rnb:       "Smooth chord stabs, warm bass, and live-feel percussion at " + scan.tempo + " BPM.",
      "r&b":     "Smooth chord stabs, warm bass, and live-feel percussion at " + scan.tempo + " BPM.",
      hiphop:    "Sampled-feel drums, deep sub bass, and melodic layers at " + scan.tempo + " BPM.",
      "hip-hop": "Sampled-feel drums, deep sub bass, and melodic layers at " + scan.tempo + " BPM.",
      afrobeats: "Percussive rhythm beds, bright plucks, and afro-swing groove at " + scan.tempo + " BPM.",
      dancehall: "Riddim-ready percussion, catchy melody loops, and sub bass at " + scan.tempo + " BPM.",
      pop:       "Punchy drums, ear-catching hooks, and radio-ready arrangement at " + scan.tempo + " BPM.",
      indie:     "Live-textured drums, guitar-adjacent tones, and lo-fi warmth at " + scan.tempo + " BPM.",
      lo_fi:     "Dusty samples, mellow chords, and a boom-bap swing at " + scan.tempo + " BPM.",
      jazz:      "Neo-soul chord progressions, brushed drums, and melodic bass at " + scan.tempo + " BPM.",
    };
    const genreKey = (scan.genre ?? "").toLowerCase().replace(/[-\s]/g, "");
    const productionDetail =
      productionDetailMap[(scan.genre ?? "").toLowerCase()] ||
      productionDetailMap[genreKey] ||
      `Professionally arranged at ${scan.tempo} BPM with full mix headroom.`;

    // Sentence 3: artist type comparison — the question every buyer asks is
    // "is this for someone like me?" Answer it directly.
    const artistTypeMap: Record<string, string> = {
      trap:      "Ideal for introspective trap, story-driven rap, and cinematic R&B — think Cole, Kendrick, or JID.",
      drill:     "Built for UK and Brooklyn drill — artists in the lane of Central Cee, Pop Smoke, or Fivio.",
      rnb:       "Perfect for modern R&B vocalists and neo-soul artists who write with feeling first.",
      "r&b":     "Perfect for modern R&B vocalists and neo-soul artists who write with feeling first.",
      hiphop:    "Made for lyricists who have something to say — classic boom-bap energy, modern mix.",
      "hip-hop": "Made for lyricists who have something to say — classic boom-bap energy, modern mix.",
      afrobeats: "For Afrobeats and Afropop artists who move between genres — the lane of Burna, Wizkid, and Rema.",
      dancehall: "Caribbean artists and global pop crossovers — think Sean Paul, Popcaan, or Kranium.",
      pop:       "Radio-ready for pop and crossover artists building a streaming catalogue.",
      indie:     "Indie artists and alternative singer-songwriters who value texture over trend.",
      lo_fi:     "Content creators, study channels, and chill-hop artists who need something timeless.",
      jazz:      "Neo-soul and jazz-influenced artists in the lane of Sampha, Sault, or Thundercat.",
    };
    const artistType =
      artistTypeMap[(scan.genre ?? "").toLowerCase()] ||
      artistTypeMap[genreKey] ||
      "Built for independent artists who take their craft seriously.";

    const cleanPrice = Math.round(price);
    return `${emotionalLead} ${productionDetail} ${artistType} Non-exclusive lease from $${cleanPrice} — exclusive rights available on request.`;
  }

  /**
   * Compute next cadence based on industry confidence + outcome history.
   * - failed cycle and consecutiveFailures will be ≥2  → 12 h backoff
   * - high confidence (≥0.7)                          → 2 h
   * - medium confidence (≥0.5)                        → 4 h
   * - low confidence (≥0.3)                           → 6 h
   * - else                                            → 12 h
   * Clamped to [MIN_CADENCE_MS, MAX_CADENCE_MS].
   */
  private _computeNextCadenceMs(
    scan: BeatAudioContext | null,
    failed: boolean,
    _state: BeatMoneyLoopState | null,
  ): number {
    if (failed) return FAILURE_BACKOFF_CADENCE_MS;
    if (!scan) return DEFAULT_CADENCE_MS;
    const confidence =
      typeof scan.confidence === "number" && Number.isFinite(scan.confidence)
        ? scan.confidence
        : null;
    // Missing confidence is not evidence of a low-confidence trend scan. Use
    // the documented normal cadence until a numeric awareness signal exists.
    if (confidence === null) return DEFAULT_CADENCE_MS;
    let ms: number;
    if (confidence >= 0.7) ms = 2 * 60 * 60 * 1000;
    else if (confidence >= 0.5) ms = 4 * 60 * 60 * 1000;
    else if (confidence >= 0.3) ms = 6 * 60 * 60 * 1000;
    else ms = 12 * 60 * 60 * 1000;
    return Math.max(MIN_CADENCE_MS, Math.min(MAX_CADENCE_MS, ms));
  }

  /** Update singleton state after a cycle. */
  private async _updateStateAfterCycle(args: {
    success: boolean;
    nextRunAt: Date;
    cadence: number;
  }): Promise<void> {
    const state = await this._ensureStateRow();
    const consecutiveFailures = args.success
      ? 0
      : state.consecutiveFailures + 1;
    await db
      .update(beatMoneyLoopState)
      .set({
        nextRunAt: args.nextRunAt,
        lastCycleAt: new Date(),
        totalCycles: state.totalCycles + 1,
        successfulCycles: state.successfulCycles + (args.success ? 1 : 0),
        failedCycles: state.failedCycles + (args.success ? 0 : 1),
        consecutiveFailures,
        currentCadenceMs: args.cadence,
        updatedAt: new Date(),
      })
      .where(eq(beatMoneyLoopState.id, STATE_ROW_ID));
  }

  /**
   * Refresh beat engagement and marketplace-settled seller earnings.
   * Revenue is USD seller allocation net of current refund/dispute
   * compensation; cash payouts are not subtracted. Downloads and asking price
   * are not evidence of a paid sale.
   */
  async analyseRecentCycles(): Promise<{ updated: number }> {
    const cycles = await db
      .select()
      .from(beatMoneyLoopCycles);

    // A generated beat can be counted by more than one recovered cycle row.
    // Attribute its engagement and earnings once, to the earliest cycle.
    cycles.sort((a, b) => {
      const startedAtDelta =
        (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0);
      return startedAtDelta || String(a.id).localeCompare(String(b.id));
    });
    const cycleByBeatId = new Map<string, string>();
    for (const cycle of cycles) {
      if (!cycle.beatId) continue;
      const firstCycleId = cycleByBeatId.get(cycle.beatId);
      if (firstCycleId) {
        logger.warn(
          { beatId: cycle.beatId, firstCycleId, duplicateCycleId: cycle.id },
          "Multiple Beat Money Loop cycles reference one beat; duplicate metrics are excluded",
        );
        continue;
      }
      cycleByBeatId.set(cycle.beatId, cycle.id);
    }

    const beatIds = [...cycleByBeatId.keys()];
    const beatRows = beatIds.length
      ? await db
          .select({
            id: beats.id,
            plays: beats.plays,
            downloads: beats.downloads,
          })
          .from(beats)
          .where(inArray(beats.id, beatIds))
      : [];
    const beatsById = new Map(beatRows.map((beat) => [beat.id, beat]));

    const beatIdExpression = sql<string>`${listings.metadata}->>'beatId'`;
    const completedMarketplaceSales = beatIds.length
      ? await db
          .select({
            beatId: beatIdExpression,
            settledAt: commerceSources.createdAt,
          })
          .from(listings)
          .innerJoin(orders, eq(orders.listingId, listings.id))
          .innerJoin(
            commerceSources,
            and(
              eq(commerceSources.id, orders.id),
              eq(commerceSources.kind, "marketplace"),
            ),
          )
          .where(
            and(
              sql`${listings.metadata}->>'source' = 'beat-money-loop'`,
              inArray(beatIdExpression, beatIds),
              eq(orders.status, "completed"),
            ),
          )
          .orderBy(asc(commerceSources.createdAt))
      : [];
    const settledAtByBeatId = new Map<string, Date>();
    for (const sale of completedMarketplaceSales) {
      if (sale.beatId && sale.settledAt && !settledAtByBeatId.has(sale.beatId)) {
        settledAtByBeatId.set(sale.beatId, new Date(sale.settledAt));
      }
    }

    const sellerEarnings = beatIds.length
      ? await db
          .select({
            beatId: beatIdExpression,
            orderCurrency: orders.currency,
            sourceCurrency: commerceSources.currency,
            allocationCurrency: commerceAllocations.currency,
            cents: sql<number>`COALESCE(SUM(GREATEST(
              ${commerceAllocations.amountCents} - ${commerceAllocations.reversedCents},
              0
            )), 0)`,
          })
          .from(listings)
          .innerJoin(orders, eq(orders.listingId, listings.id))
          .innerJoin(
            commerceSources,
            and(
              eq(commerceSources.id, orders.id),
              eq(commerceSources.kind, "marketplace"),
            ),
          )
          .innerJoin(
            commerceAllocations,
            and(
              eq(commerceAllocations.sourceId, commerceSources.id),
              eq(commerceAllocations.userId, orders.sellerId),
            ),
          )
          .where(
            and(
              sql`${listings.metadata}->>'source' = 'beat-money-loop'`,
              inArray(beatIdExpression, beatIds),
              eq(orders.status, "completed"),
            ),
          )
          .groupBy(
            beatIdExpression,
            orders.currency,
            commerceSources.currency,
            commerceAllocations.currency,
          )
      : [];
    const earningsByBeatId = new Map<string, number>();
    const excludedCurrencyByBeatId = new Map<string, Set<string>>();
    for (const row of sellerEarnings) {
      const orderCurrency = String(row.orderCurrency).toLowerCase();
      const sourceCurrency = String(row.sourceCurrency).toLowerCase();
      const allocationCurrency = String(row.allocationCurrency).toLowerCase();
      if (
        orderCurrency === "usd" &&
        sourceCurrency === orderCurrency &&
        allocationCurrency === orderCurrency
      ) {
        earningsByBeatId.set(
          row.beatId,
          (earningsByBeatId.get(row.beatId) ?? 0) +
            Math.max(0, Number(row.cents) || 0),
        );
        continue;
      }
      const currencies = excludedCurrencyByBeatId.get(row.beatId) ?? new Set();
      currencies.add(
        `${orderCurrency}/${sourceCurrency}/${allocationCurrency}`,
      );
      excludedCurrencyByBeatId.set(row.beatId, currencies);
    }
    if (excludedCurrencyByBeatId.size > 0) {
      logger.warn(
        {
          beats: excludedCurrencyByBeatId.size,
          currencyTriples: [
            ...new Set(
              [...excludedCurrencyByBeatId.values()].flatMap((values) => [
                ...values,
              ]),
            ),
          ],
        },
        "Non-USD or inconsistent commerce earnings were excluded from Beat Money Loop USD revenue",
      );
    }

    let updated = 0;
    for (const cycle of cycles) {
      const isPrimaryCycle =
        Boolean(cycle.beatId) &&
        cycleByBeatId.get(cycle.beatId!) === cycle.id;
      const beat = cycle.beatId ? beatsById.get(cycle.beatId) : undefined;
      const plays = isPrimaryCycle ? (beat?.plays ?? 0) : 0;
      const downloads = isPrimaryCycle ? (beat?.downloads ?? 0) : 0;
      const revenueCents =
        isPrimaryCycle && cycle.beatId
          ? earningsByBeatId.get(cycle.beatId) ?? 0
          : 0;
      const saleAt =
        isPrimaryCycle && cycle.beatId
          ? settledAtByBeatId.get(cycle.beatId)
          : undefined;
      const sold = Boolean(saleAt);
      const shouldUpdateStatus = sold && cycle.status !== "sold";
      if (
        plays !== cycle.plays ||
        downloads !== cycle.downloads ||
        revenueCents !== cycle?.revenueCents ||
        shouldUpdateStatus ||
        (saleAt && cycle.completedAt?.getTime() !== saleAt.getTime())
      ) {
        await db
          .update(beatMoneyLoopCycles)
          .set({
            plays,
            downloads,
            revenueCents,
            ...(saleAt
              ? {
                  status: "sold",
                  completedAt: saleAt,
                }
              : {}),
          })
          .where(eq(beatMoneyLoopCycles.id, cycle.id));
        updated++;
      }
    }
    const total = await db
      .select({
        sum: sql<number>`COALESCE(SUM(${beatMoneyLoopCycles.revenueCents}), 0)`,
      })
      .from(beatMoneyLoopCycles);
    await db
      .update(beatMoneyLoopState)
      .set({
        totalRevenueCents: Math.max(0, Number(total[0]?.sum) || 0),
        updatedAt: new Date(),
      })
      .where(eq(beatMoneyLoopState.id, STATE_ROW_ID));
    return { updated };
  }
}

export const beatMoneyLoopService = new BeatMoneyLoopService();
