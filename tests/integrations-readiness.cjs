const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
function compile(source, scope = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Date, Intl, URL, ...scope });
  return exports;
}
const source = p => readFileSync(p, "utf8");
const policy = compile(source("server/services/notificationPreferences.ts"));
assert.equal(policy.notificationAllowed({ email: { enabled: false } }, "release_live", "email"), false);
assert.equal(policy.notificationAllowed({ email: { enabled: true, categories: { distribution: true } } }, "release_live", "email"), true);
assert.equal(policy.notificationAllowed({ email: true, releases: false }, "release_live", "email"), false);
assert.equal(policy.notificationAllowed({ muteAll: true, push: { enabled: true } }, "security_new_login", "push", new Date(), true), false);
assert.equal(policy.notificationAllowed({}, "system_update", "push"), false);
assert.equal(policy.notificationAllowed({ browser: true }, "system_update", "push"), true);
const quiet = { email: { enabled: true }, quietHours: { enabled: true, timezone: "UTC", startTime: "22:00", endTime: "08:00" } };
assert.equal(policy.notificationAllowed(quiet, "release_live", "email", new Date("2026-01-01T23:00:00Z")), false);
assert.equal(policy.notificationAllowed(quiet, "release_live", "email", new Date("2026-01-01T08:00:00Z")), true);
assert.equal(policy.notificationAllowed({ email: { enabled: true, frequency: "never" } }, "release_live", "email"), false);
const merged = policy.mergeNotificationPreferences({ email: false, sms: { verified: false }, push: { categories: { royalties: false } } }, { email: { frequency: "instant" }, sms: { verified: true, phoneNumber: "+10000000000" }, push: { enabled: true } });
assert.equal(merged.email.enabled, false);
assert.equal(merged.sms.verified, false);
assert.equal(merged.sms.phoneNumber, null);
assert.equal(merged.push.categories.royalties, false);

const scannerSource = source("server/services/distributionDataTransferService.ts");
function scannerMethod(name, next) {
  return scannerSource.slice(scannerSource.indexOf(`  private async ${name}(`), scannerSource.indexOf(next, scannerSource.indexOf(`  private async ${name}(`)));
}
async function scannerTests() {
  const deezer = scannerMethod("fetchDeezerAlbums", "\n  /**");
  const bad = compile(`export class Scanner { ${deezer} }`, { timedFetch: async () => ({ ok: false, status: 503 }), logger: { warn() {} } });
  await assert.rejects(new bad.Scanner().fetchDeezerAlbums("artist", "Artist"), /503/);
  const empty = compile(`export class Scanner { ${deezer} }`, { timedFetch: async () => ({ ok: true, json: async () => ({ data: [] }) }), logger: { warn() {} } });
  assert.equal((await new empty.Scanner().fetchDeezerAlbums("artist", "Artist")).length, 0);
  const soundcloud = scannerMethod("fetchSoundCloudAlbums", "\n  private async fetchBandcampAlbums");
  let requests = 0;
  const capped = compile(`export class Scanner { async getSoundCloudClientId() { return "test"; } ${soundcloud} }`, {
    timedFetch: async url => {
      requests++;
      return { ok: true, json: async () => url.includes("/resolve") ? { id: "artist" } : { collection: [], next_href: "https://example.invalid/next" } };
    }, logger: { warn() {} },
  });
  const result = await new capped.Scanner().fetchSoundCloudAlbums("artist", "Artist");
  assert.equal(result.exhausted, false);
  assert.equal(requests, 201);
  const finished = compile(`export class Scanner { async getSoundCloudClientId() { return "test"; } ${soundcloud} }`, {
    timedFetch: async url => ({ ok: true, json: async () => url.includes("/resolve") ? { id: "artist" } : { collection: [], next_href: null } }),
    logger: { warn() {} },
  });
  assert.equal((await new finished.Scanner().fetchSoundCloudAlbums("artist", "Artist")).exhausted, true);
}
async function transportTests() {
  const mail = compile(source("server/services/emailSendOnce.ts"));
  const request = { operationKey: "fan:campaign:recipient:v1", to: "test@example.invalid", from: "sender@example.invalid", subject: "Test", text: "Test content" };
  let calls = 0;
  let key;
  const accepted = await mail.sendEmailOnce({ emails: { send: async (_, options) => { calls++; key = options.idempotencyKey; return { data: { id: "receipt-1" } }; } } }, request);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.messageId, "receipt-1");
  assert.equal(key, request.operationKey);
  assert.equal(calls, 1);
  const ambiguous = await mail.sendEmailOnce({ emails: { send: async () => { calls++; throw new Error("connection reset"); } } }, request);
  assert.equal(ambiguous.status, "unknown");
  assert.equal(calls, 2); // exactly one call; no queue/retry
  assert.equal((await mail.sendEmailOnce({ emails: { send: async () => ({ error: { name: "validation_error", message: "bad sender" } }) } }, request)).status, "rejected");
  assert.equal((await mail.sendEmailOnce({ emails: { send: async () => ({ data: {} }) } }, request)).status, "unknown");
  await assert.rejects(mail.sendEmailOnce(null, { ...request, operationKey: "" }), /operation key/);
  const crypto = require("node:crypto");
  const testProcess = { env: { SOCIAL_CREDENTIAL_ENCRYPTION_KEY: "01".repeat(32) } };
  const codec = compile(source("server/services/socialCredentialCodec.ts"), { require: id => { assert.equal(id, "node:crypto"); return crypto; }, Buffer, process: testProcess });
  const encrypted = codec.encryptSocialCredential("synthetic-test-token", "u:p:access");
  assert.ok(!encrypted.includes("synthetic-test-token"));
  assert.equal(codec.decryptSocialCredential(encrypted, "u:p:access"), "synthetic-test-token");
  assert.throws(() => codec.decryptSocialCredential(encrypted, "other:p:access"));
  assert.equal(codec.decryptSocialCredential("legacy-test-token", "u:p:access"), "legacy-test-token");
  delete testProcess.env.SOCIAL_CREDENTIAL_ENCRYPTION_KEY;
  assert.throws(() => codec.encryptSocialCredential("test", "u:p:access"), /persistent/);

  let row;
  const pool = { query: async (sql, params) => {
    if (sql.includes("INSERT INTO")) { if (row) return { rows: [] }; row = { payload_hash: params[3], owner: params[4], state: "started" }; return { rows: [{ owner: row.owner }] }; }
    if (sql.includes("SELECT")) return { rows: [row] };
    if (sql.includes("state='completed'")) { row.state = "completed"; row.result = JSON.parse(params[1]); }
    if (sql.includes("state='unknown'")) row.state = "unknown";
    return { rows: sql.includes("RETURNING owner") ? [{ owner: row.owner }] : [] };
  } };
  const repository = compile(source("server/services/distributionSubmissionRepository.ts"), {
    require: id => id === "node:crypto" ? crypto : id === "../db.js" ? { pool } : assert.fail(`Unexpected import ${id}`),
  });
  let creates = 0;
  const create = async checkpoint => { creates++; await checkpoint({ remoteReleaseId: "remote-1" }); return { releaseId: "remote-1" }; };
  await repository.submitDistributionOnce("toolost", "u", "r", { title: "test" }, create);
  assert.equal((await repository.submitDistributionOnce("toolost", "u", "r", { title: "test" }, create)).releaseId, "remote-1");
  assert.equal(creates, 1);
  await assert.rejects(repository.submitDistributionOnce("toolost", "u", "r", { title: "changed" }, create), /changed/);
  row = undefined;
  await assert.rejects(repository.submitDistributionOnce("toolost", "u", "r", {}, async () => { creates++; throw new Error("timeout"); }), /timeout/);
  await assert.rejects(repository.submitDistributionOnce("toolost", "u", "r", {}, create), /unknown outcome/);
  assert.equal(creates, 2);
}
async function postingTests() {
  const full = source("server/services/autoPostingServiceV2.ts");
  const start = full.indexOf("  private async executePost(");
  const method = full.slice(start, full.indexOf("  private async postToPlatform(", start));
  const checkpoints = [];
  const worker = compile(`export class Worker { ${method}
    async postToPlatform(user, platform, content) {
      if (platform === "bad") throw new Error("ambiguous timeout");
      return { platform, success: true, postId: "receipt" };
    }
  }`, {
    storage: { getUser: async () => ({ id: "user" }) },
    checkpointSocialPost: async (_, results) => checkpoints.push(JSON.parse(JSON.stringify(results))),
    logger: { info() {}, warn() {} },
  });
  const result = await new worker.Worker().executePost({ id: "post", userId: "user", platforms: ["good", "bad", "good"], content: { text: "test" } });
  assert.equal(result.length, 2);
  assert.equal(result[0].outcome, "confirmed");
  assert.equal(result[1].outcome, "unknown");
  assert.equal(checkpoints[0][0].outcome, "started");
  assert.equal(checkpoints[1][0].postId, "receipt");
  assert.equal(checkpoints[2][0].outcome, "confirmed");
  assert.equal(checkpoints[2][1].outcome, "started");
  checkpoints.length = 0;
  const recovered = await new worker.Worker().executePost({
    id: "post", userId: "user", platforms: ["good", "bad"],
    results: result, content: { text: "test" },
  });
  assert.equal(checkpoints.length, 0, "existing receipts must not repeat external actions");
  assert.equal(recovered[1].outcome, "unknown");
}
async function smsTests() {
  let sent = 0;
  let state;
  let optedOut = false;
  const provider = () => ({ messages: { create: async () => { sent++; return { sid: "test-receipt", status: "queued" }; } } });
  provider.validateRequest = (_, signature) => signature === "valid-test-signature";
  const pool = { query: async (sql, params) => {
    if (sql.includes("INSERT")) { if (state) return { rows: [] }; state = "started"; return { rows: [{}] }; }
    if (sql.includes("state='accepted'")) state = "accepted";
    if (sql.includes("SELECT state")) return { rows: [{ state, provider_id: "test-receipt" }] };
    if (sql.includes("UPDATE users")) optedOut = params[0] === "+15555550100";
    return { rows: [] };
  } };
  const smsVerification = compile(source("server/services/smsWebhookVerification.ts"), {
    process: { env: { TWILIO_AUTH_TOKEN: "test", APP_URL: "https://example.invalid" } },
    require: id => id === "twilio" ? { default: provider } : assert.fail(`Unexpected import ${id}`),
  });
  const sms = compile(source("server/services/smsNotificationService.ts"), {
    process: { env: { TWILIO_ACCOUNT_SID: "test", TWILIO_AUTH_TOKEN: "test", TWILIO_MESSAGING_SERVICE_SID: "test", APP_URL: "https://example.invalid" } },
    require: id => id === "twilio" ? { default: provider } : id === "../db.js" ? { pool } : id === "./notificationPreferences.js" ? policy : id === "./smsWebhookVerification.js" ? smsVerification : assert.fail(`Unexpected import ${id}`),
  });
  const input = { userId: "u", operationKey: "notification:test", preferences: { sms: { enabled: true, verified: true, phoneNumber: "+15555550100", consentedAt: "2026-01-01" } }, type: "payment_received", title: "Test", message: "Test" };
  assert.equal((await sms.sendSmsNotification(input)).accepted, true);
  assert.equal((await sms.sendSmsNotification(input)).messageId, "test-receipt");
  assert.equal(sent, 1);
  assert.equal((await sms.sendSmsNotification({ ...input, preferences: { sms: { ...input.preferences.sms, consentedAt: null } } })).state, "not_eligible");
  assert.equal((await sms.sendSmsNotification({ ...input, preferences: { sms: { ...input.preferences.sms, stoppedAt: "2026-01-02" } } })).accepted, false);
  const response = { code: null, sendStatus(code) { this.code = code; return this; }, type() { return this; }, send() { return this; } };
  await sms.smsIncomingCallback({ get: () => "invalid", body: { From: "+15555550100", Body: "STOP" } }, response);
  assert.equal(response.code, 403);
  assert.equal(optedOut, false);
  await sms.smsIncomingCallback({ get: () => "valid-test-signature", body: { From: "+15555550100", Body: "STOP" } }, response);
  assert.equal(optedOut, true);

  const label = source("server/services/labelgrid-service.ts");
  const a = label.indexOf("  private static extractList");
  const b = label.indexOf("\n  /**", label.indexOf("  private static parseDeliveryStatusOutlets"));
  const status = compile(`export class LabelGridService { ${label.slice(a, b)} }`).LabelGridService;
  assert.equal(status.normalizeReleaseStatus("unrecognized"), "unknown");
  assert.equal(status.normalizeOutletStatus("unrecognized"), "unknown");
  assert.equal(status.normalizeOutletStatus("live"), "live");
  assert.equal(status.parseDeliveryStatusOutlets({}).length, 0);
  assert.equal(status.parseDeliveryStatusOutlets([{ outlet: "spotify", status: "NEW_STATE" }])[0].rawStatus, "new_state");
}
Promise.all([scannerTests(), transportTests(), postingTests(), smsTests()]).then(() => console.log("Integration readiness: isolated policy, scanner, email, encryption, submission, posting, SMS and LabelGrid status tests passed")).catch(error => { console.error(error); process.exitCode = 1; });