import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import Redis from "ioredis";
import type { Request, RequestHandler, Response } from "express";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";

const authority = vi.hoisted(() => ({ client: null as Redis | null }));
vi.mock("../../server/lib/redisConnectionFactory.js", () => ({ getRedisClient: async () => authority.client }));
vi.mock("../../server/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { billingRateLimiter, loginRateLimiter, registerRateLimiter } from "../../server/middleware/rateLimiter";

let redisProcess: ChildProcess | undefined;
let exited: Promise<unknown> | undefined;

async function request(limiter: RequestHandler, ip: string, userId?: string) {
  const headers = new Map<string, string>();
  const result = { code: 200, body: undefined as unknown, next: vi.fn(), headers };
  const response = {
    setHeader: (key: string, value: string) => headers.set(key.toLowerCase(), value),
    status(code: number) { result.code = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
  await limiter({ realClientIp: ip, ip, socket: { remoteAddress: ip }, user: userId ? { id: userId } : undefined } as unknown as Request,
    response as unknown as Response, result.next);
  return result;
}

beforeAll(async () => {
  const host = "127.0.0.1";
  const port = await new Promise<number>((resolve, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, host, () => {
      const address = listener.address();
      listener.close(() => {
        if (!address || typeof address === "string") reject(new Error("Could not reserve a Redis port"));
        else resolve(address.port);
      });
    });
  });
  const password = randomBytes(24).toString("hex");
  const child = spawn("redis-server", [
    "--bind", host, "--port", String(port), "--requirepass", password,
    "--save", "", "--appendonly", "no",
  ], { stdio: "ignore" });
  redisProcess = child;
  exited = new Promise(resolve => child.once("close", resolve));
  const client = new Redis({ host, port, password, retryStrategy: times => times < 50 ? 20 : null });
  authority.client = client;
  client.on("error", () => {});
  await Promise.race([
    client.ping(),
    new Promise<never>((_, reject) => {
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`Fixture Redis exited: ${code}`)));
    }),
  ]);
});

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  await authority.client!.flushdb(); // The random password binds this client to its fixture.
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  authority.client?.disconnect();
  if (redisProcess?.exitCode === null) redisProcess.kill("SIGTERM");
  await exited;
});

describe("Production authentication admission through internal proxies", () => {
  it("enforces login and registration limits for loopback and private client addresses", async () => {
    for (const limiter of [loginRateLimiter, registerRateLimiter]) {
      for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.82.4.5", "10.1.2.3"]) {
        for (let attempt = 0; attempt < 10; attempt++) expect((await request(limiter, ip)).next).toHaveBeenCalledOnce();
        const denied = await request(limiter, ip);
        expect(denied.code).toBe(429);
        expect(denied.next).not.toHaveBeenCalled();
        expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
        expect(denied.headers.get("x-ratelimit-remaining")).toBe("0");
      }
    }
  });

  it("atomically admits at most ten simultaneous requests for one login authority", async () => {
    const requests = await Promise.all(Array.from({ length: 40 }, () => request(loginRateLimiter, "203.0.113.47")));
    expect(requests.filter(result => result.next.mock.calls.length === 1)).toHaveLength(10);
    expect(requests.filter(result => result.code === 429)).toHaveLength(30);
  });

  it("enforces the production limit when Replit sets deployment mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REPLIT_DEPLOYMENT", "1");
    for (let attempt = 0; attempt < 10; attempt++) await request(loginRateLimiter, "10.30.0.2");
    expect((await request(loginRateLimiter, "10.30.0.2")).code).toBe(429);
  });

  it("retains the reduced admission bound when authority acquisition fails", async () => {
    const original = authority.client;
    authority.client = null;
    try {
      const requests = await Promise.all(Array.from({ length: 5 }, () => request(loginRateLimiter, "203.0.113.68")));
      expect(requests.filter(result => result.next.mock.calls.length === 1)).toHaveLength(2);
      expect(requests.filter(result => result.code === 429)).toHaveLength(3);
    } finally {
      authority.client = original;
    }
  });

  it("enforces the actual per-user billing threshold and isolates another user", async () => {
    const requests = await Promise.all(Array.from({ length: 65 }, () => request(billingRateLimiter, "127.0.0.1", "billing-fixture-owner")));
    expect(requests.filter(result => result.next.mock.calls.length === 1)).toHaveLength(60);
    expect(requests.filter(result => result.code === 429)).toHaveLength(5);
    expect((await request(billingRateLimiter, "127.0.0.1", "other-fixture-owner")).next).toHaveBeenCalledOnce();
  });

  it("runs the same atomic limiter on the canonical embedded PDIM engine", async () => {
    const original = authority.client;
    const store = new RedisStore("limiter-fixture", "limiter-fixture");
    store.attachEmbeddedSnapshot(new Map());
    authority.client = { eval: (script: string, count: number, ...args: unknown[]) =>
      store.exec("EVAL", [script, String(count), ...args.map(String)]) } as unknown as Redis;
    try {
      // Warm only the Lua runtime, with no admission or state mutation.
      expect(await store.exec("EVAL", ["return 1", "0"])).toBe(1);
      const key = "ratelimit:auth:login:203.0.113.99";
      await store.exec("ZADD", [key, String(Date.now() - 900_001), "expired-admission"]);
      const requests = await Promise.all(Array.from({ length: 40 }, () => request(loginRateLimiter, "203.0.113.99")));
      expect(requests.filter(result => result.next.mock.calls.length === 1)).toHaveLength(10);
      expect(requests.filter(result => result.code === 429)).toHaveLength(30);
      expect(await store.exec("ZCARD", [key])).toBe(10);
    } finally {
      authority.client = original;
      store.closeEmbedded();
    }
  });
});
