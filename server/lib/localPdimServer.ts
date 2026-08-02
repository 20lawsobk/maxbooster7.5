/**
 * Local PDIM Exec Server
 *
 * When the remote Pocket Dimension instance (pocketdimensionstorage.replit.app)
 * is unreachable, this module spins up a lightweight in-process HTTP server on
 * localhost:5556 that speaks the same JSON-over-HTTP exec protocol the PDIM
 * client expects.
 *
 * Protocol: POST /api/redis/instances/:id/exec
 *   Body:    { "cmd": "COMMAND", "args": ["arg1", "arg2", ...] }
 *   Reply:   JSON — the Redis command result (string | number | null | array | object)
 *
 * Backed by an in-memory Map (with TTL) and persisted to
 * ./data/local-pdim-store.json every 30 s so data survives server restarts.
 *
 * Supports the full command surface used by this app:
 *   Strings, Hashes, Sets, Sorted Sets, Lists, Streams (BullMQ-compatible),
 *   plus PING, DEL, EXISTS, EXPIRE, KEYS, FLUSHDB, and native EVAL implementations
 *   for the three known Lua scripts (sliding-window rate limiter, distributed lock
 *   release, feature event buffer flush). Unknown scripts throw so callers fall back.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { logger } from "../logger.js";

const LOCAL_PORT = 5556;
const PERSIST_FILE = path.resolve("./data/local-pdim-store.json");
const PERSIST_INTERVAL_MS = 30_000;

// ── Store types ───────────────────────────────────────────────────────────────

type StrEntry = { type: "string"; value: string; expiresAt?: number };
type HashEntry = {
  type: "hash";
  value: Record<string, string>;
  expiresAt?: number;
};
type SetEntry = { type: "set"; value: string[]; expiresAt?: number };
type ZEntry = {
  type: "zset";
  value: { member: string; score: number }[];
  expiresAt?: number;
};
type ListEntry = { type: "list"; value: string[]; expiresAt?: number };
type StreamMsg = { id: string; fields: Record<string, string> };
type StreamEntry = {
  type: "stream";
  value: StreamMsg[];
  expiresAt?: number;
};

type StoreEntry =
  | StrEntry
  | HashEntry
  | SetEntry
  | ZEntry
  | ListEntry
  | StreamEntry;

const store = new Map<string, StoreEntry>();

// ── TTL helpers ───────────────────────────────────────────────────────────────

function expired(e: StoreEntry): boolean {
  return e.expiresAt !== undefined && Date.now() > e.expiresAt;
}

function getEntry<T extends StoreEntry>(
  key: string,
  type: T["type"],
): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (expired(e)) {
    store.delete(key);
    return null;
  }
  if (e.type !== type) return null;
  return e as T;
}

/**
 * Return the live (non-expired) store entry for `key`, or null if absent/expired.
 * Use this for NX/XX existence checks so that expired keys are treated as deleted.
 */
function liveEntry(key: string): StoreEntry | null {
  const e = store.get(key);
  if (!e) return null;
  if (expired(e)) {
    store.delete(key);
    return null;
  }
  return e;
}

function str(key: string): string | null {
  return getEntry<StrEntry>(key, "string")?.value ?? null;
}
function hash(key: string): Record<string, string> | null {
  return getEntry<HashEntry>(key, "hash")?.value ?? null;
}
function set_(key: string): Set<string> | null {
  const e = getEntry<SetEntry>(key, "set");
  return e ? new Set(e.value) : null;
}
function zset(key: string): { member: string; score: number }[] | null {
  return getEntry<ZEntry>(key, "zset")?.value ?? null;
}
function list(key: string): string[] | null {
  return getEntry<ListEntry>(key, "list")?.value ?? null;
}
function stream(key: string): StreamMsg[] | null {
  return getEntry<StreamEntry>(key, "stream")?.value ?? null;
}

function setStr(
  key: string,
  value: string,
  expiresAt?: number,
): void {
  const prev = store.get(key);
  store.set(key, {
    type: "string",
    value,
    expiresAt: expiresAt ?? (prev?.type === "string" ? undefined : undefined),
  });
}

function keepTtl(key: string): number | undefined {
  const e = store.get(key);
  return e && !expired(e) ? e.expiresAt : undefined;
}

// ── Stream ID generator ───────────────────────────────────────────────────────

let _seq = 0;
function streamId(): string {
  return `${Date.now()}-${++_seq}`;
}

// ── Command executor ──────────────────────────────────────────────────────────

function exec(cmd: string, args: string[]): unknown {
  const c = cmd.toUpperCase();

  switch (c) {
    // ── Generic ──
    case "PING":
      return "PONG";
    case "FLUSHDB":
    case "FLUSHALL":
      store.clear();
      return "OK";

    case "DEL": {
      let n = 0;
      for (const k of args) if (store.delete(k)) n++;
      return n;
    }
    case "UNLINK": {
      // same as DEL in single-threaded env
      let n = 0;
      for (const k of args) if (store.delete(k)) n++;
      return n;
    }
    case "EXISTS": {
      let n = 0;
      for (const k of args) {
        const e = store.get(k);
        if (e && !expired(e)) n++;
        else if (e) store.delete(k);
      }
      return n;
    }
    case "TYPE": {
      const e = store.get(args[0]);
      if (!e || expired(e)) return "none";
      return e.type === "zset" ? "zset" : e.type;
    }
    case "EXPIRE": {
      const e = store.get(args[0]);
      if (!e || expired(e)) return 0;
      e.expiresAt = Date.now() + parseInt(args[1]) * 1000;
      return 1;
    }
    case "PEXPIRE": {
      const e = store.get(args[0]);
      if (!e || expired(e)) return 0;
      e.expiresAt = Date.now() + parseInt(args[1]);
      return 1;
    }
    case "PERSIST": {
      const e = store.get(args[0]);
      if (!e || expired(e)) return 0;
      e.expiresAt = undefined;
      return 1;
    }
    case "TTL": {
      const e = store.get(args[0]);
      if (!e || expired(e)) return -2;
      if (e.expiresAt === undefined) return -1;
      return Math.ceil((e.expiresAt - Date.now()) / 1000);
    }
    case "PTTL": {
      const e = store.get(args[0]);
      if (!e || expired(e)) return -2;
      if (e.expiresAt === undefined) return -1;
      return Math.max(0, e.expiresAt - Date.now());
    }
    case "KEYS": {
      const pat = (args[0] || "*")
        .replace(/[-[\]{}()+.,\\^$|#\s]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      const re = new RegExp(`^${pat}$`);
      const out: string[] = [];
      for (const [k, v] of store) {
        if (expired(v)) store.delete(k);
        else if (re.test(k)) out.push(k);
      }
      return out;
    }
    case "SCAN": {
      // Simplified: return all matching keys in one shot (cursor always 0)
      const pat = (() => {
        const mi = args.findIndex((a) => a.toUpperCase() === "MATCH");
        return mi !== -1 ? args[mi + 1] : "*";
      })();
      const regex = new RegExp(
        `^${pat
          .replace(/[-[\]{}()+.,\\^$|#\s]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".")}$`,
      );
      const out: string[] = [];
      for (const [k, v] of store) {
        if (expired(v)) store.delete(k);
        else if (regex.test(k)) out.push(k);
      }
      return ["0", out];
    }

    // ── Strings ──
    case "GET":
      return str(args[0]);
    case "SET": {
      const [key, value, ...rest] = args;
      let expiresAt: number | undefined;
      let nx = false;
      let xx = false;
      for (let i = 0; i < rest.length; i++) {
        const o = rest[i].toUpperCase();
        if (o === "EX")
          expiresAt = Date.now() + parseInt(rest[++i]) * 1000;
        else if (o === "PX")
          expiresAt = Date.now() + parseInt(rest[++i]);
        else if (o === "NX") nx = true;
        else if (o === "XX") xx = true;
      }
      const exists = liveEntry(key) !== null;
      if (nx && exists) return null;
      if (xx && !exists) return null;
      store.set(key, { type: "string", value, expiresAt });
      return "OK";
    }
    case "SETNX": {
      if (liveEntry(args[0])) return 0;
      store.set(args[0], { type: "string", value: args[1] });
      return 1;
    }
    case "SETEX": {
      store.set(args[0], {
        type: "string",
        value: args[2],
        expiresAt: Date.now() + parseInt(args[1]) * 1000,
      });
      return "OK";
    }
    case "PSETEX": {
      store.set(args[0], {
        type: "string",
        value: args[2],
        expiresAt: Date.now() + parseInt(args[1]),
      });
      return "OK";
    }
    case "GETEX": {
      const v = str(args[0]);
      if (v === null) return null;
      const e = store.get(args[0])!;
      const opt = args[1]?.toUpperCase();
      if (opt === "EX") e.expiresAt = Date.now() + parseInt(args[2]) * 1000;
      else if (opt === "PX") e.expiresAt = Date.now() + parseInt(args[2]);
      else if (opt === "EXAT") e.expiresAt = parseInt(args[2]) * 1000;
      else if (opt === "PXAT") e.expiresAt = parseInt(args[2]);
      else if (opt === "PERSIST") e.expiresAt = undefined;
      return v;
    }
    case "GETDEL": {
      const v = str(args[0]);
      if (v !== null) store.delete(args[0]);
      return v;
    }
    case "MGET":
      return args.map((k) => str(k));
    case "MSET": {
      for (let i = 0; i < args.length; i += 2)
        store.set(args[i], { type: "string", value: args[i + 1] });
      return "OK";
    }
    case "MSETNX": {
      for (let i = 0; i < args.length; i += 2)
        if (liveEntry(args[i])) return 0;
      for (let i = 0; i < args.length; i += 2)
        store.set(args[i], { type: "string", value: args[i + 1] });
      return 1;
    }
    case "INCR": {
      const n = parseInt(str(args[0]) ?? "0") + 1;
      setStr(args[0], String(n));
      return n;
    }
    case "INCRBY": {
      const n = parseInt(str(args[0]) ?? "0") + parseInt(args[1]);
      setStr(args[0], String(n));
      return n;
    }
    case "INCRBYFLOAT": {
      const n = parseFloat(str(args[0]) ?? "0") + parseFloat(args[1]);
      setStr(args[0], String(n));
      return String(n);
    }
    case "DECR": {
      const n = parseInt(str(args[0]) ?? "0") - 1;
      setStr(args[0], String(n));
      return n;
    }
    case "DECRBY": {
      const n = parseInt(str(args[0]) ?? "0") - parseInt(args[1]);
      setStr(args[0], String(n));
      return n;
    }
    case "APPEND": {
      const v = (str(args[0]) ?? "") + args[1];
      setStr(args[0], v);
      return v.length;
    }
    case "STRLEN":
      return (str(args[0]) ?? "").length;
    case "GETRANGE":
    case "SUBSTR": {
      const v = str(args[0]) ?? "";
      const start = parseInt(args[1]);
      const end = parseInt(args[2]);
      const s = start < 0 ? Math.max(v.length + start, 0) : start;
      const e = end < 0 ? v.length + end + 1 : Math.min(end + 1, v.length);
      return v.slice(s, e);
    }
    case "SETRANGE": {
      const v = (str(args[0]) ?? "").padEnd(parseInt(args[1]), "\0");
      const pos = parseInt(args[1]);
      const result = v.slice(0, pos) + args[2] + v.slice(pos + args[2].length);
      setStr(args[0], result);
      return result.length;
    }

    // ── Hashes ──
    case "HSET":
    case "HMSET": {
      const key = args[0];
      const h = hash(key) ?? {};
      let added = 0;
      for (let i = 1; i < args.length; i += 2) {
        if (!(args[i] in h)) added++;
        h[args[i]] = args[i + 1];
      }
      store.set(key, {
        type: "hash",
        value: h,
        expiresAt: keepTtl(key),
      });
      return added;
    }
    case "HSETNX": {
      const h = hash(args[0]) ?? {};
      if (args[1] in h) return 0;
      h[args[1]] = args[2];
      store.set(args[0], {
        type: "hash",
        value: h,
        expiresAt: keepTtl(args[0]),
      });
      return 1;
    }
    case "HGET":
      return (hash(args[0]) ?? {})[args[1]] ?? null;
    case "HMGET": {
      const h = hash(args[0]) ?? {};
      return args.slice(1).map((f) => h[f] ?? null);
    }
    case "HDEL": {
      const h = hash(args[0]);
      if (!h) return 0;
      let n = 0;
      for (const f of args.slice(1))
        if (f in h) {
          delete h[f];
          n++;
        }
      return n;
    }
    case "HEXISTS":
      return (hash(args[0]) ?? {})[args[1]] !== undefined ? 1 : 0;
    case "HGETALL":
      return hash(args[0]) ?? {};
    case "HKEYS":
      return Object.keys(hash(args[0]) ?? {});
    case "HVALS":
      return Object.values(hash(args[0]) ?? {});
    case "HLEN":
      return Object.keys(hash(args[0]) ?? {}).length;
    case "HINCRBY": {
      const h = hash(args[0]) ?? {};
      const n = parseInt(h[args[1]] ?? "0") + parseInt(args[2]);
      h[args[1]] = String(n);
      store.set(args[0], {
        type: "hash",
        value: h,
        expiresAt: keepTtl(args[0]),
      });
      return n;
    }
    case "HINCRBYFLOAT": {
      const h = hash(args[0]) ?? {};
      const n = parseFloat(h[args[1]] ?? "0") + parseFloat(args[2]);
      h[args[1]] = String(n);
      store.set(args[0], {
        type: "hash",
        value: h,
        expiresAt: keepTtl(args[0]),
      });
      return String(n);
    }
    case "HRANDFIELD": {
      const keys = Object.keys(hash(args[0]) ?? {});
      if (keys.length === 0) return null;
      return keys[Math.floor(Math.random() * keys.length)];
    }

    // ── Sets ──
    case "SADD": {
      const key = args[0];
      const s = set_(key) ?? new Set<string>();
      let n = 0;
      for (const m of args.slice(1))
        if (!s.has(m)) {
          s.add(m);
          n++;
        }
      store.set(key, {
        type: "set",
        value: [...s],
        expiresAt: keepTtl(key),
      });
      return n;
    }
    case "SREM": {
      const key = args[0];
      const s = set_(key);
      if (!s) return 0;
      let n = 0;
      for (const m of args.slice(1))
        if (s.delete(m)) n++;
      store.set(key, {
        type: "set",
        value: [...s],
        expiresAt: keepTtl(key),
      });
      return n;
    }
    case "SMEMBERS":
      return [...(set_(args[0]) ?? new Set())];
    case "SISMEMBER":
      return (set_(args[0]) ?? new Set()).has(args[1]) ? 1 : 0;
    case "SMISMEMBER": {
      const s = set_(args[0]) ?? new Set<string>();
      return args.slice(1).map((m) => (s.has(m) ? 1 : 0));
    }
    case "SCARD":
      return (set_(args[0]) ?? new Set()).size;
    case "SRANDMEMBER": {
      const s = [...(set_(args[0]) ?? new Set())];
      if (!args[1]) return s[Math.floor(Math.random() * s.length)] ?? null;
      return s.slice(0, parseInt(args[1]));
    }
    case "SPOP": {
      const key = args[0];
      const s = set_(key);
      if (!s || s.size === 0) return null;
      const members = [...s];
      const idx = Math.floor(Math.random() * members.length);
      const popped = members[idx];
      s.delete(popped);
      store.set(key, { type: "set", value: [...s], expiresAt: keepTtl(key) });
      return popped;
    }
    case "SUNION": {
      const r = new Set<string>();
      for (const k of args)
        for (const m of set_(k) ?? new Set<string>()) r.add(m);
      return [...r];
    }
    case "SINTER": {
      if (!args.length) return [];
      let r = set_(args[0]) ?? new Set<string>();
      for (const k of args.slice(1)) {
        const o = set_(k) ?? new Set<string>();
        r = new Set([...r].filter((m) => o.has(m)));
      }
      return [...r];
    }
    case "SDIFF": {
      if (!args.length) return [];
      let r = set_(args[0]) ?? new Set<string>();
      for (const k of args.slice(1)) {
        const o = set_(k) ?? new Set<string>();
        r = new Set([...r].filter((m) => !o.has(m)));
      }
      return [...r];
    }
    case "SUNIONSTORE": {
      const dest = args[0];
      const r = new Set<string>();
      for (const k of args.slice(1))
        for (const m of set_(k) ?? new Set<string>()) r.add(m);
      store.set(dest, { type: "set", value: [...r] });
      return r.size;
    }
    case "SINTERSTORE": {
      const dest = args[0];
      if (args.length < 2) return 0;
      let r = set_(args[1]) ?? new Set<string>();
      for (const k of args.slice(2)) {
        const o = set_(k) ?? new Set<string>();
        r = new Set([...r].filter((m) => o.has(m)));
      }
      store.set(dest, { type: "set", value: [...r] });
      return r.size;
    }
    case "SMOVE": {
      const src = set_(args[0]);
      if (!src || !src.has(args[2])) return 0;
      src.delete(args[2]);
      store.set(args[0], {
        type: "set",
        value: [...src],
        expiresAt: keepTtl(args[0]),
      });
      const dst = set_(args[1]) ?? new Set<string>();
      dst.add(args[2]);
      store.set(args[1], {
        type: "set",
        value: [...dst],
        expiresAt: keepTtl(args[1]),
      });
      return 1;
    }

    // ── Sorted Sets ──
    case "ZADD": {
      const key = args[0];
      let i = 1;
      let nx = false,
        xx = false,
        gt = false,
        lt = false,
        ch = false;
      while (["NX", "XX", "GT", "LT", "CH", "INCR"].includes(
        args[i]?.toUpperCase(),
      )) {
        const f = args[i++].toUpperCase();
        if (f === "NX") nx = true;
        if (f === "XX") xx = true;
        if (f === "GT") gt = true;
        if (f === "LT") lt = true;
        if (f === "CH") ch = true;
      }
      const zs = zset(key) ?? [];
      const mm = new Map(zs.map((e) => [e.member, e.score]));
      let added = 0,
        changed = 0;
      while (i < args.length - 1) {
        const score = parseFloat(args[i++]);
        const member = args[i++];
        const exists = mm.has(member);
        if (nx && exists) continue;
        if (xx && !exists) continue;
        const old = mm.get(member) ?? 0;
        if (gt && score <= old) continue;
        if (lt && score >= old) continue;
        if (!exists) added++;
        else if (old !== score) changed++;
        mm.set(member, score);
      }
      const sorted = [...mm.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([member, score]) => ({ member, score }));
      store.set(key, {
        type: "zset",
        value: sorted,
        expiresAt: keepTtl(key),
      });
      return ch ? added + changed : added;
    }
    case "ZINCRBY": {
      const key = args[0];
      const incr = parseFloat(args[1]);
      const member = args[2];
      const zs = zset(key) ?? [];
      const mm = new Map(zs.map((e) => [e.member, e.score]));
      const nv = (mm.get(member) ?? 0) + incr;
      mm.set(member, nv);
      const sorted = [...mm.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([member, score]) => ({ member, score }));
      store.set(key, {
        type: "zset",
        value: sorted,
        expiresAt: keepTtl(key),
      });
      return String(nv);
    }
    case "ZCARD":
      return (zset(args[0]) ?? []).length;
    case "ZSCORE": {
      const e = (zset(args[0]) ?? []).find((x) => x.member === args[1]);
      return e ? String(e.score) : null;
    }
    case "ZMSCORE": {
      const zs = zset(args[0]) ?? [];
      return args
        .slice(1)
        .map((m) => zs.find((x) => x.member === m)?.score ?? null)
        .map((s) => (s !== null ? String(s) : null));
    }
    case "ZRANK": {
      const zs = zset(args[0]) ?? [];
      const idx = zs.findIndex((x) => x.member === args[1]);
      return idx === -1 ? null : idx;
    }
    case "ZREVRANK": {
      const zs = zset(args[0]) ?? [];
      const idx = zs.findIndex((x) => x.member === args[1]);
      return idx === -1 ? null : zs.length - 1 - idx;
    }
    case "ZRANGE":
    case "ZREVRANGE": {
      const zs = zset(args[0]) ?? [];
      const data = c === "ZREVRANGE" ? [...zs].reverse() : zs;
      const len = data.length;
      const s0 = parseInt(args[1]);
      const s1 = parseInt(args[2]);
      const s = s0 < 0 ? Math.max(len + s0, 0) : Math.min(s0, len);
      const e = s1 < 0 ? len + s1 + 1 : Math.min(s1 + 1, len);
      const slice = data.slice(s, e);
      const ws = args.some((a) => a.toUpperCase() === "WITHSCORES");
      return ws
        ? slice.flatMap((x) => [x.member, String(x.score)])
        : slice.map((x) => x.member);
    }
    case "ZRANGEBYSCORE":
    case "ZREVRANGEBYSCORE": {
      const zs = zset(args[0]) ?? [];
      const rev = c === "ZREVRANGEBYSCORE";
      const [rawMin, rawMax] = rev ? [args[2], args[1]] : [args[1], args[2]];
      const parseB = (s: string, isMin: boolean) => {
        if (s === "-inf") return -Infinity;
        if (s === "+inf") return Infinity;
        const excl = s.startsWith("(");
        const v = parseFloat(excl ? s.slice(1) : s);
        return excl ? (isMin ? v + Number.EPSILON : v - Number.EPSILON) : v;
      };
      const min = parseB(rawMin, true);
      const max = parseB(rawMax, false);
      let filtered = zs.filter((x) => x.score >= min && x.score <= max);
      if (rev) filtered = filtered.reverse();
      const limIdx = args.findIndex((a) => a.toUpperCase() === "LIMIT");
      if (limIdx !== -1) {
        const offset = parseInt(args[limIdx + 1]);
        const count = parseInt(args[limIdx + 2]);
        filtered = filtered.slice(offset, offset + count);
      }
      const ws = args.some((a) => a.toUpperCase() === "WITHSCORES");
      return ws
        ? filtered.flatMap((x) => [x.member, String(x.score)])
        : filtered.map((x) => x.member);
    }
    case "ZCOUNT": {
      const zs = zset(args[0]) ?? [];
      const min =
        args[1] === "-inf" ? -Infinity : parseFloat(args[1].replace("(", ""));
      const max =
        args[2] === "+inf" ? Infinity : parseFloat(args[2].replace("(", ""));
      return zs.filter((x) => x.score >= min && x.score <= max).length;
    }
    case "ZREM": {
      const key = args[0];
      const zs = zset(key) ?? [];
      const rm = new Set(args.slice(1));
      const filtered = zs.filter((x) => !rm.has(x.member));
      store.set(key, {
        type: "zset",
        value: filtered,
        expiresAt: keepTtl(key),
      });
      return zs.length - filtered.length;
    }
    case "ZPOPMIN":
    case "ZPOPMAX": {
      const key = args[0];
      const zs = zset(key) ?? [];
      if (!zs.length) return [];
      const count = parseInt(args[1] ?? "1");
      const rev = c === "ZPOPMAX";
      const data = rev ? [...zs].reverse() : zs;
      const popped = data.splice(0, count);
      store.set(key, {
        type: "zset",
        value: rev ? data.reverse() : data,
        expiresAt: keepTtl(key),
      });
      return popped.flatMap((x) => [x.member, String(x.score)]);
    }
    case "ZREMRANGEBYSCORE": {
      const key = args[0];
      const zs = zset(key) ?? [];
      const min =
        args[1] === "-inf" ? -Infinity : parseFloat(args[1].replace("(", ""));
      const max =
        args[2] === "+inf" ? Infinity : parseFloat(args[2].replace("(", ""));
      const filtered = zs.filter((x) => x.score < min || x.score > max);
      store.set(key, {
        type: "zset",
        value: filtered,
        expiresAt: keepTtl(key),
      });
      return zs.length - filtered.length;
    }
    case "ZREMRANGEBYRANK": {
      const key = args[0];
      const zs = zset(key) ?? [];
      const len = zs.length;
      const s0 = parseInt(args[1]);
      const s1 = parseInt(args[2]);
      const s = s0 < 0 ? Math.max(len + s0, 0) : s0;
      const e = s1 < 0 ? len + s1 + 1 : Math.min(s1 + 1, len);
      const removed = Math.max(0, e - s);
      const filtered = [...zs.slice(0, s), ...zs.slice(e)];
      store.set(key, {
        type: "zset",
        value: filtered,
        expiresAt: keepTtl(key),
      });
      return removed;
    }
    case "ZUNIONSTORE": {
      const dest = args[0];
      const numKeys = parseInt(args[1]);
      const keys = args.slice(2, 2 + numKeys);
      const mm = new Map<string, number>();
      for (const k of keys) {
        for (const { member, score } of zset(k) ?? []) {
          mm.set(member, (mm.get(member) ?? 0) + score);
        }
      }
      const sorted = [...mm.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([member, score]) => ({ member, score }));
      store.set(dest, { type: "zset", value: sorted });
      return sorted.length;
    }
    case "ZRANDMEMBER": {
      const zs = zset(args[0]) ?? [];
      if (!zs.length) return null;
      return zs[Math.floor(Math.random() * zs.length)].member;
    }

    // ── Lists ──
    case "LPUSH": {
      const key = args[0];
      const l = list(key) ?? [];
      for (const v of args.slice(1)) l.unshift(v);
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return l.length;
    }
    case "LPUSHX": {
      const key = args[0];
      const l = list(key);
      if (!l) return 0;
      for (const v of args.slice(1)) l.unshift(v);
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return l.length;
    }
    case "RPUSH": {
      const key = args[0];
      const l = list(key) ?? [];
      for (const v of args.slice(1)) l.push(v);
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return l.length;
    }
    case "RPUSHX": {
      const key = args[0];
      const l = list(key);
      if (!l) return 0;
      for (const v of args.slice(1)) l.push(v);
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return l.length;
    }
    case "LPOP": {
      const key = args[0];
      const l = list(key) ?? [];
      if (!l.length) return null;
      const cnt = args[1] !== undefined ? parseInt(args[1]) : undefined;
      if (cnt !== undefined) {
        const out = l.splice(0, cnt);
        store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
        return out;
      }
      const v = l.shift()!;
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return v;
    }
    case "RPOP": {
      const key = args[0];
      const l = list(key) ?? [];
      if (!l.length) return null;
      const cnt = args[1] !== undefined ? parseInt(args[1]) : undefined;
      if (cnt !== undefined) {
        const out = l.splice(-cnt);
        store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
        return out.reverse();
      }
      const v = l.pop()!;
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return v;
    }
    case "BLPOP":
    case "BRPOP": {
      // Non-blocking: if list has items, pop immediately; else return null
      const _timeout = parseFloat(args[args.length - 1]);
      for (const k of args.slice(0, -1)) {
        const l = list(k);
        if (l && l.length) {
          const v = c === "BLPOP" ? l.shift()! : l.pop()!;
          store.set(k, { type: "list", value: l, expiresAt: keepTtl(k) });
          return [k, v];
        }
      }
      return null; // No blocking in single-server mode
    }
    case "LRANGE": {
      const l = list(args[0]) ?? [];
      const len = l.length;
      const s0 = parseInt(args[1]);
      const s1 = parseInt(args[2]);
      const s = s0 < 0 ? Math.max(len + s0, 0) : s0;
      const e = s1 < 0 ? len + s1 + 1 : Math.min(s1 + 1, len);
      return l.slice(s, e);
    }
    case "LLEN":
      return (list(args[0]) ?? []).length;
    case "LINDEX": {
      const l = list(args[0]) ?? [];
      const i = parseInt(args[1]);
      return l[i < 0 ? l.length + i : i] ?? null;
    }
    case "LSET": {
      const key = args[0];
      const l = list(key);
      if (!l) return null;
      const i = parseInt(args[1]);
      const idx = i < 0 ? l.length + i : i;
      if (idx < 0 || idx >= l.length) return null;
      l[idx] = args[2];
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return "OK";
    }
    case "LINSERT": {
      const key = args[0];
      const l = list(key);
      if (!l) return 0;
      const before = args[1].toUpperCase() === "BEFORE";
      const pivot = args[2];
      const value = args[3];
      const idx = l.indexOf(pivot);
      if (idx === -1) return -1;
      l.splice(before ? idx : idx + 1, 0, value);
      store.set(key, { type: "list", value: l, expiresAt: keepTtl(key) });
      return l.length;
    }
    case "LREM": {
      const key = args[0];
      const l = list(key) ?? [];
      const count = parseInt(args[1]);
      const value = args[2];
      let removed = 0;
      const filtered: string[] = [];
      if (count >= 0) {
        for (const v of l) {
          if (v === value && removed < Math.abs(count)) {
            removed++;
          } else {
            filtered.push(v);
          }
        }
      } else {
        for (const v of [...l].reverse()) {
          if (v === value && removed < Math.abs(count)) {
            removed++;
          } else {
            filtered.unshift(v);
          }
        }
      }
      store.set(key, { type: "list", value: filtered, expiresAt: keepTtl(key) });
      return removed;
    }
    case "RPOPLPUSH":
    case "LMOVE": {
      const src = args[0];
      const dst = args[1];
      const l = list(src);
      if (!l || !l.length) return null;
      const v = l.pop()!;
      store.set(src, { type: "list", value: l, expiresAt: keepTtl(src) });
      const dl = list(dst) ?? [];
      dl.unshift(v);
      store.set(dst, { type: "list", value: dl, expiresAt: keepTtl(dst) });
      return v;
    }
    case "LMOVERM": {
      // Undocumented variant
      return null;
    }

    // ── Streams (BullMQ-compatible) ──
    case "XADD": {
      const key = args[0];
      let i = 1;
      // Parse optional NOMKSTREAM, MAXLEN, MINID, LIMIT
      while (["NOMKSTREAM", "MAXLEN", "MINID"].includes(args[i]?.toUpperCase())) {
        const opt = args[i++].toUpperCase();
        if (opt === "MAXLEN") {
          if (args[i] === "~") i++; // approximate
          i++; // skip count value (applied after add)
        } else if (opt === "MINID") {
          if (args[i] === "~") i++;
          i++;
        }
      }
      let id = args[i++];
      if (id === "*") id = streamId();
      const fields: Record<string, string> = {};
      while (i < args.length) {
        fields[args[i]] = args[i + 1];
        i += 2;
      }
      const entry = store.get(key);
      const msgs: StreamMsg[] =
        entry?.type === "stream" && !expired(entry) ? entry.value : [];
      msgs.push({ id, fields });
      store.set(key, {
        type: "stream",
        value: msgs,
        expiresAt: keepTtl(key),
      });
      return id;
    }
    case "XLEN":
      return (stream(args[0]) ?? []).length;
    case "XTRIM": {
      const key = args[0];
      const msgs = stream(key) ?? [];
      const opt = args[1].toUpperCase();
      if (opt === "MAXLEN") {
        const max = parseInt(args[args.length - 1]);
        if (msgs.length > max) {
          const removed = msgs.length - max;
          msgs.splice(0, removed);
          store.set(key, { type: "stream", value: msgs });
          return removed;
        }
      }
      return 0;
    }
    case "XRANGE":
    case "XREVRANGE": {
      const msgs = stream(args[0]) ?? [];
      const rev = c === "XREVRANGE";
      const rawStart = rev ? args[2] : args[1];
      const rawEnd = rev ? args[1] : args[2];
      const start = rawStart === "-" ? "" : rawStart;
      const end = rawEnd === "+" ? "\uffff\uffff" : rawEnd;
      let data = msgs.filter((m) => m.id >= start && m.id <= end);
      if (rev) data = data.reverse();
      const cntIdx = args.findIndex((a) => a.toUpperCase() === "COUNT");
      if (cntIdx !== -1) data = data.slice(0, parseInt(args[cntIdx + 1]));
      return data.map((m) => [m.id, Object.entries(m.fields).flat()]);
    }
    case "XREAD": {
      const cntIdx = args.findIndex((a) => a.toUpperCase() === "COUNT");
      const count = cntIdx !== -1 ? parseInt(args[cntIdx + 1]) : Infinity;
      const strIdx = args.findIndex((a) => a.toUpperCase() === "STREAMS");
      if (strIdx === -1) return null;
      const rest = args.slice(strIdx + 1);
      const half = Math.floor(rest.length / 2);
      const keys = rest.slice(0, half);
      const ids = rest.slice(half);
      const out: unknown[] = [];
      for (let i = 0; i < keys.length; i++) {
        const msgs = stream(keys[i]) ?? [];
        const afterId = ids[i];
        const entries = msgs
          .filter((m) => m.id > afterId)
          .slice(0, count)
          .map((m) => [m.id, Object.entries(m.fields).flat()]);
        if (entries.length)
          out.push([keys[i], entries]);
      }
      return out.length ? out : null;
    }
    case "XDEL": {
      const key = args[0];
      const msgs = stream(key) ?? [];
      const rm = new Set(args.slice(1));
      const filtered = msgs.filter((m) => !rm.has(m.id));
      store.set(key, { type: "stream", value: filtered });
      return msgs.length - filtered.length;
    }
    case "XGROUP":
      return "OK"; // simplified — consumer groups not fully tracked
    case "XREADGROUP": {
      // Simplified: deliver unconsumed entries
      const strIdx = args.findIndex((a) => a.toUpperCase() === "STREAMS");
      const cntIdx = args.findIndex((a) => a.toUpperCase() === "COUNT");
      const count = cntIdx !== -1 ? parseInt(args[cntIdx + 1]) : Infinity;
      if (strIdx === -1) return null;
      const rest = args.slice(strIdx + 1);
      const half = Math.floor(rest.length / 2);
      const keys = rest.slice(0, half);
      const ids = rest.slice(half);
      const out: unknown[] = [];
      for (let i = 0; i < keys.length; i++) {
        const msgs = stream(keys[i]) ?? [];
        const afterId = ids[i] === ">" ? "" : ids[i];
        const entries = msgs
          .filter((m) => m.id > afterId)
          .slice(0, count)
          .map((m) => [m.id, Object.entries(m.fields).flat()]);
        if (entries.length) out.push([keys[i], entries]);
      }
      return out.length ? out : null;
    }
    case "XACK":
      return args.slice(2).length; // simplified: ack all
    case "XCLAIM":
    case "XAUTOCLAIM":
      return c === "XAUTOCLAIM" ? ["0-0", [], []] : [];
    case "XPENDING":
      return args.length > 3 ? [] : [0, null, null, []];
    case "XINFO":
      return [];

    // ── Scripting ──
    // EVALSHA and SCRIPT are no-ops; EVAL is handled natively for known scripts.
    case "EVALSHA":
    case "SCRIPT":
      return null;

    case "EVAL": {
      // Parse the EVAL call: EVAL script numkeys [key...] [arg...]
      const script = String(args[0] ?? "");
      const numkeys = parseInt(String(args[1] ?? "0"), 10);
      const KEYS: string[] = args.slice(2, 2 + numkeys).map(String);
      const ARGV: string[] = args.slice(2 + numkeys).map(String);

      // ── Script 1: Sliding-window rate limiter (ZCOUNT + ZADD + EXPIRE) ─────
      // Matches SLIDING_WINDOW_LUA from server/middleware/slidingWindowLua.ts
      // KEYS[1]=zset  ARGV[1]=windowStart  ARGV[2]=maxReq  ARGV[3]=now
      // ARGV[4]=entryId  ARGV[5]=expireSecs  ARGV[6]=batchCount (optional)
      if (script.includes("ZCOUNT") && script.includes("ZADD") && script.includes("EXPIRE")) {
        const key = KEYS[0];
        if (!key) return [1, 0];
        const windowStart = parseFloat(ARGV[0] ?? "0");
        const maxReq = parseFloat(ARGV[1] ?? "0");
        const now = parseFloat(ARGV[2] ?? "0");
        const entryId = ARGV[3] ?? "";
        const expireSecs = parseFloat(ARGV[4] ?? "60");
        const batchCount = Math.max(1, parseInt(ARGV[5] ?? "1", 10));

        // ZCOUNT: count members with score in [windowStart, +inf]
        const zs = zset(key);
        let n = 0;
        if (zs) {
          for (const score of zs.values()) {
            if (score >= windowStart) n++;
          }
        }

        if (n + batchCount > maxReq) return [1, 0];

        // ZADD: add batchCount members
        const zsMap: Map<string, number> = new Map(zs ?? []);
        if (batchCount === 1) {
          zsMap.set(entryId, now);
        } else {
          for (let i = 1; i <= batchCount; i++) {
            zsMap.set(`${entryId}:${i}`, now);
          }
        }
        store.set(key, {
          type: "zset",
          value: [...zsMap.entries()].map(([member, score]) => ({ member, score })),
          expiresAt: Date.now() + expireSecs * 1000,
        });

        return [0, maxReq - n - batchCount];
      }

      // ── Script 2: Distributed lock release (GET + conditional DEL) ───────
      // Matches releaseLock() in server/lib/distributedLock.ts
      // KEYS[1]=lockKey  ARGV[1]=token
      if (script.includes('"get"') && script.includes('"del"')) {
        const lockKey = KEYS[0];
        const token = ARGV[0];
        if (!lockKey || !token) return 0;
        const current = str(lockKey);
        if (current === token) {
          store.delete(lockKey);
          return 1;
        }
        return 0;
      }

      // ── Script 3: Feature event buffer flush (LRANGE + RPUSH + EXPIRE + LTRIM)
      // Matches fetchLua in server/services/featureEventBuffer.ts
      // KEYS[1]=sourceBuffer  KEYS[2]=processingKey
      // ARGV[1]=batchSize  ARGV[2]=ttlSeconds
      if (script.includes("LRANGE") && script.includes("RPUSH") && script.includes("LTRIM")) {
        const sourceKey = KEYS[0];
        const processingKey = KEYS[1];
        const n = parseInt(ARGV[0] ?? "100", 10);
        const ttl = parseInt(ARGV[1] ?? "300", 10);

        if (!sourceKey || !processingKey) return [];

        const srcList = list(sourceKey) ?? [];
        const items = srcList.slice(0, n);

        if (items.length > 0) {
          // RPUSH items to processingKey
          const procList = list(processingKey) ?? [];
          const newProcList = [...procList, ...items];
          store.set(processingKey, {
            type: "list",
            value: newProcList,
            expiresAt: Date.now() + ttl * 1000,
          });

          // LTRIM sourceKey n -1 (remove first n elements)
          const remaining = srcList.slice(n);
          if (remaining.length === 0) {
            store.delete(sourceKey);
          } else {
            const srcEntry = store.get(sourceKey);
            store.set(sourceKey, {
              type: "list",
              value: remaining,
              expiresAt: srcEntry && !expired(srcEntry) ? srcEntry.expiresAt : undefined,
            });
          }
        }

        return items;
      }

      // Unknown script — throw so callers fall through to their non-Lua fallback
      throw new Error(`ERR unknown Lua script pattern (local PDIM fallback)`);
    }

    // ── Pub/Sub (no-op — no actual push delivery) ──
    case "PUBLISH":
      return 0;
    case "SUBSCRIBE":
    case "UNSUBSCRIBE":
    case "PSUBSCRIBE":
    case "PUNSUBSCRIBE":
      return ["subscribe", args[0], 1];

    // ── Server ──
    case "INFO":
      return "local_pdim:1\r\nrole:master\r\n";
    case "TIME":
      return [String(Math.floor(Date.now() / 1000)), "0"];
    case "DBSIZE": {
      let n = 0;
      for (const [, v] of store) if (!expired(v)) n++;
      return n;
    }
    case "OBJECT":
      return null;
    case "DEBUG":
      return "OK";
    case "COMMAND":
      return [];
    case "WAIT":
      return 0;
    case "RESET":
      return "RESET";
    case "MULTI":
      return "OK";
    case "EXEC":
      return [];
    case "DISCARD":
      return "OK";

    default:
      logger.debug(`[LocalPDIM] Unknown command: ${c} ${args.slice(0, 3).join(" ")}`);
      return null;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveStore(): void {
  try {
    fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
    const obj: Record<string, StoreEntry> = {};
    for (const [k, v] of store) {
      if (!expired(v)) obj[k] = v;
    }
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(obj), "utf8");
  } catch {
    // best-effort
  }
}

function loadStore(): void {
  try {
    if (!fs.existsSync(PERSIST_FILE)) return;
    const raw = fs.readFileSync(PERSIST_FILE, "utf8");
    const data = JSON.parse(raw) as Record<string, StoreEntry>;
    let loaded = 0;
    for (const [k, v] of Object.entries(data)) {
      if (!expired(v)) {
        // Sets: restore as plain arrays (JSON round-trip)
        store.set(k, v);
        loaded++;
      }
    }
    logger.info(
      `[LocalPDIM] Restored ${loaded} entries from ${PERSIST_FILE}`,
    );
  } catch {
    // best-effort
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

let _server: http.Server | null = null;

export function getLocalPdimUrl(): string {
  return `http://127.0.0.1:${LOCAL_PORT}/api/redis/instances/local/exec`;
}

export function startLocalPdimServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (_server) {
      resolve();
      return;
    }

    loadStore();

    _server = http.createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const { cmd, args = [] } = JSON.parse(body) as {
            cmd: string;
            args?: unknown[];
          };
          const result = exec(cmd, (args as unknown[]).map(String));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Bad Request");
        }
      });
    });

    _server.listen(LOCAL_PORT, "127.0.0.1", () => {
      logger.info(
        `[LocalPDIM] ✅ Local PDIM exec server started on port ${LOCAL_PORT} (in-memory + file persistence)`,
      );

      // Periodic persistence (unref so it doesn't block exit)
      const t = setInterval(saveStore, PERSIST_INTERVAL_MS);
      t.unref();

      // Save on clean shutdown
      process.on("SIGTERM", () => {
        saveStore();
      });

      resolve();
    });

    _server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Another process already has the port — treat as "already running"
        logger.info(
          `[LocalPDIM] Port ${LOCAL_PORT} already in use — assuming local PDIM already running`,
        );
        resolve();
      } else {
        reject(err);
      }
    });
  });
}
