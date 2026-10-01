import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  loadIsolatedClosed,
  responseHarness,
  routeHarness,
} from "./helpers-inbound.mjs";

test("storefront membership tier mutations require ownership of the tier's parent storefront", async () => {
  const harness = routeHarness();
  const state = {
    harness,
    schema: {
      storefronts: { id: "storefronts.id", userId: "storefronts.userId" },
      membershipTiers: {
        id: "membershipTiers.id",
        storefrontId: "membershipTiers.storefrontId",
      },
    },
    storefrontRows: [
      { id: "store-owned", userId: "owner" },
      { id: "store-other", userId: "other-owner" },
    ],
    tierRows: [
      { id: "tier-owned", storefrontId: "store-owned" },
      { id: "tier-other", storefrontId: "store-other" },
    ],
    serviceCalls: [],
    mutations: { stripe: 0, storage: 0 },
  };
  state.storefrontService = {
    async createMembershipTier(input) {
      state.serviceCalls.push(["create", input.storefrontId]);
      state.mutations.stripe += 1;
      state.mutations.storage += 1;
      return { id: "tier-created", ...input };
    },
    async updateMembershipTier(tierId, userId, updates) {
      state.serviceCalls.push(["update", tierId, userId]);
      state.mutations.storage += 1;
      return { id: tierId, ...updates };
    },
    async deleteMembershipTier(tierId, userId) {
      state.serviceCalls.push(["delete", tierId, userId]);
      state.mutations.storage += 1;
    },
  };
  state.db = {
    select(selection) {
      let table;
      let condition;
      const query = {
        from(value) {
          table = value;
          return query;
        },
        leftJoin() {
          return query;
        },
        where(value) {
          condition = value;
          return query;
        },
        async limit() {
          if (table === state.schema.storefronts) {
            const row = state.storefrontRows.find(
              (storefront) => storefront.id === condition?.value,
            );
            return row ? [row] : [];
          }
          if (table === state.schema.membershipTiers && selection?.tier) {
            const tier = state.tierRows.find(
              (item) => item.id === condition?.value,
            );
            if (!tier) return [];
            const storefront = state.storefrontRows.find(
              (item) => item.id === tier.storefrontId,
            );
            return [{ tier, storefront: storefront ?? null }];
          }
          return [];
        },
      };
      return query;
    },
  };

  globalThis.__outboundMembershipAuth = state;
  const module = await loadIsolatedClosed("server/routes/storefront.ts", {
    express: `
      export const Router=()=>globalThis.__outboundMembershipAuth.harness.router;
    `,
    "../middleware/uploadHandler.js": `
      export const createHardenedUpload=()=>({single:()=>()=>{}});
      export const storeUploadedFile=async()=>({});
    `,
    "../services/storefrontService": `
      export const storefrontService=globalThis.__outboundMembershipAuth.storefrontService;
    `,
    "../services/hybridStorageService": `export const hybridStorageService={};`,
    "@shared/schema": `
      const state=globalThis.__outboundMembershipAuth;
      export const storefronts=state.schema.storefronts;
      export const membershipTiers=state.schema.membershipTiers;
      export const insertStorefrontSchema={};
      export const updateStorefrontSchema={};
      export const insertMembershipTierSchema={parse:value=>value};
      export const updateMembershipTierSchema={parse:value=>value};
      export const storefrontFollows={},storefrontLikes={},storefrontRatings={},
        storefrontOrders={},listings={},listingLicenseTiers={},storefrontDomains={},
        users={},bogoPromotions={},customerMemberships={};
    `,
    stripe: `export default class Stripe {}`,
    "../config/defaults": `export const getBaseUrl=()=>"https://example.invalid";`,
    "../db": `export const db=globalThis.__outboundMembershipAuth.db;`,
    "drizzle-orm": `
      export const eq=(field,value)=>({field,value});
      export const and=(...values)=>values,or=(...values)=>values;
      export const count=()=>0,avg=()=>0,lte=(...values)=>values,gte=(...values)=>values;
      export const isNull=()=>null,inArray=(...values)=>values;
    `,
    zod: `export const z={ZodError:class ZodError extends Error{}};`,
    "../logger.js": `export const logger={warn(){},info(){},error(){},debug(){}};`,
    dns: `export default {};`,
    "../modules/domains/dnsValidators.js": `export const validateDomain=()=>({ok:false});`,
    "../config/env.js": `export const env={};`,
    "../config/storefrontUrls.js": `
      export const getStorefrontPathUrl=()=>"",STOREFRONT_APP_ORIGIN="";
    `,
    path: `export default {};`,
  });
  const invoke = async (method, path, request) => {
    const handler = harness.routes.get(`${method} ${path}`);
    assert.equal(typeof handler, "function", `registered ${method} ${path}`);
    const response = responseHarness();
    await handler(request, response);
    return response;
  };
  const request = (userId, params, body = {}) => ({
    isAuthenticated: () => Boolean(userId),
    user: userId ? { id: userId } : undefined,
    params,
    body,
  });
  const tierBody = {
    name: "Supporter",
    priceCents: 500,
    interval: "month",
  };

  try {
    assert.ok(module.default);
    const deniedCreate = await invoke(
      "POST",
      "/:storefrontId/membership-tiers",
      request("not-owner", { storefrontId: "store-owned" }, tierBody),
    );
    assert.equal(deniedCreate.statusCode, 403);

    const deniedUpdate = await invoke(
      "PUT",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-other" }, { name: "Hijacked" }),
    );
    assert.equal(deniedUpdate.statusCode, 403);
    const deniedReassignment = await invoke(
      "PUT",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-owned" }, {
        name: "Move to another storefront",
        storefrontId: "store-other",
      }),
    );
    assert.equal(deniedReassignment.statusCode, 403);
    const deniedDelete = await invoke(
      "DELETE",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-other" }),
    );
    assert.equal(deniedDelete.statusCode, 403);
    assert.deepEqual(state.mutations, { stripe: 0, storage: 0 });
    assert.deepEqual(state.serviceCalls, []);

    const missingStorefront = await invoke(
      "POST",
      "/:storefrontId/membership-tiers",
      request("owner", { storefrontId: "store-missing" }, tierBody),
    );
    assert.equal(missingStorefront.statusCode, 404);
    assert.equal(missingStorefront.body.error, "Storefront not found");
    const missingUpdate = await invoke(
      "PUT",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-missing" }, { name: "Missing" }),
    );
    assert.equal(missingUpdate.statusCode, 404);
    const missingDelete = await invoke(
      "DELETE",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-missing" }),
    );
    assert.equal(missingDelete.statusCode, 404);
    assert.deepEqual(state.mutations, { stripe: 0, storage: 0 });
    assert.deepEqual(state.serviceCalls, []);

    const created = await invoke(
      "POST",
      "/:storefrontId/membership-tiers",
      request("owner", { storefrontId: "store-owned" }, tierBody),
    );
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.id, "tier-created");

    const updated = await invoke(
      "PUT",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-owned" }, {
        name: "Updated",
        storefrontId: "store-owned",
      }),
    );
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.name, "Updated");
    assert.equal(updated.body.storefrontId, "store-owned");

    const deleted = await invoke(
      "DELETE",
      "/membership-tiers/:tierId",
      request("owner", { tierId: "tier-owned" }),
    );
    assert.equal(deleted.statusCode, 200);
    assert.deepEqual(state.serviceCalls, [
      ["create", "store-owned"],
      ["update", "tier-owned", "owner"],
      ["delete", "tier-owned", "owner"],
    ]);
    assert.deepEqual(state.mutations, { stripe: 1, storage: 3 });
  } finally {
    delete globalThis.__outboundMembershipAuth;
  }
});