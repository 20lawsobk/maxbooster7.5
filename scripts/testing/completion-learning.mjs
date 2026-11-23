#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { persistConfiguredCompletionHistory } from "./completion-learning-bucket.mjs";
import { evaluateCompetitorBenchmarks } from "./competitor-benchmarks.mjs";
import {
  applyProposalFeedback,
  loadProposalFeedback,
  verifyAcceptedProposalLink,
} from "./completion-proposal-feedback.mjs";

const LEARNING_DIR = ".local/repository-verification/learning";
const MAX_OBSERVATIONS = 2_000;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
const MAX_OBSERVATION_BYTES = 8 * 1024 * 1024;
const MAX_REMEDIATION_BYTES = 32 * 1024 * 1024;
const MAX_REMEDIATION_ITEMS = 5_000;
const MAX_REMEDIATION_PROPOSALS = 200;
const MAX_CHECK_HISTORY = 2_000;
const MAX_CHECK_PROPOSALS = 500;
const MAX_CHECK_ID_LENGTH = 240;
const SENSITIVE_TEXT = /(?:sk_(?:live|test)_|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/i;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
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
      value.integrity?.algorithm !== "sha256") return false;
  const expected = value.integrity.reportSha256 ?? value.integrity.sha256;
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) return false;
  const unsigned = { ...value };
  delete unsigned.integrity;
  return sha256(canonical(unsigned)) === expected;
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function ensurePrivateDirectory(root, parts) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`Learning storage path is not a private directory: ${current}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(current, { mode: 0o700 });
      await fs.chmod(current, 0o700);
    }
  }
  return current;
}

async function writeNewFile(filePath, content) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
  try {
    await fs.link(temporary, filePath);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

function safeString(value, maxLength = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!cleaned || SENSITIVE_TEXT.test(cleaned)) return null;
  return cleaned.slice(0, maxLength);
}

async function hashFile(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) digest.update(chunk);
  return digest.digest("hex");
}

async function readCurrentRemediation(root, runDirectory, report) {
  const unavailable = (status, reason) => ({ status, reason, items: [], artifact: null });
  if (report.mode !== "full") return unavailable("NOT_RUN", "A full repository verification has not generated a fresh product remediation inventory.");
  const audit = report.checks.find(check => check.id === "launch-readiness-audit");
  let sourceFreshness = "UNVERIFIED";
  try {
    sourceFreshness = JSON.parse(audit?.output ?? "{}").sourceFreshness ?? "UNVERIFIED";
  } catch {
    sourceFreshness = "UNVERIFIED";
  }
  if (sourceFreshness !== "PASS" || report.existingRunner?.sourceInputsUnchanged !== true) {
    return unavailable("UNVERIFIED", "The full run did not prove fresh launch-audit inputs and unchanged runner source.");
  }
  const resultPath = report.existingRunner?.resultPath;
  if (typeof resultPath !== "string") return unavailable("UNVERIFIED", "The full runner did not retain its result path.");
  const outputDirectory = path.resolve(path.dirname(path.dirname(resultPath)));
  if (!within(runDirectory, outputDirectory)) {
    return unavailable("DEGRADED", "The remediation output escaped this verification run directory.");
  }
  const remediationPath = path.join(outputDirectory, "remediation.json");
  const registerPath = path.join(outputDirectory, "platform-register.json");
  try {
    const outputInfo = await fs.lstat(outputDirectory);
    if (outputInfo.isSymbolicLink() || !outputInfo.isDirectory()) {
      return unavailable("DEGRADED", "The current full-run output directory must be a real directory.");
    }
    const [remediationInfo, registerInfo] = await Promise.all([
      fs.lstat(remediationPath),
      fs.lstat(registerPath),
    ]);
    if ([remediationInfo, registerInfo].some(info => info.isSymbolicLink() || !info.isFile())) {
      return unavailable("DEGRADED", "The current remediation/register artifacts must be regular files.");
    }
    if (remediationInfo.size > MAX_REMEDIATION_BYTES) {
      return unavailable("DEGRADED", `Current remediation artifact exceeds ${MAX_REMEDIATION_BYTES} bytes.`);
    }
    const [remediationReal, registerReal] = await Promise.all([
      fs.realpath(remediationPath),
      fs.realpath(registerPath),
    ]);
    if (!within(outputDirectory, remediationReal) || !within(outputDirectory, registerReal)) {
      return unavailable("DEGRADED", "Current remediation/register artifact resolved outside the run directory.");
    }
    const remediationRaw = await fs.readFile(remediationReal);
    const remediation = JSON.parse(remediationRaw.toString("utf8"));
    const registerHash = await hashFile(registerReal);
    const registerEntry = Object.entries(remediation.inputSha256 ?? {})
      .find(([name]) => name.endsWith("/platform-register.json"));
    if (!registerEntry || registerEntry[1] !== registerHash) {
      return unavailable("UNVERIFIED", "The remediation artifact is not bound to this run's exact platform register.");
    }
    if (!Array.isArray(remediation.items)) {
      return unavailable("DEGRADED", "Current remediation artifact has no item list.");
    }
    const truncated = remediation.items.length > MAX_REMEDIATION_ITEMS;
    const items = remediation.items.slice(0, MAX_REMEDIATION_ITEMS).map(item => ({
      id: safeString(item?.id, 180),
      kind: safeString(item?.kind, 80),
      status: safeString(item?.status, 40) ?? "unverified",
      priority: Number.isFinite(item?.priority) ? item.priority : null,
      file: safeString(item?.file, 500),
      check: safeString(item?.check, 300),
      actions: Array.isArray(item?.actions)
        ? item.actions.map(action => safeString(action, 500)).filter(Boolean).slice(0, 10)
        : [],
      reproduceCommand: safeString(item?.reproduce?.command, 500),
      evidence: safeString(item?.evidence, 500),
    })).filter(item => item.id);
    return {
      status: truncated ? "CURRENT_TRUNCATED" : "CURRENT",
      reason: truncated ? `${remediation.items.length - MAX_REMEDIATION_ITEMS} items exceed the learning-history item limit; the full artifact remains available.` : null,
      items,
      artifact: {
        path: path.relative(root, remediationPath),
        sha256: sha256(remediationRaw),
        platformRegisterPath: path.relative(root, registerPath),
        platformRegisterSha256: registerHash,
        sourceRevision: report.sourceIdentity?.revision ?? null,
        totalItems: remediation.items.length,
        omittedItems: Math.max(0, remediation.items.length - items.length),
      },
    };
  } catch (error) {
    if (error.code === "ENOENT") return unavailable("UNVERIFIED", "Current full-run remediation or platform-register artifact is missing.");
    return unavailable("DEGRADED", `Current remediation could not be verified: ${error.message}`);
  }
}

function compactCheck(check) {
  const id = safeString(check?.id, MAX_CHECK_ID_LENGTH);
  if (!id) return null;
  const status = ["PASS", "FAIL", "BLOCKED", "UNVERIFIED", "SKIPPED", "NOT APPLICABLE"].includes(check.status)
    ? check.status
    : "UNVERIFIED";
  const commandHash = sha256(canonical(check.command ?? []));
  const fingerprint = sha256(canonical({
    id,
    commandHash,
    status,
    exitCode: Number.isInteger(check.exitCode) ? check.exitCode : null,
    timedOut: Boolean(check.timedOut),
    interrupted: Boolean(check.interrupted),
  }));
  return {
    id,
    status,
    fingerprint,
    commandHash,
    exitCode: Number.isInteger(check.exitCode) ? check.exitCode : null,
    timedOut: Boolean(check.timedOut),
    interrupted: Boolean(check.interrupted),
    nextAction: safeString(check.nextAction),
  };
}

function isVerifiedPlan(report) {
  return ["APPLIED_VERIFIED", "ALREADY_APPLIED_VERIFIED"].includes(report.status) &&
    /^[a-f0-9]{64}$/.test(report.planSha256 ?? "") &&
    /^[a-f0-9]{40,64}$/.test(report.sourceIdentity?.revision ?? "") &&
    /^[a-f0-9]{64}$/.test(report.sourceIdentity?.inputInventorySha256 ?? "") &&
    /^[a-f0-9]{64}$/.test(report.sourceIdentity?.dirtyInputSha256 ?? "") &&
    Array.isArray(report.checks) && report.checks.length > 0 &&
    report.checks.every(check => check.status === "PASS") &&
    Array.isArray(report.changes) && report.changes.length > 0 &&
    report.changes.every(change => ["APPLIED", "ALREADY_APPLIED"].includes(change.status));
}

function buildObservation(report, runId, remediation, verifiedProposalLink) {
  if (!isSealed(report)) throw new Error("Learning accepts only integrity-verified completion reports");
  if (!Array.isArray(report.checks)) throw new Error("Completion report has no check list");
  const allChecks = report.checks.map(compactCheck).filter(Boolean);
  const checkPriority = { FAIL: 0, BLOCKED: 1, UNVERIFIED: 2, SKIPPED: 3, "NOT APPLICABLE": 4, PASS: 5 };
  const unresolvedChecks = allChecks.filter(check => check.status !== "PASS")
    .sort((a, b) => checkPriority[a.status] - checkPriority[b.status] || a.id.localeCompare(b.id));
  const planVerified = isVerifiedPlan(report);
  const proposalPlanAttempt = verifiedProposalLink ? {
    status: report.status,
    reportSha256: report.integrity.reportSha256 ?? report.integrity.sha256,
    planSha256: report.planSha256 ?? null,
    approvalDecisionId: verifiedProposalLink.approvalDecisionId,
    proposalId: verifiedProposalLink.proposalId,
    proposalKey: verifiedProposalLink.proposalKey,
    resolved: planVerified,
    checks: report.checks.map(check => ({
      id: safeString(check.id, 240),
      status: ["PASS", "FAIL", "BLOCKED", "UNVERIFIED", "SKIPPED"].includes(check.status)
        ? check.status
        : "UNVERIFIED",
    })).filter(check => check.id),
  } : null;
  const verifiedPlan = planVerified ? {
    status: report.status,
    planSha256: report.planSha256,
    planPath: safeString(report.planPath, 300),
    sourceRevision: report.sourceIdentity?.revision ?? null,
    changePaths: report.changes.map(change => change.path).filter(pathValue =>
      typeof pathValue === "string" && pathValue.length <= 500),
    passedCheckIds: report.checks.map(check => check.id).filter(id => typeof id === "string"),
    proposalLink: verifiedProposalLink,
  } : null;
  return seal({
    schemaVersion: 1,
    runId,
    recordedAt: new Date().toISOString(),
    reportSha256: report.integrity.reportSha256 ?? report.integrity.sha256,
    mode: safeString(report.mode, 30) ?? "unknown",
    gateStatus: safeString(report.gateStatus ?? report.status, 40) ?? "UNVERIFIED",
    sourceIdentity: {
      revision: report.sourceIdentity?.revision ?? null,
      inputInventorySha256: report.sourceIdentity?.inputInventorySha256 ?? null,
      dirtyInputSha256: report.sourceIdentity?.dirtyInputSha256 ?? null,
    },
    checks: unresolvedChecks.slice(0, MAX_CHECK_HISTORY),
    proposalPlanAttempt,
    truncated: {
      checks: Math.max(0, unresolvedChecks.length - MAX_CHECK_HISTORY),
      remediationItems: remediation.artifact?.omittedItems ?? 0,
    },
    remediation: {
      status: remediation.status,
      artifactSha256: remediation.artifact?.sha256 ?? null,
      sourceRevision: remediation.artifact?.sourceRevision ?? null,
      items: remediation.items.slice(0, MAX_REMEDIATION_ITEMS).map(item => ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        priority: item.priority,
        file: item.file,
      })),
      omittedItems: remediation.artifact?.omittedItems ?? 0,
    },
    verifiedPlan,
    externalPrerequisites: (Array.isArray(report.externalPrerequisites) ? report.externalPrerequisites : [])
      .filter(item => item && item.status !== "PASS")
      .map(item => ({
        id: safeString(item.id, 240),
        status: safeString(item.status, 40) ?? "UNVERIFIED",
      }))
      .filter(item => item.id),
  });
}

function collectVerifiedProposalResolutions(observations, currentProposals) {
  const currentKeys = new Set(currentProposals.map(proposal => proposal.proposalKey));
  const resolutions = new Map();
  for (const observation of observations) {
    const plan = observation.verifiedPlan;
    const link = plan?.proposalLink;
    if (!link || !plan.passedCheckIds?.length ||
        plan.passedCheckIds.some(id =>
          !observation.proposalPlanAttempt?.checks?.some(check =>
            check.id === id && check.status === "PASS"))) continue;
    resolutions.set(link.approvalDecisionId, {
      state: currentKeys.has(link.proposalKey)
        ? "VERIFIED_PLAN_PASSED_BUT_CURRENT_FINDING_REMAINS"
        : "RESOLVED_BY_VERIFIED_PLAN",
      proposalId: link.proposalId,
      proposalKey: link.proposalKey,
      approvalDecisionId: link.approvalDecisionId,
      approvalRunId: link.approvalRunId,
      approvalReportSha256: link.approvalReportSha256,
      verificationRunId: observation.runId,
      planSha256: plan.planSha256,
      passedCheckIds: plan.passedCheckIds,
      sourceRevision: plan.sourceRevision,
      verifiedAt: observation.recordedAt,
    });
  }
  return [...resolutions.values()].sort((a, b) =>
    a.verifiedAt.localeCompare(b.verifiedAt)).reverse();
}

async function readHistory(eventsDirectory) {
  const names = (await fs.readdir(eventsDirectory)).sort();
  const tempFiles = names.filter(name => name.endsWith(".tmp"));
  const jsonFiles = names.filter(name => /^[A-Za-z0-9._-]+\.json$/.test(name));
  const truncated = jsonFiles.length > MAX_OBSERVATIONS;
  const selected = jsonFiles.slice(-MAX_OBSERVATIONS);
  const observations = [];
  const warnings = tempFiles.map(name => `Incomplete learning write retained: ${name}`);
  let loadedBytes = 0;
  let byteBudgetTruncated = false;
  for (const name of [...selected].reverse()) {
    const filePath = path.join(eventsDirectory, name);
    const info = await fs.lstat(filePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      warnings.push(`Unsafe learning record rejected: ${name}`);
      continue;
    }
    if (info.size > MAX_OBSERVATION_BYTES) {
      warnings.push(`Oversized learning record rejected: ${name}`);
      continue;
    }
    if (loadedBytes + info.size > MAX_HISTORY_BYTES) {
      byteBudgetTruncated = true;
      warnings.push(`Learning history read stopped at the ${MAX_HISTORY_BYTES}-byte safety limit.`);
      break;
    }
    loadedBytes += info.size;
    let record;
    try {
      record = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      warnings.push(`Unreadable learning record rejected: ${name}`);
      continue;
    }
    if (!isSealed(record) || record.schemaVersion !== 1 || record.runId !== name.slice(0, -5)) {
      warnings.push(`Learning record integrity check failed: ${name}`);
      continue;
    }
    observations.push(record);
  }
  return {
    observations: observations.reverse(),
    availableRecords: jsonFiles.length,
    truncated: truncated || byteBudgetTruncated,
    loadedBytes,
    warnings,
  };
}

function mergeAnalysisHistory(localRecords, durableRecords) {
  const byRunId = new Map();
  for (const record of [...localRecords, ...durableRecords]) {
    if (!isSealed(record) || record.schemaVersion !== 1) {
      throw new Error("Invalid observation in merged completion-learning history");
    }
    const prior = byRunId.get(record.runId);
    if (prior && prior.reportSha256 !== record.reportSha256) {
      throw new Error(`Conflicting report identity for completion-learning run ${record.runId}`);
    }
    if (!prior) byRunId.set(record.runId, record);
  }
  const ordered = [...byRunId.values()].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt) || a.runId.localeCompare(b.runId));
  return {
    observations: ordered.slice(-MAX_OBSERVATIONS),
    truncated: ordered.length > MAX_OBSERVATIONS,
  };
}

function buildProposals(current, history, remediation, allCurrentChecks, repositoryUnderstanding = null) {
  const recurrence = new Map();
  const verifiedPlans = [];
  const remediationRecurrence = new Map();
  for (const observation of history.observations) {
    for (const check of observation.checks) {
      const bucket = recurrence.get(check.fingerprint) ?? {
        checkId: check.id,
        fingerprint: check.fingerprint,
        count: 0,
        firstSeen: observation.recordedAt,
        lastSeen: observation.recordedAt,
        statuses: {},
      };
      bucket.count++;
      bucket.lastSeen = observation.recordedAt;
      bucket.statuses[check.status] = (bucket.statuses[check.status] ?? 0) + 1;
      recurrence.set(check.fingerprint, bucket);
    }
    for (const item of observation.remediation?.items ?? []) {
      if (item.status === "resolved" || item.status === "complete" || item.status === "pass") continue;
      const count = remediationRecurrence.get(item.id) ?? 0;
      remediationRecurrence.set(item.id, count + 1);
    }
    if (observation.verifiedPlan) verifiedPlans.push(observation.verifiedPlan);
  }

  const proposals = [];
  const currentCheckCandidates = allCurrentChecks.map(compactCheck).filter(Boolean)
    .filter(check => check.status !== "PASS" && check.status !== "NOT APPLICABLE")
    .sort((a, b) => {
      const rank = { FAIL: 0, BLOCKED: 1, UNVERIFIED: 2, SKIPPED: 3 };
      return (rank[a.status] ?? 4) - (rank[b.status] ?? 4) || a.id.localeCompare(b.id);
    });
  for (const check of currentCheckCandidates.slice(0, MAX_CHECK_PROPOSALS)) {
    const pattern = recurrence.get(check.fingerprint);
    const severity = check.status === "FAIL"
      ? (pattern?.count >= 3 ? "P1" : "P2")
      : check.status === "BLOCKED" ? "BLOCKED" : "P3";
    const relatedPlans = verifiedPlans
      .filter(plan => plan.passedCheckIds.includes(check.id))
      .slice(-3)
      .reverse()
      .map(plan => ({
        planSha256: plan.planSha256,
        planPath: plan.planPath,
        sourceRevision: plan.sourceRevision,
        changePaths: plan.changePaths,
        note: "Historical local checks passed; the plan is not automatically replayed and must be reviewed against current source.",
      }));
    const action = check.status === "BLOCKED"
      ? "Resolve the named prerequisite in an authorized isolated environment; do not turn the block into a simulated pass."
      : check.status === "UNVERIFIED" || check.status === "SKIPPED"
        ? "Add or run a source-bound acceptance check for this exact capability before claiming completion."
        : check.nextAction ?? `Inspect the current failure for ${check.id}, reproduce it, and prepare a reviewed source-bound fix plan.`;
    proposals.push({
      id: sha256(`${check.fingerprint}:${current.reportSha256}`).slice(0, 24),
      proposalKey: sha256(`check:${check.id}:${check.commandHash}`),
      kind: check.status === "FAIL" ? "verification-failure" :
        check.status === "BLOCKED" ? "external-or-environment-blocker" : "missing-current-evidence",
      state: "NEEDS_REVIEW",
      priority: severity,
      checkId: check.id,
      recurrence: {
        matchingObservations: pattern?.count ?? 0,
        lastObservedAt: pattern?.lastSeen ?? current.recordedAt,
        observedStatuses: pattern?.statuses ?? { [check.status]: 1 },
      },
      evidence: {
        currentRunId: current.runId,
        reportSha256: current.reportSha256,
        sourceRevision: current.sourceIdentity.revision,
        inputInventorySha256: current.sourceIdentity.inputInventorySha256,
        checkFingerprint: check.fingerprint,
      },
      recommendedNextAction: action,
      relatedVerifiedPlans: relatedPlans,
    });
  }
  const currentRemediation = remediation.items.filter(item =>
    !["resolved", "complete", "pass"].includes(item.status));
  const orderedRemediation = [...currentRemediation].sort((a, b) =>
    (a.priority ?? 99) - (b.priority ?? 99) || a.id.localeCompare(b.id));
  for (const item of orderedRemediation.slice(0, MAX_REMEDIATION_PROPOSALS)) {
    const matchingObservations = remediationRecurrence.get(item.id) ?? 0;
    const priority = item.priority !== null && item.priority <= 0 ? "P1" :
      item.priority !== null && item.priority <= 2 ? "P2" : "P3";
    proposals.push({
      id: `remediation-${sha256(item.id).slice(0, 24)}`,
      proposalKey: sha256(`remediation:${item.id}`),
      kind: "source-bound-remediation",
      state: "NEEDS_REVIEW",
      priority: matchingObservations >= 3 && priority === "P2" ? "P1" : priority,
      remediationId: item.id,
      remediationKind: item.kind,
      observationConfidence: "FROM_CURRENT_SOURCE_BOUND_FULL_RUN",
      recurrence: { matchingObservations },
      evidence: {
        currentRunId: current.runId,
        reportSha256: current.reportSha256,
        sourceRevision: current.sourceIdentity.revision,
        remediationArtifact: remediation.artifact?.path ?? null,
        remediationSha256: remediation.artifact?.sha256 ?? null,
        file: item.file,
        check: item.check,
      },
      reproductionCommand: item.reproduceCommand,
      evidenceReference: item.evidence,
      implementationSteps: item.actions,
      recommendedNextAction: item.actions[0] ??
        "Review the current source-bound remediation record, reproduce the exact finding, and prepare an exact reviewed patch plan.",
    });
  }
  const dossier = repositoryUnderstanding?.dossier;
  const acceptedUnderstandingStatus = ["CURRENT", "PARTIAL", "TRUNCATED"].includes(repositoryUnderstanding?.status) &&
    dossier?.sourceIdentity?.runSourceMatch === true;
  if (acceptedUnderstandingStatus) {
    const checkContexts = new Map((dossier.failureCheckContext ?? []).map(item => [item.checkId, item]));
    for (const proposal of proposals) {
      const context = checkContexts.get(proposal.checkId);
      if (!context) continue;
      proposal.repositoryContext = {
        dossierSha256: dossier.integrity?.sha256 ?? null,
        confidence: context.confidence,
        directReferences: context.directReferences,
        uncertainty: context.uncertainty,
      };
    }
    for (const candidate of dossier.coverageCandidates ?? []) {
      proposals.push({
        id: `understanding-${sha256(`${candidate.path}:${candidate.sourceSha256}`).slice(0, 24)}`,
        proposalKey: sha256(canonical({
          kind: "static-coverage-candidate",
          path: candidate.path,
          sourceSha256: candidate.sourceSha256,
        })),
        kind: "static-coverage-candidate",
        state: "NEEDS_REVIEW",
        priority: candidate.priority,
        productArea: candidate.path.split("/")[0] ?? "repository",
        sourcePath: candidate.path,
        observationConfidence: candidate.confidence,
        impactScore: candidate.impactScore,
        recurrence: { matchingObservations: 0 },
        evidence: {
          dossierSha256: dossier.integrity?.sha256 ?? null,
          sourceSha256: candidate.sourceSha256,
          sourceRevision: dossier.sourceIdentity.gitRevision,
          details: candidate.evidence,
        },
        uncertainty: candidate.uncertainty,
        recommendedNextAction: candidate.recommendedNextAction,
        requiredEvidence: [
          "Trace the source path through its runtime consumer.",
          "Link or add a behavior-level test before treating coverage as complete.",
        ],
      });
    }
    for (const marker of (dossier.unfinishedCandidates ?? []).slice(0, 200)) {
      proposals.push({
        id: `unfinished-${sha256(`${marker.path}:${marker.line}:${marker.marker}:${marker.sourceSha256}`).slice(0, 24)}`,
        proposalKey: sha256(canonical({
          kind: "unfinished-marker-candidate",
          path: marker.path,
          line: marker.line,
          marker: marker.marker,
          sourceSha256: marker.sourceSha256,
        })),
        kind: "unfinished-marker-candidate",
        state: "NEEDS_REVIEW",
        priority: "P3",
        productArea: marker.path.split("/")[0] ?? "repository",
        sourcePath: marker.path,
        observationConfidence: marker.confidence,
        recurrence: { matchingObservations: 0 },
        evidence: {
          dossierSha256: dossier.integrity?.sha256 ?? null,
          sourceSha256: marker.sourceSha256,
          sourceRevision: dossier.sourceIdentity.gitRevision,
          line: marker.line,
          marker: marker.marker,
          lifecycle: marker.lifecycle,
        },
        uncertainty: [marker.uncertainty],
        recommendedNextAction: "Inspect this marker in its current code context and confirm whether the behavior is incomplete before drafting a repair.",
        requiredEvidence: [
          "Confirm the marker still exists at the source-hash-pinned line.",
          "Trace the feature through its runtime entry point and tests.",
        ],
      });
    }
  }
  const rank = { P1: 0, P2: 1, P3: 2, P4: 3, BLOCKED: 4 };
  proposals.sort((a, b) =>
    rank[a.priority] - rank[b.priority] ||
    b.recurrence.matchingObservations - a.recurrence.matchingObservations ||
    (a.checkId ?? a.remediationId ?? a.id).localeCompare(b.checkId ?? b.remediationId ?? b.id));
  return {
    proposals,
    totalCheckCandidates: currentCheckCandidates.length,
    omittedCheckCandidates: Math.max(0, currentCheckCandidates.length - MAX_CHECK_PROPOSALS),
    totalRemediationCandidates: currentRemediation.length,
    omittedRemediationCandidates: Math.max(0, currentRemediation.length - MAX_REMEDIATION_PROPOSALS),
  };
}

async function writeSummary(runDirectory, summary) {
  const output = path.join(runDirectory, "learning.json");
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await fs.chmod(temporary, 0o600);
  await fs.rename(temporary, output);
  return output;
}

export async function recordLearningOutcome({
  root,
  runDirectory,
  report,
  durableHistory = false,
  persistHistory = persistConfiguredCompletionHistory,
  env = {},
  repositoryUnderstanding = null,
} = {}) {
  if (!root || !runDirectory || !report) throw new Error("root, runDirectory, and report are required");
  const rootReal = await fs.realpath(root);
  const runReal = await fs.realpath(runDirectory);
  if (!within(rootReal, runReal)) throw new Error("Learning report directory must stay inside the repository");
  const runId = path.basename(runReal);
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(runId)) throw new Error("Unsafe verification run ID");
  const remediation = await readCurrentRemediation(rootReal, runReal, report);
  const verifiedProposalLink = report.proposalLink
    ? await verifyAcceptedProposalLink({
      root: rootReal,
      proposalLink: report.proposalLink,
      sourceIdentity: report.sourceIdentity,
      requireLatestDecision: false,
      env,
    })
    : null;
  const observation = buildObservation(report, runId, remediation, verifiedProposalLink);
  const eventContent = `${JSON.stringify(observation, null, 2)}\n`;
  if (Buffer.byteLength(eventContent) > MAX_OBSERVATION_BYTES) {
    throw new Error(`Learning observation exceeds the ${MAX_OBSERVATION_BYTES}-byte safety limit`);
  }
  const baseParts = LEARNING_DIR.split("/");
  const learningDirectory = await ensurePrivateDirectory(rootReal, baseParts);
  const eventsDirectory = await ensurePrivateDirectory(rootReal, [...baseParts, "observations"]);
  const eventPath = path.join(eventsDirectory, `${runId}.json`);
  try {
    await writeNewFile(eventPath, eventContent);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = JSON.parse(await fs.readFile(eventPath, "utf8"));
    if (!isSealed(existing) || existing.reportSha256 !== observation.reportSha256) {
      throw new Error(`Conflicting or corrupt learning record for run ${runId}`);
    }
  }

  const history = await readHistory(eventsDirectory);
  const current = {
    ...observation,
    reportSha256: observation.reportSha256,
  };
  let persistence = {
    status: durableHistory ? "BLOCKED" : "NOT_REQUESTED",
    readbackVerified: false,
    observations: [],
    reason: durableHistory ? "Durable history integration did not complete." : null,
  };
  if (durableHistory) {
    try {
      const observations = history.observations.some(item => item.runId === runId)
        ? history.observations
        : [...history.observations, observation];
      persistence = await persistHistory({
        observations,
        currentRunId: runId,
        historyTruncated: history.truncated,
        env,
      });
      const persistedCurrent = persistence.observations?.find?.(item => item.runId === runId);
      if (persistence.readbackVerified &&
          (!Array.isArray(persistence.observations) ||
           persistence.observations.some(item => !isSealed(item) || item.schemaVersion !== 1) ||
           !persistedCurrent || persistedCurrent.reportSha256 !== observation.reportSha256)) {
        persistence = {
          status: "DEGRADED",
          readbackVerified: false,
          observations: [],
          reason: "Durable history readback did not contain a valid current-run observation.",
        };
      }
    } catch {
      persistence = {
        status: "BLOCKED",
        readbackVerified: false,
        observations: [],
        reason: "Private App Storage persistence failed; the local observation remains available.",
      };
    }
  }
  let durableRecords = [];
  let mergedHistoryTruncated = false;
  if (persistence.readbackVerified === true) {
    try {
      const mergedHistory = mergeAnalysisHistory(
        history.observations,
        persistence.observations,
      );
      durableRecords = mergedHistory.observations;
      mergedHistoryTruncated = mergedHistory.truncated;
    } catch {
      persistence = {
        status: "DEGRADED",
        readbackVerified: false,
        observations: [],
        reason: "Durable history conflicted with local records; no conflicting remote records were used.",
      };
    }
  }
  if (persistence.readbackVerified !== true) durableRecords = history.observations;
  const analysisHistory = {
    ...history,
    observations: durableRecords,
    availableRecords: persistence.readbackVerified
      ? persistence.availableRecords ?? durableRecords.length
      : history.availableRecords,
    truncated: history.truncated || persistence.truncated === true || mergedHistoryTruncated,
    loadedBytes: persistence.readbackVerified
      ? Buffer.byteLength(JSON.stringify(durableRecords))
      : history.loadedBytes,
    warnings: [...history.warnings,
      ...(durableHistory && persistence.status !== "VERIFIED"
        ? [persistence.reason ?? "Durable history was not verified."]
        : [])],
  };
  const proposalSet = buildProposals(
    current, analysisHistory, remediation, report.checks, repositoryUnderstanding,
  );
  let benchmarkAssessment;
  try {
    benchmarkAssessment = await evaluateCompetitorBenchmarks({ report });
  } catch {
    benchmarkAssessment = {
      summary: {
        competitorComparisons: "BLOCKED",
        evidenceStatus: "INVALID_OR_UNAVAILABLE",
        coveredProductAreas: 0,
        sourceCount: 0,
        measuredAreas: 0,
        reason: "The dated competitor evidence manifest could not be validated.",
        areas: [],
      },
      proposals: [],
    };
  }
  let allProposals = [...proposalSet.proposals, ...benchmarkAssessment.proposals];
  let feedback = {
    status: "DEGRADED",
    warnings: ["Proposal feedback could not be read."],
    decisions: [],
    latest: new Map(),
  };
  try {
    feedback = await loadProposalFeedback(rootReal, observation.sourceIdentity, { env });
    allProposals = applyProposalFeedback(allProposals, feedback);
  } catch {
    // Feedback is advisory; unreadable decisions never block verification.
  }
  const proposalRank = { P1: 0, P2: 1, P3: 2, P4: 3, BLOCKED: 4 };
  allProposals.sort((a, b) =>
    (proposalRank[a.priority] ?? 5) - (proposalRank[b.priority] ?? 5) ||
    (b.recurrence?.matchingObservations ?? 0) - (a.recurrence?.matchingObservations ?? 0) ||
    (a.checkId ?? a.remediationId ?? a.productArea ?? a.id)
      .localeCompare(b.checkId ?? b.remediationId ?? b.productArea ?? b.id));
  const allVerifiedPlans = analysisHistory.observations
    .map(item => item.verifiedPlan)
    .filter(Boolean);
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reportSha256: observation.reportSha256,
    mode: "proposal-first",
    repositoryRoot: rootReal,
    runId,
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    goal: "Use fresh evidence to identify and close every required Max Booster workflow gap; never infer whole-product readiness from a passing subset.",
    sourceIdentity: observation.sourceIdentity,
    history: {
      status: analysisHistory.warnings.length ? "DEGRADED" : analysisHistory.truncated ? "TRUNCATED" : "CURRENT",
      availableRecords: analysisHistory.availableRecords,
      analyzedRecords: analysisHistory.observations.length,
      truncated: analysisHistory.truncated,
      loadedBytes: analysisHistory.loadedBytes,
      warnings: analysisHistory.warnings,
      persistence: {
        requested: durableHistory === true,
        status: persistence.status,
        readbackVerified: persistence.readbackVerified === true,
        durableRecords: persistence.readbackVerified ? persistence.observations.length : 0,
        recordsAdded: persistence.recordsAdded ?? 0,
        pendingLocalRecords: persistence.pendingLocalRecords ?? 0,
        sequence: persistence.sequence ?? null,
        readbackSha256: persistence.readbackSha256 ?? null,
        checkpointStatus: persistence.checkpointStatus ?? "NOT_RUN",
        leaseReleased: persistence.leaseReleased ?? null,
        failureKind: persistence.failureKind ?? null,
        reason: persistence.reason ?? null,
      },
      repeatedFailureFamilies: new Set(analysisHistory.observations.flatMap(item =>
        item.checks.map(check => check.fingerprint))).size,
      verifiedPlanRuns: allVerifiedPlans.length,
    },
    benchmark: {
      ...benchmarkAssessment.summary,
      internalCoverage: report.mode === "full"
        ? benchmarkAssessment.summary.sourceAudit === "CURRENT" ? "CURRENT_AUDIT_PRESENT" : "UNVERIFIED_OR_STALE"
        : "NOT_RUN",
      remediationInventory: remediation.status,
    },
    repositoryUnderstanding: {
      status: repositoryUnderstanding?.status ?? "NOT_RUN",
      reason: repositoryUnderstanding?.reason ?? null,
      artifact: repositoryUnderstanding?.artifact ?? null,
      atlas: repositoryUnderstanding?.atlas ?? { status: "NOT_RUN" },
      pythonInventory: repositoryUnderstanding?.pythonInventory ?? {
        role: "supplemental-local-inventory",
        readinessImpact: "NONE",
        status: "NOT_RUN",
      },
      sourceIdentity: repositoryUnderstanding?.dossier?.sourceIdentity ? {
        gitRevision: repositoryUnderstanding.dossier.sourceIdentity.gitRevision,
        sourceFileManifestSha256: repositoryUnderstanding.dossier.sourceIdentity.sourceFileManifestSha256,
        runReportSha256: repositoryUnderstanding.dossier.sourceIdentity.runReportSha256,
        runSourceMatch: repositoryUnderstanding.dossier.sourceIdentity.runSourceMatch,
        complete: repositoryUnderstanding.dossier.sourceIdentity.complete,
      } : null,
      summary: repositoryUnderstanding?.dossier?.summary ?? null,
      candidatePaths: (repositoryUnderstanding?.dossier?.coverageCandidates ?? [])
        .slice(0, MAX_REMEDIATION_PROPOSALS).map(item => ({
          path: item.path,
          priority: item.priority,
          impactScore: item.impactScore,
          confidence: item.confidence,
          sourceSha256: item.sourceSha256,
        })),
    },
    currentRemediation: {
      status: remediation.status,
      reason: remediation.reason,
      artifact: remediation.artifact,
      unresolvedItems: remediation.items.filter(item =>
        !["resolved", "complete", "pass"].includes(item.status)).length,
      omittedSourceItems: remediation.artifact?.omittedItems ?? 0,
      proposedItems: proposalSet.proposals.filter(row => row.kind === "source-bound-remediation").length,
      omittedProposals: proposalSet.omittedRemediationCandidates,
    },
    currentProposals: allProposals,
    proposalPlanAttempts: analysisHistory.observations
      .filter(item => item.proposalPlanAttempt)
      .slice(-50)
      .reverse()
      .map(item => ({ runId: item.runId, ...item.proposalPlanAttempt })),
    verifiedProposalResolutions: collectVerifiedProposalResolutions(
      analysisHistory.observations,
      allProposals,
    ),
    proposalFeedback: {
      status: feedback.status,
      scope: "LOCAL_WORKSPACE_ONLY",
      durableAcrossWorkspaceLoss: false,
      decisionsApplied: allProposals.filter(item => item.reviewDecision).length,
      warnings: feedback.warnings,
      acceptedForPlan: allProposals.filter(item => item.state === "APPROVED_FOR_PLAN").length,
      deferred: allProposals.filter(item => item.state === "DEFERRED").length,
      rejected: allProposals.filter(item => item.state === "REJECTED").length,
    },
    proposalCounts: {
      totalCheckCandidates: proposalSet.totalCheckCandidates,
      omittedCheckCandidates: proposalSet.omittedCheckCandidates,
      totalRemediationCandidates: proposalSet.totalRemediationCandidates,
      omittedRemediationCandidates: proposalSet.omittedRemediationCandidates,
      competitorBenchmarkCandidates: benchmarkAssessment.proposals.length,
      repositoryUnderstandingCandidates: proposalSet.proposals.filter(row =>
        row.kind === "static-coverage-candidate").length,
      unfinishedMarkerCandidates: proposalSet.proposals.filter(row =>
        row.kind === "unfinished-marker-candidate").length,
    },
    latestVerifiedInterventions: allVerifiedPlans.slice(-10).reverse(),
    guardrails: [
      "No application source is modified by learning or proposal generation.",
      "Raw command output, test logs, credentials, and customer data are not copied into learning memory.",
      "Historical fixes are recommendations only; source hashes and checks must be reviewed before reuse.",
      "Only the exact, separately reviewed completion plan can change source; deployment and whole-product readiness remain separate gates.",
      "Repository import, route, and test references are static evidence candidates and never prove runtime reachability or coverage.",
    ],
  };
  const sealedSummary = seal(summary);
  const summaryPath = await writeSummary(runReal, sealedSummary);
  return { summary: sealedSummary, summaryPath, eventPath };
}
