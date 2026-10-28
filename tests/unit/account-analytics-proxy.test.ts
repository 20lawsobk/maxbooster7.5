import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../external/maxcore/artifacts/api-server/node_modules/undici/index.js", () => ({ Agent: class {}, request: upstream }));
vi.mock("../../external/maxcore/artifacts/api-server/src/server-state.js", () => ({ isPythonRestarting: () => true }));
vi.mock("../../external/maxcore/artifacts/api-server/src/keepalive.js", () => ({ runActivation: vi.fn(), getKeepaliveStatus: vi.fn() }));
import router from "../../external/maxcore/artifacts/api-server/src/routes/model-proxy.js";

afterEach(() => { vi.unstubAllEnvs(); upstream.mockReset(); });

it.each(["capability", "predict", "insights"])("dispatches actual analytics/%s contract during model warmup without injecting identity into private aggregates", async capability => {
  vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "owned-analytics-proxy-token");
  const payload = { version: 1, timeframe: "7d", metric: "streams",
    dataWindow: { start: "2026-10-20", end: "2026-10-27" }, points: [{ date: "2026-10-20", value: 10 }] };
  upstream.mockResolvedValue({ statusCode: 200, body: { text: async () => JSON.stringify({ available: true, method: "fixture-transport-only" }) } });
  const app = express(); app.use(express.json(), router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/analytics/${capability}`;
  const options = capability === "capability" ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
  try {
    expect((await fetch(url, options)).status).toBe(401); expect(upstream).not.toHaveBeenCalled();
    const response = await fetch(url, { ...options, headers: { ...options.headers,
      Authorization: "Bearer owned-analytics-proxy-token", "X-MaxCore-User-Id": "private-owner" }, signal: AbortSignal.timeout(2000) });
    expect(response.status).toBe(200);
    const [upstreamUrl, forwarded] = upstream.mock.calls.at(-1)!;
    expect(upstreamUrl).toMatch(new RegExp(`/api/analytics/${capability}$`));
    expect(forwarded).toMatchObject({ headersTimeout: 10000, bodyTimeout: 10000,
      headers: { Authorization: "Bearer owned-analytics-proxy-token", "X-MaxCore-User-Id": "private-owner" } });
    expect(forwarded.signal).toBeInstanceOf(AbortSignal);
    expect(forwarded.body === undefined ? undefined : JSON.parse(forwarded.body)).toEqual(capability === "capability" ? undefined : payload);
    upstream.mockResolvedValue({ statusCode: 503, body: { text: async () => JSON.stringify({ detail: "owned upstream unavailable" }) } });
    expect((await fetch(url, { ...options, headers: { ...options.headers,
      Authorization: "Bearer owned-analytics-proxy-token" }, signal: AbortSignal.timeout(2000) })).status).toBe(503);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
