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
        "[BeatMoneyLoop] Could not recover orphaned cycles:",
        (err as Error).message,
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
  async runCycle(triggeredBy: "schedule" | "manual"): Promise<RunCycleResult> {
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
      `[BeatMoneyLoop] ▶ Cycle ${cycleId} started (trigger=${triggeredBy})`,
    );

    try {
      // 1. SCAN
      const ctx = await musicIndustryContextFilter.getContextForMode("music");
      const scan = this._distillScan(ctx);
      await db
        .update(beatMoneyLoopCycles)
        .set({ status: "generating", scanContext: scan })
        .where(eq(beatMoneyLoopCycles.id, cycleId));
      logger.info(
        `[BeatMoneyLoop] ${cycleId} scan: genre=${scan.genre} mood=${scan.mood} tempo=${scan.tempo} conf=${scan.confidence.toFixed(2)}`,
      );

      // 2. GENERATE
      const { audioRelUrl, audioAbsPath, title, audioGenBackend } =
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
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Pick the strongest trending genre/mood/tempo from the live industry context. */
  private _distillScan(ctx: MusicIndustryContext): {
    genre: string;
    mood: string;
    tempo: number;
    confidence: number;
    hooks: string[];
    productionStyles: string[];
  } {
    // Build diverse candidate pools so each cycle picks a different style.
    // suggestedGenre/suggestedMood are included but are not guaranteed winners —
    // they bias the pool toward the current trend signal without locking every
    // cycle into the same combination.
    const pickRandom = (items: string[], fallback: string): string => {
      const pool = items.filter(Boolean);
      if (pool.length === 0) return fallback;
      return pool[Math.floor(Math.random() * pool.length)];
    };

    // Hardcoded baseline ensures diversity even when context signals are sparse
    // or biased by generic keyword matches. Context signals appear 2× so they
    // carry ~2× the probability weight of any single baseline item, but the
    // full pool guarantees genre rotation every few cycles.
    const GENRE_BASELINE = [
      "trap", "hiphop", "r&b", "drill", "lofi", "pop", "electronic", "indie",
    ];
    const MOOD_BASELINE = [
      "dark", "empowering", "chill", "aggressive", "melancholic",
      "energetic", "nostalgic", "euphoric",
    ];

    const genrePool: string[] = [
      ...GENRE_BASELINE,
      // Context signals appear twice — double-weight without monopolising.
      ...(ctx.generationHints.suggestedGenre
        ? [ctx.generationHints.suggestedGenre, ctx.generationHints.suggestedGenre]
        : []),
      ...(ctx.trendingGenres?.slice(0, 4) ?? []),
    ];

    const moodPool: string[] = [
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
    // Beat duration. Default 15 s — renders reliably within the poll budget.
    // A 30 s clip takes >10 min on MaxCore's current queue; 15 s finishes in ~5 min.
    // Override via BEAT_DURATION_SECONDS env var (max 120 s).
    const durationSec = Math.min(
      120,
      Math.max(10, Number(process.env.BEAT_DURATION_SECONDS) || 15),
    );
    const body: Record<string, unknown> = {
      genre: scan.genre,
      bpm: scan.tempo,
      mood: scan.mood,
      duration: durationSec,
      energy: 0.8,
      mode,
    };
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
      backend?: string;
    };

    const backend = data.backend ?? (mode === "C" ? "maxcore" : "dsp_b");
    const finish = async (d: typeof data): Promise<{
      wavBytes: Buffer;
      mcKey?: string;
      mcBpm?: number;
      backend: string;
    }> => {
      const b64 = d.wav_b64 ?? d.audio_b64;
      if (b64) {
        return {
          wavBytes: Buffer.from(b64, "base64"),
          mcKey: d.mc_key,
          mcBpm: d.mc_bpm,
          backend: d.backend ?? backend,
        };
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
        return {
          wavBytes: bytes,
          mcKey: d.mc_key,
          mcBpm: d.mc_bpm,
          backend: d.backend ?? backend,
        };
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
  private async _generateBeat(scan: {
    genre: string;
    mood: string;
    tempo: number;
    productionStyles: string[];
    hooks: string[];
  }): Promise<{ audioRelUrl: string; audioAbsPath: string; title: string; audioGenBackend: string }> {
    const outputDir = path.join(
      process.cwd(),
      "public",
      "generated-content",
      "audio",
    );
    await fsPromises.mkdir(outputDir, { recursive: true });

    const titleAdj =
      scan.mood.charAt(0).toUpperCase() + scan.mood.slice(1);
    const titleGenre =
      scan.genre.charAt(0).toUpperCase() + scan.genre.slice(1);
    const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");

    // ── MaxCore ONLY (Mode C, then Mode B) — no local fallback ──────────────
    const modeErrors: string[] = [];
    for (const mode of ["C", "B"] as const) {
      try {
        const mc = await this._maxcoreAudio(scan, mode);
        const filename = `beat_${Date.now()}_${randomBytes(8).toString("hex")}.wav`;
        const audioAbsPath = path.join(outputDir, filename);
        await fsPromises.writeFile(audioAbsPath, mc.wavBytes);
        const audioRelUrl = `/generated-content/audio/${filename}`;
        const keyStr = mc.mcKey ? ` (${mc.mcKey})` : "";
        const title = `${titleAdj} ${titleGenre} Type Beat${keyStr} — ${stamp}`;
        logger.info(
          `[BeatMoneyLoop] Beat generated via MaxCore mode ${mode} (backend=${mc.backend})`,
        );
        return { audioRelUrl, audioAbsPath, title, audioGenBackend: mc.backend };
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
  }): Promise<{ beatId: string; audioUrl: string }> {
    const adminId = await this._requireAdminId();
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
        key: "C Minor", // music engine default tonic; safe display value
        audioUrl,
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
          isPublished: true,
          metadata: {
            genre: args.scan.genre,
            mood: args.scan.mood,
            bpm: args.scan.tempo,
            key: "C Minor",
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
      // Build the ad copy from the trending scan signals.
      const hashtags = Array.from(
        new Set([
          args.scan.genre.replace(/\s+/g, ""),
          args.scan.mood.replace(/\s+/g, ""),
          "typebeat",
          "beatsforsale",
          "producer",
        ]),
      )
        .filter(Boolean)
        .map((t) => `#${t}`);
      const caption = this._buildAdCaption({
        title: args.title,
        scan: args.scan,
        price: args.price,
        hashtags,
      });

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
    const genreDescMap: Record<string, string> = {
      trap: "trap and hip-hop", hiphop: "hip-hop and rap", "hip-hop": "hip-hop and rap",
      rnb: "R&B and soul", pop: "pop and indie", reggaeton: "reggaeton and Latin trap",
      indie: "indie pop and alternative", drill: "drill and UK rap",
      afrobeats: "afrobeats and Afropop", dancehall: "dancehall and Caribbean",
      lo_fi: "lo-fi and chill study beats", jazz: "jazz-influenced and neo-soul",
    };
    const moodSentenceMap: Record<string, string> = {
      dark: "Built for artists who go hard — raw, gritty, and unfiltered.",
      empowering: "Built for anthem-makers. This one demands to be heard.",
      driven: "High-momentum production engineered for artists with something to prove.",
      aggressive: "High-energy, no compromises — made for tracks that hit different.",
      melancholy: "Emotional depth with cinematic range. Perfect for introspective records.",
      chill: "Smooth and laid-back. Ideal for tracks that breathe and flow.",
      upbeat: "Feel-good energy with infectious rhythm. Listeners won't skip this one.",
      mysterious: "Dark, layered atmosphere with a hook that lingers long after the song ends.",
    };
    const genreKey = scan.genre.toLowerCase().replace(/[-\s]/g, "_");
    const moodKey = scan.mood.toLowerCase();
    const genreDesc = genreDescMap[scan.genre.toLowerCase()] ?? scan.genre;
    const moodSentence =
      moodSentenceMap[moodKey] ??
      `${scan.mood.charAt(0).toUpperCase() + scan.mood.slice(1)} energy meets professional production.`;
    const cleanPrice = Math.round(price);
    return (
      `${moodSentence} ` +
      `${scan.tempo} BPM, C Minor — tuned for ${genreDesc} artists. ` +
      `Studio-ready with full mixing and mastering headroom. ` +
      `Non-exclusive lease from ${cleanPrice}. Exclusive rights available on request.`
    );
  }

  /**
   * Build a real social ad caption — no raw hook-type labels leaked into copy.
   * Converts scan signals into marketing language a human would actually write.
   */
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

    const lines = [
      `🔥 "${args.title}" — ${args.scan.tempo} BPM ${genrePart} type beat.`,
      hookSentence ?? `Professional-grade production built for artists who take their craft seriously.`,
      `Non-exclusive lease from ${cleanPrice} — link in bio.`,
      tagStr,
    ];
    return lines.join(" ").trim();
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
    state: BeatMoneyLoopState | null,
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
      const revenueCents = Math?.round(
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
