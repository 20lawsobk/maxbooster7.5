import { describe, expect, it } from "vitest";
import {
  classifyPythonServingReadiness,
  isOperationallyReady,
} from "../../external/maxcore/artifacts/api-server/src/routes/health";

describe("MaxCore generation readiness", () => {
  it("accepts a genuinely ready certified checkpoint", () => {
    expect(classifyPythonServingReadiness({
      ready: true,
      generation_ready: true,
      generation_mode: "trained_checkpoint",
      model_loaded: true,
    })).toBe("trained_checkpoint");
  });

  it("accepts the explicit live-awareness serving release without claiming weights", () => {
    expect(classifyPythonServingReadiness({
      ready: true,
      generation_ready: true,
      generation_mode: "live_awareness",
      model_loaded: false,
      live_awareness: {
        live_awareness_serving: true,
      },
    })).toBe("live_awareness");
  });

  it.each([
    null,
    {},
    { ready: false, generation_ready: true, model_loaded: true },
    { ready: true, generation_ready: false, model_loaded: true },
    {
      ready: true,
      generation_ready: true,
      generation_mode: "live_awareness",
      model_loaded: false,
      live_awareness: { live_awareness_serving: false },
    },
    {
      ready: true,
      generation_ready: true,
      generation_mode: "live_awareness",
      model_loaded: false,
    },
  ])("rejects incomplete or liveness-only readiness: %j", (value) => {
    expect(classifyPythonServingReadiness(value)).toBeNull();
  });

  it("keeps restarting or open-circuit services unready", () => {
    const base = {
      pythonReachable: true,
      pythonReady: true,
      pythonRestarting: false,
      circuitBreaker: "closed",
    };
    expect(isOperationallyReady(base)).toBe(true);
    expect(isOperationallyReady({ ...base, pythonRestarting: true })).toBe(false);
    expect(isOperationallyReady({ ...base, circuitBreaker: "open" })).toBe(false);
  });
});
