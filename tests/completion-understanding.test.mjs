import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { buildRepositoryUnderstanding, saveRepositoryUnderstanding } from "../scripts/testing/completion-understanding.mjs";
import { buildInventory, reportLearningOutcome, sealReport } from "../scripts/testing/repository-verification.mjs";

const roots = [];

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-understanding-"));
  roots.push(root);
  const files = {
    ".gitignore": ".local/\n",
    "package.json": JSON.stringify({
      name: "understanding-fixture",
      private: true,
      scripts: { "test:routes": "node server/routes.ts" },
    }),
    "atlas/production.atlas": [
      "repository Fixture",
      "audit repository {",
      "  scan repository",
      "  detect unfinished",
      "  recurse max 2",
      "}",
      "policy ProductionReady {",
      "  noCriticalIssues",
      "}",
      "verify ProductionReady",
      "",
    ].join("\n"),
    "server/service.ts": [
      "export function createWidget(input: string) {",
      "  return 'source-body-must-not-be-written';",
      "}",
      "export class Widget {}",
      "// TODO: verify downstream consumer",
      "",
    ].join("\n"),
    "server/routes.ts": [
      'import { createWidget, Widget as WidgetClass } from "./service.js";',
      "export const router = { post: (_path: string, _handler: unknown) => undefined };",
      'router.post("/api/widgets", createWidget);',
      'const result = createWidget("fixture");',
      "class ExtendedWidget extends WidgetClass {}",
      "const instance = new WidgetClass();",
      "void result;",
      "void instance;",
      "",
    ].join("\n"),
    "api/py_service.py": [
      "def create_python_widget(value):",
      "    return value",
      "",
    ].join("\n"),
    "api/py_routes.py": [
      "from .py_service import create_python_widget",
      '@app.post("/api/python-widgets")',
      "def create_widget():",
      "    return create_python_widget('value')",
      "",
    ].join("\n"),
    "tests/routes.test.ts": [
      'import { router } from "../server/routes.js";',
      'test("creates widgets", () => expect("/api/widgets").toBeTruthy());',
      "void router;",
      "",
    ].join("\n"),
    "tests/substring.test.ts": [
      'test("does not exercise the route", () => expect("/api/widgets-extra").toBeTruthy());',
      "",
    ].join("\n"),
    "tests/test_python_routes.py": [
      "from api.py_routes import create_widget",
      'assert "/api/python-widgets" in "/api/python-widgets"',
      "create_widget",
      "",
    ].join("\n"),
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Completion Fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "completion-fixture@example.invalid"], { cwd: root });
  execFileSync("git", ["add", ".gitignore", "package.json", "atlas", "api", "server", "tests"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
  return { root, files };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

test("extracts local imports, exports, routes, scripts, and test references without source text", async () => {
  const { root } = await createFixture();
  const dossier = await buildRepositoryUnderstanding({ root });
  const routes = dossier.modules.find(item => item.path === "server/routes.ts");
  const service = dossier.modules.find(item => item.path === "server/service.ts");

  assert.equal(routes.exports.some(item => item.name === "router"), true);
  assert.equal(routes.symbols.some(item => item.name === "router" && item.exported), true);
  assert.equal(routes.routes.some(item => item.method === "POST" && item.path === "/api/widgets"), true);
  assert.equal(routes.imports.some(item =>
    item.specifier === "./service.js" &&
    item.resolvedPath === "server/service.ts" &&
    item.analysisStatus === "RESOLVED_ANALYZED"), true);
  assert.equal(service.importedBy.some(item => item.path === "server/routes.ts"), true);
  assert.equal(routes.testReferences.some(item => item.testPath === "tests/routes.test.ts"), true);
  assert.equal(routes.routeTestReferences.some(item =>
    item.route === "POST /api/widgets" && item.testPath === "tests/routes.test.ts"), true);
  assert.equal(routes.routeTestReferences.some(item =>
    item.testPath === "tests/substring.test.ts"), false);
  assert.equal(routes.referenceEdges.some(item =>
    item.kind === "calls" &&
    item.targetPath === "server/service.ts" &&
    item.targetSymbol === "createWidget"), true);
  assert.equal(routes.referenceEdges.some(item =>
    item.kind === "creates" && item.targetSymbol === "Widget"), true);
  assert.equal(routes.referenceEdges.some(item =>
    item.kind === "extends" && item.targetSymbol === "Widget"), true);
  assert.equal(routes.scriptEntrypoints.some(item => item.name === "test:routes"), true);
  const pythonRoutes = dossier.modules.find(item => item.path === "api/py_routes.py");
  const pythonService = dossier.modules.find(item => item.path === "api/py_service.py");
  assert.equal(pythonRoutes.imports.some(item =>
    item.specifier === ".py_service" &&
    item.resolvedPath === "api/py_service.py" &&
    item.analysisStatus === "RESOLVED_ANALYZED"), true);
  assert.equal(pythonRoutes.exports.some(item => item.name === "create_widget"), true);
  assert.equal(pythonRoutes.routes.some(item =>
    item.method === "POST" && item.path === "/api/python-widgets"), true);
  assert.equal(pythonRoutes.routeTestReferences.some(item =>
    item.testPath === "tests/test_python_routes.py"), true);
  assert.equal(pythonService.importedBy.some(item => item.path === "api/py_routes.py"), true);
  assert.equal(dossier.unfinishedCandidates.some(item =>
    item.path === "server/service.ts" && item.marker === "TODO"), true);
  assert.equal(JSON.stringify(dossier).includes("source-body-must-not-be-written"), false);
});

test("writes only a private dossier and leaves application source hashes unchanged", async () => {
  const { root } = await createFixture();
  const sourcePath = path.join(root, "server/routes.ts");
  const before = await fs.readFile(sourcePath);
  const dossier = await buildRepositoryUnderstanding({ root });
  const artifact = await saveRepositoryUnderstanding({ root, dossier });
  const after = await fs.readFile(sourcePath);
  const report = await fs.readFile(path.join(root, artifact.jsonPath), "utf8");
  const index = JSON.parse(report);
  const shard = JSON.parse(await fs.readFile(path.join(root, index.moduleDetails.shards[0].path), "utf8"));
  const directoryInfo = await fs.stat(path.dirname(path.join(root, artifact.jsonPath)));
  const fileInfo = await fs.stat(path.join(root, artifact.jsonPath));

  assert.deepEqual(after, before);
  assert.equal(report.includes("source-body-must-not-be-written"), false);
  assert.equal(index.moduleDetailStorage, "private-shards");
  assert.equal(index.modules.length, 0);
  assert.equal(shard.dossierSha256, index.moduleDetails.dossierSha256);
  assert.equal(shard.modules.some(item => item.path === "server/routes.ts"), true);
  assert.equal(JSON.stringify(shard).includes("source-body-must-not-be-written"), false);
  assert.equal(directoryInfo.mode & 0o777, 0o700);
  assert.equal(fileInfo.mode & 0o777, 0o600);
  assert.match(artifact.jsonSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    saveRepositoryUnderstanding({ root, dossier, outputDirectory: "dist" }),
    /only be written under/,
  );
});

test("marks an intentionally bounded scan incomplete and reports omitted files", async () => {
  const { root } = await createFixture();
  const dossier = await buildRepositoryUnderstanding({ root, maxFiles: 2 });

  assert.equal(dossier.sourceIdentity.complete, false);
  assert.equal(dossier.truncation.occurred, true);
  assert.equal(dossier.truncation.omittedFileCount, 7);
  assert.equal(dossier.modules.some(item => item.path === "server/service.ts"), false);
});

test("skips secret-named source paths and reports the resulting analysis gap without persisting values", async () => {
  const { root } = await createFixture();
  const sensitive = path.join(root, "config", "secrets.ts");
  await fs.mkdir(path.dirname(sensitive), { recursive: true });
  await fs.writeFile(sensitive, 'export const API_KEY = "fixture-secret-value";\n');
  execFileSync("git", ["add", "config/secrets.ts"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "add sensitive fixture path"], { cwd: root });

  const dossier = await buildRepositoryUnderstanding({ root });

  assert.equal(dossier.sourceIdentity.complete, false);
  assert.equal(dossier.sourceIdentity.sensitiveExcludedFileCount, 1);
  assert.equal(dossier.modules.some(item => item.path === "config/secrets.ts"), false);
  assert.equal(JSON.stringify(dossier).includes("fixture-secret-value"), false);
  assert.equal(JSON.stringify(dossier).includes("config/secrets.ts"), false);
});

test("redacts credential-bearing structural import literals from the private dossier", async () => {
  const { root } = await createFixture();
  const sourcePath = path.join(root, "server", "remote.ts");
  await fs.writeFile(sourcePath,
    'import remote from "https://user:fixture-secret@example.invalid/module.js?api_key=fixture-secret";\n' +
    "export { remote };\n");
  execFileSync("git", ["add", "server/remote.ts"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "add remote import fixture"], { cwd: root });

  const dossier = await buildRepositoryUnderstanding({ root });
  const remote = dossier.modules.find(item => item.path === "server/remote.ts");

  assert.equal(remote.imports[0].specifier, "https://example.invalid/module.js");
  assert.equal(JSON.stringify(dossier).includes("fixture-secret"), false);
});

test("attaches failure context and hash-bound coverage candidates to proposal-first learning", async () => {
  const { root } = await createFixture();
  const inventory = await buildInventory(root);
  const report = sealReport({
    schemaVersion: 1,
    runId: "fixture-full",
    mode: "full",
    gateStatus: "FAIL",
    sourceIdentity: inventory.sourceIdentity,
    checks: [
      { id: "full-sweep-source-drift", status: "PASS", command: [], nextAction: null },
      {
        id: "source-check:server/routes.ts",
        status: "FAIL",
        command: ["npm", "run", "test:routes"],
        nextAction: "Trace the route source and its test mapping.",
      },
    ],
  });
  const runDirectory = path.join(root, ".local", "repository-verification", "runs", "fixture-full");
  await fs.mkdir(runDirectory, { recursive: true });
  const learning = await reportLearningOutcome(root, runDirectory, report, {
    durableHistory: false,
    env: {},
  });
  assert.ok(learning);
  const proposals = learning.summary.currentProposals;
  const routeFailure = proposals.find(item => item.checkId === "source-check:server/routes.ts");
  const coverageCandidate = proposals.find(item =>
    item.kind === "static-coverage-candidate" && item.sourcePath === "server/service.ts");
  const index = JSON.parse(await fs.readFile(path.join(root,
    learning.summary.repositoryUnderstanding.artifact.jsonPath), "utf8"));
  const atlasReport = JSON.parse(await fs.readFile(path.join(root,
    learning.summary.repositoryUnderstanding.atlas.artifact.jsonPath), "utf8"));
  const moduleShards = await Promise.all(index.moduleDetails.shards.map(item =>
    fs.readFile(path.join(root, item.path), "utf8").then(JSON.parse)));
  const service = moduleShards.flatMap(item => item.modules)
    .find(item => item.path === "server/service.ts");

  assert.equal(learning.summary.repositoryUnderstanding.sourceIdentity.runSourceMatch, true);
  assert.equal(routeFailure.repositoryContext.directReferences.some(item =>
    item.path === "server/routes.ts"), true);
  assert.equal(coverageCandidate.state, "NEEDS_REVIEW");
  assert.equal(coverageCandidate.evidence.sourceSha256, service.sha256);
  assert.ok(coverageCandidate.uncertainty.length > 0);
  assert.equal(learning.summary.repositoryUnderstanding.status, "CURRENT");
  assert.equal(learning.summary.repositoryUnderstanding.atlas.status, "GENERATED");
  assert.equal(learning.summary.repositoryUnderstanding.atlas.reportStatus, "UNVERIFIED");
  assert.equal(learning.summary.readinessStatus, "UNVERIFIED");
  const atlasPacket = atlasReport.repairPlan.packets.find(item =>
    item.kind === "static-coverage-candidate" && item.source.path === "server/service.ts");
  const matchingProposal = proposals.find(item => item.id === atlasPacket?.proposalId);
  assert.ok(atlasPacket);
  assert.equal(matchingProposal.proposalKey, atlasPacket.proposalKey);
  assert.equal(atlasPacket.executionStatus, "NOT_EXECUTABLE");
  assert.equal(learning.summary.proposalCounts.repositoryUnderstandingCandidates > 0, true);
});

test("rejects a verification report whose integrity seal was changed", async () => {
  const { root } = await createFixture();
  const report = {
    schemaVersion: 1,
    sourceIdentity: { revision: "deadbeef" },
    checks: [],
    integrity: { algorithm: "sha256", reportSha256: "0".repeat(64) },
  };
  await assert.rejects(buildRepositoryUnderstanding({ root, report }), /integrity-sealed/);
});
