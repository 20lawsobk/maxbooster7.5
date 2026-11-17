import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { parseAtlasPolicy, runAtlasPolicy, saveAtlasReport } from "../scripts/testing/atlas-runtime.mjs";
import { buildRepositoryUnderstanding } from "../scripts/testing/completion-understanding.mjs";
import { buildInventory } from "../scripts/testing/repository-verification.mjs";

const roots = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-runtime-"));
  roots.push(root);
  const files = {
    ".gitignore": ".local/\n",
    "docs/README.md": "# Fixture documentation\n",
    "package.json": JSON.stringify({ name: "atlas-fixture", private: true }),
    "atlas/production.atlas": [
      "repository Fixture",
      "audit repository {",
      "  scan repository",
      "  discover components",
      "  map dependencies",
      "  detect unfinished",
      "  read file \"src/main.ts\"",
      "  read symbol \"start\"",
      "  draft repair plans",
      "  write private report",
      "  verify completeness",
      "  recurse max 2",
      "}",
      "policy ProductionReady {",
      "  noCriticalIssues",
      "  coverage > 95%",
      "}",
      "verify ProductionReady",
      "",
    ].join("\n"),
    "src/main.ts": [
      'import { helper } from "./helper.js";',
      "export function start() { return helper(); }",
      "// TODO: do not persist this private source sentence",
      "",
    ].join("\n"),
    "src/helper.ts": "export function helper() { return true; }\n",
    "tests/main.test.ts": [
      'import { start } from "../src/main.js";',
      'test("starts", () => expect(start()).toBe(true));',
      "",
    ].join("\n"),
  };
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(root, relative);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Atlas Fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "atlas-fixture@example.invalid"], { cwd: root });
  execFileSync("git", ["add", ".gitignore", "package.json", "atlas", "docs", "src", "tests"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "atlas fixture"], { cwd: root });
  return { root, files };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

test("parses Atlas repository, audit, recursion, and evidence policies", () => {
  const source = [
    "repository Fixture",
    "audit repository {",
    "  scan repository",
    "  verify subsystem \"Projects\"",
      "  read symbol \"start\"",
      "  draft repair plans",
    "  recurse max 3",
    "}",
    "policy ProductionReady {",
    "  noCriticalIssues",
    "  coverage > 95%",
    "  documentation > 90%",
    "}",
    "verify ProductionReady",
  ].join("\n");
  const ast = parseAtlasPolicy(source);

  assert.equal(ast.repository, "Fixture");
  assert.equal(ast.recursionMaxPasses, 3);
  assert.equal(ast.actions.some(item => item.kind === "verify subsystem" && item.name === "Projects"), true);
  assert.equal(ast.actions.some(item => item.kind === "read symbol" && item.name === "start"), true);
  assert.equal(ast.policies[0].rules.length, 3);
  assert.equal(ast.verifyPolicy, "ProductionReady");
});

test("rejects executable or unbounded policy statements", () => {
  assert.throws(() => parseAtlasPolicy([
    "repository Fixture",
    "audit repository {",
    "  exec npm test",
    "}",
  ].join("\n")), /unsupported audit statement/);
  assert.throws(() => parseAtlasPolicy([
    "repository Fixture",
    "audit repository {",
    "  recurse max 999",
    "}",
  ].join("\n")), /between 2 and 3/);
  assert.throws(() => parseAtlasPolicy("repository Fixture\nverify Missing"), /not declared/);
});

test("runs a bounded scan, reports evidence and uncertainty, and keeps readiness unverified", async () => {
  const { root } = await fixture();
  const policyPath = path.join(root, "atlas/production.atlas");
  const policySource = await fs.readFile(policyPath, "utf8");
  const program = parseAtlasPolicy(policySource, "atlas/production.atlas");
  const dossier = await buildRepositoryUnderstanding({ root });
  const inventory = await buildInventory(root);
  const report = await runAtlasPolicy({
    root,
    program,
    policySource,
    policyPath: "atlas/production.atlas",
    initialDossier: dossier,
    inventory,
  });

  assert.equal(report.language, "Atlas");
  assert.equal(report.status, "UNVERIFIED");
  assert.equal(report.recursion.completedPasses, 2);
  assert.equal(report.recursion.stable, true);
  assert.equal(report.policy.evaluation.rules.find(rule => rule.metric === "coverage").status, "UNVERIFIED");
  assert.equal(report.actions.find(item => item.action === "verify completeness").status, "UNVERIFIED");
  assert.equal(report.actions.find(item => item.action === "read file").contentReturned, false);
  assert.equal(report.actions.find(item => item.action === "read symbol").matches[0].symbol.name, "start");
  assert.equal(report.actions.find(item => item.action === "draft repair plans").executionStatus, "NOT_EXECUTABLE");
  assert.equal(report.actions.find(item => item.action === "write private report").writesApplicationSource, false);
  assert.ok(report.graph.counts.symbols >= 2);
  assert.equal(report.graph.fileInventory.status, "AVAILABLE");
  assert.equal(report.graph.fileInventory.lifecycleCounts.docs, 1);
  assert.equal(report.findings.unfinishedCandidates.some(item =>
    item.path === "src/main.ts" && item.marker === "TODO"), true);
  assert.equal(report.repairPlan.packets.length > 0, true);
  assert.equal(report.repairPlan.packets.every(packet =>
    packet.state === "NEEDS_REVIEW" && packet.executableChanges.length === 0), true);
  assert.equal(JSON.stringify(report).includes("do not persist this private source sentence"), false);
});

test("rejects a modified dossier before using it for repair planning", async () => {
  const { root } = await fixture();
  const policySource = await fs.readFile(path.join(root, "atlas/production.atlas"), "utf8");
  const program = parseAtlasPolicy(policySource, "atlas/production.atlas");
  const dossier = await buildRepositoryUnderstanding({ root });
  const inventory = await buildInventory(root);
  const changed = {
    ...dossier,
    summary: { ...dossier.summary, sourceFiles: 0 },
  };

  await assert.rejects(runAtlasPolicy({
    root,
    program,
    policySource,
    initialDossier: changed,
    inventory,
  }), /integrity or schema check/);
});

test("writes Atlas reports privately without changing product source", async () => {
  const { root } = await fixture();
  const sourcePath = path.join(root, "src/main.ts");
  const before = await fs.readFile(sourcePath);
  const policySource = await fs.readFile(path.join(root, "atlas/production.atlas"), "utf8");
  const report = await runAtlasPolicy({
    root,
    program: parseAtlasPolicy(policySource, "atlas/production.atlas"),
    policySource,
    policyPath: "atlas/production.atlas",
  });
  const artifacts = await saveAtlasReport({ root, report });
  const index = JSON.parse(await fs.readFile(path.join(root, artifacts.jsonPath), "utf8"));
  const info = await fs.stat(path.join(root, artifacts.jsonPath));
  const directoryInfo = await fs.stat(path.dirname(path.join(root, artifacts.jsonPath)));

  assert.deepEqual(await fs.readFile(sourcePath), before);
  assert.equal(index.integrity.sha256, report.integrity.sha256);
  assert.equal(info.mode & 0o777, 0o600);
  assert.equal(directoryInfo.mode & 0o777, 0o700);
});

test("runs the atlas CLI end to end against an isolated repository fixture", async () => {
  const { root } = await fixture();
  const cli = path.resolve("scripts/testing/atlas-runtime.mjs");
  const output = execFileSync(process.execPath, [
    cli, "run", "atlas/production.atlas", "--root", root,
  ], { cwd: process.cwd(), encoding: "utf8" });

  assert.match(output, /Atlas Fixture: UNVERIFIED/);
  assert.match(output, /Private report: \.local\/repository-verification\/atlas\//);
  const reportFiles = await fs.readdir(path.join(root, ".local/repository-verification/atlas"));
  assert.equal(reportFiles.some(name => name.endsWith(".json")), true);
});
