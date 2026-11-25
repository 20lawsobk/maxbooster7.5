import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { sealReport } from "../scripts/testing/repository-verification.mjs";
import {
  evaluateProductionReadiness,
  acquireLoopLock,
  initializeIsolatedCopy,
  runCompletionLoop,
  verifyIsolatedCopy,
} from "../scripts/testing/completion-loop.mjs";
import { createHash } from "node:crypto";

const roots = [];
const hash = value => createHash("sha256").update(value).digest("hex");

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-loop-"));
  roots.push(root);
  return root;
}

function sealLearning(value) {
  const unsigned = { ...value };
  delete unsigned.integrity;
  const digest = hash(canonical(unsigned));
  return { ...unsigned, integrity: { algorithm: "sha256", sha256: digest } };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readyEvidence() {
  const sourceIdentity = {
    revision: "a".repeat(40),
    inputInventorySha256: "b".repeat(64),
    dirtyInputSha256: "c".repeat(64),
  };
  const report = sealReport({
    schemaVersion: 1,
    mode: "full",
    gateStatus: "PASS",
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    sourceIdentity,
    checks: [
      { id: "full-sweep-source-drift", status: "PASS" },
      { id: "existing-runner-source-integrity", status: "PASS" },
    ],
    externalPrerequisites: [{ id: "providers", status: "PASS" }],
    skipped: [],
    existingRunner: {
      exitCode: 0,
      runnerStatus: "executed_groups_passed",
      selectedGroups: ["local-acceptance"],
      sourceInputsUnchanged: true,
    },
  });
  const learning = sealLearning({
    schemaVersion: 1,
    reportSha256: report.integrity.reportSha256,
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    sourceIdentity,
    repositoryUnderstanding: {
      status: "CURRENT",
      sourceIdentity: {
        gitRevision: sourceIdentity.revision,
        runReportSha256: report.integrity.reportSha256,
        runSourceMatch: true,
        complete: true,
      },
      atlas: { status: "GENERATED", reportStatus: "PASS", policyStatus: "PASS" },
    },
    currentRemediation: { status: "CURRENT", unresolvedItems: 0, omittedSourceItems: 0 },
    currentProposals: [],
  });
  return { report, learning };
}

async function initializeRepo(root, fileName) {
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", fileName), "fixture\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Completion Loop Fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "completion-loop@example.invalid"], { cwd: root });
  execFileSync("git", ["add", "src"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

test("derived readiness requires the complete current evidence set, not legacy hardcoded flags", () => {
  const { report, learning } = readyEvidence();
  assert.equal(report.productionReady, false);
  assert.equal(learning.productionReady, false);
  assert.deepEqual(evaluateProductionReadiness(report, learning), {
    ready: true,
    status: "READY",
    blockers: [],
  });

  const notReady = sealReport({
    ...report,
    checks: [...report.checks, { id: "mobile-acceptance", status: "UNVERIFIED" }],
  });
  const result = evaluateProductionReadiness(notReady, learning);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("check:mobile-acceptance:UNVERIFIED"));
});

test("external blockers, skipped checks, unresolved proposals, and partial scans keep the loop unready", () => {
  const { report, learning } = readyEvidence();
  const blockedReport = sealReport({
    ...report,
    externalPrerequisites: [{ id: "provider", status: "BLOCKED" }],
    skipped: [{ id: "mobile", status: "UNVERIFIED" }],
  });
  const blockedLearning = sealLearning({
    ...learning,
    currentProposals: [{ id: "candidate", state: "NEEDS_REVIEW" }],
    repositoryUnderstanding: {
      ...learning.repositoryUnderstanding,
      status: "PARTIAL",
      sourceIdentity: { ...learning.repositoryUnderstanding.sourceIdentity, complete: false },
    },
  });
  const result = evaluateProductionReadiness(blockedReport, blockedLearning);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("external:provider:BLOCKED"));
  assert.ok(result.blockers.includes("report:skipped-checks-present"));
  assert.ok(result.blockers.includes("analysis:repository-understanding-incomplete-or-stale"));
  assert.ok(result.blockers.includes("proposals:unresolved-candidates-1"));
});

test("loop repeats non-ready cycles and exits only after strict readiness evidence", async () => {
  const root = await tempRoot();
  let cycles = 0;
  const result = await runCompletionLoop({
    root,
    intervalMs: 1000,
    maxCycles: 4,
    runCycle: async () => {
      cycles++;
      return {
        cycleId: `cycle-${cycles}`,
        mode: "full",
        execution: { status: "PASS", exitCode: 0, timedOut: false, interrupted: false, durationMs: 1 },
        readiness: cycles < 3
          ? { ready: false, status: "NOT_READY", blockers: ["external:provider:BLOCKED"] }
          : { ready: true, status: "READY", blockers: [] },
        sourceIdentity: { revision: "a".repeat(40), inputInventorySha256: "b".repeat(64) },
        reportSha256: "d".repeat(64),
        runDirectory: ".local/fixture",
      };
    },
  });
  const state = JSON.parse(await fs.readFile(
    path.join(root, ".local/repository-verification/completion-loop/state.json"), "utf8",
  ));
  assert.equal(result.status, "READY");
  assert.equal(cycles, 3);
  assert.equal(state.status, "READY");
  assert.equal(state.cycleCount, 3);
});

test("finite test runs report not-ready instead of disguising a cycle limit as success", async () => {
  const root = await tempRoot();
  const result = await runCompletionLoop({
    root,
    intervalMs: 1000,
    maxCycles: 1,
    mode: "dev",
    runCycle: async () => ({
      cycleId: "cycle-dev",
      mode: "dev",
      execution: { status: "PASS", exitCode: 0, timedOut: false, interrupted: false, durationMs: 1 },
      readiness: { ready: false, status: "NOT_READY", blockers: ["report:full-verification-required"] },
      sourceIdentity: null,
      reportSha256: null,
      runDirectory: null,
    }),
  });
  assert.equal(result.status, "LIMIT_REACHED");
  assert.equal(result.exitCode, 2);
  const state = JSON.parse(await fs.readFile(
    path.join(root, ".local/repository-verification/completion-loop/state.json"), "utf8",
  ));
  assert.equal(state.status, "LIMIT_REACHED");
  assert.equal(state.lastReadiness.status, "NOT_READY");
});

test("explicit cancellation stops the wait and persists a cancelled state", async () => {
  const root = await tempRoot();
  const controller = new AbortController();
  const resultPromise = runCompletionLoop({
    root,
    intervalMs: 1000,
    signal: controller.signal,
    runCycle: async () => ({
      cycleId: "cycle-cancel",
      mode: "full",
      execution: { status: "PASS", exitCode: 0, timedOut: false, interrupted: false, durationMs: 1 },
      readiness: { ready: false, status: "NOT_READY", blockers: ["external:provider:BLOCKED"] },
      sourceIdentity: null,
      reportSha256: null,
      runDirectory: null,
    }),
  });
  setTimeout(() => controller.abort(), 20).unref();
  const result = await resultPromise;
  const state = JSON.parse(await fs.readFile(
    path.join(root, ".local/repository-verification/completion-loop/state.json"), "utf8",
  ));
  assert.equal(result.status, "CANCELLED");
  assert.equal(state.status, "CANCELLED");
});

test("exclusive loop lock rejects concurrent runs and recovers a dead local owner", async () => {
  const root = await tempRoot();
  const release = await acquireLoopLock(root);
  await assert.rejects(acquireLoopLock(root), /Another completion loop is active/);
  await release();

  const lockPath = path.join(root, ".local/repository-verification/completion-loop/loop.lock");
  await fs.writeFile(lockPath, JSON.stringify({
    schemaVersion: 1,
    pid: 99_999_999,
    host: os.hostname(),
    token: "stale-owner",
    startedAt: new Date().toISOString(),
  }), { mode: 0o600 });
  const recoveredRelease = await acquireLoopLock(root);
  await recoveredRelease();
  await assert.rejects(fs.stat(lockPath), { code: "ENOENT" });
});

test("corrupted persisted state blocks resume instead of resetting cycle history", async () => {
  const root = await tempRoot();
  await runCompletionLoop({
    root,
    intervalMs: 1000,
    maxCycles: 1,
    mode: "dev",
    runCycle: async () => ({
      cycleId: "cycle-state",
      mode: "dev",
      execution: { status: "PASS", exitCode: 0, timedOut: false, interrupted: false, durationMs: 1 },
      readiness: { ready: false, status: "NOT_READY", blockers: ["report:full-verification-required"] },
      sourceIdentity: null,
      reportSha256: null,
      runDirectory: null,
    }),
  });
  const filePath = path.join(root, ".local/repository-verification/completion-loop/state.json");
  const state = await fs.readFile(filePath, "utf8");
  await fs.writeFile(filePath, state.replace("LIMIT_REACHED", "READY"));
  await assert.rejects(runCompletionLoop({
    root,
    intervalMs: 1000,
    maxCycles: 1,
    mode: "dev",
    runCycle: async () => { throw new Error("must not run with corrupt state"); },
  }), /integrity or schema check failed/);
});

test("only a distinct Git worktree can receive the isolated-loop marker", async () => {
  const sourceRoot = await tempRoot();
  const isolatedRoot = path.join(sourceRoot, "isolated-copy");
  await fs.mkdir(isolatedRoot);
  await initializeRepo(sourceRoot, "source.ts");
  await initializeRepo(isolatedRoot, "copy.ts");

  const marker = await initializeIsolatedCopy({ root: isolatedRoot, sourceRoot });
  const verified = await verifyIsolatedCopy(isolatedRoot);
  assert.equal(marker.status, "INITIALIZED");
  assert.equal(verified.root, await fs.realpath(isolatedRoot));
  await assert.rejects(initializeIsolatedCopy({ root: sourceRoot, sourceRoot }), /must differ/);
});
