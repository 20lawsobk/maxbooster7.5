import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const routeFile = resolve(
  "external/maxcore/artifacts/api-server/src/routes/model-proxy.ts",
);
const source = readFileSync(routeFile, "utf8");
const sourceFile = ts.createSourceFile(
  routeFile,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function findRouterRoute(method, path) {
  let found;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const expression = node.expression;
      const routePath = node.arguments[0];
      if (
        expression.expression.getText(sourceFile) === "router" &&
        expression.name.text === method &&
        routePath &&
        ts.isStringLiteral(routePath) &&
        routePath.text === path
      ) {
        found = node;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

test("MaxCore API gateway forwards admin source status to Python read-only status", () => {
  const route = findRouterRoute(
    "get",
    "/awareness/unified/admin/source-status",
  );
  assert.ok(route, "admin source-status route must be registered");
  assert.match(
    route.getText(sourceFile),
    /proxyRequest\(req,\s*res,\s*"\/api\/awareness\/unified\/admin\/source-status"\)/,
  );
  assert.match(
    source,
    /path === "\/api\/awareness\/unified\/admin\/source-status"/,
    "source status must bypass the generation circuit wait with its bounded read-only budget",
  );
});

test("MaxCore API gateway forwards admin source review to Python with its admin path", () => {
  const route = findRouterRoute(
    "post",
    "/awareness/unified/admin/source-review",
  );
  assert.ok(route, "admin source-review route must be registered");
  assert.match(
    route.getText(sourceFile),
    /proxyRequest\(req,\s*res,\s*"\/api\/awareness\/unified\/admin\/source-review"\)/,
  );
});
