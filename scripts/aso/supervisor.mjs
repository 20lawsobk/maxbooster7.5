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
const releaseProfile = option(args, "--release-profile", "public");
const seniorTeam = args.includes("--senior-team");
const modelWorkers = args.includes("--model-workers");
const remoteSource = args.includes("--allow-remote-source");
const maxModelCalls = integerOption(args,"--max-model-calls",2,20);
if (modelWorkers && !(seniorTeam && autoRepair && autoCommit && remoteSource)) {
  throw new Error("Model workers need explicit --senior-team --auto-repair --auto-commit --allow-remote-source");
}
if (!["public","admin"].includes(releaseProfile)) throw new Error("Unknown release profile");
if (autoCommit && !autoRepair) throw new Error("--auto-commit requires --auto-repair");
if (autoRepair && (!branch().startsWith("aso/") || !clean())) {
  throw new Error("Autonomous repair requires a clean aso/ branch; never main or dirty worktrees");
}
const deadline = budgetMinutes ? Date.now() + budgetMinutes * 60_000 : Number.MAX_SAFE_INTEGER;
const stateFile = path.join(out, "supervisor.json");
const policyFile = path.join(out, "policy.json");
const state = {schemaVersion: 1, startedAt: new Date().toISOString(),
  initialRevision: revision(), autoRepair, autoCommit, maxCycles, releaseProfile, seniorTeam,
  modelWorkers,maxModelCalls,actualModelCalls:0,
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
async function specialistAttempt(cycle,mode) {
  if (!modelWorkers || state.actualModelCalls>=maxModelCalls) return false;
  const triage=readJson(path.join(out,"team-incidents.json"));
  if (!triage || triage.revision!==revision()) return false;
  const policyFile=path.join(out,"team-learning.json");
  const learning=readJson(policyFile,{schemaVersion:1,roleOutcomes:{},signatureCounts:{},
    failureFamilies:{},strategyOutcomes:{},attempts:[],maxConsecutiveNoProgress:2});
  const eligible=(triage.incidents??[]).filter(row=>row.status==="OPEN_NOT_FIXED" &&
    row.file && row.risk!=="critical" && !row.blockedByRepetition &&
    typeof row.owner==="string" && (learning.roleOutcomes?.[row.owner]?.attempts??0)<3);
  eligible.sort((a,b)=>a.priority-b.priority || a.repetition-b.repetition || a.id.localeCompare(b.id));
  const selected=eligible[0];
  if (!selected) return false;
  state.actualModelCalls++;
  cycle.specialist={role:selected.owner,incident:selected.id,mode};
  const command=["node","scripts/aso/team-worker.mjs","--output",out,
    "--incident",selected.id,"--release-profile",releaseProfile,
    "--allow-remote-source","--apply","--auto-commit",
    ...(releaseEvidence?["--release-evidence",releaseEvidence]:[])];
  const row=await run("specialist-"+cycle.number,command,mode==="full"?190*60_000:100*60_000);
  cycle.stages.push(row);
  const receipt=readJson(path.join(out,"role-worker.json"));
  const role=learning.roleOutcomes[selected.owner]??{attempts:0,successes:0};
  role.attempts++;
  const accepted=row.status==="pass" && receipt?.committed && receipt?.revisionAfter===revision();
  if (accepted) role.successes++;
  learning.roleOutcomes[selected.owner]=role;
  (learning.attempts??=[]).push({
    at:new Date().toISOString(),incident:selected.id,role:selected.owner,
    before:cycle.startRevision,after:revision(),accepted,
    reason:receipt?.status??"worker-did-not-complete"
  });
  // A bounded rolling window avoids unbounded state growth.
  learning.attempts=learning.attempts.slice(-1000);
  writeJson(policyFile,learning);
  return accepted;
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
  let teamPlannedRevision = null;
  while (!interrupted && (maxCycles === 0 || cycleNumber < maxCycles)) {
    if (remaining() === 0) { state.stopReason = "budget-exhausted"; break; }
    cycleNumber++;
    if (seniorTeam && teamPlannedRevision !== revision()) {
      const planned = await run("team-plan-"+cycleNumber,
        ["node","scripts/aso/team-plan.mjs","--output",out],40*60_000);
      if (planned.status !== "pass") {state.stopReason="team-inventory-or-planning-failed";break;}
      teamPlannedRevision=revision();
    }
    const cycle = {number: cycleNumber, startRevision: revision(),
      startedAt: new Date().toISOString(), stages: [], failureIds: [], action: null};
    state.cycles.push(cycle);
    writeJson(stateFile, state);
    const quick = await run("cycle-" + cycleNumber + "-quick",
      ["node", "scripts/aso/master-verify.mjs", "--mode", "quick", "--output", out,
        "--release-profile", releaseProfile], 90 * 60_000);
    cycle.stages.push(quick);
    const initial = readJson(path.join(out, "report.json"));
    if (!initial || initial.mode !== "quick" || initial.revision !== cycle.startRevision) {
      state.stopReason = "missing-or-stale-quick-verification"; break;
    }
    cycle.failureIds = failedIds(initial);
    if (seniorTeam) {
      const triage=await run("team-triage-quick-"+cycleNumber,
        ["node","scripts/aso/team-triage.mjs","--output",out],10*60_000);
      cycle.stages.push(triage);
      if (triage.status !== "pass") {state.stopReason="team-triage-failed";break;}
    }
    updateHistory(cycle.failureIds);
    writeJson(policyFile, policy);
    if (quick.status !== "pass" || !initial.gatesPassed) {
      const strategy = chooseStrategy(cycle.failureIds);
      if (!autoRepair) { state.stopReason = "verification-failed-repair-not-authorized"; break; }
      if (!autoCommit) { state.stopReason = "repair-auto-commit-not-authorized"; break; }
      if (!strategy) {
        const advanced=await specialistAttempt(cycle,"quick");
        if (advanced) {writeJson(stateFile,state);continue;}
        state.stopReason="unhandled-failure-requires-role-specific-engineering-or-approval";break;
      }
      if (policy.noProgress >= noProgressLimit) {
        state.stopReason = "no-progress-circuit-breaker"; break;
      }
      cycle.action = strategy;
      const repair = await run("cycle-" + cycleNumber + "-repair",
        ["node", "scripts/aso/master-repair.mjs", "--output", out,
          "--strategy", strategy, "--release-profile", releaseProfile, "--auto-commit"], 90 * 60_000);
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
        "--release-profile", releaseProfile,
        ...(releaseEvidence ? ["--release-evidence", releaseEvidence] : [])],
      180 * 60_000);
    cycle.stages.push(full);
    const report = readJson(path.join(out, "report.json"));
    if (!report || report.mode !== "full" || report.revision !== revision()) {
      state.stopReason = "missing-or-stale-full-verification"; break;
    }
    cycle.failureIds = failedIds(report);
    if (seniorTeam) {
      const triage=await run("team-triage-full-"+cycleNumber,
        ["node","scripts/aso/team-triage.mjs","--output",out],10*60_000);
      cycle.stages.push(triage);
      if (triage.status !== "pass") {state.stopReason="team-triage-failed";break;}
    }
    if (full.status === "pass" && report.releaseReady) {
      state.verdict = releaseProfile==="admin"
        ? "LOCALLY_GATED_ADMIN_WITH_OPERATOR_EVIDENCE":"LOCALLY_GATED_WITH_OPERATOR_EVIDENCE";
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
process.exitCode = state.verdict.startsWith("LOCALLY_GATED_") ? 0 : 1;
