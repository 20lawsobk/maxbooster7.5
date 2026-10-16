import { describe, expect, it } from "vitest";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store";
import type { RedisEntry } from "../../external/pdim/artifacts/api-server/src/redis/types";
import { PdimBucketPersistence } from "../../server/lib/pdimBucketPersistence";
import type { PdimObjectStore } from "../../server/lib/pdimBucketJournal";

describe("bucket PDIM owner lifecycle", () => {
  it("checkpoints and restores actual canonical commands and capsule publications without disk", async () => {
    let generation = 0;
    const data = new Map<string, { bytes: Buffer; generation: string }>();
    const objects: PdimObjectStore = {
      async read(key) { return data.get(key) ?? null; },
      async write(key, bytes, expected) {
        if ((data.get(key)?.generation ?? 0) !== expected) throw new Error("precondition");
        const result = String(++generation);
        data.set(key, { bytes: Buffer.from(bytes), generation: result });
        return result;
      },
    };
    const validate = (_key: string, value: unknown) => {
      if (!value || typeof value !== "object" || !("type" in value)) throw new Error("invalid entry");
      return value as RedisEntry;
    };
    const entries = new Map<string, RedisEntry>();
    const engine = new RedisStore("bucket-owner-fixture", "fixture");
    const owner = new PdimBucketPersistence(objects, "owner-test", engine, entries, validate);
    const restoredEngine = new RedisStore("bucket-restored-fixture", "fixture");
    const restoredEntries = new Map<string, RedisEntry>();
    const restored = new PdimBucketPersistence(objects, "owner-test", restoredEngine, restoredEntries, validate);
    try {
      await owner.initialize([], 0, 0);
      await owner.open();
      await engine.exec("SET", ["counter", "10"]);
      await engine.exec("INCR", ["counter"]);
      await owner.commitCapsule({ content: "actual capsule fixture" },
        () => engine.publishEmbeddedStrings({ content: "actual capsule fixture" }));
      await owner.close();
      engine.closeEmbedded();
      await restored.open();
      expect(await restoredEngine.exec("GET", ["counter"])).toBe("11");
      expect(await restoredEngine.exec("GET", ["content"])).toBe("actual capsule fixture");
      await restoredEngine.exec("INCR", ["counter"]);
      expect(await restoredEngine.exec("GET", ["counter"])).toBe("12");
      await restored.close();
    } finally {
      engine.closeEmbedded();
      restoredEngine.closeEmbedded();
    }
  });
});
