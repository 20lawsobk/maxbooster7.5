'use strict';async (__vite_ssr_exports__,__vite_ssr_import_meta__,__vite_ssr_import__,__vite_ssr_dynamic_import__,__vite_ssr_exportAll__,__vite_ssr_exportName__,__filename,__dirname,module,exports,require)=>{{__vite_ssr_exportName__("setLuaScriptTimeout", () => { try { return setLuaScriptTimeout } catch {} });
__vite_ssr_exportName__("getLuaScriptTimeout", () => { try { return getLuaScriptTimeout } catch {} });
__vite_ssr_exportName__("resetLuaExecutorSemaphore", () => { try { return resetLuaExecutorSemaphore } catch {} });
__vite_ssr_exportName__("getLuaExecutorStats", () => { try { return getLuaExecutorStats } catch {} });
__vite_ssr_exportName__("setLuaRegistrationMode", () => { try { return setLuaRegistrationMode } catch {} });
__vite_ssr_exportName__("isLuaRegistrationMode", () => { try { return isLuaRegistrationMode } catch {} });
__vite_ssr_exportName__("execLuaViaPdim", () => { try { return execLuaViaPdim } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("worker_threads", {"importedNames":["Worker"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("msgpackr", {"importedNames":["Unpackr"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("/server/logger.ts", {"importedNames":["logger"]});
const __vite_ssr_import_3__ = await __vite_ssr_import__("/server/lib/pdimCircuitBreaker.ts", {"importedNames":["cbIsOpen"]});




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
      "[LuaExecutor] Wait queue saturated — shedding BullMQ request (backpressure)"
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
  // back to the main thread, which releases the slot gracefully — much
  // cleaner than waiting for the 90s hard-kill watchdog.
  const _awaitResult = Atomics?.wait(control, 0, 0, 60000);
  if (_awaitResult === 'timed-out') {
    throw new Error('[LuaExecutor] redis.call timed out after 60s — PDIM chain congested');
  }
  const status = Atomics?.load(control, 0);
  const len = Atomics?.load(lenBuf, 0);
  const raw = Buffer?.from(new Uint8Array(sab, SAB_HEADER_BYTES, len)).toString('utf8');
  if (status === 2) throw new Error(raw); // propagates as Lua error
  // Reviver: convert every JSON null to undefined.
  // wasmoon dispatches on typeof before probing .then:
  //   'undefined' → lua_pushnil  (no .then probe — safe, maps to Lua nil)
  //   'object'    → .then probe  (null?.then throws TypeError)
  // Lua nil is the correct nil substitute: passes "~= nil" guards as false.
  // Lua false would pass "~= nil" (false ~= nil is TRUE) causing BullMQ to
  // treat optional args (parentKey, repeatJobKey …) as real values → -5 error.
  return JSON.parse(raw, (_k, v) => v === null ? undefined : v);
}

// Recursively replace every null with undefined so that wasmoon maps the
// value to Lua nil.  wasmoon dispatches on typeof:
//   typeof null      === 'object'    → Promise probe → null?.then throws
//   typeof undefined === 'undefined' → lua_pushnil   (safe, no .then probe)
// Lua nil is required (not false) because BullMQ Lua uses "if x ~= nil" guards
// for optional args (parentKey, repeatJobKey, …).  false ~= nil is TRUE in Lua,
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
      // XADD (Redis Streams) is not supported by PDIM — silently drop it.
      // BullMQ uses XADD only for optional event listeners; dropping it is
      // safe and prevents every queue?.add() from failing with an error.
      if (String(cmd).toUpperCase() === 'XADD') return undefined;
      const r = syncRedisCall(String(cmd), args?.map(a => (a == null ? '' : String(a))));
      return r === null ? undefined : r; // Redis nil → Lua nil
    },
    pcall(...all) {
      const [cmd, ...args] = all;
      if (String(cmd).toUpperCase() === 'XADD') return undefined;
      try {
        const r = syncRedisCall(String(cmd), args?.map(a => (a == null ? '' : String(a))));
        return r === null ? undefined : r; // Redis nil → Lua nil
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
        // null → undefined (Lua nil) to avoid wasmoon .then probe on null
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
            `[LuaExecutor] watchdog 90s tick — semaphore already externally reset (elapsed ${elapsedS}s); skipping hard-kill`
          );
          _watchdogCancelled = true;
          clearInterval(watchdog);
          return;
        };
        __vite_ssr_import_2__.logger.error(
          `[LuaExecutor] script hard-killed after ${elapsedS}s (active=${_activeWorkers}, queued=${_waitQueue.length}) — Atomics.wait stall detected; releasing semaphore slot`
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
            `[LuaExecutor] script still running after ${elapsedS}s — semaphore was externally reset (active counter zeroed by ChainFixer)`
          );
          return;
        };
        if (_luaRegistrationMode) {
          __vite_ssr_import_2__.logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s — registration in progress (active=${_activeWorkers}, queued=${_waitQueue?.length})`
          );
          return;
        };
        if (Date.now() - _executorBootTs < 12e4) {
          __vite_ssr_import_2__.logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s — boot settling window (active=${_activeWorkers}, queued=${_waitQueue?.length})`
          );
          return;
        };
        try {
          const { getPdimQueueDepth } = await __vite_ssr_dynamic_import__("/server/lib/pdimClient.ts");
          const depth = getPdimQueueDepth();
          if (depth > 100) {
            __vite_ssr_import_2__.logger.debug(
              `[LuaExecutor] script paused ${elapsedS}s — PDIM back-pressure (${depth} queued, active=${_activeWorkers})`
            );
            return;
          }
        } catch {
        };
        __vite_ssr_import_2__.logger.warn(
          `[LuaExecutor] script still running after ${elapsedS}s — active=${_activeWorkers}, queued=${_waitQueue?.length}`
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
            __vite_ssr_import_2__.logger.debug(`[LuaExecutor] redis.call(${msg.cmd}) → ${short}`);
          } else {
            __vite_ssr_import_2__.logger.warn(`[LuaExecutor] redis.call(${msg.cmd}) → ${short}`);
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
//# sourceURL=/workspace/maxbooster7.5/server/lib/luaExecutor.ts
//# sourceMappingSource=vite-generated
//# sourceMappingURL=data:application/json;base64,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LE9BQU8sU0FBUyxVQUFVLEtBQUssT0FBTyxTQUFTLFVBQVU7QUFDM0QsWUFBSSxhQUFhLENBQUMsZ0JBQWdCO0FBSWhDLDJCQUFpQjtBQUNqQjtBQUFBLFFBQ0YsV0FBVyxDQUFDLFdBQVc7QUFDckIsc0NBQTRCO0FBQUEsUUFDOUI7QUFDQSxlQUFPLE1BQU07QUFDWCxrQkFBUSxVQUFVO0FBQ2xCLGlCQUFPLElBQUksTUFBTSxNQUFNLENBQUM7QUFBQSxRQUMxQixDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0YsQ0FBQztBQUVELFlBQVEsR0FBRyxTQUFTLENBQUMsUUFBUTtBQUMzQiwyQkFBcUI7QUFDckIsb0JBQWMsUUFBUTtBQUN0QixhQUFPLE1BQU0sT0FBTyxHQUFHLENBQUM7QUFBQSxJQUMxQixDQUFDO0FBZ0JELFlBQVEsR0FBRyxRQUFRLENBQUMsU0FBUztBQUMzQiwyQkFBcUI7QUFDckIsb0JBQWMsUUFBUTtBQUN0QixtQkFBYSxNQUFNO0FBQ2pCLFlBQUksQ0FBQyxTQUFTO0FBS1osY0FBSSxTQUFTLEtBQUssQ0FBQyxnQkFBZ0I7QUFDakMsNkJBQWlCO0FBQ2pCO0FBQUEsVUFDRjtBQUNBO0FBQUEsWUFBTyxNQUNMO0FBQUEsY0FDRSxJQUFJO0FBQUEsZ0JBQ0Ysa0RBQWtELElBQUk7QUFBQSxjQUN4RDtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQU1ELGdCQUFjLE1BQU0sTUFBTTtBQUFBLEVBQUMsQ0FBQztBQUM1QixTQUFPO0FBQ1QiLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbImx1YUV4ZWN1dG9yLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEB0cy1ub2NoZWNrXG4vKipcbiAqIEx1YUV4ZWN1dG9yIOKAlCBydW5zIEJ1bGxNUSBMdWEgc2NyaXB0cyBsb2NhbGx5IGluIGEgV29ya2VyIHRocmVhZCB1c2luZ1xuICogd2FzbW9vbiAoV2ViQXNzZW1ibHkgTHVhIDUuNCksIGJ5cGFzc2luZyBQRElNJ3MgYnJva2VuIGFzeW5jIEx1YSBydW50aW1lLlxuICpcbiAqIFJvb3QgcHJvYmxlbSB3aXRoIFBESU0gRVZBTDpcbiAqICAgUERJTSBpbXBsZW1lbnRzIHJlZGlzLmNhbGwoKSBhcyBhbiBhc3luYyBQcm9taXNlIGNoYWluIGludGVybmFsbHkuXG4gKiAgIEJ1bGxNUSdzIEx1YSBzY3JpcHRzIHVzZSByZWRpcz8uY2FsbCgpIHN5bmNocm9ub3VzbHkgKHN0YW5kYXJkIFJlZGlzIG1vZGVsKS5cbiAqICAgV2hlbiByZWRpcz8uY2FsbCgpIHJldHVybnMgbmlsLCBQRElNIHRyaWVzIC50aGVuKG51bGwpIGFuZCBjcmFzaGVzLlxuICpcbiAqIFNvbHV0aW9uOlxuICogICAxLiBSdW4gdGhlIEx1YSBzY3JpcHQgaW4gYSBXb3JrZXIgdGhyZWFkIChjYW4gYmxvY2sgd2l0aCBBdG9taWNzPy53YWl0KS5cbiAqICAgMi4gSW5qZWN0IHJlZGlzPy5jYWxsKCkgYXMgYSBzeW5jaHJvbm91cyBmdW5jdGlvbiB0aGF0IHVzZXMgU2hhcmVkQXJyYXlCdWZmZXJcbiAqICAgICAgSVBDIHRvIGNhbGwgdGhlIG1haW4gdGhyZWFkLCB3aGljaCBhd2FpdHMgUERJTSBIVFRQIGFuZCB3cml0ZXMgdGhlIHJlc3VsdC5cbiAqICAgMy4gUHJlLWRlY29kZSBtc2dwYWNrIEJ1ZmZlciBBUkdWIHZhbHVlcyBiZWZvcmUgcGFzc2luZyB0byB0aGUgd29ya2VyLFxuICogICAgICBzbyBjbXNncGFjaz8udW5wYWNrKCkgcmVjZWl2ZXMgYWxyZWFkeS1kZWNvZGVkIEx1YSB0YWJsZXMgKGlkZW50aXR5IGZuKS5cbiAqL1xuXG5pbXBvcnQgeyBXb3JrZXIgfSBmcm9tIFwid29ya2VyX3RocmVhZHNcIjtcbmltcG9ydCB7IFVucGFja3IgfSBmcm9tIFwibXNncGFja3JcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGNiSXNPcGVuIH0gZnJvbSBcIi4vcGRpbUNpcmN1aXRCcmVha2VyLmpzXCI7XG5cbmNvbnN0IF9tc2dVbnBhY2tlciA9IG5ldyBVbnBhY2tyKHsgdXNlUmVjb3JkczogZmFsc2UgfSk7XG5cbi8qKlxuICogQXN5bmMgc2VtYXBob3JlIGZvciB3YXNtb29uIFdvcmtlciB0aHJlYWRzLlxuICpcbiAqIEVhY2ggV29ya2VyIGxvYWRzIHRoZSBmdWxsIFdBU00gYmluYXJ5IGFuZCBtYWtlcyBtdWx0aXBsZSBIVFRQIGNhbGxzIHRvXG4gKiBQRElNIOKAlCB0b28gbWFueSBzaW11bHRhbmVvdXNseSBleGhhdXN0cyBtZW1vcnkgYW5kIHNhdHVyYXRlcyB0aGUgSFRUUFxuICogY29ubmVjdGlvbiBwb29sLiAgSW5zdGVhZCBvZiByZWplY3RpbmcgY2FsbGVycyB3aGVuIHRoZSBjYXAgaXMgaGl0ICh3aGljaFxuICogY2F1c2VzIEJ1bGxNUSB0byByZXRyeSBpbW1lZGlhdGVseSBhbmQgY3JlYXRlIGEgc3Rvcm0pLCB3ZSBxdWV1ZSB3YWl0aW5nXG4gKiBjYWxsZXJzIGFuZCByZXNvbHZlIHRoZW0gYXMgc2xvdHMgZnJlZSB1cC5cbiAqXG4gKiBNQVhfV0FJVF9NUzogbWF4aW11bSB0aW1lIGEgY2FsbGVyIHdpbGwgd2FpdCBmb3IgYSBzbG90IGJlZm9yZSBnaXZpbmcgdXAuXG4gKi9cbi8vIFNpbmdsZSBleGNsdXNpdmUgV29ya2VyOiBlYWNoIEJ1bGxNUSBMdWEgc2NyaXB0IGdldHMgdW5jb250ZXN0ZWQgYWNjZXNzIHRvXG4vLyB0aGUgUERJTSBmYXN0LWxhbmUuICBTY3JpcHRzIGFyZSBzZXF1ZW50aWFsIGVpdGhlciB3YXk7IGEgc2luZ2xlIFdvcmtlclxuLy8gZWxpbWluYXRlcyBjb250ZW50aW9uIGFuZCBsZXRzIGVhY2ggcmVkaXM/LmNhbGwoKSBjb21wbGV0ZSBpbiB+UERJTV9SVFQgKyAxMG1zLlxuY29uc3QgTUFYX0NPTkNVUlJFTlRfV09SS0VSUyA9IDE7XG5cbi8vIF9tYXhXYWl0TXM6IG1heGltdW0gdGltZSBhIENBTExFUiB3YWl0cyB0byBBQ1FVSVJFIGEgV29ya2VyIHNsb3QgKHF1ZXVlIHdhaXQpLFxuLy8gTk9UIGEgbGltaXQgb24gc2NyaXB0IGV4ZWN1dGlvbiB0aW1lLiAgU2NyaXB0cyBydW4gdG8gY29tcGxldGlvbiB3aXRoIG5vXG4vLyBoYXJkLWtpbGwg4oCUIG9ubHkgdGhlIHBlci02MHMgd2F0Y2hkb2cgbG9nIHJlbWluZHMgdXMgaWYgb25lIGlzIHN0dWNrLlxuLy9cbi8vIFdpdGggdGhlIGZhc3QtbGFuZSAoMTBtcyBpbnRlci1jYWxsIGdhcCk6XG4vLyAgIHR5cGljYWwgc2NyaXB0OiAzNSDDlyAoMjAwbXMgUlRUICsgMTBtcyBnYXApID0gfjcuMzVzXG4vLyAgIGhpZ2gtUlRUIGNhc2U6ICAzNSDDlyAoODAwbXMgUlRUICsgMTBtcyBnYXApID0gfjI4LjM1c1xuLy8gU2xvdC13YWl0IHJhaXNlZCB0byA5MHMgdG8gaGFuZGxlIHN1c3RhaW5lZCBQRElNIGNvbmdlc3Rpb24gZXZlbnRzIHdpdGhvdXRcbi8vIHByZW1hdHVyZSByZWplY3Rpb24g4oCUIHNjcmlwdHMgYWx3YXlzIGZyZWUgdGhlaXIgc2xvdCB3ZWxsIHdpdGhpbiB0aGlzIHdpbmRvdy5cbmxldCBfbWF4V2FpdE1zID0gOTBfMDAwO1xuLyoqIFBlcm1hbmVudGx5IGluY3JlYXNlIHRoZSBMdWFFeGVjdXRvciBzbG90LXdhaXQgdGltZW91dCDigJQgY2FsbGVkIGJ5IFBlcm1hbmVudEZpeFJlZ2lzdHJ5LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldEx1YVNjcmlwdFRpbWVvdXQobXM6IG51bWJlcik6IHZvaWQge1xuICBfbWF4V2FpdE1zID0gTWF0aC5tYXgoOTBfMDAwLCBNYXRoLm1pbigxODBfMDAwLCBtcykpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldEx1YVNjcmlwdFRpbWVvdXQoKTogbnVtYmVyIHtcbiAgcmV0dXJuIF9tYXhXYWl0TXM7XG59XG4vLyBCYWNrcHJlc3N1cmUgY2FwOiByZWplY3QgaW1tZWRpYXRlbHkgd2hlbiB0aGUgd2FpdCBxdWV1ZSBleGNlZWRzIHRoaXMgc2l6ZS5cbi8vIFdpdGhvdXQgYSBjYXAsIHN1c3RhaW5lZCBCdWxsTVEgbG9hZCBjYXVzZXMgX3dhaXRRdWV1ZSB0byBncm93IHdpdGhvdXQgYm91bmQsXG4vLyBob2xkaW5nIHRob3VzYW5kcyBvZiB0aW1lciBoYW5kbGVzIGFuZCBjb25zdW1pbmcgdW5ib3VuZGVkIG1lbW9yeS5cbi8vIDUwMDAgc2xvdHM6IG1hdGNoZXMgcmVhbC13b3JsZCAxMDBNKyBjYWxsZXIgYnVyc3QgcGVha3Mgd2l0aG91dCBwcmVtYXR1cmUgc2hlZGRpbmcuXG5jb25zdCBNQVhfUVVFVUVfU0laRSA9IDUwMDA7XG4vLyBIb3cgbG9uZyB0byBzbGVlcCBiZWZvcmUgcmVqZWN0aW5nIHdoZW4gdGhlIGNpcmN1aXQgaXMgT1BFTi5cbi8vIEJ1bGxNUSB1c2VzIG9ubHlFbWl0RXJyb3I6dHJ1ZSBzbyBvdXIgcmVqZWN0aW9uIGlzIHN3YWxsb3dlZCBhbmQgdHJlYXRlZCBhc1xuLy8gXCJubyBqb2JcIiDigJQgd2l0aG91dCB0aGlzIHNsZWVwIHRoZSBwb2xsIGxvb3AgcnVucyBhdCBmdWxsIHNwZWVkLCBzYXR1cmF0aW5nXG4vLyB0aGUgZXZlbnQgbG9vcCBhbmQgcHJldmVudGluZyBIVFRQIHJlcXVlc3RzIGZyb20gYmVpbmcgaGFuZGxlZC5cbmNvbnN0IENJUkNVSVRfT1BFTl9CQUNLT0ZGX01TID0gNV8wMDA7XG5cbi8vIOKUgOKUgCBDb25zZWN1dGl2ZSBQRElNIGVycm9yIGJhY2tvZmYg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4vLyBXaGVuIFBESU0gcmV0dXJucyA1eHggZXJyb3JzIG9uIEx1YSBzY3JpcHQgY2FsbHMgdGhlIHNsb3QgaXMgbm9ybWFsbHlcbi8vIHJlbGVhc2VkIGltbWVkaWF0ZWx5LCBjYXVzaW5nIEJ1bGxNUSB0byByZXRyeSBhdCBmdWxsIHNwZWVkICh+MTQgcmV0cmllcy9zXG4vLyB3aXRoIDQgd29ya2VycykuICBUaGF0IGZsb29kIGl0c2VsZiBjYW4gcHVzaCBQRElNIGZyb20gSFRUUCA1MDAg4oaSIEhUVFAgNTAyLlxuLy8gV2UgdHJhY2sgY29uc2VjdXRpdmUgc2NyaXB0LWxldmVsIFBESU0gNXh4IGVycm9ycyBhbmQgZXhwb25lbnRpYWxseSBkZWxheVxuLy8gc2xvdCByZWxlYXNlIHNvIEJ1bGxNUSdzIGVmZmVjdGl2ZSByZXRyeSByYXRlIGJhY2tzIG9mZjpcbi8vICAgMSBlcnJvciAg4oaSICAwIG1zICAoZmlyc3QgZmFpbHVyZSwgbm8gZGVsYXkpXG4vLyAgIDIgZXJyb3JzIOKGkiAgMSBzXG4vLyAgIDMgZXJyb3JzIOKGkiAgMiBzXG4vLyAgIDQgZXJyb3JzIOKGkiAgNCBzXG4vLyAgIDUrICAgICAgIOKGkiAgOCBzICAoY2FwcGVkIOKAlCBzdGlsbCByZWNvdmVycyBmYXN0IHdoZW4gUERJTSBzdGFiaWxpc2VzKVxuLy8gT24gYW55IHN1Y2Nlc3NmdWwgc2NyaXB0IGNvbXBsZXRpb24gdGhlIGNvdW50ZXIgcmVzZXRzIHRvIDAuXG5sZXQgX2x1YUNvbnNlY3V0aXZlUGRpbUVycm9ycyA9IDA7XG5jb25zdCBMVUFfUERJTV9FUlJfQkFDS09GRl9DQVBfTVMgPSA4XzAwMDtcblxuZnVuY3Rpb24gX2x1YUNvbXB1dGVCYWNrb2ZmKCk6IG51bWJlciB7XG4gIGlmIChfbHVhQ29uc2VjdXRpdmVQZGltRXJyb3JzIDwgMikgcmV0dXJuIDA7XG4gIHJldHVybiBNYXRoLm1pbihcbiAgICBMVUFfUERJTV9FUlJfQkFDS09GRl9DQVBfTVMsXG4gICAgNTAwICogTWF0aC5wb3coMiwgX2x1YUNvbnNlY3V0aXZlUGRpbUVycm9ycyAtIDIpLFxuICApO1xufVxuXG4vLyBNb2R1bGUtbGV2ZWwgYm9vdCB0aW1lc3RhbXAg4oCUIHVzZWQgdG8gZ2F0ZSB0aGUgMzBzLzYwcyB3YXRjaGRvZyBXQVJOc1xuLy8gZHVyaW5nIHRoZSBpbml0aWFsIDEyMHMgUERJTSBzZXR0bGluZyB3aW5kb3cgKHN0YWxscyBhcmUgZXhwZWN0ZWQgYXQgYm9vdCkuXG5jb25zdCBfZXhlY3V0b3JCb290VHMgPSBEYXRlLm5vdygpO1xuXG5sZXQgX2FjdGl2ZVdvcmtlcnMgPSAwO1xuXG4vLyBFYWNoIHF1ZXVlZCB3YWl0ZXIgc3RvcmVzIGl0cyByZXNvbHZlIGZuIGFuZCB0aW1lb3V0IGhhbmRsZSBzZXBhcmF0ZWx5LlxuLy8gVGhpcyBsZXRzIF9yZWxlYXNlV29ya2VyU2xvdCBoYW5kIHRoZSBzbG90IHRvIHRoZSBuZXh0IHdhaXRlciBXSVRIT1VUXG4vLyBjYWxsaW5nIF9hY3RpdmVXb3JrZXJzKysgKHRoZSBzbG90IGlzICp0cmFuc2ZlcnJlZCosIG5vdCBuZXdseSBjcmVhdGVkKS5cbi8vIFRoZSBwcmV2aW91cyBkZXNpZ24gc3RvcmVkIGEgY29tYmluZWQgcmVzb2x2ZXIgPSAoKSA9PiB7IF9hY3RpdmVXb3JrZXJzKys7IHJlc29sdmUoKTsgfVxuLy8gYW5kIGNhbGxlZCBpdCBmcm9tIF9yZWxlYXNlV29ya2VyU2xvdCB3aXRob3V0IGRlY3JlbWVudGluZyBmaXJzdCwgY2F1c2luZ1xuLy8gX2FjdGl2ZVdvcmtlcnMgdG8gZHJpZnQgYWJvdmUgTUFYX0NPTkNVUlJFTlRfV09SS0VSUyBieSArMSBwZXIgaGFuZG9mZi5cbmludGVyZmFjZSBfV2FpdGVyIHtcbiAgcmVzb2x2ZTogKCkgPT4gdm9pZDtcbiAgdGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+O1xufVxuY29uc3QgX3dhaXRRdWV1ZTogX1dhaXRlcltdID0gW107XG5cbmFzeW5jIGZ1bmN0aW9uIF9hY3F1aXJlV29ya2VyU2xvdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKF9hY3RpdmVXb3JrZXJzIDwgTUFYX0NPTkNVUlJFTlRfV09SS0VSUykge1xuICAgIF9hY3RpdmVXb3JrZXJzKys7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIEJhY2twcmVzc3VyZTogcmVqZWN0IGltbWVkaWF0ZWx5IGlmIHRoZSB3YWl0IHF1ZXVlIGlzIHNhdHVyYXRlZC5cbiAgLy8gV2l0aG91dCB0aGlzIGNhcCwgc3VzdGFpbmVkIEJ1bGxNUSBsb2FkIGNhdXNlcyBfd2FpdFF1ZXVlIHRvIGdyb3cgd2l0aG91dFxuICAvLyBib3VuZCwgaG9sZGluZyB0aG91c2FuZHMgb2YgNjAtc2Vjb25kIHRpbWVyIGhhbmRsZXMgYW5kIGNvbnN1bWluZyB1bmJvdW5kZWRcbiAgLy8gbWVtb3J5IOKAlCBhIHNpbGVudCBraWxsIHVuZGVyIGluZmluaXRlIHdvcmtsb2FkLlxuICBpZiAoX3dhaXRRdWV1ZS5sZW5ndGggPj0gTUFYX1FVRVVFX1NJWkUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIltMdWFFeGVjdXRvcl0gV2FpdCBxdWV1ZSBzYXR1cmF0ZWQg4oCUIHNoZWRkaW5nIEJ1bGxNUSByZXF1ZXN0IChiYWNrcHJlc3N1cmUpXCIsXG4gICAgKTtcbiAgfVxuICAvLyBRdWV1ZSB0aGUgY2FsbGVyIHVudGlsIGEgc2xvdCBmcmVlcyB1cCDigJQgdHJhbnNmZXIgaW5jcmVtZW50cyB0aGUgY291bnQuXG4gIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgZW50cnk6IF9XYWl0ZXIgPSB7XG4gICAgICByZXNvbHZlLFxuICAgICAgdGltZXI6IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBpZHggPSBfd2FpdFF1ZXVlLmluZGV4T2YoZW50cnkpO1xuICAgICAgICBpZiAoaWR4ICE9PSAtMSkgX3dhaXRRdWV1ZS5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBbTHVhRXhlY3V0b3JdIFRpbWVvdXQgd2FpdGluZyBmb3Igd29ya2VyIHNsb3QgKCR7TWF0aC5yb3VuZChfbWF4V2FpdE1zIC8gMTAwMCl9cylgLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9LCBfbWF4V2FpdE1zKSxcbiAgICB9O1xuICAgIF93YWl0UXVldWUucHVzaChlbnRyeSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBfcmVsZWFzZVdvcmtlclNsb3QoKTogdm9pZCB7XG4gIGlmIChfd2FpdFF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAvLyBUcmFuc2ZlciB0aGUgc2xvdCB0byB0aGUgbmV4dCB3YWl0ZXIuICBfYWN0aXZlV29ya2VycyBzdGF5cyB0aGUgc2FtZTpcbiAgICAvLyB0aGUgcmVsZWFzaW5nIHdvcmtlciByZWxpbnF1aXNoZXMgaXRzIHNsb3QgYW5kIHRoZSB3YWl0ZXIgdGFrZXMgaXQgb3Zlci5cbiAgICAvLyBXZSBtdXN0IE5PVCBjYWxsIF9hY3RpdmVXb3JrZXJzKysgaGVyZSAob2xkIGJ1ZzogcmVzb2x2ZXIgZGlkIHRoYXQsXG4gICAgLy8gY2F1c2luZyBjb3VudCB0byBncm93IGJ5IDEgb24gZXZlcnkgcXVldWUgaGFuZG9mZikuXG4gICAgY29uc3QgeyByZXNvbHZlLCB0aW1lciB9ID0gX3dhaXRRdWV1ZS5zaGlmdCgpITtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHJlc29sdmUoKTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoX2FjdGl2ZVdvcmtlcnMgPiAwKSBfYWN0aXZlV29ya2Vycy0tO1xuICB9XG59XG5cbi8qKlxuICogRW1lcmdlbmN5IHNlbWFwaG9yZSByZXNldCDigJQgY2FsbGVkIGJ5IGNoYWluRXJyb3JBdXRvRml4ZXIgd2hlbiB0aGVcbiAqIEx1YUV4ZWN1dG9yIGdldHMgc3R1Y2sgKGFjdGl2ZSBjb3VudCBkcmlmdHMgYWJvdmUgdGhlIGNhcCBkdWUgdG8gd29ya2VyXG4gKiB0aHJlYWRzIHRoYXQgdGVybWluYXRlZCB3aXRob3V0IHJlbGVhc2luZyB0aGVpciBzbG90KS5cbiAqXG4gKiBSZXR1cm5zIHRoZSBudW1iZXIgb2Ygc2xvdHMgdGhhdCB3ZXJlIGZvcmNlLXJlbGVhc2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRMdWFFeGVjdXRvclNlbWFwaG9yZSgpOiBudW1iZXIge1xuICBjb25zdCBzdHVja1Nsb3RzID0gTWF0aC5tYXgoMCwgX2FjdGl2ZVdvcmtlcnMgLSBfd2FpdFF1ZXVlLmxlbmd0aCk7XG4gIC8vIERyYWluIGFsbCBxdWV1ZWQgd2FpdGVycyDigJQgcmVzb2x2ZSB0aGVpciBwcm9taXNlcyBzbyB0aGV5IGNhbiBwcm9jZWVkLlxuICAvLyBEb24ndCBjYWxsIF9hY3RpdmVXb3JrZXJzKysgaGVyZTsgd2UgemVybyB0aGUgY291bnRlciBvbiB0aGUgbmV4dCBsaW5lLlxuICB3aGlsZSAoX3dhaXRRdWV1ZT8ubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHsgcmVzb2x2ZSwgdGltZXIgfSA9IF93YWl0UXVldWU/LnNoaWZ0KCkgPz8ge307XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICByZXNvbHZlKCk7XG4gIH1cbiAgLy8gWmVybyBvdXQgdGhlIGNvdW50ZXIgZW50aXJlbHkgc28gZnJlc2ggY2FsbGVycyBzdGFydCBmcm9tIGEgY2xlYW4gc2xhdGUuXG4gIF9hY3RpdmVXb3JrZXJzID0gMDtcbiAgcmV0dXJuIHN0dWNrU2xvdHM7XG59XG5cbi8qKiBTbmFwc2hvdCBvZiB0aGUgTHVhRXhlY3V0b3Igc2VtYXBob3JlIOKAlCB1c2VkIGJ5IHRoZSBjaGFpbiBlcnJvciBmaXhlciBoZWFsdGggY2hlY2suICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0THVhRXhlY3V0b3JTdGF0cygpOiB7XG4gIGFjdGl2ZTogbnVtYmVyO1xuICBxdWV1ZWQ6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG59IHtcbiAgcmV0dXJuIHtcbiAgICBhY3RpdmU6IF9hY3RpdmVXb3JrZXJzLFxuICAgIHF1ZXVlZDogX3dhaXRRdWV1ZS5sZW5ndGgsXG4gICAgbWF4OiBNQVhfQ09OQ1VSUkVOVF9XT1JLRVJTLFxuICB9O1xufVxuXG4vLyDilIDilIAgUmVnaXN0cmF0aW9uLW1vZGUgZ2F0ZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIFNldCB0byB0cnVlIHdoaWxlIGF1dG9ub21vdXNKb2JTY2hlZHVsZXIgaXMgc2VyaWFsbHkgcmVnaXN0ZXJpbmcgcmVwZWF0YWJsZVxuLy8gam9icy4gIEVhY2ggdXBzZXJ0Sm9iU2NoZWR1bGVyIGNhbGwgdGFrZXMgfjUwcyB1bmRlciBib290IFBESU0gYmFjay1wcmVzc3VyZSxcbi8vIHdoaWNoIGNhdXNlcyBDaGFpbkZpeGVyJ3MgZGVhZGxvY2sgZGV0ZWN0b3IgKDPDlyBjb25nZXN0ZWQgcmVhZGluZ3MpIGFuZFxuLy8gUGxhdGZvcm1BdXRvRml4ZXIncyBsdWFfZXhlY3V0b3IgZGVncmFkZWQgcHJvYmUgdG8gZmlyZSDigJQgcHJvZHVjaW5nIDTigJM2IFdBUk5zXG4vLyB0aGF0IGFyZSBub3QgcmVhbCBzaWduYWxzICh0aGUgc2xvdCBpcyBvY2N1cGllZCBieSBhIGtub3duLXNsb3cgcmVnaXN0cmF0aW9uXG4vLyBzY3JpcHQsIG5vdCBhIHN0dWNrIG9yIGRlYWRsb2NrZWQgd29ya2VyKS4gIEJvdGggcHJvYmVycyBza2lwIHRoZWlyIGNvbmdlc3Rpb25cbi8vIFdBUk4gbG9naWMgd2hpbGUgdGhpcyBmbGFnIGlzIHRydWUuXG5sZXQgX2x1YVJlZ2lzdHJhdGlvbk1vZGUgPSBmYWxzZTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRMdWFSZWdpc3RyYXRpb25Nb2RlKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBfbHVhUmVnaXN0cmF0aW9uTW9kZSA9IGFjdGl2ZTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBpc0x1YVJlZ2lzdHJhdGlvbk1vZGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiBfbHVhUmVnaXN0cmF0aW9uTW9kZTtcbn1cblxuLy8gcHJvY2Vzcy5jd2QoKSBhbHdheXMgcmVzb2x2ZXMgdG8gdGhlIHByb2plY3Qgcm9vdCByZWdhcmRsZXNzIG9mIENKUy9FU00gYnVpbGQgZm9ybWF0XG5jb25zdCBfcHJvamVjdFJvb3QgPSBwcm9jZXNzLmN3ZCgpO1xuY29uc3QgX3dhc21vb25VcmwgPSBgZmlsZTovLyR7X3Byb2plY3RSb290fS9ub2RlX21vZHVsZXMvd2FzbW9vbi9kaXN0L2luZGV4LmpzYDtcbmNvbnN0IF9tc2dwYWNrclVybCA9IGBmaWxlOi8vJHtfcHJvamVjdFJvb3R9L25vZGVfbW9kdWxlcy9tc2dwYWNrci9kaXN0L25vZGUuY2pzYDtcblxuY29uc3QgV09SS0VSX0NPREUgPSBgXG5pbXBvcnQgeyB3b3JrZXJEYXRhLCBwYXJlbnRQb3J0IH0gZnJvbSAnd29ya2VyX3RocmVhZHMnO1xuY29uc3QgeyBMdWFGYWN0b3J5IH0gPSBhd2FpdCBpbXBvcnQoJyR7X3dhc21vb25Vcmx9Jyk7XG5jb25zdCB7IFVucGFja3IsIFBhY2tyIH0gPSBhd2FpdCBpbXBvcnQoJyR7X21zZ3BhY2tyVXJsfScpO1xuY29uc3QgdW5wYWNrID0gbmV3IFVucGFja3IoeyB1c2VSZWNvcmRzOiBmYWxzZSB9KTtcbmNvbnN0IHBhY2sgPSBuZXcgUGFja3IoeyB1c2VSZWNvcmRzOiBmYWxzZSB9KTtcblxuY29uc3QgU0FCX0hFQURFUl9CWVRFUyA9IDg7XG5jb25zdCBTQUJfREFUQV9CWVRFUyA9IDEzMTA3MjsgLy8gMTI4IEtCIG1heCBwZXIgUmVkaXMgcmVzcG9uc2Vcbi8vIFNBQiBjb250cm9sIHZhbHVlczogMD13YWl0aW5nLCAxPXN1Y2Nlc3MgcmVzdWx0LCAyPWVycm9yIChtYWluIHRocmVhZCB0aHJldylcblxuZnVuY3Rpb24gc3luY1JlZGlzQ2FsbChjbWQsIGFyZ3MpIHtcbiAgY29uc3Qgc2FiID0gbmV3IFNoYXJlZEFycmF5QnVmZmVyKFNBQl9IRUFERVJfQllURVMgKyBTQUJfREFUQV9CWVRFUyk7XG4gIGNvbnN0IGNvbnRyb2wgPSBuZXcgSW50MzJBcnJheShzYWIsIDAsIDEpO1xuICBjb25zdCBsZW5CdWYgPSBuZXcgSW50MzJBcnJheShzYWIsIDQsIDEpO1xuICBBdG9taWNzPy5zdG9yZShjb250cm9sLCAwLCAwKTtcbiAgcGFyZW50UG9ydD8ucG9zdE1lc3NhZ2UoeyB0eXBlOiAncmVkaXMnLCBjbWQsIGFyZ3MsIHNhYiB9KTtcbiAgLy8gNjAgcyB0aW1lb3V0OiBpZiB0aGUgbWFpbiB0aHJlYWQgZG9lcyBub3Qgc2lnbmFsIHdpdGhpbiA2MCBzIHRoZSBQRElNXG4gIC8vIGNoYWluIGlzIHNvIGNvbmdlc3RlZCB0aGF0IHdhaXRpbmcgbG9uZ2VyIHdhc3RlcyB0aGUgc2VtYXBob3JlIHNsb3QuXG4gIC8vIFRocm93aW5nIGhlcmUgY2F1c2VzIHRoZSBMdWEgZXJyb3IgcGF0aCBiZWxvdyB0byBwcm9wYWdhdGUgdGhlIGVycm9yXG4gIC8vIGJhY2sgdG8gdGhlIG1haW4gdGhyZWFkLCB3aGljaCByZWxlYXNlcyB0aGUgc2xvdCBncmFjZWZ1bGx5IOKAlCBtdWNoXG4gIC8vIGNsZWFuZXIgdGhhbiB3YWl0aW5nIGZvciB0aGUgOTBzIGhhcmQta2lsbCB3YXRjaGRvZy5cbiAgY29uc3QgX2F3YWl0UmVzdWx0ID0gQXRvbWljcz8ud2FpdChjb250cm9sLCAwLCAwLCA2MDAwMCk7XG4gIGlmIChfYXdhaXRSZXN1bHQgPT09ICd0aW1lZC1vdXQnKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdbTHVhRXhlY3V0b3JdIHJlZGlzLmNhbGwgdGltZWQgb3V0IGFmdGVyIDYwcyDigJQgUERJTSBjaGFpbiBjb25nZXN0ZWQnKTtcbiAgfVxuICBjb25zdCBzdGF0dXMgPSBBdG9taWNzPy5sb2FkKGNvbnRyb2wsIDApO1xuICBjb25zdCBsZW4gPSBBdG9taWNzPy5sb2FkKGxlbkJ1ZiwgMCk7XG4gIGNvbnN0IHJhdyA9IEJ1ZmZlcj8uZnJvbShuZXcgVWludDhBcnJheShzYWIsIFNBQl9IRUFERVJfQllURVMsIGxlbikpLnRvU3RyaW5nKCd1dGY4Jyk7XG4gIGlmIChzdGF0dXMgPT09IDIpIHRocm93IG5ldyBFcnJvcihyYXcpOyAvLyBwcm9wYWdhdGVzIGFzIEx1YSBlcnJvclxuICAvLyBSZXZpdmVyOiBjb252ZXJ0IGV2ZXJ5IEpTT04gbnVsbCB0byB1bmRlZmluZWQuXG4gIC8vIHdhc21vb24gZGlzcGF0Y2hlcyBvbiB0eXBlb2YgYmVmb3JlIHByb2JpbmcgLnRoZW46XG4gIC8vICAgJ3VuZGVmaW5lZCcg4oaSIGx1YV9wdXNobmlsICAobm8gLnRoZW4gcHJvYmUg4oCUIHNhZmUsIG1hcHMgdG8gTHVhIG5pbClcbiAgLy8gICAnb2JqZWN0JyAgICDihpIgLnRoZW4gcHJvYmUgIChudWxsPy50aGVuIHRocm93cyBUeXBlRXJyb3IpXG4gIC8vIEx1YSBuaWwgaXMgdGhlIGNvcnJlY3QgbmlsIHN1YnN0aXR1dGU6IHBhc3NlcyBcIn49IG5pbFwiIGd1YXJkcyBhcyBmYWxzZS5cbiAgLy8gTHVhIGZhbHNlIHdvdWxkIHBhc3MgXCJ+PSBuaWxcIiAoZmFsc2Ugfj0gbmlsIGlzIFRSVUUpIGNhdXNpbmcgQnVsbE1RIHRvXG4gIC8vIHRyZWF0IG9wdGlvbmFsIGFyZ3MgKHBhcmVudEtleSwgcmVwZWF0Sm9iS2V5IOKApikgYXMgcmVhbCB2YWx1ZXMg4oaSIC01IGVycm9yLlxuICByZXR1cm4gSlNPTi5wYXJzZShyYXcsIChfaywgdikgPT4gdiA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHYpO1xufVxuXG4vLyBSZWN1cnNpdmVseSByZXBsYWNlIGV2ZXJ5IG51bGwgd2l0aCB1bmRlZmluZWQgc28gdGhhdCB3YXNtb29uIG1hcHMgdGhlXG4vLyB2YWx1ZSB0byBMdWEgbmlsLiAgd2FzbW9vbiBkaXNwYXRjaGVzIG9uIHR5cGVvZjpcbi8vICAgdHlwZW9mIG51bGwgICAgICA9PT0gJ29iamVjdCcgICAg4oaSIFByb21pc2UgcHJvYmUg4oaSIG51bGw/LnRoZW4gdGhyb3dzXG4vLyAgIHR5cGVvZiB1bmRlZmluZWQgPT09ICd1bmRlZmluZWQnIOKGkiBsdWFfcHVzaG5pbCAgIChzYWZlLCBubyAudGhlbiBwcm9iZSlcbi8vIEx1YSBuaWwgaXMgcmVxdWlyZWQgKG5vdCBmYWxzZSkgYmVjYXVzZSBCdWxsTVEgTHVhIHVzZXMgXCJpZiB4IH49IG5pbFwiIGd1YXJkc1xuLy8gZm9yIG9wdGlvbmFsIGFyZ3MgKHBhcmVudEtleSwgcmVwZWF0Sm9iS2V5LCDigKYpLiAgZmFsc2Ugfj0gbmlsIGlzIFRSVUUgaW4gTHVhLFxuLy8gc28gZmFsc2UgdHJpZ2dlcnMgdGhvc2UgZ3VhcmRzIGFzIGlmIGEgcmVhbCB2YWx1ZSB3ZXJlIHByZXNlbnQuXG5mdW5jdGlvbiBfcmVwbGFjZU51bGxzKHYpIHtcbiAgaWYgKHYgPT09IG51bGwgfHwgdiA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAoQXJyYXkuaXNBcnJheSh2KSkgcmV0dXJuIHY/Lm1hcChfcmVwbGFjZU51bGxzKTtcbiAgaWYgKHR5cGVvZiB2ID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG91dCA9IHt9O1xuICAgIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyh2KSkgb3V0W2tdID0gX3JlcGxhY2VOdWxscyh2W2tdKTtcbiAgICByZXR1cm4gb3V0O1xuICB9XG4gIHJldHVybiB2O1xufVxuXG5mdW5jdGlvbiBtYWtlQ21zZ3BhY2soKSB7XG4gIHJldHVybiB7XG4gICAgdW5wYWNrKGRhdGEpIHtcbiAgICAgIC8vIFJldHVybiB1bmRlZmluZWQgKEx1YSBuaWwpIGZvciBtaXNzaW5nL2VtcHR5IHZhbHVlcy5cbiAgICAgIC8vIHdhc21vb24gdHlwZW9mLWRpc3BhdGNoZXMgYmVmb3JlIHByb2JpbmcgLnRoZW46XG4gICAgICAvLyAgIHR5cGVvZiB1bmRlZmluZWQgPT09ICd1bmRlZmluZWQnIOKGkiBsdWFfcHVzaG5pbCAoc2FmZSlcbiAgICAgIC8vICAgdHlwZW9mIG51bGwgICAgICA9PT0gJ29iamVjdCcgICAg4oaSIC50aGVuIHByb2JlIOKGkiBUeXBlRXJyb3JcbiAgICAgIGlmIChkYXRhID09PSBudWxsIHx8IGRhdGEgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIC8vIFByZS1kZWNvZGVkIEpTIG9iamVjdC9hcnJheSBmcm9tIG1haW4gdGhyZWFkIOKAlCBzdHJpcCBldmVyeSBudWxsIHRvXG4gICAgICAvLyB1bmRlZmluZWQgc28gd2FzbW9vbiBtYXBzIHRoZW0gdG8gTHVhIG5pbC4gIEx1YSBuaWwgKG5vdCBmYWxzZSkgaXNcbiAgICAgIC8vIHJlcXVpcmVkIGZvciBcImlmIHggfj0gbmlsXCIgZ3VhcmRzIGluIEJ1bGxNUSBMdWEgc2NyaXB0cy5cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHJldHVybiBfcmVwbGFjZU51bGxzKGRhdGEpO1xuICAgICAgLy8gQmluYXJ5IHN0cmluZyAoZnJvbSBSZWRpcyBvciB1bm1vZGlmaWVkIEFSR1YpIOKGkiBkZWNvZGUgd2l0aCBtc2dwYWNrclxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoZGF0YSA9PT0gJycpIHJldHVybiB1bmRlZmluZWQ7IC8vIGVtcHR5IHN0cmluZyDihpIgbm8gZGF0YVxuICAgICAgICB0cnkgeyByZXR1cm4gX3JlcGxhY2VOdWxscyh1bnBhY2s/LnVucGFjayhCdWZmZXI/LmZyb20oZGF0YSwgJ2JpbmFyeScpKSk7IH1cbiAgICAgICAgY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0sXG4gICAgcGFjayhkYXRhKSB7XG4gICAgICByZXR1cm4gcGFjaz8ucGFjayhkYXRhKS50b1N0cmluZygnYmluYXJ5Jyk7XG4gICAgfVxuICB9O1xufVxuXG5jb25zdCB7IHNjcmlwdCwga2V5cywgYXJndiB9ID0gd29ya2VyRGF0YTtcbmNvbnN0IGVuZ2luZSA9IGF3YWl0IG5ldyBMdWFGYWN0b3J5KCkuY3JlYXRlRW5naW5lKHsgb3BlblN0YW5kYXJkTGliczogdHJ1ZSB9KTtcblxudHJ5IHtcbiAgZW5naW5lPy5nbG9iYWw/LnNldCgnS0VZUycsIGtleXMpO1xuICBlbmdpbmU/Lmdsb2JhbD8uc2V0KCdBUkdWJywgYXJndik7XG5cbiAgZW5naW5lPy5nbG9iYWw/LnNldCgncmVkaXMnLCB7XG4gICAgY2FsbCguLi5hbGwpIHtcbiAgICAgIGNvbnN0IFtjbWQsIC4uLmFyZ3NdID0gYWxsO1xuICAgICAgLy8gWEFERCAoUmVkaXMgU3RyZWFtcykgaXMgbm90IHN1cHBvcnRlZCBieSBQRElNIOKAlCBzaWxlbnRseSBkcm9wIGl0LlxuICAgICAgLy8gQnVsbE1RIHVzZXMgWEFERCBvbmx5IGZvciBvcHRpb25hbCBldmVudCBsaXN0ZW5lcnM7IGRyb3BwaW5nIGl0IGlzXG4gICAgICAvLyBzYWZlIGFuZCBwcmV2ZW50cyBldmVyeSBxdWV1ZT8uYWRkKCkgZnJvbSBmYWlsaW5nIHdpdGggYW4gZXJyb3IuXG4gICAgICBpZiAoU3RyaW5nKGNtZCkudG9VcHBlckNhc2UoKSA9PT0gJ1hBREQnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgY29uc3QgciA9IHN5bmNSZWRpc0NhbGwoU3RyaW5nKGNtZCksIGFyZ3M/Lm1hcChhID0+IChhID09IG51bGwgPyAnJyA6IFN0cmluZyhhKSkpKTtcbiAgICAgIHJldHVybiByID09PSBudWxsID8gdW5kZWZpbmVkIDogcjsgLy8gUmVkaXMgbmlsIOKGkiBMdWEgbmlsXG4gICAgfSxcbiAgICBwY2FsbCguLi5hbGwpIHtcbiAgICAgIGNvbnN0IFtjbWQsIC4uLmFyZ3NdID0gYWxsO1xuICAgICAgaWYgKFN0cmluZyhjbWQpLnRvVXBwZXJDYXNlKCkgPT09ICdYQUREJykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHIgPSBzeW5jUmVkaXNDYWxsKFN0cmluZyhjbWQpLCBhcmdzPy5tYXAoYSA9PiAoYSA9PSBudWxsID8gJycgOiBTdHJpbmcoYSkpKSk7XG4gICAgICAgIHJldHVybiByID09PSBudWxsID8gdW5kZWZpbmVkIDogcjsgLy8gUmVkaXMgbmlsIOKGkiBMdWEgbmlsXG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyOiBlLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGVuZ2luZT8uZ2xvYmFsPy5zZXQoJ2Ntc2dwYWNrJywgbWFrZUNtc2dwYWNrKCkpO1xuICBlbmdpbmU/Lmdsb2JhbD8uc2V0KCdjanNvbicsIHtcbiAgICBkZWNvZGUocykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdiA9IEpTT04ucGFyc2Uocyk7XG4gICAgICAgIC8vIG51bGwg4oaSIHVuZGVmaW5lZCAoTHVhIG5pbCkgdG8gYXZvaWQgd2FzbW9vbiAudGhlbiBwcm9iZSBvbiBudWxsXG4gICAgICAgIHJldHVybiB2ID09PSBudWxsID8gdW5kZWZpbmVkIDogdjtcbiAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9XG4gICAgfSxcbiAgICBlbmNvZGUodikgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7IH1cbiAgfSk7XG5cbiAgLy8gTHVhIDUuMSBjb21wYXQ6IHVucGFjaygpIHdhcyBtb3ZlZCB0byB0YWJsZT8udW5wYWNrKCkgaW4gTHVhIDUuMitcbiAgY29uc3QgZnVsbFNjcmlwdCA9ICd1bnBhY2sgPSB0YWJsZS51bnBhY2tcXFxcbicgKyBzY3JpcHQ7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZT8uZG9TdHJpbmcoZnVsbFNjcmlwdCk7XG4gIHBhcmVudFBvcnQ/LnBvc3RNZXNzYWdlKHsgdHlwZTogJ3Jlc3VsdCcsIHJlc3VsdCB9KTtcbn0gY2F0Y2goZSkge1xuICBwYXJlbnRQb3J0Py5wb3N0TWVzc2FnZSh7IHR5cGU6ICdlcnJvcicsIGVycm9yOiBlLm1lc3NhZ2UgfSk7XG59IGZpbmFsbHkge1xuICBlbmdpbmU/Lmdsb2JhbD8uY2xvc2UoKTtcbn1cbmA7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleGVjTHVhVmlhUGRpbShcbiAgcGRpbUV4ZWM6IChhcmdzOiBzdHJpbmdbXSkgPT4gUHJvbWlzZTx1bmtub3duPixcbiAgc2NyaXB0OiBzdHJpbmcsXG4gIG51bUtleXM6IG51bWJlcixcbiAgYWxsQXJnczogdW5rbm93bltdLFxuKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIGNvbnN0IGtleXMgPSBhbGxBcmdzPy5zbGljZSgwLCBudW1LZXlzKS5tYXAoU3RyaW5nKTtcblxuICBjb25zdCBhcmd2ID0gYWxsQXJncz8uc2xpY2UobnVtS2V5cykubWFwKChhcmcpID0+IHtcbiAgICBpZiAoYXJnIGluc3RhbmNlb2YgQnVmZmVyIHx8IGFyZyBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBfbXNnVW5wYWNrZXI/LnVucGFjayhhcmcpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBCdWZmZXI/LmZyb20oYXJnKS50b1N0cmluZyhcImJpbmFyeVwiKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGFyZyA9PT0gbnVsbCB8fCBhcmcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIFwiXCI7XG4gICAgcmV0dXJuIHR5cGVvZiBhcmcgPT09IFwic3RyaW5nXCIgPyBhcmcgOiBTdHJpbmcoYXJnKTtcbiAgfSk7XG5cbiAgLy8g4pSA4pSAIFByZS1mbGlnaHQgUERJTSBoZWFsdGggdGhyb3R0bGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIC8vIFdoZW4gUERJTSBoYXMgYmVlbiByZXR1cm5pbmcgNXh4IGVycm9ycyBvbiByZWNlbnQgTHVhIHNjcmlwdHMsIGV2ZXJ5IG5ld1xuICAvLyBjYWxsZXIgd2FpdHMgdGhlIGNvbXB1dGVkIGJhY2tvZmYgQkVGT1JFIGVudGVyaW5nIHRoZSBzbG90IHF1ZXVlLiAgVGhpcyBpc1xuICAvLyB0aGUgb25seSByZWxpYWJsZSBwbGFjZSB0byB0aHJvdHRsZSBCdWxsTVEncyByZXRyeSByYXRlOlxuICAvL1xuICAvLyAgIOKAoiBUaGUgJ2Vycm9yJyBtZXNzYWdlIGhhbmRsZXIgZmlyZXMgYWZ0ZXIgd29ya2VyLm9uKCdleGl0JyksIHNvIGFueSBzbGVlcFxuICAvLyAgICAgdGhlcmUgaXMgYnlwYXNzZWQgYnkgdGhlIGV4aXQgaGFuZGxlciBzZXR0bGluZyBmaXJzdC5cbiAgLy8gICDigKIgQSBwcmUtZmxpZ2h0IGF3YWl0IHJ1bnMgYmVmb3JlIHRoZSBzbG90IGlzIGFjcXVpcmVkLCBzbyBBTEwgcXVldWVkXG4gIC8vICAgICBjYWxsZXJzIChCdWxsTVEgcG9sbGVycykgbXVzdCB3YWl0IOKAlCByZXRyeSByYXRlIGRyb3BzIHByb3BvcnRpb25hbGx5LlxuICAvL1xuICAvLyBCYWNrb2ZmIHNjaGVkdWxlIChjb25zZWN1dGl2ZSBlcnJvcnMg4oaSIHdhaXQpOlxuICAvLyAgIDAtMSBlcnJvcnMg4oaSIDBtcyAgICAgKG5vIGRlbGF5IOKAlCBmaXJzdCBmYWlsdXJlIGlzIGFsbG93ZWQgaW1tZWRpYXRlbHkpXG4gIC8vICAgMiBlcnJvcnMgICDihpIgNTAwbXNcbiAgLy8gICAzIGVycm9ycyAgIOKGkiAxMDAwbXNcbiAgLy8gICA0IGVycm9ycyAgIOKGkiAyMDAwbXNcbiAgLy8gICA1KyBlcnJvcnMgIOKGkiBjYXAgKDgwMDBtcykgIOKGkiB+MC41IHJldHJpZXMvcyBmb3IgNCB3b3JrZXJzIGNvbWJpbmVkXG4gIGlmIChfbHVhQ29uc2VjdXRpdmVQZGltRXJyb3JzID49IDIpIHtcbiAgICBjb25zdCBwcmVmbGlnaHRXYWl0TXMgPSBfbHVhQ29tcHV0ZUJhY2tvZmYoKTtcbiAgICBpZiAocHJlZmxpZ2h0V2FpdE1zID4gMCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgW0x1YUV4ZWN1dG9yXSBwcmUtZmxpZ2h0IGJhY2tvZmYgJHtwcmVmbGlnaHRXYWl0TXN9bXMgKCR7X2x1YUNvbnNlY3V0aXZlUGRpbUVycm9yc30gY29uc2VjdXRpdmUgUERJTSBlcnJvcnMpYCxcbiAgICAgICk7XG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocikgPT4gc2V0VGltZW91dChyLCBwcmVmbGlnaHRXYWl0TXMpKTtcbiAgICB9XG4gIH1cblxuICAvLyBTa2lwIFdvcmtlciBzcGF3biBlbnRpcmVseSB3aGVuIFBESU0gaXMga25vd24gdG8gYmUgZG93bi5cbiAgLy8gVGhlIGNpcmN1aXQgYnJlYWtlciB0cmlwcyBhZnRlciA1IGNvbnNlY3V0aXZlIGZhaWx1cmVzIGFuZCBiYWNrcyBvZmYuXG4gIC8vIFRoaXMgcHJldmVudHMgd2FzbW9vbiBXQVNNIFdvcmtlcnMgZnJvbSBhY2N1bXVsYXRpbmcgYW5kIGNhdXNpbmcgYSBzZWdmYXVsdC5cbiAgLy9cbiAgLy8gSU1QT1JUQU5UOiBSZXR1cm4gYW4gZW1wdHkgYXJyYXkgKFtdKSBpbnN0ZWFkIG9mIHJlamVjdGluZyDigJQgdGhpcyBtYWtlc1xuICAvLyBCdWxsTVEgdHJlYXQgdGhlIGNhbGwgYXMgXCJubyBqb2IgYXZhaWxhYmxlXCIgKGpvYkRhdGEgPSBudWxsIGlzIGZhbHN5KSBhbmRcbiAgLy8gZ28gYmFjayB0byBwb2xsaW5nIGFmdGVyIG91ciBiYWNrb2ZmIHNsZWVwLiAgUmVqZWN0aW5nIHRyaWdnZXJzXG4gIC8vIEV2ZW50RW1pdHRlci5lbWl0KCdlcnJvcicsIC4uLikgaW5zaWRlIEJ1bGxNUSdzIHJldHJ5SWZGYWlsZWQvY2hlY2tDb25uZWN0aW9uRXJyb3IsXG4gIC8vIHdoaWNoIGVzY2FwZXMgdG8gc3RkZXJyIGFzIHJhdyBFcnJvcjogc3RhY2sgdHJhY2VzIHJlZ2FyZGxlc3Mgb2Ygb3VyXG4gIC8vIHByb2Nlc3MtbGV2ZWwgdW5oYW5kbGVkUmVqZWN0aW9uIGhhbmRsZXJzLlxuICBpZiAoY2JJc09wZW4oKSkge1xuICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyKSA9PiBzZXRUaW1lb3V0KHIsIENJUkNVSVRfT1BFTl9CQUNLT0ZGX01TKSk7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgLy8gQWNxdWlyZSBhIFdvcmtlciBzbG90IOKAlCBxdWV1ZXMgdGhlIGNhbGxlciAodXAgdG8gTUFYX1dBSVRfTVMpIHJhdGhlciB0aGFuXG4gIC8vIHJlamVjdGluZyBpbW1lZGlhdGVseS4gIFRoaXMgcHJldmVudHMgQnVsbE1RIGZyb20gcHJvZHVjaW5nIGEgcmV0cnkgc3Rvcm0uXG4gIGF3YWl0IF9hY3F1aXJlV29ya2VyU2xvdCgpO1xuXG4gIC8vIFJlLWNoZWNrIGNpcmN1aXQgQUZURVIgYWNxdWlyaW5nIHRoZSBzbG90LiAgSWYgdGhlIGNpcmN1aXQgb3BlbmVkIHdoaWxlXG4gIC8vIHRoaXMgY2FsbGVyIHdhcyBxdWV1ZWQsIHNsZWVwIHRoZW4gcmVsZWFzZSBzbyB0aGUgd2FpdC1xdWV1ZSBkcmFpbiBpc1xuICAvLyB0aHJvdHRsZWQgKOKJpCA2IHJlamVjdHMgcGVyIENJUkNVSVRfT1BFTl9CQUNLT0ZGX01TKSBpbnN0ZWFkIG9mIGNhc2NhZGluZ1xuICAvLyBpbnN0YW50bHkgYW5kIHNhdHVyYXRpbmcgdGhlIGV2ZW50IGxvb3AuXG4gIGlmIChjYklzT3BlbigpKSB7XG4gICAgLy8gU2xlZXAgQkVGT1JFIHJlbGVhc2luZyB0aGUgc2xvdCBzbyB0aGUgZHJhaW4gY2FzY2FkZSBpcyB0aHJvdHRsZWQg4oCUXG4gICAgLy8gdGhlIG5leHQgd2FpdGVyIHdvbid0IGdldCB0aGUgc2xvdCB1bnRpbCB0aGlzIHNsZWVwIGV4cGlyZXMuXG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHIpID0+IHNldFRpbWVvdXQociwgQ0lSQ1VJVF9PUEVOX0JBQ0tPRkZfTVMpKTtcbiAgICBfcmVsZWFzZVdvcmtlclNsb3QoKTtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICAvLyDilIDilIAgVW5oYW5kbGVkLXJlamVjdGlvbiBndWFyZCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgLy8gTm9kZS5qcydzIGludGVybmFsIHdvcmtlci10aHJlYWQgTWVzc2FnZVBvcnQgbWFjaGluZXJ5IHdyaXRlcyB0aGUgcmF3XG4gIC8vIFwiRXJyb3I6IEVycm9yOiBFUlIgUERJTSBIVFRQIDV4eFwiIGJsb2NrIHRvIHN0ZGVyciB1c2luZyBhIEMrKyBmYXN0LXBhdGhcbiAgLy8gdGhhdCBmaXJlcyBCRUZPUkUgSmF2YVNjcmlwdC1sZXZlbCB1bmhhbmRsZWRSZWplY3Rpb24gLyB1bmNhdWdodEV4Y2VwdGlvblxuICAvLyBoYW5kbGVycyBydW4sIGFuZCBCRUZPUkUgb3VyIHByb2Nlc3Muc3RkZXJyLndyaXRlIGludGVyY2VwdG9yIGNhbiBzdXBwcmVzc1xuICAvLyBpdC4gIFRoZSB0cmlnZ2VyIGlzIGEgYnJpZWYgd2luZG93IGJldHdlZW4gdGhlIG1vbWVudCByZWplY3QoKSBpcyBjYWxsZWRcbiAgLy8gaW5zaWRlIHRoZSAnbWVzc2FnZScgZXZlbnQgaGFuZGxlciBhbmQgdGhlIG1vbWVudCBCdWxsTVEncyBqb2ItcHJvY2Vzc29yXG4gIC8vIGBhd2FpdGAgcmVnaXN0ZXJzIGl0cyBvd24gLmNhdGNoKCkuXG4gIC8vXG4gIC8vIEZpeDogY2FwdHVyZSB0aGUgUHJvbWlzZSwgYXR0YWNoIGEgc2lsZW50IG5vLW9wIC5jYXRjaCgpIGltbWVkaWF0ZWx5LCB0aGVuXG4gIC8vIHJldHVybiBpdC4gIE5vZGUuanMgc2VlcyBhdCBsZWFzdCBvbmUgcmVqZWN0aW9uIGhhbmRsZXIgYXR0YWNoZWQgYmVmb3JlIHRoZVxuICAvLyBtaWNyb3Rhc2sgcXVldWUgZHJhaW5zLCBzbyBpdCBuZXZlciBtYXJrcyB0aGUgUHJvbWlzZSBcInVuaGFuZGxlZFwiIGFuZCBuZXZlclxuICAvLyBpbnZva2VzIHRoZSBzdGRlcnIgZmFzdC1wYXRoLiAgQnVsbE1RJ3Mgb3duIGBhd2FpdGAgc3RpbGwgcmVjZWl2ZXMgdGhlXG4gIC8vIHJlamVjdGlvbiBiZWNhdXNlIGRpcmVjdCBgYXdhaXRgIHVzZXMgdGhlIFByb21pc2UncyBpbnRlcm5hbCBzdGF0ZSBkaXJlY3RseSxcbiAgLy8gbm90IHRoZSBkZXJpdmVkIFByb21pc2UgY3JlYXRlZCBieSAuY2F0Y2goKS5cbiAgY29uc3QgX2V4ZWNQcm9taXNlID0gbmV3IFByb21pc2U8dW5rbm93bltdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcbiAgICAvLyBHdWFyZHMgYWdhaW5zdCBkb3VibGUtY291bnRpbmcgdGhlIHNhbWUgZmFpbHVyZSBpbiBib3RoIHRoZSAnZXJyb3InIG1lc3NhZ2VcbiAgICAvLyBoYW5kbGVyIGFuZCB0aGUgZXhpdCBoYW5kbGVyIOKAlCBib3RoIGNhbiBvYnNlcnZlIHRoZSBzYW1lIGV4ZWN1dGlvbiBmYWlsdXJlLlxuICAgIGxldCBwZGltNXh4Q291bnRlZCA9IGZhbHNlO1xuXG4gICAgY29uc3Qgc2V0dGxlID0gKGZuOiAoKSA9PiB2b2lkKSA9PiB7XG4gICAgICBpZiAoIXNldHRsZWQpIHtcbiAgICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICAgIF9yZWxlYXNlV29ya2VyU2xvdCgpO1xuICAgICAgICBmbigpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCB3b3JrZXIgPSBuZXcgV29ya2VyKFdPUktFUl9DT0RFLCB7XG4gICAgICBldmFsOiB0cnVlLFxuICAgICAgd29ya2VyRGF0YTogeyBzY3JpcHQsIGtleXMsIGFyZ3YgfSxcbiAgICB9KTtcblxuICAgIC8vIFdhdGNoZG9nOiBsb2dzIGEgd2FybmluZyBldmVyeSA2MHMgaWYgYSBzY3JpcHQgaXMgc3RpbGwgcnVubmluZy5cbiAgICAvLyBIYXJkLWtpbGxzIHRoZSBXb3JrZXIgYWZ0ZXIgU0NSSVBUX0hBUkRfS0lMTF9NUyBhcyBhIGxhc3QgcmVzb3J0LlxuICAgIC8vXG4gICAgLy8gV2h5IDkwcyAocmVkdWNlZCBmcm9tIDMwMHMpOlxuICAgIC8vICAgQnVsbE1RIHNjcmlwdHMgbWFrZSB+MzUgc2VxdWVudGlhbCByZWRpcy5jYWxsKClzLiAgQXQgd29yc3QtY2FzZSBSVFRcbiAgICAvLyAgICg4MDBtcykgdGhhdCBpcyAzNSDDlyA4MTBtcyDiiYggMjhzLiAgOTBzIGdpdmVzIDPDlyBoZWFkcm9vbS5cbiAgICAvLyAgIFRoZSBBdG9taWNzLndhaXQgdGltZW91dCAoNjBzKSBub3cgc2VsZi10ZXJtaW5hdGVzIHRoZSB3b3JrZXIgYmVmb3JlXG4gICAgLy8gICB0aGlzIHdhdGNoZG9nIGZpcmVzIGluIG1vc3QgY29uZ2VzdGlvbiBjYXNlcywgc28gMzAwcyB3YXMgbWFza2luZyB0aGVcbiAgICAvLyAgIGlzc3VlIGFuZCBob2xkaW5nIHNlbWFwaG9yZSBzbG90cyBmb3IgNcOXIGxvbmdlciB0aGFuIG5lY2Vzc2FyeS5cbiAgICBjb25zdCBTQ1JJUFRfSEFSRF9LSUxMX01TID0gOTBfMDAwOyAvLyA5MCBzICgzw5cgd29yc3QtY2FzZSBzY3JpcHQgcnVudGltZSlcbiAgICBjb25zdCBfc2NyaXB0U3RhcnQgPSBEYXRlLm5vdygpO1xuICAgIC8vIFdhdGNoZG9nIHRpY2sgY291bnRlciDigJQgZmlyZXMgZXZlcnkgMzBzLlxuICAgIC8vIFdpdGggYSA5MHMgaGFyZC1raWxsLCB0aWNrcyAxLTMgKDMwcywgNjBzLCA5MHMpIGFyZSBhbGwgcmVsZXZhbnQ6XG4gICAgLy8gICBUaWNrIDEgKDMwcyk6IGVhcmx5IHN0YWxsIHdhcm5pbmcg4oCUIHNjcmlwdCB0YWtpbmcgbG9uZ2VyIHRoYW4gZXhwZWN0ZWRcbiAgICAvLyAgIFRpY2sgMiAoNjBzKTogc3VzdGFpbmVkIHN0YWxsIOKAlCBBdG9taWNzLndhaXQgcHJvYmFibHkgYmxvY2tlZFxuICAgIC8vICAgVGljayAzICg5MHMpOiBoYXJkLWtpbGwgZmlyZXMg4oaSIHNsb3QgcmVsZWFzZWRcbiAgICAvLyBEdXJpbmcgaGVhdnkgUERJTSBiYWNrLXByZXNzdXJlIHRob3VzYW5kcyBvZiBzY3JpcHRzIG1heSBzdGFsbDsgdGhlXG4gICAgLy8gZGVwdGggY2hlY2sgYmVsb3cgZGVtb3RlcyB0aG9zZSB0byBkZWJ1ZyB0byBhdm9pZCBsb2cgYXZhbGFuY2hlLlxuICAgIGxldCBfd2F0Y2hkb2dUaWNrID0gMDtcbiAgICAvLyBHdWFyZCBhZ2FpbnN0IHRoZSByYWNlIHdoZXJlIGNsZWFySW50ZXJ2YWwoKSBpcyBjYWxsZWQgYnV0IHRoZSBpbnRlcnZhbFxuICAgIC8vIGNhbGxiYWNrIHdhcyBhbHJlYWR5IHF1ZXVlZCBpbiB0aGUgY3VycmVudCBldmVudC1sb29wIGJhdGNoLiAgV2l0aG91dFxuICAgIC8vIHRoaXMgZmxhZyB0aGUgY2FsbGJhY2sgY2FuIGZpcmUgd2l0aCBhY3RpdmU9MCAvIHF1ZXVlZD0wIGV2ZW4gdGhvdWdoXG4gICAgLy8gdGhlIHNjcmlwdCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5LCBwcm9kdWNpbmcgYSBmYWxzZS1wb3NpdGl2ZSBXQVJOLlxuICAgIGxldCBfd2F0Y2hkb2dDYW5jZWxsZWQgPSBmYWxzZTtcbiAgICBjb25zdCB3YXRjaGRvZyA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChfd2F0Y2hkb2dDYW5jZWxsZWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGVsYXBzZWRNcyA9IERhdGUubm93KCkgLSBfc2NyaXB0U3RhcnQ7XG4gICAgICBjb25zdCBlbGFwc2VkUyA9IE1hdGgucm91bmQoZWxhcHNlZE1zIC8gMTAwMCk7XG4gICAgICBfd2F0Y2hkb2dUaWNrKys7XG4gICAgICBpZiAoZWxhcHNlZE1zID49IFNDUklQVF9IQVJEX0tJTExfTVMpIHtcbiAgICAgICAgLy8g4pSA4pSAIEZhbHNlLXBvc2l0aXZlIGd1YXJkIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgICAgICAvLyBXaGVuIFBsYXRmb3JtQXV0b0ZpeGVyIGNhbGxzIHJlc2V0THVhRXhlY3V0b3JTZW1hcGhvcmUoKSBpdCB6ZXJvZXNcbiAgICAgICAgLy8gX2FjdGl2ZVdvcmtlcnMgZXh0ZXJuYWxseSB3aGlsZSB0aGlzIHdhdGNoZG9nIGlzIHN0aWxsIGFybWVkLiAgQnkgdGhlXG4gICAgICAgIC8vIHRpbWUgdGhlIDkwIHMgaGFyZC1raWxsIHRpY2sgZmlyZXMgdGhlIHNlbWFwaG9yZSBoYXMgYWxyZWFkeSBiZWVuXG4gICAgICAgIC8vIHJlbGVhc2VkOyBsb2dnaW5nIGFuIEVSUk9SIGFuZCBjYWxsaW5nIHdvcmtlci50ZXJtaW5hdGUoKSBpcyBhXG4gICAgICAgIC8vIGZhbHNlLXBvc2l0aXZlIHRoYXQgY2FuIGludGVyZmVyZSB3aXRoIHRoZSBhbHJlYWR5LWNsZWFuIHN0YXRlLlxuICAgICAgICAvLyBEZW1vdGUgdG8gZGVidWcgYW5kIHNraXAgdGVybWluYXRlKCkg4oCUIHRoZSBzbG90IGlzIGFscmVhZHkgZnJlZS5cbiAgICAgICAgaWYgKF9hY3RpdmVXb3JrZXJzID09PSAwICYmIF93YWl0UXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgYFtMdWFFeGVjdXRvcl0gd2F0Y2hkb2cgOTBzIHRpY2sg4oCUIHNlbWFwaG9yZSBhbHJlYWR5IGV4dGVybmFsbHkgcmVzZXQgYCArXG4gICAgICAgICAgICAgIGAoZWxhcHNlZCAke2VsYXBzZWRTfXMpOyBza2lwcGluZyBoYXJkLWtpbGxgLFxuICAgICAgICAgICk7XG4gICAgICAgICAgX3dhdGNoZG9nQ2FuY2VsbGVkID0gdHJ1ZTtcbiAgICAgICAgICBjbGVhckludGVydmFsKHdhdGNoZG9nKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBbTHVhRXhlY3V0b3JdIHNjcmlwdCBoYXJkLWtpbGxlZCBhZnRlciAke2VsYXBzZWRTfXMgYCArXG4gICAgICAgICAgICBgKGFjdGl2ZT0ke19hY3RpdmVXb3JrZXJzfSwgcXVldWVkPSR7X3dhaXRRdWV1ZS5sZW5ndGh9KSDigJQgYCArXG4gICAgICAgICAgICBgQXRvbWljcy53YWl0IHN0YWxsIGRldGVjdGVkOyByZWxlYXNpbmcgc2VtYXBob3JlIHNsb3RgLFxuICAgICAgICApO1xuICAgICAgICBfd2F0Y2hkb2dDYW5jZWxsZWQgPSB0cnVlO1xuICAgICAgICBjbGVhckludGVydmFsKHdhdGNoZG9nKTtcbiAgICAgICAgc2V0dGxlKCgpID0+IHtcbiAgICAgICAgICB3b3JrZXIudGVybWluYXRlKCk7XG4gICAgICAgICAgX2x1YUNvbnNlY3V0aXZlUGRpbUVycm9ycysrO1xuICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgYFtMdWFFeGVjdXRvcl0gd29ya2VyIGhhcmQta2lsbGVkIGFmdGVyICR7ZWxhcHNlZFN9cyAoc3R1Y2sgc2NyaXB0IHRpbWVvdXQpYCxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBBbHdheXMgbG9nIHRpY2tzIDEtMiAoMzBzLCA2MHMpOyB0aGV5IHByZWNlZGUgdGhlIDkwcyBoYXJkLWtpbGwuXG4gICAgICAgIC8vIFdoZW4gUERJTSBpcyBoZWF2aWx5IGNvbmdlc3RlZCwgc2NyaXB0cyBzdGFsbCBleHBlY3RlZGx5IOKAlCBkZW1vdGUgdG9cbiAgICAgICAgLy8gZGVidWcgaW4gdGhhdCBjYXNlIHRvIGF2b2lkIGFtcGxpZnlpbmcgdGhlIGNvbmdlc3Rpb24gbm9pc2UuXG4gICAgICAgIGNvbnN0IHNob3VsZExvZyA9IF93YXRjaGRvZ1RpY2sgPD0gMjtcbiAgICAgICAgaWYgKCFzaG91bGRMb2cpIHJldHVybjtcbiAgICAgICAgLy8gV2hlbiB0aGUgQ2hhaW5GaXhlciBjYWxscyByZXNldEx1YUV4ZWN1dG9yU2VtYXBob3JlKCkgaXQgemVyb2VzXG4gICAgICAgIC8vIF9hY3RpdmVXb3JrZXJzIGV4dGVybmFsbHkgd2hpbGUgdGhpcyB3b3JrZXIgaXMgc3RpbGwgcnVubmluZy4gIFRoZVxuICAgICAgICAvLyB3YXRjaGRvZyBzdGlsbCBmaXJlcyAoY29ycmVjdGx5IOKAlCBzY3JpcHQgaXMgdW5zZXR0bGVkKSwgYnV0IHJlYWRpbmdcbiAgICAgICAgLy8gYWN0aXZlPTAgLyBxdWV1ZWQ9MCBpcyBtaXNsZWFkaW5nOiBpdCBsb29rcyBsaWtlIGEgcGhhbnRvbSBXQVJOXG4gICAgICAgIC8vIHJhdGhlciB0aGFuIGEgcmVhbCBzdGFsbC4gIERlbW90ZSB0byBkZWJ1ZyBpbiB0aGF0IGNhc2Ugc28gdGhlIGxvZ1xuICAgICAgICAvLyBzdHJlYW0gb25seSBzaG93cyBnZW51aW5lIG92ZXItdGltZSBzY3JpcHRzIChhY3RpdmUg4omlIDEpLlxuICAgICAgICBpZiAoX2FjdGl2ZVdvcmtlcnMgPT09IDAgJiYgX3dhaXRRdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICBgW0x1YUV4ZWN1dG9yXSBzY3JpcHQgc3RpbGwgcnVubmluZyBhZnRlciAke2VsYXBzZWRTfXMg4oCUIGAgK1xuICAgICAgICAgICAgICBgc2VtYXBob3JlIHdhcyBleHRlcm5hbGx5IHJlc2V0IChhY3RpdmUgY291bnRlciB6ZXJvZWQgYnkgQ2hhaW5GaXhlcilgLFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIER1cmluZyBCdWxsTVEgcmVwZWF0YWJsZS1qb2IgcmVnaXN0cmF0aW9uIGVhY2ggdXBzZXJ0Sm9iU2NoZWR1bGVyXG4gICAgICAgIC8vIGNhbGwgbGVnaXRpbWF0ZWx5IGhvbGRzIHRoZSBzbG90IGZvciB+NTAgcyB1bmRlciBib290IGJhY2stcHJlc3N1cmUuXG4gICAgICAgIC8vIERlbW90ZSB0aGUgd2F0Y2hkb2cgdGljayB0byBkZWJ1ZyBzbyBpdCBkb2Vzbid0IHByb2R1Y2UgYSBmYWxzZSBXQVJOXG4gICAgICAgIC8vIGNhc2NhZGUgZm9yIGV2ZXJ5IGpvYiBpbiB0aGUgcmVnaXN0cmF0aW9uIGZvci1sb29wLlxuICAgICAgICBpZiAoX2x1YVJlZ2lzdHJhdGlvbk1vZGUpIHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICBgW0x1YUV4ZWN1dG9yXSBzY3JpcHQgc3RpbGwgcnVubmluZyBhZnRlciAke2VsYXBzZWRTfXMg4oCUIGAgK1xuICAgICAgICAgICAgICBgcmVnaXN0cmF0aW9uIGluIHByb2dyZXNzIChhY3RpdmU9JHtfYWN0aXZlV29ya2Vyc30sIHF1ZXVlZD0ke193YWl0UXVldWU/Lmxlbmd0aH0pYCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEdXJpbmcgdGhlIGZpcnN0IDEyMHMgb2YgYm9vdCB0aGUgUERJTSBzZXR0bGluZyBidXJzdCBjYXVzZXNcbiAgICAgICAgLy8gTHVhRXhlY3V0b3Igc3RhbGxzIHRoYXQgbG9vayBhbGFybWluZyBidXQgYXJlIGVudGlyZWx5IGV4cGVjdGVkLlxuICAgICAgICAvLyBEZW1vdGUgdG8gZGVidWcgc28gdGhlIGxvZyBzdHJlYW0gc3RheXMgY2xlYW4gZHVyaW5nIGJvb3QuXG4gICAgICAgIGlmIChEYXRlLm5vdygpIC0gX2V4ZWN1dG9yQm9vdFRzIDwgMTIwXzAwMCkge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgIGBbTHVhRXhlY3V0b3JdIHNjcmlwdCBzdGlsbCBydW5uaW5nIGFmdGVyICR7ZWxhcHNlZFN9cyDigJQgYCArXG4gICAgICAgICAgICAgIGBib290IHNldHRsaW5nIHdpbmRvdyAoYWN0aXZlPSR7X2FjdGl2ZVdvcmtlcnN9LCBxdWV1ZWQ9JHtfd2FpdFF1ZXVlPy5sZW5ndGh9KWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGdldFBkaW1RdWV1ZURlcHRoIH0gPSBhd2FpdCBpbXBvcnQoXCIuL3BkaW1DbGllbnQuanNcIik7XG4gICAgICAgICAgY29uc3QgZGVwdGggPSBnZXRQZGltUXVldWVEZXB0aCgpO1xuICAgICAgICAgIGlmIChkZXB0aCA+IDEwMCkge1xuICAgICAgICAgICAgLy8gSHVuZHJlZHMgb2YgY2FsbGVycyBxdWV1ZWQ6IHN0YWxsIGlzIGR1ZSB0byBQRElNIGJhY2stcHJlc3N1cmUsXG4gICAgICAgICAgICAvLyBub3QgYSBXQVNNL0x1YSBidWcuICBMb2cgYXQgZGVidWcgdG8gYXZvaWQgbG9nIGF2YWxhbmNoZS5cbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgICAgYFtMdWFFeGVjdXRvcl0gc2NyaXB0IHBhdXNlZCAke2VsYXBzZWRTfXMg4oCUIFBESU0gYmFjay1wcmVzc3VyZSBgICtcbiAgICAgICAgICAgICAgICBgKCR7ZGVwdGh9IHF1ZXVlZCwgYWN0aXZlPSR7X2FjdGl2ZVdvcmtlcnN9KWAsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLyogcGRpbUNsaWVudCBub3QgeWV0IGxvYWRlZCDigJQgZmFsbCB0aHJvdWdoIHRvIHdhcm4gKi9cbiAgICAgICAgfVxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgW0x1YUV4ZWN1dG9yXSBzY3JpcHQgc3RpbGwgcnVubmluZyBhZnRlciAke2VsYXBzZWRTfXMg4oCUIGAgK1xuICAgICAgICAgICAgYGFjdGl2ZT0ke19hY3RpdmVXb3JrZXJzfSwgcXVldWVkPSR7X3dhaXRRdWV1ZT8ubGVuZ3RofWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSwgMzBfMDAwKTtcblxuICAgIHdvcmtlcj8ub24oXCJtZXNzYWdlXCIsIGFzeW5jIChtc2c6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gICAgICBpZiAobXNnPy50eXBlID09PSBcInJlZGlzXCIpIHtcbiAgICAgICAgbGV0IHBheWxvYWQ6IHN0cmluZztcbiAgICAgICAgbGV0IHN0YXR1czogMSB8IDI7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHI6IHVua25vd24gPSBcIk9LXCI7XG4gICAgICAgICAgY29uc3QgY21kID0gKG1zZz8uY21kIGFzIHN0cmluZykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICBpZiAoY21kID09PSBcIkhNU0VUXCIpIHtcbiAgICAgICAgICAgIC8vIFBESU0ncyBSZWRpcyBvbmx5IGFjY2VwdHMgSFNFVCB3aXRoIG9uZSBmaWVsZC12YWx1ZSBwYWlyIGF0IGEgdGltZS5cbiAgICAgICAgICAgIC8vIFNwbGl0IFwiSE1TRVQga2V5IGYxIHYxIGYyIHYyIC4uLlwiIGludG8gc2VxdWVudGlhbCBIU0VUIGNhbGxzLlxuICAgICAgICAgICAgY29uc3QgW2tleSwgLi4ucGFpcnNdID0gbXNnLmFyZ3MgYXMgc3RyaW5nW107XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhaXJzLmxlbmd0aCAtIDE7IGkgKz0gMikge1xuICAgICAgICAgICAgICByID0gYXdhaXQgcGRpbUV4ZWMoW1wiSFNFVFwiLCBrZXksIHBhaXJzW2ldLCBwYWlyc1tpICsgMV1dKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgciA9IGF3YWl0IHBkaW1FeGVjKFttc2cuY21kLCAuLi4obXNnLmFyZ3MgYXMgc3RyaW5nW10pXSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJlYWwgUmVkaXMgcmV0dXJucyBIR0VUQUxMIChhbmQgc2ltaWxhcmx5LXNoYXBlZCBoYXNoIHJlYWRzKSBhcyBhXG4gICAgICAgICAgLy8gRkxBVCBBUlJBWSBvZiBhbHRlcm5hdGluZyBmaWVsZC92YWx1ZSBzdHJpbmdzIG92ZXIgUkVTUCDigJQgbmV2ZXIgYVxuICAgICAgICAgIC8vIGtleWVkIG9iamVjdC4gQnVsbE1RJ3MgTHVhIHNjcmlwdHMgcmVseSBvbiB0aGlzOiB0aGV5IGVpdGhlclxuICAgICAgICAgIC8vIGZvcndhcmQgdGhlIHJhdyByY2FsbChcIkhHRVRBTExcIiwgLi4uKSByZXN1bHQgdW50b3VjaGVkIHRvIHRoZVxuICAgICAgICAgIC8vIEpTIHNpZGUgKHdoaWNoIHJlYXNzZW1ibGVzIGl0IHdpdGggYXJyYXkyb2JqIOKAlCBhIGZsYXQtYXJyYXktb25seVxuICAgICAgICAgIC8vIGZvci1sb29wKSwgb3IgaXRlcmF0ZSB0aGUgZmllbGRzIHdpdGggaXBhaXJzKCkvIyBpbiBMdWEgaXRzZWxmLlxuICAgICAgICAgIC8vIE91ciBsb2NhbFBkaW1TZXJ2ZXIuZXhlYygpIHJldHVybnMgYVxuICAgICAgICAgIC8vIGtleWVkIEpTIG9iamVjdCBmb3IgSEdFVEFMTCAoY29ycmVjdC9leHBlY3RlZCBzaGFwZSBmb3IgdGhlXG4gICAgICAgICAgLy8gKmRpcmVjdCogcGRpbUNsaWVudC5oZ2V0YWxsKCkgYXBwLWNvZGUgcGF0aCksIGJ1dCB0aGF0IHNhbWVcbiAgICAgICAgICAvLyBvYmplY3Qg4oCUIHBhc3NlZCBzdHJhaWdodCB0aHJvdWdoIHRoaXMgTHVhIGJyaWRnZSDigJQgYmVjb21lcyBhXG4gICAgICAgICAgLy8gTHVhIHRhYmxlIHdpdGggU1RSSU5HIGtleXMgaW5zdGVhZCBvZiBhIDEuLk4gc2VxdWVuY2UgdGFibGUsIHNvXG4gICAgICAgICAgLy8gXCIjdGFibGVcIi9hcnJheTJvYmogc2lsZW50bHkgc2VlIGxlbmd0aCAwIGFuZCBldmVyeSBmaWVsZCAobmFtZSxcbiAgICAgICAgICAvLyByamsvcmVwZWF0Sm9iS2V5LCBvcHRzLCAuLi4pIHJlYWRzIGJhY2sgYXMgbWlzc2luZy4gVGhhdCBpcyB3aGF0XG4gICAgICAgICAgLy8gY2F1c2VkIGV2ZXJ5IHJlcGVhdGFibGUvc2NoZWR1bGVkIEJ1bGxNUSBqb2IgdG8gbG9vayBuYW1lbGVzcyBhbmRcbiAgICAgICAgICAvLyBuZXZlciByZS1hcm0gaXRzIG5leHQgaXRlcmF0aW9uLiBGbGF0dGVuIE9OTFkgb24gdGhpcyBMdWEtZmFjaW5nXG4gICAgICAgICAgLy8gYnJpZGdlIHNvIHRoZSBkaXJlY3Qgb2JqZWN0LXJldHVybmluZyBhcHAgcGF0aCBpcyB1bnRvdWNoZWQuXG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgY21kID09PSBcIkhHRVRBTExcIiAmJlxuICAgICAgICAgICAgciAmJlxuICAgICAgICAgICAgdHlwZW9mIHIgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgICAgICFBcnJheS5pc0FycmF5KHIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCBmbGF0OiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMocikpIHtcbiAgICAgICAgICAgICAgZmxhdC5wdXNoKGssIHYgPT0gbnVsbCA/IFwiXCIgOiBTdHJpbmcodikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgciA9IGZsYXQgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHIgPz8gbnVsbCk7XG4gICAgICAgICAgc3RhdHVzID0gMTsgLy8gc3VjY2Vzc1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgY29uc3Qgc2hvcnQgPSAoKGUgYXMgRXJyb3IpLm1lc3NhZ2UgYXMgc3RyaW5nKS5zbGljZSgwLCAyMDApO1xuICAgICAgICAgIC8vIDV4eCwgNDI5LCBhbmQgY2lyY3VpdC1vcGVuIGZhc3QtZmFpbHMgYXJlIGFscmVhZHkgY2FwdHVyZWQgYXRcbiAgICAgICAgICAvLyBXQVJOL0VSUk9SIGJ5IHBkaW1DbGllbnQgLyB0aGUgY2lyY3VpdCBicmVha2VyIGl0c2VsZi4gIFJlcGVhdGluZ1xuICAgICAgICAgIC8vIHRoZW0gcGVyLWNvbW1hbmQgZmxvb2RzIHRoZSBjb25zb2xlIGR1cmluZyBzdGFydHVwIGJ1cnN0cyDigJQgZGVtb3RlXG4gICAgICAgICAgLy8gYWxsIHRvIGRlYnVnIHNvIG9ubHkgdGhlIHJvb3QtY2F1c2Ugc2l0ZSBlbWl0cyB0aGUgdmlzaWJsZSB3YXJuLlxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNob3J0LmluY2x1ZGVzKFwiNDI5XCIpIHx8XG4gICAgICAgICAgICBzaG9ydC5pbmNsdWRlcyhcIjUwMFwiKSB8fFxuICAgICAgICAgICAgc2hvcnQuaW5jbHVkZXMoXCI1MDJcIikgfHxcbiAgICAgICAgICAgIHNob3J0LmluY2x1ZGVzKFwiQ2lyY3VpdCBPUEVOXCIpIHx8XG4gICAgICAgICAgICBzaG9ydC5pbmNsdWRlcyhcInRpbWVvdXRcIikgfHxcbiAgICAgICAgICAgIHNob3J0LmluY2x1ZGVzKFwiYWJvcnRlZFwiKSB8fFxuICAgICAgICAgICAgc2hvcnQuaW5jbHVkZXMoXCJUaW1lb3V0XCIpIHx8XG4gICAgICAgICAgICBzaG9ydC5pbmNsdWRlcyhcIkFib3J0XCIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICAvLyBUaW1lb3V0L2Fib3J0IGVycm9ycyBmbG9vZCB3aGVuIFBESU0gaXMgb3ZlcndoZWxtZWQg4oCUIGRlbW90ZSB0b1xuICAgICAgICAgICAgLy8gZGVidWcgc28gdGhlIHJvb3QtY2F1c2Ugc2l0ZSAocGRpbUNsaWVudCkgaXMgdGhlIG9ubHkgdmlzaWJsZSB3YXJuLlxuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTHVhRXhlY3V0b3JdIHJlZGlzLmNhbGwoJHttc2cuY21kfSkg4oaSICR7c2hvcnR9YCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKGBbTHVhRXhlY3V0b3JdIHJlZGlzLmNhbGwoJHttc2cuY21kfSkg4oaSICR7c2hvcnR9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBheWxvYWQgPSBgRVJSICR7c2hvcnR9YDtcbiAgICAgICAgICBzdGF0dXMgPSAyOyAvLyBlcnJvciDigJQgTHVhIHdpbGwgdGhyb3dcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBidWYgPSBCdWZmZXIuZnJvbShwYXlsb2FkLCBcInV0ZjhcIik7XG4gICAgICAgIGNvbnN0IHNhYiA9IG1zZy5zYWIgYXMgU2hhcmVkQXJyYXlCdWZmZXI7XG4gICAgICAgIGNvbnN0IGN0cmwgPSBuZXcgSW50MzJBcnJheShzYWIsIDAsIDEpO1xuICAgICAgICBjb25zdCBsZW4gPSBuZXcgSW50MzJBcnJheShzYWIsIDQsIDEpO1xuICAgICAgICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2FiLCA4KTtcbiAgICAgICAgYnVmLmNvcHkoQnVmZmVyLmZyb20oZGF0YS5idWZmZXIsIGRhdGEuYnl0ZU9mZnNldCwgZGF0YS5ieXRlTGVuZ3RoKSk7XG4gICAgICAgIEF0b21pY3Muc3RvcmUobGVuLCAwLCBidWYubGVuZ3RoKTtcbiAgICAgICAgQXRvbWljcy5zdG9yZShjdHJsLCAwLCBzdGF0dXMpO1xuICAgICAgICBBdG9taWNzLm5vdGlmeShjdHJsLCAwLCAxKTtcbiAgICAgIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFwicmVzdWx0XCIpIHtcbiAgICAgICAgX3dhdGNoZG9nQ2FuY2VsbGVkID0gdHJ1ZTtcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh3YXRjaGRvZyk7XG4gICAgICAgIC8vIFNjcmlwdCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5IOKAlCByZXNldCB0aGUgY29uc2VjdXRpdmUgUERJTSBlcnJvciBjb3VudGVyXG4gICAgICAgIC8vIHNvIHRoZSBuZXh0IGNhbGwgZ2V0cyBubyBwcmUtZmxpZ2h0IGRlbGF5LlxuICAgICAgICBfbHVhQ29uc2VjdXRpdmVQZGltRXJyb3JzID0gMDtcbiAgICAgICAgc2V0dGxlKCgpID0+IHtcbiAgICAgICAgICB3b3JrZXIudGVybWluYXRlKCk7XG4gICAgICAgICAgcmVzb2x2ZShtc2cucmVzdWx0IGFzIHVua25vd25bXSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgIF93YXRjaGRvZ0NhbmNlbGxlZCA9IHRydWU7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwod2F0Y2hkb2cpO1xuICAgICAgICBjb25zdCBlcnJNc2cgPSBTdHJpbmcobXNnLmVycm9yID8/IFwiXCIpO1xuICAgICAgICBjb25zdCBpc1BkaW01eHggPVxuICAgICAgICAgIGVyck1zZy5pbmNsdWRlcyhcIkhUVFAgNTAwXCIpIHx8IGVyck1zZy5pbmNsdWRlcyhcIkhUVFAgNTAyXCIpO1xuICAgICAgICBpZiAoaXNQZGltNXh4ICYmICFwZGltNXh4Q291bnRlZCkge1xuICAgICAgICAgIC8vIENvdW50IHRoaXMgZmFpbHVyZSBzbyB0aGUgTkVYVCBjYWxsJ3MgcHJlLWZsaWdodCB3YWl0IGlzIGxvbmdlci5cbiAgICAgICAgICAvLyBUaGUgcHJlLWZsaWdodCBhd2FpdCAoYWJvdmUgdGhlIHNsb3QgYWNxdWlyZSkgaXMgd2hlcmUgdGhyb3R0bGluZ1xuICAgICAgICAgIC8vIGFjdHVhbGx5IGhhcHBlbnMg4oCUIG5vIGJhY2tvZmYgc2xlZXAgbmVlZGVkIGhlcmUuXG4gICAgICAgICAgcGRpbTV4eENvdW50ZWQgPSB0cnVlO1xuICAgICAgICAgIF9sdWFDb25zZWN1dGl2ZVBkaW1FcnJvcnMrKztcbiAgICAgICAgfSBlbHNlIGlmICghaXNQZGltNXh4KSB7XG4gICAgICAgICAgX2x1YUNvbnNlY3V0aXZlUGRpbUVycm9ycyA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgc2V0dGxlKCgpID0+IHtcbiAgICAgICAgICB3b3JrZXI/LnRlcm1pbmF0ZSgpO1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoZXJyTXNnKSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgd29ya2VyPy5vbihcImVycm9yXCIsIChlcnIpID0+IHtcbiAgICAgIF93YXRjaGRvZ0NhbmNlbGxlZCA9IHRydWU7XG4gICAgICBjbGVhckludGVydmFsKHdhdGNoZG9nKTtcbiAgICAgIHNldHRsZSgoKSA9PiByZWplY3QoZXJyKSk7XG4gICAgfSk7XG5cbiAgICAvLyBHdWFyZCBhZ2FpbnN0IHdvcmtlciB0aHJlYWRzIHRoYXQgZXhpdCB3aXRob3V0IHNlbmRpbmcgYSBtZXNzYWdlXG4gICAgLy8gKGU/LmcuIFdBU00gY3Jhc2gsIE9PTSBpbnNpZGUgdGhlIHdvcmtlciwgb3IgdW5oYW5kbGVkIGV4Y2VwdGlvbiB0aGF0XG4gICAgLy8gYnlwYXNzZXMgdGhlIHRyeS9jYXRjaCkuICBXaXRob3V0IHRoaXMgaGFuZGxlciBfYWN0aXZlV29ya2VycyBuZXZlclxuICAgIC8vIGRlY3JlbWVudHMsIGRyaWZ0aW5nIGFib3ZlIE1BWF9DT05DVVJSRU5UX1dPUktFUlMgYW5kIHBlcm1hbmVudGx5XG4gICAgLy8gY29uZ2VzdGluZyB0aGUgc2VtYXBob3JlIChvYnNlcnZlZDogYWN0aXZlPTcgd2l0aCBjYXA9NikuXG4gICAgLy9cbiAgICAvLyBJTVBPUlRBTlQ6IEluIE5vZGU/LmpzLCB3b3JrZXI/Lm9uKCdleGl0Jykgb2Z0ZW4gZmlyZXMgQkVGT1JFIGEgcGVuZGluZ1xuICAgIC8vIHBvc3RNZXNzYWdlIGZyb20gdGhhdCB3b3JrZXIgaXMgcHJvY2Vzc2VkIGJ5IHdvcmtlcj8ub24oJ21lc3NhZ2UnKS4gIFRoaXNcbiAgICAvLyBtZWFucyB0aGUgJ2Vycm9yJy8ncmVzdWx0JyBtZXNzYWdlIGhhbmRsZXIgbWF5IG5vdCBoYXZlIHJ1biB5ZXQgd2hlbiBleGl0XG4gICAgLy8gZmlyZXMuICBXZSBkZWZlciBzZXR0bGVtZW50IGJ5IG9uZSBldmVudC1sb29wIGl0ZXJhdGlvbiAoc2V0SW1tZWRpYXRlKSBzb1xuICAgIC8vIHBlbmRpbmcgbWVzc2FnZXMgZ2V0IGEgY2hhbmNlIHRvIGNhbGwgc2V0dGxlKCkgZmlyc3QuICBJZiBuZWl0aGVyXG4gICAgLy8gJ3Jlc3VsdCcgbm9yICdlcnJvcicgd2FzIHJlY2VpdmVkIGJ5IHRoZW4sIHdlIHNldHRsZSBoZXJlIGFuZCBhbHNvIGNvdW50XG4gICAgLy8gdGhlIGV4aXQgYXMgYSBwb3RlbnRpYWwgUERJTSA1eHggZXJyb3IgKGNvZGU9MCBtZWFucyB0aGUgTHVhIHNjcmlwdFxuICAgIC8vIGNvbXBsZXRlZCBidXQgdGhyZXcg4oCUIGFsbW9zdCBhbHdheXMgYmVjYXVzZSByZWRpcz8uY2FsbCgpIGdvdCBhIDV4eCkuXG4gICAgd29ya2VyPy5vbihcImV4aXRcIiwgKGNvZGUpID0+IHtcbiAgICAgIF93YXRjaGRvZ0NhbmNlbGxlZCA9IHRydWU7XG4gICAgICBjbGVhckludGVydmFsKHdhdGNoZG9nKTtcbiAgICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICAgIGlmICghc2V0dGxlZCkge1xuICAgICAgICAgIC8vIE5laXRoZXIgJ3Jlc3VsdCcgbm9yICdlcnJvcicgbWVzc2FnZSB3YXMgcHJvY2Vzc2VkIGJlZm9yZSBleGl0LlxuICAgICAgICAgIC8vIEZvciBjb2RlPTAgKGNsZWFuIGV4aXQgYWZ0ZXIgYSB0aHJvdyksIHRoaXMgaXMgbW9zdCBsaWtlbHkgYSBQRElNXG4gICAgICAgICAgLy8gNXh4IHRoYXQgY2F1c2VkIEx1YSB0byByYWlzZSBhbiBlcnJvciDigJQgY291bnQgaXQgc28gdGhlIG5leHRcbiAgICAgICAgICAvLyBwcmUtZmxpZ2h0IHdhaXQgaXMgbG9uZ2VyLCB1bmxlc3MgYWxyZWFkeSBjb3VudGVkIGJ5IHRoZSBtZXNzYWdlIGhhbmRsZXIuXG4gICAgICAgICAgaWYgKGNvZGUgPT09IDAgJiYgIXBkaW01eHhDb3VudGVkKSB7XG4gICAgICAgICAgICBwZGltNXh4Q291bnRlZCA9IHRydWU7XG4gICAgICAgICAgICBfbHVhQ29uc2VjdXRpdmVQZGltRXJyb3JzKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNldHRsZSgoKSA9PlxuICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFtMdWFFeGVjdXRvcl0gd29ya2VyIGV4aXRlZCB1bmV4cGVjdGVkbHkgKGNvZGU9JHtjb2RlfSlgLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gQXR0YWNoIHRoZSBzaWxlbnQgbm8tb3AgY2F0Y2ggQkVGT1JFIHJldHVybmluZyBzbyB0aGF0IE5vZGU/LmpzJ3NcbiAgLy8gdW5oYW5kbGVkLXJlamVjdGlvbiBkZXRlY3RvciBzZWVzIGEgaGFuZGxlciBpbiBwbGFjZSBmcm9tIHRoZSBzdGFydC5cbiAgLy8gVGhpcyBpcyB0aGUga2V5IGxpbmUgdGhhdCBzdG9wcyBiYXJlIFwiRXJyb3I6IEVycm9yOiBFUlIgUERJTSBIVFRQIDV4eFwiXG4gIC8vIGJsb2NrcyBmcm9tIGFwcGVhcmluZyBpbiBzdGRlcnIvZGVwbG95bWVudCBsb2dzLlxuICBfZXhlY1Byb21pc2U/LmNhdGNoKCgpID0+IHt9KTtcbiAgcmV0dXJuIF9leGVjUHJvbWlzZTtcbn1cbiJdLCJmaWxlIjoiL3NlcnZlci9saWIvbHVhRXhlY3V0b3IudHMifQ==

}}