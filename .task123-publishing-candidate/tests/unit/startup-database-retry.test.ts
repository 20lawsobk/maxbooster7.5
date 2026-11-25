import { describe, expect, it, vi } from "vitest";
import {
  isTransientDatabaseConnectionError,
  withStartupDatabaseRetry,
} from "../../server/lib/startupDatabaseRetry.js";

describe("startup database retry", () => {
  it("retries a transient nested Neon connection error and returns success", async () => {
    const sleep = vi.fn(async (_delayMs: number) => {});
    const onRetry = vi.fn();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({
        message: "Failed query: SELECT 1",
        cause: {
          message: "Connection terminated due to connection timeout",
          cause: new Error("WebSocket was closed before the connection was established"),
        },
      })
      .mockResolvedValueOnce("connected");

    await expect(
      withStartupDatabaseRetry(operation, {
        sleep,
        random: () => 0,
        onRetry,
      }),
    ).resolves.toBe("connected");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(500);
    expect(onRetry).toHaveBeenCalledExactlyOnceWith({
      failedAttempt: 1,
      nextAttempt: 2,
      delayMs: 500,
    });
  });

  it("does not retry schema or authentication failures", async () => {
    const sleep = vi.fn(async (_delayMs: number) => {});
    const error = Object.assign(new Error('relation "pg_sessions" does not exist'), {
      code: "42P01",
    });
    const operation = vi.fn().mockRejectedValue(error);

    await expect(
      withStartupDatabaseRetry(operation, { sleep }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops after the configured attempt limit and propagates the final error", async () => {
    const sleep = vi.fn(async (_delayMs: number) => {});
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }))
      .mockRejectedValueOnce(Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }))
      .mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(
      withStartupDatabaseRetry(operation, {
        maxAttempts: 3,
        sleep,
        random: () => 0,
      }),
    ).rejects.toMatchObject({ message: "connection reset", code: "ECONNRESET" });

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([500, 1000]);
  });

  it("recognizes SQLSTATE connection errors but not query timeout cancellation", () => {
    expect(isTransientDatabaseConnectionError({ code: "08006" })).toBe(true);
    expect(
      isTransientDatabaseConnectionError({ code: "57014", message: "statement timeout" }),
    ).toBe(false);
  });
});
