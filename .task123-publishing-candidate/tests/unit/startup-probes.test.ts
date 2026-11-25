/**
 * Unit tests for StartupProbeManager logic (without real DB/Redis connections).
 */
import { describe, it, expect, vi } from "vitest";

// Mock db before importing startup-probes
vi.mock("../../server/db.js", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../server/services/maxcoreLocalSupervisor.js", () => ({
  checkMaxcoreLocalReady: vi.fn().mockResolvedValue(true),
  getMaxcoreLocalStatus: vi.fn(() => ({
    enabled: true,
    running: true,
    ready: true,
    restarts: 0,
    error: null,
  })),
}));

describe("StartupProbeManager", () => {
  it("is importable and has runAllProbes method", async () => {
    const mod = await import("../../server/startup-probes.js");
    expect(mod.startupProbes).toBeDefined();
    expect(typeof mod.startupProbes.runAllProbes).toBe("function");
    expect(typeof mod.startupProbes.isReady).toBe("function");
    expect(typeof mod.startupProbes.getStatus).toBe("function");
  });

  it('initialises in "initializing" phase', async () => {
    // Status should be a fresh instance
    const mod = await import("../../server/startup-probes.js");
    const status = mod.startupProbes.getStatus();
    expect(status).toHaveProperty("phase");
    expect([
      "initializing",
      "connecting",
      "ready",
      "degraded",
      "failed",
    ]).toContain(status.phase);
  });

  it("retains the legacy TensorFlow DTO member without probing it", async () => {
    const mod = await import("../../server/startup-probes.js");
    const status = mod.startupProbes.getStatus();
    expect(status.probes).toHaveProperty("database");
    expect(status.probes).toHaveProperty("redis");
    expect(status.probes.tensorflow).toMatchObject({
      status: "disabled",
      error: "AI inference is owned by MaxCore",
    });
    expect(
      (mod.startupProbes as unknown as { checkTensorFlow?: unknown })
        .checkTensorFlow,
    ).toBeUndefined();
  });

  it("uses MaxCore readiness and reaches ready without local TensorFlow", async () => {
    const mod = await import("../../server/startup-probes.js");
    vi.spyOn(mod.startupProbes, "checkRedis").mockResolvedValue(true);
    await mod.startupProbes.runAllProbes();
    const status = mod.startupProbes.getStatus();

    expect(status.probes.maxcore.status).toBe("ready");
    expect(status.probes.tensorflow.status).toBe("disabled");
    expect(status.phase).toBe("ready");
    mod.startupProbes.shutdown();
  });

  it("isReady returns boolean", async () => {
    const mod = await import("../../server/startup-probes.js");
    expect(typeof mod.startupProbes.isReady()).toBe("boolean");
  });
});
