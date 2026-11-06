import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import express from "express";
import ts from "typescript";
import { z } from "zod";

// Execute the committed schema and registered handlers over real HTTP without
// importing database, Stripe or other application singletons. These tests prove
// the route contract; complete payment/provider acceptance is a separate suite.
const source = readFileSync(new URL("../server/routes/marketplace.ts", import.meta.url), "utf8");
const file = ts.createSourceFile("marketplace.ts", source, ts.ScriptTarget.Latest, true);
const compile = (input, globals) => vm.runInNewContext(ts.transpileModule(input, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText, globals);

function schema(name) {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(file) === name) {
        return compile(`(${declaration.initializer.getText(file)});`, { z });
      }
    }
  }
  throw new Error(`Missing real schema ${name}`);
}

function handler(path, globals) {
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (call.expression.getText(file) !== "router.post" ||
        !ts.isStringLiteral(call.arguments[0]) || call.arguments[0].text !== path) continue;
    return compile(`(${call.arguments.at(-1).getText(file)});`, {
      interactionSchema: schema("interactionSchema"),
      purchaseSchema: schema("purchaseSchema"),
      logger: { warn() {} },
      setImmediate,
      ...globals,
    });
  }
  throw new Error(`Missing registered POST ${path}`);
}

async function fixture(t, { authenticated = true, checkoutError, interactionError } = {}) {
  const events = [];
  const checkouts = [];
  const session = { url: "https://checkout.stripe.test/owned-session", sessionId: "owned-session" };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = authenticated ? { id: "buyer" } : undefined;
    req.isAuthenticated = () => authenticated;
    next();
  });
  const globals = {
    discoveryAlgorithmService: { async recordInteraction(value) {
      events.push(value);
      if (interactionError) throw interactionError;
    } },
    marketplaceService: { async initiatePurchase(...args) {
      checkouts.push(args);
      if (checkoutError) throw checkoutError;
      return session;
    } },
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: "seller" }] }) }) }) },
    listings: { id: "id", userId: "userId" },
    eq: () => ({}),
  };
  app.post("/interaction", handler("/interaction", globals));
  app.post("/purchase", handler("/purchase", globals));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  };
  return { post, events, checkouts, session };
}

const beatId = "de305d54-75b4-431b-adb2-eb6b9e546014";

test("clients cannot fabricate a paid purchase signal", async t => {
  const subject = await fixture(t);
  for (const interactionType of ["purchase", "exclusive_purchase"]) {
    const response = await subject.post("/interaction", { beatId, interactionType });
    assert.equal(response.status, 400);
  }
  assert.equal(subject.events.length, 0);
  assert.equal(subject.checkouts.length, 0);
});

test("ordinary unpaid interactions retain authenticated user identity", async t => {
  const subject = await fixture(t);
  for (const interactionType of ["like", "share", "preview", "skip", "repeat", "add_to_cart"]) {
    const response = await subject.post("/interaction", { beatId, interactionType, userId: "someone-else" });
    assert.equal(response.status, 200);
    assert.equal(subject.events.at(-1).userId, "buyer");
    assert.equal(subject.events.at(-1).interactionType, interactionType);
  }
  assert.equal(subject.events.length, 6);
});

test("checkout initiation returns the provider session without claiming a paid purchase", async t => {
  const subject = await fixture(t);
  const response = await subject.post("/purchase", { beatId, licenseType: "basic" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, subject.session);
  assert.deepEqual(subject.checkouts, [["buyer", beatId, "basic"]]);
  assert.equal(subject.events.length, 0);
});

test("an analytics outage cannot strand an already-created checkout session", async t => {
  const subject = await fixture(t, { interactionError: new Error("analytics unavailable") });
  const response = await subject.post("/purchase", { beatId, licenseType: "premium" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, subject.session);
  assert.equal(subject.checkouts.length, 1);
  assert.equal(subject.events.length, 0);
});

test("failed checkout initiation does not emit a purchase signal", async t => {
  const subject = await fixture(t, { checkoutError: new Error("provider unavailable") });
  const response = await subject.post("/purchase", { beatId, licenseType: "basic" });
  assert.equal(response.status, 500);
  assert.equal(subject.events.length, 0);
});

test("unauthenticated interaction and purchase attempts cannot mutate signals or create sessions", async t => {
  const subject = await fixture(t, { authenticated: false });
  assert.equal((await subject.post("/interaction", { beatId, interactionType: "like" })).status, 401);
  assert.equal((await subject.post("/purchase", { beatId, licenseType: "basic" })).status, 401);
  assert.equal(subject.events.length, 0);
  assert.equal(subject.checkouts.length, 0);
});
