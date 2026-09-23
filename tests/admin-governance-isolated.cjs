const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");

function load(file, boundaries = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics.length, 0, file);
  const module = { exports: {} };
  const schema = new Proxy({}, { get: (_, table) => new Proxy({ table }, { get: (obj, key) => obj[key] || `${table}.${String(key)}` }) });
  const requireMock = name => {
    if (boundaries[name]) return boundaries[name];
    if (name.includes("schema")) return schema;
    if (name.includes("logger")) return { logger: { info() {}, warn() {} } };
    if (name.includes("emailService")) return { emailService: {} };
    if (name === "drizzle-orm") return {
      eq: (a, b) => ({ a, b }), and: (...conditions) => conditions, or: (...conditions) => conditions,
      inArray: (a, b) => ({ a, b }),
      desc: a => a, sql: (parts, ...values) => ({ parts, values }),
    };
    if (name === "node:crypto") return crypto;
    if (name === "./kycReviewRevision.js") return load("server/services/kycReviewRevision.ts");
    throw new Error(`Unmocked external boundary: ${name}`);
  };
  vm.runInNewContext(output.outputText, { module, exports: module.exports, require: requireMock, console, Date, Set, process: { env: { NODE_ENV: "production" } } });
  return module.exports;
}

test("KYC missing documents remain an actionable checklist", async () => {
  const { KYCService } = load("server/services/kycService.ts", { "../db.js": { db: {} } });
  for (const level of ["basic", "enhanced", "full"]) {
    for (const verificationType of ["individual", "business"]) {
      const service = new KYCService();
      service.getActiveVerification = async () => ({ id: "v1", status: "pending", verificationType, metadata: { level } });
      service.getVerificationDocuments = async () => [];
      const status = await service.getVerificationStatus("owner");
      assert.ok(status.documentChecklist.length);
      assert.ok(status.documentChecklist.every(doc => doc.status === "not_uploaded" && doc.uploadedAt === undefined));
      assert.equal(status.payoutEligible, false);
    }
  }
});

test("verified identity cannot be edited by its owner", async () => {
  const { KYCService } = load("server/services/kycService.ts", { "../db.js": { db: {} } });
  const service = new KYCService();
  service.getVerification = async () => ({ userId: "u1", status: "verified", verificationType: "individual" });
  await assert.rejects(service.updateIndividualInfo("v1", {}, "u1"), /locked/);
});

test("approval requires current reviewed evidence inside a transaction", async () => {
  const verification = { id: "v1", userId: "u1", status: "under_review", verificationType: "individual", metadata: { level: "basic", individualInfo: { firstName: "A", lastName: "B", country: "CA" } } };
  let locked = false;
  const db = {
    transaction: async callback => callback(db),
    select: () => ({ from: table => ({
      where: () => ({
        for: async () => { locked = true; return [verification]; },
        orderBy: async () => [],
      }),
    }) }),
  };
  const { KYCService } = load("server/services/kycService.ts", { "../db.js": { db } });
  const { reviewRevision } = load("server/services/kycReviewRevision.ts");
  await assert.rejects(new KYCService().approveVerification("v1", "admin", undefined, reviewRevision(verification, [])), /evidence/);
  assert.equal(locked, true);
});

test("API token issuance stores only its verifier and audit metadata; owner revocation disables it", async () => {
  const inserts = [];
  let condition;
  let changes;
  const db = {
    transaction: async callback => callback(db),
    insert: table => ({ values: value => {
      inserts.push({ table: table.table, value });
      return { returning: async () => [{ id: "key1" }], then: resolve => resolve() };
    } }),
    update: () => ({ set: value => { changes = value; return {
      where: value => { condition = value; return { returning: async () => [{ id: "key1" }] }; },
    }; } }),
  };
  const service = load("server/services/adminApiTokenService.ts", { "../db.js": { db } });
  const result = await service.issueAdminApiToken("admin1", "127.0.0.1");
  assert.match(result.token, /^mb_live_[a-f0-9]{64}$/);
  assert.equal(inserts[0].value.keyHash, crypto.createHash("sha256").update(result.token).digest("hex"));
  assert.equal(JSON.stringify(inserts).includes(result.token), false);
  assert.equal(inserts[0].value.userId, "admin1");
  assert.deepEqual(Array.from(inserts[0].value.scopes), ["admin"]);
  assert.deepEqual(Array.from(result.scopes), ["admin"]);
  assert.equal(inserts[1].value.details.scope, undefined);
  assert.deepEqual(Array.from(inserts[1].value.details.scopes), ["admin"]);
  assert.ok(result.expiresAt > new Date());
  await service.revokeAdminApiToken("admin1", "key1", "127.0.0.1");
  assert.equal(changes.isActive, false);
  assert.ok(condition.some(c => c.a === "apiKeys.userId" && c.b === "admin1"));
});

test("support metadata mutations are server-side JSONB expressions, not stale snapshots", () => {
  const source = fs.readFileSync("server/services/supportTicketService.ts", "utf8");
  assert.match(source, /metadata: sql`jsonb_set/);
  assert.match(source, /jsonb_agg\(DISTINCT value\)/);
  assert.doesNotMatch(source, /messages: \[\.\.\.existingMessages/);
});

test("existing bearer verifier accepts a matching token, then rejects revocation and expiry", async () => {
  const secret = "mb_live_" + "a".repeat(64);
  const record = {
    id: "key1", userId: "admin1", rateLimit: 100, isActive: true,
    expiresAt: new Date(Date.now() + 60000),
    keyHash: crypto.createHash("sha256").update(secret).digest("hex"),
  };
  const db = {
    select: () => ({ from: () => ({ where: conditions => ({
      limit: async () => conditions.every(c => record[c.a.split(".").pop()] === c.b) ? [record] : [],
    }) }) }),
    update: () => ({ set: () => ({ where: () => ({ execute: async () => {} }) }) }),
  };
  const { validateApiKey } = load("server/services/apiKeyService.ts", {
    "../db": { db }, crypto: { default: crypto },
    "../lib/redisClient.js": { getRedisClient: () => { throw new Error("Unexpected Redis call"); } },
  });
  async function request() {
    let accepted = false;
    let status;
    await validateApiKey({ headers: { authorization: `Bearer ${secret}` } }, {
      status(code) { status = code; return this; }, json() {},
    }, () => { accepted = true; });
    return { accepted, status };
  }
  assert.equal((await request()).accepted, true);
  record.isActive = false;
  assert.equal((await request()).status, 401);
  record.isActive = true;
  record.expiresAt = new Date(0);
  assert.equal((await request()).status, 401);
});

test("moderation removal persists local effect, recipient warning and actor audit", async () => {
  const writes = [];
  let transactionTail = Promise.resolve();
  let lockCalls = 0;
  let failAudit = false;
  const tx = {
    execute: async statement => {
      assert.match(statement.parts.join(""), /pg_advisory_xact_lock/);
      lockCalls++;
    },
    select: () => ({ from: table => ({ where: conditions => ({
      limit: async () => writes.filter(write => write.table === "auditLogs" &&
        write.value.userId === conditions[0].b && write.value.details.idempotencyKey === conditions[2].values[1])
        .map(write => ({ details: write.value.details })),
      for: async () => [{ id: "post1", userId: "owner" }],
      then: resolve => resolve([{ id: "owner" }]),
    }) }) }),
    update: table => ({ set: value => ({ where: async () => writes.push({ table: table.table, value }) }) }),
    insert: table => ({ values: async value => {
      if (failAudit && table.table === "auditLogs") throw new Error("audit unavailable");
      writes.push({ table: table.table, value });
    } }),
  };
  const { moderate } = load("server/services/moderationDecisionService.ts", {
    "../db.js": { db: { transaction: async callback => {
      // Model the repository's transaction/advisory-lock serialization and
      // rollback contract; no actual PostgreSQL is invoked by this test.
      const prior = transactionTail;
      let unlock;
      transactionTail = new Promise(resolve => { unlock = resolve; });
      await prior;
      const before = writes.length;
      try { return await callback(tx); }
      catch (error) { writes.splice(before); throw error; }
      finally { unlock(); }
    } } },
  });
  const result = await moderate({
    actorId: "admin", ip: "127.0.0.1", action: "remove_content", contentId: "post1", reason: "Policy breach", notify: true, idempotencyKey: "moderation-request-1",
  });
  assert.equal(result.notifiedUser, true);
  assert.equal(writes.find(write => write.table === "posts").value.status, "removed");
  assert.equal(writes.find(write => write.table === "notifications").value.userId, "owner");
  assert.equal(writes.find(write => write.table === "auditLogs").value.userId, "admin");
  const replay = await moderate({
    actorId: "admin", ip: "127.0.0.1", action: "remove_content", contentId: "post1", reason: "Policy breach", notify: true, idempotencyKey: "moderation-request-1",
  });
  assert.equal(replay.reviewedAt, result.reviewedAt);
  assert.equal(writes.filter(write => write.table === "notifications").length, 1);
  await assert.rejects(moderate({
    actorId: "admin", ip: "127.0.0.1", action: "warn_user", userId: "owner", reason: "Different", idempotencyKey: "moderation-request-1",
  }), /different command/);
  const repeated = { actorId: "admin", ip: "127.0.0.1", action: "warn_user", userId: "owner", reason: "Warning",
    idempotencyKey: "concurrent-command-1" };
  await Promise.all([moderate(repeated), moderate(repeated), moderate(repeated)]);
  assert.equal(writes.filter(write => write.table === "notifications").length, 2);
  const before = writes.length;
  failAudit = true;
  await assert.rejects(moderate({ ...repeated, idempotencyKey: "rollback-command-1" }), /audit unavailable/);
  assert.equal(writes.length, before);
  failAudit = false;
  await moderate({ ...repeated, actorId: "other-admin" });
  assert.equal(writes.filter(write => write.table === "notifications").length, 3);
  assert.equal(lockCalls, 8);
  for (const action of ["approve", "dismiss", "ban_user"]) {
    await moderate({ actorId: "admin", ip: "127.0.0.1", action, contentId: "post1",
      reason: action, idempotencyKey: `action-contract-${action}` });
    assert.ok(writes.some(write => write.table === "auditLogs" && write.value.action === `moderation.${action}`));
  }
  assert.ok(writes.some(write => write.table === "users" && write.value.subscriptionStatus === "banned"));
});

test("all changed domain modules parse without loading external boundaries", () => {
  for (const file of [
    "server/routes/admin.ts", "server/routes/admin/index.ts", "server/routes/support.ts",
    "server/services/supportTicketService.ts", "server/services/moderationDecisionService.ts",
    "server/services/governancePolicyService.ts", "client/src/pages/SupportTicket.tsx",
    "client/src/pages/AdminDashboard.tsx",
    "client/src/pages/admin/KYCReview.tsx", "server/routes/kyc.ts", "server/middleware/scalableRateLimiter.ts",
  ]) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    assert.equal(source.parseDiagnostics.length, 0, file);
  }
});

test("KYC reviewer digest binds identity/evidence and approval stores an immutable snapshot under parent lock", async () => {
  const { reviewRevision } = load("server/services/kycReviewRevision.ts");
  const verification = { id: "v1", userId: "u1", status: "under_review", verificationType: "individual",
    metadata: { level: "basic", individualInfo: { firstName: "A", lastName: "B", country: "CA" } } };
  const documents = [{ id: "d1", userId: "u1", documentType: "government_id", status: "approved",
    verifiedAt: new Date(), documentUrl: "immutable/d1", metadata: { verificationId: "v1", reviewedBy: "staff" } }];
  let locked = false;
  let mutations = 0;
  const db = {
    transaction: callback => callback(db),
    select: () => ({ from: table => ({ where: () => ({
      for: async () => { locked = true; return [verification]; },
      orderBy: async () => documents,
      then: resolve => resolve(table.table === "kycDocuments" ? documents : [verification]),
    }) }) }),
    update: () => ({ set: changes => ({ where: () => ({ returning: async () => {
      assert.equal(locked, true);
      mutations++;
      Object.assign(verification, changes);
      return [verification];
    } }) }) }),
  };
  const { KYCService } = load("server/services/kycService.ts", { "../db.js": { db } });
  const service = new KYCService();
  service.notifyVerificationComplete = async () => {};
  const old = reviewRevision(verification, documents);
  verification.metadata.individualInfo.lastName = "Changed";
  await assert.rejects(service.approveVerification("v1", "staff", "ok", old), error => error.statusCode === 409);
  service.getDocument = async () => documents[0];
  await assert.rejects(service.reviewDocument("d1", "staff", true, undefined, old), error => error.statusCode === 409);
  await assert.rejects(service.rejectVerification("v1", "staff", "reject", old), error => error.statusCode === 409);
  assert.equal(mutations, 0);
  documents[0].expiresAt = new Date(0);
  await assert.rejects(service.approveVerification("v1", "staff", "ok", reviewRevision(verification, documents)), /unexpired/);
  delete documents[0].expiresAt;
  const revision = reviewRevision(verification, documents);
  const approved = await service.approveVerification("v1", "staff", "ok", revision);
  assert.equal(approved.status, "verified");
  assert.equal(approved.metadata.reviewedRevision, revision);
  assert.equal(approved.metadata.reviewedSnapshot.documents[0].documentUrl, "immutable/d1");
  documents[0].documentUrl = "replaced";
  assert.equal(approved.metadata.reviewedSnapshot.documents[0].documentUrl, "immutable/d1");
});

test("runtime governance rate limit uses one atomic cluster counter across policy edits and fails closed", async () => {
  let limit = 3;
  let count = 0;
  let unavailable = false;
  let policyUnavailable = false;
  const keys = [];
  const redis = {
    eval: async (_script, _numKeys, key, _start, max) => {
      keys.push(key);
      if (unavailable) return null;
      if (count + 1 > Number(max)) return [1, 0];
      count++;
      return [0, Number(max) - count];
    },
  };
  const { DistributedRateLimiter } = load("server/middleware/scalableRateLimiter.ts", {
    "../lib/redisClient.js": { getRedisClient: () => redis },
    "../lib/pdimClient.js": { isPdimConfigured: () => true },
    "./slidingWindowLua.js": { SLIDING_WINDOW_LUA: "mocked-atomic-script" },
    "../services/governancePolicyService.js": { readGovernancePolicy: async () => ({ apiRateLimit: limit }) },
  });
  const config = { windowMs: 60000, maxRequests: 1200, resolveMaxRequests: async () => {
    if (policyUnavailable) throw new Error("policy offline");
    return limit;
  } };
  const worker1 = new DistributedRateLimiter(config, redis).middleware();
  const worker2 = new DistributedRateLimiter(config, redis).middleware();
  async function request(worker) {
    const response = { code: 200, headers: {}, status(code) { this.code = code; return this; },
      json() {}, setHeader(key, value) { this.headers[key] = value; } };
    await worker({ ip: "same-user" }, response, () => {});
    return response;
  }
  assert.equal((await request(worker1)).code, 200);
  assert.equal((await request(worker2)).code, 200);
  limit = 1;
  assert.equal((await request(worker1)).code, 429);
  limit = 4;
  const expanded = await request(worker2);
  assert.equal(expanded.code, 200);
  assert.equal(expanded.headers["X-RateLimit-Limit"], 4);
  assert.equal(expanded.headers["X-RateLimit-Remaining"], 1);
  assert.equal(new Set(keys).size, 1);
  unavailable = true;
  assert.equal((await request(worker1)).code, 503);
  policyUnavailable = true;
  assert.equal((await request(worker2)).code, 503);
});

test("governance policy differentiates disabled registration from unavailable or malformed policy", async () => {
  let rows = [{ key: "platform.userRegistrationEnabled", value: "false" }];
  const { assertRegistrationEnabled, readGovernancePolicy } = load("server/services/governancePolicyService.ts", {
    "../db.js": { db: { select: () => ({ from: () => ({ where: async () => rows }) }) } },
  });
  await assert.rejects(assertRegistrationEnabled(), error => error.statusCode === 403);
  rows = [{ key: "platform.apiRateLimit", value: '"invalid"' }];
  await assert.rejects(readGovernancePolicy(), error => error.statusCode === 503);
  rows = [{ key: "platform.apiRateLimit", value: "27" }];
  assert.equal((await readGovernancePolicy()).apiRateLimit, 27);
});

test("support routes reject Express 5 array or empty ticket parameters before database access", async () => {
  const routes = [];
  const router = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    router[method] = (path, ...handlers) => routes.push({ path, handler: handlers.at(-1) });
  }
  load("server/routes/support.ts", {
    express: { Router: () => router },
    "../db.js": { db: new Proxy({}, { get() { throw new Error("Unexpected database access"); } }) },
    "../middleware/auth.js": { requireAuth() {}, requireAdmin() {}, require2FA() {} },
    "../services/notificationService.js": { notificationService: {} },
    "../services/supportTicketService.js": { supportTicketService: {} },
  });
  for (const route of routes.filter(route => route.path.includes(":ticketId"))) {
    for (const ticketId of [["one", "two"], "", " "]) {
      let status;
      await route.handler({ params: { ticketId, tag: "valid" }, body: { message: "Reply", tags: ["valid"] } }, {
        status(code) { status = code; return this; }, json() {},
      });
      assert.equal(status, 400, route.path);
    }
  }
});