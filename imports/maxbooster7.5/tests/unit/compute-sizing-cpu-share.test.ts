import fs from "node:fs";
import os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeWorkerSizing } from "../../server/computeSizing.js";

describe("app cluster CPU-share allocation", () => {
  const originalEnv = process.env;

  function host(cpus: number, memoryGB: number) {
    vi.spyOn(os, "availableParallelism").mockReturnValue(cpus);
    vi.spyOn(os, "totalmem").mockReturnValue(memoryGB * 1024 ** 3);
    const readFileSync = fs.readFileSync.bind(fs);
    vi.spyOn(fs, "readFileSync").mockImplementation(
      ((file: Parameters<typeof fs.readFileSync>[0], ...args: unknown[]) => {
        if (String(file).startsWith("/sys/fs/cgroup/")) {
          throw Object.assign(new Error("cgroup file missing"), { code: "ENOENT" });
        }
        return (readFileSync as (...args: unknown[]) => unknown)(file, ...args);
      }) as typeof fs.readFileSync,
    );
  }

  beforeEach(() => {
    process.env = { ...originalEnv, MAXCORE_LOCAL: "1" };
    for (const key of [
      "APP_WORKER_CPU_SHARE", "CLUSTER_WORKERS",
      "MAXCORE_LOCAL_CLUSTER_WORKERS", "COMPUTE_HEADROOM_PERCENT",
      "APP_PRIMARY_MEMORY_MB", "MAXCORE_PRIMARY_MEMORY_MB",
      "SIDECAR_MEMORY_MB", "PYTHON_MEMORY_MB",
      "APP_WORKER_MIN_MEMORY_MB", "MAXCORE_WORKER_MIN_MEMORY_MB",
    ]) delete process.env[key];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("keeps the default 16-vCPU/64-GiB production allocation unchanged", () => {
    host(16, 64);
    const app = computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" });
    const maxcore = computeWorkerSizing({ envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS" });
    expect(app).toMatchObject({
      numCPUs: 16, cpuBudget: 4, cpuLimit: 4,
      workerCount: 4, workerCpuShare: 1,
    });
    expect(maxcore).toMatchObject({
      numCPUs: 16, cpuBudget: 4, cpuLimit: 4,
      workerCount: 4, workerCpuShare: 1,
    });
  });

  it("admits two app processes sharing the measured 4-vCPU/8-GiB app budget", () => {
    host(4, 8);
    process.env.APP_WORKER_CPU_SHARE = "0.5";
    process.env.CLUSTER_WORKERS = "2";
    const app = computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" });
    const maxcore = computeWorkerSizing({ envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS" });
    expect(app).toMatchObject({
      numCPUs: 4, cpuBudget: 1, cpuLimit: 2,
      workerCount: 2, source: "override", workerCpuShare: 0.5,
      reservationsMB: {
        headroom: 1639, primary: 768, maxcorePrimary: 256,
        sidecars: 512, python: 1024,
      },
    });
    expect(app.workerMemoryMB).toBeGreaterThanOrEqual(1024);
    expect(app.workerHeapMB).toBe(Math.floor(app.workerMemoryMB * 0.6));
    expect(maxcore).toMatchObject({
      numCPUs: 4, cpuBudget: 1, cpuLimit: 1,
      workerCount: 1, workerCpuShare: 1,
    });
    expect(maxcore.reservationsMB).toEqual(app.reservationsMB);
  });

  it("rejects invalid CPU shares and worker counts outside measured budgets", () => {
    host(4, 8);
    for (const share of ["0", "-0.5", "NaN", "Infinity", "2", ""]) {
      process.env.APP_WORKER_CPU_SHARE = share;
      expect(() => computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" }))
        .toThrow(/APP_WORKER_CPU_SHARE/);
    }
    process.env.APP_WORKER_CPU_SHARE = "0.001";
    process.env.CLUSTER_WORKERS = "5";
    expect(() => computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" }))
      .toThrow(/CLUSTER_WORKERS exceeds the shared compute budget/);

    process.env.CLUSTER_WORKERS = "2";
    process.env.APP_WORKER_CPU_SHARE = "0.5";
    process.env.APP_WORKER_MIN_MEMORY_MB = "1700";
    expect(() => computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" }))
      .toThrow(/CLUSTER_WORKERS exceeds the shared compute budget/);

    process.env.APP_WORKER_MIN_MEMORY_MB = "4096";
    expect(() => computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" }))
      .toThrow(/Insufficient aggregate memory/);
  });
});