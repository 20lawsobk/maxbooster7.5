import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { verifyProposalDecisionRecord } from "./completion-proposal-feedback.mjs";

const SNAPSHOT_SCHEMA = 1;
const MAX_DECISIONS = 10_000;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const CHECKPOINT_INTERVAL = 64;
const NAMESPACE_SUFFIX = "completion-proposal-decisions-v1";

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

function isDecisionTransaction(value) {
  return value?.schemaVersion === 1 &&
    value.kind === "completion-proposal-decision" &&
    verifyProposalDecisionRecord(value.record);
}

function validateDecisionSet(records) {
  const byId = new Map();
  for (const record of records) {
    if (!verifyProposalDecisionRecord(record)) {
      throw new Error("Invalid proposal decision in private bucket history");
    }
    const prior = byId.get(record.decisionId);
    if (prior && canonical(prior) !== canonical(record)) {
      throw new Error(`Conflicting proposal decision ID ${record.decisionId}`);
    }
    byId.set(record.decisionId, record);
  }
  if (byId.size > MAX_DECISIONS) {
    throw new Error(`Proposal decision history exceeds ${MAX_DECISIONS} records`);
  }
  const recordsByProposal = new Map();
  for (const record of byId.values()) {
    const source = record.sourceIdentity;
    const sourceKey = `${source.revision}:${source.inputInventorySha256}:${source.dirtyInputSha256}`;
    const key = `${record.proposalKey}:${sourceKey}`;
    const group = recordsByProposal.get(key) ?? [];
    group.push(record);
    recordsByProposal.set(key, group);
  }
  for (const [key, group] of recordsByProposal) {
    const ids = new Set(group.map(record => record.decisionId));
    const referenced = new Set(group.map(record => record.previousDecisionId).filter(Boolean));
    if ([...referenced].some(id => !ids.has(id))) {
      throw new Error(`Proposal decision history has a missing predecessor for ${key}`);
    }
    const byId = new Map(group.map(record => [record.decisionId, record]));
    const heads = group.filter(record => !referenced.has(record.decisionId));
    if (heads.length !== 1) {
      throw new Error(`Proposal decision history has conflicting branches for ${key}`);
    }
    const visited = new Set();
    let current = heads[0];
    while (current) {
      if (visited.has(current.decisionId)) {
        throw new Error(`Proposal decision history contains a cycle for ${key}`);
      }
      visited.add(current.decisionId);
      current = current.previousDecisionId ? byId.get(current.previousDecisionId) : null;
    }
    if (visited.size !== group.length) {
      throw new Error(`Proposal decision history is disconnected for ${key}`);
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.decidedAt.localeCompare(b.decidedAt) || a.decisionId.localeCompare(b.decisionId));
}

function encodeSnapshot(records) {
  const decisions = validateDecisionSet(records);
  const unsigned = { schemaVersion: SNAPSHOT_SCHEMA, decisions };
  const sealed = {
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: sha256(canonical(unsigned)) },
  };
  const raw = Buffer.from(JSON.stringify(sealed));
  if (raw.length > MAX_SNAPSHOT_BYTES) {
    throw new Error("Completion proposal decision snapshot exceeds its 16 MiB limit");
  }
  const bytes = gzipSync(raw, { level: 6, mtime: 0 });
  if (bytes.length > MAX_SNAPSHOT_BYTES) {
    throw new Error("Completion proposal decision snapshot exceeds its 16 MiB limit");
  }
  return bytes;
}

function decodeSnapshot(bytes) {
  let parsed;
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_SNAPSHOT_BYTES) {
      throw new Error("Snapshot exceeds its stored size limit");
    }
    parsed = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_SNAPSHOT_BYTES }).toString("utf8"));
  } catch (error) {
    throw new Error("Completion proposal decision snapshot is unreadable", { cause: error });
  }
  if (parsed.schemaVersion !== SNAPSHOT_SCHEMA || !Array.isArray(parsed.decisions) ||
      parsed.integrity?.algorithm !== "sha256") {
    throw new Error("Completion proposal decision snapshot has an unsupported schema");
  }
  const unsigned = { schemaVersion: parsed.schemaVersion, decisions: parsed.decisions };
  if (parsed.integrity.sha256 !== sha256(canonical(unsigned))) {
    throw new Error("Completion proposal decision snapshot integrity check failed");
  }
  return validateDecisionSet(parsed.decisions);
}

async function resolveJournal({ objects, namespace, journalClass, clock, leaseMs }) {
  if (typeof journalClass?.PdimBucketJournal !== "function") {
    const { tsImport } = await import("tsx/esm/api");
    journalClass = await tsImport("../../server/lib/pdimBucketJournal.ts", import.meta.url);
  }
  const Journal = journalClass.PdimBucketJournal;
  if (typeof Journal !== "function") throw new Error("PDIM bucket journal module is unavailable");
  return new Journal(objects, namespace, isDecisionTransaction, clock, leaseMs);
}

async function configuredObjects() {
  const { tsImport } = await import("tsx/esm/api");
  const module = await tsImport("../../server/lib/pdimBucketObjects.ts", import.meta.url);
  return module.configuredPdimBucketObjects();
}

function configuredNamespace(env) {
  const base = env.PDIM_BUCKET_NAMESPACE || "maxbooster-dev-pdim-v1";
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base)) {
    throw new Error("Configured PDIM bucket namespace is invalid");
  }
  return `${base}/${NAMESPACE_SUFFIX}`;
}

export async function readProposalDecisions({
  env = process.env,
  storageObjects,
  journalClass,
  clock = Date.now,
  leaseMs = 60_000,
} = {}) {
  if (!env.Replit_storage_bucket_id && !env.DATABASE_RECOVERY_BUCKET_ID && !env.REPLIT_BUCKET_ID) {
    return { status: "UNCONFIGURED", decisions: [], readbackVerified: false };
  }
  const objects = storageObjects ?? await configuredObjects();
  const namespace = configuredNamespace(env);
  const head = await objects.read(`${namespace}/HEAD`);
  if (!head) return { status: "EMPTY", decisions: [], readbackVerified: true };
  const journal = await resolveJournal({ objects, namespace, journalClass, clock, leaseMs });
  let acquired = false;
  try {
    await journal.acquire();
    acquired = true;
    const recovered = await journal.recover();
    const decisions = validateDecisionSet([
      ...decodeSnapshot(recovered.snapshot),
      ...recovered.transactions.map(transaction => transaction.record),
    ]);
    const readback = await journal.recover();
    const readbackDecisions = validateDecisionSet([
      ...decodeSnapshot(readback.snapshot),
      ...readback.transactions.map(transaction => transaction.record),
    ]);
    if (sha256(canonical(decisions)) !== sha256(canonical(readbackDecisions))) {
      throw new Error("Proposal decision bucket readback changed during recovery");
    }
    return {
      status: "VERIFIED",
      decisions: readbackDecisions,
      readbackVerified: true,
      readbackSha256: sha256(canonical(readbackDecisions)),
      sequence: journal.checkpointPosition().sequence,
    };
  } finally {
    if (acquired) await journal.release();
  }
}

export async function persistProposalDecisions({
  decisions = [],
  env = process.env,
  storageObjects,
  journalClass,
  checkpointInterval = CHECKPOINT_INTERVAL,
  clock = Date.now,
  leaseMs = 60_000,
} = {}) {
  if (!env.Replit_storage_bucket_id && !env.DATABASE_RECOVERY_BUCKET_ID && !env.REPLIT_BUCKET_ID) {
    return { status: "UNCONFIGURED", decisions: [], readbackVerified: false };
  }
  if (!Array.isArray(decisions) || !Number.isSafeInteger(checkpointInterval) || checkpointInterval < 1) {
    throw new Error("Invalid completion proposal persistence input");
  }
  const incoming = validateDecisionSet(decisions);
  const objects = storageObjects ?? await configuredObjects();
  const namespace = configuredNamespace(env);
  const journal = await resolveJournal({ objects, namespace, journalClass, clock, leaseMs });
  const headKey = `${namespace}/HEAD`;
  let initial = (await objects.read(headKey)) === null;
  if (initial) {
    const snapshotId = await journal.putImmutable(encodeSnapshot(incoming));
    try {
      await journal.initialize(snapshotId);
    } catch (error) {
      if (await objects.read(headKey) === null) throw error;
      initial = false;
    }
  }

  let acquired = false;
  try {
    await journal.acquire();
    acquired = true;
    const recovered = await journal.recover();
    const recoveredRecords = validateDecisionSet([
      ...decodeSnapshot(recovered.snapshot),
      ...recovered.transactions.map(transaction => transaction.record),
    ]);
    const byId = new Map(recoveredRecords.map(record => [record.decisionId, record]));
    for (const record of incoming) {
      const prior = byId.get(record.decisionId);
      if (prior && canonical(prior) !== canonical(record)) {
        throw new Error(`Conflicting proposal decision ID ${record.decisionId}`);
      }
      byId.set(record.decisionId, record);
    }
    const merged = validateDecisionSet([...byId.values()]);
    const recoveredIds = new Set(recoveredRecords.map(record => record.decisionId));
    const added = incoming.filter(record => !recoveredIds.has(record.decisionId));
    for (const record of added) {
      await journal.append({
        schemaVersion: 1,
        kind: "completion-proposal-decision",
        record,
      });
    }
    let checkpointStatus = "NOT_NEEDED";
    if (!initial && recovered.transactions.length + added.length >= checkpointInterval) {
      const current = validateDecisionSet([
        ...recoveredRecords,
        ...added,
      ]);
      const snapshotId = await journal.putImmutable(encodeSnapshot(current));
      await journal.checkpoint(snapshotId, journal.checkpointPosition());
      checkpointStatus = "VERIFIED";
    }
    const readback = await journal.recover();
    const readbackDecisions = validateDecisionSet([
      ...decodeSnapshot(readback.snapshot),
      ...readback.transactions.map(transaction => transaction.record),
    ]);
    const readbackIds = new Set(readbackDecisions.map(record => record.decisionId));
    if (merged.some(record => !readbackIds.has(record.decisionId))) {
      throw new Error("Proposal decision bucket readback omitted committed decisions");
    }
    return {
      status: "VERIFIED",
      decisions: readbackDecisions,
      readbackVerified: true,
      readbackSha256: sha256(canonical(readbackDecisions)),
      sequence: journal.checkpointPosition().sequence,
      recordsAdded: added.length,
      checkpointStatus,
    };
  } finally {
    if (acquired) await journal.release();
  }
}

export async function persistConfiguredProposalDecisions({
  decisions,
  env = process.env,
  storageObjects,
  journalClass,
} = {}) {
  try {
    return await persistProposalDecisions({
      decisions,
      env,
      storageObjects,
      journalClass,
    });
  } catch (error) {
    const code = Number(error?.code);
    const kind = error?.name === "PdimBucketLeaseBusy" ? "LEASE_BUSY" :
      code === 401 || code === 403 ? "AUTHORIZATION" :
        code === 429 ? "RATE_LIMIT" : "STORAGE_IO";
    return {
      status: "BLOCKED",
      decisions: [],
      readbackVerified: false,
      failureKind: kind,
      reason: "Private App Storage decision persistence or generation-pinned readback failed.",
    };
  }
}
