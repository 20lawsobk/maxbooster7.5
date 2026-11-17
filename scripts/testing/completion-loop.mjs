#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cleanEnvironment,
  runOwned,
  verifyReport,
} from "./repository-verification.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const LOOP_PARTS = [".local", "repository-verification", "completion-loop"];
const STATE_FILE = "state.json";
const LOCK_FILE = "loop.lock";
const ISOLATION_FILE = "isolated-copy.json";
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_EXECUTABLE_PLAN_BYTES = 10 * 1024 * 1024;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FULL_RUN_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const DEV_RUN_TIMEOUT_MS = 15 * 60 * 1000;
const PLAN_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_CYCLE_HISTORY = 50;

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

function seal(value) {
  const unsigned = { ...value };
  delete unsigned.integrity;
  return {
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: sha256(canonical(unsigned)) },
  };
}

function isSealed(value) {
  if (!value || typeof value !== "object" ||
      value.integrity?.algorithm !== "sha256" ||
      !/^[a-f0-9]{64}$/.test(value.integrity.sha256 ?? "")) return false;
  const unsigned = { ...value };
  delete unsigned.integrity;
  return sha256(canonical(unsigned)) === value.integrity.sha256;
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function repositoryGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: process.env.HOME || "/tmp",
      LANG: "C",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  if (result.error) throw new Error(`Git ${args[0]} could not run`);
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed in the selected worktree`);
  return result.stdout.trim();
}

async function ensurePrivateDirectory(root) {
  let current = root;
  for (const part of LOOP_PARTS) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`Completion-loop storage is not a real directory: ${path.relative(root, current)}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(current, { mode: 0o700 });
    }
  }
  await fs.chmod(current, 0o700);
  return current;
}

async function readRegularFile(filePath, maximumBytes, description) {
  const before = await fs.lstat(filePath);
  if (before.isSymbolicLink() || !before.isFile() || before.size > maximumBytes) {
    throw new Error(`${description} must be a bounded regular file`);
  }
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== before.ino || opened.size > maximumBytes) {
      throw new Error(`${description} changed while it was being opened`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function writeAtomic(filePath, content, mode = 0o600) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { flag: "wx", mode });
  try {
    await fs.chmod(temporary, mode);
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function statePath(root) {
  return path.join(root, ...LOOP_PARTS, STATE_FILE);
}

function lockPath(root) {
  return path.join(root, ...LOOP_PARTS, LOCK_FILE);
}

function isolationPath(root) {
  return path.join(root, ...LOOP_PARTS, ISOLATION_FILE);
}

export async function initializeIsolatedCopy({ root, sourceRoot = DEFAULT_ROOT } = {}) {
  if (!root) throw new Error("An explicit isolated --root is required");
  const isolatedRoot = await fs.realpath(path.resolve(root));
  const source = await fs.realpath(path.resolve(sourceRoot));
  if (isolatedRoot === source) throw new Error("The isolated worktree must differ from its source worktree");
  const isolatedGitRoot = await fs.realpath(repositoryGit(isolatedRoot, ["rev-parse", "--show-toplevel"]));
  const sourceGitRoot = await fs.realpath(repositoryGit(source, ["rev-parse", "--show-toplevel"]));
  if (isolatedGitRoot !== isolatedRoot || sourceGitRoot === isolatedGitRoot) {
    throw new Error("The selected path is not a distinct Git worktree");
  }
  const marker = seal({
    schemaVersion: 1,
    kind: "maxbooster-isolated-completion-copy",
    root: isolatedRoot,
    sourceRoot: source,
    initializedAt: new Date().toISOString(),
    sourceRevision: repositoryGit(source, ["rev-parse", "HEAD"]),
    isolatedRevision: repositoryGit(isolatedRoot, ["rev-parse", "HEAD"]),
  });
  const directory = await ensurePrivateDirectory(isolatedRoot);
  const target = path.join(directory, ISOLATION_FILE);
  try {
    const existing = JSON.parse((await readRegularFile(target, 16 * 1024, "Isolation marker")).toString("utf8"));
    if (isSealed(existing) && existing.root === isolatedRoot && existing.sourceRoot === source) {
      return { status: "ALREADY_INITIALIZED", path: path.relative(isolatedRoot, target) };
    }
    throw new Error("A conflicting isolation marker already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeAtomic(target, `${JSON.stringify(marker, null, 2)}\n`);
  return { status: "INITIALIZED", path: path.relative(isolatedRoot, target) };
}

export async function verifyIsolatedCopy(root) {
  const realRoot = await fs.realpath(path.resolve(root));
  const markerPath = isolationPath(realRoot);
  const marker = JSON.parse((await readRegularFile(markerPath, 16 * 1024, "Isolation marker")).toString("utf8"));
  if (!isSealed(marker) || marker.schemaVersion !== 1 ||
      marker.kind !== "maxbooster-isolated-completion-copy" ||
      marker.root !== realRoot || typeof marker.sourceRoot !== "string" ||
      !/^[a-f0-9]{40,64}$/.test(marker.sourceRevision ?? "") ||
      !/^[a-f0-9]{40,64}$/.test(marker.isolatedRevision ?? "")) {
    throw new Error("A valid isolated-copy marker is required; initialize the worktree first");
  }
  const sourceRoot = await fs.realpath(marker.sourceRoot);
  if (sourceRoot === realRoot) throw new Error("The isolation marker points to the primary worktree");
  const isolatedGitRoot = await fs.realpath(repositoryGit(realRoot, ["rev-parse", "--show-toplevel"]));
  const sourceGitRoot = await fs.realpath(repositoryGit(sourceRoot, ["rev-parse", "--show-toplevel"]));
  if (isolatedGitRoot !== realRoot || sourceGitRoot === isolatedGitRoot) {
    throw new Error("The isolated-copy marker no longer identifies a distinct worktree");
  }
  return { root: realRoot, sourceRoot, marker };
}

export function evaluateProductionReadiness(report, learning) {
  const blockers = [];
  if (!verifyReport(report)) blockers.push("report:integrity-invalid");
  if (report?.mode !== "full") blockers.push("report:full-verification-required");
  if (report?.gateStatus !== "PASS") blockers.push(`report:gate-${report?.gateStatus ?? "missing"}`);
  if (!/^[a-f0-9]{40,64}$/.test(report?.sourceIdentity?.revision ?? "") ||
      !/^[a-f0-9]{64}$/.test(report?.sourceIdentity?.inputInventorySha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(report?.sourceIdentity?.dirtyInputSha256 ?? "")) {
    blockers.push("source:identity-incomplete");
  }
  if (!Array.isArray(report?.checks) || report.checks.length === 0) {
    blockers.push("report:checks-missing");
  } else {
    for (const check of report.checks) {
      if (check.status !== "PASS") blockers.push(`check:${check.id ?? "unknown"}:${check.status ?? "missing"}`);
    }
  }
  if (report?.checks?.find(check => check.id === "full-sweep-source-drift")?.status !== "PASS") {
    blockers.push("source:full-sweep-drift-unverified");
  }
  if (report?.existingRunner?.sourceInputsUnchanged !== true) {
    blockers.push("source:verification-run-inputs-changed-or-unverified");
  }
  if (report?.existingRunner?.exitCode !== 0 ||
      report?.existingRunner?.runnerStatus !== "executed_groups_passed" ||
      !Array.isArray(report?.existingRunner?.selectedGroups) ||
      report.existingRunner.selectedGroups.length === 0) {
    blockers.push("verification:full-runner-incomplete");
  }
  if (!Array.isArray(report?.externalPrerequisites) || report.externalPrerequisites.length === 0) {
    blockers.push("external:prerequisite-inventory-missing");
  } else {
    for (const item of report.externalPrerequisites) {
      if (item.status !== "PASS") blockers.push(`external:${item.id ?? "unknown"}:${item.status ?? "missing"}`);
    }
  }
  if (!Array.isArray(report?.skipped) || report.skipped.length > 0) {
    blockers.push("report:skipped-checks-present");
  }

  if (!isSealed(learning) || learning.schemaVersion !== 1) {
    blockers.push("learning:integrity-invalid");
  } else {
    if (learning.reportSha256 !== report?.integrity?.reportSha256) {
      blockers.push("learning:report-binding-mismatch");
    }
    if (learning.sourceIdentity?.revision !== report?.sourceIdentity?.revision ||
        learning.sourceIdentity?.inputInventorySha256 !== report?.sourceIdentity?.inputInventorySha256 ||
        learning.sourceIdentity?.dirtyInputSha256 !== report?.sourceIdentity?.dirtyInputSha256) {
      blockers.push("learning:source-identity-mismatch");
    }
    const understanding = learning.repositoryUnderstanding;
    if (understanding?.status !== "CURRENT" ||
        understanding.sourceIdentity?.complete !== true ||
        understanding.sourceIdentity?.runSourceMatch !== true ||
        understanding.sourceIdentity?.gitRevision !== report?.sourceIdentity?.revision ||
        understanding.sourceIdentity?.runReportSha256 !== report?.integrity?.reportSha256) {
      blockers.push("analysis:repository-understanding-incomplete-or-stale");
    }
    if (understanding?.atlas?.status !== "GENERATED" ||
        understanding.atlas?.reportStatus !== "PASS" ||
        understanding.atlas?.policyStatus !== "PASS") {
      blockers.push("analysis:atlas-policy-not-passing");
    }
    if (learning.currentRemediation?.status !== "CURRENT" ||
        learning.currentRemediation?.unresolvedItems !== 0 ||
        learning.currentRemediation?.omittedSourceItems !== 0) {
      blockers.push("remediation:incomplete-or-unresolved");
    }
    if (!Array.isArray(learning.currentProposals) || learning.currentProposals.length !== 0) {
      const unresolved = Array.isArray(learning.currentProposals)
        ? learning.currentProposals.filter(proposal =>
          !["REJECTED", "RESOLVED", "VERIFIED_RESOLVED"].includes(proposal?.state))
        : null;
      if (unresolved === null || unresolved.length > 0) {
        blockers.push(`proposals:unresolved-candidates-${unresolved?.length ?? "unknown"}`);
      }
    }
    if ((learning.proposalCounts?.omittedCheckCandidates ?? 0) !== 0 ||
        (learning.proposalCounts?.omittedRemediationCandidates ?? 0) !== 0 ||
        (learning.currentRemediation?.omittedProposals ?? 0) !== 0) {
      blockers.push("proposals:candidates-omitted");
    }
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    ready: uniqueBlockers.length === 0,
    status: uniqueBlockers.length === 0 ? "READY" : "NOT_READY",
    blockers: uniqueBlockers,
  };
}

async function readLoopState(root) {
  const filePath = statePath(root);
  let raw;
  try {
    raw = await readRegularFile(filePath, MAX_STATE_BYTES, "Completion-loop state");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let state;
  try {
    state = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Completion-loop state is malformed; refusing to reset its history");
  }
  if (!isSealed(state) || state.schemaVersion !== 1 ||
      state.kind !== "maxbooster-completion-loop-state" || state.root !== root ||
      !Number.isSafeInteger(state.cycleCount) || state.cycleCount < 0 ||
      !Array.isArray(state.cycles) || !Array.isArray(state.appliedPlans)) {
    throw new Error("Completion-loop state integrity or schema check failed");
  }
  return state;
}

async function readApprovedPlan(root, planPath, expectedPlanSha256) {
  if (typeof expectedPlanSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(expectedPlanSha256)) {
    throw new Error("Applying a plan requires --plan-sha256 with the exact reviewed SHA-256");
  }
  if (typeof planPath !== "string" || !planPath) {
    throw new Error("An explicitly approved plan path is required");
  }
  const requestedPath = path.isAbsolute(planPath) ? path.resolve(planPath) : path.resolve(root, planPath);
  if (!within(root, requestedPath)) throw new Error("Approved plan must be inside the isolated worktree");
  const info = await fs.lstat(requestedPath);
  if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_EXECUTABLE_PLAN_BYTES) {
    throw new Error("Approved plan must be a bounded regular file, not a symlink");
  }
  const realPath = await fs.realpath(requestedPath);
  if (!within(root, realPath)) throw new Error("Approved plan resolved outside the isolated worktree");
  const raw = await readRegularFile(realPath, MAX_EXECUTABLE_PLAN_BYTES, "Approved plan");
  const actualSha256 = sha256(raw);
  if (actualSha256 !== expectedPlanSha256) {
    throw new Error("Approved plan SHA-256 does not match the supplied reviewed hash");
  }
  let plan;
  try {
    plan = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Approved plan is not valid JSON");
  }
  if (plan.schemaVersion !== 1 || !plan.proposalLink ||
      typeof plan.proposalLink.proposalId !== "string" ||
      typeof plan.proposalLink.approvalDecisionId !== "string") {
    throw new Error("Only an executable, proposal-approved schemaVersion 1 plan may be applied");
  }
  return { path: realPath, sha256: actualSha256 };
}

async function runApprovedPlan({ root, plan, signal }) {
  const directory = await ensurePrivateDirectory(root);
  const logPath = path.join(directory, "cycles", `plan-${plan.sha256}-${randomUUID()}`, "execution.log");
  const verifierPath = path.join(root, "scripts/testing/repository-verification.mjs");
  const execution = await runOwned(process.execPath, [
    verifierPath,
    "execute",
    "--root", root,
    "--plan", plan.path,
    "--plan-sha256", plan.sha256,
    "--apply",
  ], {
    cwd: root,
    timeoutMs: PLAN_EXECUTION_TIMEOUT_MS,
    logPath,
    env: cleanEnvironment(),
    signal,
  });
  const verifiedStatus = execution.output.match(
    /Completion plan (APPLIED_VERIFIED|ALREADY_APPLIED_VERIFIED);/,
  )?.[1] ?? null;
  const status = execution.exitCode === 0 &&
    execution.status === "PASS" &&
    verifiedStatus
    ? verifiedStatus
    : execution.interrupted ? "INTERRUPTED" : "FAILED";
  return {
    status,
    exitCode: execution.exitCode,
    timedOut: execution.timedOut,
    interrupted: execution.interrupted,
    durationMs: execution.durationMs,
    log: path.relative(root, execution.log),
    logSha256: execution.logSha256,
  };
}

async function writeLoopState(root, state) {
  const directory = await ensurePrivateDirectory(root);
  const sealed = seal({
    ...state,
    schemaVersion: 1,
    kind: "maxbooster-completion-loop-state",
    root,
    updatedAt: new Date().toISOString(),
  });
  const content = `${JSON.stringify(sealed, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_STATE_BYTES) {
    throw new Error("Completion-loop state exceeded its storage bound");
  }
  await writeAtomic(path.join(directory, STATE_FILE), content);
  return sealed;
}

async function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

async function createLockFile(filePath, body) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, body, { flag: "wx", mode: 0o600 });
  try {
    await fs.link(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function acquireLoopLock(root) {
  await ensurePrivateDirectory(root);
  const filePath = lockPath(root);
  const token = randomUUID();
  const body = JSON.stringify({
    schemaVersion: 1,
    pid: process.pid,
    host: os.hostname(),
    token,
    startedAt: new Date().toISOString(),
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await createLockFile(filePath, body);
      return async () => {
        try {
          const existing = JSON.parse((await readRegularFile(filePath, 16 * 1024, "Completion-loop lock")).toString("utf8"));
          if (existing.token === token) await fs.unlink(filePath);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let existing;
      try {
        existing = JSON.parse((await readRegularFile(filePath, 16 * 1024, "Completion-loop lock")).toString("utf8"));
      } catch {
        throw new Error("A completion-loop lock is unreadable; inspect it before removing it");
      }
      if (existing.schemaVersion !== 1 || !Number.isInteger(existing.pid) ||
          typeof existing.token !== "string" || typeof existing.host !== "string") {
        throw new Error("A completion-loop lock is malformed; inspect it before removing it");
      }
      if (existing.host !== os.hostname() || await processIsAlive(existing.pid)) {
        throw new Error("Another completion loop is active; refusing a concurrent run");
      }
      const stalePath = `${filePath}.stale-${randomUUID()}`;
      try {
        await fs.rename(filePath, stalePath);
      } catch (renameError) {
        if (renameError.code === "ENOENT") continue;
        throw renameError;
      }
      const moved = JSON.parse((await readRegularFile(stalePath, 16 * 1024, "Stale completion-loop lock")).toString("utf8"));
      if (moved.token !== existing.token) {
        throw new Error("A lock changed during stale-lock recovery; inspect the archived lock");
      }
      await fs.unlink(stalePath);
    }
  }
  throw new Error("Could not acquire the completion-loop lock after stale-lock recovery");
}

function sleep(milliseconds, signal) {
  return new Promise(resolve => {
    let timer;
    const finish = cancelled => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(cancelled);
    };
    const onAbort = () => finish(true);
    if (signal?.aborted) return finish(true);
    timer = setTimeout(() => finish(false), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readVerificationArtifacts(root, output) {
  const reportLines = [...output.matchAll(/^Report:\s*(.+\/report\.md)\s*$/gm)];
  const reportMarkdownPath = reportLines.at(-1)?.[1];
  if (!reportMarkdownPath) throw new Error("The verification runner did not print a report path");
  const reportPath = path.resolve(reportMarkdownPath);
  if (!within(root, reportPath)) throw new Error("The verification report path escaped the isolated worktree");
  const runDirectory = await fs.realpath(path.dirname(reportPath));
  const reportRealPath = await fs.realpath(reportPath);
  if (!within(root, runDirectory) || !within(runDirectory, reportRealPath)) {
    throw new Error("The verification report resolved outside its isolated run directory");
  }
  const reportBytes = await readRegularFile(path.join(runDirectory, "report.json"), MAX_ARTIFACT_BYTES, "Verification report");
  const learningBytes = await readRegularFile(path.join(runDirectory, "learning.json"), MAX_ARTIFACT_BYTES, "Learning summary");
  let report;
  let learning;
  try {
    report = JSON.parse(reportBytes.toString("utf8"));
    learning = JSON.parse(learningBytes.toString("utf8"));
  } catch {
    throw new Error("The verification or learning report is not valid JSON");
  }
  if (!verifyReport(report)) throw new Error("The verification report integrity check failed");
  if (!isSealed(learning)) throw new Error("The learning summary integrity check failed");
  return { report, learning, runDirectory };
}

export async function runVerificationCycle({
  root,
  cycleNumber,
  mode = "full",
  signal,
  timeoutMs = mode === "full" ? FULL_RUN_TIMEOUT_MS : DEV_RUN_TIMEOUT_MS,
} = {}) {
  if (!["full", "dev"].includes(mode)) throw new Error("Completion-loop verification mode must be full or dev");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > FULL_RUN_TIMEOUT_MS) {
    throw new Error(`Verification timeout must be between 1000ms and ${FULL_RUN_TIMEOUT_MS}ms`);
  }
  const directory = await ensurePrivateDirectory(root);
  const cycleId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${cycleNumber}-${randomUUID()}`;
  const logPath = path.join(directory, "cycles", cycleId, "verification.log");
  const verifierPath = path.join(root, "scripts/testing/repository-verification.mjs");
  const execution = await runOwned(process.execPath, [verifierPath, mode], {
    cwd: root,
    timeoutMs,
    logPath,
    env: cleanEnvironment(),
    signal,
  });
  const base = {
    cycleId,
    mode,
    execution: {
      status: execution.status,
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      interrupted: execution.interrupted,
      durationMs: execution.durationMs,
      log: path.relative(root, execution.log),
      logSha256: execution.logSha256,
    },
  };
  if (execution.interrupted || signal?.aborted) {
    return {
      ...base,
      readiness: { ready: false, status: "CANCELLED", blockers: ["verification:cancelled"] },
      sourceIdentity: null,
      reportSha256: null,
      runDirectory: null,
    };
  }
  if (execution.logSha256 === null || !/^[a-f0-9]{64}$/.test(execution.logSha256)) {
    return {
      ...base,
      readiness: { ready: false, status: "NOT_READY", blockers: ["verification:log-integrity-unavailable"] },
      sourceIdentity: null,
      reportSha256: null,
      runDirectory: null,
    };
  }
  let artifacts;
  try {
    artifacts = await readVerificationArtifacts(root, execution.output);
  } catch {
    return {
      ...base,
      readiness: {
        ready: false,
        status: "NOT_READY",
        blockers: [`verification:${execution.timedOut ? "timeout" : execution.status.toLowerCase()}`, "verification:report-unavailable-or-invalid"],
      },
      sourceIdentity: null,
      reportSha256: null,
      runDirectory: null,
    };
  }
  return {
    ...base,
    readiness: evaluateProductionReadiness(artifacts.report, artifacts.learning),
    sourceIdentity: artifacts.report.sourceIdentity,
    reportSha256: artifacts.report.integrity.reportSha256,
    runDirectory: path.relative(root, artifacts.runDirectory),
  };
}

export async function runCompletionLoop({
  root,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxCycles = null,
  mode = "full",
  approvedPlanPath = null,
  expectedPlanSha256 = null,
  signal,
  runCycle = runVerificationCycle,
  runPlan = runApprovedPlan,
} = {}) {
  root = await fs.realpath(path.resolve(root));
  if (!Number.isSafeInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new Error(`Loop interval must be between ${MIN_INTERVAL_MS}ms and ${MAX_INTERVAL_MS}ms`);
  }
  if (maxCycles !== null && (!Number.isSafeInteger(maxCycles) || maxCycles < 1 || maxCycles > 10_000)) {
    throw new Error("maxCycles must be an integer between 1 and 10000");
  }
  if (mode !== "full" && !(mode === "dev" && maxCycles !== null)) {
    throw new Error("Only full verification may run indefinitely; dev mode requires a finite --max-cycles");
  }
  if ((approvedPlanPath === null) !== (expectedPlanSha256 === null)) {
    throw new Error("An approved plan path and its exact --plan-sha256 must be supplied together");
  }
  if (approvedPlanPath && mode !== "full") {
    throw new Error("Approved source changes may be applied only before a full verification loop");
  }
  const approvedPlan = approvedPlanPath
    ? await readApprovedPlan(root, approvedPlanPath, expectedPlanSha256)
    : null;
  await ensurePrivateDirectory(root);
  const prior = await readLoopState(root);
  let state = prior ?? {
    schemaVersion: 1,
    kind: "maxbooster-completion-loop-state",
    root,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "NOT_STARTED",
    cycleCount: 0,
    cycles: [],
    appliedPlans: [],
    lastReadiness: { ready: false, status: "NOT_RUN", blockers: ["verification:not-run"] },
    lastSourceIdentity: null,
    lastReportSha256: null,
    nextWakeAt: null,
  };
  state = { ...state, status: "RUNNING", nextWakeAt: null };
  await writeLoopState(root, state);
  let invocationCycles = 0;
  let plansAppliedThisInvocation = 0;
  if (approvedPlan) {
    const priorAttempt = state.appliedPlans.find(item => item.sha256 === approvedPlan.sha256);
    if (!priorAttempt) {
      const attempt = {
        sha256: approvedPlan.sha256,
        path: path.relative(root, approvedPlan.path),
        status: "APPLYING",
        startedAt: new Date().toISOString(),
        result: null,
      };
      state = { ...state, appliedPlans: [...state.appliedPlans, attempt] };
      await writeLoopState(root, state);
      let result;
      try {
        result = await runPlan({ root, plan: approvedPlan, signal });
      } catch {
        result = { status: "FAILED", exitCode: null, interrupted: false, log: null, logSha256: null };
      }
      const verified = ["APPLIED_VERIFIED", "ALREADY_APPLIED_VERIFIED"].includes(result.status) &&
        result.exitCode === 0 && result.interrupted !== true;
      const finalAttempt = {
        ...attempt,
        status: verified ? result.status : result.status === "INTERRUPTED" ? "INTERRUPTED" : "FAILED",
        completedAt: new Date().toISOString(),
        result,
      };
      state = {
        ...state,
        appliedPlans: [...state.appliedPlans.slice(0, -1), finalAttempt],
      };
      await writeLoopState(root, state);
      if (verified) plansAppliedThisInvocation++;
      if (signal?.aborted || result.interrupted === true) {
        state = { ...state, status: "CANCELLED", nextWakeAt: null };
        await writeLoopState(root, state);
        return {
          status: "CANCELLED",
          exitCode: 130,
          cyclesThisInvocation: invocationCycles,
          plansAppliedThisInvocation,
          statePath: path.relative(root, statePath(root)),
        };
      }
    }
  }
  while (true) {
    if (signal?.aborted) {
      state = { ...state, status: "CANCELLED", nextWakeAt: null };
      await writeLoopState(root, state);
      return { status: "CANCELLED", exitCode: 130, cyclesThisInvocation: invocationCycles, plansAppliedThisInvocation, statePath: path.relative(root, statePath(root)) };
    }
    invocationCycles++;
    state = { ...state, status: "RUNNING", nextWakeAt: null };
    await writeLoopState(root, state);
    let cycle;
    try {
      cycle = await runCycle({ root, cycleNumber: state.cycleCount + 1, mode, signal });
    } catch {
      cycle = {
        cycleId: `${Date.now()}-${state.cycleCount + 1}`,
        mode,
        execution: { status: "FAIL", exitCode: null, timedOut: false, interrupted: false, durationMs: 0, log: null, logSha256: null },
        readiness: { ready: false, status: "NOT_READY", blockers: ["verification:cycle-failed"] },
        sourceIdentity: null,
        reportSha256: null,
        runDirectory: null,
      };
    }
    const cycleRecord = {
      cycleId: cycle.cycleId,
      mode: cycle.mode,
      completedAt: new Date().toISOString(),
      execution: cycle.execution,
      readiness: cycle.readiness,
      sourceIdentity: cycle.sourceIdentity,
      reportSha256: cycle.reportSha256,
      runDirectory: cycle.runDirectory,
    };
    state = {
      ...state,
      cycleCount: state.cycleCount + 1,
      cycles: [...state.cycles, cycleRecord].slice(-MAX_CYCLE_HISTORY),
      lastReadiness: cycle.readiness,
      lastSourceIdentity: cycle.sourceIdentity,
      lastReportSha256: cycle.reportSha256,
      lastRunDirectory: cycle.runDirectory,
      nextWakeAt: null,
    };
    if (cycle.readiness?.ready === true && cycle.readiness.status === "READY") {
      state = { ...state, status: "READY" };
      await writeLoopState(root, state);
      return { status: "READY", exitCode: 0, cyclesThisInvocation: invocationCycles, plansAppliedThisInvocation, statePath: path.relative(root, statePath(root)) };
    }
    if (signal?.aborted || cycle.readiness?.status === "CANCELLED") {
      state = { ...state, status: "CANCELLED" };
      await writeLoopState(root, state);
      return { status: "CANCELLED", exitCode: 130, cyclesThisInvocation: invocationCycles, plansAppliedThisInvocation, statePath: path.relative(root, statePath(root)) };
    }
    if (maxCycles !== null && invocationCycles >= maxCycles) {
      state = { ...state, status: "LIMIT_REACHED" };
      await writeLoopState(root, state);
      return { status: "LIMIT_REACHED", exitCode: 2, cyclesThisInvocation: invocationCycles, plansAppliedThisInvocation, statePath: path.relative(root, statePath(root)) };
    }
    state = {
      ...state,
      status: "WAITING_FOR_VERIFIED_REMEDIATION",
      nextWakeAt: new Date(Date.now() + intervalMs).toISOString(),
    };
    await writeLoopState(root, state);
    if (await sleep(intervalMs, signal)) {
      state = { ...state, status: "CANCELLED", nextWakeAt: null };
      await writeLoopState(root, state);
      return { status: "CANCELLED", exitCode: 130, cyclesThisInvocation: invocationCycles, plansAppliedThisInvocation, statePath: path.relative(root, statePath(root)) };
    }
  }
}

function parseArgs(args) {
  const options = {
    root: DEFAULT_ROOT,
    sourceRoot: DEFAULT_ROOT,
    intervalMs: DEFAULT_INTERVAL_MS,
    maxCycles: null,
    mode: "full",
    approvedPlanPath: null,
    expectedPlanSha256: null,
    initializeIsolated: false,
    help: false,
  };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--initialize-isolated") options.initializeIsolated = true;
    else if (["--root", "--source-root", "--interval-ms", "--max-cycles", "--verification-mode"].includes(argument) &&
        args[index + 1]) {
      const value = args[++index];
      if (argument === "--root") options.root = path.resolve(value);
      else if (argument === "--source-root") options.sourceRoot = path.resolve(value);
      else if (argument === "--interval-ms") options.intervalMs = Number(value);
      else if (argument === "--max-cycles") options.maxCycles = Number(value);
      else options.mode = value;
    } else if (argument === "--approved-plan" && args[index + 1]) {
      options.approvedPlanPath = args[++index];
    } else if (argument === "--plan-sha256" && args[index + 1]) {
      options.expectedPlanSha256 = args[++index];
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (options.initializeIsolated && options.maxCycles !== null) {
    throw new Error("--initialize-isolated cannot be combined with a loop run");
  }
  if ((options.approvedPlanPath === null) !== (options.expectedPlanSha256 === null)) {
    throw new Error("--approved-plan and --plan-sha256 must be supplied together");
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(`completion-loop: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log("Usage: npm run completion:loop -- --root <isolated-worktree> [--approved-plan <plan.json> --plan-sha256 <sha256>] [--interval-ms 900000] [--max-cycles N]");
    console.log("Initialize first with --initialize-isolated --root <worktree> --source-root <primary-worktree>.");
    console.log("The default full loop repeats until fresh evidence satisfies every production gate or SIGINT/SIGTERM cancels it.");
    console.log("Only proposal-first analysis runs by default. An explicitly approved plan may be applied once through the hash-pinned executor.");
    return 0;
  }
  try {
    if (options.initializeIsolated) {
      const result = await initializeIsolatedCopy({ root: options.root, sourceRoot: options.sourceRoot });
      console.log(`Isolated copy ${result.status}: ${result.path}`);
      return 0;
    }
    const isolation = await verifyIsolatedCopy(options.root);
    const controller = new AbortController();
    const abort = () => {
      if (!controller.signal.aborted) controller.abort();
    };
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    let release;
    try {
      release = await acquireLoopLock(isolation.root);
      const result = await runCompletionLoop({
        root: isolation.root,
        intervalMs: options.intervalMs,
        maxCycles: options.maxCycles,
        mode: options.mode,
        approvedPlanPath: options.approvedPlanPath
          ? (path.isAbsolute(options.approvedPlanPath)
            ? options.approvedPlanPath
            : path.resolve(isolation.root, options.approvedPlanPath))
          : null,
        expectedPlanSha256: options.expectedPlanSha256,
        signal: controller.signal,
      });
      console.log(`Completion loop ${result.status}; cycles this invocation=${result.cyclesThisInvocation}; plans applied=${result.plansAppliedThisInvocation}; state=${result.statePath}`);
      return result.exitCode;
    } finally {
      await release?.();
      process.off("SIGINT", abort);
      process.off("SIGTERM", abort);
    }
  } catch (error) {
    console.error(`completion-loop: ${error.message}`);
    return 1;
  }
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then(code => { process.exitCode = code; })
    .catch(() => { console.error("completion-loop: execution failed"); process.exitCode = 1; });
}
