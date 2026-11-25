import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PdimBucketJournal } from "../server/lib/pdimBucketJournal.ts";
import { loadProposalFeedback, recordProposalDecision } from "../scripts/testing/completion-proposal-feedback.mjs";
import { recordLearningOutcome } from "../scripts/testing/completion-learning.mjs";
import { sealReport } from "../scripts/testing/repository-verification.mjs";
import { persistProposalDecisions } from "../scripts/testing/completion-proposal-bucket.mjs";

const env = {
  Replit_storage_bucket_id: "fixture-private-bucket",
  PDIM_BUCKET_NAMESPACE: "proposal-ledger-test",
};

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function signedDecision({ decision, previousDecisionId = null, decidedAt, sourceIdentity }) {
  const identity = {
    runId: "persisted-run",
    runPath: ".local/repository-verification/runs/persisted-run",
    proposalId: "proposal-1",
    proposalKey: digest("proposal-key"),
    decision,
    reportSha256: digest("report"),
    sourceIdentity,
    previousDecisionId,
  };
  const decisionId = digest(canonical(identity));
  const unsigned = { schemaVersion: 1, decisionId, ...identity, decidedAt };
  return {
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: digest(canonical(unsigned)) },
  };
}

class MemoryObjects {
  data = new Map();
  generation = 0;
  failWrites = false;
  failReads = false;

  async read(key) {
    if (this.failReads) throw new Error("fixture read failure");
    const item = this.data.get(key);
    return item ? { bytes: Buffer.from(item.bytes), generation: item.generation } : null;
  }

  async write(key, bytes, expectedGeneration) {
    if (this.failWrites) throw new Error("fixture write failure");
    const actual = this.data.get(key)?.generation ?? 0;
    if (actual !== expectedGeneration) throw new Error("generation precondition failed");
    const generation = String(++this.generation);
    this.data.set(key, { bytes: Buffer.from(bytes), generation });
    return generation;
  }
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-proposal-bucket-"));
  const sourceIdentity = {
    revision: "a".repeat(40),
    inputInventorySha256: "b".repeat(64),
    dirtyInputSha256: "c".repeat(64),
  };
  const report = sealReport({
    schemaVersion: 1,
    mode: "preflight",
    gateStatus: "FAIL",
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    sourceIdentity,
    checks: [{
      id: "studio/save-roundtrip",
      status: "FAIL",
      command: ["npm", "run", "test:studio-save"],
      exitCode: 1,
    }],
  });
  const runId = "2026-11-17T03-00-00-private-ledger";
  const runDirectory = path.join(root, ".local", "repository-verification", "runs", runId);
  await fs.mkdir(runDirectory, { recursive: true });
  const learned = await recordLearningOutcome({ root, runDirectory, report });
  await fs.writeFile(path.join(runDirectory, "report.json"), JSON.stringify(report), { mode: 0o600 });
  return { root, runDirectory, sourceIdentity, proposal: learned.summary.currentProposals[0] };
}

const journalClass = { PdimBucketJournal };

test("accepted decisions recover after the local decision mirror is removed", async () => {
  const state = await fixture();
  const storageObjects = new MemoryObjects();
  try {
    const accepted = await recordProposalDecision({
      root: state.root,
      runDirectory: state.runDirectory,
      proposalId: state.proposal.id,
      decision: "accept-for-plan",
      env,
      storageObjects,
      journalClass,
    });
    assert.equal(accepted.status, "RECORDED_DURABLY");
    assert.equal(accepted.durability, "DURABLE_VERIFIED");
    assert.equal((await storageObjects.read("proposal-ledger-test/completion-proposal-decisions-v1/HEAD")) !== null, true);

    await fs.rm(path.join(state.root, ".local", "repository-verification", "learning", "decisions"), {
      recursive: true,
      force: true,
    });

    // Each call gets a fresh journal instance, modeling separate workflow starts.
    const afterFirstRestart = await loadProposalFeedback(state.root, state.sourceIdentity, {
      env, storageObjects, journalClass,
    });
    assert.equal(afterFirstRestart.status, "CURRENT");
    assert.equal(afterFirstRestart.storageStatus, "DURABLE_VERIFIED");
    assert.equal(afterFirstRestart.latest.get(state.proposal.proposalKey).decision, "accept-for-plan");
    const afterSecondRestart = await loadProposalFeedback(state.root, state.sourceIdentity, {
      env, storageObjects, journalClass,
    });
    assert.equal(afterSecondRestart.status, "CURRENT");
    assert.equal(afterSecondRestart.latest.get(state.proposal.proposalKey).decisionId, accepted.record.decisionId);
  } finally {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test("bucket failure blocks decision acknowledgment and does not create a local-only approval", async () => {
  const state = await fixture();
  const storageObjects = new MemoryObjects();
  storageObjects.failWrites = true;
  try {
    await assert.rejects(recordProposalDecision({
      root: state.root,
      runDirectory: state.runDirectory,
      proposalId: state.proposal.id,
      decision: "accept-for-plan",
      env,
      storageObjects,
      journalClass,
    }), /persistence|verified proposal decision/i);
    const decisionDirectory = path.join(
      state.root, ".local", "repository-verification", "learning", "decisions",
    );
    await assert.rejects(fs.access(decisionDirectory), { code: "ENOENT" });
    const feedback = await loadProposalFeedback(state.root, state.sourceIdentity, {
      env, storageObjects, journalClass,
    });
    assert.equal(feedback.status, "CURRENT");
    assert.equal(feedback.latest.size, 0);
  } finally {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test("configured storage blocks old local approvals until they are migrated and verified", async () => {
  const state = await fixture();
  const storageObjects = new MemoryObjects();
  try {
    const localApproval = await recordProposalDecision({
      root: state.root,
      runDirectory: state.runDirectory,
      proposalId: state.proposal.id,
      decision: "accept-for-plan",
      env: {},
    });
    assert.equal(localApproval.durability, "LOCAL_ONLY");

    const beforeMigration = await loadProposalFeedback(state.root, state.sourceIdentity, {
      env,
      storageObjects,
      journalClass,
    });
    assert.equal(beforeMigration.status, "DEGRADED");
    assert.equal(beforeMigration.storageStatus, "LOCAL_UNSYNCED");

    const migratedAndReopened = await recordProposalDecision({
      root: state.root,
      runDirectory: state.runDirectory,
      proposalId: state.proposal.id,
      decision: "reopen",
      env,
      storageObjects,
      journalClass,
    });
    assert.equal(migratedAndReopened.status, "RECORDED_DURABLY");
    const afterMigration = await loadProposalFeedback(state.root, state.sourceIdentity, {
      env,
      storageObjects,
      journalClass,
    });
    assert.equal(afterMigration.status, "CURRENT");
    assert.equal(afterMigration.storageStatus, "DURABLE_VERIFIED");
    assert.equal(afterMigration.latest.get(state.proposal.proposalKey).decision, "reopen");
  } finally {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test("proposal-decision journal checkpoints compacted state and recovers its full chain", async () => {
  const storageObjects = new MemoryObjects();
  const sourceIdentity = {
    revision: "a".repeat(40),
    inputInventorySha256: "b".repeat(64),
    dirtyInputSha256: "c".repeat(64),
  };
  const accepted = signedDecision({
    decision: "accept-for-plan",
    decidedAt: "2026-11-17T03:10:00.000Z",
    sourceIdentity,
  });
  const reopened = signedDecision({
    decision: "reopen",
    previousDecisionId: accepted.decisionId,
    decidedAt: "2026-11-17T03:11:00.000Z",
    sourceIdentity,
  });
  const initialized = await persistProposalDecisions({
    decisions: [accepted],
    env,
    storageObjects,
    journalClass,
    checkpointInterval: 1,
  });
  assert.equal(initialized.status, "VERIFIED");
  const appended = await persistProposalDecisions({
    decisions: [accepted, reopened],
    env,
    storageObjects,
    journalClass,
    checkpointInterval: 1,
  });
  assert.equal(appended.status, "VERIFIED");
  assert.equal(appended.checkpointStatus, "VERIFIED");
  assert.equal(appended.decisions.length, 2);
  const head = JSON.parse((await storageObjects.read(
    "proposal-ledger-test/completion-proposal-decisions-v1/HEAD",
  )).bytes.toString("utf8"));
  assert.equal(head.baseSequence, 1);
  const recovered = await loadProposalFeedback(os.tmpdir(), sourceIdentity, {
    env,
    storageObjects,
    journalClass,
  });
  assert.equal(recovered.status, "CURRENT");
  assert.equal(recovered.latest.get(accepted.proposalKey).decision, "reopen");
});

