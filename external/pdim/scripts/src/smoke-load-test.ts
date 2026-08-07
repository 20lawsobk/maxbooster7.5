// ============================================================================
// PDIM Smoke + Load Test Suite
// Tests the Redis HTTP API, PocketFabric storage, pipeline, Lua scripting,
// auth, and concurrency/throughput under load.
//
// Usage:
//   pnpm --filter @workspace/scripts run smoke-test
//   API_BASE=http://localhost:3000 pnpm --filter @workspace/scripts run smoke-test
// ============================================================================

const API_BASE = process.env["API_BASE"] ?? "http://localhost:3000";
const BASE = `${API_BASE}/api`;

// ── Colours ──────────────────────────────────────────────────────────────────
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ── Result tracking ───────────────────────────────────────────────────────────
interface Result {
  name: string;
  passed: boolean;
  ms: number;
  error?: string;
}
const results: Result[] = [];

function pass(name: string, ms: number) {
  results.push({ name, passed: true, ms });
  console.log(`  ${GREEN}✓${RESET} ${name} ${DIM}(${ms}ms)${RESET}`);
}

function fail(name: string, ms: number, error: string) {
  results.push({ name, passed: false, ms, error });
  console.log(`  ${RED}✗${RESET} ${name} ${DIM}(${ms}ms)${RESET}`);
  console.log(`    ${RED}${error}${RESET}`);
}

function section(title: string) {
  console.log(`\n${BOLD}${CYAN}── ${title}${RESET}`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function exec(
  id: string,
  token: string,
  cmd: string,
  args: string[] = [],
): Promise<unknown> {
  const { data } = await api(
    "POST",
    `/redis/instances/${id}/exec`,
    { cmd, args },
    token,
  );
  return (data as any)?.result;
}

async function pipeline(
  id: string,
  token: string,
  commands: { cmd: string; args?: string[] }[],
): Promise<unknown[]> {
  const { data } = await api(
    "POST",
    `/redis/instances/${id}/pipeline`,
    commands.map((c) => ({ cmd: c.cmd, args: c.args ?? [] })),
    token,
  );
  return ((data as any)?.results ?? []).map((r: any) => r.result);
}

// ── Test helper ───────────────────────────────────────────────────────────────
async function test(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    pass(name, Date.now() - t0);
  } catch (e: any) {
    fail(name, Date.now() - t0, e?.message ?? String(e));
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEq(actual: unknown, expected: unknown, label = "") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
let instanceId = "";
let instanceToken = "";

async function main() {
  console.log(`\n${BOLD}PDIM Smoke + Load Test Suite${RESET}`);
  console.log(`${DIM}Target: ${BASE}${RESET}\n`);

  // ==========================================================================
  // 1. INFRASTRUCTURE HEALTH
  // ==========================================================================
  section("Infrastructure Health");

  await test("GET /healthz → 200 ok", async () => {
    const { status, data } = await api("GET", "/healthz");
    assertEq(status, 200, "status");
    assertEq((data as any)?.status, "ok", "body.status");
  });

  await test("GET /autopush/status → running + progress", async () => {
    const { status, data } = await api("GET", "/autopush/status");
    assertEq(status, 200, "status");
    assert(typeof (data as any)?.chunkIndex === "number", "chunkIndex missing");
    assert(
      typeof (data as any)?.totalChunks === "number",
      "totalChunks missing",
    );
    assert((data as any)?.totalChunks > 0, "totalChunks must be > 0");
  });

  await test("GET /monitor/scale → rate-limit + lua pool present", async () => {
    const { status, data } = await api("GET", "/monitor/scale");
    assertEq(status, 200, "status");
    assert((data as any)?.rateLimit !== undefined, "rateLimit missing");
    assert((data as any)?.luaPool !== undefined, "luaPool missing");
    assert((data as any)?.stores !== undefined, "stores missing");
  });

  await test("GET /redis/instances → lists system instances", async () => {
    const { status, data } = await api("GET", "/redis/instances");
    assertEq(status, 200, "status");
    assert((data as any)?.count >= 2, "expected at least 2 system instances");
  });

  // ==========================================================================
  // 2. INSTANCE LIFECYCLE
  // ==========================================================================
  section("Instance Lifecycle");

  await test("POST /redis/instances → create test instance", async () => {
    const { status, data } = await api("POST", "/redis/instances", {
      name: "smoke-test-instance",
      maxKeys: 0,
    });
    assertEq(status, 201, "status");
    assert(typeof (data as any)?.id === "string", "id missing");
    assert(typeof (data as any)?.token === "string", "token missing");
    instanceId = (data as any).id;
    instanceToken = (data as any).token;
  });

  await test("GET /redis/instances/:id → instance info", async () => {
    const { status, data } = await api(
      "GET",
      `/redis/instances/${instanceId}`,
      undefined,
      instanceToken,
    );
    assertEq(status, 200, "status");
    assertEq((data as any)?.id, instanceId, "id");
  });

  // ==========================================================================
  // 3. AUTH
  // ==========================================================================
  section("Auth");

  await test("No token → 401", async () => {
    const { status } = await api(
      "POST",
      `/redis/instances/${instanceId}/exec`,
      {
        cmd: "PING",
        args: [],
      },
    );
    assertEq(status, 401, "status");
  });

  await test("Wrong token → 403", async () => {
    const { status } = await api(
      "POST",
      `/redis/instances/${instanceId}/exec`,
      { cmd: "PING", args: [] },
      "wrong-token-abc123",
    );
    assertEq(status, 403, "status");
  });

  // ==========================================================================
  // 4. STRING COMMANDS
  // ==========================================================================
  section("String Commands");

  await test("PING", async () => {
    assertEq(await exec(instanceId, instanceToken, "PING"), "PONG", "PING");
  });

  await test("SET / GET", async () => {
    await exec(instanceId, instanceToken, "SET", ["str:key", "hello"]);
    assertEq(
      await exec(instanceId, instanceToken, "GET", ["str:key"]),
      "hello",
      "GET",
    );
  });

  await test("SET EX / TTL", async () => {
    await exec(instanceId, instanceToken, "SET", [
      "str:ttl",
      "expiring",
      "EX",
      "60",
    ]);
    const ttl = await exec(instanceId, instanceToken, "TTL", ["str:ttl"]);
    assert(
      Number(ttl) > 0 && Number(ttl) <= 60,
      `TTL should be 0-60, got ${ttl}`,
    );
  });

  await test("SET NX (only if not exists)", async () => {
    const r1 = await exec(instanceId, instanceToken, "SET", [
      "str:nx",
      "first",
      "NX",
    ]);
    const r2 = await exec(instanceId, instanceToken, "SET", [
      "str:nx",
      "second",
      "NX",
    ]);
    assertEq(r1, "OK", "first SET NX");
    assertEq(r2, null, "second SET NX should be null");
    assertEq(
      await exec(instanceId, instanceToken, "GET", ["str:nx"]),
      "first",
      "GET after NX",
    );
  });

  await test("INCR / INCRBY / DECR / DECRBY", async () => {
    await exec(instanceId, instanceToken, "SET", ["str:counter", "10"]);
    assertEq(
      await exec(instanceId, instanceToken, "INCR", ["str:counter"]),
      11,
      "INCR",
    );
    assertEq(
      await exec(instanceId, instanceToken, "INCRBY", ["str:counter", "5"]),
      16,
      "INCRBY",
    );
    assertEq(
      await exec(instanceId, instanceToken, "DECR", ["str:counter"]),
      15,
      "DECR",
    );
    assertEq(
      await exec(instanceId, instanceToken, "DECRBY", ["str:counter", "5"]),
      10,
      "DECRBY",
    );
  });

  await test("APPEND / STRLEN / GETRANGE", async () => {
    await exec(instanceId, instanceToken, "SET", ["str:app", "Hello"]);
    await exec(instanceId, instanceToken, "APPEND", ["str:app", " World"]);
    assertEq(
      await exec(instanceId, instanceToken, "STRLEN", ["str:app"]),
      11,
      "STRLEN",
    );
    assertEq(
      await exec(instanceId, instanceToken, "GETRANGE", ["str:app", "0", "4"]),
      "Hello",
      "GETRANGE",
    );
  });

  await test("MSET / MGET", async () => {
    await exec(instanceId, instanceToken, "MSET", [
      "mk:a",
      "1",
      "mk:b",
      "2",
      "mk:c",
      "3",
    ]);
    const vals = await exec(instanceId, instanceToken, "MGET", [
      "mk:a",
      "mk:b",
      "mk:c",
    ]);
    assertEq(vals, ["1", "2", "3"], "MGET");
  });

  await test("EXISTS / DEL", async () => {
    await exec(instanceId, instanceToken, "SET", ["str:del", "bye"]);
    assertEq(
      await exec(instanceId, instanceToken, "EXISTS", ["str:del"]),
      1,
      "EXISTS before DEL",
    );
    await exec(instanceId, instanceToken, "DEL", ["str:del"]);
    assertEq(
      await exec(instanceId, instanceToken, "EXISTS", ["str:del"]),
      0,
      "EXISTS after DEL",
    );
  });

  await test("EXPIRE / PERSIST / PTTL", async () => {
    await exec(instanceId, instanceToken, "SET", ["str:persist", "val"]);
    await exec(instanceId, instanceToken, "EXPIRE", ["str:persist", "30"]);
    const pttl = await exec(instanceId, instanceToken, "PTTL", ["str:persist"]);
    assert(Number(pttl) > 0, `PTTL should be > 0, got ${pttl}`);
    await exec(instanceId, instanceToken, "PERSIST", ["str:persist"]);
    assertEq(
      await exec(instanceId, instanceToken, "TTL", ["str:persist"]),
      -1,
      "TTL after PERSIST",
    );
  });

  await test("TYPE command", async () => {
    assertEq(
      await exec(instanceId, instanceToken, "TYPE", ["str:key"]),
      "string",
      "TYPE string",
    );
  });

  // ==========================================================================
  // 5. LIST COMMANDS
  // ==========================================================================
  section("List Commands");

  await test("RPUSH / LPUSH / LRANGE / LLEN", async () => {
    await exec(instanceId, instanceToken, "DEL", ["list:k"]);
    await exec(instanceId, instanceToken, "RPUSH", ["list:k", "a", "b", "c"]);
    await exec(instanceId, instanceToken, "LPUSH", ["list:k", "z"]);
    assertEq(
      await exec(instanceId, instanceToken, "LLEN", ["list:k"]),
      4,
      "LLEN",
    );
    assertEq(
      await exec(instanceId, instanceToken, "LRANGE", ["list:k", "0", "-1"]),
      ["z", "a", "b", "c"],
      "LRANGE",
    );
  });

  await test("LPOP / RPOP", async () => {
    assertEq(
      await exec(instanceId, instanceToken, "LPOP", ["list:k"]),
      "z",
      "LPOP",
    );
    assertEq(
      await exec(instanceId, instanceToken, "RPOP", ["list:k"]),
      "c",
      "RPOP",
    );
    assertEq(
      await exec(instanceId, instanceToken, "LRANGE", ["list:k", "0", "-1"]),
      ["a", "b"],
      "LRANGE after pops",
    );
  });

  await test("LINDEX / LSET", async () => {
    assertEq(
      await exec(instanceId, instanceToken, "LINDEX", ["list:k", "0"]),
      "a",
      "LINDEX 0",
    );
    await exec(instanceId, instanceToken, "LSET", ["list:k", "0", "A"]);
    assertEq(
      await exec(instanceId, instanceToken, "LINDEX", ["list:k", "0"]),
      "A",
      "LINDEX after LSET",
    );
  });

  await test("LINSERT / LREM / LTRIM", async () => {
    await exec(instanceId, instanceToken, "DEL", ["list:ops"]);
    await exec(instanceId, instanceToken, "RPUSH", [
      "list:ops",
      "a",
      "b",
      "b",
      "c",
    ]);
    await exec(instanceId, instanceToken, "LINSERT", [
      "list:ops",
      "BEFORE",
      "b",
      "X",
    ]);
    assertEq(
      await exec(instanceId, instanceToken, "LRANGE", ["list:ops", "0", "-1"]),
      ["a", "X", "b", "b", "c"],
      "LINSERT",
    );
    await exec(instanceId, instanceToken, "LREM", ["list:ops", "2", "b"]);
    assertEq(
      await exec(instanceId, instanceToken, "LRANGE", ["list:ops", "0", "-1"]),
      ["a", "X", "c"],
      "LREM",
    );
    await exec(instanceId, instanceToken, "LTRIM", ["list:ops", "1", "-1"]);
    assertEq(
      await exec(instanceId, instanceToken, "LRANGE", ["list:ops", "0", "-1"]),
      ["X", "c"],
      "LTRIM",
    );
  });

  await test("LMOVE", async () => {
    await exec(instanceId, instanceToken, "DEL", ["list:src", "list:dst"]);
    await exec(instanceId, instanceToken, "RPUSH", ["list:src", "1", "2", "3"]);
    const moved = await exec(instanceId, instanceToken, "LMOVE", [
      "list:src",
      "list:dst",
      "LEFT",
      "RIGHT",
    ]);
    assertEq(moved, "1", "LMOVE return");
    assertEq(
      await exec(instanceId, instanceToken, "LRANGE", ["list:dst", "0", "-1"]),
      ["1"],
      "LMOVE dst",
    );
  });

  // ==========================================================================
  // 6. HASH COMMANDS
  // ==========================================================================
  section("Hash Commands");

  await test("HSET / HGET / HGETALL / HLEN", async () => {
    await exec(instanceId, instanceToken, "DEL", ["hash:k"]);
    await exec(instanceId, instanceToken, "HSET", [
      "hash:k",
      "f1",
      "v1",
      "f2",
      "v2",
      "f3",
      "v3",
    ]);
    assertEq(
      await exec(instanceId, instanceToken, "HGET", ["hash:k", "f1"]),
      "v1",
      "HGET",
    );
    assertEq(
      await exec(instanceId, instanceToken, "HLEN", ["hash:k"]),
      3,
      "HLEN",
    );
    const all = (await exec(instanceId, instanceToken, "HGETALL", [
      "hash:k",
    ])) as Record<string, string>;
    assert(
      typeof all === "object" &&
        !Array.isArray(all) &&
        Object.keys(all).length === 3,
      "HGETALL length",
    );
  });

  await test("HMGET / HEXISTS / HDEL", async () => {
    const mget = await exec(instanceId, instanceToken, "HMGET", [
      "hash:k",
      "f1",
      "f2",
      "missing",
    ]);
    assertEq(mget, ["v1", "v2", null], "HMGET");
    assertEq(
      await exec(instanceId, instanceToken, "HEXISTS", ["hash:k", "f1"]),
      1,
      "HEXISTS present",
    );
    await exec(instanceId, instanceToken, "HDEL", ["hash:k", "f1"]);
    assertEq(
      await exec(instanceId, instanceToken, "HEXISTS", ["hash:k", "f1"]),
      0,
      "HEXISTS after HDEL",
    );
  });

  await test("HKEYS / HVALS / HINCRBY", async () => {
    await exec(instanceId, instanceToken, "DEL", ["hash:num"]);
    await exec(instanceId, instanceToken, "HSET", ["hash:num", "n", "10"]);
    assertEq(
      await exec(instanceId, instanceToken, "HINCRBY", ["hash:num", "n", "5"]),
      15,
      "HINCRBY",
    );
    const keys = await exec(instanceId, instanceToken, "HKEYS", ["hash:num"]);
    assert(Array.isArray(keys) && (keys as string[]).includes("n"), "HKEYS");
    const vals = await exec(instanceId, instanceToken, "HVALS", ["hash:num"]);
    assert(Array.isArray(vals) && (vals as string[]).includes("15"), "HVALS");
  });

  // ==========================================================================
  // 7. SET COMMANDS
  // ==========================================================================
  section("Set Commands");

  await test("SADD / SMEMBERS / SCARD / SISMEMBER / SREM", async () => {
    await exec(instanceId, instanceToken, "DEL", ["set:k"]);
    await exec(instanceId, instanceToken, "SADD", [
      "set:k",
      "a",
      "b",
      "c",
      "a",
    ]);
    assertEq(
      await exec(instanceId, instanceToken, "SCARD", ["set:k"]),
      3,
      "SCARD",
    );
    assertEq(
      await exec(instanceId, instanceToken, "SISMEMBER", ["set:k", "a"]),
      1,
      "SISMEMBER a",
    );
    assertEq(
      await exec(instanceId, instanceToken, "SISMEMBER", ["set:k", "z"]),
      0,
      "SISMEMBER z",
    );
    await exec(instanceId, instanceToken, "SREM", ["set:k", "a"]);
    assertEq(
      await exec(instanceId, instanceToken, "SCARD", ["set:k"]),
      2,
      "SCARD after SREM",
    );
  });

  await test("SUNION / SINTER / SDIFF", async () => {
    await exec(instanceId, instanceToken, "DEL", ["set:x", "set:y"]);
    await exec(instanceId, instanceToken, "SADD", ["set:x", "1", "2", "3"]);
    await exec(instanceId, instanceToken, "SADD", ["set:y", "2", "3", "4"]);
    const union = (
      (await exec(instanceId, instanceToken, "SUNION", [
        "set:x",
        "set:y",
      ])) as string[]
    ).sort();
    assertEq(union, ["1", "2", "3", "4"], "SUNION");
    const inter = (
      (await exec(instanceId, instanceToken, "SINTER", [
        "set:x",
        "set:y",
      ])) as string[]
    ).sort();
    assertEq(inter, ["2", "3"], "SINTER");
    const diff = (
      (await exec(instanceId, instanceToken, "SDIFF", [
        "set:x",
        "set:y",
      ])) as string[]
    ).sort();
    assertEq(diff, ["1"], "SDIFF");
  });

  // ==========================================================================
  // 8. SORTED SET COMMANDS
  // ==========================================================================
  section("Sorted Set Commands");

  await test("ZADD / ZSCORE / ZRANK / ZCARD", async () => {
    await exec(instanceId, instanceToken, "DEL", ["zset:k"]);
    await exec(instanceId, instanceToken, "ZADD", [
      "zset:k",
      "1",
      "a",
      "2",
      "b",
      "3",
      "c",
    ]);
    assertEq(
      await exec(instanceId, instanceToken, "ZCARD", ["zset:k"]),
      3,
      "ZCARD",
    );
    assertEq(
      await exec(instanceId, instanceToken, "ZSCORE", ["zset:k", "b"]),
      "2",
      "ZSCORE",
    );
    assertEq(
      await exec(instanceId, instanceToken, "ZRANK", ["zset:k", "c"]),
      2,
      "ZRANK",
    );
  });

  await test("ZRANGE / ZREVRANGE / ZINCRBY / ZCOUNT", async () => {
    assertEq(
      await exec(instanceId, instanceToken, "ZRANGE", ["zset:k", "0", "-1"]),
      ["a", "b", "c"],
      "ZRANGE",
    );
    assertEq(
      await exec(instanceId, instanceToken, "ZREVRANGE", ["zset:k", "0", "-1"]),
      ["c", "b", "a"],
      "ZREVRANGE",
    );
    assertEq(
      await exec(instanceId, instanceToken, "ZINCRBY", ["zset:k", "10", "a"]),
      "11",
      "ZINCRBY",
    );
    assertEq(
      await exec(instanceId, instanceToken, "ZCOUNT", ["zset:k", "1", "5"]),
      2,
      "ZCOUNT",
    );
  });

  await test("ZRANGEBYSCORE / ZREM", async () => {
    const range = await exec(instanceId, instanceToken, "ZRANGEBYSCORE", [
      "zset:k",
      "1",
      "3",
    ]);
    assertEq(range, ["b", "c"], "ZRANGEBYSCORE");
    await exec(instanceId, instanceToken, "ZREM", ["zset:k", "b"]);
    assertEq(
      await exec(instanceId, instanceToken, "ZCARD", ["zset:k"]),
      2,
      "ZCARD after ZREM",
    );
  });

  // ==========================================================================
  // 9. STREAM COMMANDS
  // ==========================================================================
  section("Stream Commands");

  await test("XADD / XLEN / XRANGE", async () => {
    await exec(instanceId, instanceToken, "DEL", ["stream:k"]);
    const id1 = await exec(instanceId, instanceToken, "XADD", [
      "stream:k",
      "*",
      "field1",
      "val1",
    ]);
    const id2 = await exec(instanceId, instanceToken, "XADD", [
      "stream:k",
      "*",
      "field2",
      "val2",
    ]);
    assert(
      typeof id1 === "string" && (id1 as string).includes("-"),
      "XADD id1 format",
    );
    assertEq(
      await exec(instanceId, instanceToken, "XLEN", ["stream:k"]),
      2,
      "XLEN",
    );
    const entries = (await exec(instanceId, instanceToken, "XRANGE", [
      "stream:k",
      "-",
      "+",
    ])) as any[];
    assertEq(entries.length, 2, "XRANGE count");
    assertEq(entries[0][0], id1, "XRANGE first id");
  });

  await test("XREAD", async () => {
    const res = (await exec(instanceId, instanceToken, "XREAD", [
      "COUNT",
      "10",
      "STREAMS",
      "stream:k",
      "0-0",
    ])) as any[];
    assert(Array.isArray(res) && res.length > 0, "XREAD result");
    assertEq(res[0][0], "stream:k", "XREAD stream name");
    assert(
      Array.isArray(res[0][1]) && res[0][1].length === 2,
      "XREAD messages count",
    );
  });

  await test("XADD MAXLEN / XTRIM", async () => {
    await exec(instanceId, instanceToken, "DEL", ["stream:capped"]);
    for (let i = 0; i < 10; i++) {
      await exec(instanceId, instanceToken, "XADD", [
        "stream:capped",
        "MAXLEN",
        "5",
        "*",
        "i",
        String(i),
      ]);
    }
    const len = await exec(instanceId, instanceToken, "XLEN", [
      "stream:capped",
    ]);
    assert(Number(len) <= 5, `MAXLEN cap: expected ≤5, got ${len}`);
  });

  // ==========================================================================
  // 10. KEY COMMANDS
  // ==========================================================================
  section("Key Commands");

  await test("KEYS / DBSIZE / SCAN", async () => {
    const dbsize = await exec(instanceId, instanceToken, "DBSIZE");
    assert(Number(dbsize) > 0, `DBSIZE should be > 0, got ${dbsize}`);
    const keys = (await exec(instanceId, instanceToken, "KEYS", [
      "str:*",
    ])) as string[];
    assert(Array.isArray(keys) && keys.length > 0, "KEYS str:*");
    const scan = (await exec(instanceId, instanceToken, "SCAN", [
      "0",
      "COUNT",
      "100",
    ])) as [string, string[]];
    assert(Array.isArray(scan) && scan.length === 2, "SCAN result format");
    assert(Array.isArray(scan[1]), "SCAN keys array");
  });

  await test("RENAME", async () => {
    await exec(instanceId, instanceToken, "SET", ["rename:src", "value"]);
    await exec(instanceId, instanceToken, "RENAME", [
      "rename:src",
      "rename:dst",
    ]);
    assertEq(
      await exec(instanceId, instanceToken, "GET", ["rename:dst"]),
      "value",
      "GET after RENAME",
    );
    assertEq(
      await exec(instanceId, instanceToken, "EXISTS", ["rename:src"]),
      0,
      "src gone after RENAME",
    );
  });

  await test("TYPE reflects data structure", async () => {
    assertEq(
      await exec(instanceId, instanceToken, "TYPE", ["list:k"]),
      "list",
      "list type",
    );
    assertEq(
      await exec(instanceId, instanceToken, "TYPE", ["hash:k"]),
      "hash",
      "hash type",
    );
    assertEq(
      await exec(instanceId, instanceToken, "TYPE", ["set:k"]),
      "set",
      "set type",
    );
    assertEq(
      await exec(instanceId, instanceToken, "TYPE", ["zset:k"]),
      "zset",
      "zset type",
    );
    assertEq(
      await exec(instanceId, instanceToken, "TYPE", ["stream:k"]),
      "stream",
      "stream type",
    );
  });

  // ==========================================================================
  // 11. LUA SCRIPTING
  // ==========================================================================
  section("Lua Scripting (EVAL)");

  await test("EVAL basic return", async () => {
    const r = await exec(instanceId, instanceToken, "EVAL", ["return 42", "0"]);
    assertEq(r, 42, "EVAL numeric return");
  });

  await test("EVAL with KEYS and ARGV", async () => {
    await exec(instanceId, instanceToken, "SET", ["lua:key", "world"]);
    const r = await exec(instanceId, instanceToken, "EVAL", [
      "return 'hello ' .. redis.call('GET', KEYS[1]) .. ' ' .. ARGV[1]",
      "1",
      "lua:key",
      "!",
    ]);
    assertEq(r, "hello world !", "EVAL with KEYS/ARGV");
  });

  await test("EVAL redis.call SET + GET round-trip", async () => {
    await exec(instanceId, instanceToken, "EVAL", [
      "redis.call('SET', KEYS[1], ARGV[1]); return redis.call('GET', KEYS[1])",
      "1",
      "lua:rtt",
      "pdim-lua-test",
    ]);
    assertEq(
      await exec(instanceId, instanceToken, "GET", ["lua:rtt"]),
      "pdim-lua-test",
      "lua SET/GET",
    );
  });

  await test("EVAL table return", async () => {
    const r = await exec(instanceId, instanceToken, "EVAL", [
      "return {1, 'two', 3}",
      "0",
    ]);
    assertEq(r, [1, "two", 3], "EVAL table");
  });

  await test("EVAL pcall error handling", async () => {
    const r = await exec(instanceId, instanceToken, "EVAL", [
      "local ok, err = pcall(function() return redis.call('WRONGCMD') end); if ok then return 'ok' else return 'caught' end",
      "0",
    ]);
    assertEq(r, "caught", "pcall error caught");
  });

  // ==========================================================================
  // 12. PIPELINE ENDPOINT
  // ==========================================================================
  section("Pipeline");

  await test("Pipeline: 10 mixed commands", async () => {
    const cmds = [
      { cmd: "SET", args: ["p:a", "1"] },
      { cmd: "SET", args: ["p:b", "2"] },
      { cmd: "GET", args: ["p:a"] },
      { cmd: "GET", args: ["p:b"] },
      { cmd: "INCR", args: ["p:a"] },
      { cmd: "INCR", args: ["p:b"] },
      { cmd: "GET", args: ["p:a"] },
      { cmd: "GET", args: ["p:b"] },
      { cmd: "DEL", args: ["p:a", "p:b"] },
      { cmd: "PING", args: [] },
    ];
    const res = await pipeline(instanceId, instanceToken, cmds);
    assertEq(res[2], "1", "GET p:a");
    assertEq(res[3], "2", "GET p:b");
    assertEq(res[6], "2", "GET p:a after INCR");
    assertEq(res[7], "3", "GET p:b after INCR");
    assertEq(res[9], "PONG", "PING in pipeline");
  });

  await test("Pipeline: 1000 SET commands (max batch)", async () => {
    const cmds = Array.from({ length: 1000 }, (_, i) => ({
      cmd: "SET",
      args: [`bulk:${i}`, `val-${i}`],
    }));
    const t0 = Date.now();
    const res = await pipeline(instanceId, instanceToken, cmds);
    const ms = Date.now() - t0;
    assert(res.length === 1000, `expected 1000 results, got ${res.length}`);
    assert(
      res.every((r) => r === "OK"),
      "all SET results should be OK",
    );
    console.log(
      `    ${DIM}1000 cmds in ${ms}ms (${Math.round(1000000 / ms)} cmd/s)${RESET}`,
    );
  });

  // ==========================================================================
  // 13. LIST KEYS + FLUSH ENDPOINTS
  // ==========================================================================
  section("Keys + Flush Endpoints");

  await test("GET /:id/keys lists keys", async () => {
    const { status, data } = await api(
      "GET",
      `/redis/instances/${instanceId}/keys`,
      undefined,
      instanceToken,
    );
    assertEq(status, 200, "status");
    assert(typeof (data as any)?.count === "number", "count field");
    assert(Array.isArray((data as any)?.keys), "keys array");
  });

  await test("GET /:id/keys?pattern= filters keys", async () => {
    const { data } = await api(
      "GET",
      `/redis/instances/${instanceId}/keys?pattern=bulk:*`,
      undefined,
      instanceToken,
    );
    assert(
      (data as any)?.count === 1000,
      `expected 1000 bulk keys, got ${(data as any)?.count}`,
    );
  });

  await test("POST /:id/flush clears all keys", async () => {
    const { status } = await api(
      "POST",
      `/redis/instances/${instanceId}/flush`,
      {},
      instanceToken,
    );
    assertEq(status, 200, "status");
    assertEq(
      await exec(instanceId, instanceToken, "DBSIZE"),
      0,
      "DBSIZE after flush",
    );
  });

  // ==========================================================================
  // 14. LOAD TESTS
  // ==========================================================================
  section("Load Tests");

  await test("50 concurrent SET requests", async () => {
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        exec(instanceId, instanceToken, "SET", [`load:conc:${i}`, `val-${i}`]),
      ),
    );
    const ms = Date.now() - t0;
    const count = (await exec(instanceId, instanceToken, "DBSIZE")) as number;
    assert(count >= 50, `expected ≥50 keys, got ${count}`);
    console.log(
      `    ${DIM}50 parallel SETs in ${ms}ms (${Math.round(50000 / ms)} req/s)${RESET}`,
    );
  });

  await test("50 concurrent GET requests", async () => {
    const t0 = Date.now();
    const res = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        exec(instanceId, instanceToken, "GET", [`load:conc:${i}`]),
      ),
    );
    const ms = Date.now() - t0;
    assert(
      res.every((v, i) => v === `val-${i}`),
      "all GETs matched",
    );
    console.log(
      `    ${DIM}50 parallel GETs in ${ms}ms (${Math.round(50000 / ms)} req/s)${RESET}`,
    );
  });

  await test("10 × 1000-command pipelines back-to-back (throughput)", async () => {
    const cmds = Array.from({ length: 1000 }, (_, i) => ({
      cmd: "SET",
      args: [`tput:${i}`, `v${i}`],
    }));
    const t0 = Date.now();
    for (let r = 0; r < 10; r++) {
      await pipeline(instanceId, instanceToken, cmds);
    }
    const ms = Date.now() - t0;
    const totalCmds = 10 * 1000;
    console.log(
      `    ${DIM}${totalCmds.toLocaleString()} cmds in ${ms}ms → ${Math.round((totalCmds * 1000) / ms).toLocaleString()} cmd/s${RESET}`,
    );
  });

  await test("100 concurrent mixed read/write requests", async () => {
    const writes = Array.from({ length: 50 }, (_, i) =>
      exec(instanceId, instanceToken, "SET", [`mix:${i}`, `v${i}`]),
    );
    const reads = Array.from({ length: 50 }, (_, i) =>
      exec(instanceId, instanceToken, "GET", [`load:conc:${i}`]),
    );
    const t0 = Date.now();
    const res = await Promise.all([...writes, ...reads]);
    const ms = Date.now() - t0;
    assert(res.length === 100, "100 results");
    console.log(
      `    ${DIM}100 parallel mixed ops in ${ms}ms (${Math.round(100000 / ms)} req/s)${RESET}`,
    );
  });

  await test("500 sequential writes (sustained throughput)", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 500; i++) {
      await exec(instanceId, instanceToken, "SET", [`seq:${i}`, `v${i}`]);
    }
    const ms = Date.now() - t0;
    console.log(
      `    ${DIM}500 sequential SETs in ${ms}ms (${Math.round(500000 / ms)} req/s)${RESET}`,
    );
  });

  // ==========================================================================
  // 15. CLEANUP
  // ==========================================================================
  section("Cleanup");

  await test("DELETE test instance", async () => {
    const { status, data } = await api(
      "DELETE",
      `/redis/instances/${instanceId}`,
      undefined,
      instanceToken,
    );
    assertEq(status, 200, "status");
    assertEq((data as any)?.ok, true, "ok");
  });

  await test("Deleted instance returns 403 on exec", async () => {
    const { status } = await api(
      "POST",
      `/redis/instances/${instanceId}/exec`,
      { cmd: "PING", args: [] },
      instanceToken,
    );
    assert(
      status === 403 || status === 404,
      `expected 403 or 404, got ${status}`,
    );
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  console.log(`\n${"─".repeat(60)}`);
  console.log(
    `${BOLD}Results: ${passed === total ? GREEN : RED}${passed}/${total} passed${RESET}` +
      `  ${DIM}(${totalMs}ms total)${RESET}`,
  );

  if (failed > 0) {
    console.log(`\n${RED}${BOLD}Failed tests:${RESET}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${RED}✗${RESET} ${r.name}`);
      if (r.error) console.log(`    ${DIM}${r.error}${RESET}`);
    }
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}All tests passed.${RESET}\n`);
  }
}

main().catch((err) => {
  console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, err);
  process.exit(1);
});
