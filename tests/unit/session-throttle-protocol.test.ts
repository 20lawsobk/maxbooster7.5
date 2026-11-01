import express from "express";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";
import { DistributedRateLimiter } from "../../server/middleware/scalableRateLimiter";
import { probeSession, SessionProbeUnavailable } from "../../client/src/lib/sessionProbe";

it("keeps throttling enforced while communicating the retry delay to the actual session client", async () => {
  const redis = { eval: vi.fn(), zadd: vi.fn(), zremrangebyscore: vi.fn(), zcard: vi.fn(), zcount: vi.fn(), expire: vi.fn() };
  const limiter = new DistributedRateLimiter({ windowMs: 60_000, maxRequests: 3 }, redis);
  vi.spyOn(limiter, "isRateLimited").mockResolvedValue({ limited: true, remaining: 0 });
  const app = express(); app.use(limiter.middleware()); app.get("/api/auth/me", (_req, res) => res.json({ id: "owner" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(origin + "/api/auth/me");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const request: typeof fetch = (input, init) => fetch(origin + String(input), init);
    const result = await probeSession(request).catch(error => error);
    expect(result).toBeInstanceOf(SessionProbeUnavailable);
    expect(result.retryAfterMs).toBe(60_000);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
