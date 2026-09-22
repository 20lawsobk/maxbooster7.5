const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const twilio = require("twilio");
const read = path => fs.readFileSync(path, "utf8");
function load(path, mocks, env = {}) {
  const exports = {};
  const output = ts.transpileModule(read(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics.length, 0);
  vm.runInNewContext(output.outputText, { exports, Buffer, Date, process: { env },
    require: id => id in mocks ? mocks[id] : assert.fail(`Unexpected import ${id}`) });
  return exports;
}
const paths = ["/api/webhooks/stripe", "/webhooks/sendgrid", "/api/webhooks/resend",
  "/api/notifications/sms/status", "/api/notifications/sms/incoming"];
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json() {}, sendStatus(code) { this.code = code; } });

test("provider CSRF exceptions are exact POST-only paths, not prefixes or aliases", () => {
  const { csrfProtectionWithExemptions: csrf } = load("server/middleware/csrf.ts", {
    crypto, "../logger.js": { logger: { warn() {} } },
    "../lib/envHelpers.js": { isProductionEnv: () => true },
  });
  for (const path of paths) {
    for (const [method, url, expected] of [
      ["POST", path, true], ["POST", path + "?delivery=1", true],
      ["POST", path + "/evil", false], ["POST", path + "/", false],
      ["PUT", path, false], ["PATCH", path, false], ["DELETE", path, false],
    ]) {
      let next = false;
      const res = response();
      csrf({ method, originalUrl: url, path: url, headers: {}, get() {} }, res, () => { next = true; });
      assert.equal(next, expected, `${method} ${url}`);
      if (!expected) assert.equal(res.code, 403);
    }
  }
  for (const path of ["/api/webhooks/unknown", "/api/stripe/webhook", "/api/sendgrid/webhook", "/api/notifications/preferences"]) {
    const res = response();
    csrf({ method: "POST", path, headers: {}, get() {} }, res, () => assert.fail(path));
    assert.equal(res.code, 403);
  }
});

test("Twilio verifier uses real HMAC, canonical HTTPS URL and flat form values", () => {
  const env = { APP_URL: "https://example.invalid", TWILIO_AUTH_TOKEN: "synthetic-test-token" };
  const { verifySmsWebhook } = load("server/services/smsWebhookVerification.ts", { twilio: { default: twilio } }, env);
  const body = { From: "+15555550100", Body: "STOP" };
  const signature = twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, `${env.APP_URL}/api/notifications/sms/incoming`, body);
  const req = { body, get: () => signature, headers: { host: "attacker.invalid" } };
  assert.equal(verifySmsWebhook(req, "incoming"), true);
  assert.equal(verifySmsWebhook(req, "status"), false);
  assert.equal(verifySmsWebhook({ ...req, body: { ...body, Body: "START" } }, "incoming"), false);
  assert.equal(verifySmsWebhook({ ...req, body: { Body: ["STOP"] } }, "incoming"), false);
  env.APP_URL = "http://example.invalid";
  assert.equal(verifySmsWebhook(req, "incoming"), false);
});

test("governance requires verified Resend raw bytes and Twilio signatures before bypass", async () => {
  const env = { RESEND_WEBHOOK_SECRET: `whsec_${Buffer.alloc(32, 9).toString("base64")}`,
    TWILIO_AUTH_TOKEN: "synthetic", APP_URL: "https://example.invalid" };
  const email = load("server/services/emailWebhookVerification.ts", { "node:crypto": crypto });
  const sms = load("server/services/smsWebhookVerification.ts", { twilio: { default: twilio } }, env);
  const { governanceBoundary } = load("server/middleware/governanceBoundary.ts", {
    "../services/governancePolicyService.js": { enforceMaintenance: (_, res) => res.status(503).json({}) },
    "../services/emailWebhookVerification.js": email, "../services/smsWebhookVerification.js": sms,
  }, env);
  const raw = Buffer.from('{ "type": "email.delivered" }');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { "svix-id": "test-event", "svix-timestamp": timestamp,
    "svix-signature": "v1," + crypto.createHmac("sha256", Buffer.alloc(32, 9)).update(`test-event.${timestamp}.`).update(raw).digest("base64") };
  async function check(path, body, captured, signed = headers, method = "POST") {
    let next = false;
    const res = response();
    await governanceBoundary({ method, path, body, rawBody: captured, get: key => signed[key] }, res, () => { next = true; });
    return { next, code: res.code };
  }
  assert.equal((await check(paths[2], {}, raw)).next, true);
  assert.equal((await check(paths[2], {}, Buffer.from("{}"))).code, 401);
  assert.equal((await check(paths[2], JSON.parse(raw), undefined)).code, 400);
  assert.equal((await check("/webhooks/resend", {}, raw)).code, 503);
  assert.equal((await check(paths[2] + "/evil", {}, raw)).code, 503);
  const body = { From: "+15555550100", Body: "STOP" };
  const signature = twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.APP_URL + paths[4], body);
  assert.equal((await check(paths[4], body, undefined, { "x-twilio-signature": signature })).next, true);
  assert.equal((await check(paths[4], body, undefined, {})).code, 403);
  assert.equal((await check(paths[4], body, undefined, {}, "PUT")).code, 503);
});

test("mount order and raw-body capture preserve the actual callback topology", () => {
  const routes = read("server/routes.ts");
  assert.ok(routes.indexOf('app.use("/api/notifications"') < routes.indexOf('app.get("/api/notifications"'));
  assert.match(routes, /path: "\/api\/webhooks\/resend",[\s\S]*?loader: \(\) => import\("\.\/routes\/webhooks\/resend"\)/);
  const notifications = read("server/routes/notifications.ts");
  assert.ok(notifications.indexOf('router.post("/sms/status"') < notifications.indexOf("router.use(requireAuth)"));
  const index = read("server/index.ts");
  assert.ok(index.indexOf("req.rawBody = buf") < index.indexOf("app.use(csrfProtectionWithExemptions)"));
  assert.match(routes, /tx\.execute<\{ generation: string \}>/);
  assert.doesNotMatch(routes, /userCacheInvalidate|userProfileCache/);
});

test("both SMS consumers reject unsigned writes and accept authentic provider receipts", async () => {
  const env = { TWILIO_AUTH_TOKEN: "synthetic", APP_URL: "https://example.invalid" };
  const verifier = load("server/services/smsWebhookVerification.ts", { twilio: { default: twilio } }, env);
  let writes = 0;
  const sms = load("server/services/smsNotificationService.ts", {
    twilio: { default: twilio }, "../db.js": { pool: { query: async () => { writes++; return { rows: [{}] }; } } },
    "./notificationPreferences.js": {}, "./smsWebhookVerification.js": verifier,
  }, env);
  for (const [action, handler, body] of [
    ["status", sms.smsStatusCallback, { MessageSid: "test-receipt", MessageStatus: "delivered" }],
    ["incoming", sms.smsIncomingCallback, { From: "+15555550100", Body: "STOP" }],
  ]) {
    const before = writes;
    const res = { ...response(), type() { return this; }, send() {} };
    await handler({ body, get: () => "invalid" }, res);
    assert.equal(res.code, 403);
    assert.equal(writes, before);
    const signature = twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, `${env.APP_URL}/api/notifications/sms/${action}`, body);
    await handler({ body, get: () => signature }, res);
    assert.equal(writes, before + 1);
  }
});