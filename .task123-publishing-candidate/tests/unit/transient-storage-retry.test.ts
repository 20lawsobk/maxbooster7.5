import { describe, expect, it, vi } from "vitest";
import {
  isTransientStorageTransportError,
  retryTransientStorageOperation,
} from "../../server/lib/transientStorageRetry.js";

describe("bounded retry for transient storage transport failures", () => {
  it("recognizes wrapped connection resets but not data or authorization failures", () => {
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const wrapped = new Error("PDIM request failed", { cause: reset });
    const timeout = new Error("operation timed out", { cause: new DOMException("Timed out", "TimeoutError") });

    expect(isTransientStorageTransportError(wrapped)).toBe(true);
    expect(isTransientStorageTransportError(timeout)).toBe(true);
    expect(isTransientStorageTransportError(new Error("invalid pocket metadata"))).toBe(false);
    expect(isTransientStorageTransportError(
      Object.assign(new Error("unauthorized"), { code: "EACCES" }),
    )).toBe(false);
  });

  it("recovers after a bounded transient failure", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce("opened");

    await expect(retryTransientStorageOperation(operation, { delaysMs: [0] }))
      .resolves.toBe("opened");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent failures", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("corrupt snapshot"));

    await expect(retryTransientStorageOperation(operation, { delaysMs: [0, 0] }))
      .rejects.toThrow("corrupt snapshot");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("stops after the configured transport retry budget", async () => {
    const operation = vi.fn().mockRejectedValue(
      Object.assign(new Error("reset"), { code: "ECONNRESET" }),
    );

    await expect(retryTransientStorageOperation(operation, { delaysMs: [0, 0] }))
      .rejects.toThrow("reset");
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
