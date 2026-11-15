import assert from "node:assert/strict";
import test from "node:test";
import { createDnsApiApp } from "../dns-os/services/dns-api/src/index.ts";
import { DNS_API_MIGRATION_FILES } from "../scripts/migrate-dns-api-schema.mjs";

const token = "a".repeat(64);

test("DNS API rejects missing or weak internal credentials", () => {
  assert.throws(() => createDnsApiApp({ token: "" }), /at least 32 characters/);
  assert.throws(() => createDnsApiApp({ token: "short" }), /at least 32 characters/);
});

test("health is liveness-only while management routes require bearer auth", async () => {
  const app = createDnsApiApp({ token, logger: false });
  try {
    await app.ready();
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().ok, true);

    const unauthorized = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { name: "must-not-be-created" },
    });
    assert.equal(unauthorized.statusCode, 401);

    const wrongToken = await app.inject({
      method: "GET",
      url: "/zones",
      headers: { authorization: `Bearer ${"b".repeat(64)}` },
    });
    assert.equal(wrongToken.statusCode, 401);

    const authenticatedStatus = await app.inject({
      method: "GET",
      url: "/status",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(authenticatedStatus.statusCode, 200);
    assert.deepEqual(authenticatedStatus.json(), {
      service: "dns-api",
      schema: "public",
      managementAuthRequired: true,
    });
  } finally {
    await app.close();
  }
});

test("DNS API migration allowlist excludes seeded Max Booster migration 003", () => {
  assert.deepEqual(DNS_API_MIGRATION_FILES, ["001_init.sql", "002_audit.sql"]);
});
