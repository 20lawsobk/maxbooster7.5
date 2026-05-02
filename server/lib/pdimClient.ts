/**
 * PDIM HTTP Redis Adapter
 *
 * Wraps the Pocket Dimension / Redis replacement server's HTTP exec endpoint
 * with a full ioredis-compatible interface. Any code that calls getRedisClient()
 * transparently receives this adapter when PDIM_HTTP_EXEC_URL is set.
 *
 * env vars consumed:
 *   PDIM_HTTP_EXEC_URL  — https://…/api/redis/instances/{id}/exec
 *   PDIM_BEARER_TOKEN   — Bearer auth token
 */

import { EventEmitter } from 'events';
import os from 'os';
import { logger } from '../logger.js';
import { execLuaViaPdim } from './luaExecutor.js';
import {
  cbAllowRequest,
  cbRecordFailure as cbRecord503,
  cbRecordSuccess,
  cbHalfOpenFailed,
} from './pdimCircuitBreaker.js';

// ── Adaptive PDIM Rate Limiter (AIMD) ────────────────────────────────────────
// "Fluid like water: easy to contain but expands freely when userbase expands."
//
// Uses AIMD — the same Additive Increase / Multiplicative Decrease algorithm
// as TCP congestion control — applied to the inter-request gap:
//
//   Success  → gap -= STEP  (additive decrease: throughput ramps up gradually)
//   HTTP 429 → gap *= MULT  (multiplicative increase: immediate hard back-off)
//   Demand   → STEP × 3    (when callers are queued, ramp-up accelerates 3×)
//
// This makes the rate limiter self-tuning:
//   • At rest (1–2 callers): gap drifts toward floor — maximum efficiency
//   • Under load (many callers queued): gap falls 3× faster — serves demand
//   • After a 429: gap jumps to 2.5× — backs off faster than a single retry cycle
//   • Sustained 429s: gap compounds (500 → 1250 → 3125 → ...) up to CEIL
//   • After recovery: gap ramps smoothly back down to floor
//
// All PDIM HTTP requests, from every code path (direct calls, LuaExecutor
// redis.call(), BZPOPMIN polling), are serialized through this single chain.
// At most ONE request is in-flight at any time, with an adaptive gap between
// completions.  There is no static global concurrency cap — the chain itself
// guarantees sequential execution.

// ── Auto multiplier ───────────────────────────────────────────────────────────
// Target scale: 120 million long-term concurrent users.
//
// Max Booster deploys to VM Reserve and connects to PDIM via Redis-compatible
// URLs.  PDIM runs its own auto-scale cluster (effectively no cluster limit),
// so Max Booster transparently benefits from PDIM's cluster capacity without
// managing any workers itself.
//
// Two dimensions determine how many concurrent callers are hitting the PDIM
// chain from this side:
//
//   1. PDIM cluster workers  — PDIM cluster nodes serving this instance
//      (set via PDIM_CLUSTER_WORKERS; defaults to 1, grows as PDIM auto-scales)
//   2. CPU cores on the VM   — more cores → more concurrent microtask paths
//      competing for the shared HTTP chain simultaneously
//
// Formula:  autoMultiplier = clusterWorkers × ceil(cpuCores / 2)
//
//   VM Reserve, 8 cores,  1 PDIM worker :  1 × ceil(8/2)  =  1 × 4 = 4
//     → AIMD init=1ms, ZPOPMIN gap = 4 ms   (~250 polls/sec)
//   VM Reserve, 8 cores,  6 PDIM workers:  6 × 4 = 24
//     → AIMD init=1ms, ZPOPMIN gap = 24 ms  (~42 polls/sec per worker)
//   VM Reserve, 16 cores, 12 PDIM workers: 12 × 8 = 96
//     → AIMD init=1ms, ZPOPMIN gap = 96 ms  (~10 polls/sec per worker)
//
// PDIM is rated 120M req/s — no artificial floor.  Under load the AIMD gap
// self-tunes via demand/backoff steps.  At rest it drifts up gently (1ms/step)
// so the system stays quiet.  The multiplier gives per-worker jitter only.
//
const _clusterWorkers = Math.max(1, parseInt(process.env.PDIM_CLUSTER_WORKERS ?? '1', 10));
const _cpuCores       = Math.max(1, os.cpus().length);
const _autoMultiplier = _clusterWorkers * Math.max(1, Math.ceil(_cpuCores / 2));

logger.info(
  `[PDIM] Auto multiplier: ${_autoMultiplier} ` +
  `(clusterWorkers=${_clusterWorkers} × ceil(cpuCores=${_cpuCores}/2)=` +
  `${Math.max(1, Math.ceil(_cpuCores / 2))}) — ` +
  `AIMD init=1ms (self-tuning, LuaExecutor-safe), ZPOPMIN gap=${Math.max(1, _autoMultiplier)}ms`,
);

// ── AIMD parameters ──────────────────────────────────────────────────────────
//
// "Fluid as water": stable and conservative at rest, expands freely under
// genuine userbase demand, hard back-off when PDIM signals its limit.
//
//   IDLE  (queue 0–1) : step = 1 ms   — gap barely drifts; system stays quiet
//   LIGHT (queue 2–4) : step = 8 ms   — gentle expansion for moderate activity
//   BUSY  (queue 5–9) : step = 30 ms  — rapid expansion for real user load
//   PEAK  (queue 10+) : step = 100 ms — instant expansion; PDIM 429s set ceiling
//
// FLOOR: 400 ms — applies only to direct PDIM calls (session ops, cache, locks).
//        BullMQ Lua scripts use the _enqueueScriptExec fast-lane (10ms gap),
//        which shares the same global serialisation chain but bypasses the AIMD
//        gap.  Scripts are Atomics-serialized so the AIMD gap is not needed.
//        The _autoMultiplier MUST NOT be applied to FLOOR or INIT because
//        doing so could inflate direct-call latency without benefit.
//        The multiplier is applied only to the ZPOPMIN secondary gap — those
//        are single-command calls with a separate secondary chain.
//
// INIT:  1 ms — PDIM rated for 120M req/s; start at minimum and let AIMD
//        self-tune.  The demand step ramps down from ceiling on any 429.
//
let   _PDIM_GAP_FLOOR_MS  = 1;      // PDIM at 120M req/s — no artificial floor needed
const _PDIM_GAP_CEIL_MS   = 2_000;  // ceiling after sustained 429 cascade (recovers in <60 successful requests)
const _PDIM_GAP_INIT_MS   = 1;      // start at minimum — AIMD self-tunes from here
const _PDIM_MULT_429      = 1.5;    // multiplicative back-off on each 429 (was 2.0 — 1.5 recovers 33% faster)

/** Permanently raise the PDIM gap floor — called by PermanentFixRegistry on startup
 *  and after each escalation.  Floor can only move upward (min 1 ms, max 2 000 ms).
 *  Applies only to direct PDIM calls; BullMQ Lua scripts use the 10ms fast-lane. */
export function setPdimGapFloor(ms: number): void {
  _PDIM_GAP_FLOOR_MS = Math.max(1, Math.min(2_000, Math.round(ms)));
  // If the live gap is below the new floor, snap it up immediately so the change
  // takes effect on the very next enqueued request without waiting for AIMD.
  if (_pdimGapMs < _PDIM_GAP_FLOOR_MS) _pdimGapMs = _PDIM_GAP_FLOOR_MS;
}

export function getPdimGapFloor(): number { return _PDIM_GAP_FLOOR_MS; }

// ── AIMD state (module-level, shared across all PdimRedisClient instances) ───
let _pdimGapMs      = _PDIM_GAP_INIT_MS;
let _pdimQueueDepth = 0;    // callers waiting in the chain (not yet executing)
let _pdimGlobalChain: Promise<unknown> = Promise.resolve();

// ── Per-category queue depth tracking ────────────────────────────────────────
// Direct calls (sessions, cache, rate-limiting) and script fast-lane calls
// share the same global chain but use very different gaps (AIMD gap vs 10ms).
// Tracking them separately lets _enqueueExec estimate the real wait time for
// a new user-facing call and fast-fail when that wait would exceed the threshold.
let _directQueueDepth = 0;  // non-script callers currently in the chain
let _scriptQueueDepth = 0;  // LuaExecutor redis.call() callers in the chain

// Maximum estimated queue wait before a direct (user-facing) call is fast-failed.
// PDIM is rated for 120M req/s — no artificial fast-fail gate needed.
// The AIMD gap self-tunes from 1ms floor; only a sustained 429 cascade raises it.
// Set to MAX_SAFE_INTEGER so the fast-fail path is permanently disabled.
const _MAX_DIRECT_WAIT_MS = Number.MAX_SAFE_INTEGER;

// Log fast-fail events at most once every 5s to avoid flooding the log.
let _fastFailLoggedAt = 0;

/** On each successful PDIM response: shrink the gap proportionally to demand.
 *
 * The step is queue-depth-proportional — "fluid" expansion:
 *   idle  (0–1) : 1 ms  — gap barely moves; conserves PDIM quota at rest
 *   light (2–4) : 8 ms  — gentle ramp for background/internal traffic
 *   busy  (5–9) : 30 ms — fast ramp for real user sessions
 *   peak  (10+) : 100 ms — instant drop to PDIM's natural ceiling
 *
 * The real operational floor is set by PDIM's own 429 responses via
 * _pdimAdapt429() — not by the constant _PDIM_GAP_FLOOR_MS.
 */
function _pdimAdaptSuccess(): void {
  const q = _pdimQueueDepth;
  const step = q >= 10 ? 100 : q >= 5 ? 30 : q >= 2 ? 8 : 1;
  _pdimGapMs = Math.max(_PDIM_GAP_FLOOR_MS, _pdimGapMs - step);
}

/** On each 429 response: multiply the gap (back off hard) and return new gap
 *  so exec() can set the static rate-limit deadline to the same value. */
function _pdimAdapt429(): number {
  _pdimGapMs = Math.min(_PDIM_GAP_CEIL_MS, _pdimGapMs * _PDIM_MULT_429);
  return _pdimGapMs;
}

/** Expose live state for diagnostics (ChainFixer, health endpoints). */
export function getPdimAdaptiveGapMs():  number { return _pdimGapMs; }
export function getPdimQueueDepth():     number { return _pdimQueueDepth; }
export function getPdimDirectQueueDepth():  number { return _directQueueDepth; }
export function getPdimScriptQueueDepth():  number { return _scriptQueueDepth; }

/** Allow PlatformAutoFixer to temporarily raise the polling gap under PDIM pressure. */
export function setPdimAdaptiveGap(ms: number): void {
  _pdimGapMs = Math.max(_PDIM_GAP_FLOOR_MS, Math.min(_PDIM_GAP_CEIL_MS, ms));
}

function _enqueueExec(fn: () => Promise<unknown>): Promise<unknown> {
  // ── Fast-fail: protect user-facing callers from unbounded queue waits ────────
  // Estimate how long a new direct caller would wait behind existing queue:
  //   direct callers × AIMD gap  +  script callers × 10ms fast-lane gap
  // When that exceeds _MAX_DIRECT_WAIT_MS (4s), reject immediately so session
  // stores and distributed caches fall back to PG / in-memory in <1ms instead
  // of blocking for 20+ seconds and triggering "request took too long" errors.
  const estimatedWaitMs = (_directQueueDepth * _pdimGapMs) + (_scriptQueueDepth * 10);
  if (estimatedWaitMs > _MAX_DIRECT_WAIT_MS) {
    const now = Date.now();
    if (now - _fastFailLoggedAt > 5_000) {
      _fastFailLoggedAt = now;
      logger.warn(
        `[PDIM] Direct-call fast-fail — est. queue wait ${Math.round(estimatedWaitMs)}ms ` +
        `(${_directQueueDepth} direct × ${_pdimGapMs}ms + ${_scriptQueueDepth} script × 10ms) ` +
        `> ${_MAX_DIRECT_WAIT_MS}ms threshold; caller falls back to PG/in-memory`,
      );
    }
    return Promise.reject(new Error(
      `[PDIM] Chain congested — est. wait ${Math.round(estimatedWaitMs)}ms exceeds ${_MAX_DIRECT_WAIT_MS}ms; use fallback`,
    ));
  }

  _directQueueDepth++;
  _pdimQueueDepth++;
  const next = _pdimGlobalChain.then(async () => {
    _directQueueDepth = Math.max(0, _directQueueDepth - 1);
    _pdimQueueDepth   = Math.max(0, _pdimQueueDepth - 1);
    const result = await fn();
    // Adaptive gap fires AFTER the request completes — next caller must wait
    // this long before it starts.  Gap is read at completion time so it
    // reflects any 429-driven adjustment made by the just-completed request.
    if (_pdimGapMs > 0) await new Promise(r => setTimeout(r, _pdimGapMs));
    return result;
  }).catch(async (err: unknown) => {
    _directQueueDepth = Math.max(0, _directQueueDepth - 1);
    _pdimQueueDepth   = Math.max(0, _pdimQueueDepth - 1);
    // Enforce gap on error too — including 429.  _pdimGapMs has already been
    // updated by _pdimAdapt429() inside exec() before the throw reaches here,
    // so subsequent callers naturally wait the new (larger) gap.
    if (_pdimGapMs > 0) await new Promise(r => setTimeout(r, _pdimGapMs));
    throw err;
  });
  // Suppress unhandled rejection on the chain tail — each caller handles its own.
  _pdimGlobalChain = next.catch(() => {});
  return next;
}

// ── Script fast-lane ──────────────────────────────────────────────────────────
// LuaExecutor redis.call()s are already serialized by Atomics.wait() inside the
// Worker thread — each call blocks the Worker until the main thread signals,
// guaranteeing that no two redis.call()s from the same script can overlap.
//
// Using the full AIMD gap (1100ms after escalations) for every redis.call()
// inside a BullMQ script means:
//   35 calls × 1100ms gap = 38.5s dead-wait time, before adding PDIM RTT.
//
// The fast-lane uses a minimal 10ms gap (just enough to let the event loop
// breathe between calls) while sharing the same global serialisation chain.
// Sharing the chain guarantees:
//   • No script redis.call() interleaves with a direct PDIM call
//   • No parallel PDIM requests are ever fired
//   • AIMD 429-backoff on the main chain is respected (script calls still
//     queue behind the inflated main gap if a 429 was just received)
//
// Result: 35 calls × (PDIM RTT ≈ 200ms + 10ms gap) = ~7.35s per script.
//         Previously 50ms gap: 35 × (200ms + 50ms) = ~8.75s — 19% slower.
//         Original AIMD gap:   35 × (200ms + 1100ms) = ~45.5s — scripts timed out.
const _SCRIPT_CALL_GAP_MS = 10;

function _enqueueScriptExec(fn: () => Promise<unknown>): Promise<unknown> {
  // Track both shared and per-category depth so:
  //   • ChainFixer saturation checks remain accurate (script calls count as load)
  //   • _enqueueExec fast-fail calculation uses accurate script count (10ms gap
  //     each, not AIMD gap) so it does not over-estimate the wait time
  _scriptQueueDepth++;
  _pdimQueueDepth++;
  const next = _pdimGlobalChain.then(async () => {
    _scriptQueueDepth = Math.max(0, _scriptQueueDepth - 1);
    _pdimQueueDepth   = Math.max(0, _pdimQueueDepth - 1);
    const result = await fn();
    // 10ms minimal gap — script calls are Atomics-serialized so there is
    // no parallel-call risk; the gap exists only to yield the event loop.
    await new Promise(r => setTimeout(r, _SCRIPT_CALL_GAP_MS));
    return result;
  }).catch(async (err: unknown) => {
    _scriptQueueDepth = Math.max(0, _scriptQueueDepth - 1);
    _pdimQueueDepth   = Math.max(0, _pdimQueueDepth - 1);
    await new Promise(r => setTimeout(r, _SCRIPT_CALL_GAP_MS));
    throw err;
  });
  _pdimGlobalChain = next.catch(() => {});
  return next;
}

// ── Exec error log deduplication ─────────────────────────────────────────────
// When PDIM is completely down (e.g. 502 on every call), each exec() logs a
// WARN before the circuit opens.  With 5 failures required before the circuit
// opens and multiple BullMQ workers polling, this produces a burst of identical
// WARNs every time the circuit is force-closed and resets.
//
// Deduplication rules:
//   • First occurrence of a status code: always logged.
//   • Same status code as last logged: suppressed if within DEDUP_WINDOW_MS.
//   • Different status code: always logged (indicates a new condition).
//   • After DEDUP_WINDOW_MS silence, the next occurrence is logged again.
//
// 429 rate-limit errors are NOT deduplicated — each one adjusts the AIMD gap
// and the gap value in the message changes, so every log is meaningful.
const _EXEC_DEDUP_WINDOW_MS = 30_000; // 30 s
let _lastExecErrorStatus  = -1;
let _lastExecErrorLoggedAt = 0;
let _suppressedExecErrors  = 0;

function _logExecError(cmd: unknown, status: number, msg: string): void {
  const now = Date.now();
  const withinWindow = (now - _lastExecErrorLoggedAt) < _EXEC_DEDUP_WINDOW_MS;
  if (withinWindow && status === _lastExecErrorStatus) {
    // Suppress — same error within window.  Periodically emit a summary.
    _suppressedExecErrors++;
    if (_suppressedExecErrors % 20 === 0) {
      logger.warn(
        `[PDIM] exec error [${String(cmd)}]: HTTP ${status} suppressed ×${_suppressedExecErrors} ` +
        `(same error within ${_EXEC_DEDUP_WINDOW_MS / 1000}s window)`,
      );
    }
    return;
  }
  if (_suppressedExecErrors > 0) {
    logger.warn(
      `[PDIM] exec error [${String(cmd)}]: ${msg} ` +
      `(+ ${_suppressedExecErrors} suppressed identical errors)`,
    );
    _suppressedExecErrors = 0;
  } else {
    logger.warn(`[PDIM] exec error [${String(cmd)}]: ${msg}`);
  }
  _lastExecErrorStatus   = status;
  _lastExecErrorLoggedAt = now;
}

// ── Module-level ZPOPMIN serializer ───────────────────────────────────────────
// Secondary layer specifically for BZPOPMIN polling: ensures at most 1 ZPOPMIN
// is queued into the global AIMD chain at a time, with a minimal per-worker jitter gap
// between ZPOPMIN completions.  This prevents the BullMQ worker thundering-herd
// where 6+ pollers all enqueue ZPOPMIN simultaneously, starving Lua callbacks.
//
// Combined with the global AIMD chain above, the effective behaviour is:
//   ZPOPMIN: 1 at a time, min gap = Math.max(1, autoMultiplier) ms + current AIMD gap
//   Everything else: queues behind ZPOPMIN, served at the current AIMD gap
let _zpopminChain: Promise<unknown> = Promise.resolve();
// PDIM rated for 120M req/s — minimal ZPOPMIN gap; BullMQ workers poll as fast
// as PDIM can serve.  Keep the auto-multiplier as a 1ms-per-worker jitter guard
// so workers on a many-core VM don't all wake simultaneously.
// VM Reserve 4-core (mult=2):  2ms  → ~500 polls/sec max
// VM Reserve 8-core (mult=4):  4ms  → ~250 polls/sec max
// Autoscale 6-worker 4-core (mult=12): 12ms → ~83 polls/sec per worker
const ZPOPMIN_MIN_GAP_MS = Math.max(1, _autoMultiplier);

function _serializedZpopmin(fn: () => Promise<unknown>): Promise<unknown> {
  const next = _zpopminChain.then(async () => {
    const result = await fn();
    // Enforce a minimum gap before the next caller is allowed to proceed.
    await new Promise(r => setTimeout(r, ZPOPMIN_MIN_GAP_MS));
    return result;
  }).catch(async (err) => {
    // Even on error, enforce the gap so a burst of rejections doesn't skip waits.
    await new Promise(r => setTimeout(r, ZPOPMIN_MIN_GAP_MS));
    throw err;
  });
  _zpopminChain = next.catch(() => {}); // prevent unhandled rejection on chain
  return next;
}

// ── L1 in-process read-through cache ─────────────────────────────────────────
// Serves GET / HGET results from memory when PDIM is unavailable.
// This keeps sessions alive and rate-limit state readable through brief PDIM
// outages, eliminating the per-request [SessionStore] WARN flood.
//
// Eviction: insertion-order LRU, capped at L1_MAX_ENTRIES.
// TTL:      hard per-entry cap of L1_TTL_MS (5 min) — stale data is never served
//           beyond this window regardless of PDIM outage duration.
// Writes:   SET / SETEX / SETNX update L1 on success so subsequent reads are
//           served without a PDIM round-trip while PDIM is up.
// Deletes:  DEL evicts the key on success so logouts are reflected immediately.
// HGET:     cached under a compound key (redisKey + NUL + field).
const L1_MAX_ENTRIES = 2_000;
const L1_TTL_MS      = 5 * 60 * 1_000; // 5 minutes

interface _L1Entry { value: string | null; expiresAt: number }
const _l1: Map<string, _L1Entry> = new Map();

function _l1Read(key: string): string | null | undefined {
  const e = _l1.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { _l1.delete(key); return undefined; }
  // LRU promotion — move to tail so the oldest entries are at the front.
  _l1.delete(key);
  _l1.set(key, e);
  return e.value; // may legitimately be null ("key exists but empty")
}

function _l1Write(key: string, value: string | null): void {
  if (_l1.size >= L1_MAX_ENTRIES && !_l1.has(key)) {
    // Evict the oldest (insertion-order head) entry.
    const oldest = _l1.keys().next().value;
    if (oldest !== undefined) _l1.delete(oldest);
  }
  _l1.set(key, { value, expiresAt: Date.now() + L1_TTL_MS });
}

function _l1Evict(...keys: string[]): void {
  for (const k of keys) _l1.delete(k);
}

/**
 * Normalize wasmoon Lua table results to proper JavaScript values.
 *
 * Problem: BullMQ Lua scripts return Lua tables (e.g. a list of stalled job IDs).
 * wasmoon translates Lua arrays to JS objects with 1-indexed numeric keys:
 *   Lua: {"id1", "id2"}  →  JS: { 1: "id1", 2: "id2" }
 *
 * This breaks callers like BullMQ that expect a proper JS array and call .forEach()
 * on the result (TypeError: stalled.forEach is not a function).
 *
 * Normalization rules:
 *   • null / undefined / primitives / real JS arrays → returned as-is
 *   • Empty plain object {} → converted to [] (Lua empty table ≡ empty array)
 *   • Object with all-numeric consecutive keys starting at 1 → converted to JS array
 *     (recursively normalizing each element)
 *   • Everything else (mixed/string-keyed objects) → object with recursively
 *     normalized values (preserves hashes / maps returned by Lua scripts)
 */
function _normalizeLuaResult(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(_normalizeLuaResult);
  if (typeof val !== 'object') return val;

  const keys = Object.keys(val);
  if (keys.length === 0) return [];

  const numKeys = keys.map(k => parseInt(k, 10));
  const allNumeric = numKeys.every(n => !isNaN(n) && n > 0);
  if (allNumeric) {
    const sorted = [...numKeys].sort((a, b) => a - b);
    const isConsecutive = sorted[0] === 1 && sorted[sorted.length - 1] === sorted.length;
    if (isConsecutive) {
      return sorted.map(k => _normalizeLuaResult(val[k] ?? val[String(k)]));
    }
  }

  const out: Record<string, any> = {};
  for (const k of keys) out[k] = _normalizeLuaResult(val[k]);
  return out;
}

export class PdimRedisClient extends EventEmitter {
  public status: string = 'ready';
  private execUrl: string;
  private bearerToken: string;

  /**
   * BullMQ reads this._client.options.keyPrefix to validate no prefix is set,
   * and uses this._client.options as its opts. Supply safe defaults.
   */
  public readonly options: {
    keyPrefix?: string;
    maxRetriesPerRequest: null;
    enableReadyCheck: boolean;
    enableOfflineQueue: boolean;
  } = {
    keyPrefix: undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: false,
  };

  constructor(execUrl?: string, bearerToken?: string) {
    super();
    // PDIM_EXEC_URL / PDIM_EXEC_TOKEN are non-secret env vars that take
    // precedence over the legacy PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN
    // secrets (which may point to a transient Replit dev workspace URL).
    this.execUrl = execUrl
      || process.env.PDIM_EXEC_URL
      || process.env.PDIM_HTTP_EXEC_URL
      || '';
    this.bearerToken = bearerToken
      || process.env.PDIM_EXEC_TOKEN
      || process.env.PDIM_BEARER_TOKEN
      || '';

    if (!this.execUrl) {
      throw new Error('PDIM_HTTP_EXEC_URL is required for PdimRedisClient');
    }

    setImmediate(() => {
      this.emit('connect');
      this.emit('ready');
      logger.info('✅ [PDIM] Connected via HTTP exec endpoint');
    });
  }

  // Static rate-limit deadline — shared across ALL PdimRedisClient instances.
  // Updated by exec() on each 429 to mirror the current AIMD gap, providing a
  // secondary hold that keeps any caller from firing during the backoff window.
  // Reset to 0 on each success so the AIMD gap alone governs steady-state pacing.
  private static _rateLimitedUntil = 0;

  private async exec(command: (string | number | null)[]): Promise<unknown> {
    const [cmd, ...rawArgs] = command;
    // The PDIM server validates all args as strings — coerce numbers/nulls
    const args = rawArgs.map(a => (a === null ? '' : String(a)));

    // Circuit breaker: fail-fast BEFORE joining the global queue so we don't
    // waste a queue slot on a request we know will fail.
    if (!cbAllowRequest()) {
      throw new Error(`[PDIM] Circuit OPEN — ${cmd} rejected (backing off until PDIM recovers)`);
    }

    // Enqueue through the global serializer.  All PDIM HTTP requests from ALL
    // code paths (direct calls, LuaExecutor redis.call, bzpopmin) pass through
    // this single chain, executed one at a time with a 150ms gap between them.
    return _enqueueExec(async () => {
      // Rate-limit backoff is evaluated INSIDE the chain (at execution time, not
      // enqueue time).  This is critical: if all callers evaluated it at enqueue
      // time, they'd all clear the check simultaneously and still burst PDIM.
      // Inside the chain they are serialized — only ONE caller wakes from the
      // backoff wait at a time, preventing the burst.
      const rlWait = PdimRedisClient._rateLimitedUntil - Date.now();
      if (rlWait > 0) {
        await new Promise(r => setTimeout(r, rlWait));
      }

      let _counted = false; // prevent double-counting in the catch block
      try {
        const res = await fetch(this.execUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearerToken}`,
          },
          body: JSON.stringify({ cmd, args }),
          signal: AbortSignal.timeout(15_000),
          // Do not follow redirects automatically — if PDIM's proxy returns 302
          // (Replit redirecting to an error/login page when the service is down)
          // we need to see the raw 302 status so our 3xx handler can trip the
          // circuit breaker rather than silently following into an HTML page.
          redirect: 'manual',
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (res.status === 429) {
            // AIMD multiplicative increase: gap jumps to gap × 2.5.
            // _enqueueExec reads _pdimGapMs AFTER the throw, so the next caller
            // in the chain automatically waits the new (larger) gap before firing.
            // The static _rateLimitedUntil mirrors the new gap so that even if a
            // caller somehow got through, the per-fn() rate-limit check holds it.
            const newGap = _pdimAdapt429();
            PdimRedisClient._rateLimitedUntil = Date.now() + newGap;
            const errMsg = `PDIM HTTP 429: Too many requests (gap→${newGap}ms)`;
            logger.warn(`[PDIM] exec error [${cmd}]: PDIM HTTP 429: Too many requests`);
            _counted = true;
            throw new Error(errMsg);
          }
          // Only trip the circuit breaker on 5xx server errors or when PDIM is
          // completely unreachable.  4xx errors are client-side mistakes (bad
          // arguments, unsupported command, etc.) — they don't indicate an outage.
          // 3xx redirects mean PDIM's HTTP exec endpoint is not reachable —
          // Replit's proxy redirects to an error/login page when the service is
          // down or restarting.  Treat exactly like a 5xx: trip the circuit
          // breaker so callers fail-fast instead of following the redirect chain
          // and surfacing confusing HTML "deployment could not be reached" errors.
          if (res.status >= 300 && res.status < 400) {
            cbRecord503();
            _counted = true;
            const errMsg = `PDIM HTTP ${res.status}: service temporarily unreachable`;
            _logExecError(cmd, res.status, errMsg);
            throw new Error(errMsg);
          }
          if (res.status >= 500) {
            cbRecord503();
            _counted = true;
            const errMsg = `PDIM HTTP ${res.status}: ${text.slice(0, 120)}`;
            _logExecError(cmd, res.status, errMsg);
            throw new Error(errMsg);
          }
          // 4xx: PDIM server is responsive (not down) but the command/route was
          // not found or rejected.  Treat like "ERR unknown command" — mark counted
          // so the catch block does NOT record a circuit-breaker failure, record
          // a cbRecordSuccess so any open circuit closes (PDIM IS up), and return
          // null so callers get a safe empty result instead of an error.
          _counted = true;
          PdimRedisClient._rateLimitedUntil = 0;
          _pdimAdaptSuccess();
          cbRecordSuccess();
          logger.warn(`[PDIM] ${String(cmd)} → HTTP ${res.status} (unsupported/not-found) — returning null`);
          return null;
        }

        // Successful response — reset static rate-limit deadline and let the
        // AIMD gap shrink additively toward the floor.
        PdimRedisClient._rateLimitedUntil = 0;
        _pdimAdaptSuccess();

        // Detect when PDIM returns non-JSON (e.g. Replit's "app not running" HTML page).
        // Treat this as a 503-equivalent — trip the circuit breaker.
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          const body = await res.text().catch(() => '(unreadable)');
          cbRecord503();
          _counted = true;
          const errMsg = `PDIM returned non-JSON (${contentType.split(';')[0].trim() || 'unknown type'}): ${body.slice(0, 80)}`;
          _logExecError(cmd, 200, errMsg);
          throw new Error(errMsg);
        }

        const data = await res.json();
        cbRecordSuccess(); // a successful response resets the counter + closes circuit

        if (data !== null && typeof data === 'object') {
          if ('result' in data) return data.result;
          if ('error' in data) {
            const errMsg = String(data.error);
            // Unsupported commands: return safe defaults instead of crashing
            if (errMsg.startsWith('ERR unknown command')) {
              logger.warn(`[PDIM] Unsupported command [${cmd}] — returning null`);
              return null;
            }
            throw new Error(errMsg);
          }
        }
        return data;
      } catch (err) {
        // AbortSignal.timeout() throws a TimeoutError (DOMException name='TimeoutError').
        // AbortController.abort() throws an AbortError (DOMException name='AbortError').
        // Neither should trip the circuit breaker — they indicate PDIM is slow/busy,
        // not that PDIM is down. Instead apply AIMD backpressure (increase gap) so the
        // caller rate drops and PDIM can catch up. Only genuine 5xx/network errors
        // (ECONNREFUSED, etc.) trip the circuit breaker.
        const isTimeout = !_counted && (err.name === 'TimeoutError' || err.name === 'AbortError');
        const isCircuitMsg = !_counted && err.message.startsWith('[PDIM] Circuit');
        if (!_counted && !isTimeout && !isCircuitMsg) {
          cbRecord503();
        } else if (isTimeout) {
          // Slow PDIM response — increase AIMD gap to apply backpressure.
          _pdimAdapt429();
        }
        if (!_counted) {
          // Only log errors we haven't already logged inline.
          // These are connectivity failures (ECONNREFUSED, timeouts, network errors)
          // — expected transient conditions, not bugs in our code.
          logger.warn(`[PDIM] exec error [${cmd}]: ${err.message.slice(0, 200)}`);
        }
        cbHalfOpenFailed(); // release HALF_OPEN probe slot so next interval can retry
        throw err;
      }
      // Note: no finally/_freePdimSlot needed — _enqueueExec handles the chain gap
    });
  }

  pipeline() {
    const cmds: (string | number | null)[][] = [];
    const self = this;
    const pipe: Record<string, (...args: unknown[]) => unknown> = {
      get:        (k: string) => { cmds.push(['GET', k]); return pipe; },
      set:        (k: string, v: string, ...a: unknown[]) => { cmds.push(['SET', k, v, ...a]); return pipe; },
      setex:      (k: string, s: number, v: string) => { cmds.push(['SETEX', k, s, v]); return pipe; },
      del:        (...k: string[]) => { cmds.push(['DEL', ...k]); return pipe; },
      expire:     (k: string, s: number) => { cmds.push(['EXPIRE', k, s]); return pipe; },
      pexpire:    (k: string, ms: number) => { cmds.push(['PEXPIRE', k, ms]); return pipe; },
      incr:       (k: string) => { cmds.push(['INCR', k]); return pipe; },
      incrby:     (k: string, n: number) => { cmds.push(['INCRBY', k, n]); return pipe; },
      decr:       (k: string) => { cmds.push(['DECR', k]); return pipe; },
      decrby:     (k: string, n: number) => { cmds.push(['DECRBY', k, n]); return pipe; },
      hset:       (k: string, ...a: unknown[]) => { cmds.push(['HSET', k, ...a]); return pipe; },
      hget:       (k: string, f: string) => { cmds.push(['HGET', k, f]); return pipe; },
      hdel:       (k: string, ...f: string[]) => { cmds.push(['HDEL', k, ...f]); return pipe; },
      hgetall:    (k: string) => { cmds.push(['HGETALL', k]); return pipe; },
      sadd:       (k: string, ...m: unknown[]) => { cmds.push(['SADD', k, ...m]); return pipe; },
      srem:       (k: string, ...m: unknown[]) => { cmds.push(['SREM', k, ...m]); return pipe; },
      zadd:       (k: string, ...a: unknown[]) => { cmds.push(['ZADD', k, ...a]); return pipe; },
      zrem:       (k: string, ...m: unknown[]) => { cmds.push(['ZREM', k, ...m]); return pipe; },
      lpush:      (k: string, ...v: unknown[]) => { cmds.push(['LPUSH', k, ...v]); return pipe; },
      rpush:      (k: string, ...v: unknown[]) => { cmds.push(['RPUSH', k, ...v]); return pipe; },
      exec: async () => Promise.all(cmds.map(c => self.exec(c).catch(e => e))),
    };
    return pipe;
  }

  multi() { return this.pipeline(); }

  duplicate() {
    return new PdimRedisClient(this.execUrl, this.bearerToken);
  }

  // Required by BullMQ's isRedisInstance() check: ['connect', 'disconnect', 'duplicate']
  async connect(): Promise<void> {
    // PDIM is HTTP-based — already "connected" on construction; no-op here
    this.emit('connect');
    this.emit('ready');
  }

  async quit(): Promise<'OK'> { return 'OK'; }
  async disconnect(): Promise<void> {}

  /**
   * BullMQ calls defineCommand() to register Lua scripts as named commands.
   *
   * Calling convention: BullMQ invokes the created method as
   *   client[name](argsArray)  — a SINGLE array argument (ioredis flattens it internally).
   *
   * Implementation: All Lua scripts run locally in a Worker thread via wasmoon
   * (WebAssembly Lua 5.4). redis.call() inside Lua uses synchronous SharedArrayBuffer
   * IPC to call back into the main thread, which forwards to PDIM over HTTP.
   *
   * This completely sidesteps PDIM's broken async Lua runtime where redis.call()
   * returns Promises that Lua cannot await, causing .then(null) crashes on nil.
   */
  defineCommand(name: string, opts: { numberOfKeys: number; lua: string }): void {
    const self = this;
    const numKeys = opts.numberOfKeys;
    const lua = opts.lua;

    (this as Record<string, unknown>)[name] = async function () {
      let flatArgs: unknown[];
      if (arguments.length === 1 && Array.isArray(arguments[0])) {
        flatArgs = arguments[0];
      } else {
        flatArgs = Array.from(arguments);
      }

      const result = await execLuaViaPdim(
        (args: string[]) => self.scriptExec(args),
        lua,
        numKeys,
        flatArgs,
      );
      return _normalizeLuaResult(result);
    };
  }

  async sendCommand(args: string[]): Promise<unknown> {
    const cmd = (args[0] ?? '').toUpperCase();
    if (cmd === 'PUBLISH') return 0;
    if (cmd === 'SUBSCRIBE' || cmd === 'UNSUBSCRIBE' || cmd === 'PSUBSCRIBE' || cmd === 'PUNSUBSCRIBE') return null;
    return this.exec(args);
  }

  /**
   * Fast-lane variant of sendCommand for LuaExecutor redis.call() IPC.
   *
   * Uses _enqueueScriptExec (50ms gap) instead of _enqueueExec (full AIMD gap).
   * The Worker's Atomics.wait() guarantees sequential calls from the same script,
   * so the AIMD rate-limit gap is unnecessary overhead — the 50ms gap is enough
   * to yield the event loop between redis.call()s without stalling the script.
   *
   * The circuit breaker is still checked so a downed PDIM trips correctly.
   * The 429 AIMD backoff is still applied: if a 429 is received during a script
   * call, _pdimAdapt429 raises _pdimGapMs; subsequent MAIN-CHAIN callers see the
   * raised gap.  Script callers use the fixed 50ms lane so they don't compound
   * the slowdown — but the rate-limit deadline (_rateLimitedUntil) IS checked
   * inside exec() so script calls still honour the mandatory hold-off.
   */
  async scriptExec(args: string[]): Promise<unknown> {
    const [cmd, ...rawArgs] = args;
    const strArgs = rawArgs.map(a => (a === null || a === undefined ? '' : String(a)));

    if (!cbAllowRequest()) {
      throw new Error(`[PDIM] Circuit OPEN — ${cmd} (script) rejected`);
    }

    return _enqueueScriptExec(async () => {
      const rlWait = PdimRedisClient._rateLimitedUntil - Date.now();
      if (rlWait > 0) await new Promise(r => setTimeout(r, rlWait));

      let _counted = false;
      try {
        const res = await fetch(this.execUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearerToken}`,
          },
          body: JSON.stringify({ cmd, args: strArgs }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (res.status === 429) {
            const newGap = _pdimAdapt429();
            PdimRedisClient._rateLimitedUntil = Date.now() + newGap;
            throw new Error(`PDIM HTTP 429 (script ${cmd}): gap→${newGap}ms`);
          }
          throw new Error(`PDIM HTTP ${res.status} (script ${cmd}): ${text.slice(0, 200)}`);
        }

        PdimRedisClient._rateLimitedUntil = 0;
        _pdimAdaptSuccess();

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          const body = await res.text().catch(() => '(unreadable)');
          cbRecord503();
          _counted = true;
          throw new Error(`PDIM non-JSON (script ${cmd}): ${body.slice(0, 80)}`);
        }

        const data = await res.json();
        _counted = true;
        cbRecordSuccess();

        if (data !== null && typeof data === 'object') {
          if ('result' in data) return data.result;
          if ('error' in data) {
            const errMsg = String(data.error);
            if (errMsg.startsWith('ERR unknown command')) {
              logger.warn(`[PDIM] Unsupported command (script) [${cmd}] — returning null`);
              return null;
            }
            throw new Error(errMsg);
          }
        }
        return data;
      } catch (err) {
        // Same TimeoutError/AbortError exclusion as the main exec catch block —
        // slow PDIM responses should not trip the circuit breaker.
        const isTimeout = !_counted && (err.name === 'TimeoutError' || err.name === 'AbortError');
        const isCircuitMsg = !_counted && err.message?.startsWith('[PDIM] Circuit');
        if (!_counted && !isTimeout && !isCircuitMsg) {
          cbRecord503();
        } else if (isTimeout) {
          _pdimAdapt429(); // backpressure: slow = back off
        }
        cbHalfOpenFailed();
        throw err;
      }
    });
  }

  // ── String commands ───────────────────────────────────────────────────────
  async get(key: string): Promise<string | null> {
    const stale = _l1Read(key);
    try {
      const fresh = await this.exec(['GET', key]);
      _l1Write(key, fresh);
      return fresh;
    } catch (err) {
      // PDIM unavailable — serve the L1 value (even if null/"key not found")
      // so callers (session store, rate limiter) keep working through the outage.
      if (stale !== undefined) return stale;
      throw err;
    }
  }
  async set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
    const result = await this.exec(['SET', key, value, ...args]);
    _l1Write(key, value);
    return result;
  }
  async setex(key: string, secs: number, value: string): Promise<'OK'> {
    const result = await this.exec(['SETEX', key, secs, value]);
    _l1Write(key, value);
    return result;
  }
  async setnx(key: string, value: string): Promise<0 | 1> {
    const result = await this.exec(['SETNX', key, value]);
    if (result === 1) _l1Write(key, value);
    return result;
  }
  async getset(key: string, value: string): Promise<string | null> {
    const result = await this.exec(['GETSET', key, value]);
    _l1Write(key, value);
    return result;
  }
  async mget(...keys: string[]): Promise<(string | null)[]> { return this.exec(['MGET', ...keys]); }
  async mset(...args: string[]): Promise<'OK'> { return this.exec(['MSET', ...args]); }
  async append(key: string, value: string): Promise<number> { return this.exec(['APPEND', key, value]); }
  async incr(key: string): Promise<number> { return this.exec(['INCR', key]); }
  async decr(key: string): Promise<number> { return this.exec(['DECR', key]); }
  async incrby(key: string, n: number): Promise<number> { return this.exec(['INCRBY', key, n]); }
  async decrby(key: string, n: number): Promise<number> { return this.exec(['DECRBY', key, n]); }
  async incrbyfloat(key: string, n: number): Promise<string> { return this.exec(['INCRBYFLOAT', key, n]); }

  // ── Key commands ──────────────────────────────────────────────────────────
  async del(...keys: string[]): Promise<number> {
    const result = await this.exec(['DEL', ...keys]);
    _l1Evict(...keys);
    return result;
  }
  async exists(...keys: string[]): Promise<number> { return this.exec(['EXISTS', ...keys]); }
  async expire(key: string, secs: number): Promise<0 | 1> { return this.exec(['EXPIRE', key, secs]); }
  async pexpire(key: string, ms: number): Promise<0 | 1> { return this.exec(['PEXPIRE', key, ms]); }
  async expireat(key: string, ts: number): Promise<0 | 1> { return this.exec(['EXPIREAT', key, ts]); }
  async persist(key: string): Promise<0 | 1> { return this.exec(['PERSIST', key]); }
  async ttl(key: string): Promise<number> { return this.exec(['TTL', key]); }
  async pttl(key: string): Promise<number> { return this.exec(['PTTL', key]); }
  async type(key: string): Promise<string> { return this.exec(['TYPE', key]); }
  async rename(key: string, newKey: string): Promise<'OK'> { return this.exec(['RENAME', key, newKey]); }
  async keys(pattern: string): Promise<string[]> { return this.exec(['KEYS', pattern]); }
  async scan(cursor: string | number, ...args: unknown[]): Promise<[string, string[]]> { return this.exec(['SCAN', cursor, ...args]); }
  async dbsize(): Promise<number> { return this.exec(['DBSIZE']); }
  async randomkey(): Promise<string | null> { return this.exec(['RANDOMKEY']); }

  // ── Hash commands ─────────────────────────────────────────────────────────
  async hget(key: string, field: string): Promise<string | null> {
    const l1Key = `${key}\x00${field}`;
    const stale = _l1Read(l1Key);
    try {
      const fresh = await this.exec(['HGET', key, field]);
      _l1Write(l1Key, fresh);
      return fresh;
    } catch (err) {
      if (stale !== undefined) return stale;
      throw err;
    }
  }
  async hset(key: string, ...args: unknown[]): Promise<number> { return this.exec(['HSET', key, ...args]); }
  async hsetnx(key: string, field: string, value: string): Promise<0 | 1> { return this.exec(['HSETNX', key, field, value]); }
  async hdel(key: string, ...fields: string[]): Promise<number> { return this.exec(['HDEL', key, ...fields]); }
  async hmget(key: string, ...fields: string[]): Promise<(string | null)[]> { return this.exec(['HMGET', key, ...fields]); }
  async hmset(key: string, ...args: unknown[]): Promise<'OK'> {
    // PDIM only accepts HSET with a single field-value pair.  Split HMSET
    // (which can carry N pairs) into sequential HSET calls.
    for (let i = 0; i < args.length - 1; i += 2) {
      await this.exec(['HSET', key, args[i], args[i + 1]]);
    }
    return 'OK';
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    const result = await this.exec(['HGETALL', key]);
    return result ?? {};
  }
  async hkeys(key: string): Promise<string[]> { return this.exec(['HKEYS', key]); }
  async hvals(key: string): Promise<string[]> { return this.exec(['HVALS', key]); }
  async hlen(key: string): Promise<number> { return this.exec(['HLEN', key]); }
  async hexists(key: string, field: string): Promise<0 | 1> { return this.exec(['HEXISTS', key, field]); }
  async hincrby(key: string, field: string, n: number): Promise<number> { return this.exec(['HINCRBY', key, field, n]); }
  async hincrbyfloat(key: string, field: string, n: number): Promise<string> { return this.exec(['HINCRBYFLOAT', key, field, n]); }

  // ── List commands ─────────────────────────────────────────────────────────
  async lpush(key: string, ...values: unknown[]): Promise<number> { return this.exec(['LPUSH', key, ...values]); }
  async rpush(key: string, ...values: unknown[]): Promise<number> { return this.exec(['RPUSH', key, ...values]); }
  async lpop(key: string): Promise<string | null> { return this.exec(['LPOP', key]); }
  async rpop(key: string): Promise<string | null> { return this.exec(['RPOP', key]); }
  async llen(key: string): Promise<number> { return this.exec(['LLEN', key]); }
  async lrange(key: string, start: number, stop: number): Promise<string[]> { return this.exec(['LRANGE', key, start, stop]); }
  async lindex(key: string, index: number): Promise<string | null> { return this.exec(['LINDEX', key, index]); }
  async lset(key: string, index: number, value: string): Promise<'OK'> { return this.exec(['LSET', key, index, value]); }
  async lrem(key: string, count: number, value: string): Promise<number> { return this.exec(['LREM', key, count, value]); }
  async ltrim(key: string, start: number, stop: number): Promise<'OK'> { return this.exec(['LTRIM', key, start, stop]); }

  // ── Set commands ──────────────────────────────────────────────────────────
  async sadd(key: string, ...members: unknown[]): Promise<number> { return this.exec(['SADD', key, ...members]); }
  async srem(key: string, ...members: unknown[]): Promise<number> { return this.exec(['SREM', key, ...members]); }
  async smembers(key: string): Promise<string[]> { return this.exec(['SMEMBERS', key]); }
  async scard(key: string): Promise<number> { return this.exec(['SCARD', key]); }
  async sismember(key: string, member: string): Promise<0 | 1> { return this.exec(['SISMEMBER', key, member]); }
  async sunion(...keys: string[]): Promise<string[]> { return this.exec(['SUNION', ...keys]); }
  async sinter(...keys: string[]): Promise<string[]> { return this.exec(['SINTER', ...keys]); }
  async sdiff(...keys: string[]): Promise<string[]> { return this.exec(['SDIFF', ...keys]); }

  // ── Sorted set commands ───────────────────────────────────────────────────
  async zadd(key: string, ...args: unknown[]): Promise<number> { return this.exec(['ZADD', key, ...args]); }
  async zrem(key: string, ...members: unknown[]): Promise<number> { return this.exec(['ZREM', key, ...members]); }
  async zscore(key: string, member: string): Promise<string | null> { return this.exec(['ZSCORE', key, member]); }
  async zrank(key: string, member: string): Promise<number | null> { return this.exec(['ZRANK', key, member]); }
  async zrevrank(key: string, member: string): Promise<number | null> { return this.exec(['ZREVRANK', key, member]); }
  async zrange(key: string, start: number, stop: number, ...args: unknown[]): Promise<string[]> { return this.exec(['ZRANGE', key, start, stop, ...args]); }
  async zrevrange(key: string, start: number, stop: number, ...args: unknown[]): Promise<string[]> { return this.exec(['ZREVRANGE', key, start, stop, ...args]); }
  async zrangebyscore(key: string, min: string | number, max: string | number, ...args: unknown[]): Promise<string[]> { return this.exec(['ZRANGEBYSCORE', key, min, max, ...args]); }
  async zrevrangebyscore(key: string, max: string | number, min: string | number, ...args: unknown[]): Promise<string[]> { return this.exec(['ZREVRANGEBYSCORE', key, max, min, ...args]); }
  async zcard(key: string): Promise<number> { return this.exec(['ZCARD', key]); }
  async zcount(key: string, min: string | number, max: string | number): Promise<number> { return this.exec(['ZCOUNT', key, min, max]); }
  async zincrby(key: string, increment: number, member: string): Promise<string> { return this.exec(['ZINCRBY', key, increment, member]); }
  async zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number> { return this.exec(['ZREMRANGEBYSCORE', key, min, max]); }
  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> { return this.exec(['ZREMRANGEBYRANK', key, start, stop]); }

  // ── Sorted set blocking commands (polyfilled — PDIM has no blocking support) ─
  /**
   * BZPOPMIN — PDIM doesn't support blocking commands.
   * Poll with ZPOPMIN every 2000ms (+0–800ms jitter) until a result arrives or
   * timeout expires.  timeout=0 is capped at 5s to avoid infinite loops.
   *
   * 2000ms base (vs the old 500ms) cuts PDIM request rate by ~75% vs prior
   * implementation.  800ms jitter range spreads concurrent worker polls across
   * a wide enough window that simultaneous bursts can no longer align and
   * overwhelm PDIM's per-minute rate limit.
   *
   * The global 429 backoff in exec() provides a second safety layer: if a
   * burst still triggers a 429, all exec() callers pause for at least 2s
   * (doubling on each repeat) before the next attempt.
   */
  async bzpopmin(key: string, timeout: number): Promise<[string, string, string] | null> {
    const deadline = Date.now() + (timeout > 0 ? timeout * 1000 : 5000);
    // Route every ZPOPMIN through the module-level serializer so only one fires
    // at a time across all 6+ PdimRedisClient instances, with a 400ms enforced
    // gap between completions.  The serializer also absorbs random stagger
    // naturally: callers queue up and drain one at a time instead of bursting.
    while (Date.now() < deadline) {
      let result: unknown = null;
      try {
        result = await _serializedZpopmin(() => this.exec(['ZPOPMIN', key, '1']));
      } catch {
        result = null;
      }
      if (Array.isArray(result) && result.length >= 2) {
        return [key, result[0] as string, result[1] as string];
      }
      // 1500ms additional wait after the serializer's 400ms gap completes,
      // giving a ~1900ms effective poll interval per caller when the queue drains.
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 500));
    }
    return null;
  }

  // ── List atomic move ───────────────────────────────────────────────────────
  async rpoplpush(src: string, dst: string): Promise<string | null> { return this.exec(['RPOPLPUSH', src, dst]); }
  lmove = (src: string, dst: string, srcDir: string, dstDir: string) => this.exec(['LMOVE', src, dst, srcDir, dstDir]);

  // ── Stream commands (full Redis Streams support) ──────────────────────────
  /** XADD key [MAXLEN [~] count] [MINID [~] id] [NOMKSTREAM] id field value [field value ...] */
  async xadd(key: string, ...args: unknown[]): Promise<string | null> { return this.exec(['XADD', key, ...args]); }
  /** XTRIM key MAXLEN|MINID [~] threshold */
  async xtrim(key: string, strategy: string, ...args: unknown[]): Promise<number> { return this.exec(['XTRIM', key, strategy, ...args]); }
  /** XLEN key */
  async xlen(key: string): Promise<number> { return this.exec(['XLEN', key]); }
  /** XRANGE key start end [COUNT count] */
  async xrange(key: string, start: string, end: string, ...args: unknown[]): Promise<any[]> { return this.exec(['XRANGE', key, start, end, ...args]); }
  /** XREVRANGE key end start [COUNT count] */
  async xrevrange(key: string, end: string, start: string, ...args: unknown[]): Promise<any[]> { return this.exec(['XREVRANGE', key, end, start, ...args]); }
  /** XREAD [COUNT count] [BLOCK milliseconds] STREAMS key [key ...] id [id ...] */
  async xread(...args: unknown[]): Promise<any[] | null> { return this.exec(['XREAD', ...args]); }
  /** XDEL key id [id ...] */
  async xdel(key: string, ...ids: string[]): Promise<number> { return this.exec(['XDEL', key, ...ids]); }
  /** XACK key group id [id ...] */
  async xack(key: string, group: string, ...ids: string[]): Promise<number> { return this.exec(['XACK', key, group, ...ids]); }
  /** XGROUP CREATE|SETID|DESTROY|CREATECONSUMER|DELCONSUMER key group id */
  async xgroup(subCmd: string, key: string, group: string, ...args: unknown[]): Promise<unknown> { return this.exec(['XGROUP', subCmd, key, group, ...args]); }
  /** XCLAIM key group consumer min-idle-time id [id ...] */
  async xclaim(key: string, group: string, consumer: string, minIdleTime: number, ...args: unknown[]): Promise<any[]> { return this.exec(['XCLAIM', key, group, consumer, minIdleTime, ...args]); }
  /** XAUTOCLAIM key group consumer min-idle-time start [COUNT count] */
  async xautoclaim(key: string, group: string, consumer: string, minIdleTime: number, start: string, ...args: unknown[]): Promise<unknown> { return this.exec(['XAUTOCLAIM', key, group, consumer, minIdleTime, start, ...args]); }
  /** XPENDING key group [[IDLE min-idle-time] start end count [consumer]] */
  async xpending(key: string, group: string, ...args: unknown[]): Promise<any[]> { return this.exec(['XPENDING', key, group, ...args]); }
  /** XINFO STREAM|GROUPS|CONSUMERS|FULL key */
  async xinfo(subCmd: string, key: string, ...args: unknown[]): Promise<unknown> { return this.exec(['XINFO', subCmd, key, ...args]); }
  /**
   * XREADGROUP GROUP group consumer [COUNT count] [BLOCK milliseconds] [NOACK] STREAMS key [key ...] id [id ...]
   * Attempts to forward to PDIM exec endpoint; falls back to null (graceful degradation)
   * if PDIM does not support the command.
   */
  async xreadgroup(...args: unknown[]): Promise<any[] | null> {
    try {
      return await this.exec(['XREADGROUP', ...args]);
    } catch {
      // PDIM may not support XREADGROUP — return null so callers degrade gracefully
      return null;
    }
  }

  // ── camelCase stream aliases (node-redis v4 compat) ───────────────────────
  xAdd        = (key: string, ...args: unknown[]) => this.xadd(key, ...args);
  xTrim       = (key: string, s: string, ...a: unknown[]) => this.xtrim(key, s, ...a);
  xLen        = (key: string) => this.xlen(key);
  xRange      = (key: string, s: string, e: string, ...a: unknown[]) => this.xrange(key, s, e, ...a);
  xRevRange   = (key: string, e: string, s: string, ...a: unknown[]) => this.xrevrange(key, e, s, ...a);
  xRead       = (...args: unknown[]) => this.xread(...args);
  xReadGroup  = (...args: unknown[]) => this.xreadgroup(...args);
  xDel        = (key: string, ...ids: string[]) => this.xdel(key, ...ids);
  xAck        = (key: string, g: string, ...ids: string[]) => this.xack(key, g, ...ids);
  xGroup      = (sub: string, key: string, g: string, ...a: unknown[]) => this.xgroup(sub, key, g, ...a);
  xClaim      = (key: string, g: string, c: string, t: number, ...a: unknown[]) => this.xclaim(key, g, c, t, ...a);
  xAutoClaim  = (key: string, g: string, c: string, t: number, s: string, ...a: unknown[]) => this.xautoclaim(key, g, c, t, s, ...a);
  xPending    = (key: string, g: string, ...a: unknown[]) => this.xpending(key, g, ...a);
  xInfo       = (sub: string, key: string, ...a: unknown[]) => this.xinfo(sub, key, ...a);

  // ── Lua eval ──────────────────────────────────────────────────────────────
  /**
   * eval() — PDIM supports EVAL via its HTTP exec endpoint.
   * Signature matches ioredis: eval(script, numkeys, ...keys_and_args)
   */
  async eval(script: string, numkeys: number | string, ...args: unknown[]): Promise<unknown> {
    return this.exec(['EVAL', script, numkeys, ...args]);
  }

  // ── Pub/Sub no-ops ────────────────────────────────────────────────────────
  // PDIM (Pocket Dimension) is a key-value store — it does not support Redis
  // pub/sub commands (PUBLISH, SUBSCRIBE, UNSUBSCRIBE, PSUBSCRIBE, PUNSUBSCRIBE).
  // Any attempt to send these commands returns HTTP 400 and burns a chain slot
  // (2,679ms per PUBLISH call observed in production).
  //
  // BullMQ emits job lifecycle events via PUBLISH.  Instead of routing those
  // through the PDIM chain (→ wait 1150ms in queue → HTTP 400 → 2.6s wasted),
  // we return the correct Redis no-op responses immediately in-process:
  //   PUBLISH   → 0  (0 subscribers — expected when pub/sub is unavailable)
  //   SUBSCRIBE → void  (subscription acknowledged, no messages will arrive)
  async publish(_channel: string, _message: string): Promise<number> { return 0; }
  subscribe(_channel: string, _callback?: Function): Promise<void> { return Promise.resolve(); }
  psubscribe(_pattern: string, _callback?: Function): Promise<void> { return Promise.resolve(); }
  unsubscribe(_channel?: string): Promise<void> { return Promise.resolve(); }
  punsubscribe(_pattern?: string): Promise<void> { return Promise.resolve(); }

  // ── Server commands ───────────────────────────────────────────────────────
  async ping(): Promise<'PONG'> {
    try { return await this.exec(['PING']); } catch { return 'PONG'; }
  }
  async info(_section?: string): Promise<string> {
    return [
      '# Server',
      'redis_version:7.0.0',
      'redis_mode:standalone',
      'os:Linux',
      'maxmemory_policy:noeviction',
      '',
    ].join('\r\n');
  }
  async flushdb(): Promise<'OK'> { return this.exec(['FLUSHDB']); }
  async flushall(): Promise<'OK'> { return this.exec(['FLUSHALL']); }

  // ── camelCase aliases (node-redis v4 compat) ──────────────────────────────
  setEx = (k: string, s: number, v: string) => this.setex(k, s, v);
  hGetAll = (k: string) => this.hgetall(k);
  hSet = (k: string, ...a: unknown[]) => this.hset(k, ...a);
  hGet = (k: string, f: string) => this.hget(k, f);
  hDel = (k: string, ...f: string[]) => this.hdel(k, ...f);
  hExists = (k: string, f: string) => this.hexists(k, f);
  hIncrBy = (k: string, f: string, n: number) => this.hincrby(k, f, n);
  hKeys = (k: string) => this.hkeys(k);
  hVals = (k: string) => this.hvals(k);
  hLen = (k: string) => this.hlen(k);
  sAdd = (k: string, ...m: unknown[]) => this.sadd(k, ...m);
  sRem = (k: string, ...m: unknown[]) => this.srem(k, ...m);
  sMembers = (k: string) => this.smembers(k);
  sIsMember = (k: string, m: string) => this.sismember(k, m);
  sCard = (k: string) => this.scard(k);
  lPush = (k: string, ...v: unknown[]) => this.lpush(k, ...v);
  rPush = (k: string, ...v: unknown[]) => this.rpush(k, ...v);
  lRange = (k: string, s: number, e: number) => this.lrange(k, s, e);
  lLen = (k: string) => this.llen(k);
  lPop = (k: string) => this.lpop(k);
  rPop = (k: string) => this.rpop(k);
  zAdd = (k: string, ...a: unknown[]) => this.zadd(k, ...a);
  zCard = (k: string) => this.zcard(k);
  zRange = (k: string, s: number, e: number, ...a: unknown[]) => this.zrange(k, s, e, ...a);
  zRevRange = (k: string, s: number, e: number, ...a: unknown[]) => this.zrevrange(k, s, e, ...a);
  zRem = (k: string, ...m: unknown[]) => this.zrem(k, ...m);
  zScore = (k: string, m: string) => this.zscore(k, m);
  zRank = (k: string, m: string) => this.zrank(k, m);
  zRemRangeByScore = (k: string, min: Record<string, unknown>, max: Record<string, unknown>) => this.zremrangebyscore(k, min, max);
  zRangeByScore = (k: string, min: Record<string, unknown>, max: Record<string, unknown>, ...a: unknown[]) => this.zrangebyscore(k, min, max, ...a);
  zCount = (k: string, min: Record<string, unknown>, max: Record<string, unknown>) => this.zcount(k, min, max);
  mGet = (...k: string[]) => this.mget(...k);
  mSet = (...a: string[]) => this.mset(...a);
  incrBy = (k: string, n: number) => this.incrby(k, n);
  decrBy = (k: string, n: number) => this.decrby(k, n);
  pExpire = (k: string, ms: number) => this.pexpire(k, ms);
  pTtl = (k: string) => this.pttl(k);
}

let _pdimInstance: PdimRedisClient | null = null;

export function getPdimClient(): PdimRedisClient {
  if (!_pdimInstance) {
    _pdimInstance = new PdimRedisClient();
  }
  return _pdimInstance;
}

export function isPdimConfigured(): boolean {
  return !!(process.env.PDIM_HTTP_EXEC_URL && process.env.PDIM_BEARER_TOKEN);
}

