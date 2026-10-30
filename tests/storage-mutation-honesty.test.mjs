import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";

// Execute the actual committed Express handler body, not a reimplemented
// authorization/response policy. The router and middleware are inert fixtures.
const routeSource = readFileSync(new URL("../server/routes/storage.ts", import.meta.url), "utf8");

function loadRoute(name) {
  const start = routeSource.indexOf(`router.post("/${name}", requireAuth,`);
  assert.notEqual(start, -1, `missing /api/storage/${name} route`);
  const end = routeSource.indexOf("\nrouter.post(", start + 1);
  assert.notEqual(end, -1, `missing boundary after ${name}`);
  let handler;
  const router = {
    post(path, auth, fn) {
      assert.equal(path, `/${name}`);
      assert.equal(typeof auth, "function");
      handler = fn;
    },
  };
  const code = stripTypeScriptTypes(routeSource.slice(start, end));
  runInNewContext(code, { router, requireAuth() {}, logger: { info() {}, warn() {} }, randomUUID: () => "generated-id" }, { timeout: 1000 });
  assert.equal(typeof handler, "function");
  return handler;
}

async function request(handler, body) {
  let status = 200;
  let payload;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };
  await handler({ user: { id: "account-a" }, body }, response);
  return { status, payload };
}

for (const [name, valid, missing] of [
  ["rename", { fileId: "account-b-private-file", newName: "stolen.wav" }, { fileId: "x" }],
  ["move", { fileId: "account-b-private-file", folderId: "folder-a" }, { folderId: "x" }],
  ["duplicate", { fileId: "account-b-private-file" }, {}],
]) {
  const handler = loadRoute(name);
  test(`${name} never acknowledges a nonexistent persistent mutation`, async () => {
    const { status, payload } = await request(handler, valid);
    assert.equal(status, 501);
    assert.equal(Object.hasOwn(payload, "success"), false);
    assert.match(payload.error, /unavailable; no changes were made/);
  });
  test(`${name} rejects missing fields without claiming success`, async () => {
    const { status, payload } = await request(handler, missing);
    assert.equal(status, 400);
    assert.equal(Object.hasOwn(payload, "success"), false);
  });
  test(`${name} rejects invalid input types`, async () => {
    const invalid = Object.fromEntries(Object.keys(valid).map(key => [key, { forged: true }]));
    const { status, payload } = await request(handler, invalid);
    assert.equal(status, 400);
    assert.equal(Object.hasOwn(payload, "success"), false);
  });
}
