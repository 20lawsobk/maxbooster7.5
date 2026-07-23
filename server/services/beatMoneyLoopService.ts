/**
 * Beat Money Loop Service
 * =======================
 * Admin-only autonomous revenue loop:
 *   1. SCAN   — pull live music-industry context (trending genre / mood / tempo)
 *               from musicIndustryContextFilter (which is fed by industryMonitorService).
 *   2. GENERATE — request a beat WAV from the EXTERNAL MaxCore server ONLY
 *               (Mode C: AI from 8 TB dataset, then Mode B: HD DSP). There is
 *               NO local fallback — if MaxCore is unreachable the cycle fails
 *               explicitly. The scan context is forwarded so generation is
 *               biased toward what's trending.
 *   3. PRICE  — compute competitive price = median(recent published beats in
 *               same genre) × 0.95 (5 % undercut). Falls back to $29.99.
 *   4. UPLOAD — insert a row into `beats` (admin-owned, published) and upload
 *               the WAV bytes to PDIM via storageService.uploadFile.
 *   5. ADVERTISE — call autonomousService.launchCampaign() with the beat as
 *               asset. Budget=0; the ad system uses MaxCore/PDIM custom AI
 *               for organic distribution, no paid spend.
 *   6. RECORD — write a beatMoneyLoopCycles row tracking everything.
 *   7. ANALYSE — next cadence is computed from current industry confidence
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

import { db } from "../db.js";
import {
  beats,
  listings,
  beatMoneyLoopState,
  beatMoneyLoopCycles,
  adCampaigns,
  adCreatives,
  users,
  type BeatMoneyLoopState,
  type BeatMoneyLoopCycle,
} from "@shared/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import {
  musicIndustryContextFilter,
  type MusicIndustryContext,
} from "./musicIndustryContextFilter.js";
import { storageService } from "./storageService.js";
import { distributedCache } from "../infrastructure/distributedCache.js";
import {
  normalizeHashtags,
  cleanMaxCoreContent,
  selectBestVariant,
} from "../lib/contentPostProcessor.js";
import { MaxCoreAIClient } from "./unifiedAIController.js";
import { autonomousService } from "./autonomousService.js";
import { advertisingDispatchService } from "./advertisingDispatchService.js";
import path from "path";
import fsPromises from "fs/promises";
import { randomBytes } from "crypto";

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

// All platforms the admin account can have connected. Expired tokens are
// filtered out at the storage layer (getUserSocialToken), so this list is
// safe to include broadly — platforms without valid tokens skip gracefully.
const PLATFORMS_FOR_CAMPAIGN = [
  "instagram", "facebook", "tiktok", "twitter", "threads", "linkedin",
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

/** Honest outcome of the advertise step. `posted` is true ONLY when at least
 *  one social post was actually created; otherwise `reason` explains why not. */
interface AdvertiseOutcome {
  campaignId: string | null;
  posted: boolean;
  reason: string;
}

export interface RunCycleResult {
  cycleId: string;
  // 'completed' = beat listed AND ads actually posted.
  // 'listed'    = beat listed but ads were NOT posted (see error/reason).
  // 'failed'    = the cycle failed before the beat was listed.
  status: "completed" | "listed" | "failed";
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
            eq(beatMoneyLoopCycles.status, "generating"),
            // Only mark cycles that started before this server session.
            sql`${beatMoneyLoopCycles.startedAt} < ${cutoff}`,
          ),
        )
        .returning({ id: beatMoneyLoopCycles.id });
      if (orphans.length > 0) {
        logger.warn(
          `[BeatMoneyLoop] Recovered ${orphans.length} orphaned cycle(s) stuck in 'generating': ${orphans.map((r) => r.id).join(", ")}`,
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

  /** Turn the loop on. Also whitelists admin in autonomousService so campaigns auto-approve. */
  async enable(): Promise<BeatMoneyLoopStatus> {
    await this._ensureStateRow();
    // Ensure we can resolve the admin before enabling the loop.
    const adminId = await this.resolveAdminId();
    if (!adminId) {
      logger.warn(
        "[BeatMoneyLoop] Cannot enable — admin user not found. Set ADMIN_EMAIL and ensure the account exists (role='admin').",
      );
      // Return current status (loop stays disabled); caller sees enabled=false.
      return this.getStatus();
    }
    // Whitelist admin so launchCampaign() auto-approves rather than routing through approvals.
    try {
      await autonomousService.setAutonomousMode(adminId, true);
    } catch (err) {
      logger.warn(
        { err },
        "[BeatMoneyLoop] Failed to whitelist admin for autonomous mode (non-fatal)",
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
    return this.getStatus();
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
    const result = await this.runCycle("schedule");
    return {
      ran: true,
      reason: `cycle-${result.status}`,
      cycleId: result.cycleId,
    };
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

    // Create the cycle row first so failures anywhere have a row to attach to.
    const [cycleRow] = await db
      .insert(beatMoneyLoopCycles)
      .values({
        triggeredBy,
        status: "pending",
      })
      .returning();
    const cycleId = cycleRow.id;
    logger.info(
      `[BeatMoneyLoop] ▶ Cycle ${cycleId} started (trigger=${triggeredBy})${overrides ? ` overrides=${JSON.stringify(overrides)}` : ""}`,
    );

    try {
      // 1. SCAN
      const ctx = await musicIndustryContextFilter.getContextForMode("music");
      const scan = this._distillScan(ctx, overrides);
      await db
        .update(beatMoneyLoopCycles)
        .set({ status: "generating", scanContext: scan })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      logger.info(
        `[BeatMoneyLoop] ${cycleId} scan: genre=${scan.genre} mood=${scan.mood} tempo=${scan.tempo} conf=${scan.confidence.toFixed(2)}`,
      );

      // 2. GENERATE
      const { audioRelUrl, audioAbsPath, title, audioGenBackend, musicalKey } =
        await this._generateBeat(scan);
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: "uploading",
          audioGenBackend,
          beatTitle: title,
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));

      // 3. PRICE
      const price = await this._competitivePrice(scan.genre);

      // 4. UPLOAD (persist beat record + upload bytes to hybrid storage)
      const { beatId, audioUrl } = await this._createBeatRecord({
        scan,
        price,
        audioRelUrl,
        audioAbsPath,
        title,
        musicalKey,
      });
      await db
        .update(beatMoneyLoopCycles)
        .set({ status: "advertising", beatId, price })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      logger.info(
        `[BeatMoneyLoop] ${cycleId} beat ${beatId} listed at $${price.toFixed(2)}`,
      );

      // 5. ADVERTISE (organic, MaxCore/PDIM-driven — budget=0)
      const ad = await this._launchCampaign({
        beatId,
        scan,
        price,
        title,
        audioUrl,
        audioAbsPath,
      });

      // 6. RECORD outcome + schedule next.
      // Be HONEST: only mark the cycle 'completed' when ads were actually posted.
      // If the beat is listed but ads could not be sent (e.g. no connected social
      // accounts), record 'listed' with the reason instead of a false 'completed'.
      const durationMs = Date.now() - startedAt;
      const nextCadence = this._computeNextCadenceMs(
        scan,
        /* failed */ false,
        /* state */ null,
      );
      const nextRunAt = new Date(Date.now() + nextCadence);
      const finalStatus = ad.posted ? "completed" : "listed";
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: finalStatus,
          campaignId: ad.campaignId,
          errorMessage: ad.posted
            ? null
            : `Beat listed; ads not sent: ${ad.reason}`.slice(0, 1000),
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      // The beat IS live for sale regardless of ad delivery, so the cycle counts
      // as a success for cadence/backoff purposes — the ad sub-status is tracked
      // per-cycle (status + errorMessage), not as a failure.
      await this._updateStateAfterCycle({
        success: true,
        nextRunAt,
        cadence: nextCadence,
      });
      logger.info(
        `[BeatMoneyLoop] ${ad.posted ? "✅" : "⚠️"} Cycle ${cycleId} ${finalStatus} in ${durationMs}ms (ads ${ad.posted ? "posted" : "NOT posted: " + ad.reason}) — next in ${Math.round(nextCadence / 60000)} min`,
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
      const durationMs = Date.now() - startedAt;
      logger.warn(
        { err },
        `[BeatMoneyLoop] ❌ Cycle ${cycleId} failed after ${durationMs}ms: ${msg}`,
      );
      const nextCadence = this._computeNextCadenceMs(
        null,
        /* failed */ true,
        null,
      );
      const nextRunAt = new Date(Date.now() + nextCadence);
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: "failed",
          errorMessage: msg.slice(0, 1000),
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      await this._updateStateAfterCycle({
        success: false,
        nextRunAt,
        cadence: nextCadence,
      });
      return { cycleId, status: "failed", durationMs, error: msg };
    } finally {
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

  /** Pick the strongest trending genre/mood/tempo from the live industry context.
   *  When `overrides` are supplied (e.g. from a manual /run-now call), they
   *  short-circuit the random pool for that field so the caller can target a
   *  specific genre/mood/key without changing the scheduler logic. */
  private _distillScan(
    ctx: MusicIndustryContext,
    overrides?: { genre?: string; mood?: string; key?: string },
  ): {
    genre: string;
    mood: string;
    tempo: number;
    confidence: number;
    hooks: string[];
    productionStyles: string[];
    requestedKey?: string;
  } {
    // Short-circuit: if both genre AND mood are overridden, skip pool entirely.
    if (overrides?.genre && overrides?.mood) {
      const baseTemp = 120;
      const tempoJitter = Math.floor(Math.random() * 11) - 5;
      return {
        genre: overrides.genre,
        mood: overrides.mood,
        tempo: baseTemp + tempoJitter,
        confidence: 1,
        hooks: ctx.viralHookPatterns.slice(0, 5),
        productionStyles: ctx.productionStyles.slice(0, 5),
        requestedKey: overrides.key,
      };
    }

    const pickRandom = (items: string[], fallback: string): string => {
      const pool = items.filter(Boolean);
      if (pool.length === 0) return fallback;
      return pool[Math.floor(Math.random() * pool.length)];
    };

    // Full 12-genre baseline (equal weight) — context signals add 2× bias
    // without monopolising. Indie removed from the auto-schedule baseline
    // so overrepresented cycles steer toward the remaining 11 genres.
    const GENRE_BASELINE = [
      "trap", "hiphop", "r&b", "drill", "lofi", "pop",
      "electronic", "afrobeats", "dancehall", "lo_fi", "jazz",
    ];
    const MOOD_BASELINE = [
      "dark", "empowering", "chill", "aggressive", "melancholic",
      "energetic", "nostalgic", "euphoric",
    ];

    // If genre override supplied, use it directly; otherwise pick from pool.
    const genrePool: string[] = overrides?.genre
      ? [overrides.genre]
      : [
          ...GENRE_BASELINE,
          ...(ctx.generationHints.suggestedGenre
            ? [ctx.generationHints.suggestedGenre, ctx.generationHints.suggestedGenre]
            : []),
          ...(ctx.trendingGenres?.slice(0, 4) ?? []),
        ];

    const moodPool: string[] = overrides?.mood
      ? [overrides.mood]
      : [
          ...MOOD_BASELINE,
          ...(ctx.generationHints.suggestedMood
            ? [ctx.generationHints.suggestedMood, ctx.generationHints.suggestedMood]
            : []),
          ...(ctx.trendingMoods?.slice(0, 4) ?? []),
        ];

    const genre = pickRandom(genrePool, TRENDING_GENRE_FALLBACK);
    const mood = pickRandom(moodPool, TRENDING_MOOD_FALLBACK);

    // Tempo: bias from hint + ±5 BPM jitter so consecutive cycles differ.
    const baseTemp =
      ctx.generationHints.tempoBias === "up"
        ? 150
        : ctx.generationHints.tempoBias === "down"
          ? 85
          : 120;
    const tempoJitter = Math.floor(Math.random() * 11) - 5; // −5 … +5
    const tempo = baseTemp + tempoJitter;
    return {
      genre,
      mood,
      tempo,
      confidence: ctx.confidence,
      hooks: ctx.viralHookPatterns.slice(0, 5),
      productionStyles: ctx.productionStyles.slice(0, 5),
      requestedKey: overrides?.key,
    };
  }

  /**
   * Call MaxCore /generate/audio directly.
   * Mode C = MaxCore AI backend (8 TB music dataset, highest quality).
   * Mode B = HD DSP fallback (plate reverb + stereo widening, release quality).
   * Returns decoded WAV bytes + optional musical metadata from MaxCore.
   */
  private async _maxcoreAudio(
    scan: {
      genre: string;
      mood: string;
      tempo: number;
      productionStyles: string[];
      hooks: string[];
      requestedKey?: string;
    },
    mode: "C" | "B",
  ): Promise<{
    wavBytes: Buffer;
    mcKey?: string;
    mcBpm?: number;
    backend: string;
  }> {
    const base = (
      process.env.AI_SERVER_URL || "https://secure-ai-forge.replit.app"
    ).replace(/\/api\/?$/, "");
    const key = process.env.AI_SERVER_KEY || "";
    // Beat duration. Default 30 s — a full-length sellable clip.
    // Override via BEAT_DURATION_SECONDS env var (max 120 s).
    const durationSec = Math.min(
      120,
      Math.max(10, Number(process.env.BEAT_DURATION_SECONDS) || 30),
    );
    const body: Record<string, unknown> = {
      genre: scan.genre,
      bpm: scan.tempo,
      mood: scan.mood,
      duration: durationSec,
      energy: 0.8,
      mode,
    };
    // Send the requested key so MaxCore generates in that tonality, giving
    // each cycle a different key rather than always defaulting to C Minor.
    if (scan.requestedKey) body.key = scan.requestedKey;
    if (scan.productionStyles.length > 0)
      body.style = scan.productionStyles.slice(0, 3).join(", ");
    if (scan.hooks.length > 0)
      body.context = scan.hooks.slice(0, 3).join("; ");

    // Bearer ONLY — MaxCore 401s the whole request when X-API-Key/X-Admin-Key
    // are present (see replit.md / maxcore-auth-header memory).
    const authHeaders: Record<string, string> = key
      ? { Authorization: `Bearer ${key}` }
      : {};

    logger.info(
      `[BeatMoneyLoop] _maxcoreAudio mode=${mode} → POST ${base}/api/generate/audio (duration=${durationSec}s)`,
    );
    const res = await fetch(`${base}/api/generate/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(body),
      // MaxCore has NO server-side timeout — it holds the connection while it
      // wakes/works, so every abort here is OUR side killing a request that
      // would eventually succeed. Give the initial POST 15 min.
      signal: AbortSignal.timeout(900_000),
    });
    logger.info(
      `[BeatMoneyLoop] _maxcoreAudio mode=${mode} POST → HTTP ${res.status}`,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `MaxCore /generate/audio HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as {
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
    const finish = async (d: typeof data): Promise<{
      wavBytes: Buffer;
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
        return { wavBytes: Buffer.from(b64, "base64"), ...extras };
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
        const bytes = Buffer.from(await dl.arrayBuffer());
        if (bytes.length < 1_024)
          throw new Error(`MaxCore audio download too small (${bytes.length} bytes)`);
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
      // Poll budget: at least 20 min — 15 s audio renders in ~5-8 min on MaxCore;
      // 30 s audio was exceeding the old 10 min cap. Each poll has a 20 s
      // per-request timeout; individual timeouts do NOT terminate the budget.
      const pollBudgetMs = Math.max(1_200_000, durationSec * 20_000);
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
        // Terminal auth/not-found statuses will never recover — fail fast.
        if (jr.status === 401 || jr.status === 403 || jr.status === 404) {
          throw new Error(`MaxCore audio job poll HTTP ${jr.status}`);
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
          return finish(job);
        }
      }
      throw new Error(
        `MaxCore audio job did not complete within ${Math.round(pollBudgetMs / 1000)} s`,
      );
    }

    throw new Error("MaxCore returned no wav_b64");
  }

  /**
   * Generate a beat WAV — external MaxCore ONLY (no local fallback).
   * Tier 1: MaxCore Mode C  — AI audio from 8 TB music dataset.
   * Tier 2: MaxCore Mode B  — HD DSP (plate reverb, stereo, release quality).
   *
   * If both MaxCore modes fail, the cycle fails explicitly — we never list a
   * beat that wasn't produced by the external MaxCore server.
   *
   * The industry scan (genre / mood / tempo / production styles / viral hooks)
   * is forwarded to MaxCore so generation is biased toward what's trending.
   */
  // Chromatic key pool — 24 keys ensures catalog variety cycle over cycle.
  private static readonly MUSICAL_KEYS = [
    "C Major", "C Minor", "C# Minor", "Db Major",
    "D Major", "D Minor", "Eb Major", "Eb Minor",
    "E Major", "E Minor", "F Major", "F Minor",
    "F# Minor", "G Major", "G Minor",
    "Ab Major", "Ab Minor", "A Major", "A Minor",
    "Bb Major", "Bb Minor", "B Major", "B Minor",
  ];

  private async _generateBeat(scan: {
    genre: string;
    mood: string;
    tempo: number;
    productionStyles: string[];
    hooks: string[];
    requestedKey?: string;
  }): Promise<{ audioRelUrl: string; audioAbsPath: string; title: string; audioGenBackend: string; musicalKey: string }> {
    const outputDir = path.join(
      process.cwd(),
      "public",
      "generated-content",
      "audio",
    );
    await fsPromises.mkdir(outputDir, { recursive: true });

    // Use the key from the override/scan if present; otherwise pick at random.
    // IMPORTANT: MaxCore's audio endpoint always returns C Minor regardless of
    // what is requested — we must use OUR requestedKey as the canonical key and
    // not let the mc.mcMusicalKey / mc.mcKey field override it.
    const keys = BeatMoneyLoopService.MUSICAL_KEYS;
    const requestedKey =
      scan.requestedKey || keys[Math.floor(Math.random() * keys.length)];
    const scanWithKey = { ...scan, requestedKey };

    const titleAdj =
      scan.mood.charAt(0).toUpperCase() + scan.mood.slice(1);
    const titleGenre =
      scan.genre.charAt(0).toUpperCase() + scan.genre.slice(1);
    const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");

    // ── MaxCore ONLY (Mode C, then Mode B) — no local fallback ──────────────
    const modeErrors: string[] = [];
    for (const mode of ["C", "B"] as const) {
      try {
        const mc = await this._maxcoreAudio(scanWithKey, mode);
        const filename = `beat_${Date.now()}_${randomBytes(8).toString("hex")}.wav`;
        const audioAbsPath = path.join(outputDir, filename);
        await fsPromises.writeFile(audioAbsPath, mc.wavBytes);
        const audioRelUrl = `/generated-content/audio/${filename}`;
        // Use requestedKey as canonical — MaxCore always returns "C Minor" for
        // mcMusicalKey/mcKey, so accepting its value would lock every beat.
        const realBpm = mc.mcBpm ?? scan.tempo;
        const musicalKey = requestedKey;
        const keyStr = musicalKey ? ` (${musicalKey})` : "";
        const bpmStr = ` ${realBpm} BPM`;
        const title = `${titleAdj} ${titleGenre} Type Beat${keyStr}${bpmStr} — ${stamp}`;
        logger.info(
          `[BeatMoneyLoop] Beat generated via MaxCore mode ${mode} (backend=${mc.backend}, key=${musicalKey})`,
        );
        return { audioRelUrl, audioAbsPath, title, audioGenBackend: mc.backend, musicalKey: musicalKey || requestedKey };
      } catch (err) {
        const msg = (err as Error).message;
        modeErrors.push(`mode ${mode}: ${msg}`);
        logger.warn(
          `[BeatMoneyLoop] MaxCore mode ${mode} unavailable — ${msg}`,
        );
      }
    }

    // MaxCore is the ONLY audio source — fail the cycle explicitly.
    throw new Error(
      `MaxCore audio generation failed (external server is the only allowed source) — ${modeErrors.join("; ")}`,
    );
  }

  /**
   * Extract the beat's audio into a postable waveform MP4 (the ad content
   * IS the beat). Clipped to 45 s for cross-platform limits (Twitter 140 s,
   * IG feed ≥60 s reels rules, TikTok minimums) and encoded H.264/AAC.
   */
  private async _renderAdVideo(
    audioAbsPath: string,
  ): Promise<{ absPath: string; relUrl: string; publicUrl: string }> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const run = promisify(execFile);

    const outDir = path.join(process.cwd(), "public", "generated-content", "videos");
    await fsPromises.mkdir(outDir, { recursive: true });
    const filename = `beat_ad_${Date.now()}_${randomBytes(6).toString("hex")}.mp4`;
    const absPath = path.join(outDir, filename);

    await run(
      "ffmpeg",
      [
        "-y",
        "-i", audioAbsPath,
        "-filter_complex",
        "color=c=0x0e0e16:s=720x720:d=45[bg];" +
          "[0:a]showwaves=s=720x600:mode=cline:colors=0x8b5cf6|0x22d3ee[w];" +
          "[bg][w]overlay=(W-w)/2:(H-h)/2[v]",
        "-map", "[v]",
        "-map", "0:a",
        "-t", "45",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        absPath,
      ],
      { timeout: 120_000 },
    );

    const st = await fsPromises.stat(absPath);
    if (st.size < 10_240) {
      throw new Error(`rendered ad video too small (${st.size} bytes)`);
    }

    const relUrl = `/generated-content/videos/${filename}`;
    // Platforms fetch media over the public internet — the URL must be absolute.
    const base =
      process.env.PUBLIC_BASE_URL ||
      (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "");
    return { absPath, relUrl, publicUrl: base ? `${base}${relUrl}` : relUrl };
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
    const competitive = Math.max(
      9.99,
      +(median * PRICE_UNDERCUT_FACTOR).toFixed(2),
    );
    return competitive;
  }

  /** Upload WAV bytes to hybrid storage + insert beats row. Returns beat id. */
  private async _createBeatRecord(args: {
    scan: { genre: string; mood: string; tempo: number; hooks: string[] };
    price: number;
    audioRelUrl: string;
    audioAbsPath: string;
    title: string;
    musicalKey?: string;
  }): Promise<{ beatId: string; audioUrl: string }> {
    const adminId = await this._requireAdminId();
    const keyDisplay = args.musicalKey || "C Minor";

    // Read the WAV bytes MaxCore generation just wrote to disk
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

    // Generate cover artwork via MaxCore image endpoint — fire-and-forget if it
    // fails, so a slow image render never aborts the upload step.
    let artworkUrl: string | null = null;
    try {
      const base = (
        process.env.AI_SERVER_URL || "https://secure-ai-forge.replit.app"
      ).replace(/\/api\/?$/, "");
      const aiKey = process.env.AI_SERVER_KEY || "";
      const artPrompt =
        `${args.scan.mood} ${args.scan.genre} music producer — album cover art, cinematic, high contrast`;
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
          // Absolutize relative paths returned by MaxCore
          artworkUrl = /^https?:\/\//i.test(rawUrl)
            ? rawUrl
            : `${base}${rawUrl}`;
        }
      }
    } catch (_artErr) {
      // Non-fatal — beat still gets listed without artwork
      logger.warn("[BeatMoneyLoop] Artwork generation skipped (non-fatal)");
    }

    const tags = Array.from(
      new Set([
        args.scan.genre,
        args.scan.mood,
        "type beat",
        "beatsforsale",
        "producer",
        ...args.scan.hooks.map((h) => h.toLowerCase().split(" ").slice(0, 2).join("")).slice(0, 3),
      ]),
    ).filter(Boolean);

    const [created] = await db
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

    const beatId = created.id;

    // Bridge the beat into the marketplace `listings` table. The entire
    // marketplace (producer list, beats feed, producer profile page) reads
    // exclusively from `listings`, never from `beats`. Without a matching
    // listing row the auto-generated beat is invisible in the store and the
    // producer profile shows zero beats. Genre/bpm/key/tags are read from
    // `metadata` by the marketplace queries, and `category` powers the genre
    // filter. Non-fatal + idempotent: a listing failure must never abort the
    // money loop, and the same shape is reused by the one-time backfill so an
    // orphaned beat self-heals if this insert ever fails.
    try {
      const existing = await db
        .select({ id: listings.id })
        .from(listings)
        .where(sql`metadata->>'sourceBeatId' = ${beatId}`)
        .limit(1);
      if (existing.length === 0) {
        await db.insert(listings).values({
          userId: adminId,
          title: args.title,
          description: this._buildBeatDescription(args.scan, args.price),
          priceCents: Math.round(args.price * 100),
          category: args.scan.genre,
          audioUrl,
          artworkUrl,
          isPublished: true,
          metadata: {
            genre: args.scan.genre,
            mood: args.scan.mood,
            bpm: args.scan.tempo,
            key: keyDisplay,
            tempo: args.scan.tempo,
            licenseType: "basic",
            tags,
            sourceBeatId: beatId,
          },
        });
        // Immediately bust marketplace caches so the new beat appears without
        // waiting for the 30–60 s TTL to expire naturally.
        distributedCache.invalidatePattern("marketplace:beats:*").catch(() => {});
      }
    } catch (err) {
      logger.error(
        { err, beatId },
        "[BeatMoneyLoop] Failed to bridge beat into marketplace listings (beat created; listing missing — will self-heal on next backfill) —",
      );
    }

    return { beatId, audioUrl };
  }

  /**
   * Launch an autonomous ad campaign for the beat. Uses budget=0 because the
   * advertising system runs on MaxCore/PDIM custom AI models for organic
   * distribution — no paid ad spend is incurred.
   *
   * We create ONE campaign per cycle initially (instagram); the metadata
   * notes additional platforms so the advertising dispatch service can
   * fan out to tiktok / youtube via its own platform-rotation logic.
   */
  private async _launchCampaign(args: {
    beatId: string;
    scan: { genre: string; mood: string; tempo: number; hooks: string[] };
    price: number;
    title: string;
    audioUrl: string;
    audioAbsPath?: string;
  }): Promise<AdvertiseOutcome> {
    const adminId = await this._requireAdminId();
    let campaignId: string | null = null;
    try {
      // Build the ad copy — try MaxCore content generation first so the caption
      // benefits from goal=drive_purchase + beat_context. Fall back to local
      // _buildAdCaption when MaxCore is unavailable.
      const hashtags = normalizeHashtags([], args.scan.genre, "instagram");
      const caption = await this._generateMaxCoreCaption(args, hashtags).catch(
        (err) => {
          logger.warn(
            { err },
            "[BeatMoneyLoop] MaxCore caption generation failed — using local fallback",
          );
          return this._buildAdCaption({
            title: args.title,
            scan: args.scan,
            price: args.price,
            hashtags,
          });
        },
      );

      // 1. Create the campaign first so the creative can reference its id.
      //    budget=0: organic distribution only (no paid spend). metadata carries
      //    the fan-out platforms that activateCampaign reads (adCampaigns only has
      //    a singular `platform` column).
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
            beatId: args.beatId,
            price: args.price,
            fanOutPlatforms: [...PLATFORMS_FOR_CAMPAIGN],
          },
        })
        .returning({ id: adCampaigns.id });
      campaignId = campaign.id;

      // 1b. Extract the beat's audio into postable media: render a waveform
      //     MP4 that plays the beat itself. Social platforms cannot post raw
      //     WAV audio, so the campaign content carries the beat as video.
      let mediaUrl = args.audioUrl;
      let mediaLocalPath: string | null = null;
      let videoRenderFailed = false;
      if (args.audioAbsPath) {
        try {
          const vid = await this._renderAdVideo(args.audioAbsPath);
          mediaLocalPath = vid.absPath;
          mediaUrl = vid.publicUrl;
          logger.info(
            `[BeatMoneyLoop] Ad video rendered from beat audio: ${vid.relUrl}`,
          );
        } catch (err) {
          // Social platforms cannot accept raw WAV audio — skip the dispatch
          // entirely rather than posting an unplayable media URL.
          videoRenderFailed = true;
          logger.warn(
            `[BeatMoneyLoop] Ad video render failed (${(err as Error).message}) — skipping social dispatch (raw WAV not postable)`,
          );
        }
      }

      // 2. Create the creative linked to the campaign (activateCampaign reads
      //    adCreatives by campaignId and posts description/headline + mediaUrl).
      //    variants.localMediaPath lets the dispatcher hand platforms a local
      //    file (Twitter uploads need a path, not a URL).
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
          callToAction: "Stream & License",
          landingUrl: "/marketplace",
          status: "active",
          ...(mediaLocalPath
            ? { variants: { localMediaPath: mediaLocalPath, kind: "beat-audio-video" } }
            : {}),
        })
        .returning({ id: adCreatives.id });
      await db
        .update(adCampaigns)
        .set({ creativeIds: [creative.id] })
        .where(eq(adCampaigns.id, campaign.id));

      // 3. Dispatch to the connected social accounts. Skip entirely when the
      //    video render failed — social platforms reject raw WAV audio, so
      //    dispatching would produce zero successful posts.
      if (videoRenderFailed) {
        logger.warn(
          `[BeatMoneyLoop] campaign ${campaign.id} created but dispatch skipped — no postable video media`,
        );
        return {
          campaignId: campaign.id,
          posted: false,
          reason: "Ad video render failed — dispatch skipped (no postable media)",
        };
      }
      // This ACTUALLY posts when the admin has connected accounts; otherwise
      // it returns a clear reason and the cycle records the truth.
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
      // Surface per-platform errors so the cycle errorMessage is actionable.
      const platformErrors = result.results?.errors ?? [];
      const errSummary = platformErrors.length
        ? ` | per-platform: ${platformErrors.join("; ")}`
        : "";
      const reason =
        (result.error || result.message || "Ad dispatch reported no posts") +
        errSummary;
      logger.warn(
        `[BeatMoneyLoop] campaign ${campaign.id} created but NOT posted: ${reason}`,
      );
      return { campaignId: campaign.id, posted: false, reason };
    } catch (err) {
      const reason = (err as Error).message ?? String(err);
      logger.warn({ err }, "[BeatMoneyLoop] advertise step threw");
      return { campaignId, posted: false, reason };
    }
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
    const moodKey = scan.mood.toLowerCase();
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
    const genreKey = scan.genre.toLowerCase().replace(/[-\s]/g, "");
    const productionDetail =
      productionDetailMap[scan.genre.toLowerCase()] ||
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
      artistTypeMap[scan.genre.toLowerCase()] ||
      artistTypeMap[genreKey] ||
      "Built for independent artists who take their craft seriously.";

    const cleanPrice = Math.round(price);
    return `${emotionalLead} ${productionDetail} ${artistType} Non-exclusive lease from $${cleanPrice} — exclusive rights available on request.`;
  }

  /**
   * Build a real social ad caption — no raw hook-type labels leaked into copy.
   * Converts scan signals into marketing language a human would actually write.
   */
  /**
   * Call MaxCore /api/generate/content with beat_context + goal=drive_purchase
   * and run our post-processor over the result to produce a clean, conversion-
   * optimised caption. Throws when MaxCore returns no usable content so the
   * caller can fall back to _buildAdCaption.
   */
  private async _generateMaxCoreCaption(
    args: {
      beatId: string;
      scan: { genre: string; mood: string; tempo: number; hooks: string[] };
      price: number;
      title: string;
      audioUrl: string;
    },
    hashtags: string[],
  ): Promise<string> {
    const marketplaceUrl =
      process.env.MARKETPLACE_URL || "https://blawz.com/marketplace";
    const listenUrl = `${marketplaceUrl}?beat=${args.beatId}`;

    const mcRaw = await MaxCoreAIClient.infer<{
      hook?: string;
      body?: string;
      cta?: string;
      caption?: string;
      hashtags?: string[];
      variants?: Array<{ hook?: string; body?: string; cta?: string; hashtags?: string[] }>;
    }>("/api/generate/content", {
      platform: "instagram",
      content_type: "post",
      topic: `${args.scan.mood} ${args.scan.genre} type beat — ${args.title}`,
      tone: "hype",
      genre: args.scan.genre,
      include_hashtags: true,
      goal: "drive_purchase",
      beat_context: {
        title: args.title,
        bpm: args.scan.tempo,
        price: args.price,
        production_details: args.scan.hooks.slice(0, 3).join("; ") || args.scan.mood,
        listen_url: listenUrl,
      },
      platform_constraints: { no_link_in_bio: true },
    });

    if (!mcRaw) throw new Error("MaxCore returned null for caption");

    const candidate =
      mcRaw.variants && mcRaw.variants.length > 0
        ? selectBestVariant(mcRaw.variants)
        : mcRaw;

    if (!candidate || (!candidate.hook && !candidate.caption)) {
      throw new Error("MaxCore returned no usable caption content");
    }

    const cleaned = cleanMaxCoreContent({
      body: candidate.body || "",
      hook: candidate.hook || "",
      cta: candidate.cta || "",
      hashtags: Array.isArray(candidate.hashtags) ? candidate.hashtags : hashtags,
      genre: args.scan.genre,
      platform: "instagram",
    });

    const tagStr = normalizeHashtags(
      cleaned.hashtags,
      args.scan.genre,
      "instagram",
    ).join(" ");

    return [
      cleaned.hook,
      cleaned.body,
      cleaned.cta,
      tagStr,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  private _buildAdCaption(args: {
    title: string;
    scan: { genre: string; mood: string; tempo: number; hooks: string[] };
    price: number;
    hashtags: string[];
  }): string {
    // Map hook category labels → first-person marketing sentences
    const hookCopySentences: Record<string, string> = {
      "creative process reveal": "Made this from scratch — the process was wild.",
      "storytelling narrative": "Every layer tells a story. Yours might be next.",
      "comeback / return story": "The type of beat that marks a comeback era.",
      "behind-the-scenes": "Took this one from idea to final mix in one session.",
      "collaboration reveal": "The kind of sound that brings producers and artists together.",
      "challenge / call-to-action": "Who can write to this? Drop your verse in the comments.",
      "fan appreciation": "Made this one for the real ones who support independent music.",
      "milestone celebration": "A new chapter. A new sound. Let's go.",
    };
    // Find the first hook label that has a matching sentence, or skip
    const hookSentence = args.scan.hooks
      .slice(0, 3)
      .map((h) => hookCopySentences[h.toLowerCase().trim()])
      .find(Boolean);

    const cleanPrice = Math.round(args.price);
    const genrePart = `${args.scan.mood} ${args.scan.genre}`.toLowerCase();
    const tagStr = args.hashtags.join(" ");

    // Fix 7: inject price anchor, scarcity signal, and direct marketplace link
    // so the post does conversion work, not just awareness.
    const marketplaceUrl = process.env.MARKETPLACE_URL || "https://blawz.com/marketplace";

    const lines = [
      `🔥 "${args.title}" — ${args.scan.tempo} BPM ${genrePart} type beat.`,
      hookSentence ?? `Professional-grade production built for artists who take their craft seriously.`,
      `Non-exclusive lease from $${cleanPrice} · Limited slots · Stream + license 🎧 ${marketplaceUrl}`,
      tagStr,
    ];
    return lines.join("\n").trim();
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
    scan: { confidence: number } | null,
    failed: boolean,
    _state: BeatMoneyLoopState | null,
  ): number {
    if (failed) return FAILURE_BACKOFF_CADENCE_MS;
    if (!scan) return DEFAULT_CADENCE_MS;
    let ms: number;
    if (scan.confidence >= 0.7) ms = 2 * 60 * 60 * 1000;
    else if (scan.confidence >= 0.5) ms = 4 * 60 * 60 * 1000;
    else if (scan.confidence >= 0.3) ms = 6 * 60 * 60 * 1000;
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
   * Backfill performance metrics on recent cycles from the beats table.
   * Called opportunistically from the scheduler heartbeat so dashboards stay fresh.
   */
  async analyseRecentCycles(): Promise<{ updated: number }> {
    // Both 'completed' (beat listed + ads posted) and 'listed' (beat listed,
    // ads not posted) have a LIVE beat that accrues plays/downloads/revenue,
    // so backfill metrics for both — filtering to 'completed' only would
    // undercount revenue on every cycle where ads weren't posted.
    const recent = await db
      .select()
      .from(beatMoneyLoopCycles)
      .where(
        and(
          inArray(beatMoneyLoopCycles?.status, ["completed", "listed"]),
          gte(
            beatMoneyLoopCycles?.startedAt,
            new Date(Date?.now() - 30 * 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .limit(100);
    let updated = 0;
    for (const cycle of recent) {
      if (!cycle?.beatId) continue;
      const [beat] = await db
        .select({
          plays: beats.plays,
          downloads: beats.downloads,
          price: beats.price,
        })
        .from(beats)
        .where(eq(beats?.id, cycle?.beatId))
        .limit(1);
      if (!beat) continue;
      const revenueCents = Math.round(
        (beat?.downloads ?? 0) * (beat?.price ?? 0) * 100,
      );
      if (
        (beat?.plays ?? 0) !== cycle?.plays ||
        (beat?.downloads ?? 0) !== cycle?.downloads ||
        revenueCents !== cycle?.revenueCents
      ) {
        await db
          .update(beatMoneyLoopCycles)
          .set({
            plays: beat.plays ?? 0,
            downloads: beat.downloads ?? 0,
            revenueCents,
          })
          .where(eq(beatMoneyLoopCycles?.id, cycle?.id));
        updated++;
      }
    }
    if (updated > 0) {
      // Refresh totalRevenueCents on state
      const total = await db
        .select({
          sum: sql<number>`COALESCE(SUM(${beatMoneyLoopCycles?.revenueCents}), 0)`,
        })
        .from(beatMoneyLoopCycles);
      await db
        .update(beatMoneyLoopState)
        .set({ totalRevenueCents: total[0]?.sum ?? 0, updatedAt: new Date() })
        .where(eq(beatMoneyLoopState?.id, STATE_ROW_ID));
    }
    return { updated };
  }
}

export const beatMoneyLoopService = new BeatMoneyLoopService();
