import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";

// Exercise committed TypeScript service and Express handler, not copied logic.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const src = readFileSync(new URL("../server/services/hybridStorageService.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("hybridStorageService.ts", src, ts.ScriptTarget.Latest, true);
const policy = ast.statements.find(
  n => ts.isFunctionDeclaration(n) && n.name?.text === "normalizeHybridCleanupDays",
);
assert.ok(policy, "Committed service must expose retention-window validation");
const klass = ast.statements.find(
  n => ts.isClassDeclaration(n) && n.name?.text === "HybridStorageService",
);
assert.ok(klass, "Committed service must expose HybridStorageService");
const method = klass.members.find(
  n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === "cleanup",
);
assert.ok(method, "Committed service must expose cleanup");
const source = policy.getText(ast).replace(/^export\s+/, "") +
  "\nclass Harness { async initialize() {} " + method.getText(ast) + " }\n";
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
});
const context = vm.createContext({ Date, Map, Number, Error });
vm.runInContext(compiled.outputText, context);
const normalize = vm.runInContext("normalizeHybridCleanupDays", context);
const Harness = vm.runInContext("Harness", context);
const old = (owner, bytes, accessed = 0) => ({
  userId: owner, sizeBytes: bytes, accessCount: accessed,
  lastAccessed: new Date("2000-01-01"),
});
function fixture(rows, deletion) {
  const h = new Harness();
  h.fileIndex = new Map(rows);
  h.delete = deletion;
  return h;
}

test("omitted retention window safely defaults to 90 days", () => {
  assert.equal(normalize(undefined), 90);
});
test("positive safe integer days are accepted", () => {
  for (const [v, expected] of [[1, 1], [90, 90], ["30", 30], ["36500", 36500]]) {
    assert.equal(normalize(v), expected);
  }
});
test("malformed, negative, zero and non-finite windows fail closed", () => {
  for (const v of [
    -1, 0, 1.1, 36501, Number.MAX_SAFE_INTEGER, Infinity, NaN,
    null, false, {}, [], ["1"], "0", "-1", "1garbage",
    " 1", "1.0", "01", "999999999999999999999",
  ]) {
    assert.throws(() => normalize(v), String(v));
  }
});
test("service rejects negative windows before attempting any deletion", async () => {
  const seen = [];
  const h = fixture([["fresh", old("owner", 4)]], async (_, key) => {
    seen.push(key); return true;
  });
  await assert.rejects(() => h.cleanup("owner", { olderThanDays: -1 }));
  assert.deepEqual(seen, []);
});
test("cleanup counts only confirmed deletions and only caller files", async () => {
  const seen = [];
  const h = fixture([
    ["no", old("owner", 10)],
    ["yes", old("owner", 20)],
    ["other", old("outsider", 30)],
  ], async (_, key) => { seen.push(key); return key === "yes"; });
  assert.deepEqual(
    { ...await h.cleanup("owner", { olderThanDays: 90 }) },
    { deletedCount: 1, freedBytes: 20 },
  );
  assert.deepEqual(seen, ["no", "yes"]);
});
test("cleanup ignores recently accessed or previously read files", async () => {
  const seen = [];
  const h = fixture([
    ["recent", { ...old("owner", 1), lastAccessed: new Date() }],
    ["used", old("owner", 2, 1)],
  ], async (_, key) => { seen.push(key); return true; });
  assert.deepEqual(
    { ...await h.cleanup("owner") },
    { deletedCount: 0, freedBytes: 0 },
  );
  assert.deepEqual(seen, []);
});

const routeSrc = readFileSync(new URL("../server/routes/hybridStorage.ts", import.meta.url), "utf8");
const routeAst = ts.createSourceFile("hybridStorage.ts", routeSrc, ts.ScriptTarget.Latest, true);
const cleanupRoute = routeAst.statements.find(
  n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) &&
    n.expression.arguments[0]?.text === "/cleanup",
);
assert.ok(cleanupRoute, "Committed route must expose /cleanup");
const handlerNode = cleanupRoute.expression.arguments.at(-1);
assert.ok(ts.isArrowFunction(handlerNode), "Cleanup route must use an executable handler");
const handlerCode = ts.transpileModule("const handler = " + handlerNode.getText(routeAst) + ";", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function runRoute(days) {
  const calls = [];
  const service = {
    cleanup: async (...args) => {
      calls.push(args);
      return { deletedCount: 0, freedBytes: 0 };
    },
  };
  const sandbox = vm.createContext({
    normalizeHybridCleanupDays: normalize,
    hybridStorageService: service,
    logger: { warn: () => {} },
  });
  vm.runInContext(handlerCode, sandbox);
  const handler = vm.runInContext("handler", sandbox);
  const res = {
    statusCode: 200, body: null,
    status(n) { this.statusCode = n; return this; },
    json(obj) { this.body = obj; return this; },
  };
  await handler(
    { user: { id: "owner" }, body: days === undefined ? {} : { olderThanDays: days } },
    res,
  );
  return { status: res.statusCode, body: res.body, calls };
}
test("route rejects negative retention before any cleanup call", async () => {
  const r = await runRoute(-1);
  assert.equal(r.status, 400);
  assert.equal(r.calls.length, 0);
});
test("route rejects malformed retention before any cleanup call", async () => {
  const r = await runRoute("1junk");
  assert.equal(r.status, 400);
  assert.equal(r.calls.length, 0);
});
test("route accepts default retention and passes validated days", async () => {
  const r = await runRoute(undefined);
  assert.equal(r.status, 200);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0][1].olderThanDays, 90);
});
