import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  loadIsolated,
  routeHarness,
  responseHarness,
  memoryCommercePool,
  loggerStub,
  schemaStub,
  drizzleStub,
} from "./helpers-inbound.mjs";

test("marketplace checkout freezes database pricing, metadata identity, and provider idempotency", async () => {
  let storedOrder;
  const calls = [];
  const dbPool = {
    async connect() {
      return {
        async query(sql, params = []) {
          calls.push({ sql, params });
          if (sql.includes("SELECT * FROM orders")) return { rows: storedOrder ? [storedOrder] : [] };
          if (sql.includes("INSERT INTO orders")) {
            storedOrder = {
              id: params[0], user_id: params[1], seller_id: params[2], listing_id: params[3],
              license_type: params[4], amount: params[5], currency: "usd", status: "pending",
              license_snapshot: params[6], metadata: params[7], created_at: new Date("2026-01-01"),
            };
            return { rows: [storedOrder] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT * FROM orders")) return { rows: storedOrder ? [storedOrder] : [] };
      if (sql.startsWith("UPDATE orders")) Object.assign(storedOrder.metadata, JSON.parse(params[1]));
      return { rows: [] };
    },
  };
  globalThis.__inboundMarketplacePool = dbPool;
  globalThis.__inboundTermsCalls = [];
  const { createMarketplaceCheckout, consumeMarketplaceCheckout } = await loadIsolated(
    "server/services/commerce/marketplaceCheckout.ts",
    {
      "../../db": "export const pool=globalThis.__inboundMarketplacePool;",
      "./settlement": "export async function snapshotMarketplaceTerms(input){globalThis.__inboundTermsCalls.push(input);return {version:2,sellerId:input.sellerId,listingId:input.listingId,grossCents:input.metadata.amountCents,feeCents:100};}",
      "./contract": "export function majorUnits(cents){return cents/100;}",
    },
  );
  const stripeCalls = { creates: [], lists: 0, retrieves: [] };
  const stripe = { checkout: { sessions: {
    async *list() { stripeCalls.lists++; },
    async retrieve(id) { stripeCalls.retrieves.push(id); return { id, status: "open", url: "https://checkout.invalid/reuse" }; },
    async create(payload, options) {
      stripeCalls.creates.push({ payload, options });
      return { id: "cs_market", status: "open", url: "https://checkout.invalid/market" };
    },
  } } };
  const input = {
    buyerId: "buyer", sellerId: "seller", beatId: "beat", licenseType: "basic",
    amountCents: 1299, licenseSnapshot: { granted: ["mp3"] }, title: "Beat",
    successUrl: "https://app.invalid/success", cancelUrl: "https://app.invalid/cancel",
  };
  const first = await createMarketplaceCheckout(stripe, input);
  assert.equal(first.url, "https://checkout.invalid/market");
  assert.equal(stripeCalls.creates.length, 1);
  const [{ payload, options }] = stripeCalls.creates;
  assert.equal(payload.line_items[0].price_data.unit_amount, 1299);
  assert.deepEqual(payload.metadata, payload.payment_intent_data.metadata);
  assert.deepEqual(payload.metadata, {
    commerceKind: "marketplace", commerceVersion: "1", orderId: storedOrder.id,
    buyerId: "buyer", sellerId: "seller", beatId: "beat", licenseType: "basic",
  });
  assert.match(options.idempotencyKey, /^marketplace:.+:checkout:v1$/);
  assert.deepEqual(globalThis.__inboundTermsCalls[0].metadata, { amountCents: 1299 });
  assert.equal(storedOrder.metadata.settlementTerms.grossCents, 1299);

  storedOrder.metadata.sessionId = "cs_market";
  await createMarketplaceCheckout(stripe, input);
  assert.deepEqual(stripeCalls.retrieves, ["cs_market"]);
  const providerCallsBefore = JSON.stringify(stripeCalls);
  storedOrder.metadata.settlementTerms = {
    version:1,grossCents:1299,feeCents:100,currency:"usd",
    allocations:[{userId:"attacker",cents:1199}],
  };
  await assert.rejects(createMarketplaceCheckout(stripe,input),/authorization reconciliation/);
  assert.equal(JSON.stringify(stripeCalls),providerCallsBefore,"unsafe legacy orders must not reach Stripe");
  assert.equal(stripeCalls.creates.length, 1);
  await assert.rejects(createMarketplaceCheckout(stripe, { ...input, buyerId: "seller" }), /own beat/);
  await assert.rejects(createMarketplaceCheckout(stripe, { ...input, amountCents: 0 }), /Invalid checkout amount/);

  const paid = {
    id: "cs_market", status: "complete", payment_status: "paid", amount_total: 1299,
    currency: "usd", payment_intent: "pi_market", metadata: payload.metadata,
  };
  const fulfilled = [];
  assert.equal(await consumeMarketplaceCheckout(paid, async (...args) => fulfilled.push(args)), 1);
  assert.deepEqual(fulfilled, [[storedOrder.id, "pi_market"]]);
  for (const invalid of [
    { ...paid, payment_status: "unpaid" },
    { ...paid, amount_total: 1298 },
    { ...paid, metadata: { ...paid.metadata, buyerId: "attacker" } },
    { ...paid, currency: "eur" },
  ]) {
    await assert.rejects(consumeMarketplaceCheckout(invalid, async () => assert.fail("must not fulfill")), /match its frozen order/);
  }
  await assert.rejects(consumeMarketplaceCheckout({ ...paid, metadata: {} }, async () => {}), /reconciliation/);
});

test("merchant checkout enforces buyer ownership, trusts reserved cents, and settles only paid matching sessions", async () => {
  const order = {
    id: "merchant-order", buyer_id: "buyer", seller_id: "seller", listing_id: "item",
    amount_cents: 4500, currency: "usd", status: "pending", created_at: new Date("2026-02-01"),
    stripe_session_id: null,
  };
  const queries = [];
  const pool = { async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.startsWith("SELECT *")) return { rows: [order] };
    if (sql.startsWith("UPDATE")) order.stripe_session_id = params[1];
    return { rows: [] };
  } };
  const records = { booked: [], verified: [] };
  const stripe = { checkout: { sessions: {
    async *list() {},
    async create(payload, options) {
      records.create = { payload, options };
      return { id: "cs_merchant", status: "open", url: "https://checkout.invalid/merchant" };
    },
    async retrieve(id) { return { id, status: "open", url: "https://checkout.invalid/merchant" }; },
  } } };
  globalThis.__inboundMerchantPool = pool;
  globalThis.__inboundMerchantStripe = stripe;
  globalThis.__inboundMerchantRecords = records;
  const { createMerchantCheckout, settleMerchantCheckout } = await loadIsolated(
    "server/services/commerce/merchant.ts",
    {
      "../../db": "export const pool=globalThis.__inboundMerchantPool;",
      "./runtime": "export const commerceStripe=()=>globalThis.__inboundMerchantStripe;export const commerceRepository={book:async x=>globalThis.__inboundMerchantRecords.booked.push(x),compensate:async()=>{}};",
      "./verification": "export async function verifiedPayment(...x){globalThis.__inboundMerchantRecords.verified.push(x);return {processingFeeCents:120,refundedCents:0,pendingCents:0,disputed:false};}",
    },
  );
  await assert.rejects(createMerchantCheckout({ orderId: order.id, buyerId: "not-buyer", successUrl: "x", cancelUrl: "y", idempotencyKey: "k" }), /not available/);
  await assert.rejects(createMerchantCheckout({ orderId: order.id, buyerId: "buyer", successUrl: "x", cancelUrl: "y", idempotencyKey: "" }), /idempotency key/);
  const result = await createMerchantCheckout({ orderId: order.id, buyerId: "buyer", successUrl: "https://app.invalid/ok", cancelUrl: "https://app.invalid/no", idempotencyKey: "client-key" });
  assert.equal(result.sessionId, "cs_merchant");
  assert.equal(records.create.payload.line_items[0].price_data.unit_amount, 4500);
  assert.deepEqual(records.create.payload.metadata, records.create.payload.payment_intent_data.metadata);
  assert.deepEqual(records.create.payload.metadata, {
    commerceVersion: "2", commerceKind: "merchant", merchantOrderId: order.id,
    sellerId: "seller", buyerId: "buyer", platformFeeCents: "450",
  });
  assert.equal(records.create.options.idempotencyKey, `merchant:${order.id}:checkout`);
  assert.equal(order.stripe_session_id, "cs_merchant");

  const session = {
    id: "cs_merchant", payment_status: "paid", amount_total: 4500, currency: "usd",
    payment_intent: "pi_merchant", metadata: records.create.payload.metadata,
  };
  await assert.rejects(settleMerchantCheckout({ ...session, payment_status: "unpaid" }), /not paid/);
  await assert.rejects(settleMerchantCheckout({ ...session, amount_total: 4000 }), /does not match/);
  await assert.rejects(settleMerchantCheckout({ ...session, metadata: { ...session.metadata, sellerId: "other" } }), /does not match/);
  await assert.rejects(settleMerchantCheckout({ ...session, metadata: { ...session.metadata, platformFeeCents: "4500" } }), /Invalid merchant fee/);
  assert.equal(records.booked.length, 0);
  await settleMerchantCheckout(session);
  assert.deepEqual(records.verified, [["pi_merchant", 4500, "usd"]]);
  assert.equal(records.booked.length, 1);
  assert.equal(records.booked[0].allocations[0].cents, 4050);
});

test("growth merchandise checkout validates shipping and immutable subtotal before provider create", async () => {
  const calls = { created: [], applied: [], booking: [] };
  const order = { user_id: "seller", buyer_id: "buyer", created_at: new Date(), checkout_id: null,
    currency: "usd", subtotal_cents: 2400, state: "checkout" };
  globalThis.__inboundGrowth = { calls, order };
  const envBefore = {
    rate: process.env.STRIPE_MERCH_SHIPPING_RATE_ID,
    countries: process.env.STRIPE_MERCH_SHIPPING_COUNTRIES,
  };
  process.env.STRIPE_MERCH_SHIPPING_RATE_ID = "shr_test";
  process.env.STRIPE_MERCH_SHIPPING_COUNTRIES = "US,CA";
  const stripe = {
    shippingRates: { retrieve: async id => ({ id, active: true, type: "fixed_amount", fixed_amount: { currency: "usd" } }) },
    checkout: { sessions: {
      async *list() {},
      async retrieve() { return globalThis.__inboundGrowth.current; },
      async create(payload, options) {
        calls.created.push({ payload, options });
        return { id: "cs_growth", url: "https://checkout.invalid/growth" };
      },
    } },
  };
  globalThis.__inboundGrowth.stripe = stripe;
  const module = await loadIsolated("server/services/commerce/growthMerch.ts", {
    "../merchCheckoutService": "export function installMerchPaymentAdapter(a){globalThis.__inboundGrowth.adapter=a;}export async function applyVerifiedMerchPayment(x){globalThis.__inboundGrowth.calls.applied.push(x);}",
    "../../db": "export const pool={query:async()=>({rows:[globalThis.__inboundGrowth.order]})};",
    "./runtime": "export const commerceStripe=()=>globalThis.__inboundGrowth.stripe;export const commerceRepository={book:async x=>globalThis.__inboundGrowth.calls.booking.push(x),compensate:async()=>{}};",
    "./verification": "export async function verifiedPayment(){return {processingFeeCents:80,refundedCents:0,pendingCents:0,disputed:false};}",
    "../../config/defaults": "export const getBaseUrl=()=> 'https://app.invalid';",
  });
  const { stripeMerchPaymentAdapter, handleGrowthMerchCheckout } = module;
  await stripeMerchPaymentAdapter.validateCheckout({currency:"usd",shippingAddress:{country:"US"}});
  await assert.rejects(stripeMerchPaymentAdapter.validateCheckout({currency:"usd",shippingAddress:{country:"!!"}}),/valid shipping/);
  delete process.env.STRIPE_MERCH_SHIPPING_RATE_ID;
  await assert.rejects(stripeMerchPaymentAdapter.validateCheckout({currency:"usd",shippingAddress:{country:"US"}}),/Configure/);
  process.env.STRIPE_MERCH_SHIPPING_RATE_ID="shr_test";
  const adapterInput = {
    orderId: "growth-order", idempotencyKey: "merch:growth-order", buyerEmail: "buyer@example.invalid",
    currency: "usd", subtotalCents: 2400, lines: [{ name: "Tee", quantity: 2, unitAmountCents: 1200 }],
    shippingAddress: { country: "US" },
  };
  await assert.rejects(stripeMerchPaymentAdapter.createCheckout({ ...adapterInput, shippingAddress: { country: "FR" } }), /not configured/);
  await assert.rejects(stripeMerchPaymentAdapter.createCheckout({ ...adapterInput, subtotalCents: 2500 }), /do not match/);
  const checkout = await stripeMerchPaymentAdapter.createCheckout(adapterInput);
  assert.equal(checkout.checkoutId, "cs_growth");
  const [{ payload, options }] = calls.created;
  assert.equal(options.idempotencyKey, adapterInput.idempotencyKey);
  assert.equal(payload.automatic_tax.enabled, true);
  assert.deepEqual(payload.metadata, payload.payment_intent_data.metadata);
  assert.equal(payload.metadata.growthMerchOrderId, "growth-order");
  assert.equal(payload.metadata.buyerId, "buyer");
  assert.equal(payload.metadata.sellerId, "seller");
  assert.equal(payload.line_items[0].price_data.unit_amount, 1200);

  const session = {
    id: "cs_growth", payment_status: "paid", automatic_tax: { status: "complete" },
    currency: "usd", amount_subtotal: 2400, amount_total: 2600,
    total_details: { amount_tax: 200 }, payment_intent: "pi_growth",
    metadata: { ...payload.metadata, platformFeeCents: "260" },
    collected_information: { shipping_details: { name: "Buyer", address: { country: "US" } } },
  };
  globalThis.__inboundGrowth.current = session;
  globalThis.__inboundGrowth.current = { ...session, payment_status: "unpaid" };
  await assert.rejects(handleGrowthMerchCheckout("evt", session), /payment or tax/);
  globalThis.__inboundGrowth.current = { ...session, amount_subtotal: 1 };
  await assert.rejects(handleGrowthMerchCheckout("evt", session), /does not match reservation/);
  globalThis.__inboundGrowth.current = session;
  await handleGrowthMerchCheckout("evt_paid", session);
  assert.equal(calls.booking.length, 1);
  assert.equal(calls.booking[0].allocations[0].cents, 2140);
  assert.equal(calls.booking[0].taxCents, 200);
  assert.equal(calls.applied.at(-1).type, "paid");
  globalThis.__inboundGrowth.current = { ...session, status: "open", payment_status: "unpaid" };
  await assert.rejects(handleGrowthMerchCheckout("evt_expire", session, true), /expiry is not confirmed/);
  globalThis.__inboundGrowth.current = { ...session, status: "expired", payment_status: "unpaid" };
  await handleGrowthMerchCheckout("evt_expired", session, true);
  assert.equal(calls.applied.at(-1).type, "expired");
  if (envBefore.rate === undefined) delete process.env.STRIPE_MERCH_SHIPPING_RATE_ID;
  else process.env.STRIPE_MERCH_SHIPPING_RATE_ID = envBefore.rate;
  if (envBefore.countries === undefined) delete process.env.STRIPE_MERCH_SHIPPING_COUNTRIES;
  else process.env.STRIPE_MERCH_SHIPPING_COUNTRIES = envBefore.countries;
});

test("growth merchandise reservation prices from catalog, fences command replay, and applies verified payment events once", async t => {
  const originalCountries = process.env.STRIPE_MERCH_SHIPPING_COUNTRIES;
  process.env.STRIPE_MERCH_SHIPPING_COUNTRIES = "US";
  t.after(() => {
    if (originalCountries === undefined) delete process.env.STRIPE_MERCH_SHIPPING_COUNTRIES;
    else process.env.STRIPE_MERCH_SHIPPING_COUNTRIES = originalCountries;
  });
  const records = { sql: [], adapter: [], paymentEvents: new Set(), item: {
    id: "physical-tee", user_id: "artist", name: "Tour Tee", is_active: true, is_digital: false,
    inventory: 4, price: "20.00", sale_price: "12.00", variants: [],
  } };
  let order;
  let payment;
  let appliedOrder;
  const sqlTag = (parts, ...values) => ({ query: parts.join("?"), values });
  const tx = { async execute(statement) {
    records.sql.push(statement.query);
    if (statement.query.includes("SELECT p.*,o.items")) {
      return payment ? [{ ...payment, ...order, order_id: order.id, buyer_email: order.buyer_email,
        buyer_name: order.buyer_name, shipping_address: order.shipping_address,
        checkout_url: payment.checkout_url, state: payment.state }] : [];
    }
    if (statement.query.includes("SELECT * FROM merch_items")) return [{ ...records.item }];
    if (statement.query.includes("SELECT * FROM growth_merch_payments")) return payment ? [{ ...payment }] : [];
    if (statement.query.includes("SELECT event_id")) return records.paymentEvents.has(statement.values[0]) ? [{ event_id: statement.values[0] }] : [];
    if (statement.query.includes("SELECT * FROM merch_orders")) return order ? [{ ...order, items: order.items }] : [];
    if (statement.query.includes("INSERT INTO merch_orders")) {
      const [id, artistId, email, name, items, total, shipping] = statement.values;
      order = { id, user_id: artistId, buyer_email: email, buyer_name: name, items: JSON.parse(items), total, shipping_address: JSON.parse(shipping), status: "pending" };
      return [];
    }
    if (statement.query.includes("INSERT INTO growth_merch_payments")) {
      const [orderId, buyerId, commandKey, subtotal] = statement.values;
      payment = { order_id: orderId, buyer_id: buyerId, command_key: commandKey, currency: "usd", subtotal_cents: subtotal, state: "reserved", checkout_id: null, checkout_url: null, collected_cents: null, refunded_cents: 0 };
      return [];
    }
    if (statement.query.includes("UPDATE growth_merch_payments SET checkout_id")) {
      payment.checkout_id = statement.values[0]; payment.checkout_url = statement.values[1]; payment.state = "checkout";
    } else if (statement.query.includes("UPDATE growth_merch_payments SET state='paid'")) {
      payment.state = "paid"; payment.collected_cents = statement.values[0]; payment.checkout_id = statement.values[1];
    } else if (statement.query.includes("UPDATE growth_merch_payments SET state='expired'")) {
      payment.state = "expired";
    } else if (statement.query.includes("UPDATE growth_merch_payments SET refunded_cents")) {
      payment.refunded_cents = statement.values[0]; payment.state = statement.values[1];
    } else if (statement.query.includes("UPDATE merch_orders SET status='processing'")) {
      order.status = "processing";
    } else if (statement.query.includes("UPDATE merch_orders SET status='cancelled'")) {
      order.status = "cancelled";
    } else if (statement.query.includes("UPDATE merch_orders SET status='refunded'")) {
      order.status = "refunded";
    }
    if (statement.query.includes("INSERT INTO growth_merch_payment_events")) records.paymentEvents.add(statement.values[0]);
    return [];
  } };
  const db = { transaction: async fn => fn(tx), execute: async statement => {
    records.sql.push(statement.query);
    if (statement.query.includes("UPDATE growth_merch_payments SET checkout_id")) {
      payment.checkout_id = statement.values[0]; payment.checkout_url = statement.values[1]; payment.state = "checkout";
    }
    return [];
  } };
  globalThis.__inboundMerchService = { db, records };
  const { createMerchCheckout, installMerchPaymentAdapter, applyVerifiedMerchPayment } = await loadIsolated(
    "server/services/merchCheckoutService.ts",
    {
      "../db": "export const db=globalThis.__inboundMerchService.db;",
      "drizzle-orm": "export const sql=(parts,...values)=>({query:parts.join('?'),values});",
    },
  );
  installMerchPaymentAdapter({
    validateCheckout: async () => {},
    createCheckout: async input => {
      records.adapter.push(input);
      return { checkoutId: "cs_reserved_merch", checkoutUrl: "https://checkout.invalid/merch" };
    },
  });
  const command = {
    buyerId: "fan", commandKey: "command-1", buyerEmail: "fan@example.invalid", buyerName: "Fan",
    shippingAddress: { country: "US", postal: "10001" }, items: [{ itemId: "physical-tee", quantity: 2 }],
  };
  for (const country of ["!!", "CA", "", "USA"]) {
    const sqlBefore = records.sql.length;
    const stockBefore = records.item.inventory;
    await assert.rejects(createMerchCheckout({...command,shippingAddress:{country}}), /shipping|Shipping/);
    assert.equal(records.sql.length,sqlBefore,"invalid destination must not begin a transaction");
    assert.equal(records.item.inventory,stockBefore);
    assert.equal(records.adapter.length,0);
  }
  await assert.rejects(createMerchCheckout({ ...command, items: [{ itemId: "physical-tee", quantity: 5 }] }), /Insufficient stock/);
  assert.equal(records.adapter.length, 0);
  const checkout = await createMerchCheckout(command);
  assert.equal(checkout.checkoutUrl, "https://checkout.invalid/merch");
  assert.equal(records.adapter[0].subtotalCents, 2400);
  assert.deepEqual(records.adapter[0].lines, [{ itemId: "physical-tee", name: "Tour Tee", quantity: 2, unitAmountCents: 1200 }]);
  assert.equal(records.adapter[0].idempotencyKey, `merch:${order.id}`);
  assert.deepEqual({ currency: payment.currency, checkoutId: payment.checkout_id, state: payment.state },
    { currency: "usd", checkoutId: "cs_reserved_merch", state: "checkout" });
  const replay = await createMerchCheckout(command);
  assert.deepEqual(replay, checkout);
  assert.equal(records.adapter.length, 1);
  await assert.rejects(createMerchCheckout({ ...command, buyerName: "Changed name" }), error => error.status === 409);

  assert.deepEqual(await applyVerifiedMerchPayment({
    eventId: "event-paid", orderId: order.id, checkoutId: "cs_reserved_merch",
    currency: "usd", type: "paid", amountCents: 2500,
  }), { duplicate: false });
  assert.equal(payment.state, "paid");
  assert.equal(order.status, "processing");
  assert.deepEqual(await applyVerifiedMerchPayment({
    eventId: "event-paid", orderId: order.id, checkoutId: "cs_reserved_merch",
    currency: "usd", type: "paid", amountCents: 2500,
  }), { duplicate: true });
  await assert.rejects(applyVerifiedMerchPayment({
    eventId: "event-underpaid", orderId: order.id, checkoutId: "cs_reserved_merch",
    currency: "usd", type: "paid", amountCents: 2399,
  }), /Invalid payment settlement/);
  await assert.rejects(applyVerifiedMerchPayment({
    eventId: "event-wrong-checkout", orderId: order.id, checkoutId: "cs_other",
    currency: "usd", type: "refunded", amountCents: 100,
  }), /does not match reserved order/);
  await applyVerifiedMerchPayment({
    eventId: "event-refund", orderId: order.id, checkoutId: "cs_reserved_merch",
    currency: "usd", type: "refunded", amountCents: 2500,
  });
  assert.equal(payment.state, "refunded");
  assert.equal(order.status, "refunded");
  await assert.rejects(applyVerifiedMerchPayment({
    eventId: "event-post-refund-expiry", orderId: order.id, checkoutId: "cs_reserved_merch",
    currency: "usd", type: "expired", amountCents: 0,
  }), /Paid checkout cannot expire/);
});

test("billing create-checkout route executes canonical price catalog and rejects caller-supplied prices", async () => {
  const { routes } = routeHarness();
  const calls = { customer: [], checkout: [] };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ stripeCustomerId: "cus_user" }] }) }) }),
  };
  const pool = memoryCommercePool();
  globalThis.__inboundBilling = { routes, calls, db, pool };
  const mockModules = {
    express: "export const Router=()=>{const r={get:(p,...h)=>{globalThis.__inboundBilling.routes.set('GET '+p,h.at(-1));return r},post:(p,...h)=>{globalThis.__inboundBilling.routes.set('POST '+p,h.at(-1));return r},put:(p,...h)=>{globalThis.__inboundBilling.routes.set('PUT '+p,h.at(-1));return r},patch:(p,...h)=>{globalThis.__inboundBilling.routes.set('PATCH '+p,h.at(-1));return r},delete:(p,...h)=>{globalThis.__inboundBilling.routes.set('DELETE '+p,h.at(-1));return r},use(){return r}};return r;};",
    stripe: "export default class Stripe {constructor(){return {customers:{create:async(...x)=>{globalThis.__inboundBilling.calls.customer.push(x);return {id:'cus_new'};}},checkout:{sessions:{create:async(...x)=>{globalThis.__inboundBilling.calls.checkout.push(x);return {id:'cs_bill',url:'https://checkout.invalid/billing'};}}}}}}",
    "../db": "export const db=globalThis.__inboundBilling.db,pool=globalThis.__inboundBilling.pool;",
    "@shared/schema": schemaStub,
    "drizzle-orm": drizzleStub,
    "../logger": loggerStub,
    "../services/externalServices": "export async function executeStripeOperation(fn){return {data:await fn()};}",
    "../middleware/rateLimiter": "export const billingRateLimiter=()=>{};",
    "../middleware/auth.js": "export const requireAuth=(_q,_s,n)=>n();",
    "../services/notificationService.js": "export const notificationService={};",
    "../services/stripeService.js": "export const stripeService={};",
    "../services/instantPayoutService.js": "export const instantPayoutService={};",
    "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_test_contract_only'};",
  };
  const routeModule = await loadIsolated("server/routes/billing.ts", mockModules);
  // Checkout pricing is exercised through the actual imported production catalog.
  assert.ok(routeModule.default);
  const handler = routes.get("POST /create-checkout-session");
  assert.equal(typeof handler, "function");
  let commandNumber = 0;
  const invoke = async (body) => {
    const res = responseHarness();
    const requestKey = `billing-route-command-${++commandNumber}`;
    await handler({
      body,
      user: { id: "user-1", email: "buyer@example.invalid" },
      get: name => name === "Idempotency-Key" ? requestKey : undefined,
    }, res);
    return res;
  };
  const monthly = await invoke({ planId: "monthly" });
  assert.equal(monthly.statusCode, 200);
  assert.equal(calls.checkout[0][0].line_items[0].price_data.unit_amount, 4900);
  assert.deepEqual(calls.checkout[0][0].metadata, { userId: "user-1", planId: "monthly" });
  assert.deepEqual(calls.checkout[0][0].subscription_data.metadata, calls.checkout[0][0].metadata);
  const lifetime = await invoke({ planId: "lifetime" });
  assert.equal(lifetime.statusCode, 200);
  assert.equal(calls.checkout[1][0].line_items[0].price_data.unit_amount, 69900);
  assert.equal(calls.checkout[1][0].payment_intent_data.metadata.planId, "lifetime");
  const invalid = await invoke({ planId: "enterprise", priceId: "price_injected" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls.checkout.length, 2);
});
