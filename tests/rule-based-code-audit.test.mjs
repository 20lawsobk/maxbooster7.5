import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { executeCompletionPlan } from "../scripts/testing/completion-executor.mjs";
import { initializeIsolatedCopy } from "../scripts/testing/completion-loop.mjs";
import {
  ruleBasedAuditRegistry,
  runRuleBasedCodeAudit,
  validateRegistry,
} from "../scripts/testing/rule-based-code-audit.mjs";

const fixtures = [];
const CURRENT_DEV = "bash scripts/start-dev.sh";
const STALE_DEV =
  "node scripts/testing/repository-verification.mjs dev && bash scripts/start-dev.sh";
const TEST_NAME =
  "development startup launches the app before repository completion analysis";
const TARGET = "tests/npm-build-start-contract.test.mjs";
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function hash(value) {
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

function runGit(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fixtureTestSource(duplicate = false) {
  const assertions = [
    `  assert.equal(scripts.dev, ${JSON.stringify(STALE_DEV)});`,
    ...(duplicate ? [`  assert.equal(scripts.dev, ${JSON.stringify(STALE_DEV)});`] : []),
  ];
  return [
    'import assert from "node:assert/strict";',
    'import fs from "node:fs/promises";',
    'import path from "node:path";',
    'import test from "node:test";',
    'const scripts = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")).scripts;',
    `test(${JSON.stringify(TEST_NAME)}, () => {`,
    ...assertions,
    "});",
    "",
  ].join("\n");
}

async function createFixture({
  duplicate = false,
  failingPostCheck = false,
  symlinkTarget = false,
  outsideScope = false,
} = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "rule-based-code-audit-"));
  fixtures.push(base);
  const source = path.join(base, "source");
  const isolated = path.join(base, "isolated");
  await fs.mkdir(path.join(source, "tests"), { recursive: true });
  await fs.writeFile(path.join(source, ".gitignore"), ".local/\n");
  await fs.writeFile(path.join(source, "package.json"), `${JSON.stringify({
    name: "rule-based-audit-fixture",
    private: true,
    scripts: {
      dev: CURRENT_DEV,
      "test:runtime-contracts": failingPostCheck
        ? "node -e \"process.exit(1)\""
        : "node --test tests/npm-build-start-contract.test.mjs",
    },
  }, null, 2)}\n`);
  await fs.writeFile(path.join(source, TARGET), outsideScope
    ? fixtureTestSource().replace(JSON.stringify(STALE_DEV), JSON.stringify(CURRENT_DEV))
    : fixtureTestSource(duplicate));
  if (outsideScope) {
    await fs.writeFile(path.join(source, "tests/other-contract.test.mjs"), [
      `assert.equal(scripts.dev, ${JSON.stringify(STALE_DEV)});`,
      "",
    ].join("\n"));
  }
  await fs.writeFile(path.join(source, "sample.py"), "def run():\n    return 1\n");
  execFileSync("git", ["init", "-q"], { cwd: source });
  runGit(source, ["config", "user.name", "Rule Audit Fixture"]);
  runGit(source, ["config", "user.email", "rule-audit@example.invalid"]);

  if (symlinkTarget) {
    await fs.rm(path.join(source, TARGET));
    await fs.symlink("missing-test-target.mjs", path.join(source, TARGET));
  }
  execFileSync("git", ["add", ".gitignore", "package.json", "sample.py", "tests"], { cwd: source });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: source });
  execFileSync("git", ["worktree", "add", "--detach", isolated, "HEAD"], { cwd: source });
  await initializeIsolatedCopy({ root: isolated, sourceRoot: source });
  return { base, source, root: isolated };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

test("the versioned registry rejects duplicate and unverifiable repair contracts", () => {
  assert.equal(validateRegistry(ruleBasedAuditRegistry), ruleBasedAuditRegistry);
  assert.throws(() => validateRegistry({
    ...ruleBasedAuditRegistry,
    capabilities: [ruleBasedAuditRegistry.capabilities[0], ruleBasedAuditRegistry.capabilities[0]],
  }), /invalid or duplicate/);
  assert.throws(() => validateRegistry({
    ...ruleBasedAuditRegistry,
    capabilities: ruleBasedAuditRegistry.capabilities.map(capability =>
      capability.repair.status === "registered"
        ? { ...capability, repair: { ...capability.repair, verification: [] } }
        : capability),
  }), /requires verification requirements/);
});

test("audit reports supported and unsupported areas without raw source diagnostics", async () => {
  const { root } = await createFixture();
  const output = execFileSync("npm", ["run", "code:audit", "--", "--root", root], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(output.slice(output.indexOf("{")));
  const reportText = JSON.stringify(report);
  const finding = report.findings.find(item => item.rule === "stale-dev-start-contract");

  assert.equal(report.registry.schemaVersion, 1);
  assert.equal(report.status, "AUDITED");
  assert.equal(report.registry.coverage.registeredRepairs, 1);
  assert.equal(report.registry.coverage.reviewOnlyChecks, report.registry.capabilities.length - 1);
  assert.ok(report.registry.capabilities.some(item =>
    item.auditRule === "secret" && item.status === "SUPPORTED"));
  assert.ok(report.registry.unsupported.length > 0);
  assert.equal(report.boundaries.networkCalls, 0);
  assert.equal(report.boundaries.modelCalls, 0);
  assert.equal(report.boundaries.sourceWritesByAudit, 0);
  const unsignedReport = { ...report };
  const integrity = unsignedReport.integrity;
  delete unsignedReport.integrity;
  assert.equal(integrity.algorithm, "sha256");
  assert.equal(integrity.reportSha256, hash(canonical(unsignedReport)));
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(root, report.reportPath), "utf8")),
    report,
  );
  assert.equal(finding.disposition, "AUTO_REPAIR_ELIGIBLE");
  assert.equal(finding.evidence.targetedTest.status, "FAIL");
  assert.ok(report.repair.planPath);
  assert.match(report.repair.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(reportText.includes("assert.equal(scripts.dev"), false);
  assert.equal(await fs.readFile(path.join(root, TARGET), "utf8"), fixtureTestSource());
  assert.equal(await fs.readFile(path.join(root, TARGET), "utf8"),
    await fs.readFile(path.join(path.dirname(root), "source", TARGET), "utf8"));
});

test("a registered exact repair uses the completion executor, verifies, and replays safely", async () => {
  const { root } = await createFixture();
  const candidate = await runRuleBasedCodeAudit({ root });
  const applied = await runRuleBasedCodeAudit({
    root,
    apply: true,
    expectedPlanSha256: candidate.planSha256,
  });

  assert.equal(applied.report.execution.status, "APPLIED_VERIFIED");
  assert.equal(applied.report.repair.status, "APPLIED_VERIFIED");
  assert.equal(applied.report.execution.checks[0].status, "PASS");
  assert.match(
    await fs.readFile(path.join(root, TARGET), "utf8"),
    new RegExp(CURRENT_DEV.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );

  const replay = await executeCompletionPlan({
    root,
    planPath: candidate.planPath,
    expectedPlanSha256: candidate.planSha256,
    apply: true,
  });
  assert.equal(replay.status, "ALREADY_APPLIED_VERIFIED");
  const plan = JSON.parse(await fs.readFile(candidate.planPath, "utf8"));
  const proof = { ...plan.automationEvidence.targetedFailure };
  const proofSha256 = proof.evidenceSha256;
  delete proof.evidenceSha256;
  assert.equal(proofSha256, hash(canonical({
    targetedFailure: proof,
    evidenceFiles: plan.automationEvidence.evidenceFiles,
  })));
  assert.equal(await fs.readFile(path.join(root, TARGET), "utf8"), plan.changes[0].content);
  assert.equal(await fs.readFile(path.join(path.dirname(root), "source", TARGET), "utf8"),
    fixtureTestSource());
});

test("ambiguous matching assertions remain review-only", async () => {
  const { root } = await createFixture({ duplicate: true });
  const result = await runRuleBasedCodeAudit({ root });

  assert.equal(result.report.repair.status, "REVIEW_REQUIRED");
  assert.equal(result.report.repair.reason, "ambiguous-contract-assertions");
  assert.equal(result.planPath, null);
  const proposal = result.report.findings.find(item => item.rule === "stale-dev-start-contract");
  assert.equal(proposal.disposition, "REVIEW_REQUIRED");
  assert.equal(proposal.evidence.reason, "ambiguous-contract-assertions");
});

test("a stale assertion outside the registered path scope is not repaired", async () => {
  const { root } = await createFixture({ outsideScope: true });
  const result = await runRuleBasedCodeAudit({ root });

  assert.equal(result.report.repair.status, "NO_MATCH");
  assert.equal(result.planPath, null);
  assert.equal(await fs.readFile(path.join(root, "tests/other-contract.test.mjs"), "utf8"),
    `assert.equal(scripts.dev, ${JSON.stringify(STALE_DEV)});\n`);
});

test("source changes while the targeted check runs block plan generation", async () => {
  const { root } = await createFixture();
  const result = await runRuleBasedCodeAudit({
    root,
    runCheck: async (_command, _args, options) => {
      await fs.writeFile(path.join(root, TARGET), "export const raced = true;\n");
      return {
        status: "FAIL",
        exitCode: 1,
        timedOut: false,
        interrupted: false,
        output: `${TEST_NAME}\n${STALE_DEV}\n${CURRENT_DEV}`,
        log: options.logPath,
        logSha256: hash("targeted mismatch"),
      };
    },
  });

  assert.equal(result.report.repair.status, "BLOCKED");
  assert.equal(result.report.repair.reason, "source-changed-during-repair-evidence");
  assert.equal(result.planPath, null);
});

test("dirty source, symlinked targets, and stale plan evidence fail closed", async () => {
  const dirty = await createFixture();
  await fs.appendFile(path.join(dirty.root, "sample.py"), "\n# local change\n");
  const dirtyAudit = await runRuleBasedCodeAudit({ root: dirty.root });
  assert.equal(dirtyAudit.report.repair.status, "BLOCKED");
  assert.equal(dirtyAudit.report.repair.reason, "dirty-worktree");

  const symlinked = await createFixture({ symlinkTarget: true });
  await assert.rejects(runRuleBasedCodeAudit({ root: symlinked.root }), /bounded regular file/);

  const stale = await createFixture();
  const plan = await runRuleBasedCodeAudit({ root: stale.root });
  await fs.writeFile(path.join(stale.root, TARGET), "export const changed = true;\n");
  const staleExecution = await executeCompletionPlan({
    root: stale.root,
    planPath: plan.planPath,
    expectedPlanSha256: plan.planSha256,
    apply: true,
  });
  assert.equal(staleExecution.status, "BLOCKED");
  assert.match(staleExecution.blockReason, /source input hashes/);
});

test("failed independent checks roll the registered repair back", async () => {
  const { root } = await createFixture({ failingPostCheck: true });
  const candidate = await runRuleBasedCodeAudit({ root });
  const result = await runRuleBasedCodeAudit({
    root,
    apply: true,
    expectedPlanSha256: candidate.planSha256,
  });

  assert.equal(result.report.execution.status, "FAILED");
  assert.equal(result.report.execution.rollback.status, "COMPLETE");
  assert.equal(result.report.execution.checks[0].status, "FAIL");
  assert.equal(await fs.readFile(path.join(root, TARGET), "utf8"), fixtureTestSource());
});
