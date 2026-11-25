import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unhealthy: false,
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    set: vi.fn(),
    flushdb: vi.fn(),
  },
}));

vi.mock("../../server/lib/pdimClient.js", () => ({
  getPdimClient: () => mocks.redis,
}));

vi.mock("../../server/lib/redisCompat.js", () => ({
  applyIoredisCompatShim: (client: unknown) => client,
}));

vi.mock("../../server/lib/pdimCircuitBreaker.js", () => ({
  cbIsPdimUnhealthy: () => mocks.unhealthy,
}));

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("distributed cache under PDIM congestion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.unhealthy = false;
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.setex.mockResolvedValue("OK");
    mocks.redis.del.mockResolvedValue(1);
    mocks.redis.keys.mockResolvedValue([]);
    mocks.redis.set.mockResolvedValue("OK");
    mocks.redis.flushdb.mockResolvedValue("OK");
  });

  async function makeCache() {
    const { DistributedCache } = await import(
      "../../server/infrastructure/distributedCache.js"
    );
    const cache = DistributedCache.getInstance();
    await cache.connect();
    return cache;
  }

  it("fails cache reads fast while the shared PDIM circuit is unhealthy", async () => {
    const cache = await makeCache();
    mocks.unhealthy = true;

    await expect(cache.get("cold-key")).resolves.toBeNull();
    expect(mocks.redis.get).not.toHaveBeenCalled();
    expect(cache.getStats().misses).toBe(1);
  });

  it("coalesces concurrent same-key cache reads into one PDIM request", async () => {
    const cache = await makeCache();
    mocks.redis.get.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(JSON.stringify({ value: "shared" })), 10),
        ),
    );

    const values = await Promise.all([
      cache.get<{ value: string }>("shared-key"),
      cache.get<{ value: string }>("shared-key"),
    ]);

    expect(values).toEqual([{ value: "shared" }, { value: "shared" }]);
    expect(mocks.redis.get).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cache-aside misses into one source fetch", async () => {
    const cache = await makeCache();
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { value: "source" };
    });

    const values = await Promise.all([
      cache.getOrSet("source-key", fetcher),
      cache.getOrSet("source-key", fetcher),
    ]);

    expect(values).toEqual([{ value: "source" }, { value: "source" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
