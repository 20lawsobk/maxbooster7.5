import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

// Exercise the actual committed read method, not a hand-written policy mock.
const source = fs.readFileSync("server/services/hybridStorageService.ts", "utf8");
const ast = ts.createSourceFile("hybridStorageService.ts", source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === "HybridStorageService",
);
assert.ok(service, "HybridStorageService exists");
const method = service.members.find(
  (node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === "read",
);
assert.ok(method, "HybridStorageService.read exists");
const js = ts.transpileModule(
  "class TestStorage { " + method.getText(ast) + " }; globalThis.TestStorage = TestStorage;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function setup({ readError = null, saveError = null } = {}) {
  const context = vm.createContext({});
  vm.runInContext(js, context);
  const storage = new context.TestStorage();
  const originalDate = new Date("2020-01-01T00:00:00.000Z");
  const primary = {
    key: "users/owner/original",
    userId: "owner",
    contentHash: "sha256-content",
    isPublic: false,
    isDeduplicated: false,
    accessCount: 0,
    lastAccessed: originalDate,
  };
  const duplicate = {
    ...primary,
    key: "users/second/duplicate",
    userId: "second",
    isDeduplicated: true,
    deduplicationRef: primary.key,
    lastAccessed: originalDate,
  };
  const readKeys = [];
  let saves = 0;
  Object.assign(storage, {
    fileIndex: new Map([[primary.key, primary], [duplicate.key, duplicate]]),
    initialize: async () => {},
    readFromStorage: async (entry) => {
      readKeys.push(entry.key);
      if (readError) throw readError;
      return Buffer.from("real-bytes:" + entry.key);
    },
    saveIndex: async () => {
      saves++;
      if (saveError) throw saveError;
    },
  });
  return { storage, primary, duplicate, readKeys, get saves() { return saves; } };
}

test("primary owner reads exact bytes and persists access accounting", async () => {
  const f = setup();
  const bytes = await f.storage.read("owner", f.primary.key);
  assert.equal(bytes.toString(), "real-bytes:" + f.primary.key);
  assert.equal(f.primary.accessCount, 1);
  assert.equal(f.saves, 1);
});

test("authorized duplicate reads primary bytes and persists duplicate access accounting", async () => {
  const f = setup();
  const bytes = await f.storage.read("second", f.duplicate.key);
  assert.equal(bytes.toString(), "real-bytes:" + f.primary.key);
  assert.deepEqual(f.readKeys, [f.primary.key]);
  assert.equal(f.duplicate.accessCount, 1);
  assert.equal(f.primary.accessCount, 0);
  assert.equal(f.saves, 1);
});

test("other account cannot read a private duplicate before byte fetch", async () => {
  const f = setup();
  await assert.rejects(() => f.storage.read("outsider", f.duplicate.key), /Access denied/);
  assert.equal(f.readKeys.length, 0);
  assert.equal(f.saves, 0);
});

test("missing deduplication primary fails closed before byte fetch", async () => {
  const f = setup();
  f.storage.fileIndex.delete(f.primary.key);
  await assert.rejects(() => f.storage.read("second", f.duplicate.key), /Invalid hybrid deduplication reference/);
  assert.equal(f.readKeys.length, 0);
  assert.equal(f.saves, 0);
});

test("missing deduplication reference key fails closed", async () => {
  const f = setup();
  delete f.duplicate.deduplicationRef;
  await assert.rejects(() => f.storage.read("second", f.duplicate.key), /Invalid hybrid deduplication reference/);
  assert.equal(f.readKeys.length, 0);
});

test("content hash mismatch fails closed instead of returning unrelated bytes", async () => {
  const f = setup();
  f.primary.contentHash = "different-file";
  await assert.rejects(() => f.storage.read("second", f.duplicate.key), /Invalid hybrid deduplication reference/);
  assert.equal(f.readKeys.length, 0);
});

test("chained deduplication references fail closed", async () => {
  const f = setup();
  f.primary.isDeduplicated = true;
  await assert.rejects(() => f.storage.read("second", f.duplicate.key), /Invalid hybrid deduplication reference/);
  assert.equal(f.readKeys.length, 0);
});

test("failed PDIM byte read never increments access count or saves metadata", async () => {
  const f = setup({ readError: new Error("simulated PDIM outage") });
  await assert.rejects(() => f.storage.read("second", f.duplicate.key), /simulated PDIM outage/);
  assert.equal(f.duplicate.accessCount, 0);
  assert.equal(f.saves, 0);
});

test("failed index persistence rejects and restores in-memory access accounting", async () => {
  const f = setup({ saveError: new Error("simulated index outage") });
  await assert.rejects(() => f.storage.read("second", f.duplicate.key), /simulated index outage/);
  assert.equal(f.duplicate.accessCount, 0);
  assert.equal(f.duplicate.lastAccessed.toISOString(), "2020-01-01T00:00:00.000Z");
  assert.equal(f.saves, 1);
});

test("explicitly public primary permits nonowner read", async () => {
  const f = setup();
  f.primary.isPublic = true;
  const bytes = await f.storage.read("outsider", f.primary.key);
  assert.equal(bytes.toString(), "real-bytes:" + f.primary.key);
  assert.equal(f.primary.accessCount, 1);
  assert.equal(f.saves, 1);
});
