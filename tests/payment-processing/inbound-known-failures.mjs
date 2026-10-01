/**
 * Regression assertions for previously confirmed payment-processing defects.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  loadBillingRoutes,
  loadIsolated,
  loadIsolatedClosed,
  routeHarness,
  responseHarness,
  loggerStub,
  drizzleStub,
} from "./helpers-inbound.mjs";

function memoryCommercePool(orderWrites = []) {
  const operations = new Map();
  let lockTail = Promise.resolve();
  const acquireLock = async () => {
    let unlock;
    const turn = new Promise(resolve => { unlock = resolve; });
    const previous = lockTail;
    lockTail = previous.then(() => turn);
    await previous;
    return unlock;
  };
  const readOperation = id => {
    const row = operations.get(id);
    return row ? [{ ...row, payload: structuredClone(row.payload) }] : [];
  };
  const pool = {
    async query(sql, params = []) {
      if (/SELECT .*FROM commerce_operations WHERE id=\$1/.test(sql)) {
        return { rows: readOperation(params[0]) };
      }
      throw new Error(`Unexpected pool query in test: ${sql}`);
    },
    async connect() {
      let releaseLock;
        let operationSnapshot;
        let orderWriteCount = 0;
      return {
        async query(sql, params = []) {
          if (sql === "BEGIN") {
            releaseLock = await acquireLock();
            operationSnapshot = structuredClone([...operations.entries()]);
            orderWriteCount = orderWrites.length;
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            operationSnapshot = undefined;
            releaseLock?.();
            releaseLock = undefined;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            if (operationSnapshot) {
              operations.clear();
              for (const [id, row] of operationSnapshot) operations.set(id, row);
            }
            orderWrites.splice(orderWriteCount);
            operationSnapshot = undefined;
            releaseLock?.();
            releaseLock = undefined;
            return { rows: [] };
          }
          if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
            return { rows: [] };
          }
          if (/SELECT .*FROM commerce_operations WHERE id=\$1/.test(sql)) {
            return { rows: readOperation(params[0]) };
          }
          if (sql.includes("INSERT INTO commerce_operations")) {
            const [id, kind, userId, currency, amountCents, payload] = params;
            operations.set(id, {
              id,
              kind,
              user_id: userId,
              currency,
              amount_cents: amountCents,
              state: "checkout_creating",
              payload: JSON.parse(payload),
              created_at: new Date(),
              provider_id: null,
            });
            return { rows: [] };
          }
          if (sql.includes("UPDATE commerce_operations")) {
            const [id, providerId, result, kind, userId] = params;
            const row = operations.get(id);
            if (row?.kind === kind && row.user_id === userId && row.state === "checkout_creating") {
              row.state = "checkout_ready";
              row.provider_id = providerId;
              row.payload = { ...row.payload, ...JSON.parse(result) };
              return { rows: [{ id }] };
            }
            return { rows: [] };
          }
          if (sql.includes("INSERT INTO storefront_orders")) {
            if (pool.failNextOrderInsert) {
              pool.failNextOrderInsert = false;
              throw new Error("simulated order persistence failure");
            }
            orderWrites.push({ sql, params });
            return { rows: [] };
          }
          throw new Error(`Unexpected client query in test: ${sql}`);
        },
        release() {},
      };
    },
  };
  return pool;
}

test("billing checkout retries reuse the durable session for the same command", async () => {
  const routes = new Map();
  const creates = [];
  const user = { id: "retry-buyer", email: "retry@example.invalid", stripeCustomerId: "cus_retry" };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [user] }) }) }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  };
  const sessionsByKey = new Map();
  const stripe = { checkout: { sessions: {
    async create(params, options) {
      if (sessionsByKey.has(options?.idempotencyKey)) {
        return sessionsByKey.get(options.idempotencyKey);
      }
      const session = { id: `cs_retry_${creates.length + 1}`, url: "https://checkout.invalid/retry" };
      creates.push({ params, options });
      sessionsByKey.set(options?.idempotencyKey, session);
      return session;
    },
  } } };
  const pool = memoryCommercePool();
  await loadBillingRoutes({ routes, db, pool, stripe, stripeService: {} });
  const handler = routes.get("POST /create-checkout-session");
  const invoke = async () => {
    const res = responseHarness();
    await handler({
      body: { planId: "monthly" }, user,
      get: name => name === "Idempotency-Key" ? "same-billing-command" : undefined,
    }, res);
    assert.equal(res.statusCode, 200);
    return res;
  };
  const [first, second] = await Promise.all([invoke(), invoke()]);
  assert.equal(creates.length, 1, "same idempotency key must return/reuse the original Checkout operation");
  assert.match(creates[0].options?.idempotencyKey, /^commerce-checkout:checkout_/);
  assert.equal(second.body.sessionId, first.body.sessionId);
  const conflict = responseHarness();
  await handler({
    body: { planId: "yearly" }, user,
    get: name => name === "Idempotency-Key" ? "same-billing-command" : undefined,
  }, conflict);
  assert.equal(conflict.statusCode, 409, "a key reused for another plan must fail closed");
});

test("storefront cart retries reuse one session and one set of pending orders", async () => {
  const harness = routeHarness();
  const schema = { storefronts: {}, listings: {}, bogoPromotions: {}, storefrontOrders: {}, membershipTiers: {}, customerMemberships: {}, users: {} };
  const storefront = { id: "store-idempotency", userId: "seller-idempotency", slug: "idempotency-shop" };
  const listing = { id: "listing-idempotency", title: "Catalog listing", genre: "Pop", priceCents: 1500, isPublished: true };
  const writes = [];
  const state = { ...harness, router: harness.router, schema, storefront, listing, writes };
  state.db = {
    select() {
      return { from(table) {
        const query = {
          leftJoin() { return query; },
          where() { return query; },
          async limit() {
            if (table === schema.storefronts) return [storefront];
            if (table === schema.listings) return [listing];
            return [];
          },
        };
        return query;
      } };
    },
    insert(table) { return { values: async value => { writes.push({ table, value }); return []; } }; },
  };
  const creates = [];
  const sessionsByKey = new Map();
  state.stripe = { checkout: { sessions: { create: async (payload, options) => {
    if (sessionsByKey.has(options?.idempotencyKey)) return sessionsByKey.get(options.idempotencyKey);
    const session = { id: `cs_store_retry_${creates.length + 1}`, url: "https://checkout.invalid/store-retry" };
    creates.push({ payload, options, session });
    sessionsByKey.set(options?.idempotencyKey, session);
    return session;
  } } } };
  state.pool = memoryCommercePool(writes);
  globalThis.__inboundStore = state;
  const schemaModule = `export const storefronts=globalThis.__inboundStore.schema.storefronts,listings=globalThis.__inboundStore.schema.listings,listingLicenseTiers={},bogoPromotions=globalThis.__inboundStore.schema.bogoPromotions,storefrontOrders=globalThis.__inboundStore.schema.storefrontOrders,membershipTiers=globalThis.__inboundStore.schema.membershipTiers,customerMemberships=globalThis.__inboundStore.schema.customerMemberships,users=globalThis.__inboundStore.schema.users;export const insertStorefrontSchema={},updateStorefrontSchema={},insertMembershipTierSchema={},updateMembershipTierSchema={},storefrontFollows={},storefrontLikes={},storefrontRatings={},storefrontDomains={};`;
  await loadIsolated("server/routes/storefront.ts", {
    express: "export const Router=()=>globalThis.__inboundStore.router;",
    "../middleware/uploadHandler.js": "export function createHardenedUpload(){const u=()=>{};u.single=()=>()=>{};u.array=()=>()=>{};u.fields=()=>()=>{};u.any=()=>()=>{};return u;}export async function storeUploadedFile(){return {};}",
    "../services/storefrontService": "export const storefrontService={};",
    "../services/hybridStorageService": "export const hybridStorageService={};",
    "@shared/schema": schemaModule,
    stripe: "export default class Stripe {constructor(){return globalThis.__inboundStore.stripe;}}",
    "../config/defaults": "export const getBaseUrl=()=> 'https://app.invalid';",
    "../db": "export const db=globalThis.__inboundStore.db,pool=globalThis.__inboundStore.pool;",
    "drizzle-orm": drizzleStub,
    zod: "export class ZodError extends Error{};export const z={};",
    "../logger.js": loggerStub,
    dns: "export default {promises:{}};",
    "../modules/domains/dnsValidators.js": "export function validateDomain(){return {valid:true};}",
    "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_test_contract_only',APP_URL:'https://app.invalid'};",
    "../config/storefrontUrls.js": "export const getStorefrontPathUrl=x=>x,STOREFRONT_APP_ORIGIN='https://app.invalid';",
  });
  const handler = harness.routes.get("POST /:id/checkout");
  const invoke = async (
    requestKey = "same-storefront-command",
    listingIds = [listing.id],
  ) => {
    const res = responseHarness();
    await handler({
      isAuthenticated: () => true,
      user: { id: "buyer-idempotency" },
      params: { id: storefront.id },
      body: { listingIds, licenseType: "basic" },
      get: name => name === "Idempotency-Key" ? requestKey : undefined,
    }, res);
    return res;
  };
  const [first, second] = await Promise.all([invoke(), invoke()]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(creates.length, 1, "same idempotency key must not create a second checkout session");
  assert.equal(writes.length, 1, "same cart command must not persist a second pending order");
  assert.equal(
    (await invoke("same-storefront-command", ["different-listing"])).statusCode,
    409,
    "a key reused for a different cart must fail closed",
  );
  assert.equal(
    (await invoke("new-storefront-command")).statusCode,
    200,
    "a new command key must permit a deliberate new purchase",
  );
  assert.equal(creates.length, 2);
  assert.equal(writes.length, 2);

  state.pool.failNextOrderInsert = true;
  assert.equal(
    (await invoke("post-provider-response-retry")).statusCode,
    500,
    "a database failure after Stripe creation must not be reported as success",
  );
  assert.equal(
    (await invoke("post-provider-response-retry")).statusCode,
    200,
    "retry must resume the same provider operation and finish order persistence",
  );
  assert.equal(creates.length, 3);
  assert.equal(writes.length, 3, "the resumed operation must persist each order only once");
});

test("beat purchase completion verifies the payment before recording a sale", async () => {
  const sales = [];
  globalThis.__inboundUnverifiedBeat = {
    async getBeat() { return { id: "beat-unverified", userId: "seller-unverified" }; },
    async createBeatSale(input) { const sale = { id: "sale_unpaid", ...input }; sales.push(sale); return sale; },
    async updateBeat() {},
  };
  const beatModule = await loadIsolatedClosed("server/services/beatService.ts", {
    "../storage": "export const storage=globalThis.__inboundUnverifiedBeat;",
    "./stripeService": "export const stripeService={async verifyBeatPurchaseIntent(){throw new Error('PaymentIntent is unpaid or does not match this beat purchase');}};",
    "../logger.js": loggerStub,
  });
  await assert.rejects(
    beatModule.beatService.completeBeatPurchase(
      "pi_never-paid", "beat-unverified", "buyer-unverified", "seller-unverified", "standard", 99,
    ),
    /PaymentIntent is unpaid/,
  );
  assert.equal(sales.length, 0, "sale fulfillment must not accept an arbitrary unverified PaymentIntent ID");
});

test("beat purchase completion grants a sale only with the verified charge amount", async () => {
  const sales = [];
  globalThis.__inboundPaidBeat = {
    async getBeat() { return { id: "beat-paid", userId: "seller-paid", isExclusiveSold: false }; },
    async createBeatSale(input) { const sale = { id: "sale_paid", ...input }; sales.push(sale); return sale; },
    async updateBeat() {},
  };
  const beatModule = await loadIsolatedClosed("server/services/beatService.ts", {
    "../storage": "export const storage=globalThis.__inboundPaidBeat;",
    "./stripeService": `export const stripeService={async verifyBeatPurchaseIntent(input){if(input.paymentIntentId!=="pi_paid"||input.amountCents!==9900)throw new Error("mismatch");return {paymentIntentId:input.paymentIntentId,amountCents:9900};}};`,
    "../logger.js": loggerStub,
  });
  const result = await beatModule.beatService.completeBeatPurchase(
    "pi_paid", "beat-paid", "buyer-paid", "seller-paid", "exclusive", 99,
  );
  assert.equal(sales.length, 1);
  assert.equal(sales[0].price, "99.00");
  assert.equal(result.success, true);
});

test("Stripe beat-payment verification rejects unpaid, mispriced, and misattributed intents", async () => {
  const baseIntent = {
    id: "pi_verified",
    status: "succeeded",
    amount_received: 4200,
    currency: "usd",
    metadata: {
      beatId: "beat-verified",
      buyerId: "buyer-verified",
      sellerId: "seller-verified",
      licenseType: "standard",
      amountCents: "4200",
    },
  };
  globalThis.__inboundBeatStripe = {
    paymentIntents: {
      async retrieve() { return structuredClone(baseIntent); },
      async create(params) { return { id: "pi_new", params }; },
    },
  };
  const stripeModule = await loadIsolatedClosed("server/services/stripeService.ts", {
    stripe: "export default class Stripe {constructor(){return globalThis.__inboundBeatStripe;}}",
    "./commercePolicy": "export function validateCustomerRefund(){}",
    "./commerce/compensation": "export async function initiateCommerceRefund(){}",
    "../storage": "export const storage={};",
    "./stripeSetup.js": "export function getStripePriceIds(){return {};}",
    "../logger.js": loggerStub,
    "./externalServices.js": "export async function executeStripeOperation(fn){return {data:await fn()};}",
    "../db.js": "export const db={};",
    "@shared/schema": "export const users={},orders={},refunds={},ledgerEntries={},notifications={},taxForms={};",
    "drizzle-orm": drizzleStub,
    "./instantPayoutService": "export const instantPayoutService={};",
    "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_test_contract_only'};",
    "../lib/envHelpers.js": "export function isProductionEnv(){return false;}",
  });
  const expected = {
    paymentIntentId: "pi_verified",
    beatId: "beat-verified",
    buyerId: "buyer-verified",
    sellerId: "seller-verified",
    licenseType: "standard",
    amountCents: 4200,
  };
  assert.deepEqual(
    await stripeModule.stripeService.verifyBeatPurchaseIntent(expected),
    { paymentIntentId: "pi_verified", amountCents: 4200 },
  );

  for (const change of [
    { status: "requires_action" },
    { amount_received: 4199 },
    { currency: "eur" },
    { metadata: { ...baseIntent.metadata, buyerId: "somebody-else" } },
    { metadata: { ...baseIntent.metadata, beatId: "another-beat" } },
    { metadata: { ...baseIntent.metadata, licenseType: "exclusive" } },
    { metadata: { ...baseIntent.metadata, sellerId: "another-seller" } },
  ]) {
    globalThis.__inboundBeatStripe.paymentIntents.retrieve = async () => ({
      ...baseIntent,
      ...change,
    });
    await assert.rejects(
      stripeModule.stripeService.verifyBeatPurchaseIntent(expected),
      /unpaid or does not match/,
    );
  }

  let createdIntent;
  globalThis.__inboundBeatStripe.paymentIntents.create = async params => {
    createdIntent = params;
    return { id: "pi_new" };
  };
  await stripeModule.stripeService.createBeatPurchaseIntent(
    "beat-verified", "buyer-verified", "standard", 42, "seller-verified",
  );
  assert.equal(createdIntent.metadata.sellerId, "seller-verified");
  assert.equal(createdIntent.metadata.amountCents, "4200");
});
