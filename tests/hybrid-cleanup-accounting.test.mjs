import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../server/services/hybridStorageService.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("hybridStorageService.ts", source, ts.ScriptTarget.Latest, true);
const service = parsed.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "HybridStorageService");
assert.ok(service, "Expected the actual HybridStorageService class");
const cleanup = service.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(parsed) === "cleanup");
assert.ok(cleanup, "Expected the actual cleanup method");
const sourceMethod = cleanup.getText(parsed);
const compiled = ts.transpileModule(`class CleanupHarness { async initialize() {} ${sourceMethod} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Cleanup source must transpile");
const Harness = vm.runInNewContext(`${compiled.outputText}\nCleanupHarness`, {
  Date, Map,
  normalizeHybridCleanupDays: (value) => value === undefined ? 90 : value,
});
const stale = (userId, sizeBytes) => ({
  userId, sizeBytes, lastAccessed: new Date("2000-01-01T00:00:00Z"), accessCount: 0,
});
function fixture(entries, deletion) {
  const harness = new Harness();
  harness.fileIndex = new Map(entries);
  harness.delete = deletion;
  return harness;
}

test("a blocked shared-primary deletion is not counted as successful", async () => {
  const app = fixture([["primary", stale("owner", 600)]], async () => false);
  assert.deepEqual({ ...await app.cleanup("owner") }, { deletedCount: 0, freedBytes: 0 });
});
test("a confirmed successful deletion counts one object and its logical bytes", async () => {
  const app = fixture([["alias", stale("owner", 100)]], async () => true);
  assert.deepEqual({ ...await app.cleanup("owner") }, { deletedCount: 1, freedBytes: 100 });
});
test("false, undefined and rejected outcomes never inflate cleanup accounting", async () => {
  const responses = new Map([["blocked", false], ["missing", undefined], ["deleted", true]]);
  const app = fixture([
    ["blocked", stale("owner", 1000)],
    ["missing", stale("owner", 2000)],
    ["deleted", stale("owner", 3000)],
    ["throws", stale("owner", 4000)],
  ], async (_, key) => { if (key === "throws") throw new Error("PDIM unavailable"); return responses.get(key); });
  assert.deepEqual({ ...await app.cleanup("owner") }, { deletedCount: 1, freedBytes: 3000 });
});
test("cleanup never calls deletion on another tenant's files", async () => {
  const seen = [];
  const app = fixture([["foreign", stale("other", 9999)], ["mine", stale("owner", 7)]], async (_, key) => { seen.push(key); return true; });
  assert.deepEqual({ ...await app.cleanup("owner") }, { deletedCount: 1, freedBytes: 7 });
  assert.deepEqual(seen, ["mine"]);
});
test("recent or accessed files are never offered for deletion", async () => {
  const seen = [];
  const app = fixture([
    ["recent", { ...stale("owner", 5), lastAccessed: new Date() }],
    ["accessed", { ...stale("owner", 9), accessCount: 1 }],
  ], async (_, key) => { seen.push(key); return true; });
  assert.deepEqual({ ...await app.cleanup("owner") }, { deletedCount: 0, freedBytes: 0 });
  assert.deepEqual(seen, []);
});
