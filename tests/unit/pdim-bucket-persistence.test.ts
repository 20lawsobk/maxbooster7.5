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
      await owner.checkpoint();
      const immutableObjects = [...data.keys()].filter(key => key.includes("/objects/")).length;
      await owner.close();
      expect([...data.keys()].filter(key => key.includes("/objects/")).length).toBe(immutableObjects);
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

  it("fails startup on a stalled replay read, preserves frames, and succeeds after storage recovers", async () => {
    let generation = 0;
    const data = new Map<string, { bytes: Buffer; generation: string }>();
    let delayJournalReads = false;
    const objects: PdimObjectStore = {
      async read(key, context) {
        if (delayJournalReads && context?.phase === "journal_frame") {
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        return data.get(key) ?? null;
      },
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
    const ownerEngine = new RedisStore("bucket-owner-seed", "fixture");
    const owner = new PdimBucketPersistence(objects, "owner-recovery-test", ownerEngine, new Map(), validate);
    await owner.initialize([], 0, 0);
    await owner.open();
    await ownerEngine.exec("SET", ["durable-key", "durable-value"]);
    await owner.close();
    ownerEngine.closeEmbedded();
    const immutableBefore = [...data.entries()]
      .filter(([key]) => key.includes("/objects/"))
      .map(([key, object]) => [key, Buffer.from(object.bytes), object.generation] as const);

    const failedEngine = new RedisStore("bucket-owner-timeout", "fixture");
    const stages: string[] = [];
    const failed = new PdimBucketPersistence(
      objects, "owner-recovery-test", failedEngine, new Map(), validate,
      stage => stages.push(stage), 8,
    );
    delayJournalReads = true;
    try {
      await expect(failed.open()).rejects.toMatchObject({ code: "PDIM_READ_TIMEOUT" });
      expect(stages.some(stage =>
        stage.includes("phase=journal_frame") &&
        stage.includes("sequence=1") &&
        stage.includes("outcome=timeout") &&
        stage.includes("category=timeout"),
      )).toBe(true);
      expect(stages.some(stage => stage.includes("recovery-failed") && stage.includes("category=timeout"))).toBe(true);
    } finally {
      failedEngine.closeEmbedded();
    }

    delayJournalReads = false;
    await new Promise(resolve => setTimeout(resolve, 45));
    await failed.journal.release();
    expect([...data.entries()]
      .filter(([key]) => key.includes("/objects/"))
      .map(([key, object]) => [key, object.bytes, object.generation]))
      .toEqual(immutableBefore);

    const restoredEngine = new RedisStore("bucket-owner-after-timeout", "fixture");
    const restored = new PdimBucketPersistence(
      objects, "owner-recovery-test", restoredEngine, new Map(), validate,
    );
    try {
      await restored.open();
      expect(await restoredEngine.exec("GET", ["durable-key"])).toBe("durable-value");
      await restored.close();
    } finally {
      restoredEngine.closeEmbedded();
    }
  });
});
