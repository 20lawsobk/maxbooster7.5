import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiCache, cacheMiddleware } from "../../server/middleware/apiCache.js";
import {
  CSRF_COOKIE,
  generateCsrfToken,
  getCsrfToken,
} from "../../server/middleware/csrf.js";

function responseFixture() {
  const headers = new Map<string, unknown>();
  const cookies = new Map<string, string>();
  let body: unknown;

  const res = {
    statusCode: 200,
    set(values: Record<string, string>) {
      for (const [name, value] of Object.entries(values)) {
        headers.set(name.toLowerCase(), value);
      }
      return this;
    },
    vary(name: string) {
      headers.set("vary", name);
      return this;
    },
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    cookie(name: string, value: string) {
      cookies.set(name, value);
      headers.set("set-cookie", `${name}=${value}`);
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  } as unknown as Response;

  return {
    res,
    headers,
    cookies,
    body: () => body as { csrfToken?: string },
  };
}

function requestFixture(path: string) {
  return {
    method: "GET",
    path,
    originalUrl: path,
    query: {},
    headers: {},
    cookies: {},
    session: {},
  } as unknown as Request;
}

async function runCacheMiddleware(req: Request, res: Response, next: NextFunction) {
  await cacheMiddleware({ ttlSeconds: 30, varyByUser: true, varyByQuery: true })(
    req,
    res,
    next,
  );
}

describe("CSRF response cache isolation", () => {
  beforeEach(() => {
    apiCache.clear();
  });

  it("never trusts unsigned bearer/cookie identity, even with a warm private response", async () => {
    const get = vi.spyOn(apiCache, "get").mockResolvedValue({
      body: { private: "victim" }, headers: {}, statusCode: 200,
      timestamp: Date.now(), etag: '"private"',
    });
    try {
      const token = `x.${Buffer.from(JSON.stringify({ sub: "victim" })).toString("base64url")}.x`;
      for (const headers of [{ authorization: `Bearer ${token}` }, { cookie: `jwt=${token}` }]) {
        const req = requestFixture("/api/merch/orders");
        req.headers = headers;
        const fixture = responseFixture();
        const next = vi.fn();
        await cacheMiddleware({ authorize: async () => true })(req, fixture.res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(fixture.body()).toBeUndefined();
      }
      expect(get).not.toHaveBeenCalled();
    } finally { get.mockRestore(); }
  });

  it("requires a successful resource policy before every private cache lookup", async () => {
    const get = vi.spyOn(apiCache, "get").mockResolvedValue(undefined);
    try {
      for (const options of [{}, { authorize: async () => false },
        { authorize: async () => { throw new Error("Unavailable authority"); } },
        { authorize: async () => true, varyByUser: false }]) {
        const req = requestFixture("/api/merch/orders");
        req.user = { id: "victim" } as Request["user"];
        const next = vi.fn();
        await cacheMiddleware(options)(req, responseFixture().res, next);
        expect(next).toHaveBeenCalledOnce();
      }
      expect(get).not.toHaveBeenCalled();
      const req = requestFixture("/api/merch/orders");
      req.user = { id: "owner" } as Request["user"];
      await cacheMiddleware({ authorize: async () => true })(req, responseFixture().res, vi.fn());
      expect(get).toHaveBeenCalledWith("u:owner:/api/merch/orders:{}", "owner");
    } finally { get.mockRestore(); }
  });

  it("keeps canonical CSRF cookie/body bindings distinct across anonymous sessions", async () => {
    const firstReq = requestFixture("/api/csrf-token");
    const first = responseFixture();
    generateCsrfToken(firstReq, first.res, vi.fn());
    await runCacheMiddleware(firstReq, first.res, vi.fn());
    getCsrfToken(firstReq, first.res, vi.fn());

    const secondReq = requestFixture("/api/csrf-token");
    const second = responseFixture();
    generateCsrfToken(secondReq, second.res, vi.fn());
    await runCacheMiddleware(secondReq, second.res, vi.fn());
    getCsrfToken(secondReq, second.res, vi.fn());

    expect(first.body().csrfToken).toBe(first.cookies.get(CSRF_COOKIE));
    expect(second.body().csrfToken).toBe(second.cookies.get(CSRF_COOKIE));
    expect(second.body().csrfToken).not.toBe(first.body().csrfToken);
    expect(first.headers.get("x-cache")).toBeUndefined();
    expect(second.headers.get("x-cache")).toBeUndefined();
    expect(first.headers.get("cache-control")).toContain("private");
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(second.headers.get("vary")).toBe("Cookie");
  });

  it("does not cache any cookie-setting JSON response, including future CSRF aliases", async () => {
    const firstReq = requestFixture("/api/security/csrf-bootstrap");
    const first = responseFixture();
    await runCacheMiddleware(firstReq, first.res, vi.fn());
    first.res.setHeader("Set-Cookie", "csrf-token=first");
    first.res.json({ csrfToken: "first" });

    const secondReq = requestFixture("/api/security/csrf-bootstrap");
    const second = responseFixture();
    const next = vi.fn();
    await runCacheMiddleware(secondReq, second.res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(second.headers.get("x-cache")).toBeUndefined();
    expect(second.body()).toBeUndefined();
  });
});