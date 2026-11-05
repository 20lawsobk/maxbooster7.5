#!/usr/bin/env node
/**
 * Whole-repository, fail-closed ASO verification controller.
 * "Full" means invoking the repository's exhaustive test machinery plus release
 * checks. It does NOT imply that every file or external provider is certified.
 * Never calls deploy, db:push, real provider mutation, or production endpoints.
 */
import fs from "node:fs";
import path from "node:path";
import {ROOT, DEFAULT_OUTPUT, inventory, execute, writeJson, sha, git,
        option, externalEvidence, readJson} from "./common.mjs";

const argv = process.argv.slice(2);
const mode = option(argv, "--mode", "full");
if (!["inventory", "quick", "full"].includes(mode)) throw new Error("Expected --mode inventory|quick|full");
const out = path.resolve(option(argv, "--output", DEFAULT_OUTPUT));
if (!out.startsWith(ROOT + path.sep)) throw new Error("Output must be inside the repository (normally ignored reports/aso)");
const evidence = option(argv, "--release-evidence", "");
const jobs = {
  quick: [
    ["types-server", ["npm", "run", "check:server"], 15 * 60_000],
    ["types-client", ["npm", "run", "check:client"], 15 * 60_000],
    ["lint", ["npm", "run", "lint"], 20 * 60_000],
    ["security", ["npm", "run", "security:audit"], 10 * 60_000],
    ["runtime-contracts", ["npm", "run", "test:runtime-contracts"], 15 * 60_000],
  ],
  full: [
    ["types", ["npm", "run", "check"], 25 * 60_000],
    ["lint", ["npm", "run", "lint"], 25 * 60_000],
    ["security", ["npm", "run", "security:audit"], 15 * 60_000],
    // run-all discovers Node, Python, external services, page coverage, and
    // operations; no --stripe-test-api opt-in is given.
    ["exhaustive-test-register", ["npm", "run", "test:master"], 100 * 60_000],
    ["build", ["npm", "run", "build"], 35 * 60_000],
    ["readiness-gauge", ["npm", "run", "readiness-gauge", "--", "--profile", "media", "--release-gate"], 50 * 60_000],
    ["page-and-feature-launch", ["python3", "scripts/testing/launch-readiness-audit.py", "--require-green"], 10 * 60_000],
  ],
};
const scope = inventory();
const beforeStatus = git(["status", "--porcelain", "--untracked-files=normal"]);
writeJson(path.join(out, "inventory.json"), {
  ...scope, disclaimer: "All tracked files are inventoried. Inventory is not proof of individual review or functional coverage.",
});
const result = {
  schemaVersion: 1, mode, createdAt: new Date().toISOString(), revision: scope.revision,
  inventoryCount: scope.count, inventoryGroups: scope.counts,
  inventorySha256: sha(scope.files.map(x => x.path + "\0" + x.mode + "\0" + x.blob).join("\n")),
  missingTrackedPaths: scope.missing, specialIndexEntries: scope.special,
  sourceCleanBefore: beforeStatus === "", executed: [], failures: [],
  releaseEvidence: {valid: false, reason: "Not evaluated"},
  releaseReady: false, status: "NO_GO",
  coverageNotes: [
    "100% Git-index enumeration; NOT 100% tested lines, branches, runtime paths, or user workflows.",
    "Entire repo includes external AI/PDIM, automation, tests, infrastructure, media and application code.",
    "Desktop/mobile files inventoried; their separate release workflow status is not a web/API launch gate.",
    "Real customer-facing provider checks and load/soak require separate disposable/staging evidence.",
    "Passing checks do not establish SOC 2 or other legal certification.",
  ],
};
try {
  if (scope.missing.length) result.failures.push("Some tracked files are absent from this checkout");
  if (scope.special.some(x => x.mode === "160000")) result.failures.push("Git submodules require separately verified checkouts");
  if (mode !== "inventory") {
    for (const [id, command, timeout] of jobs[mode]) {
      console.log("[ASO verify]", mode, id, "running");
      const row = await execute(id, command, path.join(out, "logs"), timeout);
      result.executed.push(row);
      if (row.status !== "pass") result.failures.push(id + ": failed/timeout/blocked; see local log");
      writeJson(path.join(out, "report.json"), result);
      console.log("[ASO verify]", id, row.status, "after", row.durationMs, "ms");
    }
  }
  const afterStatus = git(["status", "--porcelain", "--untracked-files=normal"]);
  const afterRev = git(["rev-parse", "HEAD"]);
  result.sourceUnchanged = beforeStatus === afterStatus && afterRev === scope.revision;
  result.sourceCleanAfter = afterStatus === "";
  if (!result.sourceUnchanged) result.failures.push("Tracked/untracked source state changed during verification");
  if (mode === "full" && !result.sourceCleanAfter) result.failures.push("Final release verification needs a clean worktree");
  result.releaseEvidence = externalEvidence(evidence, afterRev);
  if (mode === "full" && !result.releaseEvidence.valid) {
    result.failures.push("External acceptance/approval evidence missing or invalid");
  }
  result.gatesPassed = mode !== "inventory" && result.executed.length === jobs[mode].length &&
    result.executed.every(row => row.status === "pass") && scope.missing.length === 0 &&
    !scope.special.some(x => x.mode === "160000") && result.sourceUnchanged;
  result.releaseReady = mode === "full" && result.gatesPassed && result.sourceCleanAfter &&
    result.releaseEvidence.valid && result.failures.length === 0;
  result.status = result.releaseReady ? "LOCALLY_GATED_WITH_OPERATOR_EVIDENCE" :
    result.gatesPassed ? "CHECKS_PASSED_NOT_RELEASE_APPROVED" : "NO_GO";
  result.failureFingerprint = sha(result.failures.slice().sort().join("\n"));
} catch (error) {
  result.failures.push("Verifier exception: " + error.message);
  result.status = "NO_GO";
  console.error(error.message);
} finally {
  result.finishedAt = new Date().toISOString();
  writeJson(path.join(out, "report.json"), result);
  console.log(JSON.stringify({status: result.status, mode, revision: result.revision,
    trackedFiles: result.inventoryCount, failedGates: result.failures,
    report: path.relative(ROOT, path.join(out, "report.json"))}));
}
if (result.releaseReady) process.exitCode = 0;
else if (mode === "inventory" && result.failures.length === 0) process.exitCode = 0;
else if (mode === "quick" && result.gatesPassed) process.exitCode = 0;
else process.exitCode = 1;
