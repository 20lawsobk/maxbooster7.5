import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual committed route callback in isolation, not a retyped
// imitation. Full Express/storage integration remains a separate release gate.
const source = readFileSync(new URL("../server/routes/storage.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("storage.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const routes = [];
function visit(node) {
  if (ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(parsed) === "router" &&
      node.expression.name.text === "post" &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "/scan") {
    routes.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(routes.length, 1, "one /scan endpoint must exist");
const route = routes[0];
assert.equal(route.arguments[1].getText(parsed), "requireAuth", "scan endpoint must require authentication");
assert.ok(ts.isArrowFunction(route.arguments[2]), "scan route must have an inline callback");
const callback = route.arguments[2].getText(parsed);
const js = ts.transpileModule(`const scanHandler = ${callback};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const handler = new Function("logger", `${js}\nreturn scanHandler;`)({ warn() {} });

async function invoke(body) {
  const response = { statusCode: 200, headers: {}, body: undefined };
  const res = {
    status(code) { response.statusCode = code; return this; },
    setHeader(key, value) { response.headers[key.toLowerCase()] = value; return this; },
    json(value) { response.body = value; return this; },
  };
  await handler({ body }, res);
  return response;
}

describe("authenticated storage scan must fail closed without a scanner", () => {
  it("retains requireAuth middleware", () => {
    assert.equal(route.arguments[1].getText(parsed), "requireAuth");
  });

  it("returns 503 rather than fabricated 200 clean for a file ID", async () => {
    const result = await invoke({ fileId: "unexamined-file" });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body?.success, false);
  });

  it("does not invent a clean result, empty threats or scannedAt timestamp", async () => {
    const result = await invoke({ fileId: "unexamined-file" });
    assert.equal(Object.hasOwn(result.body ?? {}, "scanResult"), false);
    assert.equal(Object.hasOwn(result.body ?? {}, "clean"), false);
    assert.match(result.body?.error ?? "", /unavailable|not performed/i);
  });

  it("marks the unavailable result non-cacheable", async () => {
    const result = await invoke({ fileId: "unexamined-file" });
    assert.match(result.headers["cache-control"] ?? "", /no-store/);
  });

  it("never claims success even without a file ID", async () => {
    const result = await invoke({});
    assert.equal(result.statusCode, 503);
    assert.equal(result.body?.success, false);
  });
});
