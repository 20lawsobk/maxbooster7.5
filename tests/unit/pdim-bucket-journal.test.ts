import { describe, expect, it } from "vitest";
import { PdimBucketJournal, type PdimObjectStore } from "../../server/lib/pdimBucketJournal";
import { readBucketSnapshot, writeBucketSnapshot, verifyBucketSnapshot } from "../../server/lib/pdimBucketSnapshot";

class Objects implements PdimObjectStore {
  data = new Map<string, { bytes: Buffer; generation: string }>();
  counter = 0;
  failHead = false;
  loseReply = false;
  readDelayMs = 0;
  delayPhase?: string;
  readHook?: (key: string, context?: import("../../server/lib/pdimBucketJournal").PdimReadContext) => Promise<void>;
  async read(
    key: string,
    context?: import("../../server/lib/pdimBucketJournal").PdimReadContext,
  ) {
    if (this.readDelayMs && context?.phase && (!this.delayPhase || context.phase === this.delayPhase)) {
      await new Promise(resolve => setTimeout(resolve, this.readDelayMs));
    }
    await this.readHook?.(key, context);
    return this.data.get(key) ?? null;
  }
  async write(key: string, bytes: Buffer, expected: string | 0) {
    if (this.failHead && key.endsWith("/HEAD")) throw new Error("unavailable");
    const actual = this.data.get(key)?.generation ?? 0;
    if (actual !== expected) throw new Error("generation precondition");
    const generation = String(++this.counter);
    this.data.set(key, { bytes: Buffer.from(bytes), generation });
    if (this.loseReply && key.endsWith("/HEAD")) throw new Error("reply lost after commit");
    return generation;
  }
}
const valid = (v: unknown): v is { n: number } =>
  !!v && typeof v === "object" && Number.isInteger((v as { n?: unknown }).n);
async function fixture() {
  const objects = new Objects();
  let now = 1000;
  const make = () => new PdimBucketJournal(objects, "isolated-test", valid, () => now, 1000);
  const journal = make();
  const root = await journal.putImmutable(Buffer.from("snapshot"));
  await journal.initialize(root);
  await journal.acquire();
  return { objects, journal, make, advance: () => { now += 1001; } };
}

describe("bucket PDIM durability", () => {
  it("revalidates an unchanged expired lease without allowing takeover over a successor", async () => {
    const { journal, make, advance } = await fixture();
    advance();
    await journal.renew();
    await expect(make().acquire()).rejects.toThrow("Another process");
    advance();
    const successor = make();
    await successor.acquire();
    await expect(journal.renew()).rejects.toThrow("renewal failed");
    await expect(journal.append({ n: 3 })).rejects.toThrow();
    await successor.append({ n: 4 });
    expect((await successor.recover()).transactions).toEqual([{ n: 4 }]);
  });
  it("refuses missing bucket state instead of creating an empty database", async () => {
    await expect(new PdimBucketJournal(new Objects(), "test", valid).acquire()).rejects.toThrow("migration");
  });
  it("recovers acknowledged transactions without filesystem data", async () => {
    const { journal, make } = await fixture();
    await journal.append({ n: 1 });
    await journal.append({ n: 2 });
    await journal.release();
    const restored = make();
    await restored.acquire();
    expect((await restored.recover()).transactions).toEqual([{ n: 1 }, { n: 2 }]);
  });
  it("replays 133 journal records and records a bounded timing result for every read", async () => {
    const { journal } = await fixture();
    for (let n = 1; n <= 133; n += 1) await journal.append({ n });

    const reads: Array<{
      phase: string; sequence?: number; elapsedMs: number; outcome: string;
    }> = [];
    const recovered = await journal.recover(undefined, {
      timeoutMs: 10_000,
      onRead: event => reads.push(event),
    });

    expect(recovered.transactions).toHaveLength(133);
    expect(recovered.transactions[0]).toEqual({ n: 1 });
    expect(recovered.transactions[132]).toEqual({ n: 133 });
    expect(reads.filter(event => event.phase === "journal_frame")).toHaveLength(133);
    expect(new Set(reads.filter(event => event.phase === "journal_frame")
      .map(event => event.sequence))).toEqual(new Set(Array.from({ length: 133 }, (_, i) => i + 1)));
    expect(reads.every(event => Number.isSafeInteger(event.elapsedMs) && event.elapsedMs >= 0)).toBe(true);
    expect(reads.every(event => Number.isSafeInteger(event.byteLength) && event.byteLength! > 0)).toBe(true);
    expect(reads.every(event => event.outcome === "ok")).toBe(true);
  });
  it("times out a stalled journal read without changing committed frames and recovers after release", async () => {
    const { journal, objects, make } = await fixture();
    await journal.append({ n: 1 });
    const immutableBefore = [...objects.data.entries()]
      .filter(([key]) => key.includes("/objects/"))
      .map(([key, value]) => [key, Buffer.from(value.bytes), value.generation] as const);
    objects.delayPhase = "journal_frame";
    objects.readDelayMs = 40;
    const reads: Array<{ phase: string; sequence?: number; outcome: string; failureCategory?: string }> = [];

    await expect(journal.recover(undefined, {
      timeoutMs: 8,
      onRead: event => reads.push(event),
    })).rejects.toMatchObject({ code: "PDIM_READ_TIMEOUT" });
    expect(reads).toContainEqual(expect.objectContaining({
      phase: "journal_frame", sequence: 1, outcome: "timeout", failureCategory: "timeout",
    }));

    objects.readDelayMs = 0;
    await new Promise(resolve => setTimeout(resolve, 45));
    await journal.release();
    const restored = make();
    await restored.acquire();
    expect((await restored.recover()).transactions).toEqual([{ n: 1 }]);
    expect([...objects.data.entries()]
      .filter(([key]) => key.includes("/objects/"))
      .map(([key, value]) => [key, value.bytes, value.generation]))
      .toEqual(immutableBefore);
  });
  it("aborts recovery if the lease is lost while a journal frame is being read", async () => {
    const { journal, objects, advance } = await fixture();
    await journal.append({ n: 1 });
    let started!: () => void;
    let release!: () => void;
    const startedRead = new Promise<void>(resolve => { started = resolve; });
    const gatedRead = new Promise<void>(resolve => { release = resolve; });
    objects.readHook = async (_key, context) => {
      if (context?.phase === "journal_frame") {
        started();
        await gatedRead;
      }
    };

    const recovery = journal.recover(undefined, { timeoutMs: 1_000 });
    await startedRead;
    advance();
    release();
    await expect(recovery).rejects.toThrow("ownership unavailable");
  });
  it("rejects concurrent owners and fences an expired owner", async () => {
    const { journal, make, advance } = await fixture();
    await expect(make().acquire()).rejects.toThrow("Another process");
    advance();
    const successor = make();
    await successor.acquire();
    await expect(journal.append({ n: 1 })).rejects.toThrow("expired");
    await successor.append({ n: 2 });
    expect((await successor.recover()).transactions).toEqual([{ n: 2 }]);
  });
  it("does not acknowledge uploaded data when the commit pointer fails", async () => {
    const { journal, objects, make, advance } = await fixture();
    objects.failHead = true;
    await expect(journal.append({ n: 1 })).rejects.toThrow("write failed");
    objects.failHead = false;
    advance();
    const restored = make();
    await restored.acquire();
    expect((await restored.recover()).transactions).toEqual([]);
    await expect(journal.append({ n: 2 })).rejects.toThrow("write failed");
  });
  it("reconciles a lost commit reply by exact readback, without duplicating a transaction", async () => {
    const { journal, objects } = await fixture();
    objects.loseReply = true;
    expect(await journal.append({ n: 1 })).toBe(1);
    expect((await journal.recover()).transactions).toEqual([{ n: 1 }]);
  });
  it("detects corrupted immutable objects on recovery", async () => {
    const { journal, objects } = await fixture();
    await journal.append({ n: 1 });
    const head = JSON.parse(objects.data.get("isolated-test/HEAD")!.bytes.toString());
    objects.data.get(`isolated-test/objects/${head.tip}`)!.bytes = Buffer.from("{}");
    await expect(journal.recover()).rejects.toMatchObject({
      code: "PDIM_STORAGE_READ_FAILURE", category: "integrity",
    });
  });
  it("retains post-checkpoint writes and rejects an unrelated checkpoint", async () => {
    const { journal } = await fixture();
    await journal.append({ n: 1 });
    const position = journal.checkpointPosition();
    const snapshot = await journal.putImmutable(Buffer.from("snapshot including 1"));
    await journal.append({ n: 2 });
    await expect(journal.checkpoint(snapshot, { sequence: 1, tip: "f".repeat(64) }))
      .rejects.toThrow("ancestor");
    await journal.checkpoint(snapshot, position);
    const restored = await journal.recover();
    expect(restored.snapshot.toString()).toBe("snapshot including 1");
    expect(restored.transactions).toEqual([{ n: 2 }]);
  });
  it("fails closed after a failed lease renewal", async () => {
    const { journal, objects } = await fixture();
    objects.failHead = true;
    await expect(journal.renew()).rejects.toThrow("renewal failed");
    expect(() => journal.assertOwned()).toThrow("renewal failed");
  });
  it("chunks snapshots without local files and preserves sequence watermarks", async () => {
    const { journal } = await fixture();
    const entries = new Map([["first", "é".repeat(50)], ["second", "second-value"]]);
    const id = await writeBucketSnapshot(journal, entries, 25, 12, 30);
    const restored = await readBucketSnapshot(journal, await journal.readImmutable(id),
      (_key, value) => {
        if (typeof value !== "string") throw new Error("Wrong entry type");
        return value;
      });
    expect(restored.entries).toEqual(entries);
    expect(restored.redisSequence).toBe(25);
    expect(restored.capsuleSequence).toBe(12);
    await verifyBucketSnapshot(journal, id, entries, 25, 12);
    await expect(verifyBucketSnapshot(journal, id,
      new Map([["first", "changed"], ["second", "second-value"]]), 25, 12)).rejects.toThrow("entry mismatch");
  });
  it("reads independent snapshot shards with a bounded eight-request window", async () => {
    const chunkIds = Array.from({ length: 19 }, (_, index) => String(index).padStart(64, "0"));
    const manifest = Buffer.from(JSON.stringify({
      format: "pdim-bucket-snapshot-v1",
      redisSequence: 0,
      capsuleSequence: 0,
      count: chunkIds.length,
      chunks: chunkIds,
    }));
    let active = 0;
    let maximumActive = 0;
    const objects = {
      async putImmutable() {
        throw new Error("Snapshot reads must not write objects");
      },
      async readImmutable(id: string) {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 8));
        active--;
        return Buffer.from(JSON.stringify([[id, id]]));
      },
    };

    const restored = await readBucketSnapshot(objects, manifest, (_key, value) => {
      if (typeof value !== "string") throw new Error("Invalid shard fixture");
      return value;
    });

    expect(maximumActive).toBe(8);
    expect([...restored.entries.keys()]).toEqual(chunkIds);
    expect(restored.entries.size).toBe(chunkIds.length);
  });
  it("rejects a missing snapshot shard instead of restoring partial state", async () => {
    const { journal, objects } = await fixture();
    const id = await writeBucketSnapshot(journal, [["key", "value"]], 0, 0);
    const bytes = await journal.readImmutable(id);
    const manifest = JSON.parse(bytes.toString());
    objects.data.delete(`isolated-test/objects/${manifest.chunks[0]}`);
    await expect(readBucketSnapshot(journal, bytes, (_key, value) => value)).rejects.toMatchObject({
      code: "PDIM_STORAGE_READ_FAILURE", category: "missing",
    });
  });
  it("bounds snapshot-shard reads and reports the failed shard ordinal", async () => {
    const { journal, objects } = await fixture();
    const id = await writeBucketSnapshot(journal, [["key", "value"]], 0, 0);
    const manifest = await journal.readImmutable(id);
    objects.delayPhase = "snapshot_shard";
    objects.readDelayMs = 40;
    const reads: Array<{ phase: string; ordinal?: number; outcome: string }> = [];

    await expect(readBucketSnapshot(journal, manifest, (_key, value) => value, undefined, {
      timeoutMs: 8,
      onRead: event => reads.push(event),
    })).rejects.toMatchObject({ code: "PDIM_READ_TIMEOUT" });
    expect(reads).toContainEqual(expect.objectContaining({
      phase: "snapshot_shard", ordinal: 1, outcome: "timeout",
    }));
  });
});
