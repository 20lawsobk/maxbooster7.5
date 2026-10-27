var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/logSanitizer.ts
import { isIP } from "node:net";
function sanitizeLogText(text3) {
  return text3.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~:-]+/gi, REDACTED).replace(/((?:password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, `$1${REDACTED}`).replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED).replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (value) => isIP(value) ? REDACTED : value).replace(
    /(?<![a-zA-Z0-9])(?:[a-fA-F0-9]*:){2,}[a-fA-F0-9:.]*(?:%[a-zA-Z0-9]+)?/g,
    (value) => isIP(value) ? REDACTED : value
  );
}
function sanitizeLogValue(value, seen = /* @__PURE__ */ new WeakSet(), depth = 0) {
  if (typeof value === "string") return sanitizeLogText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 12) return "[LOG_DEPTH_LIMIT]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[BINARY]";
    if (Array.isArray(value)) {
      const result2 = value.slice(0, 100).map((item) => sanitizeLogValue(item, seen, depth + 1));
      if (value.length > 100) result2.push("[LOG_ITEM_LIMIT]");
      return result2;
    }
    const result = /* @__PURE__ */ Object.create(null);
    if (value instanceof Error) {
      result.type = value.name;
      result.message = sanitizeLogText(value.message);
      result.stack = value.stack ? sanitizeLogText(value.stack) : void 0;
    }
    const keys = Object.getOwnPropertyNames(value).slice(0, 100);
    for (const key of keys) {
      if (["__proto__", "constructor", "prototype", "hasOwnProperty", "toJSON"].includes(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if (!("value" in descriptor)) {
        result[sanitizeLogText(key)] = "[ACCESSOR]";
      } else {
        result[sanitizeLogText(key)] = sensitiveKey.test(key.replace(/[-_]/g, "")) ? REDACTED : sanitizeLogValue(descriptor.value, seen, depth + 1);
      }
    }
    if (Object.getOwnPropertyNames(value).length > 100) result.logTruncated = true;
    return result;
  } finally {
    seen.delete(value);
  }
}
var REDACTED, sensitiveKey;
var init_logSanitizer = __esm({
  "server/logSanitizer.ts"() {
    "use strict";
    REDACTED = "[REDACTED]";
    sensitiveKey = /^(?:.*(?:password|secret|token|apikey|privatekey|authorization|cookie)|.*email(?:address)?|.*username|(?:client|remote|source|user)?ip(?:address)?|.*phone(?:number)?|cardnumber|cvc|cvv|xforwardedfor|xrealip|setcookie)$/i;
  }
});

// server/logger.ts
import pino from "pino";
import { format } from "node:util";
function createAppLogger(destination) {
  const options = {
    level: process.env.LOG_LEVEL || "info",
    hooks: {
      logMethod(args, method) {
        const clean = args.map((value) => sanitizeLogValue(value));
        const messageIndex = typeof clean[0] === "string" ? 0 : 1;
        if (typeof clean[messageIndex] === "string") {
          const message = sanitizeLogText(format(...clean.slice(messageIndex)));
          clean.splice(messageIndex, clean.length - messageIndex, message);
        }
        method.apply(this, clean);
      }
    },
    formatters: {
      bindings: (bindings) => ({ ...sanitizeLogValue(bindings) }),
      log: (object) => ({ ...sanitizeLogValue(object) })
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
      remove: false
    },
    transport: destination ? void 0 : transport
  };
  const instance = destination ? pino(options, destination) : pino(options);
  const child = instance.child;
  instance.child = function(bindings, childOptions) {
    return child.call(this, { ...sanitizeLogValue(bindings) }, childOptions);
  };
  const setBindings = instance.setBindings;
  instance.setBindings = function(bindings) {
    setBindings.call(this, { ...sanitizeLogValue(bindings) });
  };
  return instance;
}
var REDACT_PATHS, transport, logger;
var init_logger = __esm({
  "server/logger.ts"() {
    "use strict";
    init_logSanitizer();
    REDACT_PATHS = [
      // Headers
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      'req.headers["x-csrf-token"]',
      "headers.authorization",
      "headers.cookie",
      'headers["x-api-key"]',
      'headers["x-csrf-token"]',
      // Auth payloads
      "*.password",
      "*.passwordHash",
      "*.currentPassword",
      "*.newPassword",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.idToken",
      "*.apiKey",
      "*.secret",
      "*.clientSecret",
      "*.privateKey",
      "*.twoFactorSecret",
      "*.totpSecret",
      // Stripe / payments
      "*.stripeSecretKey",
      "*.stripeWebhookSecret",
      "*.cardNumber",
      "*.cvc",
      "*.cvv",
      // Generic sensitive containers
      "body.password",
      "body.token",
      "body.secret",
      "body.apiKey"
    ];
    transport = process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT ? { target: "pino-pretty", options: { colorize: true } } : void 0;
    logger = createAppLogger();
  }
});

// server/config/ports.ts
function readPort(name, defaultValue) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  }
  return value;
}
function assertUniquePorts(ports) {
  const owners = /* @__PURE__ */ new Map();
  for (const [name, port] of Object.entries(ports)) {
    const existing = owners.get(port);
    if (existing) {
      throw new Error(
        `[Ports] ${name} and ${existing} are both configured for port ${port}. Internal services must use distinct ports.`
      );
    }
    owners.set(port, name);
  }
  return Object.freeze(ports);
}
function loopbackUrl(port) {
  return `http://127.0.0.1:${port}`;
}
var MIN_PORT, MAX_PORT, defaultPorts, runtimePorts;
var init_ports = __esm({
  "server/config/ports.ts"() {
    "use strict";
    MIN_PORT = 1;
    MAX_PORT = 65535;
    defaultPorts = Object.freeze({
      app: 5e3,
      localPdim: 5556,
      diffusionGateway: 8008,
      maxcoreApi: 8090,
      boosterState: 9877,
      maxcoreModelApi: 9878,
      maxcoreModelHealth: 9879,
      legacyPythonAi: 9880
    });
    runtimePorts = assertUniquePorts({
      app: readPort("PORT", defaultPorts.app),
      localPdim: readPort("LOCAL_PDIM_PORT", defaultPorts.localPdim),
      diffusionGateway: readPort(
        "VIDEO_DIFFUSION_PORT",
        defaultPorts.diffusionGateway
      ),
      maxcoreApi: readPort("MAXCORE_LOCAL_PORT", defaultPorts.maxcoreApi),
      boosterState: readPort(
        "BOOSTERSTATE_SIDECAR_PORT",
        defaultPorts.boosterState
      ),
      maxcoreModelApi: readPort(
        "MODEL_API_PORT",
        defaultPorts.maxcoreModelApi
      ),
      maxcoreModelHealth: readPort(
        "MODEL_API_HEALTH_PORT",
        defaultPorts.maxcoreModelHealth
      ),
      legacyPythonAi: readPort("PYTHON_AI_PORT", defaultPorts.legacyPythonAi)
    });
  }
});

// external/pdim/artifacts/api-server/src/workers/lua-pool.ts
import { Worker } from "worker_threads";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
function resolveWorkerFile() {
  try {
    const url = import.meta.url;
    if (!url) return null;
    return path.join(path.dirname(fileURLToPath(url)), "lua-worker.ts");
  } catch {
    return null;
  }
}
var POOL_SIZE, TIMEOUT_MS, WORKER_FILE, LuaPool, luaPool;
var init_lua_pool = __esm({
  "external/pdim/artifacts/api-server/src/workers/lua-pool.ts"() {
    "use strict";
    POOL_SIZE = Math.min(Number(process.env["LUA_WORKER_THREADS"] ?? 2), 8);
    TIMEOUT_MS = 1e4;
    WORKER_FILE = resolveWorkerFile();
    LuaPool = class {
      workers = [];
      _started = false;
      start() {
        if (this._started) return;
        this._started = true;
        if (!WORKER_FILE) return;
        for (let i = 0; i < POOL_SIZE; i++) {
          this._spawnWorker();
        }
      }
      _spawnWorker() {
        if (!WORKER_FILE) return;
        const worker = new Worker(WORKER_FILE, { execArgv: ["--import", "tsx"] });
        const pw = { worker, pending: /* @__PURE__ */ new Map(), active: 0 };
        worker.on("message", (res) => {
          const call = pw.pending.get(res.id);
          if (!call) return;
          pw.pending.delete(res.id);
          pw.active = Math.max(0, pw.active - 1);
          clearTimeout(call.timer);
          if (res.error) {
            call.reject(new Error(res.error));
          } else {
            call.resolve(res.result);
          }
        });
        worker.on("error", (err) => {
          for (const [, call] of pw.pending) {
            clearTimeout(call.timer);
            call.reject(
              new Error(
                `Lua worker error: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          }
          pw.pending.clear();
          pw.active = 0;
        });
        worker.on("exit", () => {
          const idx = this.workers.indexOf(pw);
          if (idx !== -1) {
            this.workers.splice(idx, 1);
            this._spawnWorker();
          }
        });
        this.workers.push(pw);
      }
      /**
       * Run a Lua script in the pool.  Rejects if the script uses redis.call()
       * (the caller should fall back to the main-thread runner in that case).
       */
      run(script, keys, argv) {
        if (!this._started) this.start();
        const pw = this.workers.reduce(
          (best, w) => w.active < best.active ? w : best,
          this.workers[0]
        );
        const id = randomUUID();
        const req = { id, script, keys, argv };
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pw.pending.delete(id);
            pw.active = Math.max(0, pw.active - 1);
            reject(new Error(`ERR Lua script timed out after ${TIMEOUT_MS}ms`));
          }, TIMEOUT_MS);
          pw.pending.set(id, { resolve, reject, timer });
          pw.active++;
          pw.worker.postMessage(req);
        });
      }
      /** True if the pool has started and workers are alive. */
      get isReady() {
        return this._started && this.workers.length > 0;
      }
      /** Count of scripts currently running across all workers. */
      get activeConcurrency() {
        return this.workers.reduce((sum, w) => sum + w.active, 0);
      }
      async shutdown() {
        await Promise.all(this.workers.map((pw) => pw.worker.terminate()));
        this.workers = [];
        this._started = false;
      }
    };
    luaPool = new LuaPool();
  }
});

// external/pdim/artifacts/api-server/src/redis/store.ts
import { EventEmitter } from "events";
import { createHash, randomUUID as randomUUID2 } from "crypto";
import { LuaFactory } from "wasmoon";
import { createRequire } from "node:module";
import path2 from "node:path";
import { availableParallelism } from "node:os";
function msgpackCodec() {
  if (msgpack) return msgpack;
  const require2 = createRequire(import.meta.url);
  try {
    msgpack = require2("@msgpack/msgpack");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    msgpack = createRequire(path2.resolve("external/pdim/artifacts/api-server/package.json"))("@msgpack/msgpack");
  }
  return msgpack;
}
function acquireLuaSlot() {
  if (_luaActiveCount >= LUA_MAX_CONCURRENCY) return false;
  _luaActiveCount++;
  return true;
}
function releaseLuaSlot() {
  if (_luaActiveCount > 0) _luaActiveCount--;
}
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function redisGlobMatches(pattern, value) {
  const tokens = Array.from(pattern);
  const input = Array.from(value);
  const memo = /* @__PURE__ */ new Map();
  const matchClass = (start, character) => {
    let end = start + 1;
    if (tokens[end] === "]") end++;
    while (end < tokens.length && tokens[end] !== "]") {
      if (tokens[end] === "\\" && end + 1 < tokens.length) end += 2;
      else end++;
    }
    if (end >= tokens.length) return null;
    let index3 = start + 1;
    const negated = tokens[index3] === "^";
    if (negated) index3++;
    let matched = false;
    if (tokens[index3] === "]") {
      matched = character === "]";
      index3++;
    }
    while (index3 < end) {
      let left = tokens[index3];
      if (left === "\\" && index3 + 1 < end) left = tokens[++index3];
      const hasRange = index3 + 2 < end && tokens[index3 + 1] === "-";
      if (hasRange) {
        let right = tokens[index3 + 2];
        if (right === "\\" && index3 + 3 < end) right = tokens[index3 + 3];
        if (left <= character && character <= right) matched = true;
        index3 += right === tokens[index3 + 2] ? 3 : 4;
      } else {
        if (left === character) matched = true;
        index3++;
      }
    }
    return { end, matched: negated ? !matched : matched };
  };
  const visit = (patternIndex, valueIndex) => {
    const key = `${patternIndex}:${valueIndex}`;
    const cached = memo.get(key);
    if (cached !== void 0) return cached;
    if (patternIndex === tokens.length) return valueIndex === input.length;
    const token = tokens[patternIndex];
    let result = false;
    if (token === "*") {
      let next = patternIndex + 1;
      while (tokens[next] === "*") next++;
      result = visit(next, valueIndex);
      for (let cursor = valueIndex; !result && cursor < input.length; cursor++) {
        result = visit(next, cursor + 1);
      }
    } else if (token === "?") {
      result = valueIndex < input.length && visit(patternIndex + 1, valueIndex + 1);
    } else if (token === "[" && valueIndex < input.length) {
      const characterClass = matchClass(patternIndex, input[valueIndex]);
      if (characterClass) {
        result = characterClass.matched && visit(characterClass.end + 1, valueIndex + 1);
      } else {
        result = input[valueIndex] === "[" && visit(patternIndex + 1, valueIndex + 1);
      }
    } else if (token === "\\" && patternIndex + 1 < tokens.length) {
      result = valueIndex < input.length && tokens[patternIndex + 1] === input[valueIndex] && visit(patternIndex + 2, valueIndex + 1);
    } else {
      result = valueIndex < input.length && token === input[valueIndex] && visit(patternIndex + 1, valueIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}
var luaFactory, msgpack, msgpackEncode, msgpackDecode, LUA_MAX_CONCURRENCY, AOF_YIELD_EVERY, ENTRY_INNER_YIELD_EVERY, _luaActiveCount, AOF_MUTATING_COMMANDS, AOF_STREAM_MUTATING_COMMANDS, isAofMutation, RedisStore;
var init_store = __esm({
  "external/pdim/artifacts/api-server/src/redis/store.ts"() {
    "use strict";
    init_lua_pool();
    luaFactory = new LuaFactory();
    msgpackEncode = (...args) => msgpackCodec().encode(...args);
    msgpackDecode = (...args) => msgpackCodec().decode(...args);
    LUA_MAX_CONCURRENCY = Math.max(1, Math.min(8, availableParallelism()));
    AOF_YIELD_EVERY = 2e3;
    ENTRY_INNER_YIELD_EVERY = 5e4;
    _luaActiveCount = 0;
    AOF_MUTATING_COMMANDS = /* @__PURE__ */ new Set([
      // Strings
      "SET",
      "GETSET",
      "MSET",
      "SETNX",
      "SETEX",
      "PSETEX",
      "INCR",
      "INCRBY",
      "DECR",
      "DECRBY",
      "APPEND",
      // Keys
      "DEL",
      "EXPIRE",
      "EXPIREAT",
      "PEXPIRE",
      "PERSIST",
      "RENAME",
      "RENAMENX",
      "COPY",
      "UNLINK",
      // Lists
      "LPUSH",
      "RPUSH",
      "LPUSHX",
      "RPUSHX",
      "LPOP",
      "RPOP",
      "LSET",
      "LINSERT",
      "LTRIM",
      "LREM",
      "LMOVE",
      "RPOPLPUSH",
      // Hashes
      "HSET",
      "HMSET",
      "HDEL",
      "HINCRBY",
      "HINCRBYFLOAT",
      "HSETNX",
      // Sets
      "SADD",
      "SREM",
      "SUNIONSTORE",
      "SINTERSTORE",
      "SDIFFSTORE",
      "SMOVE",
      // Sorted sets
      "ZADD",
      "ZREM",
      "ZINCRBY",
      "ZPOPMIN",
      "ZPOPMAX",
      "ZDIFFSTORE",
      "ZUNIONSTORE",
      "ZINTERSTORE",
      // Server-wide flush
      "FLUSHDB",
      "FLUSHALL"
    ]);
    AOF_STREAM_MUTATING_COMMANDS = /* @__PURE__ */ new Set([
      "XADD",
      "XDEL",
      "XTRIM",
      "XGROUP",
      "XACK",
      "XREADGROUP",
      "XCLAIM",
      "XAUTOCLAIM",
      "XSETID"
    ]);
    isAofMutation = (command) => AOF_MUTATING_COMMANDS.has(command) || AOF_STREAM_MUTATING_COMMANDS.has(command);
    RedisStore = class _RedisStore extends EventEmitter {
      // evict 10% of keys per cycle
      constructor(instanceId, instanceName, persistence) {
        super();
        this.persistence = persistence;
        this.instanceId = instanceId;
        this.instanceName = instanceName;
        this.MAX_KEYS_BEFORE_EVICT = Number(
          process.env["MAX_KEYS_PER_STORE"] ?? 5e6
        );
      }
      persistence;
      data = /* @__PURE__ */ new Map();
      pubSubClients = /* @__PURE__ */ new Set();
      timers = /* @__PURE__ */ new Map();
      instanceId;
      instanceName;
      commandsProcessed = 0;
      startedAt = Date.now();
      lastSavedAt = null;
      dirty = false;
      flushTimer = null;
      flushStartupTimer = null;
      persistInFlight = null;
      persistKey = "__snapshot__";
      currentSnapshotKey = null;
      previousSnapshotKey = null;
      // Each instance's durability snapshot is a single fabric object addressed by
      // (ownerId=instanceId, pocket="redis-store", name=persistKey). All Redis
      // persistence flows through the fabric — no direct PocketDimension writes.
      persistPocket = "redis-store";
      scriptCache = /* @__PURE__ */ new Map();
      // ── Append-only log (AOF) ────────────────────────────────────────────────────
      // Every mutating command is appended here in memory and flushed to a single
      // fabric object (pocket="redis-store", name=persistAofKey) on a fast 1 s timer.
      // This shrinks the durability window from one snapshot interval (5 s) to ~1 s:
      // writes made after the last snapshot are replayed from the AOF on boot.
      // The log only ever holds records newer than the last snapshot — doPersist()
      // prunes folded records — so it stays small and bounded.
      persistAofKey = "__aof__";
      aofLog = [];
      aofSeq = 0;
      aofBaselineSeq = 0;
      aofDirty = false;
      aofTimer = null;
      aofFlushInFlight = null;
      embeddedAofSink;
      embeddedDurableSeq = 0;
      embeddedCommitTail = Promise.resolve();
      embeddedCommandTail = Promise.resolve();
      embeddedCommandDepth = 0;
      embeddedDurabilityFailure = null;
      // ── ZSet member index — O(1) member lookup ───────────────────────────────────
      // Maps Redis key → (member string → ZSetMember object).  Kept in sync with
      // `data` so that cmdZAdd no longer needs to scan the entire members array on
      // every insert (which was O(n²) at 114 K entries × 500 inserts/tick).
      zsetIndex = /* @__PURE__ */ new Map();
      // ── LRU eviction ────────────────────────────────────────────────────────────
      // Tracks last-access time (seconds) for each key.  When the key count
      // exceeds MAX_KEYS_BEFORE_EVICT, evictLRU() removes the coldest entries to
      // keep memory bounded regardless of how long the server runs.
      _accessSec = /* @__PURE__ */ new Map();
      MAX_KEYS_BEFORE_EVICT;
      EVICT_BATCH_RATIO = 0.1;
      getPersistence() {
        if (!this.persistence) throw new Error("PDIM fabric persistence was not supplied by the owner");
        return this.persistence;
      }
      // Embedded owner supplies the durability boundary. Reuse the canonical
      // command engine without booting a second fabric/database or losing sessions.
      embedded = false;
      attachEmbeddedSnapshot(entries, options = {}) {
        const baseline = options.baselineSequence ?? 0;
        if (!Number.isSafeInteger(baseline) || baseline < 0) {
          throw new Error("Invalid embedded Redis AOF baseline");
        }
        this.embedded = true;
        this.data = entries;
        this.embeddedAofSink = options.appendAof;
        this.embeddedDurabilityFailure = null;
        this.embeddedCommitTail = Promise.resolve();
        this.embeddedCommandTail = Promise.resolve();
        this.embeddedCommandDepth = 0;
        this.aofBaselineSeq = baseline;
        this.aofSeq = baseline;
        this.aofLog = [];
        this.embeddedDurableSeq = baseline;
        for (const record of options.recoveryRecords ?? []) {
          if (!Number.isSafeInteger(record.s) || record.s !== this.aofSeq + 1 || typeof record.c !== "string" || !Array.isArray(record.a) || !record.a.every((arg) => typeof arg === "string")) {
            throw new Error("Invalid or discontinuous embedded Redis AOF record");
          }
          this.applyAofRecord(record);
          this.aofLog.push(record);
          this.aofSeq = record.s;
        }
        this.embeddedDurableSeq = this.aofSeq;
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
        this.zsetIndex.clear();
        for (const [key, entry] of entries) {
          if (entry.type === "zset") {
            this.zsetIndex.set(key, new Map(entry.value.map((member) => [member.member, member])));
          }
          const expiresAt = entry.expiresAt;
          if (typeof expiresAt === "number") {
            const remaining = expiresAt - Date.now();
            if (remaining <= 0) {
              this.data.delete(key);
              this.zsetIndex.delete(key);
            } else {
              this.scheduleExpiry(key, remaining);
            }
          }
        }
      }
      getEmbeddedAofSequence() {
        return this.aofSeq;
      }
      async captureEmbeddedCheckpoint(capture2) {
        return this.runEmbeddedCommand(async () => {
          await this.commitEmbeddedAof();
          return capture2(this.aofSeq);
        });
      }
      compactEmbeddedAof(baseline) {
        if (!this.embedded || !Number.isSafeInteger(baseline) || baseline < this.aofBaselineSeq || baseline > this.embeddedDurableSeq) {
          throw new Error("Invalid embedded Redis AOF compaction baseline");
        }
        this.aofBaselineSeq = baseline;
        this.aofLog = this.aofLog.filter((record) => record.s > baseline);
      }
      closeEmbedded() {
        this.closePubSubClients();
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
      }
      /** Atomic publication of a durably committed embedded capsule transaction. */
      publishEmbeddedStrings(changes) {
        if (!this.embedded) throw new Error("Capsule publication requires the embedded owner");
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) this.data.delete(key);
          else this.data.set(key, { type: "string", value });
        }
      }
      // ── LRU helpers ──────────────────────────────────────────────────────────────
      /** Record that a key was accessed right now. */
      touch(key) {
        this._accessSec.set(key, Math.floor(Date.now() / 1e3));
      }
      /** Remove the access record when a key is deleted. */
      untouch(key) {
        this._accessSec.delete(key);
      }
      /**
       * Evict the N least-recently-used keys.
       * Returns the number of keys actually removed.
       * Called automatically when data.size exceeds MAX_KEYS_BEFORE_EVICT.
       */
      evictLRU(count) {
        if (this.data.size === 0 || count <= 0) return 0;
        const candidates = [];
        for (const [key, entry] of this.data) {
          if (key.startsWith("__")) continue;
          if (entry.type === "string" && entry.expiresAt !== void 0) continue;
          const acc = this._accessSec.get(key) ?? 0;
          candidates.push([key, acc]);
        }
        candidates.sort((a, b) => a[1] - b[1]);
        let evicted = 0;
        for (const [key] of candidates) {
          if (evicted >= count) break;
          const timer = this.timers.get(key);
          if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
          }
          this.data.delete(key);
          this.zsetIndex.delete(key);
          this.untouch(key);
          this.recordAof("__DELETE", [key]);
          evicted++;
        }
        if (evicted > 0) {
          this.dirty = true;
          if (this.snapshotInProgress) this.snapshotTorn = true;
        }
        return evicted;
      }
      /** Trigger auto-eviction if the key count is over the configured threshold. */
      maybeEvict() {
        if (this.data.size <= this.MAX_KEYS_BEFORE_EVICT) return;
        const excess = this.data.size - this.MAX_KEYS_BEFORE_EVICT;
        const batch = Math.max(
          excess,
          Math.floor(this.data.size * this.EVICT_BATCH_RATIO)
        );
        const evicted = this.evictLRU(batch);
        if (evicted > 0) {
          console.warn(
            `[RedisStore:${this.instanceName}] LRU evicted ${evicted} cold keys (store was at ${this.data.size + evicted} keys)`
          );
        }
      }
      // ============================================================================
      // LIFECYCLE
      // ============================================================================
      async load(newInstance = false) {
        const fabricStorage = this.getPersistence();
        try {
          const manifestBuffer = await fabricStorage.getNamedObject(
            this.instanceId,
            this.persistPocket,
            "__recovery_manifest__"
          );
          if (!manifestBuffer && !newInstance) throw new Error("Existing instance has no recovery manifest");
          if (!manifestBuffer && newInstance) {
            this.dirty = true;
            await this.persist();
            if (this.dirty) throw new Error("Could not establish initial durable generation");
          }
          const manifest = this.decodeRecovery(manifestBuffer ?? await fabricStorage.getNamedObject(
            this.instanceId,
            this.persistPocket,
            "__recovery_manifest__"
          ));
          const buf = await fabricStorage.getNamedObject(
            this.instanceId,
            this.persistPocket,
            manifest.snapshotKey
          );
          if (!buf || createHash("sha256").update(buf).digest("hex") !== manifest.snapshotSha256) {
            throw new Error("Recovery manifest snapshot missing or corrupt");
          }
          const snapshot = this.decodeRecovery(buf);
          if (snapshot.baselineSeq !== manifest.baselineSeq || snapshot.version !== 1 || !Number.isSafeInteger(snapshot.baselineSeq) || !snapshot.entries || typeof snapshot.entries !== "object" || Array.isArray(snapshot.entries)) {
            throw new Error("Invalid recovery generation");
          }
          this.currentSnapshotKey = manifest.snapshotKey;
          this.previousSnapshotKey = manifest.previousSnapshotKey ?? null;
          const now = Date.now();
          for (const [key, entry] of Object.entries(snapshot.entries)) {
            if (!entry || !["string", "list", "hash", "set", "zset", "stream"].includes(entry.type) || entry.expiresAt !== void 0 && !Number.isFinite(entry.expiresAt)) {
              throw new Error("Invalid snapshot entry");
            }
            if (entry.expiresAt && entry.expiresAt <= now) continue;
            if (entry.type === "set") {
              this.data.set(key, { ...entry, value: entry.value });
            } else {
              this.data.set(key, entry);
            }
            if (entry.type === "zset") {
              const zMembers = entry.value;
              this.zsetIndex.set(key, new Map(zMembers.map((m) => [m.member, m])));
            }
            if (entry.expiresAt) {
              this.scheduleExpiry(key, entry.expiresAt - now);
            }
          }
          this.lastSavedAt = snapshot.savedAt;
          this.aofBaselineSeq = snapshot.baselineSeq ?? 0;
          this.aofSeq = this.aofBaselineSeq;
        } catch (cause) {
          for (const timer of this.timers.values()) clearTimeout(timer);
          this.data.clear();
          this.zsetIndex.clear();
          throw new Error("PDIM snapshot recovery failed; instance unavailable", { cause });
        }
        try {
          await this.replayAof();
        } catch (cause) {
          for (const timer of this.timers.values()) clearTimeout(timer);
          this.data.clear();
          this.zsetIndex.clear();
          throw new Error("PDIM AOF recovery failed; instance unavailable", { cause });
        }
        const jitter = Math.random() * 5e3;
        this.flushStartupTimer = setTimeout(() => {
          this.flushTimer = setInterval(() => {
            if (this.dirty) void this.persist().catch((err) => console.error("PDIM snapshot failed", err));
          }, 5e3);
          this.flushTimer.unref();
        }, jitter);
        this.flushStartupTimer.unref();
        this.aofTimer = setInterval(() => {
          if (this.aofDirty) void this.flushAof().catch((err) => console.error("PDIM AOF failed", err));
        }, 1e3);
        this.aofTimer.unref();
      }
      // Load and replay the durable AOF after the snapshot has been applied.
      decodeRecovery(buffer) {
        const envelope = JSON.parse(buffer.toString("utf8"));
        if (envelope.format !== "pdim-checksummed-v2") {
          throw new Error("Legacy unverified recovery artifact requires explicit offline migration");
        }
        if (typeof envelope.payload !== "string" || createHash("sha256").update(envelope.payload).digest("hex") !== envelope.sha256) {
          throw new Error("Recovery artifact checksum mismatch");
        }
        return JSON.parse(envelope.payload);
      }
      encodeRecovery(buffer) {
        return Buffer.from(JSON.stringify({
          format: "pdim-checksummed-v2",
          payload: buffer.toString("utf8"),
          sha256: createHash("sha256").update(buffer).digest("hex")
        }));
      }
      applyAofRecord(record) {
        if (record.c === "__RESTORE_STREAMS") {
          const entries = JSON.parse(record.a[0]);
          for (const [key, value] of this.data) {
            if (value.type === "stream") {
              this.clearExpiry(key);
              this.data.delete(key);
            }
          }
          for (const [key, value] of Object.entries(entries)) {
            const entry = value;
            this.data.set(key, entry);
            const expiresAt = entry.expiresAt;
            if (typeof expiresAt === "number") this.scheduleExpiry(key, expiresAt - Date.now());
          }
          return;
        }
        if (record.c === "__DELETE") {
          const key = record.a[0];
          if (key === void 0) throw new Error("Invalid AOF delete record");
          this.clearExpiry(key);
          this.data.delete(key);
          this.zsetIndex.delete(key);
          this.untouch(key);
          return;
        }
        if (record.c === "__RESTORE_KEY") {
          const key = record.a[0];
          const serialized = record.a[1];
          if (key === void 0 || serialized === void 0) {
            throw new Error("Invalid AOF key-image record");
          }
          this.clearExpiry(key);
          this.zsetIndex.delete(key);
          const entry = JSON.parse(serialized);
          if (entry === null) {
            this.data.delete(key);
            return;
          }
          if (!entry || typeof entry !== "object" || !["string", "hash", "set", "zset", "list", "stream"].includes(entry.type)) {
            throw new Error("Invalid AOF key-image value");
          }
          this.data.set(key, entry);
          const expiresAt = entry.expiresAt;
          if (typeof expiresAt === "number") this.scheduleExpiry(key, expiresAt - Date.now());
          return;
        }
        this.dispatchSync(record.c, record.a);
      }
      async replayAof() {
        const fabricStorage = this.getPersistence();
        let log = null;
        try {
          const buf = await fabricStorage.getNamedObject(
            this.instanceId,
            this.persistPocket,
            this.persistAofKey
          );
          if (!buf) throw new Error("Recovery AOF missing");
          log = this.decodeRecovery(buf);
        } catch (cause) {
          throw new Error("Unreadable AOF", { cause });
        }
        if (log?.version !== 1 || !Array.isArray(log.records)) throw new Error("Invalid AOF format");
        if (!log.records.length) return;
        let replayed = 0;
        for (const rec of log.records) {
          if (!Number.isSafeInteger(rec.s) || typeof rec.c !== "string" || !Array.isArray(rec.a)) {
            throw new Error("Invalid AOF record");
          }
          if (rec.s <= this.aofBaselineSeq) continue;
          if (rec.s !== this.aofSeq + 1) throw new Error("AOF sequence discontinuity");
          this.applyAofRecord(rec);
          replayed++;
          if (rec.s > this.aofSeq) this.aofSeq = rec.s;
        }
        this.aofLog = log.records.filter((r) => r.s > this.aofBaselineSeq);
        if (replayed > 0) {
          this.dirty = true;
          console.log(
            `[RedisStore:${this.instanceName}] Replayed ${replayed} AOF record(s) past snapshot`
          );
        }
      }
      // Append a mutating command to the in-memory log. Fabric-backed instances
      // flush on their AOF timer; the embedded owner awaits its local fsync sink
      // before acknowledging the outer command.
      recordAof(c, args) {
        if (AOF_STREAM_MUTATING_COMMANDS.has(c)) {
          const streams = Object.fromEntries([...this.data].filter(([, value]) => value.type === "stream"));
          c = "__RESTORE_STREAMS";
          args = [JSON.stringify(streams)];
        } else if (c === "SETEX" || c === "PSETEX" || c === "EXPIRE" || c === "EXPIREAT" || c === "PEXPIRE" || c === "PERSIST" || c === "SET" && args.slice(2).some((arg) => ["EX", "PX", "EXAT", "PXAT"].includes(arg.toUpperCase()))) {
          const key = args[0];
          if (key === void 0) return;
          c = "__RESTORE_KEY";
          args = [key, JSON.stringify(this.data.get(key) ?? null)];
        } else if (c === "__DELETE") {
        } else if (c === "FLUSHDB" || c === "FLUSHALL") {
        }
        if (c !== "__RESTORE_STREAMS" && c !== "__RESTORE_KEY" && c !== "__DELETE" && !AOF_MUTATING_COMMANDS.has(c)) return;
        this.aofSeq++;
        this.aofLog.push({ s: this.aofSeq, c, a: args });
        this.aofDirty = true;
        if (this.snapshotInProgress) this.snapshotTorn = true;
      }
      runEmbeddedCommand(operation) {
        if (!this.embedded) return Promise.resolve().then(operation);
        const next = this.embeddedCommandTail.then(async () => {
          if (this.embeddedDurabilityFailure) throw this.embeddedDurabilityFailure;
          this.embeddedCommandDepth++;
          try {
            return await operation();
          } finally {
            this.embeddedCommandDepth--;
          }
        });
        this.embeddedCommandTail = next.then(() => {
        }, () => {
        });
        return next;
      }
      commitEmbeddedAof() {
        if (!this.embedded || !this.embeddedAofSink) return Promise.resolve();
        const operation = this.embeddedCommitTail.then(async () => {
          if (this.embeddedDurabilityFailure) throw this.embeddedDurabilityFailure;
          const records = this.aofLog.filter(
            (record) => record.s > this.embeddedDurableSeq
          );
          if (records.length === 0) return;
          try {
            let expected = this.embeddedDurableSeq + 1;
            for (const record of records) {
              if (record.s !== expected) {
                throw new Error(`Embedded Redis AOF sequence gap at ${expected}`);
              }
              expected++;
            }
            await this.embeddedAofSink(records);
          } catch (cause) {
            const failure = new Error(
              "Local PDIM durability failed; the owner is unavailable",
              { cause }
            );
            failure.code = "PDIM_DURABILITY_FAILURE";
            this.embeddedDurabilityFailure = failure;
            this.emit("durability-error", failure);
            throw failure;
          }
          this.embeddedDurableSeq = records.at(-1).s;
        });
        this.embeddedCommitTail = operation.then(() => {
        }, () => {
        });
        return operation;
      }
      // True while doPersist() is serializing entries across event-loop ticks.
      snapshotInProgress = false;
      // Set by recordAof() when a mutation lands mid-serialization.
      snapshotTorn = false;
      // Persist the current AOF tail to the fabric. Coalesces overlapping flushes
      // the same way persist() does.
      async flushAof() {
        if (this.aofFlushInFlight) return this.aofFlushInFlight;
        this.aofFlushInFlight = this.doFlushAof().finally(() => {
          this.aofFlushInFlight = null;
        });
        return this.aofFlushInFlight;
      }
      async doFlushAof() {
        const fabricStorage = this.getPersistence();
        const records = this.aofLog.slice();
        this.aofDirty = false;
        const parts = [];
        for (let i = 0; i < records.length; i++) {
          parts.push(JSON.stringify(records[i]));
          if ((i + 1) % AOF_YIELD_EVERY === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
        const body = Buffer.from(`{"version":1,"records":[${parts.join(",")}]}`);
        try {
          const policy = await fabricStorage.recommendedPolicy();
          await fabricStorage.putNamedObject(
            this.instanceId,
            this.persistPocket,
            this.persistAofKey,
            "application/json",
            this.encodeRecovery(body),
            { policy }
          );
        } catch (err) {
          this.aofDirty = true;
          console.error(
            `[RedisStore:${this.instanceName}] AOF flush failed \u2014 will retry:`,
            err
          );
        }
      }
      async close() {
        if (this.flushStartupTimer) clearTimeout(this.flushStartupTimer);
        if (this.flushTimer) clearInterval(this.flushTimer);
        if (this.aofTimer) clearInterval(this.aofTimer);
        for (const t of this.timers.values()) clearTimeout(t);
        if (this.aofDirty) await this.flushAof();
        if (this.dirty) await this.persist();
      }
      async persist() {
        if (this.persistInFlight) return this.persistInFlight;
        this.persistInFlight = this.doPersist().finally(() => {
          this.persistInFlight = null;
        });
        return this.persistInFlight;
      }
      /**
       * Serialize a single RedisEntry to a Buffer, yielding to the event loop
       * every ENTRY_INNER_YIELD_EVERY members for large collections.
       *
       * Key design choice — Buffer not string:
       * Building a 100 MB JavaScript string via repeated `s += …` creates a deep
       * V8 rope-string (ConsString) tree.  When that rope is eventually flattened
       * (e.g. at Buffer.from(s)) or iterated, V8 must copy ~100 MB, often
       * triggering a major GC pause.  Instead we build small batch strings
       * (~3 MB each), convert each batch to a Buffer immediately so the string is
       * GC-eligible right away, and concatenate the Buffers at the end with a
       * single C-level memcpy.  This keeps live string memory per yield slice
       * small and makes GC pressure proportional to the batch size, not the total.
       */
      async serializeEntryIncrementally(entry) {
        const Y = ENTRY_INNER_YIELD_EVERY;
        const tick = () => new Promise((r) => setImmediate(r));
        const expSuffix = entry.expiresAt !== void 0 ? `,"expiresAt":${entry.expiresAt}}` : "}";
        if (entry.type === "zset" && entry.value.length > Y) {
          const bufs = [Buffer.from('{"type":"zset","value":[', "utf8")];
          for (let start = 0; start < entry.value.length; start += Y) {
            const end = Math.min(start + Y, entry.value.length);
            const batch = [];
            for (let i = start; i < end; i++) {
              const m = entry.value[i];
              batch.push(
                `{"member":${JSON.stringify(m.member)},"score":${m.score}}`
              );
            }
            const chunk = (start > 0 ? "," : "") + batch.join(",");
            bufs.push(Buffer.from(chunk, "utf8"));
            await tick();
          }
          bufs.push(Buffer.from("]" + expSuffix, "utf8"));
          return Buffer.concat(bufs);
        }
        if (entry.type === "list" && entry.value.length > Y) {
          const bufs = [Buffer.from('{"type":"list","value":[', "utf8")];
          for (let start = 0; start < entry.value.length; start += Y) {
            const end = Math.min(start + Y, entry.value.length);
            const batch = [];
            for (let i = start; i < end; i++)
              batch.push(JSON.stringify(entry.value[i]));
            bufs.push(
              Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8")
            );
            await tick();
          }
          bufs.push(Buffer.from("]" + expSuffix, "utf8"));
          return Buffer.concat(bufs);
        }
        if (entry.type === "set" && entry.value.length > Y) {
          const bufs = [Buffer.from('{"type":"set","value":[', "utf8")];
          for (let start = 0; start < entry.value.length; start += Y) {
            const end = Math.min(start + Y, entry.value.length);
            const batch = [];
            for (let i = start; i < end; i++)
              batch.push(JSON.stringify(entry.value[i]));
            bufs.push(
              Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8")
            );
            await tick();
          }
          bufs.push(Buffer.from("]" + expSuffix, "utf8"));
          return Buffer.concat(bufs);
        }
        if (entry.type === "hash") {
          const keys = Object.keys(entry.value);
          if (keys.length > Y) {
            const bufs = [
              Buffer.from('{"type":"hash","value":{', "utf8")
            ];
            for (let start = 0; start < keys.length; start += Y) {
              const end = Math.min(start + Y, keys.length);
              const batch = [];
              for (let i = start; i < end; i++) {
                const k = keys[i];
                batch.push(
                  `${JSON.stringify(k)}:${JSON.stringify(entry.value[k])}`
                );
              }
              bufs.push(
                Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8")
              );
              await tick();
            }
            bufs.push(Buffer.from("}" + expSuffix, "utf8"));
            return Buffer.concat(bufs);
          }
        }
        return Buffer.from(JSON.stringify(entry), "utf8");
      }
      /**
       * Build the full entries payload incrementally, yielding after each key
       * and within large collection values.  Returns `{ parts, cutoffSeq }`.
       * `snapshotTorn` must be reset to false before calling; this helper does NOT
       * clear it — the caller inspects it afterward to decide whether to retry.
       */
      async buildSnapshotParts() {
        const cutoffSeq = this.aofSeq;
        const parts = [];
        for (const [key, entry] of this.data) {
          const keyBuf = Buffer.from(JSON.stringify(key) + ":", "utf8");
          const valBuf = await this.serializeEntryIncrementally(entry);
          parts.push(Buffer.concat([keyBuf, valBuf]));
          await new Promise((r) => setImmediate(r));
        }
        return { parts, cutoffSeq };
      }
      async doPersist() {
        const fabricStorage = this.getPersistence();
        const savedAt = Date.now();
        this.dirty = false;
        let body;
        let parts = [];
        let cutoffSeq = this.aofSeq;
        this.snapshotInProgress = true;
        this.snapshotTorn = false;
        try {
          ({ parts, cutoffSeq } = await this.buildSnapshotParts());
          if (this.snapshotTorn) {
            this.snapshotTorn = false;
            ({ parts, cutoffSeq } = await this.buildSnapshotParts());
            if (this.snapshotTorn) {
              this.dirty = true;
              return;
            }
          }
          const comma = Buffer.from(",", "utf8");
          const entriesBuf = Buffer.concat(
            parts.flatMap((p, i) => i > 0 ? [comma, p] : [p])
          );
          body = Buffer.concat([
            Buffer.from(`{"version":1,"savedAt":${savedAt},"entries":{`, "utf8"),
            entriesBuf,
            Buffer.from(`},"baselineSeq":${cutoffSeq}}`, "utf8")
          ]);
        } finally {
          this.snapshotInProgress = false;
        }
        try {
          const policy = await fabricStorage.recommendedPolicy();
          const generationKey = `${this.persistKey}:${randomUUID2()}`;
          const encoded = this.encodeRecovery(body);
          await fabricStorage.putNamedObject(
            this.instanceId,
            this.persistPocket,
            generationKey,
            "application/json",
            encoded,
            { policy }
          );
          await this.flushAof();
          if (this.aofDirty) throw new Error("Cannot commit snapshot with an unflushed AOF");
          await fabricStorage.putNamedObject(
            this.instanceId,
            this.persistPocket,
            "__recovery_manifest__",
            "application/json",
            this.encodeRecovery(Buffer.from(JSON.stringify({
              version: 1,
              snapshotKey: generationKey,
              baselineSeq: cutoffSeq,
              previousSnapshotKey: this.currentSnapshotKey,
              snapshotSha256: createHash("sha256").update(encoded).digest("hex")
            }))),
            { policy }
          );
          const retired = this.previousSnapshotKey;
          this.previousSnapshotKey = this.currentSnapshotKey;
          this.currentSnapshotKey = generationKey;
          if (retired) {
            await fabricStorage.deleteNamedObject(this.instanceId, this.persistPocket, retired).catch((err) => console.error("Retired PDIM generation cleanup pending", err));
          }
          this.lastSavedAt = savedAt;
          this.aofBaselineSeq = cutoffSeq;
          const before = this.aofLog.length;
          this.aofLog = this.aofLog.filter((r) => r.s > cutoffSeq);
          if (this.aofLog.length !== before) this.aofDirty = true;
        } catch (err) {
          this.dirty = true;
          console.error(
            `[RedisStore:${this.instanceName}] Persist failed \u2014 will retry:`,
            err
          );
        }
      }
      // ============================================================================
      // TTL HELPERS
      // ============================================================================
      scheduleExpiry(key, ms) {
        const existing = this.timers.get(key);
        if (existing) clearTimeout(existing);
        const t = setTimeout(
          () => {
            void this.runEmbeddedCommand(async () => {
              if (this.timers.get(key) !== t) return;
              const entry = this.data.get(key);
              if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt > Date.now()) return;
              this.data.delete(key);
              this.zsetIndex.delete(key);
              this.timers.delete(key);
              this.recordAof("__DELETE", [key]);
              this.dirty = true;
              this.emit("expired", key);
              await this.commitEmbeddedAof();
            }).catch((error) => {
              console.error(`[RedisStore:${this.instanceName}] Expiry durability failed:`, error);
            });
          },
          Math.max(ms, 1)
        );
        this.timers.set(key, t);
      }
      clearExpiry(key) {
        const t = this.timers.get(key);
        if (t) {
          clearTimeout(t);
          this.timers.delete(key);
        }
      }
      isExpired(key) {
        const entry = this.data.get(key);
        if (!entry) return true;
        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
          this.data.delete(key);
          this.clearExpiry(key);
          this.dirty = true;
          return true;
        }
        return false;
      }
      // ============================================================================
      // COMMAND DISPATCHER
      // ============================================================================
      // ── Synchronous inner dispatcher used by redis.call() inside Lua scripts.
      // EVAL/EVALSHA cannot be nested; all other commands are sync.
      subscribePubSub(channels, patterns, deliver, close) {
        const client = {
          channels: new Set(channels),
          patterns: new Set(patterns),
          deliver,
          close
        };
        this.pubSubClients.add(client);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          this.pubSubClients.delete(client);
        };
      }
      closePubSubClients() {
        for (const client of [...this.pubSubClients]) {
          this.pubSubClients.delete(client);
          try {
            client.close();
          } catch {
          }
        }
        this.emit("owner-close");
      }
      publishPubSub(channel, message) {
        let subscriberCount = 0;
        for (const client of [...this.pubSubClients]) {
          const matchesChannel = client.channels.has(channel);
          const matchingPatterns = [...client.patterns].filter(
            (pattern) => redisGlobMatches(pattern, channel)
          );
          if (!matchesChannel && matchingPatterns.length === 0) continue;
          subscriberCount++;
          try {
            if (matchesChannel) client.deliver({ type: "message", channel, message });
            for (const pattern of matchingPatterns) {
              client.deliver({ type: "pmessage", pattern, channel, message });
            }
          } catch {
            this.pubSubClients.delete(client);
            try {
              client.close();
            } catch {
            }
          }
        }
        return subscriberCount;
      }
      execSync(cmd, args) {
        this.commandsProcessed++;
        const c = cmd.toUpperCase();
        if (this.embedded && this.embeddedAofSink && this.embeddedCommandDepth === 0 && isAofMutation(c)) {
          throw new Error("Embedded Redis mutations require the asynchronous owner");
        }
        const result = this.dispatchSync(c, args);
        this.recordAof(c, args);
        if (isAofMutation(c) && result !== null && (!Array.isArray(result) || result.length > 0)) queueMicrotask(() => this.emit("mutation"));
        return result;
      }
      dispatchSync(c, args) {
        switch (c) {
          // Server
          case "PING":
            return this.cmdPing(args);
          case "PUBLISH":
            if (args.length !== 2) {
              throw new Error("ERR wrong number of arguments for 'publish' command");
            }
            return this.publishPubSub(args[0], args[1]);
          case "FLUSHDB":
            return this.cmdFlushDb();
          case "DBSIZE":
            return this.cmdDbSize();
          case "INFO":
            return this.cmdInfo();
          case "TIME": {
            if (args.length !== 0) {
              throw new Error("ERR wrong number of arguments for 'TIME' command");
            }
            const nowMs = Date.now();
            const seconds = Math.floor(nowMs / 1e3);
            const microseconds = nowMs % 1e3 * 1e3;
            return [String(seconds), String(microseconds)];
          }
          // Strings
          case "SET":
            return this.cmdSet(args);
          case "GET":
            return this.cmdGet(args);
          case "GETSET":
            return this.cmdGetSet(args);
          case "MGET":
            return this.cmdMGet(args);
          case "MSET":
            return this.cmdMSet(args);
          case "SETNX":
            return this.cmdSetNx(args);
          case "SETEX":
            return this.cmdSetEx(args);
          case "PSETEX":
            return this.cmdPSetEx(args);
          case "INCR":
            return this.cmdIncrBy(args[0], 1);
          case "INCRBY":
            return this.cmdIncrBy(args[0], Number(args[1]));
          case "DECR":
            return this.cmdIncrBy(args[0], -1);
          case "DECRBY":
            return this.cmdIncrBy(args[0], -Number(args[1]));
          case "APPEND":
            return this.cmdAppend(args);
          case "STRLEN":
            return this.cmdStrLen(args);
          case "GETRANGE":
            return this.cmdGetRange(args);
          // Keys
          case "DEL":
            return this.cmdDel(args);
          case "EXISTS":
            return this.cmdExists(args);
          case "EXPIRE":
            return this.cmdExpire(args, false);
          case "EXPIREAT":
            return this.cmdExpireAt(args);
          case "PEXPIRE":
            return this.cmdPExpire(args);
          case "TTL":
            return this.cmdTtl(args, false);
          case "PTTL":
            return this.cmdTtl(args, true);
          case "PERSIST":
            return this.cmdPersist(args);
          case "TYPE":
            return this.cmdType(args);
          case "RENAME":
            return this.cmdRename(args);
          case "RENAMENX":
            return this.cmdRenameNx(args);
          case "KEYS":
            return this.cmdKeys(args);
          case "SCAN":
            return this.cmdScan(args);
          case "RANDOMKEY":
            return this.cmdRandomKey();
          case "COPY":
            return this.cmdCopy(args);
          case "UNLINK":
            return this.cmdDel(args);
          // Lists
          case "LPUSH":
            return this.cmdLPush(args, true);
          case "RPUSH":
            return this.cmdLPush(args, false);
          case "LPUSHX":
            return this.cmdLPushX(args, true);
          case "RPUSHX":
            return this.cmdLPushX(args, false);
          case "LPOP":
            return this.cmdLPop(args, true);
          case "RPOP":
            return this.cmdLPop(args, false);
          case "LRANGE":
            return this.cmdLRange(args);
          case "LLEN":
            return this.cmdLLen(args);
          case "LINDEX":
            return this.cmdLIndex(args);
          case "LSET":
            return this.cmdLSet(args);
          case "LINSERT":
            return this.cmdLInsert(args);
          case "LTRIM":
            return this.cmdLTrim(args);
          case "LREM":
            return this.cmdLRem(args);
          case "LPOS":
            return this.cmdLPos(args);
          case "LMOVE":
            return this.cmdLMove(args);
          case "RPOPLPUSH":
            return this.cmdRPopLPush(args);
          // Hashes
          case "HSET":
            return this.cmdHSet(args);
          case "HMSET":
            return this.cmdHMSet(args);
          case "HGET":
            return this.cmdHGet(args);
          case "HMGET":
            return this.cmdHMGet(args);
          case "HGETALL":
            return this.cmdHGetAll(args);
          case "HDEL":
            return this.cmdHDel(args);
          case "HEXISTS":
            return this.cmdHExists(args);
          case "HKEYS":
            return this.cmdHKeys(args);
          case "HVALS":
            return this.cmdHVals(args);
          case "HLEN":
            return this.cmdHLen(args);
          case "HINCRBY":
            return this.cmdHIncrBy(args);
          case "HINCRBYFLOAT":
            return this.cmdHIncrByFloat(args);
          case "HSETNX":
            return this.cmdHSetNx(args);
          case "HSCAN":
            return this.cmdHScan(args);
          // Sets
          case "SADD":
            return this.cmdSAdd(args);
          case "SREM":
            return this.cmdSRem(args);
          case "SMEMBERS":
            return this.cmdSMembers(args);
          case "SCARD":
            return this.cmdSCard(args);
          case "SISMEMBER":
            return this.cmdSIsMember(args);
          case "SMISMEMBER":
            return this.cmdSMIsMember(args);
          case "SUNION":
            return this.cmdSUnion(args);
          case "SINTER":
            return this.cmdSInter(args);
          case "SDIFF":
            return this.cmdSDiff(args);
          case "SUNIONSTORE":
            return this.cmdSUnionStore(args);
          case "SINTERSTORE":
            return this.cmdSInterStore(args);
          case "SDIFFSTORE":
            return this.cmdSDiffStore(args);
          case "SRANDMEMBER":
            return this.cmdSRandMember(args);
          case "SMOVE":
            return this.cmdSMove(args);
          // Sorted Sets
          case "ZADD":
            return this.cmdZAdd(args);
          case "ZREM":
            return this.cmdZRem(args);
          case "ZSCORE":
            return this.cmdZScore(args);
          case "ZINCRBY":
            return this.cmdZIncrBy(args);
          case "ZCARD":
            return this.cmdZCard(args);
          case "ZCOUNT":
            return this.cmdZCount(args);
          case "ZLEXCOUNT":
            return this.cmdZLexCount(args);
          case "ZRANGE":
            return this.cmdZRange(args);
          case "ZRANGEBYSCORE":
            return this.cmdZRangeByScore(args, false);
          case "ZREVRANGEBYSCORE":
            return this.cmdZRangeByScore(args, true);
          case "ZRANGEBYLEX":
            return this.cmdZRangeByLex(args, false);
          case "ZREVRANGEBYLEX":
            return this.cmdZRangeByLex(args, true);
          case "ZREVRANGE":
            return this.cmdZRevRange(args);
          case "ZRANK":
            return this.cmdZRank(args, false);
          case "ZREVRANK":
            return this.cmdZRank(args, true);
          case "ZPOPMIN":
            return this.cmdZPop(args, false);
          case "ZPOPMAX":
            return this.cmdZPop(args, true);
          case "ZMSCORE":
            return this.cmdZMScore(args);
          case "ZRANDMEMBER":
            return this.cmdZRandMember(args);
          case "ZDIFFSTORE":
            return this.cmdZDiffStore(args);
          case "ZUNIONSTORE":
            return this.cmdZUnionStore(args);
          case "ZINTERSTORE":
            return this.cmdZInterStore(args);
          // Script cache (sync subset)
          case "SCRIPT":
            return this.cmdScript(args);
          // Streams
          case "XADD":
            return this.cmdXAdd(args);
          case "XTRIM":
            return this.cmdXTrim(args);
          case "XLEN":
            return this.cmdXLen(args);
          case "XRANGE":
            return this.cmdXRange(args, false);
          case "XREVRANGE":
            return this.cmdXRange(args, true);
          case "XREAD":
            return this.cmdXRead(args);
          case "XREADGROUP":
            return this.cmdXReadGroup(args);
          case "XDEL":
            return this.cmdXDel(args);
          case "XACK":
            return this.cmdXAck(args);
          case "XGROUP":
            return this.cmdXGroup(args);
          case "XCLAIM":
            return this.cmdXClaim(args);
          case "XAUTOCLAIM":
            return this.cmdXAutoClaim(args);
          case "XPENDING":
            return this.cmdXPending(args);
          case "XINFO":
            return this.cmdXInfo(args);
          // Misc extras BullMQ uses
          case "OBJECT":
            return this.cmdObject(args);
          case "WAIT":
            return 0;
          default:
            throw new Error(`ERR unknown command '${c}'`);
        }
      }
      async exec(cmd, args, signal) {
        const c = cmd.toUpperCase();
        if (c === "BLPOP" || c === "BRPOP" || c === "BZPOPMIN" || c === "BZPOPMAX") {
          const seconds = Number(args.at(-1));
          if (args.length < 2 || !Number.isFinite(seconds) || seconds < 0) {
            throw new Error("ERR invalid blocking pop timeout");
          }
          this.commandsProcessed++;
          const pop = c === "BLPOP" ? "LPOP" : c === "BRPOP" ? "RPOP" : c === "BZPOPMIN" ? "ZPOPMIN" : "ZPOPMAX";
          return this.waitForResult(
            (isActive) => this.runEmbeddedCommand(async () => {
              if (!isActive()) return null;
              for (const key of args.slice(0, -1)) {
                if (!isActive()) return null;
                this.touch(key);
                const value = this.dispatchSync(pop, [key]);
                if (value !== null && (!Array.isArray(value) || value.length > 0)) {
                  this.recordAof(pop, [key]);
                  queueMicrotask(() => this.emit("mutation"));
                  this.maybeEvict();
                  await this.commitEmbeddedAof();
                  return [key, ...Array.isArray(value) ? value : [value]];
                }
              }
              return null;
            }),
            seconds * 1e3,
            signal
          );
        }
        return this.runEmbeddedCommand(() => this.execNonBlocking(c, args));
      }
      async execNonBlocking(c, args) {
        this.commandsProcessed++;
        if (args[0] && c !== "__PDIM_MULTI_EXEC") this.touch(args[0]);
        let result;
        switch (c) {
          case "__PDIM_MULTI_EXEC":
            result = await this.execMulti(args);
            break;
          // Lua scripting (async — must go through exec, not dispatchSync)
          case "EVAL":
            result = await this.cmdEval(args);
            break;
          case "EVALSHA":
            result = await this.cmdEvalSha(args);
            break;
          default:
            result = this.dispatchSync(c, args);
            this.recordAof(c, args);
            if (isAofMutation(c)) queueMicrotask(() => this.emit("mutation"));
        }
        this.maybeEvict();
        await this.commitEmbeddedAof();
        return result;
      }
      async execMulti(args) {
        if (args.length !== 1) {
          throw new Error("ERR invalid PDIM transaction payload");
        }
        let parsed;
        try {
          parsed = JSON.parse(args[0]);
        } catch {
          throw new Error("ERR invalid PDIM transaction JSON");
        }
        if (!Array.isArray(parsed) || !parsed.every(
          (item) => Array.isArray(item) && item.length >= 1 && typeof item[0] === "string" && item.slice(1).every((value) => typeof value === "string")
        )) {
          throw new Error("ERR invalid PDIM transaction command list");
        }
        const forbidden = /* @__PURE__ */ new Set([
          "BLPOP",
          "BRPOP",
          "BZPOPMIN",
          "BZPOPMAX",
          "PUBLISH",
          "SUBSCRIBE",
          "UNSUBSCRIBE",
          "PSUBSCRIBE",
          "PUNSUBSCRIBE",
          "__PDIM_MULTI_EXEC"
        ]);
        const results = [];
        for (const queued of parsed) {
          const [rawCommand, ...commandArgs] = queued;
          const command = rawCommand.toUpperCase();
          try {
            if (forbidden.has(command)) {
              throw new Error(`ERR ${command} is not allowed inside a PDIM transaction`);
            }
            let value;
            if (command === "EVAL") value = await this.cmdEval(commandArgs);
            else if (command === "EVALSHA") value = await this.cmdEvalSha(commandArgs);
            else value = this.dispatchSync(command, commandArgs);
            if (command !== "EVAL" && command !== "EVALSHA") {
              this.recordAof(command, commandArgs);
              if (isAofMutation(command)) queueMicrotask(() => this.emit("mutation"));
            }
            results.push([null, value]);
          } catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            const code = error.code;
            results.push([{
              name: error.name,
              message: error.message,
              ...typeof code === "string" ? { code } : {}
            }, null]);
          }
        }
        return results;
      }
      waitForResult(read2, timeoutMs, signal) {
        if (signal?.aborted) {
          return Promise.reject(
            signal.reason instanceof Error ? signal.reason : new Error("PDIM blocking command aborted")
          );
        }
        return new Promise((resolve, reject) => {
          let timer;
          let settled = false;
          let checking = false;
          let rerunRequested = false;
          let timedOut = false;
          const cleanup = () => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            this.off("mutation", check3);
            this.off("owner-close", close);
            signal?.removeEventListener("abort", abort);
          };
          const close = () => {
            cleanup();
            reject(new Error("PDIM owner closed"));
          };
          const abort = () => {
            cleanup();
            reject(
              signal?.reason instanceof Error ? signal.reason : new Error("PDIM blocking command aborted")
            );
          };
          const performCheck = () => {
            if (settled) return;
            if (checking) {
              rerunRequested = true;
              return;
            }
            checking = true;
            void Promise.resolve().then(() => read2(() => !settled)).then((value) => {
              checking = false;
              if (settled) return;
              if (value !== null) {
                cleanup();
                resolve(value);
                return;
              }
              if (timedOut) {
                cleanup();
                resolve(null);
                return;
              }
              if (rerunRequested) {
                rerunRequested = false;
                performCheck();
              }
            }, (error) => {
              cleanup();
              reject(error);
            });
          };
          const check3 = () => performCheck();
          this.on("mutation", check3);
          this.once("owner-close", close);
          signal?.addEventListener("abort", abort, { once: true });
          if (timeoutMs > 0) {
            timer = setTimeout(() => {
              timedOut = true;
              if (!checking) {
                cleanup();
                resolve(null);
              }
            }, timeoutMs);
          }
          check3();
        });
      }
      // ============================================================================
      // SERVER COMMANDS
      // ============================================================================
      cmdPing(args) {
        return args[0] ?? "PONG";
      }
      cmdFlushDb() {
        for (const t of this.timers.values()) clearTimeout(t);
        this.timers.clear();
        this.data.clear();
        this.dirty = true;
        this.invalidateKeyCount();
        return "OK";
      }
      cmdDbSize() {
        let count = 0;
        for (const key of this.data.keys()) {
          if (!this.isExpired(key)) count++;
        }
        return count;
      }
      cmdInfo() {
        const stats = this.getStats();
        return [
          `# Server`,
          `instance_id:${stats.instanceId}`,
          `instance_name:${stats.instanceName}`,
          `uptime_in_seconds:${stats.uptimeSeconds}`,
          ``,
          `# Stats`,
          `total_commands_processed:${stats.totalCommandsProcessed}`,
          ``,
          `# Keyspace`,
          `keys:${stats.keyCount}`,
          `persistence:${stats.persistenceEnabled}`,
          `last_saved_at:${stats.lastSavedAt ?? "never"}`
        ].join("\r\n");
      }
      /** Debounce-cached key count — avoids an O(n) scan on every exec call. */
      _cachedKeyCount = null;
      _cachedKeyCountAt = 0;
      static KEY_COUNT_TTL_MS = 3e3;
      // recount at most once per 3 s
      /** Invalidate the cached key count whenever the data Map changes size. */
      invalidateKeyCount() {
        this._cachedKeyCount = null;
      }
      getStats() {
        const now = Date.now();
        if (this._cachedKeyCount === null || now - this._cachedKeyCountAt > _RedisStore.KEY_COUNT_TTL_MS) {
          let count2 = 0;
          for (const key of this.data.keys()) {
            if (!this.isExpired(key)) count2++;
          }
          this._cachedKeyCount = count2;
          this._cachedKeyCountAt = now;
        }
        const count = this._cachedKeyCount;
        return {
          instanceId: this.instanceId,
          instanceName: this.instanceName,
          keyCount: count,
          totalCommandsProcessed: this.commandsProcessed,
          uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1e3),
          createdAt: new Date(this.startedAt).toISOString(),
          lastSavedAt: this.lastSavedAt ? new Date(this.lastSavedAt).toISOString() : null,
          persistenceEnabled: true
        };
      }
      // ============================================================================
      // STRING COMMANDS
      // ============================================================================
      cmdSet(args) {
        const [key, value, ...opts] = args;
        if (!key || value === void 0)
          throw new Error("ERR wrong number of arguments for 'set'");
        const upper = opts.map((o) => o.toUpperCase());
        let expiresAt;
        let nx = false;
        let xx = false;
        let get = false;
        let keepttl = false;
        for (let i = 0; i < upper.length; i++) {
          const opt = upper[i];
          if (opt === "EX") {
            expiresAt = Date.now() + Number(opts[i + 1]) * 1e3;
            i++;
          } else if (opt === "PX") {
            expiresAt = Date.now() + Number(opts[i + 1]);
            i++;
          } else if (opt === "EXAT") {
            expiresAt = Number(opts[i + 1]) * 1e3;
            i++;
          } else if (opt === "PXAT") {
            expiresAt = Number(opts[i + 1]);
            i++;
          } else if (opt === "NX") nx = true;
          else if (opt === "XX") xx = true;
          else if (opt === "GET") get = true;
          else if (opt === "KEEPTTL") keepttl = true;
        }
        const existing = this.isExpired(key) ? null : this.data.get(key);
        const prevValue = existing?.type === "string" ? existing.value : null;
        if (nx && existing) return get ? prevValue : null;
        if (xx && !existing) return get ? null : null;
        const prevExpiry = keepttl ? existing?.expiresAt : void 0;
        const finalExpiry = keepttl ? prevExpiry : expiresAt;
        this.clearExpiry(key);
        this.data.set(key, { type: "string", value, expiresAt: finalExpiry });
        if (finalExpiry) this.scheduleExpiry(key, finalExpiry - Date.now());
        this.dirty = true;
        return get ? prevValue : "OK";
      }
      cmdGet(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'get'");
        if (this.isExpired(key)) return null;
        const entry = this.data.get(key);
        if (!entry) return null;
        if (entry.type !== "string")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value;
      }
      cmdGetSet(args) {
        const [key, value] = args;
        if (!key || value === void 0)
          throw new Error("ERR wrong number of arguments for 'getset'");
        const prev = this.cmdGet([key]);
        this.cmdSet([key, value]);
        return prev;
      }
      cmdMGet(args) {
        return args.map((k) => {
          try {
            return this.cmdGet([k]);
          } catch {
            return null;
          }
        });
      }
      cmdMSet(args) {
        if (args.length % 2 !== 0)
          throw new Error("ERR wrong number of arguments for 'mset'");
        for (let i = 0; i < args.length; i += 2) {
          this.cmdSet([args[i], args[i + 1]]);
        }
        return "OK";
      }
      cmdSetNx(args) {
        const [key, value] = args;
        if (!key || value === void 0)
          throw new Error("ERR wrong number of arguments for 'setnx'");
        if (!this.isExpired(key) && this.data.has(key)) return 0;
        this.cmdSet([key, value]);
        return 1;
      }
      cmdSetEx(args) {
        const [key, seconds, value] = args;
        if (!key || !seconds || value === void 0)
          throw new Error("ERR wrong number of arguments for 'setex'");
        return this.cmdSet([key, value, "EX", seconds]) ?? "OK";
      }
      cmdPSetEx(args) {
        const [key, ms, value] = args;
        if (!key || !ms || value === void 0)
          throw new Error("ERR wrong number of arguments for 'psetex'");
        return this.cmdSet([key, value, "PX", ms]) ?? "OK";
      }
      cmdIncrBy(key, by) {
        if (!key) throw new Error("ERR wrong number of arguments");
        if (Number.isNaN(by))
          throw new Error("ERR value is not an integer or out of range");
        if (this.isExpired(key) || !this.data.has(key)) {
          this.data.set(key, { type: "string", value: String(by) });
          this.dirty = true;
          return by;
        }
        const entry = this.data.get(key);
        if (entry.type !== "string")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const n = Number(entry.value);
        if (Number.isNaN(n) || !Number.isInteger(n))
          throw new Error("ERR value is not an integer or out of range");
        const next = n + by;
        entry.value = String(next);
        this.dirty = true;
        return next;
      }
      cmdAppend(args) {
        const [key, value] = args;
        if (!key || value === void 0)
          throw new Error("ERR wrong number of arguments for 'append'");
        if (this.isExpired(key) || !this.data.has(key)) {
          this.data.set(key, { type: "string", value });
          this.dirty = true;
          return value.length;
        }
        const entry = this.data.get(key);
        if (entry.type !== "string")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        entry.value += value;
        this.dirty = true;
        return entry.value.length;
      }
      cmdStrLen(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'strlen'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "string")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value.length;
      }
      cmdGetRange(args) {
        const [key, start, end] = args;
        if (!key || start === void 0 || end === void 0)
          throw new Error("ERR wrong number of arguments for 'getrange'");
        if (this.isExpired(key) || !this.data.has(key)) return "";
        const entry = this.data.get(key);
        if (entry.type !== "string")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const s = entry.value;
        const len = s.length;
        let i = Number(start);
        let j = Number(end);
        if (i < 0) i = Math.max(0, len + i);
        if (j < 0) j = len + j;
        j = Math.min(j, len - 1);
        if (i > j) return "";
        return s.slice(i, j + 1);
      }
      // ============================================================================
      // KEY COMMANDS
      // ============================================================================
      cmdDel(args) {
        let count = 0;
        for (const key of args) {
          if (!this.isExpired(key) && this.data.has(key)) {
            this.data.delete(key);
            this.clearExpiry(key);
            this.zsetIndex.delete(key);
            count++;
            this.dirty = true;
          }
        }
        return count;
      }
      cmdExists(args) {
        let count = 0;
        for (const key of args) {
          if (!this.isExpired(key) && this.data.has(key)) count++;
        }
        return count;
      }
      cmdExpire(args, useAt) {
        const [key, seconds] = args;
        if (!key || seconds === void 0)
          throw new Error("ERR wrong number of arguments for 'expire'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const ms = useAt ? Number(seconds) * 1e3 - Date.now() : Number(seconds) * 1e3;
        const expiresAt = Date.now() + ms;
        const entry = this.data.get(key);
        entry.expiresAt = expiresAt;
        this.scheduleExpiry(key, ms);
        this.dirty = true;
        return 1;
      }
      cmdPExpire(args) {
        const [key, ms] = args;
        if (!key || ms === void 0)
          throw new Error("ERR wrong number of arguments for 'pexpire'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const expiresAt = Date.now() + Number(ms);
        const entry = this.data.get(key);
        entry.expiresAt = expiresAt;
        this.scheduleExpiry(key, Number(ms));
        this.dirty = true;
        return 1;
      }
      cmdExpireAt(args) {
        const [key, unixTs] = args;
        if (!key || unixTs === void 0)
          throw new Error("ERR wrong number of arguments for 'expireat'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const expiresAt = Number(unixTs) * 1e3;
        const ms = expiresAt - Date.now();
        const entry = this.data.get(key);
        entry.expiresAt = expiresAt;
        this.scheduleExpiry(key, ms);
        this.dirty = true;
        return 1;
      }
      cmdTtl(args, precise) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'ttl'");
        if (this.isExpired(key) || !this.data.has(key)) return -2;
        const entry = this.data.get(key);
        if (!entry.expiresAt) return -1;
        const remaining = entry.expiresAt - Date.now();
        if (remaining <= 0) return -2;
        return precise ? remaining : Math.ceil(remaining / 1e3);
      }
      cmdPersist(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'persist'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (!entry.expiresAt) return 0;
        delete entry.expiresAt;
        this.clearExpiry(key);
        this.dirty = true;
        return 1;
      }
      cmdType(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'type'");
        if (this.isExpired(key) || !this.data.has(key)) return "none";
        return this.data.get(key).type;
      }
      cmdRename(args) {
        const [src, dst] = args;
        if (!src || !dst)
          throw new Error("ERR wrong number of arguments for 'rename'");
        if (this.isExpired(src) || !this.data.has(src))
          throw new Error("ERR no such key");
        const entry = this.data.get(src);
        this.data.delete(src);
        this.clearExpiry(src);
        this.data.set(dst, entry);
        if (entry.expiresAt) this.scheduleExpiry(dst, entry.expiresAt - Date.now());
        this.dirty = true;
        return "OK";
      }
      cmdRenameNx(args) {
        const [src, dst] = args;
        if (!src || !dst)
          throw new Error("ERR wrong number of arguments for 'renamenx'");
        if (this.isExpired(src) || !this.data.has(src))
          throw new Error("ERR no such key");
        if (!this.isExpired(dst) && this.data.has(dst)) return 0;
        this.cmdRename(args);
        return 1;
      }
      cmdKeys(args) {
        const pattern = args[0] ?? "*";
        const rx = globToRegex(pattern);
        const result = [];
        for (const key of this.data.keys()) {
          if (!this.isExpired(key) && rx.test(key)) result.push(key);
        }
        return result;
      }
      cmdScan(args) {
        const cursor = Number(args[0] ?? 0);
        let match = "*";
        let count = 10;
        for (let i = 1; i < args.length; i++) {
          const opt = args[i].toUpperCase();
          if (opt === "MATCH") {
            match = args[++i];
          } else if (opt === "COUNT") {
            count = Number(args[++i]);
          }
        }
        const rx = globToRegex(match);
        const allKeys = Array.from(this.data.keys()).filter(
          (k) => !this.isExpired(k) && rx.test(k)
        );
        if (allKeys.length === 0) return ["0", []];
        const start = cursor % allKeys.length;
        const page = allKeys.slice(start, start + count);
        const nextCursor = start + count >= allKeys.length ? 0 : start + count;
        return [String(nextCursor), page];
      }
      cmdRandomKey() {
        const keys = Array.from(this.data.keys()).filter((k) => !this.isExpired(k));
        if (keys.length === 0) return null;
        return keys[Math.floor(Math.random() * keys.length)];
      }
      cmdCopy(args) {
        const [src, dst] = args;
        if (!src || !dst)
          throw new Error("ERR wrong number of arguments for 'copy'");
        if (this.isExpired(src) || !this.data.has(src)) return 0;
        if (!this.isExpired(dst) && this.data.has(dst) && !args.includes("REPLACE"))
          return 0;
        const entry = this.data.get(src);
        const copy = JSON.parse(JSON.stringify(entry));
        this.data.set(dst, copy);
        if (copy.expiresAt) this.scheduleExpiry(dst, copy.expiresAt - Date.now());
        this.dirty = true;
        return 1;
      }
      // ============================================================================
      // LIST COMMANDS
      // ============================================================================
      getOrCreateList(key) {
        const entry = this.data.get(key);
        if (!entry) {
          const list = [];
          this.data.set(key, { type: "list", value: list });
          return list;
        }
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value;
      }
      cmdLPush(args, left) {
        const [key, ...elements] = args;
        if (!key || elements.length === 0)
          throw new Error("ERR wrong number of arguments for 'lpush'");
        if (this.isExpired(key)) this.data.delete(key);
        const list = this.getOrCreateList(key);
        if (left) {
          for (const el of elements) list.unshift(el);
        } else {
          list.push(...elements);
        }
        this.dirty = true;
        return list.length;
      }
      cmdLPushX(args, left) {
        const [key, ...elements] = args;
        if (!key || elements.length === 0)
          throw new Error("ERR wrong number of arguments for 'lpushx'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        return this.cmdLPush(args, left);
      }
      cmdLPop(args, left) {
        const [key, countStr] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'lpop'");
        if (this.isExpired(key) || !this.data.has(key)) return countStr ? [] : null;
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const count = countStr ? Number(countStr) : 1;
        const results = [];
        for (let i = 0; i < count; i++) {
          const el = left ? entry.value.shift() : entry.value.pop();
          if (el === void 0) break;
          results.push(el);
        }
        if (entry.value.length === 0) {
          this.data.delete(key);
          this.clearExpiry(key);
        }
        this.dirty = true;
        if (!countStr) return results[0] ?? null;
        return results;
      }
      cmdLRange(args) {
        const [key, start, stop] = args;
        if (!key || start === void 0 || stop === void 0)
          throw new Error("ERR wrong number of arguments for 'lrange'");
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const len = entry.value.length;
        let s = Number(start);
        let e = Number(stop);
        if (s < 0) s = Math.max(0, len + s);
        if (e < 0) e = len + e;
        e = Math.min(e, len - 1);
        if (s > e) return [];
        return entry.value.slice(s, e + 1);
      }
      cmdLLen(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'llen'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value.length;
      }
      cmdLIndex(args) {
        const [key, indexStr] = args;
        if (!key || indexStr === void 0)
          throw new Error("ERR wrong number of arguments for 'lindex'");
        if (this.isExpired(key) || !this.data.has(key)) return null;
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        let i = Number(indexStr);
        if (i < 0) i = entry.value.length + i;
        return entry.value[i] ?? null;
      }
      cmdLSet(args) {
        const [key, indexStr, value] = args;
        if (!key || indexStr === void 0 || value === void 0)
          throw new Error("ERR wrong number of arguments for 'lset'");
        if (this.isExpired(key) || !this.data.has(key))
          throw new Error("ERR no such key");
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        let i = Number(indexStr);
        if (i < 0) i = entry.value.length + i;
        if (i < 0 || i >= entry.value.length)
          throw new Error("ERR index out of range");
        entry.value[i] = value;
        this.dirty = true;
        return "OK";
      }
      cmdLInsert(args) {
        const [key, where, pivot, value] = args;
        if (!key || !where || !pivot || value === void 0)
          throw new Error("ERR wrong number of arguments for 'linsert'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const idx = entry.value.indexOf(pivot);
        if (idx === -1) return -1;
        const pos = where.toUpperCase() === "AFTER" ? idx + 1 : idx;
        entry.value.splice(pos, 0, value);
        this.dirty = true;
        return entry.value.length;
      }
      cmdLTrim(args) {
        const [key, start, stop] = args;
        if (!key || start === void 0 || stop === void 0)
          throw new Error("ERR wrong number of arguments for 'ltrim'");
        if (this.isExpired(key) || !this.data.has(key)) return "OK";
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const len = entry.value.length;
        let s = Number(start);
        let e = Number(stop);
        if (s < 0) s = Math.max(0, len + s);
        if (e < 0) e = len + e;
        entry.value = entry.value.slice(s, e + 1);
        if (entry.value.length === 0) {
          this.data.delete(key);
          this.clearExpiry(key);
        }
        this.dirty = true;
        return "OK";
      }
      cmdLRem(args) {
        const [key, countStr, value] = args;
        if (!key || countStr === void 0 || value === void 0)
          throw new Error("ERR wrong number of arguments for 'lrem'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const count = Number(countStr);
        let removed = 0;
        if (count > 0) {
          for (let i = 0; i < entry.value.length && removed < count; ) {
            if (entry.value[i] === value) {
              entry.value.splice(i, 1);
              removed++;
            } else i++;
          }
        } else if (count < 0) {
          const abs = Math.abs(count);
          for (let i = entry.value.length - 1; i >= 0 && removed < abs; i--) {
            if (entry.value[i] === value) {
              entry.value.splice(i, 1);
              removed++;
            }
          }
        } else {
          for (let i = 0; i < entry.value.length; ) {
            if (entry.value[i] === value) {
              entry.value.splice(i, 1);
              removed++;
            } else i++;
          }
        }
        this.dirty = true;
        return removed;
      }
      cmdLPos(args) {
        const [key, element] = args;
        if (!key || element === void 0)
          throw new Error("ERR wrong number of arguments for 'lpos'");
        if (this.isExpired(key) || !this.data.has(key)) return null;
        const entry = this.data.get(key);
        if (entry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const idx = entry.value.indexOf(element);
        return idx === -1 ? null : idx;
      }
      cmdLMove(args) {
        const [src, dst, srcDir, dstDir] = args;
        if (!src || !dst || !srcDir || !dstDir)
          throw new Error("ERR wrong number of arguments for 'lmove'");
        if (this.isExpired(src) || !this.data.has(src)) return null;
        const srcEntry = this.data.get(src);
        if (srcEntry.type !== "list")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const el = srcDir.toUpperCase() === "LEFT" ? srcEntry.value.shift() : srcEntry.value.pop();
        if (el === void 0) return null;
        if (srcEntry.value.length === 0) {
          this.data.delete(src);
          this.clearExpiry(src);
        }
        if (this.isExpired(dst)) this.data.delete(dst);
        const dstEntry = this.getOrCreateList(dst);
        if (dstDir.toUpperCase() === "LEFT") dstEntry.unshift(el);
        else dstEntry.push(el);
        this.dirty = true;
        return el;
      }
      // ============================================================================
      // HASH COMMANDS
      // ============================================================================
      getOrCreateHash(key) {
        const entry = this.data.get(key);
        if (!entry) {
          const hash2 = {};
          this.data.set(key, { type: "hash", value: hash2 });
          return hash2;
        }
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value;
      }
      cmdHSet(args) {
        const [key, ...pairs] = args;
        if (!key || pairs.length === 0 || pairs.length % 2 !== 0)
          throw new Error("ERR wrong number of arguments for 'hset'");
        if (this.isExpired(key)) this.data.delete(key);
        const hash2 = this.getOrCreateHash(key);
        let added = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          if (!(pairs[i] in hash2)) added++;
          hash2[pairs[i]] = pairs[i + 1];
        }
        this.dirty = true;
        return added;
      }
      cmdHMSet(args) {
        this.cmdHSet(args);
        return "OK";
      }
      cmdHGet(args) {
        const [key, field] = args;
        if (!key || field === void 0)
          throw new Error("ERR wrong number of arguments for 'hget'");
        if (this.isExpired(key) || !this.data.has(key)) return null;
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value[field] ?? null;
      }
      cmdHMGet(args) {
        const [key, ...fields] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'hmget'");
        if (this.isExpired(key) || !this.data.has(key))
          return fields.map(() => null);
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return fields.map((f) => entry.value[f] ?? null);
      }
      cmdHGetAll(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'hgetall'");
        if (this.isExpired(key) || !this.data.has(key)) return {};
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return { ...entry.value };
      }
      cmdHDel(args) {
        const [key, ...fields] = args;
        if (!key || fields.length === 0)
          throw new Error("ERR wrong number of arguments for 'hdel'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        let deleted = 0;
        for (const f of fields) {
          if (f in entry.value) {
            delete entry.value[f];
            deleted++;
          }
        }
        if (Object.keys(entry.value).length === 0) {
          this.data.delete(key);
          this.clearExpiry(key);
        }
        this.dirty = true;
        return deleted;
      }
      cmdHExists(args) {
        const [key, field] = args;
        if (!key || field === void 0)
          throw new Error("ERR wrong number of arguments for 'hexists'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return field in entry.value ? 1 : 0;
      }
      cmdHKeys(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'hkeys'");
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return Object.keys(entry.value);
      }
      cmdHVals(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'hvals'");
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return Object.values(entry.value);
      }
      cmdHLen(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'hlen'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return Object.keys(entry.value).length;
      }
      cmdHIncrBy(args) {
        const [key, field, by] = args;
        if (!key || field === void 0 || by === void 0)
          throw new Error("ERR wrong number of arguments for 'hincrby'");
        if (this.isExpired(key)) this.data.delete(key);
        const hash2 = this.getOrCreateHash(key);
        const n = Number(hash2[field] ?? 0);
        if (Number.isNaN(n)) throw new Error("ERR hash value is not an integer");
        const next = n + Number(by);
        hash2[field] = String(next);
        this.dirty = true;
        return next;
      }
      cmdHIncrByFloat(args) {
        const [key, field, by] = args;
        if (!key || field === void 0 || by === void 0)
          throw new Error("ERR wrong number of arguments for 'hincrbyfloat'");
        if (this.isExpired(key)) this.data.delete(key);
        const hash2 = this.getOrCreateHash(key);
        const n = parseFloat(hash2[field] ?? "0");
        if (Number.isNaN(n)) throw new Error("ERR hash value is not a float");
        const next = n + parseFloat(by);
        hash2[field] = String(next);
        this.dirty = true;
        return String(next);
      }
      cmdHSetNx(args) {
        const [key, field, value] = args;
        if (!key || field === void 0 || value === void 0)
          throw new Error("ERR wrong number of arguments for 'hsetnx'");
        if (this.isExpired(key)) this.data.delete(key);
        const hash2 = this.getOrCreateHash(key);
        if (field in hash2) return 0;
        hash2[field] = value;
        this.dirty = true;
        return 1;
      }
      cmdHScan(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'hscan'");
        if (this.isExpired(key) || !this.data.has(key)) return ["0", []];
        const entry = this.data.get(key);
        if (entry.type !== "hash")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const flat = [];
        for (const [f, v] of Object.entries(entry.value)) flat.push(f, v);
        return ["0", flat];
      }
      // ============================================================================
      // SET COMMANDS
      // ============================================================================
      getOrCreateSet(key) {
        const entry = this.data.get(key);
        if (!entry) {
          const s = [];
          this.data.set(key, { type: "set", value: s });
          return s;
        }
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value;
      }
      cmdSAdd(args) {
        const [key, ...members] = args;
        if (!key || members.length === 0)
          throw new Error("ERR wrong number of arguments for 'sadd'");
        if (this.isExpired(key)) this.data.delete(key);
        const s = this.getOrCreateSet(key);
        let added = 0;
        for (const m of members) {
          if (!s.includes(m)) {
            s.push(m);
            added++;
          }
        }
        this.dirty = true;
        return added;
      }
      cmdSRem(args) {
        const [key, ...members] = args;
        if (!key || members.length === 0)
          throw new Error("ERR wrong number of arguments for 'srem'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        let removed = 0;
        for (const m of members) {
          const idx = entry.value.indexOf(m);
          if (idx !== -1) {
            entry.value.splice(idx, 1);
            removed++;
          }
        }
        if (entry.value.length === 0) {
          this.data.delete(key);
          this.clearExpiry(key);
        }
        this.dirty = true;
        return removed;
      }
      cmdSMembers(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'smembers'");
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return [...entry.value];
      }
      cmdSCard(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'scard'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value.length;
      }
      cmdSIsMember(args) {
        const [key, member] = args;
        if (!key || member === void 0)
          throw new Error("ERR wrong number of arguments for 'sismember'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value.includes(member) ? 1 : 0;
      }
      cmdSMIsMember(args) {
        const [key, ...members] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'smismember'");
        if (this.isExpired(key) || !this.data.has(key)) return members.map(() => 0);
        const entry = this.data.get(key);
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return members.map((m) => entry.value.includes(m) ? 1 : 0);
      }
      resolveSet(key) {
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return [...entry.value];
      }
      cmdSUnion(args) {
        const result = /* @__PURE__ */ new Set();
        for (const key of args) for (const m of this.resolveSet(key)) result.add(m);
        return [...result];
      }
      cmdSInter(args) {
        if (args.length === 0) return [];
        let result = new Set(this.resolveSet(args[0]));
        for (let i = 1; i < args.length; i++) {
          const s = new Set(this.resolveSet(args[i]));
          for (const m of result) if (!s.has(m)) result.delete(m);
        }
        return [...result];
      }
      cmdSDiff(args) {
        if (args.length === 0) return [];
        const result = new Set(this.resolveSet(args[0]));
        for (let i = 1; i < args.length; i++) {
          const s = new Set(this.resolveSet(args[i]));
          for (const m of s) result.delete(m);
        }
        return [...result];
      }
      cmdSUnionStore(args) {
        const [dst, ...keys] = args;
        if (!dst)
          throw new Error("ERR wrong number of arguments for 'sunionstore'");
        const members = this.cmdSUnion(keys);
        this.data.set(dst, { type: "set", value: members });
        this.dirty = true;
        return members.length;
      }
      cmdSInterStore(args) {
        const [dst, ...keys] = args;
        if (!dst)
          throw new Error("ERR wrong number of arguments for 'sinterstore'");
        const members = this.cmdSInter(keys);
        this.data.set(dst, { type: "set", value: members });
        this.dirty = true;
        return members.length;
      }
      cmdSDiffStore(args) {
        const [dst, ...keys] = args;
        if (!dst) throw new Error("ERR wrong number of arguments for 'sdiffstore'");
        const members = this.cmdSDiff(keys);
        this.data.set(dst, { type: "set", value: members });
        this.dirty = true;
        return members.length;
      }
      cmdSRandMember(args) {
        const [key, countStr] = args;
        if (!key)
          throw new Error("ERR wrong number of arguments for 'srandmember'");
        const members = this.resolveSet(key);
        if (!countStr)
          return members[Math.floor(Math.random() * members.length)] ?? null;
        const count = Number(countStr);
        if (count >= 0) {
          const copy = [...members];
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          return copy.slice(0, Math.min(count, copy.length));
        }
        const result = [];
        const abs = Math.abs(count);
        for (let i = 0; i < abs; i++)
          result.push(members[Math.floor(Math.random() * members.length)]);
        return result;
      }
      cmdSMove(args) {
        const [src, dst, member] = args;
        if (!src || !dst || member === void 0)
          throw new Error("ERR wrong number of arguments for 'smove'");
        if (this.isExpired(src) || !this.data.has(src)) return 0;
        const srcEntry = this.data.get(src);
        if (srcEntry.type !== "set")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const idx = srcEntry.value.indexOf(member);
        if (idx === -1) return 0;
        srcEntry.value.splice(idx, 1);
        if (srcEntry.value.length === 0) {
          this.data.delete(src);
          this.clearExpiry(src);
        }
        if (this.isExpired(dst)) this.data.delete(dst);
        const dstSet = this.getOrCreateSet(dst);
        if (!dstSet.includes(member)) dstSet.push(member);
        this.dirty = true;
        return 1;
      }
      // ============================================================================
      // SORTED SET HELPERS
      // ============================================================================
      resolveZSet(key) {
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "zset")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value;
      }
      getOrCreateZSet(key) {
        if (this.isExpired(key) || !this.data.has(key)) {
          const members = [];
          this.data.set(key, { type: "zset", value: members });
          this.zsetIndex.set(key, /* @__PURE__ */ new Map());
          return members;
        }
        const entry = this.data.get(key);
        if (entry.type !== "zset")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value;
      }
      zsetSort(members) {
        members.sort(
          (a, b) => a.score !== b.score ? a.score - b.score : a.member < b.member ? -1 : a.member > b.member ? 1 : 0
        );
      }
      /**
       * Return (or lazily build) the per-key member-index for a sorted set.
       * The index maps member-string → ZSetMember object for O(1) lookups,
       * replacing the previous O(n) Array.find() in every ZSet mutating command.
       */
      getZSetIndex(key) {
        let idx = this.zsetIndex.get(key);
        if (!idx) {
          idx = /* @__PURE__ */ new Map();
          const entry = this.data.get(key);
          if (entry?.type === "zset") {
            for (const m of entry.value) idx.set(m.member, m);
          }
          this.zsetIndex.set(key, idx);
        }
        return idx;
      }
      parseScoreBound(s) {
        if (s === "+inf" || s === "+Inf")
          return { value: Infinity, exclusive: false };
        if (s === "-inf" || s === "-Inf")
          return { value: -Infinity, exclusive: false };
        if (s.startsWith("("))
          return { value: parseFloat(s.slice(1)), exclusive: true };
        return { value: parseFloat(s), exclusive: false };
      }
      // ============================================================================
      // SORTED SET COMMANDS
      // ============================================================================
      cmdZAdd(args) {
        const [key, ...rest] = args;
        if (!key || rest.length < 2)
          throw new Error("ERR wrong number of arguments for 'zadd'");
        let nx = false, xx = false, gt = false, lt = false, ch = false, incr = false;
        let i = 0;
        while (i < rest.length) {
          const opt = rest[i].toUpperCase();
          if (opt === "NX") {
            nx = true;
            i++;
          } else if (opt === "XX") {
            xx = true;
            i++;
          } else if (opt === "GT") {
            gt = true;
            i++;
          } else if (opt === "LT") {
            lt = true;
            i++;
          } else if (opt === "CH") {
            ch = true;
            i++;
          } else if (opt === "INCR") {
            incr = true;
            i++;
          } else break;
        }
        const pairs = [];
        while (i < rest.length - 1) {
          pairs.push({ score: parseFloat(rest[i]), member: rest[i + 1] });
          i += 2;
        }
        if (pairs.length === 0) throw new Error("ERR syntax error");
        const members = this.getOrCreateZSet(key);
        const memberIdx = this.getZSetIndex(key);
        let added = 0, changed = 0;
        let needsSort = false;
        for (const { score, member } of pairs) {
          const existing = memberIdx.get(member);
          if (existing) {
            if (nx) continue;
            let newScore = incr ? existing.score + score : score;
            if (gt && newScore <= existing.score) continue;
            if (lt && newScore >= existing.score) continue;
            if (newScore !== existing.score) {
              existing.score = newScore;
              changed++;
              needsSort = true;
            }
          } else {
            if (xx) continue;
            const newMember = { member, score };
            members.push(newMember);
            memberIdx.set(member, newMember);
            added++;
            needsSort = true;
          }
        }
        if (needsSort) {
          if (added > 0 && changed === 0) {
            const prevLastIdx = members.length - 1 - added;
            const prevMax = prevLastIdx >= 0 ? members[prevLastIdx].score : -Infinity;
            let needFullSort = false;
            let prevScore = prevMax;
            for (let j = members.length - added; j < members.length; j++) {
              if (members[j].score < prevScore) {
                needFullSort = true;
                break;
              }
              prevScore = members[j].score;
            }
            if (needFullSort) this.zsetSort(members);
          } else {
            this.zsetSort(members);
          }
        }
        this.dirty = true;
        return ch ? added + changed : added;
      }
      cmdZRem(args) {
        const [key, ...members] = args;
        if (!key || members.length === 0)
          throw new Error("ERR wrong number of arguments for 'zrem'");
        const zset = this.resolveZSet(key);
        const memberIdx = this.zsetIndex.get(key);
        let removed = 0;
        for (const m of members) {
          const entry = memberIdx?.get(m);
          if (entry !== void 0) {
            const pos = zset.indexOf(entry);
            if (pos !== -1) {
              zset.splice(pos, 1);
              memberIdx.delete(m);
              removed++;
            }
          } else {
            const idx = zset.findIndex((z3) => z3.member === m);
            if (idx !== -1) {
              zset.splice(idx, 1);
              removed++;
            }
          }
        }
        if (removed > 0) {
          if (zset.length === 0) {
            this.data.delete(key);
            this.clearExpiry(key);
            this.zsetIndex.delete(key);
          }
          this.dirty = true;
        }
        return removed;
      }
      cmdZScore(args) {
        const [key, member] = args;
        if (!key || member === void 0)
          throw new Error("ERR wrong number of arguments for 'zscore'");
        const found = this.getZSetIndex(key).get(member);
        return found ? String(found.score) : null;
      }
      cmdZMScore(args) {
        const [key, ...members] = args;
        if (!key || members.length === 0)
          throw new Error("ERR wrong number of arguments for 'zmscore'");
        const idx = this.getZSetIndex(key);
        return members.map((m) => {
          const f = idx.get(m);
          return f ? String(f.score) : null;
        });
      }
      cmdZIncrBy(args) {
        const [key, incrStr, member] = args;
        if (!key || incrStr === void 0 || member === void 0)
          throw new Error("ERR wrong number of arguments for 'zincrby'");
        const members = this.getOrCreateZSet(key);
        const memberIdx = this.getZSetIndex(key);
        const existing = memberIdx.get(member);
        const incr = parseFloat(incrStr);
        if (existing) {
          existing.score += incr;
          this.zsetSort(members);
          this.dirty = true;
          return String(existing.score);
        }
        const newMember = { member, score: incr };
        members.push(newMember);
        memberIdx.set(member, newMember);
        this.zsetSort(members);
        this.dirty = true;
        return String(incr);
      }
      cmdZCard(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'zcard'");
        return this.resolveZSet(key).length;
      }
      cmdZCount(args) {
        const [key, minStr, maxStr] = args;
        if (!key || minStr === void 0 || maxStr === void 0)
          throw new Error("ERR wrong number of arguments for 'zcount'");
        const zset = this.resolveZSet(key);
        const min = this.parseScoreBound(minStr);
        const max = this.parseScoreBound(maxStr);
        return zset.filter((z3) => {
          const aboveMin = min.exclusive ? z3.score > min.value : z3.score >= min.value;
          const belowMax = max.exclusive ? z3.score < max.value : z3.score <= max.value;
          return aboveMin && belowMax;
        }).length;
      }
      cmdZLexCount(args) {
        const [key, minStr, maxStr] = args;
        if (!key || minStr === void 0 || maxStr === void 0)
          throw new Error("ERR wrong number of arguments for 'zlexcount'");
        const zset = this.resolveZSet(key);
        const {
          inclusive: [minInc, maxInc],
          bounds: [minBound, maxBound]
        } = this.parseLexBounds(minStr, maxStr);
        return zset.filter((z3) => {
          const aboveMin = minBound === null ? true : minInc ? z3.member >= minBound : z3.member > minBound;
          const belowMax = maxBound === null ? true : maxInc ? z3.member <= maxBound : z3.member < maxBound;
          return aboveMin && belowMax;
        }).length;
      }
      parseLexBounds(minStr, maxStr) {
        const parseOne = (s) => {
          if (s === "-") return { bound: null, inclusive: true };
          if (s === "+") return { bound: null, inclusive: true };
          if (s.startsWith("[")) return { bound: s.slice(1), inclusive: true };
          if (s.startsWith("(")) return { bound: s.slice(1), inclusive: false };
          throw new Error("ERR min or max is not valid string range item");
        };
        const minP = parseOne(minStr);
        const maxP = parseOne(maxStr);
        return {
          members: [],
          inclusive: [minP.inclusive, maxP.inclusive],
          bounds: [minP.bound, maxP.bound]
        };
      }
      cmdZRange(args) {
        const [key, startStr, stopStr, ...opts] = args;
        if (!key || startStr === void 0 || stopStr === void 0)
          throw new Error("ERR wrong number of arguments for 'zrange'");
        const withScores = opts.some((o) => o.toUpperCase() === "WITHSCORES");
        const rev = opts.some((o) => o.toUpperCase() === "REV");
        const byscore = opts.some((o) => o.toUpperCase() === "BYSCORE");
        let zset = this.resolveZSet(key);
        if (rev) zset = [...zset].reverse();
        let result;
        if (byscore) {
          const min = this.parseScoreBound(startStr);
          const max = this.parseScoreBound(stopStr);
          result = zset.filter((z3) => {
            const aboveMin = min.exclusive ? z3.score > min.value : z3.score >= min.value;
            const belowMax = max.exclusive ? z3.score < max.value : z3.score <= max.value;
            return aboveMin && belowMax;
          });
        } else {
          const start = Number(startStr);
          const stop = Number(stopStr);
          const len = zset.length;
          const s = start < 0 ? Math.max(0, len + start) : start;
          const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
          result = zset.slice(s, e + 1);
        }
        if (withScores) {
          const out = [];
          for (const z3 of result) {
            out.push(z3.member, String(z3.score));
          }
          return out;
        }
        return result.map((z3) => z3.member);
      }
      cmdZRevRange(args) {
        const [key, startStr, stopStr, ...opts] = args;
        if (!key || startStr === void 0 || stopStr === void 0)
          throw new Error("ERR wrong number of arguments for 'zrevrange'");
        const withScores = opts.some((o) => o.toUpperCase() === "WITHSCORES");
        const zset = [...this.resolveZSet(key)].reverse();
        const len = zset.length;
        const start = Number(startStr);
        const stop = Number(stopStr);
        const s = start < 0 ? Math.max(0, len + start) : start;
        const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
        const slice = zset.slice(s, e + 1);
        if (withScores) {
          const out = [];
          for (const z3 of slice) {
            out.push(z3.member, String(z3.score));
          }
          return out;
        }
        return slice.map((z3) => z3.member);
      }
      cmdZRangeByScore(args, rev) {
        let [key, minStr, maxStr, ...opts] = args;
        if (!key || minStr === void 0 || maxStr === void 0)
          throw new Error("ERR wrong number of arguments");
        if (rev) {
          [minStr, maxStr] = [maxStr, minStr];
        }
        const withScores = opts.some((o) => o.toUpperCase() === "WITHSCORES");
        let limitOffset = 0, limitCount = -1;
        const limitIdx = opts.findIndex((o) => o.toUpperCase() === "LIMIT");
        if (limitIdx !== -1) {
          limitOffset = Number(opts[limitIdx + 1]);
          limitCount = Number(opts[limitIdx + 2]);
        }
        let zset = this.resolveZSet(key);
        if (rev) zset = [...zset].reverse();
        const minB = this.parseScoreBound(rev ? maxStr : minStr);
        const maxB = this.parseScoreBound(rev ? minStr : maxStr);
        let result = zset.filter((z3) => {
          const aboveMin = minB.exclusive ? z3.score > minB.value : z3.score >= minB.value;
          const belowMax = maxB.exclusive ? z3.score < maxB.value : z3.score <= maxB.value;
          return aboveMin && belowMax;
        });
        if (limitOffset > 0) result = result.slice(limitOffset);
        if (limitCount >= 0) result = result.slice(0, limitCount);
        if (withScores) {
          const out = [];
          for (const z3 of result) {
            out.push(z3.member, String(z3.score));
          }
          return out;
        }
        return result.map((z3) => z3.member);
      }
      cmdZRangeByLex(args, rev) {
        let [key, minStr, maxStr, ...opts] = args;
        if (!key || minStr === void 0 || maxStr === void 0)
          throw new Error("ERR wrong number of arguments");
        if (rev) {
          [minStr, maxStr] = [maxStr, minStr];
        }
        let limitOffset = 0, limitCount = -1;
        const limitIdx = opts.findIndex((o) => o.toUpperCase() === "LIMIT");
        if (limitIdx !== -1) {
          limitOffset = Number(opts[limitIdx + 1]);
          limitCount = Number(opts[limitIdx + 2]);
        }
        const {
          inclusive: [minInc, maxInc],
          bounds: [minBound, maxBound]
        } = this.parseLexBounds(minStr, maxStr);
        let zset = this.resolveZSet(key);
        if (rev) zset = [...zset].reverse();
        let result = zset.filter((z3) => {
          const aboveMin = minBound === null ? true : minInc ? z3.member >= minBound : z3.member > minBound;
          const belowMax = maxBound === null ? true : maxInc ? z3.member <= maxBound : z3.member < maxBound;
          return aboveMin && belowMax;
        });
        if (limitOffset > 0) result = result.slice(limitOffset);
        if (limitCount >= 0) result = result.slice(0, limitCount);
        return result.map((z3) => z3.member);
      }
      cmdZRank(args, rev) {
        const [key, member] = args;
        if (!key || member === void 0)
          throw new Error("ERR wrong number of arguments for 'zrank'");
        let zset = this.resolveZSet(key);
        if (rev) zset = [...zset].reverse();
        const idx = zset.findIndex((z3) => z3.member === member);
        return idx === -1 ? null : idx;
      }
      cmdZPop(args, max) {
        const [key, countStr] = args;
        if (!key)
          throw new Error("ERR wrong number of arguments for 'zpopmin/zpopmax'");
        const count = countStr !== void 0 ? Number(countStr) : 1;
        const members = this.resolveZSet(key);
        if (members.length === 0) return [];
        const popped = max ? members.splice(-count) : members.splice(0, count);
        if (max) popped.reverse();
        const memberIdx = this.zsetIndex.get(key);
        if (memberIdx) {
          for (const z3 of popped) memberIdx.delete(z3.member);
        }
        if (members.length === 0) {
          this.data.delete(key);
          this.clearExpiry(key);
          this.zsetIndex.delete(key);
        } else this.dirty = true;
        const out = [];
        for (const z3 of popped) {
          out.push(z3.member, String(z3.score));
        }
        return out;
      }
      cmdZRandMember(args) {
        const [key, countStr] = args;
        if (!key)
          throw new Error("ERR wrong number of arguments for 'zrandmember'");
        const zset = this.resolveZSet(key);
        if (!countStr) {
          if (zset.length === 0) return null;
          return zset[Math.floor(Math.random() * zset.length)].member;
        }
        const count = Number(countStr);
        const abs = Math.abs(count);
        if (count >= 0) {
          const shuffled = [...zset].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, Math.min(abs, shuffled.length)).map((z3) => z3.member);
        }
        const result = [];
        for (let i = 0; i < abs; i++)
          result.push(zset[Math.floor(Math.random() * zset.length)].member);
        return result;
      }
      /** Helper: persist a new ZSet result to a destination key, updating both data and zsetIndex. */
      setZSetResult(dst, members) {
        this.data.set(dst, { type: "zset", value: members });
        this.zsetIndex.set(dst, new Map(members.map((m) => [m.member, m])));
        this.dirty = true;
      }
      cmdZDiffStore(args) {
        const [dst, ...keys] = args;
        if (!dst || keys.length === 0)
          throw new Error("ERR wrong number of arguments for 'zdiffstore'");
        const [firstKey, ...restKeys] = keys;
        const base = new Map(
          this.resolveZSet(firstKey).map((z3) => [z3.member, z3.score])
        );
        for (const k of restKeys) {
          for (const z3 of this.resolveZSet(k)) base.delete(z3.member);
        }
        const members = Array.from(base.entries()).map(
          ([member, score]) => ({ member, score })
        );
        this.zsetSort(members);
        this.setZSetResult(dst, members);
        return members.length;
      }
      cmdZUnionStore(args) {
        const [dst, numkeysStr, ...rest] = args;
        if (!dst || numkeysStr === void 0)
          throw new Error("ERR wrong number of arguments for 'zunionstore'");
        const numkeys = Number(numkeysStr);
        const keys = rest.slice(0, numkeys);
        const weightStrs = rest.slice(numkeys);
        const weights = [];
        let wi = weightStrs.findIndex((s) => s.toUpperCase() === "WEIGHTS");
        if (wi !== -1) {
          for (let j = wi + 1; j < wi + 1 + numkeys; j++)
            weights.push(Number(weightStrs[j]));
        } else {
          for (let j = 0; j < numkeys; j++) weights.push(1);
        }
        const acc = /* @__PURE__ */ new Map();
        for (let k = 0; k < keys.length; k++) {
          for (const z3 of this.resolveZSet(keys[k])) {
            const w = weights[k] ?? 1;
            acc.set(z3.member, (acc.get(z3.member) ?? 0) + z3.score * w);
          }
        }
        const members = Array.from(acc.entries()).map(
          ([member, score]) => ({ member, score })
        );
        this.zsetSort(members);
        this.setZSetResult(dst, members);
        return members.length;
      }
      cmdZInterStore(args) {
        const [dst, numkeysStr, ...rest] = args;
        if (!dst || numkeysStr === void 0)
          throw new Error("ERR wrong number of arguments for 'zinterstore'");
        const numkeys = Number(numkeysStr);
        const keys = rest.slice(0, numkeys);
        const weightStrs = rest.slice(numkeys);
        const weights = [];
        let wi = weightStrs.findIndex((s) => s.toUpperCase() === "WEIGHTS");
        if (wi !== -1) {
          for (let j = wi + 1; j < wi + 1 + numkeys; j++)
            weights.push(Number(weightStrs[j]));
        } else {
          for (let j = 0; j < numkeys; j++) weights.push(1);
        }
        if (keys.length === 0) {
          this.setZSetResult(dst, []);
          return 0;
        }
        const firstSet = new Map(
          this.resolveZSet(keys[0]).map((z3) => [
            z3.member,
            z3.score * (weights[0] ?? 1)
          ])
        );
        for (let k = 1; k < keys.length; k++) {
          const other = new Map(
            this.resolveZSet(keys[k]).map((z3) => [z3.member, z3.score])
          );
          for (const [m] of firstSet) {
            if (!other.has(m)) firstSet.delete(m);
            else
              firstSet.set(m, firstSet.get(m) + other.get(m) * (weights[k] ?? 1));
          }
        }
        const members = Array.from(firstSet.entries()).map(
          ([member, score]) => ({ member, score })
        );
        this.zsetSort(members);
        this.setZSetResult(dst, members);
        return members.length;
      }
      // ============================================================================
      // LUA SCRIPTING (EVAL / EVALSHA / SCRIPT)
      // ============================================================================
      sha1(script) {
        return createHash("sha1").update(script).digest("hex");
      }
      luaToRedis(val) {
        if (val === null || val === void 0) return null;
        if (typeof val === "boolean") return val ? 1 : null;
        if (typeof val === "number") return Math.trunc(val);
        if (typeof val === "string") return val;
        if (Array.isArray(val))
          return val.map((v) => this.luaToRedis(v));
        if (typeof val === "object") {
          const obj = val;
          if (obj["err"] !== void 0) throw new Error(String(obj["err"]));
          if (obj["ok"] !== void 0) return String(obj["ok"]);
          const entries = Object.values(obj);
          return entries.map((v) => this.luaToRedis(v));
        }
        return String(val);
      }
      // Recursively convert Lua table (plain JS object from wasmoon) → native JS value.
      // Lua arrays are 1-indexed integer-keyed tables; we detect and convert them.
      luaTableToJs(val) {
        if (val === null || val === void 0) return null;
        if (typeof val !== "object") return val;
        if (val instanceof Uint8Array || Buffer.isBuffer(val)) return val;
        const obj = val;
        const keys = Object.keys(obj).filter((k) => k !== "__name");
        if (keys.length === 0) return {};
        const numericKeys = keys.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
        if (numericKeys.length === keys.length && numericKeys.length > 0) {
          const minIdx = Math.min(...numericKeys);
          const maxIdx = Math.max(...numericKeys);
          if (maxIdx - minIdx + 1 === numericKeys.length) {
            const arr = [];
            for (let i = minIdx; i <= maxIdx; i++)
              arr.push(this.luaTableToJs(obj[i]));
            return arr;
          }
        }
        const result = {};
        for (const k of keys) result[k] = this.luaTableToJs(obj[k]);
        return result;
      }
      // Encode binary bytes as a hex string — ASCII-safe, survives the Lua VM unharmed.
      bytesToLuaStr(bytes) {
        return Buffer.from(bytes).toString("hex");
      }
      // Decode a hex string (produced by bytesToLuaStr) back to binary bytes.
      luaStrToBytes(str) {
        if (str instanceof Uint8Array) return Buffer.from(str);
        if (Buffer.isBuffer(str)) return str;
        const s = String(str);
        if (s.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(s))
          return Buffer.from(s, "hex");
        return Buffer.from(s, "binary");
      }
      // Emit a Lua literal for a decoded JS value (numbers, strings, bools, arrays, maps).
      // Called only for msgpack-decoded data, so no arbitrary binary byte values.
      luaQuoteStr(s) {
        return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\0/g, "\\0")}"`;
      }
      valToLuaLiteral(val) {
        if (val === null || val === void 0) return "nil";
        if (typeof val === "boolean") return val ? "true" : "false";
        if (typeof val === "number") return isFinite(val) ? String(val) : "0";
        if (typeof val === "string") return this.luaQuoteStr(val);
        if (Array.isArray(val)) {
          const elems = val.map((v) => this.valToLuaLiteral(v)).join(", ");
          return `{${elems}}`;
        }
        if (typeof val === "object") {
          const pairs = Object.entries(val).map(
            ([k, v]) => `[${this.luaQuoteStr(String(k))}] = ${this.valToLuaLiteral(v)}`
          ).join(", ");
          return `{${pairs}}`;
        }
        return "nil";
      }
      // Convert a JS value decoded from MessagePack back to a proper Lua value.
      // Uses doStringSync to build proper Lua tables that respond to # and key access.
      jsToLuaVal(val, lua) {
        if (val === null || val === void 0) return null;
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean")
          return val;
        if (!lua) return val;
        const luaCode = `return ${this.valToLuaLiteral(val)}`;
        return lua.doStringSync(luaCode);
      }
      // ─────────────────────────────────────────────────────────────────────────────
      // Redis reply → Lua value conversion (authoritative mapping from the Redis docs)
      //
      //  Reply type          Redis description             Lua equivalent
      //  ─────────────────   ─────────────────────────     ─────────────────────────
      //  Nil bulk string     GET of missing key            Lua boolean false
      //  Integer             INCR, ZADD, …                 Lua number
      //  Simple string       OK, PONG, …                   Lua string
      //  Bulk string         GET, HGET, …                  Lua string
      //  Multi-bulk array    LRANGE, SMEMBERS, KEYS, …     Lua table (1-indexed seq)
      //    ↳ with nulls      HMGET missing fields          null element → false
      //  Hash (HGETALL)      flat [k,v,k,v] multi-bulk     Lua table (1-indexed seq)
      //
      // Returning JS `null` directly to Lua crashes wasmoon (Promise extension tries
      // null.then → TypeError).  We must never return null from redis.call().
      // ─────────────────────────────────────────────────────────────────────────────
      redisReplyToLua(result, lua) {
        if (result === null || result === void 0) return false;
        if (typeof result === "string" || typeof result === "number") return result;
        if (typeof result === "boolean") return result ? 1 : 0;
        if (Array.isArray(result)) {
          const safe = result.map(
            (v) => v === null || v === void 0 ? false : v
          );
          return this.buildLuaSequence(safe, lua);
        }
        if (typeof result === "object") {
          const flat = [];
          for (const [k, v] of Object.entries(result)) {
            flat.push(k, v ?? "");
          }
          return this.buildLuaSequence(flat, lua);
        }
        return result;
      }
      // Build a proper 1-indexed Lua sequence table from a flat JS array.
      // Uses doStringSync with a generated literal so # and t[i] work natively.
      buildLuaSequence(arr, lua) {
        if (arr.length === 0) return lua.doStringSync("return {}");
        const elems = arr.map((v) => {
          if (v === null || v === void 0 || v === false) return "false";
          if (typeof v === "number") return String(v);
          if (typeof v === "string") return this.luaQuoteStr(v);
          return "false";
        }).join(", ");
        return lua.doStringSync(`return {${elems}}`);
      }
      async runLua(script, keys, argv) {
        const usesRedisCall = /redis\s*\.\s*[pc]?call\s*\(/.test(script);
        if (!usesRedisCall && luaPool.isReady) {
          try {
            const result = await luaPool.run(script, keys, argv);
            return result;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes("redis.call() is not supported")) {
              throw err;
            }
          }
        }
        if (!acquireLuaSlot()) {
          throw new Error(
            "ERR Lua engine pool exhausted \u2014 too many concurrent EVAL scripts (max 8)"
          );
        }
        const lua = await luaFactory.createEngine({ openStandardLibs: true });
        try {
          const keysLit = keys.map((k) => this.luaQuoteStr(k)).join(", ");
          const argvLit = argv.map((a) => this.luaQuoteStr(a)).join(", ");
          lua.doStringSync(`KEYS = {${keysLit}}; ARGV = {${argvLit}}`);
          const toStrArgs = (args) => args.map((a) => {
            if (a === null || a === void 0) return "";
            if (a instanceof Uint8Array || Buffer.isBuffer(a))
              return Buffer.from(a).toString("binary");
            return String(a);
          });
          lua.global.set("redis", {
            // redis.call() — raises a Lua error on Redis error replies
            call: (cmd, ...args) => {
              const result2 = this.execSync(cmd, toStrArgs(args));
              return this.redisReplyToLua(result2, lua);
            },
            // redis.pcall() — returns { err = "..." } on Redis error replies
            pcall: (cmd, ...args) => {
              try {
                const result2 = this.execSync(cmd, toStrArgs(args));
                return this.redisReplyToLua(result2, lua);
              } catch (e) {
                return { err: e instanceof Error ? e.message : String(e) };
              }
            },
            error_reply: (msg) => ({ err: msg }),
            status_reply: (msg) => ({ ok: msg }),
            LOG_DEBUG: 0,
            LOG_VERBOSE: 1,
            LOG_NOTICE: 2,
            LOG_WARNING: 3,
            log: (_level, _msg) => {
            }
          });
          lua.global.set("cjson", {
            encode: (v) => JSON.stringify(this.luaTableToJs(v)),
            decode: (s) => this.jsToLuaVal(JSON.parse(s), lua)
          });
          lua.global.set("cmsgpack", {
            pack: (v) => {
              const jsVal = this.luaTableToJs(v);
              const bytes = msgpackEncode(jsVal);
              return this.bytesToLuaStr(bytes);
            },
            unpack: (s) => {
              const buf = this.luaStrToBytes(s);
              const decoded = msgpackDecode(buf);
              return this.jsToLuaVal(decoded, lua);
            }
          });
          lua.global.set("struct", {
            pack: (_fmt, ...vals) => {
              if (typeof _fmt === "string" && _fmt === ">H") {
                const n = Number(vals[0]) & 65535;
                return String.fromCharCode(n >> 8 & 255, n & 255);
              }
              throw new Error("ERR struct.pack format not supported: " + _fmt);
            },
            unpack: (_fmt, s, _pos) => {
              if (typeof _fmt === "string" && _fmt === ">H") {
                const buf = this.luaStrToBytes(s);
                const n = buf[0] << 8 | buf[1];
                return [n, 3];
              }
              throw new Error("ERR struct.unpack format not supported: " + _fmt);
            },
            size: (_fmt) => {
              if (_fmt === ">H") return 2;
              throw new Error("ERR struct.size format not supported: " + _fmt);
            }
          });
          lua.global.set("tonumber", (v, base) => {
            if (v === null || v === void 0) return null;
            const n = base ? parseInt(String(v), base) : parseFloat(String(v));
            return isNaN(n) ? null : n;
          });
          const result = await lua.doString(script);
          return this.luaToRedis(result);
        } finally {
          lua.global.close();
          releaseLuaSlot();
        }
      }
      async cmdEval(args) {
        const [script, numkeysStr, ...rest] = args;
        if (script === void 0 || numkeysStr === void 0)
          throw new Error("ERR wrong number of arguments for 'eval'");
        const numkeys = Number(numkeysStr);
        if (isNaN(numkeys) || numkeys < 0)
          throw new Error("ERR value is not an integer or out of range");
        const keys = rest.slice(0, numkeys);
        const argv = rest.slice(numkeys);
        return this.runLua(script, keys, argv);
      }
      async cmdEvalSha(args) {
        const [sha, numkeysStr, ...rest] = args;
        if (sha === void 0 || numkeysStr === void 0)
          throw new Error("ERR wrong number of arguments for 'evalsha'");
        const script = this.scriptCache.get(sha.toLowerCase());
        if (!script)
          throw new Error("NOSCRIPT No matching script. Please use EVAL.");
        const numkeys = Number(numkeysStr);
        const keys = rest.slice(0, numkeys);
        const argv = rest.slice(numkeys);
        return this.runLua(script, keys, argv);
      }
      cmdScript(args) {
        const [subcmd, ...rest] = args;
        if (!subcmd) throw new Error("ERR wrong number of arguments for 'script'");
        const sub = subcmd.toUpperCase();
        if (sub === "LOAD") {
          const script = rest[0];
          if (script === void 0)
            throw new Error("ERR wrong number of arguments for 'script|load'");
          const sha = this.sha1(script);
          this.scriptCache.set(sha, script);
          return sha;
        }
        if (sub === "EXISTS") {
          return rest.map(
            (sha) => this.scriptCache.has(sha.toLowerCase()) ? 1 : 0
          );
        }
        if (sub === "FLUSH") {
          this.scriptCache.clear();
          return "OK";
        }
        throw new Error(`ERR unknown subcommand '${subcmd}' for 'script'`);
      }
      // ============================================================================
      // RPOPLPUSH
      // ============================================================================
      cmdRPopLPush(args) {
        const [src, dst] = args;
        if (!src || !dst)
          throw new Error("ERR wrong number of arguments for 'rpoplpush'");
        return this.cmdLMove([src, dst, "RIGHT", "LEFT"]);
      }
      // ============================================================================
      // STREAM HELPERS
      // ============================================================================
      streamSeqMap = /* @__PURE__ */ new Map();
      generateStreamId() {
        const ms = Date.now();
        const seq = (this.streamSeqMap.get(ms) ?? -1) + 1;
        this.streamSeqMap.set(ms, seq);
        if (this.streamSeqMap.size > 10) {
          const oldest = [...this.streamSeqMap.keys()].sort((a, b) => a - b)[0];
          this.streamSeqMap.delete(oldest);
        }
        return `${ms}-${seq}`;
      }
      parseStreamId(id) {
        const parts = id.split("-");
        return [Number(parts[0] ?? 0), Number(parts[1] ?? 0)];
      }
      compareStreamIds(a, b) {
        const [ams, aseq] = this.parseStreamId(a);
        const [bms, bseq] = this.parseStreamId(b);
        if (ams !== bms) return ams - bms;
        return aseq - bseq;
      }
      getOrCreateStream(key) {
        const existing = this.data.get(key);
        if (existing) {
          if (existing.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          return existing;
        }
        const entry = {
          type: "stream",
          value: [],
          groups: {}
        };
        this.data.set(key, entry);
        return entry;
      }
      trimStream(stream, maxlen) {
        const excess = stream.value.length - maxlen;
        if (excess <= 0) return 0;
        stream.value.splice(0, excess);
        return excess;
      }
      streamIdAfter(entries, afterId) {
        if (afterId === "0" || afterId === "0-0") return entries;
        return entries.filter((e) => this.compareStreamIds(e.id, afterId) > 0);
      }
      formatStreamEntries(entries) {
        return entries.map((e) => [e.id, e.fields]);
      }
      // ============================================================================
      // STREAM COMMANDS
      // ============================================================================
      cmdXAdd(args) {
        let i = 0;
        const key = args[i++];
        if (!key) throw new Error("ERR wrong number of arguments for 'xadd'");
        let noMkStream = false;
        let maxlen = null;
        while (i < args.length) {
          const tok = args[i].toUpperCase();
          if (tok === "NOMKSTREAM") {
            noMkStream = true;
            i++;
          } else if (tok === "MAXLEN" || tok === "MINID") {
            i++;
            if (args[i] === "~") i++;
            maxlen = Number(args[i++]);
          } else break;
        }
        const rawId = args[i++];
        if (!rawId) throw new Error("ERR wrong number of arguments for 'xadd'");
        const fields = args.slice(i);
        if (fields.length === 0 || fields.length % 2 !== 0)
          throw new Error("ERR wrong number of arguments for 'xadd'");
        if (noMkStream && (!this.data.has(key) || this.isExpired(key))) return null;
        if (this.isExpired(key)) this.data.delete(key);
        const stream = this.getOrCreateStream(key);
        const id = rawId === "*" ? this.generateStreamId() : rawId;
        stream.value.push({ id, fields });
        if (maxlen !== null && maxlen >= 0) this.trimStream(stream, maxlen);
        this.dirty = true;
        return id;
      }
      cmdXTrim(args) {
        const [key, strategy, ...rest] = args;
        if (!key || !strategy)
          throw new Error("ERR wrong number of arguments for 'xtrim'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "stream")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        let idx = 0;
        if (rest[idx] === "~") idx++;
        const threshold = Number(rest[idx]);
        if (isNaN(threshold))
          throw new Error("ERR value is not an integer or out of range");
        const strat = strategy.toUpperCase();
        if (strat === "MAXLEN") {
          const removed = this.trimStream(entry, threshold);
          if (removed > 0) this.dirty = true;
          return removed;
        } else if (strat === "MINID") {
          const before = entry.value.length;
          entry.value = entry.value.filter(
            (e) => this.compareStreamIds(e.id, String(threshold)) >= 0
          );
          const removed = before - entry.value.length;
          if (removed > 0) this.dirty = true;
          return removed;
        }
        throw new Error(`ERR unsupported XTRIM strategy '${strategy}'`);
      }
      cmdXLen(args) {
        const [key] = args;
        if (!key) throw new Error("ERR wrong number of arguments for 'xlen'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "stream")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        return entry.value.length;
      }
      cmdXRange(args, reverse) {
        const [key, start, end, ...rest] = args;
        if (!key || start === void 0 || end === void 0)
          throw new Error(
            `ERR wrong number of arguments for '${reverse ? "xrevrange" : "xrange"}'`
          );
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "stream")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        let count = Infinity;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i]?.toUpperCase() === "COUNT")
            count = Number(rest[i + 1] ?? Infinity);
        }
        const lo = reverse ? end : start;
        const hi = reverse ? start : end;
        let entries = entry.value.filter((e) => {
          const gtLo = lo === "-" || this.compareStreamIds(e.id, lo) >= 0;
          const ltHi = hi === "+" || this.compareStreamIds(e.id, hi) <= 0;
          return gtLo && ltHi;
        });
        if (reverse) entries = entries.slice().reverse();
        if (isFinite(count)) entries = entries.slice(0, count);
        return this.formatStreamEntries(entries);
      }
      cmdXRead(args) {
        let i = 0;
        let count = Infinity;
        while (i < args.length) {
          const tok = args[i].toUpperCase();
          if (tok === "COUNT") {
            count = Number(args[++i]);
            i++;
          } else if (tok === "BLOCK") {
            i += 2;
          } else if (tok === "STREAMS") {
            i++;
            break;
          } else i++;
        }
        const remaining = args.slice(i);
        const half = Math.floor(remaining.length / 2);
        const keys = remaining.slice(0, half);
        const ids = remaining.slice(half);
        const result = [];
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          const afterId = ids[k] ?? "0";
          if (this.isExpired(key) || !this.data.has(key)) continue;
          const entry = this.data.get(key);
          if (entry.type !== "stream") continue;
          let entries = this.streamIdAfter(entry.value, afterId);
          if (isFinite(count)) entries = entries.slice(0, count);
          if (entries.length > 0)
            result.push([key, this.formatStreamEntries(entries)]);
        }
        return result.length > 0 ? result : null;
      }
      cmdXReadGroup(args) {
        const groupIndex = args.findIndex((a) => a.toUpperCase() === "GROUP");
        const streamsIndex = args.findIndex((a) => a.toUpperCase() === "STREAMS");
        const countIndex = args.findIndex((a) => a.toUpperCase() === "COUNT");
        if (groupIndex !== 0 || streamsIndex < 3) throw new Error("ERR invalid XREADGROUP arguments");
        const groupName = args[1];
        const consumer = args[2];
        const rest = args.slice(streamsIndex + 1);
        if (!rest.length || rest.length % 2) throw new Error("ERR unbalanced streams and IDs");
        const half = rest.length / 2;
        const count = countIndex < 0 ? Infinity : Number(args[countIndex + 1]);
        if (!(count > 0)) throw new Error("ERR invalid COUNT");
        const noack = args.slice(3, streamsIndex).some((a) => a.toUpperCase() === "NOACK");
        const result = [];
        for (let i = 0; i < half; i++) {
          const key = rest[i];
          const id = rest[i + half];
          const entry = this.isExpired(key) ? void 0 : this.data.get(key);
          if (entry && entry.type !== "stream") throw new Error("WRONGTYPE expected stream");
          const group = entry?.groups[groupName];
          if (!entry || !group) throw new Error(`NOGROUP ${groupName} for ${key}`);
          const messages = id === ">" ? this.streamIdAfter(entry.value, group.lastDeliveredId).slice(0, count) : this.streamIdAfter(entry.value, id).filter((message) => group.pending.some((p) => p.id === message.id && p.consumer === consumer)).slice(0, count);
          if (!messages.length) continue;
          const now = Date.now();
          group.consumers[consumer] = { name: consumer, lastSeenAt: now };
          for (const message of messages) {
            const pending = group.pending.find((p) => p.id === message.id);
            if (pending) {
              pending.deliveredAt = now;
              pending.count++;
            } else if (!noack) group.pending.push({ id: message.id, consumer, deliveredAt: now, count: 1 });
          }
          if (id === ">") group.lastDeliveredId = messages.at(-1).id;
          this.dirty = true;
          result.push([key, this.formatStreamEntries(messages)]);
        }
        return result.length ? result : null;
      }
      cmdXDel(args) {
        const [key, ...ids] = args;
        if (!key || ids.length === 0)
          throw new Error("ERR wrong number of arguments for 'xdel'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "stream")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const idSet = new Set(ids);
        const before = entry.value.length;
        entry.value = entry.value.filter((e) => !idSet.has(e.id));
        const removed = before - entry.value.length;
        if (removed > 0) this.dirty = true;
        return removed;
      }
      cmdXAck(args) {
        const [key, group, ...ids] = args;
        if (!key || !group || ids.length === 0)
          throw new Error("ERR wrong number of arguments for 'xack'");
        if (this.isExpired(key) || !this.data.has(key)) return 0;
        const entry = this.data.get(key);
        if (entry.type !== "stream")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const grp = entry.groups[group];
        if (!grp) return 0;
        const before = grp.pending.length;
        const idSet = new Set(ids);
        grp.pending = grp.pending.filter((p) => !idSet.has(p.id));
        return before - grp.pending.length;
      }
      cmdXGroup(args) {
        const [subcmd, key, ...rest] = args;
        if (!subcmd || !key)
          throw new Error("ERR wrong number of arguments for 'xgroup'");
        const sub = subcmd.toUpperCase();
        if (sub === "CREATE") {
          const [group, id, ...flags] = rest;
          if (!group)
            throw new Error("ERR wrong number of arguments for 'xgroup|create'");
          const mkStream = flags.map((f) => f.toUpperCase()).includes("MKSTREAM");
          if (this.isExpired(key) || !this.data.has(key)) {
            if (!mkStream)
              throw new Error(
                `ERR The XGROUP subcommand requires the key to exist`
              );
            this.getOrCreateStream(key);
          }
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          entry.groups[group] = {
            lastDeliveredId: id === "$" ? entry.value.at(-1)?.id ?? "0-0" : id ?? "0-0",
            pending: [],
            consumers: {}
          };
          this.dirty = true;
          return "OK";
        }
        if (sub === "SETID") {
          const [group, id] = rest;
          if (!group || id === void 0)
            throw new Error("ERR wrong number of arguments for 'xgroup|setid'");
          if (this.isExpired(key) || !this.data.has(key))
            throw new Error("ERR no such key");
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          const grp = entry.groups[group];
          if (!grp)
            throw new Error(
              `ERR -NOGROUP No such consumer group '${group}' for key name '${key}'`
            );
          grp.lastDeliveredId = id;
          this.dirty = true;
          return "OK";
        }
        if (sub === "DESTROY") {
          const [group] = rest;
          if (!group)
            throw new Error("ERR wrong number of arguments for 'xgroup|destroy'");
          if (this.isExpired(key) || !this.data.has(key)) return 0;
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          if (!entry.groups[group]) return 0;
          delete entry.groups[group];
          this.dirty = true;
          return 1;
        }
        if (sub === "CREATECONSUMER") {
          const [group, consumer] = rest;
          if (!group || !consumer)
            throw new Error(
              "ERR wrong number of arguments for 'xgroup|createconsumer'"
            );
          if (this.isExpired(key) || !this.data.has(key))
            throw new Error("ERR no such key");
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          const grp = entry.groups[group];
          if (!grp)
            throw new Error(
              `ERR -NOGROUP No such consumer group '${group}' for key name '${key}'`
            );
          if (grp.consumers[consumer]) return 0;
          grp.consumers[consumer] = { name: consumer, lastSeenAt: Date.now() };
          this.dirty = true;
          return 1;
        }
        if (sub === "DELCONSUMER") {
          const [group, consumer] = rest;
          if (!group || !consumer)
            throw new Error(
              "ERR wrong number of arguments for 'xgroup|delconsumer'"
            );
          if (this.isExpired(key) || !this.data.has(key)) return 0;
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          const grp = entry.groups[group];
          if (!grp || !grp.consumers[consumer]) return 0;
          const pendingCount = grp.pending.filter(
            (p) => p.consumer === consumer
          ).length;
          grp.pending = grp.pending.filter((p) => p.consumer !== consumer);
          delete grp.consumers[consumer];
          this.dirty = true;
          return pendingCount;
        }
        throw new Error(`ERR unknown subcommand '${subcmd}' for 'xgroup'`);
      }
      cmdXClaim(args) {
        const [key, groupName, consumer, minIdleRaw, ...rest] = args;
        if (!key || !groupName || !consumer || minIdleRaw === void 0) {
          throw new Error("ERR wrong number of arguments for 'xclaim'");
        }
        const minIdle = Number(minIdleRaw);
        if (!Number.isSafeInteger(minIdle) || minIdle < 0) {
          throw new Error("ERR invalid min-idle-time");
        }
        const optionNames = /* @__PURE__ */ new Set(["IDLE", "TIME", "RETRYCOUNT", "FORCE", "JUSTID"]);
        const ids = [];
        let optionIndex = 0;
        while (optionIndex < rest.length && !optionNames.has(rest[optionIndex].toUpperCase())) {
          ids.push(rest[optionIndex++]);
        }
        if (ids.length === 0 || ids.some((id) => !/^\d+-\d+$/.test(id))) {
          throw new Error("ERR invalid stream ID");
        }
        let idleOverride;
        let timeOverride;
        let retryCount;
        let force = false;
        let justId = false;
        while (optionIndex < rest.length) {
          const option = rest[optionIndex++].toUpperCase();
          if (option === "FORCE") {
            force = true;
          } else if (option === "JUSTID") {
            justId = true;
          } else if (option === "IDLE" || option === "TIME" || option === "RETRYCOUNT") {
            const raw = rest[optionIndex++];
            if (raw === void 0 || !/^\d+$/.test(raw)) {
              throw new Error(`ERR ${option} requires a non-negative integer`);
            }
            const value = Number(raw);
            if (!Number.isSafeInteger(value)) {
              throw new Error(`ERR ${option} is out of range`);
            }
            if (option === "IDLE") idleOverride = value;
            else if (option === "TIME") timeOverride = value;
            else retryCount = value;
          } else {
            throw new Error(`ERR unsupported XCLAIM option '${option}'`);
          }
        }
        if (idleOverride !== void 0 && timeOverride !== void 0) {
          throw new Error("ERR IDLE and TIME cannot be used together");
        }
        if (this.isExpired(key) || !this.data.has(key)) return [];
        const entry = this.data.get(key);
        if (entry.type !== "stream") {
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        }
        const group = entry.groups[groupName];
        if (!group) {
          throw new Error(
            `NOGROUP No such key '${key}' or consumer group '${groupName}'`
          );
        }
        const now = Date.now();
        const claimed = [];
        let changed = false;
        for (const id of ids) {
          let pendingIndex = group.pending.findIndex((pending2) => pending2.id === id);
          let pending = pendingIndex >= 0 ? group.pending[pendingIndex] : void 0;
          const message = entry.value.find((item) => item.id === id);
          if (!pending && force && message) {
            pending = {
              id,
              consumer,
              deliveredAt: now,
              count: 0
            };
            group.pending.push(pending);
            pendingIndex = group.pending.length - 1;
            changed = true;
          }
          if (!pending) continue;
          if (!message) {
            group.pending.splice(pendingIndex, 1);
            changed = true;
            continue;
          }
          if (now - pending.deliveredAt < minIdle) continue;
          pending.consumer = consumer;
          pending.deliveredAt = timeOverride ?? (idleOverride === void 0 ? now : now - idleOverride);
          pending.count = retryCount ?? (justId ? pending.count : pending.count + 1);
          group.consumers[consumer] = { name: consumer, lastSeenAt: now };
          claimed.push(message);
          changed = true;
        }
        if (changed) this.dirty = true;
        return justId ? claimed.map((message) => message.id) : this.formatStreamEntries(claimed);
      }
      cmdXAutoClaim(args) {
        const [key, groupName, consumer, minIdleRaw, start, ...rest] = args;
        if (!key || !groupName || !consumer || minIdleRaw === void 0 || !start) {
          throw new Error("ERR wrong number of arguments for 'xautoclaim'");
        }
        const minIdle = Number(minIdleRaw);
        if (!Number.isSafeInteger(minIdle) || minIdle < 0) {
          throw new Error("ERR invalid min-idle-time");
        }
        if (!/^\d+-\d+$/.test(start)) throw new Error("ERR invalid stream ID");
        let count = 100;
        let justId = false;
        for (let i = 0; i < rest.length; i++) {
          const option = rest[i].toUpperCase();
          if (option === "JUSTID") {
            justId = true;
          } else if (option === "COUNT") {
            const raw = rest[++i];
            if (raw === void 0 || !/^\d+$/.test(raw)) {
              throw new Error("ERR COUNT requires a positive integer");
            }
            count = Number(raw);
            if (!Number.isSafeInteger(count) || count < 1) {
              throw new Error("ERR COUNT requires a positive integer");
            }
          } else {
            throw new Error(`ERR unsupported XAUTOCLAIM option '${option}'`);
          }
        }
        if (this.isExpired(key) || !this.data.has(key)) return ["0-0", [], []];
        const entry = this.data.get(key);
        if (entry.type !== "stream") {
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        }
        const group = entry.groups[groupName];
        if (!group) {
          throw new Error(
            `NOGROUP No such key '${key}' or consumer group '${groupName}'`
          );
        }
        const pending = group.pending.filter((item) => this.compareStreamIds(item.id, start) >= 0).sort((a, b) => this.compareStreamIds(a.id, b.id));
        const scanLimit = count * 10;
        const now = Date.now();
        const claimed = [];
        const deletedIds = [];
        let scanned = 0;
        let changed = false;
        for (const item of pending) {
          if (scanned >= scanLimit || claimed.length >= count) break;
          scanned++;
          const message = entry.value.find((candidate) => candidate.id === item.id);
          if (!message) {
            const pendingIndex = group.pending.indexOf(item);
            if (pendingIndex >= 0) group.pending.splice(pendingIndex, 1);
            deletedIds.push(item.id);
            changed = true;
            continue;
          }
          if (now - item.deliveredAt < minIdle) continue;
          item.consumer = consumer;
          item.deliveredAt = now;
          if (!justId) item.count++;
          claimed.push(message);
          changed = true;
        }
        if (claimed.length > 0) {
          group.consumers[consumer] = { name: consumer, lastSeenAt: now };
        }
        if (changed) this.dirty = true;
        const nextPending = pending[scanned];
        const nextStart = nextPending ? nextPending.id : "0-0";
        const result = justId ? claimed.map((message) => message.id) : this.formatStreamEntries(claimed);
        return [nextStart, result, deletedIds];
      }
      cmdXPending(args) {
        const [key, group] = args;
        if (!key || !group)
          throw new Error("ERR wrong number of arguments for 'xpending'");
        if (this.isExpired(key) || !this.data.has(key)) return [0, null, null, []];
        const entry = this.data.get(key);
        if (entry.type !== "stream")
          throw new Error(
            "WRONGTYPE Operation against a key holding the wrong kind of value"
          );
        const grp = entry.groups[group];
        if (!grp || grp.pending.length === 0) return [0, null, null, []];
        const ids = grp.pending.map((p) => p.id).sort((a, b) => this.compareStreamIds(a, b));
        return [grp.pending.length, ids[0], ids[ids.length - 1], []];
      }
      cmdXInfo(args) {
        const [subcmd, key, group] = args;
        if (!subcmd || !key)
          throw new Error("ERR wrong number of arguments for 'xinfo'");
        const sub = subcmd.toUpperCase();
        if (sub === "STREAM") {
          const len = this.cmdXLen([key]);
          const entry = !this.isExpired(key) && this.data.has(key) ? this.data.get(key) : null;
          const stream = entry?.type === "stream" ? entry : null;
          const first = stream?.value[0] ?? null;
          const last = stream?.value[stream.value.length - 1] ?? null;
          return [
            "length",
            len,
            "radix-tree-keys",
            1,
            "radix-tree-nodes",
            2,
            "last-generated-id",
            last ? last.id : "0-0",
            "max-deleted-entry-id",
            "0-0",
            "entries-added",
            len,
            "recorded-first-entry-id",
            first ? first.id : "0-0",
            "first-entry",
            first ? [first.id, first.fields] : null,
            "last-entry",
            last ? [last.id, last.fields] : null,
            "groups",
            stream ? Object.keys(stream.groups).length : 0
          ];
        }
        if (sub === "GROUPS") {
          if (this.isExpired(key) || !this.data.has(key)) return [];
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          return Object.values(entry.groups).map((g) => [
            "name",
            Object.keys(entry.groups).find((k) => entry.groups[k] === g) ?? "",
            "consumers",
            Object.keys(g.consumers).length,
            "pending",
            g.pending.length,
            "last-delivered-id",
            g.lastDeliveredId,
            "entries-read",
            0,
            "lag",
            0
          ]);
        }
        if (sub === "CONSUMERS") {
          if (!group)
            throw new Error("ERR wrong number of arguments for 'xinfo|consumers'");
          if (this.isExpired(key) || !this.data.has(key)) return [];
          const entry = this.data.get(key);
          if (entry.type !== "stream")
            throw new Error(
              "WRONGTYPE Operation against a key holding the wrong kind of value"
            );
          const grp = entry.groups[group];
          if (!grp) return [];
          const now = Date.now();
          return Object.values(grp.consumers).map((c) => [
            "name",
            c.name,
            "pending",
            grp.pending.filter((p) => p.consumer === c.name).length,
            "idle",
            now - c.lastSeenAt,
            "inactive",
            now - c.lastSeenAt
          ]);
        }
        if (sub === "HELP") {
          return ["STREAM <key>", "GROUPS <key>", "CONSUMERS <key> <groupname>"];
        }
        throw new Error(`ERR unknown subcommand '${subcmd}' for 'xinfo'`);
      }
      // ============================================================================
      // OBJECT COMMAND (BullMQ uses OBJECT ENCODING)
      // ============================================================================
      cmdObject(args) {
        const [subcmd, key] = args;
        if (!subcmd) throw new Error("ERR wrong number of arguments for 'object'");
        const sub = subcmd.toUpperCase();
        if (sub === "ENCODING") {
          if (!key || this.isExpired(key) || !this.data.has(key))
            throw new Error("ERR no such key");
          const entry = this.data.get(key);
          switch (entry.type) {
            case "string": {
              const n = Number(entry.value);
              if (!isNaN(n) && Number.isInteger(n)) return "int";
              return entry.value.length <= 44 ? "embstr" : "raw";
            }
            case "list":
              return entry.value.length <= 128 ? "listpack" : "quicklist";
            case "hash":
              return Object.keys(entry.value).length <= 128 ? "listpack" : "hashtable";
            case "set":
              return entry.value.length <= 128 ? "listpack" : "hashtable";
            case "zset":
              return entry.value.length <= 128 ? "listpack" : "skiplist";
            case "stream":
              return "stream";
            default:
              return "raw";
          }
        }
        if (sub === "REFCOUNT") {
          if (!key || this.isExpired(key) || !this.data.has(key))
            throw new Error("ERR no such key");
          return 1;
        }
        if (sub === "IDLETIME") {
          if (!key || this.isExpired(key) || !this.data.has(key))
            throw new Error("ERR no such key");
          return 0;
        }
        if (sub === "FREQ") {
          if (!key || this.isExpired(key) || !this.data.has(key))
            throw new Error("ERR no such key");
          return 0;
        }
        if (sub === "HELP") {
          return [
            "ENCODING <key>",
            "REFCOUNT <key>",
            "IDLETIME <key>",
            "FREQ <key>"
          ];
        }
        throw new Error(`ERR unknown subcommand '${subcmd}' for 'object'`);
      }
    };
  }
});

// server/lib/pdimCircuitBreaker.ts
function _inGracePeriod() {
  if (_firstSuccessAt > 0) {
    return Date?.now() - _firstSuccessAt < SETTLING_MS;
  }
  return Date?.now() - _startedAt < STARTUP_GRACE_MAX_MS;
}
function _inSlowLane() {
  if (_firstSuccessAt > 0) return false;
  if (_capExpiredAt === 0) return false;
  return Date?.now() - _capExpiredAt < POST_GRACE_SLOW_MS;
}
function cbRecordFailure() {
  const nowInGrace = _inGracePeriod();
  if (nowInGrace && state === "CLOSED") {
    failures++;
    if (failures === 5 || failures === 10 || failures % 20 === 0) {
      const phaseMsg = _firstSuccessAt > 0 ? `settling (${Math.ceil((SETTLING_MS - (Date?.now() - _firstSuccessAt)) / 1e3)}s remaining)` : `waiting for first PDIM success (${Math.ceil((STARTUP_GRACE_MAX_MS - (Date?.now() - _startedAt)) / 1e3)}s cap remaining)`;
      logger.warn(
        `[PDIM] ${failures} startup failures suppressed \u2014 ${phaseMsg}`
      );
    }
    return;
  }
  if (_graceWasActive && !nowInGrace) {
    _graceWasActive = false;
    failures = 0;
    if (_firstSuccessAt === 0) {
      _capExpiredAt = Date?.now();
      logger.info(
        `[PDIM] Startup grace cap expired \u2014 entering slow-lane (${POST_GRACE_SLOW_MS / 1e3}s window, up to ${POST_GRACE_FAILURE_CAP} failures tolerated before circuit opens).`
      );
    } else {
      logger.info(
        `[PDIM] Startup grace period over \u2014 circuit-breaker threshold reset; post-grace errors will be evaluated against the 5-failure threshold.`
      );
    }
  }
  if (state === "CLOSED" && _inSlowLane()) {
    failures++;
    const slowRemaining = Math.ceil(
      (POST_GRACE_SLOW_MS - (Date?.now() - _capExpiredAt)) / 1e3
    );
    if (failures === 10 || failures % 25 === 0) {
      logger.warn(
        `[PDIM] ${failures} slow-lane failures (${POST_GRACE_FAILURE_CAP - failures} remaining before open, ${slowRemaining}s window left) \u2014 PDIM still waking up`
      );
    }
    if (failures < POST_GRACE_FAILURE_CAP) return;
    logger.warn(
      `[PDIM] Slow-lane failure cap reached (${POST_GRACE_FAILURE_CAP}) \u2014 applying normal threshold`
    );
  }
  failures++;
  const shouldOpen = state === "CLOSED" && failures >= 5 || state === "HALF_OPEN";
  if (shouldOpen) {
    state = "OPEN";
    _halfOpenFlight = false;
    _openUntil = Date.now() + _backoffMs;
    if (failures <= 10 || failures % 10 === 0) {
      logger.warn(
        `[PDIM] Circuit OPEN \u2014 backing off ${_backoffMs / 1e3}s after ${failures} failure(s)`
      );
    }
    _backoffMs = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);
  }
}
function cbRecordSuccess() {
  const wasOpen = state !== "CLOSED";
  failures = 0;
  _backoffMs = INITIAL_BACKOFF_MS;
  state = "CLOSED";
  _halfOpenFlight = false;
  if (_firstSuccessAt === 0) {
    _firstSuccessAt = Date.now();
    const warmMs = _firstSuccessAt - _startedAt;
    logger.info(
      `[PDIM] First successful response after ${warmMs}ms \u2014 entering 10s settling window`
    );
  }
  if (wasOpen) {
    logger.info("[PDIM] Circuit CLOSED \u2014 connection restored");
  }
}
function cbAllowRequest() {
  if (state === "CLOSED") return true;
  if (state === "OPEN") {
    if (Date.now() >= _openUntil) {
      state = "HALF_OPEN";
      const now = Date?.now();
      if (now - _lastProbeLogAt >= 6e4) {
        _lastProbeLogAt = now;
        logger.info("[PDIM] Circuit HALF-OPEN \u2014 sending probe request");
      }
    } else {
      return false;
    }
  }
  if (state === "HALF_OPEN") {
    if (_halfOpenFlight) return false;
    _halfOpenFlight = true;
    return true;
  }
  return false;
}
function cbIsOpen() {
  if (state === "OPEN") return Date?.now() < _openUntil;
  if (state === "HALF_OPEN") return _halfOpenFlight;
  return false;
}
function cbGetState() {
  return state;
}
function cbForceClose() {
  const wasOpen = state !== "CLOSED";
  state = "CLOSED";
  failures = 0;
  _backoffMs = Math.max(MIN_FORCE_CLOSE_BACKOFF_MS, Math.floor(_backoffMs / 2));
  _openUntil = 0;
  _halfOpenFlight = false;
  if (wasOpen) {
    logger.info(
      `[PDIM] Circuit force-CLOSED \u2014 external recovery signal received; next failure cycle backoff starts at ${_backoffMs / 1e3}s`
    );
  }
}
function cbHalfOpenFailed() {
  _halfOpenFlight = false;
}
var _lastProbeLogAt, INITIAL_BACKOFF_MS, MAX_BACKOFF_MS, MIN_FORCE_CLOSE_BACKOFF_MS, state, failures, _openUntil, _backoffMs, _halfOpenFlight, _graceWasActive, STARTUP_GRACE_MAX_MS, SETTLING_MS, POST_GRACE_SLOW_MS, POST_GRACE_FAILURE_CAP, _startedAt, _firstSuccessAt, _capExpiredAt;
var init_pdimCircuitBreaker = __esm({
  "server/lib/pdimCircuitBreaker.ts"() {
    "use strict";
    init_logger();
    _lastProbeLogAt = 0;
    INITIAL_BACKOFF_MS = 5e3;
    MAX_BACKOFF_MS = 12e4;
    MIN_FORCE_CLOSE_BACKOFF_MS = INITIAL_BACKOFF_MS * 4;
    state = "CLOSED";
    failures = 0;
    _openUntil = 0;
    _backoffMs = INITIAL_BACKOFF_MS;
    _halfOpenFlight = false;
    _graceWasActive = true;
    STARTUP_GRACE_MAX_MS = 2e4;
    SETTLING_MS = 1e4;
    POST_GRACE_SLOW_MS = 3e4;
    POST_GRACE_FAILURE_CAP = 15;
    _startedAt = Date?.now();
    _firstSuccessAt = 0;
    _capExpiredAt = 0;
  }
});

// server/lib/luaExecutor.ts
import { Worker as Worker2 } from "worker_threads";
import { Unpackr } from "msgpackr";
function _luaComputeBackoff() {
  if (_luaConsecutivePdimErrors < 2) return 0;
  return Math.min(
    LUA_PDIM_ERR_BACKOFF_CAP_MS,
    500 * Math.pow(2, _luaConsecutivePdimErrors - 2)
  );
}
async function _acquireWorkerSlot() {
  if (_activeWorkers < MAX_CONCURRENT_WORKERS) {
    _activeWorkers++;
    return;
  }
  if (_waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error(
      "[LuaExecutor] Wait queue saturated \u2014 shedding BullMQ request (backpressure)"
    );
  }
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
async function execLuaViaPdim(pdimExec, script, numKeys, allArgs) {
  const keys = allArgs?.slice(0, numKeys).map(String);
  const argv = allArgs?.slice(numKeys).map((arg) => {
    if (arg instanceof Buffer || arg instanceof Uint8Array) {
      try {
        return _msgUnpacker?.unpack(arg);
      } catch {
        return Buffer?.from(arg).toString("binary");
      }
    }
    if (arg === null || arg === void 0) return "";
    return typeof arg === "string" ? arg : String(arg);
  });
  if (_luaConsecutivePdimErrors >= 2) {
    const preflightWaitMs = _luaComputeBackoff();
    if (preflightWaitMs > 0) {
      logger.debug(
        `[LuaExecutor] pre-flight backoff ${preflightWaitMs}ms (${_luaConsecutivePdimErrors} consecutive PDIM errors)`
      );
      await new Promise((r) => setTimeout(r, preflightWaitMs));
    }
  }
  if (cbIsOpen()) {
    await new Promise((r) => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    return [];
  }
  await _acquireWorkerSlot();
  if (cbIsOpen()) {
    await new Promise((r) => setTimeout(r, CIRCUIT_OPEN_BACKOFF_MS));
    _releaseWorkerSlot();
    return [];
  }
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
    const worker = new Worker2(WORKER_CODE, {
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
          logger.debug(
            `[LuaExecutor] watchdog 90s tick \u2014 semaphore already externally reset (elapsed ${elapsedS}s); skipping hard-kill`
          );
          _watchdogCancelled = true;
          clearInterval(watchdog);
          return;
        }
        logger.error(
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
          logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s \u2014 semaphore was externally reset (active counter zeroed by ChainFixer)`
          );
          return;
        }
        if (_luaRegistrationMode) {
          logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s \u2014 registration in progress (active=${_activeWorkers}, queued=${_waitQueue?.length})`
          );
          return;
        }
        if (Date.now() - _executorBootTs < 12e4) {
          logger.debug(
            `[LuaExecutor] script still running after ${elapsedS}s \u2014 boot settling window (active=${_activeWorkers}, queued=${_waitQueue?.length})`
          );
          return;
        }
        try {
          const { getPdimQueueDepth: getPdimQueueDepth2 } = await Promise.resolve().then(() => (init_pdimClient(), pdimClient_exports));
          const depth = getPdimQueueDepth2();
          if (depth > 100) {
            logger.debug(
              `[LuaExecutor] script paused ${elapsedS}s \u2014 PDIM back-pressure (${depth} queued, active=${_activeWorkers})`
            );
            return;
          }
        } catch {
        }
        logger.warn(
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
          }
          if (cmd === "HGETALL" && r && typeof r === "object" && !Array.isArray(r)) {
            const flat = [];
            for (const [k, v] of Object.entries(r)) {
              flat.push(k, v == null ? "" : String(v));
            }
            r = flat;
          }
          payload = JSON.stringify(r ?? null);
          status = 1;
        } catch (e) {
          const short = e.message.slice(0, 200);
          if (short.includes("429") || short.includes("500") || short.includes("502") || short.includes("Circuit OPEN") || short.includes("timeout") || short.includes("aborted") || short.includes("Timeout") || short.includes("Abort")) {
            logger.debug(`[LuaExecutor] redis.call(${msg.cmd}) \u2192 ${short}`);
          } else {
            logger.warn(`[LuaExecutor] redis.call(${msg.cmd}) \u2192 ${short}`);
          }
          payload = `ERR ${short}`;
          status = 2;
        }
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
        }
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
          }
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
var _msgUnpacker, MAX_CONCURRENT_WORKERS, _maxWaitMs, MAX_QUEUE_SIZE, CIRCUIT_OPEN_BACKOFF_MS, _luaConsecutivePdimErrors, LUA_PDIM_ERR_BACKOFF_CAP_MS, _executorBootTs, _activeWorkers, _waitQueue, _luaRegistrationMode, _projectRoot, _wasmoonUrl, _msgpackrUrl, WORKER_CODE;
var init_luaExecutor = __esm({
  "server/lib/luaExecutor.ts"() {
    "use strict";
    init_logger();
    init_pdimCircuitBreaker();
    _msgUnpacker = new Unpackr({ useRecords: false });
    MAX_CONCURRENT_WORKERS = 1;
    _maxWaitMs = 9e4;
    MAX_QUEUE_SIZE = 5e3;
    CIRCUIT_OPEN_BACKOFF_MS = 5e3;
    _luaConsecutivePdimErrors = 0;
    LUA_PDIM_ERR_BACKOFF_CAP_MS = 8e3;
    _executorBootTs = Date.now();
    _activeWorkers = 0;
    _waitQueue = [];
    _luaRegistrationMode = false;
    _projectRoot = process.cwd();
    _wasmoonUrl = `file://${_projectRoot}/node_modules/wasmoon/dist/index.js`;
    _msgpackrUrl = `file://${_projectRoot}/node_modules/msgpackr/dist/node.cjs`;
    WORKER_CODE = `
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
  }
});

// server/lib/pdimClient.ts
var pdimClient_exports = {};
__export(pdimClient_exports, {
  PdimRedisClient: () => PdimRedisClient,
  getPdimAdaptiveGapMs: () => getPdimAdaptiveGapMs,
  getPdimClient: () => getPdimClient,
  getPdimDirectQueueDepth: () => getPdimDirectQueueDepth,
  getPdimGapFloor: () => getPdimGapFloor,
  getPdimQueueDepth: () => getPdimQueueDepth,
  getPdimScriptQueueDepth: () => getPdimScriptQueueDepth,
  isPdimConfigured: () => isPdimConfigured,
  setPdimAdaptiveGap: () => setPdimAdaptiveGap,
  setPdimGapFloor: () => setPdimGapFloor,
  startPdimDirectProber: () => startPdimDirectProber
});
import { EventEmitter as EventEmitter2 } from "events";
import os from "os";
function setPdimGapFloor(ms) {
  _PDIM_GAP_FLOOR_MS = Math.max(
    _PDIM_GAP_FLOOR_WORKER_MIN,
    Math.min(2e3, Math.round(ms))
  );
  if (_pdimGapMs < _PDIM_GAP_FLOOR_MS) _pdimGapMs = _PDIM_GAP_FLOOR_MS;
}
function getPdimGapFloor() {
  return _PDIM_GAP_FLOOR_MS;
}
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
function getPdimAdaptiveGapMs() {
  return _pdimGapMs;
}
function getPdimQueueDepth() {
  return _pdimQueueDepth;
}
function getPdimDirectQueueDepth() {
  return _directQueueDepth;
}
function getPdimScriptQueueDepth() {
  return _scriptQueueDepth;
}
function setPdimAdaptiveGap(ms) {
  _pdimGapMs = Math.max(_PDIM_GAP_FLOOR_MS, Math.min(_PDIM_GAP_CEIL_MS, ms));
}
function _enqueueExec(fn) {
  const gapForFastFail = Math.min(_pdimGapMs, _PDIM_GAP_FLOOR_MS * 8);
  const perLaneDirectWaitMs = _directQueueDepth / _PDIM_DIRECT_LANES * gapForFastFail;
  const estimatedWaitMs = perLaneDirectWaitMs + _scriptQueueDepth * 10;
  if (estimatedWaitMs > _MAX_DIRECT_WAIT_MS) {
    const now = Date?.now();
    if (now - _fastFailLoggedAt > 5e3) {
      _fastFailLoggedAt = now;
      logger.warn(
        `[PDIM] Direct-call fast-fail \u2014 est. queue wait ${Math.round(estimatedWaitMs)}ms (${_directQueueDepth} direct / ${_PDIM_DIRECT_LANES} lanes \xD7 ${gapForFastFail}ms capped [live=${_pdimGapMs}ms] + ${_scriptQueueDepth} script \xD7 10ms) > ${_MAX_DIRECT_WAIT_MS}ms threshold; caller falls back to PG/in-memory`
      );
    }
    return Promise?.reject(
      new Error(
        `[PDIM] Chain congested \u2014 est. wait ${Math.round(estimatedWaitMs)}ms exceeds ${_MAX_DIRECT_WAIT_MS}ms; use fallback`
      )
    );
  }
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
function _logExecError(cmd, status, msg) {
  const now = Date.now();
  const withinWindow = now - _lastExecErrorLoggedAt < _EXEC_DEDUP_WINDOW_MS;
  if (withinWindow && status === _lastExecErrorStatus) {
    _suppressedExecErrors++;
    if (_suppressedExecErrors % 20 === 0) {
      logger.warn(
        `[PDIM] exec error [${String(cmd)}]: HTTP ${status} suppressed \xD7${_suppressedExecErrors} (same error within ${_EXEC_DEDUP_WINDOW_MS / 1e3}s window)`
      );
    }
    return;
  }
  if (_suppressedExecErrors > 0) {
    logger.warn(
      `[PDIM] exec error [${String(cmd)}]: ${msg} (+ ${_suppressedExecErrors} suppressed identical errors)`
    );
    _suppressedExecErrors = 0;
  } else {
    logger.warn(`[PDIM] exec error [${String(cmd)}]: ${msg}`);
  }
  _lastExecErrorStatus = status;
  _lastExecErrorLoggedAt = now;
}
function _logNetworkError(cmd, msg) {
  const now = Date.now();
  const sameMsg = msg === _lastNetErrorMsg;
  const withinWindow = now - _lastNetErrorLoggedAt < _NET_ERROR_DEDUP_MS;
  if (sameMsg && withinWindow) {
    _suppressedNetErrors++;
    if (_suppressedNetErrors % 50 === 0) {
      logger.warn(
        `[PDIM] exec error [${String(cmd)}]: ${msg} \u2014 suppressed \xD7${_suppressedNetErrors} in last ${_NET_ERROR_DEDUP_MS / 1e3}s`
      );
    }
    return;
  }
  if (_suppressedNetErrors > 0) {
    logger.warn(
      `[PDIM] exec error [${String(cmd)}]: ${_lastNetErrorMsg} (+ ${_suppressedNetErrors} suppressed in last ${_NET_ERROR_DEDUP_MS / 1e3}s)`
    );
    _suppressedNetErrors = 0;
  } else {
    logger.warn(`[PDIM] exec error [${String(cmd)}]: ${msg}`);
  }
  _lastNetErrorMsg = msg;
  _lastNetErrorLoggedAt = now;
}
function _l1Read(key) {
  const e = _l1.get(key);
  if (!e) return void 0;
  if (Date.now() > e.expiresAt) {
    _l1.delete(key);
    return void 0;
  }
  _l1.delete(key);
  _l1.set(key, e);
  return e.value;
}
function _l1Write(key, value) {
  if (_l1.size >= L1_MAX_ENTRIES && !_l1.has(key)) {
    const oldest = _l1.keys().next().value;
    if (oldest !== void 0) _l1.delete(oldest);
  }
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
  }
  const out = {};
  for (const k of keys) out[k] = _normalizeLuaResult(obj[k]);
  return out;
}
function getPdimClient() {
  if (!_pdimInstance) {
    _pdimInstance = new PdimRedisClient();
    startPdimDirectProber();
  }
  return _pdimInstance;
}
function isPdimConfigured() {
  const execUrl = process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
  if (!execUrl) return false;
  const isLocal = isLocalPdimExecUrl(execUrl);
  return isLocal || !!(process.env.PDIM_EXEC_TOKEN || process.env.PDIM_BEARER_TOKEN);
}
function isLocalPdimExecUrl(execUrl) {
  try {
    return new URL(execUrl).origin === loopbackUrl(runtimePorts.localPdim);
  } catch {
    return false;
  }
}
function startPdimDirectProber() {
  if (_directProbeTimer) return;
  const pdimUrl = process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
  const pdimToken = process.env.PDIM_EXEC_TOKEN || process.env.PDIM_BEARER_TOKEN || "";
  if (!pdimUrl) return;
  const isLocal = isLocalPdimExecUrl(pdimUrl);
  if (!isLocal && !pdimToken) return;
  _directProbeTimer = setInterval(async () => {
    const state2 = cbGetState();
    if (state2 === "CLOSED") return;
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
        if (pong && cbGetState() !== "CLOSED") {
          logger.info(
            `[PDIM] Direct HTTP probe OK (HTTP ${res.status}) \u2014 force-closing circuit breaker`
          );
          cbForceClose();
        } else if (!pong) {
          logger.debug(
            `[PDIM] Direct probe returned HTTP ${res.status} without PONG (circuit stays ${cbGetState()})`
          );
        }
      } else {
        logger.debug(
          `[PDIM] Direct probe: HTTP ${res.status} content-type=${res.headers.get("content-type") ?? "none"} (circuit stays ${cbGetState()})`
        );
      }
    } catch (err) {
      logger.debug(`[PDIM] Direct probe error: ${err.message}`);
    }
  }, DIRECT_PROBE_INTERVAL_MS);
  _directProbeTimer.unref?.();
}
var clusterWorkers, cpuCores, autoMultiplier, _PDIM_GAP_FLOOR_BASE_MS, _PDIM_GAP_FLOOR_WORKER_MIN, _PDIM_GAP_FLOOR_MS, _PDIM_GAP_CEIL_MS, _PDIM_GAP_INIT_MS, _PDIM_MULT_429, _PDIM_JITTER_INIT_MS, _pdimGapMs, _pdimQueueDepth, _PDIM_DIRECT_LANES, _pdimDirectChains, _pdimDirectLaneRR, _pdimScriptChain, _directQueueDepth, _scriptQueueDepth, _MAX_DIRECT_WAIT_MS, _fastFailLoggedAt, _last429At, _PASSIVE_DECAY_INTERVAL_MS, _PASSIVE_DECAY_FACTOR, _PASSIVE_DECAY_IDLE_QUIET_MS, _SCRIPT_CALL_GAP_MS, _429_DEDUP_MS, _last429LoggedAt, _suppressed429Count, _EXEC_DEDUP_WINDOW_MS, _lastExecErrorStatus, _lastExecErrorLoggedAt, _suppressedExecErrors, _NET_ERROR_DEDUP_MS, _lastNetErrorMsg, _lastNetErrorLoggedAt, _suppressedNetErrors, L1_MAX_ENTRIES, L1_TTL_MS, _l1, PdimRedisClient, _pdimInstance, DIRECT_PROBE_INTERVAL_MS, DIRECT_PROBE_TIMEOUT_MS, PDIM_EXEC_TIMEOUT_MS, _directProbeTimer;
var init_pdimClient = __esm({
  "server/lib/pdimClient.ts"() {
    "use strict";
    init_logger();
    init_ports();
    init_luaExecutor();
    init_pdimCircuitBreaker();
    clusterWorkers = Math.max(
      1,
      parseInt(process.env.PDIM_CLUSTER_WORKERS ?? "1", 10)
    );
    cpuCores = Math.max(1, os?.cpus().length);
    autoMultiplier = clusterWorkers * Math.max(1, Math.ceil(cpuCores / 2));
    _PDIM_GAP_FLOOR_BASE_MS = 6;
    _PDIM_GAP_FLOOR_WORKER_MIN = Math.max(
      _PDIM_GAP_FLOOR_BASE_MS,
      clusterWorkers * _PDIM_GAP_FLOOR_BASE_MS
    );
    _PDIM_GAP_FLOOR_MS = _PDIM_GAP_FLOOR_WORKER_MIN;
    _PDIM_GAP_CEIL_MS = 2e3;
    _PDIM_GAP_INIT_MS = 1;
    _PDIM_MULT_429 = 2.5;
    logger.info(
      `[PDIM] Auto multiplier: ${autoMultiplier} (clusterWorkers=${clusterWorkers} \xD7 ceil(cpuCores=${cpuCores}/2)=${Math.max(1, Math.ceil(cpuCores / 2))}) \u2014 AIMD init=1ms, floor=${_PDIM_GAP_FLOOR_MS}ms (${clusterWorkers}workers\xD7${_PDIM_GAP_FLOOR_BASE_MS}ms, combined\u2264${Math.round(1e3 / _PDIM_GAP_FLOOR_BASE_MS)} req/s), ZPOPMIN gap=${Math.max(1, autoMultiplier)}ms`
    );
    _PDIM_JITTER_INIT_MS = clusterWorkers <= 1 ? 0 : 1500;
    _pdimGapMs = _PDIM_GAP_INIT_MS + Math.floor(Math.random() * _PDIM_JITTER_INIT_MS);
    _pdimQueueDepth = 0;
    _PDIM_DIRECT_LANES = clusterWorkers <= 1 ? 8 : 2;
    _pdimDirectChains = Array.from(
      { length: _PDIM_DIRECT_LANES },
      () => Promise.resolve()
    );
    _pdimDirectLaneRR = 0;
    _pdimScriptChain = Promise.resolve();
    _directQueueDepth = 0;
    _scriptQueueDepth = 0;
    _MAX_DIRECT_WAIT_MS = 2500;
    _fastFailLoggedAt = 0;
    _last429At = 0;
    _PASSIVE_DECAY_INTERVAL_MS = 2e3;
    _PASSIVE_DECAY_FACTOR = 0.8;
    _PASSIVE_DECAY_IDLE_QUIET_MS = 5e3;
    setInterval(() => {
      if (_pdimGapMs <= _PDIM_GAP_FLOOR_MS) return;
      if (_last429At > 0 && Date?.now() - _last429At < _PASSIVE_DECAY_IDLE_QUIET_MS)
        return;
      _pdimGapMs = Math.max(
        _PDIM_GAP_FLOOR_MS,
        Math.floor(_pdimGapMs * _PASSIVE_DECAY_FACTOR)
      );
    }, _PASSIVE_DECAY_INTERVAL_MS).unref();
    _SCRIPT_CALL_GAP_MS = 10;
    _429_DEDUP_MS = 2e3;
    _last429LoggedAt = 0;
    _suppressed429Count = 0;
    _EXEC_DEDUP_WINDOW_MS = 3e4;
    _lastExecErrorStatus = -1;
    _lastExecErrorLoggedAt = 0;
    _suppressedExecErrors = 0;
    _NET_ERROR_DEDUP_MS = 1e4;
    _lastNetErrorMsg = "";
    _lastNetErrorLoggedAt = 0;
    _suppressedNetErrors = 0;
    L1_MAX_ENTRIES = 2e3;
    L1_TTL_MS = 5 * 60 * 1e3;
    _l1 = /* @__PURE__ */ new Map();
    PdimRedisClient = class _PdimRedisClient extends EventEmitter2 {
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
        }
        setImmediate(() => {
          if (this.disconnected) return;
          this.emit("connect");
          this.emit("ready");
          logger.info("\u2705 [PDIM] Connected via HTTP exec endpoint");
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
            }
            if (!response.ok) {
              const text3 = await response.text().catch(() => "");
              throw new Error(`PDIM Pub/Sub HTTP ${response.status}: ${text3.slice(0, 200)}`);
            }
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
              }
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
            }
            await reader?.cancel().catch(() => {
            });
            if (!initialReady) rejectBeforeReady(error);
            this.emit("pubsub-error", error);
            logger.warn(
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
        if (Date?.now() >= _PdimRedisClient?._rateLimitedUntil) {
          _PdimRedisClient._rateLimitedUntil = 0;
        }
      }
      // 429 setter — monotonic: never lowers an existing future deadline.  Without
      // this guard, two lanes racing on 429s with jittered holds could let the
      // shorter jitter overwrite the longer one and release callers early.
      static _set429Deadline(deadlineMs) {
        if (deadlineMs > _PdimRedisClient?._rateLimitedUntil) {
          _PdimRedisClient._rateLimitedUntil = deadlineMs;
        }
      }
      exec(command, options = {}) {
        if (this.disconnected) return Promise.reject(this.disconnectedError);
        const [cmd, ...rawArgs] = command;
        if (rawArgs.some((arg) => arg === null || arg === void 0)) {
          throw new TypeError(`[PDIM] ${String(cmd)} received a nullish command argument`);
        }
        const args = rawArgs.map((arg) => String(arg));
        if (!cbAllowRequest()) {
          throw new Error(
            `[PDIM] Circuit OPEN \u2014 ${cmd} rejected (backing off until PDIM recovers)`
          );
        }
        const run = async () => {
          this.assertConnected();
          const rlWait = _PdimRedisClient?._rateLimitedUntil - Date?.now();
          if (rlWait > 0) {
            await this.delay(rlWait);
          }
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
              const text3 = await res.text().catch(() => "");
              if (res.status === 429) {
                const newGap = _pdimAdapt429();
                let retryAfterMs = 0;
                const retryAfterHdr = res.headers.get("retry-after");
                if (retryAfterHdr) {
                  const secs = parseFloat(retryAfterHdr);
                  if (!isNaN(secs) && secs > 0)
                    retryAfterMs = Math.ceil(secs * 1e3);
                }
                const holdMs = Math.max(newGap, retryAfterMs);
                _PdimRedisClient?._set429Deadline(
                  Date?.now() + holdMs + Math.floor(Math.random() * 500)
                );
                const errMsg = `PDIM HTTP 429: Too many requests (gap\u2192${newGap}ms${retryAfterMs > 0 ? `, retry-after=${retryAfterMs}ms` : ""})`;
                counted = true;
                const now429 = Date?.now();
                if (now429 - _last429LoggedAt < _429_DEDUP_MS) {
                  _suppressed429Count++;
                } else {
                  if (_suppressed429Count > 0) {
                    logger.warn(
                      `[PDIM] exec error [${cmd}]: PDIM HTTP 429 \u2014 gap\u2192${newGap}ms (+ ${_suppressed429Count} suppressed in last ${_429_DEDUP_MS}ms burst)`
                    );
                    _suppressed429Count = 0;
                  } else {
                    logger.warn(
                      `[PDIM] exec error [${cmd}]: PDIM HTTP 429 \u2014 gap\u2192${newGap}ms`
                    );
                  }
                  _last429LoggedAt = now429;
                }
                throw new Error(errMsg);
              }
              if (res.status >= 300 && res.status < 400) {
                cbRecordFailure();
                counted = true;
                const errMsg = `PDIM HTTP ${res.status}: service temporarily unreachable`;
                _logExecError(cmd, res.status, errMsg);
                throw new Error(errMsg);
              }
              if (res.status >= 500) {
                cbRecordFailure();
                counted = true;
                const errMsg = `PDIM HTTP ${res.status}: ${text3.slice(0, 120)}`;
                _logExecError(cmd, res.status, errMsg);
                throw new Error(errMsg);
              }
              counted = true;
              _PdimRedisClient._clearRateLimitIfExpired();
              _pdimAdaptSuccess();
              cbRecordSuccess();
              throw new Error(
                `PDIM HTTP ${res.status} (${String(cmd)}): ${text3.slice(0, 200)}`
              );
            }
            _PdimRedisClient._clearRateLimitIfExpired();
            _pdimAdaptSuccess();
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType?.includes("application/json")) {
              const body = await res.text().catch(() => "(unreadable)");
              cbRecordFailure();
              counted = true;
              const errMsg = `PDIM returned non-JSON (${contentType?.split(";")[0].trim() || "unknown type"}): ${body?.slice(0, 80)}`;
              _logExecError(cmd, 200, errMsg);
              throw new Error(errMsg);
            }
            const data = await res.json();
            counted = true;
            cbRecordSuccess();
            if (data !== null && typeof data === "object") {
              if ("result" in data) return data?.result;
              if ("error" in data) {
                const errMsg = String(data?.error);
                if (errMsg?.startsWith("ERR unknown command")) {
                  throw new Error(errMsg);
                }
                throw new Error(errMsg);
              }
            }
            return data;
          } catch (err) {
            if (this.disconnected) throw this.disconnectedError;
            const isTimeout = !counted && (err?.name === "TimeoutError" || err?.name === "AbortError");
            const isCircuitMsg = !counted && err?.message.startsWith("[PDIM] Circuit");
            if (!counted && !isTimeout && !isCircuitMsg) {
              cbRecordFailure();
            } else if (isTimeout) {
              _pdimAdaptTimeout();
            }
            if (!counted) {
              _logNetworkError(cmd, err.message.slice(0, 200));
            }
            cbHalfOpenFailed();
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
                }
                return command.map((arg) => String(arg));
              });
              const reply = await self.exec([
                "__PDIM_MULTI_EXEC",
                JSON.stringify(commands)
              ]);
              if (!Array.isArray(reply) || reply.length !== commands.length) {
                throw new Error("[PDIM] invalid transaction response");
              }
              return reply.map((item) => {
                if (!Array.isArray(item) || item.length !== 2) {
                  throw new Error("[PDIM] invalid transaction result tuple");
                }
                const [rawError, value] = item;
                if (rawError === null || rawError === void 0) {
                  return [null, value];
                }
                const errorValue = typeof rawError === "object" && rawError !== null ? rawError : { message: rawError };
                const error = new Error(String(errorValue.message ?? rawError));
                if (typeof errorValue.name === "string") error.name = errorValue.name;
                if (typeof errorValue.code === "string") {
                  Object.assign(error, { code: errorValue.code });
                }
                return [error, null];
              });
            }
            const results = [];
            for (const c of cmds) {
              try {
                results?.push(await self?.exec(c));
              } catch (e) {
                results?.push(e);
              }
            }
            return results;
          }
        };
        return pipe;
      }
      multi() {
        return this.createPipeline(true);
      }
      duplicate() {
        return new _PdimRedisClient(this.execUrl, this.bearerToken);
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
          }
          const result = await execLuaViaPdim(
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
        }
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
        }
        const strArgs = rawArgs.map((a) => String(a));
        if (!cbAllowRequest()) {
          throw new Error(`[PDIM] Circuit OPEN \u2014 ${cmd} (script) rejected`);
        }
        return this.awaitOrDisconnect(_enqueueScriptExec(async () => {
          this.assertConnected();
          const rlWait = _PdimRedisClient?._rateLimitedUntil - Date?.now();
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
              const text3 = await res.text().catch(() => "");
              if (res.status === 429) {
                const newGap = _pdimAdapt429();
                _PdimRedisClient?._set429Deadline(Date?.now() + newGap);
                throw new Error(`PDIM HTTP 429 (script ${cmd}): gap\u2192${newGap}ms`);
              }
              if (res.status >= 300 && res.status < 400) {
                cbRecordFailure();
                counted = true;
                throw new Error(`PDIM HTTP ${res.status} (script ${cmd}): service temporarily unreachable`);
              }
              if (res.status >= 500) {
                cbRecordFailure();
                counted = true;
                throw new Error(`PDIM HTTP ${res.status} (script ${cmd}): ${text3?.slice(0, 200)}`);
              }
              counted = true;
              _PdimRedisClient._clearRateLimitIfExpired();
              _pdimAdaptSuccess();
              cbRecordSuccess();
              throw new Error(
                `PDIM HTTP ${res.status} (script ${String(cmd)}): ${text3.slice(0, 200)}`
              );
            }
            _PdimRedisClient?._clearRateLimitIfExpired();
            _pdimAdaptSuccess();
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType?.includes("application/json")) {
              const body = await res.text().catch(() => "(unreadable)");
              cbRecordFailure();
              counted = true;
              throw new Error(
                `PDIM non-JSON (script ${cmd}): ${body?.slice(0, 80)}`
              );
            }
            const data = await res.json();
            counted = true;
            cbRecordSuccess();
            if (data !== null && typeof data === "object") {
              if ("result" in data) return data?.result;
              if ("error" in data) {
                const errMsg = String(data?.error);
                if (errMsg?.startsWith("ERR unknown command")) {
                  throw new Error(errMsg);
                }
                throw new Error(errMsg);
              }
            }
            return data;
          } catch (err) {
            if (this.disconnected) throw this.disconnectedError;
            const isTimeout = !counted && (err?.name === "TimeoutError" || err?.name === "AbortError");
            const isCircuitMsg = !counted && err?.message?.startsWith("[PDIM] Circuit");
            if (!counted && !isTimeout && !isCircuitMsg) {
              cbRecordFailure();
            } else if (isTimeout) {
              _pdimAdaptTimeout();
            }
            cbHalfOpenFailed();
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
        }
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
      async lindex(key, index3) {
        return this.exec(["LINDEX", key, index3]);
      }
      async lset(key, index3, value) {
        return this.exec(["LSET", key, index3, value]);
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
        }
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
        }
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
        const subscriptions2 = kind === "channel" ? this.pubSubChannels : this.pubSubPatterns;
        const names = [...new Set(requestedNames)];
        if (add && names.length === 0) {
          throw new TypeError(`${kind === "channel" ? "SUBSCRIBE" : "PSUBSCRIBE"} requires a name`);
        }
        const changedNames = add ? names.filter((name) => !subscriptions2.has(name)) : names.length === 0 ? [...subscriptions2] : names.filter((name) => subscriptions2.has(name));
        if (add) {
          for (const name of changedNames) subscriptions2.add(name);
        } else if (names.length === 0) {
          subscriptions2.clear();
        } else {
          for (const name of changedNames) subscriptions2.delete(name);
        }
        const count = () => this.pubSubChannels.size + this.pubSubPatterns.size;
        try {
          if (changedNames.length > 0) await this.refreshPubSubStream();
        } catch (error) {
          callback?.(error instanceof Error ? error : new Error(String(error)), count());
          throw error;
        }
        const total = count();
        const eventName = add ? kind === "channel" ? "subscribe" : "psubscribe" : kind === "channel" ? "unsubscribe" : "punsubscribe";
        for (let index3 = 0; index3 < changedNames.length; index3++) {
          const acknowledgedCount = add ? total - changedNames.length + index3 + 1 : total + changedNames.length - index3 - 1;
          this.emit(eventName, changedNames[index3], acknowledgedCount);
        }
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
    _pdimInstance = null;
    DIRECT_PROBE_INTERVAL_MS = 15e3;
    DIRECT_PROBE_TIMEOUT_MS = 5e3;
    PDIM_EXEC_TIMEOUT_MS = 4e3;
    _directProbeTimer = null;
  }
});

// server/pocket-dimension/fabric/compression/AwarenessProfiler.ts
function matchesSignature(data, sig) {
  const offset = sig.offset ?? 0;
  if (data.length < offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (data[offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}
function isRiffWebp(data) {
  if (data.length < RIFF_FORMAT_TAG_OFFSET + WEBP_TAG.length) return false;
  for (let i = 0; i < RIFF_MAGIC.length; i++) {
    if (data[i] !== RIFF_MAGIC[i]) return false;
  }
  for (let i = 0; i < WEBP_TAG.length; i++) {
    if (data[RIFF_FORMAT_TAG_OFFSET + i] !== WEBP_TAG[i]) return false;
  }
  return true;
}
function detectMagicFormat(data) {
  if (isRiffWebp(data)) return "webp";
  for (const sig of MAGIC_SIGNATURES) {
    if (matchesSignature(data, sig)) return sig.format;
  }
  return null;
}
function shannonEntropy(sample) {
  if (sample.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < sample.length; i++) counts[sample[i]]++;
  let entropy = 0;
  const total = sample.length;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / (total || 1);
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
function looksLikeText(sample) {
  if (sample.length === 0) return true;
  let printable = 0;
  const checkLen = Math.min(sample.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    const b = sample[i];
    if (b >= 32 && b <= 126 || b === 9 || b === 10 || b === 13 || b >= 128) {
      printable++;
    }
  }
  return printable / checkLen > 0.95;
}
var MAX_SAMPLE_BYTES, HIGH_ENTROPY_THRESHOLD, MAGIC_SIGNATURES, RIFF_MAGIC, WEBP_TAG, RIFF_FORMAT_TAG_OFFSET, AwarenessProfiler, awarenessProfiler;
var init_AwarenessProfiler = __esm({
  "server/pocket-dimension/fabric/compression/AwarenessProfiler.ts"() {
    "use strict";
    MAX_SAMPLE_BYTES = 256 * 1024;
    HIGH_ENTROPY_THRESHOLD = 7.85;
    MAGIC_SIGNATURES = [
      { format: "gzip", bytes: [31, 139] },
      { format: "zip", bytes: [80, 75, 3, 4] },
      { format: "zip-empty", bytes: [80, 75, 5, 6] },
      { format: "zstd", bytes: [40, 181, 47, 253] },
      { format: "xz", bytes: [253, 55, 122, 88, 90, 0] },
      { format: "bzip2", bytes: [66, 90, 104] },
      { format: "7z", bytes: [55, 122, 188, 175, 39, 28] },
      { format: "rar", bytes: [82, 97, 114, 33] },
      { format: "brotli-pdcf", bytes: [80, 68, 67, 70] },
      // our own container, if double-wrapped
      { format: "png", bytes: [137, 80, 78, 71] },
      { format: "jpeg", bytes: [255, 216, 255] },
      { format: "gif", bytes: [71, 73, 70, 56] },
      { format: "mp3-id3", bytes: [73, 68, 51] },
      { format: "mp3-frame", bytes: [255, 251] },
      { format: "flac", bytes: [102, 76, 97, 67] },
      { format: "ogg", bytes: [79, 103, 103, 83] },
      { format: "mp4", bytes: [102, 116, 121, 112], offset: 4 },
      { format: "webm-mkv", bytes: [26, 69, 223, 163] }
    ];
    RIFF_MAGIC = [82, 73, 70, 70];
    WEBP_TAG = [87, 69, 66, 80];
    RIFF_FORMAT_TAG_OFFSET = 8;
    AwarenessProfiler = class {
      profile(data, contentTypeFormatHint) {
        const sampleLen = Math.min(data.length, MAX_SAMPLE_BYTES);
        const sample = data.subarray(0, sampleLen);
        const detectedFormat = contentTypeFormatHint ?? detectMagicFormat(data);
        const entropyBitsPerByte = shannonEntropy(sample);
        const looksText = looksLikeText(sample);
        const looksAlreadyCompressed = detectedFormat !== null || entropyBitsPerByte >= HIGH_ENTROPY_THRESHOLD;
        const recommendation = looksAlreadyCompressed ? "store" : "compress";
        return {
          sizeBytes: data.length,
          sampledBytes: sampleLen,
          entropyBitsPerByte,
          looksAlreadyCompressed,
          detectedFormat,
          looksText,
          recommendation
        };
      }
    };
    awarenessProfiler = new AwarenessProfiler();
  }
});

// server/pocket-dimension/fabric/compression/ZstdEngine.ts
import {
  brotliCompress,
  brotliDecompress,
  constants as zlibConstants
} from "zlib";
import { promisify } from "util";
import { createHash as createHash2 } from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import os2 from "os";
import path3 from "path";
function qualityFor(size) {
  if (size <= 1024 * 1024) return 11;
  if (size <= 8 * 1024 * 1024) return 10;
  return BROTLI_QUALITY;
}
function zstdLevelFor(size) {
  if (size <= 1024 * 1024) return 19;
  if (size <= 8 * 1024 * 1024) return 15;
  return 12;
}
async function brotliCompressBytes(data) {
  const opts = {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: qualityFor(data?.length ?? 0),
      [zlibConstants.BROTLI_PARAM_LGWIN]: zlibConstants.BROTLI_MAX_WINDOW_BITS,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data?.length
    }
  };
  return await brotliCompressAsync(data, opts);
}
function runZstdPiped(args, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn("zstd", args);
    const chunks = [];
    const errChunks = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `zstd exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 500)}`
          )
        );
      }
    });
    proc.stdin.on("error", () => {
    });
    proc.stdin.end(input);
  });
}
function runZstdArgs(args) {
  return new Promise((resolve) => {
    const proc = spawn("zstd", args);
    const errChunks = [];
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", () => resolve({ code: -1, stderr: "spawn error" }));
    proc.on(
      "close",
      (code) => resolve({ code: code ?? -1, stderr: Buffer.concat(errChunks).toString("utf8") })
    );
  });
}
var brotliCompressAsync, brotliDecompressAsync, DICT_DIR, DICT_SAMPLE_MAX, DICT_SIZE, BROTLI_QUALITY, ZstdEngine, zstdEngine;
var init_ZstdEngine = __esm({
  "server/pocket-dimension/fabric/compression/ZstdEngine.ts"() {
    "use strict";
    init_logger();
    brotliCompressAsync = promisify(brotliCompress);
    brotliDecompressAsync = promisify(brotliDecompress);
    DICT_DIR = path3.join("./pocket-dimensions", ".dicts");
    DICT_SAMPLE_MAX = 200;
    DICT_SIZE = 112 * 1024;
    BROTLI_QUALITY = 9;
    ZstdEngine = class {
      constructor() {
        this.dictCache = /* @__PURE__ */ new Map();
        this.sampleAccumulator = /* @__PURE__ */ new Map();
        this.dictMeta = /* @__PURE__ */ new Map();
        this.diskMetaScanned = false;
        this.zstdAvailable = null;
      }
      async checkZstdAvailable() {
        if (this.zstdAvailable !== null) return this.zstdAvailable;
        this.zstdAvailable = await new Promise((resolve) => {
          const p = spawn("zstd", ["--version"]);
          p.on("error", () => resolve(false));
          p.on("exit", (code) => resolve(code === 0));
        });
        if (!this.zstdAvailable) {
          logger.warn(
            "[ZstdEngine] `zstd` CLI not available \u2014 all compression will use the Brotli fallback"
          );
        }
        return this.zstdAvailable;
      }
      async dictPathFor(dictId) {
        const p = path3.join(DICT_DIR, `${dictId}.dict`);
        try {
          await fs.access(p);
          return p;
        } catch {
          return null;
        }
      }
      async compress(data, dictId) {
        const available = await this.checkZstdAvailable();
        if (available) {
          try {
            const args = [`-${zstdLevelFor(data.length)}`, "--long=27", "-T0", "-c"];
            let usedDictId;
            if (dictId) {
              const dictPath = await this.dictPathFor(dictId);
              if (dictPath) {
                args.push("-D", dictPath);
                usedDictId = dictId;
              } else {
                logger.warn(
                  `[ZstdEngine] dictId "${dictId}" has no dict file on disk \u2014 compressing without it`
                );
              }
            }
            const compressed2 = await runZstdPiped(args, data);
            return { compressed: compressed2, dictId: usedDictId, codec: "zstd" };
          } catch (err) {
            logger.warn(
              `[ZstdEngine] zstd CLI compression failed (${err.message}) \u2014 falling back to Brotli for this object`
            );
          }
        }
        const compressed = await brotliCompressBytes(data);
        return { compressed, dictId: void 0, codec: "brotli-fallback" };
      }
      async decompress(data, dictId, codec = "zstd") {
        if (codec === "brotli-fallback") {
          return await brotliDecompressAsync(data);
        }
        const available = await this.checkZstdAvailable();
        if (!available) {
          throw new Error(
            "Object was compressed with zstd but the zstd CLI is not available on this host \u2014 cannot decompress"
          );
        }
        const args = ["-d", "--long=27", "-T0", "-c"];
        if (dictId) {
          const dictPath = await this.dictPathFor(dictId);
          if (!dictPath) {
            throw new Error(
              `Object was compressed with dictId "${dictId}" but that dictionary file is missing \u2014 cannot decompress`
            );
          }
          args.push("-D", dictPath);
        }
        return runZstdPiped(args, data);
      }
      async addSample(domain, sample) {
        if (!this.sampleAccumulator.has(domain)) {
          this.sampleAccumulator.set(domain, []);
        }
        const samples = this.sampleAccumulator.get(domain);
        if (samples?.length < DICT_SAMPLE_MAX) {
          samples?.push(sample);
        }
      }
      /** Trains a real zstd dictionary from accumulated samples via `zstd --train`.
       *  Needs real files on disk (zstd's trainer does not accept stdin), so
       *  samples are written to a scratch temp dir that is always cleaned up. */
      async trainDict(domain) {
        const samples = this.sampleAccumulator.get(domain);
        if (!samples || samples?.length < 10) return null;
        const available = await this.checkZstdAvailable();
        if (!available) {
          logger.warn(
            `[ZstdEngine] Cannot train dictionary for domain "${domain}" \u2014 zstd CLI not available`
          );
          return null;
        }
        const combined = Buffer.concat(samples);
        const dictId = createHash2("sha256").update(`${domain}:${samples.length}:${combined.length}`).digest("hex").substring(0, 16);
        const existing = this.dictMeta.get(domain);
        if (existing && existing.sampleCount >= samples.length && existing.id === dictId) {
          return existing.id;
        }
        const tmpDir = await fs.mkdtemp(path3.join(os2.tmpdir(), "zstd-train-"));
        try {
          const samplePaths = [];
          for (let i = 0; i < samples.length; i++) {
            const p = path3.join(tmpDir, `sample-${i}`);
            await fs.writeFile(p, samples[i]);
            samplePaths.push(p);
          }
          await fs.mkdir(DICT_DIR, { recursive: true });
          const dictPath = path3.join(DICT_DIR, `${dictId}.dict`);
          const { code, stderr } = await runZstdArgs([
            "--train",
            ...samplePaths,
            "-o",
            dictPath,
            `--maxdict=${DICT_SIZE}`,
            "-f"
          ]);
          if (code !== 0) {
            logger.warn(
              `[ZstdEngine] zstd --train failed for domain "${domain}": ${stderr.slice(0, 500)}`
            );
            return null;
          }
          const dictData = await fs.readFile(dictPath);
          this.dictCache.set(dictId, dictData);
          const entry = {
            id: dictId,
            domain,
            sampleCount: samples.length,
            dictBytes: dictData.length,
            createdAt: /* @__PURE__ */ new Date()
          };
          this.dictMeta.set(domain, entry);
          await fs.writeFile(
            path3.join(DICT_DIR, `${dictId}.meta.json`),
            JSON.stringify(entry)
          );
          return dictId;
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
      }
      /** Populates in-memory dict metadata from disk once, so a fresh process
       *  (after a restart) can still resolve dictionaries trained earlier. */
      async ensureDiskMetaScanned() {
        if (this.diskMetaScanned) return;
        this.diskMetaScanned = true;
        try {
          const files = await fs.readdir(DICT_DIR);
          for (const f of files) {
            if (!f.endsWith(".meta.json")) continue;
            try {
              const raw = await fs.readFile(path3.join(DICT_DIR, f), "utf8");
              const entry = JSON.parse(raw);
              const current = this.dictMeta.get(entry.domain);
              if (!current || new Date(entry.createdAt) > new Date(current.createdAt)) {
                this.dictMeta.set(entry.domain, entry);
              }
            } catch {
            }
          }
        } catch {
        }
      }
      async getDictForDomain(domain) {
        await this.ensureDiskMetaScanned();
        const entry = this.dictMeta.get(domain);
        return entry?.id;
      }
      async compressionRatio(data, dictId) {
        const { compressed } = await this.compress(data, dictId);
        return data?.length / compressed?.length;
      }
    };
    zstdEngine = new ZstdEngine();
  }
});

// server/pocket-dimension/fabric/compression/XzEngine.ts
import { spawn as spawn2 } from "child_process";
async function checkXz() {
  if (xzAvailable !== null) return xzAvailable;
  xzAvailable = await new Promise((resolve) => {
    const p = spawn2("xz", ["--version"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  if (!xzAvailable) {
    logger.warn("[XzEngine] `xz` CLI not available \u2014 archival codec tier disabled");
  }
  return xzAvailable;
}
function runPiped(args, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn2("xz", args);
    const chunks = [];
    const errChunks = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `xz exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 500)}`
          )
        );
      }
    });
    proc.stdin.on("error", () => {
    });
    proc.stdin.end(input);
  });
}
var xzAvailable, XzEngine, xzEngine;
var init_XzEngine = __esm({
  "server/pocket-dimension/fabric/compression/XzEngine.ts"() {
    "use strict";
    init_logger();
    xzAvailable = null;
    XzEngine = class {
      async isAvailable() {
        return checkXz();
      }
      /** level 0-9; -e enables "extreme" mode for a better ratio at more CPU cost. */
      async compress(data, level = 9, extreme = true) {
        const available = await checkXz();
        if (!available) throw new Error("xz CLI not available");
        const args = [`-${level}${extreme ? "e" : ""}`, "-T0", "-c"];
        return runPiped(args, data);
      }
      async decompress(data) {
        const available = await checkXz();
        if (!available) throw new Error("xz CLI not available");
        return runPiped(["-d", "-T0", "-c"], data);
      }
    };
    xzEngine = new XzEngine();
  }
});

// script/deployment/capacity.mjs
import os3 from "node:os";
import fs2 from "node:fs";
function read(file) {
  try {
    return fs2.readFileSync(file, "utf8").trim();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return null;
    throw error;
  }
}
function effectiveCapacity() {
  let cpus = os3.availableParallelism(), memory = os3.totalmem();
  const max = read("/sys/fs/cgroup/cpu.max")?.split(/\s+/);
  const quota = max ? Number(max[0]) : Number(read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"));
  const period = max ? Number(max[1]) : Number(read("/sys/fs/cgroup/cpu/cpu.cfs_period_us"));
  if (quota > 0 && period > 0) cpus = Math.min(cpus, quota / period);
  for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    const n = Number(read(file));
    if (n > 0 && Number.isFinite(n)) memory = Math.min(memory, n);
  }
  return { cpus, memoryGB: memory / 1024 ** 3 };
}
var init_capacity = __esm({
  "script/deployment/capacity.mjs"() {
    "use strict";
  }
});

// server/computeSizing.ts
import os4 from "os";
function positiveConfig(name, defaultValue) {
  const value = process.env[name] === void 0 ? defaultValue : Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return value;
}
function computeWorkerSizing(opts = {}) {
  const capacity = effectiveCapacity();
  const numCPUs = capacity.cpus;
  const local = process.env.MAXCORE_LOCAL !== "0";
  const maxcore = opts.envOverrideVar === "MAXCORE_LOCAL_CLUSTER_WORKERS";
  const memoryMB = Math.floor(capacity.memoryGB * 1024);
  const headroomPercent = positiveConfig("COMPUTE_HEADROOM_PERCENT", 20);
  if (headroomPercent >= 100) throw new Error("COMPUTE_HEADROOM_PERCENT must be below 100");
  const reservationsMB = {
    headroom: Math.max(512, Math.ceil(memoryMB * headroomPercent / 100)),
    primary: Math.ceil(positiveConfig("APP_PRIMARY_MEMORY_MB", 768)),
    maxcorePrimary: local ? Math.ceil(positiveConfig("MAXCORE_PRIMARY_MEMORY_MB", 256)) : 0,
    sidecars: Math.ceil(positiveConfig("SIDECAR_MEMORY_MB", 512)),
    python: local ? Math.ceil(positiveConfig("PYTHON_MEMORY_MB", 1024)) : 0
  };
  const appMinimumMB = Math.ceil(positiveConfig("APP_WORKER_MIN_MEMORY_MB", 1024));
  const maxcoreMinimumMB = local ? Math.ceil(positiveConfig("MAXCORE_WORKER_MIN_MEMORY_MB", 768)) : 0;
  const reservedMB = Object.values(reservationsMB).reduce((sum, n) => sum + n, 0);
  const surplusMB = memoryMB - reservedMB - appMinimumMB - maxcoreMinimumMB;
  if (surplusMB < 0) {
    throw new Error(`Insufficient aggregate memory: configured role minima and headroom require ${reservedMB + appMinimumMB + maxcoreMinimumMB} MiB, quota is ${memoryMB} MiB`);
  }
  const appPoolMB = appMinimumMB + Math.floor(surplusMB * (local ? 0.7 : 1));
  const maxcorePoolMB = local ? memoryMB - reservedMB - appPoolMB : 0;
  const freeMemGB = (maxcore && local ? maxcorePoolMB : appPoolMB) / 1024;
  const cpuBudget = numCPUs * (local ? 0.25 : 0.75);
  const appCluster = opts.envOverrideVar === "CLUSTER_WORKERS";
  const workerCpuShare = appCluster ? positiveConfig("APP_WORKER_CPU_SHARE", 1) : 1;
  if (workerCpuShare > 1) {
    throw new Error("APP_WORKER_CPU_SHARE must be at most 1");
  }
  const cpuLimit = Math.min(
    os4.availableParallelism(),
    Math.max(1, Math.floor(cpuBudget / workerCpuShare))
  );
  const memoryPerWorker = opts.memPerWorkerGB ?? (maxcore && local ? maxcoreMinimumMB : appMinimumMB) / 1024;
  if (!Number.isFinite(memoryPerWorker) || memoryPerWorker <= 0) throw new Error("Invalid per-worker memory budget");
  const memLimit = Math.floor(freeMemGB / memoryPerWorker);
  if (memLimit < 1) throw new Error(`Insufficient aggregate memory for ${maxcore ? "MaxCore" : "app"} workers: ${freeMemGB.toFixed(2)} GiB available`);
  const envOverride = opts.envOverrideVar && process.env[opts.envOverrideVar] ? Number(process.env[opts.envOverrideVar]) : null;
  const automatic = Math.min(cpuLimit, memLimit);
  let workerCount = Math.min(automatic, opts.maxWorkers ?? Infinity);
  let source = workerCount < automatic ? "capped" : "auto";
  if (opts.maxWorkers !== void 0 && (!Number.isInteger(opts.maxWorkers) || opts.maxWorkers < 1)) {
    throw new Error("maxWorkers must be a positive integer");
  }
  if (envOverride !== null) {
    if (!Number.isInteger(envOverride) || envOverride < 1 || envOverride > Math.min(cpuLimit, memLimit, opts.maxWorkers ?? Infinity)) {
      throw new Error(`${opts.envOverrideVar} exceeds the shared compute budget or is not a positive integer`);
    }
    workerCount = envOverride;
    source = "override";
  }
  const workerMemoryMB = Math.floor(freeMemGB * 1024 / workerCount);
  const workerHeapMB = Math.floor(workerMemoryMB * 0.6);
  const primaryHeapMB = Math.min(512, Math.floor(reservationsMB.primary * 2 / 3));
  if (workerHeapMB < 1 || primaryHeapMB < 1) throw new Error("Configured memory allocations cannot provide a positive V8 heap");
  return {
    numCPUs,
    freeMemGB,
    cpuLimit,
    memLimit,
    workerCount,
    source,
    workerMemoryMB,
    // Leave 40% of each RSS allocation for native/non-V8 memory. This cap is
    // not an OS RSS limit; the container quota and measured admission remain
    // the outer enforcement boundaries.
    workerHeapMB,
    primaryHeapMB,
    maxcorePrimaryHeapMB: Math.floor(reservationsMB.maxcorePrimary * 0.6),
    pythonMemoryMB: reservationsMB.python,
    pythonThreads: 1,
    cpuBudget,
    workerCpuShare,
    reservationsMB
  };
}
var init_computeSizing = __esm({
  "server/computeSizing.ts"() {
    "use strict";
    init_capacity();
    init_capacity();
  }
});

// server/pocket-dimension/fabric/compression/ParallelBlockCompressor.ts
import { Worker as Worker3 } from "worker_threads";
import path4 from "path";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
function resolveWorkerPath() {
  const cwd = process.cwd();
  const candidates = [
    path4.join(cwd, "server/workers/blockCompressor.cjs"),
    path4.join(cwd, "dist/workers/blockCompressor.cjs")
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}
var BLOCK_PARALLEL_THRESHOLD, TARGET_BLOCK_SIZE, MAX_QUEUE_DEPTH, INIT_TIMEOUT_MS, PER_BLOCK_TIMEOUT_MS, ParallelBlockCompressorPool, parallelBlockCompressor;
var init_ParallelBlockCompressor = __esm({
  "server/pocket-dimension/fabric/compression/ParallelBlockCompressor.ts"() {
    "use strict";
    init_logger();
    init_computeSizing();
    BLOCK_PARALLEL_THRESHOLD = 16 * 1024 * 1024;
    TARGET_BLOCK_SIZE = 4 * 1024 * 1024;
    MAX_QUEUE_DEPTH = 200;
    INIT_TIMEOUT_MS = 15e3;
    PER_BLOCK_TIMEOUT_MS = 6e4;
    ParallelBlockCompressorPool = class {
      constructor() {
        this.workers = [];
        this.queue = [];
        this.pending = /* @__PURE__ */ new Map();
        this.initPromise = null;
        this.available = false;
      }
      async ensureInitialized() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this.initialize();
        return this.initPromise;
      }
      async initialize() {
        const workerPath = resolveWorkerPath();
        if (!existsSync(workerPath)) {
          logger.warn(
            "[ParallelBlockCompressor] Worker file not found \u2014 block-parallel compression disabled, falling back to single-shot codec path"
          );
          return;
        }
        const workerCount = process.env.DEPLOY_TASK_CPU === void 0 ? computeWorkerSizing({ memPerWorkerGB: 0.25, maxWorkers: 8 }).workerCount : Number(process.env.DEPLOY_TASK_CPU);
        const allocation = Number(process.env.DEPLOY_TASK_CPU ?? Math.max(1, workerCount));
        if (!Number.isInteger(allocation) || allocation < 1) throw new Error("Invalid deployment CPU allocation");
        const poolSize = Math.max(1, Math.min(8, workerCount, allocation));
        const startWorker = (index3) => new Promise((resolve, reject) => {
          const worker = new Worker3(workerPath);
          const state2 = { worker, busy: false };
          const timeout = setTimeout(
            () => reject(new Error(`Block compressor worker ${index3} init timeout`)),
            INIT_TIMEOUT_MS
          );
          worker.once("message", (msg) => {
            if (msg?.ready) {
              clearTimeout(timeout);
              worker.unref();
              resolve(state2);
            }
          });
          worker.on("message", (msg) => {
            if (msg?.ready) return;
            const job = msg.id ? this.pending.get(msg.id) : void 0;
            if (!job) return;
            clearTimeout(job.timeout);
            this.pending.delete(msg.id);
            state2.busy = false;
            worker.unref();
            if (msg.error) job.reject(new Error(msg.error));
            else job.resolve(Buffer.from(msg.result));
            this.dispatch();
          });
          worker.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
            for (const [id, job] of this.pending) {
              clearTimeout(job.timeout);
              job.reject(err);
              this.pending.delete(id);
            }
          });
          worker.on("exit", (code) => {
            if (code !== 0) {
              logger.warn(`[ParallelBlockCompressor] Worker ${index3} exited with code ${code}`);
            }
          });
        });
        try {
          this.workers = await Promise.all(
            Array.from({ length: poolSize }, (_, i) => startWorker(i))
          );
          this.available = true;
          logger.info(
            `[ParallelBlockCompressor] ${poolSize} worker(s) ready for CPU-core-parallel block compression`
          );
        } catch (err) {
          logger.warn(
            `[ParallelBlockCompressor] Could not initialize worker pool: ${err.message} \u2014 falling back to single-shot codec path`
          );
          this.available = false;
        }
      }
      dispatch() {
        if (this.queue.length === 0) return;
        const idleWorker = this.workers.find((w) => !w.busy);
        if (!idleWorker) return;
        const job = this.queue.shift();
        idleWorker.busy = true;
        idleWorker.worker.ref();
        const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
        const timeout = setTimeout(() => {
          this.pending.delete(id);
          idleWorker.busy = false;
          job.reject(new Error(`Block ${job.type} timed out after ${PER_BLOCK_TIMEOUT_MS}ms`));
          this.dispatch();
        }, PER_BLOCK_TIMEOUT_MS);
        this.pending.set(id, { resolve: job.resolve, reject: job.reject, timeout });
        idleWorker.worker.postMessage({ id, type: job.type, data: job.data });
      }
      runJob(type, data) {
        if (this.queue.length >= MAX_QUEUE_DEPTH) {
          return Promise.reject(
            new Error(
              `Block compressor queue full (${this.queue.length}/${MAX_QUEUE_DEPTH})`
            )
          );
        }
        return new Promise((resolve, reject) => {
          this.queue.push({ type, data, resolve, reject });
          this.dispatch();
        });
      }
      /** True once the pool has finished attempting init and workers came up. */
      async isAvailable() {
        await this.ensureInitialized();
        return this.available;
      }
      /** Splits data into fixed-size blocks and compresses each in parallel.
       *  Returns the compressed blocks and their original (pre-compression)
       *  sizes so the caller can build the container header's block map. */
      async compressBlocks(data) {
        await this.ensureInitialized();
        if (!this.available) {
          throw new Error("Block compressor pool not available");
        }
        const blockSizes = [];
        const rawBlocks = [];
        for (let offset = 0; offset < data.length; offset += TARGET_BLOCK_SIZE) {
          const block = data.subarray(offset, Math.min(offset + TARGET_BLOCK_SIZE, data.length));
          rawBlocks.push(block);
          blockSizes.push(block.length);
        }
        const blocks = await Promise.all(rawBlocks.map((b) => this.runJob("compress", b)));
        return { blocks, blockSizes };
      }
      /** Reverses compressBlocks: given the compressed blocks, decompresses
       *  each in parallel and concatenates back into the original buffer. */
      async decompressBlocks(blocks) {
        await this.ensureInitialized();
        if (!this.available) {
          throw new Error("Block compressor pool not available");
        }
        const decompressed = await Promise.all(
          blocks.map((b) => this.runJob("decompress", b))
        );
        return Buffer.concat(decompressed);
      }
    };
    parallelBlockCompressor = new ParallelBlockCompressorPool();
  }
});

// server/pocket-dimension/fabric/compression/CodecMesh.ts
var TEXT_LIKE, XZ_MIN_SIZE, CodecMesh, codecMesh;
var init_CodecMesh = __esm({
  "server/pocket-dimension/fabric/compression/CodecMesh.ts"() {
    "use strict";
    init_AwarenessProfiler();
    init_ZstdEngine();
    init_XzEngine();
    init_ParallelBlockCompressor();
    init_logger();
    TEXT_LIKE = /* @__PURE__ */ new Set(["text", "json", "log", "metrics"]);
    XZ_MIN_SIZE = 1024 * 1024;
    CodecMesh = class {
      async compress(data, opts) {
        const awareness = awarenessProfiler.profile(data, opts.contentTypeFormatHint ?? null);
        if (awareness.recommendation === "store") {
          return { codec: "store", compressed: data, awareness };
        }
        if (data.length >= BLOCK_PARALLEL_THRESHOLD) {
          const available = await parallelBlockCompressor.isAvailable();
          if (available) {
            try {
              const { blocks } = await parallelBlockCompressor.compressBlocks(data);
              return {
                codec: "brotli-blocked",
                compressed: Buffer.concat(blocks),
                blockSizes: blocks.map((b) => b.length),
                awareness
              };
            } catch (err) {
              logger.warn(
                `[CodecMesh] Parallel block compression failed (${err.message}) \u2014 falling back to single-shot codec path`
              );
            }
          }
        }
        if (TEXT_LIKE.has(opts.contentClass) && data.length >= XZ_MIN_SIZE) {
          const xzAvailable2 = await xzEngine.isAvailable();
          if (xzAvailable2) {
            try {
              const compressed = await xzEngine.compress(data);
              return { codec: "xz", compressed, awareness };
            } catch (err) {
              logger.warn(
                `[CodecMesh] xz compression failed (${err.message}) \u2014 falling back to zstd`
              );
            }
          }
        }
        let dictId;
        if (opts.dictDomain) {
          dictId = await zstdEngine.getDictForDomain(opts.dictDomain);
        }
        const result = await zstdEngine.compress(data, dictId);
        return {
          codec: result.codec,
          compressed: result.compressed,
          dictId: result.dictId,
          awareness
        };
      }
      async decompress(codec, data, opts = {}) {
        switch (codec) {
          case "store":
            return data;
          case "brotli-blocked": {
            if (!opts.blockSizes || opts.blockSizes.length === 0) {
              throw new Error(
                "Container labeled brotli-blocked but has no blockSizes \u2014 cannot reassemble"
              );
            }
            const blocks = [];
            let pos = 0;
            for (const len of opts.blockSizes) {
              blocks.push(data.subarray(pos, pos + len));
              pos += len;
            }
            return parallelBlockCompressor.decompressBlocks(blocks);
          }
          case "xz":
            return xzEngine.decompress(data);
          case "zstd":
          case "brotli-fallback":
            return zstdEngine.decompress(data, opts.dictId, codec);
          default:
            throw new Error(`Unknown codec "${codec}" \u2014 cannot decompress`);
        }
      }
    };
    codecMesh = new CodecMesh();
  }
});

// server/pocket-dimension/fabric/compression/ContainerFormat.ts
function encodeContainer(header, payload) {
  const headerJson = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(4 + 1 + 4);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt8(FORMAT_VERSION, 4);
  prefix.writeUInt32LE(headerJson.length, 5);
  return Buffer.concat([prefix, headerJson, payload]);
}
function decodeContainer(buf) {
  if (buf.length < 9 || !buf.subarray(0, 4).equals(MAGIC)) {
    throw new Error(
      "Corrupt or non-container object: missing PDCF magic bytes \u2014 cannot decompress"
    );
  }
  const version = buf.readUInt8(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(
      `Unsupported container format version ${version} (expected ${FORMAT_VERSION})`
    );
  }
  const headerLen = buf.readUInt32LE(5);
  const headerStart = 9;
  const headerEnd = headerStart + headerLen;
  if (buf.length < headerEnd) {
    throw new Error("Corrupt container: header length exceeds buffer size");
  }
  const header = JSON.parse(
    buf.subarray(headerStart, headerEnd).toString("utf8")
  );
  const payload = buf.subarray(headerEnd);
  return { header, payload };
}
function isContainer(buf) {
  return buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC);
}
var MAGIC, FORMAT_VERSION;
var init_ContainerFormat = __esm({
  "server/pocket-dimension/fabric/compression/ContainerFormat.ts"() {
    "use strict";
    MAGIC = Buffer.from("PDCF", "ascii");
    FORMAT_VERSION = 1;
  }
});

// server/pocket-dimension/index.ts
var pocket_dimension_exports = {};
__export(pocket_dimension_exports, {
  PocketDimension: () => PocketDimension,
  PocketDimensionManager: () => PocketDimensionManager,
  default: () => pocket_dimension_default,
  pocket: () => pocket,
  pocketManager: () => pocketManager
});
import {
  createHash as createHash3,
  createCipheriv,
  createDecipheriv,
  randomBytes as randomBytes2,
  scryptSync
} from "crypto";
import { createGunzip } from "zlib";
import { pipeline, Readable, Writable } from "stream";
import { promisify as promisify2 } from "util";
import { EventEmitter as EventEmitter3 } from "events";
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function parsePocketDate(value, field) {
  const date2 = new Date(value);
  if (typeof value !== "string" && !(value instanceof Date) || !Number.isFinite(date2.getTime())) {
    throw new Error(`invalid ${field}`);
  }
  return date2;
}
function parsePocketMetadata(raw, expectedId) {
  const value = JSON.parse(raw);
  if (!isRecord(value) || value.id !== expectedId || typeof value.name !== "string" || typeof value.encrypted !== "boolean" || !Number.isSafeInteger(value.version) || value.version < 1 || !["totalSize", "compressedSize", "chunkCount", "maxDepth"].every(
    (field) => typeof value[field] === "number" && Number.isFinite(value[field]) && value[field] >= 0
  )) {
    throw new Error("invalid pocket metadata shape");
  }
  return {
    ...value,
    createdAt: parsePocketDate(value.createdAt, "metadata.createdAt"),
    updatedAt: parsePocketDate(value.updatedAt, "metadata.updatedAt")
  };
}
function parsePocketIndex(raw) {
  const value = JSON.parse(raw);
  if (!isRecord(value) || !isRecord(value.entries) || !isRecord(value.chunks)) {
    throw new Error("invalid pocket index root");
  }
  const entries = /* @__PURE__ */ new Map();
  for (const [key, candidate] of Object.entries(value.entries)) {
    if (!isRecord(candidate) || candidate.path !== key || !["file", "directory", "dimension"].includes(candidate.type) || !Array.isArray(candidate.chunks) || !candidate.chunks.every((id) => typeof id === "string") || !isRecord(candidate.metadata) || !["size", "compressedSize", "version"].every(
      (field) => typeof candidate[field] === "number" && Number.isFinite(candidate[field]) && candidate[field] >= 0
    )) {
      throw new Error(`invalid pocket entry ${JSON.stringify(key)}`);
    }
    entries.set(key, {
      ...candidate,
      createdAt: parsePocketDate(candidate.createdAt, `${key}.createdAt`),
      modifiedAt: parsePocketDate(candidate.modifiedAt, `${key}.modifiedAt`)
    });
  }
  const chunks = /* @__PURE__ */ new Map();
  for (const [key, candidate] of Object.entries(value.chunks)) {
    if (!isRecord(candidate) || candidate.id !== key || typeof candidate.encrypted !== "boolean" || !["size", "compressedSize", "compressionRatio", "accessCount", "depth"].every(
      (field) => typeof candidate[field] === "number" && Number.isFinite(candidate[field]) && candidate[field] >= 0
    )) {
      throw new Error(`invalid pocket chunk ${JSON.stringify(key)}`);
    }
    chunks.set(key, {
      ...candidate,
      createdAt: parsePocketDate(candidate.createdAt, `${key}.createdAt`),
      lastAccessed: parsePocketDate(candidate.lastAccessed, `${key}.lastAccessed`)
    });
  }
  for (const [path8, entry] of entries) {
    if (entry.chunks.some((id) => !chunks.has(id))) {
      throw new Error(`pocket entry ${JSON.stringify(path8)} references a missing chunk`);
    }
  }
  return { entries, chunks };
}
async function pocket(id, config2) {
  return pocketManager?.openPocket(id, config2);
}
var PocketDimension, PocketDimensionManager, pocketManager, pocket_dimension_default;
var init_pocket_dimension = __esm({
  "server/pocket-dimension/index.ts"() {
    "use strict";
    init_pdimClient();
    init_CodecMesh();
    init_ContainerFormat();
    promisify2(pipeline);
    PocketDimension = class _PocketDimension extends EventEmitter3 {
      // Store raw key for persistence
      constructor(config2) {
        super();
        this.encryptionKey = null;
        // In-memory indices (would be persisted in production)
        this.chunks = /* @__PURE__ */ new Map();
        this.entries = /* @__PURE__ */ new Map();
        this.chunkData = /* @__PURE__ */ new Map();
        // Chunk storage
        this.nestedDimensions = /* @__PURE__ */ new Map();
        this.isOpen = false;
        this.currentDepth = 0;
        this.rawEncryptionKey = null;
        this.storage = config2.storage;
        this.id = config2?.id;
        this.name = config2?.name;
        this.chunkSize = config2?.chunkSize || 1024 * 1024;
        this.maxRecursionDepth = config2?.maxRecursionDepth || 10;
        this.compressionLevel = config2?.compressionLevel || 9;
        this.enableDeduplication = config2?.enableDeduplication ?? true;
        this.enableVersioning = config2?.enableVersioning ?? true;
        this.storagePath = config2?.storagePath || "./pocket-dimensions";
        if (config2?.encryptionKey) {
          this.rawEncryptionKey = config2?.encryptionKey;
          this.encryptionKey = scryptSync(
            config2?.encryptionKey,
            "pocket-dimension-salt",
            32
          );
        }
        this.metadata = {
          id: this.id,
          name: this.name,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          totalSize: 0,
          compressedSize: 0,
          chunkCount: 0,
          maxDepth: 0,
          encrypted: !!this.encryptionKey,
          version: 1
        };
      }
      get backingStore() {
        return this.storage ?? getPdimClient();
      }
      // ============================================================================
      // BRACKET NOTATION ACCESS - The Magic Happens Here
      // ============================================================================
      /**
       * Creates a Proxy that allows bracket notation access to the pocket dimension
       * Usage: pocket['path/to/file'] or pocket['nested/dimension']['deeper/path']
       */
      asBracketAccessor() {
        return new Proxy(this, {
          get: (target, prop) => {
            if (typeof prop === "string") {
              if (target?.nestedDimensions.has(prop)) {
                return target?.nestedDimensions.get(prop).asBracketAccessor();
              }
              if (target?.entries.has(prop)) {
                return target?.read(prop);
              }
              return {
                write: (data) => target?.write(prop, data),
                read: () => target?.read(prop),
                delete: () => target?.delete(prop),
                exists: () => target?.exists(prop),
                createDimension: (config2) => target?.createNestedDimension(prop, config2)
              };
            }
            return Reflect.get(target, prop);
          },
          set: (target, prop, value) => {
            if (typeof prop === "string") {
              target?.write(prop, value);
              return true;
            }
            return Reflect.set(target, prop, value);
          }
        });
      }
      // ============================================================================
      // CORE OPERATIONS
      // ============================================================================
      async open() {
        if (this.isOpen) return;
        try {
          const metaRaw = await this.backingStore.get(
            `pdim:meta:${this.id}:metadata`
          );
          const indexRaw = await this.backingStore.get(
            `pdim:meta:${this.id}:index`
          );
          if (metaRaw === null) {
            if (indexRaw !== null) {
              throw new Error("pocket index exists without metadata");
            }
          } else {
            if (indexRaw === null) {
              throw new Error("pocket metadata exists without index");
            }
            const metadata = parsePocketMetadata(metaRaw, this.id);
            const index3 = parsePocketIndex(indexRaw);
            let restoredRawKey = null;
            let restoredKey = this.encryptionKey;
            if (metadata.encrypted && !restoredKey) {
              const keyRaw = await this.backingStore.get(
                `pdim:meta:${this.id}:keyfile`
              );
              if (keyRaw === null) {
                throw new Error("encrypted pocket is missing its keyfile");
              }
              const keyInfo = JSON.parse(keyRaw);
              if (!isRecord(keyInfo) || typeof keyInfo.key !== "string" || keyInfo.key.length === 0) {
                throw new Error("encrypted pocket keyfile is invalid");
              }
              restoredRawKey = keyInfo.key;
              restoredKey = scryptSync(keyInfo.key, "pocket-dimension-salt", 32);
            }
            this.metadata = metadata;
            this.entries = index3.entries;
            this.chunks = index3.chunks;
            if (restoredRawKey) this.rawEncryptionKey = restoredRawKey;
            this.encryptionKey = restoredKey;
          }
        } catch (error) {
          throw new Error(
            `Failed to open pocket dimension ${this.id}: stored metadata/index is unavailable or corrupt`,
            { cause: error }
          );
        }
        this.isOpen = true;
        this.emit("opened", { id: this.id, name: this.name });
      }
      async close() {
        if (!this.isOpen) return;
        await this.persistMetadata();
        for (const [, nested] of this.nestedDimensions) {
          await nested?.close();
        }
        this.isOpen = false;
        this.emit("closed", { id: this.id });
      }
      /** Fabric callers hold the database fence while refreshing shared backing state. */
      async refresh() {
        this.isOpen = false;
        await this.open();
      }
      async persistMetadata() {
        await this.backingStore.set(
          `pdim:meta:${this.id}:metadata`,
          JSON.stringify(this.metadata)
        );
        await this.backingStore.set(
          `pdim:meta:${this.id}:index`,
          JSON.stringify({
            entries: Object.fromEntries(this.entries),
            chunks: Object.fromEntries(this.chunks)
          })
        );
        if (this.rawEncryptionKey) {
          await this.backingStore.set(
            `pdim:meta:${this.id}:keyfile`,
            JSON.stringify({
              key: this.rawEncryptionKey,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            })
          );
        }
      }
      // ============================================================================
      // WRITE OPERATIONS - Streaming Compression + Chunking
      // ============================================================================
      async write(entryPath, data, options) {
        if (!this.isOpen) await this.open();
        const buffer = typeof data === "string" ? Buffer?.from(data) : data;
        const depth = options?.depth || 0;
        if (depth > this.maxRecursionDepth) {
          throw new Error(
            `Maximum recursion depth (${this.maxRecursionDepth}) exceeded - dimension inception limit reached`
          );
        }
        const originalSize = buffer?.length;
        const chunks = [];
        let compressedSize = 0;
        for (let offset = 0; offset < buffer.length; offset += this.chunkSize) {
          const chunkData = buffer?.subarray(
            offset,
            Math.min(offset + this.chunkSize, buffer?.length)
          );
          const chunk = await this.processChunk(chunkData, depth);
          chunks?.push(chunk?.id);
          compressedSize += chunk?.compressedSize;
        }
        const entry = {
          path: entryPath,
          type: "file",
          size: originalSize,
          compressedSize,
          chunks,
          createdAt: this.entries.has(entryPath) ? this.entries.get(entryPath).createdAt : /* @__PURE__ */ new Date(),
          modifiedAt: /* @__PURE__ */ new Date(),
          version: (this.entries.get(entryPath)?.version || 0) + 1,
          metadata: {}
        };
        this.entries.set(entryPath, entry);
        this.updateMetadata(originalSize, compressedSize);
        await this.persistMetadata();
        this.emit("written", {
          path: entryPath,
          size: originalSize,
          compressedSize
        });
        return entry;
      }
      async processChunk(data, depth) {
        const hash2 = this.hashContent(data);
        if (this.enableDeduplication && this.chunks.has(hash2)) {
          const existing = this.chunks.get(hash2);
          existing.accessCount++;
          existing.lastAccessed = /* @__PURE__ */ new Date();
          return existing;
        }
        const compressed = await this.compress(data);
        const finalData = this.encryptionKey ? this.encrypt(compressed) : compressed;
        this.chunkData.set(hash2, finalData);
        await this.persistChunk(hash2, finalData);
        const chunk = {
          id: hash2,
          size: data.length,
          compressedSize: finalData.length,
          compressionRatio: data.length / finalData?.length,
          createdAt: /* @__PURE__ */ new Date(),
          accessCount: 1,
          lastAccessed: /* @__PURE__ */ new Date(),
          encrypted: !!this.encryptionKey,
          depth
        };
        this.chunks.set(hash2, chunk);
        return chunk;
      }
      async persistChunk(id, data) {
        const key = `pdim:chunk:${this.id}:${id}`;
        await this.backingStore.set(key, data?.toString("base64"));
      }
      // ============================================================================
      // READ OPERATIONS - Streaming Decompression
      // ============================================================================
      async read(entryPath) {
        if (!this.isOpen) await this.open();
        const entry = this.entries.get(entryPath);
        if (!entry) {
          throw new Error(`Entry not found in pocket dimension: ${entryPath}`);
        }
        const chunks = [];
        for (const chunkId of entry?.chunks ?? []) {
          const chunkData = await this.readChunk(chunkId);
          chunks?.push(chunkData);
        }
        this.emit("read", { path: entryPath, size: entry.size });
        return Buffer?.concat(chunks);
      }
      async readChunk(id) {
        let data = this.chunkData.get(id);
        if (!data) {
          const key = `pdim:chunk:${this.id}:${id}`;
          const encoded = await this.backingStore.get(key);
          if (!encoded) {
            throw new Error(`Chunk not found in PDIM: ${id}`);
          }
          data = Buffer?.from(encoded, "base64");
          this.chunkData.set(id, data);
        }
        const decrypted = this.encryptionKey ? this.decrypt(data) : data;
        const decompressed = await this.decompress(decrypted);
        const chunk = this.chunks.get(id);
        if (chunk) {
          chunk.accessCount++;
          chunk.lastAccessed = /* @__PURE__ */ new Date();
        }
        return decompressed;
      }
      async readStream(entryPath) {
        const data = await this.read(entryPath);
        return Readable?.from(data);
      }
      // ============================================================================
      // NESTED DIMENSIONS - Dimensions Within Dimensions (Inception!)
      // ============================================================================
      async createNestedDimension(dimensionPath, config2) {
        if (!this.isOpen) await this.open();
        if (this.currentDepth >= this.maxRecursionDepth) {
          throw new Error(
            `Maximum dimension nesting depth (${this.maxRecursionDepth}) reached - cannot go deeper into the pocket dimension`
          );
        }
        const nested = new _PocketDimension({
          storage: this.storage,
          id: `${this.id}/${dimensionPath}`,
          name: dimensionPath,
          encryptionKey: config2?.encryptionKey ?? this.rawEncryptionKey ?? void 0,
          chunkSize: config2?.chunkSize || this.chunkSize,
          maxRecursionDepth: config2?.maxRecursionDepth || this.maxRecursionDepth,
          compressionLevel: config2?.compressionLevel || this.compressionLevel,
          enableDeduplication: config2?.enableDeduplication ?? this.enableDeduplication,
          enableVersioning: config2?.enableVersioning ?? this.enableVersioning,
          storagePath: this.storagePath
        });
        nested.currentDepth = this.currentDepth + 1;
        const nestedMetadata = nested.metadata;
        if (nestedMetadata) nestedMetadata.parentDimension = this.id;
        await nested?.open();
        this.nestedDimensions.set(dimensionPath, nested);
        const entry = {
          path: dimensionPath,
          type: "dimension",
          size: 0,
          compressedSize: 0,
          chunks: [],
          createdAt: /* @__PURE__ */ new Date(),
          modifiedAt: /* @__PURE__ */ new Date(),
          version: 1,
          metadata: { dimensionId: nested.id }
        };
        this.entries.set(dimensionPath, entry);
        this.metadata.maxDepth = Math.max(
          this.metadata.maxDepth,
          this.currentDepth + 1
        );
        this.emit("dimensionCreated", {
          path: dimensionPath,
          depth: this.currentDepth + 1
        });
        return nested;
      }
      getNestedDimension(path8) {
        return this.nestedDimensions.get(path8);
      }
      // ============================================================================
      // UTILITY OPERATIONS
      // ============================================================================
      exists(entryPath) {
        return this.entries.has(entryPath);
      }
      async delete(entryPath) {
        if (!this.isOpen) await this.open();
        const entry = this.entries.get(entryPath);
        const store2 = this.backingStore;
        const reclaim = !this.enableVersioning && typeof store2.del === "function";
        const journal = `pdim:delete:${this.id}:${createHash3("sha256").update(entryPath).digest("hex")}`;
        const pendingRaw = reclaim ? await store2.get(journal) : null;
        let pending = [];
        if (pendingRaw !== null) {
          const decoded = JSON.parse(pendingRaw);
          if (!Array.isArray(decoded) || !decoded.every((id) => typeof id === "string")) throw new Error("Invalid pocket deletion journal");
          pending = decoded;
        }
        if (!entry && pendingRaw === null) return false;
        if (reclaim && entry) {
          pending = [.../* @__PURE__ */ new Set([...pending, ...entry.chunks])];
          await store2.set(journal, JSON.stringify(pending));
        }
        if (entry?.type === "dimension") {
          const nested = this.nestedDimensions.get(entryPath);
          if (nested) {
            await nested.close();
            this.nestedDimensions.delete(entryPath);
          }
        }
        this.entries.delete(entryPath);
        const liveChunks = new Set([...this.entries.values()].flatMap((value) => value.chunks));
        if (reclaim) {
          for (const id of pending) {
            if (!liveChunks.has(id)) {
              this.chunks.delete(id);
              this.chunkData.delete(id);
            }
          }
        }
        this.updateMetadata(0, 0);
        await this.persistMetadata();
        if (reclaim) {
          for (const id of pending) {
            if (!liveChunks.has(id)) await store2.del(`pdim:chunk:${this.id}:${id}`);
          }
          await store2.del(journal);
        }
        this.emit("deleted", { path: entryPath });
        return true;
      }
      async list(prefix) {
        if (!this.isOpen) await this.open();
        const results = [];
        for (const [path8, entry] of this.entries) {
          if (!prefix || path8?.startsWith(prefix)) {
            results?.push(entry);
          }
        }
        return results;
      }
      getStats() {
        let uniqueChunks = 0;
        let duplicateRefs = 0;
        for (const chunk of this.chunks.values()) {
          uniqueChunks++;
          duplicateRefs += chunk?.accessCount - 1;
        }
        const deduplicationSavings = duplicateRefs > 0 ? duplicateRefs / (uniqueChunks + duplicateRefs) * 100 : 0;
        return {
          totalEntries: this.entries.size,
          totalSize: this.metadata.totalSize,
          compressedSize: this.metadata.compressedSize,
          compressionRatio: this.metadata.totalSize > 0 ? this.metadata.totalSize / this.metadata.compressedSize : 0,
          deduplicationSavings,
          nestedDimensions: this.nestedDimensions.size,
          maxDepth: this.metadata.maxDepth,
          chunkCount: this.chunks.size,
          uniqueChunks
        };
      }
      // ============================================================================
      // COMPRESSION ENGINE
      // ============================================================================
      /**
       * Compresses a chunk with the real codec mesh (zstd/xz/store, chosen per
       * AwarenessProfiler + size) instead of plain gzip, wrapped in the PDCF
       * container envelope (see ContainerFormat.ts) so the codec, dictionary id,
       * and block layout travel with the bytes.
       *
       * The PDCF magic prefix ("PDCF") is what lets decompress() tell a
       * newly-written chunk apart from a legacy gzip chunk (magic 0x1f 0x8b) by
       * its own leading bytes — no separate schema/version field is needed, and
       * no migration of already-stored chunks is required.
       *
       * contentClass is "unknown" because PocketDimension only ever sees raw
       * chunk bytes here — callers never pass a filename/MIME hint down to this
       * layer — so claiming a more specific class would not be honest.
       */
      async compress(data) {
        const result = await codecMesh.compress(data, { contentClass: "unknown" });
        const header = {
          profile: "lossless-max-dedup",
          contentClass: "unknown",
          codec: result.codec,
          isDelta: false,
          originalBytes: data.length,
          ...result.dictId ? { dictId: result.dictId } : {},
          ...result.blockSizes ? { blockSizes: result.blockSizes } : {}
        };
        return encodeContainer(header, result.compressed);
      }
      /**
       * Inverse of compress(). Branches on the chunk's own leading bytes:
       *   - PDCF magic present  → new codec-mesh path (decodeContainer + codecMesh.decompress)
       *   - no PDCF magic       → legacy chunk written before this integration;
       *                           fall back to the original raw-gzip stream decode
       *                           so already-stored data keeps working forever.
       */
      async decompress(data) {
        if (isContainer(data)) {
          const { header, payload } = decodeContainer(data);
          return codecMesh.decompress(header.codec, payload, {
            dictId: header.dictId,
            blockSizes: header.blockSizes
          });
        }
        return new Promise((resolve, reject) => {
          const chunks = [];
          const gunzip = createGunzip();
          const source = Readable?.from(data);
          const destination = new Writable({
            write(chunk, _encoding, callback) {
              chunks?.push(chunk);
              callback();
            },
            final(callback) {
              resolve(Buffer?.concat(chunks));
              callback();
            }
          });
          source?.pipe(gunzip).pipe(destination).on("error", reject);
        });
      }
      // ============================================================================
      // ENCRYPTION ENGINE
      // ============================================================================
      encrypt(data) {
        if (!this.encryptionKey) return data;
        const iv = randomBytes2(16);
        const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
        const encrypted = Buffer?.concat([cipher?.update(data), cipher?.final()]);
        const authTag = cipher?.getAuthTag();
        return Buffer?.concat([iv, authTag, encrypted]);
      }
      decrypt(data) {
        if (!this.encryptionKey) return data;
        const iv = data?.subarray(0, 16);
        const authTag = data?.subarray(16, 32);
        const encrypted = data?.subarray(32);
        const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv, {
          authTagLength: 16
        });
        decipher?.setAuthTag(authTag);
        return Buffer?.concat([decipher?.update(encrypted), decipher?.final()]);
      }
      // ============================================================================
      // HELPERS
      // ============================================================================
      hashContent(data) {
        return createHash3("sha256").update(data).digest("hex");
      }
      updateMetadata(_originalSize, _compressedSize) {
        this.metadata.totalSize = [...this.entries.values()].reduce((size, entry) => size + entry.size, 0);
        this.metadata.compressedSize = [...this.entries.values()].reduce((size, entry) => size + entry.compressedSize, 0);
        this.metadata.chunkCount = this.chunks.size;
        this.metadata.updatedAt = /* @__PURE__ */ new Date();
      }
      getMetadata() {
        return { ...this.metadata };
      }
      getId() {
        return this.id;
      }
      getName() {
        return this.name;
      }
    };
    PocketDimensionManager = class _PocketDimensionManager {
      constructor(storagePath = "./pocket-dimensions") {
        this.dimensions = /* @__PURE__ */ new Map();
        this.storagePath = storagePath;
      }
      static getInstance(storagePath) {
        if (!_PocketDimensionManager?.instance) {
          _PocketDimensionManager.instance = new _PocketDimensionManager(storagePath);
        }
        return _PocketDimensionManager?.instance;
      }
      /**
       * Open or create a pocket dimension with bracket notation access
       * Usage: const pocket = await manager?.openPocket('my-dimension');
       *        pocket['files/audio.mp3'].write(audioData);
       */
      async openPocket(id, config2) {
        if (this.dimensions.has(id)) {
          const dimension2 = this.dimensions.get(id);
          return dimension2;
        }
        const dimension = new PocketDimension({
          id,
          storage: config2?.storage,
          name: config2?.name || id,
          encryptionKey: config2?.encryptionKey,
          chunkSize: config2?.chunkSize,
          maxRecursionDepth: config2?.maxRecursionDepth,
          compressionLevel: config2?.compressionLevel,
          enableDeduplication: config2?.enableDeduplication,
          enableVersioning: config2?.enableVersioning,
          storagePath: this.storagePath
        });
        await dimension?.open();
        this.dimensions.set(id, dimension);
        return new Proxy(dimension, {
          get: (target, prop) => {
            if (prop in target) {
              const value = target[prop];
              return typeof value === "function" ? value?.bind(target) : value;
            }
            return target?.asBracketAccessor()[prop];
          },
          set: (target, prop, value) => {
            if (prop in target) {
              target[prop] = value;
              return true;
            }
            target?.write(prop, value);
            return true;
          }
        });
      }
      async closePocket(id) {
        const dimension = this.dimensions.get(id);
        if (dimension) {
          await dimension?.close();
          this.dimensions.delete(id);
        }
      }
      async closeAll() {
        for (const [id] of this.dimensions) {
          await this.closePocket(id);
        }
      }
      listPockets() {
        return Array.from(this.dimensions.keys());
      }
      getPocket(id) {
        return this.dimensions.get(id);
      }
      getGlobalStats() {
        let totalSize = 0;
        let compressedSize = 0;
        for (const dimension of this.dimensions.values()) {
          const stats = dimension?.getStats();
          totalSize += stats?.totalSize;
          compressedSize += stats?.compressedSize;
        }
        return {
          pockets: this.dimensions.size,
          totalSize,
          compressedSize
        };
      }
    };
    pocketManager = PocketDimensionManager?.getInstance(
      "./pocket-dimensions"
    );
    pocket_dimension_default = {
      PocketDimension,
      PocketDimensionManager,
      pocketManager,
      pocket
    };
  }
});

// server/lib/localPdimCapsules.ts
import { createHash as createHash4 } from "node:crypto";
var digest, referenceKey, LocalPdimCapsules;
var init_localPdimCapsules = __esm({
  "server/lib/localPdimCapsules.ts"() {
    "use strict";
    digest = (value) => createHash4("sha256").update(value).digest("hex");
    referenceKey = (key) => `pdim:capsule:ref:${digest(key)}`;
    LocalPdimCapsules = class {
      constructor(store2, commit) {
        this.store = store2;
        this.commit = commit;
        this.tail = Promise.resolve();
      }
      exec(command, args) {
        const operation = this.tail.then(() => this.execute(command.toUpperCase(), args));
        this.tail = operation.catch(() => {
        });
        return operation;
      }
      async execute(command, args) {
        if (!["CAPSULE.SET", "CAPSULE.GET", "CAPSULE.DEL"].includes(command)) {
          throw new Error(`ERR unknown capsule command '${command}'`);
        }
        if (args.length !== (command === "CAPSULE.SET" ? 2 : 1) || !args[0]) {
          throw new Error(`ERR wrong number of arguments for '${command}'`);
        }
        const key = args[0];
        const refKey = referenceKey(key);
        const previous = await this.store.exec("GET", [refKey]);
        if (command === "CAPSULE.DEL") {
          const legacy = await this.store.exec("GET", [key]);
          const changes2 = { [refKey]: null, [key]: null };
          await this.commit(changes2, () => this.store.publishEmbeddedStrings(changes2));
          return previous !== null || legacy !== null ? 1 : 0;
        }
        if (command === "CAPSULE.GET" && previous === null) {
          return this.store.exec("GET", [key]);
        }
        const namespace = digest(key).slice(0, 2);
        const changes = /* @__PURE__ */ Object.create(null);
        const { PocketDimension: PocketDimension2 } = await Promise.resolve().then(() => (init_pocket_dimension(), pocket_dimension_exports));
        const root = new PocketDimension2({
          id: "local-compute-capsules",
          name: "local-compute-capsules",
          enableDeduplication: true,
          enableVersioning: false,
          storage: {
            get: async (name) => {
              if (Object.hasOwn(changes, name)) return changes[name];
              const result = await this.store.exec("GET", [name]);
              if (result !== null && typeof result !== "string") throw new Error("Invalid capsule backing value");
              return result;
            },
            set: async (name, value) => {
              changes[name] = value;
              return "OK";
            }
          }
        });
        await root.open();
        const compute = await root.createNestedDimension("gpu-state");
        const pocket2 = await compute.createNestedDimension(namespace);
        if (command === "CAPSULE.GET") {
          const ref = JSON.parse(String(previous));
          if (ref.format !== "pdim-recursive-state-v1" || ref.namespace !== namespace || !/^[a-f0-9]{64}$/.test(ref.entry) || ref.sha256 !== ref.entry || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) {
            throw new Error("Invalid recursive capsule reference");
          }
          const restored = await pocket2.read(ref.entry);
          if (restored.length !== ref.bytes || digest(restored) !== ref.sha256) {
            throw new Error("Recursive capsule state checksum mismatch");
          }
          return restored.toString("utf8");
        }
        const bytes = Buffer.from(args[1], "utf8");
        const hash2 = digest(bytes);
        await pocket2.write(hash2, bytes, { depth: 2 });
        await root.close();
        const reference = {
          format: "pdim-recursive-state-v1",
          namespace,
          entry: hash2,
          sha256: hash2,
          bytes: bytes.length
        };
        changes[refKey] = JSON.stringify(reference);
        await this.commit(changes, () => this.store.publishEmbeddedStrings(changes));
        return "OK";
      }
    };
  }
});

// server/lib/localPdimCapsuleJournal.ts
import fs3 from "node:fs";
import path5 from "node:path";
import { createHash as createHash5 } from "node:crypto";
function* completeLines(file) {
  const fd = fs3.openSync(file, "r");
  let offset = 0;
  let fragments = [];
  try {
    while (true) {
      const chunk = Buffer.allocUnsafe(1024 * 1024);
      const count = fs3.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) return;
      let start = 0;
      for (let index3 = 0; index3 < count; index3++) {
        if (chunk[index3] !== 10) continue;
        fragments.push(chunk.subarray(start, index3));
        yield { line: Buffer.concat(fragments).toString("utf8"), end: offset + index3 + 1 };
        fragments = [];
        start = index3 + 1;
      }
      if (start < count) fragments.push(Buffer.from(chunk.subarray(start, count)));
      offset += count;
    }
  } finally {
    fs3.closeSync(fd);
  }
}
var checksum, LocalPdimCapsuleJournal;
var init_localPdimCapsuleJournal = __esm({
  "server/lib/localPdimCapsuleJournal.ts"() {
    "use strict";
    checksum = (body) => createHash5("sha256").update(body).digest("hex");
    LocalPdimCapsuleJournal = class {
      constructor(file) {
        this.file = file;
        this.publishedSeq = 0;
        this.tail = Promise.resolve();
        this.poisoned = false;
      }
      decode(line) {
        const envelope = JSON.parse(line);
        if (typeof envelope.body !== "string" || checksum(envelope.body) !== envelope.sha256) {
          throw new Error("Capsule journal checksum mismatch");
        }
        const record = JSON.parse(envelope.body);
        if (!Number.isSafeInteger(record.seq) || record.seq < 1 || !record.changes || typeof record.changes !== "object" || Array.isArray(record.changes) || Object.values(record.changes).some((v) => v !== null && typeof v !== "string")) {
          throw new Error("Invalid capsule journal record");
        }
        return record;
      }
      recover(baseline, apply) {
        this.publishedSeq = baseline;
        if (!fs3.existsSync(this.file)) return;
        const size = fs3.statSync(this.file).size;
        let end = 0;
        let previous = 0;
        let sequence2 = baseline;
        for (const item of completeLines(this.file)) {
          end = item.end;
          if (!item.line) continue;
          const record = this.decode(item.line);
          if (record.seq <= previous) throw new Error("Capsule journal sequence regression");
          previous = record.seq;
          if (record.seq <= baseline) continue;
          if (record.seq !== sequence2 + 1) throw new Error("Capsule journal sequence gap");
          sequence2 = record.seq;
        }
        for (const { line } of completeLines(this.file)) {
          if (!line) continue;
          const record = this.decode(line);
          if (record.seq <= baseline) continue;
          apply(record.changes);
          this.publishedSeq = record.seq;
        }
        if (end !== size) fs3.truncateSync(this.file, end);
      }
      commit(changes, publish) {
        const operation = this.tail.then(async () => {
          if (this.poisoned) throw new Error("Capsule journal requires recovery after failed rollback");
          await fs3.promises.mkdir(path5.dirname(this.file), { recursive: true });
          const file = await fs3.promises.open(this.file, "a+", 384);
          const size = (await file.stat()).size;
          const seq = this.publishedSeq + 1;
          const body = JSON.stringify({ seq, changes });
          try {
            await file.writeFile(JSON.stringify({ body, sha256: checksum(body) }) + "\n");
            await file.sync();
            const directory = await fs3.promises.open(path5.dirname(this.file), "r");
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          } catch (error) {
            try {
              await file.truncate(size);
              await file.sync();
            } catch {
              this.poisoned = true;
            }
            throw error;
          } finally {
            await file.close().catch((error) => {
              this.poisoned = true;
              throw error;
            });
          }
          publish();
          this.publishedSeq = seq;
        });
        this.tail = operation.catch(() => {
        });
        return operation;
      }
      compact(baseline) {
        const operation = this.tail.then(async () => {
          if (this.poisoned) return;
          if (!fs3.existsSync(this.file)) return;
          const temporary = `${this.file}.compact-${process.pid}`;
          const file = await fs3.promises.open(temporary, "w", 384);
          try {
            try {
              for (const { line } of completeLines(this.file)) {
                if (line && this.decode(line).seq > baseline) await file.writeFile(line + "\n");
              }
              await file.sync();
            } finally {
              await file.close();
            }
            await fs3.promises.rename(temporary, this.file);
          } finally {
            await fs3.promises.rm(temporary, { force: true });
          }
          const directory = await fs3.promises.open(path5.dirname(this.file), "r");
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        });
        this.tail = operation.catch(() => {
        });
        return operation;
      }
    };
  }
});

// server/lib/localPdimAofJournal.ts
import fs4 from "node:fs";
import path6 from "node:path";
import { createHash as createHash6, randomUUID as randomUUID3 } from "node:crypto";
async function syncDirectory(directory) {
  const handle = await fs4.promises.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function ensureDurableDirectory(directory) {
  const missing = [];
  let current = path6.resolve(directory);
  while (!fs4.existsSync(current)) {
    missing.push(current);
    const parent = path6.dirname(current);
    if (parent === current) throw new Error("No existing ancestor for PDIM AOF directory");
    current = parent;
  }
  for (const created of missing.reverse()) {
    try {
      await fs4.promises.mkdir(created);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const stat = await fs4.promises.stat(created);
      if (!stat.isDirectory()) throw error;
    }
    await syncDirectory(path6.dirname(created));
  }
}
function isRecord2(value) {
  if (!value || typeof value !== "object") return false;
  const record = value;
  return Number.isSafeInteger(record.s) && (record.s ?? 0) > 0 && typeof record.c === "string" && Array.isArray(record.a) && record.a.every((arg) => typeof arg === "string");
}
function encode(records) {
  if (records.length === 0) throw new Error("Cannot encode an empty PDIM AOF frame");
  const body = JSON.stringify({
    from: records[0].s,
    through: records.at(-1).s,
    records
  });
  return JSON.stringify({ body, sha256: checksum2(body) });
}
function decode(line) {
  const envelope = JSON.parse(line);
  if (typeof envelope.body !== "string" || typeof envelope.sha256 !== "string" || checksum2(envelope.body) !== envelope.sha256) {
    throw new Error("Local PDIM AOF checksum mismatch");
  }
  const body = JSON.parse(envelope.body);
  if (!Number.isSafeInteger(body.from) || !Number.isSafeInteger(body.through) || !Array.isArray(body.records) || body.records.length === 0 || !body.records.every(isRecord2) || body.from !== body.records[0].s || body.through !== body.records.at(-1).s) {
    throw new Error("Invalid local PDIM AOF frame");
  }
  for (let i = 1; i < body.records.length; i++) {
    if (body.records[i].s !== body.records[i - 1].s + 1) {
      throw new Error("Non-contiguous records in local PDIM AOF frame");
    }
  }
  return body;
}
var checksum2, LocalPdimAofJournal;
var init_localPdimAofJournal = __esm({
  "server/lib/localPdimAofJournal.ts"() {
    "use strict";
    checksum2 = (body) => createHash6("sha256").update(body).digest("hex");
    LocalPdimAofJournal = class {
      constructor(file) {
        this.file = file;
        this.publishedSeq = 0;
        this.tail = Promise.resolve();
        this.poisoned = false;
        this.recovered = false;
      }
      recover(baseline) {
        if (this.recovered) throw new Error("Local PDIM AOF journal recovered more than once");
        if (!Number.isSafeInteger(baseline) || baseline < 0) {
          throw new Error("Invalid local PDIM AOF snapshot watermark");
        }
        this.recovered = true;
        this.publishedSeq = baseline;
        if (!fs4.existsSync(this.file)) return [];
        const bytes = fs4.readFileSync(this.file);
        const end = bytes.lastIndexOf(10) + 1;
        const lines = bytes.subarray(0, end).toString("utf8").split("\n").filter(Boolean);
        const records = [];
        let previousFrameEnd = null;
        for (const line of lines) {
          const frame = decode(line);
          const extendsPrevious = previousFrameEnd !== null && frame.from === previousFrameEnd + 1;
          const beginsAfterSnapshot = previousFrameEnd !== null && previousFrameEnd <= baseline && frame.from === baseline + 1;
          if (previousFrameEnd !== null && !extendsPrevious && !beginsAfterSnapshot) {
            throw new Error("Local PDIM AOF frame sequence discontinuity");
          }
          previousFrameEnd = frame.through;
          records.push(...frame.records);
        }
        const replay = [];
        let replaySeq = baseline;
        for (const record of records) {
          if (record.s <= baseline) continue;
          if (record.s !== replaySeq + 1) {
            throw new Error("Local PDIM AOF sequence gap after snapshot watermark");
          }
          replay.push(record);
          replaySeq = record.s;
        }
        this.publishedSeq = Math.max(baseline, previousFrameEnd ?? 0);
        if (end !== bytes.length) fs4.truncateSync(this.file, end);
        return replay;
      }
      append(records) {
        if (records.length === 0) return Promise.resolve();
        const operation = this.tail.then(async () => {
          if (!this.recovered) throw new Error("Local PDIM AOF journal must recover before append");
          if (this.poisoned) throw new Error("Local PDIM AOF journal requires recovery");
          let expected = this.publishedSeq + 1;
          for (const record of records) {
            if (!isRecord2(record) || record.s !== expected) {
              throw new Error(`Local PDIM AOF expected sequence ${expected}`);
            }
            expected++;
          }
          await ensureDurableDirectory(path6.dirname(this.file));
          const existed = fs4.existsSync(this.file);
          const file = await fs4.promises.open(this.file, "a+", 384);
          const size = (await file.stat()).size;
          let closeError = null;
          try {
            await file.writeFile(encode(records) + "\n", "utf8");
            await file.sync();
            if (!existed) {
              await syncDirectory(path6.dirname(this.file));
            }
          } catch (error) {
            try {
              await file.truncate(size);
              await file.sync();
            } catch {
              this.poisoned = true;
            }
            throw error;
          } finally {
            try {
              await file.close();
            } catch (error) {
              this.poisoned = true;
              closeError = error;
            }
          }
          if (closeError) throw closeError;
          this.publishedSeq = records.at(-1).s;
        });
        this.tail = operation.catch(() => {
        });
        return operation;
      }
      compact(baseline) {
        const operation = this.tail.then(async () => {
          if (!Number.isSafeInteger(baseline) || baseline < 0 || baseline > this.publishedSeq) {
            throw new Error("Local PDIM AOF compaction exceeds the durable sequence");
          }
          if (this.poisoned) throw new Error("Local PDIM AOF journal requires recovery");
          let raw;
          try {
            raw = await fs4.promises.readFile(this.file, "utf8");
          } catch (error) {
            if (error.code === "ENOENT") return;
            throw error;
          }
          if (raw.length > 0 && !raw.endsWith("\n")) {
            throw new Error("Cannot compact a torn local PDIM AOF journal");
          }
          const all = raw.split("\n").filter(Boolean).flatMap((line) => decode(line).records);
          const retained = all.filter((record) => record.s > baseline);
          if (retained.length > 0 && retained[0].s !== baseline + 1) {
            throw new Error("Local PDIM AOF compaction found a sequence gap");
          }
          const content = retained.length === 0 ? "" : `${encode(retained)}
`;
          const temporary = `${this.file}.compact-${process.pid}-${randomUUID3()}`;
          const file = await fs4.promises.open(temporary, "wx", 384);
          try {
            await file.writeFile(content, "utf8");
            await file.sync();
          } finally {
            await file.close();
          }
          await fs4.promises.rename(temporary, this.file);
          const directory = await fs4.promises.open(path6.dirname(this.file), "r");
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
          this.publishedSeq = Math.max(baseline, retained.at(-1)?.s ?? 0);
        });
        this.tail = operation.catch(() => {
        });
        return operation;
      }
    };
  }
});

// server/lib/pdimSnapshotJson.ts
import fs5 from "node:fs";
import { StringDecoder } from "node:string_decoder";
function* snapshotJsonChunks(entries) {
  yield "{";
  let first = true;
  for (const [key, value] of Object.entries(entries)) {
    yield `${first ? "" : ","}${JSON.stringify(key)}:${JSON.stringify(value)}`;
    first = false;
  }
  yield "}";
}
function readSnapshotJson(file, chunkBytes = 1024 * 1024) {
  const result = /* @__PURE__ */ Object.create(null);
  const fd = fs5.openSync(file, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.alloc(chunkBytes);
  let begun = false, ended = false, quoted = false, escaped = false;
  let depth = 0, afterComma = false;
  let parts = [];
  const member = (allowEmpty) => {
    const raw = parts.join("").trim();
    parts = [];
    if (!raw && allowEmpty) return;
    if (!raw) throw new Error("Empty snapshot member");
    const parsed = JSON.parse(`{${raw}}`);
    const keys = Object.keys(parsed);
    if (keys.length !== 1 || Object.hasOwn(result, keys[0])) throw new Error("Invalid or duplicate snapshot member");
    result[keys[0]] = parsed[keys[0]];
  };
  const consume = (text3) => {
    let start = 0;
    const stringTokens = /["\\]/g;
    for (let i = 0; i < text3.length; i++) {
      let char = text3[i];
      if (!begun) {
        start = i + 1;
        if (/\s/.test(char)) continue;
        if (char !== "{") throw new Error("Snapshot must be a JSON object");
        begun = true;
        depth = 1;
        continue;
      }
      if (ended) {
        if (!/\s/.test(char)) throw new Error("Trailing snapshot content");
        start = i + 1;
        continue;
      }
      if (quoted) {
        if (escaped) {
          escaped = false;
          continue;
        }
        stringTokens.lastIndex = i;
        const token = stringTokens.exec(text3);
        if (!token) break;
        i = token.index;
        char = token[0];
        if (char === "\\") escaped = true;
        else quoted = false;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === "{" || char === "[") depth++;
      if (char === "}" || char === "]") depth--;
      if (char === "," && depth === 1 || char === "}" && depth === 0) {
        parts.push(text3.slice(start, i));
        member(char === "}" && !afterComma);
        afterComma = char === ",";
        ended = char === "}";
        start = i + 1;
      }
    }
    if (start < text3.length) parts.push(text3.slice(start));
  };
  try {
    let count;
    while ((count = fs5.readSync(fd, buffer, 0, buffer.length, null)) > 0) consume(decoder.write(buffer.subarray(0, count)));
    consume(decoder.end());
    if (!begun || !ended || quoted || depth !== 0) throw new Error("Incomplete snapshot JSON");
    return result;
  } finally {
    fs5.closeSync(fd);
  }
}
var init_pdimSnapshotJson = __esm({
  "server/lib/pdimSnapshotJson.ts"() {
    "use strict";
  }
});

// server/lib/pdimSnapshotWriter.ts
import { Worker as Worker4 } from "node:worker_threads";
function capture(value, seen = /* @__PURE__ */ new Map()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value);
  const result = Array.isArray(value) ? [] : /* @__PURE__ */ Object.create(null);
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) result[key] = capture(item, seen);
  return result;
}
function transferSize(value, seen = /* @__PURE__ */ new Set()) {
  if (typeof value === "string") return value.length * 2;
  if (!value || typeof value !== "object" || seen.has(value)) return 8;
  seen.add(value);
  return Object.entries(value).reduce((size, [key, item]) => size + key.length * 2 + transferSize(item, seen), 0);
}
function writeSnapshotOffThread(file, entries) {
  const captured = Object.entries(capture(entries));
  const worker = new Worker4(writer, { eval: true, execArgv: [], workerData: { file } });
  return new Promise((resolve, reject) => {
    let completed = false;
    let failure;
    let offset = 0;
    worker.on("message", (message) => {
      if (message?.ok) completed = true;
      if (message?.ready) setImmediate(() => {
        try {
          if (offset === captured.length) {
            worker.postMessage(null);
            return;
          }
          const batch = [];
          let bytes = 0;
          while (offset < captured.length && bytes < 1024 * 1024 && batch.length < 64) {
            const entry = captured[offset++];
            batch.push(entry);
            bytes += transferSize(entry);
          }
          worker.postMessage(batch);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          void worker.terminate();
        }
      });
    });
    worker.once("error", (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    });
    worker.once("exit", (code) => {
      if (code === 0 && completed && !failure) resolve();
      else reject(failure ?? new Error(`Snapshot worker exited without a durable result (code ${code})`));
    });
  });
}
var writer;
var init_pdimSnapshotWriter = __esm({
  "server/lib/pdimSnapshotWriter.ts"() {
    "use strict";
    writer = `
const fs = require("node:fs");
const { parentPort, workerData } = require("node:worker_threads");
let fd;
let first = true;
try {
  fd = fs.openSync(workerData.file, "wx", 0o600);
  fs.writeFileSync(fd, "{");
  parentPort.on("message", rows => {
    try {
      if (rows === null) {
        fs.writeFileSync(fd, "}");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        parentPort.postMessage({ ok: true });
        parentPort.close();
      } else {
        for (const [key, value] of rows) {
          fs.writeFileSync(fd, (first ? "" : ",") + JSON.stringify(key) + ":" + JSON.stringify(value));
          first = false;
        }
        parentPort.postMessage({ ready: true });
      }
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      throw error;
    }
  });
  parentPort.postMessage({ ready: true });
} catch (error) {
  if (fd !== undefined) fs.closeSync(fd);
  throw error;
}
`;
  }
});

// scripts/recovery-private-store.mjs
import { Storage, CRC32C } from "@google-cloud/storage";
async function createRecoveryStorage({
  bucketId,
  fetchImpl = globalThis.fetch,
  StorageClass = Storage
} = {}) {
  let selected = bucketId;
  if (!selected) {
    if (typeof fetchImpl !== "function") throw new Error("Sidecar default-bucket lookup is unavailable");
    const response = await fetchImpl(DEFAULT_BUCKET_URL);
    if (!response.ok) throw new Error(`Sidecar default-bucket lookup failed (${response.status})`);
    const body = await response.json();
    selected = body?.bucketId;
  }
  selected = assertSafeBucketId(selected);
  const client = new StorageClass({ credentials: REPLIT_ADC, projectId: "" });
  return { bucket: client.bucket(selected), bucketId: selected };
}
var SIDECAR, DEFAULT_BUCKET_URL, REPLIT_ADC, assertSafeBucketId, MANAGED_STORAGE_CONTRACT;
var init_recovery_private_store = __esm({
  "scripts/recovery-private-store.mjs"() {
    "use strict";
    SIDECAR = "http://127.0.0.1:1106";
    DEFAULT_BUCKET_URL = `${SIDECAR}/object-storage/default-bucket`;
    REPLIT_ADC = Object.freeze({
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${SIDECAR}/token`,
      type: "external_account",
      credential_source: {
        url: `${SIDECAR}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" }
      },
      universe_domain: "googleapis.com"
    });
    assertSafeBucketId = (value) => {
      if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/.test(value)) {
        throw new Error("Recovery bucket selection was missing or invalid");
      }
      return value;
    };
    MANAGED_STORAGE_CONTRACT = Object.freeze({
      privacy: "private Replit App Storage; authenticated access required",
      retention: "retained-until-explicit-delete",
      fixedDurationLocked: false
    });
  }
});

// server/lib/pdimBucketObjects.ts
async function configuredPdimBucketObjects() {
  const bucketId = process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID;
  if (!bucketId) throw new Error("PDIM App Storage bucket is not configured");
  const { bucket } = await createRecoveryStorage({ bucketId });
  return new PdimBucketObjects(bucket);
}
var PdimBucketObjects;
var init_pdimBucketObjects = __esm({
  "server/lib/pdimBucketObjects.ts"() {
    "use strict";
    init_recovery_private_store();
    PdimBucketObjects = class {
      constructor(bucket) {
        this.bucket = bucket;
      }
      async read(key) {
        const file = this.bucket.file(key);
        let generation;
        try {
          const [metadata] = await file.getMetadata();
          if (typeof metadata.generation !== "string") throw new Error("Missing object generation");
          generation = metadata.generation;
        } catch (error) {
          if (error.code === 404) return null;
          throw error;
        }
        const [bytes] = await this.bucket.file(key, { generation }).download({ validation: "crc32c" });
        return { bytes, generation };
      }
      async write(key, bytes, generation) {
        const file = this.bucket.file(key);
        await file.save(bytes, {
          resumable: false,
          validation: "crc32c",
          preconditionOpts: { ifGenerationMatch: generation }
        });
        const published = file.metadata.generation;
        if (typeof published !== "string") throw new Error("Upload returned no generation receipt");
        return published;
      }
    };
  }
});

// server/lib/pdimBucketJournal.ts
import { createHash as createHash7, randomUUID as randomUUID4 } from "node:crypto";
var digest2, hash, sequence, PdimBucketUnavailable, PdimBucketLeaseBusy, PdimBucketJournal;
var init_pdimBucketJournal = __esm({
  "server/lib/pdimBucketJournal.ts"() {
    "use strict";
    digest2 = (bytes) => createHash7("sha256").update(bytes).digest("hex");
    hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    sequence = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
    PdimBucketUnavailable = class extends Error {
      constructor() {
        super(...arguments);
        this.code = "PDIM_DURABILITY_FAILURE";
      }
    };
    PdimBucketLeaseBusy = class extends PdimBucketUnavailable {
      constructor(retryAfterMs) {
        super("Another process owns this bucket PDIM namespace");
        this.retryAfterMs = retryAfterMs;
      }
    };
    PdimBucketJournal = class {
      constructor(objects, prefix, validateValue, clock = Date.now, leaseMs = 6e4) {
        this.objects = objects;
        this.prefix = prefix;
        this.validateValue = validateValue;
        this.clock = clock;
        this.leaseMs = leaseMs;
        this.owner = randomUUID4();
        this.tail = Promise.resolve();
        if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) {
          throw new Error("Invalid PDIM bucket namespace");
        }
        if (!Number.isSafeInteger(leaseMs) || leaseMs < 1e3) throw new Error("Invalid lease duration");
      }
      serial(operation) {
        const result = this.tail.then(operation);
        this.tail = result.then(() => void 0, () => void 0);
        return result;
      }
      decodeHead(bytes) {
        const value = JSON.parse(bytes.toString());
        if (value.version !== 1 || typeof value.commit !== "string" || !/^[a-f0-9-]{36}$/.test(value.commit) || !hash(value.snapshot) || !sequence(value.sequence) || !sequence(value.baseSequence) || value.baseSequence > value.sequence || !(value.tip === null || hash(value.tip)) || !(value.baseTip === null || hash(value.baseTip)) || value.sequence === 0 !== (value.tip === null) || value.baseSequence === 0 !== (value.baseTip === null) || !(value.owner === null || typeof value.owner === "string" && /^[a-f0-9-]{36}$/.test(value.owner)) || !Number.isSafeInteger(value.leaseUntil) || value.leaseUntil < 0) {
          throw new PdimBucketUnavailable("Invalid bucket PDIM commit pointer");
        }
        return value;
      }
      assertOwned() {
        if (this.failure) throw this.failure;
        if (!this.head || this.head.owner !== this.owner || this.head.leaseUntil <= this.clock()) {
          throw new PdimBucketUnavailable("Bucket PDIM ownership unavailable or expired");
        }
      }
      async putImmutable(bytes) {
        const id = digest2(bytes);
        const key = `${this.prefix}/objects/${id}`;
        try {
          await this.objects.write(key, bytes, 0);
        } catch (cause) {
          const existing = await this.objects.read(key);
          if (!existing || digest2(existing.bytes) !== id) {
            throw new PdimBucketUnavailable("Bucket PDIM object publication failed", { cause });
          }
        }
        return id;
      }
      async readImmutable(id) {
        if (!hash(id)) throw new PdimBucketUnavailable("Invalid bucket object reference");
        const object = await this.objects.read(`${this.prefix}/objects/${id}`);
        if (!object || digest2(object.bytes) !== id) {
          throw new PdimBucketUnavailable("Bucket PDIM object missing or corrupt");
        }
        return object.bytes;
      }
      async publish(next, expected) {
        const committed = { ...next, commit: randomUUID4() };
        const bytes = Buffer.from(JSON.stringify(committed));
        try {
          this.generation = await this.objects.write(`${this.prefix}/HEAD`, bytes, expected);
        } catch (cause) {
          const actual = await this.objects.read(`${this.prefix}/HEAD`);
          if (!actual || !actual.bytes.equals(bytes)) {
            throw new PdimBucketUnavailable("Bucket PDIM commit rejected or unconfirmed", { cause });
          }
          this.generation = actual.generation;
        }
        this.head = committed;
      }
      /** Explicit migration/new-store operation; never called implicitly on a miss. */
      initialize(snapshot) {
        return this.serial(async () => {
          await this.readImmutable(snapshot);
          await this.publish({
            version: 1,
            snapshot,
            baseSequence: 0,
            baseTip: null,
            sequence: 0,
            tip: null,
            owner: null,
            leaseUntil: 0
          }, 0);
        });
      }
      acquire() {
        return this.serial(async () => {
          if (this.head?.owner === this.owner) throw new Error("Bucket PDIM already acquired");
          const actual = await this.objects.read(`${this.prefix}/HEAD`);
          if (!actual) throw new PdimBucketUnavailable("Bucket PDIM migration is required; refusing an empty store");
          const head = this.decodeHead(actual.bytes);
          if (head.owner && head.leaseUntil > this.clock()) {
            throw new PdimBucketLeaseBusy(head.leaseUntil - this.clock());
          }
          await this.publish(
            { ...head, owner: this.owner, leaseUntil: this.clock() + this.leaseMs },
            actual.generation
          );
        });
      }
      renew() {
        return this.serial(async () => {
          try {
            if (this.failure) throw this.failure;
            if (!this.head || this.head.owner !== this.owner) {
              throw new PdimBucketUnavailable("Bucket PDIM is not owned by this process");
            }
            if (this.head.leaseUntil <= this.clock()) {
              const actual = await this.objects.read(`${this.prefix}/HEAD`);
              if (!actual || actual.generation !== this.generation || this.decodeHead(actual.bytes).owner !== this.owner) {
                throw new PdimBucketUnavailable("Bucket PDIM owner changed during lease expiry");
              }
            }
            await this.publish({ ...this.head, leaseUntil: this.clock() + this.leaseMs }, this.generation);
          } catch (cause) {
            this.failure = new PdimBucketUnavailable("Bucket PDIM lease renewal failed", { cause });
            throw this.failure;
          }
        });
      }
      checkpointPosition() {
        this.assertOwned();
        return Object.freeze({ sequence: this.head.sequence, tip: this.head.tip });
      }
      /** Execute a synchronous capture only after earlier commits AND their local
       * publication callbacks. The caller must separately fence Redis mutations. */
      capture(callback) {
        return this.serial(async () => {
          this.assertOwned();
          return callback(this.checkpointPosition());
        });
      }
      append(value, publish) {
        return this.serial(async () => {
          this.assertOwned();
          if (!this.validateValue(value)) throw new Error("Invalid bucket PDIM transaction");
          try {
            const current = this.head;
            const frame = {
              version: 1,
              sequence: current.sequence + 1,
              previous: current.tip,
              value
            };
            const tip = await this.putImmutable(Buffer.from(JSON.stringify(frame)));
            this.assertOwned();
            await this.publish({
              ...current,
              tip,
              sequence: frame.sequence,
              leaseUntil: this.clock() + this.leaseMs
            }, this.generation);
            publish?.();
            return frame.sequence;
          } catch (cause) {
            this.failure = new PdimBucketUnavailable("Bucket PDIM write failed; recovery required", { cause });
            throw this.failure;
          }
        });
      }
      async recover(onProgress) {
        this.assertOwned();
        const head = { ...this.head };
        const snapshot = await this.readImmutable(head.snapshot);
        const transactions = [];
        let tip = head.tip;
        let expected = head.sequence;
        onProgress?.(0, head.sequence - head.baseSequence);
        while (expected > head.baseSequence) {
          if (!tip) throw new PdimBucketUnavailable("Bucket PDIM journal truncated");
          const frame = JSON.parse((await this.readImmutable(tip)).toString());
          if (frame.version !== 1 || frame.sequence !== expected || !(frame.previous === null || hash(frame.previous)) || !this.validateValue(frame.value)) {
            throw new PdimBucketUnavailable("Bucket PDIM journal discontinuity or invalid transaction");
          }
          transactions.push(frame.value);
          tip = frame.previous;
          expected--;
          if ((head.sequence - expected) % 32 === 0 || expected === head.baseSequence) {
            onProgress?.(head.sequence - expected, head.sequence - head.baseSequence);
          }
        }
        if (tip !== head.baseTip) throw new PdimBucketUnavailable("Bucket PDIM checkpoint ancestry mismatch");
        this.assertOwned();
        return { snapshot, transactions: transactions.reverse() };
      }
      checkpoint(snapshot, position) {
        return this.serial(async () => {
          this.assertOwned();
          const head = this.head;
          if (!sequence(position.sequence) || position.sequence < head.baseSequence || position.sequence > head.sequence || !(position.tip === null || hash(position.tip))) {
            throw new Error("Invalid bucket PDIM checkpoint position");
          }
          let tip = head.tip;
          for (let index3 = head.sequence; index3 > position.sequence; index3--) {
            const frame = JSON.parse((await this.readImmutable(tip)).toString());
            if (frame.sequence !== index3) throw new Error("Invalid checkpoint ancestry");
            tip = frame.previous;
          }
          if (tip !== position.tip) throw new Error("Checkpoint is not a committed ancestor");
          await this.readImmutable(snapshot);
          this.assertOwned();
          await this.publish({
            ...head,
            snapshot,
            baseSequence: position.sequence,
            baseTip: position.tip
          }, this.generation);
        });
      }
      release() {
        return this.serial(async () => {
          this.assertOwned();
          await this.publish({ ...this.head, owner: null, leaseUntil: 0 }, this.generation);
        });
      }
    };
  }
});

// server/lib/pdimBucketRecovery.ts
function isBucketTransaction(value) {
  if (!value || typeof value !== "object") return false;
  const transaction = value;
  if (transaction.kind === "redis") {
    return Array.isArray(transaction.records) && transaction.records.length > 0 && transaction.records.every((record) => !!record && Number.isSafeInteger(record.s) && record.s > 0 && typeof record.c === "string" && Array.isArray(record.a) && record.a.every((arg) => typeof arg === "string"));
  }
  if (transaction.kind === "capsule") {
    return Number.isSafeInteger(transaction.sequence) && transaction.sequence > 0 && !!transaction.changes && typeof transaction.changes === "object" && !Array.isArray(transaction.changes) && Object.values(transaction.changes).every((item) => item === null || typeof item === "string");
  }
  return false;
}
function orderedBucketRecovery(transactions, redisBaseline, capsuleBaseline) {
  if (![redisBaseline, capsuleBaseline].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error("Invalid bucket recovery baseline");
  }
  let redisSequence = redisBaseline;
  let capsuleSequence = capsuleBaseline;
  let replaySequence = redisBaseline;
  const records = [];
  const next = () => {
    if (!Number.isSafeInteger(replaySequence + 1)) throw new Error("Recovery sequence overflow");
    return ++replaySequence;
  };
  for (const transaction of transactions) {
    if (!isBucketTransaction(transaction)) throw new Error("Invalid bucket transaction");
    if (transaction.kind === "redis") {
      for (const record of transaction.records) {
        if (record.s !== redisSequence + 1) throw new Error("Bucket Redis sequence discontinuity");
        redisSequence = record.s;
        records.push({ ...record, s: next() });
      }
    } else {
      if (transaction.sequence !== capsuleSequence + 1) throw new Error("Bucket capsule sequence discontinuity");
      capsuleSequence = transaction.sequence;
      for (const [key, value] of Object.entries(transaction.changes)) {
        records.push({
          s: next(),
          c: "__RESTORE_KEY",
          a: [key, JSON.stringify(value === null ? null : { type: "string", value })]
        });
      }
    }
  }
  return { records, redisSequence, capsuleSequence };
}
var init_pdimBucketRecovery = __esm({
  "server/lib/pdimBucketRecovery.ts"() {
    "use strict";
  }
});

// server/lib/pdimBucketSnapshot.ts
import { createHash as createHash8 } from "node:crypto";
async function writeBucketSnapshot(objects, entries, redisSequence, capsuleSequence, chunkBytes = 4 * 1024 * 1024) {
  if (!validSequence(redisSequence) || !validSequence(capsuleSequence) || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new Error("Invalid snapshot limits");
  const chunks = [];
  let lines = [];
  let bytes = 2;
  let count = 0;
  const seen = /* @__PURE__ */ new Set();
  const flush = async () => {
    if (!lines.length) return;
    chunks.push(await objects.putImmutable(Buffer.from(`[${lines.join(",")}]`)));
    lines = [];
    bytes = 2;
  };
  for (const [key, value] of entries) {
    if (typeof key !== "string" || seen.has(key) || value === void 0) {
      throw new Error("Invalid or duplicate snapshot entry");
    }
    seen.add(key);
    const line = JSON.stringify([key, value]);
    const length = Buffer.byteLength(line);
    if (bytes + length + 1 > chunkBytes) await flush();
    lines.push(line);
    bytes += length + 1;
    count++;
  }
  await flush();
  const manifest = {
    format: "pdim-bucket-snapshot-v1",
    redisSequence,
    capsuleSequence,
    count,
    chunks
  };
  return objects.putImmutable(Buffer.from(JSON.stringify(manifest)));
}
async function readBucketSnapshot(objects, manifestBytes, validate, onProgress) {
  const manifest = JSON.parse(manifestBytes.toString());
  if (manifest.format !== "pdim-bucket-snapshot-v1" || !validSequence(manifest.redisSequence) || !validSequence(manifest.capsuleSequence) || !validSequence(manifest.count) || !Array.isArray(manifest.chunks) || manifest.chunks.some((id) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))) {
    throw new Error("Invalid bucket PDIM snapshot manifest");
  }
  const entries = /* @__PURE__ */ new Map();
  onProgress?.(0, manifest.chunks.length);
  for (let offset = 0; offset < manifest.chunks.length; offset += 4) {
    const buffers = await Promise.all(manifest.chunks.slice(offset, offset + 4).map((id) => objects.readImmutable(id)));
    for (const buffer of buffers) {
      const rows = JSON.parse(buffer.toString());
      if (!Array.isArray(rows)) throw new Error("Invalid bucket PDIM snapshot chunk");
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || entries.has(row[0])) {
          throw new Error("Invalid or duplicate bucket PDIM snapshot entry");
        }
        entries.set(row[0], validate(row[0], row[1]));
      }
    }
    const completed = Math.min(offset + 4, manifest.chunks.length);
    if (completed % 32 === 0 || completed === manifest.chunks.length) {
      onProgress?.(completed, manifest.chunks.length);
    }
  }
  if (entries.size !== manifest.count) throw new Error("Bucket PDIM snapshot count mismatch");
  return { entries, redisSequence: manifest.redisSequence, capsuleSequence: manifest.capsuleSequence };
}
async function verifyBucketSnapshot(objects, id, expected, redisSequence, capsuleSequence) {
  const manifest = JSON.parse((await objects.readImmutable(id)).toString());
  if (manifest.format !== "pdim-bucket-snapshot-v1" || manifest.count !== expected.size || manifest.redisSequence !== redisSequence || manifest.capsuleSequence !== capsuleSequence || !Array.isArray(manifest.chunks)) throw new Error("Imported snapshot contract mismatch");
  const seen = /* @__PURE__ */ new Set();
  const digest5 = (value) => createHash8("sha256").update(JSON.stringify(value)).digest("hex");
  for (const chunk of manifest.chunks) {
    const rows = JSON.parse((await objects.readImmutable(chunk)).toString());
    if (!Array.isArray(rows)) throw new Error("Invalid imported snapshot chunk");
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || seen.has(row[0]) || !expected.has(row[0]) || digest5(row[1]) !== digest5(expected.get(row[0]))) {
        throw new Error("Imported snapshot entry mismatch");
      }
      seen.add(row[0]);
    }
  }
  if (seen.size !== expected.size) throw new Error("Imported snapshot missing entries");
}
var validSequence;
var init_pdimBucketSnapshot = __esm({
  "server/lib/pdimBucketSnapshot.ts"() {
    "use strict";
    validSequence = (n) => Number.isSafeInteger(n) && Number(n) >= 0;
  }
});

// server/lib/pdimBucketPersistence.ts
function captureEntry(entry) {
  const copy = (value) => {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    }
    return value;
  };
  return copy(entry);
}
var CheckpointCancelledForShutdown, PdimBucketPersistence;
var init_pdimBucketPersistence = __esm({
  "server/lib/pdimBucketPersistence.ts"() {
    "use strict";
    init_pdimBucketJournal();
    init_pdimBucketRecovery();
    init_pdimBucketSnapshot();
    CheckpointCancelledForShutdown = class extends Error {
    };
    PdimBucketPersistence = class {
      constructor(objects, namespace, engine, entries, validate, onStage = () => {
      }) {
        this.engine = engine;
        this.entries = entries;
        this.validate = validate;
        this.onStage = onStage;
        this.capsuleSequence = 0;
        this.closing = false;
        this.journal = new PdimBucketJournal(objects, namespace, isBucketTransaction);
      }
      assertHealthy() {
        if (this.failed) throw this.failed;
        this.journal.assertOwned();
      }
      /** Offline migration only: input must be a quiesced, recovered source. */
      async initialize(entries, redisSequence, capsuleSequence) {
        const snapshot = await writeBucketSnapshot(this.journal, entries, redisSequence, capsuleSequence);
        await this.journal.initialize(snapshot);
      }
      async open() {
        this.onStage("acquiring-lease");
        await this.journal.acquire();
        this.onStage("lease-acquired");
        this.heartbeat = setInterval(() => {
          if (this.renewPending || this.failed) return;
          this.renewPending = this.journal.renew().catch((cause) => {
            this.failed = Object.assign(
              new Error("Bucket PDIM lease unavailable", { cause }),
              { code: "PDIM_DURABILITY_FAILURE" }
            );
          }).finally(() => {
            this.renewPending = void 0;
          });
        }, 1e4);
        this.heartbeat.unref();
        try {
          const recovered = await this.journal.recover((completed, total) => this.onStage(`journal:${completed}/${total}`));
          const snapshot = await readBucketSnapshot(
            this.journal,
            recovered.snapshot,
            this.validate,
            (completed, total) => this.onStage(`snapshot-shards:${completed}/${total}`)
          );
          this.onStage("snapshot-verified");
          await this.journal.renew();
          const ordered = orderedBucketRecovery(recovered.transactions, snapshot.redisSequence, snapshot.capsuleSequence);
          this.assertHealthy();
          this.entries.clear();
          for (const [key, entry] of snapshot.entries) this.entries.set(key, entry);
          this.engine.attachEmbeddedSnapshot(this.entries, {
            baselineSequence: snapshot.redisSequence,
            recoveryRecords: ordered.records
          });
          this.engine.attachEmbeddedSnapshot(this.entries, {
            baselineSequence: ordered.redisSequence,
            appendAof: (records) => this.appendRedis(records)
          });
          this.capsuleSequence = ordered.capsuleSequence;
        } catch (error) {
          if (this.heartbeat) clearInterval(this.heartbeat);
          this.engine.closeEmbedded();
          throw error;
        }
      }
      async appendRedis(records) {
        this.assertHealthy();
        await this.journal.append({ kind: "redis", records: [...records] });
      }
      async commitCapsule(changes, publish) {
        this.assertHealthy();
        const sequence2 = this.capsuleSequence + 1;
        await this.journal.append({ kind: "capsule", sequence: sequence2, changes }, () => {
          publish();
          this.capsuleSequence = sequence2;
        });
      }
      checkpoint() {
        if (this.checkpointPending) return this.checkpointPending;
        this.checkpointPending = this.saveCheckpoint().finally(() => {
          this.checkpointPending = void 0;
        });
        return this.checkpointPending;
      }
      async saveCheckpoint() {
        const captured = await this.captureSnapshot();
        const snapshot = await writeBucketSnapshot(
          {
            readImmutable: (id) => this.journal.readImmutable(id),
            putImmutable: (bytes) => {
              if (this.closing) throw new CheckpointCancelledForShutdown();
              return this.journal.putImmutable(bytes);
            }
          },
          captured.entries,
          captured.redisSequence,
          captured.capsuleSequence
        );
        if (this.closing) throw new CheckpointCancelledForShutdown();
        await this.journal.checkpoint(snapshot, captured.position);
        this.engine.compactEmbeddedAof(captured.redisSequence);
      }
      async captureSnapshot() {
        this.assertHealthy();
        return this.engine.captureEmbeddedCheckpoint(
          (redisSequence) => this.journal.capture((position) => ({
            position,
            redisSequence,
            capsuleSequence: this.capsuleSequence,
            entries: [...this.entries].map(([key, entry]) => [key, captureEntry(entry)])
          }))
        );
      }
      /** The application must stop admitting commands and drain HTTP first. */
      async close() {
        this.closing = true;
        try {
          if (this.checkpointPending) {
            try {
              await this.checkpointPending;
            } catch (error) {
              if (!(error instanceof CheckpointCancelledForShutdown)) throw error;
            }
          }
          await this.journal.capture(() => void 0);
          if (this.heartbeat) clearInterval(this.heartbeat);
          if (this.renewPending) await this.renewPending;
          this.assertHealthy();
          await this.journal.release();
        } finally {
          if (this.heartbeat) clearInterval(this.heartbeat);
        }
      }
      /** Startup failed before serving traffic; don't leave a heartbeat renewing an
       * owner that never bound its port. No checkpoint is necessary in this case. */
      async abortStartup() {
        if (this.heartbeat) clearInterval(this.heartbeat);
        if (this.renewPending) await this.renewPending;
        this.assertHealthy();
        await this.journal.release();
      }
    };
  }
});

// server/lib/pdimBucketCommandBatcher.ts
var blocking, standalone, PdimBucketCommandBatcher;
var init_pdimBucketCommandBatcher = __esm({
  "server/lib/pdimBucketCommandBatcher.ts"() {
    "use strict";
    blocking = /* @__PURE__ */ new Set(["BLPOP", "BRPOP", "BZPOPMIN", "BZPOPMAX"]);
    standalone = /* @__PURE__ */ new Set([
      "PUBLISH",
      "SUBSCRIBE",
      "UNSUBSCRIBE",
      "PSUBSCRIBE",
      "PUNSUBSCRIBE",
      "__PDIM_MULTI_EXEC"
    ]);
    PdimBucketCommandBatcher = class {
      constructor(execute) {
        this.execute = execute;
        this.queue = [];
        this.queuedBytes = 0;
        this.running = false;
        this.closed = false;
        this.drainWaiters = [];
      }
      exec(command, args, signal) {
        if (this.closed) return Promise.reject(new Error("PDIM command batcher is closed"));
        if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Request aborted"));
        const upper = command.toUpperCase();
        if (blocking.has(upper)) return this.execute(upper, args, signal);
        const bytes = Buffer.byteLength(upper) + args.reduce((sum, arg) => sum + Buffer.byteLength(arg), 0);
        if (this.queue.length >= 4096 || this.queuedBytes + bytes > 64 * 1024 * 1024) {
          return Promise.reject(Object.assign(new Error("PDIM durable write queue is full"), { code: "PDIM_BACKPRESSURE" }));
        }
        const promise = new Promise((resolve, reject) => {
          this.queue.push({ command: upper, args, bytes, signal, resolve, reject });
          this.queuedBytes += bytes;
        });
        if (!this.running) {
          this.running = true;
          setTimeout(() => {
            void this.drain();
          }, 5);
        }
        return promise;
      }
      individual(request) {
        return standalone.has(request.command) || request.command.startsWith("CAPSULE.");
      }
      async drain() {
        try {
          while (this.queue.length) {
            const requests = [];
            let bytes = 0;
            while (this.queue.length && requests.length < 128) {
              const next = this.queue[0];
              if (requests.length && (this.individual(next) || bytes + next.bytes > 4 * 1024 * 1024)) break;
              this.queue.shift();
              this.queuedBytes -= next.bytes;
              if (next.signal?.aborted) {
                next.reject(next.signal.reason ?? new Error("Request aborted"));
                continue;
              }
              requests.push(next);
              bytes += next.bytes;
              if (this.individual(next)) break;
            }
            if (!requests.length) continue;
            try {
              if (this.individual(requests[0])) {
                const row = requests[0];
                row.resolve(await this.execute(row.command, row.args, row.signal));
              } else {
                const result = await this.execute("__PDIM_MULTI_EXEC", [
                  JSON.stringify(requests.map((row) => [row.command, ...row.args]))
                ]);
                if (!Array.isArray(result) || result.length !== requests.length || result.some((row) => !Array.isArray(row) || row.length !== 2)) {
                  throw new Error("Invalid canonical PDIM transaction response");
                }
                for (let index3 = 0; index3 < requests.length; index3++) {
                  const [error, value] = result[index3];
                  if (error) requests[index3].reject(new Error(
                    typeof error === "object" && typeof error.message === "string" ? error.message : "PDIM command failed"
                  ));
                  else requests[index3].resolve(value);
                }
              }
            } catch (error) {
              for (const row of requests) row.reject(error);
            }
          }
        } finally {
          this.running = false;
          for (const resolve of this.drainWaiters.splice(0)) resolve();
        }
      }
      async close() {
        this.closed = true;
        if (this.running) await new Promise((resolve) => this.drainWaiters.push(resolve));
      }
    };
  }
});

// server/lib/localPdimServer.ts
var localPdimServer_exports = {};
__export(localPdimServer_exports, {
  assertLocalPdimSnapshotAuthority: () => assertLocalPdimSnapshotAuthority,
  getLocalPdimUrl: () => getLocalPdimUrl,
  importOfflinePdimToBucket: () => importOfflinePdimToBucket,
  isLocalPdimServerOwnedByThisProcess: () => isLocalPdimServerOwnedByThisProcess,
  openConsistentLocalPdimSnapshot: () => openConsistentLocalPdimSnapshot,
  openConsistentPdimSnapshot: () => openConsistentPdimSnapshot,
  startLocalPdimServer: () => startLocalPdimServer,
  stopLocalPdimServer: () => stopLocalPdimServer,
  validatePersistedEntry: () => validatePersistedEntry
});
import http from "http";
import fs6 from "fs";
import path7 from "path";
import { tmpdir } from "node:os";
import cluster from "node:cluster";
function expired(e) {
  return e.expiresAt !== void 0 && Date.now() > e.expiresAt;
}
function saveStoreAsync() {
  if (bucketPersistence) {
    return bucketPersistence.checkpoint().then(() => true, (error) => {
      logger.error(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "[LocalPDIM] Bucket checkpoint failed; committed journal remains authoritative"
      );
      return false;
    });
  }
  const operation = snapshotTail.then(async () => {
    const publication = snapshotPublication;
    const temporaryFile = `${PERSIST_FILE}.async-${process.pid}-${++asyncSnapshotSequence}`;
    try {
      await fs6.promises.mkdir(path7.dirname(PERSIST_FILE), { recursive: true });
      let writeFailure;
      const snapshot = await canonicalStore.captureEmbeddedCheckpoint((redisBaseline) => {
        const capsuleBaseline = capsuleJournal.publishedSeq;
        const obj = {};
        for (const [key, value] of store) {
          if (!expired(value)) obj[key] = value;
        }
        obj[CAPSULE_WATERMARK] = {
          type: "string",
          value: String(capsuleBaseline)
        };
        obj[REDIS_AOF_WATERMARK] = {
          type: "string",
          value: String(redisBaseline)
        };
        return {
          // Attach the rejection handler immediately, even while the capture
          // boundary is unwinding, without concealing an unsuccessful write.
          writing: writeSnapshotOffThread(temporaryFile, obj).catch((error) => {
            writeFailure = error;
          }),
          capsuleBaseline,
          redisBaseline
        };
      });
      await snapshot.writing;
      if (writeFailure) throw writeFailure;
      if (snapshotPublication !== publication) {
        await fs6.promises.rm(temporaryFile, { force: true });
        return true;
      }
      fs6.renameSync(temporaryFile, PERSIST_FILE);
      const directory = await fs6.promises.open(path7.dirname(PERSIST_FILE), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      snapshotPublication++;
      await redisAofJournal.compact(snapshot.redisBaseline);
      canonicalStore.compactEmbeddedAof(snapshot.redisBaseline);
      await capsuleJournal.compact(snapshot.capsuleBaseline);
      return true;
    } catch (err) {
      await fs6.promises.rm(temporaryFile, { force: true }).catch(() => {
      });
      logger.error({ err }, `[LocalPDIM] Failed to persist store to ${PERSIST_FILE}`);
      return false;
    }
  });
  snapshotTail = operation;
  return operation;
}
function saveStore() {
  const temporaryFile = `${PERSIST_FILE}.tmp-${process.pid}`;
  try {
    fs6.mkdirSync(path7.dirname(PERSIST_FILE), { recursive: true });
    const redisBaseline = canonicalStore.getEmbeddedAofSequence();
    const obj = {};
    for (const [k, v] of store) {
      if (!expired(v)) obj[k] = v;
    }
    obj[CAPSULE_WATERMARK] = { type: "string", value: String(capsuleJournal.publishedSeq) };
    obj[REDIS_AOF_WATERMARK] = {
      type: "string",
      value: String(redisBaseline)
    };
    const output = fs6.openSync(temporaryFile, "w", 384);
    try {
      for (const chunk of snapshotJsonChunks(obj)) fs6.writeFileSync(output, chunk, "utf8");
      fs6.fsyncSync(output);
    } finally {
      fs6.closeSync(output);
    }
    fs6.renameSync(temporaryFile, PERSIST_FILE);
    const directory = fs6.openSync(path7.dirname(PERSIST_FILE), "r");
    try {
      fs6.fsyncSync(directory);
    } finally {
      fs6.closeSync(directory);
    }
    snapshotPublication++;
    return true;
  } catch (err) {
    try {
      fs6.rmSync(temporaryFile, { force: true });
    } catch {
    }
    logger.error({ err }, `[LocalPDIM] Failed to persist store to ${PERSIST_FILE}`);
    return false;
  }
}
function isStringRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((field) => typeof field === "string");
}
function normalizePersistedStreamFields(fields) {
  if (Array.isArray(fields)) {
    return fields.map((field) => {
      if (typeof field !== "string") {
        throw new Error("Invalid persisted stream field array");
      }
      return field;
    });
  }
  if (!fields || typeof fields !== "object") {
    throw new Error("Invalid persisted stream field map");
  }
  const flattened = [];
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string") {
      throw new Error("Invalid persisted stream field map value");
    }
    flattened.push(key, value);
  }
  return flattened;
}
function validatePersistedEntry(key, value) {
  const invalid = (detail) => {
    throw new Error(
      `invalid persistence entry for key ${JSON.stringify(key)}: ${detail}`
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("entry must be an object");
  }
  const entry = value;
  const entryKeys = Object.keys(entry);
  if (!entryKeys.includes("type") || !entryKeys.includes("value") || entryKeys.some((field) => !["type", "value", "expiresAt", ...entry.type === "stream" ? ["groups"] : []].includes(field))) {
    return invalid("entry fields must be exactly type, value, and optional expiresAt");
  }
  if (entry.expiresAt !== void 0 && (typeof entry.expiresAt !== "number" || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= 0)) {
    return invalid("expiresAt must be a positive finite number when present");
  }
  switch (entry.type) {
    case "string":
      if (typeof entry.value !== "string") return invalid("string value must be a string");
      break;
    case "hash":
      if (!isStringRecord(entry.value)) return invalid("hash value must map strings to strings");
      break;
    case "set":
    case "list":
      if (!Array.isArray(entry.value) || !entry.value.every((item) => typeof item === "string")) {
        return invalid(`${entry.type} value must be an array of strings`);
      }
      break;
    case "zset":
      if (!Array.isArray(entry.value) || !entry.value.every(
        (item) => !!item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 2 && Object.hasOwn(item, "member") && Object.hasOwn(item, "score") && typeof item.member === "string" && typeof item.score === "number" && Number.isFinite(item.score)
      )) {
        return invalid("zset value must contain string members with finite scores");
      }
      break;
    case "stream":
      if (!Array.isArray(entry.value) || !entry.value.every(
        (message) => !!message && typeof message === "object" && !Array.isArray(message) && Object.keys(message).length === 2 && Object.hasOwn(message, "id") && Object.hasOwn(message, "fields") && typeof message.id === "string" && (isStringRecord(message.fields) || Array.isArray(message.fields) && message.fields.length % 2 === 0 && message.fields.every((field) => typeof field === "string"))
      )) {
        return invalid("stream value must contain string ids and string field maps");
      }
      if (entry.groups !== void 0) {
        if (!entry.groups || typeof entry.groups !== "object" || Array.isArray(entry.groups)) {
          return invalid("stream groups must be an object");
        }
        for (const group of Object.values(entry.groups)) {
          if (!group || typeof group.lastDeliveredId !== "string" || !Array.isArray(group.pending) || !group.pending.every((p) => p && typeof p.id === "string" && typeof p.consumer === "string" && Number.isFinite(p.deliveredAt) && Number.isFinite(p.count)) || !group.consumers || typeof group.consumers !== "object" || Array.isArray(group.consumers) || !Object.values(group.consumers).every((c) => c && typeof c.name === "string" && Number.isFinite(c.lastSeenAt))) {
            return invalid("invalid stream consumer group");
          }
        }
      }
      break;
    default:
      return invalid("unknown entry type");
  }
  return value;
}
function loadStore() {
  snapshotAofBaseline = 0;
  if (!fs6.existsSync(PERSIST_FILE)) return;
  try {
    const data = readSnapshotJson(PERSIST_FILE);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("persistence root must be a JSON object");
    }
    const persisted = data;
    const watermark = persisted[REDIS_AOF_WATERMARK];
    if (watermark !== void 0) {
      const entry = validatePersistedEntry(REDIS_AOF_WATERMARK, watermark);
      if (entry.type !== "string") throw new Error("Invalid Redis AOF watermark entry");
      snapshotAofBaseline = Number(entry.value);
      if (!Number.isSafeInteger(snapshotAofBaseline) || snapshotAofBaseline < 0) {
        throw new Error("Invalid Redis AOF snapshot watermark");
      }
    }
    const validated = Object.entries(persisted).filter(([key]) => key !== REDIS_AOF_WATERMARK).map(
      ([key, value]) => [key, validatePersistedEntry(key, value)]
    );
    let loaded = 0;
    for (const [k, v] of validated) {
      if (!expired(v)) {
        store.set(k, v);
        loaded++;
      }
    }
    logger.info(
      `[LocalPDIM] Restored ${loaded} entries from ${PERSIST_FILE}`
    );
  } catch (err) {
    throw new Error(
      `[LocalPDIM] Failed to load local PDIM persistence file ${PERSIST_FILE}; refusing to start to avoid silent data loss`,
      { cause: err }
    );
  }
}
function getLocalPdimUrl() {
  return `http://127.0.0.1:${LOCAL_PORT}/api/redis/instances/local/exec`;
}
function isLocalPdimServerOwnedByThisProcess() {
  const address = _server?.address();
  return _server?.listening === true && !!address && typeof address !== "string" && address.address === "127.0.0.1" && address.port === LOCAL_PORT;
}
function assertLocalPdimSnapshotAuthority(input) {
  let configured;
  let expected;
  try {
    configured = new URL(input.configuredExecUrl);
    expected = new URL(input.expectedExecUrl);
  } catch {
    throw new Error("PDIM snapshot authority is not a valid configured URL");
  }
  const address = input.serverAddress;
  if (!input.serverListening || !address || typeof address === "string" || address.address !== "127.0.0.1" || String(address.port) !== expected.port || configured.origin !== expected.origin || configured.pathname !== expected.pathname || path7.resolve(input.sourcePath) !== path7.resolve(input.expectedSourcePath)) {
    throw new Error(
      "PDIM snapshot authority mismatch: configured backend is not this owned local store"
    );
  }
}
function openConsistentLocalPdimSnapshot() {
  if (bucketPersistence) {
    throw new Error("PDIM is bucket-backed; use its committed bucket checkpoint, not a local-file backup");
  }
  const configuredExecUrl = process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
  assertLocalPdimSnapshotAuthority({
    configuredExecUrl,
    expectedExecUrl: getLocalPdimUrl(),
    serverListening: _server?.listening === true,
    serverAddress: _server?.address() ?? null,
    sourcePath: PERSIST_FILE,
    expectedSourcePath: path7.resolve("./data/local-pdim-store.json")
  });
  if (!saveStore()) throw new Error("Could not commit the local PDIM recovery point");
  const link = fs6.lstatSync(PERSIST_FILE);
  if (!link.isFile() || link.isSymbolicLink()) {
    throw new Error("Committed local PDIM snapshot is not a regular owned file");
  }
  const fd = fs6.openSync(PERSIST_FILE, fs6.constants.O_RDONLY);
  try {
    const pinned = fs6.fstatSync(fd);
    const current = fs6.statSync(PERSIST_FILE);
    if (!pinned.isFile() || pinned.dev !== current.dev || pinned.ino !== current.ino || pinned.size !== current.size) {
      throw new Error("Committed local PDIM snapshot inode could not be pinned");
    }
    return {
      fd,
      bytes: pinned.size,
      device: pinned.dev,
      inode: pinned.ino,
      sourcePath: PERSIST_FILE,
      recoveryPoint: "synchronous-event-loop-linearized"
    };
  } catch (error) {
    fs6.closeSync(fd);
    throw error;
  }
}
async function openConsistentPdimSnapshot() {
  if (!bucketPersistence) return openConsistentLocalPdimSnapshot();
  bucketPersistence.assertHealthy();
  if (cluster.isWorker || !_server?.listening || (process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL) !== getLocalPdimUrl()) {
    throw new Error("Only the authoritative PDIM owner may export a bucket checkpoint");
  }
  const capture2 = await bucketPersistence.captureSnapshot();
  const entries = Object.fromEntries(capture2.entries);
  entries[CAPSULE_WATERMARK] = { type: "string", value: String(capture2.capsuleSequence) };
  entries[REDIS_AOF_WATERMARK] = { type: "string", value: String(capture2.redisSequence) };
  const scratch = await fs6.promises.mkdtemp(path7.join(tmpdir(), "pdim-bucket-export-"));
  const file = path7.join(scratch, "snapshot.json");
  let fd;
  try {
    await writeSnapshotOffThread(file, entries);
    fd = fs6.openSync(file, fs6.constants.O_RDONLY | fs6.constants.O_NOFOLLOW);
    const stat = fs6.fstatSync(fd);
    await fs6.promises.rm(scratch, { recursive: true });
    const result = {
      fd,
      bytes: stat.size,
      device: stat.dev,
      inode: stat.ino,
      sourcePath: file,
      recoveryPoint: "synchronous-event-loop-linearized"
    };
    fd = void 0;
    return result;
  } finally {
    if (fd !== void 0) fs6.closeSync(fd);
    await fs6.promises.rm(scratch, { recursive: true, force: true });
  }
}
function openLocalPubSubStream(res, requestController, channels, patterns) {
  const maxBufferedBytes = 1024 * 1024;
  let closed = false;
  let blocked = false;
  let bufferedBytes = 0;
  let pending = [];
  let heartbeat;
  let unsubscribe = () => {
  };
  const dispose = () => {
    if (closed) return;
    closed = true;
    res.off("drain", flush);
    res.off("close", onResponseClose);
    requestController.signal.removeEventListener("abort", onAbort);
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    pending = [];
    bufferedBytes = 0;
  };
  const flush = () => {
    if (closed || res.destroyed) return;
    blocked = false;
    while (pending.length > 0) {
      const line = pending.shift();
      bufferedBytes -= Buffer.byteLength(line);
      if (!res.write(line)) {
        blocked = true;
        break;
      }
    }
  };
  const closeStream = () => {
    if (!requestController.signal.aborted) {
      requestController.abort(new Error("PDIM Pub/Sub stream closed"));
    }
  };
  const onAbort = () => {
    dispose();
    if (!res.destroyed && !res.writableEnded) res.end();
  };
  const onResponseClose = () => {
    if (!res.writableEnded && !requestController.signal.aborted) {
      requestController.abort(new Error("PDIM Pub/Sub client disconnected"));
    }
    dispose();
  };
  const send = (event) => {
    if (closed || res.destroyed) return;
    const line = `${JSON.stringify(event)}
`;
    if (blocked || pending.length > 0) {
      bufferedBytes += Buffer.byteLength(line);
      if (bufferedBytes > maxBufferedBytes) {
        closeStream();
        return;
      }
      pending.push(line);
      return;
    }
    if (!res.write(line)) blocked = true;
  };
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.flushHeaders();
  res.on("drain", flush);
  res.on("close", onResponseClose);
  requestController.signal.addEventListener("abort", onAbort, { once: true });
  unsubscribe = canonicalStore.subscribePubSub(
    channels,
    patterns,
    send,
    closeStream
  );
  if (requestController.signal.aborted) {
    onAbort();
    return;
  }
  send({ type: "ready", subscriptionCount: channels.length + patterns.length });
  heartbeat = setInterval(() => send({ type: "heartbeat" }), 15e3);
  heartbeat.unref();
}
function startLocalPdimServer() {
  if (cluster.isWorker || process.env.CLUSTER_WORKER_ID !== void 0) {
    return Promise.reject(new Error("Only the cluster primary may own local PDIM"));
  }
  if (_starting) return _starting;
  _starting = prepareBucketOwner().then(() => new Promise((resolve, reject) => {
    if (_server) {
      resolve();
      return;
    }
    if (!bucketPersistence) {
      loadStore();
      const watermark = store.get(CAPSULE_WATERMARK);
      const capsuleBaseline = watermark?.type === "string" ? Number(watermark.value) : 0;
      if (!Number.isSafeInteger(capsuleBaseline) || capsuleBaseline < 0) {
        throw new Error("Invalid capsule journal snapshot watermark");
      }
      store.delete(CAPSULE_WATERMARK);
      capsuleJournal.recover(capsuleBaseline, (changes) => {
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) store.delete(key);
          else store.set(key, { type: "string", value });
        }
      });
      for (const entry of store.values()) {
        if (entry.type === "stream") {
          const stream = entry;
          stream.value = stream.value.map((message) => ({
            id: message.id,
            fields: normalizePersistedStreamFields(message.fields)
          }));
          stream.groups ??= {};
        }
      }
      const redisAofRecords = redisAofJournal.recover(snapshotAofBaseline);
      canonicalStore.attachEmbeddedSnapshot(
        store,
        {
          baselineSequence: snapshotAofBaseline,
          recoveryRecords: redisAofRecords,
          appendAof: (records) => redisAofJournal.append(records)
        }
      );
      canonicalStore.on("durability-error", (error) => {
        logger.error(
          { err: error },
          "[LocalPDIM] Durable Redis journal failed; the owner is unavailable"
        );
      });
      if (redisAofRecords.length > 0) {
        logger.info(
          `[LocalPDIM] Replayed ${redisAofRecords.length} durable Redis mutation(s)`
        );
      }
    }
    _server = http.createServer((req, res) => {
      if (process.env.PDIM_OFFLINE_MIGRATION === "1") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "PDIM is offline for verified migration" }));
        return;
      }
      const token = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      if (token && req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized private PDIM channel" }));
        return;
      }
      if (req.url !== "/api/redis/instances/local/exec") {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
        return;
      }
      const requestController = new AbortController();
      req.on("aborted", () => {
        requestController.abort(new Error("PDIM HTTP request aborted by client"));
      });
      res.on("close", () => {
        if (!res.writableEnded) {
          requestController.abort(new Error("PDIM HTTP response closed by client"));
        }
      });
      let body = "";
      let bytes = 0;
      req.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 50 * 1024 * 1024) {
          res.writeHead(413).end();
          req.destroy();
          return;
        }
        body += chunk;
      });
      req.on("end", async () => {
        try {
          bucketPersistence?.assertHealthy();
          const {
            cmd,
            args = [],
            stream = false,
            patterns = []
          } = JSON.parse(body);
          if (typeof cmd !== "string" || !Array.isArray(args) || args.some((arg) => arg === null || arg === void 0 || typeof arg === "object")) {
            throw new TypeError("PDIM requires a command and non-null scalar arguments");
          }
          if (stream) {
            if (cmd.toUpperCase() !== "SUBSCRIBE" || args.some((channel) => typeof channel !== "string") || !Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string")) {
              throw new TypeError("PDIM Pub/Sub requires string channels and patterns");
            }
            const channels = [...new Set(args)];
            const uniquePatterns = [...new Set(patterns)];
            if (channels.length + uniquePatterns.length === 0) {
              throw new TypeError("PDIM Pub/Sub requires at least one subscription");
            }
            openLocalPubSubStream(res, requestController, channels, uniquePatterns);
            return;
          }
          const result = bucketBatcher ? await bucketBatcher.exec(cmd, args.map(String), requestController.signal) : cmd.toUpperCase().startsWith("CAPSULE.") ? await capsuleStore.exec(cmd, args.map(String)) : await canonicalStore.exec(cmd, args.map(String), requestController.signal);
          bucketPersistence?.assertHealthy();
          if (requestController.signal.aborted || res.destroyed || res.writableEnded) return;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          if (requestController.signal.aborted || res.destroyed || res.writableEnded) return;
          if (res.headersSent) {
            res.destroy(err instanceof Error ? err : void 0);
            return;
          }
          const status = ["PDIM_DURABILITY_FAILURE", "PDIM_BACKPRESSURE"].includes(String(err?.code)) ? 503 : 400;
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Bad Request"
            })
          );
        }
      });
    });
    _server.listen(LOCAL_PORT, "127.0.0.1", () => {
      logger.info(
        `[LocalPDIM] Local PDIM exec server started on port ${LOCAL_PORT} (${bucketPersistence ? "App Storage journal and snapshots" : "local fsynced AOF and snapshots"})`
      );
      let periodicSavePending = false;
      _persistTimer = setInterval(() => {
        if (periodicSavePending) return;
        periodicSavePending = true;
        void saveStoreAsync().finally(() => {
          periodicSavePending = false;
        });
      }, bucketPersistence ? 3e5 : PERSIST_INTERVAL_MS);
      _persistTimer.unref();
      const saveOnShutdown = () => {
        if (!saveStore()) {
          _finalSaveFailed = true;
          process.exitCode = 1;
        }
      };
      if (!bucketPersistence) {
        _saveOnShutdown = saveOnShutdown;
        process.on("SIGTERM", saveOnShutdown);
        process.on("SIGINT", saveOnShutdown);
      }
      process.on("exit", () => {
        if (_finalSaveFailed) process.exitCode = 1;
      });
      resolve();
    });
    _server.on("error", (err) => {
      _server = null;
      reject(err);
    });
  })).catch(async (error) => {
    if (bucketPersistence) {
      const failedOwner = bucketPersistence;
      bucketPersistence = void 0;
      bucketBatcher = void 0;
      canonicalStore.closeEmbedded();
      try {
        await failedOwner.abortStartup();
      } catch {
        logger.error("[LocalPDIM] Failed-start bucket lease release was not confirmed; lease will expire");
      }
    }
    throw error;
  }).finally(() => {
    _starting = null;
  });
  return _starting;
}
async function stopLocalPdimServer() {
  const server = _server;
  _server = null;
  if (!server) return;
  if (_persistTimer) clearInterval(_persistTimer);
  _persistTimer = null;
  if (_saveOnShutdown) {
    process.off("SIGTERM", _saveOnShutdown);
    process.off("SIGINT", _saveOnShutdown);
    _saveOnShutdown = null;
  }
  const closed = new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
  try {
    await bucketBatcher?.close();
  } finally {
    canonicalStore.closeEmbedded();
    server.closeAllConnections();
    await closed;
  }
  await snapshotTail;
  await bucketPersistence?.close();
  bucketPersistence = void 0;
  bucketBatcher = void 0;
}
async function prepareBucketOwner() {
  if (_server) return;
  const mode = process.env.PDIM_PERSISTENCE ?? "disk";
  if (mode === "disk") return;
  if (mode !== "app-storage") throw new Error("Invalid PDIM_PERSISTENCE configuration");
  const namespace = process.env.PDIM_BUCKET_NAMESPACE;
  if (!namespace) throw new Error("PDIM_BUCKET_NAMESPACE is required for bucket persistence");
  const objects = await configuredPdimBucketObjects();
  const persistence = new PdimBucketPersistence(
    objects,
    namespace,
    canonicalStore,
    store,
    (key, value) => validatePersistedEntry(key, value),
    (stage) => logger.info({ stage, pid: process.pid }, "[LocalPDIM] Bucket startup")
  );
  try {
    await persistence.open();
  } catch (error) {
    if (!(error instanceof PdimBucketLeaseBusy) || error.retryAfterMs < 0 || error.retryAfterMs > 6e4) throw error;
    logger.info({ waitMs: error.retryAfterMs }, "[LocalPDIM] Waiting once for prior owner lease expiry");
    await new Promise((resolve) => setTimeout(resolve, error.retryAfterMs + 25));
    await persistence.open();
  }
  bucketPersistence = persistence;
  bucketBatcher = new PdimBucketCommandBatcher((command, args, signal) => command.startsWith("CAPSULE.") ? capsuleStore.exec(command, args) : canonicalStore.exec(command, args, signal));
}
async function importOfflinePdimToBucket(namespace) {
  if (process.env.PDIM_OFFLINE_MIGRATION !== "1" || bucketPersistence || !_server?.listening) {
    throw new Error("Migration requires an offline local-only owner");
  }
  const objects = await configuredPdimBucketObjects();
  const journal = new PdimBucketJournal(objects, namespace, isBucketTransaction);
  return canonicalStore.captureEmbeddedCheckpoint(async (redisSequence) => {
    const capsuleSequence = capsuleJournal.publishedSeq;
    logger.info({ phase: "upload-current-state", entries: store.size }, "[LocalPDIM] Bucket import");
    const snapshot = await writeBucketSnapshot(journal, store, redisSequence, capsuleSequence);
    logger.info({ phase: "verify-current-state", entries: store.size }, "[LocalPDIM] Bucket import");
    await verifyBucketSnapshot(journal, snapshot, store, redisSequence, capsuleSequence);
    await journal.initialize(snapshot);
    return {
      imported: true,
      verifiedEntries: store.size,
      snapshot,
      redisSequence,
      capsuleSequence,
      localSourcesRemoved: false,
      backendActivated: false
    };
  });
}
var LOCAL_PORT, PERSIST_FILE, PERSIST_INTERVAL_MS, CAPSULE_WATERMARK, REDIS_AOF_WATERMARK, capsuleJournal, redisAofJournal, store, canonicalStore, bucketPersistence, bucketBatcher, snapshotAofBaseline, capsuleStore, snapshotPublication, asyncSnapshotSequence, snapshotTail, _server, _finalSaveFailed, _persistTimer, _saveOnShutdown, _starting;
var init_localPdimServer = __esm({
  "server/lib/localPdimServer.ts"() {
    "use strict";
    init_logger();
    init_ports();
    init_store();
    init_localPdimCapsules();
    init_localPdimCapsuleJournal();
    init_localPdimAofJournal();
    init_pdimSnapshotJson();
    init_pdimSnapshotWriter();
    init_pdimBucketObjects();
    init_pdimBucketPersistence();
    init_pdimBucketCommandBatcher();
    init_pdimBucketJournal();
    init_pdimBucketRecovery();
    init_pdimBucketSnapshot();
    LOCAL_PORT = runtimePorts.localPdim;
    PERSIST_FILE = path7.resolve(
      process.env.LOCAL_PDIM_STORE_FILE ?? "./data/local-pdim-store.json"
    );
    PERSIST_INTERVAL_MS = 3e4;
    CAPSULE_WATERMARK = "__local_pdim_capsule_journal_watermark__";
    REDIS_AOF_WATERMARK = "__local_pdim_redis_aof_watermark__";
    capsuleJournal = new LocalPdimCapsuleJournal(`${PERSIST_FILE}.capsules.jsonl`);
    redisAofJournal = new LocalPdimAofJournal(`${PERSIST_FILE}.aof.jsonl`);
    store = /* @__PURE__ */ new Map();
    canonicalStore = new RedisStore("local", "Max Booster shared local owner");
    snapshotAofBaseline = 0;
    capsuleStore = new LocalPdimCapsules(
      canonicalStore,
      (changes, publish) => bucketPersistence ? bucketPersistence.commitCapsule(changes, publish) : capsuleJournal.commit(changes, publish)
    );
    snapshotPublication = 0;
    asyncSnapshotSequence = 0;
    snapshotTail = Promise.resolve();
    _server = null;
    _finalSaveFailed = false;
    _persistTimer = null;
    _saveOnShutdown = null;
    _starting = null;
  }
});

// server/services/hybridStorageRepository.ts
function decode2(row) {
  return {
    entry: { ...row.metadata, createdAt: new Date(row.metadata.createdAt), lastAccessed: new Date(row.metadata.lastAccessed) },
    blobKey: row.blob_key,
    state: row.state
  };
}
var HybridStorageRepository;
var init_hybridStorageRepository = __esm({
  "server/services/hybridStorageRepository.ts"() {
    "use strict";
    HybridStorageRepository = class {
      constructor(pool2) {
        this.pool = pool2;
      }
      async importLegacy(load) {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(hashtext('hybrid-storage-legacy-import-v1'))");
          if (!(await client.query("SELECT source FROM hybrid_storage_imports WHERE source=$1", ["pdim-index-v1"])).rows.length) {
            const rows = await load();
            for (const { entry, blobKey } of rows) {
              await client.query(`INSERT INTO hybrid_storage_files(key,user_id,blob_key,state,metadata)
            VALUES($1,$2,$3,'active',$4::jsonb)`, [entry.key, entry.userId, blobKey, JSON.stringify(entry)]);
            }
            await client.query("INSERT INTO hybrid_storage_imports(source,imported_count) VALUES($1,$2)", ["pdim-index-v1", rows.length]);
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {
          });
          throw error;
        } finally {
          client.release();
        }
      }
      async beginUpload(entry, blobKey) {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`hybrid-content:${entry.contentHash}`]);
          const existing = (await client.query(
            `SELECT blob_key,metadata FROM hybrid_storage_files WHERE state='active'
        AND blob_key LIKE 'hybrid:v2:%' AND metadata->>'contentHash'=$1 AND (metadata->>'sizeBytes')::bigint=$2 LIMIT 1`,
            [entry.contentHash, entry.sizeBytes]
          )).rows[0];
          const stored = existing ? {
            ...entry,
            compressedSize: existing.metadata.compressedSize,
            isDeduplicated: true,
            deduplicationRef: existing.metadata.key
          } : entry;
          const actualBlobKey = existing?.blob_key ?? blobKey;
          await client.query(`INSERT INTO hybrid_storage_files(key,user_id,blob_key,state,metadata)
        VALUES($1,$2,$3,$4,$5::jsonb)`, [
            entry.key,
            entry.userId,
            actualBlobKey,
            "uploading",
            JSON.stringify(stored)
          ]);
          await client.query("COMMIT");
          return { blobKey: actualBlobKey, deduplicated: !!existing, compressedSize: stored.compressedSize };
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {
          });
          throw error;
        } finally {
          client.release();
        }
      }
      async activate(key, compressedSize) {
        const result = await this.pool.query(`UPDATE hybrid_storage_files SET state='active',
      metadata=jsonb_set(metadata,'{compressedSize}',to_jsonb($2::bigint)),updated_at=now()
      WHERE key=$1 AND state IN ('uploading','active') RETURNING key`, [key, compressedSize]);
        if (!result.rows.length) throw new Error("Hybrid upload publication lost its pending record");
      }
      async get(key, includePending = false) {
        const result = await this.pool.query(`SELECT metadata,blob_key,state FROM hybrid_storage_files
      WHERE key=$1 ${includePending ? "" : "AND state='active'"}`, [key]);
        return result.rows[0] ? decode2(result.rows[0]) : void 0;
      }
      async list(userId, includePublic = false) {
        const result = await this.pool.query(`SELECT metadata,blob_key,state FROM hybrid_storage_files WHERE state='active'
      ${userId === void 0 ? "" : "AND (user_id=$1 OR ($2::boolean AND (metadata->>'isPublic')::boolean))"}
      ORDER BY key`, userId === void 0 ? [] : [userId, includePublic]);
        return result.rows.map(decode2);
      }
      async touch(key) {
        await this.pool.query(`UPDATE hybrid_storage_files SET metadata=jsonb_set(jsonb_set(metadata,
      '{accessCount}',to_jsonb(COALESCE((metadata->>'accessCount')::bigint,0)+1)),
      '{lastAccessed}',to_jsonb(now())),updated_at=now() WHERE key=$1 AND state='active'`, [key]);
      }
      async markCold(key, userId) {
        const result = await this.pool.query(
          `UPDATE hybrid_storage_files SET metadata=metadata ||
      '{"tier":"cold","location":"pocket-dimension"}'::jsonb,updated_at=now()
      WHERE key=$1 AND state='active' ${userId === void 0 ? "" : "AND user_id=$2"} RETURNING key`,
          userId === void 0 ? [key] : [key, userId]
        );
        return result.rows.length > 0;
      }
      /** A durable deletion intent hides the row before physical deletion. Legacy
       * aliases retain the same immutable blob key; removing a primary never
       * promotes a nonexistent physical key. New uploads never reuse blob keys. */
      async beginDelete(key, userId) {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          const initial = (await client.query("SELECT user_id,blob_key,metadata->>'contentHash' AS content_hash FROM hybrid_storage_files WHERE key=$1", [key])).rows[0];
          if (!initial) {
            await client.query("COMMIT");
            return { found: false };
          }
          if (initial.user_id !== userId) throw new Error(`Access denied: ${key}`);
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`hybrid-content:${initial.content_hash}`]);
          const current = (await client.query("SELECT key FROM hybrid_storage_files WHERE key=$1 FOR UPDATE", [key])).rows[0];
          if (!current) {
            await client.query("COMMIT");
            return { found: false };
          }
          const refs = (await client.query("SELECT key FROM hybrid_storage_files WHERE blob_key=$1 AND key<>$2", [initial.blob_key, key])).rows;
          if (refs.length) {
            await client.query("DELETE FROM hybrid_storage_files WHERE key=$1", [key]);
            await client.query("COMMIT");
            return { found: true };
          }
          await client.query("UPDATE hybrid_storage_files SET state='deleting',updated_at=now() WHERE key=$1", [key]);
          await client.query("COMMIT");
          return { found: true, blobKey: initial.blob_key };
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {
          });
          throw error;
        } finally {
          client.release();
        }
      }
      async finishDelete(key, userId) {
        await this.pool.query("DELETE FROM hybrid_storage_files WHERE key=$1 AND user_id=$2 AND state='deleting'", [key, userId]);
      }
    };
  }
});

// server/services/hybridImmutableByteStore.ts
import { createHash as createHash9 } from "node:crypto";
var CHUNK_SIZE, MAX_CHUNKS, digest3, HybridImmutableByteStore;
var init_hybridImmutableByteStore = __esm({
  "server/services/hybridImmutableByteStore.ts"() {
    "use strict";
    init_CodecMesh();
    init_ContainerFormat();
    CHUNK_SIZE = 32 * 1024 * 1024;
    MAX_CHUNKS = 128;
    digest3 = (data) => createHash9("sha256").update(data).digest("hex");
    HybridImmutableByteStore = class {
      constructor(authority) {
        this.authority = authority;
      }
      validateKey(key) {
        if (!/^hybrid:v2:[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid immutable hybrid blob key");
      }
      async manifest(key) {
        this.validateKey(key);
        const raw = await this.authority.get(key);
        if (raw === null) return void 0;
        const manifest = JSON.parse(raw);
        if (manifest.version !== 1 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0 || manifest.bytes > MAX_CHUNKS * CHUNK_SIZE || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.compressedSize) || manifest.compressedSize < 0 || !Array.isArray(manifest.chunks) || manifest.chunks.length > MAX_CHUNKS || manifest.chunks.length !== Math.ceil(manifest.bytes / CHUNK_SIZE) || !manifest.chunks.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.hash) && Number.isSafeInteger(chunk.bytes) && chunk.bytes > 0 && chunk.bytes <= CHUNK_SIZE)) {
          throw new Error("Corrupt immutable hybrid manifest");
        }
        return manifest;
      }
      async write(key, data) {
        this.validateKey(key);
        if (data.length > MAX_CHUNKS * CHUNK_SIZE) throw new Error("Hybrid blob exceeds supported chunk count");
        const hash2 = digest3(data), existing = await this.manifest(key);
        if (existing) {
          if (existing.sha256 !== hash2 || existing.bytes !== data.length) throw new Error("Immutable hybrid blob replacement refused");
          await this.read(key);
          return { compressedSize: existing.compressedSize };
        }
        const chunks = [];
        let compressedSize = 0;
        for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
          const bytes = data.subarray(offset, Math.min(offset + CHUNK_SIZE, data.length));
          const result = await codecMesh.compress(bytes, { contentClass: "unknown" });
          const encoded = encodeContainer({
            profile: "lossless-max-dedup",
            contentClass: "unknown",
            codec: result.codec,
            isDelta: false,
            originalBytes: bytes.length,
            ...result.dictId ? { dictId: result.dictId } : {},
            ...result.blockSizes ? { blockSizes: result.blockSizes } : {}
          }, result.compressed);
          const chunkHash = digest3(encoded);
          await this.authority.setnx(`${key}:chunk:${chunkHash}`, encoded.toString("base64"));
          chunks.push({ hash: chunkHash, bytes: bytes.length });
          compressedSize += encoded.length;
        }
        await this.authority.setnx(key, JSON.stringify({ version: 1, bytes: data.length, sha256: hash2, compressedSize, chunks }));
        const committed = await this.manifest(key);
        if (!committed || committed.sha256 !== hash2 || committed.bytes !== data.length) throw new Error("Hybrid blob publication was not confirmed");
        await this.read(key);
        return { compressedSize: committed.compressedSize };
      }
      async read(key) {
        const manifest = await this.manifest(key);
        if (!manifest) throw new Error("Hybrid blob not found");
        const decoded = [];
        for (const chunk of manifest.chunks) {
          const raw = await this.authority.get(`${key}:chunk:${chunk.hash}`);
          if (raw === null) throw new Error("Hybrid blob chunk missing");
          const encoded = Buffer.from(raw, "base64");
          if (digest3(encoded) !== chunk.hash) throw new Error("Hybrid blob chunk checksum mismatch");
          const { header, payload } = decodeContainer(encoded);
          if (header.originalBytes !== chunk.bytes || header.isDelta) throw new Error("Hybrid blob chunk header mismatch");
          const bytes = await codecMesh.decompress(header.codec, payload, { dictId: header.dictId, blockSizes: header.blockSizes });
          if (bytes.length !== chunk.bytes) throw new Error("Hybrid blob decoded length mismatch");
          decoded.push(bytes);
        }
        const data = Buffer.concat(decoded);
        if (data.length !== manifest.bytes || digest3(data) !== manifest.sha256) throw new Error("Hybrid blob content integrity check failed");
        return data;
      }
      async delete(key) {
        const manifest = await this.manifest(key);
        if (!manifest) return false;
        for (const chunk of manifest.chunks) await this.authority.del(`${key}:chunk:${chunk.hash}`);
        await this.authority.del(key);
        return true;
      }
    };
  }
});

// shared/readiness-schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, bigint, uuid, index, uniqueIndex, unique, primaryKey, foreignKey, check } from "drizzle-orm/pg-core";
var tz, money, authSessionEpochs, accountErasureRequests, accountErasureSteps, integrationNotificationDigest, integrationCatalogJobs, integrationCatalogTransfers, commerceWebhookReceipts, commerceWebhookInbox, integrationDistributionSubmissions, commerceJournals, commerceEntries, commerceAllocations, commerceOperations, commerceDraws, commerceSources, commerceStatements, commerceSchedules, genericExportJobs, integrationSmsAttempts, runtimeBackupCatalog, runtimeBackupRuns, pgSessions, growthSplitRevisions, growthSplitAssents, growthFanPermissions, growthFanCommands, growthFanRecipients, growthFanProviderEvents, growthMerchPayments, growthMerchPaymentEvents, clientSyncReceipts;
var init_readiness_schema = __esm({
  "shared/readiness-schema.ts"() {
    "use strict";
    init_schema();
    tz = (name) => timestamp(name, { withTimezone: true });
    money = (name) => bigint(name, { mode: "bigint" });
    authSessionEpochs = pgTable("auth_session_epochs", {
      userId: varchar("user_id").primaryKey(),
      generation: money("generation").notNull().default(sql`1`),
      lastTotpStep: money("last_totp_step"),
      lastTotpSecretHash: text("last_totp_secret_hash")
    }, (t) => [
      check("auth_session_epochs_generation_check", sql`${t.generation} > 0`),
      foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "auth_session_epochs_user_id_fkey" }).onDelete("cascade")
    ]);
    accountErasureRequests = pgTable("account_erasure_requests", {
      userId: varchar("user_id").primaryKey(),
      requestId: uuid("request_id").notNull().defaultRandom(),
      requestedAt: tz("requested_at").notNull().defaultNow(),
      notBefore: tz("not_before").notNull().default(sql`now() + interval '30 days'`),
      status: text("status").notNull().default("pending_policy"),
      policyVersion: text("policy_version"),
      completedAt: tz("completed_at")
    }, (t) => [
      check("account_erasure_requests_status_check", sql`${t.status} IN ('pending_policy','cancelled','processing','completed')`),
      uniqueIndex("account_erasure_request_id_idx").on(t.requestId)
    ]);
    accountErasureSteps = pgTable("account_erasure_steps", {
      requestId: uuid("request_id").notNull(),
      systemId: text("system_id").notNull(),
      inventoryVersion: text("inventory_version").notNull(),
      policyVersion: text("policy_version").notNull(),
      approvalRef: text("approval_ref").notNull(),
      approvedBy: text("approved_by").notNull(),
      createdAt: tz("created_at").notNull().defaultNow(),
      status: text("status").notNull().default("pending"),
      attempts: integer("attempts").notNull().default(0),
      leaseId: uuid("lease_id"),
      leaseUntil: tz("lease_until"),
      retryAt: tz("retry_at"),
      receiptRef: text("receipt_ref"),
      acknowledgedAt: tz("acknowledged_at")
    }, (t) => [
      primaryKey({ columns: [t.requestId, t.systemId], name: "account_erasure_steps_pkey" }),
      check("account_erasure_steps_status_check", sql`${t.status} IN ('pending','running','retry','acknowledged')`),
      check("account_erasure_steps_check", sql`${t.status} <> 'acknowledged' OR (${t.receiptRef} IS NOT NULL AND ${t.acknowledgedAt} IS NOT NULL)`),
      index("account_erasure_steps_retry_idx").on(t.status, t.retryAt, t.leaseUntil)
    ]);
    integrationNotificationDigest = pgTable("integration_notification_digest", {
      id: uuid("id").primaryKey(),
      userId: varchar("user_id").notNull(),
      type: text("type").notNull(),
      title: text("title").notNull(),
      message: text("message").notNull(),
      link: text("link"),
      frequency: text("frequency").notNull(),
      dueAt: tz("due_at").notNull(),
      state: text("state").notNull(),
      owner: uuid("owner"),
      providerId: text("provider_id"),
      error: text("error"),
      createdAt: tz("created_at").notNull().defaultNow(),
      updatedAt: tz("updated_at").notNull().defaultNow()
    }, (t) => [
      foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_notification_digest_user_id_fkey" }).onDelete("cascade"),
      check("integration_notification_digest_frequency_check", sql`${t.frequency} IN ('daily','weekly')`),
      check("integration_notification_digest_state_check", sql`${t.state} IN ('pending','started','accepted','rejected','unknown','suppressed')`),
      index("integration_notification_digest_due").on(t.dueAt, t.id).where(sql`${t.state} = 'pending'`),
      index("integration_notification_digest_owner").on(t.owner).where(sql`${t.owner} IS NOT NULL`),
      index("integration_notification_digest_user_due").on(t.userId, t.dueAt).where(sql`${t.state} = 'pending'`)
    ]);
    integrationCatalogJobs = pgTable("integration_catalog_jobs", {
      id: uuid("id").primaryKey().defaultRandom(),
      profileId: varchar("profile_id").notNull(),
      userId: varchar("user_id").notNull(),
      state: text("state").notNull().default("pending"),
      attempts: integer("attempts").notNull().default(0),
      leaseOwner: uuid("lease_owner"),
      leaseUntil: tz("lease_until"),
      availableAt: tz("available_at").notNull().defaultNow(),
      createdAt: tz("created_at").notNull().defaultNow(),
      updatedAt: tz("updated_at").notNull().defaultNow(),
      result: jsonb("result"),
      error: text("error")
    }, (t) => [
      unique("integration_catalog_jobs_profile_id_key").on(t.profileId),
      foreignKey({ columns: [t.profileId], foreignColumns: [artistProfiles.id], name: "integration_catalog_jobs_profile_id_fkey" }).onDelete("cascade"),
      foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_catalog_jobs_user_id_fkey" }).onDelete("cascade"),
      check("integration_catalog_jobs_state_check", sql`${t.state} IN ('pending','running','completed','failed')`),
      index("integration_catalog_jobs_claim_idx").on(t.state, t.availableAt, t.leaseUntil)
    ]);
    integrationCatalogTransfers = pgTable("integration_catalog_transfers", {
      id: text("id").primaryKey(),
      userId: varchar("user_id").notNull(),
      progress: jsonb("progress").notNull(),
      updatedAt: tz("updated_at").notNull().defaultNow()
    }, (t) => [
      index("integration_catalog_transfers_user_idx").on(t.userId, t.updatedAt.desc().nullsFirst()),
      foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_catalog_transfers_user_id_fkey" }).onDelete("cascade")
    ]);
    commerceWebhookReceipts = pgTable("commerce_webhook_receipts", {
      eventId: text("event_id").primaryKey(),
      eventType: text("event_type").notNull(),
      completedAt: tz("completed_at").notNull().defaultNow()
    });
    commerceWebhookInbox = pgTable("commerce_webhook_inbox", {
      eventId: text("event_id").primaryKey(),
      eventType: text("event_type").notNull(),
      payload: jsonb("payload").notNull(),
      state: text("state").notNull().default("pending"),
      leaseUntil: tz("lease_until"),
      leaseToken: text("lease_token"),
      attempts: integer("attempts").notNull().default(0),
      error: text("error"),
      receivedAt: tz("received_at").notNull().defaultNow()
    });
    integrationDistributionSubmissions = pgTable("integration_distribution_submissions", {
      provider: text("provider").notNull(),
      userId: varchar("user_id").notNull(),
      releaseId: varchar("release_id").notNull(),
      payloadHash: text("payload_hash").notNull(),
      owner: uuid("owner").notNull().unique("integration_distribution_submissions_owner_key"),
      state: text("state").notNull(),
      checkpoint: jsonb("checkpoint").notNull().default(sql`'{}'::jsonb`),
      result: jsonb("result"),
      error: text("error"),
      createdAt: tz("created_at").notNull().defaultNow(),
      updatedAt: tz("updated_at").notNull().defaultNow()
    }, (t) => [
      primaryKey({ columns: [t.provider, t.userId, t.releaseId], name: "integration_distribution_submissions_pkey" }),
      foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_distribution_submissions_user_id_fkey" }).onDelete("cascade"),
      check("integration_distribution_submissions_provider_check", sql`${t.provider} IN ('labelgrid','toolost')`),
      check("integration_distribution_submissions_state_check", sql`${t.state} IN ('started','completed','unknown')`)
    ]);
    commerceJournals = pgTable("commerce_journals", {
      id: text("id").primaryKey(),
      currency: text("currency").notNull(),
      source: text("source").notNull(),
      createdAt: tz("created_at").notNull().defaultNow()
    });
    commerceEntries = pgTable("commerce_entries", {
      journalId: text("journal_id").notNull(),
      line: integer("line").notNull(),
      account: text("account").notNull(),
      userId: text("user_id"),
      amountCents: money("amount_cents").notNull()
    }, (t) => [
      primaryKey({ columns: [t.journalId, t.line], name: "commerce_entries_pkey" }),
      index("commerce_entries_account").on(t.userId, t.account),
      foreignKey({ columns: [t.journalId], foreignColumns: [commerceJournals.id], name: "commerce_entries_journal_id_fkey" })
    ]);
    commerceAllocations = pgTable("commerce_allocations", {
      id: text("id").primaryKey(),
      sourceId: text("source_id").notNull(),
      userId: text("user_id").notNull(),
      currency: text("currency").notNull(),
      amountCents: money("amount_cents").notNull(),
      reversedCents: money("reversed_cents").notNull().default(sql`0`),
      drawnCents: money("drawn_cents").notNull().default(sql`0`),
      createdAt: tz("created_at").notNull().defaultNow()
    }, (t) => [
      unique("commerce_allocations_source_id_user_id_key").on(t.sourceId, t.userId),
      check("commerce_allocations_amount_cents_check", sql`${t.amountCents} >= 0`),
      check("commerce_allocations_check", sql`${t.reversedCents} >= 0 AND ${t.reversedCents} <= ${t.amountCents}`),
      check("commerce_allocations_check1", sql`${t.drawnCents} >= 0 AND ${t.drawnCents} <= ${t.amountCents}`)
    ]);
    commerceOperations = pgTable("commerce_operations", {
      id: text("id").primaryKey(),
      kind: text("kind").notNull(),
      userId: text("user_id").notNull(),
      currency: text("currency").notNull(),
      amountCents: money("amount_cents").notNull(),
      state: text("state").notNull().default("pending"),
      payload: jsonb("payload").notNull(),
      transferId: text("transfer_id"),
      providerId: text("provider_id"),
      leaseUntil: tz("lease_until"),
      leaseToken: text("lease_token"),
      attempts: integer("attempts").notNull().default(0),
      error: text("error"),
      createdAt: tz("created_at").notNull().defaultNow(),
      updatedAt: tz("updated_at").notNull().defaultNow()
    }, (t) => [check("commerce_operations_amount_cents_check", sql`${t.amountCents} > 0`), index("commerce_operations_pending").on(t.state, t.leaseUntil)]);
    commerceDraws = pgTable("commerce_draws", {
      operationId: text("operation_id").notNull(),
      allocationId: text("allocation_id").notNull(),
      amountCents: money("amount_cents").notNull(),
      compensatedCentsAtDraw: money("compensated_cents_at_draw").notNull().default(sql`0`)
    }, (t) => [
      primaryKey({ columns: [t.operationId, t.allocationId], name: "commerce_draws_pkey" }),
      check("commerce_draws_amount_cents_check", sql`${t.amountCents} > 0`),
      foreignKey({ columns: [t.operationId], foreignColumns: [commerceOperations.id], name: "commerce_draws_operation_id_fkey" }),
      foreignKey({ columns: [t.allocationId], foreignColumns: [commerceAllocations.id], name: "commerce_draws_allocation_id_fkey" })
    ]);
    commerceSources = pgTable("commerce_sources", {
      id: text("id").primaryKey(),
      kind: text("kind").notNull(),
      paymentIntent: text("payment_intent").unique("commerce_sources_payment_intent_key"),
      currency: text("currency").notNull(),
      grossCents: money("gross_cents").notNull(),
      feeCents: money("fee_cents").notNull(),
      taxCents: money("tax_cents").notNull().default(sql`0`),
      compensatedTaxCents: money("compensated_tax_cents").notNull().default(sql`0`),
      refundedCents: money("refunded_cents").notNull().default(sql`0`),
      disputedCents: money("disputed_cents").notNull().default(sql`0`),
      pendingRefundCents: money("pending_refund_cents").notNull().default(sql`0`),
      compensatedCents: money("compensated_cents").notNull().default(sql`0`),
      metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
      createdAt: tz("created_at").notNull().defaultNow()
    }, (t) => [
      check("commerce_sources_gross_cents_check", sql`${t.grossCents} > 0`),
      check("commerce_sources_fee_cents_check", sql`${t.feeCents} >= 0`),
      check("commerce_sources_tax_cents_check", sql`${t.taxCents} >= 0`)
    ]);
    commerceStatements = pgTable("commerce_statements", {
      statementId: text("statement_id").primaryKey(),
      userId: text("user_id").notNull(),
      currency: text("currency").notNull(),
      payableCents: money("payable_cents").notNull(),
      funded: boolean("funded").notNull().default(false),
      details: jsonb("details").notNull(),
      fundingRef: text("funding_ref").unique("commerce_statements_funding_ref_key"),
      createdAt: tz("created_at").notNull().defaultNow()
    });
    commerceSchedules = pgTable("commerce_schedules", {
      userId: text("user_id").primaryKey(),
      nextDue: tz("next_due").notNull()
    });
    genericExportJobs = pgTable("generic_export_jobs", {
      id: varchar("id").primaryKey(),
      userId: varchar("user_id").notNull(),
      name: text("name").notNull(),
      type: text("type").notNull(),
      format: text("format").notNull(),
      projectId: varchar("project_id"),
      settings: jsonb("settings").notNull(),
      status: text("status").notNull().default("queued"),
      progress: integer("progress").notNull().default(0),
      artifact: jsonb("artifact"),
      error: text("error"),
      retryCount: integer("retry_count").notNull().default(0),
      createdAt: tz("created_at").notNull().defaultNow(),
      updatedAt: tz("updated_at").notNull().defaultNow(),
      completedAt: tz("completed_at")
    }, (t) => [index("generic_export_jobs_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()), index("generic_export_jobs_status_idx").on(t.status, t.updatedAt)]);
    integrationSmsAttempts = pgTable("integration_sms_attempts", {
      operationKey: text("operation_key").primaryKey(),
      userId: varchar("user_id").notNull(),
      state: text("state").notNull(),
      providerId: text("provider_id").unique("integration_sms_attempts_provider_id_key"),
      providerStatus: text("provider_status"),
      error: text("error"),
      createdAt: tz("created_at").notNull().defaultNow(),
      updatedAt: tz("updated_at").notNull().defaultNow()
    }, (t) => [
      check("integration_sms_attempts_state_check", sql`${t.state} IN ('started','accepted','delivered','failed','unknown')`),
      foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_sms_attempts_user_id_fkey" }).onDelete("cascade")
    ]);
    runtimeBackupCatalog = pgTable("runtime_backup_catalog", {
      key: text("key").primaryKey(),
      name: text("name").notNull(),
      createdAt: tz("created_at").notNull().defaultNow(),
      size: money("size").notNull(),
      checksum: text("checksum").notNull(),
      state: text("state").notNull()
    }, (t) => [
      check("runtime_backup_catalog_size_check", sql`${t.size} >= 0`),
      check("runtime_backup_catalog_state_check", sql`${t.state} IN ('pending','verified','deleting')`)
    ]);
    runtimeBackupRuns = pgTable("runtime_backup_runs", {
      day: text("day").primaryKey(),
      owner: text("owner").notNull(),
      targetIdentity: text("target_identity").notNull(),
      state: text("state").notNull(),
      startedAt: tz("started_at").notNull().defaultNow(),
      leaseUntil: tz("lease_until").notNull().default(sql`now() + interval '5 minutes'`),
      finishedAt: tz("finished_at")
    }, (t) => [check("runtime_backup_runs_state_check", sql`${t.state} IN ('running','complete','failed')`)]);
    pgSessions = pgTable("pg_sessions", {
      sid: text("sid").primaryKey(),
      sess: text("sess").notNull(),
      expire: money("expire").notNull()
    }, (t) => [index("pg_sessions_expire_idx").on(t.expire)]);
    growthSplitRevisions = pgTable("growth_split_revisions", {
      sheetId: text("sheet_id").notNull(),
      revision: integer("revision").notNull(),
      content: jsonb("content").notNull(),
      contentHash: text("content_hash").notNull(),
      createdAt: tz("created_at").notNull().defaultNow()
    }, (t) => [
      primaryKey({ columns: [t.sheetId, t.revision], name: "growth_split_revisions_pkey" }),
      check("growth_split_revisions_revision_check", sql`${t.revision} > 0`)
    ]);
    growthSplitAssents = pgTable("growth_split_assents", {
      sheetId: text("sheet_id").notNull(),
      revision: integer("revision").notNull(),
      userId: text("user_id").notNull(),
      signatureHash: text("signature_hash").notNull(),
      signedAt: tz("signed_at").notNull().defaultNow()
    }, (t) => [
      primaryKey({ columns: [t.sheetId, t.revision, t.userId], name: "growth_split_assents_pkey" }),
      foreignKey({ columns: [t.sheetId, t.revision], foreignColumns: [growthSplitRevisions.sheetId, growthSplitRevisions.revision], name: "growth_split_assents_sheet_id_revision_fkey" })
    ]);
    growthFanPermissions = pgTable("growth_fan_permissions", {
      artistId: text("artist_id").notNull(),
      email: text("email").notNull(),
      state: text("state").notNull(),
      tokenHash: text("token_hash"),
      tokenExpiresAt: tz("token_expires_at"),
      consentAt: tz("consent_at"),
      suppressedAt: tz("suppressed_at")
    }, (t) => [
      primaryKey({ columns: [t.artistId, t.email], name: "growth_fan_permissions_pkey" }),
      check("growth_fan_permissions_state_check", sql`${t.state} IN ('pending','consented','suppressed')`),
      uniqueIndex("growth_fan_token_idx").on(t.tokenHash)
    ]);
    growthFanCommands = pgTable("growth_fan_commands", {
      id: text("id").primaryKey(),
      artistId: text("artist_id").notNull(),
      commandKey: text("command_key").notNull(),
      subject: text("subject").notNull(),
      body: text("body").notNull(),
      createdAt: tz("created_at").notNull().defaultNow()
    }, (t) => [unique("growth_fan_commands_artist_id_command_key_key").on(t.artistId, t.commandKey)]);
    growthFanRecipients = pgTable("growth_fan_recipients", {
      commandId: text("command_id").notNull(),
      email: text("email").notNull(),
      state: text("state").notNull().default("pending"),
      unsubscribeHash: text("unsubscribe_hash").notNull().unique("growth_fan_recipients_unsubscribe_hash_key"),
      unsubscribeToken: text("unsubscribe_token").notNull(),
      attemptedAt: tz("attempted_at"),
      completedAt: tz("completed_at"),
      providerMessageId: text("provider_message_id"),
      outcomeReason: text("outcome_reason")
    }, (t) => [
      primaryKey({ columns: [t.commandId, t.email], name: "growth_fan_recipients_pkey" }),
      foreignKey({ columns: [t.commandId], foreignColumns: [growthFanCommands.id], name: "growth_fan_recipients_command_id_fkey" }),
      check("growth_fan_recipients_state_check", sql`${t.state} IN ('pending','sending','accepted','unknown','suppressed','delivered','bounced','complained')`),
      index("growth_fan_pending_idx").on(t.commandId, t.state),
      index("growth_fan_receipt_idx").on(t.providerMessageId)
    ]);
    growthFanProviderEvents = pgTable("growth_fan_provider_events", {
      eventId: text("event_id").primaryKey(),
      providerMessageId: text("provider_message_id").notNull(),
      eventType: text("event_type").notNull(),
      occurredAt: tz("occurred_at").notNull(),
      receivedAt: tz("received_at").notNull().defaultNow()
    }, (t) => [index("growth_fan_event_receipt_idx").on(t.providerMessageId)]);
    growthMerchPayments = pgTable("growth_merch_payments", {
      orderId: text("order_id").primaryKey(),
      buyerId: text("buyer_id").notNull(),
      commandKey: text("command_key").notNull(),
      currency: text("currency").notNull(),
      subtotalCents: money("subtotal_cents").notNull(),
      collectedCents: money("collected_cents").notNull().default(sql`0`),
      refundedCents: money("refunded_cents").notNull().default(sql`0`),
      checkoutId: text("checkout_id").unique("growth_merch_payments_checkout_id_key"),
      checkoutUrl: text("checkout_url"),
      state: text("state").notNull(),
      createdAt: tz("created_at").notNull().defaultNow()
    }, (t) => [
      unique("growth_merch_payments_buyer_id_command_key_key").on(t.buyerId, t.commandKey),
      check("growth_merch_payments_currency_check", sql`${t.currency} = 'usd'`),
      check("growth_merch_payments_subtotal_cents_check", sql`${t.subtotalCents} >= 0`),
      check("growth_merch_payments_collected_cents_check", sql`${t.collectedCents} >= 0`),
      check("growth_merch_payments_check", sql`${t.refundedCents} >= 0 AND ${t.refundedCents} <= ${t.collectedCents}`),
      check("growth_merch_payments_state_check", sql`${t.state} IN ('reserved','checkout','paid','expired','refunded')`)
    ]);
    growthMerchPaymentEvents = pgTable("growth_merch_payment_events", {
      eventId: text("event_id").primaryKey(),
      orderId: text("order_id").notNull(),
      eventType: text("event_type").notNull(),
      receivedAt: tz("received_at").notNull().defaultNow()
    }, (t) => [foreignKey({ columns: [t.orderId], foreignColumns: [growthMerchPayments.orderId], name: "growth_merch_payment_events_order_id_fkey" })]);
    clientSyncReceipts = pgTable("client_sync_receipts", {
      ownerId: varchar("owner_id").notNull(),
      operationId: varchar("operation_id", { length: 160 }).notNull(),
      payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
      receipt: jsonb("receipt").notNull(),
      createdAt: tz("created_at").notNull().defaultNow()
    }, (t) => [
      primaryKey({ columns: [t.ownerId, t.operationId], name: "client_sync_receipts_pkey" }),
      foreignKey({ columns: [t.ownerId], foreignColumns: [users.id], name: "client_sync_receipts_owner_id_fkey" })
    ]);
  }
});

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accountErasureRequests: () => accountErasureRequests,
  accountErasureSteps: () => accountErasureSteps,
  achievements: () => achievements,
  adCampaigns: () => adCampaigns,
  adCreatives: () => adCreatives,
  adDeliveryLogs: () => adDeliveryLogs,
  aiModelVersions: () => aiModelVersions,
  aiModels: () => aiModels,
  alertIncidents: () => alertIncidents,
  alertRules: () => alertRules,
  analytics: () => analytics,
  apiKeys: () => apiKeys,
  apiUsage: () => apiUsage,
  approvalHistory: () => approvalHistory,
  approvalRequests: () => approvalRequests,
  approvalSteps: () => approvalSteps,
  approvalWorkflows: () => approvalWorkflows,
  approvePostSchema: () => approvePostSchema,
  arDiscoveries: () => arDiscoveries,
  artistConnections: () => artistConnections,
  artistDnaSnapshots: () => artistDnaSnapshots,
  artistIdentityLinks: () => artistIdentityLinks,
  artistProfileReleases: () => artistProfileReleases,
  artistProfiles: () => artistProfiles,
  artistProgressSnapshots: () => artistProgressSnapshots,
  artistScores: () => artistScores,
  assistantConversations: () => assistantConversations,
  assistantMessages: () => assistantMessages,
  audioClips: () => audioClips,
  auditLogs: () => auditLogs,
  authSessionEpochs: () => authSessionEpochs,
  autopilotCrossInsights: () => autopilotCrossInsights,
  autopilotInsights: () => autopilotInsights,
  autopilotLearningData: () => autopilotLearningData,
  autopilotPreferences: () => autopilotPreferences,
  batchTemplates: () => batchTemplates,
  beatDiscoveryScores: () => beatDiscoveryScores,
  beatInteractions: () => beatInteractions,
  beatLikes: () => beatLikes,
  beatMoneyLoopCycles: () => beatMoneyLoopCycles,
  beatMoneyLoopState: () => beatMoneyLoopState,
  beatPricingSnapshots: () => beatPricingSnapshots,
  beatPromotions: () => beatPromotions,
  beats: () => beats,
  bestPostingTimes: () => bestPostingTimes,
  bogoPromotions: () => bogoPromotions,
  budgetLineItems: () => budgetLineItems,
  bulkSchedulePostSchema: () => bulkSchedulePostSchema,
  bulkValidatePostSchema: () => bulkValidatePostSchema,
  campaigns: () => campaigns,
  cancellationFeedback: () => cancellationFeedback,
  careerCoachRecommendations: () => careerCoachRecommendations,
  careerGoals: () => careerGoals,
  catalogImportJobs: () => catalogImportJobs,
  catalogImportRows: () => catalogImportRows,
  claimedDomains: () => claimedDomains,
  clientSyncReceipts: () => clientSyncReceipts,
  collabSnapshots: () => collabSnapshots,
  collaborationAccessRequests: () => collaborationAccessRequests,
  collaborationComments: () => collaborationComments,
  collaborationProjects: () => collaborationProjects,
  collaborationVersions: () => collaborationVersions,
  commerceAllocations: () => commerceAllocations,
  commerceDraws: () => commerceDraws,
  commerceEntries: () => commerceEntries,
  commerceJournals: () => commerceJournals,
  commerceOperations: () => commerceOperations,
  commerceSchedules: () => commerceSchedules,
  commerceSources: () => commerceSources,
  commerceStatements: () => commerceStatements,
  commerceWebhookInbox: () => commerceWebhookInbox,
  commerceWebhookReceipts: () => commerceWebhookReceipts,
  compVersions: () => compVersions,
  competitorProfiles: () => competitorProfiles,
  contentCalendar: () => contentCalendar,
  contentIdRegistrations: () => contentIdRegistrations,
  contractTemplates: () => contractTemplates,
  countdownAnalytics: () => countdownAnalytics,
  countdownTasks: () => countdownTasks,
  customWorkflows: () => customWorkflows,
  customerHealthScores: () => customerHealthScores,
  customerMemberships: () => customerMemberships,
  disputeMessages: () => disputeMessages,
  distributionSLAMetrics: () => distributionSLAMetrics,
  distributorHistoryImports: () => distributorHistoryImports,
  distroReleases: () => distroReleases,
  distroTracks: () => distroTracks,
  dmcaNotices: () => dmcaNotices,
  dmcaStrikes: () => dmcaStrikes,
  dnsProviderCredentials: () => dnsProviderCredentials,
  dnsRecordCache: () => dnsRecordCache,
  dnsTemplates: () => dnsTemplates,
  dnsZoneRecords: () => dnsZoneRecords,
  dnsZones: () => dnsZones,
  dnssecKeys: () => dnssecKeys,
  domainContacts: () => domainContacts,
  domainEvents: () => domainEvents,
  dspAnalytics: () => dspAnalytics,
  dspProviders: () => dspProviders,
  dspRates: () => dspRates,
  dspSyncStatus: () => dspSyncStatus,
  dspUserPlatformStatus: () => dspUserPlatformStatus,
  dunningState: () => dunningState,
  emailEvents: () => emailEvents,
  emailMessages: () => emailMessages,
  emailPreferences: () => emailPreferences,
  exchangeRates: () => exchangeRates,
  explanationLogs: () => explanationLogs,
  fabricCatalogFence: () => fabricCatalogFence,
  fabricChunks: () => fabricChunks,
  fabricDeletionChunks: () => fabricDeletionChunks,
  fabricDeletionObjects: () => fabricDeletionObjects,
  fabricMigrationJobs: () => fabricMigrationJobs,
  fabricObjectDependencies: () => fabricObjectDependencies,
  fabricObjects: () => fabricObjects,
  fabricPockets: () => fabricPockets,
  fabricStorageNodes: () => fabricStorageNodes,
  fabricVolumes: () => fabricVolumes,
  fanCampaigns: () => fanCampaigns,
  fanCreditTransactions: () => fanCreditTransactions,
  fanLoyaltyConfigs: () => fanLoyaltyConfigs,
  fanMessages: () => fanMessages,
  fanSegments: () => fanSegments,
  fanSubscribers: () => fanSubscribers,
  fanWallets: () => fanWallets,
  featureEvents: () => featureEvents,
  filterPresets: () => filterPresets,
  generatedContracts: () => generatedContracts,
  generationArmStats: () => generationArmStats,
  generationHistory: () => generationHistory,
  genericExportJobs: () => genericExportJobs,
  globalRankings: () => globalRankings,
  growthFanCommands: () => growthFanCommands,
  growthFanPermissions: () => growthFanPermissions,
  growthFanProviderEvents: () => growthFanProviderEvents,
  growthFanRecipients: () => growthFanRecipients,
  growthMerchPaymentEvents: () => growthMerchPaymentEvents,
  growthMerchPayments: () => growthMerchPayments,
  growthSplitAssents: () => growthSplitAssents,
  growthSplitRevisions: () => growthSplitRevisions,
  hashtagResearch: () => hashtagResearch,
  historicalAnalytics: () => historicalAnalytics,
  hnsAuctions: () => hnsAuctions,
  hybridStorageFiles: () => hybridStorageFiles,
  hybridStorageImports: () => hybridStorageImports,
  hyperFollowPages: () => hyperFollowPages,
  inferenceRuns: () => inferenceRuns,
  insertAchievementSchema: () => insertAchievementSchema,
  insertAdCampaignSchema: () => insertAdCampaignSchema,
  insertAdCreativeSchema: () => insertAdCreativeSchema,
  insertAiModelSchema: () => insertAiModelSchema,
  insertAiModelVersionSchema: () => insertAiModelVersionSchema,
  insertAlertRuleSchema: () => insertAlertRuleSchema,
  insertAnalyticsSchema: () => insertAnalyticsSchema,
  insertApprovalRequestSchema: () => insertApprovalRequestSchema,
  insertApprovalStepSchema: () => insertApprovalStepSchema,
  insertApprovalWorkflowSchema: () => insertApprovalWorkflowSchema,
  insertArDiscoverySchema: () => insertArDiscoverySchema,
  insertArtistConnectionSchema: () => insertArtistConnectionSchema,
  insertArtistProfileSchema: () => insertArtistProfileSchema,
  insertArtistProgressSnapshotSchema: () => insertArtistProgressSnapshotSchema,
  insertArtistScoreSchema: () => insertArtistScoreSchema,
  insertAssistantConversationSchema: () => insertAssistantConversationSchema,
  insertAssistantMessageSchema: () => insertAssistantMessageSchema,
  insertAuditLogSchema: () => insertAuditLogSchema,
  insertAutopilotCrossInsightSchema: () => insertAutopilotCrossInsightSchema,
  insertAutopilotInsightSchema: () => insertAutopilotInsightSchema,
  insertAutopilotLearningDataSchema: () => insertAutopilotLearningDataSchema,
  insertAutopilotPreferenceSchema: () => insertAutopilotPreferenceSchema,
  insertBatchTemplateSchema: () => insertBatchTemplateSchema,
  insertBeatDiscoveryScoreSchema: () => insertBeatDiscoveryScoreSchema,
  insertBeatInteractionSchema: () => insertBeatInteractionSchema,
  insertBeatPricingSnapshotSchema: () => insertBeatPricingSnapshotSchema,
  insertBeatPromotionSchema: () => insertBeatPromotionSchema,
  insertBestPostingTimeSchema: () => insertBestPostingTimeSchema,
  insertBogoPromotionSchema: () => insertBogoPromotionSchema,
  insertBudgetLineItemSchema: () => insertBudgetLineItemSchema,
  insertCampaignSchema: () => insertCampaignSchema,
  insertCancellationFeedbackSchema: () => insertCancellationFeedbackSchema,
  insertCareerCoachRecommendationSchema: () => insertCareerCoachRecommendationSchema,
  insertCareerGoalSchema: () => insertCareerGoalSchema,
  insertClaimedDomainSchema: () => insertClaimedDomainSchema,
  insertCollabSnapshotSchema: () => insertCollabSnapshotSchema,
  insertCollaborationAccessRequestSchema: () => insertCollaborationAccessRequestSchema,
  insertCollaborationCommentSchema: () => insertCollaborationCommentSchema,
  insertCollaborationProjectSchema: () => insertCollaborationProjectSchema,
  insertCollaborationVersionSchema: () => insertCollaborationVersionSchema,
  insertCompetitorProfileSchema: () => insertCompetitorProfileSchema,
  insertContentCalendarSchema: () => insertContentCalendarSchema,
  insertContentIdRegistrationSchema: () => insertContentIdRegistrationSchema,
  insertContractTemplateSchema: () => insertContractTemplateSchema,
  insertCountdownAnalyticSchema: () => insertCountdownAnalyticSchema,
  insertCountdownTaskSchema: () => insertCountdownTaskSchema,
  insertCustomWorkflowSchema: () => insertCustomWorkflowSchema,
  insertCustomerHealthScoreSchema: () => insertCustomerHealthScoreSchema,
  insertCustomerMembershipSchema: () => insertCustomerMembershipSchema,
  insertDistributionSLAMetricSchema: () => insertDistributionSLAMetricSchema,
  insertDnsProviderCredentialsSchema: () => insertDnsProviderCredentialsSchema,
  insertDnsRecordCacheSchema: () => insertDnsRecordCacheSchema,
  insertDnsTemplateSchema: () => insertDnsTemplateSchema,
  insertDnsZoneRecordSchema: () => insertDnsZoneRecordSchema,
  insertDnsZoneSchema: () => insertDnsZoneSchema,
  insertDnssecKeySchema: () => insertDnssecKeySchema,
  insertDomainContactSchema: () => insertDomainContactSchema,
  insertDomainEventSchema: () => insertDomainEventSchema,
  insertDunningStateSchema: () => insertDunningStateSchema,
  insertEmailMessageSchema: () => insertEmailMessageSchema,
  insertEmailPreferenceSchema: () => insertEmailPreferenceSchema,
  insertExplanationLogSchema: () => insertExplanationLogSchema,
  insertFabricChunkSchema: () => insertFabricChunkSchema,
  insertFabricObjectSchema: () => insertFabricObjectSchema,
  insertFabricPocketSchema: () => insertFabricPocketSchema,
  insertFabricStorageNodeSchema: () => insertFabricStorageNodeSchema,
  insertFabricVolumeSchema: () => insertFabricVolumeSchema,
  insertFanCampaignSchema: () => insertFanCampaignSchema,
  insertFanCreditTransactionSchema: () => insertFanCreditTransactionSchema,
  insertFanLoyaltyConfigSchema: () => insertFanLoyaltyConfigSchema,
  insertFanMessageSchema: () => insertFanMessageSchema,
  insertFanSegmentSchema: () => insertFanSegmentSchema,
  insertFanSubscriberSchema: () => insertFanSubscriberSchema,
  insertFeatureEventSchema: () => insertFeatureEventSchema,
  insertGenerationArmStatSchema: () => insertGenerationArmStatSchema,
  insertGenerationHistorySchema: () => insertGenerationHistorySchema,
  insertGlobalRankingSchema: () => insertGlobalRankingSchema,
  insertHashtagResearchSchema: () => insertHashtagResearchSchema,
  insertHistoricalAnalyticSchema: () => insertHistoricalAnalyticSchema,
  insertHnsAuctionSchema: () => insertHnsAuctionSchema,
  insertInferenceRunSchema: () => insertInferenceRunSchema,
  insertInvoiceSchema: () => insertInvoiceSchema,
  insertIpBlacklistSchema: () => insertIpBlacklistSchema,
  insertJwtTokenSchema: () => insertJwtTokenSchema,
  insertLabelSettingSchema: () => insertLabelSettingSchema,
  insertLabelSubmissionSchema: () => insertLabelSubmissionSchema,
  insertLedgerEntrySchema: () => insertLedgerEntrySchema,
  insertListenerCohortSchema: () => insertListenerCohortSchema,
  insertListingSchema: () => insertListingSchema,
  insertListingStemSchema: () => insertListingStemSchema,
  insertLyricsSyncSchema: () => insertLyricsSyncSchema,
  insertMarketplaceDisputeSchema: () => insertMarketplaceDisputeSchema,
  insertMarketplaceRecommendationSchema: () => insertMarketplaceRecommendationSchema,
  insertMembershipTierSchema: () => insertMembershipTierSchema,
  insertMerchItemSchema: () => insertMerchItemSchema,
  insertMerchOrderSchema: () => insertMerchOrderSchema,
  insertMiniVideoSchema: () => insertMiniVideoSchema,
  insertMobileDeviceTokenSchema: () => insertMobileDeviceTokenSchema,
  insertMusicImpactMetricSchema: () => insertMusicImpactMetricSchema,
  insertMusicVideoProductionSchema: () => insertMusicVideoProductionSchema,
  insertNlpQueryLogSchema: () => insertNlpQueryLogSchema,
  insertNpsResponseSchema: () => insertNpsResponseSchema,
  insertOnboardingTaskSchema: () => insertOnboardingTaskSchema,
  insertOrganicAssetLifetimeSchema: () => insertOrganicAssetLifetimeSchema,
  insertOrganicAssetSchema: () => insertOrganicAssetSchema,
  insertOrganicChannelSchema: () => insertOrganicChannelSchema,
  insertOrganicRoiSnapshotSchema: () => insertOrganicRoiSnapshotSchema,
  insertOutreachCampaignSchema: () => insertOutreachCampaignSchema,
  insertOutreachPitchSchema: () => insertOutreachPitchSchema,
  insertPlatformDataSourceSchema: () => insertPlatformDataSourceSchema,
  insertPlatformRoyaltyRateSchema: () => insertPlatformRoyaltyRateSchema,
  insertPlaylistAttributionSchema: () => insertPlaylistAttributionSchema,
  insertPlaylistJourneySchema: () => insertPlaylistJourneySchema,
  insertPlaylistPitchSchema: () => insertPlaylistPitchSchema,
  insertPluginPresetSchema: () => insertPluginPresetSchema,
  insertPreSaveCampaignSchema: () => insertPreSaveCampaignSchema,
  insertPreSaveEntrySchema: () => insertPreSaveEntrySchema,
  insertPreSavePageSchema: () => insertPreSavePageSchema,
  insertPressKitSchema: () => insertPressKitSchema,
  insertProjectBudgetSchema: () => insertProjectBudgetSchema,
  insertProjectMemberSchema: () => insertProjectMemberSchema,
  insertProjectSchema: () => insertProjectSchema,
  insertPromoCardSchema: () => insertPromoCardSchema,
  insertPublishingRightSchema: () => insertPublishingRightSchema,
  insertRadioPitchSchema: () => insertRadioPitchSchema,
  insertRefreshTokenSchema: () => insertRefreshTokenSchema,
  insertRefundSchema: () => insertRefundSchema,
  insertReleaseCountdownSchema: () => insertReleaseCountdownSchema,
  insertReleaseSchema: () => insertReleaseSchema,
  insertRevenueForecastSchema: () => insertRevenueForecastSchema,
  insertRoyaltySplitSchema: () => insertRoyaltySplitSchema,
  insertRoyaltyTransactionSchema: () => insertRoyaltyTransactionSchema,
  insertSampleClearanceSchema: () => insertSampleClearanceSchema,
  insertSecurityThreatSchema: () => insertSecurityThreatSchema,
  insertSentEmailSchema: () => insertSentEmailSchema,
  insertSessionSchema: () => insertSessionSchema,
  insertSetlistSchema: () => insertSetlistSchema,
  insertShareLinkSchema: () => insertShareLinkSchema,
  insertShowSchema: () => insertShowSchema,
  insertSocialAccountSchema: () => insertSocialAccountSchema,
  insertSocialAutopilotContentSchema: () => insertSocialAutopilotContentSchema,
  insertSocialCampaignSchema: () => insertSocialCampaignSchema,
  insertSocialInboxMessageSchema: () => insertSocialInboxMessageSchema,
  insertSocialKeywordSchema: () => insertSocialKeywordSchema,
  insertSocialMentionSchema: () => insertSocialMentionSchema,
  insertSocialPatternAggregateSchema: () => insertSocialPatternAggregateSchema,
  insertSocialReplyTemplateSchema: () => insertSocialReplyTemplateSchema,
  insertSongwritingSessionSchema: () => insertSongwritingSessionSchema,
  insertSplitPaymentSchema: () => insertSplitPaymentSchema,
  insertSplitSheetSchema: () => insertSplitSheetSchema,
  insertSpotifyCanvasSchema: () => insertSpotifyCanvasSchema,
  insertSsoConfigSchema: () => insertSsoConfigSchema,
  insertStorefrontDomainSchema: () => insertStorefrontDomainSchema,
  insertStorefrontHostSchema: () => insertStorefrontHostSchema,
  insertStorefrontSchema: () => insertStorefrontSchema,
  insertStudioPinnedFolderSchema: () => insertStudioPinnedFolderSchema,
  insertStudioProjectSchema: () => insertStudioProjectSchema,
  insertStudioRecentFileSchema: () => insertStudioRecentFileSchema,
  insertStudioSampleSchema: () => insertStudioSampleSchema,
  insertStudioTemplateSchema: () => insertStudioTemplateSchema,
  insertStudioTrackSchema: () => insertStudioTrackSchema,
  insertSubscriptionSchema: () => insertSubscriptionSchema,
  insertSupportTicketSchema: () => insertSupportTicketSchema,
  insertSyncLicenseInquirySchema: () => insertSyncLicenseInquirySchema,
  insertSyncLicenseSchema: () => insertSyncLicenseSchema,
  insertSyncPlacementSchema: () => insertSyncPlacementSchema,
  insertSyncSubmissionSchema: () => insertSyncSubmissionSchema,
  insertSystemLogSchema: () => insertSystemLogSchema,
  insertSystemMetricSchema: () => insertSystemMetricSchema,
  insertSystemSettingSchema: () => insertSystemSettingSchema,
  insertTakeGroupSchema: () => insertTakeGroupSchema,
  insertTakeLaneSchema: () => insertTakeLaneSchema,
  insertTakeSegmentSchema: () => insertTakeSegmentSchema,
  insertTaxFormSchema: () => insertTaxFormSchema,
  insertTaxTreatyRateSchema: () => insertTaxTreatyRateSchema,
  insertUserAchievementSchema: () => insertUserAchievementSchema,
  insertUserBrandVoiceSchema: () => insertUserBrandVoiceSchema,
  insertUserOnboardingSchema: () => insertUserOnboardingSchema,
  insertUserSchema: () => insertUserSchema,
  insertUserStorageFileSchema: () => insertUserStorageFileSchema,
  insertUserStorageSchema: () => insertUserStorageSchema,
  insertUserStreakSchema: () => insertUserStreakSchema,
  insertUserTasteProfileSchema: () => insertUserTasteProfileSchema,
  insertVenueContactSchema: () => insertVenueContactSchema,
  insertWarpMarkerSchema: () => insertWarpMarkerSchema,
  insertWorkspaceAuditLogSchema: () => insertWorkspaceAuditLogSchema,
  insertWorkspaceCatalogSchema: () => insertWorkspaceCatalogSchema,
  insertWorkspaceInvitationSchema: () => insertWorkspaceInvitationSchema,
  insertWorkspaceMemberSchema: () => insertWorkspaceMemberSchema,
  insertWorkspaceRoleSchema: () => insertWorkspaceRoleSchema,
  insertWorkspaceSchema: () => insertWorkspaceSchema,
  instantPayouts: () => instantPayouts,
  integrationCatalogJobs: () => integrationCatalogJobs,
  integrationCatalogTransfers: () => integrationCatalogTransfers,
  integrationDistributionSubmissions: () => integrationDistributionSubmissions,
  integrationNotificationDigest: () => integrationNotificationDigest,
  integrationSmsAttempts: () => integrationSmsAttempts,
  invoices: () => invoices,
  ipBlacklist: () => ipBlacklist,
  isrcRegistry: () => isrcRegistry,
  jwtTokens: () => jwtTokens,
  kycDocuments: () => kycDocuments,
  kycVerifications: () => kycVerifications,
  labelSettings: () => labelSettings,
  labelSubmissions: () => labelSubmissions,
  ledgerEntries: () => ledgerEntries,
  legalHolds: () => legalHolds,
  licenseTemplates: () => licenseTemplates,
  listenerCohorts: () => listenerCohorts,
  listingLicenseTiers: () => listingLicenseTiers,
  listingStems: () => listingStems,
  listings: () => listings,
  lyricsSyncs: () => lyricsSyncs,
  markers: () => markers,
  marketplaceDisputes: () => marketplaceDisputes,
  marketplaceRecommendations: () => marketplaceRecommendations,
  membershipTiers: () => membershipTiers,
  merchItems: () => merchItems,
  merchOrders: () => merchOrders,
  midiClips: () => midiClips,
  midiNotes: () => midiNotes,
  miniVideos: () => miniVideos,
  mobileDeviceTokens: () => mobileDeviceTokens,
  musicImpactMetrics: () => musicImpactMetrics,
  musicVideoProductions: () => musicVideoProductions,
  musicWorkflowAutomations: () => musicWorkflowAutomations,
  musicWorkflowExecutionLogs: () => musicWorkflowExecutionLogs,
  nlpQueryLogs: () => nlpQueryLogs,
  notifications: () => notifications,
  npsResponses: () => npsResponses,
  onboardingTasks: () => onboardingTasks,
  orders: () => orders,
  organicAssetLifetime: () => organicAssetLifetime,
  organicAssets: () => organicAssets,
  organicChannels: () => organicChannels,
  organicRoiSnapshots: () => organicRoiSnapshots,
  outreachCampaigns: () => outreachCampaigns,
  outreachPitches: () => outreachPitches,
  pgSessions: () => pgSessions2,
  platformApiConfigs: () => platformApiConfigs,
  platformDataSources: () => platformDataSources,
  platformRoyaltyRates: () => platformRoyaltyRates,
  playlistAttributions: () => playlistAttributions,
  playlistJourneys: () => playlistJourneys,
  playlistPitches: () => playlistPitches,
  pluginCatalog: () => pluginCatalog,
  pluginInstances: () => pluginInstances,
  pluginPresets: () => pluginPresets,
  posts: () => posts,
  preSaveCampaigns: () => preSaveCampaigns,
  preSaveEntries: () => preSaveEntries,
  preSavePages: () => preSavePages,
  pressKits: () => pressKits,
  profileClaimEvents: () => profileClaimEvents,
  profileClaimPipeline: () => profileClaimPipeline,
  profileSplitEvents: () => profileSplitEvents,
  projectBudgets: () => projectBudgets,
  projectMembers: () => projectMembers,
  projectRoyaltySplits: () => projectRoyaltySplits,
  projects: () => projects,
  promoCards: () => promoCards,
  publishingRights: () => publishingRights,
  pushSubscriptions: () => pushSubscriptions,
  radioPitches: () => radioPitches,
  recoupmentAccounts: () => recoupmentAccounts,
  refreshTokens: () => refreshTokens,
  refunds: () => refunds,
  rejectPostSchema: () => rejectPostSchema,
  releaseCountdowns: () => releaseCountdowns,
  releaseScheduledActions: () => releaseScheduledActions,
  releaseVersionHistory: () => releaseVersionHistory,
  releaseWorkflowRequests: () => releaseWorkflowRequests,
  releases: () => releases,
  requestInstantPayoutSchema: () => requestInstantPayoutSchema,
  revenueEvents: () => revenueEvents,
  revenueForecasts: () => revenueForecasts,
  royaltyDisputes: () => royaltyDisputes,
  royaltySplits: () => royaltySplits,
  royaltyStatements: () => royaltyStatements,
  royaltyTransactions: () => royaltyTransactions,
  runtimeBackupCatalog: () => runtimeBackupCatalog,
  runtimeBackupRuns: () => runtimeBackupRuns,
  sampleClearances: () => sampleClearances,
  scheduledPostBatches: () => scheduledPostBatches,
  searchHistory: () => searchHistory,
  securityThreats: () => securityThreats,
  sentEmails: () => sentEmails,
  sessions: () => sessions,
  setlists: () => setlists,
  shareLinks: () => shareLinks,
  shows: () => shows,
  socialAccounts: () => socialAccounts,
  socialAutopilotContent: () => socialAutopilotContent,
  socialCampaigns: () => socialCampaigns,
  socialInboxMessages: () => socialInboxMessages,
  socialKeywords: () => socialKeywords,
  socialMediaJobs: () => socialMediaJobs,
  socialMentions: () => socialMentions,
  socialPatternAggregates: () => socialPatternAggregates,
  socialReplyTemplates: () => socialReplyTemplates,
  songwritingSessions: () => songwritingSessions,
  splitContracts: () => splitContracts,
  splitPayments: () => splitPayments,
  splitSheets: () => splitSheets,
  spotifyCanvases: () => spotifyCanvases,
  ssoConfigs: () => ssoConfigs,
  statusPageIncidentServices: () => statusPageIncidentServices,
  statusPageIncidentUpdates: () => statusPageIncidentUpdates,
  statusPageIncidents: () => statusPageIncidents,
  statusPageServices: () => statusPageServices,
  statusPageSubscribers: () => statusPageSubscribers,
  statusPageUptimeMetrics: () => statusPageUptimeMetrics,
  stemExports: () => stemExports,
  storefrontDomains: () => storefrontDomains,
  storefrontFollows: () => storefrontFollows,
  storefrontHosts: () => storefrontHosts,
  storefrontLikes: () => storefrontLikes,
  storefrontOrders: () => storefrontOrders,
  storefrontRatings: () => storefrontRatings,
  storefrontTemplates: () => storefrontTemplates,
  storefronts: () => storefronts,
  storefrontsRelations: () => storefrontsRelations,
  studioPinnedFolders: () => studioPinnedFolders,
  studioProjects: () => studioProjects,
  studioRecentFiles: () => studioRecentFiles,
  studioSamples: () => studioSamples,
  studioTemplates: () => studioTemplates,
  studioTracks: () => studioTracks,
  submitForReviewSchema: () => submitForReviewSchema,
  subscriptions: () => subscriptions,
  supportTickets: () => supportTickets,
  syncLicenseInquiries: () => syncLicenseInquiries,
  syncLicenses: () => syncLicenses,
  syncPlacements: () => syncPlacements,
  syncSubmissions: () => syncSubmissions,
  systemLogs: () => systemLogs,
  systemMetrics: () => systemMetrics,
  systemSettings: () => systemSettings,
  takeGroups: () => takeGroups,
  takeLanes: () => takeLanes,
  takeSegments: () => takeSegments,
  taxForms: () => taxForms,
  taxTreatyRates: () => taxTreatyRates,
  toolostConnection: () => toolostConnection,
  upcRegistry: () => upcRegistry,
  updateMembershipTierSchema: () => updateMembershipTierSchema,
  updateStorefrontSchema: () => updateStorefrontSchema,
  updateWarpMarkerSchema: () => updateWarpMarkerSchema,
  userAchievements: () => userAchievements,
  userBrandVoices: () => userBrandVoices,
  userOnboarding: () => userOnboarding,
  userStorage: () => userStorage,
  userStorageFiles: () => userStorageFiles,
  userStreaks: () => userStreaks,
  userTasteProfiles: () => userTasteProfiles,
  users: () => users,
  venueContacts: () => venueContacts,
  warpMarkers: () => warpMarkers,
  workspaceAuditLog: () => workspaceAuditLog,
  workspaceCatalogs: () => workspaceCatalogs,
  workspaceInvitations: () => workspaceInvitations,
  workspaceMembers: () => workspaceMembers,
  workspaceRoles: () => workspaceRoles,
  workspaces: () => workspaces,
  youtubeConnections: () => youtubeConnections,
  youtubeUploads: () => youtubeUploads
});
import { sql as sql2, relations } from "drizzle-orm";
import {
  pgTable as pgTable2,
  text as text2,
  varchar as varchar2,
  timestamp as timestamp2,
  integer as integer2,
  boolean as boolean2,
  jsonb as jsonb2,
  real,
  date,
  bigint as bigint2,
  serial,
  index as index2,
  unique as unique2,
  check as check2,
  primaryKey as primaryKey2
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, insertUserSchema, sessions, pgSessions2, insertSessionSchema, analytics, insertAnalyticsSchema, subscriptions, insertSubscriptionSchema, projects, insertProjectSchema, studioTemplates, insertStudioTemplateSchema, studioRecentFiles, insertStudioRecentFileSchema, studioPinnedFolders, insertStudioPinnedFolderSchema, studioProjects, insertStudioProjectSchema, releases, insertReleaseSchema, campaigns, insertCampaignSchema, socialCampaigns, insertSocialCampaignSchema, storefronts, insertStorefrontSchema, updateStorefrontSchema, dnsRecordCache, insertDnsRecordCacheSchema, storefrontDomains, insertStorefrontDomainSchema, storefrontHosts, insertStorefrontHostSchema, dnsTemplates, insertDnsTemplateSchema, dnsProviderCredentials, insertDnsProviderCredentialsSchema, dnsZones, insertDnsZoneSchema, dnsZoneRecords, insertDnsZoneRecordSchema, membershipTiers, insertMembershipTierSchema, updateMembershipTierSchema, beats, beatMoneyLoopState, beatMoneyLoopCycles, hyperFollowPages, distroReleases, distroTracks, dspProviders, customerMemberships, insertCustomerMembershipSchema, statusPageIncidents, statusPageIncidentServices, dmcaNotices, dmcaStrikes, listings, insertListingSchema, listingLicenseTiers, storefrontFollows, storefrontLikes, storefrontRatings, beatLikes, licenseTemplates, storefrontOrders, contractTemplates, insertContractTemplateSchema, generatedContracts, marketplaceDisputes, insertMarketplaceDisputeSchema, statusPageIncidentUpdates, statusPageServices, storefrontTemplates, storefrontsRelations, legalHolds, isrcRegistry, statusPageSubscribers, upcRegistry, statusPageUptimeMetrics, catalogImportJobs, catalogImportRows, releaseWorkflowRequests, releaseVersionHistory, releaseScheduledActions, preSaveCampaigns, insertPreSaveCampaignSchema, preSaveEntries, insertPreSaveEntrySchema, distributionSLAMetrics, insertDistributionSLAMetricSchema, contentIdRegistrations, insertContentIdRegistrationSchema, syncLicenses, insertSyncLicenseSchema, syncLicenseInquiries, insertSyncLicenseInquirySchema, royaltySplits, insertRoyaltySplitSchema, royaltyTransactions, insertRoyaltyTransactionSchema, revenueEvents, recoupmentAccounts, splitContracts, dspRates, exchangeRates, projectRoyaltySplits, instantPayouts, refunds, insertRefundSchema, ledgerEntries, insertLedgerEntrySchema, taxForms, insertTaxFormSchema, royaltyStatements, royaltyDisputes, disputeMessages, invoices, insertInvoiceSchema, splitPayments, insertSplitPaymentSchema, kycDocuments, notifications, pushSubscriptions, supportTickets, insertSupportTicketSchema, securityThreats, insertSecurityThreatSchema, ipBlacklist, insertIpBlacklistSchema, posts, audioClips, midiClips, midiNotes, markers, pluginCatalog, workspaceAuditLog, insertWorkspaceAuditLogSchema, apiKeys, dspAnalytics, orders, kycVerifications, approvalHistory, scheduledPostBatches, compVersions, pluginInstances, stemExports, warpMarkers, insertWarpMarkerSchema, workspaceCatalogs, insertWorkspaceCatalogSchema, apiUsage, alertIncidents, dspUserPlatformStatus, dspSyncStatus, toolostConnection, youtubeConnections, youtubeUploads, emailEvents, requestInstantPayoutSchema, approvePostSchema, bulkSchedulePostSchema, takeGroups, pluginPresets, studioTracks, workspaceInvitations, insertWorkspaceInvitationSchema, alertRules, playlistAttributions, insertPlaylistAttributionSchema, emailMessages, rejectPostSchema, bulkValidatePostSchema, takeLanes, updateWarpMarkerSchema, workspaceMembers, insertWorkspaceMemberSchema, systemMetrics, listenerCohorts, submitForReviewSchema, socialAccounts, takeSegments, workspaceRoles, revenueForecasts, workspaces, insertWorkspaceSchema, approvalRequests, approvalSteps, approvalWorkflows, ssoConfigs, platformApiConfigs, adCampaigns, insertAdCampaignSchema, adCreatives, insertAdCreativeSchema, adDeliveryLogs, contentCalendar, insertContentCalendarSchema, aiModels, insertAiModelSchema, userBrandVoices, insertUserBrandVoiceSchema, inferenceRuns, insertInferenceRunSchema, hashtagResearch, insertHashtagResearchSchema, explanationLogs, insertExplanationLogSchema, bestPostingTimes, insertBestPostingTimeSchema, aiModelVersions, insertAiModelVersionSchema, userTasteProfiles, insertUserTasteProfileSchema, beatInteractions, insertBeatInteractionSchema, userStorage, insertUserStorageSchema, userStorageFiles, insertUserStorageFileSchema, beatDiscoveryScores, insertBeatDiscoveryScoreSchema, playlistJourneys, insertPlaylistJourneySchema, syncPlacements, insertSyncPlacementSchema, historicalAnalytics, insertHistoricalAnalyticSchema, arDiscoveries, insertArDiscoverySchema, platformDataSources, insertPlatformDataSourceSchema, globalRankings, insertGlobalRankingSchema, nlpQueryLogs, insertNlpQueryLogSchema, preSavePages, insertPreSavePageSchema, promoCards, insertPromoCardSchema, miniVideos, insertMiniVideoSchema, spotifyCanvases, insertSpotifyCanvasSchema, lyricsSyncs, insertLyricsSyncSchema, artistScores, insertArtistScoreSchema, marketplaceRecommendations, insertMarketplaceRecommendationSchema, beatPromotions, insertBeatPromotionSchema, bogoPromotions, insertBogoPromotionSchema, systemSettings, insertSystemSettingSchema, socialAutopilotContent, insertSocialAutopilotContentSchema, fanSegments, insertFanSegmentSchema, musicImpactMetrics, insertMusicImpactMetricSchema, socialPatternAggregates, insertSocialPatternAggregateSchema, generationArmStats, insertGenerationArmStatSchema, generationHistory, insertGenerationHistorySchema, organicAssets, insertOrganicAssetSchema, organicChannels, insertOrganicChannelSchema, organicRoiSnapshots, insertOrganicRoiSnapshotSchema, organicAssetLifetime, insertOrganicAssetLifetimeSchema, autopilotCrossInsights, insertAutopilotCrossInsightSchema, socialMentions, insertSocialMentionSchema, socialKeywords, insertSocialKeywordSchema, competitorProfiles, insertCompetitorProfileSchema, socialInboxMessages, insertSocialInboxMessageSchema, socialReplyTemplates, insertSocialReplyTemplateSchema, onboardingTasks, insertOnboardingTaskSchema, userOnboarding, insertUserOnboardingSchema, artistProgressSnapshots, insertArtistProgressSnapshotSchema, achievements, insertAchievementSchema, userAchievements, insertUserAchievementSchema, userStreaks, insertUserStreakSchema, careerCoachRecommendations, insertCareerCoachRecommendationSchema, careerGoals, insertCareerGoalSchema, emailPreferences, insertEmailPreferenceSchema, sentEmails, insertSentEmailSchema, artistConnections, insertArtistConnectionSchema, collaborationProjects, insertCollaborationProjectSchema, projectMembers, insertProjectMemberSchema, collabSnapshots, insertCollabSnapshotSchema, releaseCountdowns, insertReleaseCountdownSchema, countdownTasks, insertCountdownTaskSchema, countdownAnalytics, insertCountdownAnalyticSchema, autopilotLearningData, insertAutopilotLearningDataSchema, autopilotInsights, insertAutopilotInsightSchema, autopilotPreferences, insertAutopilotPreferenceSchema, systemLogs, insertSystemLogSchema, auditLogs, insertAuditLogSchema, splitSheets, insertSplitSheetSchema, batchTemplates, insertBatchTemplateSchema, shareLinks, insertShareLinkSchema, collaborationComments, insertCollaborationCommentSchema, collaborationVersions, insertCollaborationVersionSchema, collaborationAccessRequests, insertCollaborationAccessRequestSchema, searchHistory, filterPresets, musicWorkflowAutomations, musicWorkflowExecutionLogs, artistProfiles, insertArtistProfileSchema, artistProfileReleases, profileClaimPipeline, profileClaimEvents, artistIdentityLinks, artistDnaSnapshots, profileSplitEvents, distributorHistoryImports, insertTakeGroupSchema, insertPluginPresetSchema, insertStudioTrackSchema, insertAlertRuleSchema, insertEmailMessageSchema, insertTakeLaneSchema, insertSystemMetricSchema, insertListenerCohortSchema, insertSocialAccountSchema, insertTakeSegmentSchema, insertWorkspaceRoleSchema, insertRevenueForecastSchema, insertApprovalRequestSchema, insertApprovalStepSchema, insertApprovalWorkflowSchema, insertSsoConfigSchema, fabricPockets, fabricVolumes, fabricStorageNodes, fabricObjects, fabricChunks, fabricCatalogFence, fabricObjectDependencies, fabricDeletionObjects, fabricDeletionChunks, fabricMigrationJobs, insertFabricPocketSchema, insertFabricVolumeSchema, insertFabricStorageNodeSchema, insertFabricObjectSchema, insertFabricChunkSchema, customerHealthScores, insertCustomerHealthScoreSchema, npsResponses, insertNpsResponseSchema, cancellationFeedback, insertCancellationFeedbackSchema, featureEvents, insertFeatureEventSchema, dunningState, insertDunningStateSchema, fanSubscribers, fanMessages, insertFanSubscriberSchema, insertFanMessageSchema, pressKits, insertPressKitSchema, playlistPitches, insertPlaylistPitchSchema, shows, setlists, insertShowSchema, insertSetlistSchema, merchItems, merchOrders, insertMerchItemSchema, insertMerchOrderSchema, syncSubmissions, insertSyncSubmissionSchema, publishingRights, insertPublishingRightSchema, labelSubmissions, insertLabelSubmissionSchema, radioPitches, insertRadioPitchSchema, venueContacts, insertVenueContactSchema, projectBudgets, insertProjectBudgetSchema, budgetLineItems, insertBudgetLineItemSchema, sampleClearances, insertSampleClearanceSchema, musicVideoProductions, insertMusicVideoProductionSchema, songwritingSessions, insertSongwritingSessionSchema, fanCampaigns, insertFanCampaignSchema, customWorkflows, insertCustomWorkflowSchema, jwtTokens, insertJwtTokenSchema, refreshTokens, insertRefreshTokenSchema, assistantConversations, insertAssistantConversationSchema, assistantMessages, insertAssistantMessageSchema, platformRoyaltyRates, insertPlatformRoyaltyRateSchema, taxTreatyRates, insertTaxTreatyRateSchema, studioSamples, insertStudioSampleSchema, labelSettings, insertLabelSettingSchema, listingStems, insertListingStemSchema, mobileDeviceTokens, insertMobileDeviceTokenSchema, claimedDomains, insertClaimedDomainSchema, domainContacts, insertDomainContactSchema, domainEvents, insertDomainEventSchema, dnssecKeys, insertDnssecKeySchema, hnsAuctions, insertHnsAuctionSchema, fanWallets, fanCreditTransactions, insertFanCreditTransactionSchema, fanLoyaltyConfigs, insertFanLoyaltyConfigSchema, outreachCampaigns, insertOutreachCampaignSchema, outreachPitches, insertOutreachPitchSchema, beatPricingSnapshots, insertBeatPricingSnapshotSchema, hybridStorageFiles, hybridStorageImports, socialMediaJobs;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    init_readiness_schema();
    users = pgTable2(
      "users",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        email: text2("email").notNull().unique(),
        username: text2("username").unique(),
        password: text2("password").notNull(),
        firstName: text2("first_name"),
        lastName: text2("last_name"),
        artistName: text2("artist_name"),
        bio: text2("bio"),
        website: text2("website"),
        location: text2("location"),
        avatarUrl: text2("avatar_url"),
        profileImageUrl: text2("profile_image_url"),
        socialLinks: jsonb2("social_links"),
        role: text2("role").default("user"),
        subscriptionTier: text2("subscription_tier"),
        subscriptionStatus: text2("subscription_status"),
        stripeCustomerId: text2("stripe_customer_id"),
        stripeConnectedAccountId: text2("stripe_connected_account_id"),
        stripeSubscriptionId: text2("stripe_subscription_id"),
        subscriptionEndsAt: timestamp2("subscription_ends_at"),
        trialEndsAt: timestamp2("trial_ends_at"),
        onboardingCompleted: boolean2("onboarding_completed").default(false),
        onboardingStep: integer2("onboarding_step").default(0),
        onboardingData: jsonb2("onboarding_data"),
        preferences: jsonb2("preferences"),
        notificationSettings: jsonb2("notification_settings"),
        twoFactorSecret: text2("two_factor_secret"),
        twoFactorEnabled: boolean2("two_factor_enabled").default(false),
        passwordResetToken: text2("password_reset_token"),
        passwordResetExpires: timestamp2("password_reset_expires"),
        googleId: text2("google_id"),
        emailVerified: boolean2("email_verified").default(false),
        emailVerificationToken: text2("email_verification_token"),
        emailVerificationExpires: timestamp2("email_verification_expires"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (table) => ({
        passwordResetTokenIdx: index2("users_password_reset_token_idx").on(
          table.passwordResetToken
        ),
        googleIdIdx: index2("users_google_id_idx").on(table.googleId),
        stripeCustomerIdIdx: index2("users_stripe_customer_id_idx").on(
          table.stripeCustomerId
        )
      })
    );
    insertUserSchema = createInsertSchema(users).pick({
      email: true,
      username: true,
      password: true,
      firstName: true,
      lastName: true,
      googleId: true
    });
    sessions = pgTable2(
      "sessions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        sessionToken: text2("session_token").unique(),
        ipAddress: text2("ip_address"),
        userAgent: text2("user_agent"),
        trusted: boolean2("trusted").default(false),
        lastActivity: timestamp2("last_activity").defaultNow(),
        expiresAt: timestamp2("expires_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("sessions_user_id_last_activity_idx").on(t.userId, t.lastActivity)
      ]
    );
    pgSessions2 = pgTable2(
      "pg_sessions",
      {
        sid: text2("sid").primaryKey(),
        sess: text2("sess").notNull(),
        expire: bigint2("expire", { mode: "number" }).notNull()
      },
      (t) => [index2("pg_sessions_expire_idx").on(t.expire)]
    );
    insertSessionSchema = createInsertSchema(sessions).omit({
      id: true,
      createdAt: true
    });
    analytics = pgTable2(
      "analytics",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        date: timestamp2("date").notNull().defaultNow(),
        streams: integer2("streams").default(0),
        revenue: real("revenue").default(0),
        totalListeners: integer2("total_listeners").default(0),
        followers: integer2("followers").default(0),
        platform: text2("platform"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        // Composite index used by time-range analytics queries (most common access pattern).
        index2("analytics_user_id_date_idx").on(t.userId, t.date),
        // Secondary index for platform-filtered aggregations.
        index2("analytics_user_id_platform_idx").on(t.userId, t.platform)
      ]
    );
    insertAnalyticsSchema = createInsertSchema(analytics).omit({
      id: true,
      createdAt: true
    });
    subscriptions = pgTable2(
      "subscriptions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        stripeSubscriptionId: text2("stripe_subscription_id"),
        plan: text2("plan").notNull(),
        status: text2("status").notNull(),
        currentPeriodStart: timestamp2("current_period_start"),
        currentPeriodEnd: timestamp2("current_period_end"),
        canceledAt: timestamp2("canceled_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [index2("subscriptions_user_id_idx").on(t.userId)]
    );
    insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
      id: true,
      createdAt: true
    });
    projects = pgTable2(
      "projects",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        title: text2("title").notNull(),
        description: text2("description"),
        genre: text2("genre"),
        bpm: integer2("bpm"),
        key: text2("key"),
        status: text2("status").default("draft"),
        workflowStage: text2("workflow_stage").default("setup"),
        isStudioProject: boolean2("is_studio_project").default(false),
        metadata: jsonb2("metadata"),
        favorite: boolean2("favorite").default(false),
        lastOpenedAt: timestamp2("last_opened_at"),
        coverImageUrl: text2("cover_image_url"),
        audioUrl: text2("audio_url"),
        fileSize: integer2("file_size"),
        duration: integer2("duration"),
        tags: jsonb2("tags").$type(),
        timeSignature: text2("time_signature").default("4/4"),
        sampleRate: integer2("sample_rate").default(44100),
        bitDepth: integer2("bit_depth").default(24),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        // Supports the default project listing query: WHERE user_id = ? ORDER BY updated_at DESC.
        index2("projects_user_id_updated_at_idx").on(t.userId, t.updatedAt)
      ]
    );
    insertProjectSchema = createInsertSchema(projects).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    studioTemplates = pgTable2(
      "studio_templates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id"),
        name: text2("name").notNull(),
        description: text2("description"),
        category: text2("category").default("user"),
        genre: text2("genre"),
        bpm: integer2("bpm").default(120),
        timeSignature: text2("time_signature").default("4/4"),
        trackCount: integer2("track_count").default(0),
        templateData: jsonb2("template_data"),
        coverImageUrl: text2("cover_image_url"),
        isBuiltIn: boolean2("is_built_in").default(false),
        usageCount: integer2("usage_count").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdCategoryIdx: index2("studio_templates_user_id_category_idx").on(
          t.userId,
          t.category
        ),
        isBuiltInIdx: index2("studio_templates_is_built_in_idx").on(t.isBuiltIn)
      })
    );
    insertStudioTemplateSchema = createInsertSchema(
      studioTemplates
    ).omit({ id: true, createdAt: true, updatedAt: true });
    studioRecentFiles = pgTable2(
      "studio_recent_files",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        projectId: varchar2("project_id"),
        fileName: text2("file_name").notNull(),
        filePath: text2("file_path").notNull(),
        fileType: text2("file_type").default("audio"),
        accessedAt: timestamp2("accessed_at").defaultNow(),
        metadata: jsonb2("metadata")
      },
      (t) => ({
        userIdAccessedAtIdx: index2(
          "studio_recent_files_user_id_accessed_at_idx"
        ).on(t.userId, t.accessedAt)
      })
    );
    insertStudioRecentFileSchema = createInsertSchema(
      studioRecentFiles
    ).omit({ id: true, accessedAt: true });
    studioPinnedFolders = pgTable2(
      "studio_pinned_folders",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        path: text2("path").notNull(),
        sortOrder: integer2("sort_order").default(0),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdIdx: index2("studio_pinned_folders_user_id_idx").on(t.userId)
      })
    );
    insertStudioPinnedFolderSchema = createInsertSchema(
      studioPinnedFolders
    ).omit({ id: true, createdAt: true });
    studioProjects = pgTable2(
      "studio_projects",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull().default("Untitled"),
        title: text2("title"),
        description: text2("description"),
        genre: text2("genre"),
        bpm: integer2("bpm").default(120),
        key: text2("key"),
        timeSignature: text2("time_signature").default("4/4"),
        sampleRate: integer2("sample_rate").default(44100),
        bitDepth: integer2("bit_depth").default(24),
        metadata: jsonb2("metadata"),
        mixBusConfig: jsonb2("mix_bus_config"),
        masterSettings: jsonb2("master_settings"),
        automationData: jsonb2("automation_data"),
        markerData: jsonb2("marker_data"),
        isTemplate: boolean2("is_template").default(false),
        templateId: varchar2("template_id"),
        status: text2("status").default("active"),
        lastSavedAt: timestamp2("last_saved_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdUpdatedAtIdx: index2("studio_projects_user_id_updated_at_idx").on(
          t.userId,
          t.updatedAt
        ),
        userIdStatusIdx: index2("studio_projects_user_id_status_idx").on(
          t.userId,
          t.status
        )
      })
    );
    insertStudioProjectSchema = createInsertSchema(
      studioProjects
    ).omit({ id: true, createdAt: true, updatedAt: true });
    releases = pgTable2(
      "releases",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        artistId: varchar2("artist_id"),
        title: text2("title").notNull(),
        releaseDate: timestamp2("release_date"),
        status: text2("status").default("draft"),
        upc: text2("upc"),
        artworkUrl: text2("artwork_url"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        // Supports the default release listing query: WHERE user_id = ? ORDER BY created_at DESC.
        index2("releases_user_id_created_at_idx").on(t.userId, t.createdAt)
      ]
    );
    insertReleaseSchema = createInsertSchema(releases).omit({
      id: true,
      createdAt: true
    });
    campaigns = pgTable2(
      "campaigns",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        platform: text2("platform"),
        status: text2("status").default("draft"),
        budget: real("budget"),
        spent: real("spent").default(0),
        impressions: integer2("impressions").default(0),
        clicks: integer2("clicks").default(0),
        conversions: integer2("conversions").default(0),
        startDate: timestamp2("start_date"),
        endDate: timestamp2("end_date"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdStatusIdx: index2("campaigns_user_id_status_idx").on(
          t.userId,
          t.status
        ),
        userIdCreatedAtIdx: index2("campaigns_user_id_created_at_idx").on(
          t.userId,
          t.createdAt
        )
      })
    );
    insertCampaignSchema = createInsertSchema(campaigns).omit({
      id: true,
      createdAt: true
    });
    socialCampaigns = pgTable2(
      "social_campaigns",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        platform: text2("platform").notNull(),
        content: text2("content"),
        status: text2("status").default("scheduled"),
        scheduledAt: timestamp2("scheduled_at"),
        publishedAt: timestamp2("published_at"),
        mediaUrls: text2("media_urls").array(),
        engagement: jsonb2("engagement"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdStatusIdx: index2("social_campaigns_user_id_status_idx").on(
          t.userId,
          t.status
        ),
        userIdScheduledAtIdx: index2("social_campaigns_user_id_scheduled_at_idx").on(
          t.userId,
          t.scheduledAt
        )
      })
    );
    insertSocialCampaignSchema = createInsertSchema(
      socialCampaigns
    ).omit({ id: true, createdAt: true });
    storefronts = pgTable2(
      "storefronts",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        slug: text2("slug").notNull().unique(),
        subdomain: text2("subdomain").unique(),
        customDomain: text2("custom_domain").unique(),
        isSubdomainActive: boolean2("is_subdomain_active").default(false),
        isCustomDomainActive: boolean2("is_custom_domain_active").default(false),
        templateId: text2("template_id"),
        customization: jsonb2("customization"),
        seo: jsonb2("seo"),
        isActive: boolean2("is_active").default(true),
        isPublic: boolean2("is_public").default(true),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdIdx: index2("storefronts_user_id_idx").on(t.userId),
        isActiveIsPublicIdx: index2("storefronts_is_active_is_public_idx").on(
          t.isActive,
          t.isPublic
        )
      })
    );
    insertStorefrontSchema = createInsertSchema(storefronts).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    updateStorefrontSchema = insertStorefrontSchema.partial();
    dnsRecordCache = pgTable2(
      "dns_record_cache",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        storefrontId: varchar2("storefront_id").notNull(),
        domain: text2("domain").notNull(),
        provider: text2("provider").notNull().default("godaddy"),
        recordType: text2("record_type").notNull(),
        name: text2("name").notNull(),
        value: text2("value").notNull(),
        ttl: integer2("ttl").default(3600),
        priority: integer2("priority"),
        isLocal: boolean2("is_local").default(false),
        lastSyncedAt: timestamp2("last_synced_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        storefrontIdDomainIdx: index2(
          "dns_record_cache_storefront_id_domain_idx"
        ).on(t.storefrontId, t.domain),
        domainRecordTypeIdx: index2("dns_record_cache_domain_record_type_idx").on(
          t.domain,
          t.recordType
        )
      })
    );
    insertDnsRecordCacheSchema = createInsertSchema(
      dnsRecordCache
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    storefrontDomains = pgTable2(
      "storefront_domains",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        storefrontId: varchar2("storefront_id").notNull(),
        domain: text2("domain").notNull().unique(),
        type: text2("type").notNull(),
        // 'managed_subdomain' | 'custom_domain'
        status: text2("status").notNull().default("pending"),
        // 'pending' | 'active' | 'verification_failed' | 'disabled'
        isPrimary: boolean2("is_primary").default(false),
        verificationToken: text2("verification_token"),
        // FK to the built-in DNS zone (set when Max Booster becomes authoritative for this domain)
        dnsZoneId: varchar2("dns_zone_id"),
        // Tracks how many consecutive verification failures have occurred
        verificationFailures: integer2("verification_failures").default(0),
        // When the domain was last successfully verified
        verifiedAt: timestamp2("verified_at"),
        // Flexible JSONB bag for health-sweep counters and other runtime metadata
        // (e.g. { healthFailures: 2 }).  Kept separate from structured columns so
        // the schema doesn't need a migration every time a new counter is added.
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        storefrontIdStatusIdx: index2(
          "storefront_domains_storefront_id_status_idx"
        ).on(t.storefrontId, t.status),
        storefrontIdIsPrimaryIdx: index2(
          "storefront_domains_storefront_id_is_primary_idx"
        ).on(t.storefrontId, t.isPrimary)
      })
    );
    insertStorefrontDomainSchema = createInsertSchema(
      storefrontDomains
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    storefrontHosts = pgTable2("storefront_hosts", {
      host: text2("host").primaryKey(),
      // 'artist.com', 'shop.artist.com', 'slug.maxbooster.app'
      storefrontId: varchar2("storefront_id").notNull(),
      // SSL certificate lifecycle: 'pending' | 'issued' | 'failed' | 'renewing'
      certStatus: text2("cert_status").notNull().default("pending"),
      certIssuedAt: timestamp2("cert_issued_at"),
      certExpiresAt: timestamp2("cert_expires_at"),
      // ACME-issued certificate material (set when cert_status = 'issued').
      // Private key is AES-256-GCM encrypted via acmeClient.encryptKey().
      certPem: text2("cert_pem"),
      certKeyEncrypted: text2("cert_key_encrypted"),
      certChainPem: text2("cert_chain_pem"),
      certSerial: text2("cert_serial"),
      certProvisionAttempts: integer2("cert_provision_attempts").notNull().default(0),
      certLastError: text2("cert_last_error"),
      certLastAttemptAt: timestamp2("cert_last_attempt_at"),
      certRenewalAfter: timestamp2("cert_renewal_after"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertStorefrontHostSchema = createInsertSchema(
      storefrontHosts
    ).omit({
      createdAt: true,
      updatedAt: true
    });
    dnsTemplates = pgTable2(
      "dns_templates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        description: text2("description"),
        records: jsonb2("records").notNull(),
        isGlobal: boolean2("is_global").default(false),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdIsGlobalIdx: index2("dns_templates_user_id_is_global_idx").on(
          t.userId,
          t.isGlobal
        )
      })
    );
    insertDnsTemplateSchema = createInsertSchema(dnsTemplates).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    dnsProviderCredentials = pgTable2(
      "dns_provider_credentials",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        provider: text2("provider").notNull(),
        domain: text2("domain").notNull(),
        credentials: jsonb2("credentials").notNull(),
        isVerified: boolean2("is_verified").default(false),
        lastUsedAt: timestamp2("last_used_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdProviderIdx: index2("dns_provider_creds_user_id_provider_idx").on(
          t.userId,
          t.provider
        )
      })
    );
    insertDnsProviderCredentialsSchema = createInsertSchema(
      dnsProviderCredentials
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    dnsZones = pgTable2(
      "dns_zones",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        domain: text2("domain").notNull().unique(),
        status: text2("status").notNull().default("pending"),
        // 'pending' | 'active' | 'suspended'
        verificationToken: text2("verification_token").default(
          sql2`gen_random_uuid()`
        ),
        isVerified: boolean2("is_verified").default(false),
        nameserver1: text2("nameserver1").default("ns1.max-booster.com"),
        nameserver2: text2("nameserver2").default("ns2.max-booster.com"),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdStatusIdx: index2("dns_zones_user_id_status_idx").on(
          t.userId,
          t.status
        ),
        isVerifiedIdx: index2("dns_zones_is_verified_idx").on(t.isVerified)
      })
    );
    insertDnsZoneSchema = createInsertSchema(dnsZones).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    dnsZoneRecords = pgTable2(
      "dns_zone_records",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        zoneId: varchar2("zone_id").notNull(),
        userId: varchar2("user_id").notNull(),
        domain: text2("domain").notNull(),
        type: text2("type").notNull(),
        // A, AAAA, CNAME, MX, TXT, NS, SRV, CAA
        name: text2("name").notNull(),
        // '@' for root, 'www', 'mail', etc.
        value: text2("value").notNull(),
        ttl: integer2("ttl").default(3600),
        priority: integer2("priority"),
        weight: integer2("weight"),
        port: integer2("port"),
        tag: text2("tag"),
        // for CAA records
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        zoneIdTypeIdx: index2("dns_zone_records_zone_id_type_idx").on(
          t.zoneId,
          t.type
        ),
        userIdIdx: index2("dns_zone_records_user_id_idx").on(t.userId),
        domainTypeIdx: index2("dns_zone_records_domain_type_idx").on(
          t.domain,
          t.type
        )
      })
    );
    insertDnsZoneRecordSchema = createInsertSchema(
      dnsZoneRecords
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    membershipTiers = pgTable2(
      "membership_tiers",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        storefrontId: varchar2("storefront_id").notNull(),
        name: text2("name").notNull(),
        description: text2("description"),
        priceCents: integer2("price_cents").notNull(),
        currency: text2("currency").default("usd"),
        interval: text2("interval").notNull(),
        benefits: jsonb2("benefits"),
        maxSubscribers: integer2("max_subscribers"),
        currentSubscribers: integer2("current_subscribers").default(0),
        isActive: boolean2("is_active").default(true),
        sortOrder: integer2("sort_order").default(0),
        stripePriceId: text2("stripe_price_id"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        storefrontIdIsActiveIdx: index2(
          "membership_tiers_storefront_id_is_active_idx"
        ).on(t.storefrontId, t.isActive)
      })
    );
    insertMembershipTierSchema = createInsertSchema(
      membershipTiers
    ).pick({
      storefrontId: true,
      name: true,
      description: true,
      priceCents: true,
      currency: true,
      interval: true,
      benefits: true,
      maxSubscribers: true
    });
    updateMembershipTierSchema = insertMembershipTierSchema.partial();
    beats = pgTable2(
      "beats",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        title: text2("title").notNull(),
        description: text2("description"),
        price: real("price").notNull(),
        genre: text2("genre"),
        bpm: integer2("bpm"),
        key: text2("key"),
        audioUrl: text2("audio_url"),
        artworkUrl: text2("artwork_url"),
        licenseType: text2("license_type").default("basic"),
        tags: text2("tags").array(),
        isPublished: boolean2("is_published").default(false),
        plays: integer2("plays").default(0),
        downloads: integer2("downloads").default(0),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdIsPublishedIdx: index2("beats_user_id_is_published_idx").on(
          t.userId,
          t.isPublished
        ),
        isPublishedCreatedAtIdx: index2("beats_is_published_created_at_idx").on(
          t.isPublished,
          t.createdAt
        ),
        genreIsPublishedIdx: index2("beats_genre_is_published_idx").on(
          t.genre,
          t.isPublished
        )
      })
    );
    beatMoneyLoopState = pgTable2("beat_money_loop_state", {
      id: text2("id").primaryKey().default("singleton"),
      enabled: boolean2("enabled").default(false).notNull(),
      nextRunAt: timestamp2("next_run_at"),
      lastCycleAt: timestamp2("last_cycle_at"),
      totalCycles: integer2("total_cycles").default(0).notNull(),
      successfulCycles: integer2("successful_cycles").default(0).notNull(),
      failedCycles: integer2("failed_cycles").default(0).notNull(),
      totalRevenueCents: integer2("total_revenue_cents").default(0).notNull(),
      consecutiveFailures: integer2("consecutive_failures").default(0).notNull(),
      currentCadenceMs: integer2("current_cadence_ms").default(144e5).notNull(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    beatMoneyLoopCycles = pgTable2(
      "beat_money_loop_cycles",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        triggeredBy: text2("triggered_by").notNull(),
        // 'schedule' | 'manual'
        status: text2("status").default("pending").notNull(),
        // pending|generating|uploading|advertising|awaiting_sale|sold|failed; completed/listed are historical
        scanContext: jsonb2("scan_context"),
        // { genre, mood, tempo, confidence, hooks }
        audioGenBackend: text2("audio_gen_backend"),
        // 'ts-native' | 'maxcore' | 'audio-synth-v2'
        beatId: varchar2("beat_id"),
        // → beats.id (no FK so the row survives if beat is deleted)
        beatTitle: text2("beat_title"),
        price: real("price"),
        campaignId: varchar2("campaign_id"),
        errorMessage: text2("error_message"),
        plays: integer2("plays").default(0).notNull(),
        downloads: integer2("downloads").default(0).notNull(),
        revenueCents: integer2("revenue_cents").default(0).notNull(),
        durationMs: integer2("duration_ms"),
        startedAt: timestamp2("started_at").defaultNow().notNull(),
        completedAt: timestamp2("completed_at")
      },
      (t) => ({
        statusStartedAtIdx: index2("bml_cycles_status_started_at_idx").on(
          t.status,
          t.startedAt
        ),
        startedAtIdx: index2("bml_cycles_started_at_idx").on(t.startedAt)
      })
    );
    hyperFollowPages = pgTable2(
      "hyperfollow_pages",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        title: text2("title").notNull(),
        slug: text2("slug").notNull().unique(),
        imageUrl: text2("image_url"),
        links: jsonb2("links"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdCreatedAtIdx: index2("hyperfollow_pages_user_id_created_at_idx").on(
          t.userId,
          t.createdAt
        )
      })
    );
    distroReleases = pgTable2(
      "distro_releases",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        artistId: varchar2("artist_id").notNull(),
        title: text2("title").notNull(),
        releaseDate: timestamp2("release_date"),
        status: text2("status").default("draft"),
        artworkUrl: text2("artwork_url"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        artistIdStatusIdx: index2("distro_releases_artist_id_status_idx").on(
          t.artistId,
          t.status
        ),
        artistIdCreatedAtIdx: index2("distro_releases_artist_id_created_at_idx").on(
          t.artistId,
          t.createdAt
        )
      })
    );
    distroTracks = pgTable2(
      "distro_tracks",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        title: text2("title").notNull(),
        trackNumber: integer2("track_number").notNull(),
        isrc: text2("isrc"),
        audioUrl: text2("audio_url"),
        duration: integer2("duration"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        releaseIdTrackNumberIdx: index2(
          "distro_tracks_release_id_track_number_idx"
        ).on(t.releaseId, t.trackNumber)
      })
    );
    dspProviders = pgTable2("dsp_providers", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      slug: text2("slug").notNull().unique(),
      logoUrl: text2("logo_url"),
      isActive: boolean2("is_active").default(true),
      metadata: jsonb2("metadata")
    });
    customerMemberships = pgTable2(
      "customer_memberships",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        customerId: varchar2("customer_id").notNull(),
        tierId: varchar2("tier_id").notNull(),
        storefrontId: varchar2("storefront_id").notNull(),
        stripeSubscriptionId: text2("stripe_subscription_id"),
        status: text2("status").default("active"),
        startDate: timestamp2("start_date").defaultNow(),
        endDate: timestamp2("end_date"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        customerIdStorefrontIdIdx: index2(
          "customer_memberships_customer_id_storefront_id_idx"
        ).on(t.customerId, t.storefrontId),
        storefrontIdStatusIdx: index2(
          "customer_memberships_storefront_id_status_idx"
        ).on(t.storefrontId, t.status),
        customerIdStatusIdx: index2(
          "customer_memberships_customer_id_status_idx"
        ).on(t.customerId, t.status)
      })
    );
    insertCustomerMembershipSchema = createInsertSchema(
      customerMemberships
    ).pick({
      customerId: true,
      tierId: true,
      storefrontId: true,
      stripeSubscriptionId: true,
      status: true
    });
    statusPageIncidents = pgTable2("status_page_incidents", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      title: text2("title").notNull(),
      description: text2("description"),
      status: text2("status").default("investigating"),
      severity: text2("severity").default("minor"),
      startedAt: timestamp2("started_at").defaultNow(),
      resolvedAt: timestamp2("resolved_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    statusPageIncidentServices = pgTable2(
      "status_page_incident_services",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        incidentId: varchar2("incident_id").notNull(),
        serviceName: text2("service_name").notNull(),
        status: text2("status").default("degraded"),
        createdAt: timestamp2("created_at").defaultNow()
      }
    );
    dmcaNotices = pgTable2(
      "dmca_notices",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        type: text2("type").notNull().default("takedown"),
        contentType: text2("content_type").notNull(),
        contentId: varchar2("content_id").notNull(),
        contentOwnerId: varchar2("content_owner_id"),
        claimantName: text2("claimant_name").notNull(),
        claimantEmail: text2("claimant_email").notNull(),
        claimantAddress: text2("claimant_address"),
        claimantPhone: text2("claimant_phone"),
        originalWorkUrl: text2("original_work_url"),
        originalWorkDescription: text2("original_work_description"),
        infringingUrl: text2("infringing_url"),
        signature: text2("signature"),
        goodFaithStatement: boolean2("good_faith_statement"),
        accuracyStatement: boolean2("accuracy_statement"),
        perjuryStatement: boolean2("perjury_statement"),
        description: text2("description"),
        status: text2("status").default("pending"),
        relatedNoticeId: varchar2("related_notice_id"),
        counterNoticeReason: text2("counter_notice_reason"),
        counterNoticeEmailState: text2("counter_notice_email_state").notNull().default("not_attempted"),
        counterNoticeEmailMessageId: text2("counter_notice_email_message_id"),
        counterNoticeEmailAttemptedAt: timestamp2("counter_notice_email_attempted_at"),
        submittedAt: timestamp2("submitted_at").defaultNow(),
        processedAt: timestamp2("processed_at"),
        processedBy: varchar2("processed_by"),
        adminNotes: text2("admin_notes"),
        resolvedAt: timestamp2("resolved_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        contentOwnerIdIdx: index2("dmca_notices_content_owner_id_idx").on(t.contentOwnerId),
        relatedNoticeIdIdx: index2("dmca_notices_related_notice_id_idx").on(t.relatedNoticeId)
      })
    );
    dmcaStrikes = pgTable2(
      "dmca_strikes",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        noticeId: varchar2("notice_id"),
        contentType: text2("content_type").notNull(),
        contentId: varchar2("content_id").notNull(),
        reason: text2("reason"),
        strikeNumber: integer2("strike_number"),
        isActive: boolean2("is_active").notNull().default(true),
        revokedAt: timestamp2("revoked_at"),
        revokedBy: varchar2("revoked_by"),
        revokeReason: text2("revoke_reason"),
        expiresAt: timestamp2("expires_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdCreatedAtIdx: index2("dmca_strikes_user_id_created_at_idx").on(
          t.userId,
          t.createdAt
        ),
        contentIdContentTypeIdx: index2(
          "dmca_strikes_content_id_content_type_idx"
        ).on(t.contentId, t.contentType)
      })
    );
    listings = pgTable2(
      "listings",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        storefrontId: varchar2("storefront_id"),
        title: text2("title").notNull(),
        description: text2("description"),
        priceCents: integer2("price_cents").notNull(),
        currency: text2("currency").default("usd"),
        listingType: text2("listing_type").default("one_time"),
        category: text2("category"),
        audioUrl: text2("audio_url"),
        artworkUrl: text2("artwork_url"),
        previewUrl: text2("preview_url"),
        isPublished: boolean2("is_published").default(false),
        discountPercent: integer2("discount_percent"),
        discountPriceCents: integer2("discount_price_cents"),
        discountExpiresAt: timestamp2("discount_expires_at"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdStorefrontIdIdx: index2("listings_user_id_storefront_id_idx").on(
          t.userId,
          t.storefrontId
        ),
        storefrontIdIsPublishedIdx: index2(
          "listings_storefront_id_is_published_idx"
        ).on(t.storefrontId, t.isPublished),
        isPublishedCategoryIdx: index2("listings_is_published_category_idx").on(
          t.isPublished,
          t.category
        ),
        userIdIsPublishedIdx: index2("listings_user_id_is_published_idx").on(
          t.userId,
          t.isPublished
        )
      })
    );
    insertListingSchema = createInsertSchema(listings).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    listingLicenseTiers = pgTable2(
      "listing_license_tiers",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        listingId: varchar2("listing_id").notNull(),
        licenseType: text2("license_type").notNull(),
        label: text2("label"),
        priceCents: integer2("price_cents").notNull(),
        discountType: text2("discount_type").default("none"),
        discountPercent: integer2("discount_percent"),
        discountPriceCents: integer2("discount_price_cents"),
        discountExpiresAt: timestamp2("discount_expires_at"),
        bogoEnabled: boolean2("bogo_enabled").default(false),
        bogoGetType: text2("bogo_get_type"),
        bogoGetPercent: integer2("bogo_get_percent").default(100),
        fileFormats: text2("file_formats").array(),
        audioUrls: jsonb2("audio_urls"),
        isActive: boolean2("is_active").default(true),
        sortOrder: integer2("sort_order").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        listingIdIsActiveIdx: index2(
          "listing_license_tiers_listing_id_is_active_idx"
        ).on(t.listingId, t.isActive)
      })
    );
    storefrontFollows = pgTable2(
      "storefront_follows",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        storefrontId: varchar2("storefront_id").notNull(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdStorefrontIdIdx: index2(
          "storefront_follows_user_id_storefront_id_idx"
        ).on(t.userId, t.storefrontId),
        storefrontIdIdx: index2("storefront_follows_storefront_id_idx").on(
          t.storefrontId
        )
      })
    );
    storefrontLikes = pgTable2(
      "storefront_likes",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        storefrontId: varchar2("storefront_id").notNull(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdStorefrontIdIdx: index2(
          "storefront_likes_user_id_storefront_id_idx"
        ).on(t.userId, t.storefrontId),
        storefrontIdIdx: index2("storefront_likes_storefront_id_idx").on(
          t.storefrontId
        )
      })
    );
    storefrontRatings = pgTable2(
      "storefront_ratings",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        storefrontId: varchar2("storefront_id").notNull(),
        rating: integer2("rating").notNull(),
        review: text2("review"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdStorefrontIdIdx: index2(
          "storefront_ratings_user_id_storefront_id_idx"
        ).on(t.userId, t.storefrontId),
        storefrontIdIdx: index2("storefront_ratings_storefront_id_idx").on(
          t.storefrontId
        )
      })
    );
    beatLikes = pgTable2(
      "beat_likes",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        beatId: varchar2("beat_id").notNull(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdBeatIdIdx: index2("beat_likes_user_id_beat_id_idx").on(
          t.userId,
          t.beatId
        ),
        beatIdIdx: index2("beat_likes_beat_id_idx").on(t.beatId)
      })
    );
    licenseTemplates = pgTable2(
      "license_templates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        type: text2("type").notNull().default("basic"),
        priceCents: integer2("price_cents").notNull().default(2999),
        streams: text2("streams").default("100000"),
        copies: text2("copies").default("5000"),
        musicVideos: text2("music_videos").default("1"),
        duration: text2("duration").default("1 year"),
        allowsBroadcast: boolean2("allows_broadcast").default(false),
        allowsProfit: boolean2("allows_profit").default(true),
        allowsSync: boolean2("allows_sync").default(false),
        fileFormats: text2("file_formats").default("MP3"),
        isActive: boolean2("is_active").default(true),
        sortOrder: integer2("sort_order").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdIsActiveIdx: index2("license_templates_user_id_is_active_idx").on(
          t.userId,
          t.isActive
        ),
        userIdTypeIdx: index2("license_templates_user_id_type_idx").on(
          t.userId,
          t.type
        )
      })
    );
    storefrontOrders = pgTable2(
      "storefront_orders",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        buyerId: varchar2("buyer_id").notNull(),
        storefrontId: varchar2("storefront_id").notNull(),
        sellerId: varchar2("seller_id").notNull(),
        listingId: varchar2("listing_id").notNull(),
        licenseType: text2("license_type").default("basic"),
        amountCents: integer2("amount_cents").notNull(),
        currency: text2("currency").default("usd"),
        status: text2("status").default("pending"),
        stripeSessionId: text2("stripe_session_id"),
        stripePaymentIntentId: text2("stripe_payment_intent_id"),
        appliedPromotionId: varchar2("applied_promotion_id"),
        discountCents: integer2("discount_cents").default(0),
        isFreeItem: boolean2("is_free_item").default(false),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        buyerIdStatusIdx: index2("storefront_orders_buyer_id_status_idx").on(
          t.buyerId,
          t.status
        ),
        storefrontIdStatusCreatedAtIdx: index2(
          "storefront_orders_storefront_id_status_created_at_idx"
        ).on(t.storefrontId, t.status, t.createdAt),
        sellerIdStatusIdx: index2("storefront_orders_seller_id_status_idx").on(
          t.sellerId,
          t.status
        ),
        listingIdIdx: index2("storefront_orders_listing_id_idx").on(t.listingId),
        stripeSessionIdIdx: index2("storefront_orders_stripe_session_id_idx").on(
          t.stripeSessionId
        )
      })
    );
    contractTemplates = pgTable2(
      "contract_templates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        description: text2("description"),
        content: text2("content").notNull(),
        category: text2("category").default("custom"),
        variables: jsonb2("variables").default([]),
        isDefault: boolean2("is_default").default(false),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdCategoryIdx: index2("contract_templates_user_id_category_idx").on(
          t.userId,
          t.category
        )
      })
    );
    insertContractTemplateSchema = createInsertSchema(
      contractTemplates
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    generatedContracts = pgTable2(
      "generated_contracts",
      {
        id: varchar2("id").primaryKey(),
        userId: varchar2("user_id").notNull(),
        templateId: varchar2("template_id").notNull(),
        type: text2("type").notNull(),
        title: text2("title").notNull(),
        status: text2("status").notNull().default("draft"),
        content: text2("content").notNull(),
        variables: jsonb2("variables").$type().default({}),
        parties: jsonb2("parties").$type().default([]),
        signatures: jsonb2("signatures").$type().default([]),
        createdAt: timestamp2("created_at").defaultNow(),
        expiresAt: timestamp2("expires_at"),
        pdfUrl: text2("pdf_url")
      },
      (t) => ({
        userIdStatusCreatedAtIdx: index2(
          "generated_contracts_user_id_status_created_at_idx"
        ).on(t.userId, t.status, t.createdAt),
        userIdTypeIdx: index2("generated_contracts_user_id_type_idx").on(
          t.userId,
          t.type
        )
      })
    );
    marketplaceDisputes = pgTable2(
      "marketplace_disputes",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        orderId: varchar2("order_id").notNull(),
        buyerId: varchar2("buyer_id").notNull(),
        sellerId: varchar2("seller_id").notNull(),
        disputeType: text2("dispute_type").notNull(),
        status: text2("status").default("open"),
        subject: text2("subject").notNull(),
        description: text2("description").notNull(),
        evidence: jsonb2("evidence").$type().default([]),
        messages: jsonb2("messages").$type().default([]),
        resolution: jsonb2("resolution").$type(),
        escalatedAt: timestamp2("escalated_at"),
        resolvedAt: timestamp2("resolved_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        orderIdIdx: index2("marketplace_disputes_order_id_idx").on(t.orderId),
        buyerIdStatusIdx: index2("marketplace_disputes_buyer_id_status_idx").on(
          t.buyerId,
          t.status
        ),
        sellerIdStatusIdx: index2("marketplace_disputes_seller_id_status_idx").on(
          t.sellerId,
          t.status
        )
      })
    );
    insertMarketplaceDisputeSchema = createInsertSchema(
      marketplaceDisputes
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    statusPageIncidentUpdates = pgTable2(
      "status_page_incident_updates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        incidentId: varchar2("incident_id").notNull(),
        message: text2("message").notNull(),
        status: text2("status").default("investigating"),
        createdAt: timestamp2("created_at").defaultNow()
      }
    );
    statusPageServices = pgTable2("status_page_services", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      slug: text2("slug").notNull().unique(),
      description: text2("description"),
      status: text2("status").default("operational"),
      category: text2("category"),
      displayOrder: integer2("display_order").default(0),
      isPublic: boolean2("is_public").default(true),
      createdAt: timestamp2("created_at").defaultNow()
    });
    storefrontTemplates = pgTable2("storefront_templates", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      slug: text2("slug").notNull().unique(),
      description: text2("description"),
      thumbnailUrl: text2("thumbnail_url"),
      previewUrl: text2("preview_url"),
      configuration: jsonb2("configuration"),
      isActive: boolean2("is_active").default(true),
      isPremium: boolean2("is_premium").default(false),
      createdAt: timestamp2("created_at").defaultNow()
    });
    storefrontsRelations = relations(storefronts, ({ one }) => ({
      template: one(storefrontTemplates, {
        fields: [storefronts.templateId],
        references: [storefrontTemplates.id]
      })
    }));
    legalHolds = pgTable2(
      "legal_holds",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        contentType: text2("content_type").notNull(),
        contentId: varchar2("content_id").notNull(),
        reason: text2("reason"),
        holdType: text2("hold_type").default("dmca"),
        dmcaNoticeId: varchar2("dmca_notice_id"),
        status: text2("status").default("active"),
        expiresAt: timestamp2("expires_at"),
        releasedAt: timestamp2("released_at"),
        releasedBy: varchar2("released_by"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userIdStatusIdx: index2("legal_holds_user_id_status_idx").on(
          t.userId,
          t.status
        ),
        contentIdContentTypeIdx: index2(
          "legal_holds_content_id_content_type_idx"
        ).on(t.contentId, t.contentType)
      })
    );
    isrcRegistry = pgTable2(
      "isrc_registry",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        isrc: text2("isrc").notNull().unique(),
        trackId: varchar2("track_id").notNull(),
        releaseId: varchar2("release_id"),
        artistId: varchar2("artist_id").notNull(),
        title: text2("title").notNull(),
        registeredAt: timestamp2("registered_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        artistIdIdx: index2("isrc_registry_artist_id_idx").on(t.artistId),
        releaseIdIdx: index2("isrc_registry_release_id_idx").on(t.releaseId)
      })
    );
    statusPageSubscribers = pgTable2("status_page_subscribers", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      email: text2("email").notNull(),
      phone: text2("phone"),
      isVerified: boolean2("is_verified").default(false),
      notificationPreferences: jsonb2("notification_preferences"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    upcRegistry = pgTable2(
      "upc_registry",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        upc: text2("upc").notNull().unique(),
        releaseId: varchar2("release_id").notNull(),
        artistId: varchar2("artist_id").notNull(),
        title: text2("title").notNull(),
        registeredAt: timestamp2("registered_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        artistIdIdx: index2("upc_registry_artist_id_idx").on(t.artistId),
        releaseIdIdx: index2("upc_registry_release_id_idx").on(t.releaseId)
      })
    );
    statusPageUptimeMetrics = pgTable2(
      "status_page_uptime_metrics",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        serviceId: varchar2("service_id").notNull(),
        date: timestamp2("date").notNull().defaultNow(),
        uptimePercentage: real("uptime_percentage").default(100),
        downtime: integer2("downtime").default(0),
        responseTime: integer2("response_time"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        serviceIdDateIdx: index2(
          "status_page_uptime_metrics_service_id_date_idx"
        ).on(t.serviceId, t.date)
      })
    );
    catalogImportJobs = pgTable2(
      "catalog_import_jobs",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        artistId: varchar2("artist_id").notNull(),
        status: text2("status").default("pending"),
        sourceType: text2("source_type").notNull(),
        sourceUrl: text2("source_url"),
        progress: integer2("progress").default(0),
        totalTracks: integer2("total_tracks"),
        importedTracks: integer2("imported_tracks").default(0),
        errors: jsonb2("errors"),
        startedAt: timestamp2("started_at"),
        completedAt: timestamp2("completed_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        artistIdStatusIdx: index2("catalog_import_jobs_artist_id_status_idx").on(
          t.artistId,
          t.status
        )
      })
    );
    catalogImportRows = pgTable2(
      "catalog_import_rows",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        jobId: varchar2("job_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        artistName: text2("artist_name"),
        releaseTitle: text2("release_title"),
        isrc: text2("isrc"),
        upc: text2("upc"),
        status: text2("status").default("pending"),
        errorMessage: text2("error_message"),
        importedTrackId: varchar2("imported_track_id"),
        rawData: jsonb2("raw_data"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        jobIdStatusIdx: index2("catalog_import_rows_job_id_status_idx").on(
          t.jobId,
          t.status
        )
      })
    );
    releaseWorkflowRequests = pgTable2(
      "release_workflow_requests",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        requestType: text2("request_type").notNull(),
        requestedBy: varchar2("requested_by").notNull(),
        status: text2("status").default("pending"),
        metadata: jsonb2("metadata"),
        processedAt: timestamp2("processed_at"),
        processedBy: varchar2("processed_by"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        releaseIdStatusIdx: index2(
          "release_workflow_requests_release_id_status_idx"
        ).on(t.releaseId, t.status),
        requestedByStatusIdx: index2(
          "release_workflow_requests_requested_by_status_idx"
        ).on(t.requestedBy, t.status)
      })
    );
    releaseVersionHistory = pgTable2(
      "release_version_history",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        version: integer2("version").notNull(),
        changeType: text2("change_type").notNull(),
        changedBy: varchar2("changed_by").notNull(),
        changes: jsonb2("changes"),
        previousData: jsonb2("previous_data"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        releaseIdVersionIdx: index2(
          "release_version_history_release_id_version_idx"
        ).on(t.releaseId, t.version)
      })
    );
    releaseScheduledActions = pgTable2(
      "release_scheduled_actions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        actionType: text2("action_type").notNull(),
        scheduledFor: timestamp2("scheduled_for").notNull(),
        status: text2("status").default("pending"),
        metadata: jsonb2("metadata"),
        executedAt: timestamp2("executed_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        releaseIdStatusIdx: index2(
          "release_scheduled_actions_release_id_status_idx"
        ).on(t.releaseId, t.status),
        statusScheduledForIdx: index2(
          "release_scheduled_actions_status_scheduled_for_idx"
        ).on(t.status, t.scheduledFor)
      })
    );
    preSaveCampaigns = pgTable2(
      "pre_save_campaigns",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        slug: text2("slug").unique(),
        startDate: timestamp2("start_date"),
        endDate: timestamp2("end_date"),
        platforms: text2("platforms").array(),
        status: text2("status").default("active"),
        totalSaves: integer2("total_saves").default(0),
        spotifySaves: integer2("spotify_saves").default(0),
        appleMusicSaves: integer2("apple_music_saves").default(0),
        deezerSaves: integer2("deezer_saves").default(0),
        artwork: text2("artwork"),
        landingPageUrl: text2("landing_page_url"),
        collectEmails: boolean2("collect_emails").default(true),
        emailSignups: integer2("email_signups").default(0),
        targetSaves: integer2("target_saves"),
        conversionRate: real("conversion_rate"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdStatusIdx: index2("pre_save_campaigns_user_id_status_idx").on(
          t.userId,
          t.status
        ),
        releaseIdIdx: index2("pre_save_campaigns_release_id_idx").on(t.releaseId)
      })
    );
    insertPreSaveCampaignSchema = createInsertSchema(
      preSaveCampaigns
    ).omit({ id: true, createdAt: true, updatedAt: true });
    preSaveEntries = pgTable2(
      "pre_save_entries",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        campaignId: varchar2("campaign_id").notNull(),
        platform: text2("platform").notNull(),
        email: text2("email"),
        spotifyUserId: text2("spotify_user_id"),
        appleMusicUserId: text2("apple_music_user_id"),
        deezerUserId: text2("deezer_user_id"),
        ipAddress: text2("ip_address"),
        userAgent: text2("user_agent"),
        country: text2("country"),
        city: text2("city"),
        referer: text2("referer"),
        utmSource: text2("utm_source"),
        utmMedium: text2("utm_medium"),
        utmCampaign: text2("utm_campaign"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        campaignIdPlatformIdx: index2(
          "pre_save_entries_campaign_id_platform_idx"
        ).on(t.campaignId, t.platform),
        campaignIdCreatedAtIdx: index2(
          "pre_save_entries_campaign_id_created_at_idx"
        ).on(t.campaignId, t.createdAt)
      })
    );
    insertPreSaveEntrySchema = createInsertSchema(preSaveEntries).omit(
      { id: true, createdAt: true }
    );
    distributionSLAMetrics = pgTable2(
      "distribution_sla_metrics",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        platform: text2("platform").notNull(),
        submittedAt: timestamp2("submitted_at").notNull(),
        targetDeliveryAt: timestamp2("target_delivery_at").notNull(),
        actualDeliveryAt: timestamp2("actual_delivery_at"),
        liveAt: timestamp2("live_at"),
        slaTargetHours: integer2("sla_target_hours").default(48),
        actualDeliveryHours: real("actual_delivery_hours"),
        metSLA: boolean2("met_sla"),
        status: text2("status").default("pending"),
        deliveryPhase: text2("delivery_phase").default("queued"),
        errorMessage: text2("error_message"),
        retryCount: integer2("retry_count").default(0),
        lastRetryAt: timestamp2("last_retry_at"),
        platformReleaseId: text2("platform_release_id"),
        platformTrackingUrl: text2("platform_tracking_url"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        releaseIdPlatformIdx: index2(
          "distribution_sla_metrics_release_id_platform_idx"
        ).on(t.releaseId, t.platform),
        statusDeliveryPhaseIdx: index2(
          "distribution_sla_metrics_status_delivery_phase_idx"
        ).on(t.status, t.deliveryPhase)
      })
    );
    insertDistributionSLAMetricSchema = createInsertSchema(
      distributionSLAMetrics
    ).omit({ id: true, createdAt: true, updatedAt: true });
    contentIdRegistrations = pgTable2(
      "content_id_registrations",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        trackId: varchar2("track_id").notNull(),
        userId: varchar2("user_id").notNull(),
        isrc: text2("isrc").notNull(),
        assetId: text2("asset_id"),
        status: text2("status").default("pending"),
        registrationType: text2("registration_type").default("sound_recording"),
        ownershipPercentage: real("ownership_percentage").default(100),
        territories: text2("territories").array(),
        matchPolicy: text2("match_policy").default("monetize"),
        claimPolicy: text2("claim_policy").default("monetize"),
        allowUserUploads: boolean2("allow_user_uploads").default(false),
        youtubeChannelId: text2("youtube_channel_id"),
        submittedAt: timestamp2("submitted_at"),
        approvedAt: timestamp2("approved_at"),
        activeAt: timestamp2("active_at"),
        totalClaims: integer2("total_claims").default(0),
        totalRevenue: real("total_revenue").default(0),
        lastClaimAt: timestamp2("last_claim_at"),
        errorMessage: text2("error_message"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        releaseIdTrackIdIdx: index2(
          "content_id_registrations_release_id_track_id_idx"
        ).on(t.releaseId, t.trackId),
        userIdStatusIdx: index2("content_id_registrations_user_id_status_idx").on(
          t.userId,
          t.status
        )
      })
    );
    insertContentIdRegistrationSchema = createInsertSchema(
      contentIdRegistrations
    ).omit({ id: true, createdAt: true, updatedAt: true });
    syncLicenses = pgTable2("sync_licenses", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      trackId: varchar2("track_id"),
      userId: varchar2("user_id").notNull(),
      isAvailableForSync: boolean2("is_available_for_sync").default(true),
      syncCategories: text2("sync_categories").array(),
      exclusivityType: text2("exclusivity_type").default("non_exclusive"),
      minimumFee: real("minimum_fee"),
      currency: text2("currency").default("usd"),
      pricePerUse: real("price_per_use"),
      territories: text2("territories").array(),
      usageTypes: text2("usage_types").array(),
      mediaTypes: text2("media_types").array(),
      duration: text2("duration"),
      instrumentalAvailable: boolean2("instrumental_available").default(false),
      instrumentalUrl: text2("instrumental_url"),
      stemsAvailable: boolean2("stems_available").default(false),
      stemsUrl: text2("stems_url"),
      contactEmail: text2("contact_email"),
      contactName: text2("contact_name"),
      publisherName: text2("publisher_name"),
      publisherIPI: text2("publisher_ipi"),
      proAffiliation: text2("pro_affiliation"),
      status: text2("status").default("active"),
      totalInquiries: integer2("total_inquiries").default(0),
      totalPlacements: integer2("total_placements").default(0),
      totalRevenue: real("total_revenue").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertSyncLicenseSchema = createInsertSchema(syncLicenses).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    syncLicenseInquiries = pgTable2(
      "sync_license_inquiries",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        syncLicenseId: varchar2("sync_license_id").notNull(),
        userId: varchar2("user_id"),
        inquirerName: text2("inquirer_name").notNull(),
        inquirerEmail: text2("inquirer_email").notNull(),
        inquirerCompany: text2("inquirer_company"),
        projectType: text2("project_type"),
        projectDescription: text2("project_description"),
        proposedUsage: text2("proposed_usage"),
        proposedFee: real("proposed_fee"),
        proposedTerritory: text2("proposed_territory"),
        proposedDuration: text2("proposed_duration"),
        status: text2("status").default("pending"),
        respondedAt: timestamp2("responded_at"),
        responseNotes: text2("response_notes"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        bySyncLicense: index2("sync_license_inquiries_license_idx").on(
          t.syncLicenseId,
          t.createdAt
        ),
        byUser: index2("sync_license_inquiries_user_idx").on(t.userId),
        byStatus: index2("sync_license_inquiries_status_idx").on(t.status)
      })
    );
    insertSyncLicenseInquirySchema = createInsertSchema(
      syncLicenseInquiries
    ).omit({ id: true, createdAt: true });
    royaltySplits = pgTable2(
      "royalty_splits",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        trackId: varchar2("track_id"),
        userId: varchar2("user_id"),
        collaboratorName: text2("collaborator_name").notNull(),
        collaboratorEmail: text2("collaborator_email").notNull(),
        role: text2("role").notNull(),
        percentage: real("percentage").notNull(),
        payoutMethod: text2("payout_method").default("platform"),
        stripeAccountId: text2("stripe_account_id"),
        paypalEmail: text2("paypal_email"),
        bankDetails: jsonb2("bank_details"),
        status: text2("status").default("pending"),
        inviteSentAt: timestamp2("invite_sent_at"),
        inviteAcceptedAt: timestamp2("invite_accepted_at"),
        verifiedAt: timestamp2("verified_at"),
        totalEarned: real("total_earned").default(0),
        totalPaid: real("total_paid").default(0),
        pendingPayout: real("pending_payout").default(0),
        lastPayoutAt: timestamp2("last_payout_at"),
        ipiNumber: text2("ipi_number"),
        proAffiliation: text2("pro_affiliation"),
        publisherName: text2("publisher_name"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byRelease: index2("royalty_splits_release_idx").on(t.releaseId),
        byUser: index2("royalty_splits_user_idx").on(t.userId, t.status),
        byTrack: index2("royalty_splits_track_idx").on(t.trackId)
      })
    );
    insertRoyaltySplitSchema = createInsertSchema(royaltySplits).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    royaltyTransactions = pgTable2(
      "royalty_transactions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        splitId: varchar2("split_id").notNull(),
        releaseId: varchar2("release_id").notNull(),
        userId: varchar2("user_id"),
        amount: real("amount").notNull(),
        currency: text2("currency").default("usd"),
        transactionType: text2("transaction_type").notNull(),
        platform: text2("platform"),
        periodStart: timestamp2("period_start"),
        periodEnd: timestamp2("period_end"),
        streamCount: integer2("stream_count"),
        status: text2("status").default("pending"),
        stripeTransferId: text2("stripe_transfer_id"),
        paypalTransactionId: text2("paypal_transaction_id"),
        paidAt: timestamp2("paid_at"),
        errorMessage: text2("error_message"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (table) => ({
        userIdIdx: index2("royalty_transactions_user_id_idx").on(table.userId),
        createdAtIdx: index2("royalty_transactions_created_at_idx").on(
          table.createdAt
        ),
        platformIdx: index2("royalty_transactions_platform_idx").on(table.platform)
      })
    );
    insertRoyaltyTransactionSchema = createInsertSchema(
      royaltyTransactions
    ).omit({ id: true, createdAt: true });
    revenueEvents = pgTable2(
      "revenue_events",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        /** The user who earns from this event (seller / rights-holder). */
        userId: varchar2("user_id"),
        /** "marketplace" | "spotify" | "apple_music" | etc. */
        source: text2("source").notNull(),
        /** Territory code ("US", "GB") or event sub-type ("beat_sale"). */
        sourceType: text2("source_type"),
        amount: real("amount").notNull(),
        currency: text2("currency").default("usd"),
        /** Beat UUID or release UUID — links back to the earning asset. */
        projectId: varchar2("project_id"),
        /** marketplace listing UUID (beat_sale events only). */
        listingId: varchar2("listing_id"),
        /** marketplace order UUID (beat_sale events only). */
        orderId: varchar2("order_id"),
        occurredAt: timestamp2("occurred_at").notNull().defaultNow()
      },
      (t) => ({
        /** Prevents double-booking when a Stripe webhook replays processPayment */
        orderIdUnique: unique2("revenue_events_order_id_unique").on(t.orderId),
        userIdOccurredAtIdx: index2("revenue_events_user_id_occurred_at_idx").on(
          t.userId,
          t.occurredAt
        ),
        sourceOccurredAtIdx: index2("revenue_events_source_occurred_at_idx").on(
          t.source,
          t.occurredAt
        )
      })
    );
    recoupmentAccounts = pgTable2(
      "recoupment_accounts",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        releaseId: varchar2("release_id"),
        totalAdvance: real("total_advance").default(0),
        recoupedAmount: real("recouped_amount").default(0),
        /** Remaining balance as a precise decimal string. */
        remainingBalance: text2("remaining_balance").default("0"),
        /** Percentage of each payment applied to recoupment (0–100). */
        recoupmentRate: text2("recoupment_rate").default("100"),
        isActive: boolean2("is_active").default(true),
        priority: integer2("priority").default(1),
        fullyRecoupedAt: timestamp2("fully_recouped_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        userIdActiveIdx: index2("recoupment_accounts_user_id_active_idx").on(
          t.userId,
          t.isActive
        )
      })
    );
    splitContracts = pgTable2(
      "split_contracts",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        releaseId: varchar2("release_id").notNull(),
        status: text2("status").default("active"),
        /** Array of { userId, name, role, splitPercentage } objects. */
        participants: jsonb2("participants"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        releaseIdStatusIdx: index2("split_contracts_release_id_status_idx").on(
          t.releaseId,
          t.status
        )
      })
    );
    dspRates = pgTable2(
      "dsp_rates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        dspName: text2("dsp_name").notNull(),
        dspSlug: text2("dsp_slug").notNull(),
        territory: text2("territory").notNull().default("GLOBAL"),
        /** Stored as a decimal string to avoid float precision loss. */
        ratePerStream: text2("rate_per_stream").notNull(),
        currency: text2("currency").default("USD"),
        effectiveFrom: timestamp2("effective_from").notNull(),
        effectiveTo: timestamp2("effective_to"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        dspSlugTerritoryIdx: index2("dsp_rates_slug_territory_idx").on(
          t.dspSlug,
          t.territory
        )
      })
    );
    exchangeRates = pgTable2(
      "exchange_rates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        fromCurrency: text2("from_currency").notNull(),
        toCurrency: text2("to_currency").notNull(),
        /** Stored as a decimal string. */
        rate: text2("rate").notNull(),
        rateDate: timestamp2("rate_date").notNull(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        fxPairDateIdx: index2("exchange_rates_pair_date_idx").on(
          t.fromCurrency,
          t.toCurrency,
          t.rateDate
        )
      })
    );
    projectRoyaltySplits = pgTable2(
      "project_royalty_splits",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        projectId: varchar2("project_id").notNull(),
        collaboratorId: varchar2("collaborator_id").notNull(),
        role: text2("role"),
        splitPercentage: real("split_percentage").notNull(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        projectIdIdx: index2("project_royalty_splits_project_id_idx").on(
          t.projectId
        )
      })
    );
    instantPayouts = pgTable2(
      "instant_payouts",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        amountCents: bigint2("amount_cents", { mode: "number" }).notNull(),
        currency: text2("currency").default("usd"),
        status: text2("status").default("pending"),
        stripePayoutId: text2("stripe_payout_id"),
        riskScore: real("risk_score"),
        riskFlags: jsonb2("risk_flags"),
        failureReason: text2("failure_reason"),
        metadata: jsonb2("metadata"),
        processedAt: timestamp2("processed_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUser: index2("instant_payouts_user_idx").on(t.userId, t.createdAt),
        byStatus: index2("instant_payouts_status_idx").on(t.status)
      })
    );
    refunds = pgTable2(
      "refunds",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        orderId: varchar2("order_id").notNull(),
        userId: varchar2("user_id").notNull(),
        sellerId: varchar2("seller_id"),
        amountCents: bigint2("amount_cents", { mode: "number" }).notNull(),
        currency: text2("currency").default("usd"),
        reason: text2("reason"),
        status: text2("status").default("pending"),
        stripeRefundId: text2("stripe_refund_id"),
        stripeChargeId: text2("stripe_charge_id"),
        initiatedBy: text2("initiated_by"),
        refundType: text2("refund_type").default("full"),
        failureReason: text2("failure_reason"),
        metadata: jsonb2("metadata"),
        processedAt: timestamp2("processed_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byOrder: index2("refunds_order_idx").on(t.orderId),
        byUser: index2("refunds_user_idx").on(t.userId, t.createdAt),
        byStatus: index2("refunds_status_idx").on(t.status)
      })
    );
    insertRefundSchema = createInsertSchema(refunds).omit({
      id: true,
      createdAt: true
    });
    ledgerEntries = pgTable2(
      "ledger_entries",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        entryType: text2("entry_type").notNull(),
        amountCents: bigint2("amount_cents", { mode: "number" }).notNull(),
        currency: text2("currency").default("usd"),
        balanceAfterCents: bigint2("balance_after_cents", { mode: "number" }),
        referenceType: text2("reference_type"),
        referenceId: varchar2("reference_id"),
        description: text2("description"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUser: index2("ledger_entries_user_created_idx").on(t.userId, t.createdAt),
        byReference: index2("ledger_entries_reference_idx").on(
          t.referenceType,
          t.referenceId
        )
      })
    );
    insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
      id: true,
      createdAt: true
    });
    taxForms = pgTable2(
      "tax_forms",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        formType: text2("form_type").notNull(),
        taxYear: integer2("tax_year").notNull(),
        totalEarningsCents: bigint2("total_earnings_cents", {
          mode: "number"
        }).default(0),
        status: text2("status").default("pending"),
        formData: jsonb2("form_data"),
        pdfUrl: text2("pdf_url"),
        submittedAt: timestamp2("submitted_at"),
        generatedAt: timestamp2("generated_at"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUserYear: index2("tax_forms_user_year_idx").on(t.userId, t.taxYear),
        byStatus: index2("tax_forms_status_idx").on(t.status)
      })
    );
    insertTaxFormSchema = createInsertSchema(taxForms).omit({
      id: true,
      createdAt: true
    });
    royaltyStatements = pgTable2(
      "royalty_statements",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        label: text2("label"),
        periodStart: timestamp2("period_start").notNull(),
        periodEnd: timestamp2("period_end").notNull(),
        totalEarnings: text2("total_earnings").default("0"),
        status: text2("status").default("available"),
        downloadUrl: text2("download_url"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUser: index2("royalty_statements_user_idx").on(t.userId, t.createdAt),
        byStatus: index2("royalty_statements_status_idx").on(t.status)
      })
    );
    royaltyDisputes = pgTable2(
      "royalty_disputes",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        type: text2("type").notNull(),
        status: text2("status").default("open"),
        subject: text2("subject").notNull(),
        description: text2("description").notNull(),
        amount: text2("amount"),
        period: text2("period"),
        resolution: text2("resolution"),
        outcome: text2("outcome"),
        evidenceCount: integer2("evidence_count").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byUser: index2("royalty_disputes_user_idx").on(t.userId, t.createdAt),
        byStatus: index2("royalty_disputes_status_idx").on(t.status)
      })
    );
    disputeMessages = pgTable2("dispute_messages", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      disputeId: varchar2("dispute_id").notNull(),
      sender: text2("sender").notNull(),
      content: text2("content").notNull(),
      attachments: jsonb2("attachments"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    invoices = pgTable2(
      "invoices",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        invoiceNumber: text2("invoice_number").notNull().unique(),
        userId: varchar2("user_id").notNull(),
        invoiceType: text2("invoice_type").default("sale"),
        status: text2("status").default("draft"),
        fromAddress: jsonb2("from_address"),
        toAddress: jsonb2("to_address"),
        lineItems: jsonb2("line_items"),
        subtotalCents: bigint2("subtotal_cents", { mode: "number" }).default(0),
        taxCents: bigint2("tax_cents", { mode: "number" }).default(0),
        discountCents: bigint2("discount_cents", { mode: "number" }).default(0),
        totalCents: bigint2("total_cents", { mode: "number" }).default(0),
        currency: text2("currency").default("usd"),
        dueDate: timestamp2("due_date"),
        paidAt: timestamp2("paid_at"),
        paymentMethod: text2("payment_method"),
        stripeInvoiceId: text2("stripe_invoice_id"),
        pdfUrl: text2("pdf_url"),
        notes: text2("notes"),
        terms: text2("terms"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byUser: index2("invoices_user_idx").on(t.userId, t.createdAt),
        byStatus: index2("invoices_status_idx").on(t.status, t.dueDate)
      })
    );
    insertInvoiceSchema = createInsertSchema(invoices).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    splitPayments = pgTable2(
      "split_payments",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        orderId: varchar2("order_id").notNull(),
        userId: varchar2("user_id").notNull(),
        collaboratorId: varchar2("collaborator_id").notNull(),
        percentage: real("percentage").notNull(),
        amountCents: bigint2("amount_cents", { mode: "number" }).notNull(),
        currency: text2("currency").default("usd"),
        status: text2("status").default("pending"),
        stripeTransferId: text2("stripe_transfer_id"),
        failureReason: text2("failure_reason"),
        processedAt: timestamp2("processed_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byOrder: index2("split_payments_order_idx").on(t.orderId),
        byCollaborator: index2("split_payments_collaborator_idx").on(
          t.collaboratorId,
          t.status
        )
      })
    );
    insertSplitPaymentSchema = createInsertSchema(splitPayments).omit({
      id: true,
      createdAt: true
    });
    kycDocuments = pgTable2(
      "kyc_documents",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        documentType: text2("document_type").notNull(),
        documentUrl: text2("document_url"),
        status: text2("status").default("pending"),
        verifiedAt: timestamp2("verified_at"),
        expiresAt: timestamp2("expires_at"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUser: index2("kyc_documents_user_idx").on(t.userId, t.status)
      })
    );
    notifications = pgTable2(
      "notifications",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        type: text2("type").notNull(),
        title: text2("title").notNull(),
        message: text2("message"),
        isRead: boolean2("is_read").default(false),
        actionUrl: text2("action_url"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUserCreated: index2("notifications_user_created_idx").on(
          t.userId,
          t.createdAt
        ),
        byUserRead: index2("notifications_user_read_idx").on(t.userId, t.isRead)
      })
    );
    pushSubscriptions = pgTable2(
      "push_subscriptions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        endpoint: text2("endpoint").notNull().unique(),
        p256dh: text2("p256dh").notNull(),
        auth: text2("auth").notNull(),
        userAgent: text2("user_agent"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byUser: index2("push_subscriptions_user_idx").on(t.userId)
      })
    );
    supportTickets = pgTable2(
      "support_tickets",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        subject: text2("subject").notNull(),
        description: text2("description"),
        status: text2("status").default("open"),
        priority: text2("priority").default("medium"),
        category: text2("category").default("general"),
        assignedTo: varchar2("assigned_to"),
        responseTimeMinutes: integer2("response_time_minutes"),
        satisfactionRating: integer2("satisfaction_rating"),
        metadata: jsonb2("metadata"),
        resolvedAt: timestamp2("resolved_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byUser: index2("support_tickets_user_idx").on(t.userId, t.createdAt),
        byStatus: index2("support_tickets_status_idx").on(t.status, t.priority),
        byAssigned: index2("support_tickets_assigned_idx").on(
          t.assignedTo,
          t.status
        )
      })
    );
    insertSupportTicketSchema = createInsertSchema(
      supportTickets
    ).omit({ id: true, createdAt: true, updatedAt: true });
    securityThreats = pgTable2(
      "security_threats",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        threatType: text2("threat_type").notNull(),
        severity: text2("severity").notNull(),
        sourceIp: text2("source_ip"),
        userId: varchar2("user_id"),
        sessionId: varchar2("session_id"),
        path: text2("path"),
        method: text2("method"),
        indicators: jsonb2("indicators"),
        confidence: real("confidence"),
        status: text2("status").default("detected"),
        healingActions: jsonb2("healing_actions"),
        detectedAt: timestamp2("detected_at").defaultNow(),
        resolvedAt: timestamp2("resolved_at"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        bySourceIp: index2("security_threats_source_ip_idx").on(
          t.sourceIp,
          t.detectedAt
        ),
        bySeverityStatus: index2("security_threats_severity_status_idx").on(
          t.severity,
          t.status
        ),
        byUser: index2("security_threats_user_idx").on(t.userId, t.detectedAt)
      })
    );
    insertSecurityThreatSchema = createInsertSchema(
      securityThreats
    ).omit({ id: true, createdAt: true });
    ipBlacklist = pgTable2("ip_blacklist", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      ip: text2("ip").notNull(),
      reason: text2("reason").notNull(),
      severity: text2("severity").default("medium"),
      threatId: varchar2("threat_id"),
      blockedAt: timestamp2("blocked_at").defaultNow(),
      expiresAt: timestamp2("expires_at"),
      isActive: boolean2("is_active").default(true),
      blockCount: integer2("block_count").default(1),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertIpBlacklistSchema = createInsertSchema(ipBlacklist).omit({
      id: true,
      createdAt: true
    });
    posts = pgTable2(
      "posts",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        campaignId: varchar2("campaign_id"),
        platform: text2("platform").notNull(),
        content: text2("content"),
        mediaUrls: text2("media_urls").array(),
        status: text2("status").default("draft"),
        approvalStatus: text2("approval_status").default("draft"),
        submittedBy: varchar2("submitted_by"),
        reviewedBy: varchar2("reviewed_by"),
        reviewedAt: timestamp2("reviewed_at"),
        rejectionReason: text2("rejection_reason"),
        scheduledAt: timestamp2("scheduled_at"),
        publishedAt: timestamp2("published_at"),
        platformPostId: text2("platform_post_id"),
        engagement: jsonb2("engagement"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        // Supports the default post listing query: WHERE user_id = ? ORDER BY created_at DESC.
        index2("posts_user_id_created_at_idx").on(t.userId, t.createdAt),
        // Supports the scheduled post lookup: WHERE user_id = ? AND status IN ('scheduled','pending').
        index2("posts_user_id_scheduled_at_idx").on(t.userId, t.scheduledAt)
      ]
    );
    audioClips = pgTable2(
      "audio_clips",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        projectId: varchar2("project_id").notNull(),
        trackId: varchar2("track_id"),
        name: text2("name").notNull(),
        audioUrl: text2("audio_url"),
        startTime: real("start_time").default(0),
        duration: real("duration"),
        fadeIn: real("fade_in").default(0),
        fadeOut: real("fade_out").default(0),
        gain: real("gain").default(1),
        warpMode: text2("warp_mode"),
        warpSettings: jsonb2("warp_settings"),
        isComped: boolean2("is_comped").default(false),
        compSourceIds: jsonb2("comp_source_ids"),
        hiddenInTimeline: boolean2("hidden_in_timeline").default(false),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byProject: index2("audio_clips_project_idx").on(t.projectId),
        byTrack: index2("audio_clips_track_idx").on(t.trackId)
      })
    );
    midiClips = pgTable2(
      "midi_clips",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        projectId: varchar2("project_id").notNull(),
        trackId: varchar2("track_id").notNull(),
        name: text2("name").notNull(),
        startBeat: real("start_beat").notNull().default(0),
        durationBeats: real("duration_beats").notNull().default(4),
        color: text2("color").notNull().default("#8b5cf6"),
        looped: boolean2("looped").notNull().default(false),
        loopLength: real("loop_length").notNull().default(4),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byProjectTrack: index2("midi_clips_project_track_idx").on(t.projectId, t.trackId)
      })
    );
    midiNotes = pgTable2(
      "midi_notes",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        clipId: varchar2("clip_id").notNull(),
        pitch: integer2("pitch").notNull(),
        velocity: integer2("velocity").notNull(),
        startBeat: real("start_beat").notNull(),
        durationBeats: real("duration_beats").notNull(),
        channel: integer2("channel").notNull().default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byClip: index2("midi_notes_clip_idx").on(t.clipId)
      })
    );
    markers = pgTable2("markers", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      name: text2("name").notNull(),
      time: real("time").notNull(),
      color: text2("color"),
      markerType: text2("marker_type").default("generic"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    pluginCatalog = pgTable2("plugin_catalog", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      slug: text2("slug").notNull().unique(),
      type: text2("type").notNull(),
      category: text2("category"),
      vendor: text2("vendor"),
      version: text2("version"),
      description: text2("description"),
      iconUrl: text2("icon_url"),
      parameters: jsonb2("parameters"),
      presets: jsonb2("presets"),
      isBuiltIn: boolean2("is_built_in").default(false),
      isActive: boolean2("is_active").default(true),
      createdAt: timestamp2("created_at").defaultNow()
    });
    workspaceAuditLog = pgTable2(
      "workspace_audit_log",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        workspaceId: varchar2("workspace_id").notNull(),
        userId: varchar2("user_id").notNull(),
        action: text2("action").notNull(),
        resourceType: text2("resource_type"),
        resourceId: varchar2("resource_id"),
        details: jsonb2("details"),
        changes: jsonb2("changes"),
        previousValues: jsonb2("previous_values"),
        newValues: jsonb2("new_values"),
        ipAddress: text2("ip_address"),
        userAgent: text2("user_agent"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byWorkspace: index2("workspace_audit_log_workspace_idx").on(
          t.workspaceId,
          t.createdAt
        ),
        byUser: index2("workspace_audit_log_user_idx").on(t.userId, t.createdAt),
        byResource: index2("workspace_audit_log_resource_idx").on(
          t.resourceType,
          t.resourceId
        )
      })
    );
    insertWorkspaceAuditLogSchema = createInsertSchema(
      workspaceAuditLog
    ).omit({ id: true, createdAt: true });
    apiKeys = pgTable2(
      "api_keys",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        keyHash: text2("key_hash").notNull(),
        keyPrefix: text2("key_prefix").notNull(),
        scopes: text2("scopes").array(),
        rateLimit: integer2("rate_limit").default(1e3),
        lastUsedAt: timestamp2("last_used_at"),
        expiresAt: timestamp2("expires_at"),
        isActive: boolean2("is_active").default(true),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byUser: index2("api_keys_user_idx").on(t.userId, t.isActive),
        byKeyHash: index2("api_keys_key_hash_idx").on(t.keyHash)
      })
    );
    dspAnalytics = pgTable2(
      "dsp_analytics",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id"),
        releaseId: varchar2("release_id").notNull(),
        trackId: varchar2("track_id"),
        platform: text2("platform").notNull(),
        date: date("date").notNull(),
        streams: integer2("streams").default(0),
        revenue: real("revenue").default(0),
        saves: integer2("saves").default(0),
        playlistAdds: integer2("playlist_adds").default(0),
        listeners: integer2("listeners").default(0),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byRelease: index2("dsp_analytics_release_platform_date_idx").on(
          t.releaseId,
          t.platform,
          t.date
        ),
        byUser: index2("dsp_analytics_user_idx").on(t.userId, t.date),
        byTrack: index2("dsp_analytics_track_idx").on(t.trackId, t.date)
      })
    );
    orders = pgTable2(
      "orders",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        sellerId: varchar2("seller_id").notNull(),
        listingId: varchar2("listing_id").notNull(),
        amount: real("amount").notNull(),
        currency: text2("currency").default("usd"),
        status: text2("status").default("pending"),
        licenseType: text2("license_type").default("basic"),
        licenseSnapshot: jsonb2("license_snapshot"),
        licenseDocumentUrl: text2("license_document_url"),
        stripePaymentIntentId: text2("stripe_payment_intent_id"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byBuyer: index2("orders_buyer_idx").on(t.userId, t.createdAt),
        bySeller: index2("orders_seller_idx").on(t.sellerId, t.createdAt),
        byListing: index2("orders_listing_idx").on(t.listingId),
        byStatus: index2("orders_status_idx").on(t.status, t.createdAt),
        byStripeIntent: index2("orders_stripe_intent_idx").on(
          t.stripePaymentIntentId
        )
      })
    );
    kycVerifications = pgTable2("kyc_verifications", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      verificationType: text2("verification_type").notNull(),
      status: text2("status").default("pending"),
      provider: text2("provider"),
      providerReference: text2("provider_reference"),
      verifiedAt: timestamp2("verified_at"),
      expiresAt: timestamp2("expires_at"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    approvalHistory = pgTable2("approval_history", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      postId: varchar2("post_id").notNull(),
      userId: varchar2("user_id").notNull(),
      action: text2("action").notNull(),
      comment: text2("comment"),
      previousStatus: text2("previous_status"),
      newStatus: text2("new_status"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    scheduledPostBatches = pgTable2("scheduled_post_batches", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      status: text2("status").default("pending"),
      postIds: text2("post_ids").array(),
      scheduledAt: timestamp2("scheduled_at"),
      completedAt: timestamp2("completed_at"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    compVersions = pgTable2("comp_versions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      trackId: varchar2("track_id").notNull(),
      takeGroupId: varchar2("take_group_id").notNull(),
      name: text2("name").notNull(),
      versionNumber: integer2("version_number").default(1),
      description: text2("description"),
      createdBy: varchar2("created_by"),
      segments: jsonb2("segments"),
      renderedClipId: varchar2("rendered_clip_id"),
      isActive: boolean2("is_active").default(false),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    pluginInstances = pgTable2("plugin_instances", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      trackId: varchar2("track_id"),
      pluginId: varchar2("plugin_id").notNull(),
      name: text2("name"),
      position: integer2("position").default(0),
      parameters: jsonb2("parameters"),
      presetId: varchar2("preset_id"),
      isBypassed: boolean2("is_bypassed").default(false),
      createdAt: timestamp2("created_at").defaultNow()
    });
    stemExports = pgTable2("stem_exports", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      format: text2("format").default("wav"),
      bitDepth: integer2("bit_depth").default(24),
      sampleRate: integer2("sample_rate").default(44100),
      trackIds: text2("track_ids").array(),
      status: text2("status").default("pending"),
      outputUrl: text2("output_url"),
      createdAt: timestamp2("created_at").defaultNow(),
      // Added to match stemExportService.ts's actual read/write contract — the
      // columns above predate that service and never covered its full lifecycle
      // (job tracking, per-track progress, ZIP archive result, failure state).
      jobId: varchar2("job_id"),
      exportName: text2("export_name"),
      exportFormat: text2("export_format"),
      bitrate: text2("bitrate"),
      normalize: boolean2("normalize").default(false),
      normalizationType: text2("normalization_type"),
      normalizeTargetLevel: real("normalize_target_level"),
      includeEffects: boolean2("include_effects").default(true),
      includeMasterBus: boolean2("include_master_bus").default(false),
      fileCount: integer2("file_count"),
      progress: integer2("progress").default(0),
      metadata: jsonb2("metadata"),
      currentTrack: text2("current_track"),
      individualFiles: jsonb2("individual_files"),
      totalDuration: real("total_duration"),
      totalFileSize: integer2("total_file_size"),
      zipArchiveUrl: text2("zip_archive_url"),
      zipStorageKey: text2("zip_storage_key"),
      completedAt: timestamp2("completed_at"),
      errorMessage: text2("error_message")
    });
    warpMarkers = pgTable2("warp_markers", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      clipId: varchar2("clip_id").notNull(),
      beatPosition: real("beat_position").notNull(),
      samplePosition: real("sample_position").notNull(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertWarpMarkerSchema = createInsertSchema(warpMarkers).omit({
      id: true,
      createdAt: true
    });
    workspaceCatalogs = pgTable2("workspace_catalogs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      name: text2("name").notNull(),
      type: text2("type").notNull(),
      projectId: varchar2("project_id"),
      items: jsonb2("items"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertWorkspaceCatalogSchema = createInsertSchema(
      workspaceCatalogs
    ).omit({ id: true, createdAt: true });
    apiUsage = pgTable2("api_usage", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      apiKeyId: varchar2("api_key_id").notNull(),
      endpoint: text2("endpoint").notNull(),
      method: text2("method").notNull(),
      statusCode: integer2("status_code"),
      responseTimeMs: integer2("response_time_ms"),
      ipAddress: text2("ip_address"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    alertIncidents = pgTable2("alert_incidents", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      alertType: text2("alert_type").notNull(),
      severity: text2("severity").default("warning"),
      message: text2("message").notNull(),
      source: text2("source"),
      status: text2("status").default("active"),
      acknowledgedBy: varchar2("acknowledged_by"),
      acknowledgedAt: timestamp2("acknowledged_at"),
      resolvedAt: timestamp2("resolved_at"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    dspUserPlatformStatus = pgTable2(
      "dsp_user_platform_status",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        platform: text2("platform").notNull(),
        syncStatus: text2("sync_status").default("pending"),
        lastSyncAt: timestamp2("last_sync_at"),
        lastSuccessAt: timestamp2("last_success_at"),
        credentials: jsonb2("credentials"),
        errorMessage: text2("error_message"),
        errorCount: integer2("error_count").default(0),
        dataRangeStart: timestamp2("data_range_start"),
        dataRangeEnd: timestamp2("data_range_end"),
        recordsProcessed: integer2("records_processed").default(0),
        updatedAt: timestamp2("updated_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        userPlatformIdx: index2("dsp_user_platform_status_user_platform_idx").on(
          t.userId,
          t.platform
        )
      })
    );
    dspSyncStatus = pgTable2("dsp_sync_status", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      platform: text2("platform").notNull(),
      status: text2("status").default("pending"),
      lastSyncAt: timestamp2("last_sync_at"),
      platformReleaseId: text2("platform_release_id"),
      errorMessage: text2("error_message"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    toolostConnection = pgTable2("toolost_connection", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      accessToken: text2("access_token").notNull(),
      refreshToken: text2("refresh_token").notNull(),
      tokenExpiresAt: timestamp2("token_expires_at").notNull(),
      scope: text2("scope"),
      environment: text2("environment").notNull().default("production"),
      connectedByUserId: varchar2("connected_by_user_id").notNull(),
      connectedAt: timestamp2("connected_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    youtubeConnections = pgTable2("youtube_connections", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().unique(),
      channelId: text2("channel_id").notNull(),
      channelTitle: text2("channel_title"),
      accessToken: text2("access_token").notNull(),
      refreshToken: text2("refresh_token").notNull(),
      tokenExpiresAt: timestamp2("token_expires_at").notNull(),
      scope: text2("scope"),
      connectedAt: timestamp2("connected_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    youtubeUploads = pgTable2("youtube_uploads", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      releaseId: varchar2("release_id"),
      listingId: varchar2("listing_id"),
      videoId: text2("video_id"),
      title: text2("title").notNull(),
      description: text2("description"),
      privacyStatus: text2("privacy_status").notNull().default("private"),
      status: text2("status").notNull().default("pending"),
      errorMessage: text2("error_message"),
      uploadedAt: timestamp2("uploaded_at"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    emailEvents = pgTable2("email_events", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      messageId: text2("message_id"),
      email: text2("email").notNull(),
      event: text2("event").notNull(),
      timestamp: timestamp2("timestamp"),
      category: text2("category"),
      reason: text2("reason"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    requestInstantPayoutSchema = z.object({
      // Max single payout: $100,000 (10,000,000 cents). Prevents runaway automation
      // or UI bugs from issuing arbitrarily large transfers in a single request.
      amountCents: z.number().int().positive().max(1e7),
      currency: z.string().default("usd")
    });
    approvePostSchema = z.object({
      postId: z.string(),
      approved: z.boolean(),
      comment: z.string().optional()
    });
    bulkSchedulePostSchema = z.object({
      postIds: z.array(z.string()),
      scheduledAt: z.string(),
      timezone: z.string().optional()
    });
    takeGroups = pgTable2("take_groups", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      trackId: varchar2("track_id").notNull(),
      name: text2("name").notNull(),
      startTime: real("start_time").default(0),
      endTime: real("end_time"),
      status: text2("status").default("recording"),
      takeCount: integer2("take_count").default(0),
      color: text2("color"),
      takes: jsonb2("takes"),
      activeCompVersionId: varchar2("active_comp_version_id"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    pluginPresets = pgTable2("plugin_presets", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      pluginId: varchar2("plugin_id").notNull(),
      userId: varchar2("user_id"),
      name: text2("name").notNull(),
      isFactory: boolean2("is_factory").default(false),
      parameters: jsonb2("parameters"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    studioTracks = pgTable2("studio_tracks", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      name: text2("name").notNull(),
      trackType: text2("track_type").default("audio"),
      color: text2("color"),
      volume: real("volume").default(1),
      pan: real("pan").default(0),
      isMuted: boolean2("is_muted").default(false),
      isSolo: boolean2("is_solo").default(false),
      isArmed: boolean2("is_armed").default(false),
      inputSource: text2("input_source"),
      outputBus: text2("output_bus"),
      order: integer2("order").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    workspaceInvitations = pgTable2("workspace_invitations", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      email: text2("email").notNull(),
      role: text2("role").default("member"),
      roleId: varchar2("role_id"),
      invitedBy: varchar2("invited_by").notNull(),
      status: text2("status").default("pending"),
      token: text2("token").notNull(),
      expiresAt: timestamp2("expires_at").notNull(),
      acceptedAt: timestamp2("accepted_at"),
      acceptedByUserId: varchar2("accepted_by_user_id"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertWorkspaceInvitationSchema = createInsertSchema(
      workspaceInvitations
    ).omit({ id: true, createdAt: true });
    alertRules = pgTable2("alert_rules", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      condition: text2("condition").notNull(),
      threshold: real("threshold"),
      severity: text2("severity").default("warning"),
      channels: text2("channels").array(),
      isActive: boolean2("is_active").default(true),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    playlistAttributions = pgTable2("playlist_attributions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      releaseId: varchar2("release_id"),
      trackId: varchar2("track_id"),
      playlistId: text2("playlist_id").notNull(),
      playlistName: text2("playlist_name").notNull(),
      playlistType: text2("playlist_type").notNull(),
      platform: text2("platform").notNull(),
      addedDate: timestamp2("added_date"),
      removedDate: timestamp2("removed_date"),
      streams: integer2("streams").default(0),
      listeners: integer2("listeners").default(0),
      saves: integer2("saves").default(0),
      revenue: text2("revenue"),
      position: integer2("position"),
      followerCount: integer2("follower_count").default(0),
      curatorName: text2("curator_name"),
      isActive: boolean2("is_active").default(true),
      pitchStatus: text2("pitch_status"),
      pitchDate: timestamp2("pitch_date"),
      pitchResponse: text2("pitch_response"),
      lastUpdated: timestamp2("last_updated"),
      updatedAt: timestamp2("updated_at"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertPlaylistAttributionSchema = createInsertSchema(
      playlistAttributions
    ).omit({ id: true, createdAt: true });
    emailMessages = pgTable2("email_messages", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id"),
      to: text2("to").notNull(),
      from: text2("from").notNull(),
      subject: text2("subject").notNull(),
      templateId: text2("template_id"),
      status: text2("status").default("pending"),
      sendgridMessageId: text2("sendgrid_message_id"),
      sentAt: timestamp2("sent_at"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    rejectPostSchema = z.object({
      postId: z.string(),
      reason: z.string().optional()
    });
    bulkValidatePostSchema = z.object({
      postIds: z.array(z.string())
    });
    takeLanes = pgTable2("take_lanes", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      takeGroupId: varchar2("take_group_id").notNull(),
      name: text2("name").notNull(),
      audioClipId: varchar2("audio_clip_id"),
      isActive: boolean2("is_active").default(false),
      isMuted: boolean2("is_muted").default(false),
      isSolo: boolean2("is_solo").default(false),
      volume: real("volume").default(1),
      color: text2("color"),
      rating: integer2("rating"),
      notes: text2("notes"),
      laneIndex: integer2("lane_index").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    updateWarpMarkerSchema = z.object({
      beatPosition: z.number().optional(),
      samplePosition: z.number().optional()
    });
    workspaceMembers = pgTable2("workspace_members", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      userId: varchar2("user_id").notNull(),
      role: text2("role").default("member"),
      roleId: varchar2("role_id"),
      status: text2("status").default("active"),
      lastActiveAt: timestamp2("last_active_at"),
      joinedAt: timestamp2("joined_at").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertWorkspaceMemberSchema = createInsertSchema(
      workspaceMembers
    ).omit({ id: true, createdAt: true });
    systemMetrics = pgTable2("system_metrics", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      metricType: text2("metric_type").notNull(),
      value: real("value").notNull(),
      unit: text2("unit"),
      source: text2("source"),
      tags: jsonb2("tags"),
      timestamp: timestamp2("timestamp").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    listenerCohorts = pgTable2("listener_cohorts", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      cohortName: text2("cohort_name").notNull(),
      platform: text2("platform"),
      listenerCount: integer2("listener_count").default(0),
      demographics: jsonb2("demographics"),
      geographics: jsonb2("geographics"),
      period: text2("period"),
      startDate: date("start_date"),
      endDate: date("end_date"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    submitForReviewSchema = z.object({
      postId: z.string(),
      notes: z.string().optional()
    });
    socialAccounts = pgTable2("social_accounts", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      platform: text2("platform").notNull(),
      platformUserId: text2("platform_user_id"),
      accessToken: text2("access_token"),
      refreshToken: text2("refresh_token"),
      tokenExpiresAt: timestamp2("token_expires_at"),
      username: text2("username"),
      profileUrl: text2("profile_url"),
      followerCount: integer2("follower_count").default(0),
      isActive: boolean2("is_active").default(true),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    takeSegments = pgTable2("take_segments", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      compVersionId: varchar2("comp_version_id"),
      takeGroupId: varchar2("take_group_id").notNull(),
      takeLaneId: varchar2("take_lane_id").notNull(),
      startTime: real("start_time").notNull(),
      endTime: real("end_time").notNull(),
      fadeIn: real("fade_in").default(0),
      fadeOut: real("fade_out").default(0),
      crossfadeType: text2("crossfade_type").default("linear"),
      gain: real("gain").default(1),
      isSelected: boolean2("is_selected").default(false),
      order: integer2("order").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    workspaceRoles = pgTable2("workspace_roles", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      name: text2("name").notNull(),
      permissions: text2("permissions").array(),
      isDefault: boolean2("is_default").default(false),
      createdAt: timestamp2("created_at").defaultNow()
    });
    revenueForecasts = pgTable2("revenue_forecasts", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      releaseId: varchar2("release_id"),
      forecastDate: timestamp2("forecast_date").defaultNow(),
      forecastType: text2("forecast_type").notNull(),
      period: text2("period").notNull(),
      projectedStreams: integer2("projected_streams"),
      projectedRevenue: real("projected_revenue"),
      projectedRoyalties: real("projected_royalties"),
      predictedRevenue: real("predicted_revenue"),
      confidence: real("confidence"),
      confidenceLevel: real("confidence_level"),
      confidenceLow: real("confidence_low"),
      confidenceHigh: real("confidence_high"),
      methodology: text2("methodology"),
      factors: jsonb2("factors"),
      actualRevenue: real("actual_revenue"),
      actualStreams: integer2("actual_streams"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    workspaces = pgTable2("workspaces", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      slug: text2("slug").unique(),
      ownerId: varchar2("owner_id").notNull(),
      description: text2("description"),
      logoUrl: text2("logo_url"),
      isActive: boolean2("is_active").default(true),
      settings: jsonb2("settings"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertWorkspaceSchema = createInsertSchema(workspaces).omit({
      id: true,
      createdAt: true
    });
    approvalRequests = pgTable2("approval_requests", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      requesterId: varchar2("requester_id").notNull(),
      approverId: varchar2("approver_id"),
      resourceType: text2("resource_type").notNull(),
      resourceId: varchar2("resource_id").notNull(),
      status: text2("status").default("pending"),
      notes: text2("notes"),
      approvedAt: timestamp2("approved_at"),
      rejectedAt: timestamp2("rejected_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    approvalSteps = pgTable2("approval_steps", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      requestId: varchar2("request_id").notNull(),
      stepOrder: integer2("step_order").default(1),
      approverId: varchar2("approver_id").notNull(),
      status: text2("status").default("pending"),
      comment: text2("comment"),
      actionTakenAt: timestamp2("action_taken_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    approvalWorkflows = pgTable2("approval_workflows", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      name: text2("name").notNull(),
      resourceType: text2("resource_type").notNull(),
      steps: jsonb2("steps"),
      isActive: boolean2("is_active").default(true),
      createdAt: timestamp2("created_at").defaultNow()
    });
    ssoConfigs = pgTable2("sso_configs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      workspaceId: varchar2("workspace_id").notNull(),
      provider: text2("provider").notNull(),
      entityId: text2("entity_id"),
      ssoUrl: text2("sso_url"),
      certificateFingerprint: text2("certificate_fingerprint"),
      oidcClientId: text2("oidc_client_id"),
      oidcIssuer: text2("oidc_issuer"),
      isActive: boolean2("is_active").default(false),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    platformApiConfigs = pgTable2("platform_api_configs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      platform: text2("platform").notNull().unique(),
      displayName: text2("display_name").notNull(),
      category: text2("category").notNull(),
      authType: text2("auth_type").notNull(),
      callbackUrl: text2("callback_url"),
      authorizationUrl: text2("authorization_url"),
      tokenUrl: text2("token_url"),
      scopes: text2("scopes").array(),
      requiredEnvVars: text2("required_env_vars").array(),
      consoleUrl: text2("console_url"),
      setupInstructions: text2("setup_instructions"),
      webhookUrl: text2("webhook_url"),
      webhookEvents: text2("webhook_events").array(),
      isConfigured: boolean2("is_configured").default(false),
      isActive: boolean2("is_active").default(true),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at")
    });
    adCampaigns = pgTable2("ad_campaigns", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      platform: text2("platform").notNull(),
      objective: text2("objective"),
      budget: real("budget").default(0),
      dailyBudget: real("daily_budget"),
      startDate: timestamp2("start_date"),
      endDate: timestamp2("end_date"),
      targetAudience: jsonb2("target_audience"),
      creativeIds: text2("creative_ids").array(),
      status: text2("status").default("draft"),
      performance: jsonb2("performance"),
      aiOptimizations: jsonb2("ai_optimizations"),
      metadata: jsonb2("metadata"),
      // Organic ad delivery tracking (populated by advertisingDispatchService)
      organicMetrics: jsonb2("organic_metrics"),
      connectedPlatforms: jsonb2("connected_platforms"),
      impressions: integer2("impressions").default(0),
      clicks: integer2("clicks").default(0),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at")
    });
    insertAdCampaignSchema = createInsertSchema(adCampaigns).omit({
      id: true,
      createdAt: true
    });
    adCreatives = pgTable2("ad_creatives", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      campaignId: varchar2("campaign_id"),
      name: text2("name").notNull(),
      type: text2("type").notNull(),
      headline: text2("headline"),
      description: text2("description"),
      mediaUrl: text2("media_url"),
      thumbnailUrl: text2("thumbnail_url"),
      callToAction: text2("call_to_action"),
      landingUrl: text2("landing_url"),
      status: text2("status").default("draft"),
      performance: jsonb2("performance"),
      variants: jsonb2("variants"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAdCreativeSchema = createInsertSchema(adCreatives).omit({
      id: true,
      createdAt: true
    });
    adDeliveryLogs = pgTable2(
      "ad_delivery_logs",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        variantId: varchar2("variant_id").notNull(),
        platform: text2("platform").notNull(),
        platformAdId: text2("platform_ad_id"),
        deliveryStatus: text2("delivery_status").default("pending").notNull(),
        platformResponse: jsonb2("platform_response"),
        errorMessage: text2("error_message"),
        retryCount: integer2("retry_count").default(0),
        deliveredAt: timestamp2("delivered_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("ad_delivery_logs_variant_id_idx").on(t.variantId),
        index2("ad_delivery_logs_platform_status_idx").on(
          t.platform,
          t.deliveryStatus
        )
      ]
    );
    contentCalendar = pgTable2(
      "content_calendar",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        title: text2("title").notNull(),
        contentType: text2("content_type").notNull(),
        platform: text2("platform"),
        scheduledAt: timestamp2("scheduled_at"),
        status: text2("status").default("planned"),
        content: jsonb2("content"),
        mediaUrls: text2("media_urls").array(),
        tags: text2("tags").array(),
        campaignId: varchar2("campaign_id"),
        publishedAt: timestamp2("published_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        // Supports calendar event listing: WHERE user_id = ? ORDER BY scheduled_at DESC.
        index2("content_calendar_user_id_scheduled_at_idx").on(
          t.userId,
          t.scheduledAt
        ),
        // Supports the stats aggregation: WHERE user_id = ? GROUP BY status.
        index2("content_calendar_user_id_status_idx").on(t.userId, t.status)
      ]
    );
    insertContentCalendarSchema = createInsertSchema(
      contentCalendar
    ).omit({ id: true, createdAt: true });
    aiModels = pgTable2(
      "ai_models",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        modelName: text2("model_name").notNull().unique(),
        modelType: text2("model_type").notNull(),
        description: text2("description"),
        version: text2("version").default("1.0.0"),
        status: text2("status").default("active"),
        capabilities: text2("capabilities").array(),
        inputSchema: jsonb2("input_schema"),
        outputSchema: jsonb2("output_schema"),
        parameters: jsonb2("parameters"),
        trainingData: jsonb2("training_data"),
        performance: jsonb2("performance"),
        lastTrainedAt: timestamp2("last_trained_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at")
      },
      (table) => ({
        modelTypeIdx: index2("ai_models_model_type_idx").on(table.modelType),
        statusIdx: index2("ai_models_status_idx").on(table.status)
      })
    );
    insertAiModelSchema = createInsertSchema(aiModels).omit({
      id: true,
      createdAt: true
    });
    userBrandVoices = pgTable2("user_brand_voices", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      voiceName: text2("voice_name").notNull(),
      description: text2("description"),
      tone: text2("tone"),
      personality: text2("personality").array(),
      vocabulary: text2("vocabulary").array(),
      avoidWords: text2("avoid_words").array(),
      writingStyle: text2("writing_style"),
      sampleContent: text2("sample_content").array(),
      targetAudience: text2("target_audience"),
      brandValues: text2("brand_values").array(),
      isDefault: boolean2("is_default").default(false),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at")
    });
    insertUserBrandVoiceSchema = createInsertSchema(
      userBrandVoices
    ).omit({ id: true, createdAt: true });
    inferenceRuns = pgTable2("inference_runs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id"),
      modelId: varchar2("model_id"),
      modelName: text2("model_name").notNull(),
      inputData: jsonb2("input_data"),
      outputData: jsonb2("output_data"),
      status: text2("status").default("pending"),
      latencyMs: integer2("latency_ms"),
      tokensUsed: integer2("tokens_used"),
      cost: real("cost"),
      error: text2("error"),
      metadata: jsonb2("metadata"),
      startedAt: timestamp2("started_at").defaultNow(),
      completedAt: timestamp2("completed_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertInferenceRunSchema = createInsertSchema(inferenceRuns).omit({
      id: true,
      createdAt: true
    });
    hashtagResearch = pgTable2("hashtag_research", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id"),
      hashtag: text2("hashtag").notNull(),
      platform: text2("platform").notNull(),
      volume: integer2("volume").default(0),
      engagement: real("engagement").default(0),
      competition: real("competition").default(0),
      trending: boolean2("trending").default(false),
      relatedHashtags: text2("related_hashtags").array(),
      audienceSize: integer2("audience_size"),
      growthRate: real("growth_rate"),
      peakHours: integer2("peak_hours").array(),
      category: text2("category"),
      metadata: jsonb2("metadata"),
      lastUpdated: timestamp2("last_updated").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertHashtagResearchSchema = createInsertSchema(
      hashtagResearch
    ).omit({ id: true, createdAt: true });
    explanationLogs = pgTable2("explanation_logs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id"),
      modelName: text2("model_name").notNull(),
      decisionType: text2("decision_type").notNull(),
      inputData: jsonb2("input_data"),
      outputData: jsonb2("output_data"),
      confidence: real("confidence"),
      explanation: text2("explanation"),
      factors: jsonb2("factors"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertExplanationLogSchema = createInsertSchema(
      explanationLogs
    ).omit({ id: true, createdAt: true });
    bestPostingTimes = pgTable2("best_posting_times", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      platform: text2("platform").notNull(),
      dayOfWeek: integer2("day_of_week").notNull(),
      hour: integer2("hour").notNull(),
      engagementScore: real("engagement_score").default(0),
      postCount: integer2("post_count").default(0),
      avgLikes: real("avg_likes").default(0),
      avgComments: real("avg_comments").default(0),
      avgShares: real("avg_shares").default(0),
      avgReach: real("avg_reach").default(0),
      confidence: real("confidence").default(0),
      lastUpdated: timestamp2("last_updated").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertBestPostingTimeSchema = createInsertSchema(
      bestPostingTimes
    ).omit({ id: true, createdAt: true });
    aiModelVersions = pgTable2("ai_model_versions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      modelId: varchar2("model_id").notNull(),
      versionNumber: integer2("version_number").notNull(),
      versionHash: text2("version_hash"),
      status: text2("status").default("staging"),
      accuracy: real("accuracy"),
      trainingMetrics: jsonb2("training_metrics"),
      validationMetrics: jsonb2("validation_metrics"),
      parameters: jsonb2("parameters"),
      changelog: text2("changelog"),
      createdBy: varchar2("created_by"),
      deployedAt: timestamp2("deployed_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAiModelVersionSchema = createInsertSchema(
      aiModelVersions
    ).omit({ id: true, createdAt: true });
    userTasteProfiles = pgTable2("user_taste_profiles", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().unique(),
      genreScores: jsonb2("genre_scores").default({}),
      moodScores: jsonb2("mood_scores").default({}),
      preferredTempoMin: integer2("preferred_tempo_min").default(80),
      preferredTempoMax: integer2("preferred_tempo_max").default(150),
      preferredKeys: text2("preferred_keys").array().default([]),
      followedProducers: text2("followed_producers").array().default([]),
      priceSensitivity: real("price_sensitivity").default(0.5),
      totalInteractions: integer2("total_interactions").default(0),
      purchaseCount: integer2("purchase_count").default(0),
      tasteEmbedding: jsonb2("taste_embedding"),
      lastUpdated: timestamp2("last_updated").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertUserTasteProfileSchema = createInsertSchema(
      userTasteProfiles
    ).omit({ id: true, createdAt: true });
    beatInteractions = pgTable2("beat_interactions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      beatId: varchar2("beat_id").notNull(),
      interactionType: text2("interaction_type").notNull(),
      playDurationSeconds: integer2("play_duration_seconds"),
      completionRate: real("completion_rate"),
      source: text2("source").default("browse"),
      sessionId: varchar2("session_id"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertBeatInteractionSchema = createInsertSchema(
      beatInteractions
    ).omit({ id: true, createdAt: true });
    userStorage = pgTable2("user_storage", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().unique(),
      storagePrefix: text2("storage_prefix").notNull(),
      totalBytes: bigint2("total_bytes", { mode: "number" }).default(0),
      fileCount: integer2("file_count").default(0),
      quotaBytes: bigint2("quota_bytes", { mode: "number" }).default(5368709120),
      isActive: boolean2("is_active").default(true),
      lastAccessedAt: timestamp2("last_accessed_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertUserStorageSchema = createInsertSchema(userStorage).omit({
      id: true,
      createdAt: true
    });
    userStorageFiles = pgTable2("user_storage_files", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      storageId: varchar2("storage_id").notNull(),
      fileName: text2("file_name").notNull(),
      fileKey: text2("file_key").notNull().unique(),
      mimeType: text2("mime_type"),
      sizeBytes: bigint2("size_bytes", { mode: "number" }).default(0),
      folder: text2("folder").default("/"),
      isPublic: boolean2("is_public").default(false),
      metadata: jsonb2("metadata"),
      uploadedAt: timestamp2("uploaded_at").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow(),
      deletedAt: timestamp2("deleted_at")
    });
    insertUserStorageFileSchema = createInsertSchema(
      userStorageFiles
    ).omit({ id: true, createdAt: true });
    beatDiscoveryScores = pgTable2("beat_discovery_scores", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      beatId: varchar2("beat_id").notNull(),
      userId: varchar2("user_id").notNull(),
      tasteMatchScore: real("taste_match_score").default(0),
      freshnessScore: real("freshness_score").default(1),
      popularityScore: real("popularity_score").default(0),
      producerAffinityScore: real("producer_affinity_score").default(0),
      discoveryScore: real("discovery_score").default(0),
      calculatedAt: timestamp2("calculated_at").defaultNow(),
      expiresAt: timestamp2("expires_at")
    });
    insertBeatDiscoveryScoreSchema = createInsertSchema(
      beatDiscoveryScores
    ).omit({ id: true });
    playlistJourneys = pgTable2("playlist_journeys", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      trackId: varchar2("track_id").notNull(),
      playlistId: text2("playlist_id").notNull(),
      playlistName: text2("playlist_name").notNull(),
      platform: text2("platform").notNull(),
      playlistType: text2("playlist_type").default("editorial"),
      followerCount: integer2("follower_count").default(0),
      position: integer2("position"),
      previousPosition: integer2("previous_position"),
      addedAt: timestamp2("added_at").notNull(),
      removedAt: timestamp2("removed_at"),
      streamsFromPlaylist: integer2("streams_from_playlist").default(0),
      revenueFromPlaylist: real("revenue_from_playlist").default(0),
      daysOnPlaylist: integer2("days_on_playlist").default(0),
      peakPosition: integer2("peak_position"),
      curatorName: text2("curator_name"),
      curatorId: text2("curator_id"),
      isActive: boolean2("is_active").default(true),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertPlaylistJourneySchema = createInsertSchema(
      playlistJourneys
    ).omit({ id: true, createdAt: true, updatedAt: true });
    syncPlacements = pgTable2("sync_placements", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      trackId: varchar2("track_id").notNull(),
      trackTitle: text2("track_title").notNull(),
      placementType: text2("placement_type").notNull(),
      mediaTitle: text2("media_title").notNull(),
      mediaType: text2("media_type").notNull(),
      network: text2("network"),
      season: integer2("season"),
      episode: integer2("episode"),
      airDate: timestamp2("air_date"),
      duration: integer2("duration"),
      placement: text2("placement"),
      licenseFee: real("license_fee"),
      territory: text2("territory").default("worldwide"),
      exclusivity: text2("exclusivity"),
      streamsBefore: integer2("streams_before").default(0),
      streamsAfter: integer2("streams_after").default(0),
      streamLift: real("stream_lift").default(0),
      revenueBefore: real("revenue_before").default(0),
      revenueAfter: real("revenue_after").default(0),
      revenueLift: real("revenue_lift").default(0),
      shazamsBefore: integer2("shazams_before").default(0),
      shazamsAfter: integer2("shazams_after").default(0),
      impactScore: real("impact_score").default(0),
      licensingAgency: text2("licensing_agency"),
      musicSupervisor: text2("music_supervisor"),
      verificationStatus: text2("verification_status").default("pending"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertSyncPlacementSchema = createInsertSchema(
      syncPlacements
    ).omit({ id: true, createdAt: true, updatedAt: true });
    historicalAnalytics = pgTable2("historical_analytics", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      trackId: varchar2("track_id"),
      releaseId: varchar2("release_id"),
      date: date("date").notNull(),
      period: text2("period").notNull(),
      platform: text2("platform"),
      streams: bigint2("streams", { mode: "number" }).default(0),
      listeners: integer2("listeners").default(0),
      followers: integer2("followers").default(0),
      revenue: real("revenue").default(0),
      saves: integer2("saves").default(0),
      shares: integer2("shares").default(0),
      playlistAdds: integer2("playlist_adds").default(0),
      playlistReach: integer2("playlist_reach").default(0),
      shazams: integer2("shazams").default(0),
      radioSpins: integer2("radio_spins").default(0),
      youtubeViews: integer2("youtube_views").default(0),
      socialMentions: integer2("social_mentions").default(0),
      globalRank: integer2("global_rank"),
      genreRank: integer2("genre_rank"),
      countryRank: integer2("country_rank"),
      maxScore: real("max_score"),
      milestones: jsonb2("milestones"),
      demographicsSnapshot: jsonb2("demographics_snapshot"),
      geographySnapshot: jsonb2("geography_snapshot"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertHistoricalAnalyticSchema = createInsertSchema(
      historicalAnalytics
    ).omit({ id: true, createdAt: true });
    arDiscoveries = pgTable2("ar_discoveries", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistId: varchar2("artist_id").notNull(),
      artistName: text2("artist_name").notNull(),
      discoveredByUserId: varchar2("discovered_by_user_id"),
      discoveryDate: timestamp2("discovery_date").defaultNow(),
      genre: text2("genre"),
      subGenres: text2("sub_genres").array(),
      location: text2("location"),
      country: text2("country"),
      overallScore: real("overall_score").default(0),
      growthScore: real("growth_score").default(0),
      engagementScore: real("engagement_score").default(0),
      virality: real("virality_score").default(0),
      audienceQualityScore: real("audience_quality_score").default(0),
      playlistPotentialScore: real("playlist_potential_score").default(0),
      syncPotentialScore: real("sync_potential_score").default(0),
      signingPotentialScore: real("signing_potential_score").default(0),
      monthlyListeners: integer2("monthly_listeners").default(0),
      monthlyListenersGrowth: real("monthly_listeners_growth").default(0),
      followerCount: integer2("follower_count").default(0),
      followerGrowth: real("follower_growth").default(0),
      totalStreams: bigint2("total_streams", { mode: "number" }).default(0),
      avgStreamsPerTrack: integer2("avg_streams_per_track").default(0),
      playlistCount: integer2("playlist_count").default(0),
      editorialPlaylistCount: integer2("editorial_playlist_count").default(0),
      socialFollowers: integer2("social_followers").default(0),
      socialEngagementRate: real("social_engagement_rate").default(0),
      topMarkets: jsonb2("top_markets"),
      audienceDemographics: jsonb2("audience_demographics"),
      similarArtists: text2("similar_artists").array(),
      breakoutTracks: jsonb2("breakout_tracks"),
      growthTrajectory: text2("growth_trajectory"),
      predictedPeakDate: timestamp2("predicted_peak_date"),
      riskFactors: jsonb2("risk_factors"),
      strengthFactors: jsonb2("strength_factors"),
      recommendedActions: jsonb2("recommended_actions"),
      isWatching: boolean2("is_watching").default(false),
      isSigned: boolean2("is_signed").default(false),
      notes: text2("notes"),
      status: text2("status").default("discovered"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertArDiscoverySchema = createInsertSchema(arDiscoveries).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    platformDataSources = pgTable2("platform_data_sources", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      trackId: varchar2("track_id"),
      date: timestamp2("date").notNull().defaultNow(),
      platform: text2("platform").notNull(),
      shazamCount: integer2("shazam_count").default(0),
      shazamRank: integer2("shazam_rank"),
      radioSpins: integer2("radio_spins").default(0),
      radioAudience: integer2("radio_audience").default(0),
      radioStations: integer2("radio_stations").default(0),
      wikipediaPageViews: integer2("wikipedia_page_views").default(0),
      beatportRank: integer2("beatport_rank"),
      beatportSales: integer2("beatport_sales").default(0),
      bandsinTownFollowers: integer2("bandsintown_followers").default(0),
      upcomingShows: integer2("upcoming_shows").default(0),
      songkickFollowers: integer2("songkick_followers").default(0),
      qqMusicPlays: integer2("qq_music_plays").default(0),
      qqMusicFans: integer2("qq_music_fans").default(0),
      tidalStreams: integer2("tidal_streams").default(0),
      tidalFavorites: integer2("tidal_favorites").default(0),
      pandoraSpins: integer2("pandora_spins").default(0),
      pandoraStations: integer2("pandora_stations").default(0),
      deezerStreams: integer2("deezer_streams").default(0),
      deezerFans: integer2("deezer_fans").default(0),
      soundcloudPlays: integer2("soundcloud_plays").default(0),
      soundcloudLikes: integer2("soundcloud_likes").default(0),
      soundcloudReposts: integer2("soundcloud_reposts").default(0),
      audiomackPlays: integer2("audiomack_plays").default(0),
      napsterStreams: integer2("napster_streams").default(0),
      amazonMusicStreams: integer2("amazon_music_streams").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertPlatformDataSourceSchema = createInsertSchema(
      platformDataSources
    ).omit({ id: true, createdAt: true });
    globalRankings = pgTable2("global_rankings", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      artistId: varchar2("artist_id"),
      trackId: varchar2("track_id"),
      date: date("date").notNull(),
      maxScore: real("max_score").default(0),
      globalRank: integer2("global_rank"),
      genreRank: integer2("genre_rank"),
      countryRank: integer2("country_rank"),
      genre: text2("genre"),
      country: text2("country"),
      platformScores: jsonb2("platform_scores"),
      streamingScore: real("streaming_score").default(0),
      socialScore: real("social_score").default(0),
      playlistScore: real("playlist_score").default(0),
      shazamScore: real("shazam_score").default(0),
      radioScore: real("radio_score").default(0),
      viralScore: real("viral_score").default(0),
      growthRate: real("growth_rate").default(0),
      previousRank: integer2("previous_rank"),
      rankChange: integer2("rank_change").default(0),
      peakRank: integer2("peak_rank"),
      weeksOnChart: integer2("weeks_on_chart").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertGlobalRankingSchema = createInsertSchema(
      globalRankings
    ).omit({ id: true, createdAt: true });
    nlpQueryLogs = pgTable2("nlp_query_logs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      query: text2("query").notNull(),
      parsedIntent: text2("parsed_intent"),
      parsedEntities: jsonb2("parsed_entities"),
      responseType: text2("response_type"),
      responseData: jsonb2("response_data"),
      executionTimeMs: integer2("execution_time_ms"),
      wasSuccessful: boolean2("was_successful").default(true),
      errorMessage: text2("error_message"),
      feedback: text2("feedback"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertNlpQueryLogSchema = createInsertSchema(nlpQueryLogs).omit({
      id: true,
      createdAt: true
    });
    preSavePages = pgTable2("pre_save_pages", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      userId: varchar2("user_id").notNull(),
      slug: text2("slug").unique().notNull(),
      title: text2("title").notNull(),
      artistName: text2("artist_name").notNull(),
      coverArtUrl: text2("cover_art_url"),
      releaseDate: timestamp2("release_date"),
      description: text2("description"),
      backgroundColor: text2("background_color").default("#1a1a2e"),
      textColor: text2("text_color").default("#ffffff"),
      buttonColor: text2("button_color").default("#4ecdc4"),
      spotifyPreSaveUrl: text2("spotify_presave_url"),
      appleMusicPreAddUrl: text2("apple_music_preadd_url"),
      deezerPreSaveUrl: text2("deezer_presave_url"),
      amazonMusicUrl: text2("amazon_music_url"),
      youtubeUrl: text2("youtube_url"),
      tidalUrl: text2("tidal_url"),
      socialLinks: jsonb2("social_links"),
      customLinks: jsonb2("custom_links"),
      emailCapture: boolean2("email_capture").default(true),
      emailList: jsonb2("email_list").default([]),
      views: integer2("views").default(0),
      preSaves: integer2("pre_saves").default(0),
      emailSignups: integer2("email_signups").default(0),
      clicksByPlatform: jsonb2("clicks_by_platform").default({}),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertPreSavePageSchema = createInsertSchema(preSavePages).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    promoCards = pgTable2("promo_cards", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      userId: varchar2("user_id").notNull(),
      type: text2("type").notNull(),
      template: text2("template").default("minimal"),
      coverArtUrl: text2("cover_art_url"),
      artistName: text2("artist_name").notNull(),
      trackTitle: text2("track_title").notNull(),
      releaseDate: text2("release_date"),
      customText: text2("custom_text"),
      backgroundColor: text2("background_color").default("#1a1a2e"),
      textColor: text2("text_color").default("#ffffff"),
      accentColor: text2("accent_color").default("#4ecdc4"),
      fontFamily: text2("font_family").default("Inter"),
      generatedImageUrl: text2("generated_image_url"),
      width: integer2("width").notNull(),
      height: integer2("height").notNull(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertPromoCardSchema = createInsertSchema(promoCards).omit({
      id: true,
      createdAt: true
    });
    miniVideos = pgTable2("mini_videos", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      userId: varchar2("user_id").notNull(),
      type: text2("type").notNull(),
      duration: integer2("duration").default(15),
      aspectRatio: text2("aspect_ratio").notNull(),
      coverArtUrl: text2("cover_art_url"),
      audioPreviewUrl: text2("audio_preview_url"),
      audioStartTime: real("audio_start_time").default(0),
      backgroundColor: text2("background_color").default("#1a1a2e"),
      accentColor: text2("accent_color").default("#4ecdc4"),
      textOverlay: text2("text_overlay"),
      animationStyle: text2("animation_style").default("wave"),
      generatedVideoUrl: text2("generated_video_url"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertMiniVideoSchema = createInsertSchema(miniVideos).omit({
      id: true,
      createdAt: true
    });
    spotifyCanvases = pgTable2("spotify_canvases", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      trackId: varchar2("track_id").notNull(),
      userId: varchar2("user_id").notNull(),
      type: text2("type").notNull(),
      sourceUrl: text2("source_url").notNull(),
      duration: integer2("duration").default(8),
      loopPoint: real("loop_point").default(0),
      generatedCanvasUrl: text2("generated_canvas_url"),
      status: text2("status").default("draft"),
      submittedAt: timestamp2("submitted_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSpotifyCanvasSchema = createInsertSchema(
      spotifyCanvases
    ).omit({ id: true, createdAt: true });
    lyricsSyncs = pgTable2("lyrics_syncs", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      trackId: varchar2("track_id").notNull(),
      releaseId: varchar2("release_id").notNull(),
      userId: varchar2("user_id").notNull(),
      language: text2("language").notNull(),
      lyrics: jsonb2("lyrics").default([]),
      plainText: text2("plain_text").notNull(),
      syncMethod: text2("sync_method").default("manual"),
      status: text2("status").default("draft"),
      platforms: jsonb2("platforms").default([
        "spotify",
        "apple_music",
        "amazon_music",
        "youtube_music"
      ]),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertLyricsSyncSchema = createInsertSchema(lyricsSyncs).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    artistScores = pgTable2("artist_scores", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      date: date("date").notNull(),
      artistScore: real("artist_score").default(0),
      careerStage: text2("career_stage").default("undiscovered"),
      streamingScore: real("streaming_score").default(0),
      socialScore: real("social_score").default(0),
      playlistScore: real("playlist_score").default(0),
      radioScore: real("radio_score").default(0),
      growthVelocity: real("growth_velocity").default(0),
      momentumScore: real("momentum_score").default(0),
      triggerCities: jsonb2("trigger_cities"),
      breakoutMarkets: jsonb2("breakout_markets"),
      audienceDemographics: jsonb2("audience_demographics"),
      competitorBenchmark: jsonb2("competitor_benchmark"),
      milestones: jsonb2("milestones"),
      predictions: jsonb2("predictions"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertArtistScoreSchema = createInsertSchema(artistScores).omit({
      id: true,
      createdAt: true
    });
    marketplaceRecommendations = pgTable2(
      "marketplace_recommendations",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        listingId: varchar2("listing_id"),
        recommendationType: text2("recommendation_type").notNull(),
        score: real("score").default(0),
        reason: text2("reason"),
        metadata: jsonb2("metadata"),
        impressions: integer2("impressions").default(0),
        clicks: integer2("clicks").default(0),
        conversions: integer2("conversions").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        expiresAt: timestamp2("expires_at")
      }
    );
    insertMarketplaceRecommendationSchema = createInsertSchema(
      marketplaceRecommendations
    ).omit({ id: true, createdAt: true });
    beatPromotions = pgTable2("beat_promotions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      listingId: varchar2("listing_id").notNull(),
      campaignType: text2("campaign_type").notNull(),
      budget: real("budget").default(0),
      spent: real("spent").default(0),
      targetGenres: jsonb2("target_genres"),
      targetCountries: jsonb2("target_countries"),
      placement: text2("placement"),
      impressions: integer2("impressions").default(0),
      clicks: integer2("clicks").default(0),
      conversions: integer2("conversions").default(0),
      status: text2("status").default("draft"),
      startDate: timestamp2("start_date"),
      endDate: timestamp2("end_date"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertBeatPromotionSchema = createInsertSchema(
      beatPromotions
    ).omit({ id: true, createdAt: true });
    bogoPromotions = pgTable2("bogo_promotions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      storefrontId: varchar2("storefront_id").notNull(),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      description: text2("description"),
      promoType: text2("promo_type").notNull().default("buy_x_get_y_free"),
      buyQuantity: integer2("buy_quantity").notNull().default(1),
      getQuantity: integer2("get_quantity").notNull().default(1),
      getDiscountPercent: integer2("get_discount_percent").notNull().default(100),
      appliesTo: text2("applies_to").notNull().default("all"),
      applicableListingIds: jsonb2("applicable_listing_ids").$type().default([]),
      applicableGenres: jsonb2("applicable_genres").$type().default([]),
      buyLicenseType: text2("buy_license_type"),
      bogoLicenseType: text2("bogo_license_type"),
      maxRedemptions: integer2("max_redemptions"),
      redemptionCount: integer2("redemption_count").default(0),
      perCustomerLimit: integer2("per_customer_limit"),
      stackable: boolean2("stackable").default(false),
      priority: integer2("priority").default(0),
      status: text2("status").notNull().default("active"),
      startAt: timestamp2("start_at"),
      endAt: timestamp2("end_at"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertBogoPromotionSchema = createInsertSchema(
      bogoPromotions
    ).omit({ id: true, createdAt: true, updatedAt: true, redemptionCount: true });
    systemSettings = pgTable2("system_settings", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      key: text2("key").notNull().unique(),
      value: jsonb2("value"),
      description: text2("description"),
      updatedBy: varchar2("updated_by"),
      updatedAt: timestamp2("updated_at").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSystemSettingSchema = createInsertSchema(
      systemSettings
    ).omit({ id: true, createdAt: true });
    socialAutopilotContent = pgTable2("social_autopilot_content", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      type: text2("type").notNull(),
      // snippet, performance, bts, meme, story, lyric, reaction, educational
      format: text2("format").notNull(),
      // text, image, short_video, long_video, audio
      trackUsed: varchar2("track_used"),
      hookType: text2("hook_type").notNull(),
      // emotional, controversial, pov, storytelling, flex, transformation, process
      tone: text2("tone").notNull(),
      // sad, hype, romantic, angry, nostalgic, inspirational
      platform: text2("platform").notNull(),
      // tiktok, instagram, youtube, twitter, facebook, threads
      postingTime: timestamp2("posting_time"),
      lengthSeconds: integer2("length_seconds"),
      performance: jsonb2("performance"),
      // {views, likes, comments, shares, saves, profile_visits, follower_gain, music_actions}
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertSocialAutopilotContentSchema = createInsertSchema(
      socialAutopilotContent
    ).omit({ id: true, createdAt: true, updatedAt: true });
    fanSegments = pgTable2("fan_segments", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      tasteVector: jsonb2("taste_vector"),
      // {artists: [], genres: [], moods: []}
      behavioralSignals: jsonb2("behavioral_signals"),
      // {avg_watch_time, comment_frequency, save_rate, dm_intent_score}
      preferredContentPatterns: jsonb2("preferred_content_patterns"),
      // array of pattern objects
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertFanSegmentSchema = createInsertSchema(fanSegments).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    musicImpactMetrics = pgTable2("music_impact_metrics", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      contentId: varchar2("content_id").notNull(),
      // FK to socialAutopilotContent
      savesWeighted: real("saves_weighted").default(0),
      playlistAddsWeighted: real("playlist_adds_weighted").default(0),
      profileVisitsWeighted: real("profile_visits_weighted").default(0),
      followerGrowthWeighted: real("follower_growth_weighted").default(0),
      highIntentDmsWeighted: real("high_intent_dms_weighted").default(0),
      totalScore: real("total_score").default(0),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertMusicImpactMetricSchema = createInsertSchema(
      musicImpactMetrics
    ).omit({ id: true, createdAt: true });
    socialPatternAggregates = pgTable2("social_pattern_aggregates", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      patternHash: text2("pattern_hash").notNull(),
      // hash of hook_type, tone, format, track_used
      hookType: text2("hook_type").notNull(),
      tone: text2("tone").notNull(),
      format: text2("format").notNull(),
      trackUsed: varchar2("track_used"),
      totalPosts: integer2("total_posts").default(0),
      totalImpact: real("total_impact").default(0),
      avgImpact: real("avg_impact").default(0),
      impactStd: real("impact_std").default(0),
      timeDecayFactor: real("time_decay_factor").default(1),
      lastUpdated: timestamp2("last_updated").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSocialPatternAggregateSchema = createInsertSchema(
      socialPatternAggregates
    ).omit({ id: true, createdAt: true });
    generationArmStats = pgTable2(
      "generation_arm_stats",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        domain: text2("domain").notNull(),
        scope: text2("scope").notNull(),
        armKey: text2("arm_key").notNull(),
        trials: integer2("trials").notNull().default(0),
        rewardSum: real("reward_sum").notNull().default(0),
        lastSelectedAt: timestamp2("last_selected_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (table) => ({
        armUnique: unique2("generation_arm_stats_unique").on(
          table.domain,
          table.scope,
          table.armKey
        ),
        scopeIdx: index2("generation_arm_stats_scope_idx").on(
          table.domain,
          table.scope
        )
      })
    );
    insertGenerationArmStatSchema = createInsertSchema(
      generationArmStats
    ).omit({ id: true, createdAt: true, updatedAt: true });
    generationHistory = pgTable2(
      "generation_history",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id"),
        domain: text2("domain").notNull(),
        signatureHash: text2("signature_hash").notNull(),
        armKey: text2("arm_key"),
        attributes: jsonb2("attributes"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (table) => ({
        lookupIdx: index2("generation_history_lookup_idx").on(
          table.userId,
          table.domain,
          table.createdAt
        )
      })
    );
    insertGenerationHistorySchema = createInsertSchema(
      generationHistory
    ).omit({ id: true, createdAt: true });
    organicAssets = pgTable2("organic_assets", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      type: text2("type").notNull(),
      // seo_article, youtube_video, playlist, creator_placement, ugc_challenge, blog_post, mini_app, tool
      topic: text2("topic").notNull(),
      trackUsed: varchar2("track_used"),
      intent: text2("intent").notNull(),
      // discovery, education, emotional, niche, search
      creationCostHours: real("creation_cost_hours").default(0),
      distributionCost: real("distribution_cost").default(0),
      performance: jsonb2("performance"),
      // {monthly_views, monthly_clickthrough, streaming_conversions, playlist_adds, email_signups, revenue_generated}
      decayCurve: jsonb2("decay_curve"),
      // {half_life_days, stability_score}
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertOrganicAssetSchema = createInsertSchema(organicAssets).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    organicChannels = pgTable2("organic_channels", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      type: text2("type").notNull(),
      // search, community, creator, playlist, blog, social
      estimatedMonthlyReach: integer2("estimated_monthly_reach").default(0),
      audienceQualityScore: real("audience_quality_score").default(0),
      efficiencyScore: real("efficiency_score").default(0),
      historicalPerformance: jsonb2("historical_performance"),
      // {avg_streams_generated, avg_revenue_generated, avg_ltv_of_users}
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertOrganicChannelSchema = createInsertSchema(
      organicChannels
    ).omit({ id: true, createdAt: true, updatedAt: true });
    organicRoiSnapshots = pgTable2("organic_roi_snapshots", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      assetId: varchar2("asset_id").notNull(),
      // FK to organicAssets
      revenueOverPeriod: real("revenue_over_period").default(0),
      creationCost: real("creation_cost").default(0),
      distributionCost: real("distribution_cost").default(0),
      effectiveRoi: real("effective_roi").default(0),
      periodStart: timestamp2("period_start").notNull(),
      periodEnd: timestamp2("period_end").notNull(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertOrganicRoiSnapshotSchema = createInsertSchema(
      organicRoiSnapshots
    ).omit({ id: true, createdAt: true });
    organicAssetLifetime = pgTable2("organic_asset_lifetime", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      assetId: varchar2("asset_id").notNull(),
      // FK to organicAssets
      lifetimeStreams: integer2("lifetime_streams").default(0),
      lifetimeRevenue: real("lifetime_revenue").default(0),
      totalCreationCostHours: real("total_creation_cost_hours").default(0),
      totalDistributionCost: real("total_distribution_cost").default(0),
      effectiveRoi: real("effective_roi").default(0),
      firstSeen: timestamp2("first_seen").defaultNow(),
      lastSeen: timestamp2("last_seen").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertOrganicAssetLifetimeSchema = createInsertSchema(
      organicAssetLifetime
    ).omit({ id: true, createdAt: true });
    autopilotCrossInsights = pgTable2("autopilot_cross_insights", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      insightType: text2("insight_type").notNull(),
      // social_to_organic, organic_to_social
      topHooks: jsonb2("top_hooks"),
      // array of hook patterns with avg_music_impact
      topTracksByImpact: jsonb2("top_tracks_by_impact"),
      // array of track_id with avg_impact
      generatedAt: timestamp2("generated_at").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAutopilotCrossInsightSchema = createInsertSchema(
      autopilotCrossInsights
    ).omit({ id: true, createdAt: true });
    socialMentions = pgTable2("social_mentions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      platform: text2("platform").notNull(),
      author: text2("author"),
      authorHandle: text2("author_handle"),
      authorAvatar: text2("author_avatar"),
      authorFollowers: integer2("author_followers").default(0),
      content: text2("content"),
      sentiment: text2("sentiment").default("neutral"),
      sentimentScore: real("sentiment_score").default(0),
      keywords: jsonb2("keywords"),
      reach: integer2("reach").default(0),
      engagement: integer2("engagement").default(0),
      url: text2("url"),
      isInfluencer: boolean2("is_influencer").default(false),
      responded: boolean2("responded").default(false),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSocialMentionSchema = createInsertSchema(
      socialMentions
    ).omit({ id: true, createdAt: true });
    socialKeywords = pgTable2("social_keywords", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      keyword: text2("keyword").notNull(),
      isActive: boolean2("is_active").default(true),
      mentionCount: integer2("mention_count").default(0),
      lastMentionAt: timestamp2("last_mention_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSocialKeywordSchema = createInsertSchema(
      socialKeywords
    ).omit({ id: true, createdAt: true });
    competitorProfiles = pgTable2("competitor_profiles", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      handle: text2("handle"),
      platforms: jsonb2("platforms"),
      followers: integer2("followers").default(0),
      followersGrowth: real("followers_growth").default(0),
      engagementRate: real("engagement_rate").default(0),
      postsPerWeek: real("posts_per_week").default(0),
      avgLikes: integer2("avg_likes").default(0),
      avgComments: integer2("avg_comments").default(0),
      avgShares: integer2("avg_shares").default(0),
      contentMix: jsonb2("content_mix"),
      topHashtags: jsonb2("top_hashtags"),
      lastUpdated: timestamp2("last_updated"),
      isActive: boolean2("is_active").default(true),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertCompetitorProfileSchema = createInsertSchema(
      competitorProfiles
    ).omit({ id: true, createdAt: true });
    socialInboxMessages = pgTable2("social_inbox_messages", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      platform: text2("platform").notNull(),
      messageType: text2("message_type").notNull(),
      content: text2("content"),
      authorId: text2("author_id"),
      authorName: text2("author_name"),
      authorHandle: text2("author_handle"),
      authorAvatar: text2("author_avatar"),
      authorFollowers: integer2("author_followers").default(0),
      authorVerified: boolean2("author_verified").default(false),
      postContent: text2("post_content"),
      postUrl: text2("post_url"),
      sentiment: text2("sentiment").default("neutral"),
      priority: text2("priority").default("medium"),
      status: text2("status").default("unread"),
      assignedTo: varchar2("assigned_to"),
      tags: jsonb2("tags"),
      threadId: varchar2("thread_id"),
      parentMessageId: varchar2("parent_message_id"),
      repliedAt: timestamp2("replied_at"),
      // Saved reply text — there is no platform-delivery integration yet, so
      // this preserves what the user wrote instead of discarding it once the
      // message is marked "replied".
      replyContent: text2("reply_content"),
      replyDelivered: boolean2("reply_delivered").default(false),
      replyDeliveryState: text2("reply_delivery_state").notNull().default("draft"),
      providerReplyId: text2("provider_reply_id"),
      replyDeliveryError: text2("reply_delivery_error"),
      readAt: timestamp2("read_at"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSocialInboxMessageSchema = createInsertSchema(
      socialInboxMessages
    ).omit({ id: true, createdAt: true });
    socialReplyTemplates = pgTable2(
      "social_reply_templates",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        content: text2("content").notNull(),
        category: text2("category").default("general"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("social_reply_templates_user_id_created_at_idx").on(
          t.userId,
          t.createdAt
        )
      ]
    );
    insertSocialReplyTemplateSchema = createInsertSchema(
      socialReplyTemplates
    ).omit({ id: true, createdAt: true });
    onboardingTasks = pgTable2("onboarding_tasks", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      description: text2("description"),
      category: text2("category").notNull(),
      points: integer2("points").default(0),
      order: integer2("order").default(0),
      isRequired: boolean2("is_required").default(false),
      actionUrl: text2("action_url"),
      icon: text2("icon"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertOnboardingTaskSchema = createInsertSchema(
      onboardingTasks
    ).omit({ id: true, createdAt: true, updatedAt: true });
    userOnboarding = pgTable2("user_onboarding", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().unique(),
      currentStep: integer2("current_step").default(0),
      completedSteps: jsonb2("completed_steps").$type().default([]),
      totalPoints: integer2("total_points").default(0),
      startedAt: timestamp2("started_at").defaultNow(),
      completedAt: timestamp2("completed_at"),
      skippedAt: timestamp2("skipped_at"),
      dayStreak: integer2("day_streak").default(0),
      lastActivityAt: timestamp2("last_activity_at").defaultNow(),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertUserOnboardingSchema = createInsertSchema(
      userOnboarding
    ).omit({ id: true, createdAt: true, updatedAt: true });
    artistProgressSnapshots = pgTable2("artist_progress_snapshots", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      snapshotDate: date("snapshot_date").notNull(),
      totalStreams: bigint2("total_streams", { mode: "number" }).default(0),
      totalFollowers: integer2("total_followers").default(0),
      totalRevenue: real("total_revenue").default(0),
      totalReleases: integer2("total_releases").default(0),
      engagementScore: real("engagement_score").default(0),
      growthRate: real("growth_rate").default(0),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertArtistProgressSnapshotSchema = createInsertSchema(
      artistProgressSnapshots
    ).omit({ id: true, createdAt: true });
    achievements = pgTable2("achievements", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      name: text2("name").notNull(),
      description: text2("description"),
      category: text2("category").notNull(),
      iconUrl: text2("icon_url"),
      points: integer2("points").default(0),
      requirement: jsonb2("requirement"),
      tier: text2("tier").default("bronze"),
      isActive: boolean2("is_active").default(true),
      sortOrder: integer2("sort_order").default(0),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAchievementSchema = createInsertSchema(achievements).omit({
      id: true,
      createdAt: true
    });
    userAchievements = pgTable2("user_achievements", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      achievementId: varchar2("achievement_id").notNull(),
      progress: real("progress").default(0),
      unlockedAt: timestamp2("unlocked_at"),
      notified: boolean2("notified").default(false),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertUserAchievementSchema = createInsertSchema(
      userAchievements
    ).omit({ id: true, createdAt: true });
    userStreaks = pgTable2("user_streaks", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      streakType: text2("streak_type").notNull(),
      currentStreak: integer2("current_streak").default(0),
      longestStreak: integer2("longest_streak").default(0),
      lastActivityDate: date("last_activity_date"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertUserStreakSchema = createInsertSchema(userStreaks).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    careerCoachRecommendations = pgTable2(
      "career_coach_recommendations",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        type: text2("type").notNull(),
        title: text2("title").notNull(),
        description: text2("description").notNull(),
        priority: integer2("priority").default(1),
        actionUrl: text2("action_url"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow(),
        dismissedAt: timestamp2("dismissed_at"),
        completedAt: timestamp2("completed_at")
      }
    );
    insertCareerCoachRecommendationSchema = createInsertSchema(
      careerCoachRecommendations
    ).omit({ id: true, createdAt: true });
    careerGoals = pgTable2("career_goals", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      goalType: text2("goal_type").notNull(),
      title: text2("title").notNull(),
      description: text2("description"),
      targetValue: real("target_value").notNull(),
      currentValue: real("current_value").default(0),
      unit: text2("unit"),
      deadline: timestamp2("deadline"),
      status: text2("status").default("active"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertCareerGoalSchema = createInsertSchema(careerGoals).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    emailPreferences = pgTable2("email_preferences", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().unique(),
      weeklyInsights: boolean2("weekly_insights").default(true),
      weeklyInsightsFrequency: text2("weekly_insights_frequency").default("weekly"),
      marketingEmails: boolean2("marketing_emails").default(true),
      releaseAlerts: boolean2("release_alerts").default(true),
      collaborationAlerts: boolean2("collaboration_alerts").default(true),
      revenueAlerts: boolean2("revenue_alerts").default(true),
      unsubscribedAt: timestamp2("unsubscribed_at"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertEmailPreferenceSchema = createInsertSchema(
      emailPreferences
    ).omit({ id: true, createdAt: true, updatedAt: true });
    sentEmails = pgTable2("sent_emails", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      emailType: text2("email_type").notNull(),
      subject: text2("subject").notNull(),
      recipientEmail: text2("recipient_email").notNull(),
      metadata: jsonb2("metadata"),
      sentAt: timestamp2("sent_at").defaultNow(),
      openedAt: timestamp2("opened_at"),
      clickedAt: timestamp2("clicked_at"),
      clickedLink: text2("clicked_link"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertSentEmailSchema = createInsertSchema(sentEmails).omit({
      id: true,
      createdAt: true,
      sentAt: true
    });
    artistConnections = pgTable2("artist_connections", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      requesterId: varchar2("requester_id").notNull(),
      receiverId: varchar2("receiver_id").notNull(),
      status: text2("status").default("pending"),
      message: text2("message"),
      createdAt: timestamp2("created_at").defaultNow(),
      acceptedAt: timestamp2("accepted_at")
    });
    insertArtistConnectionSchema = createInsertSchema(
      artistConnections
    ).omit({ id: true, createdAt: true });
    collaborationProjects = pgTable2("collaboration_projects", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      title: text2("title").notNull(),
      description: text2("description"),
      ownerId: varchar2("owner_id").notNull(),
      status: text2("status").default("open"),
      genre: text2("genre"),
      lookingFor: text2("looking_for").array(),
      maxMembers: integer2("max_members").default(10),
      isPublic: boolean2("is_public").default(true),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertCollaborationProjectSchema = createInsertSchema(
      collaborationProjects
    ).omit({ id: true, createdAt: true, updatedAt: true });
    projectMembers = pgTable2("project_members", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      userId: varchar2("user_id").notNull(),
      role: text2("role").default("member"),
      status: text2("status").default("active"),
      joinedAt: timestamp2("joined_at").defaultNow()
    });
    insertProjectMemberSchema = createInsertSchema(
      projectMembers
    ).omit({ id: true, joinedAt: true });
    collabSnapshots = pgTable2("collab_snapshots", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      documentState: text2("document_state").notNull(),
      documentHash: varchar2("document_hash", { length: 64 }),
      version: integer2("version").default(1),
      createdAt: timestamp2("created_at").defaultNow(),
      createdBy: varchar2("created_by")
    });
    insertCollabSnapshotSchema = createInsertSchema(
      collabSnapshots
    ).omit({ id: true, createdAt: true });
    releaseCountdowns = pgTable2("release_countdowns", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      releaseId: varchar2("release_id"),
      title: text2("title").notNull(),
      releaseDate: timestamp2("release_date").notNull(),
      artworkUrl: text2("artwork_url"),
      presaveUrl: text2("presave_url"),
      status: text2("status").default("active"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertReleaseCountdownSchema = createInsertSchema(
      releaseCountdowns
    ).omit({ id: true, createdAt: true });
    countdownTasks = pgTable2("countdown_tasks", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      countdownId: varchar2("countdown_id").notNull(),
      task: text2("task").notNull(),
      dueDate: timestamp2("due_date"),
      completedAt: timestamp2("completed_at"),
      order: integer2("order").default(0),
      category: text2("category"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertCountdownTaskSchema = createInsertSchema(
      countdownTasks
    ).omit({ id: true, createdAt: true });
    countdownAnalytics = pgTable2("countdown_analytics", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      countdownId: varchar2("countdown_id").notNull(),
      date: timestamp2("date").notNull().defaultNow(),
      presaves: integer2("presaves").default(0),
      shares: integer2("shares").default(0),
      pageViews: integer2("page_views").default(0),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertCountdownAnalyticSchema = createInsertSchema(
      countdownAnalytics
    ).omit({ id: true, createdAt: true });
    autopilotLearningData = pgTable2("autopilot_learning_data", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      platform: text2("platform").notNull(),
      contentType: text2("content_type"),
      hookType: text2("hook_type"),
      postingHour: integer2("posting_hour"),
      postingDayOfWeek: integer2("posting_day_of_week"),
      engagementRate: real("engagement_rate").default(0),
      impressions: integer2("impressions").default(0),
      clicks: integer2("clicks").default(0),
      shares: integer2("shares").default(0),
      likes: integer2("likes").default(0),
      comments: integer2("comments").default(0),
      saves: integer2("saves").default(0),
      reach: integer2("reach").default(0),
      hashtags: jsonb2("hashtags").$type(),
      contentText: text2("content_text"),
      mediaType: text2("media_type"),
      postId: varchar2("post_id"),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAutopilotLearningDataSchema = createInsertSchema(
      autopilotLearningData
    ).omit({ id: true, createdAt: true });
    autopilotInsights = pgTable2("autopilot_insights", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      insightType: text2("insight_type").notNull(),
      platform: text2("platform"),
      data: jsonb2("data").notNull(),
      confidence: real("confidence").default(0),
      priority: integer2("priority").default(0),
      isActive: boolean2("is_active").default(true),
      expiresAt: timestamp2("expires_at"),
      generatedAt: timestamp2("generated_at").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAutopilotInsightSchema = createInsertSchema(
      autopilotInsights
    ).omit({ id: true, createdAt: true, generatedAt: true });
    autopilotPreferences = pgTable2("autopilot_preferences", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().unique(),
      // Artist/Brand Identity
      artistName: text2("artist_name"),
      artistBio: text2("artist_bio"),
      genre: text2("genre"),
      subGenres: jsonb2("sub_genres").$type(),
      brandVoice: text2("brand_voice"),
      // 'professional' | 'casual' | 'energetic' | 'edgy' | 'inspirational'
      targetAudience: text2("target_audience"),
      uniqueSellingPoints: jsonb2("unique_selling_points").$type(),
      // Content Generation Guidelines
      contentTone: text2("content_tone"),
      // 'professional' | 'casual' | 'energetic' | 'promotional'
      preferredEmojis: jsonb2("preferred_emojis").$type(),
      avoidEmojis: boolean2("avoid_emojis").default(false),
      preferredHashtags: jsonb2("preferred_hashtags").$type(),
      avoidHashtags: jsonb2("avoid_hashtags").$type(),
      contentThemes: jsonb2("content_themes").$type(),
      // e.g. ['new releases', 'behind the scenes', 'fan engagement']
      avoidTopics: jsonb2("avoid_topics").$type(),
      callToActionStyle: text2("call_to_action_style"),
      // 'direct' | 'subtle' | 'question' | 'urgency'
      contentQualityThreshold: integer2("content_quality_threshold").default(90),
      // 0-100, minimum score before auto-posting
      // Platform-Specific Settings
      platformSettings: jsonb2("platform_settings").$type(),
      // Posting Schedule
      postingSchedule: jsonb2("posting_schedule").$type(),
      // Advertisement Autopilot Settings
      adAutopilotEnabled: boolean2("ad_autopilot_enabled").default(false),
      autoDistributionEnabled: boolean2("auto_distribution_enabled").default(false),
      organicGrowthPriority: text2("organic_growth_priority"),
      // 'reach' | 'engagement' | 'followers' | 'conversions'
      crossPostingEnabled: boolean2("cross_posting_enabled").default(true),
      viralOptimizationLevel: text2("viral_optimization_level"),
      // 'conservative' | 'moderate' | 'aggressive'
      // Content Examples (for AI to learn from)
      contentExamples: jsonb2("content_examples").$type(),
      // Current Promotions/Releases
      currentReleases: jsonb2("current_releases").$type(),
      // Custom Instructions
      customInstructions: text2("custom_instructions"),
      // Status
      isActive: boolean2("is_active").default(true),
      lastUpdated: timestamp2("last_updated").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertAutopilotPreferenceSchema = createInsertSchema(
      autopilotPreferences
    ).omit({ id: true, createdAt: true, lastUpdated: true });
    systemLogs = pgTable2("system_logs", {
      id: serial("id").primaryKey(),
      level: varchar2("level", { length: 10 }).notNull(),
      // debug, info, warn, error, fatal
      service: varchar2("service", { length: 50 }).notNull(),
      // api, auth, database, ai, storage, queue, email, social
      message: text2("message").notNull(),
      metadata: jsonb2("metadata"),
      timestamp: timestamp2("timestamp").defaultNow().notNull(),
      userId: varchar2("user_id"),
      requestId: varchar2("request_id")
    });
    insertSystemLogSchema = createInsertSchema(systemLogs).omit({
      id: true
    });
    auditLogs = pgTable2(
      "audit_logs",
      {
        id: serial("id").primaryKey(),
        timestamp: timestamp2("timestamp").defaultNow().notNull(),
        userId: varchar2("user_id", { length: 64 }).references(() => users.id, {
          onDelete: "set null"
        }),
        userEmail: varchar2("user_email", { length: 255 }),
        ip: varchar2("ip", { length: 64 }).notNull(),
        userAgent: text2("user_agent"),
        action: varchar2("action", { length: 64 }).notNull(),
        resource: varchar2("resource", { length: 64 }).notNull(),
        result: varchar2("result", { length: 16 }).notNull(),
        // success | failure | error
        risk: varchar2("risk", { length: 16 }).notNull(),
        // low | medium | high | critical
        sessionId: varchar2("session_id", { length: 128 }),
        details: jsonb2("details")
      },
      (t) => ({
        byTimestamp: index2("audit_logs_timestamp_idx").on(t.timestamp),
        byUser: index2("audit_logs_user_idx").on(t.userId, t.timestamp),
        byAction: index2("audit_logs_action_idx").on(t.action, t.timestamp),
        byRisk: index2("audit_logs_risk_idx").on(t.risk, t.timestamp)
      })
    );
    insertAuditLogSchema = createInsertSchema(auditLogs).omit({
      id: true,
      timestamp: true
    });
    splitSheets = pgTable2("split_sheets", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      releaseId: varchar2("release_id").notNull(),
      creatorId: varchar2("creator_id").notNull(),
      contractName: text2("contract_name").notNull(),
      participants: jsonb2("participants").notNull().default(sql2`'[]'::jsonb`),
      status: text2("status").notNull().default("pending_signature"),
      effectiveDate: timestamp2("effective_date").notNull(),
      signatures: jsonb2("signatures").notNull().default(sql2`'[]'::jsonb`),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    insertSplitSheetSchema = createInsertSchema(splitSheets).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    batchTemplates = pgTable2("batch_templates", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      description: text2("description"),
      resource: text2("resource").notNull(),
      action: text2("action").notNull().default("bulk_operation"),
      configuration: jsonb2("configuration").notNull().default(sql2`'{}'::jsonb`),
      isFavorite: boolean2("is_favorite").notNull().default(false),
      isShared: boolean2("is_shared").notNull().default(false),
      sharedBy: varchar2("shared_by"),
      usageCount: integer2("usage_count").notNull().default(0),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    insertBatchTemplateSchema = createInsertSchema(
      batchTemplates
    ).omit({ id: true, createdAt: true, updatedAt: true });
    shareLinks = pgTable2("share_links", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      shortCode: varchar2("short_code").notNull().unique(),
      url: text2("url").notNull(),
      name: text2("name").notNull(),
      resourceType: text2("resource_type").notNull(),
      resourceId: varchar2("resource_id").notNull(),
      userId: varchar2("user_id").notNull(),
      expiresAt: timestamp2("expires_at"),
      isPasswordProtected: boolean2("is_password_protected").notNull().default(false),
      passwordHash: text2("password_hash"),
      maxDownloads: integer2("max_downloads"),
      downloadCount: integer2("download_count").notNull().default(0),
      viewCount: integer2("view_count").notNull().default(0),
      isActive: boolean2("is_active").notNull().default(true),
      allowedEmails: jsonb2("allowed_emails"),
      requiresEmail: boolean2("requires_email").notNull().default(false),
      lastAccessedAt: timestamp2("last_accessed_at"),
      createdAt: timestamp2("created_at").defaultNow().notNull()
    });
    insertShareLinkSchema = createInsertSchema(shareLinks).omit({
      id: true,
      createdAt: true
    });
    collaborationComments = pgTable2("collaboration_comments", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      parentId: varchar2("parent_id"),
      elementId: varchar2("element_id"),
      userId: varchar2("user_id").notNull(),
      userName: text2("user_name").notNull(),
      userAvatar: text2("user_avatar"),
      content: text2("content").notNull(),
      mentions: jsonb2("mentions").notNull().default(sql2`'[]'::jsonb`),
      timestamp: integer2("timestamp"),
      resolved: boolean2("resolved").notNull().default(false),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    insertCollaborationCommentSchema = createInsertSchema(
      collaborationComments
    ).omit({ id: true, createdAt: true, updatedAt: true });
    collaborationVersions = pgTable2("collaboration_versions", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      projectId: varchar2("project_id").notNull(),
      version: integer2("version").notNull(),
      name: text2("name").notNull(),
      description: text2("description"),
      createdBy: varchar2("created_by").notNull(),
      createdByName: text2("created_by_name").notNull(),
      size: integer2("size"),
      changes: jsonb2("changes").default(sql2`'[]'::jsonb`),
      isAutoSave: boolean2("is_auto_save").notNull().default(false),
      isCurrent: boolean2("is_current").notNull().default(false),
      createdAt: timestamp2("created_at").defaultNow().notNull()
    });
    insertCollaborationVersionSchema = createInsertSchema(
      collaborationVersions
    ).omit({ id: true, createdAt: true });
    collaborationAccessRequests = pgTable2(
      "collaboration_access_requests",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        projectId: varchar2("project_id").notNull(),
        requesterId: varchar2("requester_id").notNull(),
        requesterName: text2("requester_name").notNull(),
        requesterEmail: text2("requester_email").notNull(),
        requestedAccess: text2("requested_access").notNull(),
        message: text2("message"),
        status: text2("status").notNull().default("pending"),
        respondedBy: varchar2("responded_by"),
        respondedAt: timestamp2("responded_at"),
        createdAt: timestamp2("created_at").defaultNow().notNull()
      }
    );
    insertCollaborationAccessRequestSchema = createInsertSchema(
      collaborationAccessRequests
    ).omit({ id: true, createdAt: true });
    searchHistory = pgTable2("search_history", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      query: text2("query").notNull(),
      resultCount: integer2("result_count").notNull().default(0),
      createdAt: timestamp2("created_at").defaultNow().notNull()
    });
    filterPresets = pgTable2("filter_presets", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      name: text2("name").notNull(),
      context: text2("context").notNull().default("global"),
      filters: jsonb2("filters").notNull().default(sql2`'{}'::jsonb`),
      isDefault: boolean2("is_default").notNull().default(false),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    musicWorkflowAutomations = pgTable2("music_workflow_automations", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      templateId: varchar2("template_id").notNull(),
      enabled: boolean2("enabled").notNull().default(false),
      config: jsonb2("config").notNull().default(sql2`'{}'::jsonb`),
      lastTriggeredAt: timestamp2("last_triggered_at"),
      triggerCount: integer2("trigger_count").notNull().default(0),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    musicWorkflowExecutionLogs = pgTable2(
      "music_workflow_execution_logs",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        templateId: varchar2("template_id").notNull(),
        eventType: varchar2("event_type").notNull(),
        status: varchar2("status").notNull().default("success"),
        result: jsonb2("result"),
        error: text2("error"),
        executedAt: timestamp2("executed_at").defaultNow().notNull()
      }
    );
    artistProfiles = pgTable2("artist_profiles", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      artistName: varchar2("artist_name", { length: 255 }).notNull(),
      isNewArtist: boolean2("is_new_artist").notNull().default(true),
      // Platform identifiers – stored after lookup or user entry
      spotifyArtistId: varchar2("spotify_artist_id", { length: 255 }),
      spotifyArtistUri: varchar2("spotify_artist_uri", { length: 255 }),
      appleArtistId: varchar2("apple_artist_id", { length: 255 }),
      youtubeChannelId: varchar2("youtube_channel_id", { length: 255 }),
      tidalArtistId: varchar2("tidal_artist_id", { length: 255 }),
      deezerArtistId: varchar2("deezer_artist_id", { length: 255 }),
      soundcloudArtistId: varchar2("soundcloud_artist_id", { length: 255 }),
      amazonMusicArtistId: varchar2("amazon_music_artist_id", { length: 255 }),
      musicbrainzId: varchar2("musicbrainz_id", { length: 255 }),
      bandcampSlug: varchar2("bandcamp_slug", { length: 255 }),
      audiomackSlug: varchar2("audiomack_slug", { length: 255 }),
      // Verification state
      isVerified: boolean2("is_verified").notNull().default(false),
      verifiedAt: timestamp2("verified_at"),
      verifiedPlatforms: jsonb2("verified_platforms").$type().default(sql2`'[]'::jsonb`),
      // Fixer mechanism – re-map misattributed releases (now multi-platform)
      fixerPending: boolean2("fixer_pending").notNull().default(false),
      fixerTargetSpotifyUri: varchar2("fixer_target_spotify_uri", { length: 255 }),
      fixerTargetPlatformIds: jsonb2("fixer_target_platform_ids").$type().default(sql2`'{}'::jsonb`),
      fixerTargetPlatforms: jsonb2("fixer_target_platforms").$type().default(sql2`'[]'::jsonb`),
      fixerNotes: text2("fixer_notes"),
      fixerStatus: varchar2("fixer_status", { length: 50 }).default("none"),
      fixerRequestedAt: timestamp2("fixer_requested_at"),
      fixerResolvedAt: timestamp2("fixer_resolved_at"),
      // Profile health (0–100 composite score)
      healthScore: integer2("health_score").default(0),
      healthBreakdown: jsonb2("health_breakdown").$type().default(sql2`'{}'::jsonb`),
      lastHealthAt: timestamp2("last_health_at"),
      // Profile watch — detect unauthorized releases on known artist pages
      watchEnabled: boolean2("watch_enabled").notNull().default(true),
      lastWatchedAt: timestamp2("last_watched_at"),
      splitDetected: boolean2("split_detected").notNull().default(false),
      // Extra metadata
      profileBio: text2("profile_bio"),
      socialHandles: jsonb2("social_handles").$type().default(sql2`'{}'::jsonb`),
      profileImageUrl: varchar2("profile_image_url", { length: 500 }),
      genres: jsonb2("genres").$type().default(sql2`'[]'::jsonb`),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    insertArtistProfileSchema = createInsertSchema(
      artistProfiles
    ).omit({ id: true, createdAt: true, updatedAt: true });
    artistProfileReleases = pgTable2("artist_profile_releases", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistProfileId: varchar2("artist_profile_id").notNull(),
      releaseId: varchar2("release_id").notNull(),
      isPrimary: boolean2("is_primary").notNull().default(true),
      createdAt: timestamp2("created_at").defaultNow().notNull()
    });
    profileClaimPipeline = pgTable2("profile_claim_pipeline", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistProfileId: varchar2("artist_profile_id").notNull(),
      platform: varchar2("platform", { length: 80 }).notNull(),
      state: varchar2("state", { length: 50 }).notNull().default("unstarted"),
      instructionsViewedAt: timestamp2("instructions_viewed_at"),
      portalOpenedAt: timestamp2("portal_opened_at"),
      idSubmittedAt: timestamp2("id_submitted_at"),
      verifiedAt: timestamp2("verified_at"),
      watchingStartedAt: timestamp2("watching_started_at"),
      lastTransitionAt: timestamp2("last_transition_at").defaultNow(),
      notes: text2("notes"),
      createdAt: timestamp2("created_at").defaultNow().notNull(),
      updatedAt: timestamp2("updated_at").defaultNow().notNull()
    });
    profileClaimEvents = pgTable2("profile_claim_events", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistProfileId: varchar2("artist_profile_id").notNull(),
      platform: varchar2("platform", { length: 80 }).notNull(),
      fromState: varchar2("from_state", { length: 50 }),
      toState: varchar2("to_state", { length: 50 }).notNull(),
      triggeredBy: varchar2("triggered_by", { length: 50 }).default("user"),
      metadata: jsonb2("metadata").$type().default(sql2`'{}'::jsonb`),
      createdAt: timestamp2("created_at").defaultNow().notNull()
    });
    artistIdentityLinks = pgTable2("artist_identity_links", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistProfileId: varchar2("artist_profile_id").notNull(),
      platformA: varchar2("platform_a", { length: 80 }).notNull(),
      idA: varchar2("id_a", { length: 255 }).notNull(),
      platformB: varchar2("platform_b", { length: 80 }).notNull(),
      idB: varchar2("id_b", { length: 255 }).notNull(),
      confidence: integer2("confidence").notNull().default(0),
      source: varchar2("source", { length: 80 }).default("auto_discover"),
      bridgeType: varchar2("bridge_type", { length: 50 }).default("name_match"),
      discoveredAt: timestamp2("discovered_at").defaultNow().notNull(),
      confirmedAt: timestamp2("confirmed_at")
    });
    artistDnaSnapshots = pgTable2("artist_dna_snapshots", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistProfileId: varchar2("artist_profile_id").notNull(),
      releaseId: varchar2("release_id"),
      distributionReleaseId: varchar2("distribution_release_id"),
      snapshotJson: jsonb2("snapshot_json").$type().notNull(),
      platformIdsAtSnapshot: jsonb2("platform_ids_at_snapshot").$type().default(sql2`'{}'::jsonb`),
      isrcList: jsonb2("isrc_list").$type().default(sql2`'[]'::jsonb`),
      upc: varchar2("upc", { length: 50 }),
      createdAt: timestamp2("created_at").defaultNow().notNull()
    });
    profileSplitEvents = pgTable2("profile_split_events", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      artistProfileId: varchar2("artist_profile_id").notNull(),
      platform: varchar2("platform", { length: 80 }).notNull(),
      storedArtistId: varchar2("stored_artist_id", { length: 255 }).notNull(),
      detectedArtistId: varchar2("detected_artist_id", { length: 255 }).notNull(),
      isrc: varchar2("isrc", { length: 50 }),
      releaseTitle: text2("release_title"),
      affectedIsrcs: jsonb2("affected_isrcs").$type().default(sql2`'[]'::jsonb`),
      detectedAt: timestamp2("detected_at").defaultNow().notNull(),
      resolvedAt: timestamp2("resolved_at"),
      resolution: varchar2("resolution", { length: 50 }),
      fixerSubmittedAt: timestamp2("fixer_submitted_at")
    });
    distributorHistoryImports = pgTable2(
      "distributor_history_imports",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        artistProfileId: varchar2("artist_profile_id").notNull(),
        userId: varchar2("user_id").notNull(),
        sourceDistributor: varchar2("source_distributor", { length: 100 }).notNull(),
        isrcList: jsonb2("isrc_list").$type().default(sql2`'[]'::jsonb`),
        upcList: jsonb2("upc_list").$type().default(sql2`'[]'::jsonb`),
        status: varchar2("status", { length: 50 }).default("pending"),
        discoveredPlatforms: jsonb2("discovered_platforms").$type().default(sql2`'{}'::jsonb`),
        importedAt: timestamp2("imported_at").defaultNow().notNull(),
        processedAt: timestamp2("processed_at")
      }
    );
    insertTakeGroupSchema = createInsertSchema(takeGroups).omit({
      id: true,
      createdAt: true
    });
    insertPluginPresetSchema = createInsertSchema(pluginPresets).omit({
      id: true,
      createdAt: true
    });
    insertStudioTrackSchema = createInsertSchema(studioTracks).omit({
      id: true,
      createdAt: true
    });
    insertAlertRuleSchema = createInsertSchema(alertRules).omit({
      id: true,
      createdAt: true
    });
    insertEmailMessageSchema = createInsertSchema(emailMessages).omit({
      id: true,
      createdAt: true
    });
    insertTakeLaneSchema = createInsertSchema(takeLanes).omit({
      id: true,
      createdAt: true
    });
    insertSystemMetricSchema = createInsertSchema(systemMetrics).omit({
      id: true,
      createdAt: true
    });
    insertListenerCohortSchema = createInsertSchema(
      listenerCohorts
    ).omit({ id: true, createdAt: true });
    insertSocialAccountSchema = createInsertSchema(
      socialAccounts
    ).omit({ id: true, createdAt: true });
    insertTakeSegmentSchema = createInsertSchema(takeSegments).omit({
      id: true,
      createdAt: true
    });
    insertWorkspaceRoleSchema = createInsertSchema(
      workspaceRoles
    ).omit({ id: true, createdAt: true });
    insertRevenueForecastSchema = createInsertSchema(
      revenueForecasts
    ).omit({ id: true, createdAt: true });
    insertApprovalRequestSchema = createInsertSchema(
      approvalRequests
    ).omit({ id: true, createdAt: true });
    insertApprovalStepSchema = createInsertSchema(approvalSteps).omit({
      id: true,
      createdAt: true
    });
    insertApprovalWorkflowSchema = createInsertSchema(
      approvalWorkflows
    ).omit({ id: true, createdAt: true });
    insertSsoConfigSchema = createInsertSchema(ssoConfigs).omit({
      id: true,
      createdAt: true
    });
    fabricPockets = pgTable2("fabric_pockets", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      ownerId: varchar2("owner_id").notNull(),
      name: varchar2("name", { length: 255 }).notNull(),
      policy: jsonb2("policy").notNull().default(sql2`'{}'`),
      createdAt: timestamp2("created_at").notNull().defaultNow(),
      updatedAt: timestamp2("updated_at").notNull().defaultNow()
    });
    fabricVolumes = pgTable2("fabric_volumes", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      pocketId: varchar2("pocket_id").notNull().references(() => fabricPockets.id, { onDelete: "cascade" }),
      name: varchar2("name", { length: 255 }).notNull(),
      type: varchar2("type", { length: 32 }).notNull().default("objects"),
      createdAt: timestamp2("created_at").notNull().defaultNow()
    });
    fabricStorageNodes = pgTable2("fabric_storage_nodes", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      region: varchar2("region", { length: 128 }).notNull(),
      costTier: varchar2("cost_tier", { length: 32 }).notNull().default("standard"),
      backendType: varchar2("backend_type", { length: 64 }).notNull(),
      backendConfig: jsonb2("backend_config").notNull().default(sql2`'{}'`),
      capacityBytes: varchar2("capacity_bytes").notNull().default("0"),
      usedBytes: varchar2("used_bytes").notNull().default("0"),
      healthy: boolean2("healthy").notNull().default(true),
      lastHeartbeat: timestamp2("last_heartbeat").notNull().defaultNow()
    });
    fabricObjects = pgTable2("fabric_objects", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      volumeId: varchar2("volume_id").notNull().references(() => fabricVolumes.id, { onDelete: "cascade" }),
      originalName: varchar2("original_name", { length: 512 }).notNull(),
      contentType: varchar2("content_type", { length: 256 }).notNull().default("application/octet-stream"),
      sizeBytes: varchar2("size_bytes").notNull().default("0"),
      chunkIds: jsonb2("chunk_ids").notNull().default(sql2`'[]'`),
      contentHash: varchar2("content_hash", { length: 128 }).notNull(),
      dependenciesIndexed: boolean2("dependencies_indexed").notNull().default(false),
      createdAt: timestamp2("created_at").notNull().defaultNow()
    });
    fabricChunks = pgTable2("fabric_chunks", {
      id: varchar2("id").primaryKey(),
      objectId: varchar2("object_id").notNull(),
      nodeIds: jsonb2("node_ids").notNull().default(sql2`'[]'`),
      sizeBytes: varchar2("size_bytes").notNull().default("0"),
      checksum: varchar2("checksum", { length: 128 }).notNull().default(""),
      refCount: integer2("ref_count").notNull().default(1),
      physicalKeys: jsonb2("physical_keys").notNull().default({}),
      createdAt: timestamp2("created_at").notNull().defaultNow()
    });
    fabricCatalogFence = pgTable2("fabric_catalog_fence", {
      id: text2("id").primaryKey(),
      generation: bigint2("generation", { mode: "bigint" }).notNull().default(sql2`0`)
    });
    fabricObjectDependencies = pgTable2("fabric_object_dependencies", {
      objectId: varchar2("object_id").primaryKey().references(() => fabricObjects.id, { onDelete: "cascade" }),
      baseObjectId: varchar2("base_object_id").notNull().references(() => fabricObjects.id, { onDelete: "restrict" })
    }, (table) => [index2("fabric_object_dependencies_base_idx").on(table.baseObjectId)]);
    fabricDeletionObjects = pgTable2("fabric_deletion_objects", {
      objectId: text2("object_id").primaryKey(),
      objectData: jsonb2("object_data").notNull(),
      createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow()
    });
    fabricDeletionChunks = pgTable2("fabric_deletion_chunks", {
      objectId: text2("object_id").notNull(),
      ordinal: integer2("ordinal").notNull(),
      chunkId: text2("chunk_id").notNull(),
      state: text2("state").notNull().default("pending"),
      location: jsonb2("location"),
      doneNodes: jsonb2("done_nodes").notNull().default([])
    }, (table) => [
      primaryKey2({ columns: [table.objectId, table.ordinal] }),
      index2("fabric_deletion_chunks_chunk_idx").on(table.chunkId)
    ]);
    fabricMigrationJobs = pgTable2("fabric_migration_jobs", {
      id: text2("id").primaryKey(),
      chunkId: text2("chunk_id").notNull().unique(),
      fromNode: text2("from_node").notNull(),
      toNode: text2("to_node").notNull(),
      sourceKey: text2("source_key").notNull(),
      targetKey: text2("target_key").notNull().unique(),
      sizeBytes: bigint2("size_bytes", { mode: "bigint" }).notNull(),
      checksum: text2("checksum").notNull(),
      state: text2("state").notNull(),
      createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow()
    }, (table) => [
      check2("fabric_migration_jobs_size_nonnegative", sql2`${table.sizeBytes}>=0`),
      check2("fabric_migration_jobs_state_valid", sql2`${table.state} IN ('copying','published')`),
      check2("fabric_migration_jobs_distinct_nodes", sql2`${table.fromNode}<>${table.toNode}`)
    ]);
    insertFabricPocketSchema = createInsertSchema(fabricPockets).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertFabricVolumeSchema = createInsertSchema(fabricVolumes).omit({
      id: true,
      createdAt: true
    });
    insertFabricStorageNodeSchema = createInsertSchema(
      fabricStorageNodes
    ).omit({ id: true, lastHeartbeat: true });
    insertFabricObjectSchema = createInsertSchema(fabricObjects).omit({
      id: true,
      createdAt: true
    });
    insertFabricChunkSchema = createInsertSchema(fabricChunks).omit({
      createdAt: true
    });
    customerHealthScores = pgTable2(
      "customer_health_scores",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().unique(),
        score: integer2("score").notNull().default(50),
        riskLevel: text2("risk_level").notNull().default("healthy"),
        loginFrequencyScore: integer2("login_frequency_score").default(0),
        featureAdoptionScore: integer2("feature_adoption_score").default(0),
        engagementScore: integer2("engagement_score").default(0),
        paymentHealthScore: integer2("payment_health_score").default(0),
        daysSinceLastLogin: integer2("days_since_last_login"),
        featuresUsed: integer2("features_used").default(0),
        totalSessions: integer2("total_sessions").default(0),
        reEngagementEmailSentAt: timestamp2("re_engagement_email_sent_at"),
        computedAt: timestamp2("computed_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("customer_health_scores_risk_level_idx").on(t.riskLevel),
        index2("customer_health_scores_days_since_last_login_idx").on(
          t.daysSinceLastLogin
        ),
        index2("customer_health_scores_re_engagement_sent_idx").on(
          t.reEngagementEmailSentAt
        )
      ]
    );
    insertCustomerHealthScoreSchema = createInsertSchema(
      customerHealthScores
    ).omit({ id: true, createdAt: true });
    npsResponses = pgTable2(
      "nps_responses",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        score: integer2("score").notNull(),
        comment: text2("comment"),
        triggerContext: text2("trigger_context").default("30_day"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("nps_responses_user_id_idx").on(t.userId),
        index2("nps_responses_score_idx").on(t.score)
      ]
    );
    insertNpsResponseSchema = createInsertSchema(npsResponses).omit({
      id: true,
      createdAt: true
    });
    cancellationFeedback = pgTable2(
      "cancellation_feedback",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        reason: text2("reason").notNull(),
        elaboration: text2("elaboration"),
        competitorMentioned: text2("competitor_mentioned"),
        wouldReturn: boolean2("would_return"),
        planAtCancellation: text2("plan_at_cancellation"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("cancellation_feedback_user_id_idx").on(t.userId),
        index2("cancellation_feedback_created_at_idx").on(t.createdAt)
      ]
    );
    insertCancellationFeedbackSchema = createInsertSchema(
      cancellationFeedback
    ).omit({ id: true, createdAt: true });
    featureEvents = pgTable2(
      "feature_events",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        featureName: text2("feature_name").notNull(),
        action: text2("action").notNull().default("used"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("feature_events_user_feature_idx").on(t.userId, t.featureName),
        index2("feature_events_created_idx").on(t.createdAt)
      ]
    );
    insertFeatureEventSchema = createInsertSchema(featureEvents).omit({
      id: true,
      createdAt: true
    });
    dunningState = pgTable2(
      "dunning_state",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        stripeInvoiceId: text2("stripe_invoice_id").notNull().unique(),
        currentStep: integer2("current_step").notNull().default(0),
        nextEmailAt: timestamp2("next_email_at"),
        resolvedAt: timestamp2("resolved_at"),
        resolvedReason: text2("resolved_reason"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("dunning_state_stripe_invoice_id_idx").on(t.stripeInvoiceId),
        index2("dunning_state_resolved_at_partial_idx").on(t.resolvedAt).where(sql2`resolved_at IS NULL`),
        index2("dunning_state_next_email_at_idx").on(t.nextEmailAt)
      ]
    );
    insertDunningStateSchema = createInsertSchema(dunningState).omit({
      id: true,
      createdAt: true
    });
    fanSubscribers = pgTable2(
      "fan_subscribers",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        email: text2("email").notNull(),
        name: text2("name"),
        phone: text2("phone"),
        source: text2("source").default("manual"),
        tags: jsonb2("tags").default([]),
        totalSpent: real("total_spent").default(0),
        location: text2("location"),
        isVip: boolean2("is_vip").default(false),
        notes: text2("notes"),
        lastActive: timestamp2("last_active"),
        joinedAt: timestamp2("joined_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("fan_subscribers_user_id_idx").on(t.userId),
        index2("fan_subscribers_email_idx").on(t.userId, t.email)
      ]
    );
    fanMessages = pgTable2(
      "fan_messages",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        subject: text2("subject").notNull(),
        body: text2("body").notNull(),
        segmentFilter: jsonb2("segment_filter").default({}),
        recipientCount: integer2("recipient_count").default(0),
        openCount: integer2("open_count").default(0),
        clickCount: integer2("click_count").default(0),
        sentAt: timestamp2("sent_at"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [index2("fan_messages_user_id_idx").on(t.userId)]
    );
    insertFanSubscriberSchema = createInsertSchema(
      fanSubscribers
    ).omit({ id: true, createdAt: true, joinedAt: true });
    insertFanMessageSchema = createInsertSchema(fanMessages).omit({
      id: true,
      createdAt: true
    });
    pressKits = pgTable2(
      "press_kits",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().unique(),
        artistName: text2("artist_name"),
        bio: text2("bio"),
        shortBio: text2("short_bio"),
        genres: jsonb2("genres").default([]),
        contactEmail: text2("contact_email"),
        bookingEmail: text2("booking_email"),
        website: text2("website"),
        socialLinks: jsonb2("social_links").default({}),
        photos: jsonb2("photos").default([]),
        pressQuotes: jsonb2("press_quotes").default([]),
        achievements: jsonb2("achievements").default([]),
        technicalRider: text2("technical_rider"),
        hospitalityRider: text2("hospitality_rider"),
        isPublic: boolean2("is_public").default(false),
        slug: text2("slug").unique(),
        updatedAt: timestamp2("updated_at").defaultNow(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("press_kits_user_id_idx").on(t.userId),
        index2("press_kits_slug_idx").on(t.slug)
      ]
    );
    insertPressKitSchema = createInsertSchema(pressKits).omit({
      id: true,
      createdAt: true
    });
    playlistPitches = pgTable2(
      "playlist_pitches",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        artistName: text2("artist_name").notNull(),
        genre: text2("genre"),
        mood: text2("mood"),
        bpm: integer2("bpm"),
        description: text2("description"),
        targetPlaylistUrl: text2("target_playlist_url"),
        curatorName: text2("curator_name"),
        curatorEmail: text2("curator_email"),
        status: text2("status").default("draft"),
        submittedAt: timestamp2("submitted_at"),
        responseAt: timestamp2("response_at"),
        responseNote: text2("response_note"),
        followUpAt: timestamp2("follow_up_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("playlist_pitches_user_id_idx").on(t.userId),
        index2("playlist_pitches_status_idx").on(t.status)
      ]
    );
    insertPlaylistPitchSchema = createInsertSchema(
      playlistPitches
    ).omit({ id: true, createdAt: true, updatedAt: true });
    shows = pgTable2(
      "shows",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        venue: text2("venue"),
        city: text2("city"),
        state: text2("state"),
        country: text2("country").default("US"),
        date: timestamp2("date").notNull(),
        endTime: timestamp2("end_time"),
        ticketUrl: text2("ticket_url"),
        capacity: integer2("capacity"),
        ticketsSold: integer2("tickets_sold").default(0),
        revenue: real("revenue").default(0),
        status: text2("status").default("upcoming"),
        notes: text2("notes"),
        isPublic: boolean2("is_public").default(true),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("shows_user_id_idx").on(t.userId),
        index2("shows_date_idx").on(t.date),
        index2("shows_status_idx").on(t.status)
      ]
    );
    setlists = pgTable2(
      "setlists",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        showId: varchar2("show_id").references(() => shows.id),
        name: text2("name").notNull(),
        tracks: jsonb2("tracks").default([]),
        totalDuration: integer2("total_duration").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("setlists_user_id_idx").on(t.userId),
        index2("setlists_show_id_idx").on(t.showId)
      ]
    );
    insertShowSchema = createInsertSchema(shows).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertSetlistSchema = createInsertSchema(setlists).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    merchItems = pgTable2(
      "merch_items",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        description: text2("description"),
        price: real("price").notNull(),
        salePrice: real("sale_price"),
        imageUrl: text2("image_url"),
        category: text2("category").default("clothing"),
        variants: jsonb2("variants").default([]),
        inventory: integer2("inventory").default(0),
        sku: text2("sku"),
        isActive: boolean2("is_active").default(true),
        isDigital: boolean2("is_digital").default(false),
        downloadUrl: text2("download_url"),
        soldCount: integer2("sold_count").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("merch_items_user_id_idx").on(t.userId),
        index2("merch_items_category_idx").on(t.category)
      ]
    );
    merchOrders = pgTable2(
      "merch_orders",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        buyerEmail: text2("buyer_email"),
        buyerName: text2("buyer_name"),
        items: jsonb2("items").default([]),
        total: real("total").default(0),
        status: text2("status").default("pending"),
        trackingNumber: text2("tracking_number"),
        shippingAddress: jsonb2("shipping_address").default({}),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("merch_orders_user_id_idx").on(t.userId),
        index2("merch_orders_status_idx").on(t.status)
      ]
    );
    insertMerchItemSchema = createInsertSchema(merchItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertMerchOrderSchema = createInsertSchema(merchOrders).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    syncSubmissions = pgTable2(
      "sync_submissions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        artistName: text2("artist_name").notNull(),
        genre: text2("genre"),
        mood: text2("mood"),
        bpm: integer2("bpm"),
        duration: integer2("duration"),
        description: text2("description"),
        usageTypes: jsonb2("usage_types").default([]),
        isExclusive: boolean2("is_exclusive").default(false),
        price: real("price"),
        previewUrl: text2("preview_url"),
        submissionTarget: text2("submission_target"),
        status: text2("status").default("available"),
        licensedTo: text2("licensed_to"),
        licensedAt: timestamp2("licensed_at"),
        licenseFee: real("license_fee"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("sync_submissions_user_id_idx").on(t.userId),
        index2("sync_submissions_status_idx").on(t.status)
      ]
    );
    insertSyncSubmissionSchema = createInsertSchema(
      syncSubmissions
    ).omit({ id: true, createdAt: true, updatedAt: true });
    publishingRights = pgTable2(
      "publishing_rights",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        iswc: text2("iswc"),
        isrc: text2("isrc"),
        upc: text2("upc"),
        coWriters: jsonb2("co_writers").default([]),
        publisherName: text2("publisher_name"),
        proName: text2("pro_name"),
        proRegistrationId: text2("pro_registration_id"),
        publishingSplit: real("publishing_split").default(50),
        writerSplit: real("writer_split").default(50),
        copyrightYear: integer2("copyright_year"),
        status: text2("status").default("pending"),
        notes: text2("notes"),
        registeredAt: timestamp2("registered_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("publishing_rights_user_id_idx").on(t.userId),
        index2("publishing_rights_status_idx").on(t.status)
      ]
    );
    insertPublishingRightSchema = createInsertSchema(
      publishingRights
    ).omit({ id: true, createdAt: true, updatedAt: true });
    labelSubmissions = pgTable2(
      "label_submissions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        artistName: text2("artist_name"),
        labelName: text2("label_name").notNull(),
        contactName: text2("contact_name"),
        contactEmail: text2("contact_email"),
        contactRole: text2("contact_role"),
        submissionMethod: text2("submission_method").default("email"),
        demoUrl: text2("demo_url"),
        submittedAt: timestamp2("submitted_at"),
        followUpAt: timestamp2("follow_up_at"),
        responseAt: timestamp2("response_at"),
        status: text2("status").default("draft"),
        responseNote: text2("response_note"),
        notes: text2("notes"),
        priority: text2("priority").default("medium"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("label_submissions_user_id_idx").on(t.userId),
        index2("label_submissions_status_idx").on(t.status)
      ]
    );
    insertLabelSubmissionSchema = createInsertSchema(
      labelSubmissions
    ).omit({ id: true, createdAt: true, updatedAt: true });
    radioPitches = pgTable2(
      "radio_pitches",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        targetName: text2("target_name").notNull(),
        targetType: text2("target_type").default("radio"),
        contactEmail: text2("contact_email"),
        contactUrl: text2("contact_url"),
        genre: text2("genre"),
        pitchNote: text2("pitch_note"),
        demoUrl: text2("demo_url"),
        submittedAt: timestamp2("submitted_at"),
        followUpAt: timestamp2("follow_up_at"),
        responseAt: timestamp2("response_at"),
        status: text2("status").default("draft"),
        responseNote: text2("response_note"),
        featureUrl: text2("feature_url"),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("radio_pitches_user_id_idx").on(t.userId),
        index2("radio_pitches_status_idx").on(t.status)
      ]
    );
    insertRadioPitchSchema = createInsertSchema(radioPitches).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    venueContacts = pgTable2(
      "venue_contacts",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        venueName: text2("venue_name").notNull(),
        city: text2("city"),
        state: text2("state"),
        country: text2("country"),
        capacity: integer2("capacity"),
        venueType: text2("venue_type").default("club"),
        contactName: text2("contact_name"),
        contactEmail: text2("contact_email"),
        contactPhone: text2("contact_phone"),
        contactRole: text2("contact_role"),
        bookingEmail: text2("booking_email"),
        website: text2("website"),
        guaranteeMin: integer2("guarantee_min"),
        guaranteeMax: integer2("guarantee_max"),
        deal: text2("deal"),
        status: text2("status").default("prospect"),
        lastContactedAt: timestamp2("last_contacted_at"),
        notes: text2("notes"),
        rating: integer2("rating").default(0),
        tags: text2("tags").array(),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [index2("venue_contacts_user_id_idx").on(t.userId)]
    );
    insertVenueContactSchema = createInsertSchema(venueContacts).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    projectBudgets = pgTable2(
      "project_budgets",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        projectId: varchar2("project_id"),
        projectName: text2("project_name").notNull(),
        budgetType: text2("budget_type").default("album"),
        totalBudget: real("total_budget").default(0),
        currency: text2("currency").default("USD"),
        status: text2("status").default("planning"),
        startDate: timestamp2("start_date"),
        endDate: timestamp2("end_date"),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [index2("project_budgets_user_id_idx").on(t.userId)]
    );
    insertProjectBudgetSchema = createInsertSchema(
      projectBudgets
    ).omit({ id: true, createdAt: true, updatedAt: true });
    budgetLineItems = pgTable2(
      "budget_line_items",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        budgetId: varchar2("budget_id").notNull(),
        userId: varchar2("user_id").notNull(),
        category: text2("category").notNull(),
        description: text2("description").notNull(),
        estimated: real("estimated").default(0),
        actual: real("actual"),
        vendor: text2("vendor"),
        status: text2("status").default("planned"),
        paidAt: timestamp2("paid_at"),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [index2("budget_line_items_budget_id_idx").on(t.budgetId)]
    );
    insertBudgetLineItemSchema = createInsertSchema(
      budgetLineItems
    ).omit({ id: true, createdAt: true });
    sampleClearances = pgTable2(
      "sample_clearances",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        sampleSource: text2("sample_source").notNull(),
        sampleArtist: text2("sample_artist"),
        sampleLabel: text2("sample_label"),
        samplePublisher: text2("sample_publisher"),
        sampleStartTime: text2("sample_start_time"),
        sampleDuration: integer2("sample_duration"),
        contactEmail: text2("contact_email"),
        contactName: text2("contact_name"),
        clearanceType: text2("clearance_type").default("master_and_sync"),
        status: text2("status").default("needed"),
        fee: real("fee"),
        royaltyRate: real("royalty_rate"),
        clearedAt: timestamp2("cleared_at"),
        expiresAt: timestamp2("expires_at"),
        notes: text2("notes"),
        documentUrl: text2("document_url"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("sample_clearances_user_id_idx").on(t.userId),
        index2("sample_clearances_status_idx").on(t.status)
      ]
    );
    insertSampleClearanceSchema = createInsertSchema(
      sampleClearances
    ).omit({ id: true, createdAt: true, updatedAt: true });
    musicVideoProductions = pgTable2(
      "music_video_productions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        trackTitle: text2("track_title").notNull(),
        director: text2("director"),
        productionCompany: text2("production_company"),
        budget: real("budget"),
        shootDate: timestamp2("shoot_date"),
        editDeadline: timestamp2("edit_deadline"),
        releaseDate: timestamp2("release_date"),
        platform: text2("platform").default("youtube"),
        videoUrl: text2("video_url"),
        thumbnailUrl: text2("thumbnail_url"),
        stage: text2("stage").default("concept"),
        views: integer2("views").default(0),
        notes: text2("notes"),
        locations: text2("locations").array(),
        crew: jsonb2("crew").default([]),
        callSheets: jsonb2("call_sheets").default([]),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [index2("music_video_productions_user_id_idx").on(t.userId)]
    );
    insertMusicVideoProductionSchema = createInsertSchema(
      musicVideoProductions
    ).omit({ id: true, createdAt: true, updatedAt: true });
    songwritingSessions = pgTable2(
      "songwriting_sessions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        title: text2("title").notNull(),
        status: text2("status").default("in_progress"),
        genre: text2("genre"),
        mood: text2("mood"),
        bpm: integer2("bpm"),
        key: text2("key"),
        timeSignature: text2("time_signature").default("4/4"),
        lyrics: text2("lyrics"),
        structure: jsonb2("structure").default([]),
        coWriters: text2("co_writers").array(),
        aiAssisted: boolean2("ai_assisted").default(false),
        tags: text2("tags").array(),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [index2("songwriting_sessions_user_id_idx").on(t.userId)]
    );
    insertSongwritingSessionSchema = createInsertSchema(
      songwritingSessions
    ).omit({ id: true, createdAt: true, updatedAt: true });
    fanCampaigns = pgTable2(
      "fan_campaigns",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        subject: text2("subject").notNull(),
        body: text2("body").notNull(),
        campaignType: text2("campaign_type").default("newsletter"),
        status: text2("status").default("draft"),
        segmentFilter: jsonb2("segment_filter").default({}),
        scheduledAt: timestamp2("scheduled_at"),
        sentAt: timestamp2("sent_at"),
        recipientCount: integer2("recipient_count").default(0),
        openCount: integer2("open_count").default(0),
        clickCount: integer2("click_count").default(0),
        unsubscribeCount: integer2("unsubscribe_count").default(0),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("fan_campaigns_user_id_idx").on(t.userId),
        index2("fan_campaigns_status_idx").on(t.status)
      ]
    );
    insertFanCampaignSchema = createInsertSchema(fanCampaigns).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    customWorkflows = pgTable2(
      "custom_workflows",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        description: text2("description").default(""),
        triggerEvent: text2("trigger_event").notNull(),
        triggerConditions: jsonb2("trigger_conditions").default({}),
        actions: jsonb2("actions").notNull().default([]),
        enabled: boolean2("enabled").default(false),
        runCount: integer2("run_count").default(0),
        lastRunAt: timestamp2("last_run_at"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [
        index2("custom_workflows_user_id_idx").on(t.userId),
        index2("custom_workflows_enabled_idx").on(t.enabled)
      ]
    );
    insertCustomWorkflowSchema = createInsertSchema(
      customWorkflows
    ).omit({ id: true, createdAt: true, updatedAt: true });
    jwtTokens = pgTable2(
      "jwt_tokens",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        accessToken: text2("access_token").notNull(),
        expiresAt: timestamp2("expires_at").notNull(),
        revoked: boolean2("revoked").default(false),
        revokedAt: timestamp2("revoked_at"),
        revokedReason: text2("revoked_reason"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("jwt_tokens_user_id_idx").on(t.userId),
        index2("jwt_tokens_revoked_idx").on(t.revoked)
      ]
    );
    insertJwtTokenSchema = createInsertSchema(jwtTokens).omit({
      id: true,
      createdAt: true
    });
    refreshTokens = pgTable2(
      "refresh_tokens",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        token: text2("token").notNull().unique(),
        expiresAt: timestamp2("expires_at").notNull(),
        revoked: boolean2("revoked").default(false),
        revokedAt: timestamp2("revoked_at"),
        revokedReason: text2("revoked_reason"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [
        index2("refresh_tokens_user_id_idx").on(t.userId),
        index2("refresh_tokens_token_idx").on(t.token)
      ]
    );
    insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({
      id: true,
      createdAt: true
    });
    assistantConversations = pgTable2(
      "assistant_conversations",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => [index2("assistant_conversations_user_id_idx").on(t.userId)]
    );
    insertAssistantConversationSchema = createInsertSchema(
      assistantConversations
    ).omit({ id: true, createdAt: true, updatedAt: true });
    assistantMessages = pgTable2(
      "assistant_messages",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        conversationId: varchar2("conversation_id").notNull(),
        role: varchar2("role", { length: 16 }).notNull(),
        content: text2("content").notNull(),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => [index2("assistant_messages_conversation_id_idx").on(t.conversationId)]
    );
    insertAssistantMessageSchema = createInsertSchema(
      assistantMessages
    ).omit({ id: true, createdAt: true });
    platformRoyaltyRates = pgTable2("platform_royalty_rates", {
      id: serial("id").primaryKey(),
      platform: text2("platform").notNull().unique(),
      displayName: text2("display_name").notNull(),
      baseRatePerStream: real("base_rate_per_stream").notNull(),
      premiumMultiplier: real("premium_multiplier").default(1).notNull(),
      territoryMultipliers: jsonb2("territory_multipliers"),
      notes: text2("notes"),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertPlatformRoyaltyRateSchema = createInsertSchema(
      platformRoyaltyRates
    ).omit({ id: true, updatedAt: true });
    taxTreatyRates = pgTable2("tax_treaty_rates", {
      id: serial("id").primaryKey(),
      countryCode: text2("country_code").notNull().unique(),
      countryName: text2("country_name").notNull(),
      withholdingRate: real("withholding_rate").notNull(),
      treatyRate: real("treaty_rate").notNull(),
      hasTreaty: boolean2("has_treaty").default(true).notNull(),
      notes: text2("notes"),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertTaxTreatyRateSchema = createInsertSchema(
      taxTreatyRates
    ).omit({ id: true, updatedAt: true });
    studioSamples = pgTable2("studio_samples", {
      id: text2("id").primaryKey(),
      name: text2("name").notNull(),
      category: text2("category").notNull(),
      subcategory: text2("subcategory"),
      tags: text2("tags").array(),
      tempo: integer2("tempo"),
      key: text2("key"),
      duration: real("duration"),
      audioUrl: text2("audio_url").notNull(),
      isBuiltIn: boolean2("is_built_in").default(true).notNull(),
      userId: varchar2("user_id"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertStudioSampleSchema = createInsertSchema(studioSamples).omit({
      createdAt: true
    });
    labelSettings = pgTable2("label_settings", {
      id: serial("id").primaryKey(),
      key: text2("key").notNull().unique(),
      value: text2("value").notNull(),
      description: text2("description"),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertLabelSettingSchema = createInsertSchema(labelSettings).omit({
      id: true,
      updatedAt: true
    });
    listingStems = pgTable2("listing_stems", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      listingId: varchar2("listing_id").notNull(),
      userId: varchar2("user_id").notNull(),
      stemName: text2("stem_name").notNull(),
      stemType: text2("stem_type").notNull().default("other"),
      fileUrl: text2("file_url").notNull(),
      fileSize: integer2("file_size").default(0),
      format: text2("format").default("wav"),
      sampleRate: integer2("sample_rate"),
      bitDepth: integer2("bit_depth"),
      price: text2("price"),
      downloadCount: integer2("download_count").default(0),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertListingStemSchema = createInsertSchema(listingStems).omit({
      id: true,
      createdAt: true,
      downloadCount: true
    });
    mobileDeviceTokens = pgTable2("mobile_device_tokens", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull(),
      token: text2("token").notNull().unique(),
      platform: varchar2("platform", { length: 16 }).notNull().default("android"),
      deviceName: text2("device_name"),
      appVersion: varchar2("app_version", { length: 32 }),
      isActive: boolean2("is_active").notNull().default(true),
      lastSeenAt: timestamp2("last_seen_at").defaultNow(),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertMobileDeviceTokenSchema = createInsertSchema(
      mobileDeviceTokens
    ).omit({ id: true, createdAt: true, updatedAt: true, lastSeenAt: true });
    claimedDomains = pgTable2("claimed_domains", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().references(() => users.id),
      storefrontId: varchar2("storefront_id").references(() => storefronts.id),
      domain: varchar2("domain", { length: 253 }).notNull().unique(),
      sld: varchar2("sld", { length: 63 }).notNull(),
      tld: varchar2("tld", { length: 63 }).notNull(),
      status: varchar2("status", { length: 32 }).notNull().default("pending"),
      // 'pending' | 'active' | 'expired' | 'transferring' | 'platform_managed'
      registrarOrderId: varchar2("registrar_order_id", { length: 256 }),
      registrarName: varchar2("registrar_name", { length: 64 }).default(
        "maxbooster"
      ),
      nameserver1: varchar2("nameserver1", { length: 253 }).default(
        "ns1.max-booster.com"
      ),
      nameserver2: varchar2("nameserver2", { length: 253 }).default(
        "ns2.max-booster.com"
      ),
      expiresAt: timestamp2("expires_at"),
      yearsRegistered: integer2("years_registered").default(1),
      autoRenew: boolean2("auto_renew").notNull().default(true),
      privacyEnabled: boolean2("privacy_enabled").notNull().default(true),
      pricePaidCents: integer2("price_paid_cents"),
      stripePaymentId: varchar2("stripe_payment_id", { length: 256 }),
      registrationData: jsonb2("registration_data"),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertClaimedDomainSchema = createInsertSchema(
      claimedDomains
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    domainContacts = pgTable2("domain_contacts", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      userId: varchar2("user_id").notNull().references(() => users.id),
      // 'registrant' | 'admin' | 'tech' | 'billing'
      contactType: varchar2("contact_type", { length: 16 }).notNull().default("registrant"),
      name: varchar2("name", { length: 256 }).notNull(),
      org: varchar2("org", { length: 256 }),
      email: varchar2("email", { length: 256 }).notNull(),
      phone: varchar2("phone", { length: 32 }),
      // { street, city, state, postalCode, country }
      address: jsonb2("address"),
      isDefault: boolean2("is_default").notNull().default(false),
      createdAt: timestamp2("created_at").defaultNow(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertDomainContactSchema = createInsertSchema(
      domainContacts
    ).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    domainEvents = pgTable2("domain_events", {
      id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
      // References claimed_domains.id (no FK to allow retention after domain deleted)
      domainId: varchar2("domain_id").notNull(),
      userId: varchar2("user_id").notNull().references(() => users.id),
      // DomainRegistered | DomainRenewed | DomainReleased | DomainExpiringSoon |
      // DomainEnteredGrace | DomainExpired | DomainTransferInitiated |
      // DomainNameserversUpdated | QuotaEnforced | SubscriptionCouplingUpdated | ...
      eventType: varchar2("event_type", { length: 64 }).notNull(),
      fqdn: varchar2("fqdn", { length: 253 }).notNull(),
      metadata: jsonb2("metadata"),
      createdAt: timestamp2("created_at").defaultNow()
    });
    insertDomainEventSchema = createInsertSchema(domainEvents).omit({
      id: true,
      createdAt: true
    });
    dnssecKeys = pgTable2(
      "dnssec_keys",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        zone: varchar2("zone", { length: 253 }).notNull(),
        isKsk: boolean2("is_ksk").notNull().default(false),
        algorithm: integer2("algorithm").notNull().default(13),
        // ECDSAP256SHA256
        flags: integer2("flags").notNull(),
        // 257=KSK, 256=ZSK
        keyTag: integer2("key_tag").notNull(),
        privateKeyPem: text2("private_key_pem").notNull(),
        publicKeyPem: text2("public_key_pem").notNull(),
        /** Raw 64-byte public key stored as base64 (x||y, no 0x04 prefix) */
        publicKeyRaw: text2("public_key_raw").notNull(),
        /** NSEC3 salt for this zone (8 bytes, hex-encoded) */
        nsec3Salt: varchar2("nsec3_salt", { length: 32 }),
        active: boolean2("active").notNull().default(true),
        createdAt: timestamp2("created_at").defaultNow(),
        expiresAt: timestamp2("expires_at")
      },
      (table) => ({
        zoneIdx: index2("dnssec_keys_zone_idx").on(table.zone),
        zoneKskIdx: index2("dnssec_keys_zone_ksk_idx").on(table.zone, table.isKsk)
      })
    );
    insertDnssecKeySchema = createInsertSchema(dnssecKeys).omit({
      id: true,
      createdAt: true
    });
    hnsAuctions = pgTable2(
      "hns_auctions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull(),
        name: text2("name").notNull(),
        bidHns: real("bid_hns").notNull(),
        lockupHns: real("lockup_hns").notNull(),
        state: text2("state").notNull().default("pending_open"),
        txHash: text2("tx_hash"),
        nameHash: text2("name_hash"),
        error: text2("error"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (table) => ({
        userIdx: index2("hns_auctions_user_idx").on(table.userId),
        nameIdx: index2("hns_auctions_name_idx").on(table.name)
      })
    );
    insertHnsAuctionSchema = createInsertSchema(hnsAuctions).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    fanWallets = pgTable2(
      "fan_wallets",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        /** Artist who owns this wallet programme */
        artistId: varchar2("artist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        /** Fan (subscriber) who holds credits */
        fanId: varchar2("fan_id").notNull(),
        balanceCredits: integer2("balance_credits").default(0).notNull(),
        lifetimeEarned: integer2("lifetime_earned").default(0).notNull(),
        lifetimeRedeemed: integer2("lifetime_redeemed").default(0).notNull(),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        artistFanUniq: unique2("fan_wallets_artist_fan_uniq").on(
          t.artistId,
          t.fanId
        ),
        byArtist: index2("fan_wallets_artist_idx").on(t.artistId),
        byFan: index2("fan_wallets_fan_idx").on(t.fanId)
      })
    );
    fanCreditTransactions = pgTable2(
      "fan_credit_transactions",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        walletId: varchar2("wallet_id").notNull().references(() => fanWallets.id, { onDelete: "cascade" }),
        /** earn | redeem | expire | admin_adjust */
        type: text2("type").notNull(),
        /** Positive = earn, negative = redeem/expire */
        deltaCredits: integer2("delta_credits").notNull(),
        /** e.g. "purchase", "share", "comment", "checkout_discount" */
        reason: text2("reason").notNull(),
        /** Optional reference (orderId, beatId, etc.) */
        referenceId: varchar2("reference_id"),
        metadata: jsonb2("metadata"),
        createdAt: timestamp2("created_at").defaultNow()
      },
      (t) => ({
        byWallet: index2("fan_credit_txns_wallet_idx").on(t.walletId, t.createdAt)
      })
    );
    insertFanCreditTransactionSchema = createInsertSchema(
      fanCreditTransactions
    ).omit({ id: true, createdAt: true });
    fanLoyaltyConfigs = pgTable2("fan_loyalty_configs", {
      artistId: varchar2("artist_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
      /** Credits awarded per $1 spent */
      creditsPerDollar: integer2("credits_per_dollar").default(10).notNull(),
      /** Credits awarded per qualifying share */
      creditsPerShare: integer2("credits_per_share").default(5).notNull(),
      /** Credits awarded per qualifying comment */
      creditsPerComment: integer2("credits_per_comment").default(2).notNull(),
      /** Credits required to redeem $1 discount */
      creditsPerRedemptionDollar: integer2("credits_per_redemption_dollar").default(100).notNull(),
      /** Max % of order value redeemable in credits (0–100) */
      maxRedemptionPct: integer2("max_redemption_pct").default(50).notNull(),
      enabled: boolean2("enabled").default(true).notNull(),
      updatedAt: timestamp2("updated_at").defaultNow()
    });
    insertFanLoyaltyConfigSchema = createInsertSchema(
      fanLoyaltyConfigs
    );
    outreachCampaigns = pgTable2(
      "outreach_campaigns",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        userId: varchar2("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        name: text2("name").notNull(),
        /** blog | playlist | sync_supervisor | pr_outlet | radio */
        campaignType: text2("campaign_type").notNull(),
        releaseId: varchar2("release_id"),
        beatId: varchar2("beat_id"),
        status: text2("status").default("active").notNull(),
        totalPitches: integer2("total_pitches").default(0).notNull(),
        openCount: integer2("open_count").default(0).notNull(),
        replyCount: integer2("reply_count").default(0).notNull(),
        placementCount: integer2("placement_count").default(0).notNull(),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byUser: index2("outreach_campaigns_user_idx").on(t.userId, t.createdAt)
      })
    );
    insertOutreachCampaignSchema = createInsertSchema(
      outreachCampaigns
    ).omit({ id: true, createdAt: true, updatedAt: true, totalPitches: true, openCount: true, replyCount: true, placementCount: true });
    outreachPitches = pgTable2(
      "outreach_pitches",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        campaignId: varchar2("campaign_id").notNull().references(() => outreachCampaigns.id, { onDelete: "cascade" }),
        userId: varchar2("user_id").notNull(),
        /** Name of curator / blog / playlist / supervisor */
        recipientName: text2("recipient_name").notNull(),
        recipientEmail: text2("recipient_email"),
        recipientUrl: text2("recipient_url"),
        /** draft | sent | opened | replied | added | declined | no_response */
        status: text2("status").default("draft").notNull(),
        pitchBody: text2("pitch_body"),
        followUpAt: timestamp2("follow_up_at"),
        sentAt: timestamp2("sent_at"),
        openedAt: timestamp2("opened_at"),
        repliedAt: timestamp2("replied_at"),
        resolvedAt: timestamp2("resolved_at"),
        notes: text2("notes"),
        createdAt: timestamp2("created_at").defaultNow(),
        updatedAt: timestamp2("updated_at").defaultNow()
      },
      (t) => ({
        byCampaign: index2("outreach_pitches_campaign_idx").on(
          t.campaignId,
          t.status
        ),
        byUser: index2("outreach_pitches_user_idx").on(t.userId, t.status),
        followUp: index2("outreach_pitches_followup_idx").on(t.followUpAt)
      })
    );
    insertOutreachPitchSchema = createInsertSchema(
      outreachPitches
    ).omit({ id: true, createdAt: true, updatedAt: true });
    beatPricingSnapshots = pgTable2(
      "beat_pricing_snapshots",
      {
        id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
        beatId: varchar2("beat_id").notNull(),
        userId: varchar2("user_id").notNull(),
        previousPriceCents: integer2("previous_price_cents").notNull(),
        newPriceCents: integer2("new_price_cents").notNull(),
        /** plays, downloads, conversion_rate that drove the change */
        conversionRate: real("conversion_rate"),
        plays: integer2("plays"),
        downloads: integer2("downloads"),
        /** up | down | hold */
        direction: text2("direction").notNull(),
        reason: text2("reason"),
        appliedAt: timestamp2("applied_at").defaultNow()
      },
      (t) => ({
        byBeat: index2("beat_pricing_snapshots_beat_idx").on(t.beatId, t.appliedAt),
        byUser: index2("beat_pricing_snapshots_user_idx").on(t.userId, t.appliedAt)
      })
    );
    insertBeatPricingSnapshotSchema = createInsertSchema(
      beatPricingSnapshots
    ).omit({ id: true, appliedAt: true });
    hybridStorageFiles = pgTable2("hybrid_storage_files", {
      key: text2("key").primaryKey(),
      userId: text2("user_id").notNull(),
      blobKey: text2("blob_key").notNull(),
      state: text2("state").notNull(),
      metadata: jsonb2("metadata").notNull(),
      updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow()
    }, (t) => ({
      byUser: index2("hybrid_storage_files_user_idx").on(t.userId, t.state),
      byBlob: index2("hybrid_storage_files_blob_idx").on(t.blobKey),
      byHash: index2("hybrid_storage_files_hash_idx").on(sql2`(${t.metadata}->>'contentHash')`)
    }));
    hybridStorageImports = pgTable2("hybrid_storage_imports", {
      source: text2("source").primaryKey(),
      importedCount: integer2("imported_count").notNull(),
      importedAt: timestamp2("imported_at", { withTimezone: true }).notNull().defaultNow()
    });
    socialMediaJobs = pgTable2(
      "social_media_jobs",
      {
        id: varchar2("id").primaryKey(),
        family: text2("family").notNull(),
        ownerId: varchar2("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        status: text2("status").notNull().default("processing"),
        result: jsonb2("result").$type(),
        error: text2("error"),
        leaseToken: varchar2("lease_token").notNull(),
        leaseExpiresAt: timestamp2("lease_expires_at", { withTimezone: true }),
        createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        byOwner: index2("social_media_jobs_owner_idx").on(table.ownerId, table.family, table.createdAt),
        byLease: index2("social_media_jobs_lease_idx").on(table.status, table.leaseExpiresAt),
        byUpdated: index2("social_media_jobs_updated_idx").on(table.updatedAt)
      })
    );
  }
});

// server/config/env.ts
import { z as z2 } from "zod";
function parseEnv() {
  const result = envSchema?.safeParse(process.env);
  if (!result?.success) {
    const issues = result?.error.issues.map((i) => `  ${i?.path.join(".")}: ${i?.message}`).join("\n");
    const required = ["SESSION_SECRET"];
    const criticalFail = result?.error.issues?.some(
      (i) => required?.includes(String(i?.path[0]))
    );
    if (criticalFail) {
      throw new Error(
        `[env] Critical environment variables missing:
${issues}`
      );
    }
    console?.warn(`[env] Optional env vars have issues:
${issues}`);
  }
  return result?.success ? result?.data : envSchema?.partial().parse(process.env);
}
var envSchema, env;
var init_env = __esm({
  "server/config/env.ts"() {
    "use strict";
    envSchema = z2.object({
      // ── Core ──────────────────────────────────────────────────────────────────
      NODE_ENV: z2.enum(["development", "production", "test", "staging"]).default("development"),
      PORT: z2.coerce.number().min(1).max(65535).default(5e3),
      // ── Database ──────────────────────────────────────────────────────────────
      // Optional here — the app prefers NEON_DATABASE_URL (see config/defaults.ts).
      // db.ts enforces that at least one is present at pool-creation time.
      DATABASE_URL: z2.string().url().startsWith("postgresql://").optional(),
      // ── Session / Auth ────────────────────────────────────────────────────────
      SESSION_SECRET: z2.string().min(32),
      // ── Stripe ────────────────────────────────────────────────────────────────
      STRIPE_SECRET_KEY: z2.string().min(1).optional(),
      STRIPE_WEBHOOK_SECRET: z2.string().startsWith("whsec_").optional(),
      STRIPE_PRICE_ID_PRO_MONTHLY: z2.string().optional(),
      STRIPE_PRICE_ID_PRO_ANNUAL: z2.string().optional(),
      STRIPE_PRICE_ID_ELITE_MONTHLY: z2.string().optional(),
      STRIPE_PRICE_ID_ELITE_ANNUAL: z2.string().optional(),
      TESTING_STRIPE_SECRET_KEY: z2.string().min(1).optional(),
      STRIPE_CONNECT_CLIENT_ID: z2.string().optional(),
      // ── Email ─────────────────────────────────────────────────────────────────
      SENDGRID_API_KEY: z2.string().optional(),
      SENDGRID_FROM_EMAIL: z2.string().email().optional(),
      RESEND_API_KEY: z2.string().optional(),
      FROM_EMAIL: z2.string().email().optional(),
      // ── Storage ───────────────────────────────────────────────────────────────
      REPLIT_OBJECT_STORAGE_BUCKET: z2.string().optional(),
      // ── Monitoring ────────────────────────────────────────────────────────────
      SENTRY_DSN: z2.string().url().optional().catch(void 0),
      // ── OAuth ─────────────────────────────────────────────────────────────────
      GOOGLE_CLIENT_ID: z2.string().optional(),
      GOOGLE_CLIENT_SECRET: z2.string().optional(),
      YOUTUBE_CLIENT_ID: z2.string().optional(),
      YOUTUBE_CLIENT_SECRET: z2.string().optional(),
      GOOGLE_BUSINESS_CLIENT_ID: z2.string().optional(),
      GOOGLE_BUSINESS_CLIENT_SECRET: z2.string().optional(),
      // ── AI / ML ───────────────────────────────────────────────────────────────
      OPENAI_API_KEY: z2.string().startsWith("sk-").optional(),
      ANTHROPIC_API_KEY: z2.string().optional(),
      // ── App config ────────────────────────────────────────────────────────────
      BASE_URL: z2.string().url().optional().catch(void 0),
      BASE_DOMAIN: z2.string().optional(),
      APP_NAME: z2.string().default("Max Booster"),
      APP_URL: z2.string().optional(),
      DOMAIN: z2.string().optional(),
      CORS_ORIGIN: z2.string().optional(),
      // ── Database aliases ──────────────────────────────────────────────────────
      NEON_DATABASE_URL: z2.string().url().optional(),
      // ── Feature flags ─────────────────────────────────────────────────────────
      SKIP_BOOSTERSTATE: z2.string().optional(),
      DEPLOYMENT_PHASES: z2.string().optional(),
      // ── Redis / PDIM ──────────────────────────────────────────────────────────
      REDIS_URL: z2.string().optional(),
      POCKET_DIMENSION_KEY: z2.string().optional()
    });
    env = parseEnv();
  }
});

// server/config/defaults.ts
import os5 from "os";
function parseEnvInt(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
function parseEnvBool(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}
function parseEnvArray(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
function parseNodeEnv(value) {
  return value === "production" || value === "test" || value === "development" ? value : "development";
}
var _vmCpuCount, _vmConcMult, isReplitDeployment, isReplitWorkspace, isProduction, config;
var init_defaults = __esm({
  "server/config/defaults.ts"() {
    "use strict";
    init_logger();
    init_env();
    init_ports();
    _vmCpuCount = Math.max(1, os5.cpus().length);
    _vmConcMult = Math.max(1, Math.floor(_vmCpuCount / 4));
    isReplitDeployment = process.env.REPLIT_DEPLOYMENT === "1";
    isReplitWorkspace = !!process.env.REPLIT_DEV_DOMAIN;
    isProduction = process.env.NODE_ENV === "production" || isReplitDeployment;
    config = {
      nodeEnv: parseNodeEnv(process.env.NODE_ENV),
      isReplitDeployment,
      isReplitWorkspace,
      port: runtimePorts.app,
      database: {
        url: env.NEON_DATABASE_URL || env.DATABASE_URL || "",
        // In production each worker creates its own pool.  With the default of 20
        // connections × N workers we easily exceed Neon's connection limit (53100).
        // Scale the per-worker pool so all workers combined stay ≤ 15 connections:
        //   ceil(15 / CLUSTER_WORKERS) → 5 for 3 workers, 3 for 6 workers, etc.
        // The DB_POOL_SIZE env var always wins if set explicitly.
        // Dev uses 8 to avoid a cold-start storm (too many simultaneous new Neon
        // WebSocket connections stall each other and delay foreground requests).
        poolSize: parseEnvInt(
          "DB_POOL_SIZE",
          isReplitDeployment ? Math.max(
            2,
            Math.ceil(
              15 / (parseInt(process.env.PDIM_CLUSTER_WORKERS || "1", 10) || 1)
            )
          ) : 8
        ),
        maxConnections: parseEnvInt("DB_MAX_CONNECTIONS", 200),
        idleTimeout: parseEnvInt("DB_IDLE_TIMEOUT", 6e4),
        // 3 s connection-checkout timeout: if the pool is momentarily exhausted by
        // background tasks, _retryQuery (2 attempts, 300 ms gap) fails within 6.3 s
        // — well under a 10 s HTTP client AbortSignal — instead of hanging 20 s.
        connectionTimeout: parseEnvInt("DB_CONNECTION_TIMEOUT", 3e3)
      },
      redis: {
        url: env.REDIS_URL,
        maxRetries: 3,
        retryDelay: 1e3
      },
      boosterState: {
        port: runtimePorts.boosterState,
        shards: parseEnvInt("BOOSTERSTATE_SHARDS", 16),
        dataDir: process.env.BOOSTERSTATE_DATA_DIR || "./boosterstate-data"
      },
      session: {
        secret: env.SESSION_SECRET || "dev-secret-change-in-production",
        maxSessions: parseEnvInt("MAX_SESSIONS", 8e10),
        // 80 billion sessions
        ttl: parseEnvInt("SESSION_TTL", 86400),
        // 24 hours
        name: process.env.SESSION_NAME || "maxbooster.sid"
      },
      rateLimiting: {
        windowMs: parseEnvInt("RATE_LIMIT_WINDOW_MS", 6e4),
        // 1 minute window
        maxRequests: parseEnvInt("RATE_LIMIT_MAX", 1200),
        // 1 200 req/min per user/IP (20 req/s)
        criticalMax: parseEnvInt("RATE_LIMIT_CRITICAL_MAX", 30)
        // 30 req/min for auth/payment endpoints
      },
      upload: {
        maxFileSize: parseEnvInt("MAX_FILE_SIZE", 209715200),
        // 200MB
        allowedTypes: parseEnvArray("ALLOWED_FILE_TYPES", [
          "mp3",
          "wav",
          "flac",
          "aiff",
          "ogg"
        ]),
        useTempStorage: parseEnvBool("USE_TEMP_STORAGE", true)
        // Default to local for dev
      },
      storage: {
        provider: process.env.STORAGE_PROVIDER === "s3" ? "s3" : "pocket-dimension",
        bucket: process.env.S3_BUCKET,
        region: process.env.AWS_REGION || "us-east-1",
        endpoint: process.env.S3_ENDPOINT,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        replitBucketId: process.env.REPLIT_BUCKET_ID || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
      },
      queue: {
        concurrency: {
          audio: parseEnvInt(
            "QUEUE_AUDIO_CONCURRENCY",
            Math.min(24, 6 * _vmConcMult)
          ),
          analytics: parseEnvInt(
            "QUEUE_ANALYTICS_CONCURRENCY",
            Math.min(32, 8 * _vmConcMult)
          ),
          email: parseEnvInt(
            "QUEUE_EMAIL_CONCURRENCY",
            Math.min(64, 16 * _vmConcMult)
          ),
          csv: parseEnvInt("QUEUE_CSV_CONCURRENCY", Math.min(16, 4 * _vmConcMult))
        },
        timeout: {
          audio: parseEnvInt("QUEUE_AUDIO_TIMEOUT", 18e4),
          // 3 minutes
          analytics: parseEnvInt("QUEUE_ANALYTICS_TIMEOUT", 3e4),
          // 30 seconds
          email: parseEnvInt("QUEUE_EMAIL_TIMEOUT", 1e4),
          // 10 seconds
          csv: parseEnvInt("QUEUE_CSV_TIMEOUT", 3e5)
          // 5 minutes
        },
        retries: {
          audio: parseEnvInt("QUEUE_AUDIO_RETRIES", 3),
          analytics: parseEnvInt("QUEUE_ANALYTICS_RETRIES", 2),
          email: parseEnvInt("QUEUE_EMAIL_RETRIES", 5),
          csv: parseEnvInt("QUEUE_CSV_RETRIES", 1)
        }
      },
      monitoring: {
        poolUtilizationThreshold: parseEnvInt("POOL_UTILIZATION_THRESHOLD", 80),
        memoryWarningThreshold: parseEnvInt("MEMORY_WARNING_THRESHOLD", 80),
        memoryCriticalThreshold: parseEnvInt("MEMORY_CRITICAL_THRESHOLD", 90)
      }
    };
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  dbRead: () => dbRead,
  getQueryTelemetry: () => getQueryTelemetry,
  pool: () => pool,
  replicaPool: () => replicaPool,
  verifyReadReplica: () => verifyReadReplica
});
import {
  Pool,
  neonConfig
} from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool as NodePostgresPool } from "pg";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { sql as sql3 } from "drizzle-orm";
import ws from "ws";
import { createHash as createHash10 } from "crypto";
function getQueryTelemetry() {
  return queryTelemetry.getMetrics();
}
function createInstrumentedPool(options) {
  const pool2 = new Pool(options);
  const baseQuery = pool2.query.bind(pool2);
  pool2.query = ((...args) => {
    const startTime = Date.now();
    const sql4 = typeof args[0] === "string" ? args[0] : args[0]?.text ?? "unknown";
    const result = baseQuery(...args);
    if (result && typeof result.then === "function") {
      return result.then((queryResult) => {
        queryTelemetry.recordQuery(sql4, Date.now() - startTime);
        return queryResult;
      }).catch((error) => {
        queryTelemetry.recordQuery(sql4, Date.now() - startTime);
        throw error;
      });
    }
    queryTelemetry.recordQuery(sql4, Date.now() - startTime);
    return result;
  });
  return pool2;
}
async function verifyReadReplica() {
  if (!replicaPool) return;
  try {
    await dbRead?.execute(sql3`SELECT 1`);
    logger.info(
      "[db] \u2705 Read replica verified \u2014 SELECTs route to Neon replica"
    );
  } catch (err) {
    logger.warn(
      "[db] \u274C Read replica health check FAILED \u2014 routing ALL queries to primary"
    );
    logger.warn(`[db]    Replica error: ${err?.message}`);
    logger.warn(
      "[db]    Check DATABASE_REPLICA_URLS \u2014 the replica URL may be invalid or the Neon replica may be down"
    );
    dbRead = db;
  }
}
var QueryTelemetry, queryTelemetry, useIsolatedNodePostgres, isolatedNodePostgresPool, pool, db, isProduction2, replicaUrl, replicaPool, dbRead;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_defaults();
    init_logger();
    neonConfig.webSocketConstructor = ws;
    if (!config?.database.url) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    QueryTelemetry = class {
      constructor() {
        this.ringBuffer = [];
        this.bufferIndex = 0;
        this.maxSize = 1e3;
        // Bounded to 1000 queries max
        // Running aggregates for O(1) calculations
        this.lifetimeTotal = 0;
        this.lifetimeSlow = 0;
        this.runningSum = 0;
        this.slowestEver = null;
        // Sampling for high-QPS scenarios (store 1 in N queries)
        this.sampleRate = 1;
        // Start with 100% sampling
        this.queriesSinceLastSample = 0;
        this.trackingStartTime = Date?.now();
        // Fixed timestamp for QPS calculation
        // Connection warmup grace period: Neon serverless pgbouncer adds 300–600ms
        // to the first query on each fresh connection — not representative of steady-state
        // performance.  90s covers the full autonomous-systems startup window so
        // Neon connection-pool cold starts don't generate spurious warn logs.
        this.warmupGraceMs = 9e4;
        // 90 seconds after first query
        this.firstQueryTime = null;
      }
      hashSql(sql4) {
        const hash2 = createHash10("sha256").update(sql4).digest("hex");
        return `sql_${hash2.substring(0, 16)}`;
      }
      recordQuery(sql4, duration) {
        const now = Date.now();
        const sqlHash = this.hashSql(sql4);
        if (this.firstQueryTime === null) {
          this.firstQueryTime = now;
        }
        const isWarmingUp = now - this.firstQueryTime < this.warmupGraceMs;
        this.lifetimeTotal++;
        this.runningSum += duration;
        if (duration > 1e3 && !isWarmingUp) {
          this.lifetimeSlow++;
          const isDev = !(process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT);
          const sqlPreview = isDev ? sql4.substring(0, 200).replace(/\s+/g, " ") : "";
          logger.warn({
            message: `\u26A0\uFE0F Slow query detected (${duration}ms)`,
            sqlHash,
            preview: isDev ? sqlPreview : void 0
          });
        }
        if (!this.slowestEver || duration > this.slowestEver.duration) {
          this.slowestEver = { sqlHash, duration };
        }
        this.queriesSinceLastSample++;
        if (this.lifetimeTotal % 1e4 === 0) {
          const elapsedMs = Math.max(1, Date.now() - this.trackingStartTime);
          const avgQueriesPerMinute = this.lifetimeTotal / elapsedMs * 6e4;
          if (avgQueriesPerMinute > 1e6) {
            this.sampleRate = 1e3;
          } else if (avgQueriesPerMinute > 1e5) {
            this.sampleRate = 100;
          } else if (avgQueriesPerMinute > 1e4) {
            this.sampleRate = 10;
          } else if (avgQueriesPerMinute > 1e3) {
            this.sampleRate = 5;
          } else {
            this.sampleRate = 1;
          }
        }
        if (this.queriesSinceLastSample >= this.sampleRate) {
          this.ringBuffer[this.bufferIndex] = { timestamp: now, sqlHash, duration };
          this.bufferIndex = (this.bufferIndex + 1) % this.maxSize;
          this.queriesSinceLastSample = 0;
        }
      }
      getMetrics() {
        const now = Date.now();
        const windowMs = 15 * 60 * 1e3;
        const recentQueries = this.ringBuffer.filter(
          (q) => q && q.timestamp && now - q.timestamp < windowMs
        );
        if (recentQueries.length === 0) {
          return {
            windowedQueries: 0,
            windowedSlow: 0,
            p95Latency: 0,
            windowedAverage: 0,
            lifetimeTotal: this.lifetimeTotal,
            lifetimeSlow: this.lifetimeSlow,
            lifetimeAverage: this.lifetimeTotal > 0 ? Math.round(this.runningSum / this.lifetimeTotal * 100) / 100 : 0,
            slowestQuery: this.slowestEver,
            lastRefresh: (/* @__PURE__ */ new Date()).toISOString(),
            windowMinutes: 15
          };
        }
        const windowedSlow = recentQueries.filter((q) => q.duration > 1e3).length;
        const durations = recentQueries.map((q) => q.duration).sort((a, b) => a - b);
        const p95Index = Math.floor(durations.length * 0.95);
        const p95Latency = durations[p95Index] || 0;
        const windowedAverage = durations.reduce((sum, d) => sum + d, 0) / (durations.length || 1);
        return {
          windowedQueries: recentQueries.length,
          windowedSlow,
          p95Latency: Math.round(p95Latency * 100) / 100,
          windowedAverage: Math.round(windowedAverage * 100) / 100,
          lifetimeTotal: this.lifetimeTotal,
          lifetimeSlow: this.lifetimeSlow,
          lifetimeAverage: this.lifetimeTotal > 0 ? Math.round(this.runningSum / this.lifetimeTotal * 100) / 100 : 0,
          slowestQuery: this.slowestEver,
          lastRefresh: (/* @__PURE__ */ new Date()).toISOString(),
          windowMinutes: 15
        };
      }
    };
    queryTelemetry = new QueryTelemetry();
    useIsolatedNodePostgres = process.env.READINESS_ISOLATED_PG === "1" && process.env.READINESS_EGRESS_GUARD === "1";
    if (process.env.READINESS_ISOLATED_PG === "1" && process.env.READINESS_EGRESS_GUARD !== "1") {
      throw new Error(
        "READINESS_ISOLATED_PG requires the readiness egress guard"
      );
    }
    isolatedNodePostgresPool = useIsolatedNodePostgres ? new NodePostgresPool({
      connectionString: config.database.url,
      max: config.database.poolSize,
      idleTimeoutMillis: config.database.idleTimeout,
      connectionTimeoutMillis: config.database.connectionTimeout
    }) : null;
    pool = isolatedNodePostgresPool ? isolatedNodePostgresPool : createInstrumentedPool({
      connectionString: config.database.url,
      max: config.database.poolSize,
      idleTimeoutMillis: config.database.idleTimeout,
      connectionTimeoutMillis: config.database.connectionTimeout
    });
    pool.on("connect", (client) => {
      client.query("SET statement_timeout = '30000'").catch((err) => {
        logger.warn({
          err: err?.message,
          message: "[DB] Failed to set statement_timeout on new connection"
        });
      });
    });
    pool.on("error", (err) => {
      logger.warn({ value: err?.message, message: "[DB] Idle client error (pool)" });
    });
    db = isolatedNodePostgresPool ? drizzleNodePostgres(isolatedNodePostgresPool, {
      schema: schema_exports
    }) : drizzle(pool, { schema: schema_exports });
    isProduction2 = process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
    replicaUrl = isProduction2 ? (process.env.DATABASE_REPLICA_URLS || "").split(",").filter(Boolean)[0] : void 0;
    replicaPool = replicaUrl ? createInstrumentedPool({
      connectionString: replicaUrl,
      max: config.database.poolSize,
      idleTimeoutMillis: config.database.idleTimeout,
      connectionTimeoutMillis: config.database.connectionTimeout
    }) : null;
    if (replicaPool) {
      replicaPool?.on("error", (err) => {
        logger.warn({
          value: err?.message,
          message: "[DB] Idle client error (replica pool)"
        });
      });
    }
    if (isProduction2 && replicaPool) {
      logger.info(
        "[db] Read replica pool created \u2014 will verify connectivity at startup"
      );
    } else if (isProduction2 && !replicaPool) {
      logger.warn(
        "[db] DATABASE_REPLICA_URLS not set \u2014 all queries routed to primary in production"
      );
    }
    dbRead = replicaPool ? drizzle(replicaPool, { schema: schema_exports }) : db;
  }
});

// server/services/hybridStorageService.ts
import { createHash as createHash11, randomUUID as randomUUID5 } from "crypto";
function parseLegacyHybridIndex(raw) {
  if (raw === null) return [];
  const index3 = JSON.parse(raw);
  if (!index3 || typeof index3 !== "object" || Array.isArray(index3) || !["files", "contentHashes", "publicHashes"].every((name) => index3[name] && typeof index3[name] === "object" && !Array.isArray(index3[name]))) {
    throw new Error("invalid hybrid storage index root");
  }
  const files = /* @__PURE__ */ new Map();
  for (const [key, value] of Object.entries(index3.files)) {
    const v = value;
    const createdAt = new Date(v?.createdAt), lastAccessed = new Date(v?.lastAccessed);
    if (!v || typeof v !== "object" || Array.isArray(v) || v.key !== key || !key || typeof v.userId !== "string" || !v.userId || typeof v.originalName !== "string" || typeof v.mimeType !== "string" || typeof v.contentHash !== "string" || typeof v.isPublic !== "boolean" || typeof v.isDeduplicated !== "boolean" || !["hot", "cold"].includes(v.tier) || ![v.sizeBytes, v.compressedSize, v.accessCount].every((n) => Number.isSafeInteger(n) && n >= 0) || !Number.isFinite(createdAt.getTime()) || !Number.isFinite(lastAccessed.getTime())) {
      throw new Error(`invalid hybrid storage file entry ${JSON.stringify(key)}`);
    }
    files.set(key, { ...v, createdAt, lastAccessed, location: "pocket-dimension" });
  }
  for (const [hash2, keys] of Object.entries(index3.contentHashes)) {
    if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string" && files.get(key)?.contentHash === hash2)) {
      throw new Error("invalid hybrid content-hash references");
    }
  }
  for (const [hash2, key] of Object.entries(index3.publicHashes)) {
    if (typeof key !== "string" || files.get(key)?.contentHash !== hash2) throw new Error("invalid hybrid public-hash references");
  }
  return [...files.values()].map((entry) => {
    let source = entry;
    const visited = /* @__PURE__ */ new Set();
    while (source.isDeduplicated) {
      if (!source.deduplicationRef || visited.has(source.key)) throw new Error("cyclic or missing hybrid deduplication reference");
      visited.add(source.key);
      const next = files.get(source.deduplicationRef);
      if (!next || next.contentHash !== entry.contentHash || next.sizeBytes !== entry.sizeBytes) {
        throw new Error("unresolved hybrid deduplication ownership reference");
      }
      source = next;
    }
    return { entry, blobKey: `storage/${source.key}`, state: "active" };
  });
}
var COLD_TIER_THRESHOLD_DAYS, COLD_TIER_THRESHOLD_MS, HOT_ACCESS_COUNT_THRESHOLD, HybridStorageService, hybridStorageService;
var init_hybridStorageService = __esm({
  "server/services/hybridStorageService.ts"() {
    "use strict";
    init_pocket_dimension();
    init_pdimClient();
    init_hybridStorageRepository();
    init_hybridImmutableByteStore();
    COLD_TIER_THRESHOLD_DAYS = 30;
    COLD_TIER_THRESHOLD_MS = COLD_TIER_THRESHOLD_DAYS * 864e5;
    HOT_ACCESS_COUNT_THRESHOLD = 5;
    HybridStorageService = class _HybridStorageService {
      constructor(dependencies = {}) {
        this.dependencies = dependencies;
        this.coldPocket = null;
        this.repository = dependencies.repository;
        this.byteStore = dependencies.byteStore ?? new HybridImmutableByteStore({
          // Bypass PDIM's stale-on-error L1 reads for publication/integrity checks.
          get: async (key) => (await getPdimClient().mget(key))[0],
          set: (key, value) => getPdimClient().set(key, value),
          setnx: (key, value) => getPdimClient().setnx(key, value),
          del: (...keys) => getPdimClient().del(...keys)
        });
      }
      static getInstance() {
        return _HybridStorageService.instance ??= new _HybridStorageService();
      }
      async initialize() {
        if (!this.initialization) this.initialization = this.initializeOnce().catch((error) => {
          this.initialization = void 0;
          throw error;
        });
        return this.initialization;
      }
      async initializeOnce() {
        try {
          this.coldPocket = await (this.dependencies.openPocket?.() ?? pocketManager.openPocket("hybrid-cold-storage", {
            compressionLevel: 9,
            enableDeduplication: true,
            enableVersioning: true,
            chunkSize: 32 * 1024 * 1024
          }));
        } catch (error) {
          throw new Error("Hybrid storage initialization failed: Pocket Dimension is unavailable or corrupt", { cause: error });
        }
        if (!this.repository) {
          const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
          this.repository = new HybridStorageRepository(pool2);
        }
        try {
          await this.repository.importLegacy(async () => parseLegacyHybridIndex(await (this.dependencies.loadLegacy?.() ?? getPdimClient().get("hybrid:storage:index"))));
        } catch (error) {
          throw new Error("Failed to load hybrid storage ownership index: stored value is unavailable or corrupt", { cause: error });
        }
      }
      async upload(userId, fileName, data, mimeType, options) {
        await this.initialize();
        if (!userId || !fileName || !Buffer.isBuffer(data) || !mimeType) throw new Error("Invalid hybrid upload");
        const contentHash = createHash11("sha256").update(data).digest("hex");
        const name = fileName.replace(/[^a-zA-Z0-9?._-]/g, "_");
        const folder = options?.folder ? options.folder.replace(/[^a-zA-Z0-9/_-]/g, "_") + "/" : "";
        const key = `${userId}/${folder}${randomUUID5()}-${name}`;
        const entry = {
          key,
          originalName: fileName,
          mimeType,
          sizeBytes: data.length,
          compressedSize: data.length,
          tier: "cold",
          location: "pocket-dimension",
          contentHash,
          accessCount: 0,
          lastAccessed: /* @__PURE__ */ new Date(),
          createdAt: /* @__PURE__ */ new Date(),
          userId,
          isPublic: options?.isPublic ?? false,
          isDeduplicated: false,
          metadata: options?.metadata
        };
        const blobKey = `hybrid:v2:${randomUUID5()}`;
        const intent = await this.repository.beginUpload(entry, blobKey);
        if (intent.deduplicated) {
          const verified = await this.byteStore.read(intent.blobKey);
          if (!verified.equals(data)) throw new Error("Hybrid deduplicated bytes failed verification");
          await this.repository.activate(key, intent.compressedSize);
          return {
            key,
            tier: "cold",
            sizeBytes: data.length,
            compressedSize: intent.compressedSize,
            contentHash,
            isDeduplicated: true,
            compressionRatio: intent.compressedSize ? data.length / intent.compressedSize : 1
          };
        }
        const stored = await this.byteStore.write(blobKey, data);
        if (!Number.isSafeInteger(stored.compressedSize) || stored.compressedSize < 0) throw new Error("Invalid stored byte receipt");
        await this.repository.activate(key, stored.compressedSize);
        return {
          key,
          tier: "cold",
          sizeBytes: data.length,
          compressedSize: stored.compressedSize,
          contentHash,
          isDeduplicated: false,
          compressionRatio: stored.compressedSize ? data.length / stored.compressedSize : 1
        };
      }
      async read(userId, key) {
        await this.initialize();
        const row = await this.repository.get(key);
        if (!row) throw new Error(`File not found: ${key}`);
        if (row.entry.userId !== userId && !row.entry.isPublic) throw new Error(`Access denied: ${key}`);
        const data = await this.storeFor(row.blobKey).read(row.blobKey);
        if (data.length !== row.entry.sizeBytes || createHash11("sha256").update(data).digest("hex") !== row.entry.contentHash) {
          throw new Error("Hybrid stored file integrity check failed");
        }
        await this.repository.touch(key);
        return data;
      }
      async delete(userId, key) {
        await this.initialize();
        const deletion = await this.repository.beginDelete(key, userId);
        if (!deletion.found) return false;
        if (deletion.blobKey) {
          await this.storeFor(deletion.blobKey).delete(deletion.blobKey);
          await this.repository.finishDelete(key, userId);
        }
        return true;
      }
      /** Explicit recovery of a retained upload intent, without guessing that a
       * missing/unreadable blob was committed. The caller must own the intent. */
      async recoverPendingUpload(userId, key) {
        await this.initialize();
        const row = await this.repository.get(key, true);
        if (!row) return false;
        if (row.entry.userId !== userId) throw new Error(`Access denied: ${key}`);
        if (row.state !== "uploading") return row.state === "active";
        const data = await this.storeFor(row.blobKey).read(row.blobKey);
        if (data.length !== row.entry.sizeBytes || createHash11("sha256").update(data).digest("hex") !== row.entry.contentHash) {
          throw new Error("Hybrid pending upload integrity check failed");
        }
        const receipt = await this.storeFor(row.blobKey).write(row.blobKey, data);
        await this.repository.activate(key, receipt.compressedSize);
        return true;
      }
      storeFor(blobKey) {
        return blobKey.startsWith("hybrid:v2:") ? this.byteStore : this.coldPocket;
      }
      async listFiles(userId, options) {
        await this.initialize();
        return (await this.repository.list(userId, options?.includePublic)).map((row) => row.entry).filter((entry) => (!options?.tier || entry.tier === options.tier) && (!options?.location || entry.location === options.location) && (!options?.folder || entry.key.startsWith(`${entry.userId}/${options.folder}/`))).sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());
      }
      async getMetadata(key) {
        await this.initialize();
        return (await this.repository.get(key))?.entry;
      }
      async exists(key) {
        return !!await this.getMetadata(key);
      }
      async getDownloadUrl(userId, key) {
        const entry = await this.getMetadata(key);
        if (!entry) throw new Error(`File not found: ${key}`);
        if (entry.userId !== userId && !entry.isPublic) throw new Error(`Access denied: ${key}`);
        return `/api/storage/hybrid/file/${encodeURIComponent(key)}`;
      }
      async tierDown(key) {
        const entry = await this.getMetadata(key);
        if (!entry || entry.tier === "cold" || entry.isDeduplicated) return false;
        return this.repository.markCold(key);
      }
      async runAutoTiering() {
        await this.initialize();
        let tieredDown = 0;
        for (const { entry } of await this.repository.list()) {
          if (entry.tier === "hot" && Date.now() - entry.lastAccessed.getTime() > COLD_TIER_THRESHOLD_MS && entry.accessCount < HOT_ACCESS_COUNT_THRESHOLD && await this.tierDown(entry.key)) tieredDown++;
        }
        return { tieredDown, tieredUp: 0 };
      }
      async getAnalytics(userId) {
        await this.initialize();
        const rows = await this.repository.list(userId);
        const entries = rows.map((row) => row.entry);
        const unique3 = new Map(rows.map((row) => [row.blobKey, row.entry]));
        const tierBreakdown = {
          hot: { count: 0, sizeBytes: 0, files: [] },
          cold: { count: 0, sizeBytes: 0, compressedSize: 0, compressionRatio: 1, files: [] }
        };
        for (const entry of unique3.values()) {
          const tier = tierBreakdown[entry.tier];
          tier.count++;
          tier.sizeBytes += entry.sizeBytes;
          tier.files.push(entry.key);
          if (entry.tier === "cold") tierBreakdown.cold.compressedSize += entry.compressedSize;
        }
        if (tierBreakdown.cold.compressedSize) tierBreakdown.cold.compressionRatio = tierBreakdown.cold.sizeBytes / tierBreakdown.cold.compressedSize;
        const totalSizeBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
        const physicalSizeBytes = [...unique3.values()].reduce((sum, entry) => sum + entry.compressedSize, 0);
        const ownersByBlob = /* @__PURE__ */ new Map();
        const duplicateRows = [];
        for (const row of rows) {
          const owners = ownersByBlob.get(row.blobKey);
          if (owners) {
            duplicateRows.push(row);
            owners.add(row.entry.userId);
          } else ownersByBlob.set(row.blobKey, /* @__PURE__ */ new Set([row.entry.userId]));
        }
        const spaceSaved = duplicateRows.reduce((sum, row) => sum + row.entry.sizeBytes, 0);
        const cleanupCandidates = entries.filter((entry) => entry.accessCount === 0);
        const recommendations = cleanupCandidates.length > 10 ? [{
          type: "cleanup",
          priority: "medium",
          message: `${cleanupCandidates.length} files have never been accessed. Consider cleanup.`,
          potentialSavings: cleanupCandidates.reduce((sum, entry) => sum + entry.sizeBytes, 0),
          affectedKeys: cleanupCandidates.slice(0, 10).map((entry) => entry.key)
        }] : [];
        const sorted = [...entries].sort((a, b) => b.accessCount - a.accessCount);
        return {
          totalFiles: entries.length,
          totalSizeBytes,
          physicalSizeBytes,
          tierBreakdown,
          deduplication: {
            totalDuplicates: duplicateRows.length,
            spaceSaved,
            savingsPercent: totalSizeBytes ? spaceSaved / (totalSizeBytes || 1) * 100 : 0,
            crossUserDuplicates: duplicateRows.filter((row) => (ownersByBlob.get(row.blobKey)?.size ?? 0) > 1).length
          },
          overallCompressionRatio: physicalSizeBytes ? totalSizeBytes / physicalSizeBytes : 1,
          costSavingsPercent: totalSizeBytes ? (totalSizeBytes - physicalSizeBytes) / (totalSizeBytes || 1) * 100 : 0,
          recommendations,
          accessPatterns: {
            mostAccessed: sorted.slice(0, 10),
            leastAccessed: sorted.slice(-10).reverse(),
            recentlyAccessed: [...entries].sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime()).slice(0, 10)
          }
        };
      }
      async getTierBreakdown(userId) {
        return (await this.getAnalytics(userId)).tierBreakdown;
      }
      async getDeduplicationStats(userId) {
        return (await this.getAnalytics(userId)).deduplication;
      }
      async migrateFile(userId, key, _targetTier, _targetLocation) {
        const entry = await this.getMetadata(key);
        if (!entry) return false;
        if (entry.userId !== userId) throw new Error(`Access denied: ${key}`);
        return this.repository.markCold(key, userId);
      }
      async optimizeStorage(_userId) {
        return { ...await this.runAutoTiering(), deduplicated: 0 };
      }
      async cleanup(userId, options) {
        const days = options?.olderThanDays ?? 90;
        if (!Number.isFinite(days) || days < 0) throw new Error("Invalid cleanup age");
        let deletedCount = 0, freedBytes = 0;
        for (const entry of await this.listFiles(userId)) {
          if (entry.accessCount === 0 && Date.now() - entry.lastAccessed.getTime() > days * 864e5 && await this.delete(userId, entry.key)) {
            deletedCount++;
            freedBytes += entry.sizeBytes;
          }
        }
        return { deletedCount, freedBytes };
      }
    };
    hybridStorageService = HybridStorageService.getInstance();
  }
});

// scripts/legacy-hybrid-recovery.ts
var legacy_hybrid_recovery_exports = {};
__export(legacy_hybrid_recovery_exports, {
  legacyHybridSnapshotReader: () => legacyHybridSnapshotReader
});
function legacyHybridSnapshotReader() {
  return new HybridStorageService({ repository: new LegacySnapshotRepository() });
}
var LegacySnapshotRepository;
var init_legacy_hybrid_recovery = __esm({
  "scripts/legacy-hybrid-recovery.ts"() {
    "use strict";
    init_hybridStorageService();
    init_hybridStorageRepository();
    LegacySnapshotRepository = class extends HybridStorageRepository {
      constructor() {
        super({
          async query() {
            throw new Error("Legacy snapshot verification cannot write SQL");
          },
          async connect() {
            throw new Error("Legacy snapshot verification cannot open SQL");
          }
        });
        this.rows = /* @__PURE__ */ new Map();
      }
      async importLegacy(load) {
        const parsed = await load();
        this.rows = new Map(parsed.map((row) => [row.entry.key, row]));
      }
      async get(key) {
        return this.rows.get(key);
      }
      async list(userId, includePublic = false) {
        return [...this.rows.values()].filter((row) => userId === void 0 || row.entry.userId === userId || includePublic && row.entry.isPublic);
      }
      // Reading a backup must not rewrite metadata or increment its source counters.
      async touch() {
      }
    };
  }
});

// scripts/retained-pdim-recovery-worker.ts
import assert from "node:assert/strict";
import { createHash as createHash12 } from "node:crypto";
var digest4 = (parts) => {
  const hash2 = createHash12("sha256");
  for (const part of parts) hash2.update(part).update("\0");
  return hash2.digest("hex");
};
var { startLocalPdimServer: startLocalPdimServer2, stopLocalPdimServer: stopLocalPdimServer2 } = await Promise.resolve().then(() => (init_localPdimServer(), localPdimServer_exports));
try {
  await startLocalPdimServer2();
  const { legacyHybridSnapshotReader: legacyHybridSnapshotReader2 } = await Promise.resolve().then(() => (init_legacy_hybrid_recovery(), legacy_hybrid_recovery_exports));
  const hybridStorageService2 = legacyHybridSnapshotReader2();
  const { pocketManager: pocketManager2 } = await Promise.resolve().then(() => (init_pocket_dimension(), pocket_dimension_exports));
  const { getPdimClient: getPdimClient2 } = await Promise.resolve().then(() => (init_pdimClient(), pdimClient_exports));
  await hybridStorageService2.initialize();
  const raw = await getPdimClient2().get("hybrid:storage:index");
  assert.notEqual(raw, null, "hybrid ownership index is absent");
  const index3 = JSON.parse(raw);
  assert(index3 && typeof index3 === "object" && !Array.isArray(index3));
  const files = Object.values(index3.files ?? {});
  assert(files.length > 0, "hybrid ownership index contains no persisted files");
  const owners = /* @__PURE__ */ new Map();
  const fileEvidence = [];
  for (const file of files.sort((left, right) => String(left.key).localeCompare(String(right.key)))) {
    const key = String(file.key);
    const owner = String(file.userId);
    assert(key.length > 0 && owner.length > 0);
    const bytes = await hybridStorageService2.read(owner, key);
    const contentSha256 = createHash12("sha256").update(bytes).digest("hex");
    assert.equal(contentSha256, file.contentHash);
    assert.equal(bytes.length, file.sizeBytes);
    const metadata = await hybridStorageService2.getMetadata(key);
    assert(metadata);
    assert.equal(metadata.userId, owner);
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    fileEvidence.push(`${key}\0${owner}\0${contentSha256}\0${bytes.length}`);
  }
  const ownershipEvidence = [];
  for (const [owner, count] of [...owners].sort(([left], [right]) => left.localeCompare(right))) {
    assert.equal((await hybridStorageService2.listFiles(owner)).length, count);
    ownershipEvidence.push(`${owner}\0${count}`);
  }
  const pocket2 = await pocketManager2.openPocket("hybrid-cold-storage");
  const pocketEntries = await pocket2.list("storage/");
  const physicalFiles = files.filter((file) => file.isDeduplicated !== true);
  assert.equal(pocketEntries.length, physicalFiles.length);
  const stats = pocket2.getStats();
  assert(stats.chunkCount > 0);
  const result = {
    fileCount: files.length,
    ownerCount: owners.size,
    physicalFileCount: physicalFiles.length,
    pocketEntryCount: pocketEntries.length,
    chunkCount: stats.chunkCount,
    fileContentEvidenceSha256: digest4(fileEvidence),
    ownershipCountsSha256: digest4(ownershipEvidence),
    everyFileReadByActualClasses: true,
    metadataScope: "legacy-pdim-index-only",
    currentSqlMetadataRecovered: false
  };
  await pocketManager2.closeAll();
  await stopLocalPdimServer2();
  process.stdout.write(`RETAINED_PDIM_RESULT ${JSON.stringify(result)}
`);
} catch (error) {
  await stopLocalPdimServer2().catch(() => {
  });
  process.stderr.write("Retained PDIM isolated verification failed\n");
  process.exitCode = 1;
}
