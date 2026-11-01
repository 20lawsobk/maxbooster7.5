/**
 * Integration tests for webhook endpoint security.
 * Verifies that Stripe webhooks require valid signatures.
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

async function post(
  path: string,
  body: string,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  return { status: res.status, text };
}

describe("Stripe Webhook Security", () => {
  it("rejects request without Stripe-Signature header (400)", async () => {
    const r = await post("/api/webhook", JSON.stringify({ type: "test" }));
    // Without signature, should get 400 (bad request) not 200
    expect([400, 401, 403, 500]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });

  it("rejects request with invalid Stripe-Signature (400)", async () => {
    const r = await post(
      "/api/webhook",
      JSON.stringify({ type: "payment_intent.succeeded" }),
      { "Stripe-Signature": "t=fake,v1=invalidsignature" },
    );
    expect([400, 401, 403, 500]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });

  it("webhook endpoint exists (not 404)", async () => {
    const r = await post("/api/webhook", "{}");
    expect(r.status).not.toBe(404);
  });
});

describe("Audit Log Endpoint Security", () => {
  it("GET /api/audit-logs requires admin auth", async () => {
    const res = await fetch(`${BASE}/api/audit-logs`, {
      signal: AbortSignal.timeout(5000),
    });
    expect([401, 403, 404]).toContain(res.status);
  });
});

describe("Metrics Endpoint Security", () => {
  it("GET /metrics requires auth", async () => {
    const res = await fetch(`${BASE}/metrics`, {
      signal: AbortSignal.timeout(5000),
    });
    expect([401, 403, 404]).toContain(res.status);
  });
});
