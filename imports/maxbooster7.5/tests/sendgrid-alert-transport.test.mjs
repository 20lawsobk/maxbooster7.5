import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import http from "node:http";
import { build } from "esbuild";
import express from "express";
import { sendSendGridAlert } from "../server/lib/sendgridAlertTransport.ts";

const key = "owned-alert-fixture-token";
const message = { to: ["first@example.test", "second@example.test"], from: "monitor@example.test", subject: "Queue alert 日本語", text: "Queue failed", html: "<p>Queue failed</p>" };
const alert = { severity: "critical", title: "<img src=x onerror=alert(1)>", message: "A & B <script>unsafe</script>", timestamp: new Date("2026-10-27T12:00:00Z"), metadata: { detail: '<a href="bad">' } };

async function service(t, fetcher, configured = true, webhook = false, routerMode = false) {
  const id = `alert-test-${randomUUID()}`;
  globalThis[id] = [];
  t.after(() => { delete globalThis[id]; });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  t.after(() => { globalThis.fetch = oldFetch; });
  const oldRecipients = process.env.ALERT_EMAIL_RECIPIENTS, oldWebhook = process.env.ALERT_WEBHOOK_URL;
  process.env.ALERT_EMAIL_RECIPIENTS = " first@example.test, ,second@example.test,first@example.test ";
  if (webhook) process.env.ALERT_WEBHOOK_URL = "https://owned-webhook.example.test/alert"; else delete process.env.ALERT_WEBHOOK_URL;
  t.after(() => {
    if (oldRecipients === undefined) delete process.env.ALERT_EMAIL_RECIPIENTS; else process.env.ALERT_EMAIL_RECIPIENTS = oldRecipients;
    if (oldWebhook === undefined) delete process.env.ALERT_WEBHOOK_URL; else process.env.ALERT_WEBHOOK_URL = oldWebhook;
  });
  const source = await readFile(process.env.MAXBOOSTER_ALERT_BASELINE_FILE || new URL("../server/monitoring/alertingService.ts", import.meta.url), "utf8");
  const result = await build({
    stdin: routerMode
      ? { contents: "export { default as router } from './routes/monitoring.ts';", loader: "ts", resolveDir: new URL("../server/", import.meta.url).pathname }
      : { contents: source, loader: "ts", resolveDir: new URL("../server/monitoring/", import.meta.url).pathname },
    bundle: true, platform: "node", format: "esm", write: false,
    plugins: [{ name: "owned-alert-boundaries", setup(b) {
      b.onResolve({ filter: /(?:^|\/)logger(?:\.js)?$/ }, () => ({ path: "logger", namespace: "alert-fixture" }));
      b.onResolve({ filter: /config\/env(?:\.js)?$/ }, () => ({ path: "env", namespace: "alert-fixture" }));
      b.onResolve({ filter: /^@sendgrid\/mail$/ }, () => ({ path: "old-sdk", namespace: "alert-fixture" }));
      b.onResolve({ filter: /^express$/ }, () => ({ path: import.meta.resolve("express"), external: true }));
      b.onResolve({ filter: /\/(?:queueMonitor|aiModelManager|metricsCollector|maxcoreSync)(?:\.js)?$/ }, () => ({ path: "unused", namespace: "alert-fixture" }));
      b.onResolve({ filter: /middleware\/errorHandler(?:\.js)?$/ }, () => ({ path: "handler", namespace: "alert-fixture" }));
      b.onResolve({ filter: /middleware\/auth(?:\.js)?$/ }, () => ({ path: "auth", namespace: "alert-fixture" }));
      b.onLoad({ filter: /server\/monitoring\/alertingService\.ts$/ }, () => process.env.MAXBOOSTER_ALERT_BASELINE_FILE ? { contents: source, loader: "ts" } : undefined);
      b.onLoad({ filter: /server\/routes\/monitoring\.ts$/ }, async () => process.env.MAXBOOSTER_MONITORING_BASELINE_FILE ? { contents: await readFile(process.env.MAXBOOSTER_MONITORING_BASELINE_FILE, "utf8"), loader: "ts" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "alert-fixture" }, args => ({ contents: args.path === "env"
        ? `export const env = ${JSON.stringify({ SENDGRID_API_KEY: configured ? key : undefined, SENDGRID_FROM_EMAIL: message.from })};`
        : args.path === "unused" ? "export const queueMonitor = {}, aiModelManager = {}, metricsCollector = {}, getMaxCoreModelStateSnapshot = () => null;"
        : args.path === "handler" ? "export const asyncHandler = handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next);"
        : args.path === "auth" ? `export const requireAdmin = (req,res,next) => !req.user ? res.status(401).json({error:'Unauthorized'}) : req.user.role !== 'admin' ? res.status(403).json({error:'Forbidden'}) : next(); export const require2FA = (req,res,next) => !req.user.mfaVerified ? res.status(403).json({error:'Two-factor verification required'}) : next();`
        : args.path === "logger" ? `export const logger = Object.fromEntries(['info','warn','debug','error'].map(level => [level,(...args)=>globalThis[${JSON.stringify(id)}].push({level,args})]));`
          : "export default { setApiKey(){}, async send(){ throw new Error('Old SDK was invoked'); } };" }));
    } }],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  return { subject: routerMode ? module.router : new module.AlertingService(), logs: globalThis[id] };
}

test("actual alert service reaches SendGrid, escapes HTML and keeps recipients private", async t => {
  const requests = [];
  const { subject, logs } = await service(t, async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 202, headers: { "x-message-id": "owned-receipt" } });
  });
  await subject.sendAlert(alert);
  assert.equal(requests.length, 1);
  const { url, init } = requests[0];
  assert.equal(url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(init.redirect, "error");
  assert.equal(init.headers.Authorization, `Bearer ${key}`);
  const payload = JSON.parse(init.body);
  assert.deepEqual(payload.personalizations, message.to.map(email => ({ to: [{ email }] })));
  assert.deepEqual(payload.from, { email: message.from });
  const html = payload.content.find(item => item.type === "text/html").value;
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("A &amp; B &lt;script&gt;unsafe&lt;/script&gt;"));
  assert.ok(html.includes("&lt;a href=\\&quot;bad\\&quot;&gt;"));
  assert.ok(!html.includes("<script>unsafe"));
  assert.ok(logs.some(row => row.level === "info" && /accepted by SendGrid/.test(row.args.join(" "))));
});

test("provider rejection does not consume cooldown; a subsequent accepted attempt does", async t => {
  let calls = 0;
  const { subject, logs } = await service(t, async () => new Response(null, { status: ++calls === 1 ? 429 : 202 }));
  await subject.sendAlert(alert);
  assert.equal(calls, 1);
  assert.equal(logs.filter(row => row.level === "info").length, 0);
  await subject.sendAlert(alert);
  await subject.sendAlert(alert);
  assert.equal(calls, 2);
  assert.equal(logs.filter(row => row.level === "info").length, 1);
});

test("an accepted webhook does not suppress retry of a failed email channel", async t => {
  let emails = 0, webhooks = 0;
  const { subject } = await service(t, async url => {
    if (url === "https://owned-webhook.example.test/alert") { webhooks++; return new Response(null, { status: 204 }); }
    emails++;
    return new Response(null, { status: emails === 1 ? 500 : 202 });
  }, true, true);
  await subject.sendAlert(alert);
  assert.equal(emails, 1); assert.equal(webhooks, 1);
  await subject.sendAlert(alert);
  assert.equal(emails, 2); assert.equal(webhooks, 1);
  await subject.sendAlert(alert);
  assert.equal(emails, 2); assert.equal(webhooks, 1);
});

test("simultaneous identical alerts share one in-flight admission and later cooldown", async t => {
  let accept, calls = 0;
  const { subject } = await service(t, () => { calls++; return new Promise(resolve => { accept = resolve; }); });
  const pending = subject.sendAlert(alert);
  await subject.sendAlert(alert);
  assert.equal(calls, 1);
  accept(new Response(null, { status: 202 }));
  await pending;
  await subject.sendAlert(alert);
  assert.equal(calls, 1);
});

test("unconfigured alert email makes no provider request", async t => {
  const { subject } = await service(t, async () => { assert.fail("No configured key"); }, false);
  await subject.sendAlert(alert);
});

test("invalid addresses, headers, credential and oversized bodies fail before any request", async () => {
  let calls = 0;
  const options = { fetch: async () => { calls++; return new Response(null, { status: 202 }); } };
  for (const invalid of [{ ...message, to: [] }, { ...message, to: ["bad@example.test\r\nBcc: victim@example.test"] }, { ...message, from: "bad" }, { ...message, subject: "Alert\r\nInjected: yes" }, { ...message, to: Array(101).fill("a@example.test") }, { ...message, html: "x".repeat(1024 * 1024) }]) {
    await assert.rejects(sendSendGridAlert(invalid, key, options), /Invalid|size limit/);
  }
  await assert.rejects(sendSendGridAlert(message, "", options), /Invalid/);
  await assert.rejects(sendSendGridAlert(message, `${key}\nsecret`, options), /Invalid/);
  await assert.rejects(sendSendGridAlert(message, key, { ...options, timeoutMs: 10001 }), /Invalid/);
  assert.equal(calls, 0);
});

test("only202 means accepted; redirects and provider bodies never appear in diagnostics", async () => {
  for (const status of [200, 201, 204, 301, 400, 401, 429, 500]) {
    await assert.rejects(sendSendGridAlert(message, key, { fetch: async () => new Response(status === 204 ? null : `sensitive-provider-body ${key}`, { status }) }), error => {
      assert.match(error.message, /^SendGrid rejected alert \(HTTP \d+\)$/);
      assert.ok(!String(error).includes(key));
      assert.ok(!String(error).includes("sensitive-provider-body"));
      return true;
    });
  }
  await assert.rejects(sendSendGridAlert(message, key, { fetch: async () => { throw new Error(`network diagnostic ${key}`); } }), error => error.message === "SendGrid alert request failed" && !String(error).includes(key));
});

test("owned HTTP server verifies serialization, bounded timeout and redirect refusal", async t => {
  let mode = "accept", redirected = 0;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/redirected") { redirected++; response.writeHead(202).end(); return; }
    let body = "";
    for await (const chunk of request) body += chunk;
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    assert.equal(JSON.parse(body).subject, message.subject);
    if (mode === "redirect") response.writeHead(307, { location: "/redirected" }).end();
    else if (mode === "timeout") { /* Intentionally remain pending until caller aborts. */ }
    else response.writeHead(202, { "x-message-id": "owned-local-receipt" }).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const localFetch = (_fixedUrl, init) => fetch(`http://127.0.0.1:${server.address().port}/mail/send`, init);
  const receipt = await sendSendGridAlert(message, key, { fetch: localFetch });
  assert.deepEqual(receipt, { accepted: true, status: 202, messageId: "owned-local-receipt" });
  mode = "redirect";
  await assert.rejects(sendSendGridAlert(message, key, { fetch: localFetch }), /request failed/);
  assert.equal(redirected, 0);
  mode = "timeout";
  const started = Date.now();
  await assert.rejects(sendSendGridAlert(message, key, { fetch: localFetch, timeoutMs: 40 }), /timed out/);
  assert.ok(Date.now() - started < 2000, "Owned slow connection must abort");
  mode = "accept";
  assert.equal((await sendSendGridAlert(message, key, { fetch: localFetch })).accepted, true);
});


async function routeFixture(t, fetcher, configured = true) {
  const requestFetch = globalThis.fetch;
  const { subject: router } = await service(t, fetcher, configured, false, true);
  const app = express();
  app.use(express.json());
  // Only this owned fixture supplies identities; real middleware is separately tested.
  app.use((req, _res, next) => {
    const role = req.get("x-owned-role");
    if (role) req.user = { email: "operator@example.test", role, mfaVerified: req.get("x-owned-mfa") === "verified" };
    next();
  });
  app.use("/api/monitoring", router);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return (headers = { "x-owned-role": "admin", "x-owned-mfa": "verified" }) => requestFetch(`http://127.0.0.1:${server.address().port}/api/monitoring/alerting/test`, { method: "POST", headers });
}

test("actual monitoring route reports provider acceptance and cooldown without claiming delivery", async t => {
  let calls = 0;
  const request = await routeFixture(t, async () => { calls++; return new Response(null, { status: 202 }); });
  const response = await request(); assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.success, true); assert.equal(body.status, "accepted");
  assert.deepEqual(body.acceptedChannels, ["email"]);
  assert.equal(body.message, "Test alert accepted by provider");
  const repeated = await request(); assert.equal(repeated.status, 409);
  assert.equal((await repeated.json()).reason, "cooldown"); assert.equal(calls, 1);
});

test("actual monitoring route reports failed acceptance and permits a later retry", async t => {
  let calls = 0;
  const request = await routeFixture(t, async () => new Response(null, { status: ++calls === 1 ? 500 : 202 }));
  const rejected = await request(); assert.equal(rejected.status, 503);
  const body = await rejected.json(); assert.equal(body.success, false);
  assert.equal(body.status, "failed"); assert.deepEqual(body.failedChannels, ["email"]);
  assert.ok(!JSON.stringify(body).includes(key));
  assert.equal((await request()).status, 202); assert.equal(calls, 2);
});

test("actual monitoring route reports missing channel configuration and honors fixture admission", async t => {
  let calls = 0;
  const request = await routeFixture(t, async () => { calls++; return new Response(null, { status: 202 }); }, false);
  assert.equal((await request({})).status, 401);
  assert.equal((await request({ "x-owned-role": "member", "x-owned-mfa": "verified" })).status, 403);
  assert.equal((await request({ "x-owned-role": "admin" })).status, 403);
  const missing = await request(); assert.equal(missing.status, 503);
  const body = await missing.json(); assert.equal(body.success, false); assert.equal(body.reason, "unconfigured");
  assert.equal(calls, 0);
});
