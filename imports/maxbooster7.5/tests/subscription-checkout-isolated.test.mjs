import { test } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";

async function load(file) {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const {
  createSubscriptionCheckout,
  createSubscriptionCheckoutStore,
  SubscriptionCheckoutConflictError,
} = await load("server/services/subscriptionCheckoutService.ts");

function memoryStore() {
  const operations = new Map();
  return {
    operations,
    async replay(input) {
      const prior = operations.get(input.id);
      if (!prior) return null;
      if (prior.userId !== input.userId || prior.plan !== input.plan || prior.priceId !== input.priceId) {
        throw new SubscriptionCheckoutConflictError("conflict");
      }
      return prior.result ?? null;
    },
    async begin(input) {
      const prior = operations.get(input.id);
      if (prior) {
        if (
          prior.userId !== input.userId ||
          prior.plan !== input.plan ||
          prior.priceId !== input.priceId ||
          prior.amountCents !== input.amountCents
        ) throw new SubscriptionCheckoutConflictError("conflict");
        return prior.result ?? null;
      }
      operations.set(input.id, { ...input });
      return null;
    },
    async complete(id, result) {
      operations.get(id).result = result;
    },
    async recordProviderIds(id, ids) {
      operations.get(id).providerRefs = {
        ...operations.get(id).providerRefs,
        ...ids,
      };
    },
  };
}

function fakeStripe(price) {
  const calls = { customers: [], intents: [], subscriptions: [] };
  return {
    calls,
    prices: { retrieve: async () => price },
    customers: {
      create: async (payload, options) => {
        calls.customers.push({ payload, options });
        return { id: "cus_1" };
      },
    },
    paymentIntents: {
      create: async (payload, options) => {
        calls.intents.push({ payload, options });
        return { id: "pi_1", client_secret: "pi_secret" };
      },
    },
    subscriptions: {
      create: async (payload, options) => {
        calls.subscriptions.push({ payload, options });
        return {
          id: "sub_1",
          latest_invoice: { id: "in_1", confirmation_secret: { client_secret: "sub_secret" } },
        };
      },
    },
  };
}

const user = { id: "user_1", email: "artist@example.com", stripeCustomerId: null };
const requestKey = "checkout_attempt_00000001";

test("lifetime checkout uses the authoritative active one-time Price amount and stable provider keys", async () => {
  const stripe = fakeStripe({ active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null });
  const store = memoryStore();
  const saved = [];
  const first = await createSubscriptionCheckout({
    stripe, store, user, plan: "lifetime", priceId: "price_lifetime",
    requestKey, saveCustomerId: async (...args) => saved.push(args),
  });
  const second = await createSubscriptionCheckout({
    stripe, store, user, plan: "lifetime", priceId: "price_lifetime",
    requestKey, saveCustomerId: async (...args) => saved.push(args),
  });

  assert.deepEqual(first, { clientSecret: "pi_secret", type: "payment_intent" });
  assert.deepEqual(second, first);
  assert.equal(stripe.calls.intents.length, 1);
  assert.equal(stripe.calls.intents[0].payload.amount, 69900);
  assert.match(stripe.calls.intents[0].options.idempotencyKey, /:payment-intent:v1$/);
  assert.equal(stripe.calls.customers[0].options.idempotencyKey, "subscription-customer:user_1");
  assert.deepEqual(saved, [["user_1", "cus_1"]]);
  assert.deepEqual([...store.operations.values()][0].providerRefs, {
    customerId: "cus_1",
    paymentIntentId: "pi_1",
  });
});

test("rejects inactive, wrong-currency, wrong-type, and missing-amount Prices before creating money objects", async () => {
  for (const price of [
    { active: false, currency: "usd", unit_amount: 69900, type: "one_time" },
    { active: true, currency: "eur", unit_amount: 69900, type: "one_time" },
    { active: true, currency: "usd", unit_amount: null, type: "one_time" },
    { active: true, currency: "usd", unit_amount: 69900, type: "recurring", recurring: { interval: "month" } },
  ]) {
    const stripe = fakeStripe(price);
    await assert.rejects(
      createSubscriptionCheckout({
        stripe, store: memoryStore(), user, plan: "lifetime", priceId: "price_bad",
        requestKey, saveCustomerId: async () => {},
      }),
      /price|amount|type/i,
    );
    assert.equal(stripe.calls.customers.length, 0);
    assert.equal(stripe.calls.intents.length, 0);
  }
});

test("durable store rejects reuse of one user request key with a different payload", async () => {
  const rows = new Map();
  const query = async (sql, params = []) => {
    if (sql.includes("SELECT user_id")) return { rows: rows.has(params[0]) ? [rows.get(params[0])] : [] };
    if (sql.includes("INSERT INTO commerce_operations")) {
      rows.set(params[0], {
        user_id: params[1], currency: params[2], amount_cents: params[3],
        state: "checkout_creating", payload: JSON.parse(params[4]), created_at: new Date(),
      });
    }
    return { rows: [] };
  };
  const database = {
    connect: async () => ({ query, release() {} }),
    query,
  };
  const store = createSubscriptionCheckoutStore(database);
  const base = {
    id: "subco_same", userId: "user_1", plan: "monthly",
    priceId: "price_monthly", amountCents: 1000, currency: "usd",
  };
  await store.begin(base);
  await assert.rejects(
    store.begin({ ...base, plan: "yearly", priceId: "price_yearly" }),
    SubscriptionCheckoutConflictError,
  );
});

test("monthly checkout sends a stable subscription key and returns its invoice secret", async () => {
  const stripe = fakeStripe({ active: true, currency: "usd", unit_amount: 4900, type: "recurring", recurring: { interval: "month" } });
  const result = await createSubscriptionCheckout({
    stripe, store: memoryStore(), user: { ...user, stripeCustomerId: "cus_existing" },
    plan: "monthly", priceId: "price_monthly", requestKey,
    saveCustomerId: async () => assert.fail("existing customer must not be rewritten"),
  });
  assert.deepEqual(result, {
    clientSecret: "sub_secret", subscriptionId: "sub_1", type: "subscription",
  });
  assert.equal(stripe.calls.customers.length, 0);
  assert.match(stripe.calls.subscriptions[0].options.idempotencyKey, /:subscription:v1$/);
});

test("a genuinely new purchase key creates a separate checkout operation", async () => {
  const stripe = fakeStripe({ active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null });
  const store = memoryStore();
  const existingCustomer = { ...user, stripeCustomerId: "cus_existing" };
  for (const key of ["checkout_attempt_00000001", "checkout_attempt_00000002"]) {
    await createSubscriptionCheckout({
      stripe, store, user: existingCustomer, plan: "lifetime",
      priceId: "price_lifetime", requestKey: key, saveCustomerId: async () => {},
    });
  }
  assert.equal(store.operations.size, 2);
  assert.equal(stripe.calls.intents.length, 2);
  assert.notEqual(
    stripe.calls.intents[0].options.idempotencyKey,
    stripe.calls.intents[1].options.idempotencyKey,
  );
});

test("rejects a recurring Price with the wrong canonical cadence or amount", async () => {
  for (const price of [
    { active: true, currency: "usd", unit_amount: 4900, type: "recurring", recurring: { interval: "year" } },
    { active: true, currency: "usd", unit_amount: 5000, type: "recurring", recurring: { interval: "month" } },
  ]) {
    const stripe = fakeStripe(price);
    await assert.rejects(createSubscriptionCheckout({
      stripe, store: memoryStore(), user, plan: "monthly",
      priceId: "price_monthly", requestKey, saveCustomerId: async () => {},
    }), /advertised plan amount or cadence/);
    assert.equal(stripe.calls.subscriptions.length, 0);
  }
});

test("an aged ambiguous operation is blocked before any provider create", async () => {
  const row = {
    user_id: "user_1", currency: "usd", amount_cents: 69900,
    state: "checkout_creating",
    payload: { plan: "lifetime", priceId: "price_lifetime" },
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
  };
  const query = async (sql) => {
    if (sql.includes("SELECT user_id,state,payload")) return { rows: [row] };
    if (sql.includes("SELECT user_id,currency")) return { rows: [row] };
    return { rows: [] };
  };
  const database = { connect: async () => ({ query, release() {} }), query };
  const stripe = fakeStripe({ active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null });
  await assert.rejects(createSubscriptionCheckout({
    stripe, store: createSubscriptionCheckoutStore(database), user,
    plan: "lifetime", priceId: "price_lifetime", requestKey,
    saveCustomerId: async () => {},
  }), (error) => error.code === "CHECKOUT_RECONCILIATION_REQUIRED");
  assert.equal(stripe.calls.customers.length, 0);
  assert.equal(stripe.calls.intents.length, 0);
});

test("missing commerce schema fails explicitly before provider access or writes", async () => {
  const missing = Object.assign(new Error('relation "commerce_operations" does not exist'), { code: "42P01" });
  const database = {
    connect: async () => assert.fail("replay should fail first"),
    query: async () => { throw missing; },
  };
  let priceReads = 0;
  const stripe = fakeStripe({ active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null });
  stripe.prices.retrieve = async () => { priceReads++; };
  await assert.rejects(createSubscriptionCheckout({
    stripe, store: createSubscriptionCheckoutStore(database), user,
    plan: "lifetime", priceId: "price_lifetime", requestKey,
    saveCustomerId: async () => {},
  }), (error) => error.statusCode === 503 && error.code === "CHECKOUT_SCHEMA_UNAVAILABLE");
  assert.equal(priceReads, 0);
  assert.equal(stripe.calls.customers.length, 0);
});

test("completed receipt replays without Price or provider calls", async () => {
  const store = memoryStore();
  const operation = {
    userId: "user_1", plan: "lifetime", priceId: "price_lifetime",
    amountCents: 69900, result: { clientSecret: "saved_secret", type: "payment_intent" },
  };
  const crypto = await import("node:crypto");
  const id = `subco_${crypto.createHash("sha256").update(`user_1:${requestKey}`).digest("hex")}`;
  store.operations.set(id, operation);
  const stripe = fakeStripe(null);
  stripe.prices.retrieve = async () => assert.fail("completed replay must not access Stripe");
  const result = await createSubscriptionCheckout({
    stripe, store, user, plan: "lifetime", priceId: "price_lifetime",
    requestKey, saveCustomerId: async () => {},
  });
  assert.deepEqual(result, operation.result);
});

test("concurrent same-key requests rely on one provider idempotency result and do not double create", async () => {
  const base = fakeStripe({ active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null });
  let acceptedCreates = 0;
  const byKey = new Map();
  base.paymentIntents.create = async (payload, options) => {
    if (!byKey.has(options.idempotencyKey)) {
      acceptedCreates++;
      byKey.set(options.idempotencyKey, { id: "pi_once", client_secret: "pi_once_secret" });
    }
    await new Promise(resolve => setTimeout(resolve, 5));
    return byKey.get(options.idempotencyKey);
  };
  const store = memoryStore();
  const existingCustomer = { ...user, stripeCustomerId: "cus_existing" };
  const invoke = () => createSubscriptionCheckout({
    stripe: base, store, user: existingCustomer, plan: "lifetime",
    priceId: "price_lifetime", requestKey, saveCustomerId: async () => {},
  });
  const [a, b] = await Promise.all([invoke(), invoke()]);
  assert.deepEqual(a, b);
  assert.equal(acceptedCreates, 1);
});

test("fresh retry after an unknown provider response reuses the accepted create", async () => {
  const stripe = fakeStripe({ active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null });
  const accepted = new Map();
  let calls = 0;
  stripe.paymentIntents.create = async (_payload, options) => {
    calls++;
    if (!accepted.has(options.idempotencyKey)) {
      accepted.set(options.idempotencyKey, { id: "pi_accepted", client_secret: "accepted_secret" });
      throw new Error("connection closed after Stripe accepted the request");
    }
    return accepted.get(options.idempotencyKey);
  };
  const store = memoryStore();
  const invoke = () => createSubscriptionCheckout({
    stripe, store, user: { ...user, stripeCustomerId: "cus_existing" },
    plan: "lifetime", priceId: "price_lifetime", requestKey,
    saveCustomerId: async () => {},
  });
  await assert.rejects(invoke(), /connection closed/);
  const retried = await invoke();
  assert.equal(retried.clientSecret, "accepted_secret");
  assert.equal(accepted.size, 1);
  assert.equal(calls, 2);
});

test("installed Stripe invoice contract exposes confirmation_secret on expanded latest_invoice", async () => {
  const fs = await import("node:fs/promises");
  const pkg = JSON.parse(await fs.readFile("node_modules/stripe/package.json", "utf8"));
  const invoiceTypes = await fs.readFile("node_modules/stripe/types/Invoices.d.ts", "utf8");
  const subscriptionTypes = await fs.readFile("node_modules/stripe/types/Subscriptions.d.ts", "utf8");
  assert.equal(pkg.version, "20.4.1");
  assert.match(invoiceTypes, /confirmation_secret\\?: Invoice\\.ConfirmationSecret \\| null/);
  assert.match(subscriptionTypes, /latest_invoice: string \\| Stripe\\.Invoice \\| null/);
});