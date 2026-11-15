import { describe, expect, it, vi } from "vitest";
import { PdimBucketCommandBatcher } from "../../server/lib/pdimBucketCommandBatcher";

describe("bucket-backed command batching", () => {
  it("shares one durable transaction without acknowledging early", async () => {
    let release!: () => void;
    const committed = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (_cmd: string, args: string[]) => {
      await committed;
      return JSON.parse(args[0]).map(() => [null, "OK"]);
    });
    const batcher = new PdimBucketCommandBatcher(execute);
    let acknowledged = false;
    const writes = Promise.all(Array.from({ length: 50 }, (_, i) =>
      batcher.exec("SET", [`key-${i}`, "value"]))).then(() => { acknowledged = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(acknowledged).toBe(false);
    release();
    await writes;
    expect(acknowledged).toBe(true);
    await batcher.close();
  });
  it("propagates journal failure to every waiting caller", async () => {
    const batcher = new PdimBucketCommandBatcher(async () => { throw new Error("bucket unavailable"); });
    const results = await Promise.allSettled([
      batcher.exec("SET", ["a", "1"]), batcher.exec("SET", ["b", "2"]),
    ]);
    expect(results.every(result => result.status === "rejected")).toBe(true);
    await batcher.close();
  });
  it("keeps per-command validation errors separate from successful results", async () => {
    const batcher = new PdimBucketCommandBatcher(async () => [[{ message: "bad input" }, null], [null, "OK"]]);
    const results = await Promise.allSettled([batcher.exec("BAD", []), batcher.exec("SET", ["a", "1"])]);
    expect(results[0].status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: "OK" });
    await batcher.close();
  });
  it("does not block producers behind a waiting consumer", async () => {
    let deliver!: (value: unknown) => void;
    const batcher = new PdimBucketCommandBatcher(async (cmd) => {
      if (cmd === "BLPOP") return new Promise(resolve => { deliver = resolve; });
      deliver(["queue", "value"]);
      return [[null, 1]];
    });
    const consumer = batcher.exec("BLPOP", ["queue", "5"]);
    await batcher.exec("RPUSH", ["queue", "value"]);
    expect(await consumer).toEqual(["queue", "value"]);
    await batcher.close();
  });
});
