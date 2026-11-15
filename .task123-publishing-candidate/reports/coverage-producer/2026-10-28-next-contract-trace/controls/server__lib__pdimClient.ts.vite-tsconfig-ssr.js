__vite_ssr_exportName__("setPdimGapFloor", () => { try { return setPdimGapFloor } catch {} });
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
const __vite_ssr_import_2__ = await __vite_ssr_import__("../logger.js", {"importedNames":["logger"]});
const __vite_ssr_import_3__ = await __vite_ssr_import__("../config/ports.js", {"importedNames":["loopbackUrl","runtimePorts"]});
const __vite_ssr_import_4__ = await __vite_ssr_import__("./luaExecutor.js", {"importedNames":["execLuaViaPdim"]});
const __vite_ssr_import_5__ = await __vite_ssr_import__("./pdimCircuitBreaker.js", {"importedNames":["cbAllowRequest","cbRecordFailure","cbRecordSuccess","cbHalfOpenFailed","cbForceClose","cbGetState"]});






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
  `[PDIM] Auto multiplier: ${autoMultiplier} (clusterWorkers=${clusterWorkers} \xD7 ceil(cpuCores=${cpuCores}/2)=${Math.max(1, Math.ceil(cpuCores / 2))}) \u2014 AIMD init=1ms, floor=${_PDIM_GAP_FLOOR_MS}ms (${clusterWorkers}workers\xD7${_PDIM_GAP_FLOOR_BASE_MS}ms, combined\u2264${Math.round(1e3 / _PDIM_GAP_FLOOR_BASE_MS)} req/s), ZPOPMIN gap=${Math.max(1, autoMultiplier)}ms`
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
        `[PDIM] Direct-call fast-fail \u2014 est. queue wait ${Math.round(estimatedWaitMs)}ms (${_directQueueDepth} direct / ${_PDIM_DIRECT_LANES} lanes \xD7 ${gapForFastFail}ms capped [live=${_pdimGapMs}ms] + ${_scriptQueueDepth} script \xD7 10ms) > ${_MAX_DIRECT_WAIT_MS}ms threshold; caller falls back to PG/in-memory`
      );
    };
    return Promise?.reject(
      new Error(
        `[PDIM] Chain congested \u2014 est. wait ${Math.round(estimatedWaitMs)}ms exceeds ${_MAX_DIRECT_WAIT_MS}ms; use fallback`
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
        `[PDIM] exec error [${String(cmd)}]: HTTP ${status} suppressed \xD7${_suppressedExecErrors} (same error within ${_EXEC_DEDUP_WINDOW_MS / 1e3}s window)`
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
        `[PDIM] exec error [${String(cmd)}]: ${msg} \u2014 suppressed \xD7${_suppressedNetErrors} in last ${_NET_ERROR_DEDUP_MS / 1e3}s`
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
      __vite_ssr_import_2__.logger.info("\u2705 [PDIM] Connected via HTTP exec endpoint");
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
        `[PDIM] Circuit OPEN \u2014 ${cmd} rejected (backing off until PDIM recovers)`
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
            const errMsg = `PDIM HTTP 429: Too many requests (gap\u2192${newGap}ms${retryAfterMs > 0 ? `, retry-after=${retryAfterMs}ms` : ""})`;
            counted = true;
            const now429 = Date?.now();
            if (now429 - _last429LoggedAt < _429_DEDUP_MS) {
              _suppressed429Count++;
            } else {
              if (_suppressed429Count > 0) {
                __vite_ssr_import_2__.logger.warn(
                  `[PDIM] exec error [${cmd}]: PDIM HTTP 429 \u2014 gap\u2192${newGap}ms (+ ${_suppressed429Count} suppressed in last ${_429_DEDUP_MS}ms burst)`
                );
                _suppressed429Count = 0;
              } else {
                __vite_ssr_import_2__.logger.warn(
                  `[PDIM] exec error [${cmd}]: PDIM HTTP 429 \u2014 gap\u2192${newGap}ms`
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
      throw new Error(`[PDIM] Circuit OPEN \u2014 ${cmd} (script) rejected`);
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
            throw new Error(`PDIM HTTP 429 (script ${cmd}): gap\u2192${newGap}ms`);
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
            `[PDIM] Direct HTTP probe OK (HTTP ${res.status}) \u2014 force-closing circuit breaker`
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
