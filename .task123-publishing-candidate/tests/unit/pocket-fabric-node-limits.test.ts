import { describe, expect, it } from "vitest";
import {
  AutoClusterManager,
  DEFAULT_MAX_NODES,
  DEFAULT_RULES,
  MAX_CONFIGURED_NODES,
  resolveMaxNodes,
  validateNodeLimits,
} from "../../server/pocket-dimension/fabric/control/AutoClusterManager.js";

describe("PocketFabric autoscaling bounds", () => {
  it("uses a finite admin-first default and accepts a deliberate finite override", () => {
    expect(DEFAULT_MAX_NODES).toBe(5);
    expect(DEFAULT_RULES.maxNodes).toBe(5);
    expect(Number.isFinite(DEFAULT_RULES.maxNodes)).toBe(true);
    expect(resolveMaxNodes(undefined, 3)).toBe(5);
    expect(resolveMaxNodes("8", 3)).toBe(8);
  });

  it.each(["Infinity", "NaN", "3.5", "2", "9001", "-1"])(
    "rejects unsafe configured node limit %s",
    (value) => {
      expect(() => resolveMaxNodes(value, 3)).toThrow(
        /POCKET_FABRIC_MAX_NODES must be an integer/,
      );
    },
  );

  it("rejects non-finite or inconsistent limits passed directly to a manager", () => {
    expect(() => validateNodeLimits(3, Number.POSITIVE_INFINITY)).toThrow(
      /safe integers/,
    );
    expect(() => validateNodeLimits(6, 5)).toThrow(/safe integers/);
    expect(validateNodeLimits(0, 5)).toBeUndefined();
    expect(validateNodeLimits(3, MAX_CONFIGURED_NODES)).toBeUndefined();
  });

  it("never computes a scale-up count after the configured ceiling is reached", () => {
    const manager = Object.create(AutoClusterManager.prototype) as unknown as {
      rules: typeof DEFAULT_RULES;
      computeSpawnCount: (
        reason: "avg_utilization_high",
        velocity: number,
        currentNodeCount: number,
        projectedBytes: number,
      ) => number;
    };
    manager.rules = { ...DEFAULT_RULES, maxNodes: 5 };
    expect(
      manager.computeSpawnCount("avg_utilization_high", 1, 5, 10_000),
    ).toBe(0);
  });
});
