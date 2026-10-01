/**
 * Explicit real Stripe TEST-mode integration. Never include this file in the
 * ordinary credential-free node --test glob; run it directly with only
 * STRIPE_TEST_SECRET=sk_test_... and STRIPE_TEST_CLIENT=pk_test_... supplied.
 * Every production Stripe constructor below is guarded to accept that exact
 * test secret and receives an instrumented real Stripe SDK client.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import Stripe from "stripe";
import { loadBillingRoutes, responseHarness } from "./helpers-inbound.mjs";

let step = "credential validation";
let tracker;
let realStripe;
let testStripeClass;
let sessionIds = [];
let subscriptionIds = [];
let customerIds = [];
let productIds = [];
let priceIds = [];
let shippingRateIds = [];
let chargeIds = [];
let refundIds = [];
let cleanupReport;
let currentHandlerCase = null;
let priorRegistry = { found: false, value: null, invalid: false, manifests: [] };
const reportPath = ".local/payment-processing/inbound-real-stripe-report.json";
const runId = randomUUID().replaceAll("-", "");
const realHandlerCases = [
  "billing create checkout",
  "billing setup checkout",
  "registration checkout and unpaid verification",
  "storefront cart checkout",
  "storefront membership checkout",
  "marketplace checkout",
  "merchant checkout adapter",
  "growth merchandise checkout adapter",
];
const passedHandlerCases = new Set();
const report = {
  schemaVersion: 1,
  runId,
  startedAt: new Date().toISOString(),
  mode: "stripe-test-only",
  status: "RUNNING",
  apiVersions: [],
  tests: Object.fromEntries(realHandlerCases.map(name => [name, { status: "BLOCKED", reason: "not reached" }])),
  resources: [],
  cleanup: [],
  previousRuns: [],
  priorCleanupUnresolved: false,
  priorCleanupEvidence: [],
};

function safeValue(value, allowedPattern, maxLength = 120) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  if (!text || text.length > maxLength || !allowedPattern.test(text)) return undefined;
  return text;
}

function safeDiagnostic(error) {
  const redact = value => String(value ?? "")
    .replace(/\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]+\b/g, "[redacted-key]")
    .replace(/\b(?:pi|cs)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+\b/g, "[redacted-client-secret]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\bclient[_ -]?secret\s*[:=]\s*[^\s,;]+/gi, "client_secret=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 300);
  return {
    ...(safeValue(error?.code, /^[a-z0-9_.-]+$/i) ? { code: safeValue(error.code, /^[a-z0-9_.-]+$/i) } : {}),
    ...(safeValue(error?.param || error?.raw?.param, /^[a-z0-9_.:[\]\-]+$/i) ? { param: safeValue(error.param || error.raw.param, /^[a-z0-9_.:[\]\-]+$/i) } : {}),
    ...(safeValue(error?.type, /^[a-z0-9_.-]+$/i) ? { type: safeValue(error.type, /^[a-z0-9_.-]+$/i) } : {}),
    ...(safeValue(error?.decline_code || error?.raw?.decline_code || error?.reason || error?.raw?.code, /^[a-z0-9_.:-]+$/i)
      ? { reason: safeValue(error.decline_code || error.raw?.decline_code || error.reason || error.raw?.code, /^[a-z0-9_.:-]+$/i) }
      : {}),
    ...(error?.statusCode && Number.isInteger(error.statusCode) ? { statusCode: error.statusCode } : {}),
    ...(error?.message ? { message: redact(error.message) } : {}),
  };
}

async function writeJsonAtomically(path, value) {
  await mkdir(".local/payment-processing", { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function persistReport() {
  await writeJsonAtomically(reportPath, report);
}

function manifestSnapshot(value) {
  const { previousRuns: _previousRuns, ...snapshot } = value;
  return snapshot;
}

function mergePreviousRunManifests(previousReport) {
  const snapshots = [
    ...(Array.isArray(previousReport.previousRuns) ? previousReport.previousRuns : []),
    manifestSnapshot(previousReport),
  ];
  const unique = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const key = `${snapshot.runId || "unknown"}:${snapshot.startedAt || "unknown"}`;
    if (!unique.has(key)) unique.set(key, snapshot);
  }
  return [...unique.values()];
}

function ownershipEntries(manifests) {
  return manifests.flatMap(manifest => (manifest.resources || []).map(resource => ({
    runId: resource.runId,
    type: resource.type,
    id: resource.id,
    status: resource.status,
  })));
}

async function runArchiveGuardSelfTest() {
  const prior = {
    schemaVersion: 1,
    runId: "archive-fixture-prior-run",
    startedAt: "2026-01-01T00:00:00.000Z",
    mode: "stripe-test-only",
    status: "RUNNING",
    resources: [{ type: "checkout_session", id: "cs_test_archive_fixture", status: "CREATED", runId: "archive-fixture-prior-run" }],
    cleanup: [],
  };
  const previousRuns = mergePreviousRunManifests(prior);
  const failurePath = `.local/payment-processing/inbound-real-stripe-archive-self-test-${runId}.json`;
  const injectedPreflightFailure = {
    ...report,
    status: "FAIL",
    failure: { step: "credential validation", code: "STRIPE_TEST_SECRET_MISSING" },
    previousRuns,
  };
  try {
    await writeJsonAtomically(failurePath, injectedPreflightFailure);
    const roundTrip = JSON.parse(await readFile(failurePath, "utf8"));
    assert.equal(roundTrip.failure.step, "credential validation");
    assert.deepEqual(ownershipEntries(roundTrip.previousRuns), ownershipEntries(previousRuns));
    assert.equal(
      roundTrip.previousRuns[0].resources[0].id,
      "cs_test_archive_fixture",
      "the exact prior resource ID must survive a guard failure",
    );
  } finally {
    await rm(failurePath, { force: true });
  }
  console.log("PASS: prior resource-ID journal survives injected credential-preflight failure (no Stripe requests)");
}

async function loadAndArchivePriorManifests() {
  let previous;
  try {
    previous = JSON.parse(await readFile(reportPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      priorRegistry = { found: false, value: null, invalid: true, manifests: [] };
    } else {
      priorRegistry = { found: false, value: null, invalid: false, manifests: [] };
    }
  }
  if (previous) {
    const manifests = mergePreviousRunManifests(previous);
    const expectedOwnership = ownershipEntries(manifests);
    const archiveRoundTrip = JSON.parse(JSON.stringify(manifests));
    assert.deepEqual(ownershipEntries(archiveRoundTrip), expectedOwnership);
    report.previousRuns = archiveRoundTrip;
    priorRegistry = { found: true, value: previous, invalid: false, manifests: archiveRoundTrip };
  }
  // This atomic publish happens before credential/account preflight. Therefore
  // even a guard failure retains the prior exact-ID journals in previousRuns.
  await persistReport();
}

function updateHandlerCase(name, status, error) {
  const diagnostic = error ? safeDiagnostic(error) : {};
  report.tests[name] = { status, ...diagnostic };
  if (status === "PASS") passedHandlerCases.add(name);
}

async function runHandlerCase(name, callback) {
  if (process.argv.includes("--registration-only") && name !== "registration checkout and unpaid verification") {
    updateHandlerCase(name, "SKIP");
    return;
  }
  currentHandlerCase = name;
  updateHandlerCase(name, "RUNNING");
  await persistReport();
  try {
    await callback();
    updateHandlerCase(name, "PASS");
  } catch (error) {
    const status = error?.type === "StripeInvalidRequestError" &&
      /valid head office address.*automatic tax.*test mode/i.test(error.message || "")
      ? "BLOCKED" : "FAIL";
    updateHandlerCase(name, status, error);
    const safe = safeDiagnostic(error);
    console.error(`${status}: ${name}${safe.code ? ` code=${safe.code}` : ""}${safe.param ? ` param=${safe.param}` : ""}${safe.reason ? ` reason=${safe.reason}` : ""}${safe.message ? ` message=${safe.message}` : ""}`);
  } finally {
    currentHandlerCase = null;
    await persistReport();
  }
}

function trackResource(path, result) {
  if (!result?.id) return Promise.resolve();
  let type;
  if (path === "checkout.sessions.create") { sessionIds.push(result.id); type = "checkout_session"; }
  else if (path === "customers.create") { customerIds.push(result.id); type = "customer"; }
  else if (path === "products.create") { productIds.push(result.id); type = "product"; }
  else if (path === "prices.create") { priceIds.push(result.id); type = "price"; }
  else if (path === "shippingRates.create") { shippingRateIds.push(result.id); type = "shipping_rate"; }
  else if (path === "subscriptions.create") { subscriptionIds.push(result.id); type = "subscription"; }
  else if (path === "refunds.create") { refundIds.push(result.id); return Promise.resolve(); }
  if (type && !report.resources.some(resource => resource.type === type && resource.id === result.id)) {
    report.resources.push({ type, id: result.id, status: "CREATED", runId });
    return persistReport();
  }
  return Promise.resolve();
}

async function trackInlineCatalog(session, previous = null) {
  let changed = false;
  const ownerRunId = previous?.runId || runId;
  const wasCleaned = (type, id) => previous?.resources?.some(resource =>
    resource.type === type && resource.id === id && resource.status === "CLEANED");
  for (const item of session?.line_items?.data || []) {
    const price = item?.price;
    if (typeof price?.id === "string" && price.id.startsWith("price_") &&
        !wasCleaned("price", price.id) && !priceIds.includes(price.id)) {
      priceIds.push(price.id);
      report.resources.push({ type: "price", id: price.id, status: "CREATED", runId: ownerRunId, discoveredFrom: "owned checkout session" });
      changed = true;
    }
    const productId = typeof price?.product === "string" ? price.product : price?.product?.id;
    if (typeof productId === "string" && productId.startsWith("prod_") &&
        !wasCleaned("product", productId) && !productIds.includes(productId)) {
      productIds.push(productId);
      report.resources.push({ type: "product", id: productId, status: "CREATED", runId: ownerRunId, discoveredFrom: "owned checkout session" });
      changed = true;
    }
  }
  if (changed) await persistReport();
}

function addOwnedResource(type, id, fields = {}) {
  if (!id || report.resources.some(resource => resource.type === type && resource.id === id)) return false;
  report.resources.push({ type, id, status: "CREATED", runId, ...fields });
  return true;
}

async function setOwnedResourceStatus(type, id, status, diagnostic) {
  const resource = report.resources.find(item => item.type === type && item.id === id);
  if (resource) {
    resource.status = status;
    if (diagnostic && Object.keys(diagnostic).length) resource.diagnostic = diagnostic;
    else delete resource.diagnostic;
    for (const manifest of report.previousRuns) {
      if (manifest.runId !== resource.runId) continue;
      for (const archivedResource of manifest.resources || []) {
        if (archivedResource.type !== type || archivedResource.id !== id) continue;
        archivedResource.status = status;
        if (diagnostic && Object.keys(diagnostic).length) archivedResource.diagnostic = diagnostic;
        else delete archivedResource.diagnostic;
      }
    }
    await persistReport();
  }
}

function instrument(client) {
  const tracedCreates = new Set([
    "checkout.sessions.create",
    "customers.create",
    "products.create",
    "prices.create",
    "shippingRates.create",
    "subscriptions.create",
    "refunds.create",
  ]);
  const wrap = (target, prefix = "") => new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);
      const path = prefix ? `${prefix}.${String(property)}` : String(property);
      if (typeof value === "function") {
        if (tracedCreates.has(path)) {
          return async (...args) => {
            const result = await value.apply(object, args);
            tracker.accepted.push(path);
            await trackResource(path, result);
            return result;
          };
        }
        return value.bind(object);
      }
      if (value && typeof value === "object") return wrap(value, path);
      return value;
    },
  });
  return wrap(client);
}

function configureGuardedStripe(secret) {
  tracker = { accepted: [], constructors: 0, apiVersions: [] };
  testStripeClass = class GuardedStripe {
    constructor(receivedSecret, options) {
      if (receivedSecret !== secret) {
        throw new Error("A production/non-test Stripe key was rejected");
      }
      tracker.constructors++;
      const apiVersion = options?.apiVersion || Stripe.API_VERSION || "SDK_DEFAULT";
      tracker.apiVersions.push(String(apiVersion));
      // Pass the production constructor's full options through unchanged. Only
      // replace the key with the same explicitly validated sk_test credential.
      return instrument(new Stripe(secret, options));
    }
  };
  realStripe = instrument(new Stripe(secret));
  tracker.apiVersions.push(String(Stripe.API_VERSION || "SDK_DEFAULT"));
  globalThis.__inboundRealStripeClass = testStripeClass;
  return realStripe;
}

function captureRouter() {
  const routes = new Map();
  const router = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); return router; },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); return router; },
    put(path, ...handlers) { routes.set(`PUT ${path}`, handlers.at(-1)); return router; },
    patch(path, ...handlers) { routes.set(`PATCH ${path}`, handlers.at(-1)); return router; },
    delete(path, ...handlers) { routes.set(`DELETE ${path}`, handlers.at(-1)); return router; },
    use() { return router; },
  };
  return { routes, router };
}

async function callHandler(routes, method, path, request) {
  const handler = routes.get(`${method} ${path}`);
  assert.equal(typeof handler, "function", `production route ${method} ${path} was not registered`);
  const response = responseHarness();
  await handler(request, response);
  return response;
}

async function assertStripeResponse(response, expectedStatus = 200) {
  const providerReason = typeof response.body?.error === "string" ? response.body.error : "";
  assert.equal(response.statusCode, expectedStatus,
    `real Stripe operation was not accepted by the production handler${providerReason ? `: ${providerReason}` : ""}`);
}

function mockedImports(source) {
  const names = new Set();
  const add = specifier => {
    const body = specifier.replace(/^import\s*/, "").trim();
    const named = body.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const cleaned = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
        if (/^[A-Za-z_$][\w$]*$/.test(cleaned)) names.add(cleaned);
      }
    }
    const first = body.split(",")[0].trim();
    if (first && !first.startsWith("{") && !first.startsWith("*")) names.add("default");
  };
  for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+["'][^"']+["'];/g)) add(`import ${match[1]}`);
  for (const match of source.matchAll(/const\s+\{([\s\S]*?)\}\s*=\s*await\s+import\(\s*["'][^"']+["']\s*\)/g)) {
    for (const part of match[1].split(",")) {
      const cleaned = part.trim().split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(cleaned)) names.add(cleaned);
    }
  }
  return [...names].filter(name => name !== "default" && !["null", "undefined", "true", "false", "async", "await"].includes(name));
}

async function loadRegistrationRoutes(state) {
  const source = await readFile("server/routes.ts", "utf8");
  const names = mockedImports(source);
  const proxySource = names => `
    const proxy=new Proxy(function(){return proxy},{
      get(_t,k){if(k==="then")return undefined;if(k==="stack")return [];return proxy},
      apply(){return proxy},construct(){return proxy}
    });
    ${names.map(name => `export const ${name}=proxy;`).join("\n")}
    export default proxy;
  `;
  const result = await build({
    entryPoints: ["server/routes.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "real-stripe-registration-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          if (!args.importer) return null;
          if (args.path === "crypto" || args.path === "node:crypto") return { path: args.path, external: true };
          return { path: args.path, namespace: "registration-test-boundary" };
        });
        builder.onLoad({ filter: /.*/, namespace: "registration-test-boundary" }, args => {
          let contents = proxySource(names);
          if (args.path === "stripe") contents = "export default globalThis.__inboundRealStripeClass;";
          if (args.path === "./storage.js") contents = "export const storage=globalThis.__inboundRegistration.storage;export default storage;";
          if (args.path === "./db.js") contents = "export const db=globalThis.__inboundRegistration.db,pool=globalThis.__inboundRegistration.pool;";
          if (args.path === "./services/stripeSetup.js") contents = "export function getStripePriceIds(){return globalThis.__inboundRegistration.priceIds;}";
          if (args.path === "./config/defaults.js") contents = "export function getBaseUrl(){return 'https://inbound-test.invalid';}";
          if (args.path === "bcrypt") contents = "export default {hash:async x=>'hash:'+x};export async function hash(x){return 'hash:'+x;}";
          if (args.path === "./services/governancePolicyService.js") contents = "export async function assertRegistrationEnabled(){return true;}";
          if (args.path === "./services/sessionAuthority.js") contents = "export async function sessionAuthority(){return {issue:async()=>'test-generation'};}";
          if (args.path === "fs") contents = "const p=new Proxy(function(){return p},{get(){return p},apply(){return p}});export default p;";
          if (args.path === "child_process") contents = "export const execSync=()=>'';";
          return { contents, loader: "js" };
        });
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

async function ensureSafeAccountState(stripe) {
  step = "test-account balance preflight";
  const balance = await stripe.balance.retrieve();
  assert.equal(balance.livemode, false, "configured Stripe account must be in test mode");
  tracker.accepted.push("balance.retrieve");

  step = "enabled test webhook preflight";
  let startingAfter;
  let enabled = 0;
  do {
    const page = await stripe.webhookEndpoints.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    enabled += page.data.filter(endpoint => endpoint.status === "enabled").length;
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    assert.ok(!page.has_more || startingAfter, "Stripe returned an incomplete webhook page");
  } while (startingAfter);
  assert.equal(enabled, 0, "test account must have zero enabled webhook endpoints");
  tracker.accepted.push("webhookEndpoints.list");
}

async function createCatalogResources(stripe) {
  step = "create isolated test catalog";
  const monthlyProduct = await stripe.products.create({
    name: `Inbound test ${runId} monthly`,
    metadata: { inboundTestRunId: runId },
  });
  const monthlyPrice = await stripe.prices.create({
    product: monthlyProduct.id, unit_amount: 4900, currency: "usd",
    recurring: { interval: "month" },
    metadata: { inboundTestRunId: runId },
  });
  const yearlyPrice = await stripe.prices.create({
    product: monthlyProduct.id, unit_amount: 49000, currency: "usd",
    recurring: { interval: "year" },
    metadata: { inboundTestRunId: runId },
  });
  const productAndPrice = async (name, unitAmount) => {
    const product = await stripe.products.create({
      name: `Inbound test ${runId} ${name}`,
      metadata: { inboundTestRunId: runId },
    });
    const price = await stripe.prices.create({
      product: product.id, unit_amount: unitAmount, currency: "usd",
      metadata: { inboundTestRunId: runId },
    });
    return price;
  };
  const cartPrice = await productAndPrice("cart", 1200);
  const marketplacePrice = await productAndPrice("marketplace", 1299);
  const merchantPrice = await productAndPrice("merchant", 4500);
  const merchPrice = await productAndPrice("merch", 2400);
  const shippingRate = await stripe.shippingRates.create({
    display_name: `Inbound test shipping ${runId}`,
    type: "fixed_amount",
    fixed_amount: { amount: 500, currency: "usd" },
    metadata: { inboundTestRunId: runId },
  });
  return { monthlyPrice, yearlyPrice, cartPrice, marketplacePrice, merchantPrice, merchPrice, shippingRate };
}

async function exerciseBillingAndRegistration(secret, prices) {
  const billing = {
    routes: new Map(),
    secretKey: secret,
    RealStripe: testStripeClass,
    user: { id: `inbound-billing-${runId}`, email: `billing-inbound-${runId}@example.invalid`, stripeCustomerId: null },
    stripeService: {},
  };
  billing.db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => billing.user ? [billing.user] : [] }) }) }),
    update: () => ({ set: change => ({ where: async () => { Object.assign(billing.user, change); return []; } }) }),
  };
  let billingLoadError;
  try { await loadBillingRoutes(billing); } catch (error) { billingLoadError = error; }
  const billingUser = { id: billing.user.id, email: billing.user.email };
  await runHandlerCase("billing create checkout", async () => {
    step = "actual billing create-checkout-session route";
    if (billingLoadError) throw billingLoadError;
    const checkout = await callHandler(billing.routes, "POST", "/create-checkout-session", {
      body: { planId: "monthly" }, user: billingUser,
    });
    await assertStripeResponse(checkout);
    assert.ok(typeof checkout.body.sessionId === "string");
    const billingSession = await realStripe.checkout.sessions.retrieve(checkout.body.sessionId, { expand: ["line_items.data.price"] });
    assert.equal(billingSession.mode, "subscription");
    assert.equal(billingSession.metadata.planId, "monthly");
    assert.equal(billingSession.customer, billing.user.stripeCustomerId);
  });

  await runHandlerCase("billing setup checkout", async () => {
    step = "actual billing setup Checkout route";
    if (billingLoadError) throw billingLoadError;
    const setup = await callHandler(billing.routes, "POST", "/update-payment", { body: {}, user: billingUser });
    await assertStripeResponse(setup);
    const setupSession = sessionIds.at(-1);
    assert.ok(setupSession);
    const retrievedSetup = await realStripe.checkout.sessions.retrieve(setupSession);
    assert.equal(retrievedSetup.mode, "setup");
    assert.equal(retrievedSetup.customer, billing.user.stripeCustomerId);
  });

  const storage = {
    getUserByEmail: async () => null,
    getUserByUsername: async () => null,
    async createUser() { throw new Error("Registration checkout must not create an account"); },
    async updateUser() {},
  };
  const registrationState = { storage, priceIds: { monthly: prices.monthlyPrice.id, yearly: prices.yearlyPrice.id, lifetime: prices.merchPrice.id } };
  globalThis.__inboundRegistration = registrationState;
  await runHandlerCase("registration checkout and unpaid verification", async () => {
    step = "actual registration Checkout and unpaid verification handlers";
    const { registerRoutes } = await loadRegistrationRoutes(registrationState);
    const routes = new Map();
    const app = new Proxy({}, {
      get(_target, method) {
        if (method === "locals") return {};
        if (["use", "set", "disable", "enable"].includes(method)) return () => app;
        if (["get", "post", "put", "patch", "delete", "options"].includes(method)) {
          return (path, ...handlers) => {
            if (typeof path === "string") routes.set(`${String(method).toUpperCase()} ${path}`, handlers.at(-1));
            return app;
          };
        }
        return () => app;
      },
    });
    await registerRoutes({}, app);
    const request = { session: { regenerate: callback => callback(), save: callback => callback() } };
    const registration = await callHandler(routes, "POST", "/api/create-checkout-session", {
      ...request,
      body: {
        tier: "yearly", userEmail: `registration-${runId}@example.invalid`,
        username: `inbound_${runId.slice(0, 20)}`, birthdate: "1990-01-01", artistName: "Inbound Artist",
      },
    });
    await assertStripeResponse(registration);
    assert.ok(typeof registration.body.sessionId === "string");
    const registrationSession = await realStripe.checkout.sessions.retrieve(registration.body.sessionId, { expand: ["line_items.data.price"] });
    assert.equal(registrationSession.mode, "subscription");
    assert.equal(registrationSession.metadata.tier, "yearly");
    assert.equal(registrationSession.line_items.data[0].price.id, prices.yearlyPrice.id);
    const verify = await callHandler(routes, "POST", "/api/verify-checkout-session", {
      ...request, body: { sessionId: registration.body.sessionId },
    });
    await assertStripeResponse(verify, 400);
  });
}

async function exerciseStorefront(secret, prices) {
  const capture = captureRouter();
  const schema = {
    storefronts: {}, listings: {}, bogoPromotions: {}, storefrontOrders: {},
    membershipTiers: {}, customerMemberships: {}, users: {},
  };
  const state = {
    ...capture, routes: capture.routes, router: capture.router, schema,
    secretKey: secret, RealStripe: testStripeClass,
    storefront: { id: `store-${runId}`, userId: `seller-store-${runId}`, slug: `inbound-${runId}`, name: "Inbound Test Shop" },
    listing: { id: `listing-${runId}`, title: "Test beat", genre: "Electronic", priceCents: prices.cartPrice.unit_amount, isPublished: true },
    tier: { id: `tier-${runId}`, storefrontId: `store-${runId}`, isActive: true, priceCents: 4900, currency: "usd", interval: "month", name: "Supporter", stripePriceId: prices.monthlyPrice.id },
    memberships: [],
    writes: [],
  };
  state.db = {
    select() {
      return { from(table) {
        const q = {
          leftJoin() { return q; },
          where() { return q; },
          async limit() {
            if (table === schema.storefronts) return [state.storefront];
            if (table === schema.listings) return [state.listing];
            if (table === schema.bogoPromotions) return [];
            if (table === schema.membershipTiers) return [{ tier: state.tier, storefront: state.storefront }];
            if (table === schema.customerMemberships) return state.memberships;
            return [];
          },
        };
        return q;
      } };
    },
    update(table) {
      return { set: change => ({ where: async () => { state.writes.push({ table, change }); return []; } }) };
    },
    insert(table) { return { values: async value => { state.writes.push({ table, value }); return []; } }; },
  };
  globalThis.__inboundStore = state;
  const stripeModule = "export default globalThis.__inboundStore.RealStripe;";
  const schemaModule = `export const storefronts=globalThis.__inboundStore.schema.storefronts,listings=globalThis.__inboundStore.schema.listings,listingLicenseTiers={},bogoPromotions=globalThis.__inboundStore.schema.bogoPromotions,storefrontOrders=globalThis.__inboundStore.schema.storefrontOrders,membershipTiers=globalThis.__inboundStore.schema.membershipTiers,customerMemberships=globalThis.__inboundStore.schema.customerMemberships,users=globalThis.__inboundStore.schema.users;export const insertStorefrontSchema={},updateStorefrontSchema={},insertMembershipTierSchema={},updateMembershipTierSchema={},storefrontFollows={},storefrontLikes={},storefrontRatings={},storefrontDomains={};`;
  let routeLoadError;
  try {
    globalThis.__inboundStore = state;
    const { loadIsolated } = await import("./helpers-inbound.mjs");
    await loadIsolated("server/routes/storefront.ts", {
      express: "export const Router=()=>globalThis.__inboundStore.router;",
      "../middleware/uploadHandler.js": "export function createHardenedUpload(){const u=()=>{};u.single=()=>()=>{};u.array=()=>()=>{};u.fields=()=>()=>{};u.any=()=>()=>{};return u;}export async function storeUploadedFile(){return {};}",
      "../services/storefrontService": "export const storefrontService={};",
      "../services/hybridStorageService": "export const hybridStorageService={};",
      "@shared/schema": schemaModule,
      stripe: stripeModule,
      "../config/defaults": "export const getBaseUrl=()=> 'https://inbound-test.invalid';",
      "../db": "export const db=globalThis.__inboundStore.db;",
      "drizzle-orm": "export const eq=(...x)=>x,and=(...x)=>x,or=(...x)=>x,inArray=(...x)=>x,count=(...x)=>x,avg=(...x)=>x,lte=(...x)=>x,gte=(...x)=>x,isNull=(...x)=>x,desc=(...x)=>x,sum=(...x)=>x,sql=(...x)=>x;",
      zod: "export class ZodError extends Error{};export const z={};",
      "../logger.js": "export const logger={info(){},warn(){},error(){},debug(){}};",
      dns: "export default {promises:{}};",
      "../modules/domains/dnsValidators.js": "export function validateDomain(){return {valid:true};}",
      "../config/env.js": "export const env={STRIPE_SECRET_KEY:globalThis.__inboundStore.secretKey,APP_URL:'https://inbound-test.invalid'};",
      "../config/storefrontUrls.js": "export const getStorefrontPathUrl=x=>x,STOREFRONT_APP_ORIGIN='https://inbound-test.invalid';",
    });
  } catch (error) {
    routeLoadError = error;
  }
  if (routeLoadError) {
    await runHandlerCase("storefront cart checkout", async () => { throw routeLoadError; });
    await runHandlerCase("storefront membership checkout", async () => { throw routeLoadError; });
    return;
  }

  await runHandlerCase("storefront cart checkout", async () => {
    step = "actual storefront cart Checkout route";
    const cart = await callHandler(state.routes, "POST", "/:id/checkout", {
      isAuthenticated: () => true,
      user: { id: `buyer-inbound-${runId}`, email: `store-buyer-${runId}@example.invalid` },
      params: { id: state.storefront.id },
      body: { listingIds: [state.listing.id], licenseType: "basic" },
    });
    await assertStripeResponse(cart);
    const cartId = sessionIds.at(-1);
    const cartSession = await realStripe.checkout.sessions.retrieve(cartId, { expand: ["line_items.data.price"] });
    assert.equal(cartSession.mode, "payment");
    assert.equal(cartSession.metadata.buyerId, `buyer-inbound-${runId}`);
    assert.equal(JSON.parse(cartSession.metadata.listingIds)[0], state.listing.id);
    assert.equal(cartSession.line_items.data[0].price.unit_amount, prices.cartPrice.unit_amount);
  });

  await runHandlerCase("storefront membership checkout", async () => {
    step = "actual storefront membership Checkout route";
    const membership = await callHandler(state.routes, "POST", "/subscribe/:tierId", {
      isAuthenticated: () => true,
      user: { id: `member-inbound-${runId}`, email: `member-${runId}@example.invalid` },
      params: { tierId: state.tier.id },
      body: {},
    });
    await assertStripeResponse(membership);
    const membershipId = sessionIds.at(-1);
    const membershipSession = await realStripe.checkout.sessions.retrieve(membershipId, { expand: ["line_items.data.price"] });
    assert.equal(membershipSession.mode, "subscription");
    assert.equal(membershipSession.metadata.type, "storefront_membership");
    assert.equal(membershipSession.metadata.tierId, state.tier.id);
    assert.equal(membershipSession.line_items.data[0].price.id, prices.monthlyPrice.id);
  });
}

async function exerciseMarketplaceAndMerchant(prices) {
  let marketOrder;
  const pool = {
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql.includes("SELECT * FROM orders")) return { rows: marketOrder ? [marketOrder] : [] };
          if (sql.includes("INSERT INTO orders")) {
            marketOrder = {
              id: params[0], user_id: params[1], seller_id: params[2], listing_id: params[3],
              license_type: params[4], amount: params[5], currency: "usd", status: "pending",
              license_snapshot: params[6], metadata: params[7], created_at: new Date(),
            };
            return { rows: [marketOrder] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
    async query(sql, params = []) {
      if (sql.includes("UPDATE orders")) {
        Object.assign(marketOrder.metadata, JSON.parse(params[1]));
        return { rows: [] };
      }
      return { rows: marketOrder ? [marketOrder] : [] };
    },
  };
  globalThis.__inboundRealMarketPool = pool;
  const { loadIsolated } = await import("./helpers-inbound.mjs");
  let marketplace;
  let marketplaceLoadError;
  try {
    marketplace = await loadIsolated("server/services/commerce/marketplaceCheckout.ts", {
      "../../db": "export const pool=globalThis.__inboundRealMarketPool;",
      "./settlement": "export async function snapshotMarketplaceTerms(input){return {grossCents:input.metadata.amountCents,feeCents:100};}",
      "./contract": "export function majorUnits(cents){return cents/100;}",
    });
  } catch (error) {
    marketplaceLoadError = error;
  }
  await runHandlerCase("marketplace checkout", async () => {
    step = "actual marketplace frozen Checkout function";
    if (marketplaceLoadError) throw marketplaceLoadError;
    const marketResult = await marketplace.createMarketplaceCheckout(realStripe, {
      buyerId: `buyer-market-${runId}`, sellerId: `seller-market-${runId}`, beatId: `beat-market-${runId}`,
      licenseType: "basic", amountCents: prices.marketplacePrice.unit_amount, licenseSnapshot: { test: true },
      title: "Inbound test beat", successUrl: "https://inbound-test.invalid/ok",
      cancelUrl: "https://inbound-test.invalid/cancel",
    });
    const marketSession = await realStripe.checkout.sessions.retrieve(marketResult.sessionId, { expand: ["line_items.data.price"] });
    assert.equal(marketSession.metadata.commerceKind, "marketplace");
    assert.equal(marketSession.metadata.orderId, marketResult.orderId);
    assert.equal(marketSession.line_items.data[0].price.unit_amount, prices.marketplacePrice.unit_amount);
  });

  const merchantOrder = {
    id: `merchant-inbound-${runId}`, buyer_id: `buyer-merchant-${runId}`, seller_id: `seller-merchant-${runId}`,
    listing_id: `item-merchant-${runId}`, amount_cents: prices.merchantPrice.unit_amount, currency: "usd",
    status: "pending", created_at: new Date(), stripe_session_id: null,
  };
  globalThis.__inboundRealMerchant = {
    async query(sql, params = []) {
      if (sql.startsWith("SELECT *")) return { rows: [merchantOrder] };
      if (sql.startsWith("UPDATE")) { merchantOrder.stripe_session_id = params[1]; return { rows: [] }; }
      return { rows: [] };
    },
  };
  await runHandlerCase("merchant checkout adapter", async () => {
    step = "actual merchant storefront Checkout function";
    const merchant = await loadIsolated("server/services/commerce/merchant.ts", {
      "../../db": "export const pool=globalThis.__inboundRealMerchant;",
      "stripe": "export default globalThis.__inboundRealStripeClass;",
      "./verification": "export async function verifiedPayment(){return {processingFeeCents:100,refundedCents:0,pendingCents:0,disputed:false};}",
      // Preserve the production runtime's repository/provider classes and its
      // commerceStripe constructor; only the SQL pool and Stripe SDK class cross
      // the test boundary.
    });
    const merchantResult = await merchant.createMerchantCheckout({
      orderId: merchantOrder.id, buyerId: merchantOrder.buyer_id,
      successUrl: "https://inbound-test.invalid/merchant-ok",
      cancelUrl: "https://inbound-test.invalid/merchant-cancel",
      idempotencyKey: "inbound-merchant-command",
    });
    const merchantSession = await realStripe.checkout.sessions.retrieve(merchantResult.sessionId, { expand: ["line_items.data.price"] });
    assert.equal(merchantSession.metadata.commerceKind, "merchant");
    assert.equal(merchantSession.metadata.platformFeeCents, String(Math.round(prices.merchantPrice.unit_amount * 0.1)));
    assert.equal(merchantSession.line_items.data[0].price.unit_amount, prices.merchantPrice.unit_amount);
    assert.equal(merchantOrder.stripe_session_id, merchantResult.sessionId);
  });
}

async function exerciseMerchAdapter(prices) {
  step = "actual merchandise adapter shipping/tax Checkout function";
  process.env.STRIPE_MERCH_SHIPPING_RATE_ID = shippingRateIds.at(-1);
  process.env.STRIPE_MERCH_SHIPPING_COUNTRIES = "US";
  process.env.PLATFORM_FEE_PERCENTAGE = "10";
  globalThis.__inboundRealGrowth = {
    async query(sql) {
      if (sql.includes("SELECT o.user_id,p.buyer_id")) {
        return { rows: [{
          user_id: `seller-growth-${runId}`, buyer_id: `buyer-growth-${runId}`, created_at: new Date(),
          checkout_id: null,
        }] };
      }
      return { rows: [] };
    },
  };
  const { loadIsolated } = await import("./helpers-inbound.mjs");
  await runHandlerCase("growth merchandise checkout adapter", async () => {
    step = "actual merchandise adapter shipping/tax Checkout function";
    const growth = await loadIsolated("server/services/commerce/growthMerch.ts", {
      "../merchCheckoutService": "export function installMerchPaymentAdapter(){};export async function applyVerifiedMerchPayment(){};",
      "../../db": "export const pool=globalThis.__inboundRealGrowth;",
      "stripe": "export default globalThis.__inboundRealStripeClass;",
      "./verification": "export async function verifiedPayment(){return {processingFeeCents:80,refundedCents:0,pendingCents:0,disputed:false};}",
      "../../config/defaults": "export const getBaseUrl=()=> 'https://inbound-test.invalid';",
      // Keep the production runtime's Stripe constructor/API options unchanged.
    });
    const result = await growth.stripeMerchPaymentAdapter.createCheckout({
      orderId: `growth-inbound-${runId}`, idempotencyKey: `inbound-growth-command-${runId}`,
      buyerEmail: `growth-buyer-${runId}@example.invalid`, currency: "usd",
      subtotalCents: prices.merchPrice.unit_amount,
      lines: [{ name: "Inbound test merch", quantity: 1, unitAmountCents: prices.merchPrice.unit_amount }],
      shippingAddress: { country: "US" },
    });
    const session = await realStripe.checkout.sessions.retrieve(result.checkoutId, { expand: ["line_items.data.price"] });
    assert.equal(session.metadata.commerceKind, "merch");
    assert.equal(session.automatic_tax.enabled, true);
    assert.equal(session.shipping_options[0].shipping_rate, shippingRateIds.at(-1));
    assert.equal(session.line_items.data[0].price.unit_amount, prices.merchPrice.unit_amount);
  });
}

async function cleanup(stripe, phase = "current-run") {
  const failures = [];
  cleanupReport = { sessions: 0, subscriptions: 0, refunds: 0, shippingRates: 0, prices: 0, products: 0, customers: 0 };
  const attempt = async (type, id, fn) => {
    const ownedResource = report.resources.find(resource => resource.type === type && resource.id === id);
    const cleanupEntry = { phase, runId: ownedResource?.runId || runId, type, id, status: "RUNNING" };
    report.cleanup.push(cleanupEntry);
    await setOwnedResourceStatus(type, id, "CLEANUP_RUNNING");
    await persistReport();
    try {
      await fn();
      cleanupEntry.status = "PASS";
      await setOwnedResourceStatus(type, id, "CLEANED");
    } catch (error) {
      cleanupEntry.status = "FAIL";
      cleanupEntry.diagnostic = safeDiagnostic(error);
      for (const refundEntry of report.cleanup) {
        if (refundEntry.type === "refund" && refundEntry.chargeId === id && refundEntry.status === "RUNNING") {
          refundEntry.status = "FAIL";
          refundEntry.diagnostic = cleanupEntry.diagnostic;
        }
      }
      failures.push(`${type}:${id}`);
      await setOwnedResourceStatus(type, id, "UNRESOLVED", cleanupEntry.diagnostic);
    } finally {
      await persistReport();
    }
  };
  for (const id of sessionIds) {
    await attempt("checkout_session", id, async () => {
      const session = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items.data.price.product"] });
      await trackInlineCatalog(session);
      if (session.status === "open") await stripe.checkout.sessions.expire(id);
      const after = await stripe.checkout.sessions.retrieve(id);
      if (after.status === "expired" || after.status === "complete") cleanupReport.sessions++;
      else throw new Error("session unresolved");
      if (session.subscription) {
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        if (!subscriptionIds.includes(subscriptionId)) {
          subscriptionIds.push(subscriptionId);
          const ownerRunId = report.resources.find(resource => resource.type === "checkout_session" && resource.id === id)?.runId || runId;
          addOwnedResource("subscription", subscriptionId, { runId: ownerRunId, discoveredFrom: `session ${id}` });
          await persistReport();
        }
      }
      if (session.payment_intent) {
        const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
        const intent = await stripe.paymentIntents.retrieve(intentId);
        const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
        if (chargeId && !chargeIds.includes(chargeId)) {
          chargeIds.push(chargeId);
          const ownerRunId = report.resources.find(resource => resource.type === "checkout_session" && resource.id === id)?.runId || runId;
          addOwnedResource("charge", chargeId, { runId: ownerRunId, discoveredFrom: `session ${id}` });
          await persistReport();
        }
      }
    });
  }
  for (const id of subscriptionIds) {
    await attempt("subscription", id, async () => {
      const subscription = await stripe.subscriptions.retrieve(id);
      if (!["canceled", "incomplete_expired"].includes(subscription.status)) await stripe.subscriptions.cancel(id);
      const after = await stripe.subscriptions.retrieve(id);
      if (after.status !== "canceled" && after.status !== "incomplete_expired") throw new Error("subscription unresolved");
      cleanupReport.subscriptions++;
    });
  }
  for (const chargeId of chargeIds) {
    await attempt("charge", chargeId, async () => {
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.paid && !charge.refunded && charge.amount > charge.amount_refunded) {
        const refund = await stripe.refunds.create({
          charge: chargeId, amount: charge.amount - charge.amount_refunded,
        }, { idempotencyKey: `inbound-cleanup:${chargeId}` });
        refundIds.push(refund.id);
        report.cleanup.push({ phase, runId: report.resources.find(resource => resource.type === "charge" && resource.id === chargeId)?.runId || runId, type: "refund", id: refund.id, chargeId, status: "RUNNING" });
        await persistReport();
      }
      const after = await stripe.charges.retrieve(chargeId);
      if (after.paid && after.amount_refunded < after.amount) throw new Error("charge refund unresolved");
      for (const refundEntry of report.cleanup) {
        if (refundEntry.type === "refund" && refundEntry.chargeId === chargeId && refundEntry.status === "RUNNING") {
          refundEntry.status = "PASS";
        }
      }
      cleanupReport.refunds++;
    });
  }
  for (const id of shippingRateIds) {
    await attempt("shipping_rate", id, async () => {
      await stripe.shippingRates.update(id, { active: false });
      const archived = await stripe.shippingRates.retrieve(id);
      if (archived.active) throw new Error("shipping rate unresolved");
      cleanupReport.shippingRates++;
    });
  }
  for (const id of priceIds) {
    await attempt("price", id, async () => {
      await stripe.prices.update(id, { active: false });
      const archived = await stripe.prices.retrieve(id);
      if (archived.active) throw new Error("Price unresolved");
      cleanupReport.prices++;
    });
  }
  for (const id of productIds) {
    await attempt("product", id, async () => {
      await stripe.products.update(id, { active: false });
      const archived = await stripe.products.retrieve(id);
      if (archived.active) throw new Error("Product unresolved");
      cleanupReport.products++;
    });
  }
  for (const id of customerIds) {
    await attempt("customer", id, async () => {
      const subscriptions = await stripe.subscriptions.list({ customer: id, status: "all", limit: 100 });
      for (const subscription of subscriptions.data) {
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
          await stripe.subscriptions.cancel(subscription.id);
        }
      }
      const deleted = await stripe.customers.del(id);
      if (!deleted.deleted) throw new Error("customer unresolved");
      cleanupReport.customers++;
    });
  }
  const unresolved = [];
  if (cleanupReport.sessions !== sessionIds.length) unresolved.push("sessions");
  if (cleanupReport.subscriptions !== subscriptionIds.length) unresolved.push("subscriptions");
  if (cleanupReport.refunds !== chargeIds.length) unresolved.push("charge refunds");
  if (cleanupReport.shippingRates !== shippingRateIds.length) unresolved.push("shipping rates");
  if (cleanupReport.prices !== priceIds.length) unresolved.push("Prices");
  if (cleanupReport.products !== productIds.length) unresolved.push("products");
  if (cleanupReport.customers !== customerIds.length) unresolved.push("customers");
  if (failures.length || unresolved.length) {
    throw new Error(`Owned Stripe test-resource cleanup unresolved: ${[...new Set([...failures, ...unresolved])].join(", ")}`);
  }
}

function rememberRecoveredResource(type, id, bucket, previousRunId, previous = null) {
  if (!id || previous?.resources?.some(resource =>
    resource.type === type && resource.id === id && resource.status === "CLEANED")) return;
  if (!bucket.includes(id)) bucket.push(id);
  if (!report.resources.some(resource => resource.type === type && resource.id === id)) {
    report.resources.push({ type, id, status: "CREATED", runId: previousRunId, recoveredFromRun: previousRunId });
  }
}

async function recoverUnregisteredProviderObjects(stripe, previous) {
  const started = Date.parse(previous.startedAt);
  if (!Number.isFinite(started) || !previous.runId) throw new Error("Prior inbound Stripe run lacks a safe recovery window or run marker");
  const created = {
    gte: Math.max(0, Math.floor(started / 1000) - 60),
    lte: Math.floor(started / 1000) + 900,
  };
  const run = previous.runId;
  const markers = new Set([
    `inbound-billing-${run}`,
    `registration-${run}@example.invalid`,
    `inbound_${run}`,
    `inbound_${run.slice(0, 20)}`,
    `store-${run}`,
    `buyer-inbound-${run}`,
    `member-inbound-${run}`,
    `buyer-market-${run}`,
    `beat-market-${run}`,
    `merchant-inbound-${run}`,
    `growth-inbound-${run}`,
  ]);

  for await (const session of stripe.checkout.sessions.list({ limit: 100, created })) {
    if (!Object.values(session.metadata || {}).some(value => markers.has(value))) continue;
    rememberRecoveredResource("checkout_session", session.id, sessionIds, run, previous);
    if (session.customer) {
      const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
      rememberRecoveredResource("customer", customerId, customerIds, run, previous);
    }
    if (session.subscription) {
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      rememberRecoveredResource("subscription", subscriptionId, subscriptionIds, run, previous);
    }
    if (session.payment_intent) {
      const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
      const intent = await stripe.paymentIntents.retrieve(intentId);
      const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      rememberRecoveredResource("charge", chargeId, chargeIds, run, previous);
    }
    await trackInlineCatalog(await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price.product", "subscription", "payment_intent"],
    }), previous);
  }

  for await (const customer of stripe.customers.list({ limit: 100, created })) {
    if (customer.metadata?.userId === `inbound-billing-${run}` ||
        customer.metadata?.userId === `member-inbound-${run}`) {
      rememberRecoveredResource("customer", customer.id, customerIds, run, previous);
    }
  }
  for await (const product of stripe.products.list({ limit: 100, created })) {
    if (product.metadata?.inboundTestRunId === run) {
      rememberRecoveredResource("product", product.id, productIds, run, previous);
    }
  }
  for await (const price of stripe.prices.list({ limit: 100, created })) {
    if (price.metadata?.inboundTestRunId === run) {
      rememberRecoveredResource("price", price.id, priceIds, run, previous);
    }
  }
  for await (const rate of stripe.shippingRates.list({ limit: 100 })) {
    if (rate.metadata?.inboundTestRunId === run) {
      rememberRecoveredResource("shipping_rate", rate.id, shippingRateIds, run, previous);
    }
  }
  await persistReport();
}

async function cleanupPreviousManifest(stripe, previous) {
  if (!previous || previous.schemaVersion !== 1 || previous.mode !== "stripe-test-only" || !previous.runId) {
    report.priorCleanupUnresolved = true;
    report.priorCleanupEvidence.push({
      status: "UNRESOLVED",
      reason: "Prior report is not a recognized owned-resource manifest; prior objects were not touched.",
    });
    return { runId: previous?.runId || null, status: "UNRESOLVED", priorObjectsMutated: false };
  }

  if (previous.priorCleanupUnresolved === true ||
      previous.recovery?.status === "BLOCKED" ||
      previous.recovery?.status === "MANUAL_RECONCILIATION_CONFIRMED") {
    report.priorCleanupUnresolved = true;
    const evidence = Array.isArray(previous.priorCleanupEvidence) && previous.priorCleanupEvidence.length
      ? previous.priorCleanupEvidence
      : [{ status: "UNRESOLVED", reason: previous.recovery?.reason || "A prior report was blocked before exact cleanup ownership could be established." }];
    for (const item of evidence) {
      if (!report.priorCleanupEvidence.some(existing => JSON.stringify(existing) === JSON.stringify(item))) {
        report.priorCleanupEvidence.push(item);
      }
    }
  }

  report.recovery = { status: "RUNNING", priorRunId: previous.runId };
  for (const resource of previous.resources || []) {
    if (!resource || typeof resource !== "object") {
      report.priorCleanupUnresolved = true;
      report.priorCleanupEvidence.push({ status: "UNRESOLVED", reason: "Prior registry contains a malformed resource entry; that entry was not touched." });
      continue;
    }
    if (resource.status === "CLEANED") continue;
    if (resource.runId !== previous.runId) {
      report.priorCleanupUnresolved = true;
      report.priorCleanupEvidence.push({ status: "UNRESOLVED", reason: "Prior registry contains an entry without matching run ownership; that entry was not touched." });
      continue;
    }
    const bucket = {
      checkout_session: sessionIds,
      subscription: subscriptionIds,
      customer: customerIds,
      product: productIds,
      price: priceIds,
      shipping_rate: shippingRateIds,
      charge: chargeIds,
    }[resource.type];
    const prefix = {
      checkout_session: "cs_",
      subscription: "sub_",
      customer: "cus_",
      product: "prod_",
      price: "price_",
      shipping_rate: "shr_",
      charge: "ch_",
    }[resource.type];
    if (!bucket || typeof resource.id !== "string" || !resource.id.startsWith(prefix)) {
      report.priorCleanupUnresolved = true;
      report.priorCleanupEvidence.push({ status: "UNRESOLVED", reason: "Prior registry contains an unsupported resource entry; that entry was not touched." });
      continue;
    }
    rememberRecoveredResource(resource.type, resource.id, bucket, previous.runId, previous);
  }

  const needsOrphanScan = previous.status === "RUNNING" ||
    (previous.resources || []).some(resource => resource?.status !== "CLEANED") ||
    (previous.cleanup || []).some(entry => entry.status === "FAIL");
  if (needsOrphanScan) {
    try {
      await recoverUnregisteredProviderObjects(stripe, previous);
    } catch (error) {
      report.priorCleanupUnresolved = true;
      report.priorCleanupEvidence.push({ status: "UNRESOLVED", ...safeDiagnostic(error) });
    }
  }
  const priorOwnedResourceCount = sessionIds.length + subscriptionIds.length + customerIds.length +
    productIds.length + priceIds.length + shippingRateIds.length + chargeIds.length;
  if (priorOwnedResourceCount) {
    try {
      await cleanup(stripe, "prior-recovery");
    } catch (error) {
      report.priorCleanupUnresolved = true;
      report.priorCleanupEvidence.push({
        status: "UNRESOLVED",
        priorRunId: previous.runId,
        ...safeDiagnostic(error),
      });
    }
    const unresolved = report.resources.filter(resource =>
      resource.runId === previous.runId && resource.status === "UNRESOLVED");
    if (unresolved.length) {
      report.priorCleanupUnresolved = true;
      report.priorCleanupEvidence.push({
        status: "UNRESOLVED",
        priorRunId: previous.runId,
        resources: unresolved.map(({ type, id }) => ({ type, id })),
      });
    }
    for (const bucket of [sessionIds, subscriptionIds, customerIds, productIds, priceIds, shippingRateIds, chargeIds]) bucket.length = 0;
  }

  return {
    runId: previous.runId,
    status: report.resources.some(resource => resource.runId === previous.runId && resource.status === "UNRESOLVED")
      ? "UNRESOLVED"
      : "PASS",
    priorObjectsMutated: priorOwnedResourceCount > 0,
  };
}

async function cleanupPreviousRunBeforeTests(stripe) {
  if (!priorRegistry.found) {
    report.priorCleanupUnresolved = true;
    report.priorCleanupEvidence.push({
      status: "UNRESOLVED",
      reason: priorRegistry.invalid
        ? "Prior report is invalid; no resource ownership could be established, and no prior objects were touched."
        : "A prior Stripe run predates exact-ID journaling; its cleanup is unverified, and no prior objects were touched.",
    });
    report.recovery = { status: "UNRESOLVED", priorObjectsMutated: false };
    await persistReport();
    return;
  }
  const results = [];
  for (const previous of priorRegistry.manifests) {
    results.push(await cleanupPreviousManifest(stripe, previous));
  }
  report.recovery = {
    status: report.priorCleanupUnresolved ? "UNRESOLVED" : "PASS",
    priorRuns: results,
  };
  await persistReport();
}

async function main() {
  await loadAndArchivePriorManifests();
  const secret = process.env.STRIPE_TEST_SECRET;
  const client = process.env.STRIPE_TEST_CLIENT;
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secret || "")) throw new Error("STRIPE_TEST_SECRET must be an explicit sk_test key");
  if (!/^pk_test_[A-Za-z0-9]+$/.test(client || "")) throw new Error("STRIPE_TEST_CLIENT must be an explicit pk_test key");
  report.credentialValidation = { status: "PASS", secretKeyKind: "explicit test secret", publishableKeyKind: "explicit test publishable key" };

  // Remove every other Stripe environment source and install only the explicitly
  // supplied test credential for production constructors exercised in this process.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("STRIPE_") && key !== "STRIPE_TEST_SECRET" && key !== "STRIPE_TEST_CLIENT") delete process.env[key];
  }
  process.env.STRIPE_SECRET_KEY = secret;
  process.env.APP_URL = "https://inbound-test.invalid";
  process.env.PLATFORM_FEE_PERCENTAGE = "10";

  const stripe = configureGuardedStripe(secret);
  report.apiVersions = [...tracker.apiVersions];
  await persistReport();
  let executionError;
  try {
    await ensureSafeAccountState(stripe);
    report.accountPreflight = { status: "PASS", livemode: false, enabledWebhookCount: 0 };
    await persistReport();
    await cleanupPreviousRunBeforeTests(stripe);
    const prices = await createCatalogResources(stripe);
    await exerciseBillingAndRegistration(secret, prices);
    await exerciseStorefront(secret, prices);
    await exerciseMarketplaceAndMerchant(prices);
    await exerciseMerchAdapter(prices);
  } catch (error) {
    executionError = error;
  }
  step = "owned test-resource cleanup";
  try {
    await cleanup(stripe);
  } catch (error) {
    report.cleanupFailure = safeDiagnostic(error);
    if (!executionError) executionError = error;
    await persistReport();
  }
  if (executionError) throw executionError;

  const passed = passedHandlerCases.size === realHandlerCases.length;
  const currentCleanupPassed = report.cleanup
    .filter(entry => entry.phase === "current-run")
    .every(entry => entry.status === "PASS");
  const currentResourcesPassed = report.resources
    .filter(resource => resource.runId === runId)
    .every(resource => resource.status === "CLEANED");
  const fullyCertified = passed && currentCleanupPassed && currentResourcesPassed &&
    !report.priorCleanupUnresolved;
  report.certification = {
    status: fullyCertified ? "PASS" : "FAIL",
    allEightHandlerCasesPassed: passed,
    currentRunCleanupPassed: currentCleanupPassed && currentResourcesPassed,
    priorCleanupUnresolved: report.priorCleanupUnresolved,
  };
  report.apiVersions = [...new Set(tracker.apiVersions)];
  report.status = fullyCertified ? "PASS" : "FAIL";
  report.finishedAt = new Date().toISOString();
  await persistReport();
  if (!fullyCertified) {
    step = "full certification";
    throw new Error(passed
      ? "Handler results or current cleanup completed, but prior cleanup remains unresolved"
      : "One or more real inbound handler cases failed");
  }
  printReport();
  const versions = [...new Set(tracker.apiVersions)].join(", ");
  console.log(`PASS: all inbound handler cases at API versions ${versions}. Report: ${reportPath}`);
}

const execution = process.env.INBOUND_REAL_STRIPE_ARCHIVE_SELF_TEST === "1"
  ? runArchiveGuardSelfTest()
  : main();

execution.catch(error => {
  if (process.env.INBOUND_REAL_STRIPE_ARCHIVE_SELF_TEST === "1") {
    console.error(`FAIL: local prior-manifest archive self-test — ${safeDiagnostic(error).message || "assertion failed"}`);
    process.exitCode = 1;
    return;
  }
  report.status = "FAIL";
  report.failure = { step, ...safeDiagnostic(error) };
  if (currentHandlerCase && report.tests[currentHandlerCase]?.status === "RUNNING") {
    updateHandlerCase(currentHandlerCase, "FAIL", error);
  }
  for (const name of realHandlerCases) {
    if (report.tests[name]?.status === "RUNNING") updateHandlerCase(name, "FAIL", error);
  }
  for (const name of realHandlerCases) {
    if (report.tests[name]?.status === "BLOCKED" && report.tests[name].reason === "not reached") {
      report.tests[name] = { status: "BLOCKED", reason: step, ...safeDiagnostic(error) };
    }
  }
  if (!report.certification) {
    report.certification = {
      status: "FAIL",
      allEightHandlerCasesPassed: passedHandlerCases.size === realHandlerCases.length,
      currentRunCleanupPassed: false,
      priorCleanupUnresolved: report.priorCleanupUnresolved,
    };
  }
  report.apiVersions = tracker ? [...new Set(tracker.apiVersions)] : [];
  report.finishedAt = new Date().toISOString();
  persistReport().then(() => {
    printReport();
    process.exitCode = 1;
  }).catch(() => {
    console.error(`FAIL: ${step}. Diagnostics report could not be written to ${reportPath}; no provider object or secret was printed.`);
    process.exitCode = 1;
  });
});

function printReport() {
  for (const name of realHandlerCases) {
    const testCase = report.tests[name] || { status: "BLOCKED" };
    const diagnostic = testCase.message ? ` — ${testCase.message}` : "";
    console.log(`${testCase.status} ${name}${diagnostic}`);
  }
  for (const cleanupEntry of report.cleanup) {
    const diagnostic = cleanupEntry.diagnostic?.message ? ` — ${cleanupEntry.diagnostic.message}` : "";
    console.log(`CLEANUP ${cleanupEntry.status} ${cleanupEntry.type} ${cleanupEntry.id}${diagnostic}`);
  }
  if (report.priorCleanupUnresolved) {
    console.error("WARNING: prior unjournaled/uncertain cleanup remains unresolved; no unowned prior objects were mutated.");
  }
  if (report.certification) {
    console.log(`FULL CERTIFICATION ${report.certification.status}: allEightHandlerCasesPassed=${report.certification.allEightHandlerCasesPassed}, currentRunCleanupPassed=${report.certification.currentRunCleanupPassed}, priorCleanupUnresolved=${report.certification.priorCleanupUnresolved}`);
  }
  console.log(`Report saved to ${reportPath}`);
}