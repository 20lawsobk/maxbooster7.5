import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadOutboundSubject, operation } from "./helpers-outbound-isolated.mjs";

test("StripeService refunds enforce buyer scope and pass validated exact cents and stable key to commerce", async () => {
  const refundCalls = [];
  const order = {
    id: "order_1", userId: "buyer_1", sellerId: "seller_1", amount: 25,
    currency: "usd", status: "completed", metadata: { amountCents: 2500 },
  };
  globalThis.__outboundRefundDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [order] }) }) }),
  };
  const { StripeService } = await loadOutboundSubject("server/services/stripeService.ts", {
    stripe: "export default class Stripe { constructor(){ return {}; } }",
    "./marketplaceService": "export const marketplaceService={};",
    "./commerce/compensation": "export async function initiateCommerceRefund(...args){globalThis.__outboundRefundCalls.push(args);return {success:true,refundId:'rf_1',status:'awaiting'};}",
    "../storage": "export const storage={};",
    "./stripeSetup.js": "export const getStripePriceIds=()=>({});",
    "../logger.js": "export const logger={warn(){},info(){},error(){}};",
    "./externalServices.js": "export function executeStripeOperation(){throw new Error('Unexpected provider call');}",
    "../db.js": "export const db=globalThis.__outboundRefundDb;",
    "@shared/schema": "export const users={},orders={},refunds={},ledgerEntries={},notifications={},taxForms={},listingStems={};",
    "drizzle-orm": "export const eq=()=>({}),and=()=>({}),desc=()=>({}),sql=()=>({});",
    "./instantPayoutService": "export const instantPayoutService={};",
    "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_test_isolated_marker'};",
    "../lib/envHelpers.js": "export const isProductionEnv=()=>false;",
  });
  globalThis.__outboundRefundCalls = refundCalls;
  const service = new StripeService();
  assert.equal((await service.createRefund({
    orderId: "order_1", userId: "intruder", amountCents: 1000, idempotencyKey: "refund-key",
  })).success, false);
  assert.equal((await service.createRefund({
    orderId: "order_1", userId: "buyer_1", amountCents: 0, idempotencyKey: "refund-key",
  })).success, false);
  assert.equal((await service.createRefund({
    orderId: "order_1", userId: "buyer_1", amountCents: 2501, idempotencyKey: "refund-key",
  })).success, false);
  assert.deepEqual(refundCalls, []);

  const result = await service.createRefund({
    orderId: "order_1", userId: "buyer_1", amountCents: 1250, idempotencyKey: "refund-key",
  });
  assert.deepEqual(result, { success: true, refundId: "rf_1", status: "awaiting" });
  assert.deepEqual(refundCalls, [["order_1", "buyer_1", 1250, "refund-key"]]);
});

test("refund request orchestration persists one idempotent operation and leaves failed execution retryable", async () => {
  const calls = [];
  let current = { id: "rf_intent", state: "pending", provider_id: undefined };
  globalThis.__outboundRefundOrchestration = {
    refundIntent: async (...args) => { calls.push(["intent", ...args]); return current; },
    get: async () => current,
  };
  globalThis.__outboundRefundPool = {
    query: async (sql, args) => { calls.push(["query", sql, args]); return { rows: [] }; },
  };
  globalThis.__outboundRefundEngine = {
    execute: async (id) => {
      calls.push(["execute", id]);
      current = { ...current, state: "retry", error: "temporary provider failure" };
      throw new Error("temporary provider failure");
    },
  };
  const { initiateCommerceRefund } = await loadOutboundSubject("server/services/commerce/compensation.ts", {
    "../../db": "export const pool=globalThis.__outboundRefundPool;",
    "../../safety/stripeWebhookSecurity": "export const registerWebhookHandler=()=>{};",
    "./runtime": "export const commerceRepository=globalThis.__outboundRefundOrchestration;export const commerceEngine=()=>globalThis.__outboundRefundEngine;export const commerceStripe=()=>({});",
    "../merchCheckoutService": "export async function applyVerifiedMerchPayment(){};",
  });
  await assert.rejects(initiateCommerceRefund("sale_1", "buyer", 1000, ""), /Idempotency-Key/);
  assert.equal(calls.length, 0);
  const response = await initiateCommerceRefund("sale_1", "buyer", 1000, "refund-key");
  assert.deepEqual(calls.find(([name]) => name === "intent"), [
    "intent", "sale_1", "buyer", 1000, "refund-key",
  ]);
  assert.ok(calls.some(([name, id]) => name === "execute" && id === "rf_intent"));
  assert.deepEqual(response, {
    success: true, refundId: "rf_intent", stripeRefundId: undefined, status: "retry",
  });
});

test("Connect onboarding creates an Express account with requested capabilities and exact return URLs", async () => {
  const saved = [];
  const user = { stripeConnectedAccountId: null, email: "artist@example.invalid" };
  const requests = [];
  globalThis.__outboundConnectStripe = {
    accounts: {
      create: async (payload) => { requests.push(["account", payload]); return { id: "acct_new" }; },
    },
    accountLinks: {
      create: async (payload) => { requests.push(["link", payload]); return { url: "https://connect.invalid/onboarding" }; },
    },
  };
  globalThis.__outboundConnectDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [user] }) }) }),
    update: () => ({ set: (changes) => ({ where: async () => { saved.push(changes); } }) }),
  };
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_isolated_marker";
  try {
    const { InstantPayoutService } = await loadOutboundSubject("server/services/instantPayoutService.ts", {
      stripe: "export default class Stripe { constructor(){ return globalThis.__outboundConnectStripe; } }",
      "../db": "export const db=globalThis.__outboundConnectDb;",
      "@shared/schema": "export const users={},instantPayouts={},notifications={},ledgerEntries={},splitPayments={};",
      "drizzle-orm": "export const eq=()=>({}),and=()=>({}),sql=()=>({}),desc=()=>({});",
      "../logger.js": "export const logger={info(){},warn(){},error(){}};",
      "../safety/auditLogger": "export const auditConfirmed=async()=>{};",
      "./commerce/runtime": "export const commerceRepository={},commerceEngine=()=>({});",
      "./commerce/payouts": "export const requestCommercePayout=async()=>({}),payOrderBeneficiaries=async()=>({});",
      "./commerce/readModels": "export const legacyReconciliation=async()=>({}),withdrawalView=()=>({}),commercePayoutReport=async()=>({});",
    });
    const service = new InstantPayoutService();
    assert.equal(await service.createAccountLink(
      "artist_1", "https://app.invalid/refresh", "https://app.invalid/complete",
    ), "https://connect.invalid/onboarding");
  } finally {
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
  assert.deepEqual(requests, [
    ["account", {
      type: "express",
      email: "artist@example.invalid",
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      settings: { payouts: { schedule: { interval: "manual" } } },
    }],
    ["link", {
      account: "acct_new",
      refresh_url: "https://app.invalid/refresh",
      return_url: "https://app.invalid/complete",
      type: "account_onboarding",
    }],
  ]);
  assert.equal(saved[0].stripeConnectedAccountId, "acct_new");
});

test("charge refund/dispute reconciliation sums provider states, releases won holds, and writes operation identities", async () => {
  const repoCalls = [];
  const poolCalls = [];
  globalThis.__outboundCompensationRepo = {
    sourceByPayment: async () => ({
      id: "sale_1", kind: "marketplace", disputed_cents: 5000, gross_cents: 10000,
      currency: "usd", metadata: { buyerId: "buyer", sellerId: "seller" },
    }),
    providerFee: async (...args) => repoCalls.push(["fee", ...args]),
    compensate: async (...args) => repoCalls.push(["compensate", ...args]),
  };
  globalThis.__outboundCompensationStripe = {
    charges: { retrieve: async () => ({ id: "ch_1", payment_intent: "pi_1", amount: 10000 }) },
    disputes: { retrieve: async () => ({
      id: "dp_1", status: "won", amount: 5000,
      balance_transactions: [{ id: "bt_dispute", fee: 25, currency: "usd" }],
    }) },
    refunds: { list: () => ({ async *[Symbol.asyncIterator]() {
      yield { id: "re_done", status: "succeeded", amount: 2500, currency: "usd", metadata: { commerceOperation: "rf_op" } };
      yield { id: "re_wait", status: "requires_action", amount: 1000, currency: "usd", metadata: {} };
      yield { id: "re_failed", status: "failed", amount: 500, currency: "usd", metadata: {} };
    } }) },
  };
  const { reconcileCharge } = await loadOutboundSubject("server/services/commerce/compensation.ts", {
    "../../db": "export const pool={query:async(sql,args)=>{globalThis.__outboundCompensationPoolCalls.push([sql,args]);return{rows:[]};}};",
    "../../safety/stripeWebhookSecurity": "export const registerWebhookHandler=()=>{};",
    "./runtime": "export const commerceRepository=globalThis.__outboundCompensationRepo,commerceEngine=()=>({}),commerceStripe=()=>globalThis.__outboundCompensationStripe;",
    "../merchCheckoutService": "export async function applyVerifiedMerchPayment(){};",
  });
  globalThis.__outboundCompensationPoolCalls = poolCalls;
  await reconcileCharge("ch_1", { id: "dp_1", status: "needs_response" });
  assert.deepEqual(repoCalls.find(([kind]) => kind === "compensate"), [
    "compensate", "sale_1", 2500, 0, 1000,
  ]);
  assert.deepEqual(repoCalls.find(([kind]) => kind === "fee"), [
    "fee", "bt_dispute", 25, "usd", "sale_1",
  ]);
  assert.ok(poolCalls.some(([sql, args]) =>
    sql.includes("UPDATE commerce_operations") && args[0] === "rf_op" && args[1] === "re_done" && args[2] === "completed",
  ));
  assert.ok(poolCalls.some(([sql, args]) => sql.includes("INSERT INTO refunds") && args[0] === "external:re_wait"));
});

test("actual webhook signature middleware preserves raw-byte signature boundary and rejects invalid, missing, or unconfigured signatures", async () => {
  const expectedRaw = Buffer.from('{"id":"evt_signed","type":"payout.paid"}');
  const event = { id: "evt_signed", type: "payout.paid", data: { object: { amount: 9000 } } };
  globalThis.__outboundWebhookEvent = event;
  globalThis.__outboundWebhookEnv = {
    STRIPE_WEBHOOK_SECRET: "whsec_isolated_marker",
    STRIPE_SECRET_KEY: "sk_test_isolated_marker",
  };
  const { stripeWebhookMiddleware, stripeRawBodyParser, getWebhookAuditLog } = await loadOutboundSubject(
    "server/safety/stripeWebhookSecurity.ts",
    {
      stripe: `export default class Stripe {
        constructor(){return {webhooks:{constructEvent(raw,signature,secret){
          if(!Buffer.isBuffer(raw)||!raw.equals(Buffer.from(${JSON.stringify(expectedRaw.toString())}))) throw new Error("wrong raw bytes");
          if(secret!=="whsec_isolated_marker"||signature!=="t=1,v1=valid") throw new Error("signature mismatch");
          return globalThis.__outboundWebhookEvent;
        }}};}
      }`,
      "../logger.js": "export const logger={info(){},warn(){},error(){}};",
      "../db": "export const pool={query:async()=>({rows:[]})};",
      "../config/env.js": "export const env=globalThis.__outboundWebhookEnv;",
      "./auditLogger": "export const audit=async()=>{};",
      "../services/commerceWebhookRepository": "export async function processCommerceEvent(){return {success:true,message:'stub'};}",
    },
  );
  const parsed = { path: "/api/webhooks/stripe" };
  stripeRawBodyParser(parsed, {}, expectedRaw, "utf8");
  let continued = false;
  const req = { headers: { "stripe-signature": "t=1,v1=valid" }, rawBody: parsed.rawBody };
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  stripeWebhookMiddleware(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.stripeEvent.id, "evt_signed");
  assert.equal(getWebhookAuditLog(1).at(-1).success, true);

  const invalid = { headers: { "stripe-signature": "bad" }, rawBody: expectedRaw };
  const invalidRes = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  stripeWebhookMiddleware(invalid, invalidRes, () => assert.fail("invalid signature must not continue"));
  assert.equal(invalidRes.statusCode, 401);
  assert.match(invalidRes.body.error, /verification failed/);
  const missingSignature = { headers: {}, rawBody: expectedRaw };
  const missingSignatureRes = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  stripeWebhookMiddleware(missingSignature, missingSignatureRes, () => assert.fail("missing signature must not continue"));
  assert.equal(missingSignatureRes.statusCode, 400);
  const missingBody = { headers: { "stripe-signature": "t=1,v1=valid" } };
  const missingRes = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  stripeWebhookMiddleware(missingBody, missingRes, () => assert.fail("missing raw body must not continue"));
  assert.equal(missingRes.statusCode, 401);
  globalThis.__outboundWebhookEnv.STRIPE_WEBHOOK_SECRET = "";
  const unconfiguredRes = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  stripeWebhookMiddleware({ headers: {}, rawBody: expectedRaw }, unconfiguredRes, () => assert.fail("unconfigured verifier must not continue"));
  assert.equal(unconfiguredRes.statusCode, 500);
});

test("webhook receipt transaction retries failed settlement and ignores a successfully replayed duplicate", async () => {
  const inbox = new Map();
  const receipts = new Set();
  const fakePool = {
    async query(sql, args = []) {
      if (sql.startsWith("INSERT INTO commerce_webhook_inbox")) {
        if (!inbox.has(args[0])) inbox.set(args[0], { state: "pending", type: args[1], payload: args[2] });
        return { rows: [] };
      }
      if (sql.startsWith("SELECT event_id FROM commerce_webhook_receipts")) {
        return { rows: receipts.has(args[0]) ? [{ event_id: args[0] }] : [] };
      }
      if (sql.startsWith("UPDATE commerce_webhook_inbox SET state='running'")) {
        const current = inbox.get(args[0]);
        if (!current || current.state === "completed") return { rows: [] };
        current.state = "running";
        current.token = args[1];
        return { rows: [{ event_id: args[0] }] };
      }
      if (sql.startsWith("UPDATE commerce_webhook_inbox SET state='retry'")) {
        const current = inbox.get(args[0]);
        if (current) { current.state = "retry"; current.error = args[2]; }
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE commerce_webhook_inbox SET lease_until")) return { rows: [] };
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, args = []) {
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
          if (sql.startsWith("UPDATE commerce_webhook_inbox SET state='completed'")) {
            const current = inbox.get(args[0]);
            if (!current || current.token !== args[1]) return { rows: [] };
            current.state = "completed";
            return { rows: [{ event_id: args[0] }] };
          }
          if (sql.startsWith("INSERT INTO commerce_webhook_receipts")) {
            receipts.add(args[0]);
            return { rows: [{ event_id: args[0] }] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  globalThis.__outboundWebhookPool = fakePool;
  const { handleWebhookEvent, registerWebhookHandler, stripeWebhookMiddleware } = await loadOutboundSubject(
    "server/safety/stripeWebhookSecurity.ts",
    {
      stripe: `export default class Stripe {
        constructor(){return {webhooks:{constructEvent(_raw,signature){
          if(signature!=="valid") throw new Error("invalid");
          return globalThis.__outboundWebhookIncoming;
        }}};}
      }`,
      "../logger.js": "export const logger={info(){},warn(){},error(){}};",
      "../db": "export const pool=globalThis.__outboundWebhookPool;",
      "../config/env.js": "export const env={STRIPE_WEBHOOK_SECRET:'whsec_isolated',STRIPE_SECRET_KEY:'sk_test_isolated'};",
      "./auditLogger": "export const audit=async()=>{};",
    },
  );

  let verificationFails = true;
  let bookings = 0;
  const order = {
    id: "order_webhook", listingId: "listing", sellerId: "seller", userId: "buyer",
    amount: 100, currency: "usd", status: "pending", stripePaymentIntentId: "pi_webhook",
    metadata: { amountCents: 10000, settlementTerms: {
      version: 1, grossCents: 10000, feeCents: 1000, currency: "usd",
      allocations: [{ userId: "seller", cents: 9000 }],
    } },
  };
  let bookedPaymentIntent;
  globalThis.__outboundWebhookSettlementRepo = {
    sourceByPayment: async (paymentIntent) => bookedPaymentIntent === paymentIntent ? { id: order.id } : null,
    book: async (sale) => { bookings += 1; bookedPaymentIntent = sale.paymentIntent; },
    compensate: async () => {},
  };
  const { bookMarketplace } = await loadOutboundSubject("server/services/commerce/settlement.ts", {
    "../../db": "export const pool={query:async()=>({rows:[]})};",
    "./runtime": "export const commerceRepository=globalThis.__outboundWebhookSettlementRepo;",
    "./verification": `export async function verifiedPayment(){
      if(globalThis.__outboundWebhookVerificationFails) throw new Error("provider payment not settled");
      return {processingFeeCents:300,refundedCents:0,pendingCents:0,disputed:false};
    }`,
  });
  globalThis.__outboundWebhookVerificationFails = verificationFails;
  registerWebhookHandler("checkout.session.completed", async () => {
    await bookMarketplace(order);
    return { success: true, message: "settled" };
  });
  const webhook = { id: "evt_retry_then_settle", type: "checkout.session.completed", data: { object: {} } };
  globalThis.__outboundWebhookIncoming = webhook;
  const request = { headers: { "stripe-signature": "valid" }, rawBody: Buffer.from("raw") };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  stripeWebhookMiddleware(request, response, () => {});
  assert.equal((await handleWebhookEvent(request.stripeEvent)).success, false);
  assert.equal(bookings, 0);
  assert.equal(receipts.has(webhook.id), false, "failed settlement must not commit a receipt");

  verificationFails = false;
  globalThis.__outboundWebhookVerificationFails = verificationFails;
  assert.deepEqual(await handleWebhookEvent(webhook), { success: true, message: "settled" });
  assert.equal(bookings, 1);
  assert.equal(receipts.has(webhook.id), true);
  assert.deepEqual(await handleWebhookEvent(webhook), { success: true, message: "Event already processed" });
  assert.equal(bookings, 1, "duplicate delivery must not settle twice");

  const wrongAmount = {
    ...order,
    stripePaymentIntentId: "pi_other",
    metadata: { ...order.metadata, settlementTerms: { ...order.metadata.settlementTerms, grossCents: 1 } },
  };
  await assert.rejects(bookMarketplace(wrongAmount), /Invalid checkout settlement terms/);
  assert.equal(bookings, 1);
});

test("repository payout idempotency cannot silently move a reserved withdrawal to a different Connect account", async () => {
  const operations = new Map();
  const allocation = {
    id: "sale_1:seller", source_id: "sale_1", amount_cents: 10000,
    reversed_cents: 0, drawn_cents: 0, currency: "usd",
  };
  const client = {
    async query(sql, params = []) {
      if (sql.startsWith("SELECT * FROM commerce_operations WHERE id=$1")) {
        return { rows: operations.has(params[0]) ? [{ ...operations.get(params[0]) }] : [] };
      }
      if (sql.startsWith("SELECT COALESCE(sum(e.amount_cents)")) return { rows: [{ cents: "10000" }] };
      if (sql.startsWith("SELECT count(*) FILTER")) return { rows: [{ daily_count: 0, daily: "0", weekly: "0" }] };
      if (sql.startsWith("SELECT created_at FROM users")) {
        return { rows: [{ created_at: new Date(Date.now() - 45 * 86400000).toISOString() }] };
      }
      if (sql.startsWith("SELECT count(*)::int AS count FROM commerce_allocations")) return { rows: [{ count: 0 }] };
      if (sql.startsWith("INSERT INTO commerce_operations")) {
        const [id, user_id, currency, amount_cents, payload] = params;
        operations.set(id, { id, user_id, currency, amount_cents, state: "pending", payload: JSON.parse(payload) });
        return { rows: [] };
      }
      if (sql.startsWith("SELECT a.* FROM commerce_allocations")) return { rows: [{ ...allocation }] };
      if (sql.startsWith("SELECT * FROM commerce_operations WHERE id=$1")) {
        return { rows: operations.has(params[0]) ? [{ ...operations.get(params[0]) }] : [] };
      }
      return { rows: sql.startsWith("INSERT INTO commerce_journals") ? [{ id: params[0] }] : [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, query: client.query.bind(client) };
  const { CommerceRepository } = await loadOutboundSubject("server/services/commerce/repository.ts", {});
  const repository = new CommerceRepository(pool);
  const original = await repository.reserve("seller", 1000, "usd", "same-key", "acct_first");
  assert.equal(original.payload.accountId, "acct_first");

  // A changed Connect destination under the same durable idempotency key must
  // be rejected, not return an operation permanently pointed at the prior user.
  await assert.rejects(
    repository.reserve("seller", 1000, "usd", "same-key", "acct_second"),
    /account|Connect|destination/i,
  );
  assert.equal(operations.size, 1);
});

test("refund provider failure preserves the same operation key for retry", async () => {
  const { StripeCommerceProvider } = await loadOutboundSubject("server/services/commerce/provider.ts", {
    stripe: "export default class Stripe {}",
  });
  const calls = [];
  let attempt = 0;
  const sdk = {
    refunds: {
      list: () => ({ async *[Symbol.asyncIterator]() {} }),
      create: async (payload, options) => {
        calls.push({ payload, options });
        if (attempt++ === 0) throw new Error("provider unavailable");
        return { id: "re_retry", status: "pending", charge: null };
      },
    },
  };
  const provider = new StripeCommerceProvider(sdk);
  const refundOp = operation({ id: "refund_durable", kind: "refund", amount_cents: 2500 });
  await assert.rejects(provider.refund(refundOp), /provider unavailable/);
  assert.deepEqual(await provider.refund(refundOp), {
    id: "re_retry", status: "pending", refundedCents: undefined, pendingCents: 0,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].options.idempotencyKey, "commerce:refund_durable:refund");
});