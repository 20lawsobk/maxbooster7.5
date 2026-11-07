import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverHandlers } from "../scripts/testing/admin-route-inventory.mjs";

test("discovers multiline routes and ignores comments and unrelated methods", () => {
  const result = discoverHandlers("routes.ts", [
    '// router.get("/fake", handler);',
    'router.post(',
    '  "/projects",',
    '  requireAuth, handler',
    ');',
    'const text = \'app.get("/also-fake")\';',
    'cache.get("/not-an-endpoint");',
    'adminRouter.get(`/keys`, handler);',
  ].join("\n"));
  assert.deepEqual(result.handlers, [
    { method: "POST", declaredPath: "/projects", line: 2 },
    { method: "GET", declaredPath: "/keys", line: 8 },
  ]);
  assert.equal(result.unresolvedDeclarations, 0);
});
test("reports dynamic routes instead of inventing paths", () => {
  const result = discoverHandlers("routes.ts", 'router.get(variable, handler); router.post(`/x/${id}`, handler);');
  assert.equal(result.handlers.length, 0);
  assert.equal(result.unresolvedDeclarations, 2);
});
test("discovers Python multiline decorators without counting ordinary get calls", () => {
  const result = discoverHandlers("server.py", '@app.post(\n "/generate")\ndef action():\n data.get("x")\n@router.get(dynamic)\ndef other(): pass');
  assert.deepEqual(result.handlers, [{ method: "POST", declaredPath: "/generate", line: 1 }]);
  assert.equal(result.unresolvedDeclarations, 1);
});
