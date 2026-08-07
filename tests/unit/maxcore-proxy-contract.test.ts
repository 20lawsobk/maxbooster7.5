/**
 * MaxCore proxy route contract — exercises the PRODUCTION router in
 * server/routes/maxcoreProxy.ts with the auth middleware mocked and the
 * upstream fetch intercepted. Proves:
 *   1. Admin-scoped MaxCore paths require application-level admin auth
 *      BEFORE anything is forwarded upstream.
 *   2. Admin requests carry ONLY X-Admin-Key; generation requests carry
 *      ONLY Authorization: Bearer (the schemes are never combined).
 *   3. The authenticated user identity is bound into forwarded bodies.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.AI_SERVER_URL = "https://maxcore.test";
process.env.AI_SERVER_KEY = "gen-key-123";
process.env.MAXCORE_ADMIN_KEY = "admin-key-456";

vi.mock("../../server/middleware/auth.js", () => ({
  requireAuthOnly: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: unknown }).user = { id: "user-1", role: "user" };
    next();
  },
  requireAdmin: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers["x-test-admin"] !== "1") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    (req as express.Request & { user: unknown }).user = { id: "admin-1", role: "admin" };
    next();
  },
}));

const upstreamCalls: { url: string; init: RequestInit }[] = [];
const realFetch = globalThis.fetch;

describe("MaxCore proxy route contract", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    // Intercept ONLY upstream MaxCore calls; the test's own requests to the
    // local express server pass through to the real fetch.
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://maxcore.test")) {
        upstreamCalls.push({ url: u, init: init ?? {} });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(url as never, init);
    });

    const { default: router } = await import("../../server/routes/maxcoreProxy.js");
    const app = express();
    app.use(express.json());
    app.use(router);
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise((r) => server.close(r));
  });

  it("blocks admin-scoped MaxCore paths before forwarding when the caller is not an admin", async () => {
    upstreamCalls.length = 0;
    const res = await fetch(`${base}/api/platform/model/reload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    expect(upstreamCalls.length).toBe(0);
  });

  it("forwards admin paths with ONLY X-Admin-Key (never Bearer) once admin auth passes", async () => {
    upstreamCalls.length = 0;
    const res = await fetch(`${base}/api/platform/model/reload`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-admin": "1" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(upstreamCalls.length).toBe(1);
    const headers = upstreamCalls[0].init.headers as Record<string, string>;
    expect(headers["X-Admin-Key"]).toBe("admin-key-456");
    expect(headers.Authorization).toBeUndefined();
  });

  it("forwards generation paths with ONLY Bearer auth and binds the session user id", async () => {
    upstreamCalls.length = 0;
    const res = await fetch(`${base}/api/generate/content`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hi", user_id: "someone-else" }),
    });
    expect(res.status).toBe(200);
    expect(upstreamCalls.length).toBe(1);
    expect(upstreamCalls[0].url).toBe("https://maxcore.test/api/generate/content");
    const headers = upstreamCalls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer gen-key-123");
    expect(headers["X-Admin-Key"]).toBeUndefined();
    const body = JSON.parse(String(upstreamCalls[0].init.body));
    // Identity binding: the caller-supplied user_id must be overwritten.
    expect(body.user_id).toBe("user-1");
    expect(body.prompt).toBe("hi");
  });
});
