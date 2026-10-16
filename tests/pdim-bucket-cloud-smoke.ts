/** Explicitly opt-in: writes and removes only random, isolated fixture objects.
 * Does not import the app, open its database, or touch live PDIM namespaces. */
import { randomUUID } from "node:crypto";
import { createRecoveryStorage } from "../scripts/recovery-private-store.mjs";
import { PdimBucketObjects } from "../server/lib/pdimBucketObjects";
import { PdimBucketJournal } from "../server/lib/pdimBucketJournal";
import { writeBucketSnapshot, readBucketSnapshot } from "../server/lib/pdimBucketSnapshot";
import { isBucketTransaction, orderedBucketRecovery } from "../server/lib/pdimBucketRecovery";
import { RedisStore } from "../external/pdim/artifacts/api-server/src/redis/store";
import type { RedisEntry } from "../external/pdim/artifacts/api-server/src/redis/types";
import type { Bucket } from "@google-cloud/storage";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.argv.includes("--confirm-isolated-bucket-writes")) {
  throw new Error("Explicit confirmation required for isolated bucket smoke test");
}
const prefix = `pdim-migration-tests/${randomUUID()}`;
let bucket: Bucket | undefined;
let store: RedisStore | undefined;
let httpOwner: typeof import("../server/lib/localPdimServer") | undefined;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pdim-http-bucket-test-"));
try {
  ({ bucket } = await createRecoveryStorage({
    bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID,
  }));
  const objects = new PdimBucketObjects(bucket);
  const source = new PdimBucketJournal(objects, prefix, isBucketTransaction);
  const snapshot = await writeBucketSnapshot(source, [
    ["seed", { type: "string", value: "fixture" }],
    ["counter", { type: "string", value: "0" }],
  ], 0, 0);
  await source.initialize(snapshot);
  await source.acquire();
  await source.append({ kind: "redis", records: [{ s: 1, c: "SET", a: ["shared", "redis-first"] }] });
  await source.append({ kind: "capsule", sequence: 1, changes: { shared: "capsule-last" } });
  await source.append({ kind: "redis", records: [{ s: 2, c: "INCR", a: ["counter"] }] });
  await source.release();

  const restored = new PdimBucketJournal(objects, prefix, isBucketTransaction);
  await restored.acquire();
  const recovery = await restored.recover();
  const checkpoint = await readBucketSnapshot(restored, recovery.snapshot, (_key, value): RedisEntry => {
    if (!value || typeof value !== "object" ||
        (value as { type?: unknown }).type !== "string" ||
        typeof (value as { value?: unknown }).value !== "string") {
      throw new Error("Unexpected isolated fixture entry");
    }
    return value as RedisEntry;
  });
  const ordered = orderedBucketRecovery(recovery.transactions, checkpoint.redisSequence, checkpoint.capsuleSequence);
  store = new RedisStore("isolated-bucket-smoke", "isolated bucket recovery fixture");
  store.attachEmbeddedSnapshot(checkpoint.entries, {
    baselineSequence: checkpoint.redisSequence, recoveryRecords: ordered.records,
  });
  store.attachEmbeddedSnapshot(checkpoint.entries, { baselineSequence: ordered.redisSequence });
  if (await store.exec("GET", ["seed"]) !== "fixture" ||
      await store.exec("GET", ["shared"]) !== "capsule-last" ||
      await store.exec("GET", ["counter"]) !== "1") throw new Error("Canonical recovery mismatch");
  await restored.release();
  store.closeEmbedded();
  process.env.PDIM_PERSISTENCE = "app-storage";
  process.env.PDIM_BUCKET_NAMESPACE = prefix;
  process.env.LOCAL_PDIM_PORT = "35556";
  process.env.LOCAL_PDIM_STORE_FILE = path.join(scratch, "must-not-be-created.json");
  process.env.PDIM_LOCAL_CHANNEL_TOKEN = randomUUID();
  httpOwner = await import("../server/lib/localPdimServer");
  process.env.PDIM_EXEC_URL = httpOwner.getLocalPdimUrl();
  const exec = async (command: string, args: string[]) => {
    const response = await fetch(httpOwner!.getLocalPdimUrl(), {
      method: "POST", headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PDIM_LOCAL_CHANNEL_TOKEN}`,
      }, body: JSON.stringify({ cmd: command, args }),
    });
    if (!response.ok) throw new Error(`Isolated HTTP owner returned ${response.status}`);
    return response.json();
  };
  await httpOwner.startLocalPdimServer();
  await exec("SET", ["http-proof", "durable"]);
  const exportFile = await httpOwner.openConsistentPdimSnapshot();
  if (fs.existsSync(exportFile.sourcePath)) throw new Error("Export scratch was not unlinked");
  fs.closeSync(exportFile.fd);
  await httpOwner.stopLocalPdimServer();
  await httpOwner.startLocalPdimServer();
  const httpResult = await exec("GET", ["http-proof"]);
  if (httpResult !== "durable") {
    throw new Error("HTTP owner restart failed to preserve its acknowledged write");
  }
  await httpOwner.stopLocalPdimServer();
  if (fs.readdirSync(scratch).length) throw new Error("Bucket owner wrote local durable files");
  console.log(JSON.stringify({
    passed: true, canonicalRedisRecovery: true, capsuleOrdering: true, httpOwnerRestart: true,
    recoveredTransactions: recovery.transactions.length, localDataFilesUsed: false,
  }));
} catch (error) {
  console.error(JSON.stringify({
    passed: false, errorType: error instanceof Error ? error.name : "unknown",
    code: (error as { code?: unknown })?.code ?? null,
  }));
  process.exitCode = 1;
} finally {
  await httpOwner?.stopLocalPdimServer();
  fs.rmSync(scratch, { recursive: true });
  store?.closeEmbedded();
  if (bucket) {
    const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
    for (const file of files) {
      if (!file.metadata.generation) throw new Error("Missing fixture generation during cleanup");
      await file.delete({ ifGenerationMatch: file.metadata.generation });
    }
    console.log("Removed isolated fixture objects only.");
  }
}
