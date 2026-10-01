import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadIsolatedClosed, loggerStub } from "./helpers-inbound.mjs";

test("actual storefront membership service prices tiers, subscribes, and cancels with customer ownership", async () => {
  const records = {
    stripe: {
      calls: [],
      customers: {
        async create(input) { records.stripe.calls.push(["customers.create", input]); return { id: "cus_member" }; },
      },
      prices: {
        async create(input) { records.stripe.calls.push(["prices.create", input]); return { id: "price_member" }; },
      },
      subscriptions: {
        async create(input) { records.stripe.calls.push(["subscriptions.create", input]); return { id: "sub_member", status: "active" }; },
        async update(id, input) { records.stripe.calls.push(["subscriptions.update", id, input]); return { id, ...input }; },
      },
    },
    storefront: { id: "store-legacy", name: "Store Legacy", userId: "seller-legacy" },
    user: { id: "member-legacy", email: "member@example.invalid", stripeCustomerId: null },
    tier: null,
    memberships: [],
    writes: [],
    table: { storefronts: {}, membershipTiers: {}, customerMemberships: {}, users: {} },
  };
  const db = {
    query: {
      storefronts: { findFirst: async () => records.storefront },
      membershipTiers: { findMany: async () => records.tier ? [records.tier] : [] },
      users: { findFirst: async () => records.user },
      customerMemberships: { findFirst: async () => records.memberships[0] || null },
    },
    select() {
      return {
        from(table) {
          const query = {
            leftJoin() { return query; },
            where() { return query; },
            limit: async () => table === records.table.membershipTiers
              ? [{ tier: records.tier, storefront: records.storefront }]
              : records.memberships,
          };
          return query;
        },
      };
    },
    insert(table) {
      return {
        values(value) {
          records.writes.push({ kind: "insert", table, value });
          return {
            returning: async () => {
              const row = table === records.table.membershipTiers
                ? { id: "tier-created", ...value }
                : { id: "membership-created", ...value };
              if (table === records.table.membershipTiers) records.tier = row;
              else records.memberships = [row];
              return [row];
            },
          };
        },
      };
    },
    update(table) {
      return {
        set(change) {
          records.writes.push({ kind: "update", table, change });
          const query = {
            where: () => query,
            returning: async () => {
              if (table === records.table.customerMemberships) {
                const updated = { ...records.memberships[0], ...change };
                records.memberships = [updated];
                return [updated];
              }
              return [];
            },
          };
          return query;
        },
      };
    },
    delete() { return { where: async () => [] }; },
  };
  globalThis.__inboundLegacyStorefront = { ...records, db };
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_only";
  try {
    const stripeModule = "export default class Stripe {constructor(){return globalThis.__inboundLegacyStorefront.stripe;}}";
    const module = await loadIsolatedClosed("server/services/storefrontService.ts", {
      "../db": "export const db=globalThis.__inboundLegacyStorefront.db;",
      "@shared/schema": `
        export const storefronts=globalThis.__inboundLegacyStorefront.table.storefronts,
          storefrontTemplates={},membershipTiers=globalThis.__inboundLegacyStorefront.table.membershipTiers,
          customerMemberships=globalThis.__inboundLegacyStorefront.table.customerMemberships,
          listings={},users=globalThis.__inboundLegacyStorefront.table.users;
      `,
      "drizzle-orm": "export const eq=(...x)=>x,and=(...x)=>x,desc=(...x)=>x,sql=(...x)=>x;",
      stripe: stripeModule,
      "../logger.js": loggerStub,
      "./beatMoneyLoopAudioAccess.js": "export async function getDistinctBeatMoneyLoopPreviewUrl(){return null;}",
      "../config/storefrontUrls.js": "export const getStorefrontPathUrl=x=>x;",
    });
    records.table.storefronts = globalThis.__inboundLegacyStorefront.table.storefronts;
    // Rebind table sentinels after construction so the fake query builder maps
    // production schema identifiers to its repository records.
    const { storefrontService } = module;
    const created = await storefrontService.createMembershipTier({
      storefrontId: records.storefront.id, name: "Supporter", description: "Monthly support",
      priceCents: 4900, currency: "usd", interval: "month", benefits: { extras: true },
      maxSubscribers: 10,
    });
    assert.equal(created.stripePriceId, "price_member");
    const priceCall = records.stripe.calls.find(call => call[0] === "prices.create");
    assert.equal(priceCall[1].unit_amount, 4900);
    assert.deepEqual(priceCall[1].recurring, { interval: "month" });
    assert.equal(priceCall[1].metadata.storefrontId, records.storefront.id);

    // Route-selected records use the actual service's configured tier through
    // the service's query results; the fake returns the created record.
    records.tier = created;
    const subscribed = await storefrontService.subscribeMembershipTier(records.user.id, created.id);
    assert.equal(subscribed.subscription.id, "sub_member");
    assert.equal(subscribed.membership.customerId, records.user.id);
    assert.deepEqual(records.stripe.calls.find(call => call[0] === "subscriptions.create")[1], {
      customer: "cus_member", items: [{ price: "price_member" }],
      metadata: { customerId: records.user.id, tierId: created.id, storefrontId: records.storefront.id },
    });

    records.memberships[0] = { ...records.memberships[0], customerId: "somebody-else" };
    await assert.rejects(storefrontService.cancelMembership("membership-created", records.user.id), /Unauthorized/);
    assert.equal(records.stripe.calls.filter(call => call[0] === "subscriptions.update").length, 0);
    records.memberships[0].customerId = records.user.id;
    const canceled = await storefrontService.cancelMembership("membership-created", records.user.id);
    assert.equal(canceled.cancelAtPeriodEnd, true);
    assert.deepEqual(records.stripe.calls.at(-1), ["subscriptions.update", "sub_member", { cancel_at_period_end: true }]);
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
});

test("legacy marketplace service delegates frozen checkout and creates/reuses Connect onboarding accounts", async () => {
  const records = {
    checkoutInputs: [],
    users: new Map([["seller", { id: "seller", email: "seller@example.invalid", stripeCustomerId: null }]]),
    writes: [],
    stripe: {
      accounts: {
        async create(input) { records.accountInput = input; return { id: "acct_connect" }; },
      },
      accountLinks: {
        async create(input) { records.accountLinkInput = input; return { url: "https://connect.invalid/onboarding" }; },
      },
    },
  };
  globalThis.__inboundLegacyMarketplace = records;
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_only";
  try {
    const module = await loadIsolatedClosed("server/services/marketplaceService.ts", {
      "../storage": "export const storage={getUser:async id=>globalThis.__inboundLegacyMarketplace.users.get(id),updateUser:async(id,change)=>{const u=globalThis.__inboundLegacyMarketplace.users.get(id);Object.assign(u,change);globalThis.__inboundLegacyMarketplace.writes.push({id,change});}};",
      "./commerceOrderRepository": "export async function updateCommerceOrder(){};",
      "./commerce/settlement": "export async function bookMarketplace(){};export async function snapshotMarketplaceTerms(){return {};}",
      "./commerce/marketplaceCheckout": "export async function createMarketplaceCheckout(_stripe,input){globalThis.__inboundLegacyMarketplace.checkoutInputs.push(input);return {sessionId:'cs_legacy',url:'https://checkout.invalid/legacy'};}",
      "./commerce/contract": "export function minorUnits(x){return Math.round(Number(x)*100)};export function majorUnits(x){return Number(x)/100};",
      "../db": "export const db={};",
      "stripe": "export default class Stripe {constructor(){return globalThis.__inboundLegacyMarketplace.stripe;}}",
      "@shared/schema": "export const listingLicenseTiers={},listings={},notifications={},orders={},royaltySplits={},royaltyTransactions={},revenueEvents={};",
      "drizzle-orm": "export const and=(...x)=>x,eq=(...x)=>x,sql=(...x)=>x;",
      "./instantPayoutService": "export const instantPayoutService={};",
      "./notificationService.js": "export const notificationService={};",
      "../logger.js": loggerStub,
      "../config/defaults.js": "export const getBaseUrl=()=> 'https://inbound-test.invalid';",
    });
    const service = module.marketplaceService;
    service.getListing = async id => id === "beat-legacy" ? {
      id, userId: "seller", title: "Legacy beat",
      licenses: [{ type: "basic", price: 12.99 }],
    } : null;
    const checkout = await service.createCheckoutSession({
      beatId: "beat-legacy", licenseType: "basic", buyerId: "buyer",
      successUrl: "https://inbound-test.invalid/ok", cancelUrl: "https://inbound-test.invalid/no",
    });
    assert.equal(checkout.sessionId, "cs_legacy");
    assert.equal(records.checkoutInputs[0].amountCents, 1299);
    assert.equal(records.checkoutInputs[0].sellerId, "seller");
    assert.deepEqual(records.checkoutInputs[0].licenseSnapshot, { licenseType: "basic", price: 12.99 });
    await assert.rejects(service.createCheckoutSession({
      beatId: "beat-legacy", licenseType: "bogus", buyerId: "buyer",
      successUrl: "x", cancelUrl: "y",
    }), /Failed to create checkout session/);

    const link = await service.setupStripeConnect("seller", "https://inbound-test.invalid/return", "https://inbound-test.invalid/retry");
    assert.equal(link.url, "https://connect.invalid/onboarding");
    assert.deepEqual(records.accountInput, { type: "express", email: "seller@example.invalid" });
    assert.equal(records.users.get("seller").stripeCustomerId, "acct_connect");
    assert.deepEqual(records.accountLinkInput, {
      account: "acct_connect", refresh_url: "https://inbound-test.invalid/retry",
      return_url: "https://inbound-test.invalid/return", type: "account_onboarding",
    });
    await service.setupStripeConnect("seller", "https://inbound-test.invalid/return", "https://inbound-test.invalid/retry");
    assert.equal(records.writes.length, 1, "existing Connect account is reused");
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
});

test("legacy StripeService and BeatService execute subscription/payment-intent purchase functions", async () => {
  const records = { calls: [], users: [], beatSales: [], beat: { id: "beat-old", standardPrice: 18.5, exclusivePrice: 75, isExclusiveSold: false } };
  const storage = {
    async getUser(id) { return records.users.find(user => user.id === id) || { id, email: "artist@example.invalid", stripeCustomerId: "cus_artist" }; },
    async updateUserStripeInfo(id, customerId, subscriptionId) { records.calls.push(["updateUserStripeInfo", id, customerId, subscriptionId]); },
    async updateUser(id, change) { records.calls.push(["updateUser", id, change]); },
    async getBeat(id) { return id === records.beat.id ? records.beat : null; },
    async createBeatSale(input) { const sale = { id: "sale_old", ...input }; records.beatSales.push(sale); return sale; },
    async updateBeat(id, change) { Object.assign(records.beat, change); records.calls.push(["updateBeat", id, change]); },
  };
  const stripe = {
    paymentIntents: {
      async create(input) { records.calls.push(["paymentIntents.create", input]); return { id: "pi_beat", client_secret: "pi_beat_secret" }; },
    },
    subscriptions: {
      async create(input) {
        records.calls.push(["subscriptions.create", input]);
        return { id: "sub_old", latest_invoice: { payment_intent: { client_secret: "pi_sub_secret" } } };
      },
    },
  };
  globalThis.__inboundLegacyStripeService = { records, storage, stripe, order: { id: "order-refund", user_id: "buyer", amount: 18.5 } };
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_only";
  try {
    const { StripeService } = await loadIsolatedClosed("server/services/stripeService.ts", {
      stripe: "export default class Stripe {constructor(){return globalThis.__inboundLegacyStripeService.stripe;}}",
      "./commercePolicy": "export function validateCustomerRefund(order,userId,amountCents){if(order.user_id!==userId)throw new Error('Refund order does not belong to customer');return amountCents??Math.round(order.amount*100);}",
      "./commerce/compensation": "export async function initiateCommerceRefund(...args){globalThis.__inboundLegacyStripeService.records.calls.push(['initiateCommerceRefund',...args]);return {success:true,refundId:'refund_service'};}",
      "../storage": "export const storage=globalThis.__inboundLegacyStripeService.storage;",
      "./stripeSetup.js": "export function getStripePriceIds(){return {monthly:'price_monthly',yearly:'price_yearly',lifetime:'price_lifetime'};}",
      "../logger.js": loggerStub,
      "./externalServices.js": "export async function executeStripeOperation(fn){return {data:await fn()};}",
      "../db.js": "export const db={select:()=>({from:()=>({where:()=>({limit:async()=>[globalThis.__inboundLegacyStripeService.order]})})})};",
      "@shared/schema": "export const users={},orders={},refunds={},ledgerEntries={},notifications={},taxForms={};",
      "drizzle-orm": "export const eq=(...x)=>x,and=(...x)=>x,desc=(...x)=>x,sql=(...x)=>x;",
      "./instantPayoutService": "export const instantPayoutService={};",
      "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_test_unit_only'};",
      "../lib/envHelpers.js": "export function isProductionEnv(){return false;}",
    });
    const stripeService = new StripeService();
    const subscription = await stripeService.getOrCreateSubscription("artist", "monthly");
    assert.equal(subscription.subscriptionId, "sub_old");
    assert.equal(subscription.clientSecret, "pi_sub_secret");
    assert.deepEqual(records.calls.find(call => call[0] === "subscriptions.create")[1], {
      customer: "cus_artist", items: [{ price: "price_monthly" }],
      payment_behavior: "default_incomplete", metadata: { userId: "artist", planId: "monthly" },
      expand: ["latest_invoice.payment_intent"],
    });
    const beatIntent = await stripeService.createBeatPurchaseIntent("beat-old", "fan", "standard", 18.5);
    assert.equal(beatIntent.client_secret, "pi_beat_secret");
    assert.deepEqual(records.calls.find(call => call[0] === "paymentIntents.create")[1], {
      amount: 1850, currency: "usd",
      metadata: { beatId: "beat-old", buyerId: "fan", licenseType: "standard" },
    });
    assert.deepEqual(await stripeService.createRefund({
      orderId: "order-refund", userId: "buyer", amountCents: 1000, idempotencyKey: "refund-command",
    }), { success: true, refundId: "refund_service" });
    assert.deepEqual(records.calls.find(call => call[0] === "initiateCommerceRefund"), [
      "initiateCommerceRefund", "order-refund", "buyer", 1000, "refund-command",
    ]);

    const beat = await loadIsolatedClosed("server/services/beatService.ts", {
      "../storage": "export const storage=globalThis.__inboundLegacyStripeService.storage;",
      "./stripeService": "export const stripeService={createBeatPurchaseIntent:async(...args)=>{globalThis.__inboundLegacyStripeService.records.calls.push(['beatPurchaseIntent',...args]);return {client_secret:'beat_service_secret'};}};",
      "../logger.js": loggerStub,
    });
    const result = await beat.beatService.purchaseBeat("beat-old", "fan-old", "standard");
    assert.equal(result.success, true);
    assert.equal(result.paymentIntent, "beat_service_secret");
    assert.deepEqual(records.calls.at(-1), ["beatPurchaseIntent", "beat-old", "fan-old", "standard", 18.5]);
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
});