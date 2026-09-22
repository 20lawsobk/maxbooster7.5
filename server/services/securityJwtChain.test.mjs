import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { readFile } from "node:fs/promises";

test("real signed JWT chain carries MFA, rotates refresh, and rejects revoked epochs", async () => {
  let epoch = "1";
  const tokens = new Map();
  const refresh = new Map();
  const user = { id: "u", role: "user", twoFactorEnabled: true };
  const storage = {
    getUser: async () => user,
    createJWTToken: async data => { tokens.set(data.id, data); return data; },
    verifyJWTToken: async id => tokens.has(id) && !tokens.get(id).revoked,
    createRefreshToken: async data => {
      const row = { ...data, id: data.token }; refresh.set(data.token, row); return row;
    },
    getRefreshToken: async token => refresh.get(token),
    revokeRefreshToken: async id => { refresh.get(id).revoked = true; },
  };
  const authority = {
    issue: async () => epoch,
    validate: async (_id, candidate) => candidate === epoch,
    revoke: async () => { epoch = String(Number(epoch) + 1); },
  };
  const output = await build({
    entryPoints: ["server/services/jwtAuthService.ts"], bundle: true,
    write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{
      name: "isolated-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /(?:storage|logger|sessionTrackingService|config\/env|envHelpers|sessionAuthority|\/db)(?:\.js)?$/ },
          args => ({ path: args.path, namespace: "boundary" }));
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => {
          const contents = path.includes("sessionAuthority")
            ? "export const sessionAuthority = async () => globalThis.boundary.authority;"
            : path.endsWith("/db.js") ? "export const pool = globalThis.boundary.pool;"
            : path.includes("storage") ? "export const storage = globalThis.boundary.storage;"
            : path.includes("logger") ? "export const logger = {warn(){},info(){}};"
            : path.includes("sessionTracking") ? "export const sessionTracking = {};"
            : path.includes("envHelpers") ? "export const isProductionEnv = () => true;"
            : "export const env = { SESSION_SECRET: 'isolated-test-only-not-a-production-secret-123456' };";
          return { contents, loader: "js" };
        });
      },
    }],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    boundary: { storage, authority, pool: { query: async (sql, [id, token, userId]) => {
      assert.match(sql, /COALESCE\(revoked, false\) = false/);
      const row = refresh.get(token);
      if (!row || row.id !== id || row.userId !== userId || row.revoked) return { rows: [] };
      row.revoked = true; return { rows: [{ id }] };
    } } }, Buffer, console, process: { env: {} },
  });
  const service = new module.exports.JWTAuthService();
  await assert.rejects(service.issueTokens("u", "user", false), /MFA/);
  const pair = await service.issueTokens("u", "user", true, "1");
  assert.equal((await service.verifyAccessToken(pair.accessToken)).mfa, true);
  assert.ok(tokens.has(pair.accessTokenId), "signed JTI and database row ID agree");
  const rotations = await Promise.all([
    service.refreshAccessToken(pair.refreshToken), service.refreshAccessToken(pair.refreshToken),
  ]);
  assert.equal(rotations.filter(Boolean).length, 1, "concurrent refresh has exactly one winner");
  const rotated = rotations.find(Boolean);
  assert.ok(rotated);
  assert.equal(await service.refreshAccessToken(pair.refreshToken), null);
  await authority.revoke();
  assert.equal(await service.verifyAccessToken(pair.accessToken), null);
  assert.equal(await service.refreshAccessToken(rotated.refreshToken), null);
  await assert.rejects(service.issueTokens("u", "user", true, "1"), /revoked/);
  const fresh = await service.issueTokens("u", "user", true, "2");
  assert.ok(await service.verifyAccessToken(fresh.accessToken));
});

test("shared auth integration keeps atomic password epoch changes and mandatory hydration guard", async () => {
  const routes = await readFile("server/routes.ts", "utf8");
  const index = await readFile("server/index.ts", "utf8");
  assert.match(routes, /await consumeTotp\(user.id, user.twoFactorSecret, twoFactorCode\)/);
  assert.match(routes, /app\.use\("\/api\/auth", accountErasureRouter\)/);
  assert.match(routes, /app\.use\("\/api\/auth", createMfaChallengeRouter\(\)\)/);
  assert.match(routes, /const resetUser = await db\.transaction/);
  assert.match(index, /app\.use\(session\(sessionConfig\)\);[\s\S]*?app\.use\(validateSessionAuthority\)/);
  assert.match(routes, /app\.use\(attachUser\);\s*app\.use\(getApplicationContainment\(\)\.guard\);\s*app\.use\(governanceBoundary\)/);
  assert.match(routes, /"\/api\/auth\/token", requireAdmin, require2FA/);
  assert.match(routes, /"\/api\/auth\/token\/revoke", requireAdmin, require2FA/);
  assert.doesNotMatch(routes.slice(0, routes.indexOf("// Auth: Upload avatar")), /await storage\.deleteUser/);
});

test("webhook dispatch pins DNS, refuses mixed/internal results and never follows redirects", async () => {
  const boundary = { answers: [{ address: "8.8.8.8", family: 4 }], status: 204, calls: 0, pinned: null };
  const output = await build({
    entryPoints: ["server/services/webhookDestination.ts"], bundle: true,
    write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "outbound-boundaries", setup(builder) {
      builder.onResolve({ filter: /^node:(https|dns\/promises)$/ },
        args => ({ path: args.path, namespace: "outbound" }));
      builder.onLoad({ filter: /.*/, namespace: "outbound" }, ({ path }) => ({
        loader: "js",
        contents: path.includes("dns") ?
          "export const lookup = async () => globalThis.boundary.answers;" :
          `export function request(url, options, respond) {
            const state = globalThis.boundary;
            state.calls++;
            state.hostname = url.hostname;
            state.agent = options.agent;
            options.lookup(url.hostname, {}, (err, address, family) => { state.pinned = { address, family }; });
            return { on(){}, end(){ respond({ statusCode: state.status, destroy(){} }); } };
          }`,
      }));
    } }],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, { module, exports: module.exports,
    require: createRequire(import.meta.url), boundary, Buffer, URL, AbortSignal, console });
  const post = module.exports.postWebhook;
  await post("https://hooks.example/path", { test: true });
  assert.equal(boundary.hostname, "hooks.example");
  assert.equal(boundary.pinned.address, "8.8.8.8");
  assert.equal(boundary.agent, false);
  boundary.answers.push({ address: "127.0.0.1", family: 4 });
  await assert.rejects(post("https://hooks.example/path", {}), /not a public/);
  assert.equal(boundary.calls, 1);
  boundary.answers.pop(); boundary.status = 302;
  await assert.rejects(post("https://hooks.example/path", {}), /redirects are not followed/);
  assert.equal(boundary.calls, 2, "redirect cannot dispatch a second request");
});

test("maintenance permits exact recovery and verified webhooks, not header spoofing or prefix lookalikes", async () => {
  const output = await build({
    entryPoints: ["server/middleware/governanceBoundary.ts"], bundle: true, write: false,
    format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "governance-boundaries", setup(builder) {
      builder.onResolve({ filter: /(?:governancePolicyService|stripeWebhookSecurity|emailTrackingService)\.js$/ },
        args => ({ path: args.path, namespace: "policy" }));
      builder.onLoad({ filter: /.*/, namespace: "policy" }, ({ path }) => ({
        loader: "js", contents: path.includes("governancePolicy")
          ? `export const enforceMaintenance = (req,res,next) => req.user?.role === "admin" ? next() : res.status(503).json({error:"maintenance"});`
          : path.includes("stripe") ? `export const stripeWebhookMiddleware = (req,res,next) => req.headers["stripe-signature"] === "verified-test-boundary" ? next() : res.status(401).json({error:"invalid signature"});`
          : `export const emailTrackingService = { verifySendGridSignature: () => false };`,
      }));
    } }],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, { module, exports: module.exports,
    require: createRequire(import.meta.url), Buffer, Date });
  const check = async (path, method = "GET", headers = {}, user) => {
    let next = false; let status = 200;
    const req = { path, method, headers, user, get: name => headers[name] };
    const res = { status(value) { status = value; return res; }, json() {} };
    await module.exports.governanceBoundary(req, res, () => { next = true; });
    return { next, status };
  };
  assert.equal((await check("/api/auth/login", "POST")).next, true);
  assert.equal((await check("/login")).next, true);
  assert.equal((await check("/api/auth/login/evil", "POST")).status, 503);
  assert.equal((await check("/api/projects", "GET", { "x-admin-override": "true" })).status, 503);
  assert.equal((await check("/api/projects", "GET", {}, { role: "admin" })).next, true);
  assert.equal((await check("/api/webhooks/stripe", "POST", { "stripe-signature": "fake" })).status, 401);
  assert.equal((await check("/api/webhooks/stripe", "POST", { "stripe-signature": "verified-test-boundary" })).next, true);
  assert.equal((await check("/api/webhooks/stripe/evil", "POST")).status, 503);
});