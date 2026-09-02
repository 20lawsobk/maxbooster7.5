// ============================================================================
// REDIS-LIKE STORE ENGINE
// Supports: strings, lists, hashes, sets, TTL, persistence via PocketDimension
// ============================================================================

import { EventEmitter } from "events";
import { createHash } from "crypto";
import { LuaFactory, LuaEngine } from "wasmoon";
import {
  encode as msgpackEncode,
  decode as msgpackDecode,
} from "@msgpack/msgpack";
import { fabricStorage } from "../pocket-dimension/fabric/index.js";
import { luaPool } from "../workers/lua-pool.js";
import type {
  RedisEntry,
  RedisCommandResult,
  RedisStoreSnapshot,
  RedisAofRecord,
  RedisAofLog,
  RedisInfoStats,
  ZSetMember,
} from "./types.js";

const luaFactory = new LuaFactory();

// ── Lua concurrency limiter ──────────────────────────────────────────────────
// Each runLua() call allocates a full WebAssembly Lua engine instance.
// Under a request flood (e.g. after a restart) spawning unlimited concurrent
// instances exhausts the process heap very quickly.
// This semaphore caps simultaneous EVAL executions; excess callers get an
// ERR response immediately rather than piling up in memory.
const LUA_MAX_CONCURRENCY = 8;

// How many records to serialize per event-loop tick during AOF persistence.
const AOF_YIELD_EVERY = 2_000;
// How many members/items to serialize inside a single large entry before
// yielding (ZSet, List, Set, Hash).  Keeps each synchronous slice < ~5 ms.
const ENTRY_INNER_YIELD_EVERY = 50_000;
let _luaActiveCount = 0;

function acquireLuaSlot(): boolean {
  if (_luaActiveCount >= LUA_MAX_CONCURRENCY) return false;
  _luaActiveCount++;
  return true;
}
function releaseLuaSlot(): void {
  if (_luaActiveCount > 0) _luaActiveCount--;
}
export function getLuaConcurrency(): number {
  return _luaActiveCount;
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

// Commands whose effect mutates persisted state. Only these are written to the
// append-only log. Reads, server/info commands, and scripting wrappers
// (EVAL/EVALSHA) are excluded — Lua mutations are captured as their inner
// redis.call() effects, which flow through dispatchSync just like direct writes.
// Stream commands (X*) are intentionally excluded: streams are never persisted
// in snapshots, so replaying them would resurrect data the snapshot drops.
const AOF_MUTATING_COMMANDS = new Set<string>([
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
  "FLUSHALL",
]);

export class RedisStore extends EventEmitter {
  private data: Map<string, RedisEntry> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly instanceId: string;
  private readonly instanceName: string;
  private commandsProcessed = 0;
  private readonly startedAt = Date.now();
  private lastSavedAt: number | null = null;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private persistInFlight: Promise<void> | null = null;
  private readonly persistKey = "__snapshot__";
  // Each instance's durability snapshot is a single fabric object addressed by
  // (ownerId=instanceId, pocket="redis-store", name=persistKey). All Redis
  // persistence flows through the fabric — no direct PocketDimension writes.
  private readonly persistPocket = "redis-store";
  private scriptCache: Map<string, string> = new Map();

  // ── Append-only log (AOF) ────────────────────────────────────────────────────
  // Every mutating command is appended here in memory and flushed to a single
  // fabric object (pocket="redis-store", name=persistAofKey) on a fast 1 s timer.
  // This shrinks the durability window from one snapshot interval (5 s) to ~1 s:
  // writes made after the last snapshot are replayed from the AOF on boot.
  // The log only ever holds records newer than the last snapshot — doPersist()
  // prunes folded records — so it stays small and bounded.
  private readonly persistAofKey = "__aof__";
  private aofLog: RedisAofRecord[] = [];
  private aofSeq = 0;
  private aofBaselineSeq = 0;
  private aofDirty = false;
  private aofTimer: ReturnType<typeof setInterval> | null = null;
  private aofFlushInFlight: Promise<void> | null = null;

  // ── ZSet member index — O(1) member lookup ───────────────────────────────────
  // Maps Redis key → (member string → ZSetMember object).  Kept in sync with
  // `data` so that cmdZAdd no longer needs to scan the entire members array on
  // every insert (which was O(n²) at 114 K entries × 500 inserts/tick).
  private readonly zsetIndex = new Map<string, Map<string, ZSetMember>>();

  // ── LRU eviction ────────────────────────────────────────────────────────────
  // Tracks last-access time (seconds) for each key.  When the key count
  // exceeds MAX_KEYS_BEFORE_EVICT, evictLRU() removes the coldest entries to
  // keep memory bounded regardless of how long the server runs.
  private _accessSec: Map<string, number> = new Map();
  private readonly MAX_KEYS_BEFORE_EVICT: number;
  private readonly EVICT_BATCH_RATIO = 0.1; // evict 10% of keys per cycle

  constructor(instanceId: string, instanceName: string) {
    super();
    this.instanceId = instanceId;
    this.instanceName = instanceName;
    // Allow override via env: MAX_KEYS_PER_STORE=5000000
    this.MAX_KEYS_BEFORE_EVICT = Number(
      process.env["MAX_KEYS_PER_STORE"] ?? 5_000_000,
    );
  }

  // ── LRU helpers ──────────────────────────────────────────────────────────────

  /** Record that a key was accessed right now. */
  private touch(key: string): void {
    this._accessSec.set(key, Math.floor(Date.now() / 1000));
  }

  /** Remove the access record when a key is deleted. */
  private untouch(key: string): void {
    this._accessSec.delete(key);
  }

  /**
   * Evict the N least-recently-used keys.
   * Returns the number of keys actually removed.
   * Called automatically when data.size exceeds MAX_KEYS_BEFORE_EVICT.
   */
  evictLRU(count: number): number {
    if (this.data.size === 0 || count <= 0) return 0;

    // Collect [key, lastAccessSec] pairs, sort ascending (oldest first).
    const candidates: Array<[string, number]> = [];
    for (const [key, entry] of this.data) {
      // ── Protected keys — NEVER evict ─────────────────────────────────────
      // System keys (prefixed with __) hold critical state: auto-push
      // checkpoints, canary values, snapshots.  Evicting them causes data
      // loss and silently resets long-running operations from the beginning.
      if (key.startsWith("__")) continue;
      // ─────────────────────────────────────────────────────────────────────
      // Never evict keys that still have active TTLs set by the caller — they
      // are likely still relevant.  Only evict keys without TTL or whose TTL
      // is very far in the future (treat them as cold data).
      if (entry.type === "string" && entry.expiresAt !== undefined) continue; // skip expiring keys
      const acc = this._accessSec.get(key) ?? 0;
      candidates.push([key, acc]);
    }

    // Sort by access time ascending — coldest first.
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
      this.untouch(key);
      evicted++;
    }

    if (evicted > 0) {
      this.dirty = true;
      // Eviction mutates `data` without an AOF record — if an incremental
      // snapshot serialization is mid-flight, flag it torn so doPersist()
      // falls back to one atomic serialization (see recordAof).
      if (this.snapshotInProgress) this.snapshotTorn = true;
    }
    return evicted;
  }

  /** Trigger auto-eviction if the key count is over the configured threshold. */
  private maybeEvict(): void {
    if (this.data.size <= this.MAX_KEYS_BEFORE_EVICT) return;
    const excess = this.data.size - this.MAX_KEYS_BEFORE_EVICT;
    const batch = Math.max(
      excess,
      Math.floor(this.data.size * this.EVICT_BATCH_RATIO),
    );
    const evicted = this.evictLRU(batch);
    if (evicted > 0) {
      console.warn(
        `[RedisStore:${this.instanceName}] LRU evicted ${evicted} cold keys (store was at ${this.data.size + evicted} keys)`,
      );
    }
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async load(): Promise<void> {
    try {
      const buf = await fabricStorage.getNamedObject(
        this.instanceId,
        this.persistPocket,
        this.persistKey,
      );
      if (!buf) throw new Error("no snapshot");
      const snapshot: RedisStoreSnapshot = JSON.parse(buf.toString("utf-8"));
      const now = Date.now();

      for (const [key, entry] of Object.entries(snapshot.entries)) {
        if (entry.expiresAt && entry.expiresAt <= now) continue;
        // Streams are not persisted — skip any legacy stream entries from
        // old snapshots so they don't bloat memory on startup.
        if (entry.type === "stream") continue;
        if (entry.type === "set") {
          this.data.set(key, { ...entry, value: entry.value });
        } else {
          this.data.set(key, entry);
        }
        // Rebuild the O(1) member index for every loaded sorted set
        if (entry.type === "zset") {
          const zMembers = (entry as { type: "zset"; value: ZSetMember[] })
            .value;
          this.zsetIndex.set(key, new Map(zMembers.map((m) => [m.member, m])));
        }
        if (entry.expiresAt) {
          this.scheduleExpiry(key, entry.expiresAt - now);
        }
      }
      this.lastSavedAt = snapshot.savedAt;
      this.aofBaselineSeq = snapshot.baselineSeq ?? 0;
      this.aofSeq = this.aofBaselineSeq;
    } catch {
      // Fresh store — no prior snapshot
    }

    // Replay the append-only log on top of the snapshot. Only records newer
    // than the snapshot's baseline are applied, so a snapshot plus a not-yet-
    // truncated AOF can never double-apply the same write.
    await this.replayAof();

    // Stagger each store's flush timer by a random 0-5 s offset so that
    // two stores don't both serialize + compress at exactly the same moment,
    // which would otherwise double the libuv thread-pool pressure.
    const jitter = Math.random() * 5_000;
    setTimeout(() => {
      this.flushTimer = setInterval(() => {
        if (this.dirty) void this.persist();
      }, 5_000);
    }, jitter);

    // Flush the AOF more frequently than snapshots so the worst-case data-loss
    // window on an unclean restart is ~1 s rather than a full snapshot interval.
    this.aofTimer = setInterval(() => {
      if (this.aofDirty) void this.flushAof();
    }, 1_000);
  }

  // Load and replay the durable AOF after the snapshot has been applied.
  private async replayAof(): Promise<void> {
    let log: RedisAofLog | null = null;
    try {
      const buf = await fabricStorage.getNamedObject(
        this.instanceId,
        this.persistPocket,
        this.persistAofKey,
      );
      if (buf) log = JSON.parse(buf.toString("utf-8")) as RedisAofLog;
    } catch {
      // No AOF or unreadable — nothing to replay.
      return;
    }
    if (!log?.records?.length) return;

    let replayed = 0;
    for (const rec of log.records) {
      // Skip anything already folded into the loaded snapshot.
      if (rec.s <= this.aofBaselineSeq) continue;
      try {
        this.dispatchSync(rec.c, rec.a);
        replayed++;
      } catch (err) {
        // A single bad record must not abort recovery of the rest.
        console.error(
          `[RedisStore:${this.instanceName}] AOF replay skipped ${rec.c}:`,
          err,
        );
      }
      if (rec.s > this.aofSeq) this.aofSeq = rec.s;
    }

    // Keep the in-memory log so the next flush re-persists exactly what is still
    // ahead of the snapshot baseline; doPersist() prunes it once folded in.
    this.aofLog = log.records.filter((r) => r.s > this.aofBaselineSeq);
    if (replayed > 0) {
      this.dirty = true;
      console.log(
        `[RedisStore:${this.instanceName}] Replayed ${replayed} AOF record(s) past snapshot`,
      );
    }
  }

  // Append a mutating command to the in-memory log. Cheap and never throws —
  // it runs on the hot path for every write. The durable flush happens on the
  // 1 s timer (flushAof).
  private recordAof(c: string, args: string[]): void {
    if (!AOF_MUTATING_COMMANDS.has(c)) return;
    this.aofSeq++;
    this.aofLog.push({ s: this.aofSeq, c, a: args });
    this.aofDirty = true;
    // A write landed while an incremental (yielding) snapshot serialization is
    // mid-flight — the snapshot may now be internally inconsistent (some entries
    // serialized before the write, some after). Flag it so doPersist() discards
    // the incremental result and falls back to one atomic serialization.
    if (this.snapshotInProgress) this.snapshotTorn = true;
  }

  // True while doPersist() is serializing entries across event-loop ticks.
  private snapshotInProgress = false;
  // Set by recordAof() when a mutation lands mid-serialization.
  private snapshotTorn = false;

  // Persist the current AOF tail to the fabric. Coalesces overlapping flushes
  // the same way persist() does.
  private async flushAof(): Promise<void> {
    if (this.aofFlushInFlight) return this.aofFlushInFlight;
    this.aofFlushInFlight = this.doFlushAof().finally(() => {
      this.aofFlushInFlight = null;
    });
    return this.aofFlushInFlight;
  }

  private async doFlushAof(): Promise<void> {
    // Capture the tail synchronously (records are immutable once appended),
    // then serialize incrementally so a long AOF can't stall the event loop.
    const records = this.aofLog.slice();
    this.aofDirty = false;
    const parts: string[] = [];
    for (let i = 0; i < records.length; i++) {
      parts.push(JSON.stringify(records[i]));
      if ((i + 1) % AOF_YIELD_EVERY === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
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
        body,
        { policy },
      );
    } catch (err) {
      // Retry on the next tick with the latest tail.
      this.aofDirty = true;
      console.error(
        `[RedisStore:${this.instanceName}] AOF flush failed — will retry:`,
        err,
      );
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.aofTimer) clearInterval(this.aofTimer);
    for (const t of this.timers.values()) clearTimeout(t);
    if (this.aofDirty) await this.flushAof();
    if (this.dirty) await this.persist();
  }

  async persist(): Promise<void> {
    // Coalesce overlapping flushes: if a snapshot is mid-write (the fabric path
    // can take >5 s for large instances), let it finish — `dirty` stays true so
    // the next tick re-persists the newest state.
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
  private async serializeEntryIncrementally(
    entry: RedisEntry,
  ): Promise<Buffer> {
    const Y = ENTRY_INNER_YIELD_EVERY;
    const tick = () => new Promise<void>((r) => setImmediate(r));
    const expSuffix =
      entry.expiresAt !== undefined ? `,"expiresAt":${entry.expiresAt}}` : "}";

    if (entry.type === "zset" && entry.value.length > Y) {
      const bufs: Buffer[] = [Buffer.from('{"type":"zset","value":[', "utf8")];
      for (let start = 0; start < entry.value.length; start += Y) {
        const end = Math.min(start + Y, entry.value.length);
        const batch: string[] = [];
        for (let i = start; i < end; i++) {
          const m = entry.value[i]!;
          batch.push(
            `{"member":${JSON.stringify(m.member)},"score":${m.score}}`,
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
      const bufs: Buffer[] = [Buffer.from('{"type":"list","value":[', "utf8")];
      for (let start = 0; start < entry.value.length; start += Y) {
        const end = Math.min(start + Y, entry.value.length);
        const batch: string[] = [];
        for (let i = start; i < end; i++)
          batch.push(JSON.stringify(entry.value[i]));
        bufs.push(
          Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8"),
        );
        await tick();
      }
      bufs.push(Buffer.from("]" + expSuffix, "utf8"));
      return Buffer.concat(bufs);
    }

    if (entry.type === "set" && entry.value.length > Y) {
      const bufs: Buffer[] = [Buffer.from('{"type":"set","value":[', "utf8")];
      for (let start = 0; start < entry.value.length; start += Y) {
        const end = Math.min(start + Y, entry.value.length);
        const batch: string[] = [];
        for (let i = start; i < end; i++)
          batch.push(JSON.stringify(entry.value[i]));
        bufs.push(
          Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8"),
        );
        await tick();
      }
      bufs.push(Buffer.from("]" + expSuffix, "utf8"));
      return Buffer.concat(bufs);
    }

    if (entry.type === "hash") {
      const keys = Object.keys(entry.value);
      if (keys.length > Y) {
        const bufs: Buffer[] = [
          Buffer.from('{"type":"hash","value":{', "utf8"),
        ];
        for (let start = 0; start < keys.length; start += Y) {
          const end = Math.min(start + Y, keys.length);
          const batch: string[] = [];
          for (let i = start; i < end; i++) {
            const k = keys[i]!;
            batch.push(
              `${JSON.stringify(k)}:${JSON.stringify(entry.value[k])}`,
            );
          }
          bufs.push(
            Buffer.from((start > 0 ? "," : "") + batch.join(","), "utf8"),
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
  private async buildSnapshotParts(): Promise<{
    parts: Buffer[];
    cutoffSeq: number;
  }> {
    const cutoffSeq = this.aofSeq;
    const parts: Buffer[] = [];
    for (const [key, entry] of this.data) {
      if (entry.type === "stream") continue;
      const keyBuf = Buffer.from(JSON.stringify(key) + ":", "utf8");
      const valBuf = await this.serializeEntryIncrementally(entry);
      parts.push(Buffer.concat([keyBuf, valBuf]));
      // Always yield between keys — stores have only a handful of keys so
      // this overhead is negligible and ensures no monopolisation.
      await new Promise<void>((r) => setImmediate(r));
    }
    return { parts, cutoffSeq };
  }

  private async doPersist(): Promise<void> {
    // Serialize entries INCREMENTALLY with per-entry and per-member yields so
    // that large sorted-sets (e.g. 1.6 M ZSet members ≈ 80 MB of JSON) never
    // block the event loop for more than a few ms at a time.
    //
    // Consistency: a write landing between yields makes the snapshot "torn" —
    // replaying its AOF record on boot could double-apply non-idempotent ops
    // (INCR, APPEND).  We detect this via snapshotTorn and retry the
    // incremental build once with a fresh cutoffSeq.  A second tear during
    // the retry is handled by bumping cutoffSeq past those writes; any
    // double-apply risk for non-idempotent ops is corrected by the next
    // persist cycle (5 s later).
    const savedAt = Date.now();
    this.dirty = false;
    let body: Buffer;
    // Hoisted outside the try block so the post-try AOF-trim code can use them.
    let parts: Buffer[] = [];
    let cutoffSeq: number = this.aofSeq;
    this.snapshotInProgress = true;
    this.snapshotTorn = false;
    try {
      // First pass
      ({ parts, cutoffSeq } = await this.buildSnapshotParts());

      if (this.snapshotTorn) {
        // A write arrived during the first pass.  Retry once with a fresh
        // cutoffSeq — with AutoPush rate-limited to 50 chunks/200 ms the
        // snapshot window is short and a second tear is unlikely.
        this.snapshotTorn = false;
        ({ parts, cutoffSeq } = await this.buildSnapshotParts());
        // If torn again, bump cutoffSeq so the new writes land in the AOF
        // above the baseline and are replayed on next boot.  Any non-idempotent
        // ops will be double-applied at most once; the following persist cycle
        // (5 s) produces a clean snapshot that resets the baseline.
        if (this.snapshotTorn) {
          cutoffSeq = this.aofSeq;
        }
      }

      // Assemble final snapshot body from Buffer parts.  Buffer.concat does a
      // single C-level allocation + memcpy, avoiding any V8 string rope overhead.
      const comma = Buffer.from(",", "utf8");
      const entriesBuf = Buffer.concat(
        parts.flatMap((p, i) => (i > 0 ? [comma, p] : [p])),
      );
      body = Buffer.concat([
        Buffer.from(`{"version":1,"savedAt":${savedAt},"entries":{`, "utf8"),
        entriesBuf,
        Buffer.from(`},"baselineSeq":${cutoffSeq}}`, "utf8"),
      ]);
    } finally {
      this.snapshotInProgress = false;
    }
    try {
      const policy = await fabricStorage.recommendedPolicy();
      await fabricStorage.putNamedObject(
        this.instanceId,
        this.persistPocket,
        this.persistKey,
        "application/json",
        body,
        { policy },
      );
      this.lastSavedAt = savedAt;
      // Snapshot now durably contains everything through cutoffSeq. Drop folded
      // records and re-flush the trimmed tail so the AOF stays small and a
      // future boot won't replay writes the snapshot already holds.
      this.aofBaselineSeq = cutoffSeq;
      const before = this.aofLog.length;
      this.aofLog = this.aofLog.filter((r) => r.s > cutoffSeq);
      if (this.aofLog.length !== before) this.aofDirty = true;
    } catch (err) {
      // Keep dirty=true so the next flush cycle retries automatically.
      this.dirty = true;
      console.error(
        `[RedisStore:${this.instanceName}] Persist failed — will retry:`,
        err,
      );
    }
  }

  // ============================================================================
  // TTL HELPERS
  // ============================================================================

  private scheduleExpiry(key: string, ms: number): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(
      () => {
        this.data.delete(key);
        this.timers.delete(key);
        this.dirty = true;
        this.emit("expired", key);
      },
      Math.max(ms, 1),
    );
    this.timers.set(key, t);
  }

  private clearExpiry(key: string): void {
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
  }

  private isExpired(key: string): boolean {
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
  execSync(cmd: string, args: string[]): RedisCommandResult {
    this.commandsProcessed++;
    const c = cmd.toUpperCase();
    const result = this.dispatchSync(c, args);
    // Capture the mutation only after it succeeds (a throwing dispatch never
    // reaches here). This path also carries Lua redis.call() writes.
    this.recordAof(c, args);
    return result;
  }

  private dispatchSync(c: string, args: string[]): RedisCommandResult {
    switch (c) {
      // Server
      case "PING":
        return this.cmdPing(args);
      case "FLUSHDB":
        return this.cmdFlushDb();
      case "DBSIZE":
        return this.cmdDbSize();
      case "INFO":
        return this.cmdInfo();
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
        return this.cmdIncrBy(args[0]!, 1);
      case "INCRBY":
        return this.cmdIncrBy(args[0]!, Number(args[1]));
      case "DECR":
        return this.cmdIncrBy(args[0]!, -1);
      case "DECRBY":
        return this.cmdIncrBy(args[0]!, -Number(args[1]));
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
        return this.cmdXRead(args) as unknown as RedisCommandResult;
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
        return this.cmdXPending(args) as unknown as RedisCommandResult;
      case "XINFO":
        return this.cmdXInfo(args) as unknown as RedisCommandResult;
      // Misc extras BullMQ uses
      case "OBJECT":
        return this.cmdObject(args);
      case "WAIT":
        return 0;
      default:
        throw new Error(`ERR unknown command '${c}'`);
    }
  }

  async exec(cmd: string, args: string[]): Promise<RedisCommandResult> {
    this.commandsProcessed++;
    const c = cmd.toUpperCase();

    // Record that the first-arg key was accessed (used by LRU eviction).
    // Multi-key commands (MGET, MSET, etc.) only touch the first key here;
    // that is sufficient as a write-recency heuristic.
    if (args[0]) this.touch(args[0]);

    let result: RedisCommandResult;
    switch (c) {
      // Lua scripting (async — must go through exec, not dispatchSync)
      case "EVAL":
        result = await this.cmdEval(args);
        break;
      case "EVALSHA":
        result = await this.cmdEvalSha(args);
        break;
      default:
        result = this.dispatchSync(c, args);
        // Log direct (non-Lua) mutations after a successful dispatch. EVAL/
        // EVALSHA are intentionally not logged here — their writes are captured
        // as inner redis.call() effects via execSync.
        this.recordAof(c, args);
    }

    // After any write that could have added keys, check if we've exceeded the
    // configured key limit and evict LRU keys to stay within bounds.
    // The check is O(1) (size comparison) when no eviction is needed.
    this.maybeEvict();

    return result;
  }

  // ============================================================================
  // SERVER COMMANDS
  // ============================================================================

  private cmdPing(args: string[]): string {
    return args[0] ?? "PONG";
  }

  private cmdFlushDb(): string {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.data.clear();
    this.dirty = true;
    this.invalidateKeyCount();
    return "OK";
  }

  private cmdDbSize(): number {
    let count = 0;
    for (const key of this.data.keys()) {
      if (!this.isExpired(key)) count++;
    }
    return count;
  }

  private cmdInfo(): string {
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
      `last_saved_at:${stats.lastSavedAt ?? "never"}`,
    ].join("\r\n");
  }

  /** Debounce-cached key count — avoids an O(n) scan on every exec call. */
  private _cachedKeyCount: number | null = null;
  private _cachedKeyCountAt = 0;
  private static readonly KEY_COUNT_TTL_MS = 3_000; // recount at most once per 3 s

  /** Invalidate the cached key count whenever the data Map changes size. */
  private invalidateKeyCount(): void {
    this._cachedKeyCount = null;
  }

  getStats(): RedisInfoStats {
    const now = Date.now();
    if (
      this._cachedKeyCount === null ||
      now - this._cachedKeyCountAt > RedisStore.KEY_COUNT_TTL_MS
    ) {
      let count = 0;
      for (const key of this.data.keys()) {
        if (!this.isExpired(key)) count++;
      }
      this._cachedKeyCount = count;
      this._cachedKeyCountAt = now;
    }
    const count = this._cachedKeyCount;
    return {
      instanceId: this.instanceId,
      instanceName: this.instanceName,
      keyCount: count,
      totalCommandsProcessed: this.commandsProcessed,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      createdAt: new Date(this.startedAt).toISOString(),
      lastSavedAt: this.lastSavedAt
        ? new Date(this.lastSavedAt).toISOString()
        : null,
      persistenceEnabled: true,
    };
  }

  // ============================================================================
  // STRING COMMANDS
  // ============================================================================

  private cmdSet(args: string[]): string | null {
    const [key, value, ...opts] = args;
    if (!key || value === undefined)
      throw new Error("ERR wrong number of arguments for 'set'");

    const upper = opts.map((o) => o.toUpperCase());
    let expiresAt: number | undefined;
    let nx = false;
    let xx = false;
    let get = false;
    let keepttl = false;

    for (let i = 0; i < upper.length; i++) {
      const opt = upper[i]!;
      if (opt === "EX") {
        expiresAt = Date.now() + Number(opts[i + 1]!) * 1000;
        i++;
      } else if (opt === "PX") {
        expiresAt = Date.now() + Number(opts[i + 1]!);
        i++;
      } else if (opt === "EXAT") {
        expiresAt = Number(opts[i + 1]!) * 1000;
        i++;
      } else if (opt === "PXAT") {
        expiresAt = Number(opts[i + 1]!);
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

    const prevExpiry = keepttl ? existing?.expiresAt : undefined;
    const finalExpiry = keepttl ? prevExpiry : expiresAt;

    this.clearExpiry(key);
    this.data.set(key, { type: "string", value, expiresAt: finalExpiry });
    if (finalExpiry) this.scheduleExpiry(key, finalExpiry - Date.now());
    this.dirty = true;

    return get ? prevValue : "OK";
  }

  private cmdGet(args: string[]): string | null {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'get'");
    if (this.isExpired(key)) return null;
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.type !== "string")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value;
  }

  private cmdGetSet(args: string[]): string | null {
    const [key, value] = args;
    if (!key || value === undefined)
      throw new Error("ERR wrong number of arguments for 'getset'");
    const prev = this.cmdGet([key]);
    this.cmdSet([key, value]);
    return prev;
  }

  private cmdMGet(args: string[]): Array<string | null> {
    return args.map((k) => {
      try {
        return this.cmdGet([k]);
      } catch {
        return null;
      }
    });
  }

  private cmdMSet(args: string[]): string {
    if (args.length % 2 !== 0)
      throw new Error("ERR wrong number of arguments for 'mset'");
    for (let i = 0; i < args.length; i += 2) {
      this.cmdSet([args[i]!, args[i + 1]!]);
    }
    return "OK";
  }

  private cmdSetNx(args: string[]): number {
    const [key, value] = args;
    if (!key || value === undefined)
      throw new Error("ERR wrong number of arguments for 'setnx'");
    if (!this.isExpired(key) && this.data.has(key)) return 0;
    this.cmdSet([key, value]);
    return 1;
  }

  private cmdSetEx(args: string[]): string {
    const [key, seconds, value] = args;
    if (!key || !seconds || value === undefined)
      throw new Error("ERR wrong number of arguments for 'setex'");
    return this.cmdSet([key, value, "EX", seconds]) ?? "OK";
  }

  private cmdPSetEx(args: string[]): string {
    const [key, ms, value] = args;
    if (!key || !ms || value === undefined)
      throw new Error("ERR wrong number of arguments for 'psetex'");
    return this.cmdSet([key, value, "PX", ms]) ?? "OK";
  }

  private cmdIncrBy(key: string, by: number): number {
    if (!key) throw new Error("ERR wrong number of arguments");
    if (Number.isNaN(by))
      throw new Error("ERR value is not an integer or out of range");
    if (this.isExpired(key) || !this.data.has(key)) {
      this.data.set(key, { type: "string", value: String(by) });
      this.dirty = true;
      return by;
    }
    const entry = this.data.get(key)!;
    if (entry.type !== "string")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const n = Number(entry.value);
    if (Number.isNaN(n) || !Number.isInteger(n))
      throw new Error("ERR value is not an integer or out of range");
    const next = n + by;
    entry.value = String(next);
    this.dirty = true;
    return next;
  }

  private cmdAppend(args: string[]): number {
    const [key, value] = args;
    if (!key || value === undefined)
      throw new Error("ERR wrong number of arguments for 'append'");
    if (this.isExpired(key) || !this.data.has(key)) {
      this.data.set(key, { type: "string", value });
      this.dirty = true;
      return value.length;
    }
    const entry = this.data.get(key)!;
    if (entry.type !== "string")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    entry.value += value;
    this.dirty = true;
    return entry.value.length;
  }

  private cmdStrLen(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'strlen'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "string")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value.length;
  }

  private cmdGetRange(args: string[]): string {
    const [key, start, end] = args;
    if (!key || start === undefined || end === undefined)
      throw new Error("ERR wrong number of arguments for 'getrange'");
    if (this.isExpired(key) || !this.data.has(key)) return "";
    const entry = this.data.get(key)!;
    if (entry.type !== "string")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdDel(args: string[]): number {
    let count = 0;
    for (const key of args) {
      if (!this.isExpired(key) && this.data.has(key)) {
        this.data.delete(key);
        this.clearExpiry(key);
        this.zsetIndex.delete(key); // keep member index clean
        count++;
        this.dirty = true;
      }
    }
    return count;
  }

  private cmdExists(args: string[]): number {
    let count = 0;
    for (const key of args) {
      if (!this.isExpired(key) && this.data.has(key)) count++;
    }
    return count;
  }

  private cmdExpire(args: string[], useAt: boolean): number {
    const [key, seconds] = args;
    if (!key || seconds === undefined)
      throw new Error("ERR wrong number of arguments for 'expire'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const ms = useAt
      ? Number(seconds) * 1000 - Date.now()
      : Number(seconds) * 1000;
    const expiresAt = Date.now() + ms;
    const entry = this.data.get(key)!;
    entry.expiresAt = expiresAt;
    this.scheduleExpiry(key, ms);
    this.dirty = true;
    return 1;
  }

  private cmdPExpire(args: string[]): number {
    const [key, ms] = args;
    if (!key || ms === undefined)
      throw new Error("ERR wrong number of arguments for 'pexpire'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const expiresAt = Date.now() + Number(ms);
    const entry = this.data.get(key)!;
    entry.expiresAt = expiresAt;
    this.scheduleExpiry(key, Number(ms));
    this.dirty = true;
    return 1;
  }

  private cmdExpireAt(args: string[]): number {
    const [key, unixTs] = args;
    if (!key || unixTs === undefined)
      throw new Error("ERR wrong number of arguments for 'expireat'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const expiresAt = Number(unixTs) * 1000;
    const ms = expiresAt - Date.now();
    const entry = this.data.get(key)!;
    entry.expiresAt = expiresAt;
    this.scheduleExpiry(key, ms);
    this.dirty = true;
    return 1;
  }

  private cmdTtl(args: string[], precise: boolean): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'ttl'");
    if (this.isExpired(key) || !this.data.has(key)) return -2;
    const entry = this.data.get(key)!;
    if (!entry.expiresAt) return -1;
    const remaining = entry.expiresAt - Date.now();
    if (remaining <= 0) return -2;
    return precise ? remaining : Math.ceil(remaining / 1000);
  }

  private cmdPersist(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'persist'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (!entry.expiresAt) return 0;
    delete entry.expiresAt;
    this.clearExpiry(key);
    this.dirty = true;
    return 1;
  }

  private cmdType(args: string[]): string {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'type'");
    if (this.isExpired(key) || !this.data.has(key)) return "none";
    return this.data.get(key)!.type;
  }

  private cmdRename(args: string[]): string {
    const [src, dst] = args;
    if (!src || !dst)
      throw new Error("ERR wrong number of arguments for 'rename'");
    if (this.isExpired(src) || !this.data.has(src))
      throw new Error("ERR no such key");
    const entry = this.data.get(src)!;
    this.data.delete(src);
    this.clearExpiry(src);
    this.data.set(dst, entry);
    if (entry.expiresAt) this.scheduleExpiry(dst, entry.expiresAt - Date.now());
    this.dirty = true;
    return "OK";
  }

  private cmdRenameNx(args: string[]): number {
    const [src, dst] = args;
    if (!src || !dst)
      throw new Error("ERR wrong number of arguments for 'renamenx'");
    if (this.isExpired(src) || !this.data.has(src))
      throw new Error("ERR no such key");
    if (!this.isExpired(dst) && this.data.has(dst)) return 0;
    this.cmdRename(args);
    return 1;
  }

  private cmdKeys(args: string[]): string[] {
    const pattern = args[0] ?? "*";
    const rx = globToRegex(pattern);
    const result: string[] = [];
    for (const key of this.data.keys()) {
      if (!this.isExpired(key) && rx.test(key)) result.push(key);
    }
    return result;
  }

  private cmdScan(args: string[]): [string, string[]] {
    const cursor = Number(args[0] ?? 0);
    let match = "*";
    let count = 10;
    for (let i = 1; i < args.length; i++) {
      const opt = args[i]!.toUpperCase();
      if (opt === "MATCH") {
        match = args[++i]!;
      } else if (opt === "COUNT") {
        count = Number(args[++i]!);
      }
    }
    const rx = globToRegex(match);
    const allKeys = Array.from(this.data.keys()).filter(
      (k) => !this.isExpired(k) && rx.test(k),
    );
    // Guard against NaN: cursor % 0 is NaN; return empty page if keyspace is empty
    if (allKeys.length === 0) return ["0", []];
    const start = cursor % allKeys.length;
    const page = allKeys.slice(start, start + count);
    const nextCursor = start + count >= allKeys.length ? 0 : start + count;
    return [String(nextCursor), page];
  }

  private cmdRandomKey(): string | null {
    const keys = Array.from(this.data.keys()).filter((k) => !this.isExpired(k));
    if (keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)]!;
  }

  private cmdCopy(args: string[]): number {
    const [src, dst] = args;
    if (!src || !dst)
      throw new Error("ERR wrong number of arguments for 'copy'");
    if (this.isExpired(src) || !this.data.has(src)) return 0;
    if (!this.isExpired(dst) && this.data.has(dst) && !args.includes("REPLACE"))
      return 0;
    const entry = this.data.get(src)!;
    const copy: RedisEntry = JSON.parse(JSON.stringify(entry));
    this.data.set(dst, copy);
    if (copy.expiresAt) this.scheduleExpiry(dst, copy.expiresAt - Date.now());
    this.dirty = true;
    return 1;
  }

  // ============================================================================
  // LIST COMMANDS
  // ============================================================================

  private getOrCreateList(key: string): string[] {
    const entry = this.data.get(key);
    if (!entry) {
      const list: string[] = [];
      this.data.set(key, { type: "list", value: list });
      return list;
    }
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value;
  }

  private cmdLPush(args: string[], left: boolean): number {
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

  private cmdLPushX(args: string[], left: boolean): number {
    const [key, ...elements] = args;
    if (!key || elements.length === 0)
      throw new Error("ERR wrong number of arguments for 'lpushx'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    return this.cmdLPush(args, left);
  }

  private cmdLPop(args: string[], left: boolean): string | null | string[] {
    const [key, countStr] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'lpop'");
    if (this.isExpired(key) || !this.data.has(key)) return countStr ? [] : null;
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const count = countStr ? Number(countStr) : 1;
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = left ? entry.value.shift() : entry.value.pop();
      if (el === undefined) break;
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

  private cmdLRange(args: string[]): string[] {
    const [key, start, stop] = args;
    if (!key || start === undefined || stop === undefined)
      throw new Error("ERR wrong number of arguments for 'lrange'");
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdLLen(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'llen'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value.length;
  }

  private cmdLIndex(args: string[]): string | null {
    const [key, indexStr] = args;
    if (!key || indexStr === undefined)
      throw new Error("ERR wrong number of arguments for 'lindex'");
    if (this.isExpired(key) || !this.data.has(key)) return null;
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    let i = Number(indexStr);
    if (i < 0) i = entry.value.length + i;
    return entry.value[i] ?? null;
  }

  private cmdLSet(args: string[]): string {
    const [key, indexStr, value] = args;
    if (!key || indexStr === undefined || value === undefined)
      throw new Error("ERR wrong number of arguments for 'lset'");
    if (this.isExpired(key) || !this.data.has(key))
      throw new Error("ERR no such key");
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    let i = Number(indexStr);
    if (i < 0) i = entry.value.length + i;
    if (i < 0 || i >= entry.value.length)
      throw new Error("ERR index out of range");
    entry.value[i] = value;
    this.dirty = true;
    return "OK";
  }

  private cmdLInsert(args: string[]): number {
    const [key, where, pivot, value] = args;
    if (!key || !where || !pivot || value === undefined)
      throw new Error("ERR wrong number of arguments for 'linsert'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const idx = entry.value.indexOf(pivot);
    if (idx === -1) return -1;
    const pos = where.toUpperCase() === "AFTER" ? idx + 1 : idx;
    entry.value.splice(pos, 0, value);
    this.dirty = true;
    return entry.value.length;
  }

  private cmdLTrim(args: string[]): string {
    const [key, start, stop] = args;
    if (!key || start === undefined || stop === undefined)
      throw new Error("ERR wrong number of arguments for 'ltrim'");
    if (this.isExpired(key) || !this.data.has(key)) return "OK";
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdLRem(args: string[]): number {
    const [key, countStr, value] = args;
    if (!key || countStr === undefined || value === undefined)
      throw new Error("ERR wrong number of arguments for 'lrem'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdLPos(args: string[]): number | null {
    const [key, element] = args;
    if (!key || element === undefined)
      throw new Error("ERR wrong number of arguments for 'lpos'");
    if (this.isExpired(key) || !this.data.has(key)) return null;
    const entry = this.data.get(key)!;
    if (entry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const idx = entry.value.indexOf(element);
    return idx === -1 ? null : idx;
  }

  private cmdLMove(args: string[]): string | null {
    const [src, dst, srcDir, dstDir] = args;
    if (!src || !dst || !srcDir || !dstDir)
      throw new Error("ERR wrong number of arguments for 'lmove'");
    if (this.isExpired(src) || !this.data.has(src)) return null;
    const srcEntry = this.data.get(src)!;
    if (srcEntry.type !== "list")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const el =
      srcDir.toUpperCase() === "LEFT"
        ? srcEntry.value.shift()
        : srcEntry.value.pop();
    if (el === undefined) return null;
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

  private getOrCreateHash(key: string): Record<string, string> {
    const entry = this.data.get(key);
    if (!entry) {
      const hash: Record<string, string> = {};
      this.data.set(key, { type: "hash", value: hash });
      return hash;
    }
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value;
  }

  private cmdHSet(args: string[]): number {
    const [key, ...pairs] = args;
    if (!key || pairs.length === 0 || pairs.length % 2 !== 0)
      throw new Error("ERR wrong number of arguments for 'hset'");
    if (this.isExpired(key)) this.data.delete(key);
    const hash = this.getOrCreateHash(key);
    let added = 0;
    for (let i = 0; i < pairs.length; i += 2) {
      if (!(pairs[i]! in hash)) added++;
      hash[pairs[i]!] = pairs[i + 1]!;
    }
    this.dirty = true;
    return added;
  }

  private cmdHMSet(args: string[]): string {
    this.cmdHSet(args);
    return "OK";
  }

  private cmdHGet(args: string[]): string | null {
    const [key, field] = args;
    if (!key || field === undefined)
      throw new Error("ERR wrong number of arguments for 'hget'");
    if (this.isExpired(key) || !this.data.has(key)) return null;
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value[field] ?? null;
  }

  private cmdHMGet(args: string[]): Array<string | null> {
    const [key, ...fields] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'hmget'");
    if (this.isExpired(key) || !this.data.has(key))
      return fields.map(() => null);
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return fields.map((f) => entry.value[f] ?? null);
  }

  private cmdHGetAll(args: string[]): Record<string, string> {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'hgetall'");
    if (this.isExpired(key) || !this.data.has(key)) return {};
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return { ...entry.value };
  }

  private cmdHDel(args: string[]): number {
    const [key, ...fields] = args;
    if (!key || fields.length === 0)
      throw new Error("ERR wrong number of arguments for 'hdel'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdHExists(args: string[]): number {
    const [key, field] = args;
    if (!key || field === undefined)
      throw new Error("ERR wrong number of arguments for 'hexists'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return field in entry.value ? 1 : 0;
  }

  private cmdHKeys(args: string[]): string[] {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'hkeys'");
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return Object.keys(entry.value);
  }

  private cmdHVals(args: string[]): string[] {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'hvals'");
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return Object.values(entry.value);
  }

  private cmdHLen(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'hlen'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return Object.keys(entry.value).length;
  }

  private cmdHIncrBy(args: string[]): number {
    const [key, field, by] = args;
    if (!key || field === undefined || by === undefined)
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

  private cmdHIncrByFloat(args: string[]): string {
    const [key, field, by] = args;
    if (!key || field === undefined || by === undefined)
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

  private cmdHSetNx(args: string[]): number {
    const [key, field, value] = args;
    if (!key || field === undefined || value === undefined)
      throw new Error("ERR wrong number of arguments for 'hsetnx'");
    if (this.isExpired(key)) this.data.delete(key);
    const hash = this.getOrCreateHash(key);
    if (field in hash) return 0;
    hash[field] = value;
    this.dirty = true;
    return 1;
  }

  private cmdHScan(args: string[]): [string, string[]] {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'hscan'");
    if (this.isExpired(key) || !this.data.has(key)) return ["0", []];
    const entry = this.data.get(key)!;
    if (entry.type !== "hash")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const flat: string[] = [];
    for (const [f, v] of Object.entries(entry.value)) flat.push(f, v);
    return ["0", flat];
  }

  // ============================================================================
  // SET COMMANDS
  // ============================================================================

  private getOrCreateSet(key: string): string[] {
    const entry = this.data.get(key);
    if (!entry) {
      const s: string[] = [];
      this.data.set(key, { type: "set", value: s });
      return s;
    }
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value;
  }

  private cmdSAdd(args: string[]): number {
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

  private cmdSRem(args: string[]): number {
    const [key, ...members] = args;
    if (!key || members.length === 0)
      throw new Error("ERR wrong number of arguments for 'srem'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdSMembers(args: string[]): string[] {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'smembers'");
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return [...entry.value];
  }

  private cmdSCard(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'scard'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value.length;
  }

  private cmdSIsMember(args: string[]): number {
    const [key, member] = args;
    if (!key || member === undefined)
      throw new Error("ERR wrong number of arguments for 'sismember'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value.includes(member) ? 1 : 0;
  }

  private cmdSMIsMember(args: string[]): number[] {
    const [key, ...members] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'smismember'");
    if (this.isExpired(key) || !this.data.has(key)) return members.map(() => 0);
    const entry = this.data.get(key)!;
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return members.map((m) => (entry.value.includes(m) ? 1 : 0));
  }

  private resolveSet(key: string): string[] {
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return [...entry.value];
  }

  private cmdSUnion(args: string[]): string[] {
    const result = new Set<string>();
    for (const key of args) for (const m of this.resolveSet(key)) result.add(m);
    return [...result];
  }

  private cmdSInter(args: string[]): string[] {
    if (args.length === 0) return [];
    let result = new Set(this.resolveSet(args[0]!));
    for (let i = 1; i < args.length; i++) {
      const s = new Set(this.resolveSet(args[i]!));
      for (const m of result) if (!s.has(m)) result.delete(m);
    }
    return [...result];
  }

  private cmdSDiff(args: string[]): string[] {
    if (args.length === 0) return [];
    const result = new Set(this.resolveSet(args[0]!));
    for (let i = 1; i < args.length; i++) {
      const s = new Set(this.resolveSet(args[i]!));
      for (const m of s) result.delete(m);
    }
    return [...result];
  }

  private cmdSUnionStore(args: string[]): number {
    const [dst, ...keys] = args;
    if (!dst)
      throw new Error("ERR wrong number of arguments for 'sunionstore'");
    const members = this.cmdSUnion(keys);
    this.data.set(dst, { type: "set", value: members });
    this.dirty = true;
    return members.length;
  }

  private cmdSInterStore(args: string[]): number {
    const [dst, ...keys] = args;
    if (!dst)
      throw new Error("ERR wrong number of arguments for 'sinterstore'");
    const members = this.cmdSInter(keys);
    this.data.set(dst, { type: "set", value: members });
    this.dirty = true;
    return members.length;
  }

  private cmdSDiffStore(args: string[]): number {
    const [dst, ...keys] = args;
    if (!dst) throw new Error("ERR wrong number of arguments for 'sdiffstore'");
    const members = this.cmdSDiff(keys);
    this.data.set(dst, { type: "set", value: members });
    this.dirty = true;
    return members.length;
  }

  private cmdSRandMember(args: string[]): string | null | string[] {
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
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy.slice(0, Math.min(count, copy.length));
    }
    const result: string[] = [];
    const abs = Math.abs(count);
    for (let i = 0; i < abs; i++)
      result.push(members[Math.floor(Math.random() * members.length)]!);
    return result;
  }

  private cmdSMove(args: string[]): number {
    const [src, dst, member] = args;
    if (!src || !dst || member === undefined)
      throw new Error("ERR wrong number of arguments for 'smove'");
    if (this.isExpired(src) || !this.data.has(src)) return 0;
    const srcEntry = this.data.get(src)!;
    if (srcEntry.type !== "set")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private resolveZSet(key: string): ZSetMember[] {
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "zset")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value;
  }

  private getOrCreateZSet(key: string): ZSetMember[] {
    if (this.isExpired(key) || !this.data.has(key)) {
      const members: ZSetMember[] = [];
      this.data.set(key, { type: "zset", value: members });
      this.zsetIndex.set(key, new Map()); // fresh empty index for new ZSet
      return members;
    }
    const entry = this.data.get(key)!;
    if (entry.type !== "zset")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value;
  }

  private zsetSort(members: ZSetMember[]): void {
    members.sort((a, b) =>
      a.score !== b.score
        ? a.score - b.score
        : a.member < b.member
          ? -1
          : a.member > b.member
            ? 1
            : 0,
    );
  }

  /**
   * Return (or lazily build) the per-key member-index for a sorted set.
   * The index maps member-string → ZSetMember object for O(1) lookups,
   * replacing the previous O(n) Array.find() in every ZSet mutating command.
   */
  private getZSetIndex(key: string): Map<string, ZSetMember> {
    let idx = this.zsetIndex.get(key);
    if (!idx) {
      idx = new Map<string, ZSetMember>();
      const entry = this.data.get(key);
      if (entry?.type === "zset") {
        for (const m of entry.value) idx.set(m.member, m);
      }
      this.zsetIndex.set(key, idx);
    }
    return idx;
  }

  private parseScoreBound(s: string): { value: number; exclusive: boolean } {
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

  private cmdZAdd(args: string[]): number {
    const [key, ...rest] = args;
    if (!key || rest.length < 2)
      throw new Error("ERR wrong number of arguments for 'zadd'");

    let nx = false,
      xx = false,
      gt = false,
      lt = false,
      ch = false,
      incr = false;
    let i = 0;
    while (i < rest.length) {
      const opt = rest[i]!.toUpperCase();
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

    const pairs: Array<{ score: number; member: string }> = [];
    while (i < rest.length - 1) {
      pairs.push({ score: parseFloat(rest[i]!), member: rest[i + 1]! });
      i += 2;
    }
    if (pairs.length === 0) throw new Error("ERR syntax error");

    const members = this.getOrCreateZSet(key);
    const memberIdx = this.getZSetIndex(key); // O(1) lookup map
    let added = 0,
      changed = 0;
    let needsSort = false;

    for (const { score, member } of pairs) {
      const existing = memberIdx.get(member); // O(1) — was O(n) Array.find
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
        const newMember: ZSetMember = { member, score };
        members.push(newMember);
        memberIdx.set(member, newMember); // keep index in sync
        added++;
        needsSort = true;
      }
    }

    if (needsSort) {
      if (added > 0 && changed === 0) {
        // Fast path: if every newly appended member's score is ≥ the previous
        // maximum AND the new members are themselves in ascending score order,
        // the full array is already sorted — skip the O(N) TimSort call.
        // This is the critical optimisation for monotonically-increasing append
        // patterns (e.g. the auto-push sorted index with 114 K entries).
        const prevLastIdx = members.length - 1 - added;
        const prevMax =
          prevLastIdx >= 0 ? members[prevLastIdx]!.score : -Infinity;
        let needFullSort = false;
        let prevScore = prevMax;
        for (let j = members.length - added; j < members.length; j++) {
          if (members[j]!.score < prevScore) {
            needFullSort = true;
            break;
          }
          prevScore = members[j]!.score;
        }
        if (needFullSort) this.zsetSort(members);
        // else: all new members are already in their correct sorted positions.
      } else {
        // Score updates may have moved members out of position — full sort.
        this.zsetSort(members);
      }
    }
    this.dirty = true;
    return ch ? added + changed : added;
  }

  private cmdZRem(args: string[]): number {
    const [key, ...members] = args;
    if (!key || members.length === 0)
      throw new Error("ERR wrong number of arguments for 'zrem'");
    const zset = this.resolveZSet(key);
    const memberIdx = this.zsetIndex.get(key);
    let removed = 0;
    for (const m of members) {
      const entry = memberIdx?.get(m);
      if (entry !== undefined) {
        // Use reference equality (indexOf) — faster than scanning by string
        const pos = zset.indexOf(entry);
        if (pos !== -1) {
          zset.splice(pos, 1);
          memberIdx!.delete(m);
          removed++;
        }
      } else {
        // Fallback for index miss (e.g. loaded from old snapshot without index)
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

  private cmdZScore(args: string[]): string | null {
    const [key, member] = args;
    if (!key || member === undefined)
      throw new Error("ERR wrong number of arguments for 'zscore'");
    const found = this.getZSetIndex(key).get(member); // O(1)
    return found ? String(found.score) : null;
  }

  private cmdZMScore(args: string[]): Array<string | null> {
    const [key, ...members] = args;
    if (!key || members.length === 0)
      throw new Error("ERR wrong number of arguments for 'zmscore'");
    const idx = this.getZSetIndex(key); // O(1) per member
    return members.map((m) => {
      const f = idx.get(m);
      return f ? String(f.score) : null;
    });
  }

  private cmdZIncrBy(args: string[]): string {
    const [key, incrStr, member] = args;
    if (!key || incrStr === undefined || member === undefined)
      throw new Error("ERR wrong number of arguments for 'zincrby'");
    const members = this.getOrCreateZSet(key);
    const memberIdx = this.getZSetIndex(key);
    const existing = memberIdx.get(member); // O(1)
    const incr = parseFloat(incrStr);
    if (existing) {
      existing.score += incr;
      this.zsetSort(members);
      this.dirty = true;
      return String(existing.score);
    }
    const newMember: ZSetMember = { member, score: incr };
    members.push(newMember);
    memberIdx.set(member, newMember); // keep index in sync
    this.zsetSort(members);
    this.dirty = true;
    return String(incr);
  }

  private cmdZCard(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'zcard'");
    return this.resolveZSet(key).length;
  }

  private cmdZCount(args: string[]): number {
    const [key, minStr, maxStr] = args;
    if (!key || minStr === undefined || maxStr === undefined)
      throw new Error("ERR wrong number of arguments for 'zcount'");
    const zset = this.resolveZSet(key);
    const min = this.parseScoreBound(minStr);
    const max = this.parseScoreBound(maxStr);
    return zset.filter((z) => {
      const aboveMin = min.exclusive
        ? z.score > min.value
        : z.score >= min.value;
      const belowMax = max.exclusive
        ? z.score < max.value
        : z.score <= max.value;
      return aboveMin && belowMax;
    }).length;
  }

  private cmdZLexCount(args: string[]): number {
    const [key, minStr, maxStr] = args;
    if (!key || minStr === undefined || maxStr === undefined)
      throw new Error("ERR wrong number of arguments for 'zlexcount'");
    const zset = this.resolveZSet(key);
    const {
      members,
      inclusive: [minInc, maxInc],
      bounds: [minBound, maxBound],
    } = this.parseLexBounds(minStr, maxStr);
    return zset.filter((z) => {
      const aboveMin =
        minBound === null
          ? true
          : minInc
            ? z.member >= minBound
            : z.member > minBound;
      const belowMax =
        maxBound === null
          ? true
          : maxInc
            ? z.member <= maxBound
            : z.member < maxBound;
      return aboveMin && belowMax;
    }).length;
  }

  private parseLexBounds(
    minStr: string,
    maxStr: string,
  ): {
    members: string[];
    inclusive: [boolean, boolean];
    bounds: [string | null, string | null];
  } {
    const parseOne = (
      s: string,
    ): { bound: string | null; inclusive: boolean } => {
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
      bounds: [minP.bound, maxP.bound],
    };
  }

  private cmdZRange(args: string[]): string[] {
    const [key, startStr, stopStr, ...opts] = args;
    if (!key || startStr === undefined || stopStr === undefined)
      throw new Error("ERR wrong number of arguments for 'zrange'");
    const withScores = opts.some((o) => o.toUpperCase() === "WITHSCORES");
    const rev = opts.some((o) => o.toUpperCase() === "REV");
    const byscore = opts.some((o) => o.toUpperCase() === "BYSCORE");

    let zset = this.resolveZSet(key);
    if (rev) zset = [...zset].reverse();

    let result: ZSetMember[];
    if (byscore) {
      const min = this.parseScoreBound(startStr);
      const max = this.parseScoreBound(stopStr);
      result = zset.filter((z) => {
        const aboveMin = min.exclusive
          ? z.score > min.value
          : z.score >= min.value;
        const belowMax = max.exclusive
          ? z.score < max.value
          : z.score <= max.value;
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
      const out: string[] = [];
      for (const z of result) {
        out.push(z.member, String(z.score));
      }
      return out;
    }
    return result.map((z) => z.member);
  }

  private cmdZRevRange(args: string[]): string[] {
    const [key, startStr, stopStr, ...opts] = args;
    if (!key || startStr === undefined || stopStr === undefined)
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
      const out: string[] = [];
      for (const z of slice) {
        out.push(z.member, String(z.score));
      }
      return out;
    }
    return slice.map((z) => z.member);
  }

  private cmdZRangeByScore(args: string[], rev: boolean): string[] {
    let [key, minStr, maxStr, ...opts] = args;
    if (!key || minStr === undefined || maxStr === undefined)
      throw new Error("ERR wrong number of arguments");
    if (rev) {
      [minStr, maxStr] = [maxStr, minStr];
    }
    const withScores = opts.some((o) => o.toUpperCase() === "WITHSCORES");
    let limitOffset = 0,
      limitCount = -1;
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
      const aboveMin = minB.exclusive
        ? z.score > minB.value
        : z.score >= minB.value;
      const belowMax = maxB.exclusive
        ? z.score < maxB.value
        : z.score <= maxB.value;
      return aboveMin && belowMax;
    });

    if (limitOffset > 0) result = result.slice(limitOffset);
    if (limitCount >= 0) result = result.slice(0, limitCount);

    if (withScores) {
      const out: string[] = [];
      for (const z of result) {
        out.push(z.member, String(z.score));
      }
      return out;
    }
    return result.map((z) => z.member);
  }

  private cmdZRangeByLex(args: string[], rev: boolean): string[] {
    let [key, minStr, maxStr, ...opts] = args;
    if (!key || minStr === undefined || maxStr === undefined)
      throw new Error("ERR wrong number of arguments");
    if (rev) {
      [minStr, maxStr] = [maxStr, minStr];
    }
    let limitOffset = 0,
      limitCount = -1;
    const limitIdx = opts.findIndex((o) => o.toUpperCase() === "LIMIT");
    if (limitIdx !== -1) {
      limitOffset = Number(opts[limitIdx + 1]);
      limitCount = Number(opts[limitIdx + 2]);
    }

    const {
      inclusive: [minInc, maxInc],
      bounds: [minBound, maxBound],
    } = this.parseLexBounds(minStr!, maxStr!);
    let zset = this.resolveZSet(key);
    if (rev) zset = [...zset].reverse();

    let result = zset.filter((z) => {
      const aboveMin =
        minBound === null
          ? true
          : minInc
            ? z.member >= minBound
            : z.member > minBound;
      const belowMax =
        maxBound === null
          ? true
          : maxInc
            ? z.member <= maxBound
            : z.member < maxBound;
      return aboveMin && belowMax;
    });

    if (limitOffset > 0) result = result.slice(limitOffset);
    if (limitCount >= 0) result = result.slice(0, limitCount);
    return result.map((z) => z.member);
  }

  private cmdZRank(args: string[], rev: boolean): number | null {
    const [key, member] = args;
    if (!key || member === undefined)
      throw new Error("ERR wrong number of arguments for 'zrank'");
    let zset = this.resolveZSet(key);
    if (rev) zset = [...zset].reverse();
    const idx = zset.findIndex((z) => z.member === member);
    return idx === -1 ? null : idx;
  }

  private cmdZPop(args: string[], max: boolean): string[] {
    const [key, countStr] = args;
    if (!key)
      throw new Error("ERR wrong number of arguments for 'zpopmin/zpopmax'");
    const count = countStr !== undefined ? Number(countStr) : 1;
    const members = this.resolveZSet(key);
    if (members.length === 0) return [];
    const popped = max ? members.splice(-count) : members.splice(0, count);
    if (max) popped.reverse();
    // Keep member index in sync
    const memberIdx = this.zsetIndex.get(key);
    if (memberIdx) {
      for (const z of popped) memberIdx.delete(z.member);
    }
    if (members.length === 0) {
      this.data.delete(key);
      this.clearExpiry(key);
      this.zsetIndex.delete(key);
    } else this.dirty = true;
    const out: string[] = [];
    for (const z of popped) {
      out.push(z.member, String(z.score));
    }
    return out;
  }

  private cmdZRandMember(args: string[]): string | string[] | null {
    const [key, countStr] = args;
    if (!key)
      throw new Error("ERR wrong number of arguments for 'zrandmember'");
    const zset = this.resolveZSet(key);
    if (!countStr) {
      if (zset.length === 0) return null;
      return zset[Math.floor(Math.random() * zset.length)]!.member;
    }
    const count = Number(countStr);
    const abs = Math.abs(count);
    if (count >= 0) {
      const shuffled = [...zset].sort(() => Math.random() - 0.5);
      return shuffled
        .slice(0, Math.min(abs, shuffled.length))
        .map((z) => z.member);
    }
    const result: string[] = [];
    for (let i = 0; i < abs; i++)
      result.push(zset[Math.floor(Math.random() * zset.length)]!.member);
    return result;
  }

  /** Helper: persist a new ZSet result to a destination key, updating both data and zsetIndex. */
  private setZSetResult(dst: string, members: ZSetMember[]): void {
    this.data.set(dst, { type: "zset", value: members });
    this.zsetIndex.set(dst, new Map(members.map((m) => [m.member, m])));
    this.dirty = true;
  }

  private cmdZDiffStore(args: string[]): number {
    const [dst, ...keys] = args;
    if (!dst || keys.length === 0)
      throw new Error("ERR wrong number of arguments for 'zdiffstore'");
    const [firstKey, ...restKeys] = keys;
    const base = new Map(
      this.resolveZSet(firstKey!).map((z) => [z.member, z.score]),
    );
    for (const k of restKeys) {
      for (const z of this.resolveZSet(k)) base.delete(z.member);
    }
    const members: ZSetMember[] = Array.from(base.entries()).map(
      ([member, score]) => ({ member, score }),
    );
    this.zsetSort(members);
    this.setZSetResult(dst, members);
    return members.length;
  }

  private cmdZUnionStore(args: string[]): number {
    const [dst, numkeysStr, ...rest] = args;
    if (!dst || numkeysStr === undefined)
      throw new Error("ERR wrong number of arguments for 'zunionstore'");
    const numkeys = Number(numkeysStr);
    const keys = rest.slice(0, numkeys);
    const weightStrs = rest.slice(numkeys);
    const weights: number[] = [];
    let wi = weightStrs.findIndex((s) => s.toUpperCase() === "WEIGHTS");
    if (wi !== -1) {
      for (let j = wi + 1; j < wi + 1 + numkeys; j++)
        weights.push(Number(weightStrs[j]));
    } else {
      for (let j = 0; j < numkeys; j++) weights.push(1);
    }

    const acc = new Map<string, number>();
    for (let k = 0; k < keys.length; k++) {
      for (const z of this.resolveZSet(keys[k]!)) {
        const w = weights[k] ?? 1;
        acc.set(z.member, (acc.get(z.member) ?? 0) + z.score * w);
      }
    }
    const members: ZSetMember[] = Array.from(acc.entries()).map(
      ([member, score]) => ({ member, score }),
    );
    this.zsetSort(members);
    this.setZSetResult(dst, members);
    return members.length;
  }

  private cmdZInterStore(args: string[]): number {
    const [dst, numkeysStr, ...rest] = args;
    if (!dst || numkeysStr === undefined)
      throw new Error("ERR wrong number of arguments for 'zinterstore'");
    const numkeys = Number(numkeysStr);
    const keys = rest.slice(0, numkeys);
    const weightStrs = rest.slice(numkeys);
    const weights: number[] = [];
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
      this.resolveZSet(keys[0]!).map((z) => [
        z.member,
        z.score * (weights[0] ?? 1),
      ]),
    );
    for (let k = 1; k < keys.length; k++) {
      const other = new Map(
        this.resolveZSet(keys[k]!).map((z) => [z.member, z.score]),
      );
      for (const [m] of firstSet) {
        if (!other.has(m)) firstSet.delete(m);
        else
          firstSet.set(m, firstSet.get(m)! + other.get(m)! * (weights[k] ?? 1));
      }
    }
    const members: ZSetMember[] = Array.from(firstSet.entries()).map(
      ([member, score]) => ({ member, score }),
    );
    this.zsetSort(members);
    this.setZSetResult(dst, members);
    return members.length;
  }

  // ============================================================================
  // LUA SCRIPTING (EVAL / EVALSHA / SCRIPT)
  // ============================================================================

  private sha1(script: string): string {
    return createHash("sha1").update(script).digest("hex");
  }

  private luaToRedis(val: unknown): RedisCommandResult {
    if (val === null || val === undefined) return null;
    if (typeof val === "boolean") return val ? 1 : null;
    if (typeof val === "number") return Math.trunc(val);
    if (typeof val === "string") return val;
    if (Array.isArray(val))
      return val.map((v) => this.luaToRedis(v)) as string[];
    if (typeof val === "object") {
      const obj = val as Record<string, unknown>;
      if (obj["err"] !== undefined) throw new Error(String(obj["err"]));
      if (obj["ok"] !== undefined) return String(obj["ok"]);
      const entries = Object.values(obj);
      return entries.map((v) => this.luaToRedis(v)) as string[];
    }
    return String(val);
  }

  // Recursively convert Lua table (plain JS object from wasmoon) → native JS value.
  // Lua arrays are 1-indexed integer-keyed tables; we detect and convert them.
  private luaTableToJs(val: unknown): unknown {
    if (val === null || val === undefined) return null;
    if (typeof val !== "object") return val;
    if (val instanceof Uint8Array || Buffer.isBuffer(val)) return val;
    const obj = val as Record<string | number, unknown>;
    const keys = Object.keys(obj).filter((k) => k !== "__name");
    if (keys.length === 0) return {};
    // wasmoon proxies Lua tables as 0-indexed in JS (key "0" = Lua index 1).
    // Detect either 0-based or 1-based all-integer keys and convert to JS array.
    const numericKeys = keys
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0);
    if (numericKeys.length === keys.length && numericKeys.length > 0) {
      const minIdx = Math.min(...numericKeys);
      const maxIdx = Math.max(...numericKeys);
      // Must be a contiguous sequence starting at 0 or 1
      if (maxIdx - minIdx + 1 === numericKeys.length) {
        const arr: unknown[] = [];
        for (let i = minIdx; i <= maxIdx; i++)
          arr.push(this.luaTableToJs(obj[i]));
        return arr;
      }
    }
    const result: Record<string, unknown> = {};
    for (const k of keys) result[k] = this.luaTableToJs(obj[k]);
    return result;
  }

  // Encode binary bytes as a hex string — ASCII-safe, survives the Lua VM unharmed.
  private bytesToLuaStr(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex");
  }

  // Decode a hex string (produced by bytesToLuaStr) back to binary bytes.
  private luaStrToBytes(str: unknown): Buffer {
    if (str instanceof Uint8Array) return Buffer.from(str);
    if (Buffer.isBuffer(str)) return str;
    const s = String(str);
    // Hex-encoded path (all hex chars, even length) — our encoding
    if (s.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(s))
      return Buffer.from(s, "hex");
    // Fallback for raw binary passed directly (unlikely but safe)
    return Buffer.from(s, "binary");
  }

  // Emit a Lua literal for a decoded JS value (numbers, strings, bools, arrays, maps).
  // Called only for msgpack-decoded data, so no arbitrary binary byte values.
  private luaQuoteStr(s: string): string {
    // Always use double-quoted strings — safe for use as table keys too.
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\0/g, "\\0")}"`;
  }

  private valToLuaLiteral(val: unknown): string {
    if (val === null || val === undefined) return "nil";
    if (typeof val === "boolean") return val ? "true" : "false";
    if (typeof val === "number") return isFinite(val) ? String(val) : "0";
    if (typeof val === "string") return this.luaQuoteStr(val);
    if (Array.isArray(val)) {
      const elems = val.map((v) => this.valToLuaLiteral(v)).join(", ");
      return `{${elems}}`;
    }
    if (typeof val === "object") {
      const pairs = Object.entries(val as Record<string, unknown>)
        .map(
          ([k, v]) =>
            `[${this.luaQuoteStr(String(k))}] = ${this.valToLuaLiteral(v)}`,
        )
        .join(", ");
      return `{${pairs}}`;
    }
    return "nil";
  }

  // Convert a JS value decoded from MessagePack back to a proper Lua value.
  // Uses doStringSync to build proper Lua tables that respond to # and key access.
  private jsToLuaVal(val: unknown, lua?: LuaEngine): unknown {
    if (val === null || val === undefined) return null;
    if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    )
      return val;
    if (!lua) return val; // fallback without engine
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
  private redisReplyToLua(result: RedisCommandResult, lua: LuaEngine): unknown {
    // ── Nil bulk reply → Lua false ──────────────────────────────────────────
    if (result === null || result === undefined) return false;

    // ── Scalars pass through unchanged ──────────────────────────────────────
    if (typeof result === "string" || typeof result === "number") return result;
    if (typeof result === "boolean") return result ? 1 : 0;

    // ── Plain JS array (LRANGE, SMEMBERS, MGET, KEYS, …) ───────────────────
    if (Array.isArray(result)) {
      // Map any null elements to false (HMGET missing fields)
      const safe = result.map((v) =>
        v === null || v === undefined ? false : v,
      );
      return this.buildLuaSequence(safe, lua);
    }

    // ── Plain JS object — only HGETALL returns this; Redis flattens it to
    //    a [field, value, field, value, …] multi-bulk reply (Lua 1-indexed seq)
    if (typeof result === "object") {
      const flat: string[] = [];
      for (const [k, v] of Object.entries(result as Record<string, string>)) {
        flat.push(k, v ?? "");
      }
      return this.buildLuaSequence(flat, lua);
    }

    return result;
  }

  // Build a proper 1-indexed Lua sequence table from a flat JS array.
  // Uses doStringSync with a generated literal so # and t[i] work natively.
  private buildLuaSequence(arr: unknown[], lua: LuaEngine): unknown {
    if (arr.length === 0) return lua.doStringSync("return {}");
    const elems = arr
      .map((v) => {
        if (v === null || v === undefined || v === false) return "false";
        if (typeof v === "number") return String(v);
        if (typeof v === "string") return this.luaQuoteStr(v);
        return "false";
      })
      .join(", ");
    return lua.doStringSync(`return {${elems}}`);
  }

  private async runLua(
    script: string,
    keys: string[],
    argv: string[],
  ): Promise<RedisCommandResult> {
    // Scripts that do NOT use redis.call() / redis.pcall() can run inside a
    // worker thread (non-blocking for the main event loop).  Scripts that DO
    // need redis.call() must run on the main thread where the store is
    // accessible.
    const usesRedisCall = /redis\s*\.\s*[pc]?call\s*\(/.test(script);
    if (!usesRedisCall && luaPool.isReady) {
      try {
        const result = await luaPool.run(script, keys, argv);
        return result as RedisCommandResult;
      } catch (err) {
        // If the pool fails, fall through to the main-thread runner
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("redis.call() is not supported")) {
          // Real script error — propagate immediately
          throw err;
        }
        // else: pool signaled it can't handle this script → fall through
      }
    }

    // ── Main-thread Lua execution (supports redis.call) ─────────────────────
    // Each createEngine() allocates a full WebAssembly instance.  Cap concurrency
    // so a request flood can't exhaust the heap before V8 can GC old engines.
    if (!acquireLuaSlot()) {
      throw new Error(
        "ERR Lua engine pool exhausted — too many concurrent EVAL scripts (max 8)",
      );
    }
    const lua = await luaFactory.createEngine({ openStandardLibs: true });
    try {
      // KEYS and ARGV must be proper 1-indexed Lua sequence tables.
      // Embed values directly as Lua string literals to avoid proxy indexing ambiguity.
      const keysLit = keys.map((k) => this.luaQuoteStr(k)).join(", ");
      const argvLit = argv.map((a) => this.luaQuoteStr(a)).join(", ");
      lua.doStringSync(`KEYS = {${keysLit}}; ARGV = {${argvLit}}`);

      // Helper shared by redis.call and redis.pcall
      const toStrArgs = (args: unknown[]): string[] =>
        args.map((a) => {
          if (a === null || a === undefined) return "";
          if (a instanceof Uint8Array || Buffer.isBuffer(a))
            return Buffer.from(a).toString("binary");
          return String(a);
        });

      lua.global.set("redis", {
        // redis.call() — raises a Lua error on Redis error replies
        call: (cmd: string, ...args: unknown[]) => {
          const result = this.execSync(cmd, toStrArgs(args));
          return this.redisReplyToLua(result, lua);
        },
        // redis.pcall() — returns { err = "..." } on Redis error replies
        pcall: (cmd: string, ...args: unknown[]) => {
          try {
            const result = this.execSync(cmd, toStrArgs(args));
            return this.redisReplyToLua(result, lua);
          } catch (e) {
            return { err: e instanceof Error ? e.message : String(e) };
          }
        },
        error_reply: (msg: string) => ({ err: msg }),
        status_reply: (msg: string) => ({ ok: msg }),
        LOG_DEBUG: 0,
        LOG_VERBOSE: 1,
        LOG_NOTICE: 2,
        LOG_WARNING: 3,
        log: (_level: number, _msg: string) => {},
      });

      lua.global.set("cjson", {
        encode: (v: unknown) => JSON.stringify(this.luaTableToJs(v)),
        decode: (s: string) => this.jsToLuaVal(JSON.parse(s), lua),
      });

      // cmsgpack: Redis-compatible MessagePack extension.
      // pack()   serializes a Lua value → MessagePack binary (returned as a Latin-1 Lua string).
      // unpack() deserializes a MessagePack binary Lua string → Lua value.
      lua.global.set("cmsgpack", {
        pack: (v: unknown): string => {
          const jsVal = this.luaTableToJs(v);
          const bytes = msgpackEncode(jsVal);
          return this.bytesToLuaStr(bytes);
        },
        unpack: (s: unknown): unknown => {
          const buf = this.luaStrToBytes(s);
          const decoded = msgpackDecode(buf);
          return this.jsToLuaVal(decoded, lua);
        },
      });

      lua.global.set("struct", {
        pack: (_fmt: string, ...vals: unknown[]): string => {
          // Minimal struct.pack for 'H' (unsigned short, 2 bytes, big-endian)
          // BullMQ uses this only for the 'H' format in a few scripts.
          if (typeof _fmt === "string" && _fmt === ">H") {
            const n = Number(vals[0]) & 0xffff;
            return String.fromCharCode((n >> 8) & 0xff, n & 0xff);
          }
          throw new Error("ERR struct.pack format not supported: " + _fmt);
        },
        unpack: (_fmt: string, s: unknown, _pos?: number): unknown[] => {
          if (typeof _fmt === "string" && _fmt === ">H") {
            const buf = this.luaStrToBytes(s);
            const n = (buf[0]! << 8) | buf[1]!;
            return [n, 3]; // value, next position
          }
          throw new Error("ERR struct.unpack format not supported: " + _fmt);
        },
        size: (_fmt: string): number => {
          if (_fmt === ">H") return 2;
          throw new Error("ERR struct.size format not supported: " + _fmt);
        },
      });

      lua.global.set("tonumber", (v: unknown, base?: number) => {
        if (v === null || v === undefined) return null;
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

  private async cmdEval(args: string[]): Promise<RedisCommandResult> {
    const [script, numkeysStr, ...rest] = args;
    if (script === undefined || numkeysStr === undefined)
      throw new Error("ERR wrong number of arguments for 'eval'");
    const numkeys = Number(numkeysStr);
    if (isNaN(numkeys) || numkeys < 0)
      throw new Error("ERR value is not an integer or out of range");
    const keys = rest.slice(0, numkeys);
    const argv = rest.slice(numkeys);
    return this.runLua(script, keys, argv);
  }

  private async cmdEvalSha(args: string[]): Promise<RedisCommandResult> {
    const [sha, numkeysStr, ...rest] = args;
    if (sha === undefined || numkeysStr === undefined)
      throw new Error("ERR wrong number of arguments for 'evalsha'");
    const script = this.scriptCache.get(sha.toLowerCase());
    if (!script)
      throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    const numkeys = Number(numkeysStr);
    const keys = rest.slice(0, numkeys);
    const argv = rest.slice(numkeys);
    return this.runLua(script, keys, argv);
  }

  private cmdScript(args: string[]): RedisCommandResult {
    const [subcmd, ...rest] = args;
    if (!subcmd) throw new Error("ERR wrong number of arguments for 'script'");
    const sub = subcmd.toUpperCase();

    if (sub === "LOAD") {
      const script = rest[0];
      if (script === undefined)
        throw new Error("ERR wrong number of arguments for 'script|load'");
      const sha = this.sha1(script);
      this.scriptCache.set(sha, script);
      return sha;
    }

    if (sub === "EXISTS") {
      return rest.map((sha) =>
        this.scriptCache.has(sha.toLowerCase()) ? 1 : 0,
      ) as unknown as string[];
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

  private cmdRPopLPush(args: string[]): string | null {
    const [src, dst] = args;
    if (!src || !dst)
      throw new Error("ERR wrong number of arguments for 'rpoplpush'");
    return this.cmdLMove([src, dst, "RIGHT", "LEFT"]);
  }

  // ============================================================================
  // STREAM HELPERS
  // ============================================================================

  private streamSeqMap = new Map<number, number>();

  private generateStreamId(): string {
    const ms = Date.now();
    const seq = (this.streamSeqMap.get(ms) ?? -1) + 1;
    this.streamSeqMap.set(ms, seq);
    if (this.streamSeqMap.size > 10) {
      const oldest = [...this.streamSeqMap.keys()].sort((a, b) => a - b)[0]!;
      this.streamSeqMap.delete(oldest);
    }
    return `${ms}-${seq}`;
  }

  private parseStreamId(id: string): [number, number] {
    const parts = id.split("-");
    return [Number(parts[0] ?? 0), Number(parts[1] ?? 0)];
  }

  private compareStreamIds(a: string, b: string): number {
    const [ams, aseq] = this.parseStreamId(a);
    const [bms, bseq] = this.parseStreamId(b);
    if (ams !== bms) return ams - bms;
    return aseq - bseq;
  }

  private getOrCreateStream(
    key: string,
  ): import("./types.js").RedisStreamEntry {
    const existing = this.data.get(key);
    if (existing) {
      if (existing.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        );
      return existing;
    }
    const entry: import("./types.js").RedisStreamEntry = {
      type: "stream",
      value: [],
      groups: {},
    };
    this.data.set(key, entry);
    return entry;
  }

  private trimStream(
    stream: import("./types.js").RedisStreamEntry,
    maxlen: number,
  ): number {
    const excess = stream.value.length - maxlen;
    if (excess <= 0) return 0;
    stream.value.splice(0, excess);
    return excess;
  }

  private streamIdAfter(
    entries: import("./types.js").StreamItem[],
    afterId: string,
  ): import("./types.js").StreamItem[] {
    if (afterId === "0" || afterId === "0-0") return entries;
    return entries.filter((e) => this.compareStreamIds(e.id, afterId) > 0);
  }

  private formatStreamEntries(
    entries: import("./types.js").StreamItem[],
  ): unknown[] {
    return entries.map((e) => [e.id, e.fields]);
  }

  // ============================================================================
  // STREAM COMMANDS
  // ============================================================================

  private cmdXAdd(args: string[]): string | null {
    let i = 0;
    const key = args[i++];
    if (!key) throw new Error("ERR wrong number of arguments for 'xadd'");

    let noMkStream = false;
    let maxlen: number | null = null;

    // Parse optional flags
    while (i < args.length) {
      const tok = args[i]!.toUpperCase();
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

  private cmdXTrim(args: string[]): number {
    const [key, strategy, ...rest] = args;
    if (!key || !strategy)
      throw new Error("ERR wrong number of arguments for 'xtrim'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "stream")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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
        (e) => this.compareStreamIds(e.id, String(threshold)) >= 0,
      );
      const removed = before - entry.value.length;
      if (removed > 0) this.dirty = true;
      return removed;
    }
    throw new Error(`ERR unsupported XTRIM strategy '${strategy}'`);
  }

  private cmdXLen(args: string[]): number {
    const [key] = args;
    if (!key) throw new Error("ERR wrong number of arguments for 'xlen'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "stream")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    return entry.value.length;
  }

  private cmdXRange(args: string[], reverse: boolean): unknown[] {
    const [key, start, end, ...rest] = args;
    if (!key || start === undefined || end === undefined)
      throw new Error(
        `ERR wrong number of arguments for '${reverse ? "xrevrange" : "xrange"}'`,
      );
    if (this.isExpired(key) || !this.data.has(key)) return [];
    const entry = this.data.get(key)!;
    if (entry.type !== "stream")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
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

  private cmdXRead(args: string[]): unknown {
    let i = 0;
    let count = Infinity;

    while (i < args.length) {
      const tok = args[i]!.toUpperCase();
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

    const result: unknown[] = [];
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k]!;
      const afterId = ids[k] ?? "0";
      if (this.isExpired(key) || !this.data.has(key)) continue;
      const entry = this.data.get(key)!;
      if (entry.type !== "stream") continue;
      let entries = this.streamIdAfter(entry.value, afterId);
      if (isFinite(count)) entries = entries.slice(0, count);
      if (entries.length > 0)
        result.push([key, this.formatStreamEntries(entries)]);
    }

    return result.length > 0 ? result : null;
  }

  private cmdXDel(args: string[]): number {
    const [key, ...ids] = args;
    if (!key || ids.length === 0)
      throw new Error("ERR wrong number of arguments for 'xdel'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "stream")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const idSet = new Set(ids);
    const before = entry.value.length;
    entry.value = entry.value.filter((e) => !idSet.has(e.id));
    const removed = before - entry.value.length;
    if (removed > 0) this.dirty = true;
    return removed;
  }

  private cmdXAck(args: string[]): number {
    const [key, group, ...ids] = args;
    if (!key || !group || ids.length === 0)
      throw new Error("ERR wrong number of arguments for 'xack'");
    if (this.isExpired(key) || !this.data.has(key)) return 0;
    const entry = this.data.get(key)!;
    if (entry.type !== "stream")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const grp = entry.groups[group];
    if (!grp) return 0;
    const before = grp.pending.length;
    const idSet = new Set(ids);
    grp.pending = grp.pending.filter((p) => !idSet.has(p.id));
    return before - grp.pending.length;
  }

  private cmdXGroup(args: string[]): RedisCommandResult {
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
            `ERR The XGROUP subcommand requires the key to exist`,
          );
        this.getOrCreateStream(key);
      }
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        );
      entry.groups[group] = {
        lastDeliveredId: id ?? "$",
        pending: [],
        consumers: {},
      };
      this.dirty = true;
      return "OK";
    }

    if (sub === "SETID") {
      const [group, id] = rest;
      if (!group || id === undefined)
        throw new Error("ERR wrong number of arguments for 'xgroup|setid'");
      if (this.isExpired(key) || !this.data.has(key))
        throw new Error("ERR no such key");
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        );
      const grp = entry.groups[group];
      if (!grp)
        throw new Error(
          `ERR -NOGROUP No such consumer group '${group}' for key name '${key}'`,
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
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
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
          "ERR wrong number of arguments for 'xgroup|createconsumer'",
        );
      if (this.isExpired(key) || !this.data.has(key))
        throw new Error("ERR no such key");
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        );
      const grp = entry.groups[group];
      if (!grp)
        throw new Error(
          `ERR -NOGROUP No such consumer group '${group}' for key name '${key}'`,
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
          "ERR wrong number of arguments for 'xgroup|delconsumer'",
        );
      if (this.isExpired(key) || !this.data.has(key)) return 0;
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        );
      const grp = entry.groups[group];
      if (!grp || !grp.consumers[consumer]) return 0;
      const pendingCount = grp.pending.filter(
        (p) => p.consumer === consumer,
      ).length;
      grp.pending = grp.pending.filter((p) => p.consumer !== consumer);
      delete grp.consumers[consumer];
      this.dirty = true;
      return pendingCount;
    }

    throw new Error(`ERR unknown subcommand '${subcmd}' for 'xgroup'`);
  }

  private cmdXClaim(args: string[]): unknown[] {
    return [];
  }

  private cmdXAutoClaim(_args: string[]): unknown[] {
    return ["0-0", [], []];
  }

  private cmdXPending(args: string[]): unknown {
    const [key, group] = args;
    if (!key || !group)
      throw new Error("ERR wrong number of arguments for 'xpending'");
    if (this.isExpired(key) || !this.data.has(key)) return [0, null, null, []];
    const entry = this.data.get(key)!;
    if (entry.type !== "stream")
      throw new Error(
        "WRONGTYPE Operation against a key holding the wrong kind of value",
      );
    const grp = entry.groups[group];
    if (!grp || grp.pending.length === 0) return [0, null, null, []];
    const ids = grp.pending
      .map((p) => p.id)
      .sort((a, b) => this.compareStreamIds(a, b));
    return [grp.pending.length, ids[0], ids[ids.length - 1], []];
  }

  private cmdXInfo(args: string[]): unknown {
    const [subcmd, key, group] = args;
    if (!subcmd || !key)
      throw new Error("ERR wrong number of arguments for 'xinfo'");
    const sub = subcmd.toUpperCase();

    if (sub === "STREAM") {
      const len = this.cmdXLen([key]);
      const entry =
        !this.isExpired(key) && this.data.has(key) ? this.data.get(key)! : null;
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
        stream ? Object.keys(stream.groups).length : 0,
      ];
    }

    if (sub === "GROUPS") {
      if (this.isExpired(key) || !this.data.has(key)) return [];
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
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
        0,
      ]);
    }

    if (sub === "CONSUMERS") {
      if (!group)
        throw new Error("ERR wrong number of arguments for 'xinfo|consumers'");
      if (this.isExpired(key) || !this.data.has(key)) return [];
      const entry = this.data.get(key)!;
      if (entry.type !== "stream")
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
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
        now - c.lastSeenAt,
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

  private cmdObject(args: string[]): RedisCommandResult {
    const [subcmd, key] = args;
    if (!subcmd) throw new Error("ERR wrong number of arguments for 'object'");
    const sub = subcmd.toUpperCase();

    if (sub === "ENCODING") {
      if (!key || this.isExpired(key) || !this.data.has(key))
        throw new Error("ERR no such key");
      const entry = this.data.get(key)!;
      switch (entry.type) {
        case "string": {
          const n = Number(entry.value);
          if (!isNaN(n) && Number.isInteger(n)) return "int";
          return entry.value.length <= 44 ? "embstr" : "raw";
        }
        case "list":
          return entry.value.length <= 128 ? "listpack" : "quicklist";
        case "hash":
          return Object.keys(entry.value).length <= 128
            ? "listpack"
            : "hashtable";
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
        "FREQ <key>",
      ];
    }

    throw new Error(`ERR unknown subcommand '${subcmd}' for 'object'`);
  }
}
