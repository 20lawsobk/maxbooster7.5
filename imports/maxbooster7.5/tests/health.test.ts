/**
 * Integration tests for health and readiness endpoints.
 * Requires running server at localhost:5000.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";
const sealedWithoutMaxcore = process.env.TEST_EXPECT_MAXCORE_UNAVAILABLE === "1";

function assertStartupReadiness(r: Awaited<ReturnType<typeof get>>) {
  if (!sealedWithoutMaxcore) {
    expect(r.status).toBe(200);
    expect(r.json.phase).toBe("ready");
    return;
  }
  // This fixture explicitly excludes MaxCore. It must still prove its real
  // database and PDIM dependencies, and must not advertise generation-ready.
  expect(r.status).toBe(503);
  expect(r.json).toMatchObject({ status: "not_ready", phase: "degraded" });
  expect(r.json.probes.database.status).toBe("ready");
  expect(r.json.probes.redis.status).toBe("ready");
  expect(r.json.probes.maxcore.status).toBe("degraded");
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  const body = await res.text();
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }
  return { status: res.status, json, headers: res.headers };
}

describe("Liveness and Readiness Endpoints", () => {
  it("GET /health returns 200", async () => {
    const r = await get("/health");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "ok" });
  });

  it("GET /api/health returns 200", async () => {
    const r = await get("/api/health");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "ok" });
    expect(r.json.timestamp).toBeDefined();
  });

  it("GET /ready reflects the actual admitted dependency set", async () => {
    const r = await get("/ready");
    assertStartupReadiness(r);
  });

  it("GET /api/ready does not confuse a sealed fixture with full readiness", async () => {
    const r = await get("/api/ready");
    if (!sealedWithoutMaxcore) {
      expect(r.status).toBe(200);
      expect(r.json.unifiedAwareness.ready).toBe(true);
      return;
    }
    expect(r.status).toBe(503);
    expect(r.json.status).toBe("degraded");
    expect(r.json.unifiedAwareness.ready).toBe(false);
    const statuses = new Map<string, string>(r.json.subsystems.map((item: { name: string; status: string }) => [item.name, item.status]));
    for (const name of ["database", "redis", "routes"]) expect(statuses.get(name)).toBe("ok");
    for (const item of r.json.subsystems) {
      if (item.name !== "maxcore") expect(["ok", "unknown"]).toContain(item.status);
    }
  });

  it("GET /healthz returns 200", async () => {
    const r = await get("/healthz");
    expect(r.status).toBe(200);
  });

  it("GET /readyz uses the same truthful readiness contract", async () => {
    const r = await get("/readyz");
    assertStartupReadiness(r);
  });

  it("GET /api/ping returns ok:true", async () => {
    const r = await get("/api/ping");
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(typeof r.json.uptime).toBe("number");
  });

  it("/startup returns startup phase details", async () => {
    const r = await get("/startup");
    expect([200, 503]).toContain(r.status);
    expect(r.json.phase).toBeDefined();
    expect(r.json.probes).toBeDefined();
  });
});

describe("Security Headers", () => {
  it("X-Content-Type-Options is nosniff", async () => {
    const r = await get("/api/health");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("X-Frame-Options is present", async () => {
    const r = await get("/api/health");
    const header = r.headers.get("x-frame-options");
    expect(header).not.toBeNull();
  });

  it("X-XSS-Protection header is set", async () => {
    const r = await get("/api/health");
    // Either x-xss-protection present or CSP present (helmet v7 uses CSP instead)
    const xss = r.headers.get("x-xss-protection");
    const csp = r.headers.get("content-security-policy");
    expect(xss !== null || csp !== null).toBe(true);
  });

  it("Server header is absent or masked", async () => {
    const r = await get("/api/health");
    const server = r.headers.get("server");
    // Should not expose "Express" or version
    if (server) {
      expect(server.toLowerCase()).not.toContain("express");
    }
  });
});
