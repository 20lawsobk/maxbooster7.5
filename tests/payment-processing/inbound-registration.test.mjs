import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { responseHarness } from "./helpers-inbound.mjs";

function namesFromImport(source) {
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
  return [...names].filter(x => x !== "default" && !["null", "undefined", "true", "false", "async", "await"].includes(x));
}

async function loadRegistrationRoutes() {
  const source = await readFile("server/routes.ts", "utf8");
  const importedNames = namesFromImport(source);
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
      name: "registration-inbound-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          if (!args.importer) return null;
          return { path: args.path, namespace: "registration-mock" };
        });
        builder.onLoad({ filter: /.*/, namespace: "registration-mock" }, args => {
          let contents = proxySource(importedNames);
          if (args.path === "./storage.js") contents = `
            export const storage=globalThis.__inboundRegistration.storage;export default storage;`;
          if (args.path === "./db.js") contents = `
            export const db=globalThis.__inboundRegistration.db,pool=globalThis.__inboundRegistration.pool;`;
          if (args.path === "stripe") contents = `
            export default class Stripe {constructor(){return globalThis.__inboundRegistration.stripe;}}`;
          if (args.path === "./services/stripeSetup.js") contents = `
            export function getStripePriceIds(){return {monthly:"price_monthly_contract",yearly:"price_yearly_contract",lifetime:"price_lifetime_contract"};}`;
          if (args.path === "./config/defaults.js") contents = `export function getBaseUrl(){return "https://app.invalid";}`;
          if (args.path === "bcrypt") contents = `
            export default {hash:async x=>"hash:"+x};export async function hash(x){return "hash:"+x;}`;
          if (args.path === "./services/governancePolicyService.js") contents = `
            export async function assertRegistrationEnabled(){return true;}`;
          if (args.path === "./services/sessionAuthority.js") contents = `
            export async function sessionAuthority(){return {issue:async()=> "generation"};}`;
          if (args.path === "crypto") contents = `
            const createHash=()=>({update(){return this},digest:()=>"a".repeat(64)});
            export default {createHash};export {createHash};`;
          if (args.path === "node:crypto") contents = `
            const createHash=()=>({update(){return this},digest:()=>"a".repeat(64)});
            export default {createHash};export {createHash};`;
          if (args.path === "fs") contents = `const p=new Proxy(function(){return p},{get(){return p},apply(){return p}});export default p;`;
          if (args.path === "child_process") contents = `export const execSync=()=>"";`;
          return { contents, loader: "js" };
        });
      },
    }],
  });
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  } catch (error) {
    throw new Error(error.message);
  }
}

test("registration checkout, verification, and account creation execute payment/plan gates before any account write", async () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_contract_only";
  const created = [];
  const updated = [];
  const checkoutCreates = [];
  let currentSession = null;
  const stripe = { checkout: { sessions: {
    create: async (params, options) => {
      checkoutCreates.push({ params, options });
      return { id: "cs_registration", url: "https://checkout.invalid/register" };
    },
    retrieve: async () => currentSession,
  } } };
  const memoryStore = {
    getUserByEmail: async email => email === "taken@example.invalid" ? { id: "existing" } : null,
    getUserByUsername: async username => username === "taken_name" ? { id: "existing" } : null,
    async createUser(user) { const result = { id: "new-user", ...user, password: user.password }; created.push(result); return result; },
    async updateUser(id, change) { updated.push({ id, change }); },
  };
  const noRowsDb = new Proxy({}, { get: () => () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) }) });
  const noRowsPool = { query: async () => ({ rows: [] }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) };
  globalThis.__inboundRegistration = { stripe, storage: memoryStore, db: noRowsDb, pool: noRowsPool };

  const { registerRoutes } = await loadRegistrationRoutes();
  const routes = new Map();
  const app = new Proxy({}, {
    get(_target, method) {
      if (method === "locals") return {};
      if (method === "use" || method === "set" || method === "disable" || method === "enable") return () => app;
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
  const create = routes.get("POST /api/create-checkout-session");
  const verify = routes.get("POST /api/verify-checkout-session");
  const finish = routes.get("POST /api/register-after-payment");
  assert.equal(typeof create, "function");
  assert.equal(typeof verify, "function");
  assert.equal(typeof finish, "function");
  const invoke = async (handler, body, extras = {}) => {
    const res = responseHarness();
    const req = { body, session: { regenerate: callback => callback(), save: callback => callback() }, ...extras };
    await handler(req, res);
    return res;
  };

  const invalidTier = await invoke(create, { tier: "admin", userEmail: "new@example.invalid", username: "new_user", birthdate: "1990-01-01" });
  assert.equal(invalidTier.statusCode, 400);
  const badBirthdate = await invoke(create, { tier: "monthly", userEmail: "new@example.invalid", username: "new_user", birthdate: "2018-01-01" });
  assert.equal(badBirthdate.statusCode, 400);
  const duplicate = await invoke(create, { tier: "monthly", userEmail: "taken@example.invalid", username: "new_user", birthdate: "1990-01-01" });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(checkoutCreates.length, 0);
  const checkout = await invoke(create, { tier: "yearly", userEmail: "new@example.invalid", username: "new_user", birthdate: "1990-01-01", artistName: "  Stage Name  " });
  assert.equal(checkout.statusCode, 200);
  assert.equal(checkoutCreates[0].params.mode, "subscription");
  assert.deepEqual(checkoutCreates[0].params.line_items, [{ price: "price_yearly_contract", quantity: 1 }]);
  assert.equal(checkoutCreates[0].params.metadata.artistName, "Stage Name");
  assert.match(checkoutCreates[0].options.idempotencyKey, /^[a-f0-9]{64}$/);

  currentSession = {
    id: "cs_registration", payment_status: "unpaid", mode: "subscription",
    customer_email: "new@example.invalid", metadata: { tier: "yearly", username: "new_user" },
    line_items: { data: [{ price: { id: "price_yearly_contract" } }] },
  };
  assert.equal((await invoke(verify, { sessionId: "cs_registration" })).statusCode, 400);
  currentSession.payment_status = "paid";
  currentSession.line_items.data[0].price.id = "price_other";
  assert.equal((await invoke(verify, { sessionId: "cs_registration" })).statusCode, 400);
  currentSession.line_items.data[0].price.id = "price_yearly_contract";
  assert.deepEqual((await invoke(verify, { sessionId: "cs_registration" })).body, { verified: true });
  const missingConsent = await invoke(finish, { sessionId: "cs_registration", password: "long-password" });
  assert.equal(missingConsent.statusCode, 400);
  currentSession.payment_status = "unpaid";
  const unpaidFinish = await invoke(finish, { sessionId: "cs_registration", password: "long-password", tosAccepted: true, privacyAccepted: true });
  assert.equal(unpaidFinish.statusCode, 400);
  assert.equal(created.length, 0);
  currentSession.payment_status = "paid";
  const completedRegistration = await invoke(finish, { sessionId: "cs_registration", password: "long-password", tosAccepted: true, privacyAccepted: true });
  assert.equal(completedRegistration.statusCode, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0].password, "hash:long-password");
  assert.equal(updated[0].change.subscriptionTier, "yearly");
  assert.equal(updated[0].change.subscriptionEndsAt instanceof Date, true);
  if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalKey;
});