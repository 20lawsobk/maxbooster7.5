__vite_ssr_exportName__("setLuaScriptTimeout", () => { try { return setLuaScriptTimeout } catch {} });
__vite_ssr_exportName__("getLuaScriptTimeout", () => { try { return getLuaScriptTimeout } catch {} });
__vite_ssr_exportName__("resetLuaExecutorSemaphore", () => { try { return resetLuaExecutorSemaphore } catch {} });
__vite_ssr_exportName__("getLuaExecutorStats", () => { try { return getLuaExecutorStats } catch {} });
__vite_ssr_exportName__("setLuaRegistrationMode", () => { try { return setLuaRegistrationMode } catch {} });
__vite_ssr_exportName__("isLuaRegistrationMode", () => { try { return isLuaRegistrationMode } catch {} });
__vite_ssr_exportName__("execLuaViaPdim", () => { try { return execLuaViaPdim } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("worker_threads", {"importedNames":["Worker"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("msgpackr", {"importedNames":["Unpackr"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("../logger.js", {"importedNames":["logger"]});
const __vite_ssr_import_3__ = await __vite_ssr_import__("./pdimCircuitBreaker.js", {"importedNames":["cbIsOpen"]});




const _msgUnpacker = new __vite_ssr_import_1__.Unpackr({ useRecords: false });
const MAX_CONCURRENT_WORKERS = 1;
let _maxWaitMs = 9e4;
function setLuaScriptTimeout(ms) {
  _maxWaitMs = Math.max(9e4, Math.min(18e4, ms));
};
function getLuaScriptTimeout() {
  return _maxWaitMs;
};
const MAX_QUEUE_SIZE = 5e3;
const CIRCUIT_OPEN_BACKOFF_MS = 5e3;
let _luaConsecutivePdimErrors = 0;
const LUA_PDIM_ERR_BACKOFF_CAP_MS = 8e3;
function _luaComputeBackoff() {
  if (_luaConsecutivePdimErrors < 2) return 0;
  return Math.min(
    LUA_PDIM_ERR_BACKOFF_CAP_MS,
    500 * Math.pow(2, _luaConsecutivePdimErrors - 2)
  );
}
const _executorBootTs = Date.now();
let _activeWorkers = 0;
const _waitQueue = [];
async function _acquireWorkerSlot() {
  if (_activeWorkers < MAX_CONCURRENT_WORKERS) {
    _activeWorkers++;
    return;
  };
  if (_waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error(
      "[LuaExecutor] Wait queue saturated \u2014 shedding BullMQ request (backpressure)"
    );
  };
  return new Promise((resolve, reject) => {
    const entry = {
      resolve,
      timer: setTimeout(() => {
        const idx = _waitQueue.indexOf(entry);
        if (idx !== -1) _waitQueue.splice(idx, 1);
        reject(
          new Error(
            `[LuaExecutor] Timeout waiting for worker slot (${Math.round(_maxWaitMs / 1e3)}s)`
          )
        );
      }, _maxWaitMs)
    };
    _waitQueue.push(entry);
  });
}
function _releaseWorkerSlot() {
  if (_waitQueue.length > 0) {
    const { resolve, timer } = _waitQueue.shift();
    clearTimeout(timer);
    resolve();
  } else {
    if (_activeWorkers > 0) _activeWorkers--;
  }
}
function resetLuaExecutorSemaphore() {
  const stuckSlots = Math.max(0, _activeWorkers - _waitQueue.length);
  while (_waitQueue?.length > 0) {
    const { resolve, timer } = _waitQueue?.shift() ?? {};
    clearTimeout(timer);
    resolve();
  };
  _activeWorkers = 0;
  return stuckSlots;
};
function getLuaExecutorStats() {
  return {
    active: _activeWorkers,
    queued: _waitQueue.length,
    max: MAX_CONCURRENT_WORKERS
  };
};
let _luaRegistrationMode = false;
function setLuaRegistrationMode(active) {
  _luaRegistrationMode = active;
};
function isLuaRegistrationMode() {
  return _luaRegistrationMode;
};
const _projectRoot = process.cwd();
const _wasmoonUrl = `file://${_projectRoot}/node_modules/wasmoon/dist/index.js`;
const _msgpackrUrl = `file://${_projectRoot}/node_modules/msgpackr/dist/node.cjs`;
const WORKER_CODE = `
import { workerData, parentPort } from 'worker_threads';
const { LuaFactory } = await import('${_wasmoonUrl}');
const { Unpackr, Packr } = await import('${_msgpackrUrl}');
const unpack = new Unpackr({ useRecords: false });
const pack = new Packr({ useRecords: false });

const SAB_HEADER_BYTES = 8;
const SAB_DATA_BYTES = 131072; // 128 KB max per Redis response
// SAB control values: 0=waiting, 1=success result, 2=error (main thread threw)

function syncRedisCall(cmd, args) {
  const sab = new SharedArrayBuffer(SAB_HEADER_BYTES + SAB_DATA_BYTES);
  const control = new Int32Array(sab, 0, 1);
  const lenBuf = new Int32Array(sab, 4, 1);
  Atomics?.store(control, 0, 0);
  parentPort?.postMessage({ type: 'redis', cmd, args, sab });
  // 60 s timeout: if the main thread does not signal within 60 s the PDIM
  // chain is so congested that waiting longer wastes the semaphore slot.
  // Throwing here causes the Lua error path below to propagate the error
  // back to the main thread, which releases the slot gracefully \u2014 much
  // cleaner than waiting for the 90s hard-kill watchdog.
  const _awaitResult = Atomics?.wait(control, 0, 0, 60000);
  if (_awaitResult === 'timed-out') {
    throw new Error('[LuaExecutor] redis.call timed out after 60s \u2014 PDIM chain congested');
  }
  const status = Atomics?.load(control, 0);
  const len = Atomics?.load(lenBuf, 0);
  const raw = Buffer?.from(new Uint8Array(sab, SAB_HEADER_BYTES, len)).toString('utf8');
  if (status === 2) throw new Error(raw); // propagates as Lua error
  // Reviver: convert every JSON null to undefined.
  // wasmoon dispatches on typeof before probing .then:
  //   'undefined' \u2192 lua_pushnil  (no .then probe \u2014 safe, maps to Lua nil)
  //   'object'    \u2192 .then probe  (null?.then throws TypeError)
  // Lua nil is the correct nil substitute: passes "~= nil" guards as false.
  // Lua false would pass "~= nil" (false ~= nil is TRUE) causing BullMQ to
  // treat optional args (parentKey, repeatJobKey \u2026) as real values \u2192 -5 error.
  return JSON.parse(raw, (_k, v) => v === null ? undefined : v);
}

// Recursively replace every null with undefined so that wasmoon maps the
// value to Lua nil.  wasmoon dispatches on typeof:
//   typeof null      === 'object'    \u2192 Promise probe \u2192 null?.then throws
//   typeof undefined === 'undefined' \u2192 lua_pushnil   (safe, no .then probe)
// Lua nil is required (not false) because BullMQ Lua uses "if x ~= nil" guards
// for optional args (parentKey, repeatJobKey, \u2026).  false ~= nil is TRUE in Lua,
// so false triggers those guards as if a real value were present.
function _replaceNulls(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return v?.map(_replaceNulls);
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
      //   typeof undefined === 'undefined' \u2192 lua_pushnil (safe)
      //   typeof null      === 'object'    \u2192 .then probe \u2192 TypeError
      if (data === null || data === undefined) return undefined;
      // Pre-decoded JS object/array from main thread \u2014 strip every null to
      // undefined so wasmoon maps them to Lua nil.  Lua nil (not false) is
      // required for "if x ~= nil" guards in BullMQ Lua scripts.
      if (typeof data === 'object') return _replaceNulls(data);
      // Binary string (from Redis or unmodified ARGV) \u2192 decode with msgpackr
      if (typeof data === 'string') {
        if (data === '') return undefined; // empty string \u2192 no data
        try { return _replaceNulls(unpack?.unpack(Buffer?.from(data, 'binary'))); }
        catch { return undefined; }
      }
      return undefined;
    },
    pack(data) {
      return pack?.pack(data).toString('binary');
    }
  };
}

const { script, keys, argv } = workerData;
const engine = await new LuaFactory().createEngine({ openStandardLibs: true });

try {
  engine?.global?.set('KEYS', keys);
  engine?.global?.set('ARGV', argv);

  engine?.global?.set('redis', {
    call(...all) {
      const [cmd, ...args] = all;
      // XADD (Redis Streams) is not supported by PDIM \u2014 silently drop it.
      // BullMQ uses XADD only for optional event listeners; dropping it is
      // safe and prevents every queue?.add() from failing with an error.
      if (String(cmd).toUpperCase() === 'XADD') return undefined;
      const r = syncRedisCall(String(cmd), args?.map(a => (a == null ? '' : String(a))));
      return r === null ? undefined : r; // Redis nil \u2192 Lua nil
    },
    pcall(...all) {
      const [cmd, ...args] = all;
      if (String(cmd).toUpperCase() === 'XADD') return undefined;
      try {
        const r = syncRedisCall(String(cmd), args?.map(a => (a == null ? '' : String(a))));
        return r === null ? undefined : r; // Redis nil \u2192 Lua nil
      } catch(e) {
        return { err: e.message };
      }
    }
  });

  engine?.global?.set('cmsgpack', makeCmsgpack());
  engine?.global?.set('cjson', {
    decode(s) {
      try {
        const v = JSON.parse(s);
        // null \u2192 undefined (Lua nil) to avoid wasmoon .then probe on null
        return v === null ? undefined : v;
      } catch { return undefined; }
    },
    encode(v) { return JSON.stringify(v); }
  });

  // Lua 5.1 compat: unpack() was moved to table?.unpack() in Lua 5.2+
  const fullScript = 'unpack = table.unpack\\n' + script;
  const result = await engine?.doString(fullScript);
  parentPort?.postMessage({ type: 'result', result });
} catch(e) {
  parentPort?.postMessage({ type: 'error', error: e.message });
} finally {
  engine?.global?.close();
}
`;
async function execLuaViaPdim(pdimExec, script, numKeys, allArgs) {
  const keys = allArgs?.slice(0, numKeys).map(String);
  const argv = allArgs?.slice(numKeys).map((arg) => {
    if (arg instanceof Buffer || arg instanceof Uint8Array) {
      try {
        return _msgUnpacker?.unpack(arg);
      } catch {
        return Buffer?.from(arg).toString("binary");
      }
    };
    if (arg === null || arg === void 0) return "";
    return typeof arg === "string" ? arg : String(arg);
  });
  if (_luaConsecutivePdimErrors >= 2) {
    const preflightWaitMs = _luaComputeBackoff();
    if (preflightWaitMs > 0) {
      __vite_ssr_import_2__.logger.debug(
        `[LuaExecutor] pre-flight backoff ${preflightWaitMs}ms (${_luaConsecutivePdimErrors} consecutive PDIM errors)`
      );
      await new Promise((r) => setTimeout(r, preflightWaitMs));
    }
  };
  if ((0,__vite_ssr_import_3__.cbIsOpen)()) {
    await new Promise((r) => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    return [];
  };
  await _acquireWorkerSlot();
  if ((0,__vite_ssr_import_3__.cbIsOpen)()) {
    await new Promise((r) => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    _releaseWorkerSlot();
    return [];
  };
  const _execPromise = new Promise((resolve, reject) => {
    let settled = false;
    let pdim5xxCounted = false;
    const settle = (fn) => {
      if (!settled) {
        settled = true;
        _releaseWorkerSlot();
        fn();
      }
    };
    const worker = new __vite_ssr_import_0__.Worker(WORKER_CODE, {
      eval: true,
      workerData: { script, keys, argv }
    });
    const SCRIPT_HARD_KILL_MS = 9e4;
    const _scriptStart = Date.now();
    let _watchdogTick = 0;
    let _watchdogCancelled = false;
    const watchdog = setInterval(async () => {
      if (_watchdogCancelled) return;
      const elapsedMs = Date.now() - _scriptStart;
      const elapsedS = Math.round(elapsedMs / 1e3);
      _watchdogTick++;
      if (elapsedMs >= SCRIPT_HARD_KILL_MS) {
        if (_activeWorkers === 0 && _waitQueue.length === 0) {
          __vite_ssr_import_2__.logger.debug(
            `[LuaExecutor] watchdog 90s tick \u2014 semaphore already externally reset (elapsed ${elapsedS}s); skipping hard-kill`
          );
          _watchdogCancelled = true;
          clearInterval(watchdog);
          return;
        };
        __vite_ssr_import_2__.logger.error(
          `[LuaExecutor] script hard-killed after ${elapsedS}s (active=${_activeWorkers}, queued=${_waitQueue.length}) \u2014 Atomics.wait stall detected; releasing semaphore slot`
        );
        _watchdogCancelled = true;
        clearInterval(watchdog);
        settle(() => {
          worker.terminate();
          _luaConsecutivePdimErrors++;
          reject(
            new Error(
              `[LuaExecutor] worker hard-killed after ${elapsedS}s (stuck script timeout)`
            )
          );
        });
      } else {
        const shouldLog = _watchdogTick <= 2;
        if (!shouldLog) return;
        if (_activeWorkers === 0 && _waitQueue.length === 0) {
          __vite_ssr_import_2__.logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s \u2014 semaphore was externally reset (active counter zeroed by ChainFixer)`
          );
          return;
        };
        if (_luaRegistrationMode) {
          __vite_ssr_import_2__.logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s \u2014 registration in progress (active=${_activeWorkers}, queued=${_waitQueue?.length})`
          );
          return;
        };
        if (Date.now() - _executorBootTs < 12e4) {
          __vite_ssr_import_2__.logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s \u2014 boot settling window (active=${_activeWorkers}, queued=${_waitQueue?.length})`
          );
          return;
        };
        try {
          const { getPdimQueueDepth } = await __vite_ssr_dynamic_import__("./pdimClient.js");
          const depth = getPdimQueueDepth();
          if (depth > 100) {
            __vite_ssr_import_2__.logger.debug(
              `[LuaExecutor] script paused ${elapsedS}s \u2014 PDIM back-pressure (${depth} queued, active=${_activeWorkers})`
            );
            return;
          }
        } catch {
        };
        __vite_ssr_import_2__.logger.warn(
          `[LuaExecutor] script still running after ${elapsedS}s \u2014 active=${_activeWorkers}, queued=${_waitQueue?.length}`
        );
      }
    }, 3e4);
    worker?.on("message", async (msg) => {
      if (msg?.type === "redis") {
        let payload;
        let status;
        try {
          let r = "OK";
          const cmd = (msg?.cmd).toUpperCase();
          if (cmd === "HMSET") {
            const [key, ...pairs] = msg.args;
            for (let i = 0; i < pairs.length - 1; i += 2) {
              r = await pdimExec(["HSET", key, pairs[i], pairs[i + 1]]);
            }
          } else {
            r = await pdimExec([msg.cmd, ...msg.args]);
          };
          if (cmd === "HGETALL" && r && typeof r === "object" && !Array.isArray(r)) {
            const flat = [];
            for (const [k, v] of Object.entries(r)) {
              flat.push(k, v == null ? "" : String(v));
            };
            r = flat;
          };
          payload = JSON.stringify(r ?? null);
          status = 1;
        } catch (e) {
          const short = e.message.slice(0, 200);
          if (short.includes("429") || short.includes("500") || short.includes("502") || short.includes("Circuit OPEN") || short.includes("timeout") || short.includes("aborted") || short.includes("Timeout") || short.includes("Abort")) {
            __vite_ssr_import_2__.logger.debug(`[LuaExecutor] redis.call(${msg.cmd}) \u2192 ${short}`);
          } else {
            __vite_ssr_import_2__.logger.warn(`[LuaExecutor] redis.call(${msg.cmd}) \u2192 ${short}`);
          };
          payload = `ERR ${short}`;
          status = 2;
        };
        const buf = Buffer.from(payload, "utf8");
        const sab = msg.sab;
        const ctrl = new Int32Array(sab, 0, 1);
        const len = new Int32Array(sab, 4, 1);
        const data = new Uint8Array(sab, 8);
        buf.copy(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        Atomics.store(len, 0, buf.length);
        Atomics.store(ctrl, 0, status);
        Atomics.notify(ctrl, 0, 1);
      } else if (msg.type === "result") {
        _watchdogCancelled = true;
        clearInterval(watchdog);
        _luaConsecutivePdimErrors = 0;
        settle(() => {
          worker.terminate();
          resolve(msg.result);
        });
      } else if (msg.type === "error") {
        _watchdogCancelled = true;
        clearInterval(watchdog);
        const errMsg = String(msg.error ?? "");
        const isPdim5xx = errMsg.includes("HTTP 500") || errMsg.includes("HTTP 502");
        if (isPdim5xx && !pdim5xxCounted) {
          pdim5xxCounted = true;
          _luaConsecutivePdimErrors++;
        } else if (!isPdim5xx) {
          _luaConsecutivePdimErrors = 0;
        };
        settle(() => {
          worker?.terminate();
          reject(new Error(errMsg));
        });
      }
    });
    worker?.on("error", (err) => {
      _watchdogCancelled = true;
      clearInterval(watchdog);
      settle(() => reject(err));
    });
    worker?.on("exit", (code) => {
      _watchdogCancelled = true;
      clearInterval(watchdog);
      setImmediate(() => {
        if (!settled) {
          if (code === 0 && !pdim5xxCounted) {
            pdim5xxCounted = true;
            _luaConsecutivePdimErrors++;
          };
          settle(
            () => reject(
              new Error(
                `[LuaExecutor] worker exited unexpectedly (code=${code})`
              )
            )
          );
        }
      });
    });
  });
  _execPromise?.catch(() => {
  });
  return _execPromise;
}
