import { afterEach, describe, expect, it, vi } from "vitest";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { RedisEntry } from "../../external/pdim/artifacts/api-server/src/redis/types.js";
import { Rebalancer } from "../../server/pocket-dimension/fabric/control/Rebalancer.js";
import { AutoClusterManager, DEFAULT_RULES } from "../../server/pocket-dimension/fabric/control/AutoClusterManager.js";

const stores: RedisStore[] = [];
function owner(entries = new Map<string, RedisEntry>()) {
  const store = new RedisStore("test", "test");
  store.attachEmbeddedSnapshot(entries);
  stores.push(store);
  return store;
}
afterEach(() => stores.splice(0).forEach((store) => store.closeEmbedded()));

describe("canonical local PDIM owner", () => {
  it("uses shared recovered state and executes actual Lua rather than script-pattern stubs", async () => {
    const entries = new Map<string, RedisEntry>([["checkpoint", { type: "string", value: "17" }]]);
    const store = owner(entries);
    const sha = await store.exec("SCRIPT", ["LOAD", "return redis.call('INCRBY', KEYS[1], ARGV[1])"]);
    expect(await store.exec("EVALSHA", [String(sha), "1", "checkpoint", "2"])).toBe(19);
    expect(entries.get("checkpoint")?.value).toBe("19");
    expect(await store.exec("EVAL", [
      "return cmsgpack.unpack(cmsgpack.pack({ARGV[1],42}))[1]", "0", "payload",
    ])).toBe("payload");
  });

  it("provides Redis TIME to Lua scripts that fence canonical publications", async () => {
    const store = owner();
    const before = Date.now() / 1000;
    const direct = await store.exec("TIME", []);
    if (!Array.isArray(direct)) throw new Error("TIME must return a two-element array");
    expect(direct).toHaveLength(2);
    expect(Number(direct[0])).toBeGreaterThanOrEqual(Math.floor(before));
    expect(Number(direct[0])).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    expect(Number(direct[1])).toBeGreaterThanOrEqual(0);
    expect(Number(direct[1])).toBeLessThan(1_000_000);

    const luaTime = await store.exec("EVAL", ["return redis.call('TIME')", "0"]);
    if (!Array.isArray(luaTime)) throw new Error("Lua TIME must return a two-element array");
    expect(luaTime).toHaveLength(2);
    expect(Number(luaTime[0])).toBeGreaterThanOrEqual(Math.floor(before));
    expect(Number(luaTime[0])).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    expect(Number(luaTime[1])).toBeGreaterThanOrEqual(0);
    expect(Number(luaTime[1])).toBeLessThan(1_000_000);
  });

  it("publishes exact and Redis-glob pattern messages from direct and Lua commands", async () => {
    const store = owner();
    const deliveries: Array<Record<string, unknown>> = [];
    store.subscribePubSub(
      ["alerts:critical"],
      ["alerts:[a-c]?", "literal\\*"],
      (event) => deliveries.push(event),
      () => {},
    );

    expect(await store.exec("PUBLISH", ["alerts:critical", "direct"])).toBe(1);
    expect(deliveries).toEqual([
      { type: "message", channel: "alerts:critical", message: "direct" },
    ]);

    expect(await store.exec("PUBLISH", ["alerts:b1", "range"])).toBe(1);
    expect(deliveries.at(-1)).toEqual({
      type: "pmessage",
      pattern: "alerts:[a-c]?",
      channel: "alerts:b1",
      message: "range",
    });
    const beforeNonMatch = deliveries.length;
    expect(await store.exec("PUBLISH", ["alerts:d1", "non-match"])).toBe(0);
    expect(deliveries).toHaveLength(beforeNonMatch);

    expect(await store.exec("EVAL", [
      "return redis.call('PUBLISH', KEYS[1], ARGV[1])",
      "1",
      "literal*",
      "from-lua",
    ])).toBe(1);
    expect(deliveries.at(-1)).toEqual({
      type: "pmessage",
      pattern: "literal\\*",
      channel: "literal*",
      message: "from-lua",
    });
  });

  it("blocks until another client supplies a list item and times out honestly", async () => {
    const store = owner();
    const blocked = store.exec("BLPOP", ["jobs", "1"]);
    await store.exec("RPUSH", ["jobs", "job-1"]);
    expect(await blocked).toEqual(["jobs", "job-1"]);
    expect(await store.exec("BLPOP", ["jobs", "0.01"])).toBeNull();
  });

  it("preserves stream groups and pending delivery through owner snapshots", async () => {
    const entries = new Map<string, RedisEntry>();
    const store = owner(entries);
    await store.exec("XGROUP", ["CREATE", "jobs", "workers", "0", "MKSTREAM"]);
    const id = await store.exec("XADD", ["jobs", "*", "payload", "work"]);
    expect(await store.exec("XREADGROUP", ["GROUP", "workers", "one", "STREAMS", "jobs", ">"]))
      .toEqual([["jobs", [[id, ["payload", "work"]]]]]);
    const restored = owner(new Map(JSON.parse(JSON.stringify([...entries]))));
    expect(await restored.exec("XREADGROUP", ["GROUP", "workers", "two", "STREAMS", "jobs", ">"])).toBeNull();
    expect(await restored.exec("XACK", ["jobs", "workers", String(id)])).toBe(1);
  });
});

describe("PocketFabric consumer wiring", () => {
  it("retains the actual constructor dependencies and coalesces overlapping evaluations", async () => {
    const registry = { listAllNodes: vi.fn(async () => []) };
    const chunks = {};
    const placement = {};
    const factory = vi.fn();
    const manager = new AutoClusterManager(registry as any, chunks as any, placement as any, factory, vi.fn(),
      { ...DEFAULT_RULES, minNodes: 0 });
    expect((manager as any).rebalancer.chunkIndex).toBe(chunks);
    expect((manager as any).rebalancer.placement).toBe(placement);
    expect((manager as any).rebalancer.chunkStoreFactory).toBe(factory);
    await Promise.all([manager.evaluate(), manager.evaluate()]);
    expect(registry.listAllNodes).toHaveBeenCalledTimes(1);
    expect(DEFAULT_RULES.maxNodes).toBe(Infinity);
  });

  it("does not retire or remove a source when drain verification fails", async () => {
    const source = { getChunk: vi.fn(async () => Buffer.from("source")), deleteChunk: vi.fn() };
    const target = { putChunk: vi.fn(), getChunk: vi.fn(async () => Buffer.from("corrupt")) };
    const location = { id: "chunk", nodeIds: ["source"], sizeBytes: 6 };
    const registry = { listHealthyNodes: async () => [{ id: "target", capacityBytes: 100, usedBytes: 0 }] };
    const chunks = { getChunksByNode: async () => [location], getChunkLocation: async () => location, putChunkLocation: vi.fn() };
    const rebalancer = new Rebalancer(registry as any, chunks as any, {} as any,
      (id) => (id === "source" ? source : target) as any);
    expect(await rebalancer.drainNode("source")).toEqual({ moved: 0, errors: 1 });
    expect(source.deleteChunk).not.toHaveBeenCalled();
    expect(chunks.putChunkLocation).not.toHaveBeenCalled();
  });
});