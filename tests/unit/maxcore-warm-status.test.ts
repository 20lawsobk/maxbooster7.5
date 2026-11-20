import { describe, expect, it } from "vitest";
import { classifyWarmStatusSnapshot } from "../../external/maxcore/artifacts/api-server/src/services/keepalive";

describe("MaxCore warm-status classification", () => {
  it("recognizes ready live awareness while no trained checkpoint is loaded", () => {
    expect(
      classifyWarmStatusSnapshot({
        model_ready: false,
        awareness_ready: true,
        generation_ready: true,
        deep_warm: { state: "pending", cycles: 0 },
      }),
    ).toBe("live_awareness");
  });

  it("does not call an unavailable generation mode live awareness", () => {
    expect(
      classifyWarmStatusSnapshot({
        model_ready: false,
        awareness_ready: true,
        generation_ready: false,
        deep_warm: { state: "pending" },
      }),
    ).toBeNull();
    expect(
      classifyWarmStatusSnapshot({
        model_ready: false,
        awareness_ready: false,
        generation_ready: true,
        deep_warm: { state: "pending" },
      }),
    ).toBeNull();
  });

  it("preserves completed and partial checkpoint warm results", () => {
    expect(
      classifyWarmStatusSnapshot({
        model_ready: true,
        awareness_ready: true,
        generation_ready: true,
        deep_warm: { state: "warm" },
      }),
    ).toBe("warm");
    expect(
      classifyWarmStatusSnapshot({
        model_ready: false,
        awareness_ready: true,
        generation_ready: true,
        deep_warm: { state: "partial" },
      }),
    ).toBe("partial");
  });

  it("reports warm-pass errors distinctly from timeouts", () => {
    expect(
      classifyWarmStatusSnapshot({
        deep_warm: { state: "error" },
      }),
    ).toBe("error");
  });

  it("rejects malformed status payloads", () => {
    expect(classifyWarmStatusSnapshot(null)).toBeNull();
    expect(classifyWarmStatusSnapshot([])).toBeNull();
    expect(classifyWarmStatusSnapshot({ deep_warm: "warm" })).toBeNull();
  });
});
