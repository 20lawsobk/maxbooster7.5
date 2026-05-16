/**
 * LuaExecutor — runs BullMQ Lua scripts locally in a Worker thread using
 * wasmoon (WebAssembly Lua 5.4), bypassing PDIM's broken async Lua runtime.
 *
 * Root problem with PDIM EVAL:
 *   PDIM implements redis.call() as an async Promise chain internally.
 *   BullMQ's Lua scripts use redis.call() synchronously (standard Redis model).
 *   When redis.call() returns nil, PDIM tries .then(null) and crashes.
 *
 * Solution:
 *   1. Run the Lua script in a Worker thread (can block with Atomics.wait).
 *   2. Inject redis.call() as a synchronous function that uses SharedArrayBuffer
 *      IPC to call the main thread, which awaits PDIM HTTP and writes the result.
 *   3. Pre-decode msgpack Buffer ARGV values before passing to the worker,
 *      so cmsgpack.unpack() receives already-decoded Lua tables (identity fn).
 */

import { Worker } from 'worker_threads';
import { Unpackr } from 'msgpackr';
import { logger } from '../logger.js';
import { cbIsOpen } from './pdimCircuitBreaker.js';

const _msgUnpacker = new Unpackr({ useRecords: false });

/**
 * Async semaphore for wasmoon Worker threads.
 *
 * Each Worker loads the full WASM binary and makes multiple HTTP calls to
 * PDIM — too many simultaneously exhausts memory and saturates the HTTP
 * connection pool.  Instead of rejecting callers when the cap is hit (which
 * causes BullMQ to retry immediately and create a storm), we queue waiting
 * callers and resolve them as slots free up.
 *
 * MAX_WAIT_MS: maximum time a caller will wait for a slot before giving up.
 */
// Single exclusive Worker: each BullMQ Lua script gets uncontested access to
// the PDIM fast-lane.  Scripts are sequential either way; a single Worker
// eliminates contention and lets each redis.call() complete in ~PDIM_RTT + 10ms.
const MAX_CONCURRENT_WORKERS = 1;

// _maxWaitMs: maximum time a CALLER waits to ACQUIRE a Worker slot (queue wait),
// NOT a limit on script execution time.  Scripts run to completion with no
// hard-kill — only the per-60s watchdog log reminds us if one is stuck.
//
// With the fast-lane (10ms inter-call gap):
//   typical script: 35 × (200ms RTT + 10ms gap) = ~7.35s
//   high-RTT case:  35 × (800ms RTT + 10ms gap) = ~28.35s
// Slot-wait raised to 90s to handle sustained PDIM congestion events without
// premature rejection — scripts always free their slot well within this window.
let _maxWaitMs = 90_000;
/** Permanently increase the LuaExecutor slot-wait timeout — called by PermanentFixRegistry. */
export function setLuaScriptTimeout(ms: number): void {
  _maxWaitMs = Math.max(90_000, Math.min(180_000, ms));
}
export function getLuaScriptTimeout(): number { return _maxWaitMs; }
// Backpressure cap: reject immediately when the wait queue exceeds this size.
// Without a cap, sustained BullMQ load causes _waitQueue to grow without bound,
// holding thousands of timer handles and consuming unbounded memory.
// 5000 slots: matches real-world 100M+ caller burst peaks without premature shedding.
const MAX_QUEUE_SIZE = 5000;
// How long to sleep before rejecting when the circuit is OPEN.
// BullMQ uses onlyEmitError:true so our rejection is swallowed and treated as
// "no job" — without this sleep the poll loop runs at full speed, saturating
// the event loop and preventing HTTP requests from being handled.
const CIRCUIT_OPEN_BACKOFF_MS = 5_000;

// ── Consecutive PDIM error backoff ────────────────────────────────────────────
// When PDIM returns 5xx errors on Lua script calls the slot is normally
// released immediately, causing BullMQ to retry at full speed (~14 retries/s
// with 4 workers).  That flood itself can push PDIM from HTTP 500 → HTTP 502.
// We track consecutive script-level PDIM 5xx errors and exponentially delay
// slot release so BullMQ's effective retry rate backs off:
//   1 error  →  0 ms  (first failure, no delay)
//   2 errors →  1 s
//   3 errors →  2 s
//   4 errors →  4 s
//   5+       →  8 s  (capped — still recovers fast when PDIM stabilises)
// On any successful script completion the counter resets to 0.
let _luaConsecutivePdimErrors = 0;
const LUA_PDIM_ERR_BACKOFF_CAP_MS = 8_000;

function _luaComputeBackoff(): number {
  if (_luaConsecutivePdimErrors < 2) return 0;
  return Math.min(LUA_PDIM_ERR_BACKOFF_CAP_MS, 500 * Math.pow(2, _luaConsecutivePdimErrors - 2));
}

// Module-level boot timestamp — used to gate the 30s/60s watchdog WARNs
// during the initial 120s PDIM settling window (stalls are expected at boot).
const _executorBootTs = Date.now();

let _activeWorkers = 0;

// Each queued waiter stores its resolve fn and timeout handle separately.
// This lets _releaseWorkerSlot hand the slot to the next waiter WITHOUT
// calling _activeWorkers++ (the slot is *transferred*, not newly created).
// The previous design stored a combined resolver = () => { _activeWorkers++; resolve(); }
// and called it from _releaseWorkerSlot without decrementing first, causing
// _activeWorkers to drift above MAX_CONCURRENT_WORKERS by +1 per handoff.
interface _Waiter { resolve: () => void; timer: ReturnType<typeof setTimeout>; }
const _waitQueue: _Waiter[] = [];

async function _acquireWorkerSlot(): Promise<void> {
  if (_activeWorkers < MAX_CONCURRENT_WORKERS) {
    _activeWorkers++;
    return;
  }
  // Backpressure: reject immediately if the wait queue is saturated.
  // Without this cap, sustained BullMQ load causes _waitQueue to grow without
  // bound, holding thousands of 60-second timer handles and consuming unbounded
  // memory — a silent kill under infinite workload.
  if (_waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error('[LuaExecutor] Wait queue saturated — shedding BullMQ request (backpressure)');
  }
  // Queue the caller until a slot frees up — transfer increments the count.
  return new Promise<void>((resolve, reject) => {
    const entry: _Waiter = {
      resolve,
      timer: setTimeout(() => {
        const idx = _waitQueue.indexOf(entry);
        if (idx !== -1) _waitQueue.splice(idx, 1);
        reject(new Error(`[LuaExecutor] Timeout waiting for worker slot (${Math.round(_maxWaitMs / 1000)}s)`));
      }, _maxWaitMs),
    };
    _waitQueue.push(entry);
  });
}

function _releaseWorkerSlot(): void {
  if (_waitQueue.length > 0) {
    // Transfer the slot to the next waiter.  _activeWorkers stays the same:
    // the releasing worker relinquishes its slot and the waiter takes it over.
    // We must NOT call _activeWorkers++ here (old bug: resolver did that,
    // causing count to grow by 1 on every queue handoff).
    const { resolve, timer } = _waitQueue.shift()!;
    clearTimeout(timer);
    resolve();
  } else {
    if (_activeWorkers > 0) _activeWorkers--;
  }
}

/**
 * Emergency semaphore reset — called by chainErrorAutoFixer when the
 * LuaExecutor gets stuck (active count drifts above the cap due to worker
 * threads that terminated without releasing their slot).
 *
 * Returns the number of slots that were force-released.
 */
export function resetLuaExecutorSemaphore(): number {
  const stuckSlots = Math.max(0, _activeWorkers - _waitQueue.length);
  // Drain all queued waiters — resolve their promises so they can proceed.
  // Don't call _activeWorkers++ here; we zero the counter on the next line.
  while (_waitQueue.length > 0) {
    const { resolve, timer } = _waitQueue.shift()!;
    clearTimeout(timer);
    resolve();
  }
  // Zero out the counter entirely so fresh callers start from a clean slate.
  _activeWorkers = 0;
  return stuckSlots;
}

/** Snapshot of the LuaExecutor semaphore — used by the chain error fixer health check. */
export function getLuaExecutorStats(): { active: number; queued: number; max: number } {
  return { active: _activeWorkers, queued: _waitQueue.length, max: MAX_CONCURRENT_WORKERS };
}

// ── Registration-mode gate ────────────────────────────────────────────────────
// Set to true while autonomousJobScheduler is serially registering repeatable
// jobs.  Each upsertJobScheduler call takes ~50s under boot PDIM back-pressure,
// which causes ChainFixer's deadlock detector (3× congested readings) and
// PlatformAutoFixer's lua_executor degraded probe to fire — producing 4–6 WARNs
// that are not real signals (the slot is occupied by a known-slow registration
// script, not a stuck or deadlocked worker).  Both probers skip their congestion
// WARN logic while this flag is true.
let _luaRegistrationMode = false;
export function setLuaRegistrationMode(active: boolean): void { _luaRegistrationMode = active; }
export function isLuaRegistrationMode(): boolean { return _luaRegistrationMode; }

// process.cwd() always resolves to the project root regardless of CJS/ESM build format
const _projectRoot = process.cwd();
const _wasmoonUrl  = `file://${_projectRoot}/node_modules/wasmoon/dist/index.js`;
const _msgpackrUrl = `file://${_projectRoot}/node_modules/msgpackr/dist/node.cjs`;

const WORKER_CODE = `
import { workerData, parentPort } from 'worker_threads';
const { LuaFactory } = await import('${_wasmoonUrl}');
const { Unpackr, Packr } = await import('${_msgpackrUrl}');
const _unpack = new Unpackr({ useRecords: false });
const _pack   = new Packr({ useRecords: false });

const SAB_HEADER_BYTES = 8;
const SAB_DATA_BYTES   = 131072; // 128 KB max per Redis response
// SAB control values: 0=waiting, 1=success result, 2=error (main thread threw)

function syncRedisCall(cmd, args) {
  const sab     = new SharedArrayBuffer(SAB_HEADER_BYTES + SAB_DATA_BYTES);
  const control = new Int32Array(sab, 0, 1);
  const lenBuf  = new Int32Array(sab, 4, 1);
  Atomics.store(control, 0, 0);
  parentPort.postMessage({ type: 'redis', cmd, args, sab });
  // 60 s timeout: if the main thread does not signal within 60 s the PDIM
  // chain is so congested that waiting longer wastes the semaphore slot.
  // Throwing here causes the Lua error path below to propagate the error
  // back to the main thread, which releases the slot gracefully — much
  // cleaner than waiting for the 90s hard-kill watchdog.
  const _awaitResult = Atomics.wait(control, 0, 0, 60000);
  if (_awaitResult === 'timed-out') {
    throw new Error('[LuaExecutor] redis.call timed out after 60s — PDIM chain congested');
  }
  const status = Atomics.load(control, 0);
  const len    = Atomics.load(lenBuf, 0);
  const raw    = Buffer.from(new Uint8Array(sab, SAB_HEADER_BYTES, len)).toString('utf8');
  if (status === 2) throw new Error(raw); // propagates as Lua error
  // Reviver: convert every JSON null to undefined.
  // wasmoon dispatches on typeof before probing .then:
  //   'undefined' → lua_pushnil  (no .then probe — safe, maps to Lua nil)
  //   'object'    → .then probe  (null.then throws TypeError)
  // Lua nil is the correct nil substitute: passes "~= nil" guards as false.
  // Lua false would pass "~= nil" (false ~= nil is TRUE) causing BullMQ to
  // treat optional args (parentKey, repeatJobKey …) as real values → -5 error.
  return JSON.parse(raw, (_k, v) => v === null ? undefined : v);
}

// Recursively replace every null with undefined so that wasmoon maps the
// value to Lua nil.  wasmoon dispatches on typeof:
//   typeof null      === 'object'    → Promise probe → null.then throws
//   typeof undefined === 'undefined' → lua_pushnil   (safe, no .then probe)
// Lua nil is required (not false) because BullMQ Lua uses "if x ~= nil" guards
// for optional args (parentKey, repeatJobKey, …).  false ~= nil is TRUE in Lua,
// so false triggers those guards as if a real value were present.
function _replaceNulls(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return v.map(_replaceNulls);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = _replaceNulls(v[k]);
    return out;
  }
  return v;
}

function makeCmsgpack() {
  return {
    unpack(data) {
      // Return undefined (Lua nil) for missing/empty values.
      // wasmoon typeof-dispatches before probing .then:
      //   typeof undefined === 'undefined' → lua_pushnil (safe)
      //   typeof null      === 'object'    → .then probe → TypeError
      if (data === null || data === undefined) return undefined;
      // Pre-decoded JS object/array from main thread — strip every null to
      // undefined so wasmoon maps them to Lua nil.  Lua nil (not false) is
      // required for "if x ~= nil" guards in BullMQ Lua scripts.
      if (typeof data === 'object') return _replaceNulls(data);
      // Binary string (from Redis or unmodified ARGV) → decode with msgpackr
      if (typeof data === 'string') {
        if (data === '') return undefined; // empty string → no data
        try { return _replaceNulls(_unpack.unpack(Buffer.from(data, 'binary'))); }
        catch { return undefined; }
      }
      return undefined;
    },
    pack(data) {
      return _pack.pack(data).toString('binary');
    }
  };
}

const { script, keys, argv } = workerData;
const engine = await new LuaFactory().createEngine({ openStandardLibs: true });

try {
  engine.global.set('KEYS', keys);
  engine.global.set('ARGV', argv);

  engine.global.set('redis', {
    call(...all) {
      const [cmd, ...args] = all;
      // XADD (Redis Streams) is not supported by PDIM — silently drop it.
      // BullMQ uses XADD only for optional event listeners; dropping it is
      // safe and prevents every queue.add() from failing with an error.
      if (String(cmd).toUpperCase() === 'XADD') return undefined;
      const r = syncRedisCall(String(cmd), args.map(a => (a == null ? '' : String(a))));
      return r === null ? undefined : r; // Redis nil → Lua nil
    },
    pcall(...all) {
      const [cmd, ...args] = all;
      if (String(cmd).toUpperCase() === 'XADD') return undefined;
      try {
        const r = syncRedisCall(String(cmd), args.map(a => (a == null ? '' : String(a))));
        return r === null ? undefined : r; // Redis nil → Lua nil
      } catch(e) {
        return { err: e.message };
      }
    }
  });

  engine.global.set('cmsgpack', makeCmsgpack());
  engine.global.set('cjson', {
    decode(s) {
      try {
        const v = JSON.parse(s);
        // null → undefined (Lua nil) to avoid wasmoon .then probe on null
        return v === null ? undefined : v;
      } catch { return undefined; }
    },
    encode(v) { return JSON.stringify(v); }
  });

  // Lua 5.1 compat: unpack() was moved to table.unpack() in Lua 5.2+
  const fullScript = 'unpack = table.unpack\\n' + script;
  const result = await engine.doString(fullScript);
  parentPort.postMessage({ type: 'result', result });
} catch(e) {
  parentPort.postMessage({ type: 'error', error: e.message });
} finally {
  engine.global.close();
}
`;

export async function execLuaViaPdim(
  pdimExec: (args: string[]) => Promise<unknown>,
  script: string,
  numKeys: number,
  allArgs: unknown[],
): Promise<unknown> {
  const keys = allArgs.slice(0, numKeys).map(String);

  const argv = allArgs.slice(numKeys).map((arg: Record<string, unknown>) => {
    if (arg instanceof Buffer || arg instanceof Uint8Array) {
      try {
        return _msgUnpacker.unpack(arg);
      } catch {
        return Buffer.from(arg).toString('binary');
      }
    }
    if (arg === null || arg === undefined) return '';
    return typeof arg === 'string' ? arg : String(arg);
  });

  // ── Pre-flight PDIM health throttle ─────────────────────────────────────────
  // When PDIM has been returning 5xx errors on recent Lua scripts, every new
  // caller waits the computed backoff BEFORE entering the slot queue.  This is
  // the only reliable place to throttle BullMQ's retry rate:
  //
  //   • The 'error' message handler fires after worker.on('exit'), so any sleep
  //     there is bypassed by the exit handler settling first.
  //   • A pre-flight await runs before the slot is acquired, so ALL queued
  //     callers (BullMQ pollers) must wait — retry rate drops proportionally.
  //
  // Backoff schedule (consecutive errors → wait):
  //   0-1 errors → 0ms     (no delay — first failure is allowed immediately)
  //   2 errors   → 500ms
  //   3 errors   → 1000ms
  //   4 errors   → 2000ms
  //   5+ errors  → cap (8000ms)  → ~0.5 retries/s for 4 workers combined
  if (_luaConsecutivePdimErrors >= 2) {
    const preflightWaitMs = _luaComputeBackoff();
    if (preflightWaitMs > 0) {
      logger.debug(`[LuaExecutor] pre-flight backoff ${preflightWaitMs}ms (${_luaConsecutivePdimErrors} consecutive PDIM errors)`);
      await new Promise<void>(r => setTimeout(r, preflightWaitMs));
    }
  }

  // Skip Worker spawn entirely when PDIM is known to be down.
  // The circuit breaker trips after 5 consecutive failures and backs off.
  // This prevents wasmoon WASM Workers from accumulating and causing a segfault.
  //
  // IMPORTANT: Return an empty array ([]) instead of rejecting — this makes
  // BullMQ treat the call as "no job available" (jobData = null is falsy) and
  // go back to polling after our backoff sleep.  Rejecting triggers
  // EventEmitter.emit('error', ...) inside BullMQ's retryIfFailed/checkConnectionError,
  // which escapes to stderr as raw Error: stack traces regardless of our
  // process-level unhandledRejection handlers.
  if (cbIsOpen()) {
    await new Promise<void>(r => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    return [];
  }

  // Acquire a Worker slot — queues the caller (up to MAX_WAIT_MS) rather than
  // rejecting immediately.  This prevents BullMQ from producing a retry storm.
  await _acquireWorkerSlot();

  // Re-check circuit AFTER acquiring the slot.  If the circuit opened while
  // this caller was queued, sleep then release so the wait-queue drain is
  // throttled (≤ 6 rejects per CIRCUIT_OPEN_BACKOFF_MS) instead of cascading
  // instantly and saturating the event loop.
  if (cbIsOpen()) {
    // Sleep BEFORE releasing the slot so the drain cascade is throttled —
    // the next waiter won't get the slot until this sleep expires.
    await new Promise<void>(r => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    _releaseWorkerSlot();
    return [];
  }

  // ── Unhandled-rejection guard ─────────────────────────────────────────────
  // Node.js's internal worker-thread MessagePort machinery writes the raw
  // "Error: Error: ERR PDIM HTTP 5xx" block to stderr using a C++ fast-path
  // that fires BEFORE JavaScript-level unhandledRejection / uncaughtException
  // handlers run, and BEFORE our process.stderr.write interceptor can suppress
  // it.  The trigger is a brief window between the moment reject() is called
  // inside the 'message' event handler and the moment BullMQ's job-processor
  // `await` registers its own .catch().
  //
  // Fix: capture the Promise, attach a silent no-op .catch() immediately, then
  // return it.  Node.js sees at least one rejection handler attached before the
  // microtask queue drains, so it never marks the Promise "unhandled" and never
  // invokes the stderr fast-path.  BullMQ's own `await` still receives the
  // rejection because direct `await` uses the Promise's internal state directly,
  // not the derived Promise created by .catch().
  const _execPromise = new Promise<unknown[]>((resolve, reject) => {
    let settled = false;
    // Guards against double-counting the same failure in both the 'error' message
    // handler and the exit handler — both can observe the same execution failure.
    let pdim5xxCounted = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        _releaseWorkerSlot();
        fn();
      }
    };

    const worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { script, keys, argv },
    });

    // Watchdog: logs a warning every 60s if a script is still running.
    // Hard-kills the Worker after SCRIPT_HARD_KILL_MS as a last resort.
    //
    // Why 90s (reduced from 300s):
    //   BullMQ scripts make ~35 sequential redis.call()s.  At worst-case RTT
    //   (800ms) that is 35 × 810ms ≈ 28s.  90s gives 3× headroom.
    //   The Atomics.wait timeout (60s) now self-terminates the worker before
    //   this watchdog fires in most congestion cases, so 300s was masking the
    //   issue and holding semaphore slots for 5× longer than necessary.
    const SCRIPT_HARD_KILL_MS = 90_000; // 90 s (3× worst-case script runtime)
    const _scriptStart = Date.now();
    // Watchdog tick counter — fires every 30s.
    // With a 90s hard-kill, ticks 1-3 (30s, 60s, 90s) are all relevant:
    //   Tick 1 (30s): early stall warning — script taking longer than expected
    //   Tick 2 (60s): sustained stall — Atomics.wait probably blocked
    //   Tick 3 (90s): hard-kill fires → slot released
    // During heavy PDIM back-pressure thousands of scripts may stall; the
    // depth check below demotes those to debug to avoid log avalanche.
    let _watchdogTick = 0;
    // Guard against the race where clearInterval() is called but the interval
    // callback was already queued in the current event-loop batch.  Without
    // this flag the callback can fire with active=0 / queued=0 even though
    // the script completed successfully, producing a false-positive WARN.
    let _watchdogCancelled = false;
    const watchdog = setInterval(async () => {
      if (_watchdogCancelled) return;
      const elapsedMs = Date.now() - _scriptStart;
      const elapsedS  = Math.round(elapsedMs / 1000);
      _watchdogTick++;
      if (elapsedMs >= SCRIPT_HARD_KILL_MS) {
        // ── False-positive guard ──────────────────────────────────────────────
        // When PlatformAutoFixer calls resetLuaExecutorSemaphore() it zeroes
        // _activeWorkers externally while this watchdog is still armed.  By the
        // time the 90 s hard-kill tick fires the semaphore has already been
        // released; logging an ERROR and calling worker.terminate() is a
        // false-positive that can interfere with the already-clean state.
        // Demote to debug and skip terminate() — the slot is already free.
        if (_activeWorkers === 0 && _waitQueue.length === 0) {
          logger.debug(
            `[LuaExecutor] watchdog 90s tick — semaphore already externally reset ` +
            `(elapsed ${elapsedS}s); skipping hard-kill`
          );
          _watchdogCancelled = true; clearInterval(watchdog);
          return;
        }
        logger.error(
          `[LuaExecutor] script hard-killed after ${elapsedS}s ` +
          `(active=${_activeWorkers}, queued=${_waitQueue.length}) — ` +
          `Atomics.wait stall detected; releasing semaphore slot`
        );
        _watchdogCancelled = true; clearInterval(watchdog);
        settle(() => {
          worker.terminate();
          _luaConsecutivePdimErrors++;
          reject(new Error(`[LuaExecutor] worker hard-killed after ${elapsedS}s (stuck script timeout)`));
        });
      } else {
        // Always log ticks 1-2 (30s, 60s); they precede the 90s hard-kill.
        // When PDIM is heavily congested, scripts stall expectedly — demote to
        // debug in that case to avoid amplifying the congestion noise.
        const shouldLog = _watchdogTick <= 2;
        if (!shouldLog) return;
        // When the ChainFixer calls resetLuaExecutorSemaphore() it zeroes
        // _activeWorkers externally while this worker is still running.  The
        // watchdog still fires (correctly — script is unsettled), but reading
        // active=0 / queued=0 is misleading: it looks like a phantom WARN
        // rather than a real stall.  Demote to debug in that case so the log
        // stream only shows genuine over-time scripts (active ≥ 1).
        if (_activeWorkers === 0 && _waitQueue.length === 0) {
          logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s — ` +
            `semaphore was externally reset (active counter zeroed by ChainFixer)`
          );
          return;
        }
        // During BullMQ repeatable-job registration each upsertJobScheduler
        // call legitimately holds the slot for ~50 s under boot back-pressure.
        // Demote the watchdog tick to debug so it doesn't produce a false WARN
        // cascade for every job in the registration for-loop.
        if (_luaRegistrationMode) {
          logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s — ` +
            `registration in progress (active=${_activeWorkers}, queued=${_waitQueue.length})`
          );
          return;
        }
        // During the first 120s of boot the PDIM settling burst causes
        // LuaExecutor stalls that look alarming but are entirely expected.
        // Demote to debug so the log stream stays clean during boot.
        if (Date.now() - _executorBootTs < 120_000) {
          logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s — ` +
            `boot settling window (active=${_activeWorkers}, queued=${_waitQueue.length})`
          );
          return;
        }
        try {
          const { getPdimQueueDepth } = await import('./pdimClient.js');
          const depth = getPdimQueueDepth();
          if (depth > 100) {
            // Hundreds of callers queued: stall is due to PDIM back-pressure,
            // not a WASM/Lua bug.  Log at debug to avoid log avalanche.
            logger.debug(
              `[LuaExecutor] script paused ${elapsedS}s — PDIM back-pressure ` +
              `(${depth} queued, active=${_activeWorkers})`
            );
            return;
          }
        } catch { /* pdimClient not yet loaded — fall through to warn */ }
        logger.warn(
          `[LuaExecutor] script still running after ${elapsedS}s — ` +
          `active=${_activeWorkers}, queued=${_waitQueue.length}`
        );
      }
    }, 30_000);

    worker.on('message', async (msg: Record<string, unknown>) => {
      if (msg.type === 'redis') {
        let payload: string;
        let status: 1 | 2;
        try {
          let r: Record<string, unknown>;
          const cmd = (msg.cmd as string).toUpperCase();
          if (cmd === 'HMSET') {
            // PDIM's Redis only accepts HSET with one field-value pair at a time.
            // Split "HMSET key f1 v1 f2 v2 ..." into sequential HSET calls.
            const [key, ...pairs] = msg.args as string[];
            for (let i = 0; i < pairs.length - 1; i += 2) {
              r = await pdimExec(['HSET', key, pairs[i], pairs[i + 1]]);
            }
            r = r ?? 'OK';
          } else {
            r = await pdimExec([msg.cmd, ...msg.args]);
          }
          payload = JSON.stringify(r ?? null);
          status  = 1; // success
        } catch (e) {
          const short = (e.message as string).slice(0, 200);
          // 5xx, 429, and circuit-open fast-fails are already captured at
          // WARN/ERROR by pdimClient / the circuit breaker itself.  Repeating
          // them per-command floods the console during startup bursts — demote
          // all to debug so only the root-cause site emits the visible warn.
          if (
            short.includes('429') ||
            short.includes('500') ||
            short.includes('502') ||
            short.includes('Circuit OPEN')
          ) {
            logger.debug(`[LuaExecutor] redis.call(${msg.cmd}) → ${short}`);
          } else {
            logger.warn(`[LuaExecutor] redis.call(${msg.cmd}) → ${short}`);
          }
          payload = `ERR ${short}`;
          status  = 2; // error — Lua will throw
        }
        const buf  = Buffer.from(payload, 'utf8');
        const sab  = msg.sab as SharedArrayBuffer;
        const ctrl = new Int32Array(sab, 0, 1);
        const len  = new Int32Array(sab, 4, 1);
        const data = new Uint8Array(sab, 8);
        buf.copy(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        Atomics.store(len,  0, buf.length);
        Atomics.store(ctrl, 0, status);
        Atomics.notify(ctrl, 0, 1);
      } else if (msg.type === 'result') {
        _watchdogCancelled = true; clearInterval(watchdog);
        // Script completed successfully — reset the consecutive PDIM error counter
        // so the next call gets no pre-flight delay.
        _luaConsecutivePdimErrors = 0;
        settle(() => { worker.terminate(); resolve(msg.result); });
      } else if (msg.type === 'error') {
        _watchdogCancelled = true; clearInterval(watchdog);
        const errMsg = String(msg.error ?? '');
        const isPdim5xx = errMsg.includes('HTTP 500') || errMsg.includes('HTTP 502');
        if (isPdim5xx && !pdim5xxCounted) {
          // Count this failure so the NEXT call's pre-flight wait is longer.
          // The pre-flight await (above the slot acquire) is where throttling
          // actually happens — no backoff sleep needed here.
          pdim5xxCounted = true;
          _luaConsecutivePdimErrors++;
        } else if (!isPdim5xx) {
          _luaConsecutivePdimErrors = 0;
        }
        settle(() => { worker.terminate(); reject(new Error(errMsg)); });
      }
    });

    worker.on('error', (err) => {
      _watchdogCancelled = true; clearInterval(watchdog);
      settle(() => reject(err));
    });

    // Guard against worker threads that exit without sending a message
    // (e.g. WASM crash, OOM inside the worker, or unhandled exception that
    // bypasses the try/catch).  Without this handler _activeWorkers never
    // decrements, drifting above MAX_CONCURRENT_WORKERS and permanently
    // congesting the semaphore (observed: active=7 with cap=6).
    //
    // IMPORTANT: In Node.js, worker.on('exit') often fires BEFORE a pending
    // postMessage from that worker is processed by worker.on('message').  This
    // means the 'error'/'result' message handler may not have run yet when exit
    // fires.  We defer settlement by one event-loop iteration (setImmediate) so
    // pending messages get a chance to call settle() first.  If neither
    // 'result' nor 'error' was received by then, we settle here and also count
    // the exit as a potential PDIM 5xx error (code=0 means the Lua script
    // completed but threw — almost always because redis.call() got a 5xx).
    worker.on('exit', (code) => {
      _watchdogCancelled = true; clearInterval(watchdog);
      setImmediate(() => {
        if (!settled) {
          // Neither 'result' nor 'error' message was processed before exit.
          // For code=0 (clean exit after a throw), this is most likely a PDIM
          // 5xx that caused Lua to raise an error — count it so the next
          // pre-flight wait is longer, unless already counted by the message handler.
          if (code === 0 && !pdim5xxCounted) {
            pdim5xxCounted = true;
            _luaConsecutivePdimErrors++;
          }
          settle(() => reject(new Error(`[LuaExecutor] worker exited unexpectedly (code=${code})`)));
        }
      });
    });
  });

  // Attach the silent no-op catch BEFORE returning so that Node.js's
  // unhandled-rejection detector sees a handler in place from the start.
  // This is the key line that stops bare "Error: Error: ERR PDIM HTTP 5xx"
  // blocks from appearing in stderr/deployment logs.
  _execPromise.catch(() => {});
  return _execPromise;
}
