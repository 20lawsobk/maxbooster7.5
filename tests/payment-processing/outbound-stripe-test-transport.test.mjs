import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDedicatedTestBindings, createTestStripe } from "./helpers-stripe-test-transport.mjs";

function bindings(secret, client, action) {
  const names = ["STRIPE_TEST_SECRET", "STRIPE_TEST_CLIENT", "HTTPS_PROXY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.STRIPE_TEST_SECRET = secret;
  process.env.STRIPE_TEST_CLIENT = client;
  delete process.env.HTTPS_PROXY;
  return Promise.resolve().then(action).finally(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
}

test("dedicated test transport rejects live and unsupported opaque bindings", async () => {
  await bindings("sk_live_forbiddenfixture", "pk_test_fixture", () => {
    assert.throws(assertDedicatedTestBindings, /live bindings are forbidden/);
  });
  await bindings("opaque-binding-fixture", "opaque-client-fixture", () => {
    assert.throws(assertDedicatedTestBindings, /configured HTTPS proxy/);
  });
});

test("a test-looking key cannot mutate before actual test-mode balance verification", async () => {
  await bindings("sk_test_unverifiedfixture", "pk_test_fixture", async () => {
    const stripe = createTestStripe(process.env.STRIPE_TEST_SECRET, { maxNetworkRetries: 0, timeout: 1000 });
    await assert.rejects(stripe.customers.create({ name: "must never be sent" }), error => {
      assert.match(error.detail?.message ?? "", /before observed livemode=false/);
      return true;
    });
  });
});

test("test transport rejects foreign destinations and non-dedicated credentials", async () => {
  await bindings("sk_test_destinationfixture", "pk_test_fixture", async () => {
    assert.throws(() => createTestStripe("sk_test_otherfixture"), /Non-dedicated/);
    const stripe = createTestStripe(process.env.STRIPE_TEST_SECRET, {
      host: "example.invalid", protocol: "http", port: 80, maxNetworkRetries: 0, timeout: 1000,
    });
    await assert.rejects(stripe.balance.retrieve(), error => {
      assert.match(error.detail?.message ?? "", /destination rejected/);
      return true;
    });
  });
});
