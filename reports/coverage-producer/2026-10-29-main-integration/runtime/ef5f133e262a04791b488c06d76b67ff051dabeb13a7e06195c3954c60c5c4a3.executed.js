'use strict';async (__vite_ssr_exports__,__vite_ssr_import_meta__,__vite_ssr_import__,__vite_ssr_dynamic_import__,__vite_ssr_exportAll__,__vite_ssr_exportName__,__filename,__dirname,module,exports,require)=>{{__vite_ssr_exportName__("setPdimGapFloor", () => { try { return setPdimGapFloor } catch {} });
__vite_ssr_exportName__("getPdimGapFloor", () => { try { return getPdimGapFloor } catch {} });
__vite_ssr_exportName__("getPdimAdaptiveGapMs", () => { try { return getPdimAdaptiveGapMs } catch {} });
__vite_ssr_exportName__("getPdimQueueDepth", () => { try { return getPdimQueueDepth } catch {} });
__vite_ssr_exportName__("getPdimDirectQueueDepth", () => { try { return getPdimDirectQueueDepth } catch {} });
__vite_ssr_exportName__("getPdimScriptQueueDepth", () => { try { return getPdimScriptQueueDepth } catch {} });
__vite_ssr_exportName__("setPdimAdaptiveGap", () => { try { return setPdimAdaptiveGap } catch {} });
__vite_ssr_exportName__("PdimRedisClient", () => { try { return PdimRedisClient } catch {} });
__vite_ssr_exportName__("getPdimClient", () => { try { return getPdimClient } catch {} });
__vite_ssr_exportName__("isPdimConfigured", () => { try { return isPdimConfigured } catch {} });
__vite_ssr_exportName__("startPdimDirectProber", () => { try { return startPdimDirectProber } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("events", {"importedNames":["EventEmitter"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("os", {"importedNames":["default"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("/server/logger.ts", {"importedNames":["logger"]});
const __vite_ssr_import_3__ = await __vite_ssr_import__("/server/config/ports.ts", {"importedNames":["loopbackUrl","runtimePorts"]});
const __vite_ssr_import_4__ = await __vite_ssr_import__("/server/lib/luaExecutor.ts", {"importedNames":["execLuaViaPdim"]});
const __vite_ssr_import_5__ = await __vite_ssr_import__("/server/lib/pdimCircuitBreaker.ts", {"importedNames":["cbAllowRequest","cbRecordFailure","cbRecordSuccess","cbHalfOpenFailed","cbForceClose","cbGetState"]});






const clusterWorkers = Math.max(
  1,
  parseInt(process.env.PDIM_CLUSTER_WORKERS ?? "1", 10)
);
const cpuCores = Math.max(1, __vite_ssr_import_1__.default?.cpus().length);
const autoMultiplier = clusterWorkers * Math.max(1, Math.ceil(cpuCores / 2));
const _PDIM_GAP_FLOOR_BASE_MS = 6;
const _PDIM_GAP_FLOOR_WORKER_MIN = Math.max(
  _PDIM_GAP_FLOOR_BASE_MS,
  clusterWorkers * _PDIM_GAP_FLOOR_BASE_MS
);
let _PDIM_GAP_FLOOR_MS = _PDIM_GAP_FLOOR_WORKER_MIN;
const _PDIM_GAP_CEIL_MS = 2e3;
const _PDIM_GAP_INIT_MS = 1;
const _PDIM_MULT_429 = 2.5;
__vite_ssr_import_2__.logger.info(
  `[PDIM] Auto multiplier: ${autoMultiplier} (clusterWorkers=${clusterWorkers} × ceil(cpuCores=${cpuCores}/2)=${Math.max(1, Math.ceil(cpuCores / 2))}) — AIMD init=1ms, floor=${_PDIM_GAP_FLOOR_MS}ms (${clusterWorkers}workers×${_PDIM_GAP_FLOOR_BASE_MS}ms, combined≤${Math.round(1e3 / _PDIM_GAP_FLOOR_BASE_MS)} req/s), ZPOPMIN gap=${Math.max(1, autoMultiplier)}ms`
);
function setPdimGapFloor(ms) {
  _PDIM_GAP_FLOOR_MS = Math.max(
    _PDIM_GAP_FLOOR_WORKER_MIN,
    Math.min(2e3, Math.round(ms))
  );
  if (_pdimGapMs < _PDIM_GAP_FLOOR_MS) _pdimGapMs = _PDIM_GAP_FLOOR_MS;
};
function getPdimGapFloor() {
  return _PDIM_GAP_FLOOR_MS;
};
const _PDIM_JITTER_INIT_MS = clusterWorkers <= 1 ? 0 : 1500;
let _pdimGapMs = _PDIM_GAP_INIT_MS + Math.floor(Math.random() * _PDIM_JITTER_INIT_MS);
let _pdimQueueDepth = 0;
const _PDIM_DIRECT_LANES = clusterWorkers <= 1 ? 8 : 2;
const _pdimDirectChains = Array.from(
  { length: _PDIM_DIRECT_LANES },
  () => Promise.resolve()
);
let _pdimDirectLaneRR = 0;
let _pdimScriptChain = Promise.resolve();
let _directQueueDepth = 0;
let _scriptQueueDepth = 0;
const _MAX_DIRECT_WAIT_MS = 2500;
let _fastFailLoggedAt = 0;
function _pdimAdaptSuccess() {
  const q = _pdimQueueDepth;
  const step = q >= 10 ? 15 : q >= 5 ? 12 : q >= 2 ? 5 : 1;
  _pdimGapMs = Math.max(_PDIM_GAP_FLOOR_MS, _pdimGapMs - step);
}
function _pdimAdapt429() {
  const jitter = 0.75 + Math.random() * 0.5;
  _pdimGapMs = Math.min(
    _PDIM_GAP_CEIL_MS,
    _pdimGapMs * _PDIM_MULT_429 * jitter
  );
  _last429At = Date?.now();
  return _pdimGapMs;
}
function _pdimAdaptTimeout() {
  _pdimGapMs = Math.min(_PDIM_GAP_CEIL_MS, _pdimGapMs + _PDIM_GAP_FLOOR_MS);
}
let _last429At = 0;
const _PASSIVE_DECAY_INTERVAL_MS = 2e3;
const _PASSIVE_DECAY_FACTOR = 0.8;
const _PASSIVE_DECAY_IDLE_QUIET_MS = 5e3;
setInterval(() => {
  if (_pdimGapMs <= _PDIM_GAP_FLOOR_MS) return;
  if (_last429At > 0 && Date?.now() - _last429At < _PASSIVE_DECAY_IDLE_QUIET_MS)
    return;
  _pdimGapMs = Math.max(
    _PDIM_GAP_FLOOR_MS,
    Math.floor(_pdimGapMs * _PASSIVE_DECAY_FACTOR)
  );
}, _PASSIVE_DECAY_INTERVAL_MS).unref();
function getPdimAdaptiveGapMs() {
  return _pdimGapMs;
};
function getPdimQueueDepth() {
  return _pdimQueueDepth;
};
function getPdimDirectQueueDepth() {
  return _directQueueDepth;
};
function getPdimScriptQueueDepth() {
  return _scriptQueueDepth;
};
function setPdimAdaptiveGap(ms) {
  _pdimGapMs = Math.max(_PDIM_GAP_FLOOR_MS, Math.min(_PDIM_GAP_CEIL_MS, ms));
};
function _enqueueExec(fn) {
  const gapForFastFail = Math.min(_pdimGapMs, _PDIM_GAP_FLOOR_MS * 8);
  const perLaneDirectWaitMs = _directQueueDepth / _PDIM_DIRECT_LANES * gapForFastFail;
  const estimatedWaitMs = perLaneDirectWaitMs + _scriptQueueDepth * 10;
  if (estimatedWaitMs > _MAX_DIRECT_WAIT_MS) {
    const now = Date?.now();
    if (now - _fastFailLoggedAt > 5e3) {
      _fastFailLoggedAt = now;
      __vite_ssr_import_2__.logger.warn(
        `[PDIM] Direct-call fast-fail — est. queue wait ${Math.round(estimatedWaitMs)}ms (${_directQueueDepth} direct / ${_PDIM_DIRECT_LANES} lanes × ${gapForFastFail}ms capped [live=${_pdimGapMs}ms] + ${_scriptQueueDepth} script × 10ms) > ${_MAX_DIRECT_WAIT_MS}ms threshold; caller falls back to PG/in-memory`
      );
    };
    return Promise?.reject(
      new Error(
        `[PDIM] Chain congested — est. wait ${Math.round(estimatedWaitMs)}ms exceeds ${_MAX_DIRECT_WAIT_MS}ms; use fallback`
      )
    );
  };
  _directQueueDepth++;
  _pdimQueueDepth++;
  const laneIdx = _pdimDirectLaneRR++ % _PDIM_DIRECT_LANES;
  if (_pdimDirectLaneRR >= 1e6) _pdimDirectLaneRR = 0;
  const next = _pdimDirectChains[laneIdx].then(async () => {
    _directQueueDepth = Math.max(0, _directQueueDepth - 1);
    _pdimQueueDepth = Math.max(0, _pdimQueueDepth - 1);
    const result = await fn();
    if (_pdimGapMs > 0) await new Promise((r) => setTimeout(r, _pdimGapMs));
    return result;
  }).catch(async (err) => {
    _directQueueDepth = Math.max(0, _directQueueDepth - 1);
    _pdimQueueDepth = Math.max(0, _pdimQueueDepth - 1);
    if (_pdimGapMs > 0) await new Promise((r) => setTimeout(r, _pdimGapMs));
    throw err;
  });
  _pdimDirectChains[laneIdx] = next.catch(() => {
  });
  return next;
}
function _enqueueBlockingExec(fn) {
  return Promise.resolve().then(fn);
}
const _SCRIPT_CALL_GAP_MS = 10;
function _enqueueScriptExec(fn) {
  _scriptQueueDepth++;
  _pdimQueueDepth++;
  const next = _pdimScriptChain.then(async () => {
    _scriptQueueDepth = Math.max(0, _scriptQueueDepth - 1);
    _pdimQueueDepth = Math.max(0, _pdimQueueDepth - 1);
    const result = await fn();
    await new Promise((r) => setTimeout(r, _SCRIPT_CALL_GAP_MS));
    return result;
  }).catch(async (err) => {
    _scriptQueueDepth = Math.max(0, _scriptQueueDepth - 1);
    _pdimQueueDepth = Math.max(0, _pdimQueueDepth - 1);
    await new Promise((r) => setTimeout(r, _SCRIPT_CALL_GAP_MS));
    throw err;
  });
  _pdimScriptChain = next.catch(() => {
  });
  return next;
}
const _429_DEDUP_MS = 2e3;
let _last429LoggedAt = 0;
let _suppressed429Count = 0;
const _EXEC_DEDUP_WINDOW_MS = 3e4;
let _lastExecErrorStatus = -1;
let _lastExecErrorLoggedAt = 0;
let _suppressedExecErrors = 0;
function _logExecError(cmd, status, msg) {
  const now = Date.now();
  const withinWindow = now - _lastExecErrorLoggedAt < _EXEC_DEDUP_WINDOW_MS;
  if (withinWindow && status === _lastExecErrorStatus) {
    _suppressedExecErrors++;
    if (_suppressedExecErrors % 20 === 0) {
      __vite_ssr_import_2__.logger.warn(
        `[PDIM] exec error [${String(cmd)}]: HTTP ${status} suppressed ×${_suppressedExecErrors} (same error within ${_EXEC_DEDUP_WINDOW_MS / 1e3}s window)`
      );
    };
    return;
  };
  if (_suppressedExecErrors > 0) {
    __vite_ssr_import_2__.logger.warn(
      `[PDIM] exec error [${String(cmd)}]: ${msg} (+ ${_suppressedExecErrors} suppressed identical errors)`
    );
    _suppressedExecErrors = 0;
  } else {
    __vite_ssr_import_2__.logger.warn(`[PDIM] exec error [${String(cmd)}]: ${msg}`);
  };
  _lastExecErrorStatus = status;
  _lastExecErrorLoggedAt = now;
}
const _NET_ERROR_DEDUP_MS = 1e4;
let _lastNetErrorMsg = "";
let _lastNetErrorLoggedAt = 0;
let _suppressedNetErrors = 0;
function _logNetworkError(cmd, msg) {
  const now = Date.now();
  const sameMsg = msg === _lastNetErrorMsg;
  const withinWindow = now - _lastNetErrorLoggedAt < _NET_ERROR_DEDUP_MS;
  if (sameMsg && withinWindow) {
    _suppressedNetErrors++;
    if (_suppressedNetErrors % 50 === 0) {
      __vite_ssr_import_2__.logger.warn(
        `[PDIM] exec error [${String(cmd)}]: ${msg} — suppressed ×${_suppressedNetErrors} in last ${_NET_ERROR_DEDUP_MS / 1e3}s`
      );
    };
    return;
  };
  if (_suppressedNetErrors > 0) {
    __vite_ssr_import_2__.logger.warn(
      `[PDIM] exec error [${String(cmd)}]: ${_lastNetErrorMsg} (+ ${_suppressedNetErrors} suppressed in last ${_NET_ERROR_DEDUP_MS / 1e3}s)`
    );
    _suppressedNetErrors = 0;
  } else {
    __vite_ssr_import_2__.logger.warn(`[PDIM] exec error [${String(cmd)}]: ${msg}`);
  };
  _lastNetErrorMsg = msg;
  _lastNetErrorLoggedAt = now;
}
const L1_MAX_ENTRIES = 2e3;
const L1_TTL_MS = 5 * 60 * 1e3;
const _l1 = /* @__PURE__ */ new Map();
function _l1Read(key) {
  const e = _l1.get(key);
  if (!e) return void 0;
  if (Date.now() > e.expiresAt) {
    _l1.delete(key);
    return void 0;
  };
  _l1.delete(key);
  _l1.set(key, e);
  return e.value;
}
function _l1Write(key, value) {
  if (_l1.size >= L1_MAX_ENTRIES && !_l1.has(key)) {
    const oldest = _l1.keys().next().value;
    if (oldest !== void 0) _l1.delete(oldest);
  };
  _l1.set(key, { value, expiresAt: Date.now() + L1_TTL_MS });
}
function _l1Evict(...keys) {
  for (const k of keys) _l1.delete(k);
}
function _normalizeLuaResult(val) {
  if (val === null || val === void 0) return val;
  if (Array.isArray(val)) return val.map(_normalizeLuaResult);
  if (typeof val !== "object") return val;
  const obj = val;
  const keys = Object.keys(obj);
  if (keys.length === 0) return [];
  const numKeys = keys.map((k) => parseInt(k, 10));
  const allNumeric = numKeys.every((n) => !isNaN(n) && n > 0);
  if (allNumeric) {
    const sorted = [...numKeys].sort((a, b) => a - b);
    const isConsecutive = sorted[0] === 1 && sorted[sorted.length - 1] === sorted.length;
    if (isConsecutive) {
      return sorted.map((k) => _normalizeLuaResult(obj[k] ?? obj[String(k)]));
    }
  };
  const out = {};
  for (const k of keys) out[k] = _normalizeLuaResult(obj[k]);
  return out;
}
const EventEmitter = __vite_ssr_import_0__.EventEmitter;
class PdimRedisClient extends EventEmitter {
  constructor(execUrl, bearerToken) {
    super();
    this.status = "ready";
    this.disconnected = false;
    this.lifecycleController = new AbortController();
    this.disconnectedError = Object.assign(
      new Error("[PDIM] Redis client disconnected"),
      { name: "ConnectionError" }
    );
    this.pubSubChannels = /* @__PURE__ */ new Set();
    this.pubSubPatterns = /* @__PURE__ */ new Set();
    this.pubSubController = null;
    this.pubSubTask = null;
    this.pubSubGeneration = 0;
    this.pubSubRefreshChain = Promise.resolve();
    /**
     * BullMQ reads this._client.options.keyPrefix to validate no prefix is set,
     * and uses this._client.options as its opts. Supply safe defaults.
     */
    this.options = {
      keyPrefix: void 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: false
    };
    this.lmove = (src, dst, srcDir, dstDir) => this.exec(["LMOVE", src, dst, srcDir, dstDir]);
    // ── camelCase stream aliases (node-redis v4 compat) ───────────────────────
    this.xAdd = (key, ...args) => this.xadd(key, ...args);
    this.xTrim = (key, s, ...a) => this.xtrim(key, s, ...a);
    this.xLen = (key) => this.xlen(key);
    this.xRange = (key, s, e, ...a) => this.xrange(key, s, e, ...a);
    this.xRevRange = (key, e, s, ...a) => this.xrevrange(key, e, s, ...a);
    this.xRead = (...args) => this.xread(...args);
    this.xReadGroup = (...args) => this.xreadgroup(...args);
    this.xDel = (key, ...ids) => this.xdel(key, ...ids);
    this.xAck = (key, g, ...ids) => this.xack(key, g, ...ids);
    this.xGroup = (sub, key, g, ...a) => this.xgroup(sub, key, g, ...a);
    this.xClaim = (key, g, c, t, ...a) => this.xclaim(key, g, c, t, ...a);
    this.xAutoClaim = (key, g, c, t, s, ...a) => this.xautoclaim(key, g, c, t, s, ...a);
    this.xPending = (key, g, ...a) => this.xpending(key, g, ...a);
    this.xInfo = (sub, key, ...a) => this.xinfo(sub, key, ...a);
    // ── camelCase aliases (node-redis v4 compat) ──────────────────────────────
    this.setEx = (k, s, v) => this.setex(k, s, v);
    this.hGetAll = (k) => this.hgetall(k);
    this.hSet = (k, ...a) => this.hset(k, ...a);
    this.hGet = (k, f) => this.hget(k, f);
    this.hDel = (k, ...f) => this.hdel(k, ...f);
    this.hExists = (k, f) => this.hexists(k, f);
    this.hIncrBy = (k, f, n) => this.hincrby(k, f, n);
    this.hKeys = (k) => this.hkeys(k);
    this.hVals = (k) => this.hvals(k);
    this.hLen = (k) => this.hlen(k);
    this.sAdd = (k, ...m) => this.sadd(k, ...m);
    this.sRem = (k, ...m) => this.srem(k, ...m);
    this.sMembers = (k) => this.smembers(k);
    this.sIsMember = (k, m) => this.sismember(k, m);
    this.sCard = (k) => this.scard(k);
    this.lPush = (k, ...v) => this.lpush(k, ...v);
    this.rPush = (k, ...v) => this.rpush(k, ...v);
    this.lRange = (k, s, e) => this.lrange(k, s, e);
    this.lLen = (k) => this.llen(k);
    this.lPop = (k) => this.lpop(k);
    this.rPop = (k) => this.rpop(k);
    this.zAdd = (k, ...a) => this.zadd(k, ...a);
    this.zCard = (k) => this.zcard(k);
    this.zRange = (k, s, e, ...a) => this.zrange(k, s, e, ...a);
    this.zRevRange = (k, s, e, ...a) => this.zrevrange(k, s, e, ...a);
    this.zRem = (k, ...m) => this.zrem(k, ...m);
    this.zScore = (k, m) => this.zscore(k, m);
    this.zRank = (k, m) => this.zrank(k, m);
    this.zRemRangeByScore = (k, min, max) => this.zremrangebyscore(k, min, max);
    this.zRangeByScore = (k, min, max, ...a) => this.zrangebyscore(k, min, max, ...a);
    this.zCount = (k, min, max) => this.zcount(k, min, max);
    this.mGet = (...k) => this.mget(...k);
    this.mSet = (...a) => this.mset(...a);
    this.incrBy = (k, n) => this.incrby(k, n);
    this.decrBy = (k, n) => this.decrby(k, n);
    this.pExpire = (k, ms) => this.pexpire(k, ms);
    this.pTtl = (k) => this.pttl(k);
    this.execUrl = execUrl || process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
    this.bearerToken = bearerToken || process.env.PDIM_EXEC_TOKEN || process.env.PDIM_BEARER_TOKEN || "";
    if (!this.execUrl) {
      throw new Error("PDIM_HTTP_EXEC_URL is required for PdimRedisClient");
    };
    setImmediate(() => {
      if (this.disconnected) return;
      this.emit("connect");
      this.emit("ready");
      __vite_ssr_import_2__.logger.info("✅ [PDIM] Connected via HTTP exec endpoint");
    });
  }
  assertConnected() {
    if (this.disconnected) throw this.disconnectedError;
  }
  requestSignal(timeoutMs = PDIM_EXEC_TIMEOUT_MS) {
    if (timeoutMs === null) return this.lifecycleController.signal;
    return AbortSignal.any([
      this.lifecycleController.signal,
      AbortSignal.timeout(timeoutMs)
    ]);
  }
  awaitOrDisconnect(operation) {
    if (this.disconnected) return Promise.reject(this.disconnectedError);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.lifecycleController.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(this.disconnectedError);
      };
      this.lifecycleController.signal.addEventListener("abort", onAbort, { once: true });
      operation.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        }
      );
    });
  }
  delay(ms) {
    if (this.disconnected) return Promise.reject(this.disconnectedError);
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.lifecycleController.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(this.disconnectedError);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      this.lifecycleController.signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  refreshPubSubStream() {
    const next = this.pubSubRefreshChain.then(() => this.restartPubSubStream());
    this.pubSubRefreshChain = next.catch(() => {
    });
    return next;
  }
  async restartPubSubStream() {
    this.assertConnected();
    const generation = ++this.pubSubGeneration;
    const previousController = this.pubSubController;
    const previousTask = this.pubSubTask;
    previousController?.abort();
    if (previousTask) await previousTask;
    this.pubSubController = null;
    this.pubSubTask = null;
    if (this.pubSubChannels.size + this.pubSubPatterns.size === 0) return;
    const controller = new AbortController();
    this.pubSubController = controller;
    let resolveReady;
    let rejectReady;
    let settled = false;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const markReady = () => {
      if (settled) return;
      settled = true;
      resolveReady();
    };
    const rejectBeforeReady = (error) => {
      if (settled) return;
      settled = true;
      rejectReady(error);
    };
    this.pubSubTask = this.runPubSubLoop(
      controller,
      generation,
      markReady,
      rejectBeforeReady
    );
    await ready;
  }
  async runPubSubLoop(controller, generation, markReady, rejectBeforeReady) {
    let retryMs = 200;
    let initialReady = false;
    const isCurrent = () => !this.disconnected && !controller.signal.aborted && !this.lifecycleController.signal.aborted && generation === this.pubSubGeneration;
    while (isCurrent()) {
      let reader;
      try {
        const openTimeout = new AbortController();
        const timer = setTimeout(
          () => openTimeout.abort(new Error("PDIM Pub/Sub connection timed out")),
          PDIM_EXEC_TIMEOUT_MS
        );
        let response;
        try {
          response = await fetch(this.execUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.bearerToken}`
            },
            body: JSON.stringify({
              cmd: "SUBSCRIBE",
              args: [...this.pubSubChannels],
              patterns: [...this.pubSubPatterns],
              stream: true
            }),
            signal: AbortSignal.any([
              this.lifecycleController.signal,
              controller.signal,
              openTimeout.signal
            ]),
            redirect: "manual"
          });
        } finally {
          clearTimeout(timer);
        };
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`PDIM Pub/Sub HTTP ${response.status}: ${text.slice(0, 200)}`);
        };
        if (!response.body) throw new Error("PDIM Pub/Sub response has no stream body");
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        while (isCurrent()) {
          const { done, value } = await reader.read();
          if (done) throw new Error("PDIM Pub/Sub stream ended unexpectedly");
          buffered += decoder.decode(value, { stream: true });
          if (buffered.length > 1048576) {
            throw new Error("PDIM Pub/Sub stream exceeded the client buffer limit");
          };
          let newline = buffered.indexOf("\n");
          while (newline >= 0) {
            const line = buffered.slice(0, newline);
            buffered = buffered.slice(newline + 1);
            newline = buffered.indexOf("\n");
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === "ready") {
              initialReady = true;
              retryMs = 200;
              markReady();
              this.emit("pubsub-ready");
            } else if (event.type === "message" && typeof event.channel === "string" && typeof event.message === "string") {
              this.emit("message", event.channel, event.message);
            } else if (event.type === "pmessage" && typeof event.pattern === "string" && typeof event.channel === "string" && typeof event.message === "string") {
              this.emit("pmessage", event.pattern, event.channel, event.message);
            } else if (event.type === "heartbeat") {
              continue;
            } else {
              throw new Error("PDIM Pub/Sub stream returned an invalid event");
            }
          }
        }
      } catch (error) {
        if (!isCurrent()) {
          if (!initialReady) rejectBeforeReady(this.disconnectedError);
          await reader?.cancel().catch(() => {
          });
          return;
        };
        await reader?.cancel().catch(() => {
        });
        if (!initialReady) rejectBeforeReady(error);
        this.emit("pubsub-error", error);
        __vite_ssr_import_2__.logger.warn(
          `[PDIM] Pub/Sub stream disconnected; retrying in ${retryMs}ms: ${error instanceof Error ? error.message : String(error)}`
        );
        await new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", finish);
            this.lifecycleController.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, retryMs);
          controller.signal.addEventListener("abort", finish, { once: true });
          this.lifecycleController.signal.addEventListener("abort", finish, { once: true });
        });
        retryMs = Math.min(retryMs * 2, 3e4);
      }
    }
  }
  static {
    // Static rate-limit deadline — shared across ALL PdimRedisClient instances.
    // Updated by exec() on each 429 to mirror the current AIMD gap, providing a
    // secondary hold that keeps any caller from firing during the backoff window.
    //
    // Cleared opportunistically by successful responses, BUT only when the deadline
    // has already expired (Date.now() >= deadline).  Race-safety under parallel
    // direct lanes: with _PDIM_DIRECT_LANES > 1, an in-flight request that started
    // before a sibling lane's 429 can complete successfully *after* the 429 has
    // set a new future deadline.  Naively clearing to 0 on that success would
    // wipe out the active backoff and release the next caller immediately.  The
    // "only clear if already expired" rule makes the assignment a no-op cleanup
    // for live holds and a tidy reset once the hold has naturally elapsed.
    this._rateLimitedUntil = 0;
  }
  static _clearRateLimitIfExpired() {
    if (Date?.now() >= PdimRedisClient?._rateLimitedUntil) {
      PdimRedisClient._rateLimitedUntil = 0;
    }
  }
  // 429 setter — monotonic: never lowers an existing future deadline.  Without
  // this guard, two lanes racing on 429s with jittered holds could let the
  // shorter jitter overwrite the longer one and release callers early.
  static _set429Deadline(deadlineMs) {
    if (deadlineMs > PdimRedisClient?._rateLimitedUntil) {
      PdimRedisClient._rateLimitedUntil = deadlineMs;
    }
  }
  exec(command, options = {}) {
    if (this.disconnected) return Promise.reject(this.disconnectedError);
    const [cmd, ...rawArgs] = command;
    if (rawArgs.some((arg) => arg === null || arg === void 0)) {
      throw new TypeError(`[PDIM] ${String(cmd)} received a nullish command argument`);
    };
    const args = rawArgs.map((arg) => String(arg));
    if (!(0,__vite_ssr_import_5__.cbAllowRequest)()) {
      throw new Error(
        `[PDIM] Circuit OPEN — ${cmd} rejected (backing off until PDIM recovers)`
      );
    };
    const run = async () => {
      this.assertConnected();
      const rlWait = PdimRedisClient?._rateLimitedUntil - Date?.now();
      if (rlWait > 0) {
        await this.delay(rlWait);
      };
      this.assertConnected();
      let counted = false;
      try {
        const res = await fetch(this.execUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.bearerToken}`
          },
          body: JSON.stringify({ cmd, args }),
          signal: this.requestSignal(options.requestTimeoutMs),
          // Do not follow redirects automatically — if PDIM's proxy returns 302
          // (Replit redirecting to an error/login page when the service is down)
          // we need to see the raw 302 status so our 3xx handler can trip the
          // circuit breaker rather than silently following into an HTML page.
          redirect: "manual"
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 429) {
            const newGap = _pdimAdapt429();
            let retryAfterMs = 0;
            const retryAfterHdr = res.headers.get("retry-after");
            if (retryAfterHdr) {
              const secs = parseFloat(retryAfterHdr);
              if (!isNaN(secs) && secs > 0)
                retryAfterMs = Math.ceil(secs * 1e3);
            };
            const holdMs = Math.max(newGap, retryAfterMs);
            PdimRedisClient?._set429Deadline(
              Date?.now() + holdMs + Math.floor(Math.random() * 500)
            );
            const errMsg = `PDIM HTTP 429: Too many requests (gap→${newGap}ms${retryAfterMs > 0 ? `, retry-after=${retryAfterMs}ms` : ""})`;
            counted = true;
            const now429 = Date?.now();
            if (now429 - _last429LoggedAt < _429_DEDUP_MS) {
              _suppressed429Count++;
            } else {
              if (_suppressed429Count > 0) {
                __vite_ssr_import_2__.logger.warn(
                  `[PDIM] exec error [${cmd}]: PDIM HTTP 429 — gap→${newGap}ms (+ ${_suppressed429Count} suppressed in last ${_429_DEDUP_MS}ms burst)`
                );
                _suppressed429Count = 0;
              } else {
                __vite_ssr_import_2__.logger.warn(
                  `[PDIM] exec error [${cmd}]: PDIM HTTP 429 — gap→${newGap}ms`
                );
              };
              _last429LoggedAt = now429;
            };
            throw new Error(errMsg);
          };
          if (res.status >= 300 && res.status < 400) {
            (0,__vite_ssr_import_5__.cbRecordFailure)();
            counted = true;
            const errMsg = `PDIM HTTP ${res.status}: service temporarily unreachable`;
            _logExecError(cmd, res.status, errMsg);
            throw new Error(errMsg);
          };
          if (res.status >= 500) {
            (0,__vite_ssr_import_5__.cbRecordFailure)();
            counted = true;
            const errMsg = `PDIM HTTP ${res.status}: ${text.slice(0, 120)}`;
            _logExecError(cmd, res.status, errMsg);
            throw new Error(errMsg);
          };
          counted = true;
          PdimRedisClient._clearRateLimitIfExpired();
          _pdimAdaptSuccess();
          (0,__vite_ssr_import_5__.cbRecordSuccess)();
          throw new Error(
            `PDIM HTTP ${res.status} (${String(cmd)}): ${text.slice(0, 200)}`
          );
        };
        PdimRedisClient._clearRateLimitIfExpired();
        _pdimAdaptSuccess();
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType?.includes("application/json")) {
          const body = await res.text().catch(() => "(unreadable)");
          (0,__vite_ssr_import_5__.cbRecordFailure)();
          counted = true;
          const errMsg = `PDIM returned non-JSON (${contentType?.split(";")[0].trim() || "unknown type"}): ${body?.slice(0, 80)}`;
          _logExecError(cmd, 200, errMsg);
          throw new Error(errMsg);
        };
        const data = await res.json();
        counted = true;
        (0,__vite_ssr_import_5__.cbRecordSuccess)();
        if (data !== null && typeof data === "object") {
          if ("result" in data) return data?.result;
          if ("error" in data) {
            const errMsg = String(data?.error);
            if (errMsg?.startsWith("ERR unknown command")) {
              throw new Error(errMsg);
            };
            throw new Error(errMsg);
          }
        };
        return data;
      } catch (err) {
        if (this.disconnected) throw this.disconnectedError;
        const isTimeout = !counted && (err?.name === "TimeoutError" || err?.name === "AbortError");
        const isCircuitMsg = !counted && err?.message.startsWith("[PDIM] Circuit");
        if (!counted && !isTimeout && !isCircuitMsg) {
          (0,__vite_ssr_import_5__.cbRecordFailure)();
        } else if (isTimeout) {
          _pdimAdaptTimeout();
        };
        if (!counted) {
          _logNetworkError(cmd, err.message.slice(0, 200));
        };
        (0,__vite_ssr_import_5__.cbHalfOpenFailed)();
        throw err;
      }
    };
    const operation = options.blocking ? _enqueueBlockingExec(run) : _enqueueExec(run);
    return this.awaitOrDisconnect(operation);
  }
  pipeline() {
    return this.createPipeline(false);
  }
  createPipeline(transactional) {
    const cmds = [];
    const self = this;
    const pipe = {
      get: (k) => {
        cmds.push(["GET", k]);
        return pipe;
      },
      set: (k, v, ...a) => {
        cmds.push(["SET", k, v, ...a]);
        return pipe;
      },
      setex: (k, s, v) => {
        cmds.push(["SETEX", k, s, v]);
        return pipe;
      },
      del: (...k) => {
        cmds.push(["DEL", ...k]);
        return pipe;
      },
      expire: (k, s) => {
        cmds.push(["EXPIRE", k, s]);
        return pipe;
      },
      pexpire: (k, ms) => {
        cmds.push(["PEXPIRE", k, ms]);
        return pipe;
      },
      incr: (k) => {
        cmds.push(["INCR", k]);
        return pipe;
      },
      incrby: (k, n) => {
        cmds.push(["INCRBY", k, n]);
        return pipe;
      },
      decr: (k) => {
        cmds.push(["DECR", k]);
        return pipe;
      },
      decrby: (k, n) => {
        cmds.push(["DECRBY", k, n]);
        return pipe;
      },
      hset: (k, ...a) => {
        cmds.push(["HSET", k, ...a]);
        return pipe;
      },
      hget: (k, f) => {
        cmds.push(["HGET", k, f]);
        return pipe;
      },
      hdel: (k, ...f) => {
        cmds.push(["HDEL", k, ...f]);
        return pipe;
      },
      hgetall: (k) => {
        cmds.push(["HGETALL", k]);
        return pipe;
      },
      sadd: (k, ...m) => {
        cmds.push(["SADD", k, ...m]);
        return pipe;
      },
      srem: (k, ...m) => {
        cmds.push(["SREM", k, ...m]);
        return pipe;
      },
      zadd: (k, ...a) => {
        cmds.push(["ZADD", k, ...a]);
        return pipe;
      },
      zrem: (k, ...m) => {
        cmds.push(["ZREM", k, ...m]);
        return pipe;
      },
      lpush: (k, ...v) => {
        cmds.push(["LPUSH", k, ...v]);
        return pipe;
      },
      rpush: (k, ...v) => {
        cmds.push(["RPUSH", k, ...v]);
        return pipe;
      },
      // Sequential execution preserves per-pipeline ordering.  Under parallel
      // direct lanes (_PDIM_DIRECT_LANES > 1), Promise.all would let commands
      // in one pipeline fan out across lanes and race (e.g. a pipeline's SET
      // then GET could complete out of order if assigned to different lanes
      // with different in-flight RTTs).  Awaiting sequentially keeps each
      // command's enqueue-then-complete strictly before the next command's
      // enqueue, which gives ioredis-compatible pipeline semantics.  Cost:
      // pipelines lose intra-pipeline parallelism — acceptable because real
      // throughput parallelism still comes from concurrent *different* pipelines
      // landing in different lanes.
      exec: async () => {
        if (transactional) {
          const commands = cmds.map((command) => {
            if (command.some((arg) => arg === null || arg === void 0)) {
              throw new TypeError(
                "[PDIM] transaction received a nullish command argument"
              );
            };
            return command.map((arg) => String(arg));
          });
          const reply = await self.exec([
            "__PDIM_MULTI_EXEC",
            JSON.stringify(commands)
          ]);
          if (!Array.isArray(reply) || reply.length !== commands.length) {
            throw new Error("[PDIM] invalid transaction response");
          };
          return reply.map((item) => {
            if (!Array.isArray(item) || item.length !== 2) {
              throw new Error("[PDIM] invalid transaction result tuple");
            };
            const [rawError, value] = item;
            if (rawError === null || rawError === void 0) {
              return [null, value];
            };
            const errorValue = typeof rawError === "object" && rawError !== null ? rawError : { message: rawError };
            const error = new Error(String(errorValue.message ?? rawError));
            if (typeof errorValue.name === "string") error.name = errorValue.name;
            if (typeof errorValue.code === "string") {
              Object.assign(error, { code: errorValue.code });
            };
            return [error, null];
          });
        };
        const results = [];
        for (const c of cmds) {
          try {
            results?.push(await self?.exec(c));
          } catch (e) {
            results?.push(e);
          }
        };
        return results;
      }
    };
    return pipe;
  }
  multi() {
    return this.createPipeline(true);
  }
  duplicate() {
    return new PdimRedisClient(this.execUrl, this.bearerToken);
  }
  // Required by BullMQ's isRedisInstance() check: ['connect', 'disconnect', 'duplicate']
  async connect() {
    this.assertConnected();
    this.emit("connect");
    this.emit("ready");
  }
  async quit() {
    await this.disconnect();
    return "OK";
  }
  async disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.status = "end";
    this.pubSubGeneration++;
    this.pubSubController?.abort(this.disconnectedError);
    this.lifecycleController.abort(this.disconnectedError);
    this.emit("close");
    this.emit("end");
    await this.pubSubTask?.catch(() => {
    });
    this.pubSubTask = null;
    this.pubSubController = null;
  }
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
   * This completely sidesteps PDIM's broken async Lua runtime where redis?.call()
   * returns Promises that Lua cannot await, causing .then(null) crashes on nil.
   */
  defineCommand(name, opts) {
    const self = this;
    const numKeys = opts?.numberOfKeys;
    const lua = opts?.lua;
    this[name] = async function() {
      let flatArgs;
      if (arguments?.length === 1 && Array.isArray(arguments[0])) {
        flatArgs = arguments[0];
      } else {
        flatArgs = Array.from(arguments);
      };
      const result = await (0,__vite_ssr_import_4__.execLuaViaPdim)(
        (args) => self?.scriptExec(args),
        lua,
        numKeys,
        flatArgs
      );
      return _normalizeLuaResult(result);
    };
  }
  async sendCommand(args) {
    const cmd = (args[0] ?? "").toUpperCase();
    if (cmd === "PUBLISH") {
      if (args.length !== 3) throw new Error("ERR wrong number of arguments for PUBLISH");
      return this.publish(args[1], args[2]);
    };
    if (cmd === "SUBSCRIBE") return this.subscribe(...args.slice(1));
    if (cmd === "UNSUBSCRIBE") return this.unsubscribe(...args.slice(1));
    if (cmd === "PSUBSCRIBE") return this.psubscribe(...args.slice(1));
    if (cmd === "PUNSUBSCRIBE") return this.punsubscribe(...args.slice(1));
    return this.exec(args);
  }
  /**
   * Fast-lane variant of sendCommand for LuaExecutor redis?.call() IPC.
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
  async scriptExec(args) {
    this.assertConnected();
    const [cmd, ...rawArgs] = args;
    if (rawArgs.some((a) => a === null || a === void 0)) {
      throw new TypeError(
        `[PDIM] ${String(cmd)} (script) received a nullish command argument`
      );
    };
    const strArgs = rawArgs.map((a) => String(a));
    if (!(0,__vite_ssr_import_5__.cbAllowRequest)()) {
      throw new Error(`[PDIM] Circuit OPEN — ${cmd} (script) rejected`);
    };
    return this.awaitOrDisconnect(_enqueueScriptExec(async () => {
      this.assertConnected();
      const rlWait = PdimRedisClient?._rateLimitedUntil - Date?.now();
      if (rlWait > 0) await this.delay(rlWait);
      this.assertConnected();
      let counted = false;
      try {
        const res = await fetch(this.execUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.bearerToken}`
          },
          body: JSON.stringify({ cmd, args: strArgs }),
          signal: this.requestSignal(),
          // Do not follow redirects — a 3xx from Replit's proxy (PDIM sleeping)
          // must be seen as a failure here, not silently followed to an HTML page.
          // Same reasoning as the main exec() path.
          redirect: "manual"
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 429) {
            const newGap = _pdimAdapt429();
            PdimRedisClient?._set429Deadline(Date?.now() + newGap);
            throw new Error(`PDIM HTTP 429 (script ${cmd}): gap→${newGap}ms`);
          };
          if (res.status >= 300 && res.status < 400) {
            (0,__vite_ssr_import_5__.cbRecordFailure)();
            counted = true;
            throw new Error(`PDIM HTTP ${res.status} (script ${cmd}): service temporarily unreachable`);
          };
          if (res.status >= 500) {
            (0,__vite_ssr_import_5__.cbRecordFailure)();
            counted = true;
            throw new Error(`PDIM HTTP ${res.status} (script ${cmd}): ${text?.slice(0, 200)}`);
          };
          counted = true;
          PdimRedisClient._clearRateLimitIfExpired();
          _pdimAdaptSuccess();
          (0,__vite_ssr_import_5__.cbRecordSuccess)();
          throw new Error(
            `PDIM HTTP ${res.status} (script ${String(cmd)}): ${text.slice(0, 200)}`
          );
        };
        PdimRedisClient?._clearRateLimitIfExpired();
        _pdimAdaptSuccess();
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType?.includes("application/json")) {
          const body = await res.text().catch(() => "(unreadable)");
          (0,__vite_ssr_import_5__.cbRecordFailure)();
          counted = true;
          throw new Error(
            `PDIM non-JSON (script ${cmd}): ${body?.slice(0, 80)}`
          );
        };
        const data = await res.json();
        counted = true;
        (0,__vite_ssr_import_5__.cbRecordSuccess)();
        if (data !== null && typeof data === "object") {
          if ("result" in data) return data?.result;
          if ("error" in data) {
            const errMsg = String(data?.error);
            if (errMsg?.startsWith("ERR unknown command")) {
              throw new Error(errMsg);
            };
            throw new Error(errMsg);
          }
        };
        return data;
      } catch (err) {
        if (this.disconnected) throw this.disconnectedError;
        const isTimeout = !counted && (err?.name === "TimeoutError" || err?.name === "AbortError");
        const isCircuitMsg = !counted && err?.message?.startsWith("[PDIM] Circuit");
        if (!counted && !isTimeout && !isCircuitMsg) {
          (0,__vite_ssr_import_5__.cbRecordFailure)();
        } else if (isTimeout) {
          _pdimAdaptTimeout();
        };
        (0,__vite_ssr_import_5__.cbHalfOpenFailed)();
        throw err;
      }
    }));
  }
  // ── String commands ───────────────────────────────────────────────────────
  async get(key) {
    this.assertConnected();
    const stale = _l1Read(key);
    try {
      const fresh = await this.exec(["GET", key]);
      _l1Write(key, fresh);
      return fresh;
    } catch (err) {
      this.assertConnected();
      if (stale !== void 0) return stale;
      throw err;
    }
  }
  async set(key, value, ...args) {
    const result = await this.exec(["SET", key, value, ...args]);
    _l1Write(key, value);
    return result;
  }
  async setex(key, secs, value) {
    const result = await this.exec(["SETEX", key, secs, value]);
    _l1Write(key, value);
    return result;
  }
  async setnx(key, value) {
    const result = await this.exec(["SETNX", key, value]);
    if (result === 1) _l1Write(key, value);
    return result;
  }
  async getset(key, value) {
    const result = await this.exec(["GETSET", key, value]);
    _l1Write(key, value);
    return result;
  }
  async mget(...keys) {
    return this.exec(["MGET", ...keys]);
  }
  async mset(...args) {
    return this.exec(["MSET", ...args]);
  }
  async append(key, value) {
    return this.exec(["APPEND", key, value]);
  }
  async incr(key) {
    return this.exec(["INCR", key]);
  }
  async decr(key) {
    return this.exec(["DECR", key]);
  }
  async incrby(key, n) {
    return this.exec(["INCRBY", key, n]);
  }
  async decrby(key, n) {
    return this.exec(["DECRBY", key, n]);
  }
  async incrbyfloat(key, n) {
    return this.exec(["INCRBYFLOAT", key, n]);
  }
  // ── Key commands ──────────────────────────────────────────────────────────
  async del(...keys) {
    const result = await this.exec(["DEL", ...keys]);
    _l1Evict(...keys);
    return result;
  }
  async exists(...keys) {
    return this.exec(["EXISTS", ...keys]);
  }
  async expire(key, secs) {
    return this.exec(["EXPIRE", key, secs]);
  }
  async pexpire(key, ms) {
    return this.exec(["PEXPIRE", key, ms]);
  }
  async expireat(key, ts) {
    return this.exec(["EXPIREAT", key, ts]);
  }
  async persist(key) {
    return this.exec(["PERSIST", key]);
  }
  async ttl(key) {
    return this.exec(["TTL", key]);
  }
  async pttl(key) {
    return this.exec(["PTTL", key]);
  }
  async type(key) {
    return this.exec(["TYPE", key]);
  }
  async rename(key, newKey) {
    return this.exec(["RENAME", key, newKey]);
  }
  async keys(pattern) {
    return this.exec(["KEYS", pattern]);
  }
  async scan(cursor, ...args) {
    return this.exec(["SCAN", cursor, ...args]);
  }
  async dbsize() {
    return this.exec(["DBSIZE"]);
  }
  async randomkey() {
    return this.exec(["RANDOMKEY"]);
  }
  // ── Hash commands ─────────────────────────────────────────────────────────
  async hget(key, field) {
    this.assertConnected();
    const l1Key = `${key}\0${field}`;
    const stale = _l1Read(l1Key);
    try {
      const fresh = await this.exec(["HGET", key, field]);
      _l1Write(l1Key, fresh);
      return fresh;
    } catch (err) {
      this.assertConnected();
      if (stale !== void 0) return stale;
      throw err;
    }
  }
  async hset(key, ...args) {
    return this.exec(["HSET", key, ...args]);
  }
  async hsetnx(key, field, value) {
    return this.exec(["HSETNX", key, field, value]);
  }
  async hdel(key, ...fields) {
    return this.exec(["HDEL", key, ...fields]);
  }
  async hmget(key, ...fields) {
    return this.exec(["HMGET", key, ...fields]);
  }
  async hmset(key, ...args) {
    for (let i = 0; i < args.length - 1; i += 2) {
      await this.exec(["HSET", key, args[i], args[i + 1]]);
    };
    return "OK";
  }
  async hgetall(key) {
    const result = await this.exec(["HGETALL", key]);
    return result ?? {};
  }
  async hkeys(key) {
    return this.exec(["HKEYS", key]);
  }
  async hvals(key) {
    return this.exec(["HVALS", key]);
  }
  async hlen(key) {
    return this.exec(["HLEN", key]);
  }
  async hexists(key, field) {
    return this.exec(["HEXISTS", key, field]);
  }
  async hincrby(key, field, n) {
    return this.exec(["HINCRBY", key, field, n]);
  }
  async hincrbyfloat(key, field, n) {
    return this.exec(["HINCRBYFLOAT", key, field, n]);
  }
  // ── List commands ─────────────────────────────────────────────────────────
  async lpush(key, ...values) {
    return this.exec(["LPUSH", key, ...values]);
  }
  async rpush(key, ...values) {
    return this.exec(["RPUSH", key, ...values]);
  }
  async lpop(key) {
    return this.exec(["LPOP", key]);
  }
  async rpop(key) {
    return this.exec(["RPOP", key]);
  }
  async llen(key) {
    return this.exec(["LLEN", key]);
  }
  async lrange(key, start, stop) {
    return this.exec(["LRANGE", key, start, stop]);
  }
  async lindex(key, index) {
    return this.exec(["LINDEX", key, index]);
  }
  async lset(key, index, value) {
    return this.exec(["LSET", key, index, value]);
  }
  async lrem(key, count, value) {
    return this.exec(["LREM", key, count, value]);
  }
  async ltrim(key, start, stop) {
    return this.exec(["LTRIM", key, start, stop]);
  }
  // ── Set commands ──────────────────────────────────────────────────────────
  async sadd(key, ...members) {
    return this.exec(["SADD", key, ...members]);
  }
  async srem(key, ...members) {
    return this.exec(["SREM", key, ...members]);
  }
  async smembers(key) {
    return this.exec(["SMEMBERS", key]);
  }
  async scard(key) {
    return this.exec(["SCARD", key]);
  }
  async sismember(key, member) {
    return this.exec(["SISMEMBER", key, member]);
  }
  async sunion(...keys) {
    return this.exec(["SUNION", ...keys]);
  }
  async sinter(...keys) {
    return this.exec(["SINTER", ...keys]);
  }
  async sdiff(...keys) {
    return this.exec(["SDIFF", ...keys]);
  }
  // ── Sorted set commands ───────────────────────────────────────────────────
  async zadd(key, ...args) {
    return this.exec(["ZADD", key, ...args]);
  }
  async zrem(key, ...members) {
    return this.exec(["ZREM", key, ...members]);
  }
  async zscore(key, member) {
    return this.exec(["ZSCORE", key, member]);
  }
  async zrank(key, member) {
    return this.exec(["ZRANK", key, member]);
  }
  async zrevrank(key, member) {
    return this.exec(["ZREVRANK", key, member]);
  }
  async zrange(key, start, stop, ...args) {
    return this.exec(["ZRANGE", key, start, stop, ...args]);
  }
  async zrevrange(key, start, stop, ...args) {
    return this.exec(["ZREVRANGE", key, start, stop, ...args]);
  }
  async zrangebyscore(key, min, max, ...args) {
    return this.exec(["ZRANGEBYSCORE", key, min, max, ...args]);
  }
  async zrevrangebyscore(key, max, min, ...args) {
    return this.exec(["ZREVRANGEBYSCORE", key, max, min, ...args]);
  }
  async zcard(key) {
    return this.exec(["ZCARD", key]);
  }
  async zcount(key, min, max) {
    return this.exec(["ZCOUNT", key, min, max]);
  }
  async zincrby(key, increment, member) {
    return this.exec(["ZINCRBY", key, increment, member]);
  }
  async zremrangebyscore(key, min, max) {
    return this.exec(["ZREMRANGEBYSCORE", key, min, max]);
  }
  async zremrangebyrank(key, start, stop) {
    return this.exec(["ZREMRANGEBYRANK", key, start, stop]);
  }
  // ── Sorted-set blocking commands ───────────────────────────────────────────
  /** Waits on the canonical owner's mutation event instead of polling ZPOPMIN. */
  async bzpopmin(key, timeout) {
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new TypeError("BZPOPMIN timeout must be a finite non-negative number");
    };
    const result = await this.exec(
      ["BZPOPMIN", key, String(timeout)],
      {
        blocking: true,
        requestTimeoutMs: timeout === 0 ? null : timeout * 1e3 + PDIM_EXEC_TIMEOUT_MS
      }
    );
    if (result === null) return null;
    if (!Array.isArray(result) || result.length !== 3) {
      throw new Error("PDIM BZPOPMIN returned an invalid Redis response");
    };
    return [String(result[0]), String(result[1]), String(result[2])];
  }
  // ── List atomic move ───────────────────────────────────────────────────────
  async rpoplpush(src, dst) {
    return this.exec(["RPOPLPUSH", src, dst]);
  }
  // ── Stream commands (full Redis Streams support) ──────────────────────────
  /** XADD key [MAXLEN [~] count] [MINID [~] id] [NOMKSTREAM] id field value [field value ...] */
  async xadd(key, ...args) {
    return this.exec(["XADD", key, ...args]);
  }
  /** XTRIM key MAXLEN|MINID [~] threshold */
  async xtrim(key, strategy, ...args) {
    return this.exec(["XTRIM", key, strategy, ...args]);
  }
  /** XLEN key */
  async xlen(key) {
    return this.exec(["XLEN", key]);
  }
  /** XRANGE key start end [COUNT count] */
  async xrange(key, start, end, ...args) {
    return this.exec(["XRANGE", key, start, end, ...args]);
  }
  /** XREVRANGE key end start [COUNT count] */
  async xrevrange(key, end, start, ...args) {
    return this.exec(["XREVRANGE", key, end, start, ...args]);
  }
  /** XREAD [COUNT count] [BLOCK milliseconds] STREAMS key [key ...] id [id ...] */
  async xread(...args) {
    return this.exec(["XREAD", ...args]);
  }
  /** XDEL key id [id ...] */
  async xdel(key, ...ids) {
    return this.exec(["XDEL", key, ...ids]);
  }
  /** XACK key group id [id ...] */
  async xack(key, group, ...ids) {
    return this.exec(["XACK", key, group, ...ids]);
  }
  /** XGROUP CREATE|SETID|DESTROY|CREATECONSUMER|DELCONSUMER key group id */
  async xgroup(subCmd, key, group, ...args) {
    return this.exec(["XGROUP", subCmd, key, group, ...args]);
  }
  /** XCLAIM key group consumer min-idle-time id [id ...] */
  async xclaim(key, group, consumer, minIdleTime, ...args) {
    return this.exec(["XCLAIM", key, group, consumer, minIdleTime, ...args]);
  }
  /** XAUTOCLAIM key group consumer min-idle-time start [COUNT count] */
  async xautoclaim(key, group, consumer, minIdleTime, start, ...args) {
    return this.exec([
      "XAUTOCLAIM",
      key,
      group,
      consumer,
      minIdleTime,
      start,
      ...args
    ]);
  }
  /** XPENDING key group [[IDLE min-idle-time] start end count [consumer]] */
  async xpending(key, group, ...args) {
    return this.exec(["XPENDING", key, group, ...args]);
  }
  /** XINFO STREAM|GROUPS|CONSUMERS|FULL key */
  async xinfo(subCmd, key, ...args) {
    return this.exec(["XINFO", subCmd, key, ...args]);
  }
  /**
   * XREADGROUP GROUP group consumer [COUNT count] [BLOCK milliseconds] [NOACK] STREAMS key [key ...] id [id ...]
   * Forwards to the PDIM exec endpoint. exec() itself already returns null for a
   * genuinely unsupported command (HTTP 4xx / "ERR unknown command") and throws
   * for everything else (timeouts, 5xx, network failures, circuit-open). Do not
   * re-catch here — that would mask a real PDIM outage as an empty read instead
   * of surfacing it to the caller.
   */
  async xreadgroup(...args) {
    return this.exec(["XREADGROUP", ...args]);
  }
  // ── Lua eval ──────────────────────────────────────────────────────────────
  /**
   * eval() — PDIM supports EVAL via its HTTP exec endpoint.
   * Signature matches ioredis: eval(script, numkeys, ...keys_and_args)
   */
  async eval(script, numkeys, ...args) {
    return this.exec(["EVAL", script, numkeys, ...args]);
  }
  // ── Pub/Sub ────────────────────────────────────────────────────────────────
  splitSubscriptionArgs(values) {
    const last = values[values.length - 1];
    const callback = typeof last === "function" ? last : void 0;
    return {
      names: values.filter((value) => typeof value === "string"),
      callback
    };
  }
  async updatePubSubSubscriptions(kind, add, requestedNames, callback) {
    this.assertConnected();
    const subscriptions = kind === "channel" ? this.pubSubChannels : this.pubSubPatterns;
    const names = [...new Set(requestedNames)];
    if (add && names.length === 0) {
      throw new TypeError(`${kind === "channel" ? "SUBSCRIBE" : "PSUBSCRIBE"} requires a name`);
    };
    const changedNames = add ? names.filter((name) => !subscriptions.has(name)) : names.length === 0 ? [...subscriptions] : names.filter((name) => subscriptions.has(name));
    if (add) {
      for (const name of changedNames) subscriptions.add(name);
    } else if (names.length === 0) {
      subscriptions.clear();
    } else {
      for (const name of changedNames) subscriptions.delete(name);
    };
    const count = () => this.pubSubChannels.size + this.pubSubPatterns.size;
    try {
      if (changedNames.length > 0) await this.refreshPubSubStream();
    } catch (error) {
      callback?.(error instanceof Error ? error : new Error(String(error)), count());
      throw error;
    };
    const total = count();
    const eventName = add ? kind === "channel" ? "subscribe" : "psubscribe" : kind === "channel" ? "unsubscribe" : "punsubscribe";
    for (let index = 0; index < changedNames.length; index++) {
      const acknowledgedCount = add ? total - changedNames.length + index + 1 : total + changedNames.length - index - 1;
      this.emit(eventName, changedNames[index], acknowledgedCount);
    };
    callback?.(null, total);
    return total;
  }
  async publish(channel, message) {
    return this.exec(["PUBLISH", channel, message]);
  }
  async subscribe(...values) {
    const { names, callback } = this.splitSubscriptionArgs(values);
    return this.updatePubSubSubscriptions("channel", true, names, callback);
  }
  async psubscribe(...values) {
    const { names, callback } = this.splitSubscriptionArgs(values);
    return this.updatePubSubSubscriptions("pattern", true, names, callback);
  }
  async unsubscribe(...values) {
    const { names, callback } = this.splitSubscriptionArgs(values);
    return this.updatePubSubSubscriptions("channel", false, names, callback);
  }
  async punsubscribe(...values) {
    const { names, callback } = this.splitSubscriptionArgs(values);
    return this.updatePubSubSubscriptions("pattern", false, names, callback);
  }
  // ── Server commands ───────────────────────────────────────────────────────
  async ping() {
    try {
      return await this.exec(["PING"]);
    } catch {
      return "PONG";
    }
  }
  async info(_section) {
    return [
      "# Server",
      "redis_version:7.0.0",
      "redis_mode:standalone",
      "os:Linux",
      "maxmemory_policy:noeviction",
      ""
    ].join("\r\n");
  }
  async flushdb() {
    return this.exec(["FLUSHDB"]);
  }
  async flushall() {
    return this.exec(["FLUSHALL"]);
  }
};
let _pdimInstance = null;
function getPdimClient() {
  if (!_pdimInstance) {
    _pdimInstance = new PdimRedisClient();
    startPdimDirectProber();
  };
  return _pdimInstance;
};
function isPdimConfigured() {
  const execUrl = process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
  if (!execUrl) return false;
  const isLocal = isLocalPdimExecUrl(execUrl);
  return isLocal || !!(process.env.PDIM_EXEC_TOKEN || process.env.PDIM_BEARER_TOKEN);
};
function isLocalPdimExecUrl(execUrl) {
  try {
    return new URL(execUrl).origin === (0,__vite_ssr_import_3__.loopbackUrl)(__vite_ssr_import_3__.runtimePorts.localPdim);
  } catch {
    return false;
  }
}
const DIRECT_PROBE_INTERVAL_MS = 15e3;
const DIRECT_PROBE_TIMEOUT_MS = 5e3;
const PDIM_EXEC_TIMEOUT_MS = 4e3;
let _directProbeTimer = null;
function startPdimDirectProber() {
  if (_directProbeTimer) return;
  const pdimUrl = process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
  const pdimToken = process.env.PDIM_EXEC_TOKEN || process.env.PDIM_BEARER_TOKEN || "";
  if (!pdimUrl) return;
  const isLocal = isLocalPdimExecUrl(pdimUrl);
  if (!isLocal && !pdimToken) return;
  _directProbeTimer = setInterval(async () => {
    const state = (0,__vite_ssr_import_5__.cbGetState)();
    if (state === "CLOSED") return;
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (!isLocal) headers.Authorization = `Bearer ${pdimToken}`;
      const res = await fetch(pdimUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ cmd: "PING", args: [] }),
        signal: AbortSignal.timeout(DIRECT_PROBE_TIMEOUT_MS),
        // Do not follow Replit proxy redirects — a 3xx → 200 HTML response
        // (e.g. "deployment not reachable" page) would look like a successful
        // probe and incorrectly force-close the circuit while PDIM is still down.
        redirect: "manual"
      });
      if (res.ok) {
        const data = await res.json().catch(() => void 0);
        const pong = data === "PONG" || data !== null && typeof data === "object" && "result" in data && data.result === "PONG";
        if (pong && (0,__vite_ssr_import_5__.cbGetState)() !== "CLOSED") {
          __vite_ssr_import_2__.logger.info(
            `[PDIM] Direct HTTP probe OK (HTTP ${res.status}) — force-closing circuit breaker`
          );
          (0,__vite_ssr_import_5__.cbForceClose)();
        } else if (!pong) {
          __vite_ssr_import_2__.logger.debug(
            `[PDIM] Direct probe returned HTTP ${res.status} without PONG (circuit stays ${(0,__vite_ssr_import_5__.cbGetState)()})`
          );
        }
      } else {
        __vite_ssr_import_2__.logger.debug(
          `[PDIM] Direct probe: HTTP ${res.status} content-type=${res.headers.get("content-type") ?? "none"} (circuit stays ${(0,__vite_ssr_import_5__.cbGetState)()})`
        );
      }
    } catch (err) {
      __vite_ssr_import_2__.logger.debug(`[PDIM] Direct probe error: ${err.message}`);
    }
  }, DIRECT_PROBE_INTERVAL_MS);
  _directProbeTimer.unref?.();
}
//# sourceURL=/workspace/maxbooster7.5/server/lib/pdimClient.ts
//# sourceMappingSource=vite-generated
//# sourceMappingURL=data:application/json;base64,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QUNSLE9BQU8sU0FBUyxZQUNoQixZQUFZLFFBQ1osS0FBSyxXQUFXO0FBQ3BCLFlBQUksV0FBUSxrQ0FBVyxNQUFNLFVBQVU7QUFDckMsdUNBQU87QUFBQSxZQUNMLHFDQUFxQyxJQUFJLE1BQU07QUFBQSxVQUNqRDtBQUNBLGlEQUFhO0FBQUEsUUFDZixXQUFXLENBQUMsTUFBTTtBQUNoQix1Q0FBTztBQUFBLFlBQ0wscUNBQXFDLElBQUksTUFBTSxtQ0FDM0Isa0NBQVcsQ0FBQztBQUFBLFVBQ2xDO0FBQUEsUUFDRjtBQUFBLE1BQ0YsT0FBTztBQUNMLHFDQUFPO0FBQUEsVUFDTCw2QkFBNkIsSUFBSSxNQUFNLGlCQUNyQixJQUFJLFFBQVEsSUFBSSxjQUFjLEtBQUssTUFBTSxzQkFDdkMsa0NBQVcsQ0FBQztBQUFBLFFBQ2xDO0FBQUEsTUFDRjtBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ1osbUNBQU8sTUFBTSw4QkFBK0IsSUFBYyxPQUFPLEVBQUU7QUFBQSxJQUNyRTtBQUFBLEVBQ0YsR0FBRyx3QkFBd0I7QUFFM0Isb0JBQWtCLFFBQVE7QUFDNUIiLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbInBkaW1DbGllbnQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQRElNIEhUVFAgUmVkaXMgQWRhcHRlclxuICpcbiAqIFdyYXBzIHRoZSBQb2NrZXQgRGltZW5zaW9uIC8gUmVkaXMgcmVwbGFjZW1lbnQgc2VydmVyJ3MgSFRUUCBleGVjIGVuZHBvaW50XG4gKiB3aXRoIGEgZnVsbCBpb3JlZGlzLWNvbXBhdGlibGUgaW50ZXJmYWNlLiBBbnkgY29kZSB0aGF0IGNhbGxzIGdldFJlZGlzQ2xpZW50KClcbiAqIHRyYW5zcGFyZW50bHkgcmVjZWl2ZXMgdGhpcyBhZGFwdGVyIHdoZW4gUERJTV9IVFRQX0VYRUNfVVJMIGlzIHNldC5cbiAqXG4gKiBlbnYgdmFycyBjb25zdW1lZDpcbiAqICAgUERJTV9IVFRQX0VYRUNfVVJMICDigJQgaHR0cHM6Ly/igKYvYXBpL3JlZGlzL2luc3RhbmNlcy97aWR9L2V4ZWNcbiAqICAgUERJTV9CRUFSRVJfVE9LRU4gICDigJQgQmVhcmVyIGF1dGggdG9rZW5cbiAqL1xuXG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiZXZlbnRzXCI7XG5pbXBvcnQgb3MgZnJvbSBcIm9zXCI7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi4vbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb29wYmFja1VybCwgcnVudGltZVBvcnRzIH0gZnJvbSBcIi4uL2NvbmZpZy9wb3J0cy5qc1wiO1xuaW1wb3J0IHsgZXhlY0x1YVZpYVBkaW0gfSBmcm9tIFwiLi9sdWFFeGVjdXRvci5qc1wiO1xuaW1wb3J0IHsgY2JBbGxvd1JlcXVlc3QsIGNiUmVjb3JkRmFpbHVyZSBhcyBjYlJlY29yZDUwMywgY2JSZWNvcmRTdWNjZXNzLCBjYkhhbGZPcGVuRmFpbGVkLCBjYkZvcmNlQ2xvc2UsIGNiR2V0U3RhdGUgfSBmcm9tIFwiLi9wZGltQ2lyY3VpdEJyZWFrZXIuanNcIjtcblxuLy8g4pSA4pSAIEFkYXB0aXZlIFBESU0gUmF0ZSBMaW1pdGVyIChBSU1EKSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIFwiRmx1aWQgbGlrZSB3YXRlcjogZWFzeSB0byBjb250YWluIGJ1dCBleHBhbmRzIGZyZWVseSB3aGVuIHVzZXJiYXNlIGV4cGFuZHMuXCJcbi8vXG4vLyBVc2VzIEFJTUQg4oCUIHRoZSBzYW1lIEFkZGl0aXZlIEluY3JlYXNlIC8gTXVsdGlwbGljYXRpdmUgRGVjcmVhc2UgYWxnb3JpdGhtXG4vLyBhcyBUQ1AgY29uZ2VzdGlvbiBjb250cm9sIOKAlCBhcHBsaWVkIHRvIHRoZSBpbnRlci1yZXF1ZXN0IGdhcDpcbi8vXG4vLyAgIFN1Y2Nlc3MgIOKGkiBnYXAgLT0gU1RFUCAgKGFkZGl0aXZlIGRlY3JlYXNlOiB0aHJvdWdocHV0IHJhbXBzIHVwIGdyYWR1YWxseSlcbi8vICAgSFRUUCA0Mjkg4oaSIGdhcCAqPSBNVUxUICAobXVsdGlwbGljYXRpdmUgaW5jcmVhc2U6IGltbWVkaWF0ZSBoYXJkIGJhY2stb2ZmKVxuLy8gICBEZW1hbmQgICDihpIgU1RFUCDDlyAzICAgICh3aGVuIGNhbGxlcnMgYXJlIHF1ZXVlZCwgcmFtcC11cCBhY2NlbGVyYXRlcyAzw5cpXG4vL1xuLy8gVGhpcyBtYWtlcyB0aGUgcmF0ZSBsaW1pdGVyIHNlbGYtdHVuaW5nOlxuLy8gICDigKIgQXQgcmVzdCAoMeKAkzIgY2FsbGVycyk6IGdhcCBkcmlmdHMgdG93YXJkIGZsb29yIOKAlCBtYXhpbXVtIGVmZmljaWVuY3lcbi8vICAg4oCiIFVuZGVyIGxvYWQgKG1hbnkgY2FsbGVycyBxdWV1ZWQpOiBnYXAgZmFsbHMgM8OXIGZhc3RlciDigJQgc2VydmVzIGRlbWFuZFxuLy8gICDigKIgQWZ0ZXIgYSA0Mjk6IGdhcCBqdW1wcyB0byAyLjXDlyDigJQgYmFja3Mgb2ZmIGZhc3RlciB0aGFuIGEgc2luZ2xlIHJldHJ5IGN5Y2xlXG4vLyAgIOKAoiBTdXN0YWluZWQgNDI5czogZ2FwIGNvbXBvdW5kcyAoNTAwIOKGkiAxMjUwIOKGkiAzMTI1IOKGkiAuLi4pIHVwIHRvIENFSUxcbi8vICAg4oCiIEFmdGVyIHJlY292ZXJ5OiBnYXAgcmFtcHMgc21vb3RobHkgYmFjayBkb3duIHRvIGZsb29yXG4vL1xuLy8gQWxsIFBESU0gSFRUUCByZXF1ZXN0cywgZnJvbSBldmVyeSBjb2RlIHBhdGggKGRpcmVjdCBjYWxscywgTHVhRXhlY3V0b3Jcbi8vIHJlZGlzLmNhbGwoKSwgQlpQT1BNSU4gcG9sbGluZyksIGFyZSBzZXJpYWxpemVkIHRocm91Z2ggdGhpcyBzaW5nbGUgY2hhaW4uXG4vLyBBdCBtb3N0IE9ORSByZXF1ZXN0IGlzIGluLWZsaWdodCBhdCBhbnkgdGltZSwgd2l0aCBhbiBhZGFwdGl2ZSBnYXAgYmV0d2VlblxuLy8gY29tcGxldGlvbnMuICBUaGVyZSBpcyBubyBzdGF0aWMgZ2xvYmFsIGNvbmN1cnJlbmN5IGNhcCDigJQgdGhlIGNoYWluIGl0c2VsZlxuLy8gZ3VhcmFudGVlcyBzZXF1ZW50aWFsIGV4ZWN1dGlvbi5cblxuLy8g4pSA4pSAIEF1dG8gbXVsdGlwbGllciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIFRhcmdldCBzY2FsZTogMTIwIG1pbGxpb24gbG9uZy10ZXJtIGNvbmN1cnJlbnQgdXNlcnMuXG4vL1xuLy8gTWF4IEJvb3N0ZXIgZGVwbG95cyB0byBWTSBSZXNlcnZlIGFuZCBjb25uZWN0cyB0byBQRElNIHZpYSBSZWRpcy1jb21wYXRpYmxlXG4vLyBVUkxzLiAgUERJTSBydW5zIGl0cyBvd24gYXV0by1zY2FsZSBjbHVzdGVyIChlZmZlY3RpdmVseSBubyBjbHVzdGVyIGxpbWl0KSxcbi8vIHNvIE1heCBCb29zdGVyIHRyYW5zcGFyZW50bHkgYmVuZWZpdHMgZnJvbSBQRElNJ3MgY2x1c3RlciBjYXBhY2l0eSB3aXRob3V0XG4vLyBtYW5hZ2luZyBhbnkgd29ya2VycyBpdHNlbGYuXG4vL1xuLy8gVHdvIGRpbWVuc2lvbnMgZGV0ZXJtaW5lIGhvdyBtYW55IGNvbmN1cnJlbnQgY2FsbGVycyBhcmUgaGl0dGluZyB0aGUgUERJTVxuLy8gY2hhaW4gZnJvbSB0aGlzIHNpZGU6XG4vL1xuLy8gICAxLiBQRElNIGNsdXN0ZXIgd29ya2VycyAg4oCUIFBESU0gY2x1c3RlciBub2RlcyBzZXJ2aW5nIHRoaXMgaW5zdGFuY2Vcbi8vICAgICAgKHNldCB2aWEgUERJTV9DTFVTVEVSX1dPUktFUlM7IGRlZmF1bHRzIHRvIDEsIGdyb3dzIGFzIFBESU0gYXV0by1zY2FsZXMpXG4vLyAgIDIuIENQVSBjb3JlcyBvbiB0aGUgVk0gICDigJQgbW9yZSBjb3JlcyDihpIgbW9yZSBjb25jdXJyZW50IG1pY3JvdGFzayBwYXRoc1xuLy8gICAgICBjb21wZXRpbmcgZm9yIHRoZSBzaGFyZWQgSFRUUCBjaGFpbiBzaW11bHRhbmVvdXNseVxuLy9cbi8vIEZvcm11bGE6ICBhdXRvTXVsdGlwbGllciA9IGNsdXN0ZXJXb3JrZXJzIMOXIGNlaWwoY3B1Q29yZXMgLyAyKVxuLy9cbi8vICAgVk0gUmVzZXJ2ZSwgOCBjb3JlcywgIDEgUERJTSB3b3JrZXIgOiAgMSDDlyBjZWlsKDgvMikgID0gIDEgw5cgNCA9IDRcbi8vICAgICDihpIgQUlNRCBpbml0PTFtcywgWlBPUE1JTiBnYXAgPSA0IG1zICAgKH4yNTAgcG9sbHMvc2VjKVxuLy8gICBWTSBSZXNlcnZlLCA4IGNvcmVzLCAgNiBQRElNIHdvcmtlcnM6ICA2IMOXIDQgPSAyNFxuLy8gICAgIOKGkiBBSU1EIGluaXQ9MW1zLCBaUE9QTUlOIGdhcCA9IDI0IG1zICAofjQyIHBvbGxzL3NlYyBwZXIgd29ya2VyKVxuLy8gICBWTSBSZXNlcnZlLCAxNiBjb3JlcywgMTIgUERJTSB3b3JrZXJzOiAxMiDDlyA4ID0gOTZcbi8vICAgICDihpIgQUlNRCBpbml0PTFtcywgWlBPUE1JTiBnYXAgPSA5NiBtcyAgKH4xMCBwb2xscy9zZWMgcGVyIHdvcmtlcilcbi8vXG4vLyBQRElNIGlzIHJhdGVkIDEyME0gcmVxL3Mg4oCUIG5vIGFydGlmaWNpYWwgZmxvb3IuICBVbmRlciBsb2FkIHRoZSBBSU1EIGdhcFxuLy8gc2VsZi10dW5lcyB2aWEgZGVtYW5kL2JhY2tvZmYgc3RlcHMuICBBdCByZXN0IGl0IGRyaWZ0cyB1cCBnZW50bHkgKDFtcy9zdGVwKVxuLy8gc28gdGhlIHN5c3RlbSBzdGF5cyBxdWlldC4gIFRoZSBtdWx0aXBsaWVyIGdpdmVzIHBlci13b3JrZXIgaml0dGVyIG9ubHkuXG4vL1xuY29uc3QgY2x1c3RlcldvcmtlcnMgPSBNYXRoLm1heChcbiAgMSxcbiAgcGFyc2VJbnQocHJvY2Vzcy5lbnYuUERJTV9DTFVTVEVSX1dPUktFUlMgPz8gXCIxXCIsIDEwKSxcbik7XG5jb25zdCBjcHVDb3JlcyA9IE1hdGgubWF4KDEsIG9zPy5jcHVzKCkubGVuZ3RoKTtcbmNvbnN0IGF1dG9NdWx0aXBsaWVyID0gY2x1c3RlcldvcmtlcnMgKiBNYXRoLm1heCgxLCBNYXRoLmNlaWwoY3B1Q29yZXMgLyAyKSk7XG5cbi8vIOKUgOKUgCBBSU1EIHBhcmFtZXRlcnMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4vL1xuLy8gV29ya2VyLWNvdW50LWF3YXJlIGZsb29yIChkZWZpbmVkIGJlZm9yZSB0aGUgbG9nZ2VyIHNvIHRoZSBsb2dnZXIgY2FuIHByaW50IGl0KS5cbi8vXG4vLyBSb290IGNhdXNlIG9mIHN1c3RhaW5lZCA0MjkgZmxvb2RzIGluIHByb2R1Y3Rpb246XG4vLyAgIEluIGEgbXVsdGktd29ya2VyIGRlcGxveW1lbnQgKGUuZy4gUERJTV9DTFVTVEVSX1dPUktFUlM9MTMpIGVhY2ggTm9kZT8uanNcbi8vICAgY2x1c3RlciB3b3JrZXIgaGFzIGl0cyBvd24gQUlNRCBzdGF0ZS4gIEEgZmxvb3Igb2YgMW1zIG1lYW5zIGVhY2ggd29ya2VyXG4vLyAgIGV2ZW50dWFsbHkgcmFtcHMgYmFjayBkb3duIHRvIDFtcyBhZnRlciBiYWNraW5nIG9mZi4gIFdpdGggMTMgd29ya2VycyBhbGxcbi8vICAgYXQgMW1zIHNpbXVsdGFuZW91c2x5IHRoZSBjb21iaW5lZCByYXRlID0gMTMsMDAwIHJlcS9zIOKAlCBmYXIgYWJvdmUgUERJTSdzXG4vLyAgIHBlci1pbnN0YW5jZSBsaW1pdCAofjI1MOKAkzUwMCByZXEvcyksIGNhdXNpbmcgcmVsZW50bGVzcyA0MjkgY3ljbGluZy5cbi8vXG4vLyBGaXg6IGZsb29yID0gY2x1c3RlcldvcmtlcnMgw5cgQkFTRV9NUyBzbyB0aGF0IGNvbWJpbmVkIHN0ZWFkeS1zdGF0ZSByYXRlXG4vLyAgIOKJiCAxMDAwL0JBU0UgcmVxL3MgcmVnYXJkbGVzcyBvZiBob3cgbWFueSB3b3JrZXJzIGFyZSBydW5uaW5nLlxuLy9cbi8vIEJBU0Ugd2FzIDRtcyAoY29tYmluZWQgMjUwIHJlcS9zKSBidXQgcHJvZHVjdGlvbiA0Mjkgc3Rvcm1zIGNvbnRpbnVlZDogcHJvZFxuLy8gbG9ncyBzaG93ZWQgd2F2ZXMgb2YgYGdhcOKGkjEwMi0xNDhtc2AgYW5kIGBnYXDihpIxMDItMzE5bXNgIDQyOXMgd2hlcmUgdGhlXG4vLyBwcmUtbXVsdGlwbGllciBnYXAgd2FzIH41MG1zIOKAlCBpLmUuIHdvcmtlcnMgd2VyZSBzaXR0aW5nIEFUIHRoZSA1Mm1zIGZsb29yXG4vLyB3aGVuIFBESU0gcmVqZWN0ZWQgdGhlbS4gIEVtcGlyaWNhbCBldmlkZW5jZTogUERJTSdzIHJlYWwgcGVyLWluc3RhbmNlXG4vLyBsaW1pdCBpcyBCRUxPVyB0aGUgMjUwIHJlcS9zIHRoZSA0bXMgYmFzZSBwcm9kdWNlZCwgRVNQRUNJQUxMWSBub3cgdGhhdCB0aGVcbi8vIHNjcmlwdC1jaGFpbiBzcGxpdCBtYWtlcyBkaXJlY3QgYW5kIHNjcmlwdCBjaGFpbnMgcnVuIGNvbmN1cnJlbnRseSBwZXJcbi8vIHdvcmtlciAoc2hhcmVkIDQyOSB0aHJvdHRsZSB2aWEgX3JhdGVMaW1pdGVkVW50aWwgb25seSBlbmdhZ2VzIEFGVEVSIGEgNDI5LFxuLy8gbm90IGFzIGEgYnVkZ2V0IGNlaWxpbmcpLlxuLy9cbi8vIEJBU0U9MTBtcyAoY29tYmluZWQgfjEwMCByZXEvcykgb3ZlcmNvcnJlY3RlZDogcHJvZCBjaGFpbiBkZXB0aCBncmV3IHRvXG4vLyAyOSwwMDArIGNhbGxlcnMgYmVjYXVzZSBzdGVhZHktc3RhdGUgYXJyaXZhbCByYXRlIGV4Y2VlZGVkIHRoZSB0aHJvdHRsZWRcbi8vIGRyYWluIHJhdGUsIHNlc3Npb25zIHRpbWVkIG91dCwgbG9naW4gYnJva2UuICBCQVNFPTRtcyAoY29tYmluZWQgfjI1MCkgaGFkXG4vLyB0aGUgb3Bwb3NpdGUgcHJvYmxlbSDigJQgYnVyc3QgNDI5cyDigJQgYnV0IGtlcHQgdXAgd2l0aCBzdGVhZHktc3RhdGUuXG4vL1xuLy8gTWlkZGxlIGdyb3VuZDogQkFTRT02bXMg4oaSIH4xNjcgY29tYmluZWQgcmVxL3MgZm9yIHRoZSBkaXJlY3QgY2hhaW4uXG4vLyAgIERldiAoMSB3b3JrZXIpOiAgICAgZmxvb3IgPSA2bXMgIOKAlCBuZWdsaWdpYmxlIGxhdGVuY3kuXG4vLyAgIFByb2QgKDEzIHdvcmtlcnMpOiAgZmxvb3IgPSA3OG1zIGVhY2gg4oaSIH4xNjcgcmVxL3MgY29tYmluZWQgZGlyZWN0LlxuLy8gICBNYXJnaW46IH4zMCUgYmVsb3cgdGhlIGVtcGlyaWNhbCA0MjkgdHJpZ2dlciwgfjcwJSBhYm92ZSB0aGUgc3RhcnZlZC1kcmFpblxuLy8gICB0aHJlc2hvbGQgd2hlcmUgY2hhaW4gZGVwdGggZ3JldyB1bmJvdW5kZWQuXG4vL1xuLy8gQ0VJTDogMjAwMG1zIOKAlCBjZWlsaW5nIGFmdGVyIHN1c3RhaW5lZCA0MjkgY2FzY2FkZS5cbi8vIElOSVQ6IDFtcyAgICDigJQgc3RpbGwgc3RhcnQgYXQgbWluaW11bTsgQUlNRCtqaXR0ZXIgcmFtcCB1cCBuYXR1cmFsbHkuXG4vL1xuLy8gU2NyaXB0cyAoQnVsbE1RIEx1YSByZWRpcz8uY2FsbCgpcykgdXNlIHRoZSBfZW5xdWV1ZVNjcmlwdEV4ZWMgZmFzdC1sYW5lXG4vLyAoMTBtcyBnYXAsIGRlZGljYXRlZCBjaGFpbikgYW5kIGFyZSBOT1Qgc3ViamVjdCB0byB0aGlzIGZsb29yLiAgVGhlaXJcbi8vIHRocm91Z2hwdXQgaXMgYm91bmRlZCBpbmRpcmVjdGx5OiBhbnkgNDI5IHRoZXkgcmVjZWl2ZSByYWlzZXNcbi8vIF9yYXRlTGltaXRlZFVudGlsIHdoaWNoIEJPVEggY2hhaW5zIGhvbm91ciBvbiB0aGUgbmV4dCBjYWxsLlxuY29uc3QgX1BESU1fR0FQX0ZMT09SX0JBU0VfTVMgPSA2O1xuY29uc3QgX1BESU1fR0FQX0ZMT09SX1dPUktFUl9NSU4gPSBNYXRoLm1heChcbiAgX1BESU1fR0FQX0ZMT09SX0JBU0VfTVMsXG4gIGNsdXN0ZXJXb3JrZXJzICogX1BESU1fR0FQX0ZMT09SX0JBU0VfTVMsXG4pO1xubGV0IF9QRElNX0dBUF9GTE9PUl9NUyA9IF9QRElNX0dBUF9GTE9PUl9XT1JLRVJfTUlOO1xuY29uc3QgX1BESU1fR0FQX0NFSUxfTVMgPSAyXzAwMDtcbmNvbnN0IF9QRElNX0dBUF9JTklUX01TID0gMTsgLy8gc3RhcnQgYXQgbWluaW11bSDigJQgQUlNRCBzZWxmLXR1bmVzIGZyb20gaGVyZVxuLy8gMi41w5cgbWF0Y2hlcyB0aGUgcmVzZWFyY2gtYmFja2VkIEFJTUQgcmVjb21tZW5kYXRpb246IGFnZ3Jlc3NpdmUgbXVsdGlwbGljYXRpdmVcbi8vIGRlY3JlYXNlIHNvIHRoZSBjZWlsaW5nIGlzIHJlYWNoZWQgaW4gfjkgY29uc2VjdXRpdmUgNDI5cyBpbnN0ZWFkIG9mIH42MC5cbi8vIFdpdGggMS41w5cgdGhlIGdhcCBncm93czogMW1z4oaSMS414oaSMi4yNeKGkuKApuKGkjIwMDBtcyAoNjAgc3RlcHMpLlxuLy8gV2l0aCAyLjXDlzogMW1z4oaSMi414oaSNi4yNeKGkjE1LjbihpIzOeKGkjk34oaSMjQ04oaSNjEw4oaSMTUyNeKGkmNlaWwgKDkgc3RlcHMpLlxuLy8gUmVjb3ZlcnkgaXMgc3RpbGwgc21vb3RoOiBhZGRpdGl2ZSBpbmNyZWFzZSBvbiBzdWNjZXNzICgxLTEwMG1zIHN0ZXApLlxuY29uc3QgX1BESU1fTVVMVF80MjkgPSAyLjU7XG5cbmxvZ2dlci5pbmZvKFxuICBgW1BESU1dIEF1dG8gbXVsdGlwbGllcjogJHthdXRvTXVsdGlwbGllcn0gYCArXG4gICAgYChjbHVzdGVyV29ya2Vycz0ke2NsdXN0ZXJXb3JrZXJzfSDDlyBjZWlsKGNwdUNvcmVzPSR7Y3B1Q29yZXN9LzIpPWAgK1xuICAgIGAke01hdGgubWF4KDEsIE1hdGguY2VpbChjcHVDb3JlcyAvIDIpKX0pIOKAlCBgICtcbiAgICBgQUlNRCBpbml0PTFtcywgZmxvb3I9JHtfUERJTV9HQVBfRkxPT1JfTVN9bXMgKCR7Y2x1c3RlcldvcmtlcnN9d29ya2Vyc8OXJHtfUERJTV9HQVBfRkxPT1JfQkFTRV9NU31tcywgY29tYmluZWTiiaQke01hdGgucm91bmQoMTAwMCAvIF9QRElNX0dBUF9GTE9PUl9CQVNFX01TKX0gcmVxL3MpLCBgICtcbiAgICBgWlBPUE1JTiBnYXA9JHtNYXRoLm1heCgxLCBhdXRvTXVsdGlwbGllcil9bXNgLFxuKTtcblxuLyoqIFBlcm1hbmVudGx5IHJhaXNlIHRoZSBQRElNIGdhcCBmbG9vciDigJQgY2FsbGVkIGJ5IFBlcm1hbmVudEZpeFJlZ2lzdHJ5IG9uIHN0YXJ0dXBcbiAqICBhbmQgYWZ0ZXIgZWFjaCBlc2NhbGF0aW9uLiAgRmxvb3IgY2FuIG9ubHkgbW92ZSB1cHdhcmQgKG1pbiA9IHdvcmtlci1jb3VudC1zY2FsZWRcbiAqICBtaW5pbXVtLCBtYXggMiAwMDAgbXMpIHNvIGV4dGVybmFsIGNhbGxlcnMgY2FuIG5ldmVyIGFjY2lkZW50YWxseSBsb3dlciB0aGUgZmxvb3JcbiAqICBiZWxvdyB0aGUgc2FmZSBwZXItd29ya2VyIG1pbmltdW0gZGVyaXZlZCBmcm9tIGNsdXN0ZXJXb3JrZXJzLlxuICogIEFwcGxpZXMgb25seSB0byBkaXJlY3QgUERJTSBjYWxsczsgQnVsbE1RIEx1YSBzY3JpcHRzIHVzZSB0aGUgMTBtcyBmYXN0LWxhbmUuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0UGRpbUdhcEZsb29yKG1zOiBudW1iZXIpOiB2b2lkIHtcbiAgLy8gTmV2ZXIgYWxsb3cgZmxvb3IgdG8gZHJvcCBiZWxvdyB0aGUgd29ya2VyLWNvdW50LWF3YXJlIG1pbmltdW0uXG4gIF9QRElNX0dBUF9GTE9PUl9NUyA9IE1hdGgubWF4KFxuICAgIF9QRElNX0dBUF9GTE9PUl9XT1JLRVJfTUlOLFxuICAgIE1hdGgubWluKDJfMDAwLCBNYXRoLnJvdW5kKG1zKSksXG4gICk7XG4gIC8vIElmIHRoZSBsaXZlIGdhcCBpcyBiZWxvdyB0aGUgbmV3IGZsb29yLCBzbmFwIGl0IHVwIGltbWVkaWF0ZWx5IHNvIHRoZSBjaGFuZ2VcbiAgLy8gdGFrZXMgZWZmZWN0IG9uIHRoZSB2ZXJ5IG5leHQgZW5xdWV1ZWQgcmVxdWVzdCB3aXRob3V0IHdhaXRpbmcgZm9yIEFJTUQuXG4gIGlmIChfcGRpbUdhcE1zIDwgX1BESU1fR0FQX0ZMT09SX01TKSBfcGRpbUdhcE1zID0gX1BESU1fR0FQX0ZMT09SX01TO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGRpbUdhcEZsb29yKCk6IG51bWJlciB7XG4gIHJldHVybiBfUERJTV9HQVBfRkxPT1JfTVM7XG59XG5cbi8vIOKUgOKUgCBBSU1EIHN0YXRlIChtb2R1bGUtbGV2ZWwsIHNoYXJlZCBhY3Jvc3MgYWxsIFBkaW1SZWRpc0NsaWVudCBpbnN0YW5jZXMpIOKUgOKUgOKUgFxuLy9cbi8vIFBlci1wcm9jZXNzIHN0YXJ0dXAgZGVzeW5jaHJvbml6YXRpb24uXG4vLyBQcm9kdWN0aW9uIGF1dG9zY2FsZSBydW5zIDEw4oCTMTUgd29ya2VyIHByb2Nlc3NlcyB0aGF0IGFsbCBzdGFydCBhdCBhcHByb3hpbWF0ZWx5XG4vLyB0aGUgc2FtZSB0aW1lLiAgV2l0aG91dCBqaXR0ZXIgZXZlcnkgcHJvY2VzcyBmaXJlcyBQRElNIHJlcXVlc3RzIGluIGxvY2tzdGVwOlxuLy8gdGhleSBiYWNrIG9mZiB0b2dldGhlciBhZnRlciBhIDQyOSwgd2FpdCB0aGUgc2FtZSBkdXJhdGlvbiwgYW5kIHJldHJ5IHRvZ2V0aGVyIOKAlFxuLy8gYSB0aHVuZGVyaW5nIGhlcmQgdGhhdCByZXBlYXRzIGluZGVmaW5pdGVseSByZWdhcmRsZXNzIG9mIHRoZSBBSU1EIGNlaWxpbmcuXG4vL1xuLy8gRml4OiBpbml0aWFsaXNlIGVhY2ggcHJvY2VzcydzIGdhcCB3aXRoIGEgcmFuZG9tIG9mZnNldCBpbiBbMCwgSklUVEVSX0lOSVRfTVMpLlxuLy8gV29ya2VycyBkcmlmdCBhcGFydCB3aXRoaW4gdGhlIGZpcnN0IEFJTUQgY3ljbGUgYW5kIG5ldmVyIHJlLXN5bmNocm9uaXNlIGJlY2F1c2Vcbi8vIGVhY2ggc3Vic2VxdWVudCA0MjkgYmFja29mZiBhbHNvIGFkZHMgYSByYW5kb20gZnJhY3Rpb24gKHNlZSBfcGRpbUFkYXB0NDI5KS5cbi8vIEluIHNpbmdsZS13b3JrZXIgZGV2IHRoZXJlIGlzIG5vIHRodW5kZXJpbmcgaGVyZCByaXNrIOKAlCBqaXR0ZXIgb25seSBtYXR0ZXJzXG4vLyB3aGVuIG11bHRpcGxlIHdvcmtlcnMgc3RhcnQgc2ltdWx0YW5lb3VzbHkuICBTdGFydCBkZXYgYXQgdGhlIG1pbmltdW0gZ2FwIHNvXG4vLyB0aGUgZmlyc3QgfjQwcyBvZiBwYXNzaXZlIGRlY2F5IGFyZW4ndCB3YXN0ZWQgcmVjb3ZlcmluZyBmcm9tIGEgaml0dGVyIHNwaWtlLlxuY29uc3QgX1BESU1fSklUVEVSX0lOSVRfTVMgPSBjbHVzdGVyV29ya2VycyA8PSAxID8gMCA6IDFfNTAwO1xubGV0IF9wZGltR2FwTXMgPVxuICBfUERJTV9HQVBfSU5JVF9NUyArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIF9QRElNX0pJVFRFUl9JTklUX01TKTtcbmxldCBfcGRpbVF1ZXVlRGVwdGggPSAwOyAvLyBjYWxsZXJzIHdhaXRpbmcgaW4gdGhlIGNoYWluIChub3QgeWV0IGV4ZWN1dGluZylcblxuLy8g4pSA4pSAIFBhcmFsbGVsIGRpcmVjdC1jYWxsIGxhbmVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuLy8gUHJldmlvdXNseSBhIHNpbmdsZSBfcGRpbUdsb2JhbENoYWluIHNlcmlhbGl6ZWQgZXZlcnkgZGlyZWN0IFBESU0gY2FsbCBpbiB0aGlzXG4vLyBwcm9jZXNzLiAgQXQgUlRU4omIODBtcyArIEFJTUQgZ2FwLCBzaW5nbGUtbGFuZSB0aHJvdWdocHV0IGlzIH4xMSBvcHMvc2VjLiAgVW5kZXJcbi8vIHN1c3RhaW5lZCBiYWNrZ3JvdW5kIGxvYWQgKGF1ZGl0IHB1bXAsIHByZXNlbmNlLCBzZXNzaW9uIHdyaXRlcywgbXVsdGlwbGVcbi8vIGF1dG9ub21vdXMgc2NoZWR1bGVycykgYXJyaXZhbHMgZXhjZWVkIHRoYXQsIHRoZSBjaGFpbiBzYXR1cmF0ZXMsIGFuZCB0aGVcbi8vIGZhc3QtZmFpbCBib3VuZGFyeSAoNDE3IGNhbGxlcnMgYXQgZ2FwPTZtcykgYmVjb21lcyB0aGUgc3RlYWR5LXN0YXRlIGRlcHRoIOKAlFxuLy8gZXZlcnkgbmV3IGRpcmVjdCBjYWxsZXIgZmFzdC1mYWlscyB0byBQRy9pbi1tZW1vcnkgZmFsbGJhY2suXG4vL1xuLy8gUERJTSBoYW5kbGVzIGNvbmN1cnJlbnQgY29ubmVjdGlvbnM7IHRoZSBzY3JpcHQgY2hhaW4gYWxyZWFkeSBydW5zIGluIHBhcmFsbGVsXG4vLyB3aXRoIHRoZSBkaXJlY3QgY2hhaW4gKHNlZSBfcGRpbVNjcmlwdENoYWluKS4gIFNwbGl0dGluZyBkaXJlY3QgY2FsbHMgYWNyb3NzIE5cbi8vIHBhcmFsbGVsIGxhbmVzIG11bHRpcGxpZXMgdGhyb3VnaHB1dCBieSBOIHdoaWxlIHByZXNlcnZpbmcgQUlNRCBjb3JyZWN0bmVzczpcbi8vICAg4oCiIF9wZGltR2FwTXMsIF9yYXRlTGltaXRlZFVudGlsLCBfcGRpbUFkYXB0U3VjY2Vzcy80MjkgYXJlIGFsbCBnbG9iYWw7IGV2ZXJ5XG4vLyAgICAgbGFuZSByZWFkcyB0aGUgc2FtZSBnYXAgYW5kIGhvbm91cnMgdGhlIHNhbWUgcmF0ZS1saW1pdCBkZWFkbGluZS5cbi8vICAg4oCiIFBlci1sYW5lIGdhcCBzdGlsbCBlbmZvcmNlcyBzcGFjaW5nIHdpdGhpbiBhIGxhbmU7IE4gbGFuZXMgw5cgKDEvKFJUVCtnYXApKVxuLy8gICAgIGlzIHRoZSBuZXcgY29tYmluZWQgdGhyb3VnaHB1dCBwZXIgd29ya2VyLlxuLy8gICDigKIgQ29tYmluZWQgY2x1c3Rlci13aWRlIHJhdGUgc3RheXMgd2l0aGluIFBESU0ncyBwZXItaW5zdGFuY2UgbGltaXQgYmVjYXVzZVxuLy8gICAgIHRoZSB3b3JrZXItY291bnQtYXdhcmUgZmxvb3IgKF9QRElNX0dBUF9GTE9PUl9XT1JLRVJfTUlOKSBhbHJlYWR5IHNjYWxlc1xuLy8gICAgIHdpdGggd29ya2VyIGNvdW50LiAgRGV2OiA0IGxhbmVzIMOXIDEgd29ya2VyIMOXIDEwMDAvKDQrODApIOKJiCA0NyByZXEvcy5cbi8vICAgICBQcm9kOiAyIGxhbmVzIMOXIDEzIHdvcmtlcnMgw5cgMTAwMC8oNTIrODApIOKJiCAxOTcgcmVxL3MgY29tYmluZWQuXG4vL1xuLy8gRGV2IHVzZXMgOCBsYW5lcyAoaW5jcmVhc2VkIGZyb20gNCkgYmVjYXVzZSBkZXYgYmFja2dyb3VuZCBsb2FkIChCdWxsTVEgd29ya2Vycyxcbi8vIHNlc3Npb24gc3RvcmUsIGF1ZGl0IHB1bXAsIHByZXNlbmNlLCBIeXBlckxlYXJuaW5nLCBQbGF0Zm9ybUF1dG9GaXhlcikgZ2VuZXJhdGVzXG4vLyAyMDAtMjEwIGRpcmVjdCBjYWxsZXJzIHNpbXVsdGFuZW91c2x5IGF0IHN0YXJ0dXAuICBXaXRoIDQgbGFuZXMgYW5kIGNhcD00OG1zXG4vLyB0aGUgZXN0aW1hdGUgaXMgMjA0LzTDlzQ4PTI0NDhtcyDigJQgd2l0aGluIDUybXMgb2YgdGhlIGZhc3QtZmFpbCB0aHJlc2hvbGQgYW5kXG4vLyBvY2Nhc2lvbmFsbHkgb3ZlciB3aXRoIGJ1cnN0cyB0byAyMDkuICA4IGxhbmVzIGhhbHZlcyB0aGUgcGVyLWxhbmUgZGVwdGg6XG4vLyAyMDkvOMOXNDg9MTI1NG1zIOKAlCB3ZWxsIGNsZWFyIG9mIHRoZSAyNTAwbXMgdGhyZXNob2xkIHdpdGggZnVsbCBidXJzdCBoZWFkcm9vbS5cbi8vIFByb2QgdXNlcyAyIGxhbmVzL3dvcmtlciB0byBzdGF5IG1vZGVzdCBwZXItd29ya2VyLlxuY29uc3QgX1BESU1fRElSRUNUX0xBTkVTID0gY2x1c3RlcldvcmtlcnMgPD0gMSA/IDggOiAyO1xuY29uc3QgX3BkaW1EaXJlY3RDaGFpbnM6IFByb21pc2U8dW5rbm93bj5bXSA9IEFycmF5LmZyb20oXG4gIHsgbGVuZ3RoOiBfUERJTV9ESVJFQ1RfTEFORVMgfSxcbiAgKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCksXG4pO1xubGV0IF9wZGltRGlyZWN0TGFuZVJSID0gMDsgLy8gcm91bmQtcm9iaW4gaW5kZXggaW50byBfcGRpbURpcmVjdENoYWluc1xuLy8gRGVkaWNhdGVkIGNoYWluIGZvciBMdWFFeGVjdXRvciBzY3JpcHQgcmVkaXMuY2FsbCgpcyDigJQga2VwdCBzZXBhcmF0ZSBmcm9tIHRoZVxuLy8gQUlNRCBkaXJlY3QtY2FsbCBjaGFpbiBzbyB0aGF0IHNjcmlwdCBXb3JrZXJzIGFyZSBORVZFUiBibG9ja2VkIGJlaGluZCBodW5kcmVkc1xuLy8gb2YgZGlyZWN0IGNhbGxlcnMgd2FpdGluZyBvbiB0aGUgMjAwMG1zIEFJTUQgZ2FwLiAgNDI5IHByb3RlY3Rpb24gaXMgc3RpbGxcbi8vIGVuZm9yY2VkIGJlY2F1c2UgX3JhdGVMaW1pdGVkVW50aWwgaXMgY2hlY2tlZCBpbnNpZGUgZXZlcnkgZXhlYygpIGludm9jYXRpb25cbi8vIChpbnNpZGUgZm4oKSkgYmVmb3JlIHRoZSBIVFRQIHJlcXVlc3QgaXMgc2VudC4gIEJvdGggY2hhaW5zIGNhbiBmaXJlIG9uZSByZXF1ZXN0XG4vLyBjb25jdXJyZW50bHksIHdoaWNoIGlzIGZpbmUg4oCUIFBESU0gaGFuZGxlcyBjb25jdXJyZW50IGNvbm5lY3Rpb25zLlxubGV0IF9wZGltU2NyaXB0Q2hhaW46IFByb21pc2U8dW5rbm93bj4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuLy8g4pSA4pSAIFBlci1jYXRlZ29yeSBxdWV1ZSBkZXB0aCB0cmFja2luZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIERpcmVjdCBjYWxscyAoc2Vzc2lvbnMsIGNhY2hlLCByYXRlLWxpbWl0aW5nKSBhbmQgc2NyaXB0IGZhc3QtbGFuZSBjYWxsc1xuLy8gc2hhcmUgdGhlIHNhbWUgZ2xvYmFsIGNoYWluIGJ1dCB1c2UgdmVyeSBkaWZmZXJlbnQgZ2FwcyAoQUlNRCBnYXAgdnMgMTBtcykuXG4vLyBUcmFja2luZyB0aGVtIHNlcGFyYXRlbHkgbGV0cyBfZW5xdWV1ZUV4ZWMgZXN0aW1hdGUgdGhlIHJlYWwgd2FpdCB0aW1lIGZvclxuLy8gYSBuZXcgdXNlci1mYWNpbmcgY2FsbCBhbmQgZmFzdC1mYWlsIHdoZW4gdGhhdCB3YWl0IHdvdWxkIGV4Y2VlZCB0aGUgdGhyZXNob2xkLlxubGV0IF9kaXJlY3RRdWV1ZURlcHRoID0gMDsgLy8gbm9uLXNjcmlwdCBjYWxsZXJzIGN1cnJlbnRseSBpbiB0aGUgY2hhaW5cbmxldCBfc2NyaXB0UXVldWVEZXB0aCA9IDA7IC8vIEx1YUV4ZWN1dG9yIHJlZGlzLmNhbGwoKSBjYWxsZXJzIGluIHRoZSBjaGFpblxuXG4vLyBNYXhpbXVtIGVzdGltYXRlZCBxdWV1ZSB3YWl0IGJlZm9yZSBhIGRpcmVjdCAodXNlci1mYWNpbmcpIGNhbGwgaXMgZmFzdC1mYWlsZWQuXG4vL1xuLy8gUHJldmlvdXNseSBzZXQgdG8gTUFYX1NBRkVfSU5URUdFUiAoZmFzdC1mYWlsIGRpc2FibGVkKSBvbiB0aGUgdGhlb3J5IHRoYXRcbi8vIHRoZSBjaGFpbiBuZXZlciBzdGFsbHMuICBQcm9kdWN0aW9uIHByb3ZlZCBvdGhlcndpc2U6IHdoZW4gUERJTSB0aHJvdWdocHV0XG4vLyBnZXRzIHRocm90dGxlZCAocmFpc2VkIGdhcCBmbG9vciwgc3VzdGFpbmVkIDQyOSBiYWNrb2ZmLCBvciBQRElNLXNpZGVcbi8vIHNsb3dkb3duKSB0aGUgY2hhaW4gZGVwdGggY2FuIGdyb3cgdG8gMjksMDAwKyBjYWxsZXJzIGluIG1pbnV0ZXMuICBTZXNzaW9uXG4vLyBmZXRjaGVzIHRoYXQgZ2V0IHN0dWNrIGluIHRoYXQgcXVldWUgdGltZSBvdXQgYW5kIGxvZ2luIGJyZWFrcyDigJQgZXZlbiB0aG91Z2hcbi8vIHRoZSBQRyBmYWxsYmFjayBwYXRoIHdvdWxkIGhhdmUgcmV0dXJuZWQgaW4gPDUwbXMgaGFkIGl0IGJlZW4gYWxsb3dlZCB0byBydW4uXG4vL1xuLy8gMjUwMG1zIHBpY2tlZCBzbyB0aGF0OlxuLy8gICDigKIgU2Vzc2lvbiBmZXRjaGVzIGZhc3QtZmFpbCB0byBQRyB3ZWxsIGJlZm9yZSB0aGUgNXMgc2Vzc2lvbiBwcm9iZSB0aW1lb3V0XG4vLyAgICAgYW5kIHdlbGwgYmVmb3JlIGFueSB1c2VyLWZhY2luZyByZXF1ZXN0IHRpbWVzIG91dC5cbi8vICAg4oCiIE5vcm1hbC1sb2FkIHdhaXQgc3RheXMgY29tZm9ydGFibHkgYmVsb3c6IGF0IGZsb29yPTc4bXMgKHByb2QpLCBldmVuIGFcbi8vICAgICB+MzAtZGVlcCBjaGFpbiAodHlwaWNhbCBidXN5IG1vbWVudCkgd2FpdHMgMjM0MG1zIOKAlCBzdGlsbCBhbGxvd2VkLlxuLy8gICDigKIgUGF0aG9sb2dpY2FsIGJhY2t1cHMgKHRob3VzYW5kcyBxdWV1ZWQpIGZhaWwgZmFzdCBzbyBjYWxsZXJzIHdpdGhcbi8vICAgICBmYWxsYmFja3MgKFBHLWJhY2tlZCBzZXNzaW9uIHN0b3JlLCBpbi1tZW1vcnkgY2FjaGUpIGFjdHVhbGx5IFVTRSB0aGVtLlxuY29uc3QgX01BWF9ESVJFQ1RfV0FJVF9NUyA9IDJfNTAwO1xuXG4vLyBMb2cgZmFzdC1mYWlsIGV2ZW50cyBhdCBtb3N0IG9uY2UgZXZlcnkgNXMgdG8gYXZvaWQgZmxvb2RpbmcgdGhlIGxvZy5cbmxldCBfZmFzdEZhaWxMb2dnZWRBdCA9IDA7XG5cbi8qKiBPbiBlYWNoIHN1Y2Nlc3NmdWwgUERJTSByZXNwb25zZTogc2hyaW5rIHRoZSBnYXAgcHJvcG9ydGlvbmFsbHkgdG8gZGVtYW5kLlxuICpcbiAqIFRoZSBzdGVwIGlzIHF1ZXVlLWRlcHRoLXByb3BvcnRpb25hbCDigJQgXCJmbHVpZFwiIGV4cGFuc2lvbjpcbiAqICAgaWRsZSAgKDDigJMxKSA6IDEgbXMgIOKAlCBnYXAgYmFyZWx5IG1vdmVzOyBjb25zZXJ2ZXMgUERJTSBxdW90YSBhdCByZXN0XG4gKiAgIGxpZ2h0ICgy4oCTNCkgOiA1IG1zICDigJQgZ2VudGxlIHJhbXAgZm9yIGJhY2tncm91bmQvaW50ZXJuYWwgdHJhZmZpY1xuICogICBidXN5ICAoNeKAkzkpIDogMTIgbXMg4oCUIG1vZGVyYXRlIHJhbXAgZm9yIHJlYWwgdXNlciBzZXNzaW9uc1xuICogICBwZWFrICAoMTArKSA6IDE1IG1zIOKAlCBjb25zZXJ2YXRpdmUgcmFtcDsgYXZvaWRzIDQyOS1zYXd0b290aCBvdmVyc2hvb3RcbiAqXG4gKiBXaHkgdGhlIHBlYWsgc3RlcCB3YXMgcmVkdWNlZCBmcm9tIDEwMG1zIOKGkiAxNW1zOlxuICogICBBdCBxdWV1ZSBkZXB0aCDiiaUxMCwgYSAxMDBtcy9zdWNjZXNzIHN0ZXAgZHJvcHMgdGhlIGdhcCBmcm9tIHRoZSAyMDAwbXNcbiAqICAgY2VpbGluZyB0byB0aGUgMW1zIGZsb29yIGluIG9ubHkgfjIwIHJlcXVlc3RzLiAgUERJTSB0aGVuIHJldHVybnMgNDI5LFxuICogICB0aGUgZ2FwIGp1bXBzIGJhY2sgdG8gMi41bXMsIGFuZCB0aGUgc2FtZSAyMC1yZXF1ZXN0IGNvbGxhcHNlIHJlcGVhdHNcbiAqICAgaW5kZWZpbml0ZWx5IOKAlCBhIDQyOS9zYXd0b290aCBjeWNsZSB3aXRoIG5vIHN0YWJsZSBlcXVpbGlicml1bS5cbiAqICAgQXQgMTVtcy9zdWNjZXNzLCB0aGUgZGVzY2VudCBmcm9tIDIwMDBtcyB0YWtlcyB+MTMzIHJlcXVlc3RzICh+MjdzIGF0XG4gKiAgIDIwMG1zIFBESU0gUlRUKSwgZ2l2aW5nIFBESU0gdGltZSB0byBzaWduYWwgaXRzIHRydWUgY2VpbGluZyB0aHJvdWdoIGFcbiAqICAgNDI5IGJlZm9yZSB0aGUgZmxvb3IgaXMgcmVhY2hlZC5cbiAqXG4gKiBUaGUgcmVhbCBvcGVyYXRpb25hbCBmbG9vciBpcyBzZXQgYnkgUERJTSdzIG93biA0MjkgcmVzcG9uc2VzIHZpYVxuICogX3BkaW1BZGFwdDQyOSgpIOKAlCBub3QgYnkgdGhlIGNvbnN0YW50IF9QRElNX0dBUF9GTE9PUl9NUy5cbiAqL1xuZnVuY3Rpb24gX3BkaW1BZGFwdFN1Y2Nlc3MoKTogdm9pZCB7XG4gIGNvbnN0IHEgPSBfcGRpbVF1ZXVlRGVwdGg7XG4gIGNvbnN0IHN0ZXAgPSBxID49IDEwID8gMTUgOiBxID49IDUgPyAxMiA6IHEgPj0gMiA/IDUgOiAxO1xuICBfcGRpbUdhcE1zID0gTWF0aC5tYXgoX1BESU1fR0FQX0ZMT09SX01TLCBfcGRpbUdhcE1zIC0gc3RlcCk7XG59XG5cbi8qKiBPbiBlYWNoIDQyOSByZXNwb25zZTogbXVsdGlwbHkgdGhlIGdhcCAoYmFjayBvZmYgaGFyZCkgYW5kIHJldHVybiBuZXcgZ2FwXG4gKiAgc28gZXhlYygpIGNhbiBzZXQgdGhlIHN0YXRpYyByYXRlLWxpbWl0IGRlYWRsaW5lIHRvIHRoZSBzYW1lIHZhbHVlLlxuICpcbiAqICBKaXR0ZXIgcmF0aW9uYWxlOiB3aXRob3V0IGppdHRlciwgYWxsIGF1dG9zY2FsZSB3b3JrZXJzIHRoYXQgYmFja2VkIG9mZiB0b1xuICogIHRoZSBzYW1lIGNlaWxpbmcgKDIwMDBtcykgd2lsbCBhbGwgcmV0cnkgYXQgZXhhY3RseSB0aGUgc2FtZSB3YWxsLWNsb2NrIHRpbWUsXG4gKiAgcmUtdHJpZ2dlcmluZyBhIHN5bmNocm9uaXplZCA0Mjkgc3Rvcm0uICBBZGRpbmcgwrEyNSUgcmFuZG9tIG5vaXNlIHRvIGVhY2hcbiAqICBiYWNrb2ZmIHN0ZXAgZW5zdXJlcyBwcm9jZXNzZXMgZHJpZnQgYXBhcnQgd2l0aGluIDLigJMzIGN5Y2xlcyBhbmQgc3RheSBhcGFydC4gKi9cbmZ1bmN0aW9uIF9wZGltQWRhcHQ0MjkoKTogbnVtYmVyIHtcbiAgY29uc3Qgaml0dGVyID0gMC43NSArIE1hdGgucmFuZG9tKCkgKiAwLjU7IC8vIHVuaWZvcm0gWzAuNzUsIDEuMjVdXG4gIF9wZGltR2FwTXMgPSBNYXRoLm1pbihcbiAgICBfUERJTV9HQVBfQ0VJTF9NUyxcbiAgICBfcGRpbUdhcE1zICogX1BESU1fTVVMVF80MjkgKiBqaXR0ZXIsXG4gICk7XG4gIF9sYXN0NDI5QXQgPSBEYXRlPy5ub3coKTtcbiAgcmV0dXJuIF9wZGltR2FwTXM7XG59XG5cbi8qKlxuICogT24gYSBQRElNIHRpbWVvdXQgKEFib3J0U2lnbmFsIHRpbWVvdXQg4oCUIE5PVCBhIDQyOSByYXRlLWxpbWl0IHJlc3BvbnNlKTpcbiAqIGFwcGx5IG1pbGQgYmFja3ByZXNzdXJlIGJ5IGJ1bXBpbmcgdGhlIGdhcCBieSAxIGZsb29yLXVuaXQsIGJ1dCBkbyBOT1RcbiAqIHNldCBfbGFzdDQyOUF0LiAgVGltZW91dHMgbWVhbiBQRElNIGlzIGJ1c3kvc2xvdzsgdGhleSBhcmUgTk9UIHJhdGUtbGltaXRcbiAqIHNpZ25hbHMuICBUaGUgb2xkIGJlaGF2aW91ciBvZiBjYWxsaW5nIF9wZGltQWRhcHQ0MjkoKSBvbiBldmVyeSB0aW1lb3V0XG4gKiB3YXMgc2V0dGluZyBfbGFzdDQyOUF0IGV2ZXJ5IH41IHNlY29uZHMsIHdoaWNoIHBlcm1hbmVudGx5IGJsb2NrZWQgdGhlXG4gKiBwYXNzaXZlLWRlY2F5IHRpbWVyICh3aGljaCByZXF1aXJlcyA1cyBvZiA0MjktcXVpZXQgdG8gcnVuKS4gIFJlc3VsdDogZ2FwXG4gKiBwaW5uZWQgYXQgMjAwMG1zIGNlaWxpbmcgZm9yZXZlciwgc2Vzc2lvbiBzdG9yZSB1bnJlYWNoYWJsZSwgYXV0aCBicm9rZW4uXG4gKi9cbmZ1bmN0aW9uIF9wZGltQWRhcHRUaW1lb3V0KCk6IHZvaWQge1xuICAvLyBOdWRnZSB0aGUgZ2FwIHVwIHZlcnkgc2xpZ2h0bHkg4oCUIGp1c3QgZW5vdWdoIHRvIGFja25vd2xlZGdlIGJhY2twcmVzc3VyZVxuICAvLyB3aXRob3V0IHBlcm1hbmVudGx5IGRpc2FibGluZyBwYXNzaXZlIGRlY2F5LiAgVGhlIHBhc3NpdmUgdGltZXIgKDAuOMOXXG4gIC8vIGV2ZXJ5IDJzLCA1cyBxdWlldCBndWFyZCkgd2lsbCBwdWxsIGl0IGJhY2sgdG8gZmxvb3Igd2l0aGluIH4zMHMgYXMgbG9uZ1xuICAvLyBhcyBubyByZWFsIDQyOXMgYXJlIGFycml2aW5nLlxuICBfcGRpbUdhcE1zID0gTWF0aC5taW4oX1BESU1fR0FQX0NFSUxfTVMsIF9wZGltR2FwTXMgKyBfUERJTV9HQVBfRkxPT1JfTVMpO1xuICAvLyBfbGFzdDQyOUF0IGlzIGludGVudGlvbmFsbHkgTk9UIHVwZGF0ZWQgaGVyZS5cbn1cblxuLyoqIFdhbGwtY2xvY2sgdGltZXN0YW1wIG9mIHRoZSBtb3N0IHJlY2VudCA0MjkuICBVbmxpa2VcbiAqICBQZGltUmVkaXNDbGllbnQ/Ll9yYXRlTGltaXRlZFVudGlsIChhIGRlYWRsaW5lIHRoYXQgZ2V0cyBjbGVhcmVkIHRvIDAgb24gdGhlXG4gKiAgbmV4dCBzdWNjZXNzKSwgdGhpcyBpcyBtb25vdG9uaWMgYW5kIG9ubHkgZXZlciBhZHZhbmNlcyBvbiBhIGZyZXNoIDQyOSDigJRcbiAqICBzbyB0aGUgcGFzc2l2ZSBkZWNheSB0aW1lciBjYW4gdXNlIGl0IGFzIGFuIGV4YWN0IFwibm8gNDI5IGluIGxhc3QgTiBtc1wiXG4gKiAgc2lnbmFsLiAgMCBtZWFucyBubyA0MjkgaGFzIGV2ZXIgYmVlbiBvYnNlcnZlZCBpbiB0aGlzIHByb2Nlc3MuICovXG5sZXQgX2xhc3Q0MjlBdCA9IDA7XG5cbi8qKiBQYXNzaXZlIGdlb21ldHJpYyBkZWNheSDigJQgcnVucyBvbiBhIHRpbWVyLCBpbmRlcGVuZGVudCBvZiB0cmFmZmljLlxuICpcbiAqICBXaXRob3V0IHRoaXMsIGEgc2luZ2xlIDQyOSBidXJzdCBjYW4gcGluIF9wZGltR2FwTXMgbmVhciBfUERJTV9HQVBfQ0VJTF9NU1xuICogICgyMDAwbXMpIGZvciBtYW55IG1pbnV0ZXMuICBQcm9kdWN0aW9uIGV2aWRlbmNlOiBhIHN0YXJ0dXAtYnVyc3QgNDI5IGF0XG4gKiAgMTc6MDU6MzkgcHVzaGVkIGdhcCB0byB+MjAwMG1zIG9uIG11bHRpcGxlIHdvcmtlcnM7IDMrIG1pbnV0ZXMgbGF0ZXJcbiAqICB3b3JrZXJzIHdlcmUgc3RpbGwgYXQgZ2Fw4omIMTcwMG1zLiAgV2h5IHNvIHNsb3c/XG4gKlxuICogIC0gX3BkaW1BZGFwdFN1Y2Nlc3MoKSBzdGVwIGRlcGVuZHMgb24gX3BkaW1RdWV1ZURlcHRoLiAgQXQgZGVwdGggPCAyIGl0XG4gKiAgICBkZWNheXMgb25seSAxbXMgcGVyIHN1Y2Nlc3NmdWwgY2FsbC5cbiAqICAtIFdoZW4gdGhlIGZhc3QtZmFpbCBwYXRoIGlzIGFjdGl2ZSAoY2hhaW4gd2FpdCA+IDI1MDBtcyksIG1vc3QgY2FsbGVyc1xuICogICAgZmFsbCBiYWNrIHRvIFBHL2luLW1lbW9yeSBhbmQgbmV2ZXIgZW50ZXIgdGhlIGNoYWluIOKAlCBzbyB0aGV5IHByb2R1Y2VcbiAqICAgIG5vIHN1Y2Nlc3MgZXZlbnRzIHRvIGRyaXZlIGRlY2F5LiAgVmljaW91cyBjeWNsZTogaGlnaCBnYXAg4oaSIGZhc3QtZmFpbFxuICogICAg4oaSIG5vIHN1Y2Nlc3NlcyDihpIgZ2FwIHN0YXlzIGhpZ2guXG4gKlxuICogIEZpeDogYSAycyB0aW1lciB0aGF0IGdlb21ldHJpY2FsbHkgcHVsbHMgZ2FwIHRvd2FyZCBmbG9vciB3aGVuZXZlciBubyA0MjlcbiAqICBoYXMgYmVlbiBvYnNlcnZlZCBpbiB0aGUgbGFzdCBRVUlFVF9NUyB3aW5kb3cuICBQRElNIGlzIHByb3ZhYmx5IGhlYWx0aHlcbiAqICBkdXJpbmcgc3VjaCBhIHF1aWV0IHdpbmRvdywgc28gdGhlIGVsZXZhdGVkIGdhcCBpcyBvdmVyLWNvbnNlcnZhdGl2ZVxuICogIHJlZ2FyZGxlc3Mgb2YgcXVldWUgZGVwdGguXG4gKlxuICogIEVhcmxpZXIgdmVyc2lvbiBnYXRlZCBhZGRpdGlvbmFsbHkgb24gYHRvdGFsRGVwdGggPCAyYCDigJQgcHJvZHVjdGlvblxuICogIHByb3ZlZCB0aGF0IGdhdGUgd3Jvbmc6IGl0IGNvbmZsYXRlZCBcImxvYWRcIiB3aXRoIFwiUERJTSBwcmVzc3VyZVwiLiAgUmVhbFxuICogIHByb2QgZmFzdC1mYWlsIGluY2lkZW50cyAoZGVwbG95bWVudCBsb2dzLCBNYXkgMjgpIHNob3dlZCBwaWRzIDIyMS8yNjAvXG4gKiAgMjk5LzMzOCBlYWNoIHdpdGggZGlyZWN0IGRlcHRocyBvZiAz4oCTMTAgY2FsbGVycyBBTkQgZ2FwcyBzdHVjayBhdFxuICogIDUwMOKAkzE5MDBtcyBmb3IgbWFueSBtaW51dGVzLiAgVGhlIGRlcHRoIGdhdGUgYmxvY2tlZCBwYXNzaXZlIGRlY2F5LCB0aGVcbiAqICBmYXN0LWZhaWwgcHJldmVudGVkIG5ldyBjaGFpbiBlbnRyaWVzIGZyb20gZ2VuZXJhdGluZyBzdWNjZXNzZXMsIGFuZCB0aGVcbiAqICBhZGRpdGl2ZSBkZWNheSAoMW1zL3N1Y2Nlc3MgYXQgcTwyKSB3YXMgZWZmZWN0aXZlbHkgemVybyDigJQgZ2FwIHN0YXllZFxuICogIHBpbm5lZCBmYXIgYWJvdmUgdGhlIGZsb29yIGZvciB0aGUgZnVsbCBkdXJhdGlvbiBvZiB0aGUgaW5jaWRlbnQuXG4gKlxuICogIFRoZSBuby1zYXd0b290aCBpbnZhcmlhbnQgaXMgcHJlc2VydmVkIGJ5IHRoZSA0MjktcmVjZW5jeSBjaGVjayBhbG9uZTpcbiAqICB1bmRlciBzdXN0YWluZWQgUERJTSBwcmVzc3VyZSA0MjlzIGtlZXAgYXJyaXZpbmcsIF9sYXN0NDI5QXQgc3RheXNcbiAqICByZWNlbnQsIGFuZCBwYXNzaXZlIGRlY2F5IGRlZmVycyB0byBhZGRpdGl2ZS4gIFdpdGhvdXQgcmVjZW50IDQyOXMsIHRoZVxuICogIGdhcCBpcyBvdmVyLXBhY2VkIGJ5IGRlZmluaXRpb24uICovXG5jb25zdCBfUEFTU0lWRV9ERUNBWV9JTlRFUlZBTF9NUyA9IDJfMDAwO1xuY29uc3QgX1BBU1NJVkVfREVDQVlfRkFDVE9SID0gMC44O1xuY29uc3QgX1BBU1NJVkVfREVDQVlfSURMRV9RVUlFVF9NUyA9IDVfMDAwO1xuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICBpZiAoX3BkaW1HYXBNcyA8PSBfUERJTV9HQVBfRkxPT1JfTVMpIHJldHVybjtcbiAgLy8gVXNlIF9sYXN0NDI5QXQgKG1vbm90b25pYywgb25seSB1cGRhdGVkIG9uIGFjdHVhbCA0MjkpIHJhdGhlciB0aGFuXG4gIC8vIF9yYXRlTGltaXRlZFVudGlsIChhIGRlYWRsaW5lIHRoYXQgZ2V0cyBjbGVhcmVkIHRvIDAgb24gbmV4dCBzdWNjZXNzKS5cbiAgLy8gVGhlIGxhdHRlciB3b3VsZCBsZXQgYSBzaW5nbGUgc3VjY2VzcyB1bm1hc2sgYSBzdGlsbC1hY3RpdmUgY2FzY2FkZS5cbiAgLy8gYF9sYXN0NDI5QXQgPT09IDBgIG1lYW5zIG5vIDQyOSBoYXMgZXZlciBiZWVuIG9ic2VydmVkIGluIHRoaXMgcHJvY2VzcyDigJRcbiAgLy8gdHJlYXQgYXMgXCJpbmZpbml0ZWx5IHF1aWV0XCIgc28gZGVjYXkgc3RpbGwgZHJhaW5zIHN0YXJ0dXAtaml0dGVyIGluaXQuXG4gIGlmIChfbGFzdDQyOUF0ID4gMCAmJiBEYXRlPy5ub3coKSAtIF9sYXN0NDI5QXQgPCBfUEFTU0lWRV9ERUNBWV9JRExFX1FVSUVUX01TKVxuICAgIHJldHVybjtcbiAgX3BkaW1HYXBNcyA9IE1hdGgubWF4KFxuICAgIF9QRElNX0dBUF9GTE9PUl9NUyxcbiAgICBNYXRoLmZsb29yKF9wZGltR2FwTXMgKiBfUEFTU0lWRV9ERUNBWV9GQUNUT1IpLFxuICApO1xufSwgX1BBU1NJVkVfREVDQVlfSU5URVJWQUxfTVMpLnVucmVmKCk7XG5cbi8qKiBFeHBvc2UgbGl2ZSBzdGF0ZSBmb3IgZGlhZ25vc3RpY3MgKENoYWluRml4ZXIsIGhlYWx0aCBlbmRwb2ludHMpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFBkaW1BZGFwdGl2ZUdhcE1zKCk6IG51bWJlciB7XG4gIHJldHVybiBfcGRpbUdhcE1zO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldFBkaW1RdWV1ZURlcHRoKCk6IG51bWJlciB7XG4gIHJldHVybiBfcGRpbVF1ZXVlRGVwdGg7XG59XG5leHBvcnQgZnVuY3Rpb24gZ2V0UGRpbURpcmVjdFF1ZXVlRGVwdGgoKTogbnVtYmVyIHtcbiAgcmV0dXJuIF9kaXJlY3RRdWV1ZURlcHRoO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldFBkaW1TY3JpcHRRdWV1ZURlcHRoKCk6IG51bWJlciB7XG4gIHJldHVybiBfc2NyaXB0UXVldWVEZXB0aDtcbn1cblxuLyoqIEFsbG93IFBsYXRmb3JtQXV0b0ZpeGVyIHRvIHRlbXBvcmFyaWx5IHJhaXNlIHRoZSBwb2xsaW5nIGdhcCB1bmRlciBQRElNIHByZXNzdXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldFBkaW1BZGFwdGl2ZUdhcChtczogbnVtYmVyKTogdm9pZCB7XG4gIF9wZGltR2FwTXMgPSBNYXRoLm1heChfUERJTV9HQVBfRkxPT1JfTVMsIE1hdGgubWluKF9QRElNX0dBUF9DRUlMX01TLCBtcykpO1xufVxuXG5mdW5jdGlvbiBfZW5xdWV1ZUV4ZWMoZm46ICgpID0+IFByb21pc2U8dW5rbm93bj4pOiBQcm9taXNlPHVua25vd24+IHtcbiAgLy8g4pSA4pSAIEZhc3QtZmFpbDogcHJvdGVjdCB1c2VyLWZhY2luZyBjYWxsZXJzIGZyb20gdW5ib3VuZGVkIHF1ZXVlIHdhaXRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAvLyBFc3RpbWF0ZSBob3cgbG9uZyBhIG5ldyBkaXJlY3QgY2FsbGVyIHdvdWxkIHdhaXQgYmVoaW5kIGV4aXN0aW5nIHF1ZXVlLlxuICAvLyBXb3JrIHBhcmFsbGVsaXplcyBhY3Jvc3MgX1BESU1fRElSRUNUX0xBTkVTIChyb3VuZC1yb2JpbiksIHNvIGEgbmV3IGFycml2YWxcbiAgLy8gam9pbnMgdGhlIHNob3J0ZXN0IGxhbmUg4oCUIGF2ZXJhZ2UgcGVyLWxhbmUgZGVwdGggaXMgX2RpcmVjdFF1ZXVlRGVwdGgvbGFuZXM6XG4gIC8vICAgcGVyLWxhbmUgZGlyZWN0IHdhaXQgID0gKGRpcmVjdERlcHRoIC8gbGFuZXMpIMOXIEFJTUQgZ2FwXG4gIC8vICAgc2NyaXB0IGZhc3QtbGFuZSB3YWl0ID0gc2NyaXB0RGVwdGggw5cgMTBtcyAgKGluZGVwZW5kZW50IGNoYWluKVxuICAvLyBXaGVuIHRoZSBjb21iaW5lZCBlc3RpbWF0ZSBleGNlZWRzIF9NQVhfRElSRUNUX1dBSVRfTVMsIHJlamVjdCBpbW1lZGlhdGVseVxuICAvLyBzbyBjYWxsZXJzIHdpdGggZmFsbGJhY2tzIChQRy1iYWNrZWQgc2Vzc2lvbnMsIGluLW1lbW9yeSBjYWNoZXMpIHVzZSB0aGVtLlxuICAvL1xuICAvLyBHYXAgY2FwIHJhdGlvbmFsZTogYWZ0ZXIgYSA0MjkgYnVyc3QsIEFJTUQgcHVzaGVzIF9wZGltR2FwTXMgdG8gdGhlIDIwMDBtc1xuICAvLyBjZWlsaW5nLiBBdCB0aGF0IGNlaWxpbmcsIGV2ZW4gMyBjYWxsZXJzIGFjcm9zcyAyIGxhbmVzIGV4Y2VlZHMgMjUwMG1zXG4gIC8vICgzLzIgw5cgMjAwMCA9IDMwMDBtcyksIGNhdXNpbmcgZmFzdC1mYWlsIG9uIHZpcnR1YWxseSBldmVyeSBuZXcgY2FsbGVyLlxuICAvLyBUaGlzIGlzIGEgdmljaW91cyBjeWNsZTogZmFzdC1mYWlsIHByZXZlbnRzIHN1Y2Nlc3MgZXZlbnRzIHRoYXQgZHJpdmVcbiAgLy8gYWRkaXRpdmUgZGVjYXksIHNvIHBhc3NpdmUgZ2VvbWV0cmljIGRlY2F5ICgwLjjDlyBldmVyeSAycywgfjMwcyB0byBmbG9vcilcbiAgLy8gYmVjb21lcyB0aGUgb25seSByZWNvdmVyeSBtZWNoYW5pc20g4oCUIGJ1dCBuZXcgY2FsbGVycyBhcmUgcmVqZWN0ZWQgdGhlXG4gIC8vIHdob2xlIHRpbWUsIG1ha2luZyBQRElNIGFwcGVhciBjb21wbGV0ZWx5IHVuYXZhaWxhYmxlIGR1cmluZyByZWNvdmVyeS5cbiAgLy9cbiAgLy8gRml4OiBjYXAgdGhlIGdhcCB1c2VkIGZvciBlc3RpbWF0aW9uIGF0IGZsb29yw5c4LiBQYXNzaXZlIGRlY2F5IGJyaW5ncyB0aGVcbiAgLy8gcmVhbCBnYXAgZG93biB0byBmbG9vciB3aXRoaW4gfjMwcyByZWdhcmRsZXNzLCBzbyBmbG9vcsOXOCBpcyBhIGNvbnNlcnZhdGl2ZVxuICAvLyB1cHBlciBib3VuZCBvbiB0aGUgYWN0dWFsIHdhaXQgYSBxdWV1ZWQgY2FsbGVyIHdpbGwgZXhwZXJpZW5jZS4gIEF0IHByb2RcbiAgLy8gZmxvb3I9NzhtczogY2FwPTYyNG1zLCBtYXggcXVldWUgYmVmb3JlIGZhc3QtZmFpbCA9IDggY2FsbGVycyBhY3Jvc3MgMlxuICAvLyBsYW5lcyAoOC8yw5c2MjQ9MjQ5Nm1zIDwgMjUwMG1zKS4gIEF0IG5vcm1hbCBvcGVyYXRpb24gKGdhcOKJpGZsb29yKSB0aGVyZSBpc1xuICAvLyBubyBjaGFuZ2Ug4oCUIHRoZSBjYXAgaGFzIG5vIGVmZmVjdC4gIENhbGxlcnMgdGhhdCBBUkUgcXVldWVkIGR1cmluZyByZWNvdmVyeVxuICAvLyB3YWl0IGxlc3MgdGhhbiB0aGUgZXN0aW1hdGUgYmVjYXVzZSB0aGUgZ2FwIGlzIGFjdGl2ZWx5IGZhbGxpbmcuXG4gIGNvbnN0IGdhcEZvckZhc3RGYWlsID0gTWF0aC5taW4oX3BkaW1HYXBNcywgX1BESU1fR0FQX0ZMT09SX01TICogOCk7XG4gIGNvbnN0IHBlckxhbmVEaXJlY3RXYWl0TXMgPVxuICAgIChfZGlyZWN0UXVldWVEZXB0aCAvIF9QRElNX0RJUkVDVF9MQU5FUykgKiBnYXBGb3JGYXN0RmFpbDtcbiAgY29uc3QgZXN0aW1hdGVkV2FpdE1zID0gcGVyTGFuZURpcmVjdFdhaXRNcyArIF9zY3JpcHRRdWV1ZURlcHRoICogMTA7XG4gIGlmIChlc3RpbWF0ZWRXYWl0TXMgPiBfTUFYX0RJUkVDVF9XQUlUX01TKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZT8ubm93KCk7XG4gICAgaWYgKG5vdyAtIF9mYXN0RmFpbExvZ2dlZEF0ID4gNV8wMDApIHtcbiAgICAgIF9mYXN0RmFpbExvZ2dlZEF0ID0gbm93O1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBbUERJTV0gRGlyZWN0LWNhbGwgZmFzdC1mYWlsIOKAlCBlc3QuIHF1ZXVlIHdhaXQgJHtNYXRoLnJvdW5kKGVzdGltYXRlZFdhaXRNcyl9bXMgYCArXG4gICAgICAgICAgYCgke19kaXJlY3RRdWV1ZURlcHRofSBkaXJlY3QgLyAke19QRElNX0RJUkVDVF9MQU5FU30gbGFuZXMgw5cgJHtnYXBGb3JGYXN0RmFpbH1tcyBjYXBwZWQgW2xpdmU9JHtfcGRpbUdhcE1zfW1zXSArIGAgK1xuICAgICAgICAgIGAke19zY3JpcHRRdWV1ZURlcHRofSBzY3JpcHQgw5cgMTBtcykgPiAke19NQVhfRElSRUNUX1dBSVRfTVN9bXMgdGhyZXNob2xkOyBgICtcbiAgICAgICAgICBgY2FsbGVyIGZhbGxzIGJhY2sgdG8gUEcvaW4tbWVtb3J5YCxcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlPy5yZWplY3QoXG4gICAgICBuZXcgRXJyb3IoXG4gICAgICAgIGBbUERJTV0gQ2hhaW4gY29uZ2VzdGVkIOKAlCBlc3QuIHdhaXQgJHtNYXRoLnJvdW5kKGVzdGltYXRlZFdhaXRNcyl9bXMgZXhjZWVkcyAke19NQVhfRElSRUNUX1dBSVRfTVN9bXM7IHVzZSBmYWxsYmFja2AsXG4gICAgICApLFxuICAgICk7XG4gIH1cblxuICBfZGlyZWN0UXVldWVEZXB0aCsrO1xuICBfcGRpbVF1ZXVlRGVwdGgrKztcbiAgLy8gUm91bmQtcm9iaW4gbGFuZSBhc3NpZ25tZW50IOKAlCBlYWNoIGVucXVldWUgcGlja3MgdGhlIG5leHQgbGFuZS4gIFNrZXdlZFxuICAvLyBtaXhlcyBvZiBzbG93L2Zhc3QgY2FsbHMgKGU/LmcuIG9uZSBsYW5lIHN0YWxsZWQgb24gYSA0MjkgYmFja29mZikgc3RpbGwgZ2V0XG4gIC8vIGJhbGFuY2VkIG92ZXIgdGltZSBiZWNhdXNlIHRoZSBSUiBjb3VudGVyIGFkdmFuY2VzIHJlZ2FyZGxlc3Mgb2YgbGFuZSBzdGF0ZS5cbiAgY29uc3QgbGFuZUlkeCA9IF9wZGltRGlyZWN0TGFuZVJSKysgJSBfUERJTV9ESVJFQ1RfTEFORVM7XG4gIGlmIChfcGRpbURpcmVjdExhbmVSUiA+PSAxXzAwMF8wMDApIF9wZGltRGlyZWN0TGFuZVJSID0gMDsgLy8gcHJldmVudCBpbnRlZ2VyIGRyaWZ0XG4gIGNvbnN0IG5leHQgPSBfcGRpbURpcmVjdENoYWluc1tsYW5lSWR4XVxuICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgIF9kaXJlY3RRdWV1ZURlcHRoID0gTWF0aC5tYXgoMCwgX2RpcmVjdFF1ZXVlRGVwdGggLSAxKTtcbiAgICAgIF9wZGltUXVldWVEZXB0aCA9IE1hdGgubWF4KDAsIF9wZGltUXVldWVEZXB0aCAtIDEpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oKTtcbiAgICAgIC8vIEFkYXB0aXZlIGdhcCBmaXJlcyBBRlRFUiB0aGUgcmVxdWVzdCBjb21wbGV0ZXMg4oCUIG5leHQgY2FsbGVyIGluIFRISVMgbGFuZVxuICAgICAgLy8gbXVzdCB3YWl0IHRoaXMgbG9uZyBiZWZvcmUgaXQgc3RhcnRzLiAgR2FwIGlzIHJlYWQgYXQgY29tcGxldGlvbiB0aW1lIHNvXG4gICAgICAvLyBpdCByZWZsZWN0cyBhbnkgNDI5LWRyaXZlbiBhZGp1c3RtZW50IG1hZGUgYnkgdGhlIGp1c3QtY29tcGxldGVkIHJlcXVlc3QuXG4gICAgICAvLyAoT3RoZXIgbGFuZXMnIGNhbGxlcnMgYXJlIHBhY2VkIGJ5IHRoZSBzYW1lIGdsb2JhbCBfcGRpbUdhcE1zLilcbiAgICAgIGlmIChfcGRpbUdhcE1zID4gMCkgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgX3BkaW1HYXBNcykpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9KVxuICAgIC5jYXRjaChhc3luYyAoZXJyOiB1bmtub3duKSA9PiB7XG4gICAgICBfZGlyZWN0UXVldWVEZXB0aCA9IE1hdGgubWF4KDAsIF9kaXJlY3RRdWV1ZURlcHRoIC0gMSk7XG4gICAgICBfcGRpbVF1ZXVlRGVwdGggPSBNYXRoLm1heCgwLCBfcGRpbVF1ZXVlRGVwdGggLSAxKTtcbiAgICAgIC8vIEVuZm9yY2UgZ2FwIG9uIGVycm9yIHRvbyDigJQgaW5jbHVkaW5nIDQyOS4gIF9wZGltR2FwTXMgaGFzIGFscmVhZHkgYmVlblxuICAgICAgLy8gdXBkYXRlZCBieSBfcGRpbUFkYXB0NDI5KCkgaW5zaWRlIGV4ZWMoKSBiZWZvcmUgdGhlIHRocm93IHJlYWNoZXMgaGVyZSxcbiAgICAgIC8vIHNvIHN1YnNlcXVlbnQgY2FsbGVycyBuYXR1cmFsbHkgd2FpdCB0aGUgbmV3IChsYXJnZXIpIGdhcC5cbiAgICAgIGlmIChfcGRpbUdhcE1zID4gMCkgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgX3BkaW1HYXBNcykpO1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH0pO1xuICAvLyBTdXBwcmVzcyB1bmhhbmRsZWQgcmVqZWN0aW9uIG9uIHRoZSBsYW5lIHRhaWwg4oCUIGVhY2ggY2FsbGVyIGhhbmRsZXMgaXRzIG93bi5cbiAgX3BkaW1EaXJlY3RDaGFpbnNbbGFuZUlkeF0gPSBuZXh0LmNhdGNoKCgpID0+IHt9KTtcbiAgcmV0dXJuIG5leHQ7XG59XG5cbi8qKlxuICogTG9uZy1saXZlZCBibG9ja2luZyBjb21tYW5kcyBtdXN0IG5vdCBvY2N1cHkgYSBub3JtYWwgZGlyZWN0LWNvbW1hbmQgbGFuZS5cbiAqIFByb2R1Y2VycyBhbmQgTHVhIGNhbGxiYWNrcyBuZWVkIHRoYXQgbGFuZSB0byBtdXRhdGUgdGhlIHF1ZXVlIGFuZCB3YWtlIHRoZW0uXG4gKi9cbmZ1bmN0aW9uIF9lbnF1ZXVlQmxvY2tpbmdFeGVjPFQ+KGZuOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZuKTtcbn1cblxuLy8g4pSA4pSAIFNjcmlwdCBmYXN0LWxhbmUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4vLyBMdWFFeGVjdXRvciByZWRpcy5jYWxsKClzIGFyZSBhbHJlYWR5IHNlcmlhbGl6ZWQgYnkgQXRvbWljcy53YWl0KCkgaW5zaWRlIHRoZVxuLy8gV29ya2VyIHRocmVhZCDigJQgZWFjaCBjYWxsIGJsb2NrcyB0aGUgV29ya2VyIHVudGlsIHRoZSBtYWluIHRocmVhZCBzaWduYWxzLFxuLy8gZ3VhcmFudGVlaW5nIHRoYXQgbm8gdHdvIHJlZGlzLmNhbGwoKXMgZnJvbSB0aGUgc2FtZSBzY3JpcHQgY2FuIG92ZXJsYXAuXG4vL1xuLy8gVXNpbmcgdGhlIGZ1bGwgQUlNRCBnYXAgKDIwMDBtcyBjZWlsaW5nKSBmb3IgZXZlcnkgcmVkaXMuY2FsbCgpIGluc2lkZSBhXG4vLyBCdWxsTVEgc2NyaXB0IG1lYW5zOlxuLy8gICAzNSBjYWxscyDDlyAyMDAwbXMgZ2FwID0gNzBzIGRlYWQtd2FpdCDigJQgV29ya2VycyB0aW1lIG91dCBhdCA2MHMuXG4vL1xuLy8gUm9vdCBjYXVzZSBvZiBcInJlZGlzLmNhbGwgdGltZWQgb3V0IGFmdGVyIDYwcyDigJQgUERJTSBjaGFpbiBjb25nZXN0ZWRcIjpcbi8vICAgQXQgc3RhcnR1cCwgNzgwKyBkaXJlY3QgY2FsbGVycyBhcmUgcXVldWVkIGluIF9wZGltR2xvYmFsQ2hhaW4gd2l0aCB0aGVcbi8vICAgUGVybWFuZW50Rml4ZXItcmVzdG9yZWQgMjAwMG1zIGdhcC4gIElmIHNjcmlwdHMgc2hhcmUgdGhhdCBjaGFpbiB0aGV5IG11c3Rcbi8vICAgd2FpdCBiZWhpbmQgYWxsIDc4MCBjYWxsZXJzOiA3ODAgw5cgKDIwMG1zIFJUVCArIDIwMDBtcykg4omIIDI4IG1pbnV0ZXMuXG4vLyAgIFdvcmtlcnMgdGltZSBvdXQgYXQgNjBzLCBsb25nIGJlZm9yZSB0aGVpciB0dXJuIGFycml2ZXMuXG4vL1xuLy8gRml4OiBzY3JpcHRzIHVzZSBhIERFRElDQVRFRCBfcGRpbVNjcmlwdENoYWluIHRoYXQgcnVucyBpbmRlcGVuZGVudGx5IG9mIHRoZVxuLy8gICBkaXJlY3QtY2FsbCBjaGFpbi4gIFdvcmtlcnMgbmV2ZXIgcXVldWUgYmVoaW5kIHNlc3Npb24tc3RvcmUgb3IgY2FjaGUgY2FsbHMuXG4vLyAgIDQyOSBwcm90ZWN0aW9uIGlzIHByZXNlcnZlZCBiZWNhdXNlIF9yYXRlTGltaXRlZFVudGlsIGlzIGNoZWNrZWQgaW5zaWRlXG4vLyAgIGV2ZXJ5IGV4ZWMoKSBjYWxsIChpbnNpZGUgZm4oKSkgYmVmb3JlIHRoZSBIVFRQIHJlcXVlc3QgaXMgZGlzcGF0Y2hlZC5cbi8vICAgQm90aCBjaGFpbnMgY2FuIGZpcmUgb25lIHJlcXVlc3QgY29uY3VycmVudGx5IOKAlCBQRElNIGhhbmRsZXMgdGhhdCBmaW5lLlxuLy9cbi8vIFRocm91Z2hwdXQ6IDM1IGNhbGxzIMOXIChQRElNIFJUVCDiiYggMjAwbXMgKyAxMG1zIGdhcCkgPSB+Ny4zNXMgcGVyIHNjcmlwdC5cbmNvbnN0IF9TQ1JJUFRfQ0FMTF9HQVBfTVMgPSAxMDtcblxuZnVuY3Rpb24gX2VucXVldWVTY3JpcHRFeGVjKGZuOiAoKSA9PiBQcm9taXNlPHVua25vd24+KTogUHJvbWlzZTx1bmtub3duPiB7XG4gIC8vIFRyYWNrIGJvdGggc2hhcmVkIGFuZCBwZXItY2F0ZWdvcnkgZGVwdGggc286XG4gIC8vICAg4oCiIENoYWluRml4ZXIgc2F0dXJhdGlvbiBjaGVja3MgcmVtYWluIGFjY3VyYXRlIChzY3JpcHQgY2FsbHMgY291bnQgYXMgbG9hZClcbiAgLy8gICDigKIgX2VucXVldWVFeGVjIGZhc3QtZmFpbCBjYWxjdWxhdGlvbiB1c2VzIGFjY3VyYXRlIHNjcmlwdCBjb3VudCAoMTBtcyBnYXBcbiAgLy8gICAgIGVhY2gsIG5vdCBBSU1EIGdhcCkgc28gaXQgZG9lcyBub3Qgb3Zlci1lc3RpbWF0ZSB0aGUgd2FpdCB0aW1lXG4gIF9zY3JpcHRRdWV1ZURlcHRoKys7XG4gIF9wZGltUXVldWVEZXB0aCsrO1xuICBjb25zdCBuZXh0ID0gX3BkaW1TY3JpcHRDaGFpblxuICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgIF9zY3JpcHRRdWV1ZURlcHRoID0gTWF0aC5tYXgoMCwgX3NjcmlwdFF1ZXVlRGVwdGggLSAxKTtcbiAgICAgIF9wZGltUXVldWVEZXB0aCA9IE1hdGgubWF4KDAsIF9wZGltUXVldWVEZXB0aCAtIDEpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oKTtcbiAgICAgIC8vIDEwbXMgbWluaW1hbCBnYXAg4oCUIHNjcmlwdCBjYWxscyBhcmUgQXRvbWljcy1zZXJpYWxpemVkIHNvIHRoZXJlIGlzXG4gICAgICAvLyBubyBwYXJhbGxlbC1jYWxsIHJpc2s7IHRoZSBnYXAgZXhpc3RzIG9ubHkgdG8geWllbGQgdGhlIGV2ZW50IGxvb3AuXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCBfU0NSSVBUX0NBTExfR0FQX01TKSk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0pXG4gICAgLmNhdGNoKGFzeW5jIChlcnI6IHVua25vd24pID0+IHtcbiAgICAgIF9zY3JpcHRRdWV1ZURlcHRoID0gTWF0aC5tYXgoMCwgX3NjcmlwdFF1ZXVlRGVwdGggLSAxKTtcbiAgICAgIF9wZGltUXVldWVEZXB0aCA9IE1hdGgubWF4KDAsIF9wZGltUXVldWVEZXB0aCAtIDEpO1xuICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgX1NDUklQVF9DQUxMX0dBUF9NUykpO1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH0pO1xuICBfcGRpbVNjcmlwdENoYWluID0gbmV4dC5jYXRjaCgoKSA9PiB7fSk7XG4gIHJldHVybiBuZXh0O1xufVxuXG4vLyDilIDilIAgRXhlYyBlcnJvciBsb2cgZGVkdXBsaWNhdGlvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIFdoZW4gUERJTSBpcyBjb21wbGV0ZWx5IGRvd24gKGUuZy4gNTAyIG9uIGV2ZXJ5IGNhbGwpLCBlYWNoIGV4ZWMoKSBsb2dzIGFcbi8vIFdBUk4gYmVmb3JlIHRoZSBjaXJjdWl0IG9wZW5zLiAgV2l0aCA1IGZhaWx1cmVzIHJlcXVpcmVkIGJlZm9yZSB0aGUgY2lyY3VpdFxuLy8gb3BlbnMgYW5kIG11bHRpcGxlIEJ1bGxNUSB3b3JrZXJzIHBvbGxpbmcsIHRoaXMgcHJvZHVjZXMgYSBidXJzdCBvZiBpZGVudGljYWxcbi8vIFdBUk5zIGV2ZXJ5IHRpbWUgdGhlIGNpcmN1aXQgaXMgZm9yY2UtY2xvc2VkIGFuZCByZXNldHMuXG4vL1xuLy8gRGVkdXBsaWNhdGlvbiBydWxlczpcbi8vICAg4oCiIEZpcnN0IG9jY3VycmVuY2Ugb2YgYSBzdGF0dXMgY29kZTogYWx3YXlzIGxvZ2dlZC5cbi8vICAg4oCiIFNhbWUgc3RhdHVzIGNvZGUgYXMgbGFzdCBsb2dnZWQ6IHN1cHByZXNzZWQgaWYgd2l0aGluIERFRFVQX1dJTkRPV19NUy5cbi8vICAg4oCiIERpZmZlcmVudCBzdGF0dXMgY29kZTogYWx3YXlzIGxvZ2dlZCAoaW5kaWNhdGVzIGEgbmV3IGNvbmRpdGlvbikuXG4vLyAgIOKAoiBBZnRlciBERURVUF9XSU5ET1dfTVMgc2lsZW5jZSwgdGhlIG5leHQgb2NjdXJyZW5jZSBpcyBsb2dnZWQgYWdhaW4uXG4vL1xuLy8gNDI5IGRlZHVwIOKAlCBhIGJ1cnN0IG9mIHNpbXVsdGFuZW91cyA0MjlzIChlLmcuIGRpZmZ1c2lvbiBnYXRld2F5ICsgbWFpbiBhcHBcbi8vIGJvdGggaGl0dGluZyBQRElNIGF0IG9uY2UpIGNhbiBwcm9kdWNlIDgrIGlkZW50aWNhbCB3YXJuIGxpbmVzIHdpdGhpbiA3MDBtcy5cbi8vIERlZHVwbGljYXRlIHdpdGhpbiBhIDJzIGJ1cnN0IHdpbmRvdzogbG9nIHRoZSBmaXJzdCBvY2N1cnJlbmNlIGltbWVkaWF0ZWx5LFxuLy8gc3VwcHJlc3MgdGhlIHJlc3QsIHRoZW4gZmx1c2ggYSBcIisgTiBzdXBwcmVzc2VkXCIgc3VtbWFyeSBvbiB0aGUgbmV4dCA0Mjlcbi8vIHRoYXQgYXJyaXZlcyBhZnRlciB0aGUgd2luZG93IGhhcyBlbGFwc2VkIG9yIHdoZW4gYSBub24tNDI5IGlzIGxvZ2dlZC5cbi8vIFRoZSBnYXAgdmFsdWUgaW4gZWFjaCA0MjkgaXMgc2xpZ2h0bHkgZGlmZmVyZW50IChBSU1EIG11bHRpcGxpZXMgaXQpIGJ1dCB0aGVcbi8vIGFjdGlvbmFibGUgc2lnbmFsIGlzIFwiNDI5IHJlY2VpdmVkLCBnYXAgaXMgbm93IFhcIiDigJQgdGhlIGZpbmFsIGdhcCBpcyB3aGF0XG4vLyBtYXR0ZXJzLCBub3QgdGhlIGludGVybWVkaWF0ZSB2YWx1ZXMgZHVyaW5nIGEgYnVyc3QuXG5jb25zdCBfNDI5X0RFRFVQX01TID0gMl8wMDA7IC8vIGJ1cnN0IHdpbmRvdyAobXMpXG5sZXQgX2xhc3Q0MjlMb2dnZWRBdCA9IDA7XG5sZXQgX3N1cHByZXNzZWQ0MjlDb3VudCA9IDA7XG5cbmNvbnN0IF9FWEVDX0RFRFVQX1dJTkRPV19NUyA9IDMwXzAwMDsgLy8gMzAgcyAoZm9yIDV4eCAvIDN4eCBlcnJvcnMpXG5sZXQgX2xhc3RFeGVjRXJyb3JTdGF0dXMgPSAtMTtcbmxldCBfbGFzdEV4ZWNFcnJvckxvZ2dlZEF0ID0gMDtcbmxldCBfc3VwcHJlc3NlZEV4ZWNFcnJvcnMgPSAwO1xuXG5mdW5jdGlvbiBfbG9nRXhlY0Vycm9yKGNtZDogdW5rbm93biwgc3RhdHVzOiBudW1iZXIsIG1zZzogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IHdpdGhpbldpbmRvdyA9IG5vdyAtIF9sYXN0RXhlY0Vycm9yTG9nZ2VkQXQgPCBfRVhFQ19ERURVUF9XSU5ET1dfTVM7XG4gIGlmICh3aXRoaW5XaW5kb3cgJiYgc3RhdHVzID09PSBfbGFzdEV4ZWNFcnJvclN0YXR1cykge1xuICAgIC8vIFN1cHByZXNzIOKAlCBzYW1lIGVycm9yIHdpdGhpbiB3aW5kb3cuICBQZXJpb2RpY2FsbHkgZW1pdCBhIHN1bW1hcnkuXG4gICAgX3N1cHByZXNzZWRFeGVjRXJyb3JzKys7XG4gICAgaWYgKF9zdXBwcmVzc2VkRXhlY0Vycm9ycyAlIDIwID09PSAwKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFtQRElNXSBleGVjIGVycm9yIFske1N0cmluZyhjbWQpfV06IEhUVFAgJHtzdGF0dXN9IHN1cHByZXNzZWQgw5cke19zdXBwcmVzc2VkRXhlY0Vycm9yc30gYCArXG4gICAgICAgICAgYChzYW1lIGVycm9yIHdpdGhpbiAke19FWEVDX0RFRFVQX1dJTkRPV19NUyAvIDEwMDB9cyB3aW5kb3cpYCxcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuICBpZiAoX3N1cHByZXNzZWRFeGVjRXJyb3JzID4gMCkge1xuICAgIGxvZ2dlci53YXJuKFxuICAgICAgYFtQRElNXSBleGVjIGVycm9yIFske1N0cmluZyhjbWQpfV06ICR7bXNnfSBgICtcbiAgICAgICAgYCgrICR7X3N1cHByZXNzZWRFeGVjRXJyb3JzfSBzdXBwcmVzc2VkIGlkZW50aWNhbCBlcnJvcnMpYCxcbiAgICApO1xuICAgIF9zdXBwcmVzc2VkRXhlY0Vycm9ycyA9IDA7XG4gIH0gZWxzZSB7XG4gICAgbG9nZ2VyLndhcm4oYFtQRElNXSBleGVjIGVycm9yIFske1N0cmluZyhjbWQpfV06ICR7bXNnfWApO1xuICB9XG4gIF9sYXN0RXhlY0Vycm9yU3RhdHVzID0gc3RhdHVzO1xuICBfbGFzdEV4ZWNFcnJvckxvZ2dlZEF0ID0gbm93O1xufVxuXG4vLyDilIDilIAgTmV0d29yay90aW1lb3V0IGVycm9yIGRlZHVwIChzZXBhcmF0ZSBmcm9tIEhUVFAtc3RhdHVzIGRlZHVwIGFib3ZlKSDilIDilIDilIDilIDilIDilIDilIBcbi8vIFRpbWVvdXQgYW5kIEFib3J0RXJyb3JzIGZsb29kIHdoZW4gUERJTSBpcyBvdmVyd2hlbG1lZDogaHVuZHJlZHMgb2YgcXVldWVkXG4vLyBjYWxsZXJzIGVhY2ggcmVjZWl2ZSBhIDQgcyBhYm9ydCBpbiByYXBpZCBzdWNjZXNzaW9uLiAgTG9nIHRoZSBmaXJzdCBvbmUsXG4vLyBzdXBwcmVzcyB0aGUgcmVzdCB3aXRoaW4gdGhlIHdpbmRvdywgdGhlbiBlbWl0IGEgc3VtbWFyeSBjb3VudC5cbmNvbnN0IF9ORVRfRVJST1JfREVEVVBfTVMgPSAxMF8wMDA7IC8vIDEwIHMgYnVyc3Qgd2luZG93XG5sZXQgX2xhc3ROZXRFcnJvck1zZyA9IFwiXCI7XG5sZXQgX2xhc3ROZXRFcnJvckxvZ2dlZEF0ID0gMDtcbmxldCBfc3VwcHJlc3NlZE5ldEVycm9ycyA9IDA7XG5cbmZ1bmN0aW9uIF9sb2dOZXR3b3JrRXJyb3IoY21kOiB1bmtub3duLCBtc2c6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBzYW1lTXNnID0gbXNnID09PSBfbGFzdE5ldEVycm9yTXNnO1xuICBjb25zdCB3aXRoaW5XaW5kb3cgPSBub3cgLSBfbGFzdE5ldEVycm9yTG9nZ2VkQXQgPCBfTkVUX0VSUk9SX0RFRFVQX01TO1xuICBpZiAoc2FtZU1zZyAmJiB3aXRoaW5XaW5kb3cpIHtcbiAgICBfc3VwcHJlc3NlZE5ldEVycm9ycysrO1xuICAgIC8vIEVtaXQgYSBwZXJpb2RpYyBzdW1tYXJ5IHNvIHRoZSBvcGVyYXRvciBrbm93cyB0aGUgYnVyc3QgaXMgb25nb2luZy5cbiAgICBpZiAoX3N1cHByZXNzZWROZXRFcnJvcnMgJSA1MCA9PT0gMCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBbUERJTV0gZXhlYyBlcnJvciBbJHtTdHJpbmcoY21kKX1dOiAke21zZ30g4oCUIHN1cHByZXNzZWQgw5cke19zdXBwcmVzc2VkTmV0RXJyb3JzfSBpbiBsYXN0ICR7X05FVF9FUlJPUl9ERURVUF9NUyAvIDEwMDB9c2AsXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cbiAgLy8gTmV3IG1lc3NhZ2Ugb3Igd2luZG93IGVsYXBzZWQg4oCUIGZsdXNoIHN1bW1hcnkgdGhlbiBsb2cgZnJlc2guXG4gIGlmIChfc3VwcHJlc3NlZE5ldEVycm9ycyA+IDApIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBbUERJTV0gZXhlYyBlcnJvciBbJHtTdHJpbmcoY21kKX1dOiAke19sYXN0TmV0RXJyb3JNc2d9IGAgK1xuICAgICAgICBgKCsgJHtfc3VwcHJlc3NlZE5ldEVycm9yc30gc3VwcHJlc3NlZCBpbiBsYXN0ICR7X05FVF9FUlJPUl9ERURVUF9NUyAvIDEwMDB9cylgLFxuICAgICk7XG4gICAgX3N1cHByZXNzZWROZXRFcnJvcnMgPSAwO1xuICB9IGVsc2Uge1xuICAgIGxvZ2dlci53YXJuKGBbUERJTV0gZXhlYyBlcnJvciBbJHtTdHJpbmcoY21kKX1dOiAke21zZ31gKTtcbiAgfVxuICBfbGFzdE5ldEVycm9yTXNnID0gbXNnO1xuICBfbGFzdE5ldEVycm9yTG9nZ2VkQXQgPSBub3c7XG59XG5cbi8vIOKUgOKUgCBMMSBpbi1wcm9jZXNzIHJlYWQtdGhyb3VnaCBjYWNoZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIFNlcnZlcyBHRVQgLyBIR0VUIHJlc3VsdHMgZnJvbSBtZW1vcnkgd2hlbiBQRElNIGlzIHVuYXZhaWxhYmxlLlxuLy8gVGhpcyBrZWVwcyBzZXNzaW9ucyBhbGl2ZSBhbmQgcmF0ZS1saW1pdCBzdGF0ZSByZWFkYWJsZSB0aHJvdWdoIGJyaWVmIFBESU1cbi8vIG91dGFnZXMsIGVsaW1pbmF0aW5nIHRoZSBwZXItcmVxdWVzdCBbU2Vzc2lvblN0b3JlXSBXQVJOIGZsb29kLlxuLy9cbi8vIEV2aWN0aW9uOiBpbnNlcnRpb24tb3JkZXIgTFJVLCBjYXBwZWQgYXQgTDFfTUFYX0VOVFJJRVMuXG4vLyBUVEw6ICAgICAgaGFyZCBwZXItZW50cnkgY2FwIG9mIEwxX1RUTF9NUyAoNSBtaW4pIOKAlCBzdGFsZSBkYXRhIGlzIG5ldmVyIHNlcnZlZFxuLy8gICAgICAgICAgIGJleW9uZCB0aGlzIHdpbmRvdyByZWdhcmRsZXNzIG9mIFBESU0gb3V0YWdlIGR1cmF0aW9uLlxuLy8gV3JpdGVzOiAgIFNFVCAvIFNFVEVYIC8gU0VUTlggdXBkYXRlIEwxIG9uIHN1Y2Nlc3Mgc28gc3Vic2VxdWVudCByZWFkcyBhcmVcbi8vICAgICAgICAgICBzZXJ2ZWQgd2l0aG91dCBhIFBESU0gcm91bmQtdHJpcCB3aGlsZSBQRElNIGlzIHVwLlxuLy8gRGVsZXRlczogIERFTCBldmljdHMgdGhlIGtleSBvbiBzdWNjZXNzIHNvIGxvZ291dHMgYXJlIHJlZmxlY3RlZCBpbW1lZGlhdGVseS5cbi8vIEhHRVQ6ICAgICBjYWNoZWQgdW5kZXIgYSBjb21wb3VuZCBrZXkgKHJlZGlzS2V5ICsgTlVMICsgZmllbGQpLlxuY29uc3QgTDFfTUFYX0VOVFJJRVMgPSAyXzAwMDtcbmNvbnN0IEwxX1RUTF9NUyA9IDUgKiA2MCAqIDFfMDAwOyAvLyA1IG1pbnV0ZXNcblxuaW50ZXJmYWNlIF9MMUVudHJ5IHtcbiAgdmFsdWU6IHN0cmluZyB8IG51bGw7XG4gIGV4cGlyZXNBdDogbnVtYmVyO1xufVxuY29uc3QgX2wxOiBNYXA8c3RyaW5nLCBfTDFFbnRyeT4gPSBuZXcgTWFwKCk7XG5cbmZ1bmN0aW9uIF9sMVJlYWQoa2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgZSA9IF9sMS5nZXQoa2V5KTtcbiAgaWYgKCFlKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAoRGF0ZS5ub3coKSA+IGUuZXhwaXJlc0F0KSB7XG4gICAgX2wxLmRlbGV0ZShrZXkpO1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgLy8gTFJVIHByb21vdGlvbiDigJQgbW92ZSB0byB0YWlsIHNvIHRoZSBvbGRlc3QgZW50cmllcyBhcmUgYXQgdGhlIGZyb250LlxuICBfbDEuZGVsZXRlKGtleSk7XG4gIF9sMS5zZXQoa2V5LCBlKTtcbiAgcmV0dXJuIGUudmFsdWU7IC8vIG1heSBsZWdpdGltYXRlbHkgYmUgbnVsbCAoXCJrZXkgZXhpc3RzIGJ1dCBlbXB0eVwiKVxufVxuXG5mdW5jdGlvbiBfbDFXcml0ZShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgaWYgKF9sMS5zaXplID49IEwxX01BWF9FTlRSSUVTICYmICFfbDEuaGFzKGtleSkpIHtcbiAgICAvLyBFdmljdCB0aGUgb2xkZXN0IChpbnNlcnRpb24tb3JkZXIgaGVhZCkgZW50cnkuXG4gICAgY29uc3Qgb2xkZXN0ID0gX2wxLmtleXMoKS5uZXh0KCkudmFsdWU7XG4gICAgaWYgKG9sZGVzdCAhPT0gdW5kZWZpbmVkKSBfbDEuZGVsZXRlKG9sZGVzdCk7XG4gIH1cbiAgX2wxLnNldChrZXksIHsgdmFsdWUsIGV4cGlyZXNBdDogRGF0ZS5ub3coKSArIEwxX1RUTF9NUyB9KTtcbn1cblxuZnVuY3Rpb24gX2wxRXZpY3QoLi4ua2V5czogc3RyaW5nW10pOiB2b2lkIHtcbiAgZm9yIChjb25zdCBrIG9mIGtleXMpIF9sMS5kZWxldGUoayk7XG59XG5cbi8qKlxuICogTm9ybWFsaXplIHdhc21vb24gTHVhIHRhYmxlIHJlc3VsdHMgdG8gcHJvcGVyIEphdmFTY3JpcHQgdmFsdWVzLlxuICpcbiAqIFByb2JsZW06IEJ1bGxNUSBMdWEgc2NyaXB0cyByZXR1cm4gTHVhIHRhYmxlcyAoZS5nLiBhIGxpc3Qgb2Ygc3RhbGxlZCBqb2IgSURzKS5cbiAqIHdhc21vb24gdHJhbnNsYXRlcyBMdWEgYXJyYXlzIHRvIEpTIG9iamVjdHMgd2l0aCAxLWluZGV4ZWQgbnVtZXJpYyBrZXlzOlxuICogICBMdWE6IHtcImlkMVwiLCBcImlkMlwifSAg4oaSICBKUzogeyAxOiBcImlkMVwiLCAyOiBcImlkMlwiIH1cbiAqXG4gKiBUaGlzIGJyZWFrcyBjYWxsZXJzIGxpa2UgQnVsbE1RIHRoYXQgZXhwZWN0IGEgcHJvcGVyIEpTIGFycmF5IGFuZCBjYWxsIC5mb3JFYWNoKClcbiAqIG9uIHRoZSByZXN1bHQgKFR5cGVFcnJvcjogc3RhbGxlZC5mb3JFYWNoIGlzIG5vdCBhIGZ1bmN0aW9uKS5cbiAqXG4gKiBOb3JtYWxpemF0aW9uIHJ1bGVzOlxuICogICDigKIgbnVsbCAvIHVuZGVmaW5lZCAvIHByaW1pdGl2ZXMgLyByZWFsIEpTIGFycmF5cyDihpIgcmV0dXJuZWQgYXMtaXNcbiAqICAg4oCiIEVtcHR5IHBsYWluIG9iamVjdCB7fSDihpIgY29udmVydGVkIHRvIFtdIChMdWEgZW1wdHkgdGFibGUg4omhIGVtcHR5IGFycmF5KVxuICogICDigKIgT2JqZWN0IHdpdGggYWxsLW51bWVyaWMgY29uc2VjdXRpdmUga2V5cyBzdGFydGluZyBhdCAxIOKGkiBjb252ZXJ0ZWQgdG8gSlMgYXJyYXlcbiAqICAgICAocmVjdXJzaXZlbHkgbm9ybWFsaXppbmcgZWFjaCBlbGVtZW50KVxuICogICDigKIgRXZlcnl0aGluZyBlbHNlIChtaXhlZC9zdHJpbmcta2V5ZWQgb2JqZWN0cykg4oaSIG9iamVjdCB3aXRoIHJlY3Vyc2l2ZWx5XG4gKiAgICAgbm9ybWFsaXplZCB2YWx1ZXMgKHByZXNlcnZlcyBoYXNoZXMgLyBtYXBzIHJldHVybmVkIGJ5IEx1YSBzY3JpcHRzKVxuICovXG5mdW5jdGlvbiBfbm9ybWFsaXplTHVhUmVzdWx0KHZhbDogdW5rbm93bik6IHVua25vd24ge1xuICBpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdmFsO1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWwpKSByZXR1cm4gdmFsLm1hcChfbm9ybWFsaXplTHVhUmVzdWx0KTtcbiAgaWYgKHR5cGVvZiB2YWwgIT09IFwib2JqZWN0XCIpIHJldHVybiB2YWw7XG5cbiAgY29uc3Qgb2JqID0gdmFsIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSByZXR1cm4gW107XG5cbiAgY29uc3QgbnVtS2V5cyA9IGtleXMubWFwKChrKSA9PiBwYXJzZUludChrLCAxMCkpO1xuICBjb25zdCBhbGxOdW1lcmljID0gbnVtS2V5cy5ldmVyeSgobikgPT4gIWlzTmFOKG4pICYmIG4gPiAwKTtcbiAgaWYgKGFsbE51bWVyaWMpIHtcbiAgICBjb25zdCBzb3J0ZWQgPSBbLi4ubnVtS2V5c10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuICAgIGNvbnN0IGlzQ29uc2VjdXRpdmUgPVxuICAgICAgc29ydGVkWzBdID09PSAxICYmIHNvcnRlZFtzb3J0ZWQubGVuZ3RoIC0gMV0gPT09IHNvcnRlZC5sZW5ndGg7XG4gICAgaWYgKGlzQ29uc2VjdXRpdmUpIHtcbiAgICAgIHJldHVybiBzb3J0ZWQubWFwKChrKSA9PiBfbm9ybWFsaXplTHVhUmVzdWx0KG9ialtrXSA/PyBvYmpbU3RyaW5nKGspXSkpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgZm9yIChjb25zdCBrIG9mIGtleXMpIG91dFtrXSA9IF9ub3JtYWxpemVMdWFSZXN1bHQob2JqW2tdKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBpb3JlZGlzLXN0eWxlIGNoYWluYWJsZSBwaXBlbGluZS90cmFuc2FjdGlvbiBidWlsZGVyLlxuICogcGlwZWxpbmUoKSBmbHVzaGVzIGNvbW1hbmRzIHNlcXVlbnRpYWxseTsgbXVsdGkoKSBzZW5kcyBvbmUgYXRvbWljIG93bmVyXG4gKiB0cmFuc2FjdGlvbiBhbmQgcmV0dXJucyBpb3JlZGlzLWNvbXBhdGlibGUgW2Vycm9yLCByZXN1bHRdIHR1cGxlcy5cbiAqL1xuaW50ZXJmYWNlIFBpcGVsaW5lIHtcbiAgZ2V0KGs6IHN0cmluZyk6IFBpcGVsaW5lO1xuICBzZXQoazogc3RyaW5nLCB2OiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSk6IFBpcGVsaW5lO1xuICBzZXRleChrOiBzdHJpbmcsIHM6IG51bWJlciwgdjogc3RyaW5nKTogUGlwZWxpbmU7XG4gIGRlbCguLi5rOiBzdHJpbmdbXSk6IFBpcGVsaW5lO1xuICBleHBpcmUoazogc3RyaW5nLCBzOiBudW1iZXIpOiBQaXBlbGluZTtcbiAgcGV4cGlyZShrOiBzdHJpbmcsIG1zOiBudW1iZXIpOiBQaXBlbGluZTtcbiAgaW5jcihrOiBzdHJpbmcpOiBQaXBlbGluZTtcbiAgaW5jcmJ5KGs6IHN0cmluZywgbjogbnVtYmVyKTogUGlwZWxpbmU7XG4gIGRlY3Ioazogc3RyaW5nKTogUGlwZWxpbmU7XG4gIGRlY3JieShrOiBzdHJpbmcsIG46IG51bWJlcik6IFBpcGVsaW5lO1xuICBoc2V0KGs6IHN0cmluZywgLi4uYTogdW5rbm93bltdKTogUGlwZWxpbmU7XG4gIGhnZXQoazogc3RyaW5nLCBmOiBzdHJpbmcpOiBQaXBlbGluZTtcbiAgaGRlbChrOiBzdHJpbmcsIC4uLmY6IHN0cmluZ1tdKTogUGlwZWxpbmU7XG4gIGhnZXRhbGwoazogc3RyaW5nKTogUGlwZWxpbmU7XG4gIHNhZGQoazogc3RyaW5nLCAuLi5tOiB1bmtub3duW10pOiBQaXBlbGluZTtcbiAgc3JlbShrOiBzdHJpbmcsIC4uLm06IHVua25vd25bXSk6IFBpcGVsaW5lO1xuICB6YWRkKGs6IHN0cmluZywgLi4uYTogdW5rbm93bltdKTogUGlwZWxpbmU7XG4gIHpyZW0oazogc3RyaW5nLCAuLi5tOiB1bmtub3duW10pOiBQaXBlbGluZTtcbiAgbHB1c2goazogc3RyaW5nLCAuLi52OiB1bmtub3duW10pOiBQaXBlbGluZTtcbiAgcnB1c2goazogc3RyaW5nLCAuLi52OiB1bmtub3duW10pOiBQaXBlbGluZTtcbiAgZXhlYygpOiBQcm9taXNlPHVua25vd25bXT47XG59XG5cbnR5cGUgUGRpbVB1YlN1YkNhbGxiYWNrID0gKGVycm9yOiBFcnJvciB8IG51bGwsIGNvdW50OiBudW1iZXIpID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBQZGltUmVkaXNDbGllbnQgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICBwdWJsaWMgc3RhdHVzOiBzdHJpbmcgPSBcInJlYWR5XCI7XG4gIHByaXZhdGUgZXhlY1VybDogc3RyaW5nO1xuICBwcml2YXRlIGJlYXJlclRva2VuOiBzdHJpbmc7XG4gIHByaXZhdGUgZGlzY29ubmVjdGVkID0gZmFsc2U7XG4gIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlQ29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgcHJpdmF0ZSByZWFkb25seSBkaXNjb25uZWN0ZWRFcnJvciA9IE9iamVjdC5hc3NpZ24oXG4gICAgbmV3IEVycm9yKFwiW1BESU1dIFJlZGlzIGNsaWVudCBkaXNjb25uZWN0ZWRcIiksXG4gICAgeyBuYW1lOiBcIkNvbm5lY3Rpb25FcnJvclwiIH0sXG4gICk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHViU3ViQ2hhbm5lbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBwdWJTdWJQYXR0ZXJucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHB1YlN1YkNvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlciB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHB1YlN1YlRhc2s6IFByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBwdWJTdWJHZW5lcmF0aW9uID0gMDtcbiAgcHJpdmF0ZSBwdWJTdWJSZWZyZXNoQ2hhaW46IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICBwcml2YXRlIGFzc2VydENvbm5lY3RlZCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWQpIHRocm93IHRoaXMuZGlzY29ubmVjdGVkRXJyb3I7XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RTaWduYWwodGltZW91dE1zOiBudW1iZXIgfCBudWxsID0gUERJTV9FWEVDX1RJTUVPVVRfTVMpOiBBYm9ydFNpZ25hbCB7XG4gICAgaWYgKHRpbWVvdXRNcyA9PT0gbnVsbCkgcmV0dXJuIHRoaXMubGlmZWN5Y2xlQ29udHJvbGxlci5zaWduYWw7XG4gICAgcmV0dXJuIEFib3J0U2lnbmFsLmFueShbXG4gICAgICB0aGlzLmxpZmVjeWNsZUNvbnRyb2xsZXIuc2lnbmFsLFxuICAgICAgQWJvcnRTaWduYWwudGltZW91dCh0aW1lb3V0TXMpLFxuICAgIF0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhd2FpdE9yRGlzY29ubmVjdDxUPihvcGVyYXRpb246IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcbiAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWQpIHJldHVybiBQcm9taXNlLnJlamVjdCh0aGlzLmRpc2Nvbm5lY3RlZEVycm9yKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY2xlYW51cCA9ICgpID0+IHtcbiAgICAgICAgdGhpcy5saWZlY3ljbGVDb250cm9sbGVyLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgb25BYm9ydCk7XG4gICAgICB9O1xuICAgICAgY29uc3Qgb25BYm9ydCA9ICgpID0+IHtcbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICByZWplY3QodGhpcy5kaXNjb25uZWN0ZWRFcnJvcik7XG4gICAgICB9O1xuICAgICAgdGhpcy5saWZlY3ljbGVDb250cm9sbGVyLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgb25BYm9ydCwgeyBvbmNlOiB0cnVlIH0pO1xuICAgICAgb3BlcmF0aW9uLnRoZW4oXG4gICAgICAgICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNsZWFudXAoKTtcbiAgICAgICAgICByZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgfSxcbiAgICAgICAgKGVycm9yKSA9PiB7XG4gICAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0sXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBkZWxheShtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuZGlzY29ubmVjdGVkKSByZXR1cm4gUHJvbWlzZS5yZWplY3QodGhpcy5kaXNjb25uZWN0ZWRFcnJvcik7XG4gICAgaWYgKG1zIDw9IDApIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY2xlYW51cCA9ICgpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgdGhpcy5saWZlY3ljbGVDb250cm9sbGVyLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgb25BYm9ydCk7XG4gICAgICB9O1xuICAgICAgY29uc3Qgb25BYm9ydCA9ICgpID0+IHtcbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICByZWplY3QodGhpcy5kaXNjb25uZWN0ZWRFcnJvcik7XG4gICAgICB9O1xuICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9LCBtcyk7XG4gICAgICB0aGlzLmxpZmVjeWNsZUNvbnRyb2xsZXIuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBvbkFib3J0LCB7IG9uY2U6IHRydWUgfSk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlZnJlc2hQdWJTdWJTdHJlYW0oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgbmV4dCA9IHRoaXMucHViU3ViUmVmcmVzaENoYWluLnRoZW4oKCkgPT4gdGhpcy5yZXN0YXJ0UHViU3ViU3RyZWFtKCkpO1xuICAgIHRoaXMucHViU3ViUmVmcmVzaENoYWluID0gbmV4dC5jYXRjaCgoKSA9PiB7fSk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlc3RhcnRQdWJTdWJTdHJlYW0oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5hc3NlcnRDb25uZWN0ZWQoKTtcbiAgICBjb25zdCBnZW5lcmF0aW9uID0gKyt0aGlzLnB1YlN1YkdlbmVyYXRpb247XG4gICAgY29uc3QgcHJldmlvdXNDb250cm9sbGVyID0gdGhpcy5wdWJTdWJDb250cm9sbGVyO1xuICAgIGNvbnN0IHByZXZpb3VzVGFzayA9IHRoaXMucHViU3ViVGFzaztcbiAgICBwcmV2aW91c0NvbnRyb2xsZXI/LmFib3J0KCk7XG4gICAgaWYgKHByZXZpb3VzVGFzaykgYXdhaXQgcHJldmlvdXNUYXNrO1xuICAgIHRoaXMucHViU3ViQ29udHJvbGxlciA9IG51bGw7XG4gICAgdGhpcy5wdWJTdWJUYXNrID0gbnVsbDtcblxuICAgIGlmICh0aGlzLnB1YlN1YkNoYW5uZWxzLnNpemUgKyB0aGlzLnB1YlN1YlBhdHRlcm5zLnNpemUgPT09IDApIHJldHVybjtcblxuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgdGhpcy5wdWJTdWJDb250cm9sbGVyID0gY29udHJvbGxlcjtcbiAgICBsZXQgcmVzb2x2ZVJlYWR5ITogKCkgPT4gdm9pZDtcbiAgICBsZXQgcmVqZWN0UmVhZHkhOiAoZXJyb3I6IHVua25vd24pID0+IHZvaWQ7XG4gICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcbiAgICBjb25zdCByZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHJlc29sdmVSZWFkeSA9IHJlc29sdmU7XG4gICAgICByZWplY3RSZWFkeSA9IHJlamVjdDtcbiAgICB9KTtcbiAgICBjb25zdCBtYXJrUmVhZHkgPSAoKSA9PiB7XG4gICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xuICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICByZXNvbHZlUmVhZHkoKTtcbiAgICB9O1xuICAgIGNvbnN0IHJlamVjdEJlZm9yZVJlYWR5ID0gKGVycm9yOiB1bmtub3duKSA9PiB7XG4gICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xuICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICByZWplY3RSZWFkeShlcnJvcik7XG4gICAgfTtcbiAgICB0aGlzLnB1YlN1YlRhc2sgPSB0aGlzLnJ1blB1YlN1Ykxvb3AoXG4gICAgICBjb250cm9sbGVyLFxuICAgICAgZ2VuZXJhdGlvbixcbiAgICAgIG1hcmtSZWFkeSxcbiAgICAgIHJlamVjdEJlZm9yZVJlYWR5LFxuICAgICk7XG4gICAgYXdhaXQgcmVhZHk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1blB1YlN1Ykxvb3AoXG4gICAgY29udHJvbGxlcjogQWJvcnRDb250cm9sbGVyLFxuICAgIGdlbmVyYXRpb246IG51bWJlcixcbiAgICBtYXJrUmVhZHk6ICgpID0+IHZvaWQsXG4gICAgcmVqZWN0QmVmb3JlUmVhZHk6IChlcnJvcjogdW5rbm93bikgPT4gdm9pZCxcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHJldHJ5TXMgPSAyMDA7XG4gICAgbGV0IGluaXRpYWxSZWFkeSA9IGZhbHNlO1xuICAgIGNvbnN0IGlzQ3VycmVudCA9ICgpID0+XG4gICAgICAhdGhpcy5kaXNjb25uZWN0ZWQgJiZcbiAgICAgICFjb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkICYmXG4gICAgICAhdGhpcy5saWZlY3ljbGVDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkICYmXG4gICAgICBnZW5lcmF0aW9uID09PSB0aGlzLnB1YlN1YkdlbmVyYXRpb247XG5cbiAgICB3aGlsZSAoaXNDdXJyZW50KCkpIHtcbiAgICAgIGxldCByZWFkZXI6IFJlYWRhYmxlU3RyZWFtRGVmYXVsdFJlYWRlcjxVaW50OEFycmF5PiB8IHVuZGVmaW5lZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG9wZW5UaW1lb3V0ID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoXG4gICAgICAgICAgKCkgPT4gb3BlblRpbWVvdXQuYWJvcnQobmV3IEVycm9yKFwiUERJTSBQdWIvU3ViIGNvbm5lY3Rpb24gdGltZWQgb3V0XCIpKSxcbiAgICAgICAgICBQRElNX0VYRUNfVElNRU9VVF9NUyxcbiAgICAgICAgKTtcbiAgICAgICAgbGV0IHJlc3BvbnNlOiBSZXNwb25zZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXNwb25zZSA9IGF3YWl0IGZldGNoKHRoaXMuZXhlY1VybCwge1xuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0aGlzLmJlYXJlclRva2VufWAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBjbWQ6IFwiU1VCU0NSSUJFXCIsXG4gICAgICAgICAgICAgIGFyZ3M6IFsuLi50aGlzLnB1YlN1YkNoYW5uZWxzXSxcbiAgICAgICAgICAgICAgcGF0dGVybnM6IFsuLi50aGlzLnB1YlN1YlBhdHRlcm5zXSxcbiAgICAgICAgICAgICAgc3RyZWFtOiB0cnVlLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLmFueShbXG4gICAgICAgICAgICAgIHRoaXMubGlmZWN5Y2xlQ29udHJvbGxlci5zaWduYWwsXG4gICAgICAgICAgICAgIGNvbnRyb2xsZXIuc2lnbmFsLFxuICAgICAgICAgICAgICBvcGVuVGltZW91dC5zaWduYWwsXG4gICAgICAgICAgICBdKSxcbiAgICAgICAgICAgIHJlZGlyZWN0OiBcIm1hbnVhbFwiLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCkuY2F0Y2goKCkgPT4gXCJcIik7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQRElNIFB1Yi9TdWIgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7dGV4dC5zbGljZSgwLCAyMDApfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcmVzcG9uc2UuYm9keSkgdGhyb3cgbmV3IEVycm9yKFwiUERJTSBQdWIvU3ViIHJlc3BvbnNlIGhhcyBubyBzdHJlYW0gYm9keVwiKTtcbiAgICAgICAgcmVhZGVyID0gcmVzcG9uc2UuYm9keS5nZXRSZWFkZXIoKTtcbiAgICAgICAgY29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuICAgICAgICBsZXQgYnVmZmVyZWQgPSBcIlwiO1xuXG4gICAgICAgIHdoaWxlIChpc0N1cnJlbnQoKSkge1xuICAgICAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgaWYgKGRvbmUpIHRocm93IG5ldyBFcnJvcihcIlBESU0gUHViL1N1YiBzdHJlYW0gZW5kZWQgdW5leHBlY3RlZGx5XCIpO1xuICAgICAgICAgIGJ1ZmZlcmVkICs9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KTtcbiAgICAgICAgICBpZiAoYnVmZmVyZWQubGVuZ3RoID4gMV8wNDhfNTc2KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQRElNIFB1Yi9TdWIgc3RyZWFtIGV4Y2VlZGVkIHRoZSBjbGllbnQgYnVmZmVyIGxpbWl0XCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBsZXQgbmV3bGluZSA9IGJ1ZmZlcmVkLmluZGV4T2YoXCJcXG5cIik7XG4gICAgICAgICAgd2hpbGUgKG5ld2xpbmUgPj0gMCkge1xuICAgICAgICAgICAgY29uc3QgbGluZSA9IGJ1ZmZlcmVkLnNsaWNlKDAsIG5ld2xpbmUpO1xuICAgICAgICAgICAgYnVmZmVyZWQgPSBidWZmZXJlZC5zbGljZShuZXdsaW5lICsgMSk7XG4gICAgICAgICAgICBuZXdsaW5lID0gYnVmZmVyZWQuaW5kZXhPZihcIlxcblwiKTtcbiAgICAgICAgICAgIGlmICghbGluZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBldmVudCA9IEpTT04ucGFyc2UobGluZSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgICAgICBpZiAoZXZlbnQudHlwZSA9PT0gXCJyZWFkeVwiKSB7XG4gICAgICAgICAgICAgIGluaXRpYWxSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICAgIHJldHJ5TXMgPSAyMDA7XG4gICAgICAgICAgICAgIG1hcmtSZWFkeSgpO1xuICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJwdWJzdWItcmVhZHlcIik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBldmVudC50eXBlID09PSBcIm1lc3NhZ2VcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgZXZlbnQuY2hhbm5lbCA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgZXZlbnQubWVzc2FnZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHRoaXMuZW1pdChcIm1lc3NhZ2VcIiwgZXZlbnQuY2hhbm5lbCwgZXZlbnQubWVzc2FnZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBldmVudC50eXBlID09PSBcInBtZXNzYWdlXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGV2ZW50LnBhdHRlcm4gPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGV2ZW50LmNoYW5uZWwgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIGV2ZW50Lm1lc3NhZ2UgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJwbWVzc2FnZVwiLCBldmVudC5wYXR0ZXJuLCBldmVudC5jaGFubmVsLCBldmVudC5tZXNzYWdlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQudHlwZSA9PT0gXCJoZWFydGJlYXRcIikge1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBESU0gUHViL1N1YiBzdHJlYW0gcmV0dXJuZWQgYW4gaW52YWxpZCBldmVudFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmICghaXNDdXJyZW50KCkpIHtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSZWFkeSkgcmVqZWN0QmVmb3JlUmVhZHkodGhpcy5kaXNjb25uZWN0ZWRFcnJvcik7XG4gICAgICAgICAgYXdhaXQgcmVhZGVyPy5jYW5jZWwoKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJlYWRlcj8uY2FuY2VsKCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICBpZiAoIWluaXRpYWxSZWFkeSkgcmVqZWN0QmVmb3JlUmVhZHkoZXJyb3IpO1xuICAgICAgICB0aGlzLmVtaXQoXCJwdWJzdWItZXJyb3JcIiwgZXJyb3IpO1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgW1BESU1dIFB1Yi9TdWIgc3RyZWFtIGRpc2Nvbm5lY3RlZDsgcmV0cnlpbmcgaW4gJHtyZXRyeU1zfW1zOiAke1xuICAgICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG4gICAgICAgICAgfWAsXG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgY29uc3QgZmluaXNoID0gKCkgPT4ge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuc2lnbmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBmaW5pc2gpO1xuICAgICAgICAgICAgdGhpcy5saWZlY3ljbGVDb250cm9sbGVyLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgZmluaXNoKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dChmaW5pc2gsIHJldHJ5TXMpO1xuICAgICAgICAgIGNvbnRyb2xsZXIuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBmaW5pc2gsIHsgb25jZTogdHJ1ZSB9KTtcbiAgICAgICAgICB0aGlzLmxpZmVjeWNsZUNvbnRyb2xsZXIuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBmaW5pc2gsIHsgb25jZTogdHJ1ZSB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHJ5TXMgPSBNYXRoLm1pbihyZXRyeU1zICogMiwgMzBfMDAwKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQnVsbE1RIHJlYWRzIHRoaXMuX2NsaWVudC5vcHRpb25zLmtleVByZWZpeCB0byB2YWxpZGF0ZSBubyBwcmVmaXggaXMgc2V0LFxuICAgKiBhbmQgdXNlcyB0aGlzLl9jbGllbnQub3B0aW9ucyBhcyBpdHMgb3B0cy4gU3VwcGx5IHNhZmUgZGVmYXVsdHMuXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgb3B0aW9uczoge1xuICAgIGtleVByZWZpeD86IHN0cmluZztcbiAgICBtYXhSZXRyaWVzUGVyUmVxdWVzdDogbnVsbDtcbiAgICBlbmFibGVSZWFkeUNoZWNrOiBib29sZWFuO1xuICAgIGVuYWJsZU9mZmxpbmVRdWV1ZTogYm9vbGVhbjtcbiAgfSA9IHtcbiAgICBrZXlQcmVmaXg6IHVuZGVmaW5lZCxcbiAgICBtYXhSZXRyaWVzUGVyUmVxdWVzdDogbnVsbCxcbiAgICBlbmFibGVSZWFkeUNoZWNrOiBmYWxzZSxcbiAgICBlbmFibGVPZmZsaW5lUXVldWU6IGZhbHNlLFxuICB9O1xuXG4gIGNvbnN0cnVjdG9yKGV4ZWNVcmw/OiBzdHJpbmcsIGJlYXJlclRva2VuPzogc3RyaW5nKSB7XG4gICAgc3VwZXIoKTtcbiAgICAvLyBQRElNX0VYRUNfVVJMIC8gUERJTV9FWEVDX1RPS0VOIGFyZSBub24tc2VjcmV0IGVudiB2YXJzIHRoYXQgdGFrZVxuICAgIC8vIHByZWNlZGVuY2Ugb3ZlciB0aGUgbGVnYWN5IFBESU1fSFRUUF9FWEVDX1VSTCAvIFBESU1fQkVBUkVSX1RPS0VOXG4gICAgLy8gc2VjcmV0cyAod2hpY2ggbWF5IHBvaW50IHRvIGEgdHJhbnNpZW50IFJlcGxpdCBkZXYgd29ya3NwYWNlIFVSTCkuXG4gICAgdGhpcy5leGVjVXJsID1cbiAgICAgIGV4ZWNVcmwgfHxcbiAgICAgIHByb2Nlc3MuZW52LlBESU1fRVhFQ19VUkwgfHxcbiAgICAgIHByb2Nlc3MuZW52LlBESU1fSFRUUF9FWEVDX1VSTCB8fFxuICAgICAgXCJcIjtcbiAgICB0aGlzLmJlYXJlclRva2VuID1cbiAgICAgIGJlYXJlclRva2VuIHx8XG4gICAgICBwcm9jZXNzLmVudi5QRElNX0VYRUNfVE9LRU4gfHxcbiAgICAgIHByb2Nlc3MuZW52LlBESU1fQkVBUkVSX1RPS0VOIHx8XG4gICAgICBcIlwiO1xuXG4gICAgaWYgKCF0aGlzLmV4ZWNVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlBESU1fSFRUUF9FWEVDX1VSTCBpcyByZXF1aXJlZCBmb3IgUGRpbVJlZGlzQ2xpZW50XCIpO1xuICAgIH1cblxuICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWQpIHJldHVybjtcbiAgICAgIHRoaXMuZW1pdChcImNvbm5lY3RcIik7XG4gICAgICB0aGlzLmVtaXQoXCJyZWFkeVwiKTtcbiAgICAgIGxvZ2dlci5pbmZvKFwi4pyFIFtQRElNXSBDb25uZWN0ZWQgdmlhIEhUVFAgZXhlYyBlbmRwb2ludFwiKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFN0YXRpYyByYXRlLWxpbWl0IGRlYWRsaW5lIOKAlCBzaGFyZWQgYWNyb3NzIEFMTCBQZGltUmVkaXNDbGllbnQgaW5zdGFuY2VzLlxuICAvLyBVcGRhdGVkIGJ5IGV4ZWMoKSBvbiBlYWNoIDQyOSB0byBtaXJyb3IgdGhlIGN1cnJlbnQgQUlNRCBnYXAsIHByb3ZpZGluZyBhXG4gIC8vIHNlY29uZGFyeSBob2xkIHRoYXQga2VlcHMgYW55IGNhbGxlciBmcm9tIGZpcmluZyBkdXJpbmcgdGhlIGJhY2tvZmYgd2luZG93LlxuICAvL1xuICAvLyBDbGVhcmVkIG9wcG9ydHVuaXN0aWNhbGx5IGJ5IHN1Y2Nlc3NmdWwgcmVzcG9uc2VzLCBCVVQgb25seSB3aGVuIHRoZSBkZWFkbGluZVxuICAvLyBoYXMgYWxyZWFkeSBleHBpcmVkIChEYXRlLm5vdygpID49IGRlYWRsaW5lKS4gIFJhY2Utc2FmZXR5IHVuZGVyIHBhcmFsbGVsXG4gIC8vIGRpcmVjdCBsYW5lczogd2l0aCBfUERJTV9ESVJFQ1RfTEFORVMgPiAxLCBhbiBpbi1mbGlnaHQgcmVxdWVzdCB0aGF0IHN0YXJ0ZWRcbiAgLy8gYmVmb3JlIGEgc2libGluZyBsYW5lJ3MgNDI5IGNhbiBjb21wbGV0ZSBzdWNjZXNzZnVsbHkgKmFmdGVyKiB0aGUgNDI5IGhhc1xuICAvLyBzZXQgYSBuZXcgZnV0dXJlIGRlYWRsaW5lLiAgTmFpdmVseSBjbGVhcmluZyB0byAwIG9uIHRoYXQgc3VjY2VzcyB3b3VsZFxuICAvLyB3aXBlIG91dCB0aGUgYWN0aXZlIGJhY2tvZmYgYW5kIHJlbGVhc2UgdGhlIG5leHQgY2FsbGVyIGltbWVkaWF0ZWx5LiAgVGhlXG4gIC8vIFwib25seSBjbGVhciBpZiBhbHJlYWR5IGV4cGlyZWRcIiBydWxlIG1ha2VzIHRoZSBhc3NpZ25tZW50IGEgbm8tb3AgY2xlYW51cFxuICAvLyBmb3IgbGl2ZSBob2xkcyBhbmQgYSB0aWR5IHJlc2V0IG9uY2UgdGhlIGhvbGQgaGFzIG5hdHVyYWxseSBlbGFwc2VkLlxuICBwcml2YXRlIHN0YXRpYyBfcmF0ZUxpbWl0ZWRVbnRpbCA9IDA7XG4gIHByaXZhdGUgc3RhdGljIF9jbGVhclJhdGVMaW1pdElmRXhwaXJlZCgpOiB2b2lkIHtcbiAgICBpZiAoRGF0ZT8ubm93KCkgPj0gUGRpbVJlZGlzQ2xpZW50Py5fcmF0ZUxpbWl0ZWRVbnRpbCkge1xuICAgICAgUGRpbVJlZGlzQ2xpZW50Ll9yYXRlTGltaXRlZFVudGlsID0gMDtcbiAgICB9XG4gIH1cbiAgLy8gNDI5IHNldHRlciDigJQgbW9ub3RvbmljOiBuZXZlciBsb3dlcnMgYW4gZXhpc3RpbmcgZnV0dXJlIGRlYWRsaW5lLiAgV2l0aG91dFxuICAvLyB0aGlzIGd1YXJkLCB0d28gbGFuZXMgcmFjaW5nIG9uIDQyOXMgd2l0aCBqaXR0ZXJlZCBob2xkcyBjb3VsZCBsZXQgdGhlXG4gIC8vIHNob3J0ZXIgaml0dGVyIG92ZXJ3cml0ZSB0aGUgbG9uZ2VyIG9uZSBhbmQgcmVsZWFzZSBjYWxsZXJzIGVhcmx5LlxuICBwcml2YXRlIHN0YXRpYyBfc2V0NDI5RGVhZGxpbmUoZGVhZGxpbmVNczogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKGRlYWRsaW5lTXMgPiBQZGltUmVkaXNDbGllbnQ/Ll9yYXRlTGltaXRlZFVudGlsKSB7XG4gICAgICBQZGltUmVkaXNDbGllbnQuX3JhdGVMaW1pdGVkVW50aWwgPSBkZWFkbGluZU1zO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXhlYzxUID0gdW5rbm93bj4oXG4gICAgY29tbWFuZDogdW5rbm93bltdLFxuICAgIG9wdGlvbnM6IHsgYmxvY2tpbmc/OiBib29sZWFuOyByZXF1ZXN0VGltZW91dE1zPzogbnVtYmVyIHwgbnVsbCB9ID0ge30sXG4gICk6IFByb21pc2U8VD4ge1xuICAgIGlmICh0aGlzLmRpc2Nvbm5lY3RlZCkgcmV0dXJuIFByb21pc2UucmVqZWN0KHRoaXMuZGlzY29ubmVjdGVkRXJyb3IpO1xuICAgIGNvbnN0IFtjbWQsIC4uLnJhd0FyZ3NdID0gY29tbWFuZCBhcyAoc3RyaW5nIHwgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZClbXTtcbiAgICAvLyBQRElNJ3MgSFRUUCBjb250cmFjdCBhY2NlcHRzIG9ubHkgc3RyaW5nIGFyZ3VtZW50cy4gQW4gYWJzZW50IFJlZGlzIHZhbHVlXG4gICAgLy8gaXMgYSByZXN1bHQgKGB7IHJlc3VsdDogbnVsbCB9YCksIG5vdCBhIHZhbGlkIGNvbW1hbmQgYXJndW1lbnQuIFJlamVjdGluZ1xuICAgIC8vIG51bGxpc2ggaW5wdXRzIHByZXZlbnRzIHNpbGVudGx5IHBlcnNpc3RpbmcgYW4gZW1wdHkgc3RyaW5nIGluIGl0cyBwbGFjZS5cbiAgICBpZiAocmF3QXJncy5zb21lKChhcmcpID0+IGFyZyA9PT0gbnVsbCB8fCBhcmcgPT09IHVuZGVmaW5lZCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYFtQRElNXSAke1N0cmluZyhjbWQpfSByZWNlaXZlZCBhIG51bGxpc2ggY29tbWFuZCBhcmd1bWVudGApO1xuICAgIH1cbiAgICBjb25zdCBhcmdzID0gcmF3QXJncy5tYXAoKGFyZykgPT4gU3RyaW5nKGFyZykpO1xuXG4gICAgLy8gQ2lyY3VpdCBicmVha2VyOiBmYWlsLWZhc3QgQkVGT1JFIGpvaW5pbmcgdGhlIGdsb2JhbCBxdWV1ZSBzbyB3ZSBkb24ndFxuICAgIC8vIHdhc3RlIGEgcXVldWUgc2xvdCBvbiBhIHJlcXVlc3Qgd2Uga25vdyB3aWxsIGZhaWwuXG4gICAgaWYgKCFjYkFsbG93UmVxdWVzdCgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBbUERJTV0gQ2lyY3VpdCBPUEVOIOKAlCAke2NtZH0gcmVqZWN0ZWQgKGJhY2tpbmcgb2ZmIHVudGlsIFBESU0gcmVjb3ZlcnMpYCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gRW5xdWV1ZSB0aHJvdWdoIHRoZSBnbG9iYWwgc2VyaWFsaXplci4gIEFsbCBQRElNIEhUVFAgcmVxdWVzdHMgZnJvbSBBTExcbiAgICAvLyBjb2RlIHBhdGhzIChkaXJlY3QgY2FsbHMsIEx1YUV4ZWN1dG9yIHJlZGlzLmNhbGwsIGJ6cG9wbWluKSBwYXNzIHRocm91Z2hcbiAgICAvLyB0aGlzIHNpbmdsZSBjaGFpbiwgZXhlY3V0ZWQgb25lIGF0IGEgdGltZSB3aXRoIGEgMTUwbXMgZ2FwIGJldHdlZW4gdGhlbS5cbiAgICBjb25zdCBydW4gPSBhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLmFzc2VydENvbm5lY3RlZCgpO1xuICAgICAgLy8gUmF0ZS1saW1pdCBiYWNrb2ZmIGlzIGV2YWx1YXRlZCBJTlNJREUgdGhlIGNoYWluIChhdCBleGVjdXRpb24gdGltZSwgbm90XG4gICAgICAvLyBlbnF1ZXVlIHRpbWUpLiAgVGhpcyBpcyBjcml0aWNhbDogaWYgYWxsIGNhbGxlcnMgZXZhbHVhdGVkIGl0IGF0IGVucXVldWVcbiAgICAgIC8vIHRpbWUsIHRoZXknZCBhbGwgY2xlYXIgdGhlIGNoZWNrIHNpbXVsdGFuZW91c2x5IGFuZCBzdGlsbCBidXJzdCBQRElNLlxuICAgICAgLy8gSW5zaWRlIHRoZSBjaGFpbiB0aGV5IGFyZSBzZXJpYWxpemVkIOKAlCBvbmx5IE9ORSBjYWxsZXIgd2FrZXMgZnJvbSB0aGVcbiAgICAgIC8vIGJhY2tvZmYgd2FpdCBhdCBhIHRpbWUsIHByZXZlbnRpbmcgdGhlIGJ1cnN0LlxuICAgICAgY29uc3QgcmxXYWl0ID0gUGRpbVJlZGlzQ2xpZW50Py5fcmF0ZUxpbWl0ZWRVbnRpbCAtIERhdGU/Lm5vdygpO1xuICAgICAgaWYgKHJsV2FpdCA+IDApIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxheShybFdhaXQpO1xuICAgICAgfVxuICAgICAgdGhpcy5hc3NlcnRDb25uZWN0ZWQoKTtcblxuICAgICAgbGV0IGNvdW50ZWQgPSBmYWxzZTsgLy8gcHJldmVudCBkb3VibGUtY291bnRpbmcgaW4gdGhlIGNhdGNoIGJsb2NrXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCh0aGlzLmV4ZWNVcmwsIHtcbiAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3RoaXMuYmVhcmVyVG9rZW59YCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgY21kLCBhcmdzIH0pLFxuICAgICAgICAgIHNpZ25hbDogdGhpcy5yZXF1ZXN0U2lnbmFsKG9wdGlvbnMucmVxdWVzdFRpbWVvdXRNcyksXG4gICAgICAgICAgLy8gRG8gbm90IGZvbGxvdyByZWRpcmVjdHMgYXV0b21hdGljYWxseSDigJQgaWYgUERJTSdzIHByb3h5IHJldHVybnMgMzAyXG4gICAgICAgICAgLy8gKFJlcGxpdCByZWRpcmVjdGluZyB0byBhbiBlcnJvci9sb2dpbiBwYWdlIHdoZW4gdGhlIHNlcnZpY2UgaXMgZG93bilcbiAgICAgICAgICAvLyB3ZSBuZWVkIHRvIHNlZSB0aGUgcmF3IDMwMiBzdGF0dXMgc28gb3VyIDN4eCBoYW5kbGVyIGNhbiB0cmlwIHRoZVxuICAgICAgICAgIC8vIGNpcmN1aXQgYnJlYWtlciByYXRoZXIgdGhhbiBzaWxlbnRseSBmb2xsb3dpbmcgaW50byBhbiBIVE1MIHBhZ2UuXG4gICAgICAgICAgcmVkaXJlY3Q6IFwibWFudWFsXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICghcmVzLm9rKSB7XG4gICAgICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IHJlcy50ZXh0KCkuY2F0Y2goKCkgPT4gXCJcIik7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXMgPT09IDQyOSkge1xuICAgICAgICAgICAgLy8gQUlNRCBtdWx0aXBsaWNhdGl2ZSBpbmNyZWFzZTogZ2FwIGp1bXBzIHRvIGdhcCDDlyAyLjUgKGFnZ3Jlc3NpdmUsXG4gICAgICAgICAgICAvLyByZWFjaGluZyB0aGUgMjAwMG1zIGNlaWxpbmcgaW4gfjkgY29uc2VjdXRpdmUgaGl0cyByYXRoZXIgdGhhbiB+NjApLlxuICAgICAgICAgICAgLy8gX2VucXVldWVFeGVjIHJlYWRzIF9wZGltR2FwTXMgQUZURVIgdGhlIHRocm93LCBzbyB0aGUgbmV4dCBjYWxsZXJcbiAgICAgICAgICAgIC8vIGluIHRoZSBjaGFpbiBhdXRvbWF0aWNhbGx5IHdhaXRzIHRoZSBuZXcgKGxhcmdlcikgZ2FwIGJlZm9yZSBmaXJpbmcuXG4gICAgICAgICAgICAvLyBUaGUgc3RhdGljIF9yYXRlTGltaXRlZFVudGlsIG1pcnJvcnMgdGhlIG5ldyBnYXAgc28gdGhhdCBldmVuIGlmIGFcbiAgICAgICAgICAgIC8vIGNhbGxlciBzb21laG93IGdvdCB0aHJvdWdoLCB0aGUgcGVyLWZuKCkgcmF0ZS1saW1pdCBjaGVjayBob2xkcyBpdC5cbiAgICAgICAgICAgIGNvbnN0IG5ld0dhcCA9IF9wZGltQWRhcHQ0MjkoKTtcbiAgICAgICAgICAgIC8vIFJlc3BlY3QgdGhlIFJldHJ5LUFmdGVyIGhlYWRlciBpZiBQRElNIHNlbmRzIG9uZS5cbiAgICAgICAgICAgIC8vIFBESU0ga25vd3MgaXRzIG93biByYXRlIGxpbWl0IGFuZCBjYW4gdGVsbCB1cyBleGFjdGx5IGhvdyBsb25nIHRvXG4gICAgICAgICAgICAvLyB3YWl0IOKAlCBtb3JlIGFjY3VyYXRlIHRoYW4gb3VyIEFJTUQgZXN0aW1hdGUgYWxvbmUuICBIb25vdXIgd2hpY2hldmVyXG4gICAgICAgICAgICAvLyBpcyBsYXJnZXIgc28gd2UgbmV2ZXIgdW5kZXItd2FpdCByZWxhdGl2ZSB0byBQRElNJ3Mgb3duIHNpZ25hbC5cbiAgICAgICAgICAgIGxldCByZXRyeUFmdGVyTXMgPSAwO1xuICAgICAgICAgICAgY29uc3QgcmV0cnlBZnRlckhkciA9IHJlcy5oZWFkZXJzLmdldChcInJldHJ5LWFmdGVyXCIpO1xuICAgICAgICAgICAgaWYgKHJldHJ5QWZ0ZXJIZHIpIHtcbiAgICAgICAgICAgICAgY29uc3Qgc2VjcyA9IHBhcnNlRmxvYXQocmV0cnlBZnRlckhkcik7XG4gICAgICAgICAgICAgIGlmICghaXNOYU4oc2VjcykgJiYgc2VjcyA+IDApXG4gICAgICAgICAgICAgICAgcmV0cnlBZnRlck1zID0gTWF0aC5jZWlsKHNlY3MgKiAxMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGhvbGRNcyA9IE1hdGgubWF4KG5ld0dhcCwgcmV0cnlBZnRlck1zKTtcbiAgICAgICAgICAgIC8vIEFkZCBwZXItY2FsbCByYW5kb20gaml0dGVyIHRvIF9yYXRlTGltaXRlZFVudGlsIHNvIHRoYXQgcHJvY2Vzc2VzXG4gICAgICAgICAgICAvLyB3aGljaCBnb3QgNDI5IGF0IHRoZSBzYW1lIHdhbGwtY2xvY2sgdGltZSBkb24ndCBhbGwgcmVsZWFzZSB0aGVpclxuICAgICAgICAgICAgLy8gaG9sZCBhdCB0aGUgZXhhY3Qgc2FtZSBtb21lbnQg4oCUIHRoZXknbGwgYmUgc3ByZWFkIDDigJM1MDBtcyBhcGFydC5cbiAgICAgICAgICAgIFBkaW1SZWRpc0NsaWVudD8uX3NldDQyOURlYWRsaW5lKFxuICAgICAgICAgICAgICBEYXRlPy5ub3coKSArIGhvbGRNcyArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDUwMCksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZXJyTXNnID0gYFBESU0gSFRUUCA0Mjk6IFRvbyBtYW55IHJlcXVlc3RzIChnYXDihpIke25ld0dhcH1tcyR7cmV0cnlBZnRlck1zID4gMCA/IGAsIHJldHJ5LWFmdGVyPSR7cmV0cnlBZnRlck1zfW1zYCA6IFwiXCJ9KWA7XG4gICAgICAgICAgICBjb3VudGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy8gQnVyc3QgZGVkdXA6IGEgc2ltdWx0YW5lb3VzIDQyOSBzdG9ybSAobXVsdGlwbGUgY29tbWFuZHMgd2l0aGluXG4gICAgICAgICAgICAvLyAyIHMpIHByb2R1Y2VzIG5lYXItaWRlbnRpY2FsIHdhcm4gbGluZXMuICBMb2cgdGhlIGZpcnN0IG9jY3VycmVuY2VcbiAgICAgICAgICAgIC8vIGltbWVkaWF0ZWx5OyBhY2N1bXVsYXRlIHN1YnNlcXVlbnQgb25lcyBhbmQgZmx1c2ggYSBzdW1tYXJ5IG9uIHRoZVxuICAgICAgICAgICAgLy8gbmV4dCA0MjkgYWZ0ZXIgdGhlIHdpbmRvdyBleHBpcmVzLlxuICAgICAgICAgICAgY29uc3Qgbm93NDI5ID0gRGF0ZT8ubm93KCk7XG4gICAgICAgICAgICBpZiAobm93NDI5IC0gX2xhc3Q0MjlMb2dnZWRBdCA8IF80MjlfREVEVVBfTVMpIHtcbiAgICAgICAgICAgICAgX3N1cHByZXNzZWQ0MjlDb3VudCsrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKF9zdXBwcmVzc2VkNDI5Q291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAgICAgICBgW1BESU1dIGV4ZWMgZXJyb3IgWyR7Y21kfV06IFBESU0gSFRUUCA0Mjkg4oCUIGdhcOKGkiR7bmV3R2FwfW1zIGAgK1xuICAgICAgICAgICAgICAgICAgICBgKCsgJHtfc3VwcHJlc3NlZDQyOUNvdW50fSBzdXBwcmVzc2VkIGluIGxhc3QgJHtfNDI5X0RFRFVQX01TfW1zIGJ1cnN0KWAsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBfc3VwcHJlc3NlZDQyOUNvdW50ID0gMDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICAgICAgICAgIGBbUERJTV0gZXhlYyBlcnJvciBbJHtjbWR9XTogUERJTSBIVFRQIDQyOSDigJQgZ2Fw4oaSJHtuZXdHYXB9bXNgLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgX2xhc3Q0MjlMb2dnZWRBdCA9IG5vdzQyOTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJNc2cpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBPbmx5IHRyaXAgdGhlIGNpcmN1aXQgYnJlYWtlciBvbiA1eHggc2VydmVyIGVycm9ycyBvciB3aGVuIFBESU0gaXNcbiAgICAgICAgICAvLyBjb21wbGV0ZWx5IHVucmVhY2hhYmxlLiAgNHh4IGVycm9ycyBhcmUgY2xpZW50LXNpZGUgbWlzdGFrZXMgKGJhZFxuICAgICAgICAgIC8vIGFyZ3VtZW50cywgdW5zdXBwb3J0ZWQgY29tbWFuZCwgZXRjLikg4oCUIHRoZXkgZG9uJ3QgaW5kaWNhdGUgYW4gb3V0YWdlLlxuICAgICAgICAgIC8vIDN4eCByZWRpcmVjdHMgbWVhbiBQRElNJ3MgSFRUUCBleGVjIGVuZHBvaW50IGlzIG5vdCByZWFjaGFibGUg4oCUXG4gICAgICAgICAgLy8gUmVwbGl0J3MgcHJveHkgcmVkaXJlY3RzIHRvIGFuIGVycm9yL2xvZ2luIHBhZ2Ugd2hlbiB0aGUgc2VydmljZSBpc1xuICAgICAgICAgIC8vIGRvd24gb3IgcmVzdGFydGluZy4gIFRyZWF0IGV4YWN0bHkgbGlrZSBhIDV4eDogdHJpcCB0aGUgY2lyY3VpdFxuICAgICAgICAgIC8vIGJyZWFrZXIgc28gY2FsbGVycyBmYWlsLWZhc3QgaW5zdGVhZCBvZiBmb2xsb3dpbmcgdGhlIHJlZGlyZWN0IGNoYWluXG4gICAgICAgICAgLy8gYW5kIHN1cmZhY2luZyBjb25mdXNpbmcgSFRNTCBcImRlcGxveW1lbnQgY291bGQgbm90IGJlIHJlYWNoZWRcIiBlcnJvcnMuXG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXMgPj0gMzAwICYmIHJlcy5zdGF0dXMgPCA0MDApIHtcbiAgICAgICAgICAgIGNiUmVjb3JkNTAzKCk7XG4gICAgICAgICAgICBjb3VudGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGNvbnN0IGVyck1zZyA9IGBQRElNIEhUVFAgJHtyZXMuc3RhdHVzfTogc2VydmljZSB0ZW1wb3JhcmlseSB1bnJlYWNoYWJsZWA7XG4gICAgICAgICAgICBfbG9nRXhlY0Vycm9yKGNtZCwgcmVzLnN0YXR1cywgZXJyTXNnKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJNc2cpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVzLnN0YXR1cyA+PSA1MDApIHtcbiAgICAgICAgICAgIGNiUmVjb3JkNTAzKCk7XG4gICAgICAgICAgICBjb3VudGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGNvbnN0IGVyck1zZyA9IGBQRElNIEhUVFAgJHtyZXMuc3RhdHVzfTogJHt0ZXh0LnNsaWNlKDAsIDEyMCl9YDtcbiAgICAgICAgICAgIF9sb2dFeGVjRXJyb3IoY21kLCByZXMuc3RhdHVzLCBlcnJNc2cpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVyck1zZyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIDR4eCBtZWFucyB0aGUgc2VydmVyIGlzIHJlc3BvbnNpdmUsIGJ1dCB0aGlzIG9wZXJhdGlvbiBmYWlsZWQuIEtlZXBcbiAgICAgICAgICAvLyB0aGUgY2lyY3VpdCBoZWFsdGh5IHdoaWxlIHN1cmZhY2luZyB0aGUgY29tbWFuZCBlcnJvciB0byBpdHMgY2FsbGVyLlxuICAgICAgICAgIGNvdW50ZWQgPSB0cnVlO1xuICAgICAgICAgIFBkaW1SZWRpc0NsaWVudC5fY2xlYXJSYXRlTGltaXRJZkV4cGlyZWQoKTtcbiAgICAgICAgICBfcGRpbUFkYXB0U3VjY2VzcygpO1xuICAgICAgICAgIGNiUmVjb3JkU3VjY2VzcygpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBQRElNIEhUVFAgJHtyZXMuc3RhdHVzfSAoJHtTdHJpbmcoY21kKX0pOiAke3RleHQuc2xpY2UoMCwgMjAwKX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdWNjZXNzZnVsIHJlc3BvbnNlIOKAlCBvcHBvcnR1bmlzdGljYWxseSBjbGVhciB0aGUgcmF0ZS1saW1pdCBkZWFkbGluZVxuICAgICAgICAvLyAob25seSBpZiBhbHJlYWR5IGV4cGlyZWQsIHRvIGF2b2lkIHdpcGluZyBvdXQgYSBjb25jdXJyZW50IDQyOS1zZXRcbiAgICAgICAgLy8gaG9sZCB1bmRlciBwYXJhbGxlbCBsYW5lcyDigJQgc2VlIF9jbGVhclJhdGVMaW1pdElmRXhwaXJlZCBjb21tZW50KSxcbiAgICAgICAgLy8gYW5kIGxldCB0aGUgQUlNRCBnYXAgc2hyaW5rIGFkZGl0aXZlbHkgdG93YXJkIHRoZSBmbG9vci5cbiAgICAgICAgUGRpbVJlZGlzQ2xpZW50Ll9jbGVhclJhdGVMaW1pdElmRXhwaXJlZCgpO1xuICAgICAgICBfcGRpbUFkYXB0U3VjY2VzcygpO1xuXG4gICAgICAgIC8vIERldGVjdCB3aGVuIFBESU0gcmV0dXJucyBub24tSlNPTiAoZS5nLiBSZXBsaXQncyBcImFwcCBub3QgcnVubmluZ1wiIEhUTUwgcGFnZSkuXG4gICAgICAgIC8vIFRyZWF0IHRoaXMgYXMgYSA1MDMtZXF1aXZhbGVudCDigJQgdHJpcCB0aGUgY2lyY3VpdCBicmVha2VyLlxuICAgICAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlcy5oZWFkZXJzLmdldChcImNvbnRlbnQtdHlwZVwiKSA/PyBcIlwiO1xuICAgICAgICBpZiAoIWNvbnRlbnRUeXBlPy5pbmNsdWRlcyhcImFwcGxpY2F0aW9uL2pzb25cIikpIHtcbiAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVzLnRleHQoKS5jYXRjaCgoKSA9PiBcIih1bnJlYWRhYmxlKVwiKTtcbiAgICAgICAgICBjYlJlY29yZDUwMygpO1xuICAgICAgICAgIGNvdW50ZWQgPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGVyck1zZyA9IGBQRElNIHJldHVybmVkIG5vbi1KU09OICgke2NvbnRlbnRUeXBlPy5zcGxpdChcIjtcIilbMF0udHJpbSgpIHx8IFwidW5rbm93biB0eXBlXCJ9KTogJHtib2R5Py5zbGljZSgwLCA4MCl9YDtcbiAgICAgICAgICBfbG9nRXhlY0Vycm9yKGNtZCwgMjAwLCBlcnJNc2cpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJNc2cpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcy5qc29uKCk7XG4gICAgICAgIGNvdW50ZWQgPSB0cnVlO1xuICAgICAgICBjYlJlY29yZFN1Y2Nlc3MoKTsgLy8gYSBzdWNjZXNzZnVsIHJlc3BvbnNlIHJlc2V0cyB0aGUgY291bnRlciArIGNsb3NlcyBjaXJjdWl0XG5cbiAgICAgICAgaWYgKGRhdGEgIT09IG51bGwgJiYgdHlwZW9mIGRhdGEgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICBpZiAoXCJyZXN1bHRcIiBpbiBkYXRhKSByZXR1cm4gZGF0YT8ucmVzdWx0O1xuICAgICAgICAgIGlmIChcImVycm9yXCIgaW4gZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgZXJyTXNnID0gU3RyaW5nKGRhdGE/LmVycm9yKTtcbiAgICAgICAgICAgIGlmIChlcnJNc2c/LnN0YXJ0c1dpdGgoXCJFUlIgdW5rbm93biBjb21tYW5kXCIpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJNc2cpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVyck1zZyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc2Nvbm5lY3RlZCkgdGhyb3cgdGhpcy5kaXNjb25uZWN0ZWRFcnJvcjtcbiAgICAgICAgLy8gQWJvcnRTaWduYWwudGltZW91dCgpIHRocm93cyBhIFRpbWVvdXRFcnJvciAoRE9NRXhjZXB0aW9uIG5hbWU9J1RpbWVvdXRFcnJvcicpLlxuICAgICAgICAvLyBBYm9ydENvbnRyb2xsZXIuYWJvcnQoKSB0aHJvd3MgYW4gQWJvcnRFcnJvciAoRE9NRXhjZXB0aW9uIG5hbWU9J0Fib3J0RXJyb3InKS5cbiAgICAgICAgLy8gTmVpdGhlciBzaG91bGQgdHJpcCB0aGUgY2lyY3VpdCBicmVha2VyIOKAlCB0aGV5IGluZGljYXRlIFBESU0gaXMgc2xvdy9idXN5LFxuICAgICAgICAvLyBub3QgdGhhdCBQRElNIGlzIGRvd24uIEluc3RlYWQgYXBwbHkgQUlNRCBiYWNrcHJlc3N1cmUgKGluY3JlYXNlIGdhcCkgc28gdGhlXG4gICAgICAgIC8vIGNhbGxlciByYXRlIGRyb3BzIGFuZCBQRElNIGNhbiBjYXRjaCB1cC4gT25seSBnZW51aW5lIDV4eC9uZXR3b3JrIGVycm9yc1xuICAgICAgICAvLyAoRUNPTk5SRUZVU0VELCBldGMuKSB0cmlwIHRoZSBjaXJjdWl0IGJyZWFrZXIuXG4gICAgICAgIGNvbnN0IGlzVGltZW91dCA9XG4gICAgICAgICAgIWNvdW50ZWQgJiZcbiAgICAgICAgICAoKGVyciBhcyBhbnkpPy5uYW1lID09PSBcIlRpbWVvdXRFcnJvclwiIHx8IChlcnIgYXMgYW55KT8ubmFtZSA9PT0gXCJBYm9ydEVycm9yXCIpO1xuICAgICAgICBjb25zdCBpc0NpcmN1aXRNc2cgPVxuICAgICAgICAgICFjb3VudGVkICYmIChlcnIgYXMgYW55KT8ubWVzc2FnZS5zdGFydHNXaXRoKFwiW1BESU1dIENpcmN1aXRcIik7XG4gICAgICAgIGlmICghY291bnRlZCAmJiAhaXNUaW1lb3V0ICYmICFpc0NpcmN1aXRNc2cpIHtcbiAgICAgICAgICBjYlJlY29yZDUwMygpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzVGltZW91dCkge1xuICAgICAgICAgIC8vIFNsb3cgUERJTSByZXNwb25zZSDigJQgYXBwbHkgbWlsZCBiYWNrcHJlc3N1cmUgV0lUSE9VVCBzZXR0aW5nIF9sYXN0NDI5QXQuXG4gICAgICAgICAgLy8gVXNpbmcgX3BkaW1BZGFwdDQyOSgpIGhlcmUgd2FzIHRoZSByb290IGNhdXNlIG9mIHBlcm1hbmVudCBnYXAtcGlubmluZzpcbiAgICAgICAgICAvLyBpdCBzZXQgX2xhc3Q0MjlBdCBvbiBldmVyeSB0aW1lb3V0LCBibG9ja2luZyB0aGUgcGFzc2l2ZS1kZWNheSB0aW1lciB0aGF0XG4gICAgICAgICAgLy8gbmVlZHMgNXMgb2YgNDI5LXF1aWV0IHRvIHJ1bi4gR2FwIHN0YXllZCBhdCAyMDAwbXMgZm9yZXZlciDihpIgc2Vzc2lvbiBzdG9yZVxuICAgICAgICAgIC8vIHVucmVhY2hhYmxlIOKGkiBhdXRoIGJyb2tlbi4gX3BkaW1BZGFwdFRpbWVvdXQoKSBudWRnZXMgdGhlIGdhcCBidXQgZG9lcyBOT1RcbiAgICAgICAgICAvLyB1cGRhdGUgX2xhc3Q0MjlBdCBzbyBwYXNzaXZlIGRlY2F5IGNhbiBzdGlsbCBwdWxsIHRoZSBnYXAgYmFjayB0byBmbG9vci5cbiAgICAgICAgICBfcGRpbUFkYXB0VGltZW91dCgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghY291bnRlZCkge1xuICAgICAgICAgIC8vIE9ubHkgbG9nIGVycm9ycyB3ZSBoYXZlbid0IGFscmVhZHkgbG9nZ2VkIGlubGluZS5cbiAgICAgICAgICAvLyBUaGVzZSBhcmUgY29ubmVjdGl2aXR5IGZhaWx1cmVzIChFQ09OTlJFRlVTRUQsIHRpbWVvdXRzLCBuZXR3b3JrIGVycm9ycylcbiAgICAgICAgICAvLyDigJQgZXhwZWN0ZWQgdHJhbnNpZW50IGNvbmRpdGlvbnMsIG5vdCBidWdzIGluIG91ciBjb2RlLlxuICAgICAgICAgIC8vXG4gICAgICAgICAgLy8gVGltZW91dC9BYm9ydEVycm9ycyBmbG9vZCB3aGVuIFBESU0gaXMgb3ZlcndoZWxtZWQgKG1hbnkgY2FsbGVycyBlYWNoXG4gICAgICAgICAgLy8gZ2V0IGEgNCBzIGFib3J0KTogdXNlIHRoZSBzYW1lIGRlZHVwIHN1cHByZXNzaW9uIGFzIEhUVFAgc3RhdHVzIGVycm9ycy5cbiAgICAgICAgICBfbG9nTmV0d29ya0Vycm9yKGNtZCwgKGVyciBhcyBFcnJvcikubWVzc2FnZS5zbGljZSgwLCAyMDApKTtcbiAgICAgICAgfVxuICAgICAgICBjYkhhbGZPcGVuRmFpbGVkKCk7IC8vIHJlbGVhc2UgSEFMRl9PUEVOIHByb2JlIHNsb3Qgc28gbmV4dCBpbnRlcnZhbCBjYW4gcmV0cnlcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgICAgLy8gTm90ZTogbm8gZmluYWxseS9fZnJlZVBkaW1TbG90IG5lZWRlZCDigJQgX2VucXVldWVFeGVjIGhhbmRsZXMgdGhlIGNoYWluIGdhcFxuICAgIH07XG4gICAgY29uc3Qgb3BlcmF0aW9uID0gb3B0aW9ucy5ibG9ja2luZ1xuICAgICAgPyBfZW5xdWV1ZUJsb2NraW5nRXhlYyhydW4pXG4gICAgICA6IF9lbnF1ZXVlRXhlYyhydW4pO1xuICAgIHJldHVybiB0aGlzLmF3YWl0T3JEaXNjb25uZWN0KG9wZXJhdGlvbiBhcyBQcm9taXNlPFQ+KTtcbiAgfVxuXG4gIHBpcGVsaW5lKCk6IFBpcGVsaW5lIHtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVQaXBlbGluZShmYWxzZSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVBpcGVsaW5lKHRyYW5zYWN0aW9uYWw6IGJvb2xlYW4pOiBQaXBlbGluZSB7XG4gICAgY29uc3QgY21kczogdW5rbm93bltdW10gPSBbXTtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBjb25zdCBwaXBlOiBQaXBlbGluZSA9IHtcbiAgICAgIGdldDogKGs6IHN0cmluZykgPT4ge1xuICAgICAgICBjbWRzLnB1c2goW1wiR0VUXCIsIGtdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgc2V0OiAoazogc3RyaW5nLCB2OiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSkgPT4ge1xuICAgICAgICBjbWRzLnB1c2goW1wiU0VUXCIsIGssIHYsIC4uLmFdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgc2V0ZXg6IChrOiBzdHJpbmcsIHM6IG51bWJlciwgdjogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJTRVRFWFwiLCBrLCBzLCB2XSk7XG4gICAgICAgIHJldHVybiBwaXBlO1xuICAgICAgfSxcbiAgICAgIGRlbDogKC4uLms6IHN0cmluZ1tdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJERUxcIiwgLi4ua10pO1xuICAgICAgICByZXR1cm4gcGlwZTtcbiAgICAgIH0sXG4gICAgICBleHBpcmU6IChrOiBzdHJpbmcsIHM6IG51bWJlcikgPT4ge1xuICAgICAgICBjbWRzLnB1c2goW1wiRVhQSVJFXCIsIGssIHNdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgcGV4cGlyZTogKGs6IHN0cmluZywgbXM6IG51bWJlcikgPT4ge1xuICAgICAgICBjbWRzLnB1c2goW1wiUEVYUElSRVwiLCBrLCBtc10pO1xuICAgICAgICByZXR1cm4gcGlwZTtcbiAgICAgIH0sXG4gICAgICBpbmNyOiAoazogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJJTkNSXCIsIGtdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgaW5jcmJ5OiAoazogc3RyaW5nLCBuOiBudW1iZXIpID0+IHtcbiAgICAgICAgY21kcy5wdXNoKFtcIklOQ1JCWVwiLCBrLCBuXSk7XG4gICAgICAgIHJldHVybiBwaXBlO1xuICAgICAgfSxcbiAgICAgIGRlY3I6IChrOiBzdHJpbmcpID0+IHtcbiAgICAgICAgY21kcy5wdXNoKFtcIkRFQ1JcIiwga10pO1xuICAgICAgICByZXR1cm4gcGlwZTtcbiAgICAgIH0sXG4gICAgICBkZWNyYnk6IChrOiBzdHJpbmcsIG46IG51bWJlcikgPT4ge1xuICAgICAgICBjbWRzLnB1c2goW1wiREVDUkJZXCIsIGssIG5dKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgaHNldDogKGs6IHN0cmluZywgLi4uYTogdW5rbm93bltdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJIU0VUXCIsIGssIC4uLmFdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgaGdldDogKGs6IHN0cmluZywgZjogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJIR0VUXCIsIGssIGZdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgaGRlbDogKGs6IHN0cmluZywgLi4uZjogc3RyaW5nW10pID0+IHtcbiAgICAgICAgY21kcy5wdXNoKFtcIkhERUxcIiwgaywgLi4uZl0pO1xuICAgICAgICByZXR1cm4gcGlwZTtcbiAgICAgIH0sXG4gICAgICBoZ2V0YWxsOiAoazogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJIR0VUQUxMXCIsIGtdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgc2FkZDogKGs6IHN0cmluZywgLi4ubTogdW5rbm93bltdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJTQUREXCIsIGssIC4uLm1dKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgc3JlbTogKGs6IHN0cmluZywgLi4ubTogdW5rbm93bltdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJTUkVNXCIsIGssIC4uLm1dKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgemFkZDogKGs6IHN0cmluZywgLi4uYTogdW5rbm93bltdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJaQUREXCIsIGssIC4uLmFdKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgenJlbTogKGs6IHN0cmluZywgLi4ubTogdW5rbm93bltdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJaUkVNXCIsIGssIC4uLm1dKTtcbiAgICAgICAgcmV0dXJuIHBpcGU7XG4gICAgICB9LFxuICAgICAgbHB1c2g6IChrOiBzdHJpbmcsIC4uLnY6IHVua25vd25bXSkgPT4ge1xuICAgICAgICBjbWRzLnB1c2goW1wiTFBVU0hcIiwgaywgLi4udl0pO1xuICAgICAgICByZXR1cm4gcGlwZTtcbiAgICAgIH0sXG4gICAgICBycHVzaDogKGs6IHN0cmluZywgLi4udjogdW5rbm93bltdKSA9PiB7XG4gICAgICAgIGNtZHMucHVzaChbXCJSUFVTSFwiLCBrLCAuLi52XSk7XG4gICAgICAgIHJldHVybiBwaXBlO1xuICAgICAgfSxcbiAgICAgIC8vIFNlcXVlbnRpYWwgZXhlY3V0aW9uIHByZXNlcnZlcyBwZXItcGlwZWxpbmUgb3JkZXJpbmcuICBVbmRlciBwYXJhbGxlbFxuICAgICAgLy8gZGlyZWN0IGxhbmVzIChfUERJTV9ESVJFQ1RfTEFORVMgPiAxKSwgUHJvbWlzZS5hbGwgd291bGQgbGV0IGNvbW1hbmRzXG4gICAgICAvLyBpbiBvbmUgcGlwZWxpbmUgZmFuIG91dCBhY3Jvc3MgbGFuZXMgYW5kIHJhY2UgKGUuZy4gYSBwaXBlbGluZSdzIFNFVFxuICAgICAgLy8gdGhlbiBHRVQgY291bGQgY29tcGxldGUgb3V0IG9mIG9yZGVyIGlmIGFzc2lnbmVkIHRvIGRpZmZlcmVudCBsYW5lc1xuICAgICAgLy8gd2l0aCBkaWZmZXJlbnQgaW4tZmxpZ2h0IFJUVHMpLiAgQXdhaXRpbmcgc2VxdWVudGlhbGx5IGtlZXBzIGVhY2hcbiAgICAgIC8vIGNvbW1hbmQncyBlbnF1ZXVlLXRoZW4tY29tcGxldGUgc3RyaWN0bHkgYmVmb3JlIHRoZSBuZXh0IGNvbW1hbmQnc1xuICAgICAgLy8gZW5xdWV1ZSwgd2hpY2ggZ2l2ZXMgaW9yZWRpcy1jb21wYXRpYmxlIHBpcGVsaW5lIHNlbWFudGljcy4gIENvc3Q6XG4gICAgICAvLyBwaXBlbGluZXMgbG9zZSBpbnRyYS1waXBlbGluZSBwYXJhbGxlbGlzbSDigJQgYWNjZXB0YWJsZSBiZWNhdXNlIHJlYWxcbiAgICAgIC8vIHRocm91Z2hwdXQgcGFyYWxsZWxpc20gc3RpbGwgY29tZXMgZnJvbSBjb25jdXJyZW50ICpkaWZmZXJlbnQqIHBpcGVsaW5lc1xuICAgICAgLy8gbGFuZGluZyBpbiBkaWZmZXJlbnQgbGFuZXMuXG4gICAgICBleGVjOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmICh0cmFuc2FjdGlvbmFsKSB7XG4gICAgICAgICAgY29uc3QgY29tbWFuZHMgPSBjbWRzLm1hcCgoY29tbWFuZCkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQuc29tZSgoYXJnKSA9PiBhcmcgPT09IG51bGwgfHwgYXJnID09PSB1bmRlZmluZWQpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJbUERJTV0gdHJhbnNhY3Rpb24gcmVjZWl2ZWQgYSBudWxsaXNoIGNvbW1hbmQgYXJndW1lbnRcIixcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb21tYW5kLm1hcCgoYXJnKSA9PiBTdHJpbmcoYXJnKSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY29uc3QgcmVwbHkgPSBhd2FpdCBzZWxmLmV4ZWMoW1xuICAgICAgICAgICAgXCJfX1BESU1fTVVMVElfRVhFQ1wiLFxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoY29tbWFuZHMpLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShyZXBseSkgfHwgcmVwbHkubGVuZ3RoICE9PSBjb21tYW5kcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIltQRElNXSBpbnZhbGlkIHRyYW5zYWN0aW9uIHJlc3BvbnNlXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVwbHkubWFwKChpdGVtKSA9PiB7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbSkgfHwgaXRlbS5sZW5ndGggIT09IDIpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiW1BESU1dIGludmFsaWQgdHJhbnNhY3Rpb24gcmVzdWx0IHR1cGxlXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgW3Jhd0Vycm9yLCB2YWx1ZV0gPSBpdGVtO1xuICAgICAgICAgICAgaWYgKHJhd0Vycm9yID09PSBudWxsIHx8IHJhd0Vycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFtudWxsLCB2YWx1ZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBlcnJvclZhbHVlOiB7XG4gICAgICAgICAgICAgIG1lc3NhZ2U/OiB1bmtub3duO1xuICAgICAgICAgICAgICBjb2RlPzogdW5rbm93bjtcbiAgICAgICAgICAgICAgbmFtZT86IHVua25vd247XG4gICAgICAgICAgICB9ID0gdHlwZW9mIHJhd0Vycm9yID09PSBcIm9iamVjdFwiICYmIHJhd0Vycm9yICE9PSBudWxsXG4gICAgICAgICAgICAgID8gcmF3RXJyb3IgYXMgeyBtZXNzYWdlPzogdW5rbm93bjsgY29kZT86IHVua25vd247IG5hbWU/OiB1bmtub3duIH1cbiAgICAgICAgICAgICAgOiB7IG1lc3NhZ2U6IHJhd0Vycm9yIH07XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcihTdHJpbmcoZXJyb3JWYWx1ZS5tZXNzYWdlID8/IHJhd0Vycm9yKSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGVycm9yVmFsdWUubmFtZSA9PT0gXCJzdHJpbmdcIikgZXJyb3IubmFtZSA9IGVycm9yVmFsdWUubmFtZTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZXJyb3JWYWx1ZS5jb2RlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oZXJyb3IsIHsgY29kZTogZXJyb3JWYWx1ZS5jb2RlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtlcnJvciwgbnVsbF07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXN1bHRzOiB1bmtub3duW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIGNtZHMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZXhlYyBjb2VyY2VzIGV2ZXJ5IGFyZyB0byBhIHN0cmluZyBpbnRlcm5hbGx5OyB0aGUgcGlwZWxpbmVcbiAgICAgICAgICAgIC8vIGJ1aWxkZXIgY29sbGVjdHMgaGV0ZXJvZ2VuZW91cyBhcmdzIGFzIHVua25vd25bXS5cbiAgICAgICAgICAgIHJlc3VsdHM/LnB1c2goYXdhaXQgc2VsZj8uZXhlYyhjIGFzIChzdHJpbmcgfCBudW1iZXIgfCBudWxsKVtdKSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmVzdWx0cz8ucHVzaChlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9LFxuICAgIH07XG4gICAgcmV0dXJuIHBpcGU7XG4gIH1cblxuICBtdWx0aSgpIHtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVQaXBlbGluZSh0cnVlKTtcbiAgfVxuXG4gIGR1cGxpY2F0ZSgpIHtcbiAgICByZXR1cm4gbmV3IFBkaW1SZWRpc0NsaWVudCh0aGlzLmV4ZWNVcmwsIHRoaXMuYmVhcmVyVG9rZW4pO1xuICB9XG5cbiAgLy8gUmVxdWlyZWQgYnkgQnVsbE1RJ3MgaXNSZWRpc0luc3RhbmNlKCkgY2hlY2s6IFsnY29ubmVjdCcsICdkaXNjb25uZWN0JywgJ2R1cGxpY2F0ZSddXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5hc3NlcnRDb25uZWN0ZWQoKTtcbiAgICAvLyBQRElNIGlzIEhUVFAtYmFzZWQg4oCUIGFscmVhZHkgXCJjb25uZWN0ZWRcIiBvbiBjb25zdHJ1Y3Rpb247IG5vLW9wIGhlcmVcbiAgICB0aGlzLmVtaXQoXCJjb25uZWN0XCIpO1xuICAgIHRoaXMuZW1pdChcInJlYWR5XCIpO1xuICB9XG5cbiAgYXN5bmMgcXVpdCgpOiBQcm9taXNlPFwiT0tcIj4ge1xuICAgIGF3YWl0IHRoaXMuZGlzY29ubmVjdCgpO1xuICAgIHJldHVybiBcIk9LXCI7XG4gIH1cbiAgYXN5bmMgZGlzY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWQpIHJldHVybjtcbiAgICB0aGlzLmRpc2Nvbm5lY3RlZCA9IHRydWU7XG4gICAgdGhpcy5zdGF0dXMgPSBcImVuZFwiO1xuICAgIHRoaXMucHViU3ViR2VuZXJhdGlvbisrO1xuICAgIHRoaXMucHViU3ViQ29udHJvbGxlcj8uYWJvcnQodGhpcy5kaXNjb25uZWN0ZWRFcnJvcik7XG4gICAgdGhpcy5saWZlY3ljbGVDb250cm9sbGVyLmFib3J0KHRoaXMuZGlzY29ubmVjdGVkRXJyb3IpO1xuICAgIHRoaXMuZW1pdChcImNsb3NlXCIpO1xuICAgIHRoaXMuZW1pdChcImVuZFwiKTtcbiAgICBhd2FpdCB0aGlzLnB1YlN1YlRhc2s/LmNhdGNoKCgpID0+IHt9KTtcbiAgICB0aGlzLnB1YlN1YlRhc2sgPSBudWxsO1xuICAgIHRoaXMucHViU3ViQ29udHJvbGxlciA9IG51bGw7XG4gIH1cblxuICAvKipcbiAgICogQnVsbE1RIGNhbGxzIGRlZmluZUNvbW1hbmQoKSB0byByZWdpc3RlciBMdWEgc2NyaXB0cyBhcyBuYW1lZCBjb21tYW5kcy5cbiAgICpcbiAgICogQ2FsbGluZyBjb252ZW50aW9uOiBCdWxsTVEgaW52b2tlcyB0aGUgY3JlYXRlZCBtZXRob2QgYXNcbiAgICogICBjbGllbnRbbmFtZV0oYXJnc0FycmF5KSAg4oCUIGEgU0lOR0xFIGFycmF5IGFyZ3VtZW50IChpb3JlZGlzIGZsYXR0ZW5zIGl0IGludGVybmFsbHkpLlxuICAgKlxuICAgKiBJbXBsZW1lbnRhdGlvbjogQWxsIEx1YSBzY3JpcHRzIHJ1biBsb2NhbGx5IGluIGEgV29ya2VyIHRocmVhZCB2aWEgd2FzbW9vblxuICAgKiAoV2ViQXNzZW1ibHkgTHVhIDUuNCkuIHJlZGlzLmNhbGwoKSBpbnNpZGUgTHVhIHVzZXMgc3luY2hyb25vdXMgU2hhcmVkQXJyYXlCdWZmZXJcbiAgICogSVBDIHRvIGNhbGwgYmFjayBpbnRvIHRoZSBtYWluIHRocmVhZCwgd2hpY2ggZm9yd2FyZHMgdG8gUERJTSBvdmVyIEhUVFAuXG4gICAqXG4gICAqIFRoaXMgY29tcGxldGVseSBzaWRlc3RlcHMgUERJTSdzIGJyb2tlbiBhc3luYyBMdWEgcnVudGltZSB3aGVyZSByZWRpcz8uY2FsbCgpXG4gICAqIHJldHVybnMgUHJvbWlzZXMgdGhhdCBMdWEgY2Fubm90IGF3YWl0LCBjYXVzaW5nIC50aGVuKG51bGwpIGNyYXNoZXMgb24gbmlsLlxuICAgKi9cbiAgZGVmaW5lQ29tbWFuZChcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgb3B0czogeyBudW1iZXJPZktleXM6IG51bWJlcjsgbHVhOiBzdHJpbmcgfSxcbiAgKTogdm9pZCB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgY29uc3QgbnVtS2V5cyA9IG9wdHM/Lm51bWJlck9mS2V5cztcbiAgICBjb25zdCBsdWEgPSBvcHRzPy5sdWE7XG5cbiAgICAodGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbbmFtZV0gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICBsZXQgZmxhdEFyZ3M6IHVua25vd25bXTtcbiAgICAgIGlmIChhcmd1bWVudHM/Lmxlbmd0aCA9PT0gMSAmJiBBcnJheS5pc0FycmF5KGFyZ3VtZW50c1swXSkpIHtcbiAgICAgICAgZmxhdEFyZ3MgPSBhcmd1bWVudHNbMF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmbGF0QXJncyA9IEFycmF5LmZyb20oYXJndW1lbnRzKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY0x1YVZpYVBkaW0oXG4gICAgICAgIChhcmdzOiBzdHJpbmdbXSkgPT4gc2VsZj8uc2NyaXB0RXhlYyhhcmdzKSxcbiAgICAgICAgbHVhLFxuICAgICAgICBudW1LZXlzLFxuICAgICAgICBmbGF0QXJncyxcbiAgICAgICk7XG4gICAgICByZXR1cm4gX25vcm1hbGl6ZUx1YVJlc3VsdChyZXN1bHQpO1xuICAgIH07XG4gIH1cblxuICBhc3luYyBzZW5kQ29tbWFuZChhcmdzOiBzdHJpbmdbXSk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIGNvbnN0IGNtZCA9IChhcmdzWzBdID8/IFwiXCIpLnRvVXBwZXJDYXNlKCk7XG4gICAgaWYgKGNtZCA9PT0gXCJQVUJMSVNIXCIpIHtcbiAgICAgIGlmIChhcmdzLmxlbmd0aCAhPT0gMykgdGhyb3cgbmV3IEVycm9yKFwiRVJSIHdyb25nIG51bWJlciBvZiBhcmd1bWVudHMgZm9yIFBVQkxJU0hcIik7XG4gICAgICByZXR1cm4gdGhpcy5wdWJsaXNoKGFyZ3NbMV0hLCBhcmdzWzJdISk7XG4gICAgfVxuICAgIGlmIChjbWQgPT09IFwiU1VCU0NSSUJFXCIpIHJldHVybiB0aGlzLnN1YnNjcmliZSguLi5hcmdzLnNsaWNlKDEpKTtcbiAgICBpZiAoY21kID09PSBcIlVOU1VCU0NSSUJFXCIpIHJldHVybiB0aGlzLnVuc3Vic2NyaWJlKC4uLmFyZ3Muc2xpY2UoMSkpO1xuICAgIGlmIChjbWQgPT09IFwiUFNVQlNDUklCRVwiKSByZXR1cm4gdGhpcy5wc3Vic2NyaWJlKC4uLmFyZ3Muc2xpY2UoMSkpO1xuICAgIGlmIChjbWQgPT09IFwiUFVOU1VCU0NSSUJFXCIpIHJldHVybiB0aGlzLnB1bnN1YnNjcmliZSguLi5hcmdzLnNsaWNlKDEpKTtcbiAgICByZXR1cm4gdGhpcy5leGVjKGFyZ3MpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZhc3QtbGFuZSB2YXJpYW50IG9mIHNlbmRDb21tYW5kIGZvciBMdWFFeGVjdXRvciByZWRpcz8uY2FsbCgpIElQQy5cbiAgICpcbiAgICogVXNlcyBfZW5xdWV1ZVNjcmlwdEV4ZWMgKDUwbXMgZ2FwKSBpbnN0ZWFkIG9mIF9lbnF1ZXVlRXhlYyAoZnVsbCBBSU1EIGdhcCkuXG4gICAqIFRoZSBXb3JrZXIncyBBdG9taWNzLndhaXQoKSBndWFyYW50ZWVzIHNlcXVlbnRpYWwgY2FsbHMgZnJvbSB0aGUgc2FtZSBzY3JpcHQsXG4gICAqIHNvIHRoZSBBSU1EIHJhdGUtbGltaXQgZ2FwIGlzIHVubmVjZXNzYXJ5IG92ZXJoZWFkIOKAlCB0aGUgNTBtcyBnYXAgaXMgZW5vdWdoXG4gICAqIHRvIHlpZWxkIHRoZSBldmVudCBsb29wIGJldHdlZW4gcmVkaXMuY2FsbCgpcyB3aXRob3V0IHN0YWxsaW5nIHRoZSBzY3JpcHQuXG4gICAqXG4gICAqIFRoZSBjaXJjdWl0IGJyZWFrZXIgaXMgc3RpbGwgY2hlY2tlZCBzbyBhIGRvd25lZCBQRElNIHRyaXBzIGNvcnJlY3RseS5cbiAgICogVGhlIDQyOSBBSU1EIGJhY2tvZmYgaXMgc3RpbGwgYXBwbGllZDogaWYgYSA0MjkgaXMgcmVjZWl2ZWQgZHVyaW5nIGEgc2NyaXB0XG4gICAqIGNhbGwsIF9wZGltQWRhcHQ0MjkgcmFpc2VzIF9wZGltR2FwTXM7IHN1YnNlcXVlbnQgTUFJTi1DSEFJTiBjYWxsZXJzIHNlZSB0aGVcbiAgICogcmFpc2VkIGdhcC4gIFNjcmlwdCBjYWxsZXJzIHVzZSB0aGUgZml4ZWQgNTBtcyBsYW5lIHNvIHRoZXkgZG9uJ3QgY29tcG91bmRcbiAgICogdGhlIHNsb3dkb3duIOKAlCBidXQgdGhlIHJhdGUtbGltaXQgZGVhZGxpbmUgKF9yYXRlTGltaXRlZFVudGlsKSBJUyBjaGVja2VkXG4gICAqIGluc2lkZSBleGVjKCkgc28gc2NyaXB0IGNhbGxzIHN0aWxsIGhvbm91ciB0aGUgbWFuZGF0b3J5IGhvbGQtb2ZmLlxuICAgKi9cbiAgYXN5bmMgc2NyaXB0RXhlYyhhcmdzOiBzdHJpbmdbXSk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIHRoaXMuYXNzZXJ0Q29ubmVjdGVkKCk7XG4gICAgY29uc3QgW2NtZCwgLi4ucmF3QXJnc10gPSBhcmdzO1xuICAgIC8vIFNhbWUgY29udHJhY3QgYXMgZXhlYygpOiBQRElNIGFjY2VwdHMgb25seSBzdHJpbmcgYXJndW1lbnRzLCBhbmQgYW5cbiAgICAvLyBhYnNlbnQgUmVkaXMgdmFsdWUgaXMgYSByZXN1bHQsIG5ldmVyIGEgdmFsaWQgYXJndW1lbnQuIFJlamVjdGluZyBoZXJlXG4gICAgLy8ga2VlcHMgTHVhL0J1bGxNUSBzY3JpcHQgY2FsbHMgZnJvbSBzaWxlbnRseSBwZXJzaXN0aW5nIGVtcHR5IHN0cmluZ3MuXG4gICAgaWYgKHJhd0FyZ3Muc29tZSgoYSkgPT4gYSA9PT0gbnVsbCB8fCBhID09PSB1bmRlZmluZWQpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICBgW1BESU1dICR7U3RyaW5nKGNtZCl9IChzY3JpcHQpIHJlY2VpdmVkIGEgbnVsbGlzaCBjb21tYW5kIGFyZ3VtZW50YCxcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHN0ckFyZ3MgPSByYXdBcmdzLm1hcCgoYSkgPT4gU3RyaW5nKGEpKTtcblxuICAgIGlmICghY2JBbGxvd1JlcXVlc3QoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBbUERJTV0gQ2lyY3VpdCBPUEVOIOKAlCAke2NtZH0gKHNjcmlwdCkgcmVqZWN0ZWRgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5hd2FpdE9yRGlzY29ubmVjdChfZW5xdWV1ZVNjcmlwdEV4ZWMoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5hc3NlcnRDb25uZWN0ZWQoKTtcbiAgICAgIGNvbnN0IHJsV2FpdCA9IFBkaW1SZWRpc0NsaWVudD8uX3JhdGVMaW1pdGVkVW50aWwgLSBEYXRlPy5ub3coKTtcbiAgICAgIGlmIChybFdhaXQgPiAwKSBhd2FpdCB0aGlzLmRlbGF5KHJsV2FpdCk7XG4gICAgICB0aGlzLmFzc2VydENvbm5lY3RlZCgpO1xuXG4gICAgICBsZXQgY291bnRlZCA9IGZhbHNlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2godGhpcy5leGVjVXJsLCB7XG4gICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0aGlzLmJlYXJlclRva2VufWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGNtZCwgYXJnczogc3RyQXJncyB9KSxcbiAgICAgICAgICBzaWduYWw6IHRoaXMucmVxdWVzdFNpZ25hbCgpLFxuICAgICAgICAgIC8vIERvIG5vdCBmb2xsb3cgcmVkaXJlY3RzIOKAlCBhIDN4eCBmcm9tIFJlcGxpdCdzIHByb3h5IChQRElNIHNsZWVwaW5nKVxuICAgICAgICAgIC8vIG11c3QgYmUgc2VlbiBhcyBhIGZhaWx1cmUgaGVyZSwgbm90IHNpbGVudGx5IGZvbGxvd2VkIHRvIGFuIEhUTUwgcGFnZS5cbiAgICAgICAgICAvLyBTYW1lIHJlYXNvbmluZyBhcyB0aGUgbWFpbiBleGVjKCkgcGF0aC5cbiAgICAgICAgICByZWRpcmVjdDogXCJtYW51YWxcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKCFyZXMub2spIHtcbiAgICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzLnRleHQoKS5jYXRjaCgoKSA9PiBcIlwiKTtcbiAgICAgICAgICBpZiAocmVzLnN0YXR1cyA9PT0gNDI5KSB7XG4gICAgICAgICAgICBjb25zdCBuZXdHYXAgPSBfcGRpbUFkYXB0NDI5KCk7XG4gICAgICAgICAgICBQZGltUmVkaXNDbGllbnQ/Ll9zZXQ0MjlEZWFkbGluZShEYXRlPy5ub3coKSArIG5ld0dhcCk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBESU0gSFRUUCA0MjkgKHNjcmlwdCAke2NtZH0pOiBnYXDihpIke25ld0dhcH1tc2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyAzeHggPSBSZXBsaXQgcHJveHkgcmVkaXJlY3QgKFBESU0gc2xlZXBpbmcpOyA1eHggPSBQRElNIHNlcnZlciBlcnJvci5cbiAgICAgICAgICAvLyBCb3RoIGFyZSBjb3VudGVkIGFzIGNpcmN1aXQtYnJlYWtlciBmYWlsdXJlcyBpbiB0aGUgY2F0Y2ggYmxvY2suXG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXMgPj0gMzAwICYmIHJlcy5zdGF0dXMgPCA0MDApIHtcbiAgICAgICAgICAgIGNiUmVjb3JkNTAzKCk7XG4gICAgICAgICAgICBjb3VudGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUERJTSBIVFRQICR7cmVzLnN0YXR1c30gKHNjcmlwdCAke2NtZH0pOiBzZXJ2aWNlIHRlbXBvcmFyaWx5IHVucmVhY2hhYmxlYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzID49IDUwMCkge1xuICAgICAgICAgICAgY2JSZWNvcmQ1MDMoKTtcbiAgICAgICAgICAgIGNvdW50ZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQRElNIEhUVFAgJHtyZXMuc3RhdHVzfSAoc2NyaXB0ICR7Y21kfSk6ICR7dGV4dD8uc2xpY2UoMCwgMjAwKX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlIHNlcnZlciBpcyBhbGl2ZSwgYnV0IHRoZSBzY3JpcHQgb3BlcmF0aW9uIGZhaWxlZC4gRG8gbm90IHR1cm4gYVxuICAgICAgICAgIC8vIGNvbW1hbmQgZmFpbHVyZSBpbnRvIEx1YSBuaWw6IEJ1bGxNUSBtdXN0IHNlZSB0aGUgZXhwbGljaXQgZXJyb3IuXG4gICAgICAgICAgY291bnRlZCA9IHRydWU7XG4gICAgICAgICAgUGRpbVJlZGlzQ2xpZW50Ll9jbGVhclJhdGVMaW1pdElmRXhwaXJlZCgpO1xuICAgICAgICAgIF9wZGltQWRhcHRTdWNjZXNzKCk7XG4gICAgICAgICAgY2JSZWNvcmRTdWNjZXNzKCk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYFBESU0gSFRUUCAke3Jlcy5zdGF0dXN9IChzY3JpcHQgJHtTdHJpbmcoY21kKX0pOiAke3RleHQuc2xpY2UoMCwgMjAwKX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBQZGltUmVkaXNDbGllbnQ/Ll9jbGVhclJhdGVMaW1pdElmRXhwaXJlZCgpO1xuICAgICAgICBfcGRpbUFkYXB0U3VjY2VzcygpO1xuXG4gICAgICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzLmhlYWRlcnMuZ2V0KFwiY29udGVudC10eXBlXCIpID8/IFwiXCI7XG4gICAgICAgIGlmICghY29udGVudFR5cGU/LmluY2x1ZGVzKFwiYXBwbGljYXRpb24vanNvblwiKSkge1xuICAgICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZXMudGV4dCgpLmNhdGNoKCgpID0+IFwiKHVucmVhZGFibGUpXCIpO1xuICAgICAgICAgIGNiUmVjb3JkNTAzKCk7XG4gICAgICAgICAgY291bnRlZCA9IHRydWU7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYFBESU0gbm9uLUpTT04gKHNjcmlwdCAke2NtZH0pOiAke2JvZHk/LnNsaWNlKDAsIDgwKX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgICAgICAgY291bnRlZCA9IHRydWU7XG4gICAgICAgIGNiUmVjb3JkU3VjY2VzcygpO1xuXG4gICAgICAgIGlmIChkYXRhICE9PSBudWxsICYmIHR5cGVvZiBkYXRhID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgaWYgKFwicmVzdWx0XCIgaW4gZGF0YSkgcmV0dXJuIGRhdGE/LnJlc3VsdDtcbiAgICAgICAgICBpZiAoXCJlcnJvclwiIGluIGRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IGVyck1zZyA9IFN0cmluZyhkYXRhPy5lcnJvcik7XG4gICAgICAgICAgICBpZiAoZXJyTXNnPy5zdGFydHNXaXRoKFwiRVJSIHVua25vd24gY29tbWFuZFwiKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyTXNnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJNc2cpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWQpIHRocm93IHRoaXMuZGlzY29ubmVjdGVkRXJyb3I7XG4gICAgICAgIC8vIFNhbWUgVGltZW91dEVycm9yL0Fib3J0RXJyb3IgZXhjbHVzaW9uIGFzIHRoZSBtYWluIGV4ZWMgY2F0Y2ggYmxvY2sg4oCUXG4gICAgICAgIC8vIHNsb3cgUERJTSByZXNwb25zZXMgc2hvdWxkIG5vdCB0cmlwIHRoZSBjaXJjdWl0IGJyZWFrZXIuXG4gICAgICAgIGNvbnN0IGlzVGltZW91dCA9XG4gICAgICAgICAgIWNvdW50ZWQgJiZcbiAgICAgICAgICAoKGVyciBhcyBhbnkpPy5uYW1lID09PSBcIlRpbWVvdXRFcnJvclwiIHx8IChlcnIgYXMgYW55KT8ubmFtZSA9PT0gXCJBYm9ydEVycm9yXCIpO1xuICAgICAgICBjb25zdCBpc0NpcmN1aXRNc2cgPVxuICAgICAgICAgICFjb3VudGVkICYmIChlcnIgYXMgYW55KT8ubWVzc2FnZT8uc3RhcnRzV2l0aChcIltQRElNXSBDaXJjdWl0XCIpO1xuICAgICAgICBpZiAoIWNvdW50ZWQgJiYgIWlzVGltZW91dCAmJiAhaXNDaXJjdWl0TXNnKSB7XG4gICAgICAgICAgY2JSZWNvcmQ1MDMoKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1RpbWVvdXQpIHtcbiAgICAgICAgICBfcGRpbUFkYXB0VGltZW91dCgpOyAvLyBiYWNrcHJlc3N1cmU6IHNsb3cgdGltZW91dCwgTk9UIGEgNDI5IOKAlCBkb24ndCBzZXQgX2xhc3Q0MjlBdFxuICAgICAgICB9XG4gICAgICAgIGNiSGFsZk9wZW5GYWlsZWQoKTtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH0pKTtcbiAgfVxuXG4gIC8vIOKUgOKUgCBTdHJpbmcgY29tbWFuZHMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIGFzeW5jIGdldChrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHRoaXMuYXNzZXJ0Q29ubmVjdGVkKCk7XG4gICAgY29uc3Qgc3RhbGUgPSBfbDFSZWFkKGtleSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZyZXNoID0gYXdhaXQgdGhpcy5leGVjPHN0cmluZyB8IG51bGw+KFtcIkdFVFwiLCBrZXldKTtcbiAgICAgIF9sMVdyaXRlKGtleSwgZnJlc2gpO1xuICAgICAgcmV0dXJuIGZyZXNoO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gUERJTSB1bmF2YWlsYWJsZSDigJQgc2VydmUgdGhlIEwxIHZhbHVlIChldmVuIGlmIG51bGwvXCJrZXkgbm90IGZvdW5kXCIpXG4gICAgICAvLyBzbyBjYWxsZXJzIChzZXNzaW9uIHN0b3JlLCByYXRlIGxpbWl0ZXIpIGtlZXAgd29ya2luZyB0aHJvdWdoIHRoZSBvdXRhZ2UuXG4gICAgICB0aGlzLmFzc2VydENvbm5lY3RlZCgpO1xuICAgICAgaWYgKHN0YWxlICE9PSB1bmRlZmluZWQpIHJldHVybiBzdGFsZTtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cbiAgYXN5bmMgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPFwiT0tcIj4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlYzxcIk9LXCI+KFtcIlNFVFwiLCBrZXksIHZhbHVlLCAuLi5hcmdzXSk7XG4gICAgX2wxV3JpdGUoa2V5LCB2YWx1ZSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBhc3luYyBzZXRleChrZXk6IHN0cmluZywgc2VjczogbnVtYmVyLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxcIk9LXCI+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWM8XCJPS1wiPihbXCJTRVRFWFwiLCBrZXksIHNlY3MsIHZhbHVlXSk7XG4gICAgX2wxV3JpdGUoa2V5LCB2YWx1ZSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBhc3luYyBzZXRueChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8MCB8IDE+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWM8MCB8IDE+KFtcIlNFVE5YXCIsIGtleSwgdmFsdWVdKTtcbiAgICBpZiAocmVzdWx0ID09PSAxKSBfbDFXcml0ZShrZXksIHZhbHVlKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIGFzeW5jIGdldHNldChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlYzxzdHJpbmcgfCBudWxsPihbXCJHRVRTRVRcIiwga2V5LCB2YWx1ZV0pO1xuICAgIF9sMVdyaXRlKGtleSwgdmFsdWUpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbiAgYXN5bmMgbWdldCguLi5rZXlzOiBzdHJpbmdbXSk6IFByb21pc2U8KHN0cmluZyB8IG51bGwpW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPChzdHJpbmcgfCBudWxsKVtdPihbXCJNR0VUXCIsIC4uLmtleXNdKTtcbiAgfVxuICBhc3luYyBtc2V0KC4uLmFyZ3M6IHN0cmluZ1tdKTogUHJvbWlzZTxcIk9LXCI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPFwiT0tcIj4oW1wiTVNFVFwiLCAuLi5hcmdzXSk7XG4gIH1cbiAgYXN5bmMgYXBwZW5kKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiQVBQRU5EXCIsIGtleSwgdmFsdWVdKTtcbiAgfVxuICBhc3luYyBpbmNyKGtleTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiSU5DUlwiLCBrZXldKTtcbiAgfVxuICBhc3luYyBkZWNyKGtleTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiREVDUlwiLCBrZXldKTtcbiAgfVxuICBhc3luYyBpbmNyYnkoa2V5OiBzdHJpbmcsIG46IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIklOQ1JCWVwiLCBrZXksIG5dKTtcbiAgfVxuICBhc3luYyBkZWNyYnkoa2V5OiBzdHJpbmcsIG46IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIkRFQ1JCWVwiLCBrZXksIG5dKTtcbiAgfVxuICBhc3luYyBpbmNyYnlmbG9hdChrZXk6IHN0cmluZywgbjogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZz4oW1wiSU5DUkJZRkxPQVRcIiwga2V5LCBuXSk7XG4gIH1cblxuICAvLyDilIDilIAgS2V5IGNvbW1hbmRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBhc3luYyBkZWwoLi4ua2V5czogc3RyaW5nW10pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlYzxudW1iZXI+KFtcIkRFTFwiLCAuLi5rZXlzXSk7XG4gICAgX2wxRXZpY3QoLi4ua2V5cyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBhc3luYyBleGlzdHMoLi4ua2V5czogc3RyaW5nW10pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJFWElTVFNcIiwgLi4ua2V5c10pO1xuICB9XG4gIGFzeW5jIGV4cGlyZShrZXk6IHN0cmluZywgc2VjczogbnVtYmVyKTogUHJvbWlzZTwwIHwgMT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8MCB8IDE+KFtcIkVYUElSRVwiLCBrZXksIHNlY3NdKTtcbiAgfVxuICBhc3luYyBwZXhwaXJlKGtleTogc3RyaW5nLCBtczogbnVtYmVyKTogUHJvbWlzZTwwIHwgMT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8MCB8IDE+KFtcIlBFWFBJUkVcIiwga2V5LCBtc10pO1xuICB9XG4gIGFzeW5jIGV4cGlyZWF0KGtleTogc3RyaW5nLCB0czogbnVtYmVyKTogUHJvbWlzZTwwIHwgMT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8MCB8IDE+KFtcIkVYUElSRUFUXCIsIGtleSwgdHNdKTtcbiAgfVxuICBhc3luYyBwZXJzaXN0KGtleTogc3RyaW5nKTogUHJvbWlzZTwwIHwgMT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8MCB8IDE+KFtcIlBFUlNJU1RcIiwga2V5XSk7XG4gIH1cbiAgYXN5bmMgdHRsKGtleTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiVFRMXCIsIGtleV0pO1xuICB9XG4gIGFzeW5jIHB0dGwoa2V5OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJQVFRMXCIsIGtleV0pO1xuICB9XG4gIGFzeW5jIHR5cGUoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8c3RyaW5nPihbXCJUWVBFXCIsIGtleV0pO1xuICB9XG4gIGFzeW5jIHJlbmFtZShrZXk6IHN0cmluZywgbmV3S2V5OiBzdHJpbmcpOiBQcm9taXNlPFwiT0tcIj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8XCJPS1wiPihbXCJSRU5BTUVcIiwga2V5LCBuZXdLZXldKTtcbiAgfVxuICBhc3luYyBrZXlzKHBhdHRlcm46IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZ1tdPihbXCJLRVlTXCIsIHBhdHRlcm5dKTtcbiAgfVxuICBhc3luYyBzY2FuKFxuICAgIGN1cnNvcjogc3RyaW5nIHwgbnVtYmVyLFxuICAgIC4uLmFyZ3M6IHVua25vd25bXVxuICApOiBQcm9taXNlPFtzdHJpbmcsIHN0cmluZ1tdXT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8W3N0cmluZywgc3RyaW5nW11dPihbXCJTQ0FOXCIsIGN1cnNvciwgLi4uYXJnc10pO1xuICB9XG4gIGFzeW5jIGRic2l6ZSgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJEQlNJWkVcIl0pO1xuICB9XG4gIGFzeW5jIHJhbmRvbWtleSgpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZyB8IG51bGw+KFtcIlJBTkRPTUtFWVwiXSk7XG4gIH1cblxuICAvLyDilIDilIAgSGFzaCBjb21tYW5kcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgYXN5bmMgaGdldChrZXk6IHN0cmluZywgZmllbGQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHRoaXMuYXNzZXJ0Q29ubmVjdGVkKCk7XG4gICAgY29uc3QgbDFLZXkgPSBgJHtrZXl9XFx4MDAke2ZpZWxkfWA7XG4gICAgY29uc3Qgc3RhbGUgPSBfbDFSZWFkKGwxS2V5KTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZnJlc2ggPSBhd2FpdCB0aGlzLmV4ZWM8c3RyaW5nIHwgbnVsbD4oW1wiSEdFVFwiLCBrZXksIGZpZWxkXSk7XG4gICAgICBfbDFXcml0ZShsMUtleSwgZnJlc2gpO1xuICAgICAgcmV0dXJuIGZyZXNoO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhpcy5hc3NlcnRDb25uZWN0ZWQoKTtcbiAgICAgIGlmIChzdGFsZSAhPT0gdW5kZWZpbmVkKSByZXR1cm4gc3RhbGU7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG4gIGFzeW5jIGhzZXQoa2V5OiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIkhTRVRcIiwga2V5LCAuLi5hcmdzXSk7XG4gIH1cbiAgYXN5bmMgaHNldG54KGtleTogc3RyaW5nLCBmaWVsZDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTwwIHwgMT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8MCB8IDE+KFtcIkhTRVROWFwiLCBrZXksIGZpZWxkLCB2YWx1ZV0pO1xuICB9XG4gIGFzeW5jIGhkZWwoa2V5OiBzdHJpbmcsIC4uLmZpZWxkczogc3RyaW5nW10pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJIREVMXCIsIGtleSwgLi4uZmllbGRzXSk7XG4gIH1cbiAgYXN5bmMgaG1nZXQoa2V5OiBzdHJpbmcsIC4uLmZpZWxkczogc3RyaW5nW10pOiBQcm9taXNlPChzdHJpbmcgfCBudWxsKVtdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzwoc3RyaW5nIHwgbnVsbClbXT4oW1wiSE1HRVRcIiwga2V5LCAuLi5maWVsZHNdKTtcbiAgfVxuICBhc3luYyBobXNldChrZXk6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxcIk9LXCI+IHtcbiAgICAvLyBQRElNIG9ubHkgYWNjZXB0cyBIU0VUIHdpdGggYSBzaW5nbGUgZmllbGQtdmFsdWUgcGFpci4gIFNwbGl0IEhNU0VUXG4gICAgLy8gKHdoaWNoIGNhbiBjYXJyeSBOIHBhaXJzKSBpbnRvIHNlcXVlbnRpYWwgSFNFVCBjYWxscy5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoIC0gMTsgaSArPSAyKSB7XG4gICAgICBhd2FpdCB0aGlzLmV4ZWM8XCJPS1wiPihbXCJIU0VUXCIsIGtleSwgYXJnc1tpXSwgYXJnc1tpICsgMV1dKTtcbiAgICB9XG4gICAgcmV0dXJuIFwiT0tcIjtcbiAgfVxuICBhc3luYyBoZ2V0YWxsKGtleTogc3RyaW5nKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjPFJlY29yZDxzdHJpbmcsIHN0cmluZz4+KFtcIkhHRVRBTExcIiwga2V5XSk7XG4gICAgcmV0dXJuIHJlc3VsdCA/PyB7fTtcbiAgfVxuICBhc3luYyBoa2V5cyhrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZ1tdPihbXCJIS0VZU1wiLCBrZXldKTtcbiAgfVxuICBhc3luYyBodmFscyhrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZ1tdPihbXCJIVkFMU1wiLCBrZXldKTtcbiAgfVxuICBhc3luYyBobGVuKGtleTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiSExFTlwiLCBrZXldKTtcbiAgfVxuICBhc3luYyBoZXhpc3RzKGtleTogc3RyaW5nLCBmaWVsZDogc3RyaW5nKTogUHJvbWlzZTwwIHwgMT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8MCB8IDE+KFtcIkhFWElTVFNcIiwga2V5LCBmaWVsZF0pO1xuICB9XG4gIGFzeW5jIGhpbmNyYnkoa2V5OiBzdHJpbmcsIGZpZWxkOiBzdHJpbmcsIG46IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIkhJTkNSQllcIiwga2V5LCBmaWVsZCwgbl0pO1xuICB9XG4gIGFzeW5jIGhpbmNyYnlmbG9hdChrZXk6IHN0cmluZywgZmllbGQ6IHN0cmluZywgbjogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZz4oW1wiSElOQ1JCWUZMT0FUXCIsIGtleSwgZmllbGQsIG5dKTtcbiAgfVxuXG4gIC8vIOKUgOKUgCBMaXN0IGNvbW1hbmRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBhc3luYyBscHVzaChrZXk6IHN0cmluZywgLi4udmFsdWVzOiB1bmtub3duW10pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJMUFVTSFwiLCBrZXksIC4uLnZhbHVlc10pO1xuICB9XG4gIGFzeW5jIHJwdXNoKGtleTogc3RyaW5nLCAuLi52YWx1ZXM6IHVua25vd25bXSk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlJQVVNIXCIsIGtleSwgLi4udmFsdWVzXSk7XG4gIH1cbiAgYXN5bmMgbHBvcChrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8c3RyaW5nIHwgbnVsbD4oW1wiTFBPUFwiLCBrZXldKTtcbiAgfVxuICBhc3luYyBycG9wKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxzdHJpbmcgfCBudWxsPihbXCJSUE9QXCIsIGtleV0pO1xuICB9XG4gIGFzeW5jIGxsZW4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJMTEVOXCIsIGtleV0pO1xuICB9XG4gIGFzeW5jIGxyYW5nZShrZXk6IHN0cmluZywgc3RhcnQ6IG51bWJlciwgc3RvcDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8c3RyaW5nW10+KFtcIkxSQU5HRVwiLCBrZXksIHN0YXJ0LCBzdG9wXSk7XG4gIH1cbiAgYXN5bmMgbGluZGV4KGtleTogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxzdHJpbmcgfCBudWxsPihbXCJMSU5ERVhcIiwga2V5LCBpbmRleF0pO1xuICB9XG4gIGFzeW5jIGxzZXQoa2V5OiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPFwiT0tcIj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8XCJPS1wiPihbXCJMU0VUXCIsIGtleSwgaW5kZXgsIHZhbHVlXSk7XG4gIH1cbiAgYXN5bmMgbHJlbShrZXk6IHN0cmluZywgY291bnQ6IG51bWJlciwgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIkxSRU1cIiwga2V5LCBjb3VudCwgdmFsdWVdKTtcbiAgfVxuICBhc3luYyBsdHJpbShrZXk6IHN0cmluZywgc3RhcnQ6IG51bWJlciwgc3RvcDogbnVtYmVyKTogUHJvbWlzZTxcIk9LXCI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPFwiT0tcIj4oW1wiTFRSSU1cIiwga2V5LCBzdGFydCwgc3RvcF0pO1xuICB9XG5cbiAgLy8g4pSA4pSAIFNldCBjb21tYW5kcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgYXN5bmMgc2FkZChrZXk6IHN0cmluZywgLi4ubWVtYmVyczogdW5rbm93bltdKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiU0FERFwiLCBrZXksIC4uLm1lbWJlcnNdKTtcbiAgfVxuICBhc3luYyBzcmVtKGtleTogc3RyaW5nLCAuLi5tZW1iZXJzOiB1bmtub3duW10pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJTUkVNXCIsIGtleSwgLi4ubWVtYmVyc10pO1xuICB9XG4gIGFzeW5jIHNtZW1iZXJzKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8c3RyaW5nW10+KFtcIlNNRU1CRVJTXCIsIGtleV0pO1xuICB9XG4gIGFzeW5jIHNjYXJkKGtleTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiU0NBUkRcIiwga2V5XSk7XG4gIH1cbiAgYXN5bmMgc2lzbWVtYmVyKGtleTogc3RyaW5nLCBtZW1iZXI6IHN0cmluZyk6IFByb21pc2U8MCB8IDE+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPDAgfCAxPihbXCJTSVNNRU1CRVJcIiwga2V5LCBtZW1iZXJdKTtcbiAgfVxuICBhc3luYyBzdW5pb24oLi4ua2V5czogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxzdHJpbmdbXT4oW1wiU1VOSU9OXCIsIC4uLmtleXNdKTtcbiAgfVxuICBhc3luYyBzaW50ZXIoLi4ua2V5czogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxzdHJpbmdbXT4oW1wiU0lOVEVSXCIsIC4uLmtleXNdKTtcbiAgfVxuICBhc3luYyBzZGlmZiguLi5rZXlzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZ1tdPihbXCJTRElGRlwiLCAuLi5rZXlzXSk7XG4gIH1cblxuICAvLyDilIDilIAgU29ydGVkIHNldCBjb21tYW5kcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgYXN5bmMgemFkZChrZXk6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiWkFERFwiLCBrZXksIC4uLmFyZ3NdKTtcbiAgfVxuICBhc3luYyB6cmVtKGtleTogc3RyaW5nLCAuLi5tZW1iZXJzOiB1bmtub3duW10pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJaUkVNXCIsIGtleSwgLi4ubWVtYmVyc10pO1xuICB9XG4gIGFzeW5jIHpzY29yZShrZXk6IHN0cmluZywgbWVtYmVyOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZyB8IG51bGw+KFtcIlpTQ09SRVwiLCBrZXksIG1lbWJlcl0pO1xuICB9XG4gIGFzeW5jIHpyYW5rKGtleTogc3RyaW5nLCBtZW1iZXI6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyIHwgbnVsbD4oW1wiWlJBTktcIiwga2V5LCBtZW1iZXJdKTtcbiAgfVxuICBhc3luYyB6cmV2cmFuayhrZXk6IHN0cmluZywgbWVtYmVyOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlciB8IG51bGw+KFtcIlpSRVZSQU5LXCIsIGtleSwgbWVtYmVyXSk7XG4gIH1cbiAgYXN5bmMgenJhbmdlKFxuICAgIGtleTogc3RyaW5nLFxuICAgIHN0YXJ0OiBudW1iZXIsXG4gICAgc3RvcDogbnVtYmVyLFxuICAgIC4uLmFyZ3M6IHVua25vd25bXVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxzdHJpbmdbXT4oW1wiWlJBTkdFXCIsIGtleSwgc3RhcnQsIHN0b3AsIC4uLmFyZ3NdKTtcbiAgfVxuICBhc3luYyB6cmV2cmFuZ2UoXG4gICAga2V5OiBzdHJpbmcsXG4gICAgc3RhcnQ6IG51bWJlcixcbiAgICBzdG9wOiBudW1iZXIsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZ1tdPihbXCJaUkVWUkFOR0VcIiwga2V5LCBzdGFydCwgc3RvcCwgLi4uYXJnc10pO1xuICB9XG4gIGFzeW5jIHpyYW5nZWJ5c2NvcmUoXG4gICAga2V5OiBzdHJpbmcsXG4gICAgbWluOiBzdHJpbmcgfCBudW1iZXIsXG4gICAgbWF4OiBzdHJpbmcgfCBudW1iZXIsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZ1tdPihbXCJaUkFOR0VCWVNDT1JFXCIsIGtleSwgbWluLCBtYXgsIC4uLmFyZ3NdKTtcbiAgfVxuICBhc3luYyB6cmV2cmFuZ2VieXNjb3JlKFxuICAgIGtleTogc3RyaW5nLFxuICAgIG1heDogc3RyaW5nIHwgbnVtYmVyLFxuICAgIG1pbjogc3RyaW5nIHwgbnVtYmVyLFxuICAgIC4uLmFyZ3M6IHVua25vd25bXVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxzdHJpbmdbXT4oW1wiWlJFVlJBTkdFQllTQ09SRVwiLCBrZXksIG1heCwgbWluLCAuLi5hcmdzXSk7XG4gIH1cbiAgYXN5bmMgemNhcmQoa2V5OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJaQ0FSRFwiLCBrZXldKTtcbiAgfVxuICBhc3luYyB6Y291bnQoXG4gICAga2V5OiBzdHJpbmcsXG4gICAgbWluOiBzdHJpbmcgfCBudW1iZXIsXG4gICAgbWF4OiBzdHJpbmcgfCBudW1iZXIsXG4gICk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlpDT1VOVFwiLCBrZXksIG1pbiwgbWF4XSk7XG4gIH1cbiAgYXN5bmMgemluY3JieShcbiAgICBrZXk6IHN0cmluZyxcbiAgICBpbmNyZW1lbnQ6IG51bWJlcixcbiAgICBtZW1iZXI6IHN0cmluZyxcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZz4oW1wiWklOQ1JCWVwiLCBrZXksIGluY3JlbWVudCwgbWVtYmVyXSk7XG4gIH1cbiAgYXN5bmMgenJlbXJhbmdlYnlzY29yZShcbiAgICBrZXk6IHN0cmluZyxcbiAgICBtaW46IHN0cmluZyB8IG51bWJlcixcbiAgICBtYXg6IHN0cmluZyB8IG51bWJlcixcbiAgKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPG51bWJlcj4oW1wiWlJFTVJBTkdFQllTQ09SRVwiLCBrZXksIG1pbiwgbWF4XSk7XG4gIH1cbiAgYXN5bmMgenJlbXJhbmdlYnlyYW5rKFxuICAgIGtleTogc3RyaW5nLFxuICAgIHN0YXJ0OiBudW1iZXIsXG4gICAgc3RvcDogbnVtYmVyLFxuICApOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8bnVtYmVyPihbXCJaUkVNUkFOR0VCWVJBTktcIiwga2V5LCBzdGFydCwgc3RvcF0pO1xuICB9XG5cbiAgLy8g4pSA4pSAIFNvcnRlZC1zZXQgYmxvY2tpbmcgY29tbWFuZHMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIC8qKiBXYWl0cyBvbiB0aGUgY2Fub25pY2FsIG93bmVyJ3MgbXV0YXRpb24gZXZlbnQgaW5zdGVhZCBvZiBwb2xsaW5nIFpQT1BNSU4uICovXG4gIGFzeW5jIGJ6cG9wbWluKFxuICAgIGtleTogc3RyaW5nLFxuICAgIHRpbWVvdXQ6IG51bWJlcixcbiAgKTogUHJvbWlzZTxbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10gfCBudWxsPiB7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodGltZW91dCkgfHwgdGltZW91dCA8IDApIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJCWlBPUE1JTiB0aW1lb3V0IG11c3QgYmUgYSBmaW5pdGUgbm9uLW5lZ2F0aXZlIG51bWJlclwiKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjPHVua25vd24+KFxuICAgICAgW1wiQlpQT1BNSU5cIiwga2V5LCBTdHJpbmcodGltZW91dCldLFxuICAgICAge1xuICAgICAgICBibG9ja2luZzogdHJ1ZSxcbiAgICAgICAgcmVxdWVzdFRpbWVvdXRNczpcbiAgICAgICAgICB0aW1lb3V0ID09PSAwID8gbnVsbCA6IHRpbWVvdXQgKiAxMDAwICsgUERJTV9FWEVDX1RJTUVPVVRfTVMsXG4gICAgICB9LFxuICAgICk7XG4gICAgaWYgKHJlc3VsdCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJlc3VsdCkgfHwgcmVzdWx0Lmxlbmd0aCAhPT0gMykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUERJTSBCWlBPUE1JTiByZXR1cm5lZCBhbiBpbnZhbGlkIFJlZGlzIHJlc3BvbnNlXCIpO1xuICAgIH1cbiAgICByZXR1cm4gW1N0cmluZyhyZXN1bHRbMF0pLCBTdHJpbmcocmVzdWx0WzFdKSwgU3RyaW5nKHJlc3VsdFsyXSldO1xuICB9XG5cbiAgLy8g4pSA4pSAIExpc3QgYXRvbWljIG1vdmUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIGFzeW5jIHJwb3BscHVzaChzcmM6IHN0cmluZywgZHN0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPHN0cmluZyB8IG51bGw+KFtcIlJQT1BMUFVTSFwiLCBzcmMsIGRzdF0pO1xuICB9XG4gIGxtb3ZlID0gKHNyYzogc3RyaW5nLCBkc3Q6IHN0cmluZywgc3JjRGlyOiBzdHJpbmcsIGRzdERpcjogc3RyaW5nKSA9PlxuICAgIHRoaXMuZXhlYzxzdHJpbmcgfCBudWxsPihbXCJMTU9WRVwiLCBzcmMsIGRzdCwgc3JjRGlyLCBkc3REaXJdKTtcblxuICAvLyDilIDilIAgU3RyZWFtIGNvbW1hbmRzIChmdWxsIFJlZGlzIFN0cmVhbXMgc3VwcG9ydCkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIC8qKiBYQUREIGtleSBbTUFYTEVOIFt+XSBjb3VudF0gW01JTklEIFt+XSBpZF0gW05PTUtTVFJFQU1dIGlkIGZpZWxkIHZhbHVlIFtmaWVsZCB2YWx1ZSAuLi5dICovXG4gIGFzeW5jIHhhZGQoa2V5OiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWM8c3RyaW5nIHwgbnVsbD4oW1wiWEFERFwiLCBrZXksIC4uLmFyZ3NdKTtcbiAgfVxuICAvKiogWFRSSU0ga2V5IE1BWExFTnxNSU5JRCBbfl0gdGhyZXNob2xkICovXG4gIGFzeW5jIHh0cmltKFxuICAgIGtleTogc3RyaW5nLFxuICAgIHN0cmF0ZWd5OiBzdHJpbmcsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlhUUklNXCIsIGtleSwgc3RyYXRlZ3ksIC4uLmFyZ3NdKTtcbiAgfVxuICAvKiogWExFTiBrZXkgKi9cbiAgYXN5bmMgeGxlbihrZXk6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlhMRU5cIiwga2V5XSk7XG4gIH1cbiAgLyoqIFhSQU5HRSBrZXkgc3RhcnQgZW5kIFtDT1VOVCBjb3VudF0gKi9cbiAgYXN5bmMgeHJhbmdlKFxuICAgIGtleTogc3RyaW5nLFxuICAgIHN0YXJ0OiBzdHJpbmcsXG4gICAgZW5kOiBzdHJpbmcsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8YW55W10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPGFueVtdPihbXCJYUkFOR0VcIiwga2V5LCBzdGFydCwgZW5kLCAuLi5hcmdzXSk7XG4gIH1cbiAgLyoqIFhSRVZSQU5HRSBrZXkgZW5kIHN0YXJ0IFtDT1VOVCBjb3VudF0gKi9cbiAgYXN5bmMgeHJldnJhbmdlKFxuICAgIGtleTogc3RyaW5nLFxuICAgIGVuZDogc3RyaW5nLFxuICAgIHN0YXJ0OiBzdHJpbmcsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8YW55W10+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPGFueVtdPihbXCJYUkVWUkFOR0VcIiwga2V5LCBlbmQsIHN0YXJ0LCAuLi5hcmdzXSk7XG4gIH1cbiAgLyoqIFhSRUFEIFtDT1VOVCBjb3VudF0gW0JMT0NLIG1pbGxpc2Vjb25kc10gU1RSRUFNUyBrZXkgW2tleSAuLi5dIGlkIFtpZCAuLi5dICovXG4gIGFzeW5jIHhyZWFkKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8YW55W10gfCBudWxsPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxhbnlbXSB8IG51bGw+KFtcIlhSRUFEXCIsIC4uLmFyZ3NdKTtcbiAgfVxuICAvKiogWERFTCBrZXkgaWQgW2lkIC4uLl0gKi9cbiAgYXN5bmMgeGRlbChrZXk6IHN0cmluZywgLi4uaWRzOiBzdHJpbmdbXSk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlhERUxcIiwga2V5LCAuLi5pZHNdKTtcbiAgfVxuICAvKiogWEFDSyBrZXkgZ3JvdXAgaWQgW2lkIC4uLl0gKi9cbiAgYXN5bmMgeGFjayhrZXk6IHN0cmluZywgZ3JvdXA6IHN0cmluZywgLi4uaWRzOiBzdHJpbmdbXSk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlhBQ0tcIiwga2V5LCBncm91cCwgLi4uaWRzXSk7XG4gIH1cbiAgLyoqIFhHUk9VUCBDUkVBVEV8U0VUSUR8REVTVFJPWXxDUkVBVEVDT05TVU1FUnxERUxDT05TVU1FUiBrZXkgZ3JvdXAgaWQgKi9cbiAgYXN5bmMgeGdyb3VwKFxuICAgIHN1YkNtZDogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIGdyb3VwOiBzdHJpbmcsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWMoW1wiWEdST1VQXCIsIHN1YkNtZCwga2V5LCBncm91cCwgLi4uYXJnc10pO1xuICB9XG4gIC8qKiBYQ0xBSU0ga2V5IGdyb3VwIGNvbnN1bWVyIG1pbi1pZGxlLXRpbWUgaWQgW2lkIC4uLl0gKi9cbiAgYXN5bmMgeGNsYWltKFxuICAgIGtleTogc3RyaW5nLFxuICAgIGdyb3VwOiBzdHJpbmcsXG4gICAgY29uc3VtZXI6IHN0cmluZyxcbiAgICBtaW5JZGxlVGltZTogbnVtYmVyLFxuICAgIC4uLmFyZ3M6IHVua25vd25bXVxuICApOiBQcm9taXNlPGFueVtdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxhbnlbXT4oW1wiWENMQUlNXCIsIGtleSwgZ3JvdXAsIGNvbnN1bWVyLCBtaW5JZGxlVGltZSwgLi4uYXJnc10pO1xuICB9XG4gIC8qKiBYQVVUT0NMQUlNIGtleSBncm91cCBjb25zdW1lciBtaW4taWRsZS10aW1lIHN0YXJ0IFtDT1VOVCBjb3VudF0gKi9cbiAgYXN5bmMgeGF1dG9jbGFpbShcbiAgICBrZXk6IHN0cmluZyxcbiAgICBncm91cDogc3RyaW5nLFxuICAgIGNvbnN1bWVyOiBzdHJpbmcsXG4gICAgbWluSWRsZVRpbWU6IG51bWJlcixcbiAgICBzdGFydDogc3RyaW5nLFxuICAgIC4uLmFyZ3M6IHVua25vd25bXVxuICApOiBQcm9taXNlPHVua25vd24+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjKFtcbiAgICAgIFwiWEFVVE9DTEFJTVwiLFxuICAgICAga2V5LFxuICAgICAgZ3JvdXAsXG4gICAgICBjb25zdW1lcixcbiAgICAgIG1pbklkbGVUaW1lLFxuICAgICAgc3RhcnQsXG4gICAgICAuLi5hcmdzLFxuICAgIF0pO1xuICB9XG4gIC8qKiBYUEVORElORyBrZXkgZ3JvdXAgW1tJRExFIG1pbi1pZGxlLXRpbWVdIHN0YXJ0IGVuZCBjb3VudCBbY29uc3VtZXJdXSAqL1xuICBhc3luYyB4cGVuZGluZyhcbiAgICBrZXk6IHN0cmluZyxcbiAgICBncm91cDogc3RyaW5nLFxuICAgIC4uLmFyZ3M6IHVua25vd25bXVxuICApOiBQcm9taXNlPGFueVtdPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxhbnlbXT4oW1wiWFBFTkRJTkdcIiwga2V5LCBncm91cCwgLi4uYXJnc10pO1xuICB9XG4gIC8qKiBYSU5GTyBTVFJFQU18R1JPVVBTfENPTlNVTUVSU3xGVUxMIGtleSAqL1xuICBhc3luYyB4aW5mbyhcbiAgICBzdWJDbWQ6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICAuLi5hcmdzOiB1bmtub3duW11cbiAgKTogUHJvbWlzZTx1bmtub3duPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYyhbXCJYSU5GT1wiLCBzdWJDbWQsIGtleSwgLi4uYXJnc10pO1xuICB9XG4gIC8qKlxuICAgKiBYUkVBREdST1VQIEdST1VQIGdyb3VwIGNvbnN1bWVyIFtDT1VOVCBjb3VudF0gW0JMT0NLIG1pbGxpc2Vjb25kc10gW05PQUNLXSBTVFJFQU1TIGtleSBba2V5IC4uLl0gaWQgW2lkIC4uLl1cbiAgICogRm9yd2FyZHMgdG8gdGhlIFBESU0gZXhlYyBlbmRwb2ludC4gZXhlYygpIGl0c2VsZiBhbHJlYWR5IHJldHVybnMgbnVsbCBmb3IgYVxuICAgKiBnZW51aW5lbHkgdW5zdXBwb3J0ZWQgY29tbWFuZCAoSFRUUCA0eHggLyBcIkVSUiB1bmtub3duIGNvbW1hbmRcIikgYW5kIHRocm93c1xuICAgKiBmb3IgZXZlcnl0aGluZyBlbHNlICh0aW1lb3V0cywgNXh4LCBuZXR3b3JrIGZhaWx1cmVzLCBjaXJjdWl0LW9wZW4pLiBEbyBub3RcbiAgICogcmUtY2F0Y2ggaGVyZSDigJQgdGhhdCB3b3VsZCBtYXNrIGEgcmVhbCBQRElNIG91dGFnZSBhcyBhbiBlbXB0eSByZWFkIGluc3RlYWRcbiAgICogb2Ygc3VyZmFjaW5nIGl0IHRvIHRoZSBjYWxsZXIuXG4gICAqL1xuICBhc3luYyB4cmVhZGdyb3VwKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8YW55W10gfCBudWxsPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxhbnlbXSB8IG51bGw+KFtcIlhSRUFER1JPVVBcIiwgLi4uYXJnc10pO1xuICB9XG5cbiAgLy8g4pSA4pSAIGNhbWVsQ2FzZSBzdHJlYW0gYWxpYXNlcyAobm9kZS1yZWRpcyB2NCBjb21wYXQpIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICB4QWRkID0gKGtleTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHRoaXMueGFkZChrZXksIC4uLmFyZ3MpO1xuICB4VHJpbSA9IChrZXk6IHN0cmluZywgczogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pID0+IHRoaXMueHRyaW0oa2V5LCBzLCAuLi5hKTtcbiAgeExlbiA9IChrZXk6IHN0cmluZykgPT4gdGhpcy54bGVuKGtleSk7XG4gIHhSYW5nZSA9IChrZXk6IHN0cmluZywgczogc3RyaW5nLCBlOiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSkgPT5cbiAgICB0aGlzLnhyYW5nZShrZXksIHMsIGUsIC4uLmEpO1xuICB4UmV2UmFuZ2UgPSAoa2V5OiBzdHJpbmcsIGU6IHN0cmluZywgczogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pID0+XG4gICAgdGhpcy54cmV2cmFuZ2Uoa2V5LCBlLCBzLCAuLi5hKTtcbiAgeFJlYWQgPSAoLi4uYXJnczogdW5rbm93bltdKSA9PiB0aGlzLnhyZWFkKC4uLmFyZ3MpO1xuICB4UmVhZEdyb3VwID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdGhpcy54cmVhZGdyb3VwKC4uLmFyZ3MpO1xuICB4RGVsID0gKGtleTogc3RyaW5nLCAuLi5pZHM6IHN0cmluZ1tdKSA9PiB0aGlzLnhkZWwoa2V5LCAuLi5pZHMpO1xuICB4QWNrID0gKGtleTogc3RyaW5nLCBnOiBzdHJpbmcsIC4uLmlkczogc3RyaW5nW10pID0+XG4gICAgdGhpcy54YWNrKGtleSwgZywgLi4uaWRzKTtcbiAgeEdyb3VwID0gKHN1Yjogc3RyaW5nLCBrZXk6IHN0cmluZywgZzogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pID0+XG4gICAgdGhpcy54Z3JvdXAoc3ViLCBrZXksIGcsIC4uLmEpO1xuICB4Q2xhaW0gPSAoa2V5OiBzdHJpbmcsIGc6IHN0cmluZywgYzogc3RyaW5nLCB0OiBudW1iZXIsIC4uLmE6IHVua25vd25bXSkgPT5cbiAgICB0aGlzLnhjbGFpbShrZXksIGcsIGMsIHQsIC4uLmEpO1xuICB4QXV0b0NsYWltID0gKFxuICAgIGtleTogc3RyaW5nLFxuICAgIGc6IHN0cmluZyxcbiAgICBjOiBzdHJpbmcsXG4gICAgdDogbnVtYmVyLFxuICAgIHM6IHN0cmluZyxcbiAgICAuLi5hOiB1bmtub3duW11cbiAgKSA9PiB0aGlzLnhhdXRvY2xhaW0oa2V5LCBnLCBjLCB0LCBzLCAuLi5hKTtcbiAgeFBlbmRpbmcgPSAoa2V5OiBzdHJpbmcsIGc6IHN0cmluZywgLi4uYTogdW5rbm93bltdKSA9PlxuICAgIHRoaXMueHBlbmRpbmcoa2V5LCBnLCAuLi5hKTtcbiAgeEluZm8gPSAoc3ViOiBzdHJpbmcsIGtleTogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pID0+XG4gICAgdGhpcy54aW5mbyhzdWIsIGtleSwgLi4uYSk7XG5cbiAgLy8g4pSA4pSAIEx1YSBldmFsIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAvKipcbiAgICogZXZhbCgpIOKAlCBQRElNIHN1cHBvcnRzIEVWQUwgdmlhIGl0cyBIVFRQIGV4ZWMgZW5kcG9pbnQuXG4gICAqIFNpZ25hdHVyZSBtYXRjaGVzIGlvcmVkaXM6IGV2YWwoc2NyaXB0LCBudW1rZXlzLCAuLi5rZXlzX2FuZF9hcmdzKVxuICAgKi9cbiAgYXN5bmMgZXZhbChcbiAgICBzY3JpcHQ6IHN0cmluZyxcbiAgICBudW1rZXlzOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgLi4uYXJnczogdW5rbm93bltdXG4gICk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIHJldHVybiB0aGlzLmV4ZWMoW1wiRVZBTFwiLCBzY3JpcHQsIG51bWtleXMsIC4uLmFyZ3NdKTtcbiAgfVxuXG4gIC8vIOKUgOKUgCBQdWIvU3ViIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBwcml2YXRlIHNwbGl0U3Vic2NyaXB0aW9uQXJncyhcbiAgICB2YWx1ZXM6IEFycmF5PHN0cmluZyB8IFBkaW1QdWJTdWJDYWxsYmFjaz4sXG4gICk6IHsgbmFtZXM6IHN0cmluZ1tdOyBjYWxsYmFjaz86IFBkaW1QdWJTdWJDYWxsYmFjayB9IHtcbiAgICBjb25zdCBsYXN0ID0gdmFsdWVzW3ZhbHVlcy5sZW5ndGggLSAxXTtcbiAgICBjb25zdCBjYWxsYmFjayA9IHR5cGVvZiBsYXN0ID09PSBcImZ1bmN0aW9uXCIgPyBsYXN0IDogdW5kZWZpbmVkO1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lczogdmFsdWVzLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSxcbiAgICAgIGNhbGxiYWNrLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZVB1YlN1YlN1YnNjcmlwdGlvbnMoXG4gICAga2luZDogXCJjaGFubmVsXCIgfCBcInBhdHRlcm5cIixcbiAgICBhZGQ6IGJvb2xlYW4sXG4gICAgcmVxdWVzdGVkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGNhbGxiYWNrPzogUGRpbVB1YlN1YkNhbGxiYWNrLFxuICApOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHRoaXMuYXNzZXJ0Q29ubmVjdGVkKCk7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IGtpbmQgPT09IFwiY2hhbm5lbFwiID8gdGhpcy5wdWJTdWJDaGFubmVscyA6IHRoaXMucHViU3ViUGF0dGVybnM7XG4gICAgY29uc3QgbmFtZXMgPSBbLi4ubmV3IFNldChyZXF1ZXN0ZWROYW1lcyldO1xuICAgIGlmIChhZGQgJiYgbmFtZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGAke2tpbmQgPT09IFwiY2hhbm5lbFwiID8gXCJTVUJTQ1JJQkVcIiA6IFwiUFNVQlNDUklCRVwifSByZXF1aXJlcyBhIG5hbWVgKTtcbiAgICB9XG5cbiAgICBjb25zdCBjaGFuZ2VkTmFtZXMgPSBhZGRcbiAgICAgID8gbmFtZXMuZmlsdGVyKChuYW1lKSA9PiAhc3Vic2NyaXB0aW9ucy5oYXMobmFtZSkpXG4gICAgICA6IG5hbWVzLmxlbmd0aCA9PT0gMFxuICAgICAgICA/IFsuLi5zdWJzY3JpcHRpb25zXVxuICAgICAgICA6IG5hbWVzLmZpbHRlcigobmFtZSkgPT4gc3Vic2NyaXB0aW9ucy5oYXMobmFtZSkpO1xuXG4gICAgaWYgKGFkZCkge1xuICAgICAgZm9yIChjb25zdCBuYW1lIG9mIGNoYW5nZWROYW1lcykgc3Vic2NyaXB0aW9ucy5hZGQobmFtZSk7XG4gICAgfSBlbHNlIGlmIChuYW1lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChjb25zdCBuYW1lIG9mIGNoYW5nZWROYW1lcykgc3Vic2NyaXB0aW9ucy5kZWxldGUobmFtZSk7XG4gICAgfVxuXG4gICAgY29uc3QgY291bnQgPSAoKSA9PiB0aGlzLnB1YlN1YkNoYW5uZWxzLnNpemUgKyB0aGlzLnB1YlN1YlBhdHRlcm5zLnNpemU7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChjaGFuZ2VkTmFtZXMubGVuZ3RoID4gMCkgYXdhaXQgdGhpcy5yZWZyZXNoUHViU3ViU3RyZWFtKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNhbGxiYWNrPy4oZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpLCBjb3VudCgpKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIGNvbnN0IHRvdGFsID0gY291bnQoKTtcbiAgICBjb25zdCBldmVudE5hbWUgPSBhZGRcbiAgICAgID8ga2luZCA9PT0gXCJjaGFubmVsXCIgPyBcInN1YnNjcmliZVwiIDogXCJwc3Vic2NyaWJlXCJcbiAgICAgIDoga2luZCA9PT0gXCJjaGFubmVsXCIgPyBcInVuc3Vic2NyaWJlXCIgOiBcInB1bnN1YnNjcmliZVwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjaGFuZ2VkTmFtZXMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICBjb25zdCBhY2tub3dsZWRnZWRDb3VudCA9IGFkZFxuICAgICAgICA/IHRvdGFsIC0gY2hhbmdlZE5hbWVzLmxlbmd0aCArIGluZGV4ICsgMVxuICAgICAgICA6IHRvdGFsICsgY2hhbmdlZE5hbWVzLmxlbmd0aCAtIGluZGV4IC0gMTtcbiAgICAgIHRoaXMuZW1pdChldmVudE5hbWUsIGNoYW5nZWROYW1lc1tpbmRleF0sIGFja25vd2xlZGdlZENvdW50KTtcbiAgICB9XG4gICAgY2FsbGJhY2s/LihudWxsLCB0b3RhbCk7XG4gICAgcmV0dXJuIHRvdGFsO1xuICB9XG5cbiAgYXN5bmMgcHVibGlzaChjaGFubmVsOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuZXhlYzxudW1iZXI+KFtcIlBVQkxJU0hcIiwgY2hhbm5lbCwgbWVzc2FnZV0pO1xuICB9XG5cbiAgYXN5bmMgc3Vic2NyaWJlKC4uLnZhbHVlczogQXJyYXk8c3RyaW5nIHwgUGRpbVB1YlN1YkNhbGxiYWNrPik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgY29uc3QgeyBuYW1lcywgY2FsbGJhY2sgfSA9IHRoaXMuc3BsaXRTdWJzY3JpcHRpb25BcmdzKHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlUHViU3ViU3Vic2NyaXB0aW9ucyhcImNoYW5uZWxcIiwgdHJ1ZSwgbmFtZXMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIGFzeW5jIHBzdWJzY3JpYmUoLi4udmFsdWVzOiBBcnJheTxzdHJpbmcgfCBQZGltUHViU3ViQ2FsbGJhY2s+KTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCB7IG5hbWVzLCBjYWxsYmFjayB9ID0gdGhpcy5zcGxpdFN1YnNjcmlwdGlvbkFyZ3ModmFsdWVzKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVQdWJTdWJTdWJzY3JpcHRpb25zKFwicGF0dGVyblwiLCB0cnVlLCBuYW1lcywgY2FsbGJhY2spO1xuICB9XG5cbiAgYXN5bmMgdW5zdWJzY3JpYmUoLi4udmFsdWVzOiBBcnJheTxzdHJpbmcgfCBQZGltUHViU3ViQ2FsbGJhY2s+KTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCB7IG5hbWVzLCBjYWxsYmFjayB9ID0gdGhpcy5zcGxpdFN1YnNjcmlwdGlvbkFyZ3ModmFsdWVzKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVQdWJTdWJTdWJzY3JpcHRpb25zKFwiY2hhbm5lbFwiLCBmYWxzZSwgbmFtZXMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIGFzeW5jIHB1bnN1YnNjcmliZSguLi52YWx1ZXM6IEFycmF5PHN0cmluZyB8IFBkaW1QdWJTdWJDYWxsYmFjaz4pOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGNvbnN0IHsgbmFtZXMsIGNhbGxiYWNrIH0gPSB0aGlzLnNwbGl0U3Vic2NyaXB0aW9uQXJncyh2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZVB1YlN1YlN1YnNjcmlwdGlvbnMoXCJwYXR0ZXJuXCIsIGZhbHNlLCBuYW1lcywgY2FsbGJhY2spO1xuICB9XG5cbiAgLy8g4pSA4pSAIFNlcnZlciBjb21tYW5kcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgYXN5bmMgcGluZygpOiBQcm9taXNlPFwiUE9OR1wiPiB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWM8XCJQT05HXCI+KFtcIlBJTkdcIl0pO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIFwiUE9OR1wiO1xuICAgIH1cbiAgfVxuICBhc3luYyBpbmZvKF9zZWN0aW9uPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gW1xuICAgICAgXCIjIFNlcnZlclwiLFxuICAgICAgXCJyZWRpc192ZXJzaW9uOjcuMC4wXCIsXG4gICAgICBcInJlZGlzX21vZGU6c3RhbmRhbG9uZVwiLFxuICAgICAgXCJvczpMaW51eFwiLFxuICAgICAgXCJtYXhtZW1vcnlfcG9saWN5Om5vZXZpY3Rpb25cIixcbiAgICAgIFwiXCIsXG4gICAgXS5qb2luKFwiXFxyXFxuXCIpO1xuICB9XG4gIGFzeW5jIGZsdXNoZGIoKTogUHJvbWlzZTxcIk9LXCI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPFwiT0tcIj4oW1wiRkxVU0hEQlwiXSk7XG4gIH1cbiAgYXN5bmMgZmx1c2hhbGwoKTogUHJvbWlzZTxcIk9LXCI+IHtcbiAgICByZXR1cm4gdGhpcy5leGVjPFwiT0tcIj4oW1wiRkxVU0hBTExcIl0pO1xuICB9XG5cbiAgLy8g4pSA4pSAIGNhbWVsQ2FzZSBhbGlhc2VzIChub2RlLXJlZGlzIHY0IGNvbXBhdCkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIHNldEV4ID0gKGs6IHN0cmluZywgczogbnVtYmVyLCB2OiBzdHJpbmcpID0+IHRoaXMuc2V0ZXgoaywgcywgdik7XG4gIGhHZXRBbGwgPSAoazogc3RyaW5nKSA9PiB0aGlzLmhnZXRhbGwoayk7XG4gIGhTZXQgPSAoazogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pID0+IHRoaXMuaHNldChrLCAuLi5hKTtcbiAgaEdldCA9IChrOiBzdHJpbmcsIGY6IHN0cmluZykgPT4gdGhpcy5oZ2V0KGssIGYpO1xuICBoRGVsID0gKGs6IHN0cmluZywgLi4uZjogc3RyaW5nW10pID0+IHRoaXMuaGRlbChrLCAuLi5mKTtcbiAgaEV4aXN0cyA9IChrOiBzdHJpbmcsIGY6IHN0cmluZykgPT4gdGhpcy5oZXhpc3RzKGssIGYpO1xuICBoSW5jckJ5ID0gKGs6IHN0cmluZywgZjogc3RyaW5nLCBuOiBudW1iZXIpID0+IHRoaXMuaGluY3JieShrLCBmLCBuKTtcbiAgaEtleXMgPSAoazogc3RyaW5nKSA9PiB0aGlzLmhrZXlzKGspO1xuICBoVmFscyA9IChrOiBzdHJpbmcpID0+IHRoaXMuaHZhbHMoayk7XG4gIGhMZW4gPSAoazogc3RyaW5nKSA9PiB0aGlzLmhsZW4oayk7XG4gIHNBZGQgPSAoazogc3RyaW5nLCAuLi5tOiB1bmtub3duW10pID0+IHRoaXMuc2FkZChrLCAuLi5tKTtcbiAgc1JlbSA9IChrOiBzdHJpbmcsIC4uLm06IHVua25vd25bXSkgPT4gdGhpcy5zcmVtKGssIC4uLm0pO1xuICBzTWVtYmVycyA9IChrOiBzdHJpbmcpID0+IHRoaXMuc21lbWJlcnMoayk7XG4gIHNJc01lbWJlciA9IChrOiBzdHJpbmcsIG06IHN0cmluZykgPT4gdGhpcy5zaXNtZW1iZXIoaywgbSk7XG4gIHNDYXJkID0gKGs6IHN0cmluZykgPT4gdGhpcy5zY2FyZChrKTtcbiAgbFB1c2ggPSAoazogc3RyaW5nLCAuLi52OiB1bmtub3duW10pID0+IHRoaXMubHB1c2goaywgLi4udik7XG4gIHJQdXNoID0gKGs6IHN0cmluZywgLi4udjogdW5rbm93bltdKSA9PiB0aGlzLnJwdXNoKGssIC4uLnYpO1xuICBsUmFuZ2UgPSAoazogc3RyaW5nLCBzOiBudW1iZXIsIGU6IG51bWJlcikgPT4gdGhpcy5scmFuZ2UoaywgcywgZSk7XG4gIGxMZW4gPSAoazogc3RyaW5nKSA9PiB0aGlzLmxsZW4oayk7XG4gIGxQb3AgPSAoazogc3RyaW5nKSA9PiB0aGlzLmxwb3Aoayk7XG4gIHJQb3AgPSAoazogc3RyaW5nKSA9PiB0aGlzLnJwb3Aoayk7XG4gIHpBZGQgPSAoazogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pID0+IHRoaXMuemFkZChrLCAuLi5hKTtcbiAgekNhcmQgPSAoazogc3RyaW5nKSA9PiB0aGlzLnpjYXJkKGspO1xuICB6UmFuZ2UgPSAoazogc3RyaW5nLCBzOiBudW1iZXIsIGU6IG51bWJlciwgLi4uYTogdW5rbm93bltdKSA9PlxuICAgIHRoaXMuenJhbmdlKGssIHMsIGUsIC4uLmEpO1xuICB6UmV2UmFuZ2UgPSAoazogc3RyaW5nLCBzOiBudW1iZXIsIGU6IG51bWJlciwgLi4uYTogdW5rbm93bltdKSA9PlxuICAgIHRoaXMuenJldnJhbmdlKGssIHMsIGUsIC4uLmEpO1xuICB6UmVtID0gKGs6IHN0cmluZywgLi4ubTogdW5rbm93bltdKSA9PiB0aGlzLnpyZW0oaywgLi4ubSk7XG4gIHpTY29yZSA9IChrOiBzdHJpbmcsIG06IHN0cmluZykgPT4gdGhpcy56c2NvcmUoaywgbSk7XG4gIHpSYW5rID0gKGs6IHN0cmluZywgbTogc3RyaW5nKSA9PiB0aGlzLnpyYW5rKGssIG0pO1xuICB6UmVtUmFuZ2VCeVNjb3JlID0gKFxuICAgIGs6IHN0cmluZyxcbiAgICBtaW46IHN0cmluZyB8IG51bWJlcixcbiAgICBtYXg6IHN0cmluZyB8IG51bWJlcixcbiAgKSA9PiB0aGlzLnpyZW1yYW5nZWJ5c2NvcmUoaywgbWluLCBtYXgpO1xuICB6UmFuZ2VCeVNjb3JlID0gKFxuICAgIGs6IHN0cmluZyxcbiAgICBtaW46IHN0cmluZyB8IG51bWJlcixcbiAgICBtYXg6IHN0cmluZyB8IG51bWJlcixcbiAgICAuLi5hOiB1bmtub3duW11cbiAgKSA9PiB0aGlzLnpyYW5nZWJ5c2NvcmUoaywgbWluLCBtYXgsIC4uLmEpO1xuICB6Q291bnQgPSAoXG4gICAgazogc3RyaW5nLFxuICAgIG1pbjogc3RyaW5nIHwgbnVtYmVyLFxuICAgIG1heDogc3RyaW5nIHwgbnVtYmVyLFxuICApID0+IHRoaXMuemNvdW50KGssIG1pbiwgbWF4KTtcbiAgbUdldCA9ICguLi5rOiBzdHJpbmdbXSkgPT4gdGhpcy5tZ2V0KC4uLmspO1xuICBtU2V0ID0gKC4uLmE6IHN0cmluZ1tdKSA9PiB0aGlzLm1zZXQoLi4uYSk7XG4gIGluY3JCeSA9IChrOiBzdHJpbmcsIG46IG51bWJlcikgPT4gdGhpcy5pbmNyYnkoaywgbik7XG4gIGRlY3JCeSA9IChrOiBzdHJpbmcsIG46IG51bWJlcikgPT4gdGhpcy5kZWNyYnkoaywgbik7XG4gIHBFeHBpcmUgPSAoazogc3RyaW5nLCBtczogbnVtYmVyKSA9PiB0aGlzLnBleHBpcmUoaywgbXMpO1xuICBwVHRsID0gKGs6IHN0cmluZykgPT4gdGhpcy5wdHRsKGspO1xufVxuXG5sZXQgX3BkaW1JbnN0YW5jZTogUGRpbVJlZGlzQ2xpZW50IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQZGltQ2xpZW50KCk6IFBkaW1SZWRpc0NsaWVudCB7XG4gIGlmICghX3BkaW1JbnN0YW5jZSkge1xuICAgIF9wZGltSW5zdGFuY2UgPSBuZXcgUGRpbVJlZGlzQ2xpZW50KCk7XG4gICAgLy8gU3RhcnQgdGhlIGRpcmVjdC1IVFRQIHJlY292ZXJ5IHByb2JlciBvbiBmaXJzdCB1c2Ugc28gdGhlIGNpcmN1aXQgY2FuXG4gICAgLy8gY2xvc2UgZXZlbiB3aGVuIFBESU0ncyBMdWEgbGF5ZXIgaXMgbGFnZ2luZyBiZWhpbmQgaXRzIEhUVFAgbGF5ZXIuXG4gICAgc3RhcnRQZGltRGlyZWN0UHJvYmVyKCk7XG4gIH1cbiAgcmV0dXJuIF9wZGltSW5zdGFuY2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1BkaW1Db25maWd1cmVkKCk6IGJvb2xlYW4ge1xuICBjb25zdCBleGVjVXJsID1cbiAgICBwcm9jZXNzLmVudi5QRElNX0VYRUNfVVJMIHx8IHByb2Nlc3MuZW52LlBESU1fSFRUUF9FWEVDX1VSTCB8fCBcIlwiO1xuICBpZiAoIWV4ZWNVcmwpIHJldHVybiBmYWxzZTtcblxuICAvLyBUaGUgaW4tcHJvY2VzcyBQRElNIHNlcnZlciBpcyBpbnRlbnRpb25hbGx5IGxvb3BiYWNrLW9ubHkgYW5kIGhhcyBub1xuICAvLyBiZWFyZXItYXV0aCBib3VuZGFyeS4gUmVtb3RlIFBESU0gbXVzdCBzdGlsbCBwcm92aWRlIGl0cyBjcmVkZW50aWFsLlxuICBjb25zdCBpc0xvY2FsID0gaXNMb2NhbFBkaW1FeGVjVXJsKGV4ZWNVcmwpO1xuICByZXR1cm4gaXNMb2NhbCB8fCAhIShwcm9jZXNzLmVudi5QRElNX0VYRUNfVE9LRU4gfHwgcHJvY2Vzcy5lbnYuUERJTV9CRUFSRVJfVE9LRU4pO1xufVxuXG5mdW5jdGlvbiBpc0xvY2FsUGRpbUV4ZWNVcmwoZXhlY1VybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIG5ldyBVUkwoZXhlY1VybCkub3JpZ2luID09PSBsb29wYmFja1VybChydW50aW1lUG9ydHMubG9jYWxQZGltKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8vIOKUgOKUgCBEaXJlY3QtSFRUUCBjaXJjdWl0LXJlY292ZXJ5IHByb2JlciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbi8vIFdoZW4gdGhlIGNpcmN1aXQgaXMgT1BFTiB0aGUgb25seSBwcm9iZSB0aGF0IGZpcmVzIGlzIHRoZSBIQUxGLU9QRU4gb25lLFxuLy8gd2hpY2ggZ29lcyB0aHJvdWdoIHRoZSBmdWxsIEx1YSBleGVjdXRvciBwYXRoLiAgT24gZGVlcCBjb2xkLXN0YXJ0cyBQRElNJ3Ncbi8vIHBsYWluIEhUVFAgbGF5ZXIgcmVjb3ZlcnMgfjYwIHMgYmVmb3JlIGl0cyBMdWEvc2NyaXB0aW5nIGxheWVyIGRvZXMsIHNvIHRoZVxuLy8gTHVhLWJhc2VkIHByb2JlIGtlZXBzIHJldHVybmluZyA1MDAgZXZlbiB0aG91Z2ggUERJTSBpcyBhbHJlYWR5IHNlcnZpbmdcbi8vIHJlZ3VsYXIgR0VUL1NFVCBjb21tYW5kcy5cbi8vXG4vLyBUaGlzIGJhY2tncm91bmQgdGltZXIgbWFrZXMgYSBsaWdodHdlaWdodCBkaXJlY3QgUE9TVCAoYnlwYXNzaW5nIEx1YSkgZXZlcnlcbi8vIERJUkVDVF9QUk9CRV9JTlRFUlZBTF9NUy4gIE9uIEhUVFAgMjAwIGl0IGNhbGxzIGNiRm9yY2VDbG9zZSgpIHNvIHRoZVxuLy8gY2lyY3VpdCBjbG9zZXMgaW1tZWRpYXRlbHkg4oCUIG5vIG1vcmUgNjAtcyByZS1vcGVuL3JlLWNsb3NlIGN5Y2xpbmcuXG4vL1xuY29uc3QgRElSRUNUX1BST0JFX0lOVEVSVkFMX01TID0gMTVfMDAwO1xuY29uc3QgRElSRUNUX1BST0JFX1RJTUVPVVRfTVMgPSA1XzAwMDtcbi8vIFRpbWVvdXQgZm9yIGV2ZXJ5IGluZGl2aWR1YWwgUERJTSBleGVjKCkgY2FsbC5cbi8vIEhpc3Rvcnk6IG9yaWdpbmFsbHkgMTVzIOKGkiByZWR1Y2VkIHRvIDE1MDBtcyB0byBpbXByb3ZlIHF1ZXVlIGRyYWluIHJhdGVcbi8vIHdoZW4gUERJTSB3YXMgY29uZ2VzdGVkLiAgUmFpc2VkIHRvIDQwMDBtcyBiZWNhdXNlIFBESU0gaXMgYSBwZXJtYW5lbnRseVxuLy8gcnVubmluZyBzZXJ2aWNlIHdob3NlIFJUVCBvY2Nhc2lvbmFsbHkgc3Bpa2VzIHRvIH4z4oCTNCBzIHVuZGVyIHdyaXRlIGxvYWQ7XG4vLyAxNTAwbXMgY2F1c2VkIHNwdXJpb3VzIFNFVC9TRVRFWCB0aW1lb3V0cyBkdXJpbmcgdGhvc2Ugc3Bpa2VzLiAgNDAwMG1zXG4vLyBzdGlsbCBrZWVwcyB0aGUgcGVyLWxhbmUgZHJhaW4gcmF0ZSBhdCB+MiBjYWxscy9zICh2cyAwLjUgYXQgMTVzKSBhbmRcbi8vIGdpdmVzIHJlYWwgbGF0ZW5jeSBzcGlrZXMgYSBjaGFuY2UgdG8gcmVzb2x2ZSBiZWZvcmUgdGhlIHRpbWVvdXQgZmlyZXMuXG5jb25zdCBQRElNX0VYRUNfVElNRU9VVF9NUyA9IDRfMDAwO1xuXG5sZXQgX2RpcmVjdFByb2JlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldEludGVydmFsPiB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRQZGltRGlyZWN0UHJvYmVyKCk6IHZvaWQge1xuICBpZiAoX2RpcmVjdFByb2JlVGltZXIpIHJldHVybjsgLy8gYWxyZWFkeSBydW5uaW5nXG5cbiAgY29uc3QgcGRpbVVybCA9XG4gICAgcHJvY2Vzcy5lbnYuUERJTV9FWEVDX1VSTCB8fCBwcm9jZXNzLmVudi5QRElNX0hUVFBfRVhFQ19VUkwgfHwgXCJcIjtcbiAgY29uc3QgcGRpbVRva2VuID1cbiAgICBwcm9jZXNzLmVudi5QRElNX0VYRUNfVE9LRU4gfHwgcHJvY2Vzcy5lbnYuUERJTV9CRUFSRVJfVE9LRU4gfHwgXCJcIjtcbiAgaWYgKCFwZGltVXJsKSByZXR1cm47XG4gIGNvbnN0IGlzTG9jYWwgPSBpc0xvY2FsUGRpbUV4ZWNVcmwocGRpbVVybCk7XG4gIC8vIFRoZSBvd25lZCBsb29wYmFjayBzZXJ2ZXIgaW50ZW50aW9uYWxseSBoYXMgbm8gYXV0aGVudGljYXRpb24gYm91bmRhcnkuXG4gIC8vIEV2ZXJ5IHJlbW90ZSBhdXRob3JpdHkgcmVtYWlucyBmYWlsLWNsb3NlZCB3aXRob3V0IGl0cyBiZWFyZXIgY3JlZGVudGlhbC5cbiAgaWYgKCFpc0xvY2FsICYmICFwZGltVG9rZW4pIHJldHVybjtcblxuICBfZGlyZWN0UHJvYmVUaW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBzdGF0ZSA9IGNiR2V0U3RhdGUoKTtcbiAgICBpZiAoc3RhdGUgPT09IFwiQ0xPU0VEXCIpIHJldHVybjsgLy8gY2lyY3VpdCBoZWFsdGh5IOKAlCBub3RoaW5nIHRvIGRvXG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICB9O1xuICAgICAgaWYgKCFpc0xvY2FsKSBoZWFkZXJzLkF1dGhvcml6YXRpb24gPSBgQmVhcmVyICR7cGRpbVRva2VufWA7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChwZGltVXJsLCB7XG4gICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgY21kOiBcIlBJTkdcIiwgYXJnczogW10gfSksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dChESVJFQ1RfUFJPQkVfVElNRU9VVF9NUyksXG4gICAgICAgIC8vIERvIG5vdCBmb2xsb3cgUmVwbGl0IHByb3h5IHJlZGlyZWN0cyDigJQgYSAzeHgg4oaSIDIwMCBIVE1MIHJlc3BvbnNlXG4gICAgICAgIC8vIChlLmcuIFwiZGVwbG95bWVudCBub3QgcmVhY2hhYmxlXCIgcGFnZSkgd291bGQgbG9vayBsaWtlIGEgc3VjY2Vzc2Z1bFxuICAgICAgICAvLyBwcm9iZSBhbmQgaW5jb3JyZWN0bHkgZm9yY2UtY2xvc2UgdGhlIGNpcmN1aXQgd2hpbGUgUERJTSBpcyBzdGlsbCBkb3duLlxuICAgICAgICByZWRpcmVjdDogXCJtYW51YWxcIixcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzLm9rKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG4gICAgICAgIGNvbnN0IHBvbmcgPVxuICAgICAgICAgIGRhdGEgPT09IFwiUE9OR1wiIHx8XG4gICAgICAgICAgKGRhdGEgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHR5cGVvZiBkYXRhID09PSBcIm9iamVjdFwiICYmXG4gICAgICAgICAgICBcInJlc3VsdFwiIGluIGRhdGEgJiZcbiAgICAgICAgICAgIGRhdGEucmVzdWx0ID09PSBcIlBPTkdcIik7XG4gICAgICAgIGlmIChwb25nICYmIGNiR2V0U3RhdGUoKSAhPT0gXCJDTE9TRURcIikge1xuICAgICAgICAgIGxvZ2dlci5pbmZvKFxuICAgICAgICAgICAgYFtQRElNXSBEaXJlY3QgSFRUUCBwcm9iZSBPSyAoSFRUUCAke3Jlcy5zdGF0dXN9KSDigJQgZm9yY2UtY2xvc2luZyBjaXJjdWl0IGJyZWFrZXJgLFxuICAgICAgICAgICk7XG4gICAgICAgICAgY2JGb3JjZUNsb3NlKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXBvbmcpIHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICBgW1BESU1dIERpcmVjdCBwcm9iZSByZXR1cm5lZCBIVFRQICR7cmVzLnN0YXR1c30gd2l0aG91dCBQT05HIGAgK1xuICAgICAgICAgICAgICBgKGNpcmN1aXQgc3RheXMgJHtjYkdldFN0YXRlKCl9KWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgIGBbUERJTV0gRGlyZWN0IHByb2JlOiBIVFRQICR7cmVzLnN0YXR1c30gYCArXG4gICAgICAgICAgICBgY29udGVudC10eXBlPSR7cmVzLmhlYWRlcnMuZ2V0KFwiY29udGVudC10eXBlXCIpID8/IFwibm9uZVwifSBgICtcbiAgICAgICAgICAgIGAoY2lyY3VpdCBzdGF5cyAke2NiR2V0U3RhdGUoKX0pYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW1BESU1dIERpcmVjdCBwcm9iZSBlcnJvcjogJHsoZXJyIGFzIEVycm9yKS5tZXNzYWdlfWApO1xuICAgIH1cbiAgfSwgRElSRUNUX1BST0JFX0lOVEVSVkFMX01TKTtcblxuICBfZGlyZWN0UHJvYmVUaW1lci51bnJlZj8uKCk7IC8vIGRvbid0IGJsb2NrIHByb2Nlc3MgZXhpdFxufVxuIl0sImZpbGUiOiIvc2VydmVyL2xpYi9wZGltQ2xpZW50LnRzIn0=

}}