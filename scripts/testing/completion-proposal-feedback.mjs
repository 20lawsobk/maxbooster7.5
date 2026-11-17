#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const FEEDBACK_DIR = ".local/repository-verification/learning/decisions";
const DRAFTS_DIR = ".local/repository-verification/plan-drafts";
const MAX_DECISIONS = 10_000;
const MAX_BYTES = 16 * 1024 * 1024;
const DECISIONS = new Set(["accept-for-plan", "defer", "reject", "reopen"]);
const HASH_RE = /^[a-f0-9]{64}$/;
const REVISION_RE = /^[a-f0-9]{40,64}$/;
const PROPOSAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/;
const DECISION_FILE_RE = /^(\d{8}T\d{9}Z)-([a-f0-9]{64})\.json$/;

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
  if (!value || typeof value !== "object" || value.integrity?.algorithm !== "sha256") return false;
  const expected = value.integrity.reportSha256 ?? value.integrity.sha256;
  if (!HASH_RE.test(expected ?? "")) return false;
  const unsigned = { ...value };
  delete unsigned.integrity;
  return sha256(canonical(unsigned)) === expected;
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) &&
    relative !== ".." && !path.isAbsolute(relative));
}

async function readPrivateJsonFile(filePath, parent) {
  const info = await fs.lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077) !== 0 ||
      info.size > MAX_BYTES) {
    throw new Error("Private completion-review file failed its type, permission, or size check");
  }
  const realPath = await fs.realpath(filePath);
  if (!within(parent, realPath)) throw new Error("Private completion-review file escaped its directory");
  return JSON.parse(await fs.readFile(realPath, "utf8"));
}

function validSourceIdentity(identity) {
  return identity && REVISION_RE.test(identity.revision ?? "") &&
    HASH_RE.test(identity.inputInventorySha256 ?? "") &&
    HASH_RE.test(identity.dirtyInputSha256 ?? "");
}

function validRunPath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.posix.isAbsolute(value) && !value.includes("\\") &&
    value.split("/").every(part => part && part !== "." && part !== "..");
}

function sameSourceIdentity(left, right) {
  return left?.revision === right?.revision &&
    left?.inputInventorySha256 === right?.inputInventorySha256 &&
    left?.dirtyInputSha256 === right?.dirtyInputSha256;
}

function verifyDecision(record, filename) {
  const match = DECISION_FILE_RE.exec(filename);
  const expectedTimeKey = typeof record?.decidedAt === "string"
    ? record.decidedAt.replace(/[-:.]/g, "")
    : "";
  const identity = record && {
    runId: record.runId,
    runPath: record.runPath,
    proposalId: record.proposalId,
    proposalKey: record.proposalKey,
    decision: record.decision,
    reportSha256: record.reportSha256,
    sourceIdentity: record.sourceIdentity,
    previousDecisionId: record.previousDecisionId ?? null,
  };
  return isSealed(record) &&
    record.schemaVersion === 1 &&
    HASH_RE.test(record.decisionId ?? "") &&
    match?.[1] === expectedTimeKey &&
    match?.[2] === record.decisionId &&
    typeof record.runId === "string" && /^[A-Za-z0-9._-]{1,180}$/.test(record.runId) &&
    validRunPath(record.runPath) &&
    PROPOSAL_ID_RE.test(record.proposalId ?? "") &&
    HASH_RE.test(record.proposalKey ?? "") &&
    HASH_RE.test(record.reportSha256 ?? "") &&
    validSourceIdentity(record.sourceIdentity) &&
    DECISIONS.has(record.decision) &&
    Number.isFinite(Date.parse(record.decidedAt ?? "")) &&
    new Date(record.decidedAt).toISOString() === record.decidedAt &&
    (record.previousDecisionId === null || HASH_RE.test(record.previousDecisionId ?? "")) &&
    (record.previousDecisionId === null || HASH_RE.test(record.previousDecisionId ?? "")) &&
    record.decisionId === sha256(canonical(identity));
}

export function verifyProposalDecisionRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const identity = {
    runId: record.runId,
    runPath: record.runPath,
    proposalId: record.proposalId,
    proposalKey: record.proposalKey,
    decision: record.decision,
    reportSha256: record.reportSha256,
    sourceIdentity: record.sourceIdentity,
    previousDecisionId: record.previousDecisionId ?? null,
  };
  return isSealed(record) &&
    record.schemaVersion === 1 &&
    HASH_RE.test(record.decisionId ?? "") &&
    typeof record.runId === "string" && /^[A-Za-z0-9._-]{1,180}$/.test(record.runId) &&
    validRunPath(record.runPath) &&
    PROPOSAL_ID_RE.test(record.proposalId ?? "") &&
    HASH_RE.test(record.proposalKey ?? "") &&
    HASH_RE.test(record.reportSha256 ?? "") &&
    validSourceIdentity(record.sourceIdentity) &&
    DECISIONS.has(record.decision) &&
    Number.isFinite(Date.parse(record.decidedAt ?? "")) &&
    new Date(record.decidedAt).toISOString() === record.decidedAt &&
    (record.previousDecisionId === null || HASH_RE.test(record.previousDecisionId ?? "")) &&
    record.decisionId === sha256(canonical(identity));
}

async function ensureDirectory(root, parts) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("Proposal decision storage must be a private real directory");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await fs.mkdir(current, { mode: 0o700 });
        await fs.chmod(current, 0o700);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
        const raced = await fs.lstat(current);
        if (raced.isSymbolicLink() || !raced.isDirectory()) {
          throw new Error("Proposal decision storage must be a private real directory");
        }
      }
    }
  }
  await fs.chmod(current, 0o700);
  return current;
}

async function readDecisionLog(root) {
  let directory = root;
  const parts = FEEDBACK_DIR.split("/");
  for (const [index, part] of parts.entries()) {
    directory = path.join(directory, part);
    try {
      const info = await fs.lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory() ||
          (index === parts.length - 1 && (info.mode & 0o077) !== 0)) {
        return { status: "DEGRADED", decisions: [], warnings: ["Decision path is not a private real directory."] };
      }
    } catch (error) {
      if (error.code === "ENOENT") return { status: "CURRENT", decisions: [], warnings: [] };
      return { status: "DEGRADED", decisions: [], warnings: ["Decision history could not be opened."] };
    }
  }
  let names;
  try {
    names = (await fs.readdir(directory)).filter(name => DECISION_FILE_RE.test(name)).sort();
  } catch {
    return { status: "DEGRADED", decisions: [], warnings: ["Decision history could not be listed."] };
  }
  const warnings = [];
  const selected = names.slice(-MAX_DECISIONS).reverse();
  let loadedBytes = 0;
  const decisions = [];
  for (const name of selected) {
    try {
      const file = path.join(directory, name);
      const info = await fs.lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077) !== 0 ||
          loadedBytes + info.size > MAX_BYTES) {
        warnings.push("Decision history was truncated or contained an unsafe record.");
        break;
      }
      loadedBytes += info.size;
      const record = JSON.parse(await fs.readFile(file, "utf8"));
      if (!verifyDecision(record, name)) {
        warnings.push(`Invalid proposal decision record rejected: ${name}`);
        continue;
      }
      decisions.push(record);
    } catch {
      warnings.push(`Unreadable proposal decision record rejected: ${name}`);
    }
  }
  if (names.length > selected.length) warnings.push("Older proposal decisions exceed the record limit.");
  decisions.sort((a, b) =>
    a.decidedAt.localeCompare(b.decidedAt) || a.decisionId.localeCompare(b.decisionId));
  return {
    status: warnings.length ? "DEGRADED" : "CURRENT",
    decisions,
    warnings,
  };
}

export async function loadProposalFeedback(
  root,
  sourceIdentity,
  { env = {}, storageObjects, journalClass } = {},
) {
  const rootReal = await fs.realpath(root);
  const log = await readDecisionLog(rootReal);
  let status = log.status;
  const warnings = [...log.warnings];
  let allDecisions = log.decisions;
  let storageStatus = "LOCAL_ONLY";
  const bucketConfigured = Boolean(env.Replit_storage_bucket_id ||
    env.DATABASE_RECOVERY_BUCKET_ID || env.REPLIT_BUCKET_ID);
  if (bucketConfigured) {
    try {
      const { readProposalDecisions } = await import("./completion-proposal-bucket.mjs");
      const durable = await readProposalDecisions({ env, storageObjects, journalClass });
      if (durable.status !== "VERIFIED" && durable.status !== "EMPTY") {
        status = "DEGRADED";
        storageStatus = "BLOCKED";
        warnings.push("Private App Storage proposal-decision history could not be verified.");
      } else {
        allDecisions = mergeDecisionRecords(log.decisions, durable.decisions);
        const durableIds = new Set(durable.decisions.map(record => record.decisionId));
        const hasUnsyncedLocal = log.decisions.some(record => !durableIds.has(record.decisionId));
        if (hasUnsyncedLocal) {
          status = "DEGRADED";
          storageStatus = "LOCAL_UNSYNCED";
          warnings.push("Local proposal decisions are not yet verified in private App Storage.");
        } else {
          storageStatus = durable.status === "EMPTY" ? "DURABLE_EMPTY" : "DURABLE_VERIFIED";
        }
      }
    } catch {
      status = "DEGRADED";
      storageStatus = "BLOCKED";
      warnings.push("Private App Storage proposal-decision history could not be read.");
    }
  }
  const current = validSourceIdentity(sourceIdentity)
    ? allDecisions.filter(record => sameSourceIdentity(record.sourceIdentity, sourceIdentity))
    : [];
  const latest = new Map();
  const groups = new Map();
  for (const record of current) {
    const group = groups.get(record.proposalKey) ?? [];
    group.push(record);
    groups.set(record.proposalKey, group);
  }
  for (const [proposalKey, records] of groups) {
    const byId = new Map(records.map(record => [record.decisionId, record]));
    const superseded = new Set(records.map(record => record.previousDecisionId).filter(Boolean));
    if ([...superseded].some(decisionId => !byId.has(decisionId))) {
      status = "DEGRADED";
      warnings.push(`Proposal decision chain is incomplete for ${proposalKey}.`);
      continue;
    }
    const heads = [...byId.values()].filter(record => !superseded.has(record.decisionId));
    if (heads.length !== 1) {
      status = "DEGRADED";
      warnings.push(`Proposal decision history has conflicting branches for ${proposalKey}.`);
      continue;
    }
    latest.set(proposalKey, heads[0]);
  }
  return {
    status,
    storageStatus,
    warnings,
    decisions: current,
    allDecisions,
    latest,
  };
}

function mergeDecisionRecords(...lists) {
  const byId = new Map();
  for (const record of lists.flat()) {
    if (!verifyProposalDecisionRecord(record)) {
      throw new Error("Invalid proposal decision history record");
    }
    const previous = byId.get(record.decisionId);
    if (previous && canonical(previous) !== canonical(record)) {
      throw new Error(`Conflicting proposal decision ${record.decisionId}`);
    }
    byId.set(record.decisionId, record);
  }
  return [...byId.values()].sort((a, b) =>
    a.decidedAt.localeCompare(b.decidedAt) || a.decisionId.localeCompare(b.decisionId));
}

function mapDecision(decision) {
  if (decision === "accept-for-plan") return "APPROVED_FOR_PLAN";
  if (decision === "defer") return "DEFERRED";
  if (decision === "reject") return "REJECTED";
  return "NEEDS_REVIEW";
}

export function applyProposalFeedback(proposals, feedback) {
  return proposals.map(proposal => {
    const decision = feedback.latest.get(proposal.proposalKey);
    if (!decision) return proposal;
    return {
      ...proposal,
      state: mapDecision(decision.decision),
      reviewDecision: {
        decision: decision.decision,
        decidedAt: decision.decidedAt,
        decisionId: decision.decisionId,
        scope: "EXACT_SOURCE_IDENTITY_ONLY",
        automaticallyApplied: false,
      },
    };
  });
}

async function readVerifiedRun(root, runDirectory) {
  const rootReal = await fs.realpath(root);
  const requestedRunPath = path.resolve(rootReal, runDirectory);
  if (!within(rootReal, requestedRunPath)) throw new Error("Run directory must stay inside the repository");
  const runReal = await fs.realpath(requestedRunPath);
  if (runReal !== requestedRunPath) throw new Error("Run directory cannot resolve through a symlink");
  if (!within(rootReal, runReal)) throw new Error("Run directory must stay inside the repository");
  const directoryInfo = await fs.lstat(runReal);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new Error("Run directory must be a real directory");
  }
  const reportPath = path.join(runReal, "report.json");
  const summaryPath = path.join(runReal, "learning.json");
  const [reportInfo, summaryInfo] = await Promise.all([
    fs.lstat(reportPath),
    fs.lstat(summaryPath),
  ]);
  if ([reportInfo, summaryInfo].some(info => info.isSymbolicLink() || !info.isFile())) {
    throw new Error("Run report and proposal summary must be regular files");
  }
  const [reportReal, summaryReal] = await Promise.all([
    fs.realpath(reportPath),
    fs.realpath(summaryPath),
  ]);
  if (!within(runReal, reportReal) || !within(runReal, summaryReal)) {
    throw new Error("Run evidence resolves outside its run directory");
  }
  const [reportRaw, summaryRaw] = await Promise.all([
    fs.readFile(reportReal),
    fs.readFile(summaryReal),
  ]);
  if (reportRaw.length > MAX_BYTES || summaryRaw.length > MAX_BYTES) {
    throw new Error("Run evidence exceeds the review size limit");
  }
  const report = JSON.parse(reportRaw.toString("utf8"));
  const summary = JSON.parse(summaryRaw.toString("utf8"));
  const reportSha256 = report.integrity?.reportSha256 ?? report.integrity?.sha256;
  if (!isSealed(report) || !isSealed(summary) ||
      summary.reportSha256 !== reportSha256 ||
      summary.runId !== path.basename(runReal) ||
      !sameSourceIdentity(summary.sourceIdentity, report.sourceIdentity) ||
      !Array.isArray(summary.currentProposals)) {
    throw new Error("Run report or proposal summary failed integrity and identity checks");
  }
  return { root: rootReal, runDirectory: runReal, report, summary, reportSha256 };
}

async function createDecisionFile(root, record) {
  const directory = await ensureDirectory(root, FEEDBACK_DIR.split("/"));
  const timeKey = record.decidedAt.replace(/[-:.]/g, "");
  const destination = path.join(directory, `${timeKey}-${record.decisionId}.json`);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const contents = `${JSON.stringify(record, null, 2)}\n`;
  await fs.writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
  try {
    await fs.link(temporary, destination);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readPrivateJsonFile(destination, directory);
    if (!verifyDecision(existing, path.basename(destination)) ||
        existing.proposalKey !== record.proposalKey ||
        existing.decision !== record.decision) {
      throw new Error("Conflicting proposal decision record already exists");
    }
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return destination;
}

export async function recordProposalDecision({
  root = DEFAULT_ROOT,
  runDirectory,
  proposalId,
  decision,
  env = {},
  storageObjects,
  journalClass,
} = {}) {
  if (!runDirectory || typeof proposalId !== "string" || !PROPOSAL_ID_RE.test(proposalId) ||
      !DECISIONS.has(decision)) {
    throw new Error("A run directory, proposal ID, and supported decision are required");
  }
  const run = await readVerifiedRun(root, runDirectory);
  if (!validSourceIdentity(run.report.sourceIdentity)) {
    throw new Error("A reviewed decision requires complete current source hashes");
  }
  const proposal = run.summary.currentProposals.find(item => item.id === proposalId);
  if (!proposal || !HASH_RE.test(proposal.proposalKey ?? "")) {
    throw new Error("Proposal is not present in the integrity-verified current run");
  }
  let feedback = await loadProposalFeedback(run.root, run.report.sourceIdentity, {
    env,
    storageObjects,
    journalClass,
  });
  if (feedback.storageStatus === "LOCAL_UNSYNCED") {
    const { persistConfiguredProposalDecisions } = await import("./completion-proposal-bucket.mjs");
    const migrated = await persistConfiguredProposalDecisions({
      decisions: feedback.allDecisions,
      env,
      storageObjects,
      journalClass,
    });
    if (migrated.status !== "VERIFIED" ||
        feedback.allDecisions.some(record =>
          !migrated.decisions.some(stored => stored.decisionId === record.decisionId))) {
      throw new Error(migrated.reason ?? "Existing local decisions could not be migrated to private App Storage");
    }
    feedback = await loadProposalFeedback(run.root, run.report.sourceIdentity, {
      env,
      storageObjects,
      journalClass,
    });
  }
  if (feedback.status !== "CURRENT") {
    throw new Error("Proposal decision history is degraded; no new decision can be recorded");
  }
  const prior = feedback.latest.get(proposal.proposalKey) ?? null;
  if (decision === "reopen" && !prior) {
    throw new Error("Only a previously decided proposal can be reopened");
  }
  if (prior?.decision === decision) {
    return {
      status: "ALREADY_RECORDED",
      record: prior,
      durability: bucketConfigured ? "DURABLE_VERIFIED" : "LOCAL_ONLY",
    };
  }
  const recordedAt = new Date().toISOString();
  const identity = {
    runId: run.summary.runId,
    runPath: path.relative(run.root, run.runDirectory),
    proposalId,
    proposalKey: proposal.proposalKey,
    decision,
    reportSha256: run.reportSha256,
    sourceIdentity: run.report.sourceIdentity,
    previousDecisionId: prior?.decisionId ?? null,
  };
  const decisionId = sha256(canonical(identity));
  const record = seal({
    schemaVersion: 1,
    decisionId,
    ...identity,
    decidedAt: recordedAt,
  });
  const bucketConfigured = Boolean(env.Replit_storage_bucket_id ||
    env.DATABASE_RECOVERY_BUCKET_ID || env.REPLIT_BUCKET_ID);
  let durableStatus = "LOCAL_ONLY";
  if (bucketConfigured) {
    const { persistConfiguredProposalDecisions } = await import("./completion-proposal-bucket.mjs");
    const persisted = await persistConfiguredProposalDecisions({
      decisions: [...feedback.allDecisions, record],
      env,
      storageObjects,
      journalClass,
    });
    if (persisted.status !== "VERIFIED" ||
        !persisted.decisions.some(item => item.decisionId === record.decisionId)) {
      throw new Error(persisted.reason ?? "Private App Storage did not verify the proposal decision");
    }
    durableStatus = "DURABLE_VERIFIED";
  }
  const recordPath = await createDecisionFile(run.root, record);
  return {
    status: durableStatus === "DURABLE_VERIFIED" ? "RECORDED_DURABLY" : "RECORDED_LOCAL_ONLY",
    record,
    durability: durableStatus,
    recordPath: path.relative(run.root, recordPath),
  };
}

export async function verifyAcceptedProposalLink({
  root,
  proposalLink,
  sourceIdentity,
  requireLatestDecision = true,
  env = {},
  storageObjects,
  journalClass,
} = {}) {
  if (!proposalLink || proposalLink.schemaVersion !== 1 ||
      !PROPOSAL_ID_RE.test(proposalLink.proposalId ?? "") ||
      !HASH_RE.test(proposalLink.proposalKey ?? "") ||
      !HASH_RE.test(proposalLink.approvalDecisionId ?? "") ||
      !/^[A-Za-z0-9._-]{1,180}$/.test(proposalLink.approvalRunId ?? "") ||
      !HASH_RE.test(proposalLink.approvalReportSha256 ?? "") ||
      !validSourceIdentity(proposalLink.sourceIdentity) ||
      !sameSourceIdentity(proposalLink.sourceIdentity, sourceIdentity)) {
    throw new Error("Proposal link is malformed or does not match the plan source identity");
  }
  const log = await loadProposalFeedback(root, sourceIdentity, {
    env,
    storageObjects,
    journalClass,
  });
  const approved = log.decisions.find(record =>
    record.decisionId === proposalLink.approvalDecisionId);
  if (!approved || approved.decision !== "accept-for-plan" ||
      approved.proposalId !== proposalLink.proposalId ||
      approved.proposalKey !== proposalLink.proposalKey ||
      approved.runId !== proposalLink.approvalRunId ||
      approved.reportSha256 !== proposalLink.approvalReportSha256 ||
      !sameSourceIdentity(approved.sourceIdentity, proposalLink.sourceIdentity)) {
    throw new Error("Proposal link has no matching integrity-verified approval record");
  }
  const approvedRun = await readVerifiedRun(root, approved.runPath);
  const approvedProposal = approvedRun.summary.currentProposals.find(item =>
    item.id === approved.proposalId && item.proposalKey === approved.proposalKey);
  if (approvedRun.reportSha256 !== approved.reportSha256 ||
      !sameSourceIdentity(approvedRun.report.sourceIdentity, approved.sourceIdentity) ||
      !approvedProposal) {
    throw new Error("Proposal approval no longer matches its integrity-verified source run");
  }
  if (requireLatestDecision &&
      log.latest.get(approved.proposalKey)?.decisionId !== approved.decisionId) {
    throw new Error("Proposal approval was superseded; review and approve it again");
  }
  if (log.status !== "CURRENT") {
    throw new Error("Proposal decision history is degraded; linked execution is blocked");
  }
  return {
    schemaVersion: 1,
    proposalId: approved.proposalId,
    proposalKey: approved.proposalKey,
    approvalDecisionId: approved.decisionId,
    approvalRunId: approved.runId,
    approvalReportSha256: approved.reportSha256,
    sourceIdentity: approved.sourceIdentity,
  };
}

export async function prepareProposalPlanDraft({
  root = DEFAULT_ROOT,
  runDirectory,
  proposalId,
  env = {},
  storageObjects,
  journalClass,
} = {}) {
  if (!runDirectory || typeof proposalId !== "string" || !PROPOSAL_ID_RE.test(proposalId)) {
    throw new Error("A run directory and proposal ID are required");
  }
  const run = await readVerifiedRun(root, runDirectory);
  if (!validSourceIdentity(run.report.sourceIdentity)) {
    throw new Error("A plan draft requires complete current source hashes");
  }
  const proposal = run.summary.currentProposals.find(item => item.id === proposalId);
  if (!proposal || !HASH_RE.test(proposal.proposalKey ?? "")) {
    throw new Error("Proposal is not present in the integrity-verified current run");
  }
  const feedback = await loadProposalFeedback(run.root, run.report.sourceIdentity, {
    env,
    storageObjects,
    journalClass,
  });
  const decision = feedback.latest.get(proposal.proposalKey);
  if (decision?.decision !== "accept-for-plan") {
    throw new Error("Preparing a plan draft requires accept-for-plan for this exact source identity");
  }
  const proposalLink = await verifyAcceptedProposalLink({
    root: run.root,
    proposalLink: {
      schemaVersion: 1,
      proposalId,
      proposalKey: proposal.proposalKey,
      approvalDecisionId: decision.decisionId,
      approvalRunId: decision.runId,
      approvalReportSha256: decision.reportSha256,
      sourceIdentity: decision.sourceIdentity,
    },
    sourceIdentity: run.report.sourceIdentity,
    env,
    storageObjects,
    journalClass,
  });

  const directory = await ensureDirectory(run.root, [...DRAFTS_DIR.split("/"), run.summary.runId]);
  const destination = path.join(
    directory,
    `${proposal.proposalKey}-${decision.decisionId}.json`,
  );
  const draft = seal({
    schemaVersion: 0,
    status: "DRAFT_NOT_EXECUTABLE",
    generatedAt: new Date().toISOString(),
    runId: run.summary.runId,
    proposalId,
    proposalKey: proposal.proposalKey,
    proposalKind: proposal.kind,
    reportSha256: run.reportSha256,
    sourceIdentity: run.report.sourceIdentity,
    proposalLink,
    approvedDecisionId: decision.decisionId,
    context: {
      checkId: proposal.checkId ?? null,
      remediationId: proposal.remediationId ?? null,
      productArea: proposal.productArea ?? null,
      priority: proposal.priority ?? null,
      evidence: proposal.evidence ?? null,
      requiredEvidence: proposal.requiredEvidence ?? [],
      recommendedNextAction: proposal.recommendedNextAction ?? null,
      competitorSources: proposal.competitorSources ?? [],
    },
    changes: [],
    checks: [],
    requiredBeforeExecution: [
      "Add exact text changes with repository-relative paths and before/after SHA-256 values.",
      "Select at least one supported verification command.",
      "Review the complete patch and its source identity.",
      "Rebuild a schemaVersion 1 executor plan and independently approve its exact SHA-256.",
    ],
  });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(draft, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await fs.link(temporary, destination);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readPrivateJsonFile(destination, directory);
    if (!isSealed(existing) || existing.status !== "DRAFT_NOT_EXECUTABLE" ||
        existing.reportSha256 !== run.reportSha256 ||
        existing.approvedDecisionId !== decision.decisionId) {
      throw new Error("A conflicting plan draft already exists for this proposal");
    }
    return {
      status: "ALREADY_PREPARED",
      draft: existing,
      draftPath: path.relative(run.root, destination),
    };
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return {
    status: "PREPARED_NON_EXECUTABLE",
    draft,
    draftPath: path.relative(run.root, destination),
  };
}

export async function listRunProposals({
  root = DEFAULT_ROOT,
  runDirectory,
  env = {},
  storageObjects,
  journalClass,
} = {}) {
  if (!runDirectory) throw new Error("A run directory is required");
  const run = await readVerifiedRun(root, runDirectory);
  const feedback = await loadProposalFeedback(run.root, run.report.sourceIdentity, {
    env,
    storageObjects,
    journalClass,
  });
  return {
    runId: run.summary.runId,
    reportSha256: run.reportSha256,
    feedbackStatus: feedback.status,
    storageStatus: feedback.storageStatus,
    feedbackWarnings: feedback.warnings,
    verifiedProposalResolutions: run.summary.verifiedProposalResolutions ?? [],
    proposals: applyProposalFeedback(run.summary.currentProposals, feedback),
  };
}

function parseArgs(args) {
  if (args[0] === "--help" || args[0] === "-h") return { help: true };
  const command = args[0];
  const options = { root: DEFAULT_ROOT };
  for (let index = 1; index < args.length; index++) {
    if (args[index] === "--root" && args[index + 1]) options.root = path.resolve(args[++index]);
    else if (args[index] === "--run-dir" && args[index + 1]) options.runDirectory = args[++index];
    else if (args[index] === "--proposal-id" && args[index + 1]) options.proposalId = args[++index];
    else if (args[index] === "--decision" && args[index + 1]) options.decision = args[++index];
    else if (args[index] === "--help" || args[index] === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!options.help && !["list", "decide", "prepare"].includes(command)) {
    throw new Error("Use list, decide, or prepare");
  }
  if (!options.help && !options.runDirectory) throw new Error("Specify --run-dir");
  if (["decide", "prepare"].includes(command) && !options.proposalId) {
    throw new Error(`${command} requires --proposal-id`);
  }
  if (command === "decide" && !options.decision) {
    throw new Error("decide requires --proposal-id and --decision");
  }
  return { command, ...options };
}

async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log("Usage: npm run completion:review -- list --run-dir <run-directory>");
      console.log("       npm run completion:review -- decide --run-dir <run-directory> --proposal-id <id> --decision <accept-for-plan|defer|reject|reopen>");
      console.log("       npm run completion:review -- prepare --run-dir <run-directory> --proposal-id <id>");
      console.log("Decisions are source-bound; configured bucket writes require verified readback.");
      console.log("Without configured private storage, decisions are LOCAL_ONLY.");
      console.log("Decisions never apply a plan or edit source code.");
      console.log("Prepared drafts have schemaVersion 0 and cannot be executed.");
      return 0;
    }
    if (options.command === "list") {
      console.log(JSON.stringify(await listRunProposals({ ...options, env: process.env }), null, 2));
      return 0;
    }
    if (options.command === "prepare") {
      const result = await prepareProposalPlanDraft({ ...options, env: process.env });
      console.log(JSON.stringify({
        status: result.status,
        draftPath: result.draftPath,
        schemaVersion: result.draft.schemaVersion,
        executable: false,
        sourceEdited: false,
      }, null, 2));
      return 0;
    }
    const result = await recordProposalDecision({ ...options, env: process.env });
    console.log(JSON.stringify({
      status: result.status,
      decisionId: result.record.decisionId,
      proposalId: result.record.proposalId,
      decision: result.record.decision,
    recordPath: result.recordPath ?? null,
    durability: result.durability ?? "LOCAL_ONLY",
      applied: false,
      sourceEdited: false,
    }, null, 2));
    return 0;
  } catch (error) {
    console.error(`completion-proposal-review: ${error.message}`);
    return 1;
  }
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then(code => { process.exitCode = code; });
