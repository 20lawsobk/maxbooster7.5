#!/usr/bin/env node
/**
 * ASO supervisor: verify -> repair -> verify until release-approved, blocked,
 * or budget exhausted. Not a production deployer.
 */
import path from "node:path";
import {ROOT, DEFAULT_OUTPUT, option, integerOption, execute, writeJson,
        readJson, revision, branch, clean} from "./common.mjs";

const args = process.argv.slice(2);
const out = path.resolve(option(args, "--output", DEFAULT_OUTPUT));
if (!out.startsWith(ROOT + path.sep)) throw new Error("ASO output must remain under this checkout");
const maxCycles = integerOption(args, "--max-cycles", 3, 100); // 0 = no cycle limit
const budgetMinutes = integerOption(args, "--budget-minutes", 240, 1440); // 0 = no time limit
const noProgressLimit = Math.max(1, integerOption(args, "--max-no-progress", 2, 10));
const autoRepair = args.includes("--auto-repair");
const autoCommit = args.includes("--auto-commit");
const releaseEvidence = option(args, "--release-evidence", "");
if (autoCommit && !autoRepair) throw new Error("--auto-commit requires --auto-repair");
if (autoRepair && (!branch().startsWith("aso/") || !clean())) {
  throw new Error("Autonomous repair requires a clean aso/ branch; never main or dirty worktrees");
}
const deadline = budgetMinutes ? Date.now() + budgetMinutes * 60_000 : Number.MAX_SAFE_INTEGER;
const stateFile = path.join(out, "supervisor.json");
const policyFile = path.join(out, "policy.json");
const state = {schemaVersion: 1, startedAt: new Date().toISOString(),
  initialRevision: revision(), autoRepair, autoCommit, maxCycles,
  budgetMinutes, cycles: [], verdict: "NO_GO", stopReason: null};
const policy = readJson(policyFile, {
  schemaVersion: 1, failureCounts: {}, strategyHistory: {},
  successfulRepairs: 0, failedRepairs: 0, noProgress: 0, lastFailedGates: [],
});
let interrupted = false;
process.on("SIGTERM", () => { interrupted = true; });
process.on("SIGINT", () => { interrupted = true; });
const remaining = () => Math.max(0, deadline - Date.now());
async function run(id, command, maximumMs) {
  if (remaining() === 0) throw new Error("Session time budget exhausted");
  const actual = Math.min(remaining(), maximumMs);
  return execute(id, command, path.join(out, "supervisor-logs"), actual);
}
const failedIds = report => (report?.failures ?? [])
  .map(x => String(x).split(":")[0]).filter(x => x !== "External acceptance/approval evidence missing or invalid");
function updateHistory(failed) {
  for (const id of failed) policy.failureCounts[id] = (policy.failureCounts[id] ?? 0) + 1;
  const same = failed.length > 0 && failed.slice().sort().join("|") ===
    policy.lastFailedGates.slice().sort().join("|");
  policy.noProgress = same ? policy.noProgress + 1 : 0;
  policy.lastFailedGates = failed;
}
function chooseStrategy(failures) {
  const ids = new Set(failures);
  if (![...ids].some(id => /^(lint|types-server|types-client)$/.test(id))) return null;
  if ([...ids].some(id => /^(security|runtime-contracts|Verifier exception)/.test(id))) return null;
  // Adapt: a single lint error is best addressed with the cheaper official
  // ESLint fixer; types require the existing position-verified handlers.
  const lintOnly = ids.size === 1 && ids.has("lint");
  if (lintOnly) {
    const history = policy.strategyHistory["eslint-only"];
    // Learn from a failed narrow attempt on a prior cycle/session: try the
    // repo\u0027s verified handlers next instead of repeating the same fix.
    if (history && history.attempts > history.successes) return "verified-handlers";
    return "eslint-only";
  }
  return "verified-handlers";
}
try {
  let cycleNumber = 0;
  while (!interrupted && (maxCycles === 0 || cycleNumber < maxCycles)) {
    if (remaining() === 0) { state.stopReason = "budget-exhausted"; break; }
    cycleNumber++;
    const cycle = {number: cycleNumber, startRevision: revision(),
      startedAt: new Date().toISOString(), stages: [], failureIds: [], action: null};
    state.cycles.push(cycle);
    writeJson(stateFile, state);
    const quick = await run("cycle-" + cycleNumber + "-quick",
      ["node", "scripts/aso/master-verify.mjs", "--mode", "quick", "--output", out], 90 * 60_000);
    cycle.stages.push(quick);
    const initial = readJson(path.join(out, "report.json"));
    if (!initial || initial.mode !== "quick" || initial.revision !== cycle.startRevision) {
      state.stopReason = "missing-or-stale-quick-verification"; break;
    }
    cycle.failureIds = failedIds(initial);
    updateHistory(cycle.failureIds);
    writeJson(policyFile, policy);
    if (quick.status !== "pass" || !initial.gatesPassed) {
      const strategy = chooseStrategy(cycle.failureIds);
      if (!autoRepair) { state.stopReason = "verification-failed-repair-not-authorized"; break; }
      if (!autoCommit) { state.stopReason = "repair-auto-commit-not-authorized"; break; }
      if (!strategy) { state.stopReason = "unhandled-failure-requires-engineering-review"; break; }
      if (policy.noProgress >= noProgressLimit) {
        state.stopReason = "no-progress-circuit-breaker"; break;
      }
      cycle.action = strategy;
      const repair = await run("cycle-" + cycleNumber + "-repair",
        ["node", "scripts/aso/master-repair.mjs", "--output", out,
          "--strategy", strategy, "--auto-commit"], 90 * 60_000);
      cycle.stages.push(repair);
      const receipt = readJson(path.join(out, "repair.json"));
      policy.strategyHistory[strategy] ??= {attempts: 0, successes: 0};
      policy.strategyHistory[strategy].attempts++;
      if (receipt?.accepted && receipt.committed && repair.status === "pass") {
        policy.successfulRepairs++;
        policy.strategyHistory[strategy].successes++;
        policy.noProgress = 0;
      } else {
        policy.failedRepairs++;
        // A rejected lint-only attempt can safely be retried with the
        // alternate reviewed handler set on the next clean cycle.
        if (strategy !== "eslint-only") state.stopReason = "repair-rejected-or-rolled-back";
      }
      writeJson(policyFile, policy);
      writeJson(stateFile, state);
      if (state.stopReason) break;
      continue; // New committed revision gets its own fresh check cycle.
    }
    // No short-circuit: a quick pass cannot imply full launch readiness.
    const full = await run("cycle-" + cycleNumber + "-full",
      ["node", "scripts/aso/master-verify.mjs", "--mode", "full", "--output", out,
        ...(releaseEvidence ? ["--release-evidence", releaseEvidence] : [])],
      180 * 60_000);
    cycle.stages.push(full);
    const report = readJson(path.join(out, "report.json"));
    if (!report || report.mode !== "full" || report.revision !== revision()) {
      state.stopReason = "missing-or-stale-full-verification"; break;
    }
    cycle.failureIds = failedIds(report);
    if (full.status === "pass" && report.releaseReady) {
      state.verdict = "LOCALLY_GATED_WITH_OPERATOR_EVIDENCE";
      state.stopReason = "all-release-gates-and-operator-receipts-satisfied";
    } else if (report.gatesPassed && !report.releaseEvidence.valid) {
      state.stopReason = "independent-production-evidence-or-approval-required";
    } else {
      state.stopReason = "full-suite-blocker-requires-evidence-based-engineering";
    }
    writeJson(stateFile, state);
    break;
  }
  if (interrupted) state.stopReason = "interrupted";
  if (!state.stopReason) state.stopReason = "cycle-limit-reached";
} catch (error) {
  state.stopReason = "supervisor-exception: " + error.message;
} finally {
  state.finishedAt = new Date().toISOString();
  writeJson(stateFile, state);
  writeJson(policyFile, policy);
  console.log(JSON.stringify({verdict: state.verdict, stopReason: state.stopReason,
    cycles: state.cycles.length, trackedProject: "entire git index",
    receipt: path.relative(ROOT, stateFile)}));
}
process.exitCode = state.verdict === "LOCALLY_GATED_WITH_OPERATOR_EVIDENCE" ? 0 : 1;
