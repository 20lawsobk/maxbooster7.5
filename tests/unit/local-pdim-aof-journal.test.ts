import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { RedisAofRecord, RedisEntry } from "../../external/pdim/artifacts/api-server/src/redis/types.js";
import { LocalPdimAofJournal } from "../../server/lib/localPdimAofJournal.js";

const stores: RedisStore[] = [];
const directories: string[] = [];

function tempJournalPath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-pdim-aof-"));
  directories.push(directory);
  return path.join(directory, "redis.aof.jsonl");
}

function owner(
  journal: LocalPdimAofJournal,
  entries = new Map<string, RedisEntry>(),
  baselineSequence = 0,
): RedisStore {
  const recoveryRecords = journal.recover(baselineSequence);
  const store = new RedisStore("aof-test", "local AOF durability test");
  store.attachEmbeddedSnapshot(entries, {
    baselineSequence,
    recoveryRecords,
    appendAof: (records) => journal.append(records),
  });
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.closeEmbedded();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("local PDIM Redis AOF durability", () => {
  it("recovers acknowledged non-idempotent writes exactly once", async () => {
    const file = tempJournalPath();
    const store = owner(new LocalPdimAofJournal(file));
    await store.exec("SET", ["counter", "10"]);
    await store.exec("INCR", ["counter"]);
    store.closeEmbedded();

    const recovered = owner(new LocalPdimAofJournal(file));
    expect(await recovered.exec("GET", ["counter"])).toBe("11");
  });

  it("creates nested journal directories and reopens the durable frame", async () => {
    const file = path.join(path.dirname(tempJournalPath()), "nested", "deeper", "redis.aof.jsonl");
    const journal = new LocalPdimAofJournal(file);
    journal.recover(0);
    await journal.append([{ s: 1, c: "SET", a: ["key", "value"] }]);

    expect(new LocalPdimAofJournal(file).recover(0)).toEqual([
      { s: 1, c: "SET", a: ["key", "value"] },
    ]);
  });

  it("holds mutation responses until the durable append completes", async () => {
    const store = new RedisStore("aof-ack", "AOF acknowledgement test");
    let releaseAppend: (() => void) | undefined;
    let markAppendStarted: (() => void) | undefined;
    const appendStarted = new Promise<void>((resolve) => {
      markAppendStarted = resolve;
    });
    const appendGate = new Promise<void>((resolve) => {
      releaseAppend = resolve;
    });
    store.attachEmbeddedSnapshot(new Map(), {
      appendAof: async () => {
        markAppendStarted?.();
        await appendGate;
      },
    });
    stores.push(store);

    let acknowledged = false;
    const write = store.exec("SET", ["key", "value"]).then(() => {
      acknowledged = true;
    });
    await appendStarted;
    expect(acknowledged).toBe(false);
    releaseAppend?.();
    await write;
    expect(acknowledged).toBe(true);
  });

  it("does not acknowledge a blocking pop until its removal is durable", async () => {
    const file = tempJournalPath();
    const store = owner(new LocalPdimAofJournal(file));
    await store.exec("RPUSH", ["jobs", "job-1"]);
    await expect(store.exec("BLPOP", ["jobs", "1"])).resolves.toEqual([
      "jobs",
      "job-1",
    ]);
    store.closeEmbedded();

    const recovered = owner(new LocalPdimAofJournal(file));
    expect(await recovered.exec("LLEN", ["jobs"])).toBe(0);
  });

  it("recovers stream IDs and pending consumer-group delivery from state images", async () => {
    const file = tempJournalPath();
    const store = owner(new LocalPdimAofJournal(file));
    await store.exec("XGROUP", ["CREATE", "events", "workers", "0", "MKSTREAM"]);
    const id = await store.exec("XADD", ["events", "*", "payload", "work"]);
    await store.exec("XREADGROUP", [
      "GROUP", "workers", "consumer-a", "STREAMS", "events", ">",
    ]);
    const claim = await store.exec("XAUTOCLAIM", [
      "events", "workers", "consumer-b", "0", "0-0",
    ]);
    expect(claim[1]).toEqual([[String(id), ["payload", "work"]]]);
    store.closeEmbedded();

    const recovered = owner(new LocalPdimAofJournal(file));
    expect(await recovered.exec("XREADGROUP", [
      "GROUP", "workers", "consumer-a", "STREAMS", "events", "0",
    ])).toBeNull();
    expect(await recovered.exec("XREADGROUP", [
      "GROUP", "workers", "consumer-b", "STREAMS", "events", "0",
    ])).toEqual([["events", [[String(id), ["payload", "work"]]]]]);
    expect(await recovered.exec("XACK", ["events", "workers", String(id)])).toBe(1);
  });

  it("replays exact absolute TTL state instead of extending relative TTLs", async () => {
    const file = tempJournalPath();
    const entries = new Map<string, RedisEntry>();
    const store = owner(new LocalPdimAofJournal(file), entries);
    await store.exec("SET", ["temporary", "value", "PX", "60000"]);
    const expiresAt = (entries.get("temporary") as RedisEntry & {
      expiresAt?: number;
    }).expiresAt;
    expect(expiresAt).toBeTypeOf("number");
    store.closeEmbedded();

    const recoveredEntries = new Map<string, RedisEntry>();
    const recovered = owner(
      new LocalPdimAofJournal(file),
      recoveredEntries,
    );
    expect((recoveredEntries.get("temporary") as RedisEntry & {
      expiresAt?: number;
    }).expiresAt).toBe(expiresAt);
    expect(await recovered.exec("GET", ["temporary"])).toBe("value");
  });

  it("journals expiry tombstones so replay cannot resurrect expired keys", async () => {
    const expiryFile = tempJournalPath();
    const expiryStore = owner(new LocalPdimAofJournal(expiryFile));
    const expired = new Promise<void>((resolve) => {
      expiryStore.once("expired", () => resolve());
    });
    await expiryStore.exec("SET", ["temporary", "value", "PX", "100"]);
    await expired;
    expect(await expiryStore.exec("GET", ["temporary"])).toBeNull();
    expiryStore.closeEmbedded();

    const expiredRecords = new LocalPdimAofJournal(expiryFile).recover(0);
    expect(expiredRecords.some((record) => record.c === "__DELETE")).toBe(true);
    const expiredReplay = new RedisStore("expiry-replay", "expiry replay test");
    expiredReplay.attachEmbeddedSnapshot(new Map(), {
      recoveryRecords: expiredRecords,
    });
    stores.push(expiredReplay);
    expect(await expiredReplay.exec("GET", ["temporary"])).toBeNull();
  });

  it("journals LRU tombstones so replay cannot resurrect evicted keys", async () => {
    const previousLimit = process.env.MAX_KEYS_PER_STORE;
    process.env.MAX_KEYS_PER_STORE = "2";
    try {
      const lruFile = tempJournalPath();
      const lruStore = owner(new LocalPdimAofJournal(lruFile));
      await lruStore.exec("SET", ["cold-a", "a"]);
      await lruStore.exec("SET", ["cold-b", "b"]);
      await lruStore.exec("SET", ["hot-c", "c"]);
      expect(await lruStore.exec("DBSIZE", [])).toBe(2);
      lruStore.closeEmbedded();

      const lruRecords = new LocalPdimAofJournal(lruFile).recover(0);
      expect(lruRecords.some((record) => record.c === "__DELETE")).toBe(true);
      const lruReplay = new RedisStore("lru-replay", "LRU replay test");
      lruReplay.attachEmbeddedSnapshot(new Map(), {
        recoveryRecords: lruRecords,
      });
      stores.push(lruReplay);
      expect(await lruReplay.exec("DBSIZE", [])).toBe(2);
    } finally {
      if (previousLimit === undefined) delete process.env.MAX_KEYS_PER_STORE;
      else process.env.MAX_KEYS_PER_STORE = previousLimit;
    }
  });

  it("keeps post-snapshot writes while compacting covered AOF records", async () => {
    const file = tempJournalPath();
    const journal = new LocalPdimAofJournal(file);
    const entries = new Map<string, RedisEntry>();
    const store = owner(journal, entries);
    await store.exec("SET", ["counter", "1"]);
    const snapshot = await store.captureEmbeddedCheckpoint((sequence) => ({
      sequence,
      serialized: JSON.stringify(Object.fromEntries(entries)),
    }));
    await store.exec("INCR", ["counter"]);
    await journal.compact(snapshot.sequence);
    store.compactEmbeddedAof(snapshot.sequence);
    store.closeEmbedded();

    const recoveredEntries = new Map(
      Object.entries(JSON.parse(snapshot.serialized) as Record<string, RedisEntry>),
    );
    const recovered = owner(
      new LocalPdimAofJournal(file),
      recoveredEntries,
      snapshot.sequence,
    );
    expect(await recovered.exec("GET", ["counter"])).toBe("2");
  });

  it("persists all successful multi commands in one durable frame and replays them", async () => {
    const file = tempJournalPath();
    const store = owner(new LocalPdimAofJournal(file));
    const transaction = [
      ["SET", "counter", "1"],
      ["INCR", "counter"],
      ["GET", "counter"],
    ];
    await expect(store.exec("__PDIM_MULTI_EXEC", [
      JSON.stringify(transaction),
    ])).resolves.toEqual([
      [null, "OK"],
      [null, 2],
      [null, "2"],
    ]);
    store.closeEmbedded();

    const frames = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(frames).toHaveLength(1);
    const envelope = JSON.parse(frames[0]!) as { body: string };
    const body = JSON.parse(envelope.body) as {
      records: Array<{ c: string; a: string[] }>;
    };
    expect(body.records.map(({ c, a }) => [c, a])).toEqual([
      ["SET", ["counter", "1"]],
      ["INCR", ["counter"]],
    ]);

    const recovered = owner(new LocalPdimAofJournal(file));
    expect(await recovered.exec("GET", ["counter"])).toBe("2");
  });

  it("fails closed when the durable append fails", async () => {
    const store = new RedisStore("aof-failure", "failing AOF test");
    store.attachEmbeddedSnapshot(new Map(), {
      appendAof: async (_records: readonly RedisAofRecord[]) => {
        throw new Error("simulated fsync failure");
      },
    });
    stores.push(store);

    await expect(store.exec("SET", ["key", "value"])).rejects.toMatchObject({
      code: "PDIM_DURABILITY_FAILURE",
    });
    await expect(store.exec("GET", ["key"])).rejects.toMatchObject({
      code: "PDIM_DURABILITY_FAILURE",
    });
  });

  it("truncates only an incomplete tail and rejects a corrupt complete frame", async () => {
    const file = tempJournalPath();
    const journal = new LocalPdimAofJournal(file);
    journal.recover(0);
    await journal.append([{ s: 1, c: "SET", a: ["key", "value"] }]);
    fs.appendFileSync(file, '{"incomplete":');
    expect(new LocalPdimAofJournal(file).recover(0)).toEqual([
      { s: 1, c: "SET", a: ["key", "value"] },
    ]);

    const contents = fs.readFileSync(file, "utf8").trimEnd();
    const envelope = JSON.parse(contents) as { body: string; sha256: string };
    envelope.body = envelope.body.replace('"value"', '"other"');
    fs.writeFileSync(file, `${JSON.stringify(envelope)}\n`);
    expect(() => new LocalPdimAofJournal(file).recover(0)).toThrow(
      "Local PDIM AOF checksum mismatch",
    );
  });
});