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
function sanitizeLogText(text) {
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~:-]+/gi, REDACTED).replace(/((?:password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, `$1${REDACTED}`).replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED).replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (value) => isIP(value) ? REDACTED : value).replace(
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
    let index = start + 1;
    const negated = tokens[index] === "^";
    if (negated) index++;
    let matched = false;
    if (tokens[index] === "]") {
      matched = character === "]";
      index++;
    }
    while (index < end) {
      let left = tokens[index];
      if (left === "\\" && index + 1 < end) left = tokens[++index];
      const hasRange = index + 2 < end && tokens[index + 1] === "-";
      if (hasRange) {
        let right = tokens[index + 2];
        if (right === "\\" && index + 3 < end) right = tokens[index + 3];
        if (left <= character && character <= right) matched = true;
        index += right === tokens[index + 2] ? 3 : 4;
      } else {
        if (left === character) matched = true;
        index++;
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
      async captureEmbeddedCheckpoint(capture) {
        return this.runEmbeddedCommand(async () => {
          await this.commitEmbeddedAof();
          return capture(this.aofSeq);
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
      waitForResult(read, timeoutMs, signal) {
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
            this.off("mutation", check);
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
            void Promise.resolve().then(() => read(() => !settled)).then((value) => {
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
          const check = () => performCheck();
          this.on("mutation", check);
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
          check();
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
          const hash = {};
          this.data.set(key, { type: "hash", value: hash });
          return hash;
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
        const hash = this.getOrCreateHash(key);
        let added = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          if (!(pairs[i] in hash)) added++;
          hash[pairs[i]] = pairs[i + 1];
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
        const hash = this.getOrCreateHash(key);
        const n = Number(hash[field] ?? 0);
        if (Number.isNaN(n)) throw new Error("ERR hash value is not an integer");
        const next = n + Number(by);
        hash[field] = String(next);
        this.dirty = true;
        return next;
      }
      cmdHIncrByFloat(args) {
        const [key, field, by] = args;
        if (!key || field === void 0 || by === void 0)
          throw new Error("ERR wrong number of arguments for 'hincrbyfloat'");
        if (this.isExpired(key)) this.data.delete(key);
        const hash = this.getOrCreateHash(key);
        const n = parseFloat(hash[field] ?? "0");
        if (Number.isNaN(n)) throw new Error("ERR hash value is not a float");
        const next = n + parseFloat(by);
        hash[field] = String(next);
        this.dirty = true;
        return String(next);
      }
      cmdHSetNx(args) {
        const [key, field, value] = args;
        if (!key || field === void 0 || value === void 0)
          throw new Error("ERR wrong number of arguments for 'hsetnx'");
        if (this.isExpired(key)) this.data.delete(key);
        const hash = this.getOrCreateHash(key);
        if (field in hash) return 0;
        hash[field] = value;
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
            const idx = zset.findIndex((z) => z.member === m);
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
        return zset.filter((z) => {
          const aboveMin = min.exclusive ? z.score > min.value : z.score >= min.value;
          const belowMax = max.exclusive ? z.score < max.value : z.score <= max.value;
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
        return zset.filter((z) => {
          const aboveMin = minBound === null ? true : minInc ? z.member >= minBound : z.member > minBound;
          const belowMax = maxBound === null ? true : maxInc ? z.member <= maxBound : z.member < maxBound;
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
          result = zset.filter((z) => {
            const aboveMin = min.exclusive ? z.score > min.value : z.score >= min.value;
            const belowMax = max.exclusive ? z.score < max.value : z.score <= max.value;
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
          for (const z of result) {
            out.push(z.member, String(z.score));
          }
          return out;
        }
        return result.map((z) => z.member);
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
          for (const z of slice) {
            out.push(z.member, String(z.score));
          }
          return out;
        }
        return slice.map((z) => z.member);
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
        let result = zset.filter((z) => {
          const aboveMin = minB.exclusive ? z.score > minB.value : z.score >= minB.value;
          const belowMax = maxB.exclusive ? z.score < maxB.value : z.score <= maxB.value;
          return aboveMin && belowMax;
        });
        if (limitOffset > 0) result = result.slice(limitOffset);
        if (limitCount >= 0) result = result.slice(0, limitCount);
        if (withScores) {
          const out = [];
          for (const z of result) {
            out.push(z.member, String(z.score));
          }
          return out;
        }
        return result.map((z) => z.member);
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
        let result = zset.filter((z) => {
          const aboveMin = minBound === null ? true : minInc ? z.member >= minBound : z.member > minBound;
          const belowMax = maxBound === null ? true : maxInc ? z.member <= maxBound : z.member < maxBound;
          return aboveMin && belowMax;
        });
        if (limitOffset > 0) result = result.slice(limitOffset);
        if (limitCount >= 0) result = result.slice(0, limitCount);
        return result.map((z) => z.member);
      }
      cmdZRank(args, rev) {
        const [key, member] = args;
        if (!key || member === void 0)
          throw new Error("ERR wrong number of arguments for 'zrank'");
        let zset = this.resolveZSet(key);
        if (rev) zset = [...zset].reverse();
        const idx = zset.findIndex((z) => z.member === member);
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
          for (const z of popped) memberIdx.delete(z.member);
        }
        if (members.length === 0) {
          this.data.delete(key);
          this.clearExpiry(key);
          this.zsetIndex.delete(key);
        } else this.dirty = true;
        const out = [];
        for (const z of popped) {
          out.push(z.member, String(z.score));
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
          return shuffled.slice(0, Math.min(abs, shuffled.length)).map((z) => z.member);
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
          this.resolveZSet(firstKey).map((z) => [z.member, z.score])
        );
        for (const k of restKeys) {
          for (const z of this.resolveZSet(k)) base.delete(z.member);
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
          for (const z of this.resolveZSet(keys[k])) {
            const w = weights[k] ?? 1;
            acc.set(z.member, (acc.get(z.member) ?? 0) + z.score * w);
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
          this.resolveZSet(keys[0]).map((z) => [
            z.member,
            z.score * (weights[0] ?? 1)
          ])
        );
        for (let k = 1; k < keys.length; k++) {
          const other = new Map(
            this.resolveZSet(keys[k]).map((z) => [z.member, z.score])
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
              const text = await response.text().catch(() => "");
              throw new Error(`PDIM Pub/Sub HTTP ${response.status}: ${text.slice(0, 200)}`);
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
              const text = await res.text().catch(() => "");
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
                const errMsg = `PDIM HTTP ${res.status}: ${text.slice(0, 120)}`;
                _logExecError(cmd, res.status, errMsg);
                throw new Error(errMsg);
              }
              counted = true;
              _PdimRedisClient._clearRateLimitIfExpired();
              _pdimAdaptSuccess();
              cbRecordSuccess();
              throw new Error(
                `PDIM HTTP ${res.status} (${String(cmd)}): ${text.slice(0, 200)}`
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
              const text = await res.text().catch(() => "");
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
                throw new Error(`PDIM HTTP ${res.status} (script ${cmd}): ${text?.slice(0, 200)}`);
              }
              counted = true;
              _PdimRedisClient._clearRateLimitIfExpired();
              _pdimAdaptSuccess();
              cbRecordSuccess();
              throw new Error(
                `PDIM HTTP ${res.status} (script ${String(cmd)}): ${text.slice(0, 200)}`
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
        const subscriptions = kind === "channel" ? this.pubSubChannels : this.pubSubPatterns;
        const names = [...new Set(requestedNames)];
        if (add && names.length === 0) {
          throw new TypeError(`${kind === "channel" ? "SUBSCRIBE" : "PSUBSCRIBE"} requires a name`);
        }
        const changedNames = add ? names.filter((name) => !subscriptions.has(name)) : names.length === 0 ? [...subscriptions] : names.filter((name) => subscriptions.has(name));
        if (add) {
          for (const name of changedNames) subscriptions.add(name);
        } else if (names.length === 0) {
          subscriptions.clear();
        } else {
          for (const name of changedNames) subscriptions.delete(name);
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
        for (let index = 0; index < changedNames.length; index++) {
          const acknowledgedCount = add ? total - changedNames.length + index + 1 : total + changedNames.length - index - 1;
          this.emit(eventName, changedNames[index], acknowledgedCount);
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

// server/computeSizing.ts
import os3 from "os";
import fs2 from "node:fs";
function limitFile(file) {
  try {
    return fs2.readFileSync(file, "utf8").trim();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code ?? "")) return null;
    throw error;
  }
}
function effectiveCapacity() {
  let cpus = os3.availableParallelism();
  let memory = os3.totalmem();
  const cpuMax = limitFile("/sys/fs/cgroup/cpu.max")?.split(/\s+/);
  const quota = cpuMax ? Number(cpuMax[0]) : Number(limitFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"));
  const period = cpuMax ? Number(cpuMax[1]) : Number(limitFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us"));
  if (quota > 0 && period > 0) cpus = Math.min(cpus, quota / period);
  for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    const n = Number(limitFile(file));
    if (n > 0 && Number.isFinite(n)) memory = Math.min(memory, n);
  }
  return { cpus, memoryGB: memory / 1024 ** 3 };
}
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
    os3.availableParallelism(),
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
        const { workerCount } = computeWorkerSizing({
          memPerWorkerGB: 0.25,
          maxWorkers: 8
        });
        const poolSize = Math.max(1, workerCount);
        const startWorker = (index) => new Promise((resolve, reject) => {
          const worker = new Worker3(workerPath);
          const state2 = { worker, busy: false };
          const timeout = setTimeout(
            () => reject(new Error(`Block compressor worker ${index} init timeout`)),
            INIT_TIMEOUT_MS
          );
          worker.once("message", (msg) => {
            if (msg?.ready) {
              clearTimeout(timeout);
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
              logger.warn(`[ParallelBlockCompressor] Worker ${index} exited with code ${code}`);
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
  const date = new Date(value);
  if (typeof value !== "string" && !(value instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error(`invalid ${field}`);
  }
  return date;
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
async function pocket(id, config) {
  return pocketManager?.openPocket(id, config);
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
      constructor(config) {
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
        this.storage = config.storage;
        this.id = config?.id;
        this.name = config?.name;
        this.chunkSize = config?.chunkSize || 1024 * 1024;
        this.maxRecursionDepth = config?.maxRecursionDepth || 10;
        this.compressionLevel = config?.compressionLevel || 9;
        this.enableDeduplication = config?.enableDeduplication ?? true;
        this.enableVersioning = config?.enableVersioning ?? true;
        this.storagePath = config?.storagePath || "./pocket-dimensions";
        if (config?.encryptionKey) {
          this.rawEncryptionKey = config?.encryptionKey;
          this.encryptionKey = scryptSync(
            config?.encryptionKey,
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
                createDimension: (config) => target?.createNestedDimension(prop, config)
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
            const index = parsePocketIndex(indexRaw);
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
            this.entries = index.entries;
            this.chunks = index.chunks;
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
        const hash = this.hashContent(data);
        if (this.enableDeduplication && this.chunks.has(hash)) {
          const existing = this.chunks.get(hash);
          existing.accessCount++;
          existing.lastAccessed = /* @__PURE__ */ new Date();
          return existing;
        }
        const compressed = await this.compress(data);
        const finalData = this.encryptionKey ? this.encrypt(compressed) : compressed;
        this.chunkData.set(hash, finalData);
        await this.persistChunk(hash, finalData);
        const chunk = {
          id: hash,
          size: data.length,
          compressedSize: finalData.length,
          compressionRatio: data.length / finalData?.length,
          createdAt: /* @__PURE__ */ new Date(),
          accessCount: 1,
          lastAccessed: /* @__PURE__ */ new Date(),
          encrypted: !!this.encryptionKey,
          depth
        };
        this.chunks.set(hash, chunk);
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
      async createNestedDimension(dimensionPath, config) {
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
          encryptionKey: config?.encryptionKey ?? this.rawEncryptionKey ?? void 0,
          chunkSize: config?.chunkSize || this.chunkSize,
          maxRecursionDepth: config?.maxRecursionDepth || this.maxRecursionDepth,
          compressionLevel: config?.compressionLevel || this.compressionLevel,
          enableDeduplication: config?.enableDeduplication ?? this.enableDeduplication,
          enableVersioning: config?.enableVersioning ?? this.enableVersioning,
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
        if (!entry) return false;
        if (entry.type === "dimension") {
          const nested = this.nestedDimensions.get(entryPath);
          if (nested) {
            await nested.close();
            this.nestedDimensions.delete(entryPath);
          }
        }
        this.entries.delete(entryPath);
        this.metadata.totalSize -= entry?.size;
        this.metadata.compressedSize -= entry?.compressedSize;
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
      updateMetadata(originalSize, compressedSize) {
        this.metadata.totalSize += originalSize;
        this.metadata.compressedSize += compressedSize;
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
      async openPocket(id, config) {
        if (this.dimensions.has(id)) {
          const dimension2 = this.dimensions.get(id);
          return dimension2;
        }
        const dimension = new PocketDimension({
          id,
          storage: config?.storage,
          name: config?.name || id,
          encryptionKey: config?.encryptionKey,
          chunkSize: config?.chunkSize,
          maxRecursionDepth: config?.maxRecursionDepth,
          compressionLevel: config?.compressionLevel,
          enableDeduplication: config?.enableDeduplication,
          enableVersioning: config?.enableVersioning,
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
        const { PocketDimension: PocketDimension3 } = await Promise.resolve().then(() => (init_pocket_dimension(), pocket_dimension_exports));
        const root = new PocketDimension3({
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
        const hash = digest(bytes);
        await pocket2.write(hash, bytes, { depth: 2 });
        await root.close();
        const reference = {
          format: "pdim-recursive-state-v1",
          namespace,
          entry: hash,
          sha256: hash,
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
      for (let index = 0; index < count; index++) {
        if (chunk[index] !== 10) continue;
        fragments.push(chunk.subarray(start, index));
        yield { line: Buffer.concat(fragments).toString("utf8"), end: offset + index + 1 };
        fragments = [];
        start = index + 1;
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
        let sequence = baseline;
        for (const item of completeLines(this.file)) {
          end = item.end;
          if (!item.line) continue;
          const record = this.decode(item.line);
          if (record.seq <= previous) throw new Error("Capsule journal sequence regression");
          previous = record.seq;
          if (record.seq <= baseline) continue;
          if (record.seq !== sequence + 1) throw new Error("Capsule journal sequence gap");
          sequence = record.seq;
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

// server/lib/localPdimServer.ts
var localPdimServer_exports = {};
__export(localPdimServer_exports, {
  assertLocalPdimSnapshotAuthority: () => assertLocalPdimSnapshotAuthority,
  getLocalPdimUrl: () => getLocalPdimUrl,
  isLocalPdimServerOwnedByThisProcess: () => isLocalPdimServerOwnedByThisProcess,
  openConsistentLocalPdimSnapshot: () => openConsistentLocalPdimSnapshot,
  startLocalPdimServer: () => startLocalPdimServer,
  stopLocalPdimServer: () => stopLocalPdimServer
});
import http from "http";
import fs5 from "fs";
import path7 from "path";
import cluster from "node:cluster";
function expired(e) {
  return e.expiresAt !== void 0 && Date.now() > e.expiresAt;
}
function saveStoreAsync() {
  const operation = snapshotTail.then(async () => {
    const publication = snapshotPublication;
    const temporaryFile = `${PERSIST_FILE}.async-${process.pid}-${++asyncSnapshotSequence}`;
    try {
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
          serialized: JSON.stringify(obj),
          capsuleBaseline,
          redisBaseline
        };
      });
      await fs5.promises.mkdir(path7.dirname(PERSIST_FILE), { recursive: true });
      const file = await fs5.promises.open(temporaryFile, "wx", 384);
      try {
        await file.writeFile(snapshot.serialized, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      if (snapshotPublication !== publication) {
        await fs5.promises.rm(temporaryFile, { force: true });
        return true;
      }
      fs5.renameSync(temporaryFile, PERSIST_FILE);
      const directory = await fs5.promises.open(path7.dirname(PERSIST_FILE), "r");
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
      await fs5.promises.rm(temporaryFile, { force: true }).catch(() => {
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
    fs5.mkdirSync(path7.dirname(PERSIST_FILE), { recursive: true });
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
    fs5.writeFileSync(temporaryFile, JSON.stringify(obj), {
      encoding: "utf8",
      mode: 384,
      flush: true
    });
    fs5.renameSync(temporaryFile, PERSIST_FILE);
    const directory = fs5.openSync(path7.dirname(PERSIST_FILE), "r");
    try {
      fs5.fsyncSync(directory);
    } finally {
      fs5.closeSync(directory);
    }
    snapshotPublication++;
    return true;
  } catch (err) {
    try {
      fs5.rmSync(temporaryFile, { force: true });
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
  if (!fs5.existsSync(PERSIST_FILE)) return;
  try {
    const raw = fs5.readFileSync(PERSIST_FILE, "utf8");
    const data = JSON.parse(raw);
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
  const link = fs5.lstatSync(PERSIST_FILE);
  if (!link.isFile() || link.isSymbolicLink()) {
    throw new Error("Committed local PDIM snapshot is not a regular owned file");
  }
  const fd = fs5.openSync(PERSIST_FILE, fs5.constants.O_RDONLY);
  try {
    const pinned = fs5.fstatSync(fd);
    const current = fs5.statSync(PERSIST_FILE);
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
    fs5.closeSync(fd);
    throw error;
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
  _starting = new Promise((resolve, reject) => {
    if (_server) {
      resolve();
      return;
    }
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
    _server = http.createServer((req, res) => {
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
          const result = cmd.toUpperCase().startsWith("CAPSULE.") ? await capsuleStore.exec(cmd, args.map(String)) : await canonicalStore.exec(cmd, args.map(String), requestController.signal);
          if (requestController.signal.aborted || res.destroyed || res.writableEnded) return;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          if (requestController.signal.aborted || res.destroyed || res.writableEnded) return;
          if (res.headersSent) {
            res.destroy(err instanceof Error ? err : void 0);
            return;
          }
          const status = err?.code === "PDIM_DURABILITY_FAILURE" ? 503 : 400;
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
        `[LocalPDIM] \u2705 Local PDIM exec server started on port ${LOCAL_PORT} (canonical RedisStore + fsynced AOF + snapshots)`
      );
      let periodicSavePending = false;
      _persistTimer = setInterval(() => {
        if (periodicSavePending) return;
        periodicSavePending = true;
        void saveStoreAsync().finally(() => {
          periodicSavePending = false;
        });
      }, PERSIST_INTERVAL_MS);
      _persistTimer.unref();
      const saveOnShutdown = () => {
        if (!saveStore()) {
          _finalSaveFailed = true;
          process.exitCode = 1;
        }
      };
      _saveOnShutdown = saveOnShutdown;
      process.on("SIGTERM", saveOnShutdown);
      process.on("SIGINT", saveOnShutdown);
      process.on("exit", () => {
        if (_finalSaveFailed) process.exitCode = 1;
      });
      resolve();
    });
    _server.on("error", (err) => {
      _server = null;
      reject(err);
    });
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
  canonicalStore.closeEmbedded();
  await new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
  await snapshotTail;
}
var LOCAL_PORT, PERSIST_FILE, PERSIST_INTERVAL_MS, CAPSULE_WATERMARK, REDIS_AOF_WATERMARK, capsuleJournal, redisAofJournal, store, canonicalStore, snapshotAofBaseline, capsuleStore, snapshotPublication, asyncSnapshotSequence, snapshotTail, _server, _finalSaveFailed, _persistTimer, _saveOnShutdown, _starting;
var init_localPdimServer = __esm({
  "server/lib/localPdimServer.ts"() {
    "use strict";
    init_logger();
    init_ports();
    init_store();
    init_localPdimCapsules();
    init_localPdimCapsuleJournal();
    init_localPdimAofJournal();
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
      (changes, publish) => capsuleJournal.commit(changes, publish)
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

// server/services/hybridStorageService.ts
var hybridStorageService_exports = {};
__export(hybridStorageService_exports, {
  HybridStorageService: () => HybridStorageService,
  hybridStorageService: () => hybridStorageService
});
import { createHash as createHash7 } from "crypto";
var COLD_TIER_THRESHOLD_DAYS, COLD_TIER_THRESHOLD_MS, HOT_ACCESS_COUNT_THRESHOLD, _SIZE_THRESHOLD_FOR_COLD, HybridStorageService, hybridStorageService;
var init_hybridStorageService = __esm({
  "server/services/hybridStorageService.ts"() {
    "use strict";
    init_pocket_dimension();
    init_logger();
    init_pdimClient();
    COLD_TIER_THRESHOLD_DAYS = 30;
    COLD_TIER_THRESHOLD_MS = COLD_TIER_THRESHOLD_DAYS * 24 * 60 * 60 * 1e3;
    HOT_ACCESS_COUNT_THRESHOLD = 5;
    _SIZE_THRESHOLD_FOR_COLD = 50 * 1024 * 1024;
    HybridStorageService = class _HybridStorageService {
      constructor() {
        this.replitClient = null;
        this.coldPocket = null;
        this.initialized = false;
        this.fileIndex = /* @__PURE__ */ new Map();
        this.contentHashIndex = /* @__PURE__ */ new Map();
        this.publicContentHashes = /* @__PURE__ */ new Map();
      }
      static {
        this.MAX_FILE_INDEX_ENTRIES = 5e5;
      }
      static {
        this.FILE_INDEX_WARN_THRESHOLD = 4e5;
      }
      static getInstance() {
        if (!_HybridStorageService?.instance) {
          _HybridStorageService.instance = new _HybridStorageService();
        }
        return _HybridStorageService?.instance;
      }
      async initialize() {
        if (this.initialized) return;
        try {
          this.replitClient = null;
          try {
            this.coldPocket = await pocketManager?.openPocket(
              "hybrid-cold-storage",
              {
                compressionLevel: 9,
                enableDeduplication: true,
                enableVersioning: true,
                chunkSize: 32 * 1024 * 1024
              }
            );
            logger.info(
              "[HybridStorage] Pocket Dimension storage initialized (PDIM-only, 32 MB chunks, level-9 gzip, dedup)"
            );
          } catch (e) {
            logger.error(
              { err: e },
              "[HybridStorage] Pocket Dimension unavailable; refusing to initialize PDIM-only storage"
            );
            this.coldPocket = null;
            throw new Error(
              "Hybrid storage initialization failed: Pocket Dimension is unavailable or corrupt",
              { cause: e }
            );
          }
          await this.loadIndex();
          this.initialized = true;
          logger.info(
            "[HybridStorage] Storage service initialized \u2014 PDIM-only mode (Pocket Dimension)"
          );
        } catch (error) {
          logger.warn({ err: error }, "[HybridStorage] Failed to initialize:");
          throw error;
        }
      }
      async loadIndex() {
        try {
          const raw = await getPdimClient().get("hybrid:storage:index");
          if (raw === null) {
            this.fileIndex = /* @__PURE__ */ new Map();
            this.contentHashIndex = /* @__PURE__ */ new Map();
            this.publicContentHashes = /* @__PURE__ */ new Map();
            return;
          }
          const index = JSON.parse(raw);
          if (!index || typeof index !== "object" || Array.isArray(index) || !index.files || typeof index.files !== "object" || Array.isArray(index.files) || !index.contentHashes || typeof index.contentHashes !== "object" || Array.isArray(index.contentHashes) || !index.publicHashes || typeof index.publicHashes !== "object" || Array.isArray(index.publicHashes)) {
            throw new Error("invalid hybrid storage index root");
          }
          const nextFiles = /* @__PURE__ */ new Map();
          for (const [key, value] of Object.entries(index.files)) {
            const v = value;
            const createdAt = new Date(v?.createdAt);
            const lastAccessed = new Date(v?.lastAccessed);
            if (!v || typeof v !== "object" || Array.isArray(v) || v.key !== key || typeof v.userId !== "string" || typeof v.originalName !== "string" || typeof v.mimeType !== "string" || typeof v.contentHash !== "string" || typeof v.isPublic !== "boolean" || typeof v.isDeduplicated !== "boolean" || !["hot", "cold"].includes(v.tier) || !["sizeBytes", "compressedSize", "accessCount"].every(
              (field) => typeof v[field] === "number" && Number.isFinite(v[field]) && v[field] >= 0
            ) || !Number.isFinite(createdAt.getTime()) || !Number.isFinite(lastAccessed.getTime())) {
              throw new Error(`invalid hybrid storage file entry ${JSON.stringify(key)}`);
            }
            nextFiles.set(key, {
              ...v,
              createdAt,
              lastAccessed,
              location: "pocket-dimension"
            });
          }
          const nextHashes = /* @__PURE__ */ new Map();
          for (const [hash, keys] of Object.entries(index.contentHashes)) {
            if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string" && nextFiles.has(key))) {
              throw new Error(`invalid hybrid content-hash entry ${JSON.stringify(hash)}`);
            }
            nextHashes.set(hash, keys);
          }
          const nextPublic = /* @__PURE__ */ new Map();
          for (const [hash, key] of Object.entries(index.publicHashes)) {
            if (typeof key !== "string" || !nextFiles.has(key)) {
              throw new Error(`invalid hybrid public-hash entry ${JSON.stringify(hash)}`);
            }
            nextPublic.set(hash, key);
          }
          this.fileIndex = nextFiles;
          this.contentHashIndex = nextHashes;
          this.publicContentHashes = nextPublic;
          logger.info(
            `[HybridStorage] Loaded index from PDIM with ${this.fileIndex.size} entries`
          );
        } catch (error) {
          throw new Error(
            "Failed to load hybrid storage ownership index: stored value is unavailable or corrupt",
            { cause: error }
          );
        }
      }
      async saveIndex() {
        const size = this.fileIndex.size;
        if (size >= _HybridStorageService?.FILE_INDEX_WARN_THRESHOLD) {
          if (size >= _HybridStorageService?.MAX_FILE_INDEX_ENTRIES) {
            logger.error(
              `[HybridStorage] fileIndex at capacity (${size} entries) \u2014 evicting oldest 10% by lastAccessed. Architectural migration to per-key PDIM storage is required.`
            );
            const evictCount = Math.ceil(size * 0.1);
            const sorted = [...this.fileIndex.entries()].sort(
              ([, a], [, b]) => a?.lastAccessed.getTime() - b?.lastAccessed.getTime()
            );
            for (let i = 0; i < evictCount; i++) {
              this.fileIndex.delete(sorted[i][0]);
            }
          } else {
            logger.warn(
              `[HybridStorage] fileIndex approaching capacity: ${size}/${_HybridStorageService?.MAX_FILE_INDEX_ENTRIES} entries.`
            );
          }
        }
        try {
          await getPdimClient().set(
            "hybrid:storage:index",
            JSON.stringify({
              files: Object.fromEntries(this.fileIndex),
              contentHashes: Object.fromEntries(this.contentHashIndex),
              publicHashes: Object.fromEntries(this.publicContentHashes),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            })
          );
        } catch (error) {
          logger.warn(
            { err: error },
            "[HybridStorage] Failed to save index to PDIM:"
          );
        }
      }
      computeContentHash(data) {
        return createHash7("sha256").update(data).digest("hex");
      }
      determineTier(entry) {
        const now = Date?.now();
        const timeSinceAccess = now - entry?.lastAccessed.getTime();
        const isFrequentlyAccessed = entry?.accessCount >= HOT_ACCESS_COUNT_THRESHOLD;
        if (entry?.tier === "hot") {
          if (timeSinceAccess > COLD_TIER_THRESHOLD_MS && !isFrequentlyAccessed) {
            return {
              shouldTierDown: true,
              shouldTierUp: false,
              reason: `File not accessed for ${Math.floor(timeSinceAccess / (24 * 60 * 60 * 1e3))} days`,
              currentTier: "hot",
              recommendedTier: "cold"
            };
          }
        } else if (entry?.tier === "cold") {
          if (isFrequentlyAccessed && timeSinceAccess < COLD_TIER_THRESHOLD_MS / 2) {
            return {
              shouldTierDown: false,
              shouldTierUp: true,
              reason: `File accessed ${entry?.accessCount} times recently`,
              currentTier: "cold",
              recommendedTier: "hot"
            };
          }
        }
        return {
          shouldTierDown: false,
          shouldTierUp: false,
          reason: "File is in appropriate tier",
          currentTier: entry?.tier,
          recommendedTier: entry?.tier
        };
      }
      determineInitialTier(_sizeBytes, _mimeType) {
        return "cold";
      }
      async upload(userId, fileName, data, mimeType, options) {
        await this.initialize();
        const contentHash = this.computeContentHash(data);
        const key = this.generateFileKey(userId, fileName, options?.folder);
        const isPublic = options?.isPublic || false;
        const existingKeys = this.contentHashIndex.get(contentHash);
        if (existingKeys && existingKeys?.length > 0) {
          const existingEntry = this.fileIndex.get(existingKeys[0]);
          if (existingEntry) {
            const newEntry = {
              key,
              originalName: fileName,
              mimeType,
              sizeBytes: data?.length,
              compressedSize: existingEntry?.compressedSize,
              tier: existingEntry?.tier,
              location: existingEntry?.location,
              contentHash,
              accessCount: 0,
              lastAccessed: /* @__PURE__ */ new Date(),
              createdAt: /* @__PURE__ */ new Date(),
              userId,
              isPublic,
              isDeduplicated: true,
              deduplicationRef: existingKeys[0],
              metadata: options?.metadata
            };
            this.fileIndex.set(key, newEntry);
            existingKeys?.push(key);
            if (isPublic) {
              this.publicContentHashes.set(contentHash, existingKeys[0]);
            }
            await this.saveIndex();
            logger.info(
              `[HybridStorage] Deduplicated: ${key} -> ${existingKeys[0]}`
            );
            return {
              key,
              tier: existingEntry?.tier,
              sizeBytes: data?.length,
              compressedSize: existingEntry?.compressedSize,
              contentHash,
              isDeduplicated: true,
              compressionRatio: data?.length / existingEntry?.compressedSize
            };
          }
        }
        if (isPublic) {
          const publicRef = this.publicContentHashes.get(contentHash);
          if (publicRef) {
            const existingEntry = this.fileIndex.get(publicRef);
            if (existingEntry) {
              const newEntry = {
                key,
                originalName: fileName,
                mimeType,
                sizeBytes: data?.length,
                compressedSize: existingEntry?.compressedSize,
                tier: existingEntry?.tier,
                location: existingEntry?.location,
                contentHash,
                accessCount: 0,
                lastAccessed: /* @__PURE__ */ new Date(),
                createdAt: /* @__PURE__ */ new Date(),
                userId,
                isPublic: true,
                isDeduplicated: true,
                deduplicationRef: publicRef,
                metadata: options?.metadata
              };
              this.fileIndex.set(key, newEntry);
              const hashKeys2 = this.contentHashIndex.get(contentHash) || [];
              hashKeys2?.push(key);
              this.contentHashIndex.set(contentHash, hashKeys2);
              await this.saveIndex();
              logger.info(
                `[HybridStorage] Cross-user deduplicated: ${key} -> ${publicRef}`
              );
              return {
                key,
                tier: existingEntry?.tier,
                sizeBytes: data?.length,
                compressedSize: existingEntry?.compressedSize,
                contentHash,
                isDeduplicated: true,
                compressionRatio: data?.length / existingEntry?.compressedSize
              };
            }
          }
        }
        const tier = options?.forceTier || this.determineInitialTier(data?.length, mimeType);
        let compressedSize = data?.length;
        let location;
        const pocketEntry = await this.coldPocket.write(`storage/${key}`, data);
        compressedSize = pocketEntry?.compressedSize;
        location = "pocket-dimension";
        const actualTier = "cold";
        const entry = {
          key,
          originalName: fileName,
          mimeType,
          sizeBytes: data?.length,
          compressedSize,
          tier: actualTier,
          location,
          contentHash,
          accessCount: 0,
          lastAccessed: /* @__PURE__ */ new Date(),
          createdAt: /* @__PURE__ */ new Date(),
          userId,
          isPublic,
          isDeduplicated: false,
          metadata: options?.metadata
        };
        this.fileIndex.set(key, entry);
        const hashKeys = this.contentHashIndex.get(contentHash) || [];
        hashKeys?.push(key);
        this.contentHashIndex.set(contentHash, hashKeys);
        if (isPublic) {
          this.publicContentHashes.set(contentHash, key);
        }
        await this.saveIndex();
        logger.info(
          `[HybridStorage] Uploaded: ${key} (${tier} tier, ${data?.length} bytes)`
        );
        return {
          key,
          tier: entry?.tier,
          sizeBytes: data?.length,
          compressedSize,
          contentHash,
          isDeduplicated: false,
          compressionRatio: data?.length / compressedSize
        };
      }
      async writeToReplit(key, data, contentType) {
        if (!this.replitClient)
          throw new Error("Replit Object Storage client not initialized");
        const result = await this.replitClient.uploadFromBytes(key, data, {
          contentType: contentType || "application/octet-stream"
        });
        if (!result?.ok) {
          throw new Error(
            `Replit storage write failed for key "${key}": ${result?.error}`
          );
        }
      }
      async read(userId, key) {
        await this.initialize();
        const entry = this.fileIndex.get(key);
        if (!entry) {
          throw new Error(`File not found: ${key}`);
        }
        if (entry?.userId !== userId && !entry?.isPublic) {
          throw new Error(`Access denied: ${key}`);
        }
        if (entry?.isDeduplicated && entry?.deduplicationRef) {
          const refEntry = this.fileIndex.get(entry?.deduplicationRef);
          if (refEntry) {
            entry.accessCount++;
            entry.lastAccessed = /* @__PURE__ */ new Date();
            return this.readFromStorage(refEntry);
          }
        }
        entry.accessCount++;
        entry.lastAccessed = /* @__PURE__ */ new Date();
        const data = await this.readFromStorage(entry);
        await this.saveIndex();
        return data;
      }
      async readFromStorage(entry) {
        return this.coldPocket.read(`storage/${entry?.key}`);
      }
      async readFromReplit(key) {
        if (!this.replitClient)
          throw new Error("Replit Object Storage client not initialized");
        const result = await this.replitClient.downloadAsBytes(key);
        if (!result?.ok) {
          throw new Error(
            `Replit storage read failed for key "${key}": ${result?.error}`
          );
        }
        const buf = Array.isArray(result?.value) ? result?.value[0] : result?.value;
        return Buffer?.isBuffer(buf) ? buf : Buffer?.from(buf);
      }
      async delete(userId, key) {
        await this.initialize();
        const entry = this.fileIndex.get(key);
        if (!entry) return false;
        if (entry?.userId !== userId) {
          throw new Error(`Access denied: ${key}`);
        }
        const hashKeys = this.contentHashIndex.get(entry?.contentHash);
        if (hashKeys) {
          const idx = hashKeys?.indexOf(key);
          if (idx > -1) hashKeys?.splice(idx, 1);
          if (hashKeys?.length === 0) {
            this.contentHashIndex.delete(entry?.contentHash);
            this.publicContentHashes.delete(entry?.contentHash);
          }
        }
        if (!entry?.isDeduplicated) {
          const otherRefs = hashKeys && hashKeys?.length > 0;
          if (!otherRefs) {
            await this.coldPocket.delete(`storage/${key}`).catch(() => {
            });
          } else if (hashKeys && hashKeys?.length > 0) {
            const newPrimary = hashKeys[0];
            const newPrimaryEntry = this.fileIndex.get(newPrimary);
            if (newPrimaryEntry) {
              newPrimaryEntry.isDeduplicated = false;
              newPrimaryEntry.deduplicationRef = void 0;
            }
            if (entry?.isPublic) {
              this.publicContentHashes.set(entry?.contentHash, newPrimary);
            }
          }
        }
        this.fileIndex.delete(key);
        await this.saveIndex();
        logger.info(`[HybridStorage] Deleted: ${key}`);
        return true;
      }
      async tierDown(key) {
        await this.initialize();
        const entry = this.fileIndex.get(key);
        if (!entry || entry?.tier === "cold" || entry?.isDeduplicated) return false;
        try {
          entry.tier = "cold";
          entry.location = "pocket-dimension";
          await this.saveIndex();
          logger.info(
            `[HybridStorage] Tier-down confirmed for: ${key} (already in PDIM)`
          );
          return true;
        } catch (error) {
          logger.warn(
            { err: error },
            `[HybridStorage] Failed to tier down ${key}:`
          );
          return false;
        }
      }
      async scheduleTierUp(_key, _data) {
      }
      async runAutoTiering() {
        await this.initialize();
        let tieredDown = 0;
        for (const [key, entry] of this.fileIndex) {
          if (entry?.isDeduplicated) continue;
          const decision = this.determineTier(entry);
          if (decision?.shouldTierDown) {
            if (await this.tierDown(key)) tieredDown++;
          }
        }
        logger.info(
          `[HybridStorage] Auto-tiering (PDIM-only): ${tieredDown} index entries confirmed cold`
        );
        return { tieredDown, tieredUp: 0 };
      }
      async getAnalytics(userId) {
        await this.initialize();
        const analytics = {
          totalFiles: 0,
          totalSizeBytes: 0,
          physicalSizeBytes: 0,
          tierBreakdown: {
            hot: { count: 0, sizeBytes: 0, files: [] },
            cold: {
              count: 0,
              sizeBytes: 0,
              compressedSize: 0,
              compressionRatio: 1,
              files: []
            }
          },
          deduplication: {
            totalDuplicates: 0,
            spaceSaved: 0,
            savingsPercent: 0,
            crossUserDuplicates: 0
          },
          overallCompressionRatio: 1,
          costSavingsPercent: 0,
          recommendations: [],
          accessPatterns: {
            mostAccessed: [],
            leastAccessed: [],
            recentlyAccessed: []
          }
        };
        const entries = [];
        let logicalTotal = 0;
        for (const entry of this.fileIndex.values()) {
          if (userId && entry?.userId !== userId) continue;
          entries?.push(entry);
          analytics.totalFiles++;
          analytics.totalSizeBytes += entry?.sizeBytes;
          logicalTotal += entry?.sizeBytes;
          if (entry?.isDeduplicated) {
            analytics.deduplication.totalDuplicates++;
            analytics.deduplication.spaceSaved += entry?.sizeBytes;
            if (entry?.deduplicationRef) {
              const refEntry = this.fileIndex.get(entry?.deduplicationRef);
              if (refEntry && refEntry?.userId !== entry?.userId) {
                analytics.deduplication.crossUserDuplicates++;
              }
            }
          } else {
            analytics.physicalSizeBytes += entry?.compressedSize;
            if (entry?.tier === "hot") {
              analytics.tierBreakdown.hot.count++;
              analytics.tierBreakdown.hot.sizeBytes += entry?.sizeBytes;
              analytics?.tierBreakdown.hot?.files.push(entry?.key);
            } else {
              analytics.tierBreakdown.cold.count++;
              analytics.tierBreakdown.cold.sizeBytes += entry?.sizeBytes;
              analytics.tierBreakdown.cold.compressedSize += entry?.compressedSize;
              analytics?.tierBreakdown.cold?.files.push(entry?.key);
            }
          }
        }
        if (analytics?.tierBreakdown.cold?.compressedSize > 0) {
          analytics.tierBreakdown.cold.compressionRatio = analytics?.tierBreakdown.cold?.sizeBytes / analytics?.tierBreakdown.cold?.compressedSize;
        }
        if (logicalTotal > 0) {
          analytics.deduplication.savingsPercent = analytics?.deduplication.spaceSaved / logicalTotal * 100;
        }
        if (analytics?.physicalSizeBytes > 0) {
          analytics.overallCompressionRatio = analytics?.totalSizeBytes / analytics?.physicalSizeBytes;
        }
        if (analytics?.totalSizeBytes > 0) {
          analytics.costSavingsPercent = (analytics?.totalSizeBytes - analytics?.physicalSizeBytes) / analytics?.totalSizeBytes * 100;
        }
        analytics.recommendations = this.generateRecommendations(entries);
        const sorted = [...entries].sort((a, b) => b?.accessCount - a?.accessCount);
        analytics.accessPatterns.mostAccessed = sorted?.slice(0, 10);
        analytics.accessPatterns.leastAccessed = sorted?.slice(-10).reverse();
        analytics.accessPatterns.recentlyAccessed = [...entries].sort((a, b) => b?.lastAccessed.getTime() - a?.lastAccessed.getTime()).slice(0, 10);
        return analytics;
      }
      generateRecommendations(entries) {
        const recommendations = [];
        const tierDownCandidates = [];
        const tierUpCandidates = [];
        for (const entry of entries) {
          if (entry?.isDeduplicated) continue;
          const decision = this.determineTier(entry);
          if (decision?.shouldTierDown) {
            tierDownCandidates?.push(entry?.key);
          } else if (decision?.shouldTierUp) {
            tierUpCandidates?.push(entry?.key);
          }
        }
        if (tierDownCandidates?.length > 0) {
          const potentialSavings = tierDownCandidates?.reduce((sum, key) => {
            const entry = this.fileIndex.get(key);
            return sum + entry?.sizeBytes * 0.6;
          }, 0);
          recommendations?.push({
            type: "tier_down",
            priority: tierDownCandidates?.length > 10 ? "high" : "medium",
            message: `${tierDownCandidates?.length} files haven't been accessed in ${COLD_TIER_THRESHOLD_DAYS}+ days. Move to cold storage.`,
            potentialSavings: Math.floor(potentialSavings),
            affectedKeys: tierDownCandidates?.slice(0, 10)
          });
        }
        if (tierUpCandidates?.length > 0) {
          recommendations?.push({
            type: "tier_up",
            priority: "low",
            message: `${tierUpCandidates?.length} cold files are frequently accessed. Consider promoting to hot storage.`,
            affectedKeys: tierUpCandidates?.slice(0, 10)
          });
        }
        const neverAccessed = entries?.filter((e) => e?.accessCount === 0);
        if (neverAccessed?.length > 10) {
          const _totalSize = neverAccessed?.reduce((sum, e) => sum + e?.sizeBytes, 0);
          recommendations?.push({
            type: "cleanup",
            priority: "medium",
            message: `${neverAccessed?.length} files have never been accessed. Consider cleanup.`,
            potentialSavings: _totalSize,
            affectedKeys: neverAccessed?.slice(0, 10).map((e) => e?.key)
          });
        }
        return recommendations;
      }
      listFiles(userId, options) {
        const files = [];
        for (const entry of this.fileIndex.values()) {
          if (entry?.userId !== userId && !(options?.includePublic && entry?.isPublic))
            continue;
          if (options?.tier && entry?.tier !== options?.tier) continue;
          if (options?.location && entry?.location !== options?.location) continue;
          if (options?.folder && !entry?.key.includes(options?.folder)) continue;
          files?.push(entry);
        }
        return files?.sort(
          (a, b) => b?.lastAccessed.getTime() - a?.lastAccessed.getTime()
        );
      }
      getMetadata(key) {
        return this.fileIndex.get(key);
      }
      exists(key) {
        return this.fileIndex.has(key);
      }
      async getDownloadUrl(userId, key) {
        const entry = this.fileIndex.get(key);
        if (!entry) throw new Error(`File not found: ${key}`);
        if (entry?.userId !== userId && !entry?.isPublic) {
          throw new Error(`Access denied: ${key}`);
        }
        return `/api/storage/hybrid/file/${encodeURIComponent(key)}`;
      }
      async getTierBreakdown(userId) {
        await this.initialize();
        const breakdown = {
          hot: { count: 0, sizeBytes: 0, files: [] },
          cold: {
            count: 0,
            sizeBytes: 0,
            compressedSize: 0,
            compressionRatio: 1,
            files: []
          }
        };
        for (const entry of this.fileIndex.values()) {
          if (userId && entry?.userId !== userId) continue;
          if (entry?.isDeduplicated) continue;
          if (entry?.tier === "hot") {
            breakdown.hot.count++;
            breakdown.hot.sizeBytes += entry?.sizeBytes;
            breakdown?.hot.files?.push(entry?.key);
          } else {
            breakdown.cold.count++;
            breakdown.cold.sizeBytes += entry?.sizeBytes;
            breakdown.cold.compressedSize += entry?.compressedSize;
            breakdown?.cold.files?.push(entry?.key);
          }
        }
        if (breakdown?.cold.compressedSize > 0) {
          breakdown.cold.compressionRatio = breakdown?.cold.sizeBytes / breakdown?.cold.compressedSize;
        }
        return breakdown;
      }
      async getDeduplicationStats(userId) {
        await this.initialize();
        const stats = {
          totalDuplicates: 0,
          spaceSaved: 0,
          savingsPercent: 0,
          crossUserDuplicates: 0
        };
        let totalSize = 0;
        for (const entry of this.fileIndex.values()) {
          if (userId && entry?.userId !== userId) continue;
          totalSize += entry?.sizeBytes;
          if (entry?.isDeduplicated) {
            stats.totalDuplicates++;
            stats.spaceSaved += entry?.sizeBytes;
            if (entry?.deduplicationRef) {
              const refEntry = this.fileIndex.get(entry?.deduplicationRef);
              if (refEntry && refEntry?.userId !== entry?.userId) {
                stats.crossUserDuplicates++;
              }
            }
          }
        }
        if (totalSize > 0) {
          stats.savingsPercent = stats?.spaceSaved / (totalSize || 1) * 100;
        }
        return stats;
      }
      async migrateFile(userId, key, targetTier, targetLocation) {
        await this.initialize();
        const entry = this.fileIndex.get(key);
        if (!entry) return false;
        if (entry?.userId !== userId) throw new Error(`Access denied: ${key}`);
        if (entry?.isDeduplicated) return false;
        if (entry?.location === targetLocation && entry?.tier === targetTier)
          return true;
        const resolvedLocation = "pocket-dimension";
        const resolvedTier = "cold";
        if (entry?.location === resolvedLocation && entry?.tier === resolvedTier)
          return true;
        try {
          const data = await this.readFromStorage(entry);
          const pocketEntry = await this.coldPocket.write(`storage/${key}`, data);
          entry.location = "pocket-dimension";
          entry.tier = "cold";
          entry.compressedSize = pocketEntry?.compressedSize;
          await this.saveIndex();
          logger.info(
            `[HybridStorage] Migrated ${key} \u2192 pocket-dimension/cold (PDIM-only)`
          );
          return true;
        } catch (error) {
          logger.warn({ err: error }, `[HybridStorage] Failed to migrate ${key}:`);
          return false;
        }
      }
      async optimizeStorage(userId) {
        await this.initialize();
        const result = await this.runAutoTiering();
        let deduplicated = 0;
        const userFiles = this.listFiles(userId);
        const hashGroups = /* @__PURE__ */ new Map();
        for (const file of userFiles) {
          if (file?.isDeduplicated) continue;
          const group = hashGroups?.get(file?.contentHash) || [];
          group?.push(file);
          hashGroups?.set(file?.contentHash, group);
        }
        for (const [, group] of hashGroups) {
          if (group?.length <= 1) continue;
          const primary = group[0];
          for (let i = 1; i < group?.length; i++) {
            const dup = group[i];
            dup.isDeduplicated = true;
            dup.deduplicationRef = primary?.key;
            deduplicated++;
          }
        }
        if (deduplicated > 0) {
          await this.saveIndex();
        }
        return { ...result, deduplicated };
      }
      async cleanup(userId, options) {
        await this.initialize();
        const thresholdDays = options?.olderThanDays || 90;
        const thresholdMs = thresholdDays * 24 * 60 * 60 * 1e3;
        const now = Date?.now();
        let deletedCount = 0;
        let freedBytes = 0;
        const keysToDelete = [];
        for (const [key, entry] of this.fileIndex) {
          if (entry?.userId !== userId) continue;
          const timeSinceAccess = now - new Date(entry?.lastAccessed).getTime();
          if (timeSinceAccess > thresholdMs && entry?.accessCount === 0) {
            keysToDelete?.push(key);
          }
        }
        for (const key of keysToDelete) {
          const entry = this.fileIndex.get(key);
          if (!entry) continue;
          try {
            await this.delete(userId, key);
            deletedCount++;
            freedBytes += entry?.sizeBytes;
          } catch {
          }
        }
        return { deletedCount, freedBytes };
      }
      generateFileKey(userId, fileName, folder) {
        const timestamp = Date?.now();
        const hash = createHash7("sha256").update(`${userId}:${fileName}:${timestamp}`).digest("hex").substring(0, 8);
        const sanitizedName = fileName?.replace(/[^a-zA-Z0-9?._-]/g, "_");
        const base = folder ? `${userId}/${folder}/${hash}-${sanitizedName}` : `${userId}/${hash}-${sanitizedName}`;
        return base;
      }
    };
    hybridStorageService = HybridStorageService?.getInstance();
  }
});

// scripts/retained-pdim-recovery-worker.ts
import assert from "node:assert/strict";
import { createHash as createHash8 } from "node:crypto";
var digest2 = (parts) => {
  const hash = createHash8("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
};
var { startLocalPdimServer: startLocalPdimServer2, stopLocalPdimServer: stopLocalPdimServer2 } = await Promise.resolve().then(() => (init_localPdimServer(), localPdimServer_exports));
try {
  await startLocalPdimServer2();
  const { hybridStorageService: hybridStorageService2 } = await Promise.resolve().then(() => (init_hybridStorageService(), hybridStorageService_exports));
  const { pocketManager: pocketManager2 } = await Promise.resolve().then(() => (init_pocket_dimension(), pocket_dimension_exports));
  const { getPdimClient: getPdimClient2 } = await Promise.resolve().then(() => (init_pdimClient(), pdimClient_exports));
  await hybridStorageService2.initialize();
  const raw = await getPdimClient2().get("hybrid:storage:index");
  assert.notEqual(raw, null, "hybrid ownership index is absent");
  const index = JSON.parse(raw);
  assert(index && typeof index === "object" && !Array.isArray(index));
  const files = Object.values(index.files ?? {});
  assert(files.length > 0, "hybrid ownership index contains no persisted files");
  const owners = /* @__PURE__ */ new Map();
  const fileEvidence = [];
  for (const file of files.sort((left, right) => String(left.key).localeCompare(String(right.key)))) {
    const key = String(file.key);
    const owner = String(file.userId);
    assert(key.length > 0 && owner.length > 0);
    const bytes = await hybridStorageService2.read(owner, key);
    const contentSha256 = createHash8("sha256").update(bytes).digest("hex");
    assert.equal(contentSha256, file.contentHash);
    assert.equal(bytes.length, file.sizeBytes);
    const metadata = hybridStorageService2.getMetadata(key);
    assert(metadata);
    assert.equal(metadata.userId, owner);
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    fileEvidence.push(`${key}\0${owner}\0${contentSha256}\0${bytes.length}`);
  }
  const ownershipEvidence = [];
  for (const [owner, count] of [...owners].sort(([left], [right]) => left.localeCompare(right))) {
    assert.equal(hybridStorageService2.listFiles(owner).length, count);
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
    fileContentEvidenceSha256: digest2(fileEvidence),
    ownershipCountsSha256: digest2(ownershipEvidence),
    everyFileReadByActualClasses: true
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
