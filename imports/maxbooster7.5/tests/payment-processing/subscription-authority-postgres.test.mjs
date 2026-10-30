// Actual PostgreSQL and production subscription/catalog policies. Only the
// provider SDK is a controlled fixture; no provider credentials or requests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadIsolated } from "./helpers-inbound.mjs";
import { startDisposablePostgres } from "./helpers-database-postgres.mjs";

const catalog = { monthly: "price_fixture_monthly", yearly: "price_fixture_yearly", lifetime: "price_fixture_lifetime" };
function subscription(id, overrides = {}) {
  return { id, customer: "cus_fixture", status: "active", created: 200,
    metadata: {}, items: { data: [{ price: { id: catalog.monthly } }] }, ...overrides };
}
function event(id) {
  // None of these untrusted event fields may replace the refreshed provider
  // state. Event timestamps also cannot override subscription chronology.
  return { id: "evt_fixture", type: "customer.subscription.updated", created: 999999,
    data: { object: { id, customer: "cus_forged", status: "active", metadata: { planId: "lifetime" } } } };
}
function barrier() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

test("subscription authority validates provider state before real SQL admission", { timeout: 120_000 }, async t => {
  for (const key of ["STRIPE_SECRET_KEY", "TESTING_STRIPE_SECRET_KEY", "STRIPE_TEST_SECRET", "STRIPE_TEST_CLIENT"]) {
    assert.equal(process.env[key], undefined, "Run with the credential-free commerce runner");
  }
  const cluster = await startDisposablePostgres();
  t.after(() => cluster.stop());
  const { pool } = cluster;
  await pool.query(`CREATE TABLE users (
    id text PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text,
    subscription_tier text NOT NULL DEFAULT 'free'
  )`);
  const fixture = { rows: new Map(), fail: new Set(), calls: [], beforeRetrieve: undefined };
  fixture.stripe = {
    products: {
      async list() { fixture.calls.push(["products.list"]); return { data: [{ id: "prod_fixture", metadata: { app: "max-booster" } }] }; },
      async create() { assert.fail("An existing catalog must never be provisioned by this test"); },
    },
    prices: {
      async list() {
        fixture.calls.push(["prices.list"]);
        return { data: [
          // The actual catalog resolver must reject this metadata-only decoy.
          { id: "price_fixture_wrong_amount", active: true, currency: "usd", unit_amount: 1,
            metadata: { app: "max-booster", type: "monthly" }, type: "recurring", recurring: { interval: "month" } },
          ...[["monthly", 4900, "month"], ["yearly", 46800, "year"], ["lifetime", 69900, null]].map(([type, unit_amount, interval]) => ({
            id: catalog[type], active: true, currency: "usd", unit_amount,
            metadata: { app: "max-booster", type }, type: interval ? "recurring" : "one_time",
            recurring: interval ? { interval } : null,
          })),
        ] };
      },
      async create() { assert.fail("Catalog fixture is read-only"); },
    },
    subscriptions: {
      async retrieve(id) {
        fixture.calls.push(["subscriptions.retrieve", id]);
        await fixture.beforeRetrieve?.(id);
        if (fixture.fail.has(id)) throw new Error("Controlled provider retrieval failure");
        assert.ok(fixture.rows.has(id), `Unexpected provider subscription request: ${id}`);
        return structuredClone(fixture.rows.get(id));
      },
    },
  };
  globalThis.__subscriptionAuthorityFixture = fixture;
  globalThis.__subscriptionAuthorityPool = pool;
  // This is an opaque synthetic value accepted only by the injected SDK
  // constructor below. No real Stripe client is constructed or contacted.
  process.env.STRIPE_SECRET_KEY = "synthetic-local-provider-fixture";
  const directory = await mkdtemp(path.join(tmpdir(), "subscription-authority-entry-"));
  t.after(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete globalThis.__subscriptionAuthorityFixture;
    delete globalThis.__subscriptionAuthorityPool;
    await rm(directory, { recursive: true, force: true });
  });
  const entry = path.join(directory, "entry.mjs");
  await writeFile(entry, [
    `export {currentSubscription} from ${JSON.stringify(path.resolve("server/services/commerce/entitlements.ts"))};`,
    `export {ensureStripeProductsAndPrices,getStripePriceIds} from ${JSON.stringify(path.resolve("server/services/stripeSetup.ts"))};`,
  ].join("\n"));
  const subject = await loadIsolated(entry, {
    "../../db": "export const pool=globalThis.__subscriptionAuthorityPool;",
    "./runtime": "export const commerceStripe=()=>globalThis.__subscriptionAuthorityFixture.stripe;",
    stripe: "export default class Stripe {constructor(){return globalThis.__subscriptionAuthorityFixture.stripe;}}",
    "../logger.js": "export const logger={info(){},warn(){},error(){}};",
  });
  const snapshot = async () => (await pool.query("SELECT * FROM users ORDER BY id")).rows;
  async function reset({ tier = "free", current = "sub_incoming" } = {}) {
    fixture.rows.clear(); fixture.fail.clear(); fixture.calls.length = 0; fixture.beforeRetrieve = undefined;
    await pool.query("TRUNCATE users");
    await pool.query("INSERT INTO users(id,stripe_customer_id,stripe_subscription_id,subscription_tier) VALUES('owner','cus_fixture',$1,$2)", [current, tier]);
    fixture.rows.set("sub_incoming", subscription("sub_incoming"));
    fixture.rows.set("sub_current", subscription("sub_current", { created: 100 }));
  }

  await t.test("discovers existing monthly/yearly catalog prices using actual amount, currency and interval policy", async () => {
    assert.deepEqual(await subject.ensureStripeProductsAndPrices({ allowCreate: false }), catalog);
    assert.deepEqual(subject.getStripePriceIds(), catalog);
    assert.deepEqual(fixture.calls, [["products.list"], ["prices.list"]]);
  });
  for (const plan of ["monthly", "yearly"]) {
    await t.test(`${plan} catalog identity overrides stale event and contradictory provider metadata`, async () => {
      await reset();
      fixture.rows.set("sub_incoming", subscription("sub_incoming", {
        customer: { id: "cus_fixture" }, metadata: { planId: "lifetime" },
        items: { data: [{ price: { id: catalog[plan] } }] },
      }));
      const before = await snapshot();
      const result = await subject.currentSubscription(event("sub_incoming"));
      assert.equal(result.metadata.planId, plan);
      assert.deepEqual(result.customer, { id: "cus_fixture" });
      assert.deepEqual(fixture.calls, [["subscriptions.retrieve", "sub_incoming"]]);
      assert.deepEqual(await snapshot(), before, "authority resolution itself does not grant a paid tier");
    });
  }
  await t.test("valid legacy inline monthly/yearly metadata remains supported", async () => {
    for (const plan of ["monthly", "yearly"]) {
      await reset();
      fixture.rows.set("sub_incoming", subscription("sub_incoming", {
        metadata: { planId: plan }, items: { data: [{ price: { id: "price_fixture_inline" } }] },
      }));
      assert.equal((await subject.currentSubscription(event("sub_incoming"))).metadata.planId, plan);
      assert.equal((await snapshot())[0].subscription_tier, "free");
    }
  });
  await t.test("a delayed older event cannot supersede the current newer subscription", async () => {
    await reset({ current: "sub_current", tier: "yearly" });
    fixture.rows.set("sub_current", subscription("sub_current", { created: 300 }));
    const before = await snapshot();
    assert.equal(await subject.currentSubscription(event("sub_incoming")), null);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("a newer inactive subscription cannot replace an existing paid subscription", async () => {
    await reset({ current: "sub_current", tier: "yearly" });
    fixture.rows.set("sub_incoming", subscription("sub_incoming", { status: "canceled" }));
    const before = await snapshot();
    assert.equal(await subject.currentSubscription(event("sub_incoming")), null);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("a validated newer active subscription atomically advances only the observed pointer", async () => {
    await reset({ current: "sub_current", tier: "monthly" });
    fixture.rows.set("sub_incoming", subscription("sub_incoming", { items: { data: [{ price: { id: catalog.yearly } }] } }));
    assert.equal((await subject.currentSubscription(event("sub_incoming"))).metadata.planId, "yearly");
    assert.deepEqual(await snapshot(), [{ id: "owner", stripe_customer_id: "cus_fixture", stripe_subscription_id: "sub_incoming", subscription_tier: "monthly" }]);
  });
  await t.test("lifetime entitlement is never downgraded by a recurring event", async () => {
    await reset({ current: null, tier: "lifetime" });
    const before = await snapshot();
    assert.equal(await subject.currentSubscription(event("sub_incoming")), null);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("unknown and ambiguously linked customers fail without changing SQL", async () => {
    await reset();
    fixture.rows.set("sub_incoming", subscription("sub_incoming", { customer: "cus_unknown" }));
    const before = await snapshot();
    await assert.rejects(subject.currentSubscription(event("sub_incoming")), /not yet linked/);
    assert.deepEqual(await snapshot(), before);
    fixture.rows.set("sub_incoming", subscription("sub_incoming"));
    await pool.query("INSERT INTO users VALUES('duplicate','cus_fixture',NULL,'free')");
    const duplicate = await snapshot();
    await assert.rejects(subject.currentSubscription(event("sub_incoming")), /multiple local users/);
    assert.deepEqual(await snapshot(), duplicate);
  });
  for (const failed of ["sub_incoming", "sub_current"]) {
    await t.test(`provider retrieval failure for ${failed} preserves pointer and entitlement`, async () => {
      await reset({ current: "sub_current", tier: "yearly" });
      fixture.fail.add(failed);
      const before = await snapshot();
      await assert.rejects(subject.currentSubscription(event("sub_incoming")), /Controlled provider retrieval failure/);
      assert.deepEqual(await snapshot(), before);
    });
  }
  for (const invalidPlan of ["unsupported", "lifetime"]) {
    await t.test(`invalid newer recurring plan ${invalidPlan} is rejected before pointer mutation`, async () => {
      await reset({ current: "sub_current", tier: "monthly" });
      fixture.rows.set("sub_incoming", subscription("sub_incoming", {
        metadata: { planId: invalidPlan }, items: { data: [{ price: { id: "price_fixture_inline" } }] },
      }));
      const before = await snapshot();
      await assert.rejects(subject.currentSubscription(event("sub_incoming")), invalidPlan === "lifetime" ? /cannot grant lifetime/ : /unsupported subscription plan/);
      assert.deepEqual(await snapshot(), before);
    });
  }
  await t.test("mismatched provider subscription or customer identity is rejected before SQL mutation", async () => {
    await reset({ current: "sub_current", tier: "monthly" });
    const before = await snapshot();
    fixture.rows.set("sub_incoming", subscription("sub_other"));
    await assert.rejects(subject.currentSubscription(event("sub_incoming")), /identity does not match/);
    assert.deepEqual(await snapshot(), before);
    fixture.rows.set("sub_incoming", subscription("sub_incoming"));
    fixture.rows.set("sub_current", subscription("sub_current", { customer: "cus_foreign", created: 100 }));
    await assert.rejects(subject.currentSubscription(event("sub_incoming")), /does not match the linked customer/);
    assert.deepEqual(await snapshot(), before);
  });
  for (const race of ["newer pointer", "lifetime upgrade"]) {
    await t.test(`concurrent ${race} during provider refresh wins over a stale admission`, async () => {
      await reset({ current: "sub_current", tier: "monthly" });
      const reached = barrier(), finish = barrier();
      fixture.beforeRetrieve = async id => {
        if (id === "sub_current") { reached.release(); await finish.promise; }
      };
      const pending = subject.currentSubscription(event("sub_incoming"));
      await reached.promise;
      try {
        if (race === "newer pointer") await pool.query("UPDATE users SET stripe_subscription_id='sub_concurrent' WHERE id='owner'");
        else await pool.query("UPDATE users SET subscription_tier='lifetime' WHERE id='owner'");
      } finally { finish.release(); }
      const concurrent = await snapshot();
      assert.equal(await pending, null, "lost compare-and-swap must not return a stale grant candidate");
      assert.deepEqual(await snapshot(), concurrent);
    });
  }
});
