import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildInventory,
  canonical,
  cleanEnvironment,
  runOwned,
  verifyReport,
} from "./repository-verification.mjs";

const RULE_ID = "sync-dev-start-contract";
const TEST_FILE = "tests/npm-build-start-contract.test.mjs";
const PACKAGE_FILE = "package.json";
const TARGET_TEST_NAME = "development startup launches the app before repository completion analysis";
const TARGET_TEST_TIMEOUT_MS = 30_000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const EXPECTED_CURRENT_DEV = "bash scripts/start-dev.sh";
const STALE_TEST_DEV =
  "node scripts/testing/repository-verification.mjs dev && bash scripts/start-dev.sh";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameSourceIdentity(left, right) {
  return Boolean(left && right &&
    left.revision === right.revision &&
    left.inputInventorySha256 === right.inputInventorySha256 &&
    left.dirtyInputSha256 === right.dirtyInputSha256);
}

function verifyLearning(learning, report) {
  if (!learning || learning.integrity?.algorithm !== "sha256") return false;
  const expected = learning.integrity.reportSha256 ?? learning.integrity.sha256;
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) return false;
  const unsigned = { ...learning };
  delete unsigned.integrity;
  return sha256(canonical(unsigned)) === expected &&
    learning.reportSha256 === report.integrity.reportSha256 &&
    sameSourceIdentity(learning.sourceIdentity, report.sourceIdentity);
}

async function readSource(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath ||
      path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).some(part => part === "..")) {
    throw new Error("Patch rule source path must remain repository-relative");
  }
  const filePath = path.resolve(root, relativePath);
  const info = await fs.lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_SOURCE_BYTES) {
    throw new Error(`Patch rule source must be a bounded regular file: ${relativePath}`);
  }
  const realPath = await fs.realpath(filePath);
  const resolvedRelative = path.relative(root, realPath);
  if (resolvedRelative === ".." || resolvedRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(resolvedRelative)) {
    throw new Error(`Patch rule source escaped the repository: ${relativePath}`);
  }
  return await fs.readFile(realPath);
}

function findDevAssertion(source) {
  const expression = /assert\.equal\(scripts\.dev,\s*(["'])(.*?)\1\s*\);/g;
  const matches = [...source.matchAll(expression)];
  return matches.length === 1 ? matches[0] : null;
}

function stablePlanKey({ sourceIdentity, beforeSha256, afterSha256 }) {
  return sha256(canonical({
    ruleId: RULE_ID,
    revision: sourceIdentity.revision,
    inputInventorySha256: sourceIdentity.inputInventorySha256,
    dirtyInputSha256: sourceIdentity.dirtyInputSha256,
    path: TEST_FILE,
    beforeSha256,
    afterSha256,
  }));
}

/**
 * Produce only explicitly registered, source-bound patches. This first rule
 * corrects the one known stale launcher assertion; it does not interpret prose.
 */
export async function generateEvidenceBasedPlans({
  root,
  report,
  learning,
  reportPath,
  runCheck = runOwned,
  signal,
} = {}) {
  root = await fs.realpath(path.resolve(root));
  if (!verifyReport(report) || !["full", "dev"].includes(report.mode) ||
      !verifyLearning(learning, report)) {
    return { status: "NO_MATCH", reason: "verified-report-and-learning-required", plans: [] };
  }

  let inventory;
  try {
    inventory = await buildInventory(root);
  } catch {
    return { status: "BLOCKED", reason: "current-source-inventory-unavailable", plans: [] };
  }
  if (!sameSourceIdentity(inventory.sourceIdentity, report.sourceIdentity)) {
    return { status: "BLOCKED", reason: "report-source-identity-is-stale", plans: [] };
  }

  let packageBytes;
  let testBytes;
  try {
    [packageBytes, testBytes] = await Promise.all([
      readSource(root, PACKAGE_FILE),
      readSource(root, TEST_FILE),
    ]);
  } catch {
    return { status: "BLOCKED", reason: "registered-rule-source-unavailable", plans: [] };
  }

  let packageJson;
  try {
    packageJson = JSON.parse(packageBytes.toString("utf8"));
  } catch {
    return { status: "BLOCKED", reason: "package-json-invalid", plans: [] };
  }
  const currentDev = packageJson?.scripts?.dev;
  if (currentDev !== EXPECTED_CURRENT_DEV) {
    return { status: "NO_MATCH", reason: "development-command-outside-rule-scope", plans: [] };
  }

  const testSource = testBytes.toString("utf8");
  const assertion = findDevAssertion(testSource);
  if (!assertion || assertion[2] !== STALE_TEST_DEV) {
    return {
      status: "NO_MATCH",
      reason: "no-known-stale-launcher-assertion",
      plans: [],
      evidence: {
        observedAssertion: assertion?.[2] ?? null,
        expectedStaleAssertion: STALE_TEST_DEV,
      },
    };
  }

  const evidenceDirectory = path.join(
    root, ".local", "repository-verification", "completion-loop", "patch-evidence",
  );
  await fs.mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  const evidenceLog = path.join(evidenceDirectory, `${randomUUID()}.log`);
  const testResult = await runCheck(process.execPath, [
    "--test",
    "--test-name-pattern", TARGET_TEST_NAME,
    TEST_FILE,
  ], {
    cwd: root,
    timeoutMs: TARGET_TEST_TIMEOUT_MS,
    logPath: evidenceLog,
    env: cleanEnvironment(),
    signal,
  });
  const observedFailure =
    testResult.status === "FAIL" &&
    testResult.exitCode !== 0 &&
    testResult.timedOut !== true &&
    testResult.interrupted !== true &&
    typeof testResult.logSha256 === "string" &&
    testResult.output.includes(TARGET_TEST_NAME) &&
    testResult.output.includes(currentDev) &&
    testResult.output.includes(STALE_TEST_DEV);
  if (!observedFailure) {
    return {
      status: testResult.interrupted ? "CANCELLED" : "NO_MATCH",
      reason: testResult.timedOut ? "targeted-evidence-check-timed-out" : "targeted-evidence-check-did-not-prove-mismatch",
      plans: [],
      evidence: {
        command: ["node", "--test", "--test-name-pattern", TARGET_TEST_NAME, TEST_FILE],
        status: testResult.status,
        exitCode: testResult.exitCode,
        log: path.relative(root, evidenceLog),
        logSha256: testResult.logSha256,
      },
    };
  }

  const replacement = `assert.equal(scripts.dev, ${JSON.stringify(currentDev)});`;
  const updatedTest = testSource.slice(0, assertion.index) +
    replacement + testSource.slice(assertion.index + assertion[0].length);
  const afterSha256 = sha256(updatedTest);
  const beforeSha256 = sha256(testBytes);
  const learningPath = path.join(path.dirname(reportPath), "learning.json");
  let learningBytes;
  try {
    learningBytes = await readSource(root, path.relative(root, learningPath));
  } catch {
    return { status: "BLOCKED", reason: "current-learning-artifact-unavailable", plans: [] };
  }

  let confirmedInventory;
  try {
    confirmedInventory = await buildInventory(root);
  } catch {
    return { status: "BLOCKED", reason: "source-recheck-unavailable", plans: [] };
  }
  if (!sameSourceIdentity(confirmedInventory.sourceIdentity, inventory.sourceIdentity)) {
    return { status: "BLOCKED", reason: "source-changed-during-patch-analysis", plans: [] };
  }

  const dedupeKey = stablePlanKey({
    sourceIdentity: inventory.sourceIdentity,
    beforeSha256,
    afterSha256,
  });
  const plan = {
    schemaVersion: 1,
    sourceIdentity: inventory.sourceIdentity,
    dedupeKey,
    generator: { name: "completion-loop-deterministic", ruleId: RULE_ID, schemaVersion: 1 },
    automationEvidence: {
      schemaVersion: 1,
      ruleId: RULE_ID,
      instruction: "Synchronize the stale development-launcher assertion with the app-first npm dev command.",
      reportSha256: report.integrity.reportSha256,
      reportPath: path.relative(root, reportPath),
      learningSha256: sha256(learningBytes),
      learningPath: path.relative(root, learningPath),
      reportSourceIdentity: report.sourceIdentity,
      targetedTest: {
        name: TARGET_TEST_NAME,
        command: ["node", "--test", "--test-name-pattern", TARGET_TEST_NAME, TEST_FILE],
        status: "FAIL",
        exitCode: testResult.exitCode,
        log: path.relative(root, evidenceLog),
        logSha256: testResult.logSha256,
        observedExpected: STALE_TEST_DEV,
        observedActual: currentDev,
      },
      evidenceFiles: [
        { path: PACKAGE_FILE, sha256: sha256(packageBytes) },
        { path: TEST_FILE, sha256: beforeSha256 },
      ],
    },
    changes: [{
      id: RULE_ID,
      path: TEST_FILE,
      operation: "replace",
      beforeSha256,
      afterSha256,
      content: updatedTest,
    }],
    checks: [{ id: "runtime-contracts", script: "test:runtime-contracts" }],
  };
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  return {
    status: "PATCH_READY",
    reason: null,
    plans: [{
      plan,
      bytes,
      sha256: sha256(bytes),
      dedupeKey,
      ruleId: RULE_ID,
      evidenceLog: {
        path: path.relative(root, evidenceLog),
        sha256: testResult.logSha256,
      },
    }],
  };
}

export const deterministicPatchRuleIds = Object.freeze([RULE_ID]);
export const deterministicPatchRuleEvidence = Object.freeze({
  [RULE_ID]: Object.freeze({
    instruction: "Synchronize the stale development-launcher assertion with the app-first npm dev command.",
    testName: TARGET_TEST_NAME,
    testFile: TEST_FILE,
    expected: STALE_TEST_DEV,
    actual: EXPECTED_CURRENT_DEV,
  }),
});
