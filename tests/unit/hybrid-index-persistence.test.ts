import { describe, expect, it } from "vitest";
import {
  HybridIndexCapacityError,
  persistHybridIndex,
} from "../../server/services/hybridIndexPersistence.js";

describe("hybrid index persistence must fail closed", () => {
  it("persists within capacity exactly once", async () => {
    let calls = 0;
    await persistHybridIndex(4, 5, async () => { calls++; return "OK"; });
    expect(calls).toBe(1);
  });

  it("permits exactly the documented capacity", async () => {
    let calls = 0;
    await persistHybridIndex(5, 5, async () => { calls++; return "OK"; });
    expect(calls).toBe(1);
  });

  it("rejects overflow before touching persistent storage", async () => {
    let calls = 0;
    await expect(persistHybridIndex(6, 5, async () => { calls++; return "OK"; }))
      .rejects.toThrow(HybridIndexCapacityError);
    expect(calls).toBe(0);
  });

  it("rejects malformed or unsafe index counts", async () => {
    for (const size of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      await expect(persistHybridIndex(size, 5, async () => {}))
        .rejects.toThrow(HybridIndexCapacityError);
    }
    await expect(persistHybridIndex(1, 0, async () => {}))
      .rejects.toThrow(HybridIndexCapacityError);
  });

  it("rejects a missing or unexpected PDIM write acknowledgement", async () => {
    for (const response of [false, undefined, "QUEUED"]) {
      await expect(persistHybridIndex(1, 5, async () => response))
        .rejects.toThrow("not acknowledged");
    }
  });

  it("propagates PDIM rejection instead of returning success", async () => {
    await expect(persistHybridIndex(1, 5, async () => {
      throw new Error("PDIM index unavailable");
    })).rejects.toThrow("PDIM index unavailable");
  });
});
