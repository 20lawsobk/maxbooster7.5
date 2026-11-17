import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sealReport } from "../scripts/testing/repository-verification.mjs";
import { recordLearningOutcome } from "../scripts/testing/completion-learning.mjs";
import {
  listRunProposals,
  prepareProposalPlanDraft,
  recordProposalDecision,
} from "../scripts/testing/completion-proposal-feedback.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-feedback-"));
  return {
    root,
    runDirectory: async id => {
      const directory = path.join(root, ".local", "repository-verification", "runs", id);
      await fs.mkdir(directory, { recursive: true });
      return directory;
    },
  };
}

function makeReport({ dirtyHash = "c".repeat(64), status = "FAIL" } = {}) {
  return sealReport({
    schemaVersion: 1,
    mode: "preflight",
    gateStatus: status,
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    sourceIdentity: {
      revision: "a".repeat(40),
      inputInventorySha256: "b".repeat(64),
      dirtyInputSha256: dirtyHash,
    },
    checks: [{
      id: "studio/save-roundtrip",
      status,
      command: ["npm", "run", "test:studio-save"],
      exitCode: status === "PASS" ? 0 : 1,
    }],
  });
}

async function createLearningRun(root, runDirectory, report) {
  const learning = await recordLearningOutcome({ root, runDirectory, report });
  await fs.writeFile(
    path.join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  return learning;
}

test("records explicit source-bound decisions without applying source changes", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const report = makeReport();
    const run = await runDirectory("2026-11-17T01-00-00-first");
    const learning = await createLearningRun(root, run, report);
    const proposal = learning.summary.currentProposals[0];
    const before = await fs.readFile(path.join(run, "report.json"), "utf8");

    const accepted = await recordProposalDecision({
      root,
      runDirectory: run,
      proposalId: proposal.id,
      decision: "accept-for-plan",
    });
    assert.equal(accepted.status, "RECORDED_LOCAL_ONLY");
    const draft = await prepareProposalPlanDraft({
      root,
      runDirectory: run,
      proposalId: proposal.id,
    });
    assert.equal(draft.status, "PREPARED_NON_EXECUTABLE");
    assert.equal(draft.draft.schemaVersion, 0);
    assert.deepEqual(draft.draft.changes, []);
    assert.deepEqual(draft.draft.checks, []);
    assert.equal((await fs.stat(path.join(root, draft.draftPath))).mode & 0o777, 0o600);
    const duplicateDraft = await prepareProposalPlanDraft({
      root,
      runDirectory: run,
      proposalId: proposal.id,
    });
    assert.equal(duplicateDraft.status, "ALREADY_PREPARED");
    const duplicate = await recordProposalDecision({
      root,
      runDirectory: run,
      proposalId: proposal.id,
      decision: "accept-for-plan",
    });
    assert.equal(duplicate.status, "ALREADY_RECORDED");
    assert.equal((await fs.stat(path.join(root, accepted.recordPath))).mode & 0o777, 0o600);
    const listed = await listRunProposals({ root, runDirectory: run });
    assert.equal(listed.proposals[0].state, "APPROVED_FOR_PLAN");
    assert.equal(listed.proposals[0].reviewDecision.automaticallyApplied, false);
    assert.equal(learning.summary.productionReady, false);
    assert.equal(await fs.readFile(path.join(run, "report.json"), "utf8"), before);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("carries decisions only across the exact source identity and supports explicit reopening", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const report = makeReport();
    const first = await runDirectory("2026-11-17T01-01-00-first");
    const firstLearning = await createLearningRun(root, first, report);
    const proposal = firstLearning.summary.currentProposals[0];
    await recordProposalDecision({
      root,
      runDirectory: first,
      proposalId: proposal.id,
      decision: "defer",
    });

    const sameSourceReport = makeReport();
    const second = await runDirectory("2026-11-17T01-02-00-same-source");
    const secondLearning = await createLearningRun(root, second, sameSourceReport);
    assert.equal(secondLearning.summary.currentProposals[0].state, "DEFERRED");
    assert.equal(secondLearning.summary.proposalFeedback.scope, "LOCAL_WORKSPACE_ONLY");

    const reopened = await recordProposalDecision({
      root,
      runDirectory: second,
      proposalId: secondLearning.summary.currentProposals[0].id,
      decision: "reopen",
    });
    assert.equal(reopened.status, "RECORDED_LOCAL_ONLY");
    const reopenedList = await listRunProposals({ root, runDirectory: second });
    assert.equal(reopenedList.proposals[0].state, "NEEDS_REVIEW");
    assert.equal(reopenedList.proposals[0].reviewDecision.decision, "reopen");

    const third = await runDirectory("2026-11-17T01-03-00-changed-source");
    const changedLearning = await createLearningRun(root, third, makeReport({ dirtyHash: "d".repeat(64) }));
    assert.equal(changedLearning.summary.currentProposals[0].state, "NEEDS_REVIEW");
    assert.equal(changedLearning.summary.currentProposals[0].reviewDecision, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("decision commands reject altered summaries, unknown proposals, and invalid transitions", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T01-04-00-guarded");
    const learning = await createLearningRun(root, run, makeReport());
    const proposalId = learning.summary.currentProposals[0].id;
    await assert.rejects(prepareProposalPlanDraft({
      root,
      runDirectory: run,
      proposalId,
    }), /requires accept-for-plan/);
    await assert.rejects(recordProposalDecision({
      root,
      runDirectory: run,
      proposalId: "f".repeat(24),
      decision: "accept-for-plan",
    }), /not present/);
    await assert.rejects(recordProposalDecision({
      root,
      runDirectory: run,
      proposalId,
      decision: "reopen",
    }), /previously decided/);

    const summaryPath = path.join(run, "learning.json");
    const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    summary.currentProposals[0].recommendedNextAction = "tampered";
    await fs.writeFile(summaryPath, JSON.stringify(summary));
    await assert.rejects(recordProposalDecision({
      root,
      runDirectory: run,
      proposalId,
      decision: "reject",
    }), /integrity/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("keeps proposal decision log corruption visible and ignores invalid decisions", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T01-05-00-corrupt-log");
    const learning = await createLearningRun(root, run, makeReport());
    const proposal = learning.summary.currentProposals[0];
    await recordProposalDecision({
      root,
      runDirectory: run,
      proposalId: proposal.id,
      decision: "reject",
    });
    const decisionDirectory = path.join(root, ".local", "repository-verification", "learning", "decisions");
    await fs.writeFile(
      path.join(decisionDirectory, `20261117T010500000Z-${"e".repeat(64)}.json`),
      "{}",
    );
    const listed = await listRunProposals({ root, runDirectory: run });
    assert.equal(listed.feedbackStatus, "DEGRADED");
    assert.equal(listed.proposals[0].state, "REJECTED");
    assert.equal(listed.feedbackWarnings.length > 0, true);
    await assert.rejects(recordProposalDecision({
      root,
      runDirectory: run,
      proposalId: proposal.id,
      decision: "defer",
    }), /history is degraded/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
