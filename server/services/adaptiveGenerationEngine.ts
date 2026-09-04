/**
 * Adaptive Generation Engine
 * ---------------------------------------------------------------------------
 * Shared, domain-agnostic self-optimization + anti-repetition layer for every
 * content-generation service on the platform (social captions/hooks,
 * hashtags, ad creative, beat genre/price picks, video prompts, songwriting
 * suggestions, etc). Two independent capabilities, meant to be composed by
 * callers:
 *
 * 1. Adaptive arm selection (`selectArm` / `recordOutcome`) - a persisted
 *    UCB1 multi-armed bandit (Auer, Cesa-Bianchi & Fischer, 2002 - the same
 *    public explore/exploit formula already proven out for topic selection
 *    in autonomous-autopilot.ts), generalized here and given durable DB
 *    storage so learning survives restarts instead of resetting to a blank
 *    slate every time the process restarts. Every domain gets its own
 *    (domain, scope) arm-stats bucket, so unrelated decisions never bleed
 *    into each other's statistics.
 *
 *    Trials are counted at SELECTION time, not outcome time - an arm that
 *    was picked but whose real-world result hasn't been measured yet still
 *    counts as "tried", which is what stops the bandit from hammering the
 *    same untested arm over and over while waiting on delayed analytics.
 *
 * 2. Anti-repetition memory (`isRecentlyUsed` / `recordGeneration`) - a
 *    fingerprint log of what was actually produced recently, so a caller can
 *    refuse to hand back the same shape twice in a row even when it would
 *    otherwise win on pure expected value. This is the piece that was
 *    missing everywhere in this codebase: UCB1 and revenue-weighting both
 *    still allow a genuine top performer to be selected many cycles running
 *    - `selectArm` folds recency exclusion in for the arm-selection case,
 *    and `isRecentlyUsed` covers the more general case of comparing whole
 *    attribute sets (e.g. "the same hook-style + topic-category combo").
 *
 * Plus a read-only composer (`getSituationalContext`) that assembles REAL
 * calendar facts and a user's own historically-best content patterns into
 * one object generation call sites can fold into prompts/parameter choices.
 * It fabricates nothing - every field is sourced from an existing service or
 * plain calendar math; if a signal isn't available it is simply omitted,
 * never a fake placeholder value. This is deliberately NOT where trending
 * topics / platform-algorithm notes live - that is the job of the existing,
 * richer live-signal system in awarenessContext.ts (backed by the "awareness
 * layer" RSS/Tavily/Exa aggregator that feeds MaxCore's awareness cascade).
 * Callers that need trend/platform awareness should call
 * getAwarenessContext() (or buildMaxCoreAwarenessPayload() for the exact
 * MaxCore payload shape) directly, so there is one source of truth instead
 * of two divergent trend systems.
 *
 * Nothing here calls MaxCore or any external API - it is pure decision
 * logic + Postgres, safe to call from any request path or background job.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { generationArmStats, generationHistory } from "../../shared/schema.js";
import { autopilotLearningService } from "./autopilotLearningService.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────
// 1. Adaptive arm selection (persisted UCB1 bandit)
// ─────────────────────────────────────────────────────────────────────────

export interface RankedArm {
  armKey: string;
  trials: number;
  avgReward: number;
  score: number;
}

export interface SelectArmResult {
  chosen: string;
  reason:
    | "single_candidate"
    | "forced_explore"
    | "ucb1"
    | "ucb1_rotated"
    | "repeat_unavoidable";
  ranked: RankedArm[];
}

export interface SelectArmOptions {
  /** Decision type, e.g. 'social_hook_style', 'beat_genre', 'ad_creative_hour'. */
  domain: string;
  /** userId for per-user decisions, or a fixed string like 'global' for platform-wide ones. */
  scope: string;
  /** The option keys being chosen between. Order does not matter. */
  candidates: string[];
  /** How many of the most-recently-selected arms are excluded from winning again outright. Default 1 (no immediate back-to-back repeat). */
  avoidRepeatLast?: number;
  /** UCB1 exploration constant. Default 0.5. Tune down for wide reward scales, up for noisy/sparse ones. Callers should normalize reward to a roughly comparable scale (e.g. 0-1 or consistent cents) so the default is meaningful. */
  explorationConstant?: number;
}

/**
 * Picks the next option for a repeated decision, favoring historically
 * better-performing arms (UCB1) while (a) forcing exploration of anything
 * never tried, and (b) refusing to repeat whichever arm(s) were just picked
 * when a good alternative exists. Persists the pick as a trial immediately.
 */
export async function selectArm(
  opts: SelectArmOptions,
): Promise<SelectArmResult> {
  const candidates = Array.from(new Set(opts.candidates.filter(Boolean)));
  if (candidates.length === 0) {
    throw new Error(
      `[AdaptiveGenerationEngine] selectArm called with no candidates for domain "${opts.domain}"`,
    );
  }
  if (candidates.length === 1) {
    await touchArm(opts.domain, opts.scope, candidates[0]);
    return { chosen: candidates[0], reason: "single_candidate", ranked: [] };
  }

  const rows = await db
    .select()
    .from(generationArmStats)
    .where(
      and(
        eq(generationArmStats.domain, opts.domain),
        eq(generationArmStats.scope, opts.scope),
        inArray(generationArmStats.armKey, candidates),
      ),
    );
  const statsByArm = new Map(rows.map((r) => [r.armKey, r]));

  const untried = candidates.filter((c) => !statsByArm.has(c));
  if (untried.length > 0) {
    const chosen =
      untried[
        seededPick(`${opts.domain}:${opts.scope}:explore:${untried.length}`, untried.length)
      ];
    await touchArm(opts.domain, opts.scope, chosen);
    return { chosen, reason: "forced_explore", ranked: [] };
  }

  const C = opts.explorationConstant ?? 0.5;
  const totalTrials = rows.reduce((s, r) => s + r.trials, 0) || 1;
  const ranked: RankedArm[] = candidates
    .map((armKey) => {
      const row = statsByArm.get(armKey)!;
      const avgReward = row.trials > 0 ? row.rewardSum / row.trials : 0;
      const explorationBonus =
        C * Math.sqrt(Math.log(totalTrials) / Math.max(1, row.trials));
      return { armKey, trials: row.trials, avgReward, score: avgReward + explorationBonus };
    })
    .sort((a, b) => b.score - a.score);

  const avoidRepeatLast = opts.avoidRepeatLast ?? 1;
  const recentlyUsed = new Set(
    rows
      .filter((r) => r.lastSelectedAt)
      .sort(
        (a, b) =>
          (b.lastSelectedAt as Date).getTime() - (a.lastSelectedAt as Date).getTime(),
      )
      .slice(0, avoidRepeatLast)
      .map((r) => r.armKey),
  );

  let chosen = ranked[0].armKey;
  let reason: SelectArmResult["reason"] = "ucb1";
  if (recentlyUsed.has(chosen)) {
    const alternative = ranked.find((r) => !recentlyUsed.has(r.armKey));
    if (alternative) {
      chosen = alternative.armKey;
      reason = "ucb1_rotated";
    } else {
      reason = "repeat_unavoidable"; // every candidate was just used - not enough variety in the pool to rotate
    }
  }

  await touchArm(opts.domain, opts.scope, chosen);
  return { chosen, reason, ranked };
}

/** Records that an arm was tried (trials += 1) with no reward yet known. */
async function touchArm(domain: string, scope: string, armKey: string): Promise<void> {
  const now = new Date();
  await db
    .insert(generationArmStats)
    .values({ domain, scope, armKey, trials: 1, rewardSum: 0, lastSelectedAt: now })
    .onConflictDoUpdate({
      target: [generationArmStats.domain, generationArmStats.scope, generationArmStats.armKey],
      set: { trials: sql`${generationArmStats.trials} + 1`, lastSelectedAt: now, updatedAt: now },
    });
}

/**
 * Feeds a real, measured outcome back into an arm's statistics once it is
 * known (e.g. actual revenue, downloads, or engagement rate from analytics).
 * Never call this with a fabricated/estimated value - an arm that looks good
 * only because of made-up rewards defeats the entire point of the bandit.
 * Does not increment trials (selectArm already counted the trial).
 */
export async function recordOutcome(opts: {
  domain: string;
  scope: string;
  armKey: string;
  reward: number;
}): Promise<void> {
  if (!Number.isFinite(opts.reward)) return;
  await db
    .insert(generationArmStats)
    .values({
      domain: opts.domain,
      scope: opts.scope,
      armKey: opts.armKey,
      trials: 1,
      rewardSum: opts.reward,
    })
    .onConflictDoUpdate({
      target: [generationArmStats.domain, generationArmStats.scope, generationArmStats.armKey],
      set: { rewardSum: sql`${generationArmStats.rewardSum} + ${opts.reward}`, updatedAt: new Date() },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Anti-repetition memory
// ─────────────────────────────────────────────────────────────────────────

export type SignatureAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

function computeSignatureHash(attributes: SignatureAttributes): string {
  const sorted = Object.keys(attributes)
    .filter((k) => attributes[k] !== undefined)
    .sort()
    .map((k) => `${k}=${String(attributes[k])}`)
    .join("|");
  return createHash("sha1").update(sorted).digest("hex");
}

export interface IsRecentlyUsedResult {
  isRecentlyUsed: boolean;
  signatureHash: string;
  /** Attribute keys shared with the single most recent entry, even if the overall signature differs - useful for deciding what to vary next. */
  overlapsWithLastAttributes?: string[];
}

/**
 * Checks a candidate output's attribute fingerprint against recent history
 * for this (userId, domain) BEFORE finalizing generation. Callers should
 * loop - if `isRecentlyUsed` is true, adjust a parameter (topic angle,
 * hook style, genre, template) and check again - rather than accepting the
 * repeat outright.
 */
export async function isRecentlyUsed(opts: {
  userId: string | null;
  domain: string;
  attributes: SignatureAttributes;
  lookback?: number;
}): Promise<IsRecentlyUsedResult> {
  const lookback = opts.lookback ?? 5;
  const signatureHash = computeSignatureHash(opts.attributes);
  const scopeCondition = opts.userId
    ? eq(generationHistory.userId, opts.userId)
    : sql`${generationHistory.userId} IS NULL`;

  const recent = await db
    .select()
    .from(generationHistory)
    .where(and(eq(generationHistory.domain, opts.domain), scopeCondition))
    .orderBy(desc(generationHistory.createdAt))
    .limit(lookback);

  const matched = recent.some((r) => r.signatureHash === signatureHash);

  let overlapsWithLastAttributes: string[] | undefined;
  if (!matched && recent.length > 0) {
    const mostRecentAttrs = (recent[0].attributes ?? {}) as Record<string, unknown>;
    const overlap = Object.keys(opts.attributes).filter(
      (k) =>
        opts.attributes[k] !== undefined &&
        mostRecentAttrs[k] !== undefined &&
        mostRecentAttrs[k] === opts.attributes[k],
    );
    if (overlap.length > 0) overlapsWithLastAttributes = overlap;
  }

  return { isRecentlyUsed: matched, signatureHash, overlapsWithLastAttributes };
}

/**
 * Logs the attribute fingerprint of output that was actually produced.
 * Call this AFTER generation is finalized (not before), so history never
 * records an attempt that was discarded or replaced by a retry.
 */
export async function recordGeneration(opts: {
  userId: string | null;
  domain: string;
  attributes: SignatureAttributes;
  armKey?: string;
  signatureHash?: string;
}): Promise<void> {
  const signatureHash = opts.signatureHash ?? computeSignatureHash(opts.attributes);
  await db.insert(generationHistory).values({
    userId: opts.userId ?? null,
    domain: opts.domain,
    signatureHash,
    armKey: opts.armKey ?? null,
    attributes: opts.attributes as Record<string, unknown>,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Situational context composer (read-only, aggregates existing signals)
// ─────────────────────────────────────────────────────────────────────────

export interface SituationalContext {
  dayOfWeek: number;
  isWeekend: boolean;
  month: number;
  hourOfDay: number;
  userPatterns?: Array<{ pattern: string; description: string; confidence: number }>;
}

/**
 * Assembles real calendar facts and a user's own learned performance
 * patterns into one object. Every field comes from an existing service/table
 * or plain calendar math - nothing is invented. Missing/failed lookups
 * simply omit that field rather than substituting a guess.
 *
 * For trending topics / platform-algorithm notes, call getAwarenessContext()
 * (or buildMaxCoreAwarenessPayload() for the MaxCore payload shape) from
 * awarenessContext.ts instead - that is the richer, live-signal-backed
 * system and the one source of truth for that data, deliberately not
 * duplicated here.
 */
export async function getSituationalContext(opts: {
  userId?: string;
}): Promise<SituationalContext> {
  const now = new Date();
  const context: SituationalContext = {
    dayOfWeek: now.getDay(),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    month: now.getMonth(),
    hourOfDay: now.getHours(),
  };

  if (opts.userId) {
    try {
      const patterns = await autopilotLearningService.detectPatterns(opts.userId);
      if (patterns?.length) {
        context.userPatterns = patterns.slice(0, 3).map((p) => ({
          pattern: p.pattern,
          description: p.description,
          confidence: p.confidence,
        }));
      }
    } catch (err) {
      logger.warn({ err }, "[AdaptiveGenerationEngine] User pattern lookup failed");
    }
  }

  return context;
}

// ─────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────

/** Deterministic seeded pick, used only to break ties among forced-explore candidates (never a source of "randomness" for its own sake). */
function seededPick(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}
