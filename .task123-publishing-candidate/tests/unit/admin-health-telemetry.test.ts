import { describe, expect, it } from "vitest";
import {
  createHostCpuUsageSampler,
  createHttpResponseMetrics,
  getDiskUsagePercent,
} from "../../server/services/adminHealthTelemetry";

describe("admin health telemetry", () => {
  it("does not claim a zero error rate before observing responses", () => {
    const metrics = createHttpResponseMetrics("2026-11-09T00:00:00.000Z");

    expect(metrics.snapshot()).toEqual({
      scope: "current_process",
      observedSince: "2026-11-09T00:00:00.000Z",
      requests: 0,
      clientErrors: 0,
      serverErrors: 0,
      errorResponses: 0,
      errorRatePercent: null,
      available: false,
    });
  });

  it("counts HTTP client and server errors separately and computes a measured rate", () => {
    const metrics = createHttpResponseMetrics("start");
    for (const status of [200, 302, 400, 404, 503]) metrics.record(status);

    expect(metrics.snapshot()).toMatchObject({
      requests: 5,
      clientErrors: 2,
      serverErrors: 1,
      errorResponses: 3,
      errorRatePercent: 60,
      available: true,
    });
  });

  it("ignores invalid HTTP status codes", () => {
    const metrics = createHttpResponseMetrics();
    expect(metrics.record(99)).toBe(false);
    expect(metrics.record(600)).toBe(false);
    expect(metrics.snapshot().requests).toBe(0);
  });

  it("measures host CPU from consecutive samples rather than lifetime counters", () => {
    const sample = createHostCpuUsageSampler();
    const cpu = (user: number, idle: number) => [
      { times: { user, nice: 0, sys: 0, idle, irq: 0 } },
    ];

    expect(sample(cpu(100, 100))).toBeNull();
    expect(sample(cpu(130, 170))).toBe(30);
  });

  it("returns unavailable when filesystem statistics are absent or invalid", () => {
    expect(getDiskUsagePercent(null)).toBeNull();
    expect(
      getDiskUsagePercent({ bsize: 4096, blocks: 100, bfree: 25 }),
    ).toBe(75);
    expect(
      getDiskUsagePercent({ bsize: 4096, blocks: 100, bfree: 120 }),
    ).toBeNull();
  });
});
