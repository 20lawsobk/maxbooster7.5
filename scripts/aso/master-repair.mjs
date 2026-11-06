#!/usr/bin/env node
/**
 * Complement to master-verify.mjs. Uses only the repository's reviewed
 * deployment-autofix handlers. Never fabricates missing integrations or edits
 * production data. Every change must improve independent verification.
 */
import path from "node:path";
import {execFileSync} from "node:child_process";
import {ROOT, DEFAULT_OUTPUT, option, readJson, writeJson, git, branch,
        revision, ensureRepairBranch, execute} from "./common.mjs";

const args = process.argv.slice(2);
const out = path.resolve(option(args, "--output", DEFAULT_OUTPUT));
if (!out.startsWith(ROOT + path.sep)) throw new Error("Output must be under this checkout");
const autoCommit = args.includes("--auto-commit");
const strategy = option(args, "--strategy", "verified-handlers");
const releaseProfile = option(args, "--release-profile", "public");
if (!["public","admin"].includes(releaseProfile)) throw new Error("Invalid release profile");
if (!["verified-handlers", "eslint-only"].includes(strategy)) throw new Error("Unknown safe strategy");
const baselinePath = path.join(out, "report.json");
const baseline = readJson(baselinePath);
const receiptPath = path.join(out, "repair.json");
const receipt = {schemaVersion: 1, startedAt: new Date().toISOString(),
  action: strategy, accepted: false, committed: false,
  errors: [], changed: [], baseline: baseline?.failureFingerprint ?? null,
  branch: null, revisionBefore: null, verify: null};
try {
  ensureRepairBranch();
  receipt.branch = branch();
  receipt.revisionBefore = revision();
  if (!baseline || baseline.mode !== "quick" || baseline.releaseProfile !== releaseProfile || baseline.revision !== receipt.revisionBefore ||
      baseline.sourceUnchanged !== true || baseline.sourceCleanAfter !== true) {
    throw new Error("A fresh, clean, quick ASO verification report is required before repairs");
  }
  if (baseline.gatesPassed) throw new Error("No failing quick gate to repair; run the full suite instead");
  const fix = await execute("apply-official-handlers",
    strategy === "eslint-only"
      ? ["npx", "eslint", ".", "--fix"]
      : ["node", "scripts/deployment-autofix.mjs"],
    path.join(out, "repair-logs"), 25 * 60_000);
  receipt.apply = fix;
  const changedRaw = execFileSync("git", ["diff", "--name-only", "-z"], {cwd: ROOT}).toString("utf8");
  receipt.changed = changedRaw.split("\0").filter(Boolean);
  // Tests, policy, deployment config, and security-critical behavior need
  // explicit human review, not a mechanically rewritten passing test.
  const protectedPath = /^(tests\/|test\/|\.github\/|scripts\/aso\/|docs\/|migrations\/|drizzle\/|package(-lock)?\.json$|\.replit$)|(^|\/)(auth|security|billing|payment|stripe|payout|royalt|subscription|secret|migration)(\/|[A-Z._-])/i;
  const risky = receipt.changed.filter(file => protectedPath.test(file));
  if (risky.length) throw new Error("Auto-repair touched review-required paths: " + risky.join(", "));
  if (!receipt.changed.length) throw new Error("Approved repair handlers made no tracked edits");
  // The verifier's fresh output must come from this actual checkout.
  const verification = await execute("quick-reverify",
    ["node", "scripts/aso/master-verify.mjs", "--mode", "quick", "--output", out,
      "--release-profile", releaseProfile],
    path.join(out, "repair-logs"), 70 * 60_000);
  receipt.verify = verification;
  const after = readJson(baselinePath);
  if (!after || after.revision !== receipt.revisionBefore ||
      !after.sourceUnchanged || !after.gatesPassed && !after.failures.length) {
    throw new Error("Reverification did not produce trustworthy current-source evidence");
  }
  const short = row => row.split(":")[0];
  const beforeFailed = new Set(baseline.failures.map(short));
  const afterFailed = new Set(after.failures.map(short));
  const newFailures = [...afterFailed].filter(id => !beforeFailed.has(id));
  if (newFailures.length) throw new Error("Regression introduced: " + newFailures.join(", "));
  if (afterFailed.size >= beforeFailed.size && !after.gatesPassed) {
    throw new Error("No proven reduction in failed verification gates");
  }
  if (verification.status !== "pass") {
    // A partially improved result is retained for human review only; no
    // automatic promotion with failed verification.
    throw new Error("Fresh quick verifier did not pass all gates");
  }
  if (autoCommit) {
    // Only tracked edits that passed independent verification are committed.
    execFileSync("git", ["add", "-u", "--", ...receipt.changed], {cwd: ROOT, stdio: "pipe"});
    execFileSync("git", ["commit", "-m", "fix(aso): verified mechanical repair"], {cwd: ROOT, stdio: "pipe"});
    receipt.committed = true;
    receipt.revisionAfter = revision();
  }
  receipt.accepted = true;
  if (!autoCommit) {
    receipt.errors.push("Verified changes remain uncommitted for review; rerunning a repair requires a clean worktree");
  }
} catch (error) {
  receipt.errors.push(error.message);
  // We explicitly required a clean ASO branch before using restore. A failed
  // repair may never leave partial source modifications behind.
  if (receipt.branch && !receipt.accepted) {
    try {
      execFileSync("git", ["restore", "--staged", "--worktree", "--", ":/"], {cwd: ROOT, stdio: "pipe"});
      receipt.rolledBack = true;
    } catch (rollbackError) {
      receipt.errors.push("ROLLBACK FAILED: " + rollbackError.message);
    }
  }
} finally {
  receipt.finishedAt = new Date().toISOString();
  writeJson(receiptPath, receipt);
  console.log(JSON.stringify({accepted: receipt.accepted, committed: receipt.committed,
    changedPaths: receipt.changed.length, errors: receipt.errors,
    receipt: path.relative(ROOT, receiptPath)}));
}
process.exitCode = receipt.accepted && receipt.committed ? 0 : 1;
