/**
 * LUA WORKER THREAD
 *
 * Runs inside a Node.js worker_thread.  Receives Lua script execution requests
 * from the main thread via parentPort, executes them synchronously (blocking
 * this worker's event loop only — never the main thread), and posts back the
 * result or error.
 *
 * Each worker thread owns a single persistent LuaFactory instance so the Wasm
 * binary is compiled only once per thread (not once per script invocation).
 */

import { parentPort, workerData } from "worker_threads";
import { LuaFactory, type LuaEngine } from "wasmoon";
import {
  encode as msgpackEncode,
  decode as msgpackDecode,
} from "@msgpack/msgpack";
import { createHash } from "crypto";

if (!parentPort) throw new Error("lua-worker must run inside a worker_thread");

const factory = new LuaFactory();

export interface LuaRequest {
  id: string;
  script: string;
  keys: string[];
  argv: string[];
}

export interface LuaResponse {
  id: string;
  result?: unknown;
  error?: string;
}

// ── Helpers (same logic as store.ts, duplicated here to avoid import overhead) ─

function luaQuoteStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\0/g, "\\0")}"`;
}

function luaToRedis(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val ? 1 : null;
  if (typeof val === "number") return Math.trunc(val);
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(luaToRedis);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (obj["err"] !== undefined) throw new Error(String(obj["err"]));
    if (obj["ok"] !== undefined) return String(obj["ok"]);
    return Object.values(obj).map(luaToRedis);
  }
  return String(val);
}

function luaTableToJs(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object") return val;
  if (val instanceof Uint8Array || Buffer.isBuffer(val)) return val;
  const obj = val as Record<string | number, unknown>;
  const keys = Object.keys(obj).filter((k) => k !== "__name");
  if (keys.length === 0) return {};
  const numericKeys = keys
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  if (numericKeys.length === keys.length && numericKeys.length > 0) {
    const minIdx = Math.min(...numericKeys);
    const maxIdx = Math.max(...numericKeys);
    if (maxIdx - minIdx + 1 === numericKeys.length) {
      const arr: unknown[] = [];
      for (let i = minIdx; i <= maxIdx; i++) arr.push(luaTableToJs(obj[i]));
      return arr;
    }
  }
  const result: Record<string, unknown> = {};
  for (const k of keys) result[k] = luaTableToJs(obj[k]);
  return result;
}

function valToLuaLiteral(val: unknown): string {
  if (val === null || val === undefined) return "nil";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return isFinite(val) ? String(val) : "0";
  if (typeof val === "string") return luaQuoteStr(val);
  if (Array.isArray(val)) return `{${val.map(valToLuaLiteral).join(", ")}}`;
  if (typeof val === "object") {
    const pairs = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `[${luaQuoteStr(k)}] = ${valToLuaLiteral(v)}`)
      .join(", ");
    return `{${pairs}}`;
  }
  return "nil";
}

function bytesToLuaStr(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function luaStrToBytes(str: unknown): Buffer {
  if (str instanceof Uint8Array) return Buffer.from(str);
  if (Buffer.isBuffer(str)) return str;
  const s = String(str);
  if (s.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(s))
    return Buffer.from(s, "hex");
  return Buffer.from(s, "binary");
}

function buildLuaSequence(arr: unknown[], lua: LuaEngine): unknown {
  if (arr.length === 0) return lua.doStringSync("return {}");
  const elems = arr
    .map((v) => {
      if (v === null || v === undefined || v === false) return "false";
      if (typeof v === "number") return String(v);
      if (typeof v === "string") return luaQuoteStr(v);
      return "false";
    })
    .join(", ");
  return lua.doStringSync(`return {${elems}}`);
}

function redisReplyToLua(result: unknown, lua: LuaEngine): unknown {
  if (result === null || result === undefined) return false;
  if (typeof result === "string" || typeof result === "number") return result;
  if (typeof result === "boolean") return result ? 1 : 0;
  if (Array.isArray(result)) {
    const safe = result.map((v) => (v === null || v === undefined ? false : v));
    return buildLuaSequence(safe, lua);
  }
  if (typeof result === "object") {
    const flat: string[] = [];
    for (const [k, v] of Object.entries(result as Record<string, string>))
      flat.push(k, v ?? "");
    return buildLuaSequence(flat, lua);
  }
  return result;
}

// ── Message handler ───────────────────────────────────────────────────────────

parentPort.on("message", async (req: LuaRequest) => {
  const lua = await factory.createEngine({ openStandardLibs: true });
  try {
    const { id, script, keys, argv } = req;

    const keysLit = keys.map(luaQuoteStr).join(", ");
    const argvLit = argv.map(luaQuoteStr).join(", ");
    lua.doStringSync(`KEYS = {${keysLit}}; ARGV = {${argvLit}}`);

    const toStrArgs = (args: unknown[]): string[] =>
      args.map((a) => {
        if (a === null || a === undefined) return "";
        if (a instanceof Uint8Array || Buffer.isBuffer(a))
          return Buffer.from(a).toString("binary");
        return String(a);
      });

    // Note: redis.call() in a worker thread cannot call back into the main
    // thread's store because there's no shared memory.  The worker is intended
    // for self-contained scripts that don't use redis.call().
    // Scripts that do use redis.call() fall back to the main-thread runner.
    lua.global.set("redis", {
      call: (_cmd: string, ..._args: unknown[]) => {
        throw new Error(
          "redis.call() is not supported in worker-thread mode — use the sync runner",
        );
      },
      pcall: (_cmd: string, ..._args: unknown[]) => ({
        err: "redis.call() not supported in worker mode",
      }),
      error_reply: (msg: string) => ({ err: msg }),
      status_reply: (msg: string) => ({ ok: msg }),
      LOG_DEBUG: 0,
      LOG_VERBOSE: 1,
      LOG_NOTICE: 2,
      LOG_WARNING: 3,
      log: () => {},
    });

    lua.global.set("cjson", {
      encode: (v: unknown) => JSON.stringify(luaTableToJs(v)),
      decode: (s: string) => JSON.parse(s),
    });

    lua.global.set("cmsgpack", {
      pack: (v: unknown): string =>
        bytesToLuaStr(msgpackEncode(luaTableToJs(v))),
      unpack: (s: unknown): unknown => msgpackDecode(luaStrToBytes(s)),
    });

    lua.global.set("tonumber", (v: unknown, base?: number) => {
      if (v === null || v === undefined) return null;
      const n = base ? parseInt(String(v), base) : parseFloat(String(v));
      return isNaN(n) ? null : n;
    });

    const result = await lua.doString(script);
    const response: LuaResponse = { id, result: luaToRedis(result) };
    parentPort!.postMessage(response);
  } catch (err) {
    const response: LuaResponse = {
      id: req.id,
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort!.postMessage(response);
  } finally {
    lua.global.close();
  }
});
