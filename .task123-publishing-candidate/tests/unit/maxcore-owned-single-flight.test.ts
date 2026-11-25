import { describe, expect, it, vi } from "vitest";
import { ownedSingleFlight } from "../../external/maxcore/artifacts/api-server/src/owned-single-flight";

describe("process-owned asynchronous work", () => {
  it("coalesces overlapping polls and warmups", async () => {
    let release!: () => void;
    const job = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const run = ownedSingleFlight(() => 1, job);
    const first = run();
    expect(run()).toBe(first);
    await Promise.resolve();
    expect(job).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
  it("isolates replacement processes and old completions", async () => {
    let owner = 1;
    const releases = new Map<number, () => void>();
    const run = ownedSingleFlight(() => owner, id => new Promise<void>(resolve => releases.set(id, resolve)));
    const old = run(); await Promise.resolve();
    owner = 2;
    const current = run(); await Promise.resolve();
    releases.get(1)!(); await old;
    expect(run()).toBe(current);
    releases.get(2)!(); await current;
  });
  it("releases failed work so subsequent checks can retry", async () => {
    const job = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce("ok");
    const run = ownedSingleFlight(() => 1, job);
    await expect(run()).rejects.toThrow("failed");
    await expect(run()).resolves.toBe("ok");
  });
});