import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const SNAPSHOT_SCHEMA = 1;
const MAX_HISTORY_RECORDS = 2_000;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
const MAX_BACKFILL_PER_RUN = 32;
const CHECKPOINT_INTERVAL = 64;
const LEARNING_NAMESPACE_SUFFIX = "completion-learning-v1";
const HASH_RE = /^[a-f0-9]{64}$/;
const RUN_ID_RE = /^[A-Za-z0-9._-]{1,180}$/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function verifyObservation(record) {
  if (!record || typeof record !== "object" || Array.isArray(record) ||
      record.schemaVersion !== 1 || !RUN_ID_RE.test(record.runId ?? "") ||
      !HASH_RE.test(record.reportSha256 ?? "") ||
      !Number.isFinite(Date.parse(record.recordedAt ?? "")) ||
      record.integrity?.algorithm !== "sha256" || !HASH_RE.test(record.integrity.sha256 ?? "")) {
    return false;
  }
  const unsigned = { ...record };
  delete unsigned.integrity;
  return sha256(canonical(unsigned)) === record.integrity.sha256;
}

function isLearningTransaction(value) {
  return value?.schemaVersion === 1 &&
    value?.kind === "completion-learning-observation" &&
    verifyObservation(value.observation);
}

function mergeObservations(...recordLists) {
  const byRunId = new Map();
  let truncated = false;
  for (const input of recordLists) {
    const records = Array.isArray(input) ? input : input?.observations;
    if (input && !Array.isArray(input) && input.truncated === true) truncated = true;
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (!verifyObservation(record)) throw new Error("Invalid completion-learning observation in bucket history");
      const prior = byRunId.get(record.runId);
      if (prior && prior.reportSha256 !== record.reportSha256) {
        throw new Error(`Conflicting completion-learning report for run ${record.runId}`);
      }
      if (!prior) byRunId.set(record.runId, record);
    }
  }
  const ordered = [...byRunId.values()].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt) || a.runId.localeCompare(b.runId));
  if (ordered.length > MAX_HISTORY_RECORDS) truncated = true;
  return {
    observations: ordered.slice(-MAX_HISTORY_RECORDS),
    truncated,
    availableRecords: byRunId.size,
  };
}

function encodeSnapshot(state) {
  const unsigned = {
    schemaVersion: SNAPSHOT_SCHEMA,
    observations: state.observations,
    truncated: state.truncated === true,
  };
  const body = Buffer.from(JSON.stringify({
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: sha256(canonical(unsigned)) },
  }));
  const bytes = gzipSync(body, { level: 6, mtime: 0 });
  if (bytes.length > MAX_HISTORY_BYTES) {
    throw new Error("Completion-learning bucket snapshot exceeds its 64 MiB limit");
  }
  return bytes;
}

function decodeSnapshot(bytes) {
  let parsed;
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_HISTORY_BYTES) {
      throw new Error("Snapshot exceeds its stored size limit");
    }
    const raw = gunzipSync(bytes, { maxOutputLength: MAX_HISTORY_BYTES }).toString("utf8");
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("Completion-learning bucket snapshot is unreadable", { cause: error });
  }
  if (parsed.schemaVersion !== SNAPSHOT_SCHEMA || !Array.isArray(parsed.observations) ||
      parsed.integrity?.algorithm !== "sha256" || !HASH_RE.test(parsed.integrity.sha256 ?? "")) {
    throw new Error("Completion-learning bucket snapshot has an unsupported or invalid schema");
  }
  const unsigned = {
    schemaVersion: parsed.schemaVersion,
    observations: parsed.observations,
    truncated: parsed.truncated === true,
  };
  if (sha256(canonical(unsigned)) !== parsed.integrity.sha256) {
    throw new Error("Completion-learning bucket snapshot integrity check failed");
  }
  return mergeObservations(unsigned);
}

function safeFailure(error) {
  if (error?.name === "PdimBucketLeaseBusy" ||
      (error?.code === "PDIM_DURABILITY_FAILURE" &&
       /Another process owns this bucket PDIM namespace/.test(error?.message ?? ""))) {
    return {
      kind: "LEASE_BUSY",
      reason: "Another process owns the completion-learning bucket namespace; no write was acknowledged.",
    };
  }
  const code = Number(error?.code);
  if (code === 401 || code === 403) {
    return { kind: "AUTHORIZATION", reason: "Authenticated access to private App Storage was denied." };
  }
  if (code === 429) {
    return { kind: "RATE_LIMIT", reason: "App Storage rate limiting prevented verified persistence." };
  }
  return {
    kind: "STORAGE_IO",
    reason: "App Storage persistence or generation-pinned readback failed; the local observation remains available.",
  };
}

async function loadJournalClass() {
  const { tsImport } = await import("tsx/esm/api");
  return tsImport("../../server/lib/pdimBucketJournal.ts", import.meta.url);
}

/**
 * Appends verified completion observations to a dedicated, generation-fenced
 * namespace in the existing private bucket. This never touches PDIM's HEAD or
 * data namespace. Tests inject the same PdimBucketJournal class with an
 * in-memory object store; no fallback is reported as durable.
 */
export async function persistCompletionHistory({
  objects,
  namespace,
  observations = [],
  historyTruncated = false,
  currentRunId = null,
  journalClass,
  checkpointInterval = CHECKPOINT_INTERVAL,
  maxBackfill = MAX_BACKFILL_PER_RUN,
  leaseMs = 60_000,
  clock = Date.now,
} = {}) {
  if (!objects || typeof objects.read !== "function" || typeof objects.write !== "function") {
    throw new Error("A generation-fenced App Storage object adapter is required");
  }
  if (typeof namespace !== "string" ||
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(namespace)) {
    throw new Error("A valid isolated completion-learning namespace is required");
  }
  if (!Number.isSafeInteger(checkpointInterval) || checkpointInterval < 1 ||
      !Number.isSafeInteger(maxBackfill) || maxBackfill < 1 || maxBackfill > MAX_BACKFILL_PER_RUN) {
    throw new Error("Invalid completion-learning persistence bounds");
  }
  const incoming = mergeObservations(observations);
  incoming.truncated = incoming.truncated || historyTruncated === true;
  if (currentRunId !== null && !RUN_ID_RE.test(currentRunId)) {
    throw new Error("Invalid completion-learning current run ID");
  }
  if (currentRunId && !incoming.observations.some(record => record.runId === currentRunId)) {
    throw new Error("Current completion-learning observation is missing from the local history");
  }

  const loaded = journalClass ?? await loadJournalClass();
  const PdimBucketJournal = loaded.PdimBucketJournal;
  if (typeof PdimBucketJournal !== "function") throw new Error("PDIM bucket journal module is unavailable");
  const makeJournal = () => new PdimBucketJournal(objects, namespace, isLearningTransaction, clock, leaseMs);
  let journal = makeJournal();
  const headKey = `${namespace}/HEAD`;
  let initial = await objects.read(headKey) === null;
  if (initial) {
    const seedId = await journal.putImmutable(encodeSnapshot(incoming));
    try {
      // Explicit initialization is restricted to this dedicated namespace.
      await journal.initialize(seedId);
    } catch (error) {
      // A concurrent first writer may have initialized the same namespace.
      // Re-read HEAD before treating the failed CAS as a race.
      if (await objects.read(headKey) === null) throw error;
      initial = false;
      journal = makeJournal();
    }
  }

  let acquired = false;
  let result;
  let failure;
  let releaseWarning = false;
  try {
    await journal.acquire();
    acquired = true;
    const recovered = await journal.recover();
    const snapshot = decodeSnapshot(recovered.snapshot);
    const committedRecords = recovered.transactions.map(transaction => transaction.observation);
    const merged = mergeObservations(snapshot, committedRecords, incoming);
    const alreadyCommitted = new Set(
      mergeObservations(snapshot, committedRecords).observations.map(record => record.runId),
    );
    const missing = incoming.observations.filter(record => !alreadyCommitted.has(record.runId));
    const current = currentRunId ? missing.find(record => record.runId === currentRunId) : undefined;
    const historical = missing.filter(record => record.runId !== currentRunId);
    const toAppend = [current, ...historical]
      .filter(Boolean)
      .slice(0, maxBackfill);
    let state = mergeObservations(snapshot, committedRecords, {
      observations: [],
      truncated: incoming.truncated,
    });
    for (const record of toAppend) {
      await journal.append({
        schemaVersion: 1,
        kind: "completion-learning-observation",
        observation: record,
      });
      state = mergeObservations(state, [record]);
    }

    let checkpointStatus = "NOT_NEEDED";
    let checkpointWarning = null;
    const mustPersistTruncation = incoming.truncated && !snapshot.truncated;
    if (!initial && (recovered.transactions.length + toAppend.length >= checkpointInterval ||
        mustPersistTruncation)) {
      try {
        const snapshotId = await journal.putImmutable(encodeSnapshot(state));
        const position = journal.checkpointPosition();
        await journal.checkpoint(snapshotId, position);
        checkpointStatus = "VERIFIED";
      } catch {
        // The append-only journal remains authoritative; a checkpoint is a
        // storage optimization, not the acknowledgement for an observation.
        checkpointStatus = "DEFERRED";
        checkpointWarning = "History checkpoint compaction was deferred; committed journal entries remain recoverable.";
      }
    }

    const readback = await journal.recover();
    const readbackState = mergeObservations(
      decodeSnapshot(readback.snapshot),
      readback.transactions.map(transaction => transaction.observation),
    );
    const committedIds = new Set(readbackState.observations.map(record => record.runId));
    const failedReadback = toAppend.some(record => !committedIds.has(record.runId)) ||
      (currentRunId && !committedIds.has(currentRunId));
    if (failedReadback) throw new Error("Completion-learning bucket readback omitted a committed observation");
    const currentRecord = currentRunId
      ? readbackState.observations.find(record => record.runId === currentRunId)
      : null;
    if (currentRecord && currentRecord.reportSha256 !== incoming.observations
      .find(record => record.runId === currentRunId)?.reportSha256) {
      throw new Error("Completion-learning readback conflicts with the current report");
    }
    const position = journal.checkpointPosition();
    const truncationReadbackMissing = mustPersistTruncation && !readbackState.truncated;
    result = {
      status: truncationReadbackMissing ? "DEGRADED" : "VERIFIED",
      readbackVerified: true,
      observations: readbackState.observations,
      truncated: readbackState.truncated,
      availableRecords: Math.max(readbackState.availableRecords, merged.availableRecords),
      recordsAdded: toAppend.length,
      pendingLocalRecords: Math.max(0, missing.length - toAppend.length),
      sequence: position.sequence,
      readbackSha256: sha256(canonical(readbackState.observations)),
      checkpointStatus,
      checkpointWarning,
      leaseReleased: true,
      reason: truncationReadbackMissing
        ? "Current records passed readback, but a new history truncation marker was not committed."
        : null,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (acquired) {
      try {
        await journal.release();
      } catch {
        releaseWarning = true;
      }
    }
  }
  if (failure) throw failure;
  if (!result) throw new Error("Completion-learning persistence did not produce a verified readback");
  if (releaseWarning) {
    result.status = "DEGRADED";
    result.leaseReleased = false;
    result.reason = "The stored history passed readback, but its writer lease could not be released.";
  }
  return result;
}

export async function persistConfiguredCompletionHistory({
  observations,
  currentRunId,
  env = process.env,
} = {}) {
  const hasBucket = Boolean(env.Replit_storage_bucket_id ||
    env.DATABASE_RECOVERY_BUCKET_ID || env.REPLIT_BUCKET_ID);
  if (!hasBucket) {
    return {
      status: "BLOCKED",
      readbackVerified: false,
      observations: [],
      reason: "The configured private App Storage bucket identifier is unavailable.",
      failureKind: "CONFIGURATION",
    };
  }
  try {
    const { tsImport } = await import("tsx/esm/api");
    const [{ configuredPdimBucketObjects }, { PdimBucketJournal }] = await Promise.all([
      tsImport("../../server/lib/pdimBucketObjects.ts", import.meta.url),
      tsImport("../../server/lib/pdimBucketJournal.ts", import.meta.url),
    ]);
    const baseNamespace = env.PDIM_BUCKET_NAMESPACE || "maxbooster-dev-pdim-v1";
    const namespace = `${baseNamespace}/${LEARNING_NAMESPACE_SUFFIX}`;
    const objects = await configuredPdimBucketObjects();
    return await persistCompletionHistory({
      objects,
      namespace,
      observations,
      currentRunId,
      journalClass: { PdimBucketJournal },
    });
  } catch (error) {
    const classified = safeFailure(error);
    return {
      status: "BLOCKED",
      readbackVerified: false,
      observations: [],
      reason: classified.reason,
      failureKind: classified.kind,
    };
  }
}
