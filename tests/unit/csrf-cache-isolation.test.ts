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