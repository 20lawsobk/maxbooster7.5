const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const ts = require("typescript");
function load(source, mocks = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Buffer, Date, console, require: id => id === "node:crypto" ? crypto : id in mocks ? mocks[id] : assert.fail(`Unexpected import ${id}`), ...extra });
  return exports;
}
const read = file => fs.readFileSync(file, "utf8");
const verification = load(read("server/services/emailWebhookVerification.ts"));
const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const timestamp = String(Math.floor(Date.now() / 1000));
const rawSendgrid = Buffer.from('[ { "sg_message_id": "synthetic-message", "event": "delivered", "timestamp": 1700000000, "category": "música" } ]\n');
const sgSignature = crypto.sign("sha256", Buffer.concat([Buffer.from(timestamp), rawSendgrid]), pair.privateKey).toString("base64");
assert.equal(verification.verifySendGridEvent(rawSendgrid, sgSignature, timestamp, publicKey), true);
assert.equal(verification.verifySendGridEvent(Buffer.from(rawSendgrid.toString().trim()), sgSignature, timestamp, publicKey), false);
assert.equal(verification.verifySendGridEvent(rawSendgrid, sgSignature, String(Number(timestamp) - 301), publicKey), false);
assert.equal(verification.verifySendGridEvent(rawSendgrid, "invalid", timestamp, publicKey), false);
const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const rawResend = Buffer.from('{\n "type":"email.bounced", "created_at":"2026-01-01T00:00:00.000Z", "data":{"email_id":"synthetic-email","subject":"música"}\n}');
const id = "synthetic-delivery";
const svix = body => "v1," + crypto.createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.`).update(body).digest("base64");
assert.equal(verification.verifyResendEvent(rawResend, id, timestamp, svix(rawResend), secret), true);
assert.equal(verification.verifyResendEvent(Buffer.from(JSON.stringify(JSON.parse(rawResend))), id, timestamp, svix(rawResend), secret), false);
assert.equal(verification.verifyResendEvent(rawResend, "changed-id", timestamp, svix(rawResend), secret), false);
assert.equal(verification.verifyResendEvent(rawResend, id, timestamp, `v1,bad ${svix(rawResend)}`, secret), true);
assert.equal(verification.fanMailEventFromResend(JSON.parse(rawResend), id).type, "bounced");
assert.equal(verification.fanMailEventFromResend({ type: "email.sent" }, id), null);
assert.throws(() => verification.fanMailEventFromResend({ type: "email.delivered", data: { email_id: "id" } }, id));

function response() { return { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } }; }
async function routes() {
  let resendHandler, sendgridHandler;
  const applied = [], tracked = [];
  load(read("server/routes/webhooks/resend.ts"), {
    express: { Router: () => ({ post: (_, __, handler) => { resendHandler = handler; } }), raw: () => () => {} },
    "../../services/emailWebhookVerification.js": verification,
    "../../services/fanDeliveryService.js": { applyVerifiedFanMailEvent: async event => applied.push(event) },
    "../../logger.js": { logger: { warn() {} } },
  }, { process: { env: { RESEND_WEBHOOK_SECRET: secret } } });
  const req = { rawBody: rawResend, body: { maliciousParsedReplacement: true }, get: key => ({ "svix-id": id, "svix-timestamp": timestamp, "svix-signature": svix(rawResend) })[key] };
  const good = response(); await resendHandler(req, good);
  assert.equal(good.code, 200); assert.equal(applied.length, 1);
  assert.equal(applied[0].providerMessageId, "synthetic-email");
  assert.equal(applied[0].eventId, `resend:${id}`);
  const bad = response(); await resendHandler({ ...req, rawBody: Buffer.from(rawResend.toString() + " ") }, bad);
  assert.equal(bad.code, 401); assert.equal(applied.length, 1);
  const missing = response(); await resendHandler({ ...req, rawBody: undefined }, missing);
  assert.equal(missing.code, 400); assert.equal(applied.length, 1);
  load(read("server/routes/webhooks/sendgrid.ts"), {
    express: { Router: () => ({ post: (_, __, handler) => { sendgridHandler = handler; } }), raw: () => () => {} },
    "../../services/emailTrackingService.js": { emailTrackingService: {
      verifySendGridSignature: (raw, sig, stamp) => verification.verifySendGridEvent(raw, sig, stamp, publicKey),
      recordEmailEvent: async event => tracked.push(event),
    } },
    "../../logger.js": { logger: { warn() {} } },
  }, { process: { env: { SENDGRID_WEBHOOK_PUBLIC_KEY: publicKey } } });
  const sgReq = { rawBody: rawSendgrid, body: {}, headers: {
    "x-twilio-email-event-webhook-signature": sgSignature, "x-twilio-email-event-webhook-timestamp": timestamp,
  } };
  const sgGood = response(); await sendgridHandler(sgReq, sgGood);
  assert.equal(sgGood.code, 200); assert.equal(tracked.length, 1);
  const sgBad = response(); await sendgridHandler({ ...sgReq, rawBody: Buffer.from(rawSendgrid.toString().trim()) }, sgBad);
  assert.equal(sgBad.code, 401); assert.equal(tracked.length, 1);
}
async function storageReaders() {
  const context = { process: { env: { SOCIAL_CREDENTIAL_ENCRYPTION_KEY: "02".repeat(32) } } };
  const codec = load(read("server/services/socialCredentialCodec.ts"), {}, context);
  let row = { accessToken: codec.encryptSocialCredential("synthetic-token", "user:instagram:access"), platformUserId: "ig", tokenExpiresAt: null };
  const full = read("server/storage.ts");
  const start = full.indexOf("  async getUserSocialAccountDetails(");
  const end = full.indexOf("  async updateUserSocialToken(", start);
  const storage = load(`export class Storage { ${full.slice(start, end)} }`, {}, {
    decryptSocialCredential: codec.decryptSocialCredential,
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) },
    socialAccounts: {}, eq() {}, and() {}, logger: { warn() {} },
  });
  assert.equal(await new storage.Storage().getUserSocialToken("user", "instagram"), "synthetic-token");
  assert.equal((await new storage.Storage().getUserSocialAccountDetails("user", "instagram")).accessToken, "synthetic-token");
  await assert.rejects(new storage.Storage().getUserSocialToken("other", "instagram"));
  row = { ...row, tokenExpiresAt: new Date(0) };
  assert.equal(await new storage.Storage().getUserSocialToken("user", "instagram"), null);
}
Promise.all([routes(), storageReaders()]).then(() => console.log("Provider exact-byte signatures, verified fan dispatcher, and storage decryption tests passed"))
  .catch(error => { console.error(error); process.exitCode = 1; });