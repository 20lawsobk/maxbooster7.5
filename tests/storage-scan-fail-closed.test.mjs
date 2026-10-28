import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../server/routes/storage.ts", import.meta.url), "utf8");
const start = source.indexOf('router.post("/scan", requireAuth, async (');
const end = source.indexOf("\nfunction formatBytes(", start);
assert.ok(start >= 0 && end > start, "expected actual /scan route and its end marker");
const committedHandlerSource = source.slice(start, end);

function exercise(fragment = committedHandlerSource) {
  let route;
  const requireAuth = () => {};
  const router = {
    post(path, middleware, handler) {
      route = { path, middleware, handler };
    },
  };
  const js = fragment.replace(/\b(_?req): Request, res: Response/, "$1, res");
  runInNewContext(js, { router, requireAuth, setTimeout, Date, logger: { warn() {} } }, { timeout: 1000 });
  assert.ok(route, "the committed route must register a handler");
  const reply = { code: 200, headers: {}, body: undefined };
  const res = {
    setHeader(name, value) { reply.headers[name.toLowerCase()] = value; return this; },
    status(code) { reply.code = code; return this; },
    json(body) { reply.body = body; return this; },
  };
  return { route, requireAuth, res, reply };
}

test("scan route remains authenticated", () => {
  const { route, requireAuth } = exercise();
  assert.equal(route.path, "/scan");
  assert.equal(route.middleware, requireAuth);
});

test("scan endpoint fails closed instead of claiming an unperformed scan", async () => {
  const { route, res, reply } = exercise();
  await route.handler({ user: { id: "account-a" }, body: { fileId: "object-1" } }, res);
  assert.equal(reply.code, 501);
  assert.equal(reply.body.success, false);
  assert.match(reply.body.error, /not implemented/i);
});

test("scan endpoint never returns a clean flag, empty threats or fabricated timestamp", async () => {
  const { route, res, reply } = exercise();
  await route.handler({ user: { id: "account-b" }, body: { fileId: "object-2" } }, res);
  assert.equal(reply.body.scanResult, undefined);
  assert.equal(reply.body.clean, undefined);
  assert.equal(reply.body.scannedAt, undefined);
});

test("unavailable scan verdicts cannot be cached as security decisions", async () => {
  const { route, res, reply } = exercise();
  await route.handler({ user: { id: "account-a" }, body: {} }, res);
  assert.equal(reply.headers["cache-control"], "no-store");
});

test("negative control: converting 501 to 200 would fail the regression", async () => {
  const mutant = committedHandlerSource.replace("status(501)", "status(200)");
  assert.notEqual(mutant, committedHandlerSource);
  const { route, res, reply } = exercise(mutant);
  await route.handler({ user: { id: "account-a" }, body: {} }, res);
  assert.throws(() => assert.equal(reply.code, 501), { code: "ERR_ASSERTION" });
});
