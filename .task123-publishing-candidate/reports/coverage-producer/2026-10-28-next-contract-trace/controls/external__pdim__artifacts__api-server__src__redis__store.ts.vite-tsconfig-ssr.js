__vite_ssr_exportName__("getLuaConcurrency", () => { try { return getLuaConcurrency } catch {} });
__vite_ssr_exportName__("RedisStore", () => { try { return RedisStore } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("events", {"importedNames":["EventEmitter"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("crypto", {"importedNames":["createHash","randomUUID"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("wasmoon", {"importedNames":["LuaFactory"]});
const __vite_ssr_import_3__ = await __vite_ssr_import__("node:module", {"importedNames":["createRequire"]});
const __vite_ssr_import_4__ = await __vite_ssr_import__("node:path", {"importedNames":["default"]});
const __vite_ssr_import_5__ = await __vite_ssr_import__("node:os", {"importedNames":["availableParallelism"]});
const __vite_ssr_import_6__ = await __vite_ssr_import__("../workers/lua-pool.js", {"importedNames":["luaPool"]});
"use strict";







const luaFactory = new __vite_ssr_import_2__.LuaFactory();
let msgpack;
function msgpackCodec() {
  if (msgpack) return msgpack;
  const require = (0,__vite_ssr_import_3__.createRequire)(__vite_ssr_import_meta__.url);
  try {
    msgpack = require("@msgpack/msgpack");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    msgpack = (0,__vite_ssr_import_3__.createRequire)(__vite_ssr_import_4__.default.resolve("external/pdim/artifacts/api-server/package.json"))("@msgpack/msgpack");
  };
  return msgpack;
}
const msgpackEncode = (...args) => msgpackCodec().encode(...args);
const msgpackDecode = (...args) => msgpackCodec().decode(...args);
const LUA_MAX_CONCURRENCY = Math.max(1, Math.min(8, (0,__vite_ssr_import_5__.availableParallelism)()));
const AOF_YIELD_EVERY = 2e3;
const ENTRY_INNER_YIELD_EVERY = 5e4;
let _luaActiveCount = 0;
function acquireLuaSlot() {
  if (_luaActiveCount >= LUA_MAX_CONCURRENCY) return false;
  _luaActiveCount++;
  return true;
}
function releaseLuaSlot() {
  if (_luaActiveCount > 0) _luaActiveCount--;
}
function getLuaConcurrency() {
  return _luaActiveCount;
};
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
    };
    if (end >= tokens.length) return null;
    let index = start + 1;
    const negated = tokens[index] === "^";
    if (negated) index++;
    let matched = false;
    if (tokens[index] === "]") {
      matched = character === "]";
      index++;
    };
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
    };
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
    };
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}
const AOF_MUTATING_COMMANDS = /* @__PURE__ */ new Set([
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
const AOF_STREAM_MUTATING_COMMANDS = /* @__PURE__ */ new Set([
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
const isAofMutation = (command) => AOF_MUTATING_COMMANDS.has(command) || AOF_STREAM_MUTATING_COMMANDS.has(command);
const EventEmitter = __vite_ssr_import_0__.EventEmitter;
class RedisStore extends EventEmitter {
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
    };
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
      };
      this.applyAofRecord(record);
      this.aofLog.push(record);
      this.aofSeq = record.s;
    };
    this.embeddedDurableSeq = this.aofSeq;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.zsetIndex.clear();
    for (const [key, entry] of entries) {
      if (entry.type === "zset") {
        this.zsetIndex.set(key, new Map(entry.value.map((member) => [member.member, member])));
      };
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
    };
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
    };
    candidates.sort((a, b) => a[1] - b[1]);
    let evicted = 0;
    for (const [key] of candidates) {
      if (evicted >= count) break;
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      };
      this.data.delete(key);
      this.zsetIndex.delete(key);
      this.untouch(key);
      this.recordAof("__DELETE", [key]);
      evicted++;
    };
    if (evicted > 0) {
      this.dirty = true;
      if (this.snapshotInProgress) this.snapshotTorn = true;
    };
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
      };
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
      if (!buf || (0,__vite_ssr_import_1__.createHash)("sha256").update(buf).digest("hex") !== manifest.snapshotSha256) {
        throw new Error("Recovery manifest snapshot missing or corrupt");
      };
      const snapshot = this.decodeRecovery(buf);
      if (snapshot.baselineSeq !== manifest.baselineSeq || snapshot.version !== 1 || !Number.isSafeInteger(snapshot.baselineSeq) || !snapshot.entries || typeof snapshot.entries !== "object" || Array.isArray(snapshot.entries)) {
        throw new Error("Invalid recovery generation");
      };
      this.currentSnapshotKey = manifest.snapshotKey;
      this.previousSnapshotKey = manifest.previousSnapshotKey ?? null;
      const now = Date.now();
      for (const [key, entry] of Object.entries(snapshot.entries)) {
        if (!entry || !["string", "list", "hash", "set", "zset", "stream"].includes(entry.type) || entry.expiresAt !== void 0 && !Number.isFinite(entry.expiresAt)) {
          throw new Error("Invalid snapshot entry");
        };
        if (entry.expiresAt && entry.expiresAt <= now) continue;
        if (entry.type === "set") {
          this.data.set(key, { ...entry, value: entry.value });
        } else {
          this.data.set(key, entry);
        };
        if (entry.type === "zset") {
          const zMembers = entry.value;
          this.zsetIndex.set(key, new Map(zMembers.map((m) => [m.member, m])));
        };
        if (entry.expiresAt) {
          this.scheduleExpiry(key, entry.expiresAt - now);
        }
      };
      this.lastSavedAt = snapshot.savedAt;
      this.aofBaselineSeq = snapshot.baselineSeq ?? 0;
      this.aofSeq = this.aofBaselineSeq;
    } catch (cause) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.data.clear();
      this.zsetIndex.clear();
      throw new Error("PDIM snapshot recovery failed; instance unavailable", { cause });
    };
    try {
      await this.replayAof();
    } catch (cause) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.data.clear();
      this.zsetIndex.clear();
      throw new Error("PDIM AOF recovery failed; instance unavailable", { cause });
    };
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
    };
    if (typeof envelope.payload !== "string" || (0,__vite_ssr_import_1__.createHash)("sha256").update(envelope.payload).digest("hex") !== envelope.sha256) {
      throw new Error("Recovery artifact checksum mismatch");
    };
    return JSON.parse(envelope.payload);
  }
  encodeRecovery(buffer) {
    return Buffer.from(JSON.stringify({
      format: "pdim-checksummed-v2",
      payload: buffer.toString("utf8"),
      sha256: (0,__vite_ssr_import_1__.createHash)("sha256").update(buffer).digest("hex")
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
      };
      for (const [key, value] of Object.entries(entries)) {
        const entry = value;
        this.data.set(key, entry);
        const expiresAt = entry.expiresAt;
        if (typeof expiresAt === "number") this.scheduleExpiry(key, expiresAt - Date.now());
      };
      return;
    };
    if (record.c === "__DELETE") {
      const key = record.a[0];
      if (key === void 0) throw new Error("Invalid AOF delete record");
      this.clearExpiry(key);
      this.data.delete(key);
      this.zsetIndex.delete(key);
      this.untouch(key);
      return;
    };
    if (record.c === "__RESTORE_KEY") {
      const key = record.a[0];
      const serialized = record.a[1];
      if (key === void 0 || serialized === void 0) {
        throw new Error("Invalid AOF key-image record");
      };
      this.clearExpiry(key);
      this.zsetIndex.delete(key);
      const entry = JSON.parse(serialized);
      if (entry === null) {
        this.data.delete(key);
        return;
      };
      if (!entry || typeof entry !== "object" || !["string", "hash", "set", "zset", "list", "stream"].includes(entry.type)) {
        throw new Error("Invalid AOF key-image value");
      };
      this.data.set(key, entry);
      const expiresAt = entry.expiresAt;
      if (typeof expiresAt === "number") this.scheduleExpiry(key, expiresAt - Date.now());
      return;
    };
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
    };
    if (log?.version !== 1 || !Array.isArray(log.records)) throw new Error("Invalid AOF format");
    if (!log.records.length) return;
    let replayed = 0;
    for (const rec of log.records) {
      if (!Number.isSafeInteger(rec.s) || typeof rec.c !== "string" || !Array.isArray(rec.a)) {
        throw new Error("Invalid AOF record");
      };
      if (rec.s <= this.aofBaselineSeq) continue;
      if (rec.s !== this.aofSeq + 1) throw new Error("AOF sequence discontinuity");
      this.applyAofRecord(rec);
      replayed++;
      if (rec.s > this.aofSeq) this.aofSeq = rec.s;
    };
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
    };
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
          };
          expected++;
        };
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
      };
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
    };
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
        };
        const chunk = (start > 0 ? "," : "") + batch.join(",");
        bufs.push(Buffer.from(chunk, "utf8"));
        await tick();
      };
      bufs.push(Buffer.from("]" + expSuffix, "utf8"));
      return Buffer.concat(bufs);
    };
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
      };
      bufs.push(Buffer.from("]" + expSuffix, "utf8"));
      return Buffer.concat(bufs);
    };
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
      };
      bufs.push(Buffer.from("]" + expSuffix, "utf8"));
      return Buffer.concat(bufs);
    };
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
          };
          bufs.push(
            Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8")
          );
          await tick();
        };
        bufs.push(Buffer.from("}" + expSuffix, "utf8"));
        return Buffer.concat(bufs);
      }
    };
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
    };
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
      };
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
    };
    try {
      const policy = await fabricStorage.recommendedPolicy();
      const generationKey = `${this.persistKey}:${(0,__vite_ssr_import_1__.randomUUID)()}`;
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
          snapshotSha256: (0,__vite_ssr_import_1__.createHash)("sha256").update(encoded).digest("hex")
        }))),
        { policy }
      );
      const retired = this.previousSnapshotKey;
      this.previousSnapshotKey = this.currentSnapshotKey;
      this.currentSnapshotKey = generationKey;
      if (retired) {
        await fabricStorage.deleteNamedObject(this.instanceId, this.persistPocket, retired).catch((err) => console.error("Retired PDIM generation cleanup pending", err));
      };
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
    };
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
    };
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
    };
    return subscriberCount;
  }
  execSync(cmd, args) {
    this.commandsProcessed++;
    const c = cmd.toUpperCase();
    if (this.embedded && this.embeddedAofSink && this.embeddedCommandDepth === 0 && isAofMutation(c)) {
      throw new Error("Embedded Redis mutations require the asynchronous owner");
    };
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
        };
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
        };
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
      };
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
          };
          return null;
        }),
        seconds * 1e3,
        signal
      );
    };
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
    };
    this.maybeEvict();
    await this.commitEmbeddedAof();
    return result;
  }
  async execMulti(args) {
    if (args.length !== 1) {
      throw new Error("ERR invalid PDIM transaction payload");
    };
    let parsed;
    try {
      parsed = JSON.parse(args[0]);
    } catch {
      throw new Error("ERR invalid PDIM transaction JSON");
    };
    if (!Array.isArray(parsed) || !parsed.every(
      (item) => Array.isArray(item) && item.length >= 1 && typeof item[0] === "string" && item.slice(1).every((value) => typeof value === "string")
    )) {
      throw new Error("ERR invalid PDIM transaction command list");
    };
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
        };
        let value;
        if (command === "EVAL") value = await this.cmdEval(commandArgs);
        else if (command === "EVALSHA") value = await this.cmdEvalSha(commandArgs);
        else value = this.dispatchSync(command, commandArgs);
        if (command !== "EVAL" && command !== "EVALSHA") {
          this.recordAof(command, commandArgs);
          if (isAofMutation(command)) queueMicrotask(() => this.emit("mutation"));
        };
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
    };
    return results;
  }
  waitForResult(read, timeoutMs, signal) {
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason instanceof Error ? signal.reason : new Error("PDIM blocking command aborted")
      );
    };
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
        };
        checking = true;
        void Promise.resolve().then(() => read(() => !settled)).then((value) => {
          checking = false;
          if (settled) return;
          if (value !== null) {
            cleanup();
            resolve(value);
            return;
          };
          if (timedOut) {
            cleanup();
            resolve(null);
            return;
          };
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
      };
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
    };
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
    if (this._cachedKeyCount === null || now - this._cachedKeyCountAt > RedisStore.KEY_COUNT_TTL_MS) {
      let count2 = 0;
      for (const key of this.data.keys()) {
        if (!this.isExpired(key)) count2++;
      };
      this._cachedKeyCount = count2;
      this._cachedKeyCountAt = now;
    };
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
    };
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
    };
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
    };
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
    };
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
    };
    return count;
  }
  cmdExists(args) {
    let count = 0;
    for (const key of args) {
      if (!this.isExpired(key) && this.data.has(key)) count++;
    };
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
    };
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
    };
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
    };
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
    };
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
    };
    if (entry.value.length === 0) {
      this.data.delete(key);
      this.clearExpiry(key);
    };
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
    };
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
    };
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
    };
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
    };
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
    };
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
    };
    if (Object.keys(entry.value).length === 0) {
      this.data.delete(key);
      this.clearExpiry(key);
    };
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
    };
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
    };
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
    };
    if (entry.value.length === 0) {
      this.data.delete(key);
      this.clearExpiry(key);
    };
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
    };
    return [...result];
  }
  cmdSDiff(args) {
    if (args.length === 0) return [];
    const result = new Set(this.resolveSet(args[0]));
    for (let i = 1; i < args.length; i++) {
      const s = new Set(this.resolveSet(args[i]));
      for (const m of s) result.delete(m);
    };
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
      };
      return copy.slice(0, Math.min(count, copy.length));
    };
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
    };
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
    };
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
      };
      this.zsetIndex.set(key, idx);
    };
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
    };
    const pairs = [];
    while (i < rest.length - 1) {
      pairs.push({ score: parseFloat(rest[i]), member: rest[i + 1] });
      i += 2;
    };
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
    };
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
          };
          prevScore = members[j].score;
        };
        if (needFullSort) this.zsetSort(members);
      } else {
        this.zsetSort(members);
      }
    };
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
    };
    if (removed > 0) {
      if (zset.length === 0) {
        this.data.delete(key);
        this.clearExpiry(key);
        this.zsetIndex.delete(key);
      };
      this.dirty = true;
    };
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
    };
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
    };
    if (withScores) {
      const out = [];
      for (const z of result) {
        out.push(z.member, String(z.score));
      };
      return out;
    };
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
      };
      return out;
    };
    return slice.map((z) => z.member);
  }
  cmdZRangeByScore(args, rev) {
    let [key, minStr, maxStr, ...opts] = args;
    if (!key || minStr === void 0 || maxStr === void 0)
      throw new Error("ERR wrong number of arguments");
    if (rev) {
      [minStr, maxStr] = [maxStr, minStr];
    };
    const withScores = opts.some((o) => o.toUpperCase() === "WITHSCORES");
    let limitOffset = 0, limitCount = -1;
    const limitIdx = opts.findIndex((o) => o.toUpperCase() === "LIMIT");
    if (limitIdx !== -1) {
      limitOffset = Number(opts[limitIdx + 1]);
      limitCount = Number(opts[limitIdx + 2]);
    };
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
      };
      return out;
    };
    return result.map((z) => z.member);
  }
  cmdZRangeByLex(args, rev) {
    let [key, minStr, maxStr, ...opts] = args;
    if (!key || minStr === void 0 || maxStr === void 0)
      throw new Error("ERR wrong number of arguments");
    if (rev) {
      [minStr, maxStr] = [maxStr, minStr];
    };
    let limitOffset = 0, limitCount = -1;
    const limitIdx = opts.findIndex((o) => o.toUpperCase() === "LIMIT");
    if (limitIdx !== -1) {
      limitOffset = Number(opts[limitIdx + 1]);
      limitCount = Number(opts[limitIdx + 2]);
    };
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
    };
    if (members.length === 0) {
      this.data.delete(key);
      this.clearExpiry(key);
      this.zsetIndex.delete(key);
    } else this.dirty = true;
    const out = [];
    for (const z of popped) {
      out.push(z.member, String(z.score));
    };
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
    };
    const count = Number(countStr);
    const abs = Math.abs(count);
    if (count >= 0) {
      const shuffled = [...zset].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(abs, shuffled.length)).map((z) => z.member);
    };
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
    };
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
    };
    const acc = /* @__PURE__ */ new Map();
    for (let k = 0; k < keys.length; k++) {
      for (const z of this.resolveZSet(keys[k])) {
        const w = weights[k] ?? 1;
        acc.set(z.member, (acc.get(z.member) ?? 0) + z.score * w);
      }
    };
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
    };
    if (keys.length === 0) {
      this.setZSetResult(dst, []);
      return 0;
    };
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
    };
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
    return (0,__vite_ssr_import_1__.createHash)("sha1").update(script).digest("hex");
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
    };
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
    };
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
    };
    if (typeof val === "object") {
      const pairs = Object.entries(val).map(
        ([k, v]) => `[${this.luaQuoteStr(String(k))}] = ${this.valToLuaLiteral(v)}`
      ).join(", ");
      return `{${pairs}}`;
    };
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
    };
    if (typeof result === "object") {
      const flat = [];
      for (const [k, v] of Object.entries(result)) {
        flat.push(k, v ?? "");
      };
      return this.buildLuaSequence(flat, lua);
    };
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
    if (!usesRedisCall && __vite_ssr_import_6__.luaPool.isReady) {
      try {
        const result = await __vite_ssr_import_6__.luaPool.run(script, keys, argv);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("redis.call() is not supported")) {
          throw err;
        }
      }
    };
    if (!acquireLuaSlot()) {
      throw new Error(
        "ERR Lua engine pool exhausted \u2014 too many concurrent EVAL scripts (max 8)"
      );
    };
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
          };
          throw new Error("ERR struct.pack format not supported: " + _fmt);
        },
        unpack: (_fmt, s, _pos) => {
          if (typeof _fmt === "string" && _fmt === ">H") {
            const buf = this.luaStrToBytes(s);
            const n = buf[0] << 8 | buf[1];
            return [n, 3];
          };
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
    };
    if (sub === "EXISTS") {
      return rest.map(
        (sha) => this.scriptCache.has(sha.toLowerCase()) ? 1 : 0
      );
    };
    if (sub === "FLUSH") {
      this.scriptCache.clear();
      return "OK";
    };
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
    };
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
    };
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
    };
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
    };
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
    };
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
    };
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
    };
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
      };
      if (id === ">") group.lastDeliveredId = messages.at(-1).id;
      this.dirty = true;
      result.push([key, this.formatStreamEntries(messages)]);
    };
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
      };
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
    };
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
    };
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
    };
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
    };
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
    };
    throw new Error(`ERR unknown subcommand '${subcmd}' for 'xgroup'`);
  }
  cmdXClaim(args) {
    const [key, groupName, consumer, minIdleRaw, ...rest] = args;
    if (!key || !groupName || !consumer || minIdleRaw === void 0) {
      throw new Error("ERR wrong number of arguments for 'xclaim'");
    };
    const minIdle = Number(minIdleRaw);
    if (!Number.isSafeInteger(minIdle) || minIdle < 0) {
      throw new Error("ERR invalid min-idle-time");
    };
    const optionNames = /* @__PURE__ */ new Set(["IDLE", "TIME", "RETRYCOUNT", "FORCE", "JUSTID"]);
    const ids = [];
    let optionIndex = 0;
    while (optionIndex < rest.length && !optionNames.has(rest[optionIndex].toUpperCase())) {
      ids.push(rest[optionIndex++]);
    };
    if (ids.length === 0 || ids.some((id) => !/^\d+-\d+$/.test(id))) {
      throw new Error("ERR invalid stream ID");
    };
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
        };
        const value = Number(raw);
        if (!Number.isSafeInteger(value)) {
          throw new Error(`ERR ${option} is out of range`);
        };
        if (option === "IDLE") idleOverride = value;
        else if (option === "TIME") timeOverride = value;
        else retryCount = value;
      } else {
        throw new Error(`ERR unsupported XCLAIM option '${option}'`);
      }
    };
    if (idleOverride !== void 0 && timeOverride !== void 0) {
      throw new Error("ERR IDLE and TIME cannot be used together");
    };
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key);
    if (entry.type !== "stream") {
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value"
      );
    };
    const group = entry.groups[groupName];
    if (!group) {
      throw new Error(
        `NOGROUP No such key '${key}' or consumer group '${groupName}'`
      );
    };
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
      };
      if (!pending) continue;
      if (!message) {
        group.pending.splice(pendingIndex, 1);
        changed = true;
        continue;
      };
      if (now - pending.deliveredAt < minIdle) continue;
      pending.consumer = consumer;
      pending.deliveredAt = timeOverride ?? (idleOverride === void 0 ? now : now - idleOverride);
      pending.count = retryCount ?? (justId ? pending.count : pending.count + 1);
      group.consumers[consumer] = { name: consumer, lastSeenAt: now };
      claimed.push(message);
      changed = true;
    };
    if (changed) this.dirty = true;
    return justId ? claimed.map((message) => message.id) : this.formatStreamEntries(claimed);
  }
  cmdXAutoClaim(args) {
    const [key, groupName, consumer, minIdleRaw, start, ...rest] = args;
    if (!key || !groupName || !consumer || minIdleRaw === void 0 || !start) {
      throw new Error("ERR wrong number of arguments for 'xautoclaim'");
    };
    const minIdle = Number(minIdleRaw);
    if (!Number.isSafeInteger(minIdle) || minIdle < 0) {
      throw new Error("ERR invalid min-idle-time");
    };
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
        };
        count = Number(raw);
        if (!Number.isSafeInteger(count) || count < 1) {
          throw new Error("ERR COUNT requires a positive integer");
        }
      } else {
        throw new Error(`ERR unsupported XAUTOCLAIM option '${option}'`);
      }
    };
    if (this.isExpired(key) || !this.data.has(key)) return ["0-0", [], []];
    const entry = this.data.get(key);
    if (entry.type !== "stream") {
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value"
      );
    };
    const group = entry.groups[groupName];
    if (!group) {
      throw new Error(
        `NOGROUP No such key '${key}' or consumer group '${groupName}'`
      );
    };
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
      };
      if (now - item.deliveredAt < minIdle) continue;
      item.consumer = consumer;
      item.deliveredAt = now;
      if (!justId) item.count++;
      claimed.push(message);
      changed = true;
    };
    if (claimed.length > 0) {
      group.consumers[consumer] = { name: consumer, lastSeenAt: now };
    };
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
    };
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
    };
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
    };
    if (sub === "HELP") {
      return ["STREAM <key>", "GROUPS <key>", "CONSUMERS <key> <groupname>"];
    };
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
    };
    if (sub === "REFCOUNT") {
      if (!key || this.isExpired(key) || !this.data.has(key))
        throw new Error("ERR no such key");
      return 1;
    };
    if (sub === "IDLETIME") {
      if (!key || this.isExpired(key) || !this.data.has(key))
        throw new Error("ERR no such key");
      return 0;
    };
    if (sub === "FREQ") {
      if (!key || this.isExpired(key) || !this.data.has(key))
        throw new Error("ERR no such key");
      return 0;
    };
    if (sub === "HELP") {
      return [
        "ENCODING <key>",
        "REFCOUNT <key>",
        "IDLETIME <key>",
        "FREQ <key>"
      ];
    };
    throw new Error(`ERR unknown subcommand '${subcmd}' for 'object'`);
  }
}
