import { beforeEach, describe, expect, it, vi } from "vitest";

describe("MaxCore application readiness gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fails closed while the supervised Python model is not loaded", async () => {
    vi.doMock("../../server/services/maxcoreLocalSupervisor.js", () => ({
      checkMaxcoreLocalReady: vi.fn().mockResolvedValue(false),
      getMaxcoreLocalStatus: vi.fn(() => ({
        enabled: true,
        running: true,
        ready: false,
        pid: 123,
        restarts: 0,
        lastExit: null,
        error: null,
      })),
    }));

    const { probeMaxcoreReadiness } = await import(
      "../../server/lib/healthRegistry.js"
    );
    await expect(probeMaxcoreReadiness()).resolves.toEqual({
      status: "degraded",
      detail: "supervised Python model not ready (running=true, restarts=0)",
    });
  });

  it("reports ok only after the supervised Python model readiness passes", async () => {
    vi.doMock("../../server/services/maxcoreLocalSupervisor.js", () => ({
      checkMaxcoreLocalReady: vi.fn().mockResolvedValue(true),
      getMaxcoreLocalStatus: vi.fn(() => ({
        enabled: true,
        running: true,
        ready: true,
        pid: 123,
        restarts: 0,
        lastExit: null,
        error: null,
      })),
    }));

    const { probeMaxcoreReadiness } = await import(
      "../../server/lib/healthRegistry.js"
    );
    await expect(probeMaxcoreReadiness()).resolves.toEqual({
      status: "ok",
      detail: "supervised Python model loaded",
    });
  });

  it("does not retain a cached ok after authority loss", async () => {
    const { healthRegistry } = await import("../../server/lib/healthRegistry.js");
    let authorityReady = true;
    healthRegistry.register("maxcore", async () => ({
      status: authorityReady ? "ok" : "down",
    }));

    await expect(healthRegistry.check("maxcore")).resolves.toMatchObject({
      status: "ok",
    });
    authorityReady = false;
    await expect(healthRegistry.check("maxcore")).resolves.toMatchObject({
      status: "down",
    });
  });
});