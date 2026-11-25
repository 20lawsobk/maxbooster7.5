#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildInventory,
  cleanEnvironment,
  runOwned,
} from "./repository-verification.mjs";
import { executeCompletionPlan } from "./completion-executor.mjs";
import { verifyIsolatedCopy } from "./completion-loop.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_VERSION = 1;
const AUDIT_TIMEOUT_MS = 120_000;
const REPAIR_TEST_TIMEOUT_MS = 30_000;
const MAX_AUDIT_OUTPUT_BYTES = 24 * 1024 * 1024;
const OUTPUT_PARTS = [".local", "repository-verification", "rule-based-audit"];
const EXPECTED_DEV_COMMAND = "bash scripts/start-dev.sh";
const STALE_DEV_COMMAND =
  "node scripts/testing/repository-verification.mjs dev && bash scripts/start-dev.sh";
const DEV_TEST_PATH = "tests/npm-build-start-contract.test.mjs";
const PACKAGE_PATH = "package.json";
const DEV_TEST_NAME =
  "development startup launches the app before repository completion analysis";
const SOURCE_EXTENSIONS = Object.freeze([
  ".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".java", ".go", ".rs",
  ".rb", ".php", ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".swift", ".kt",
  ".kts", ".scala", ".sql", ".sh", ".bash", ".lua", ".dart", ".ex", ".exs",
  ".clj", ".r", ".pl", ".vue", ".svelte", ".m", ".mm", ".groovy",
]);
const AUDIT_RULES = Object.freeze([
  ["todo", "unfinished-work", "File-level", "TODO/FIXME/XXX/HACK/WIP marker hit", "Review marker intent and owning implementation."],
  ["placeholder", "placeholder-logic", "File-level", "Placeholder-term hit in non-test code", "Inspect the matched expression and its runtime role."],
  ["secret", "possible-hardcoded-secret", "Eligible text files", "Secret-pattern or entropy candidate hit", "Verify the candidate safely and rotate only if confirmed."],
  ["env_file", "environment-file", "Environment-file paths", "Environment-file path and committed status", "Check repository history and secret rotation requirements."],
  ["large_file", "source-size", "Code files", "Source line count above the configured threshold", "Review module responsibilities and dependency boundaries."],
  ["bare_except", "broad-exception-handling", "Code files", "Broad or swallowed exception-pattern hit", "Check exception scope, propagation, and safe reporting."],
  ["no_tests", "test-suite-presence", "Repository", "Count of source files and detected test files", "Review test discovery and meaningful behavior coverage."],
  ["low_tests", "test-suite-ratio", "Repository", "Source-to-test-file ratio", "Review test discovery and meaningful behavior coverage."],
  ["no_logging", "logging-presence", "Repository", "Count of source files with recognized logging signals", "Review error-boundary observability and sensitive-data handling."],
  ["no_error_handling", "error-handling-presence", "Repository", "Count of source files with recognized error-handling signals", "Review failure boundaries and propagation behavior."],
  ["no_readme", "readme-presence", "Repository", "Root README path inventory", "Review onboarding and operational instructions."],
  ["no_license", "license-presence", "Repository", "Root license-file path inventory", "Confirm the intended licensing decision."],
  ["no_ci", "continuous-integration-presence", "Repository", "Recognized CI configuration path inventory", "Review required automated checks and branch policy."],
  ["no_gitignore", "ignore-file-presence", "Repository", "Root ignore-file path inventory", "Review generated, local, and sensitive-file exclusions."],
]);

const registry = Object.freeze({
  schemaVersion: REGISTRY_VERSION,
  auditEngine: "production-audit-suite",
  auditEngineVersion: 1,
  capabilities: Object.freeze([
    ...AUDIT_RULES.map(([auditRule, id, scope, evidenceRequirement, verificationRequirement]) => Object.freeze({
      id,
      checkerId: `production-audit-suite:${auditRule}`,
      auditRule,
      scope: Object.freeze({
        kind: scope === "Repository" ? "repository" :
          scope === "Eligible text files" ? "text-files" :
            scope === "Environment-file paths" ? "path-patterns" : "paths",
        languages: Object.freeze(scope === "Repository" || scope === "Environment-file paths"
          ? ["repository"]
          : scope === "Eligible text files" ? ["text"]
            : ["python", "javascript", "typescript", "java", "go", "rust", "ruby", "php", "csharp", "cpp", "swift", "kotlin", "scala", "sql", "shell", "lua", "dart", "elixir", "clojure", "r", "perl", "vue", "svelte", "objective-c", "groovy"]),
        extensions: Object.freeze(scope === "Repository" || scope === "Eligible text files" ||
          scope === "Environment-file paths" ? [] : SOURCE_EXTENSIONS),
        ...(scope === "Environment-file paths"
          ? { patterns: Object.freeze(["^\\.env(?:\\..+)?$"]), excludedSuffixes: Object.freeze([".example", ".sample", ".template", ".dist"]) }
          : {}),
        ...(scope === "Eligible text files"
          ? { inclusion: "Discovered non-binary text files" }
          : {}),
      }),
      evidence: Object.freeze({
        requirement: evidenceRequirement,
      }),
      repair: Object.freeze({
        status: "review-only",
        handlerId: null,
        verification: Object.freeze([verificationRequirement]),
      }),
    })),
    Object.freeze({
      id: "development-launcher-test-contract",
      checkerId: "rule-based-code-audit:stale-dev-start-contract",
      auditRule: "stale-dev-start-contract",
      scope: Object.freeze({
        kind: "exact-paths",
        languages: Object.freeze(["javascript"]),
        paths: Object.freeze([PACKAGE_PATH, DEV_TEST_PATH]),
      }),
      evidence: Object.freeze({
        requirement: "Exact package command, one exact stale assertion, and its targeted failing test.",
      }),
      repair: Object.freeze({
        status: "registered",
        handlerId: "sync-dev-start-contract",
        verification: Object.freeze(["test:runtime-contracts"]),
      }),
    }),
  ]),
  unsupported: Object.freeze([
    "Semantic correctness and business requirements",
    "Control/data-flow and taint analysis",
    "Concurrency, race, and distributed-system correctness",
    "Compiler, type-checker, framework, and dependency advisories",
    "Runtime, provider, deployment, and hardware behavior",
    "General source edits or repairs not implemented by a registered handler",
  ]),
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateRegistry(value = registry) {
  if (!value || value.schemaVersion !== REGISTRY_VERSION ||
      value.auditEngine !== "production-audit-suite" ||
      value.auditEngineVersion !== 1 || !Array.isArray(value.capabilities) ||
      !Array.isArray(value.unsupported) || value.unsupported.length === 0) {
    throw new Error("Capability registry must satisfy schemaVersion 1 and name explicit unsupported areas");
  }
  const ids = new Set();
  const auditRules = new Set();
  const checkerIds = new Set();
  const handlers = new Set(["sync-dev-start-contract"]);
  const registeredCheckers = new Set([
    ...AUDIT_RULES.map(([auditRule]) => `production-audit-suite:${auditRule}`),
    "rule-based-code-audit:stale-dev-start-contract",
  ]);
  for (const capability of value.capabilities) {
    if (!capability || typeof capability.id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,79}$/.test(capability.id) || ids.has(capability.id) ||
        typeof capability.auditRule !== "string" ||
        !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(capability.auditRule) ||
        auditRules.has(capability.auditRule) ||
        typeof capability.checkerId !== "string" || checkerIds.has(capability.checkerId) ||
        !registeredCheckers.has(capability.checkerId) ||
        !capability.scope || !Array.isArray(capability.scope.languages) ||
        capability.scope.languages.length === 0 ||
        capability.scope.languages.some(language => typeof language !== "string" || !language) ||
        !["repository", "paths", "exact-paths", "text-files", "path-patterns"].includes(capability.scope.kind) ||
        typeof capability.evidence?.requirement !== "string" ||
        !capability.evidence.requirement ||
        !["registered", "review-only", "unsupported"].includes(capability.repair?.status) ||
        !Array.isArray(capability.repair?.verification)) {
      throw new Error(`Capability registry contains an invalid or duplicate rule contract: ${capability?.id ?? "unknown"}`);
    }
    if (capability.checkerId !== `production-audit-suite:${capability.auditRule}` &&
        !(capability.checkerId === "rule-based-code-audit:stale-dev-start-contract" &&
          capability.auditRule === "stale-dev-start-contract")) {
      throw new Error(`Capability ${capability.id} does not bind its checker to its audit rule`);
    }
    if (capability.repair.verification.length === 0) {
      throw new Error(`Capability ${capability.id} requires verification requirements`);
    }
    if (capability.repair.status === "registered" &&
        (!handlers.has(capability.repair.handlerId) ||
         capability.repair.verification.length === 0 ||
         capability.repair.verification.some(check => check !== "test:runtime-contracts"))) {
      throw new Error(`Capability ${capability.id} lacks a registered handler or approved verification`);
    }
    if (capability.scope.kind === "exact-paths" &&
        (!Array.isArray(capability.scope.paths) || capability.scope.paths.length === 0 ||
         capability.scope.paths.some(sourcePath => !safeRelativePath(sourcePath)))) {
      throw new Error(`Capability ${capability.id} has invalid exact-path scope`);
    }
    if (capability.scope.kind === "paths" &&
        (!Array.isArray(capability.scope.extensions) || capability.scope.extensions.length === 0 ||
         capability.scope.extensions.some(extension => !/^\.[a-z0-9]+$/i.test(extension)))) {
      throw new Error(`Capability ${capability.id} has invalid language/path scope`);
    }
    if (capability.scope.kind === "repository" &&
        (!Array.isArray(capability.scope.extensions) ||
         capability.scope.extensions.length !== 0 ||
         capability.scope.languages.some(language => language !== "repository"))) {
      throw new Error(`Capability ${capability.id} has invalid repository scope`);
    }
    if (capability.scope.kind === "text-files" &&
        (!Array.isArray(capability.scope.extensions) || capability.scope.extensions.length !== 0 ||
         typeof capability.scope.inclusion !== "string" ||
         capability.scope.languages.some(language => language !== "text"))) {
      throw new Error(`Capability ${capability.id} has invalid text-file scope`);
    }
    if (capability.scope.kind === "path-patterns" &&
        (!Array.isArray(capability.scope.patterns) || capability.scope.patterns.length === 0 ||
         capability.scope.patterns.some(pattern => typeof pattern !== "string" || pattern.length > 200) ||
         !Array.isArray(capability.scope.excludedSuffixes) ||
         capability.scope.excludedSuffixes.some(suffix => typeof suffix !== "string" || suffix.length > 32) ||
         capability.scope.languages.some(language => language !== "repository"))) {
      throw new Error(`Capability ${capability.id} has invalid path-pattern scope`);
    }
    if (capability.repair.status !== "registered" && capability.repair.handlerId !== null) {
      throw new Error(`Capability ${capability.id} cannot declare an unregistered repair handler`);
    }
    ids.add(capability.id);
    auditRules.add(capability.auditRule);
    checkerIds.add(capability.checkerId);
  }
  if (AUDIT_RULES.some(([auditRule]) => !auditRules.has(auditRule)) ||
      !auditRules.has("stale-dev-start-contract")) {
    throw new Error("Capability registry omits a registered deterministic audit rule");
  }
  return value;
}

validateRegistry();

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.posix.isAbsolute(value) && !value.includes("\\") &&
    !value.split("/").some(part => !part || part === "." || part === "..");
}

async function ensurePrivateDirectory(root, parts) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error("Rule-audit evidence path is not a private directory");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(current, { mode: 0o700 });
    }
  }
  await fs.chmod(current, 0o700);
  return current;
}

async function writePrivate(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, content, { flag: "wx", mode: 0o600 });
  try {
    await fs.chmod(temp, 0o600);
    await fs.rename(temp, filePath);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

function runAuditEngine(root) {
  return new Promise((resolve, reject) => {
    const environment = {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: process.env.HOME || "/tmp",
      TMPDIR: process.env.TMPDIR || "/tmp",
      LANG: "C",
      CI: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    };
    const child = spawn("python3", [
      path.join(SCRIPT_DIR, "../../production_audit_suite.py"),
      "--repo", root, "--workers", "1", "--quiet", "--json", "--local-only",
    ], { cwd: root, env: environment, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = Buffer.alloc(0);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Deterministic audit timed out"));
    }, AUDIT_TIMEOUT_MS);
    timer.unref();
    child.once("error", () => finish(new Error("Deterministic audit could not start")));
    child.stdout.on("data", chunk => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > MAX_AUDIT_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new Error("Deterministic audit output exceeded its size limit"));
      }
    });
    child.once("close", code => {
      if (code !== 0) return finish(new Error("Deterministic audit failed"));
      try {
        const report = JSON.parse(stdout.toString("utf8"));
        if (!Array.isArray(report.findings) || !report.stats) {
          return finish(new Error("Deterministic audit returned an invalid report"));
        }
        finish(null, report);
      } catch {
        finish(new Error("Deterministic audit returned invalid JSON"));
      }
    });
  });
}

async function readRegisteredSource(root, relativePath) {
  if (!safeRelativePath(relativePath)) throw new Error("Registered source path is invalid");
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 2 * 1024 * 1024) {
    throw new Error("Registered source must be a bounded regular file");
  }
  const realPath = await fs.realpath(absolute);
  const relative = path.relative(root, realPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Registered source path escaped the isolated worktree");
  }
  const handle = await fs.open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev ||
        opened.size > 2 * 1024 * 1024) {
      throw new Error("Registered source changed while it was being opened");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function minimalSourceIdentity(sourceIdentity) {
  return {
    revision: sourceIdentity.revision,
    inputInventorySha256: sourceIdentity.inputInventorySha256,
    dirtyInputSha256: sourceIdentity.dirtyInputSha256,
  };
}

function sameSourceIdentity(left, right) {
  return left?.revision === right?.revision &&
    left?.inputInventorySha256 === right?.inputInventorySha256 &&
    left?.dirtyInputSha256 === right?.dirtyInputSha256;
}

async function generateRegisteredPlan(root, sourceIdentity, evidenceDirectory, runCheck = runOwned) {
  const [packageBytes, testBytes] = await Promise.all([
    readRegisteredSource(root, PACKAGE_PATH),
    readRegisteredSource(root, DEV_TEST_PATH),
  ]);
  let packageJson;
  try {
    packageJson = JSON.parse(packageBytes.toString("utf8"));
  } catch {
    return { status: "REVIEW_REQUIRED", reason: "package-json-invalid" };
  }
  if (packageJson?.scripts?.dev !== EXPECTED_DEV_COMMAND) {
    return { status: "NO_MATCH", reason: "development-command-outside-registered-scope" };
  }

  const testSource = testBytes.toString("utf8");
  const assertionPattern = /assert\.equal\(scripts\.dev,\s*(["'])(.*?)\1\s*\);/g;
  const assertions = [...testSource.matchAll(assertionPattern)];
  if (assertions.length !== 1) {
    return {
      status: assertions.length > 1 ? "REVIEW_REQUIRED" : "NO_MATCH",
      reason: assertions.length > 1 ? "ambiguous-contract-assertions" : "registered-assertion-not-found",
    };
  }
  const assertion = assertions[0];
  if (assertion[2] !== STALE_DEV_COMMAND) {
    return { status: "NO_MATCH", reason: "registered-stale-value-not-present" };
  }

  const evidenceLog = path.join(evidenceDirectory, "registered-repair-targeted-test.log");
  const testResult = await runCheck(process.execPath, [
    "--test", "--test-name-pattern", DEV_TEST_NAME, DEV_TEST_PATH,
  ], {
    cwd: root,
    timeoutMs: REPAIR_TEST_TIMEOUT_MS,
    logPath: evidenceLog,
    env: cleanEnvironment(),
  });
  const provedMismatch = testResult.status === "FAIL" &&
    testResult.exitCode !== 0 &&
    testResult.timedOut !== true &&
    testResult.interrupted !== true &&
    typeof testResult.logSha256 === "string" &&
    testResult.output.includes(DEV_TEST_NAME) &&
    testResult.output.includes(EXPECTED_DEV_COMMAND) &&
    testResult.output.includes(STALE_DEV_COMMAND);
  if (!provedMismatch) {
    return {
      status: "REVIEW_REQUIRED",
      reason: testResult.timedOut ? "targeted-test-timed-out" : "targeted-test-did-not-prove-exact-mismatch",
      evidence: {
        testName: DEV_TEST_NAME,
        status: testResult.status,
        exitCode: testResult.exitCode,
        logSha256: testResult.logSha256 ?? null,
      },
    };
  }

  let confirmedInventory;
  let confirmedPackage;
  let confirmedTest;
  try {
    [confirmedInventory, confirmedPackage, confirmedTest] = await Promise.all([
      buildInventory(root),
      readRegisteredSource(root, PACKAGE_PATH),
      readRegisteredSource(root, DEV_TEST_PATH),
    ]);
  } catch {
    return { status: "BLOCKED", reason: "source-recheck-unavailable" };
  }
  if (confirmedInventory.sourceIdentity.dirty ||
      !sameSourceIdentity(confirmedInventory.sourceIdentity, sourceIdentity) ||
      sha256(confirmedPackage) !== sha256(packageBytes) ||
      sha256(confirmedTest) !== sha256(testBytes)) {
    return { status: "BLOCKED", reason: "source-changed-during-repair-evidence" };
  }

  const replacement = `assert.equal(scripts.dev, ${JSON.stringify(EXPECTED_DEV_COMMAND)});`;
  const updatedTest = testSource.slice(0, assertion.index) +
    replacement + testSource.slice(assertion.index + assertion[0].length);
  const beforeSha256 = sha256(testBytes);
  const afterSha256 = sha256(updatedTest);
  const identity = minimalSourceIdentity(sourceIdentity);
  const evidenceFiles = [
    { path: PACKAGE_PATH, sha256: sha256(packageBytes) },
    { path: DEV_TEST_PATH, sha256: beforeSha256 },
  ];
  const targetedFailure = {
    testName: DEV_TEST_NAME,
    command: [process.execPath, "--test", "--test-name-pattern", DEV_TEST_NAME, DEV_TEST_PATH],
    status: "FAIL",
    exitCode: testResult.exitCode,
    observedExpected: STALE_DEV_COMMAND,
    observedActual: EXPECTED_DEV_COMMAND,
  };
  targetedFailure.evidenceSha256 = sha256(canonical({
    targetedFailure,
    evidenceFiles,
  }));
  const dedupeKey = sha256(canonical({
    ruleId: "sync-dev-start-contract",
    sourceIdentity: identity,
    path: DEV_TEST_PATH,
    beforeSha256,
    afterSha256,
  }));
  const plan = {
    schemaVersion: 1,
    sourceIdentity: identity,
    dedupeKey,
    generator: {
      name: "rule-based-code-audit",
      schemaVersion: REGISTRY_VERSION,
      ruleId: "stale-dev-start-contract",
    },
    automationEvidence: {
      schemaVersion: REGISTRY_VERSION,
      registrySchemaVersion: registry.schemaVersion,
      ruleId: "stale-dev-start-contract",
      handlerId: "sync-dev-start-contract",
      sourceIdentity: identity,
      targetedFailure,
      evidenceFiles,
    },
    changes: [{
      id: "sync-dev-start-contract",
      path: DEV_TEST_PATH,
      operation: "replace",
      beforeSha256,
      afterSha256,
      content: updatedTest,
    }],
    checks: [{ id: "runtime-contracts", script: "test:runtime-contracts" }],
  };
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  return {
    status: "PLAN_READY",
    plan,
    bytes,
    sha256: sha256(bytes),
    dedupeKey,
    evidence: {
      testName: DEV_TEST_NAME,
      status: testResult.status,
      exitCode: testResult.exitCode,
      logPath: path.relative(root, evidenceLog),
      logSha256: testResult.logSha256,
    },
  };
}

function sanitizeAuditFindings(auditReport, currentIdentity) {
  const rules = new Map(registry.capabilities.map(capability => [capability.auditRule, capability]));
  return auditReport.findings.map(finding => {
    const capability = rules.get(finding.rule);
    const detailFingerprint = sha256(String(finding.details ?? ""));
    return {
      rule: finding.rule,
      capabilityId: capability?.id ?? null,
      severity: finding.severity,
      file: safeRelativePath(finding.file) || finding.file === "*" ? finding.file : null,
      title: finding.title,
      count: finding.count,
      evidence: {
        kind: "deterministic-production-audit",
        sourceIdentity: currentIdentity,
        detailFingerprint,
      },
      disposition: capability?.repair.status === "registered"
        ? "AUTO_REPAIR_ELIGIBLE"
        : "REVIEW_REQUIRED",
    };
  });
}

export async function runRuleBasedCodeAudit({
  root,
  apply = false,
  expectedPlanSha256,
  runAudit = runAuditEngine,
  runCheck = runOwned,
  executor = executeCompletionPlan,
} = {}) {
  if (!root) throw new Error("An explicit isolated --root is required");
  if (apply && !/^[a-f0-9]{64}$/.test(expectedPlanSha256 ?? "")) {
    throw new Error("--apply requires the exact SHA-256 of a reviewed source-bound plan");
  }
  root = await fs.realpath(path.resolve(root));
  const isolation = await verifyIsolatedCopy(root);
  if (isolation.root !== root) throw new Error("Audit root does not match the verified isolated worktree");

  const before = await buildInventory(root);
  const auditReport = await runAudit(root);
  const after = await buildInventory(root);
  const stable = sameSourceIdentity(before.sourceIdentity, after.sourceIdentity);
  const outputDirectory = await ensurePrivateDirectory(root, OUTPUT_PARTS);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${randomUUID()}`;
  const evidenceDirectory = await ensurePrivateDirectory(root, [...OUTPUT_PARTS, "evidence", runId]);
  const findings = sanitizeAuditFindings(auditReport, minimalSourceIdentity(after.sourceIdentity));
  let repair = {
    status: "NO_MATCH",
    reason: "no-registered-repair-finding",
  };
  let planPath = null;
  let execution = null;

  if (!stable) {
    repair = { status: "BLOCKED", reason: "source-changed-during-audit" };
  } else if (after.sourceIdentity.dirty) {
    repair = { status: "BLOCKED", reason: "dirty-worktree" };
  } else {
    repair = await generateRegisteredPlan(root, after.sourceIdentity, evidenceDirectory, runCheck);
    if (repair.status === "REVIEW_REQUIRED") {
      findings.push({
        rule: "stale-dev-start-contract",
        capabilityId: "development-launcher-test-contract",
        severity: "MEDIUM",
        file: DEV_TEST_PATH,
        title: "The registered development command contract needs review",
        count: 1,
        evidence: {
          kind: "registered-rule-review",
          sourceIdentity: minimalSourceIdentity(after.sourceIdentity),
          reason: repair.reason,
          targetedTest: repair.evidence ?? null,
        },
        disposition: "REVIEW_REQUIRED",
      });
    }
    if (repair.status === "PLAN_READY") {
      const planDirectory = await ensurePrivateDirectory(root, [...OUTPUT_PARTS, "plans"]);
      planPath = path.join(planDirectory, `${repair.dedupeKey}.json`);
      await writePrivate(planPath, repair.bytes);
      const finding = {
        rule: "stale-dev-start-contract",
        capabilityId: "development-launcher-test-contract",
        severity: "MEDIUM",
        file: DEV_TEST_PATH,
        title: "Development command assertion does not match the app launcher",
        count: 1,
        evidence: {
          kind: "exact-source-and-failing-test",
          sourceIdentity: minimalSourceIdentity(after.sourceIdentity),
          beforeSha256: repair.plan.changes[0].beforeSha256,
          afterSha256: repair.plan.changes[0].afterSha256,
          targetedTest: repair.evidence,
        },
        disposition: "AUTO_REPAIR_ELIGIBLE",
      };
      findings.push(finding);
      if (apply) {
        if (expectedPlanSha256 !== repair.sha256) {
          throw new Error("Applying requires --plan-sha256 to match the generated, source-bound plan");
        }
        execution = await executor({
          root,
          planPath,
          expectedPlanSha256,
          apply: true,
          runCheck,
        });
        repair = {
          status: execution.status,
          reason: execution.blockReason ?? null,
          planPath: path.relative(root, planPath),
          planSha256: repair.sha256,
          evidence: repair.evidence,
        };
      } else {
        repair = {
          status: "PLAN_READY",
          reason: null,
          planPath: path.relative(root, planPath),
          planSha256: repair.sha256,
          evidence: repair.evidence,
        };
      }
    }
  }

  const report = {
    schemaVersion: REGISTRY_VERSION,
    status: stable ? "AUDITED" : "BLOCKED",
    generatedAt: new Date().toISOString(),
    auditEngine: registry.auditEngine,
    registry: {
      schemaVersion: registry.schemaVersion,
      capabilities: registry.capabilities.map(capability => ({
        id: capability.id,
        auditRule: capability.auditRule,
        scope: capability.scope,
        evidenceRequirement: capability.evidence.requirement,
        repair: capability.repair,
        status: "SUPPORTED",
      })),
      unsupported: registry.unsupported,
      coverage: {
        supportedChecks: registry.capabilities.length,
        reviewOnlyChecks: registry.capabilities.filter(item =>
          item.repair.status === "review-only").length,
        registeredRepairs: registry.capabilities.filter(item =>
          item.repair.status === "registered").length,
        unsupportedAreas: registry.unsupported.length,
      },
    },
    sourceIdentity: minimalSourceIdentity(after.sourceIdentity),
    sourceStableDuringAudit: stable,
    audit: {
      productionScore: auditReport.production_score,
      findingCount: auditReport.finding_count,
      blockerCount: auditReport.blockers,
      stats: auditReport.stats,
      findings: sanitizeAuditFindings(auditReport, minimalSourceIdentity(after.sourceIdentity)),
    },
    findings,
    repair,
    execution: execution ? {
      status: execution.status,
      rollback: execution.rollback ?? null,
      checks: execution.checks?.map(check => ({
        id: check.id,
        script: check.script,
        status: check.status,
        exitCode: check.exitCode,
        logSha256: check.logSha256 ?? null,
      })) ?? [],
      reportPath: path.relative(root, execution.reportPath),
      journalPath: path.relative(root, execution.journalPath),
    } : null,
    boundaries: {
      networkCalls: 0,
      modelCalls: 0,
      sourceWritesByAudit: 0,
      sourceWritesDelegatedTo: apply ? "completion-executor" : null,
      productionReadiness: "NOT_ASSESSED",
    },
  };
  const reportPath = path.join(outputDirectory, `${runId}.json`);
  report.reportPath = path.relative(root, reportPath);
  const sealedReport = {
    ...report,
    integrity: {
      algorithm: "sha256",
      reportSha256: sha256(canonical(report)),
    },
  };
  await writePrivate(reportPath, `${JSON.stringify(sealedReport, null, 2)}\n`);
  return { report: sealedReport, reportPath, planPath, planSha256: repair.planSha256 ?? null };
}

function parseArgs(args) {
  const options = { apply: false, help: false };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--root" && args[index + 1]) options.root = path.resolve(args[++index]);
    else if (args[index] === "--apply") options.apply = true;
    else if (args[index] === "--plan-sha256" && args[index + 1]) options.expectedPlanSha256 = args[++index];
    else if (args[index] === "--help" || args[index] === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (options.apply && !options.expectedPlanSha256) {
    throw new Error("--apply requires --plan-sha256 from a reviewed audit plan");
  }
  if (!options.apply && options.expectedPlanSha256) {
    throw new Error("--plan-sha256 requires --apply");
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
    if (options.help) {
      console.log("Usage: npm run code:audit -- --root <marked-isolated-worktree> [--apply --plan-sha256 <reviewed-sha256>]");
      console.log("Runs only registered deterministic local checks; unmatched findings remain review-required.");
      return 0;
    }
    const result = await runRuleBasedCodeAudit(options);
    console.log(JSON.stringify(result.report, null, 2));
    const successfulExecution = ["APPLIED_VERIFIED", "ALREADY_APPLIED_VERIFIED"]
      .includes(result.report.execution?.status);
    return options.apply && !successfulExecution ? 1 : 0;
  } catch (error) {
    console.error(`rule-based-code-audit: ${error.message}`);
    return 1;
  }
}

export { registry as ruleBasedAuditRegistry, validateRegistry };

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then(code => { process.exitCode = code; })
    .catch(() => { console.error("rule-based-code-audit: execution failed"); process.exitCode = 1; });
}
