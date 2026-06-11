/**
 * Beat Money Loop Service
 * =======================
 * Admin-only autonomous revenue loop:
 *   1. SCAN   — pull live music-industry context (trending genre / mood / tempo)
 *               from musicIndustryContextFilter (which is fed by industryMonitorService).
 *   2. GENERATE — synthesize a beat WAV using the TS-native music engine
 *               (parseTextToParameters → generateChordProgression →
 *                generateMelody → synthesizeToWAV). The text prompt embeds the
 *               trending signals so generation is biased toward what's hot.
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
 * Admin gating: hard-coded to user 31b06dba-b992-4da5-90ef-3dac95692716
 * (blawzmusic@gmail.com). All admin endpoints sit behind requireAdmin.
 *
 * Paused by default — operator flips `enabled=true` via POST /api/admin/beat-money-loop/enable.
 */

import { db } from "../db.js";
import {
  beats,
  beatMoneyLoopState,
  beatMoneyLoopCycles,
  adCampaigns,
  adCreatives,
  type BeatMoneyLoopState,
  type BeatMoneyLoopCycle,
} from "@shared/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import {
  musicIndustryContextFilter,
  type MusicIndustryContext,
} from "./musicIndustryContextFilter.js";
import {
  parseTextToParameters,
  generateChordProgression,
  generateMelody,
  synthesizeToWAV,
} from "./musicGenerationService.js";
import { storageService } from "./storageService.js";
import { autonomousService } from "./autonomousService.js";
import { advertisingDispatchService } from "./advertisingDispatchService.js";
import path from "path";
import fsPromises from "fs/promises";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BEAT_MONEY_LOOP_ADMIN_ID = "31b06dba-b992-4da5-90ef-3dac95692716";
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

const PLATFORMS_FOR_CAMPAIGN = ["instagram", "tiktok", "youtube"] as const;

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
    // Whitelist admin so launchCampaign() auto-approves rather than routing through approvals.
    try {
      await autonomousService.setAutonomousMode(BEAT_MONEY_LOOP_ADMIN_ID, true);
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
      const { audioRelUrl, audioAbsPath, title } =
        await this._generateBeat(scan);
      await db
        .update(beatMoneyLoopCycles)
        .set({
          status: "uploading",
          audioGenBackend: "ts-native",
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
    const genre =
      ctx.generationHints.suggestedGenre ||
      ctx.trendingGenres[0] ||
      TRENDING_GENRE_FALLBACK;
    const mood =
      ctx.generationHints.suggestedMood ||
      ctx.trendingMoods[0] ||
      TRENDING_MOOD_FALLBACK;
    // Tempo from bias: 'up'=high tempo, 'down'=low, 'neutral'=mid
    const tempo =
      ctx.generationHints.tempoBias === "up"
        ? 150
        : ctx.generationHints.tempoBias === "down"
          ? 85
          : 120;
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
   * Generate a beat WAV using the TS-native music engine.
   * parseTextToParameters() internally pulls trending genre/mood from the same
   * context filter as fallback, so passing a rich prompt biases generation strongly.
   */
  private async _generateBeat(scan: {
    genre: string;
    mood: string;
    tempo: number;
    productionStyles: string[];
  }): Promise<{ audioRelUrl: string; audioAbsPath: string; title: string }> {
    const styleText =
      scan.productionStyles.length > 0
        ? ` ${scan.productionStyles.join(" ")}`
        : "";
    const prompt = `${scan.mood} ${scan.genre} beat at ${scan.tempo} bpm${styleText}`;
    const params = parseTextToParameters(prompt);
    // Force tempo from scan (parseText might override)
    params.tempo = scan.tempo;
    const chords = generateChordProgression(params);
    const notes = generateMelody(params, chords);
    if (chords.length === 0 || notes.length === 0) {
      throw new Error("Music engine returned empty chord/melody arrays");
    }
    const audioRelUrl = await synthesizeToWAV(notes, chords, params);
    // synthesizeToWAV returns "/generated-content/audio/<file>.wav"
    const audioAbsPath = path.join(process.cwd(), "public", audioRelUrl);
    // Title: capitalize first letter of mood + genre
    const titleAdj = scan.mood.charAt(0).toUpperCase() + scan.mood.slice(1);
    const titleGenre = scan.genre.charAt(0).toUpperCase() + scan.genre.slice(1);
    const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");
    const title = `${titleAdj} ${titleGenre} Type Beat — ${stamp}`;
    return { audioRelUrl, audioAbsPath, title };
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
    // Read WAV bytes from the file synthesizeToWAV just wrote
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
        "beat money loop",
        ...args.scan.hooks.map((h) => h.toLowerCase()).slice(0, 3),
      ]),
    ).filter(Boolean);

    const [created] = await db
      .insert(beats)
      .values({
        userId: BEAT_MONEY_LOOP_ADMIN_ID,
        title: args.title,
        description: `Auto-generated by Beat Money Loop. Trending: ${args.scan.genre} / ${args.scan.mood}.`,
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

    return { beatId: created.id, audioUrl };
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
  }): Promise<AdvertiseOutcome> {
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
      const caption =
        `🔥 New ${args.scan.mood} ${args.scan.genre} type beat — "${args.title}". ` +
        `${args.scan.tempo} BPM. Lease from $${args.price.toFixed(2)}. ` +
        `${args.scan.hooks.slice(0, 2).join(" ")} ${hashtags.join(" ")}`.trim();

      // 1. Create the campaign first so the creative can reference its id.
      //    budget=0: organic distribution only (no paid spend). metadata carries
      //    the fan-out platforms that activateCampaign reads (adCampaigns only has
      //    a singular `platform` column).
      const [campaign] = await db
        .insert(adCampaigns)
        .values({
          userId: BEAT_MONEY_LOOP_ADMIN_ID,
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

      // 2. Create the creative linked to the campaign (activateCampaign reads
      //    adCreatives by campaignId and posts description/headline + mediaUrl).
      const [creative] = await db
        .insert(adCreatives)
        .values({
          userId: BEAT_MONEY_LOOP_ADMIN_ID,
          campaignId: campaign.id,
          name: `[BML] ${args.title}`,
          type: "social_post",
          headline: args.title,
          description: caption,
          mediaUrl: args.audioUrl,
          callToAction: "Listen & Buy",
          landingUrl: "/marketplace",
          status: "active",
        })
        .returning({ id: adCreatives.id });
      await db
        .update(adCampaigns)
        .set({ creativeIds: [creative.id] })
        .where(eq(adCampaigns.id, campaign.id));

      // 3. Dispatch to the connected social accounts. This ACTUALLY posts when
      //    the admin has connected accounts; otherwise it returns a clear reason
      //    and the cycle records the truth (beat listed, ads not sent).
      const result = await advertisingDispatchService.activateCampaign(
        campaign.id,
        BEAT_MONEY_LOOP_ADMIN_ID,
      );
      const postsCreated = result.results.postsCreated ?? 0;
      if (result.success && postsCreated > 0) {
        logger.info(
          `[BeatMoneyLoop] campaign ${campaign.id} posted to ${result.results.platformsUsed.join(", ")} (${postsCreated} posts)`,
        );
        return {
          campaignId: campaign.id,
          posted: true,
          reason: result.message,
        };
      }
      const reason =
        result.error || result.message || "Ad dispatch reported no posts";
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
