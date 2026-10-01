import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  commerceEngineFixture,
  loadOutboundSubject,
  operation,
} from "./helpers-outbound-isolated.mjs";

test("Stripe commerce provider uses immutable transfer/refund/reversal keys and Connect-scoped payout calls", async () => {
  const requests = [];
  let transferAlreadyExists = true;
  let refundLists = 0;
  const sdk = {
    transfers: {
      list: (params) => ({
        async *[Symbol.asyncIterator]() {
          if (transferAlreadyExists) {
            yield { id: "tr_recovered", metadata: { commerceOperation: params.transfer_group } };
          }
        },
      }),
      create: async (payload, options) => {
        requests.push({ method: "transfer.create", payload, options });
        return { id: "tr_created" };
      },
      listReversals: (id) => ({
        async *[Symbol.asyncIterator]() { assert.equal(id, "tr_created"); },
      }),
      createReversal: async (...args) => {
        requests.push({ method: "transfer.reverse", args });
        return { id: "trr_created" };
      },
    },
    payouts: {
      list: (params, options) => {
        requests.push({ method: "payout.list", params, options });
        return { async *[Symbol.asyncIterator]() {} };
      },
      create: async (payload, options) => {
        requests.push({ method: "payout.create", payload, options });
        return { id: "po_created", status: "pending" };
      },
      retrieve: async (id, options) => {
        requests.push({ method: "payout.retrieve", id, options });
        return { id, status: "paid" };
      },
    },
    refunds: {
      list: (params) => ({
        async *[Symbol.asyncIterator]() {
          refundLists += 1;
          if (refundLists === 1) {
            yield { id: "re_unrelated", metadata: { commerceOperation: "different" } };
          } else {
            assert.deepEqual(params, { payment_intent: "pi_source", limit: 100 });
            yield { status: "succeeded", amount: 2500 };
            yield { status: "requires_action", amount: 500 };
            yield { status: "failed", amount: 100 };
          }
        },
      }),
      create: async (payload, options) => {
        requests.push({ method: "refund.create", payload, options });
        return { id: "re_created", status: "pending", charge: "ch_source" };
      },
      retrieve: async (id) => ({ id, status: "succeeded", charge: null }),
    },
  };
  const { StripeCommerceProvider } = await loadOutboundSubject("server/services/commerce/provider.ts", {
    stripe: "export default class Stripe {}",
  });
  const provider = new StripeCommerceProvider(sdk);

  const transferOp = operation();
  assert.equal(await provider.transfer(transferOp), "tr_recovered");
  assert.equal(requests.length, 0, "recovery must happen before creating a second transfer");
  transferAlreadyExists = false;
  assert.equal(await provider.transfer(transferOp), "tr_created");
  assert.deepEqual(requests[0], {
    method: "transfer.create",
    payload: {
      amount: 9000, currency: "usd", destination: "acct_seller",
      transfer_group: "op_outbound_1", metadata: { commerceOperation: "op_outbound_1" },
    },
    options: { idempotencyKey: "commerce:op_outbound_1:transfer" },
  });

  const payout = await provider.payout(transferOp);
  assert.deepEqual(payout, { id: "po_created", status: "pending" });
  const list = requests.find((request) => request.method === "payout.list");
  assert.deepEqual(list.params, {
    limit: 100,
    created: { gte: Math.floor(new Date(transferOp.created_at).getTime() / 1000) - 60 },
  });
  assert.deepEqual(list.options, { stripeAccount: "acct_seller" });
  assert.deepEqual(requests.find((request) => request.method === "payout.create"), {
    method: "payout.create",
    payload: {
      amount: 9000, currency: "usd", method: "standard",
      metadata: { commerceOperation: "op_outbound_1" },
    },
    options: { stripeAccount: "acct_seller", idempotencyKey: "commerce:op_outbound_1:bank" },
  });
  const retrieved = await provider.payout(operation({ provider_id: "po_prior" }));
  assert.deepEqual(retrieved, { id: "po_prior", status: "paid" });
  assert.deepEqual(requests.find((request) => request.method === "payout.retrieve"), {
    method: "payout.retrieve", id: "po_prior", options: { stripeAccount: "acct_seller" },
  });

  const refund = await provider.refund(operation({ kind: "refund", amount_cents: 3000 }));
  assert.deepEqual(refund, {
    id: "re_created", status: "pending", refundedCents: 2500, pendingCents: 500,
  });
  assert.deepEqual(requests.find((request) => request.method === "refund.create"), {
    method: "refund.create",
    payload: {
      payment_intent: "pi_source", amount: 3000,
      metadata: { commerceOperation: "op_outbound_1", orderId: "sale_1" },
    },
    options: { idempotencyKey: "commerce:op_outbound_1:refund" },
  });
  assert.equal(await provider.reverse(operation({
    kind: "reversal", payload: { transferId: "tr_created" },
  })), "trr_created");
  assert.deepEqual(requests.find((request) => request.method === "transfer.reverse").args, [
    "tr_created",
    { amount: 9000, metadata: { commerceOperation: "op_outbound_1" } },
    { idempotencyKey: "commerce:op_outbound_1:reversal" },
  ]);
});

test("CommerceEngine retains reservations on provider ambiguity and reverses before releasing failed bank payouts", async () => {
  const { CommerceEngine } = await loadOutboundSubject("server/services/commerce/engine.ts", {
    "./provider": "export type CommerceProvider = any;",
    "./repository": "export type CommerceRepository = any;",
  });
  const f = commerceEngineFixture();
  let transferAttempt = 0;
  f.provider.transfer = async (op) => {
    assert.equal(op.id, "op_outbound_1");
    if (transferAttempt++ === 0) throw new Error("provider response lost");
    return "tr_recovered";
  };
  const engine = new CommerceEngine(f.repository, f.provider);
  await assert.rejects(engine.execute("op_outbound_1"), /response lost/);
  assert.equal(f.op.state, "retry");
  assert.equal(f.calls.some(([name]) => name === "release"), false);
  await engine.execute("op_outbound_1");
  assert.equal(f.op.transfer_id, "tr_recovered");
  assert.equal(f.op.state, "awaiting");
  assert.equal(f.calls.filter(([name]) => name === "transfer").length, 0);

  const failing = commerceEngineFixture();
  failing.provider.payout = async () => ({ id: "po_failed", status: "failed" });
  failing.provider.reverse = async () => { throw new Error("insufficient Connect balance"); };
  const failingEngine = new CommerceEngine(failing.repository, failing.provider);
  await assert.rejects(failingEngine.execute("op_outbound_1"), /insufficient Connect balance/);
  assert.equal(failing.op.state, "retry");
  assert.equal(failing.calls.some(([name]) => name === "release"), false);
  failing.provider.reverse = async () => { failing.calls.push(["reverse"]); return "trr_done"; };
  await failingEngine.execute("op_outbound_1");
  assert.equal(failing.op.state, "cancelled");
  assert.ok(failing.calls.findIndex(([name]) => name === "reverse") < failing.calls.findIndex(([name]) => name === "release"));
});

test("CommerceEngine blocks unpaid sources and applies successful refund compensation only after provider confirmation", async () => {
  const { CommerceEngine } = await loadOutboundSubject("server/services/commerce/engine.ts", {
    "./provider": "export type CommerceProvider = any;",
    "./repository": "export type CommerceRepository = any;",
  });
  const pending = commerceEngineFixture();
  pending.sources.push({ refund_pending: true });
  const pendingEngine = new CommerceEngine(pending.repository, pending.provider);
  await pendingEngine.execute("op_outbound_1");
  assert.equal(pending.op.state, "cancelled");
  assert.equal(pending.calls.some(([name]) => name === "transfer"), false);

  const refund = commerceEngineFixture("refund");
  refund.provider.refund = async () => ({
    id: "re_succeeded", status: "succeeded", refundedCents: 4000, pendingCents: 0,
  });
  const refundEngine = new CommerceEngine(refund.repository, refund.provider);
  await refundEngine.execute("op_outbound_1");
  assert.equal(refund.op.state, "completed");
  assert.deepEqual(refund.calls.find(([name]) => name === "compensate"), [
    "compensate", "sale_1", 4000, 0, 0,
  ]);

  const noConfirmedRefund = commerceEngineFixture("refund");
  noConfirmedRefund.provider.refund = async () => ({
    id: "re_pending", status: "pending", pendingCents: 1200,
  });
  await new CommerceEngine(noConfirmedRefund.repository, noConfirmedRefund.provider).execute("op_outbound_1");
  assert.equal(noConfirmedRefund.op.state, "awaiting");
  assert.equal(noConfirmedRefund.calls.some(([name]) => name === "compensate"), false);
});

test("requestCommercePayout requires verified Connect capability and binds the durable request to the account", async () => {
  let connectedAccount = { id: "acct_seller", payouts_enabled: false, capabilities: { transfers: "active" } };
  const calls = [];
  globalThis.__outboundPayoutRepo = {
    reserve: async (...args) => { calls.push(["reserve", ...args]); return { id: "wd_1", state: "pending" }; },
    get: async () => ({ id: "wd_1", state: "awaiting", provider_id: "po_1" }),
  };
  globalThis.__outboundPayoutStripe = {
    accounts: { retrieve: async (id) => { calls.push(["account", id]); return connectedAccount; } },
  };
  globalThis.__outboundPayoutEngine = { execute: async (id) => calls.push(["execute", id]) };
  const payouts = await loadOutboundSubject("server/services/commerce/payouts.ts", {
    "../../db": "export const pool={query:async()=>({rows:[{stripe_connected_account_id:'acct_seller'}]})};",
    "./runtime": "export const commerceRepository=globalThis.__outboundPayoutRepo;export const commerceStripe=()=>globalThis.__outboundPayoutStripe;export const commerceEngine=()=>globalThis.__outboundPayoutEngine;",
    "./contract": "export const minorUnits=(amount,currency)=>Math.round(amount*(currency==='jpy'?1:100));export const majorUnits=(amount,currency)=>amount/(currency==='jpy'?1:100);",
  });
  await assert.rejects(payouts.requestCommercePayout("seller", 90, "usd", "request-1"), /capability is incomplete/);
  assert.equal(calls.some(([name]) => name === "reserve"), false);
  connectedAccount = { id: "acct_seller", payouts_enabled: true, capabilities: { transfers: "active" } };
  const result = await payouts.requestCommercePayout("seller", 90, "USD", "request-1");
  assert.equal(result.stripePayoutId, "po_1");
  assert.deepEqual(calls.find(([name]) => name === "reserve"), [
    "reserve", "seller", 9000, "usd", "request-1", "acct_seller",
  ]);
  assert.deepEqual(calls.find(([name]) => name === "execute"), ["execute", "wd_1"]);
});

test("verifiedPayment requires succeeded exact-currency provider settlement and separates pending from completed refunds", async () => {
  let pi = {
    status: "succeeded", amount_received: 10000, currency: "usd",
    latest_charge: { id: "ch_1", disputed: false, balance_transaction: { amount: 10000, currency: "usd", fee: 320 } },
  };
  globalThis.__outboundVerifyStripe = {
    paymentIntents: { retrieve: async (_id, options) => {
      assert.deepEqual(options, { expand: ["latest_charge.balance_transaction"] });
      return pi;
    } },
    refunds: { list: () => ({ async *[Symbol.asyncIterator]() {
      yield { status: "succeeded", amount: 2000 };
      yield { status: "pending", amount: 1000 };
      yield { status: "failed", amount: 500 };
    } }) },
  };
  const { verifiedPayment } = await loadOutboundSubject("server/services/commerce/verification.ts", {
    "./runtime": "export const commerceStripe=()=>globalThis.__outboundVerifyStripe;",
  });
  assert.deepEqual(await verifiedPayment("pi_1", 10000, "usd"), {
    processingFeeCents: 320, refundedCents: 2000, pendingCents: 1000, chargeId: "ch_1", disputed: false,
  });
  for (const invalid of [
    { ...pi, status: "processing" },
    { ...pi, amount_received: 9999 },
    { ...pi, currency: "eur" },
    { ...pi, latest_charge: { id: "ch_1", balance_transaction: { amount: 10000, currency: "eur", fee: 300 } } },
    { ...pi, latest_charge: { id: "ch_1", balance_transaction: null } },
  ]) {
    pi = invalid;
    await assert.rejects(verifiedPayment("pi_1", 10000, "usd"));
  }
});

test("royalty funding accepts only finalized statements with exact settled top-up net and excludes marketplace cash", async () => {
  let statement = {
    statement_id: "st_1", user_id: "artist", currency: "usd", payable_cents: 7500,
    details: { status: "finalized", lineItems: [{ source: "dsp" }] },
  };
  let topup = { status: "succeeded", balance_transaction: { currency: "usd", net: 7500 } };
  const bookings = [];
  globalThis.__outboundRoyaltyDb = { query: async () => ({ rows: [statement] }) };
  globalThis.__outboundRoyaltyRuntime = {
    commerceStripe: () => ({
      topups: { retrieve: async () => topup },
      balanceTransactions: { retrieve: async () => topup.balance_transaction },
    }),
    commerceRepository: { book: async (sale) => bookings.push(sale) },
  };
  const statements = await loadOutboundSubject("server/services/commerce/statements.ts", {
    "../../db": "export const pool=globalThis.__outboundRoyaltyDb;",
    "./runtime": "export const {commerceStripe,commerceRepository}=globalThis.__outboundRoyaltyRuntime;",
    "./contract": "export const minorUnits=(amount)=>Math.round(amount*100);",
  });
  await statements.fundRoyaltyStatement("st_1", "tu_1");
  assert.deepEqual(bookings[0], {
    id: "statement:st_1", kind: "royalty", paymentIntent: null, currency: "usd",
    grossCents: 7500, feeCents: 0, allocations: [{ userId: "artist", cents: 7500 }],
    metadata: { statementId: "st_1", topupId: "tu_1" },
  });
  topup = { ...topup, status: "pending" };
  await assert.rejects(statements.fundRoyaltyStatement("st_1", "tu_1"), /has not settled/);
  topup = { status: "succeeded", balance_transaction: { currency: "usd", net: 7499 } };
  await assert.rejects(statements.fundRoyaltyStatement("st_1", "tu_1"), /exactly match/);
  topup = { status: "succeeded", balance_transaction: { currency: "eur", net: 7500 } };
  await assert.rejects(statements.fundRoyaltyStatement("st_1", "tu_1"), /exactly match/);
  statement = { ...statement, details: { status: "draft", lineItems: [] } };
  await assert.rejects(statements.fundRoyaltyStatement("st_1", "tu_1"), /finalized/);
  statement = { ...statement, details: { status: "finalized", lineItems: [{ platform: "marketplace" }] } };
  await assert.rejects(statements.fundRoyaltyStatement("st_1", "tu_1"), /already allocated/);
  assert.equal(bookings.length, 1);
});

test("payout webhook verifies Connect account ownership before resuming the operation", async () => {
  const calls = [];
  globalThis.__outboundPayoutEventRepo = {
    get: async () => ({ id: "wd_1", state: "awaiting", payload: { accountId: "acct_owner" } }),
    bankReturned: async () => "pending",
  };
  globalThis.__outboundPayoutEventEngine = { execute: async (id) => calls.push(id) };
  globalThis.__outboundPayoutEventStripe = {
    payouts: { retrieve: async () => ({ status: "failed" }) },
  };
  const payouts = await loadOutboundSubject("server/services/commerce/payouts.ts", {
    "../../db": "export const pool={query:async()=>({rows:[]})};",
    "./runtime": "export const commerceRepository=globalThis.__outboundPayoutEventRepo;export const commerceEngine=()=>globalThis.__outboundPayoutEventEngine;export const commerceStripe=()=>globalThis.__outboundPayoutEventStripe;",
    "./contract": "export const minorUnits=()=>0,majorUnits=()=>0;",
  });
  const event = { type: "payout.paid", account: "acct_intruder", data: { object: { id: "po_1", metadata: { commerceOperation: "wd_1" } } } };
  await assert.rejects(payouts.handleCommercePayoutEvent(event), /connected account/);
  assert.deepEqual(calls, []);
  event.account = "acct_owner";
  assert.equal(await payouts.handleCommercePayoutEvent(event), true);
  assert.deepEqual(calls, ["wd_1"]);
});