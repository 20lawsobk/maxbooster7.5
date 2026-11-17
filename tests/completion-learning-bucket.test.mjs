import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PdimBucketJournal } from "../server/lib/pdimBucketJournal.ts";
import {
  persistCompletionHistory,
  persistConfiguredCompletionHistory,
} from "../scripts/testing/completion-learning-bucket.mjs";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function observation(runId, minute) {
  const unsigned = {
    schemaVersion: 1,
    runId,
    recordedAt: `2026-11-17T00:${String(minute).padStart(2, "0")}:00.000Z`,
    reportSha256: digest(`report-${runId}`),
    mode: "full",
    gateStatus: "FAIL",
    sourceIdentity: { revision: "a".repeat(40) },
    checks: [],
    remediation: { status: "NOT_RUN", items: [] },
    verifiedPlan: null,
    externalPrerequisites: [],
  };
  return {
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: digest(canonical(unsigned)) },
  };
}

class MemoryObjects {
  data = new Map();
  generation = 0;
  failWrites = false;

  async read(key) {
    const item = this.data.get(key);
    return item ? { bytes: Buffer.from(item.bytes), generation: item.generation } : null;
  }

  async write(key, bytes, expectedGeneration) {
    if (this.failWrites) throw new Error("simulated isolated storage write failure");
    const actual = this.data.get(key)?.generation ?? 0;
    if (actual !== expectedGeneration) throw new Error("generation precondition failed");
    const generation = String(++this.generation);
    this.data.set(key, { bytes: Buffer.from(bytes), generation });
    return generation;
  }
}

test("private learning history survives fresh journal instances and checkpoint recovery", async () => {
  const objects = new MemoryObjects();
  const one = observation("run-one", 1);
  const two = observation("run-two", 2);
  const three = observation("run-three", 3);
  const common = {
    objects,
    namespace: "isolated-test/completion-learning-v1",
    journalClass: { PdimBucketJournal },
    checkpointInterval: 2,
  };

  const first = await persistCompletionHistory({
    ...common,
    observations: [one],
    currentRunId: one.runId,
  });
  assert.equal(first.status, "VERIFIED");
  assert.equal(first.readbackVerified, true);
  assert.deepEqual(first.observations.map(item => item.runId), ["run-one"]);
  assert.equal(first.leaseReleased, true);

  const second = await persistCompletionHistory({
    ...common,
    observations: [one, two],
    currentRunId: two.runId,
  });
  assert.equal(second.status, "VERIFIED");
  assert.equal(second.recordsAdded, 1);
  assert.deepEqual(second.observations.map(item => item.runId), ["run-one", "run-two"]);

  const third = await persistCompletionHistory({
    ...common,
    observations: [one, two, three],
    currentRunId: three.runId,
  });
  assert.equal(third.status, "VERIFIED");
  assert.equal(third.checkpointStatus, "VERIFIED");
  assert.deepEqual(third.observations.map(item => item.runId), ["run-one", "run-two", "run-three"]);
  const head = JSON.parse((await objects.read(`${common.namespace}/HEAD`)).bytes.toString("utf8"));
  assert.equal(head.baseSequence, 2);

  // A new owner simulates a later workflow/process start: it has no local state.
  const afterRestart = await persistCompletionHistory({
    ...common,
    observations: [],
    currentRunId: null,
  });
  assert.equal(afterRestart.status, "VERIFIED");
  assert.equal(afterRestart.readbackVerified, true);
  assert.deepEqual(afterRestart.observations.map(item => item.runId), [
    "run-one", "run-two", "run-three",
  ]);
  assert.match(afterRestart.readbackSha256, /^[a-f0-9]{64}$/);
});

test("keeps current observations ahead of bounded backfill and reports pending local history", async () => {
  const objects = new MemoryObjects();
  const initial = observation("seed", 0);
  const first = await persistCompletionHistory({
    objects,
    namespace: "isolated-backfill/completion-learning-v1",
    observations: [initial],
    currentRunId: initial.runId,
    journalClass: { PdimBucketJournal },
  });
  assert.equal(first.status, "VERIFIED");
  const history = Array.from({ length: 40 }, (_, index) =>
    observation(`historical-${String(index).padStart(2, "0")}`, index + 1));
  const current = observation("current-run", 59);
  const synced = await persistCompletionHistory({
    objects,
    namespace: "isolated-backfill/completion-learning-v1",
    observations: [initial, ...history, current],
    currentRunId: current.runId,
    journalClass: { PdimBucketJournal },
    maxBackfill: 8,
  });
  assert.equal(synced.status, "VERIFIED");
  assert.equal(synced.recordsAdded, 8);
  assert.equal(synced.pendingLocalRecords, 33);
  assert.equal(synced.observations.some(item => item.runId === current.runId), true);
});

test("does not claim durable history when generation-fenced storage writes fail", async () => {
  const objects = new MemoryObjects();
  objects.failWrites = true;
  await assert.rejects(persistCompletionHistory({
    objects,
    namespace: "isolated-failure/completion-learning-v1",
    observations: [observation("failed-run", 1)],
    currentRunId: "failed-run",
    journalClass: { PdimBucketJournal },
  }), /write failed|publication failed|generation precondition/i);
});

test("carries local byte or record truncation into the durable snapshot", async () => {
  const objects = new MemoryObjects();
  const record = observation("truncated-history", 1);
  const result = await persistCompletionHistory({
    objects,
    namespace: "isolated-truncation/completion-learning-v1",
    observations: [record],
    currentRunId: record.runId,
    historyTruncated: true,
    journalClass: { PdimBucketJournal },
  });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.truncated, true);
  const restored = await persistCompletionHistory({
    objects,
    namespace: "isolated-truncation/completion-learning-v1",
    observations: [],
    currentRunId: null,
    journalClass: { PdimBucketJournal },
  });
  assert.equal(restored.truncated, true);
});

test("checkpoints a newly observed truncation flag even before the normal interval", async () => {
  const objects = new MemoryObjects();
  const record = observation("truncation-upgrade", 1);
  const common = {
    objects,
    namespace: "isolated-truncation-upgrade/completion-learning-v1",
    journalClass: { PdimBucketJournal },
    checkpointInterval: 64,
  };
  await persistCompletionHistory({
    ...common,
    observations: [record],
    currentRunId: record.runId,
  });
  const update = await persistCompletionHistory({
    ...common,
    observations: [record],
    currentRunId: null,
    historyTruncated: true,
  });
  assert.equal(update.status, "VERIFIED");
  assert.equal(update.checkpointStatus, "VERIFIED");
  assert.equal(update.truncated, true);
  const recovered = await persistCompletionHistory({
    ...common,
    observations: [],
    currentRunId: null,
  });
  assert.equal(recovered.truncated, true);
});

test("configured bucket wrapper forwards local truncation and isolates its namespace", async () => {
  const objects = new MemoryObjects();
  const record = observation("configured-wrapper", 1);
  const result = await persistConfiguredCompletionHistory({
    env: {
      REPLIT_BUCKET_ID: "fixture-bucket",
      PDIM_BUCKET_NAMESPACE: "configured-wrapper-test",
    },
    storageObjects: objects,
    journalClass: { PdimBucketJournal },
    observations: [record],
    currentRunId: record.runId,
    historyTruncated: true,
  });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.truncated, true);
  assert.equal(objects.data.has("configured-wrapper-test/completion-learning-v1/HEAD"), true);
  assert.equal(objects.data.has("configured-wrapper-test/HEAD"), false);
});
