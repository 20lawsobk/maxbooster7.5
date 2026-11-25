import { describe, expect, it } from "vitest";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store";
import { orderedBucketRecovery } from "../../server/lib/pdimBucketRecovery";
import type { RedisEntry } from "../../external/pdim/artifacts/api-server/src/redis/types";

describe("canonical bucket recovery ordering", () => {
  it("replays interleaved capsule and Redis writes without renumbering live writes", async () => {
    const replay = orderedBucketRecovery([
      { kind: "redis", records: [{ s: 21, c: "SET", a: ["shared", "redis-first"] }] },
      { kind: "capsule", sequence: 4, changes: { shared: "capsule-after", content: "preserved" } },
      { kind: "redis", records: [{ s: 22, c: "SET", a: ["shared", "redis-last"] }] },
    ], 20, 3);
    const entries = new Map<string, RedisEntry>();
    const store = new RedisStore("isolated-bucket-replay", "test only");
    try {
      store.attachEmbeddedSnapshot(entries, { baselineSequence: 20, recoveryRecords: replay.records });
      store.attachEmbeddedSnapshot(entries, { baselineSequence: replay.redisSequence });
      expect(await store.exec("GET", ["shared"])).toBe("redis-last");
      expect(await store.exec("GET", ["content"])).toBe("preserved");
      expect(store.getEmbeddedAofSequence()).toBe(22);
      await store.exec("SET", ["next", "write"]);
      expect(store.getEmbeddedAofSequence()).toBe(23);
      expect(replay.capsuleSequence).toBe(4);
    } finally { store.closeEmbedded(); }
  });
  it("rejects missing records in either durable sequence", () => {
    expect(() => orderedBucketRecovery([
      { kind: "redis", records: [{ s: 2, c: "SET", a: ["x", "y"] }] },
    ], 0, 0)).toThrow("Redis sequence");
    expect(() => orderedBucketRecovery([
      { kind: "capsule", sequence: 2, changes: { x: "y" } },
    ], 0, 0)).toThrow("capsule sequence");
  });
});
