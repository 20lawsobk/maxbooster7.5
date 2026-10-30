import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { RedisEntry } from "../../external/pdim/artifacts/api-server/src/redis/types.js";
import { LocalPdimCapsules } from "../../server/lib/localPdimCapsules.js";
import { decodeContainer, isContainer } from "../../server/pocket-dimension/fabric/compression/ContainerFormat.js";

describe("local exec recursive compute capsules", () => {
  it("awaits asynchronous durable publication and rolls back rejected commits", async () => {
    const store = new RedisStore("local", "async-capsule-commit");
    store.attachEmbeddedSnapshot(new Map());
    let entered!: () => void;
    let rejectCommit!: (error: Error) => void;
    const committing = new Promise<void>((resolve) => { entered = resolve; });
    const commit = new Promise<void>((_, reject) => { rejectCommit = reject; });
    const capsules = new LocalPdimCapsules(store, () => {
      entered();
      return commit;
    });
    try {
      let acknowledged = false;
      const write = capsules.exec("CAPSULE.SET", ["pending-state", "state"]);
      void write.then(() => { acknowledged = true; }, () => {});
      await committing;
      expect(acknowledged).toBe(false);
      // Unrelated canonical reads remain available during durable IO.
      expect(await store.exec("GET", ["unrelated-key"])).toBeNull();
      rejectCommit(new Error("async disk failure"));
      await expect(write).rejects.toThrow("async disk failure");
      expect(await capsules.exec("CAPSULE.GET", ["pending-state"])).toBeNull();
    } finally { store.closeEmbedded(); }
  });

  it("stores real VRAM/KV bytes in nested compressed PDCF chunks and restores from a snapshot alone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdim-compute-state-"));
    const entries = new Map<string, RedisEntry>();
    const store = new RedisStore("local", "capsule-test");
    store.attachEmbeddedSnapshot(entries);
    let checkpoint = "";
    const capsules = new LocalPdimCapsules(store, (_changes, publish) => {
      publish();
      checkpoint = JSON.stringify(Object.fromEntries(entries));
    });
    const tensor = new Float32Array(65_536);
    for (let i = 0; i < tensor.length; i++) tensor[i] = (i % 64) / 8;
    const originalBytes = Buffer.from(tensor.buffer);
    const payload = JSON.stringify({
      dtype: "float32", shape: [256, 256], vram: originalBytes.toString("base64"),
      kv: { position: 128, keys: originalBytes.subarray(0, 4096).toString("base64") },
    });
    let restoredStore: RedisStore | undefined;
    try {
      expect(await capsules.exec("CAPSULE.SET", ["gpu-life/request-17/state", payload])).toBe("OK");
      const chunks = [...entries].filter(([key]) => key.startsWith("pdim:chunk:local-compute-capsules/gpu-state/"));
      expect(chunks.length).toBeGreaterThan(0);
      for (const [, entry] of chunks) {
        expect(entry.type).toBe("string");
        const physicalBytes = Buffer.from(String(entry.value), "base64");
        expect(isContainer(physicalBytes)).toBe(true);
        const { header } = decodeContainer(physicalBytes);
        expect(header.originalBytes).toBeGreaterThan(0);
        expect(header.codec).not.toBe("store"); // this tensor is actually compressed
        expect(physicalBytes.length).toBeLessThan(header.originalBytes);
      }
      const childMetadata = [...entries].find(([key]) =>
        /^pdim:meta:local-compute-capsules\/gpu-state\/[a-f0-9]{2}:metadata$/.test(key));
      expect(JSON.parse(String(childMetadata?.[1].value)).parentDimension)
        .toBe("local-compute-capsules/gpu-state");
      expect([...entries.values()].some((entry) => entry.value === payload)).toBe(false);

      // Persist only the owner's snapshot, discard the original engine, then
      // use newly opened PocketDimensions: no payload cache can satisfy GET.
      await writeFile(join(directory, "local-pdim-store.json"), checkpoint);
      store.closeEmbedded();
      restoredStore = new RedisStore("local", "restored-capsule-test");
      const recovered = JSON.parse(await readFile(join(directory, "local-pdim-store.json"), "utf8")) as Record<string, RedisEntry>;
      restoredStore.attachEmbeddedSnapshot(new Map(Object.entries(recovered)));
      const restoredCapsules = new LocalPdimCapsules(restoredStore, () => {});
      const restored = await restoredCapsules.exec("CAPSULE.GET", ["gpu-life/request-17/state"]);
      expect(restored).toBe(payload);
      const state = JSON.parse(String(restored));
      expect(Buffer.from(state.vram, "base64").equals(originalBytes)).toBe(true);
      expect(Buffer.from(state.kv.keys, "base64").equals(originalBytes.subarray(0, 4096))).toBe(true);
    } finally {
      store.closeEmbedded();
      restoredStore?.closeEmbedded();
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("preserves legacy raw snapshots and rejects a failed commit", async () => {
    const entries = new Map<string, RedisEntry>([["legacy-gpu-state", { type: "string", value: "old-state" }]]);
    const store = new RedisStore("local", "legacy");
    store.attachEmbeddedSnapshot(entries);
    try {
      const capsules = new LocalPdimCapsules(store, () => { throw new Error("disk unavailable"); });
      expect(await capsules.exec("CAPSULE.GET", ["legacy-gpu-state"])).toBe("old-state");
      await expect(capsules.exec("CAPSULE.SET", ["legacy-gpu-state", "new-state"])).rejects.toThrow("disk unavailable");
      expect(await capsules.exec("CAPSULE.GET", ["legacy-gpu-state"])).toBe("old-state");
      expect(entries.get("legacy-gpu-state")?.value).toBe("old-state");
    } finally { store.closeEmbedded(); }
  });
});