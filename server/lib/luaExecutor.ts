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
const MAX_CONCURRENT_WORKERS = 6;
const MAX_WAIT_MS = 30_000;
// How long to sleep before rejecting when the circuit is OPEN.
// BullMQ uses onlyEmitError:true so our rejection is swallowed and treated as
// "no job" — without this sleep the poll loop runs at full speed, saturating
// the event loop and preventing HTTP requests from being handled.
const CIRCUIT_OPEN_BACKOFF_MS = 5_000;

let _activeWorkers = 0;
const _waitQueue: Array<() => void> = [];

async function _acquireWorkerSlot(): Promise<void> {
  if (_activeWorkers < MAX_CONCURRENT_WORKERS) {
    _activeWorkers++;
    return;
  }
  // Queue the caller until a slot frees up.
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _waitQueue.indexOf(resolver);
      if (idx !== -1) _waitQueue.splice(idx, 1);
      reject(new Error('[LuaExecutor] Timeout waiting for worker slot (30s)'));
    }, MAX_WAIT_MS);
    const resolver = () => { clearTimeout(timer); _activeWorkers++; resolve(); };
    _waitQueue.push(resolver);
  });
}

function _releaseWorkerSlot(): void {
  if (_waitQueue.length > 0) {
    // Hand the slot directly to the next waiter — activeWorkers stays the same.
    const next = _waitQueue.shift()!;
    next();
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
  // Drain all queued waiters first — they'll increment _activeWorkers themselves
  while (_waitQueue.length > 0) {
    const next = _waitQueue.shift()!;
    next();
  }
  // Then zero out the counter entirely so fresh callers get clean slots
  _activeWorkers = 0;
  return stuckSlots + _waitQueue.length;
}

/** Snapshot of the LuaExecutor semaphore — used by the chain error fixer health check. */
export function getLuaExecutorStats(): { active: number; queued: number; max: number } {
  return { active: _activeWorkers, queued: _waitQueue.length, max: MAX_CONCURRENT_WORKERS };
}

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
  Atomics.wait(control, 0, 0); // blocks worker until main thread signals
  const status = Atomics.load(control, 0);
  const len    = Atomics.load(lenBuf, 0);
  const raw    = Buffer.from(new Uint8Array(sab, SAB_HEADER_BYTES, len)).toString('utf8');
  if (status === 2) throw new Error(raw); // propagates as Lua error
  // Reviver: convert every JSON null to false.
  // wasmoon checks if JS values are Promises by accessing .then — calling
  // null.then throws "Cannot read properties of null".  Lua false is the
  // conventional Redis nil substitute and is correctly falsy in if-guards.
  return JSON.parse(raw, (_k, v) => v === null ? false : v);
}

function makeCmsgpack() {
  return {
    unpack(data) {
      if (data === null || data === undefined) return null;
      // Pre-decoded JS object passed from main thread (Buffer ARGV) → identity
      if (typeof data === 'object') return data;
      // Binary string (from Redis or unmodified ARGV) → decode with msgpackr
      if (typeof data === 'string') {
        try { return _unpack.unpack(Buffer.from(data, 'binary')); }
        catch { return null; }
      }
      return null;
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
      const r = syncRedisCall(String(cmd), args.map(a => (a == null ? '' : String(a))));
      return r === null ? false : r; // Redis nil → Lua false
    },
    pcall(...all) {
      const [cmd, ...args] = all;
      try {
        const r = syncRedisCall(String(cmd), args.map(a => (a == null ? '' : String(a))));
        return r === null ? false : r;
      } catch(e) {
        return { err: e.message };
      }
    }
  });

  engine.global.set('cmsgpack', makeCmsgpack());
  engine.global.set('cjson', {
    decode(s) { try { return JSON.parse(s); } catch { return null; } },
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
  pdimExec: (args: string[]) => Promise<any>,
  script: string,
  numKeys: number,
  allArgs: any[],
): Promise<any> {
  const keys = allArgs.slice(0, numKeys).map(String);

  const argv = allArgs.slice(numKeys).map((arg: any) => {
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

  // Skip Worker spawn entirely when PDIM is known to be down.
  // The circuit breaker trips after 5 consecutive failures and backs off.
  // This prevents wasmoon WASM Workers from accumulating and causing a segfault.
  //
  // IMPORTANT: BullMQ uses onlyEmitError:true for moveToActive, which means our
  // rejection is swallowed and treated as "no job" — causing a tight poll loop
  // because BullMQ's `this.drained` is never set and drainDelay never kicks in.
  // We add an explicit backoff sleep here so each poll cycle waits before returning,
  // regardless of what BullMQ does with the error.
  if (cbIsOpen()) {
    await new Promise<void>(r => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    return Promise.reject(new Error('[LuaExecutor] PDIM circuit OPEN — skipping Worker spawn'));
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
    return Promise.reject(new Error('[LuaExecutor] PDIM circuit OPEN (post-queue) — skipping Worker spawn'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
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

    const tmout = setTimeout(() => {
      settle(() => {
        worker.terminate();
        reject(new Error('[LuaExecutor] script timeout (10s)'));
      });
    }, 10000);

    worker.on('message', async (msg: any) => {
      if (msg.type === 'redis') {
        let payload: string;
        let status: 1 | 2;
        try {
          let r: any;
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
        } catch (e: any) {
          const short = (e.message as string).slice(0, 200);
          logger.warn(`[LuaExecutor] redis.call(${msg.cmd}) → ${short}`);
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
        clearTimeout(tmout);
        settle(() => { worker.terminate(); resolve(msg.result); });
      } else if (msg.type === 'error') {
        clearTimeout(tmout);
        settle(() => { worker.terminate(); reject(new Error(msg.error)); });
      }
    });

    worker.on('error', (err) => {
      clearTimeout(tmout);
      settle(() => reject(err));
    });
  });
}
