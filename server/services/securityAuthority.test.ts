import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionAuthority } from "./sessionAuthority.js";
import { createErasureRequests } from "./accountErasureRequests.js";
import { publicAddress, webhookUrl } from "./webhookDestination.js";
import { enforceAssurance, markVerifiedJwtFactor } from "../middleware/authAssurance.js";
import { completeMfaChallenge } from "./mfaChallengeFlow.js";
import { generateSecret, generateSync, verifySync } from "otplib";
import { createFactorRepository } from "./factorRepository.js";
import { createTotpConsumer } from "./totpReplay.js";
import { createHash } from "node:crypto";

test("authority rejects legacy epochs without I/O and propagates unavailable authority", async () => {
  const authority = createSessionAuthority({ query: async () => { throw new Error("offline"); } });
  assert.equal(await authority.validate("u", undefined), false);
  assert.equal(await authority.validate("u", "0"), false);
  await assert.rejects(authority.validate("u", "1"), /offline/);
  await assert.rejects(authority.issue("u"), /offline/);
  await assert.rejects(authority.revoke("u"), /offline/);
});

test("generation revoke is durable, monotonic, parameterized, and distinguishes new login", async () => {
  let generation = 1;
  const authority = createSessionAuthority({ query: async (sql, values) => {
    assert.equal(values[0], "user");
    if (sql.includes("generation + 1")) { generation++; return { rows: [] }; }
    if (sql.includes("RETURNING")) return { rows: [{ generation: String(generation) }] };
    return { rows: values[1] === String(generation) ? [{}] : [] };
  } });
  const old = await authority.issue("user");
  assert.equal(await authority.validate("user", old), true);
  await authority.revoke("user");
  assert.equal(await authority.validate("user", old), false);
  assert.equal(await authority.validate("user", await authority.issue("user")), true);
});

test("webhook policy excludes internal, reserved, mapped and transition addresses", () => {
  for (const ip of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "100.64.0.1",
    "192.168.0.1", "198.18.0.1", "224.0.0.1", "::1", "::ffff:8.8.8.8",
    "fe80::1", "fc00::1", "2002:0808:0808::1", "2001:db8::1", "64:ff9b::808:808"]) {
    assert.equal(publicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(publicAddress(ip), true);
  for (const url of ["http://example.com", "https://u:p@example.com", "https://example.com:8443", "https://example.com/#a"])
    assert.throws(() => webhookUrl(url));
  assert.equal(webhookUrl("https://example.com/callback").pathname, "/callback");
});

test("MFA cannot borrow assurance from other identity or bearer request", () => {
  const res = { status: () => res, json: () => res } as any;
  const req = { user: { id: "u", twoFactorEnabled: true }, headers: {},
    session: { userId: "u", twoFactorVerified: true } } as any;
  assert.equal(enforceAssurance(req, res), true);
  req.session.userId = "other";
  assert.equal(enforceAssurance(req, res), false);
  req.session.userId = "u"; req.headers.authorization = "Bearer token";
  assert.equal(enforceAssurance(req, res), false);
  markVerifiedJwtFactor(req, "u");
  assert.equal(enforceAssurance(req, res), true);
});

test("real TOTP challenge promotes only valid proof, rotates session, preserves revoked epoch", async () => {
  const secret = generateSecret();
  const code = generateSync({ secret, strategy: "totp" });
  let revoked = false;
  let regenerations = 0;
  const makeReq = () => {
    const req: any = { body: { code }, session: {
      pendingMfa: { userId: "u", generation: "3", expiresAt: Date.now() + 60_000 },
      regenerate(cb: (error?: Error) => void) {
        regenerations++;
        req.session = { save: (done: () => void) => done() };
        cb();
      },
    } };
    return req;
  };
  const deps = {
    getUser: async () => ({ id: "u", twoFactorEnabled: true, twoFactorSecret: secret }),
    authority: async () => ({ validate: async (_id: string, epoch: unknown) => !revoked && epoch === "3" }),
    verify: (token: string, key: string) => verifySync({ token, secret: key, strategy: "totp" }).valid,
  };
  const bad = makeReq(); bad.body.code = "not-a-code";
  assert.equal(await completeMfaChallenge(bad, deps), false);
  assert.equal(bad.session.userId, undefined);
  assert.equal(regenerations, 0);
  const good = makeReq();
  assert.equal(await completeMfaChallenge(good, deps), true);
  assert.equal(good.session.pendingMfa, undefined);
  assert.equal(good.session.authGeneration, "3");
  assert.equal(good.session.twoFactorVerified, true);
  assert.equal(regenerations, 1);
  const revokedReq = makeReq(); revoked = true;
  assert.equal(await completeMfaChallenge(revokedReq, deps), false);
  assert.equal(revokedReq.session.userId, undefined);
  await assert.rejects(completeMfaChallenge(makeReq(), {
    ...deps, authority: async () => { throw new Error("offline"); },
  }), /offline/);
});

test("erasure request atomically queues with revocation and reports pending, not erased", async () => {
  let statement = "";
  const queue = createErasureRequests({ query: async (sql, values) => {
    statement = sql; assert.deepEqual(values, ["u"]);
    return { rows: [{ status: "pending_policy" }] };
  } });
  assert.equal((await queue.request("u")).status, "pending_policy");
  assert.match(statement, /WITH account/);
  assert.match(statement, /auth_session_epochs.generation \+ 1/);
  assert.doesNotMatch(statement, /DELETE FROM/);
});

test("factor promotion compares the proved active factor and bumps epoch in one statement", async () => {
  let changed = false;
  const repository = createFactorRepository({ query: async (statement, values) => {
    assert.match(statement, /WITH changed AS/);
    assert.match(statement, /two_factor_secret IS NOT DISTINCT FROM \$2/);
    assert.match(statement, /auth_session_epochs.generation \+ 1/);
    assert.deepEqual(values, ["u", "old-secret", true, "new-secret", true, 123,
      createHash("sha256").update("new-secret").digest("hex")]);
    if (changed) return { rows: [] };
    changed = true; return { rows: [{ generation: "4" }] };
  } });
  assert.equal(await repository.replace("u", "old-secret", true, "new-secret", true, 123), "4");
  await assert.rejects(repository.replace("u", "old-secret", true, "new-secret", true, 123), /changed during/);
});

test("real TOTP proof is consumed once across concurrent consumers and entrypoints", async () => {
  const secret = generateSecret();
  const token = generateSync({ secret, strategy: "totp" });
  let lastStep = -1;
  const database = { query: async (sql: string, values: unknown[]) => {
    assert.match(sql, /two_factor_secret = \$2 FOR UPDATE/);
    assert.match(sql, /last_totp_step < EXCLUDED.last_totp_step/);
    const step = Number(values[2]);
    if (step <= lastStep) return { rows: [] };
    lastStep = step; return { rows: [{ user_id: "u" }] };
  } };
  const podA = createTotpConsumer(database);
  const podB = createTotpConsumer(database);
  const results = await Promise.all([podA("u", secret, token), podB("u", secret, token)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await podB("u", secret, token), false);
  assert.equal(await podA("u", secret, "bad"), false);
  await assert.rejects(
    createTotpConsumer({ query: async () => { throw new Error("offline"); } })(
      "u",
      secret,
      token,
    ),
    /offline/,
  );
});