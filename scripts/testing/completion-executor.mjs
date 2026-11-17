#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory, cleanEnvironment, runOwned, sealReport } from "./repository-verification.mjs";
import { verifyAcceptedProposalLink } from "./completion-proposal-feedback.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const MAX_PLAN_BYTES = 10 * 1024 * 1024;
const MAX_CHANGE_BYTES = 2 * 1024 * 1024;
const MAX_CHANGES = 50;
const RUNS_ROOT = ".local/repository-verification/completion-runs";
const CHECKS = new Map([
  ["check:server", 10 * 60_000],
  ["check:client", 10 * 60_000],
  ["lint", 10 * 60_000],
  ["test:runtime-contracts", 20 * 60_000],
  ["test:unit", 60 * 60_000],
  ["test:ci", 90 * 60_000],
]);
const SECRET_PATTERN = /(?:sk_(?:live|test)_|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/;
const FORBIDDEN_PATH_PARTS = new Set([
  ".git", ".local", "node_modules", "dist", "coverage", "generated-artifacts",
  "archive-capsules", "attached_assets",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function atomicWrite(file, content, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { flag: "wx", mode });
  await fs.chmod(temporary, mode);
  await fs.rename(temporary, file);
}

async function readPlan(planPath) {
  const realPath = await fs.realpath(planPath);
  const stat = await fs.stat(realPath);
  if (!stat.isFile() || stat.size > MAX_PLAN_BYTES) {
    throw new Error(`Plan must be a regular file no larger than ${MAX_PLAN_BYTES} bytes`);
  }
  const raw = await fs.readFile(realPath);
  let plan;
  try {
    plan = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new Error(`Completion plan is not valid JSON: ${error.message}`);
  }
  return { realPath, raw, plan, sha256: sha256(raw) };
}

function validateRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 ||
      relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
    throw new Error("Change paths must be non-empty repository-relative POSIX paths");
  }
  const parts = relativePath.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || FORBIDDEN_PATH_PARTS.has(part))) {
    throw new Error(`Unsafe or generated path is not eligible for automated changes: ${relativePath}`);
  }
  if (parts.some(part => /^\.env(?:\.|$)/i.test(part) || /^(?:secrets?|credentials?)$/i.test(part))) {
    throw new Error(`Secrets and credential paths cannot be changed by the completion executor: ${relativePath}`);
  }
  return parts;
}

function validatePlan(plan) {
  if (!plan || plan.schemaVersion !== 1 || !plan.sourceIdentity ||
      !Array.isArray(plan.changes) || !Array.isArray(plan.checks)) {
    throw new Error("Plan must use schemaVersion 1 and include sourceIdentity, changes, and checks arrays");
  }
  if (plan.changes.length < 1 || plan.changes.length > MAX_CHANGES) {
    throw new Error(`Plan must contain between 1 and ${MAX_CHANGES} file changes`);
  }
  if (plan.checks.length < 1 || plan.checks.some(check => !check || !CHECKS.has(check.script))) {
    throw new Error(`Plan checks must use only: ${[...CHECKS.keys()].join(", ")}`);
  }
  if (plan.proposalLink !== undefined &&
      (!plan.proposalLink || plan.proposalLink.schemaVersion !== 1 ||
       typeof plan.proposalLink.proposalId !== "string" ||
       typeof plan.proposalLink.proposalKey !== "string" ||
       typeof plan.proposalLink.approvalDecisionId !== "string")) {
    throw new Error("proposalLink must contain a versioned accepted-proposal reference");
  }
  const ids = new Set();
  const paths = new Set();
  let totalBytes = 0;
  for (const change of plan.changes) {
    if (!change || typeof change.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(change.id) ||
        ids.has(change.id)) throw new Error("Every change needs a unique safe id");
    ids.add(change.id);
    const parts = validateRelativePath(change.path);
    if (paths.has(change.path)) throw new Error(`Duplicate change path: ${change.path}`);
    paths.add(change.path);
    if (!["replace", "add"].includes(change.operation)) {
      throw new Error(`Unsupported operation for ${change.id}; only replace and add are allowed`);
    }
    if (typeof change.content !== "string" || Buffer.byteLength(change.content) > MAX_CHANGE_BYTES) {
      throw new Error(`Change ${change.id} must contain text no larger than ${MAX_CHANGE_BYTES} bytes`);
    }
    totalBytes += Buffer.byteLength(change.content);
    if (totalBytes > MAX_PLAN_BYTES) throw new Error("Total patch content exceeds the plan size limit");
    if (SECRET_PATTERN.test(change.content)) throw new Error(`Secret-like material detected in ${change.path}`);
    const contentHash = sha256(change.content);
    if (!/^[a-f0-9]{64}$/.test(change.afterSha256 ?? "") || contentHash !== change.afterSha256) {
      throw new Error(`afterSha256 does not match supplied content for ${change.path}`);
    }
    if (change.operation === "replace" && !/^[a-f0-9]{64}$/.test(change.beforeSha256 ?? "")) {
      throw new Error(`Replacement ${change.path} requires a SHA-256 beforeSha256`);
    }
    if (change.operation === "add" && change.beforeSha256 !== null) {
      throw new Error(`New file ${change.path} must have beforeSha256: null`);
    }
    if (parts.length > 1 && parts.slice(0, -1).some(part => FORBIDDEN_PATH_PARTS.has(part))) {
      throw new Error(`Change path enters a protected directory: ${change.path}`);
    }
  }
  const checkIds = new Set();
  for (const check of plan.checks) {
    if (typeof check.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(check.id) ||
        checkIds.has(check.id)) throw new Error("Every verification check needs a unique safe id");
    checkIds.add(check.id);
  }
  if (typeof plan.sourceIdentity.revision !== "string" ||
      !/^[a-f0-9]{40,64}$/.test(plan.sourceIdentity.revision) ||
      !/^[a-f0-9]{64}$/.test(plan.sourceIdentity.inputInventorySha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(plan.sourceIdentity.dirtyInputSha256 ?? "")) {
    throw new Error("Plan sourceIdentity must contain a Git revision and complete input hashes");
  }
}

function git(root, args) {
  const child = spawnSync("git", args, {
    cwd: root, encoding: "utf8", timeout: 10_000,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "/tmp", LANG: "C" },
  });
  if (child.error) throw new Error(`git ${args.join(" ")} failed: ${child.error.message}`);
  if (child.status !== 0) throw new Error(`git ${args.join(" ")} exited ${child.status}: ${child.stderr.trim()}`);
  return child.stdout;
}

function statusPaths(root) {
  const raw = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return raw.split("\0").filter(Boolean).map(row => row.slice(3));
}

async function resolveChange(root, change) {
  const parts = validateRelativePath(change.path);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink paths are not eligible: ${change.path}`);
      if (current !== path.join(root, ...parts) && !stat.isDirectory()) {
        throw new Error(`Parent path is not a directory: ${change.path}`);
      }
      if (current === path.join(root, ...parts) && !stat.isFile()) {
        throw new Error(`Change target is not a regular file: ${change.path}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (current === path.join(root, ...parts)) return { absolute: current, exists: false, mode: 0o644 };
      throw new Error(`Parent directory does not exist: ${change.path}`);
    }
  }
  const stat = await fs.stat(current);
  return { absolute: current, exists: true, mode: stat.mode & 0o777 };
}

async function currentHash(target) {
  if (!target.exists) return null;
  return sha256(await fs.readFile(target.absolute));
}

async function writeJournal(journalPath, journal) {
  await atomicWrite(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
}

async function rollbackChanges(applied, journal, journalPath) {
  const errors = [];
  for (const row of [...applied].reverse()) {
    try {
      const target = await resolveChange(journal.repositoryRoot, row.change);
      const hash = await currentHash(target);
      if (hash !== row.change.afterSha256) {
        throw new Error(`Refusing to overwrite changed file ${row.change.path} during rollback`);
      }
      if (row.change.operation === "add") {
        await fs.unlink(target.absolute);
      } else {
        const backup = await fs.readFile(row.backupPath);
        if (sha256(backup) !== row.change.beforeSha256) {
          throw new Error(`Backup integrity check failed for ${row.change.path}`);
        }
        await atomicWrite(target.absolute, backup, row.mode);
      }
      row.journalRow.state = "rolled_back";
      await writeJournal(journalPath, journal);
    } catch (error) {
      row.journalRow.state = "rollback_failed";
      row.journalRow.error = error.message;
      errors.push(`${row.change.path}: ${error.message}`);
      await writeJournal(journalPath, journal).catch(() => {});
    }
  }
  return errors;
}

async function executeChecks(plan, root, runDirectory, signal, runCheck = runOwned) {
  const outcomes = [];
  for (const check of plan.checks) {
    const timeoutMs = CHECKS.get(check.script);
    const command = "npm";
    const args = ["run", check.script];
    const result = await runCheck(command, args, {
      cwd: root,
      timeoutMs,
      logPath: path.join(runDirectory, "logs", `${check.id.replaceAll("/", "_")}.log`),
      env: cleanEnvironment(),
      signal,
    });
    outcomes.push({
      id: check.id,
      script: check.script,
      status: result.status,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      interrupted: result.interrupted,
      durationMs: result.durationMs,
      log: result.log,
      logSha256: result.logSha256,
      output: result.output,
    });
    if (result.status !== "PASS") break;
  }
  return outcomes;
}

function newRunDirectory(root) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(root, RUNS_ROOT, `${stamp}-${process.pid}-${randomUUID()}`);
}

export async function executeCompletionPlan({
  root = DEFAULT_ROOT,
  planPath,
  expectedPlanSha256,
  apply = false,
  signal,
  runCheck = runOwned,
  env = {},
} = {}) {
  if (!planPath) throw new Error("--plan is required");
  root = path.resolve(root);
  const { realPath, raw, plan, sha256: actualPlanSha } = await readPlan(planPath);
  validatePlan(plan);
  const proposalLink = plan.proposalLink
    ? await verifyAcceptedProposalLink({
      root,
      proposalLink: plan.proposalLink,
      sourceIdentity: plan.sourceIdentity,
      env,
    })
    : null;
  if (apply && expectedPlanSha256 !== actualPlanSha) {
    throw new Error("Applying requires --plan-sha256 to exactly match the plan file's SHA-256");
  }
  if (expectedPlanSha256 && expectedPlanSha256 !== actualPlanSha) {
    throw new Error("Plan SHA-256 does not match --plan-sha256");
  }
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  if (head !== plan.sourceIdentity.revision) {
    throw new Error(`Plan revision ${plan.sourceIdentity.revision} does not match current HEAD ${head}`);
  }

  const runDirectory = newRunDirectory(root);
  const journalPath = path.join(runDirectory, "journal.json");
  const reportPath = path.join(runDirectory, "report.json");
  await fs.mkdir(path.join(runDirectory, "logs"), { recursive: true });
  const report = {
    schemaVersion: 1,
    mode: apply ? "apply" : "dry-run",
    status: "BLOCKED",
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    repositoryRoot: root,
    planPath: path.relative(root, realPath),
    planSha256: actualPlanSha,
    sourceIdentity: plan.sourceIdentity,
    proposalLink,
    changes: [],
    checks: [],
    externalPrerequisites: [
      { id: "whole-product-e2e", status: "UNVERIFIED", reason: "Only the exact local changes and checks in this plan can be executed; provider, deployment, hardware and other product journeys are not inferred." },
    ],
    reportPath,
    journalPath,
  };
  let inventory;
  try {
    inventory = await buildInventory(root);
  } catch (error) {
    throw new Error(`Could not verify current repository inputs: ${error.message}`);
  }
  const planMatchesCurrent = inventory.sourceIdentity.inputInventorySha256 === plan.sourceIdentity.inputInventorySha256 &&
    inventory.sourceIdentity.dirtyInputSha256 === plan.sourceIdentity.dirtyInputSha256;
  const currentTargets = [];
  for (const change of plan.changes) {
    const target = await resolveChange(root, change);
    const hash = await currentHash(target);
    currentTargets.push({ change, target, hash });
  }
  const allAlreadyApplied = currentTargets.every(row => row.hash === row.change.afterSha256);
  const dirtyPaths = statusPaths(root);
  const allowedDirty = new Set(plan.changes.map(change => change.path));
  const onlyPlanPathsDirty = dirtyPaths.every(file => allowedDirty.has(file));
  const worktreeClean = dirtyPaths.length === 0;

  if (!planMatchesCurrent && !allAlreadyApplied) {
    report.status = "BLOCKED";
    report.blockReason = "The source input hashes no longer match the plan; regenerate it from the current checkout.";
  } else if (apply && !allAlreadyApplied && !worktreeClean) {
    report.status = "BLOCKED";
    report.blockReason = `Apply requires a clean worktree; found ${dirtyPaths.length} changed or untracked paths.`;
  } else if (apply && allAlreadyApplied && !onlyPlanPathsDirty) {
    report.status = "BLOCKED";
    report.blockReason = "The requested changes are already present, but unrelated worktree changes prevent safe idempotent verification.";
  } else {
    report.status = apply ? (allAlreadyApplied ? "ALREADY_APPLIED" : "APPLYING") : "DRY_RUN_READY";
  }

  const journal = {
    schemaVersion: 1,
    status: report.status,
    repositoryRoot: root,
    planSha256: actualPlanSha,
    changes: [],
  };
  const applied = [];
  await writeJournal(journalPath, journal);
  if (report.status === "APPLYING") {
    journal.status = "applying";
    for (const { change, target, hash } of currentTargets) {
      if (change.operation === "add" && target.exists) {
        report.status = "BLOCKED";
        report.blockReason = `New-file target already exists: ${change.path}`;
        break;
      }
      if (change.operation === "replace" && (!target.exists || hash !== change.beforeSha256)) {
        report.status = "BLOCKED";
        report.blockReason = `Current bytes do not match beforeSha256 for ${change.path}`;
        break;
      }
    }
    if (report.status === "APPLYING") {
      for (let index = 0; index < currentTargets.length; index++) {
        const { change, target, hash } = currentTargets[index];
        const backupPath = change.operation === "replace"
          ? path.join(runDirectory, "backups", `${String(index).padStart(3, "0")}.bak`)
          : null;
        const row = { id: change.id, change, state: "prepared", backupPath, mode: target.mode };
        journal.changes.push(row);
        await writeJournal(journalPath, journal);
        try {
          if (backupPath) {
            await fs.mkdir(path.dirname(backupPath), { recursive: true });
            const before = await fs.readFile(target.absolute);
            if (sha256(before) !== hash) throw new Error(`Source changed while backing up ${change.path}`);
            await fs.writeFile(backupPath, before, { flag: "wx", mode: 0o600 });
            if (sha256(await fs.readFile(backupPath)) !== change.beforeSha256) {
              throw new Error(`Backup verification failed for ${change.path}`);
            }
          }
          await atomicWrite(target.absolute, change.content, target.mode);
          applied.push({ change, backupPath, mode: target.mode, journalRow: row });
          if (sha256(await fs.readFile(target.absolute)) !== change.afterSha256) {
            throw new Error(`Post-write hash verification failed for ${change.path}`);
          }
          row.state = "applied";
          await writeJournal(journalPath, journal);
          report.changes.push({ id: change.id, path: change.path, status: "APPLIED", beforeSha256: hash, afterSha256: change.afterSha256, backup: path.relative(root, backupPath ?? "") || null });
        } catch (error) {
          row.state = "apply_failed";
          row.error = error.message;
          report.changes.push({
            id: change.id,
            path: change.path,
            status: "APPLY_FAILED",
            beforeSha256: hash,
            afterSha256: change.afterSha256,
          });
          report.blockReason = error.message;
          report.status = "FAILED";
          await writeJournal(journalPath, journal);
          break;
        }
      }
    }
  } else {
    report.changes = currentTargets.map(({ change, hash }) => ({
      id: change.id,
      path: change.path,
      status: hash === change.afterSha256 ? "ALREADY_APPLIED" :
        hash === change.beforeSha256 || (change.operation === "add" && hash === null) ? "READY" : "CONFLICT",
      beforeSha256: hash,
      afterSha256: change.afterSha256,
    }));
    if (report.changes.some(change => change.status === "CONFLICT") && report.status !== "BLOCKED") {
      report.status = "BLOCKED";
      report.blockReason = "At least one target differs from both the recorded before-state and after-state.";
    }
  }

  const shouldVerify = report.status === "APPLYING" || report.status === "ALREADY_APPLIED";
  if (shouldVerify) {
    let inputsBeforeChecks;
    try {
      inputsBeforeChecks = await buildInventory(root);
      report.checks = await executeChecks(plan, root, runDirectory, signal, runCheck);
    } catch (error) {
      report.checks = [{
        id: "executor-check-runner",
        status: "FAIL",
        exitCode: null,
        timedOut: false,
        interrupted: Boolean(signal?.aborted),
        output: error.message,
      }];
    }
    let inputsAfterChecks;
    try {
      inputsAfterChecks = await buildInventory(root);
    } catch (error) {
      report.verificationSourceStability = { status: "FAIL", reason: error.message };
    }
    const sourceStable = Boolean(inputsBeforeChecks?.sourceIdentity && inputsAfterChecks?.sourceIdentity) &&
      inputsBeforeChecks.sourceIdentity.inputInventorySha256 === inputsAfterChecks.sourceIdentity.inputInventorySha256 &&
      inputsBeforeChecks.sourceIdentity.dirtyInputSha256 === inputsAfterChecks.sourceIdentity.dirtyInputSha256;
    if (!report.verificationSourceStability) {
      report.verificationSourceStability = {
        status: sourceStable ? "PASS" : "FAIL",
        before: inputsBeforeChecks?.sourceIdentity ?? null,
        after: inputsAfterChecks?.sourceIdentity ?? null,
        reason: sourceStable ? null : "Behavior-relevant inputs changed while checks were running.",
      };
    }
    const afterDirtyPaths = statusPaths(root);
    const unexpectedDirtyPaths = afterDirtyPaths.filter(file => !allowedDirty.has(file));
    const checksPassed = report.checks.length === plan.checks.length &&
      report.checks.every(check => check.status === "PASS");
    const filesMatch = await Promise.all(plan.changes.map(async change => {
      const target = await resolveChange(root, change);
      return (await currentHash(target)) === change.afterSha256;
    })).then(results => results.every(Boolean));
    if (checksPassed && filesMatch && sourceStable && unexpectedDirtyPaths.length === 0 && !signal?.aborted) {
      report.status = allAlreadyApplied ? "ALREADY_APPLIED_VERIFIED" : "APPLIED_VERIFIED";
      journal.status = "verified";
    } else {
      report.status = "FAILED";
      report.blockReason = signal?.aborted ? "Execution was interrupted." :
        !checksPassed ? "One or more required local verification commands failed or were unavailable." :
          !filesMatch ? "A planned file changed while verification ran." :
            !sourceStable ? "Behavior-relevant source inputs changed while verification ran." :
              unexpectedDirtyPaths.length ? `Verification changed unrelated worktree paths: ${unexpectedDirtyPaths.join(", ")}` :
                "Verification did not satisfy all acceptance conditions.";
      report.unexpectedDirtyPaths = unexpectedDirtyPaths;
      if (!allAlreadyApplied) {
        const rollbackErrors = await rollbackChanges(applied, journal, journalPath);
        report.rollback = {
          status: rollbackErrors.length ? "INCOMPLETE" : "COMPLETE",
          errors: rollbackErrors,
        };
        if (!rollbackErrors.length) {
          for (const change of report.changes) change.status = "ROLLED_BACK";
        }
        journal.status = rollbackErrors.length ? "rollback_incomplete" : "rolled_back";
      }
    }
    await writeJournal(journalPath, journal);
  } else if (apply && applied.length) {
    report.status = "FAILED";
    report.blockReason ??= "Changes could not be applied.";
    const rollbackErrors = await rollbackChanges(applied, journal, journalPath);
    report.rollback = { status: rollbackErrors.length ? "INCOMPLETE" : "COMPLETE", errors: rollbackErrors };
    if (!rollbackErrors.length) {
      for (const change of report.changes) change.status = "ROLLED_BACK";
    }
  }

  journal.status = report.status === "APPLIED_VERIFIED" || report.status === "ALREADY_APPLIED_VERIFIED"
    ? "verified"
    : report.rollback?.status === "INCOMPLETE" ? "rollback_incomplete" :
      report.rollback?.status === "COMPLETE" ? "rolled_back" : report.status.toLowerCase();
  await writeJournal(journalPath, journal);
  report.finishedAt = new Date().toISOString();
  const sealed = sealReport(report);
  await atomicWrite(reportPath, `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}

export { CHECKS, validatePlan, validateRelativePath };
