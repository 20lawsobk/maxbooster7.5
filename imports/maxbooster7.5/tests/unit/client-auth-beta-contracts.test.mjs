import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build, transform } from "esbuild";

const bundled = await build({
  entryPoints: ["client/src/components/dialogs/securityContracts.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
});
const contracts = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
function transport(body, status = 200) {
  const calls = [];
  return {
    calls,
    request: async (...args) => { calls.push(args); return response(body, status); },
  };
}

test("beta MFA enrollment/replacement and disable use exact proof fields", async () => {
  const setup = transport({ secret: "simulated-only-secret", qrCode: "data:image/png;base64,test" });
  await contracts.setupFactor(setup.request, false, "");
  await contracts.setupFactor(setup.request, true, "123456");
  assert.deepEqual(setup.calls, [
    ["POST", "/api/auth/2fa/setup", {}],
    ["POST", "/api/auth/2fa/setup", { currentCode: "123456" }],
  ]);
  await assert.rejects(contracts.setupFactor(setup.request, true, ""), /current authenticator/);
  assert.equal(setup.calls.length, 2);
  await assert.rejects(contracts.setupFactor(transport({}).request, false, ""), /valid setup/);
  const disable = transport({ success: true });
  await contracts.disableFactor(disable.request, "password-fixture", "234567");
  await contracts.disableFactor(disable.request, "", "345678");
  assert.deepEqual(disable.calls, [
    ["POST", "/api/auth/2fa/disable", { password: "password-fixture", code: "234567" }],
    ["POST", "/api/auth/2fa/disable", { code: "345678" }],
  ]);
  await assert.rejects(contracts.disableFactor(transport({ success: false }).request, "", "345678"), /not confirm/);
});

test("beta reauthentication/replayed-code failures stay explicit, no automatic replay", async () => {
  for (const error of [
    { message: "Recent authentication required", details: { requiresReauthentication: true } },
    { message: "Recent authentication required", requiresReauthentication: true },
    { message: "Invalid or replayed code", status: 403 },
  ]) assert.match(contracts.securityError(error), /Sign out, sign in again.*five minutes.*fresh code/);
  assert.match(contracts.freshCodeGuidance, /single-use.*fresh six-digit/);
  let attempts = 0;
  const unavailable = async () => { attempts++; throw new Error("Authority unavailable"); };
  await assert.rejects(contracts.setupFactor(unavailable, true, "123456"), /Authority unavailable/);
  assert.equal(attempts, 1);
});

test("beta erasure requires 202 accepted/not-erased; OAuth may omit password", async () => {
  const accepted = { accepted: true, erased: false, request: { status: "pending_policy" } };
  const queued = transport(accepted, 202);
  assert.equal((await contracts.requestErasure(queued.request, "password-fixture")).erased, false);
  await contracts.requestErasure(queued.request, "");
  assert.deepEqual(queued.calls, [
    ["DELETE", "/api/auth/account", { password: "password-fixture" }],
    ["DELETE", "/api/auth/account", {}],
  ]);
  for (const [body, status] of [[accepted, 200], [{ ...accepted, erased: true }, 202], [{ success: true }, 202]]) {
    await assert.rejects(contracts.requestErasure(transport(body, status).request, ""), /unconfirmed/);
  }
});

test("beta status/cancel contracts distinguish missing, queued, unavailable and rejected", async () => {
  assert.equal(await contracts.erasureStatus(transport({ request: null }).request), null);
  const record = { status: "pending_policy", requested_at: "2026-01-01T00:00:00Z", not_before: "2026-01-31T00:00:00Z" };
  const status = transport({ request: record });
  assert.deepEqual(await contracts.erasureStatus(status.request), record);
  assert.deepEqual(status.calls, [["GET", "/api/auth/account/erasure"]]);
  await assert.rejects(contracts.erasureStatus(transport({}).request), /Invalid erasure status/);
  const cancel = transport({ cancelled: true });
  await contracts.cancelErasure(cancel.request);
  assert.deepEqual(cancel.calls, [["POST", "/api/auth/account/erasure/cancel", {}]]);
  await assert.rejects(contracts.cancelErasure(transport({ cancelled: false }).request), /not confirmed/);
  await assert.rejects(contracts.cancelErasure(async () => { throw new Error("409: No cancellable request"); }), /409/);
  await assert.rejects(contracts.erasureStatus(async () => { throw new Error("503: unavailable"); }), /503/);
});

test("owned consumers parse and retain Settings wiring, expiry and account fences", async () => {
  for (const file of [
    "client/src/pages/Settings.tsx",
    "client/src/components/settings/PrivacySettings.tsx",
    "client/src/components/dialogs/TwoFactorSetupDialog.tsx",
    "client/src/components/dialogs/TwoFactorDisableDialog.tsx",
    "client/src/components/dialogs/DeleteAccountDialog.tsx",
  ]) {
    const source = await readFile(file, "utf8");
    await transform(source, { loader: "tsx" });
    if (file.includes("/dialogs/")) {
      assert.match(source, /offlineIdentity/);
      assert.match(source, /current\(\)/);
    }
  }
  const setup = await readFile("client/src/components/dialogs/TwoFactorSetupDialog.tsx", "utf8");
  assert.match(setup, /10 \* 60_000/);
  assert.match(setup, /\/api\/auth\/2fa\/verify", \{ code \}/);
  const erasure = await readFile("client/src/components/dialogs/DeleteAccountDialog.tsx", "utf8");
  assert.match(erasure, /await logout\(\)/);
  assert.doesNotMatch(erasure, /Account Deleted|permanently deleted|localStorage/);
  const privacy = await readFile("client/src/components/settings/PrivacySettings.tsx", "utf8");
  assert.match(privacy, /<DeleteAccountDialog/);
  assert.doesNotMatch(privacy, /This action is irreversible|Permanently delete all/);
});