#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildRepositoryUnderstanding } from "./completion-understanding.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_PARTS = [".local", "repository-verification", "atlas"];
const MAX_POLICY_BYTES = 64 * 1024;
const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const MAX_RECURSION_PASSES = 3;
const MAX_REPAIR_PACKETS = 300;

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

function verifySealed(value) {
  if (!value || typeof value !== "object" || value.integrity?.algorithm !== "sha256") return false;
  const expected = value.integrity.sha256 ?? value.integrity.reportSha256;
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) return false;
  const unsigned = { ...value };
  delete unsigned.integrity;
  return sha256(canonical(unsigned)) === expected;
}

function stripComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("#") ? "" : line;
}

export function parseAtlasPolicy(source, sourcePath = "policy.atlas") {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAX_POLICY_BYTES) {
    throw new Error(`Atlas policy must be text no larger than ${MAX_POLICY_BYTES} bytes`);
  }
  const ast = {
    language: "Atlas",
    schemaVersion: 1,
    sourcePath,
    repository: null,
    actions: [],
    policies: [],
    verifyPolicy: null,
    recursionMaxPasses: 1,
  };
  let block = null;
  const seenPolicies = new Set();
  const lines = source.split(/\r?\n/);

  for (const [index, original] of lines.entries()) {
    const line = stripComment(original).trim().replace(/;$/, "").trim();
    if (!line) continue;
    if (line === "}") {
      if (!block) throw new Error(`${sourcePath}:${index + 1}: unexpected closing brace`);
      if (block.kind === "audit") ast.actions.push(...block.actions);
      else {
        ast.policies.push(block.policy);
        seenPolicies.add(block.policy.name);
      }
      block = null;
      continue;
    }
    if (block?.kind === "audit") {
      if (line === "recurse") {
        ast.recursionMaxPasses = 2;
        block.actions.push({ kind: "recurse", maxPasses: 2, line: index + 1 });
        continue;
      }
      const recurse = line.match(/^recurse\s+max\s+(\d+)$/);
      if (recurse) {
        const maxPasses = Number(recurse[1]);
        if (!Number.isInteger(maxPasses) || maxPasses < 2 || maxPasses > MAX_RECURSION_PASSES) {
          throw new Error(`${sourcePath}:${index + 1}: recurse max must be between 2 and ${MAX_RECURSION_PASSES}`);
        }
        ast.recursionMaxPasses = maxPasses;
        block.actions.push({ kind: "recurse", maxPasses, line: index + 1 });
        continue;
      }
      if (/^(scan repository|discover components|map dependencies|map features|detect missing|detect unfinished|analyze intent|verify (?:completeness|security|performance|architecture|production))$/.test(line)) {
        const [verb, ...targetParts] = line.split(" ");
        block.actions.push({ kind: `${verb} ${targetParts.join(" ")}`, line: index + 1 });
        continue;
      }
      const subsystem = line.match(/^verify subsystem\s+"([^"\r\n]{1,100})"$/);
      if (subsystem) {
        block.actions.push({ kind: "verify subsystem", name: subsystem[1], line: index + 1 });
        continue;
      }
      const namedSubsystem = line.match(/^verify (frontend|backend|database|apis|workflows|infrastructure|tests|documentation|configurations)$/i);
      if (namedSubsystem) {
        block.actions.push({ kind: "verify subsystem", name: namedSubsystem[1], line: index + 1 });
        continue;
      }
      const readFile = line.match(/^read file\s+"([^"\r\n]{1,240})"$/);
      if (readFile) {
        block.actions.push({ kind: "read file", path: readFile[1], line: index + 1 });
        continue;
      }
      const readSymbol = line.match(/^read symbol\s+"([^"\r\n]{1,160})"$/);
      if (readSymbol) {
        block.actions.push({ kind: "read symbol", name: readSymbol[1], line: index + 1 });
        continue;
      }
      if (line === "draft repair plans") {
        block.actions.push({ kind: line, line: index + 1 });
        continue;
      }
      if (line === "write private report") {
        block.actions.push({ kind: line, line: index + 1 });
        continue;
      }
      const headCommand = line.match(/^repository\.(stats|graph|health|coverage|dependencies|risks)\(\)$/);
      if (headCommand) {
        block.actions.push({ kind: `repository.${headCommand[1]}`, line: index + 1 });
        continue;
      }
      throw new Error(`${sourcePath}:${index + 1}: unsupported audit statement`);
    }
    if (block?.kind === "policy") {
      if (line === "noCriticalIssues" || line === "noDeadCode") {
        block.policy.rules.push({ metric: line, operator: "must-hold", threshold: null });
        continue;
      }
      const threshold = line.match(/^(coverage|documentation|security|performance)\s*>\s*(\d{1,3})%$/);
      if (threshold) {
        const value = Number(threshold[2]);
        if (value > 100) throw new Error(`${sourcePath}:${index + 1}: percentage threshold cannot exceed 100`);
        block.policy.rules.push({
          metric: threshold[1],
          operator: ">",
          threshold: value,
        });
        continue;
      }
      throw new Error(`${sourcePath}:${index + 1}: unsupported policy rule`);
    }

    const repository = line.match(/^repository\s+([A-Za-z][A-Za-z0-9_-]{0,63})$/);
    if (repository && !ast.repository) {
      ast.repository = repository[1];
      continue;
    }
    if (line === "audit repository {") {
      if (ast.actions.length || block) throw new Error(`${sourcePath}:${index + 1}: duplicate audit block`);
      block = { kind: "audit", actions: [] };
      continue;
    }
    const policy = line.match(/^policy\s+([A-Za-z][A-Za-z0-9_-]{0,63})\s*\{$/);
    if (policy) {
      if (block || seenPolicies.has(policy[1]) || ast.policies.some(item => item.name === policy[1])) {
        throw new Error(`${sourcePath}:${index + 1}: duplicate or nested policy block`);
      }
      block = { kind: "policy", policy: { name: policy[1], rules: [] } };
      continue;
    }
    const verify = line.match(/^verify\s+([A-Za-z][A-Za-z0-9_-]{0,63})$/);
    if (verify && !block) {
      ast.verifyPolicy = verify[1];
      continue;
    }
    if (/^verify (completeness|security|performance|architecture|production)$/.test(line) && !block) {
      ast.actions.push({ kind: line, line: index + 1 });
      continue;
    }
    const topLevelSubsystem = line.match(/^verify (frontend|backend|database|apis|workflows|infrastructure|tests|documentation|configurations)$/i);
    if (topLevelSubsystem && !block) {
      ast.actions.push({ kind: "verify subsystem", name: topLevelSubsystem[1], line: index + 1 });
      continue;
    }
    const topLevelHeadCommand = line.match(/^repository\.(stats|graph|health|coverage|dependencies|risks)\(\)$/);
    if (topLevelHeadCommand && !block) {
      ast.actions.push({ kind: `repository.${topLevelHeadCommand[1]}`, line: index + 1 });
      continue;
    }
    throw new Error(`${sourcePath}:${index + 1}: unsupported Atlas statement`);
  }

  if (block) throw new Error(`${sourcePath}: unclosed ${block.kind} block`);
  if (!ast.repository) throw new Error(`${sourcePath}: declare a repository first`);
  if (ast.verifyPolicy && !ast.policies.some(item => item.name === ast.verifyPolicy)) {
    throw new Error(`${sourcePath}: verified policy ${ast.verifyPolicy} is not declared`);
  }
  for (const policy of ast.policies) {
    if (policy.rules.length === 0) throw new Error(`${sourcePath}: policy ${policy.name} has no rules`);
  }
  return ast;
}

function deriveRepositoryGraph(dossier, inventory = null) {
  const filesByArea = new Map();
  for (const module of dossier.modules) {
    const first = module.path.split("/")[0];
    const area = module.path.includes("/") ? first : "(root)";
    filesByArea.set(area, (filesByArea.get(area) ?? 0) + 1);
  }
  const topAreas = [...filesByArea.entries()]
    .map(([name, codeFileCount]) => ({ name, codeFileCount }))
    .sort((a, b) => b.codeFileCount - a.codeFileCount || a.name.localeCompare(b.name));
  const pathFeatureCandidates = topAreas.slice(0, 100).map(area => ({
    ...area,
    evidence: "source file path grouping only",
    confidence: "low",
  }));
  const routeModules = dossier.modules.filter(module => module.routes.length > 0);
  const entryModules = dossier.modules.filter(module => module.scriptEntrypoints.length > 0);
  const relationshipCounts = {};
  for (const module of dossier.modules) {
    for (const edge of module.referenceEdges ?? []) {
      relationshipCounts[edge.kind] = (relationshipCounts[edge.kind] ?? 0) + 1;
    }
  }
  const lifecycleCounts = {};
  const fileTypeCounts = {};
  const filesByRoot = {};
  for (const file of [...(inventory?.trackedFiles ?? []), ...(inventory?.untrackedInputFiles ?? [])]) {
    lifecycleCounts[file.lifecycle] = (lifecycleCounts[file.lifecycle] ?? 0) + 1;
    fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] ?? 0) + 1;
    const root = file.path.split("/")[0] || "(root)";
    filesByRoot[root] = (filesByRoot[root] ?? 0) + 1;
  }
  return {
    repository: {
      revision: dossier.sourceIdentity.gitRevision,
      sourceFileManifestSha256: dossier.sourceIdentity.sourceFileManifestSha256,
      complete: dossier.sourceIdentity.complete,
      inventorySha256: inventory?.sourceIdentity?.inventorySha256 ?? null,
    },
    fileInventory: {
      status: inventory ? "AVAILABLE" : "NOT_SUPPLIED",
      trackedPathCount: inventory?.trackedPathCount ?? null,
      lifecycleCounts,
      fileTypeCounts,
      filePathsByRoot: Object.entries(filesByRoot)
        .map(([name, fileCount]) => ({ name, fileCount }))
        .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name)),
      evidence: "Every tracked path is counted using the existing private inventory classification; counts do not establish runtime reachability.",
    },
    counts: {
      sourceFiles: dossier.summary.sourceFiles,
      testFiles: dossier.summary.testFiles,
      modules: dossier.modules.length,
      symbols: dossier.summary.symbols ?? 0,
      exportedSymbols: dossier.summary.exports,
      importEdges: dossier.summary.moduleEdges,
      routeCandidates: dossier.summary.routeCandidates,
      routeModules: routeModules.length,
      packageEntrypoints: entryModules.length,
      resolvedReferenceEdges: dossier.summary.resolvedReferenceEdges ?? 0,
    },
    relationshipCounts,
    codeFilesByTopLevelPath: topAreas,
    pathFeatureCandidates,
    routeModules: routeModules.slice(0, 200).map(module => ({
      path: module.path,
      routes: module.routes,
      sha256: module.sha256,
    })),
    entryModules: entryModules.slice(0, 200).map(module => ({
      path: module.path,
      scripts: module.scriptEntrypoints,
      sha256: module.sha256,
    })),
  };
}

function statusForChecks(report, dossier, pattern) {
  if (!report || dossier.sourceIdentity.runSourceMatch !== true) {
    return { status: "UNVERIFIED", reason: "No matching, hash-bound verification evidence was supplied." };
  }
  const checks = report.checks.filter(check => pattern.test(String(check.id ?? "")));
  if (!checks.length) return { status: "UNVERIFIED", reason: "The current report has no matching verification checks." };
  if (checks.some(check => check.status === "FAIL")) {
    return { status: "FAIL", evidence: checks.map(check => ({ id: check.id, status: check.status })) };
  }
  if (checks.some(check => check.status === "BLOCKED")) {
    return { status: "BLOCKED", evidence: checks.map(check => ({ id: check.id, status: check.status })) };
  }
  if (!checks.every(check => check.status === "PASS")) {
    return { status: "UNVERIFIED", evidence: checks.map(check => ({ id: check.id, status: check.status })) };
  }
  return { status: "PASS", evidence: checks.map(check => ({ id: check.id, status: check.status })) };
}

function policyEvaluation(policy, report, dossier) {
  if (!policy) return { name: null, status: "NOT_REQUESTED", rules: [] };
  const rules = policy.rules.map(rule => {
    if (rule.metric === "noCriticalIssues") {
      const critical = report?.findings?.filter(item =>
        String(item.severity ?? "").toLowerCase() === "critical") ?? [];
      const hasMeasuredCriticalSet = Array.isArray(report?.findings) &&
        report.findings.every(item => typeof item.severity === "string");
      return {
        ...rule,
        measuredValue: hasMeasuredCriticalSet ? critical.length : null,
        status: hasMeasuredCriticalSet ? critical.length === 0 ? "PASS" : "FAIL" : "UNVERIFIED",
        reason: hasMeasuredCriticalSet ? null : "The report does not classify every finding by severity.",
      };
    }
    if (rule.metric === "noDeadCode") {
      return {
        ...rule,
        measuredValue: null,
        status: "UNVERIFIED",
        reason: "Dead-code analysis is not implemented by static path/reference evidence.",
      };
    }
    const measuredValue = report?.metrics?.[rule.metric];
    const usableMetric = Number.isFinite(measuredValue) && measuredValue >= 0 && measuredValue <= 100;
    return {
      ...rule,
      measuredValue: usableMetric ? measuredValue : null,
      status: usableMetric ? measuredValue > rule.threshold ? "PASS" : "FAIL" : "UNVERIFIED",
      reason: usableMetric ? null : `No measured ${rule.metric} percentage was present in the matching report.`,
    };
  });
  const status = rules.every(rule => rule.status === "PASS") ? "PASS" :
    rules.some(rule => rule.status === "FAIL") ? "FAIL" : "UNVERIFIED";
  return { name: policy.name, status, rules };
}

function draftRepairPackets(dossier) {
  const modules = new Map(dossier.modules.map(module => [module.path, module]));
  const candidates = [
    ...(dossier.coverageCandidates ?? []).map(candidate => ({
      kind: "static-coverage-candidate",
      path: candidate.path,
      sourceSha256: candidate.sourceSha256,
      priority: candidate.priority,
      confidence: candidate.confidence,
      impactScore: candidate.impactScore,
      evidence: candidate.evidence,
      uncertainty: candidate.uncertainty,
      recommendedNextAction: candidate.recommendedNextAction,
    })),
    ...(dossier.unfinishedCandidates ?? []).map(candidate => ({
      kind: "unfinished-marker-candidate",
      path: candidate.path,
      sourceSha256: candidate.sourceSha256,
      line: candidate.line,
      marker: candidate.marker,
      priority: "P3",
      confidence: candidate.confidence,
      evidence: [{ kind: "source-marker", line: candidate.line, marker: candidate.marker }],
      uncertainty: [candidate.uncertainty],
      recommendedNextAction: "Inspect the marker in current source context and verify the expected behavior before planning a repair.",
    })),
  ].sort((a, b) =>
    (b.impactScore ?? 0) - (a.impactScore ?? 0) ||
    a.path.localeCompare(b.path) ||
    (a.line ?? 0) - (b.line ?? 0));
  const packets = candidates.slice(0, MAX_REPAIR_PACKETS).map(candidate => {
    const module = modules.get(candidate.path);
    const proposalId = candidate.kind === "static-coverage-candidate"
      ? `understanding-${sha256(`${candidate.path}:${candidate.sourceSha256}`).slice(0, 24)}`
      : `unfinished-${sha256(`${candidate.path}:${candidate.line}:${candidate.marker}:${candidate.sourceSha256}`).slice(0, 24)}`;
    const proposalKey = sha256(canonical(candidate.kind === "static-coverage-candidate"
      ? { kind: candidate.kind, path: candidate.path, sourceSha256: candidate.sourceSha256 }
      : {
        kind: candidate.kind,
        path: candidate.path,
        line: candidate.line,
        marker: candidate.marker,
        sourceSha256: candidate.sourceSha256,
      }));
    return {
      packetId: sha256(`${proposalId}:${proposalKey}`).slice(0, 32),
      proposalId,
      proposalKey,
      kind: candidate.kind,
      state: "NEEDS_REVIEW",
      source: {
        path: candidate.path,
        sha256: candidate.sourceSha256,
        revision: dossier.sourceIdentity.gitRevision,
        dossierSha256: dossier.integrity?.sha256 ?? null,
        inputInventorySha256: dossier.sourceIdentity.runSourceIdentity?.inputInventorySha256 ?? null,
        dirtyInputSha256: dossier.sourceIdentity.runSourceIdentity?.dirtyInputSha256 ?? null,
        line: candidate.line ?? null,
      },
      rank: {
        priority: candidate.priority,
        impactScore: candidate.impactScore ?? null,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        uncertainty: candidate.uncertainty,
      },
      readContext: module ? {
        symbols: module.symbols.slice(0, 50),
        omittedSymbols: Math.max(0, module.symbols.length - 50),
        routes: module.routes.slice(0, 30),
        omittedRoutes: Math.max(0, module.routes.length - 30),
        testReferences: module.testReferences.slice(0, 50),
        omittedTestReferences: Math.max(0, module.testReferences.length - 50),
        routeTestReferences: module.routeTestReferences.slice(0, 30),
        omittedRouteTestReferences: Math.max(0, module.routeTestReferences.length - 30),
        relatedImports: module.imports.filter(item => item.resolvedPath)
          .slice(0, 50).map(item => ({ path: item.resolvedPath, kind: item.kind, line: item.line })),
        importedBy: module.importedBy.slice(0, 50),
        omittedImporters: Math.max(0, module.importedBy.length - 50),
        relationships: module.referenceEdges.slice(0, 50),
        omittedRelationships: Math.max(0, module.referenceEdges.length - 50),
      } : null,
      nextAction: candidate.recommendedNextAction,
      requiredReview: [
        "Re-read the source at this exact hash and inspect the affected runtime path.",
        "Define an implementation and regression-test plan with explicit expected behavior.",
        "Record an accepted proposal decision before preparing an executable plan.",
      ],
      executableChanges: [],
      executionStatus: "NOT_EXECUTABLE",
    };
  });
  return {
    packets,
    omitted: Math.max(0, candidates.length - packets.length),
  };
}

function actionResult(action, dossier, report, graph, repairPlan) {
  switch (action.kind) {
    case "scan repository":
      return { action: action.kind, status: dossier.sourceIdentity.complete ? "OBSERVED" : "PARTIAL", counts: graph.counts };
    case "discover components":
      return {
        action: action.kind,
        status: "OBSERVED",
        evidence: "Counts below are code-file, route-module, and script-entrypoint signals, not verified product components.",
        counts: graph.counts,
      };
    case "map dependencies":
      return {
        action: action.kind,
        status: "OBSERVED",
        importEdges: graph.counts.importEdges,
        unresolvedLocalImports: dossier.summary.unresolvedLocalImports,
        resolvedTargetsNotAnalyzed: dossier.summary.resolvedTargetsNotAnalyzed,
      };
    case "map features":
      return {
        action: action.kind,
        status: "CANDIDATES",
        candidates: graph.pathFeatureCandidates,
        confidence: "low",
      };
    case "detect missing":
      return {
        action: action.kind,
        status: "CANDIDATES",
        staticCoverageCandidates: dossier.coverageCandidates,
        omittedCandidateCount: dossier.summary.omittedCoverageCandidates,
        unresolvedLocalImports: dossier.summary.unresolvedLocalImports,
        uncertainty: "Static references cannot prove an implementation or test is missing.",
      };
    case "detect unfinished":
      return {
        action: action.kind,
        status: dossier.unfinishedCandidates.length ? "CANDIDATES" : "NO_MARKERS_FOUND",
        candidates: dossier.unfinishedCandidates,
        omittedCandidateCount: dossier.summary.omittedUnfinishedCandidates,
        uncertainty: "Markers are review leads and are not proof of incomplete functionality.",
      };
    case "analyze intent":
      return {
        action: action.kind,
        status: "HEURISTIC",
        modules: dossier.modules.filter(module =>
          module.symbols.length || module.routes.length || module.imports.length)
          .slice(0, 100).map(module => ({
            path: module.path,
            declaredSymbols: module.symbols,
            routes: module.routes,
            relationships: module.referenceEdges,
            importCount: module.imports.length,
            sourceSha256: module.sha256,
          })),
        uncertainty: "Inferred only from declared symbols, imports, and route literals; no semantic intent is established.",
      };
    case "repository.stats":
      return { action: action.kind, status: "OBSERVED", counts: graph.counts, fileInventory: graph.fileInventory };
    case "repository.graph":
      return {
        action: action.kind,
        status: "OBSERVED",
        repository: graph.repository,
        fileInventory: graph.fileInventory,
        relationships: graph.relationshipCounts,
      };
    case "repository.health":
      return {
        action: action.kind,
        status: "UNVERIFIED",
        gateStatus: report?.gateStatus ?? "NOT_RUN",
        reportedReadinessStatus: report?.readinessStatus ?? "NOT_RUN",
        sourceComplete: dossier.sourceIdentity.complete,
        reason: "Atlas does not convert a subset gate or static scan into a whole-product readiness claim.",
      };
    case "repository.coverage":
      return {
        action: action.kind,
        status: "UNVERIFIED",
        measuredPercentage: report?.metrics?.coverage ?? null,
        candidateCount: dossier.coverageCandidates.length,
        omittedCandidateCount: dossier.summary.omittedCoverageCandidates,
        evidence: "Candidate references are not measured test coverage.",
      };
    case "repository.dependencies":
      return {
        action: action.kind,
        status: "OBSERVED",
        importEdges: graph.counts.importEdges,
        relationships: graph.relationshipCounts,
        unresolvedLocalImports: dossier.summary.unresolvedLocalImports,
      };
    case "repository.risks":
      return {
        action: action.kind,
        status: "CANDIDATES",
        incompleteSourceScan: !dossier.sourceIdentity.complete,
        coverageCandidates: dossier.coverageCandidates,
        unfinishedCandidates: dossier.unfinishedCandidates,
        failedChecks: dossier.failureCheckContext,
      };
    case "read file": {
      if (path.posix.isAbsolute(action.path) || action.path.includes("\\") ||
          action.path.split("/").some(part => !part || part === "." || part === "..")) {
        return { action: action.kind, path: action.path, status: "REJECTED", reason: "Read paths must be safe repository-relative paths." };
      }
      const module = dossier.modules.find(item => item.path === action.path);
      return module ? {
        action: action.kind,
        status: "OBSERVED",
        path: module.path,
        sourceSha256: module.sha256,
        lifecycle: module.lifecycle,
        symbols: module.symbols,
        imports: module.imports,
        routes: module.routes,
        testReferences: module.testReferences,
        referenceEdges: module.referenceEdges,
        contentReturned: false,
      } : {
        action: action.kind,
        path: action.path,
        status: "UNAVAILABLE",
        reason: "Only bounded analyzed source modules can be read by Atlas; raw file contents are not copied into the report.",
      };
    }
    case "read symbol": {
      const matches = dossier.modules.flatMap(module =>
        module.symbols.filter(symbol => symbol.name === action.name).map(symbol => ({
          path: module.path,
          sourceSha256: module.sha256,
          symbol,
          referenceEdges: module.referenceEdges.filter(edge =>
            edge.targetSymbol === action.name || edge.sourcePath === module.path),
          testReferences: module.testReferences,
        })));
      return {
        action: action.kind,
        status: matches.length ? "OBSERVED" : "NOT_FOUND",
        name: action.name,
        matches: matches.slice(0, 100),
        omittedMatches: Math.max(0, matches.length - 100),
        contentReturned: false,
      };
    }
    case "draft repair plans":
      return {
        action: action.kind,
        status: "NEEDS_REVIEW",
        packetCount: repairPlan.packets.length,
        omittedPackets: repairPlan.omitted,
        executionStatus: "NOT_EXECUTABLE",
      };
    case "write private report":
      return {
        action: action.kind,
        status: "PRIVATE_ONLY",
        destination: ".local/repository-verification/atlas/",
        writesApplicationSource: false,
      };
    case "verify completeness":
      return {
        action: action.kind,
        ...statusForChecks(report, dossier, /complet|catalog|coverage|feature|runtime-contract/i),
        staticCoverageCandidates: dossier.coverageCandidates.length,
        analysisComplete: dossier.sourceIdentity.complete,
        reason: dossier.sourceIdentity.complete
          ? "Static completeness signals are available; no complete feature-to-UI/API/data/test contract was proven."
          : "The source scan is incomplete; a complete repository claim is unavailable.",
      };
    case "verify security":
      return { action: action.kind, ...statusForChecks(report, dossier, /security|vulnerab|dependency/i) };
    case "verify performance":
      return { action: action.kind, ...statusForChecks(report, dossier, /performance|latency|load|benchmark/i) };
    case "verify architecture":
      return {
        action: action.kind,
        ...statusForChecks(report, dossier, /architect|dependency-graph|circular/i),
        unresolvedLocalImports: dossier.summary.unresolvedLocalImports,
      };
    case "verify production":
      return {
        action: action.kind,
        ...statusForChecks(report, dossier, /production|readiness|build|startup|publishing/i),
        policyStatus: null,
        readinessClaim: "Not inferred from a partial report or a static scan.",
      };
    case "verify subsystem":
      return {
        action: action.kind,
        subsystem: action.name,
        ...statusForChecks(report, dossier, new RegExp(action.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")),
      };
    default:
      return { action: action.kind, status: "NOT_EXECUTABLE" };
  }
}

export async function runAtlasPolicy({
  root = DEFAULT_ROOT,
  program,
  policySource,
  policyPath = "policy.atlas",
  report = null,
  initialDossier = null,
  inventory = null,
} = {}) {
  root = await fs.realpath(path.resolve(root));
  if (!program?.repository || !Array.isArray(program.actions)) {
    throw new Error("A parsed Atlas repository program is required");
  }
  const reportDriftCheckId = report?.mode === "full" ? "full-sweep-source-drift" :
    report?.mode === "dev" ? "source-drift" : null;
  if (report && (!verifySealed(report) || !reportDriftCheckId ||
      !Array.isArray(report.checks) || !report.sourceIdentity ||
      report.checks.find(check => check.id === reportDriftCheckId)?.status !== "PASS")) {
    throw new Error("Atlas verification input failed its integrity, scope, or schema check");
  }
  if (initialDossier && (!verifySealed(initialDossier) ||
      initialDossier.schemaVersion !== 1 ||
      !/^[a-f0-9]{64}$/.test(initialDossier.sourceIdentity?.sourceFileManifestSha256 ?? ""))) {
    throw new Error("Atlas dossier input failed its integrity or schema check");
  }
  if (initialDossier && !inventory) {
    throw new Error("Atlas requires the matching repository inventory when reusing a dossier");
  }
  if (inventory && (!inventory.sourceIdentity?.revision ||
      !Array.isArray(inventory.trackedFiles) ||
      (initialDossier &&
       inventory.sourceIdentity.revision !== initialDossier.sourceIdentity?.gitRevision))) {
    throw new Error("Atlas repository inventory is malformed or does not match the dossier revision");
  }
  if (report && inventory &&
      (report.sourceIdentity?.revision !== inventory.sourceIdentity.revision ||
       report.sourceIdentity?.inputInventorySha256 !== inventory.sourceIdentity.inputInventorySha256 ||
       report.sourceIdentity?.dirtyInputSha256 !== inventory.sourceIdentity.dirtyInputSha256)) {
    throw new Error("Atlas verification report does not match the supplied repository inventory");
  }
  if (report && initialDossier && initialDossier.sourceIdentity?.runSourceMatch !== true) {
    throw new Error("Atlas dossier is not bound to the supplied verification report");
  }
  let dossier = initialDossier;
  let previousHash = null;
  let completedPasses = 0;
  const recurse = program.actions.some(action => action.kind === "recurse");
  const maxPasses = recurse ? program.recursionMaxPasses : 1;
  let stable = false;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (!dossier || pass > 0) dossier = await buildRepositoryUnderstanding({ root, report });
    completedPasses++;
    const manifestHash = dossier.sourceIdentity.sourceFileManifestSha256;
    if (previousHash && manifestHash === previousHash) {
      stable = true;
      break;
    }
    previousHash = manifestHash;
  }
  if (report && dossier?.sourceIdentity?.runSourceMatch !== true) {
    throw new Error("Atlas scan did not bind to the supplied verification report");
  }
  if (inventory && dossier.sourceIdentity.gitRevision !== inventory.sourceIdentity.revision) {
    throw new Error("Atlas scan revision does not match the supplied repository inventory");
  }
  const graph = deriveRepositoryGraph(dossier, inventory);
  const repairPlan = draftRepairPackets(dossier);
  const actions = program.actions.filter(action => action.kind !== "recurse")
    .map(action => actionResult(action, dossier, report, graph, repairPlan));
  const selectedPolicy = program.policies.find(item => item.name === program.verifyPolicy) ?? null;
  const policy = policyEvaluation(selectedPolicy, report, dossier);
  const productionActions = actions.filter(item => item.action === "verify production");
  for (const item of productionActions) item.policyStatus = policy.status;
  return seal({
    schemaVersion: 1,
    reportType: "atlas-repository-audit",
    language: "Atlas",
    generatedAt: new Date().toISOString(),
    repository: program.repository,
    policy: {
      path: policyPath,
      sha256: sha256(policySource ?? ""),
      name: program.verifyPolicy,
      evaluation: policy,
    },
    sourceIdentity: dossier.sourceIdentity,
    sourceScan: {
      summary: dossier.summary,
      limits: dossier.limits,
      truncation: {
        occurred: dossier.truncation.occurred,
        omittedFileCount: dossier.truncation.omittedFileCount,
        skippedInputCount: dossier.truncation.skipped.length,
        skippedReasons: [...new Set(dossier.truncation.skipped.map(item => item.reason))].sort(),
      },
    },
    verificationReportSha256: report?.integrity?.reportSha256 ?? null,
    dossierSha256: dossier.integrity?.sha256 ?? null,
    recursion: { requested: recurse, maxPasses, completedPasses, stable },
    graph,
    actions,
    repairPlan,
    findings: {
      coverageCandidates: dossier.coverageCandidates,
      unfinishedCandidates: dossier.unfinishedCandidates,
      failureCheckContext: dossier.failureCheckContext,
    },
    status: policy.status === "PASS" && actions.every(action =>
      !["FAIL", "BLOCKED", "UNVERIFIED"].includes(action.status)) ? "PASS" :
      actions.some(action => action.status === "FAIL") ? "FAIL" : "UNVERIFIED",
    guardrails: [
      "This policy interpreter does not execute shell, JavaScript, or arbitrary code from .atlas files.",
      "Atlas writes private reports only; source edits remain behind the reviewed hash-pinned completion executor.",
      "Repair packets are non-executable and require authored changes, proposal approval, and executor verification.",
      "Static links and inferred feature groupings are candidates, never proof of runtime behavior or product readiness.",
      "Unbounded recursion is not supported; rescans stop at the policy's explicit small pass limit.",
    ],
  });
}

async function ensurePrivateDirectory(root) {
  let current = root;
  for (const part of OUTPUT_PARTS) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`Atlas report directory is not a real directory: ${path.relative(root, current)}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(current, { mode: 0o700 });
    }
  }
  await fs.chmod(current, 0o700);
  return current;
}

function renderAtlasMarkdown(report) {
  const lines = [
    `# Atlas audit: ${report.repository}`,
    "",
    `- Status: **${report.status}**`,
    `- Policy: \`${report.policy.name ?? "none"}\` (${report.policy.evaluation.status})`,
    `- Source revision: \`${report.sourceIdentity.gitRevision}\``,
    `- Source manifest: \`${report.sourceIdentity.sourceFileManifestSha256}\``,
    `- Source scan complete: **${report.sourceIdentity.complete ? "yes" : "no"}**`,
    `- Files omitted or skipped: ${report.sourceScan.truncation.omittedFileCount} omitted; ${report.sourceScan.truncation.skippedInputCount} skipped`,
    `- Recursion passes: ${report.recursion.completedPasses}/${report.recursion.maxPasses}; stable: ${report.recursion.stable}`,
    "",
    "## Repository graph counts",
    "",
    ...Object.entries(report.graph.counts).map(([name, value]) => `- ${name}: ${value}`),
    "",
    "## Policy rules",
    "",
    ...report.policy.evaluation.rules.map(rule =>
      `- ${rule.metric}: ${rule.status}${rule.measuredValue === null ? "" : ` (${rule.measuredValue} ${rule.operator} ${rule.threshold})`}${rule.reason ? ` — ${rule.reason}` : ""}`),
    "",
    "## Audit actions",
    "",
    ...report.actions.map(action => `- ${action.action}: ${action.status}${action.reason ? ` — ${action.reason}` : ""}`),
    "",
    "## File lifecycle counts",
    "",
    ...Object.entries(report.graph.fileInventory.lifecycleCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([lifecycle, count]) => `- ${lifecycle}: ${count}`),
    "",
    "## Uncertainty",
    "",
    ...report.guardrails.map(item => `- ${item}`),
    "",
  ];
  return lines.join("\n");
}

export async function saveAtlasReport({ root = DEFAULT_ROOT, report } = {}) {
  root = await fs.realpath(path.resolve(root));
  if (!report || report.integrity?.algorithm !== "sha256" ||
      report.integrity.sha256 !== sha256(canonical(Object.fromEntries(
        Object.entries(report).filter(([key]) => key !== "integrity"))))) {
    throw new Error("Atlas report integrity verification failed");
  }
  const directory = await ensurePrivateDirectory(root);
  const name = `${report.generatedAt.replace(/[:.]/g, "-")}-${process.pid}-${randomUUID()}`;
  const jsonPath = path.join(directory, `${name}.json`);
  const markdownPath = path.join(directory, `${name}.md`);
  const artifacts = [];
  for (const [filePath, content] of [
    [jsonPath, `${JSON.stringify(report, null, 2)}\n`],
    [markdownPath, `${renderAtlasMarkdown(report)}\n`],
  ]) {
    if (Buffer.byteLength(content) > MAX_REPORT_BYTES) throw new Error("Atlas report exceeds its output size limit");
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      await fs.chmod(temporary, 0o600);
      await fs.rename(temporary, filePath);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
    artifacts.push({
      path: path.relative(root, filePath),
      sha256: sha256(content),
    });
  }
  return { jsonPath: artifacts[0].path, markdownPath: artifacts[1].path, artifacts };
}

async function readRegularFile(root, relativePath, maxBytes, label) {
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`${label} path must stay inside the repository`);
  const info = await fs.lstat(absolute);
  if (info.isSymbolicLink() || !info.isFile() || info.size > maxBytes) {
    throw new Error(`${label} must be a bounded regular file`);
  }
  const handle = await fs.open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes || opened.ino !== info.ino) {
      throw new Error(`${label} changed while it was being opened`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function parseArguments(args) {
  const options = { root: DEFAULT_ROOT, runDirectory: null };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) options.root = path.resolve(args[++i]);
    else if (args[i] === "--run-dir" && args[i + 1]) options.runDirectory = path.resolve(args[++i]);
    else if (args[i] === "--help" || args[i] === "-h") options.help = true;
    else if (args[i].startsWith("-")) throw new Error(`Unknown Atlas option: ${args[i]}`);
    else positional.push(args[i]);
  }
  if (options.help) return options;
  if (positional[0] !== "run" || positional.length !== 2) {
    throw new Error("Usage: atlas run <policy.atlas> [--root <repo>] [--run-dir <verified-run>]");
  }
  options.policyPath = positional[1];
  return options;
}

async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) {
      console.log("Usage: npm run atlas -- run <policy.atlas> [--root <repo>] [--run-dir <verified-run>]");
      console.log("Runs a bounded local repository policy; .atlas files cannot execute arbitrary code.");
      return 0;
    }
    const root = await fs.realpath(options.root);
    const policyPath = path.resolve(root, options.policyPath);
    if (!policyPath.startsWith(`${root}${path.sep}`)) throw new Error("Atlas policy path must stay inside the repository");
    const policySource = await readRegularFile(root, path.relative(root, policyPath), MAX_POLICY_BYTES, "Atlas policy");
    const program = parseAtlasPolicy(policySource, path.relative(root, policyPath));
    const { buildInventory } = await import("./repository-verification.mjs");
    const before = await buildInventory(root);
    let report = null;
    if (options.runDirectory) {
      const runDirectory = await fs.realpath(options.runDirectory);
      if (runDirectory !== root && !runDirectory.startsWith(`${root}${path.sep}`)) {
        throw new Error("Verification run directory must stay inside the repository");
      }
      report = JSON.parse(await readRegularFile(root, path.relative(root, path.join(runDirectory, "report.json")),
        MAX_REPORT_BYTES, "Verification report"));
      if (before.sourceIdentity.inputInventorySha256 !== report.sourceIdentity?.inputInventorySha256 ||
          before.sourceIdentity.dirtyInputSha256 !== report.sourceIdentity?.dirtyInputSha256) {
        throw new Error("Verification report source hashes do not match the current repository");
      }
    }
    const dossier = await buildRepositoryUnderstanding({ root, report });
    const atlas = await runAtlasPolicy({
      root,
      program,
      policySource,
      policyPath: path.relative(root, policyPath),
      report,
      initialDossier: dossier,
      inventory: before,
    });
    const after = await buildInventory(root);
    if (before.sourceIdentity.inputInventorySha256 !== after.sourceIdentity.inputInventorySha256 ||
        before.sourceIdentity.dirtyInputSha256 !== after.sourceIdentity.dirtyInputSha256 ||
        (report && (after.sourceIdentity.inputInventorySha256 !== report.sourceIdentity.inputInventorySha256 ||
          after.sourceIdentity.dirtyInputSha256 !== report.sourceIdentity.dirtyInputSha256))) {
      throw new Error("Repository source identity changed during Atlas analysis; no report was written");
    }
    const saved = await saveAtlasReport({ root, report: atlas });
    console.log(`Atlas ${atlas.repository}: ${atlas.status}; files=${atlas.graph.counts.sourceFiles + atlas.graph.counts.testFiles}; routes=${atlas.graph.counts.routeCandidates}; proposals=${atlas.findings.coverageCandidates.length + atlas.findings.unfinishedCandidates.length}`);
    console.log(`Private report: ${saved.jsonPath}`);
    console.log(`Policy report: ${saved.markdownPath}`);
    return atlas.status === "FAIL" ? 1 : 0;
  } catch (error) {
    console.error(`atlas: ${error.message}`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then(code => { process.exitCode = code; });
