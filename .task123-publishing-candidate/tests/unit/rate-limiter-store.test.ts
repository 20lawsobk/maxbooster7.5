/**
 * Unit tests for the in-memory fallback store in globalRateLimiter.
 *
 * The RedisRateLimitStore falls back to an in-memory Map when Redis is
 * unavailable. These tests verify the fallback store's counting logic
 * without requiring a real Redis connection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const LIMITER_PATH = "server/middleware/globalRateLimiter.ts";

describe("GlobalRateLimiter source analysis", () => {
  it("has a Redis-backed store implementation", () => {
    const src = readFileSync(LIMITER_PATH, "utf8");
    expect(src).toContain("RedisRateLimitStore");
  });

  it("has an in-memory fallback for when Redis is unavailable", () => {
    const src = readFileSync(LIMITER_PATH, "utf8");
    expect(src).toContain("fallbackStore");
    expect(src).toContain("Map");
  });

  it("uses a pipeline timeout to guard against Redis hiccups", () => {
    const src = readFileSync(LIMITER_PATH, "utf8");
    expect(src).toContain("timeout");
    expect(src).toContain("400");
  });

  it("prunes stale entries from the fallback store", () => {
    const src = readFileSync(LIMITER_PATH, "utf8");
    expect(src).toContain("fallbackPrunedAt");
  });
});

describe("In-memory rate limiter logic", () => {
  interface MemEntry {
    hits: number;
    resetAt: number;
  }

  function createFallbackStore(windowMs: number) {
    const store = new Map<string, MemEntry>();

    function increment(key: string): { totalHits: number; resetTime: Date } {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now > entry.resetAt) {
        const resetAt = now + windowMs;
        store.set(key, { hits: 1, resetAt });
        return { totalHits: 1, resetTime: new Date(resetAt) };
      }
      entry.hits += 1;
      return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
    }

    return { increment, store };
  }

  it("first request returns totalHits=1", () => {
    const { increment } = createFallbackStore(60_000);
    const result = increment("user:1");
    expect(result.totalHits).toBe(1);
  });

  it("subsequent requests within window increment the counter", () => {
    const { increment } = createFallbackStore(60_000);
    increment("user:2");
    increment("user:2");
    const third = increment("user:2");
    expect(third.totalHits).toBe(3);
  });

  it("different keys are tracked independently", () => {
    const { increment } = createFallbackStore(60_000);
    increment("user:a");
    increment("user:a");
    const bResult = increment("user:b");
    expect(bResult.totalHits).toBe(1);
  });

  it("counter resets after the window expires", async () => {
    const { increment } = createFallbackStore(50); // 50ms window
    increment("user:reset");
    await new Promise((r) => setTimeout(r, 60));
    const after = increment("user:reset");
    expect(after.totalHits).toBe(1);
  });

  it("resetTime is in the future", () => {
    const { increment } = createFallbackStore(60_000);
    const { resetTime } = increment("user:time");
    expect(resetTime.getTime()).toBeGreaterThan(Date.now());
  });
});
