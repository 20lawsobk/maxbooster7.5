import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { mkdtemp, readFile, rm, appendFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { RedisEntry } from "../../external/pdim/artifacts/api-server/src/redis/types.js";
import { LocalPdimCapsules } from "../../server/lib/localPdimCapsules.js";
import { LocalPdimCapsuleJournal } from "../../server/lib/localPdimCapsuleJournal.js";

describe("durable capsule delta journal", () => {
  it("streams multi-chunk UTF-8 records through recovery and compaction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capsule-chunk-journal-"));
    const file = join(directory, "capsules.jsonl");
    try {
      const journal = new LocalPdimCapsuleJournal(file);
      const large = "音".repeat(800_000);
      await journal.commit({ first: large }, () => {});
      await journal.commit({ second: large }, () => {});
      const seen: string[] = [];
      new LocalPdimCapsuleJournal(file).recover(0, changes => {
        seen.push(...Object.keys(changes));
        expect(Object.values(changes)[0]).toBe(large);
      });
      expect(seen).toEqual(["first", "second"]);
      await journal.compact(1);
      const compacted: string[] = [];
      new LocalPdimCapsuleJournal(file).recover(1, changes => compacted.push(...Object.keys(changes)));
      expect(compacted).toEqual(["second"]);
      await appendFile(file, '{"body":"{}", "sha256":"bad"}\n');
      const apply = vi.fn();
      expect(() => new LocalPdimCapsuleJournal(file).recover(1, apply)).toThrow(/checksum/);
      expect(apply).not.toHaveBeenCalled();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("reconstructs real compressed operations, compacts at a snapshot boundary and ignores a torn tail", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capsule-journal-"));
    const file = join(directory, "capsules.jsonl");
    const entries = new Map<string, RedisEntry>([["unrelated", { type: "string", value: "x".repeat(2_000_000) }]]);
    const owner = new RedisStore("local", "journal-owner");
    const recovered = new RedisStore("local", "journal-recovered");
    owner.attachEmbeddedSnapshot(entries);
    const journal = new LocalPdimCapsuleJournal(file);
    const capsules = new LocalPdimCapsules(owner, (changes, publish) => journal.commit(changes, publish));
    try {
      await capsules.exec("CAPSULE.SET", ["gpu/a", "float32-kv-state".repeat(2000)]);
      await capsules.exec("CAPSULE.SET", ["gpu/b", "second-state"]);
      expect((await stat(file)).size).toBeLessThan(200_000);
      expect(await readFile(file, "utf8")).not.toContain('"unrelated"');
      const snapshot = JSON.parse(JSON.stringify(Object.fromEntries(entries)));
      const baseline = journal.publishedSeq;
      await capsules.exec("CAPSULE.DEL", ["gpu/a"]);
      await capsules.exec("CAPSULE.SET", ["gpu/b", "updated-state"]);
      await journal.compact(baseline);
      await appendFile(file, '{"incomplete":');
      recovered.attachEmbeddedSnapshot(new Map(Object.entries(snapshot)));
      const restored = new LocalPdimCapsuleJournal(file);
      restored.recover(baseline, changes => recovered.publishEmbeddedStrings(changes));
      const read = new LocalPdimCapsules(recovered, (changes, publish) => restored.commit(changes, publish));
      expect(await read.exec("CAPSULE.GET", ["gpu/a"])).toBeNull();
      expect(await read.exec("CAPSULE.GET", ["gpu/b"])).toBe("updated-state");
      expect(await recovered.exec("GET", ["unrelated"])).toBe("x".repeat(2_000_000));
      await read.exec("CAPSULE.SET", ["gpu/c", "after-recovery"]);
      expect(restored.publishedSeq).toBe(5);
    } finally {
      owner.closeEmbedded(); recovered.closeEmbedded();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not publish failed fsync transactions and removes their bytes before subsequent commits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capsule-journal-failure-"));
    const file = join(directory, "capsules.jsonl");
    const owner = new RedisStore("local", "failed-journal");
    const entries = new Map<string, RedisEntry>();
    owner.attachEmbeddedSnapshot(entries);
    const journal = new LocalPdimCapsuleJournal(file);
    const capsules = new LocalPdimCapsules(owner, (changes, publish) => journal.commit(changes, publish));
    const open = fs.promises.open.bind(fs.promises);
    try {
      await capsules.exec("CAPSULE.SET", ["state", "old"]);
      const before = JSON.stringify(Object.fromEntries(entries));
      let failed = false;
      const spy = vi.spyOn(fs.promises, "open").mockImplementation(async (...args) => {
        const handle = await open(...args);
        if (String(args[0]) === file && !failed) {
          const sync = handle.sync.bind(handle);
          handle.sync = async () => {
            if (!failed) { failed = true; throw new Error("injected fsync failure"); }
            await sync();
          };
        }
        return handle;
      });
      await expect(capsules.exec("CAPSULE.SET", ["state", "uncommitted"])).rejects.toThrow("injected fsync failure");
      spy.mockRestore();
      expect(JSON.stringify(Object.fromEntries(entries))).toBe(before);
      expect(await capsules.exec("CAPSULE.GET", ["state"])).toBe("old");
      await capsules.exec("CAPSULE.SET", ["state", "new"]);
      const replay = new Map<string, string>();
      new LocalPdimCapsuleJournal(file).recover(0, changes => {
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) replay.delete(key); else replay.set(key, value);
        }
      });
      expect([...replay.values()].some(value => value.includes("uncommitted"))).toBe(false);
      const reconstructed = new RedisStore("local", "journal-only-reconstruction");
      reconstructed.attachEmbeddedSnapshot(new Map([...replay].map(([key, value]) =>
        [key, { type: "string", value } as RedisEntry])));
      try {
        const state = new LocalPdimCapsules(reconstructed, () => {});
        expect(await state.exec("CAPSULE.GET", ["state"])).toBe("new");
      } finally { reconstructed.closeEmbedded(); }
      expect(journal.publishedSeq).toBe(2);
    } finally {
      vi.restoreAllMocks(); owner.closeEmbedded();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects complete corrupt records instead of silently discarding acknowledged state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "capsule-corrupt-journal-"));
    try {
      const file = join(directory, "capsules.jsonl");
      await appendFile(file, '{"body":"{}", "sha256":"invalid"}\n');
      expect(() => new LocalPdimCapsuleJournal(file).recover(0, () => {}))
        .toThrow("checksum mismatch");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});