import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../external/maxcore/artifacts/api-server/node_modules/undici/index.js", () => ({ Agent: class {}, request: upstream }));
vi.mock("../../external/maxcore/artifacts/api-server/src/server-state.js", () => ({ isPythonRestarting: () => true }));
vi.mock("../../external/maxcore/artifacts/api-server/src/keepalive.js", () => ({ runActivation: vi.fn(), getKeepaliveStatus: vi.fn() }));
import router from "../../external/maxcore/artifacts/api-server/src/routes/model-proxy.js";

afterEach(() => { vi.unstubAllEnvs(); upstream.mockReset(); });
it.each(["/awareness/unified/status", "/awareness/unified/context"])("serves %s while generation is warming, retaining authentication and deadlines", async path => {
  vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "private-test-token");
  upstream.mockResolvedValue({ statusCode: 200, body: { text: async () => JSON.stringify({ ready: true, snapshot_id: "live" }) } });
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`;
    const options = path.endsWith("context") ? { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" } : {};
    expect((await fetch(url, options)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: "Bearer private-test-token" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ready: true });
    expect(upstream.mock.calls[0][1]).toMatchObject({ headersTimeout: 4000, bodyTimeout: 4000,
      headers: { Authorization: "Bearer private-test-token" } });
    expect(upstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it("dispatches only explicit deterministic planning during model warmup with auth and a bounded deadline", async () => {
  vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "private-test-token");
  upstream.mockResolvedValue({ statusCode: 200, body: { text: async () => JSON.stringify({
    source: "deterministic_planner", checkpoint_inference: false, steps: [],
  }) } });
  const app = express(); app.use(express.json(), router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/generate/text`;
    const options = { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "planner", input: { packSpec: [] } }) };
    expect((await fetch(url, options)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    const response = await fetch(url, { ...options, headers: {
      ...options.headers, Authorization: "Bearer private-test-token",
    } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: "deterministic_planner", checkpoint_inference: false });
    expect(upstream.mock.calls[0][0]).toMatch(/\/api\/generate\/text$/);
    expect(upstream.mock.calls[0][1]).toMatchObject({ headersTimeout: 30000, bodyTimeout: 30000,
      headers: { Authorization: "Bearer private-test-token" } });
    expect(upstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it("forwards fresh live-conditioned content to the actual capability gate during warmup", async () => {
  vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "private-test-token");
  upstream.mockResolvedValue({ statusCode: 503, body: { text: async () => JSON.stringify({
    detail: "no_operationally_capable_certified_public_live_candidate",
  }) } });
  const app = express(); app.use(express.json(), router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/generate/content`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer private-test-token" },
      body: JSON.stringify({ topic: "music", awareness: {
        snapshot_id: "canonical-live", awareness: "Public live observations", expires_at: Date.now() / 1000 + 60,
      } }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ detail: "no_operationally_capable_certified_public_live_candidate" });
    expect(upstream.mock.calls[0][1]).toMatchObject({ headersTimeout: 60000, bodyTimeout: 60000 });
    expect(upstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it.each(["/generate/image", "/generate/audio", "/generate-video", "/generate/video"])(
  "dispatches live-conditioned %s with a bounded media budget during unrelated text warmup", async path => {
    vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "private-test-token");
    upstream.mockResolvedValue({ statusCode: 503, body: { text: async () => JSON.stringify({
      detail: "explicit fixture capability unavailable",
    }) } });
    const app = express(); app.use(express.json(), router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer private-test-token" },
        body: JSON.stringify({ awareness: { snapshot_id: "canonical-live",
          awareness: "Public observations", expires_at: Date.now() / 1000 + 60 } }),
      });
      expect(response.status).toBe(503);
      expect(upstream.mock.calls[0][1]).toMatchObject({ headersTimeout: 600000, bodyTimeout: 600000 });
      expect(upstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
