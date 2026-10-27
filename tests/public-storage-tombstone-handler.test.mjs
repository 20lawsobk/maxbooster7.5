import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Exercise the committed route handler, not a reimplemented policy function.
// Dependencies are mocked; this is a handler unit test, not an HTTP/PDIM test.
const source = readFileSync(new URL("../server/routes/storage.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("storage.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let publicHandlerNode;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText(parsed) === "router" &&
    node.expression.name.text === "get" &&
    node.arguments[0]?.text === "/public/*key"
  ) {
    assert.equal(publicHandlerNode, undefined, "public route must have exactly one handler");
    publicHandlerNode = node.arguments[1];
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(publicHandlerNode && ts.isArrowFunction(publicHandlerNode), "public route handler missing");
const compiled = ts.transpileModule(
  "globalThis.__handler = " + publicHandlerNode.getText(parsed) + ";",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function fixture({ deleted = false, dbFailure = false, key = "storefronts/cover.jpg" } = {}) {
  const calls = [];
  const query = {
    from() { return this; },
    where() { return this; },
    async limit() {
      calls.push("tombstone-query");
      if (dbFailure) throw new Error("database unavailable");
      return deleted ? [{ id: "deleted-file" }] : [];
    },
  };
  const sandbox = {
    db: { select() { return query; } },
    userStorageFiles: { id: "id", fileKey: "fileKey", deletedAt: "deletedAt" },
    and: (...values) => values,
    eq: (...values) => values,
    isNotNull: value => value,
    normalizeStorageKey(raw) {
      const normalized = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
      return !normalized || normalized.startsWith("/") ||
        normalized.includes("..") || normalized.includes("\\") ||
        normalized.includes("\0") ? null : normalized;
    },
    path,
    logger: { warn() {} },
    storageService: {
      async downloadFile() {
        calls.push("physical-read");
        return Buffer.from("public-test-bytes");
      },
    },
    require(specifier) {
      assert.equal(specifier, "../services/marketplaceStemAccess");
      return { stemAssetAccess: async () => null };
    },
    Buffer,
  };
  vm.runInNewContext(compiled, sandbox, { timeout: 2000 });
  const res = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
  };
  return {
    calls,
    res,
    async run() { await sandbox.__handler({ params: { key } }, res); },
  };
}

test("deleted storefront bytes are denied before any storage read", async () => {
  const f = fixture({ deleted: true });
  await f.run();
  assert.equal(f.res.statusCode, 404);
  assert.deepEqual(f.calls, ["tombstone-query"]);
});

test("database outage fails closed instead of serving public bytes", async () => {
  const f = fixture({ dbFailure: true });
  await f.run();
  assert.equal(f.res.statusCode, 404);
  assert.deepEqual(f.calls, ["tombstone-query"]);
});

test("live storefront image still returns exact bytes without persistent caching", async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.res.statusCode, 200);
  assert.equal(f.res.body.toString("utf8"), "public-test-bytes");
  assert.equal(f.res.headers["cache-control"], "no-store");
  assert.deepEqual(f.calls, ["tombstone-query", "physical-read"]);
});

test("unsafe key is rejected before database or byte access", async () => {
  const f = fixture({ key: "storefronts/../private.jpg" });
  await f.run();
  assert.equal(f.res.statusCode, 400);
  assert.deepEqual(f.calls, []);
});

test("non-storefront key is rejected before database or byte access", async () => {
  const f = fixture({ key: "users/owner/private.jpg" });
  await f.run();
  assert.equal(f.res.statusCode, 403);
  assert.deepEqual(f.calls, []);
});
