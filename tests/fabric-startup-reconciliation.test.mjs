import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const chunkPath = fileURLToPath(new URL("../external/pdim/artifacts/api-server/src/pocket-dimension/fabric/infra/ChunkIndex.ts", import.meta.url));
const servicePath = fileURLToPath(new URL("../external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService.ts", import.meta.url));

// Execute the checked-out TypeScript method, not a duplicated implementation.
async function sourceMethod(path, className, methodName, bindings = {}) {
  const source = await readFile(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === className);
  assert.ok(cls, `${className} must exist`);
  const method = cls.members.find(node => ts.isMethodDeclaration(node) && node.name?.getText(ast) === methodName);
  assert.ok(method, `${className}.${methodName} must exist`);
  const { outputText, diagnostics } = ts.transpileModule(`class Subject { ${method.getText(ast)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
  });
  assert.equal(diagnostics?.length ?? 0, 0);
  const Subject = vm.runInNewContext(`${outputText}\nSubject`, { ...bindings });
  return Subject.prototype[methodName];
}

test("startup reconciliation retains unpublished chunks and never lowers counts", async () => {
  const rows = [
    { id: "unpublished", refCount: 2 },
    { id: "under-counted", refCount: 1 },
    { id: "over-counted", refCount: 5 },
  ];
  const writes = [];
  const db = {
    select: () => ({ from: async () => rows }),
    update: () => ({ set: values => ({ where: async predicate => { writes.push({ values, predicate }); } }) }),
    delete: () => { throw new Error("startup must not delete indexed chunks"); },
  };
  const reconcile = await sourceMethod(chunkPath, "ChunkIndex", "reconcileRefCounts", {
    db, fabricChunks: { id: "id", refCount: "refCount" },
    eq: (field, value) => ({ field, value }),
  });
  const retained = await reconcile.call({ rowToChunk: row => row }, new Map([
    ["under-counted", 3], ["over-counted", 1],
  ]));
  assert.deepEqual(Array.from(retained, row => row.id), ["unpublished"]);
  assert.equal(writes.length, 1, "only proven undercounts may be raised");
  assert.equal(writes[0].predicate.value, "under-counted");
  assert.equal(writes[0].values.refCount, 3);
});

test("startup service cannot delete physical chunks absent from object snapshot", async () => {
  let physicalDeletes = 0;
  let observedCounts;
  const reconcile = await sourceMethod(servicePath, "PocketStorageService", "reconcileRefCounts", {
    logger: { warn() {}, info() {} },
  });
  const service = {
    objectIndex: { listAllObjects: async () => [
      { chunkIds: ["shared", "shared"] }, { chunkIds: ["shared"] },
    ] },
    chunkIndex: { reconcileRefCounts: async counts => {
      observedCounts = counts;
      return [{ id: "unpublished", nodeIds: ["node-1"] }];
    } },
    chunkStoreFactory: () => ({ deleteChunk: async () => { physicalDeletes += 1; } }),
  };
  await reconcile.call(service);
  assert.equal(observedCounts.get("shared"), 3);
  assert.equal(physicalDeletes, 0, "catalog absence is not a deletion receipt");
});
