import express from "express";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createAwarenessReadinessHandler } from "../../server/lib/awarenessReadiness.js";

const now = 1_000_000;
const live = {
  ready: true, snapshot_id: "verified-snapshot", expires_at: now / 1000 + 60,
  source_health: { public_feed: { ok: true } },
  model_loaded: false, generation_ready: false,
};
function app(status: () => Promise<Record<string, unknown>>) {
  const server = express();
  server.get("/api/health/awareness/ready", createAwarenessReadinessHandler(status, () => now));
  return server;
}

async function request(server: ReturnType<typeof express>, path = "/api/health/awareness/ready") {
  const listener = server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => listener.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(listener.address() as AddressInfo).port}${path}`);
    return { status: response.status, body: await response.json(),
      headers: { "cache-control": response.headers.get("cache-control") } };
  } finally {
    listener.closeAllConnections();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
}

describe("awareness readiness independent of generation", () => {
  it("serves fresh live signals without a trained generation model", async () => {
    const response = await request(app(async () => live));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ scope: "awareness", ready: true, healthySources: 1 });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).not.toHaveProperty("model_loaded");
  });

  it.each([
    { snapshot_id: null }, { expires_at: now / 1000 }, { expires_at: Number.NaN },
    { source_health: { public_feed: { ok: false } } }, { ready: false },
  ])("rejects missing, stale or unsuccessful live evidence: %j", async override => {
    const response = await request(app(async () => ({ ...live, ...override })));
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
  });

  it("rechecks freshness on every request", async () => {
    let clock = now;
    const server = express();
    server.get("/ready", createAwarenessReadinessHandler(async () => live, () => clock));
    expect((await request(server, "/ready")).status).toBe(200);
    clock += 60_000;
    expect((await request(server, "/ready")).status).toBe(503);
  });

  it("fails closed and redacts upstream errors", async () => {
    const response = await request(app(async () => { throw new Error("private-provider-secret"); }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private-provider-secret");
  });
});
