import { build } from "esbuild";
import { readFile } from "node:fs/promises";

let isolatedModuleSequence = 0;

export async function loadIsolated(entry, mocks = {}) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "inbound-dependency-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "inbound-mock" };
        });
        builder.onLoad({ filter: /.*/, namespace: "inbound-mock" }, args => ({
          contents: mocks[args.path],
          loader: "js",
        }));
      },
    }],
  });
  try {
    const source = `${result.outputFiles[0].text}\n// isolated inbound module ${++isolatedModuleSequence}`;
    return await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function loadIsolatedClosed(entry, mocks = {}) {
  const namesFromImporter = async (importer, specifier) => {
    if (!importer) return [];
    let source;
    try { source = await readFile(importer, "utf8"); } catch { return []; }
    const names = new Set();
    const add = body => {
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
    for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g)) {
      if (match[2] === specifier) add(match[1]);
    }
    for (const match of source.matchAll(/const\s+\{([\s\S]*?)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g)) {
      if (match[2] === specifier) {
        for (const part of match[1].split(",")) {
          const cleaned = part.trim().split(/\s+as\s+/)[0];
          if (/^[A-Za-z_$][\w$]*$/.test(cleaned)) names.add(cleaned);
        }
      }
    }
    return [...names].filter(name => name !== "default");
  };
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "closed-inbound-dependency-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, async args => {
          if (!args.importer) return null;
          return {
            path: args.path,
            namespace: "closed-inbound-mock",
            pluginData: { names: await namesFromImporter(args.importer, args.path) },
          };
        });
        builder.onLoad({ filter: /.*/, namespace: "closed-inbound-mock" }, args => {
          if (Object.hasOwn(mocks, args.path)) {
            return { contents: mocks[args.path], loader: "js" };
          }
          const names = args.pluginData?.names || [];
          const proxy = `
            const proxy=new Proxy(function(){return proxy},{
              get(_target,key){if(key==="then")return undefined;if(key==="stack")return [];return proxy},
              apply(){return proxy},construct(){return proxy}
            });
            ${names.map(name => `export const ${name}=proxy;`).join("\n")}
            export default proxy;
          `;
          return { contents: proxy, loader: "js" };
        });
      },
    }],
  });
  try {
    const source = `${result.outputFiles[0].text}\n// isolated inbound module ${++isolatedModuleSequence}`;
    return await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  } catch {
    throw new Error(`Closed isolated module failed to load: ${entry}`);
  }
}

export function routeHarness() {
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

export function responseHarness() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    redirect(url) { this.redirectTo = url; return this; },
  };
}

export function memoryCommercePool(orderWrites = []) {
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

export const loggerStub = `
export const logger = { info(){}, warn(){}, error(){}, debug(){} };
`;

export const schemaStub = `
export const users={}, workspaceAuditLog={}, storefronts={}, listings={},
  listingLicenseTiers={}, storefrontOrders={}, bogoPromotions={},
  membershipTiers={}, customerMemberships={}, storefrontFollows={},
  storefrontLikes={}, storefrontRatings={}, storefrontDomains={};
export const insertStorefrontSchema={}, updateStorefrontSchema={},
  insertMembershipTierSchema={}, updateMembershipTierSchema={};
`;

export const drizzleStub = `
export const eq=(...x)=>x, and=(...x)=>x, or=(...x)=>x, inArray=(...x)=>x,
  count=(...x)=>x, avg=(...x)=>x, lte=(...x)=>x, gte=(...x)=>x,
  isNull=(...x)=>x, desc=(...x)=>x, sum=(...x)=>x, sql=(...x)=>x;
`;

export async function loadBillingRoutes(state) {
  globalThis.__inboundBilling = state;
  const stripeModule = state.RealStripe
    ? "export default globalThis.__inboundBilling.RealStripe;"
    : "export default class Stripe {constructor(){return globalThis.__inboundBilling.stripe;}}";
  const envModule = state.secretKey
    ? "export const env={STRIPE_SECRET_KEY:globalThis.__inboundBilling.secretKey};"
    : "export const env={STRIPE_SECRET_KEY:'sk_test_contract_only'};";
  const routerStub = `
    export const Router=()=>{const r={
      get:(p,...h)=>{globalThis.__inboundBilling.routes.set('GET '+p,h.at(-1));return r},
      post:(p,...h)=>{globalThis.__inboundBilling.routes.set('POST '+p,h.at(-1));return r},
      put:(p,...h)=>{globalThis.__inboundBilling.routes.set('PUT '+p,h.at(-1));return r},
      patch:(p,...h)=>{globalThis.__inboundBilling.routes.set('PATCH '+p,h.at(-1));return r},
      delete:(p,...h)=>{globalThis.__inboundBilling.routes.set('DELETE '+p,h.at(-1));return r},
      use(){return r}
    };return r;};
  `;
  return loadIsolated("server/routes/billing.ts", {
    express: routerStub,
    stripe: stripeModule,
    "../db": "export const db=globalThis.__inboundBilling.db,pool=globalThis.__inboundBilling.pool;",
    "@shared/schema": schemaStub,
    "drizzle-orm": drizzleStub,
    "../logger": loggerStub,
    "../services/externalServices": "export async function executeStripeOperation(fn){return {data:await fn()};}",
    "../middleware/rateLimiter": "export const billingRateLimiter=()=>{};",
    "../middleware/auth.js": "export const requireAuth=(_q,_s,n)=>n();",
    "../services/notificationService.js": "export const notificationService={};",
    "../services/stripeService.js": "export const stripeService=globalThis.__inboundBilling.stripeService;",
    "../services/instantPayoutService.js": "export const instantPayoutService={};",
    "../config/env.js": envModule,
  });
}
