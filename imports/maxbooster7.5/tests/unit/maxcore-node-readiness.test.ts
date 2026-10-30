import { describe, expect, it } from "vitest";
import { isOperationallyReady } from "../../external/maxcore/artifacts/api-server/src/routes/health.js";

describe("MaxCore Node operational readiness", () => {
  const healthy = {
    pythonReachable: true,
    pythonReady: true,
    pythonRestarting: false,
    circuitBreaker: "closed",
  };

  it("requires Python's actual generation readiness in addition to health/model-loaded", () => {
    expect(isOperationallyReady(healthy)).toBe(true);
    expect(isOperationallyReady({ ...healthy, pythonReady: false })).toBe(false);
    expect(isOperationallyReady({ ...healthy, pythonReachable: false })).toBe(false);
  });

  it("does not claim readiness during restart or breaker outage; optional warm passes are diagnostic", () => {
    expect(isOperationallyReady({ ...healthy, pythonRestarting: true })).toBe(false);
    expect(isOperationallyReady({ ...healthy, circuitBreaker: "open" })).toBe(false);
    expect(isOperationallyReady({ ...healthy, circuitBreaker: "half-open" })).toBe(false);
  });
});