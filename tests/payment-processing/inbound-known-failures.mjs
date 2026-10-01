/**
 * Executable assertions for confirmed production defects. Run separately from
 * the passing regression baseline. These tests are intentionally expected to
 * FAIL until production behavior is fixed; they must never be reported as
 * passing coverage.
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

test("KNOWN FAILURE: billing checkout retry with the same client command must not create another session", async () => {
  const routes = new Map();
  const creates = [];
  const user = { id: "retry-buyer", email: "retry@example.invalid", stripeCustomerId: "cus_retry" };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [user] }) }) }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  };
  const stripe = { checkout: { sessions: {
    async create(params, options) {
      creates.push({ params, options });
      return { id: `cs_retry_${creates.length}`, url: "https://checkout.invalid/retry" };
    },
  } } };
  await loadBillingRoutes({ routes, db, stripe, stripeService: {} });
  const handler = routes.get("POST /create-checkout-session");
  const invoke = async () => {
    const res = responseHarness();
    await handler({
      body: { planId: "monthly" }, user,
      get: name => name === "Idempotency-Key" ? "same-billing-command" : undefined,
    }, res);
    assert.equal(res.statusCode, 200);
  };
  await invoke();
  await invoke();
  assert.equal(creates.length, 1, "same idempotency key must return/reuse the original Checkout operation");
  assert.equal(creates[0].options?.idempotencyKey, "same-billing-command");
});

test("KNOWN FAILURE: storefront cart retry with the same client command must reuse its Checkout session and order", async () => {
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
  state.stripe = { checkout: { sessions: { create: async (payload, options) => {
    creates.push({ payload, options });
    return { id: `cs_store_retry_${creates.length}`, url: "https://checkout.invalid/store-retry" };
  } } } };
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
    "../db": "export const db=globalThis.__inboundStore.db;",
    "drizzle-orm": drizzleStub,
    zod: "export class ZodError extends Error{};export const z={};",
    "../logger.js": loggerStub,
    dns: "export default {promises:{}};",
    "../modules/domains/dnsValidators.js": "export function validateDomain(){return {valid:true};}",
    "../config/env.js": "export const env={STRIPE_SECRET_KEY:'sk_test_contract_only',APP_URL:'https://app.invalid'};",
    "../config/storefrontUrls.js": "export const getStorefrontPathUrl=x=>x,STOREFRONT_APP_ORIGIN='https://app.invalid';",
  });
  const handler = harness.routes.get("POST /:id/checkout");
  const invoke = async () => {
    const res = responseHarness();
    await handler({
      isAuthenticated: () => true,
      user: { id: "buyer-idempotency" },
      params: { id: storefront.id },
      body: { listingIds: [listing.id], licenseType: "basic" },
      get: name => name === "Idempotency-Key" ? "same-storefront-command" : undefined,
    }, res);
    assert.equal(res.statusCode, 200);
  };
  await invoke();
  await invoke();
  assert.equal(creates.length, 1, "same idempotency key must not create a second checkout session");
  assert.equal(writes.length, 1, "same cart command must not persist a second pending order");
});

test("KNOWN FAILURE: BeatService completion must verify successful payment before recording a sale", async () => {
  const sales = [];
  globalThis.__inboundUnverifiedBeat = {
    async createBeatSale(input) { const sale = { id: "sale_unpaid", ...input }; sales.push(sale); return sale; },
    async updateBeat() {},
  };
  const beatModule = await loadIsolatedClosed("server/services/beatService.ts", {
    "../storage": "export const storage=globalThis.__inboundUnverifiedBeat;",
    "./stripeService": "export const stripeService={};",
    "../logger.js": loggerStub,
  });
  await beatModule.beatService.completeBeatPurchase(
    "pi_never-paid", "beat-unverified", "buyer-unverified", "seller-unverified", "standard", 99,
  );
  assert.equal(sales.length, 0, "sale fulfillment must not accept an arbitrary unverified PaymentIntent ID");
});
