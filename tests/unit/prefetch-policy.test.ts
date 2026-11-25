import { describe, expect, it } from "vitest";
import {
  getPrefetchMode,
  isIdlePrefetchAllowed,
} from "../../client/src/lib/prefetchPolicy";

describe("speculative route prefetch policy", () => {
  it("disables speculation for data-saving and constrained devices", () => {
    expect(getPrefetchMode({ saveData: true, viewportWidth: 1440 })).toBe(
      "none",
    );
    expect(
      getPrefetchMode({
        effectiveType: "3g",
        downlink: 0.8,
        viewportWidth: 390,
      }),
    ).toBe("none");
    expect(
      getPrefetchMode({
        deviceMemory: 2,
        hardwareConcurrency: 8,
        viewportWidth: 1440,
      }),
    ).toBe("none");
    expect(
      getPrefetchMode({
        deviceMemory: 8,
        hardwareConcurrency: 2,
        viewportWidth: 1440,
      }),
    ).toBe("none");
  });

  it("keeps unknown or ordinary mobile connections intent-driven", () => {
    expect(getPrefetchMode({ viewportWidth: 390 })).toBe("intent");
    expect(
      getPrefetchMode({
        effectiveType: "4g",
        downlink: 20,
        deviceMemory: 8,
        hardwareConcurrency: 8,
        viewportWidth: 390,
      }),
    ).toBe("intent");
    expect(
      getPrefetchMode({
        effectiveType: "3g",
        downlink: 3,
        deviceMemory: 8,
        hardwareConcurrency: 8,
        viewportWidth: 1440,
      }),
    ).toBe("intent");
  });

  it("allows idle prefetch only with strong desktop capacity signals", () => {
    const mode = getPrefetchMode({
        effectiveType: "4g",
        downlink: 5,
        deviceMemory: 4,
        hardwareConcurrency: 4,
        viewportWidth: 1024,
      });
    expect(mode).toBe("idle");
    expect(isIdlePrefetchAllowed(false, mode)).toBe(true);
    expect(isIdlePrefetchAllowed(true, mode)).toBe(false);
    expect(isIdlePrefetchAllowed(false, "intent")).toBe(false);
  });
});
