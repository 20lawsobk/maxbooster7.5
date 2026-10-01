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

test("storefront cart executes auth, ownership, catalog pricing, amount, metadata, and order creation contracts", async () => {
  const harness = routeHarness();
  const storefront = { id: "store-1", userId: "seller-1", slug: "artist-shop" };
  const listings = [
    { id: "beat-1", title: "Catalog Beat", genre: "Hip Hop", priceCents: 2500, discountPercent: 20,
      discountPriceCents: 2000, discountExpiresAt: "2099-01-01", isPublished: true },
    // This deliberately was not requested: the handler must consume catalog results only.
    { id: "beat-extra", title: "Unrequested", genre: "Pop", priceCents: 9000, isPublished: true },
  ];
  const inserts = [];
  const orderWrites = [];
  const pool = memoryCommercePool(orderWrites);
  let selectArg;
  const db = {
    select(arg) {
      selectArg = arg;
      return { from(table) {
        let selectedTable = table;
        const q = {
          leftJoin() { return q; },
          where() { return q; },
          async limit() {
            if (selectArg) return [{ tier: globalThis.__inboundStore.tier, storefront: globalThis.__inboundStore.storefront }];
            if (selectedTable === globalThis.__inboundStore.schema.storefronts) return [globalThis.__inboundStore.storefront];
            if (selectedTable === globalThis.__inboundStore.schema.listings) return globalThis.__inboundStore.listings;
            if (selectedTable === globalThis.__inboundStore.schema.bogoPromotions) return [];
            if (selectedTable === globalThis.__inboundStore.schema.customerMemberships) return globalThis.__inboundStore.memberships;
            return [];
          },
        };
        return q;
      } };
    },
    update() { return { set() { return { where: async () => [] }; } }; },
    insert(table) { return { values: async value => { inserts.push({ table, value }); return []; } }; },
  };
  const schema = { storefronts: {}, listings: {}, bogoPromotions: {}, storefrontOrders: {}, membershipTiers: {}, customerMemberships: {}, users: {} };
  globalThis.__inboundStore = { ...harness, router: harness.router, schema, db, pool, storefront, listings: [listings[0]], memberships: [], tier: null };
  const stripeCalls = { customers: [], prices: [], sessions: [] };
  globalThis.__inboundStore.stripe = {
    customers: { create: async payload => { stripeCalls.customers.push(payload); return { id: "cus_store" }; } },
    prices: { create: async payload => { stripeCalls.prices.push(payload); return { id: "price_tier" }; } },
    checkout: { sessions: { create: async (...args) => {
      const [payload] = args;
      stripeCalls.sessions.push({ payload, args });
      return { id: `cs_store_${stripeCalls.sessions.length}`, url: "https://checkout.invalid/store" };
    } } },
  };
  const stripeStub = "export default class Stripe {constructor(){return globalThis.__inboundStore.stripe;}}";
  const module = await loadIsolated("server/routes/storefront.ts", {
    express: "export const Router=()=>globalThis.__inboundStore.router;",
    "../middleware/uploadHandler.js": "export function createHardenedUpload(){const u=()=>{};u.single=()=>()=>{};u.array=()=>()=>{};u.fields=()=>()=>{};u.any=()=>()=>{};return u;}export async function storeUploadedFile(){return {};}",
    "../services/storefrontService": "export const storefrontService={};",
    "../services/hybridStorageService": "export const hybridStorageService={};",
    "@shared/schema": "export const storefronts=globalThis.__inboundStore.schema.storefronts,listings=globalThis.__inboundStore.schema.listings,listingLicenseTiers={},bogoPromotions=globalThis.__inboundStore.schema.bogoPromotions,storefrontOrders=globalThis.__inboundStore.schema.storefrontOrders,membershipTiers=globalThis.__inboundStore.schema.membershipTiers,customerMemberships=globalThis.__inboundStore.schema.customerMemberships,users=globalThis.__inboundStore.schema.users;export const insertStorefrontSchema={},updateStorefrontSchema={},insertMembershipTierSchema={},updateMembershipTierSchema={},storefrontFollows={},storefrontLikes={},storefrontRatings={},storefrontDomains={};",
    stripe: stripeStub,
    "../config/defaults": "export const getBaseUrl=()=> 'https://app.invalid';",
    "../db": "export const db=globalThis.__inboundStore.db,pool=globalThis.__inboundStore.pool;",
    "drizzle-orm": drizzleStub,
    zod: "export class ZodError extends Error{};export const z={};",
    "../logger.js": loggerStub,
    dns: "export default {promises:{}};",
    "../modules/domains/dnsValidators.js": "export function validateDomain(){return {valid:true};}",
    "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_contract_only',APP_URL:'https://app.invalid'};",
    "../config/storefrontUrls.js": "export const getStorefrontPathUrl=x=>x,STOREFRONT_APP_ORIGIN='https://app.invalid';",
  });
  assert.equal(typeof module.default, "object");
  const checkout = harness.routes.get("POST /:id/checkout");
  const membership = harness.routes.get("POST /subscribe/:tierId");
  assert.equal(typeof checkout, "function");
  assert.equal(typeof membership, "function");
  const invoke = async (handler, request) => {
    const res = responseHarness();
    await handler({
      ...request,
      get: request.get ?? (name =>
        name === "Idempotency-Key"
          ? `storefront-route-command-${request.user?.id ?? "anonymous"}`
          : undefined),
    }, res);
    return res;
  };
  assert.equal((await invoke(checkout, { isAuthenticated: () => false, params: { id: "store-1" }, body: {} })).statusCode, 401);
  assert.equal((await invoke(checkout, { isAuthenticated: () => true, user: { id: "seller-1" }, params: { id: "store-1" }, body: { listingIds: ["beat-1"] } })).statusCode, 400);
  const badCart = await invoke(checkout, { isAuthenticated: () => true, user: { id: "buyer" }, params: { id: "store-1" }, body: { listingIds: new Array(21).fill("beat-1") } });
  assert.equal(badCart.statusCode, 400);
  const goodCart = await invoke(checkout, { isAuthenticated: () => true, user: { id: "buyer-1" }, params: { id: "store-1" }, body: { listingIds: ["beat-1", "untrusted-id"], licenseType: "basic" }, get: name => name === "Idempotency-Key" ? "storefront-route-command-buyer-1" : undefined });
  assert.equal(goodCart.statusCode, 200);
  assert.equal(stripeCalls.sessions.length, 1);
  const { payload: session } = stripeCalls.sessions[0];
  assert.equal(session.line_items.length, 1);
  assert.equal(session.line_items[0].price_data.unit_amount, 2000);
  assert.equal(session.metadata.buyerId, "buyer-1");
  assert.deepEqual(JSON.parse(session.metadata.listingIds), ["beat-1"]);
  assert.equal(orderWrites.length, 1);
  assert.equal(orderWrites[0].params[5], 2000);
  assert.equal(orderWrites[0].params[6], "cs_store_1");
  globalThis.__inboundStore.listings[0].discountExpiresAt = "2000-01-01";
  await invoke(checkout, { isAuthenticated: () => true, user: { id: "buyer-2" }, params: { id: "store-1" }, body: { listingIds: ["beat-1", "untrusted-id"], licenseType: "basic" }, get: name => name === "Idempotency-Key" ? "storefront-route-command-buyer-2" : undefined });
  assert.equal(stripeCalls.sessions.length, 2, "distinct buyers receive independent provider sessions");
  assert.equal(stripeCalls.sessions[1].payload.line_items[0].price_data.unit_amount, 2500, "expired promotional price must not be applied");
  assert.equal(orderWrites.length, 2);

  const deniedMembership = await invoke(membership, { isAuthenticated: () => false, params: { tierId: "tier-1" }, user: {} });
  assert.equal(deniedMembership.statusCode, 401);
  globalThis.__inboundStore.tier = { id: "tier-1", storefrontId: "store-1", isActive: true, priceCents: 1750, currency: "usd", interval: "month", name: "Supporter", stripePriceId: null };
  globalThis.__inboundStore.memberships = [];
  const memberResult = await invoke(membership, { isAuthenticated: () => true, user: { id: "member", email: "member@example.invalid" }, params: { tierId: "tier-1" }, body: {} });
  assert.equal(memberResult.statusCode, 200);
  assert.equal(stripeCalls.prices[0].unit_amount, 1750);
  assert.equal(stripeCalls.sessions[2].payload.line_items[0].price, "price_tier");
  assert.deepEqual(stripeCalls.sessions[2].payload.metadata, {
    type: "storefront_membership", customerId: "member", tierId: "tier-1", storefrontId: "store-1",
  });
  globalThis.__inboundStore.memberships = [{ id: "membership-existing" }];
  const duplicate = await invoke(membership, { isAuthenticated: () => true, user: { id: "member", email: "member@example.invalid" }, params: { tierId: "tier-1" } });
  assert.equal(duplicate.statusCode, 400);
  assert.equal(stripeCalls.sessions.length, 3);
});
