import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Executes the committed route callback in isolation. Real HTTP and DB tests
// are still required for launch authorization.
const source = readFileSync(new URL("../server/routes/files.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("files.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const matches = [];
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(parsed) === "router" &&
      node.expression.name.text === "post" &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/:id/preview") matches.push(node);
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(matches.length, 1, "expected one preview route");
const route = matches[0];
const file = { id: "00000000-0000-4000-8000-000000000001", fileName: "private.wav", mimeType: "audio/wav", sizeBytes: 1000 };

async function invoke(foundFile, user) {
  const callback = route.arguments.at(-1);
  assert.ok(ts.isArrowFunction(callback));
  const js = ts.transpileModule("const handler = " + callback.getText(parsed) + ";", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const comparisons = [];
  const eq = (field, value) => { comparisons.push({ field, value }); return true; };
  const db = { select() { return { from() { return { where() { return { limit: async () => foundFile ? [foundFile] : [] }; } }; } }; } };
  const handler = new Function("db", "userStorageFiles", "eq", "and", "logger", js + "\nreturn handler;")(
    db, { id: "id", userId: "userId" }, eq, (...args) => args.every(Boolean), { warn() {} });
  const response = { statusCode: 200, headers: {}, body: null, comparisons };
  const res = {
    status(code) { response.statusCode = code; return this; },
    setHeader(name, value) { response.headers[name.toLowerCase()] = value; return this; },
    json(body) { response.body = body; return this; },
  };
  await handler({ user, params: { id: file.id } }, res);
  return response;
}

describe("file preview cannot claim nonexistent generated media", () => {
  it("preserves UUID parameter validation", () => {
    assert.match(route.arguments[1].getText(parsed), /requireUUIDParam\("id"\)/);
  });
  it("requires authentication", async () => {
    assert.equal((await invoke(file, undefined)).statusCode, 401);
  });
  it("does not reveal missing or unowned files", async () => {
    const result = await invoke(null, { id: "owner" });
    assert.equal(result.statusCode, 404);
    assert.equal(result.body.success, false);
  });
  it("checks the authenticated owner in the lookup", async () => {
    const result = await invoke(file, { id: "owner" });
    assert.ok(result.comparisons.some(({ field, value }) => field === "userId" && value === "owner"));
  });
  it("returns unavailable rather than fabricated preview URLs or duration", async () => {
    const result = await invoke(file, { id: "owner" });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.success, false);
    assert.equal(result.body.outcome, "preview_unavailable");
    assert.equal(Object.hasOwn(result.body, "preview"), false);
  });
  it("does not cache unavailable private previews", async () => {
    const result = await invoke(file, { id: "owner" });
    assert.match(result.headers["cache-control"], /private.*no-store/);
  });
});
