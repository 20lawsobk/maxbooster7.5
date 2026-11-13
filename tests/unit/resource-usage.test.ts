import { describe, expect, it } from "vitest";
import {
  CgroupCpuUsageSampler,
  readCgroupCpuUsageMicros,
} from "../../server/infrastructure/resourceUsage";

describe("container resource usage", () => {
  it("reads cgroup v2 CPU accounting", () => {
    expect(
      readCgroupCpuUsageMicros((path) =>
        path === "/sys/fs/cgroup/cpu.stat"
          ? "usage_usec 123456\nuser_usec 90000\nsystem_usec 33456\n"
          : null,
      ),
    ).toBe(123456);
  });

  it("reads cgroup v1 CPU accounting when v2 is unavailable", () => {
    expect(
      readCgroupCpuUsageMicros((path) =>
        path === "/sys/fs/cgroup/cpuacct/cpuacct.usage"
          ? "123456789\n"
          : null,
      ),
    ).toBe(123456);
  });

  it("reports unavailable accounting instead of substituting host CPU usage", () => {
    expect(readCgroupCpuUsageMicros(() => null)).toBeNull();
  });

  it("measures deltas against live CPU capacity and waits for a baseline", () => {
    let usage = 1_000_000;
    let now = 5_000;
    const sampler = new CgroupCpuUsageSampler({
      readUsageMicros: () => usage,
      nowMilliseconds: () => now,
    });

    expect(sampler.sample(8)).toBeNull();
    usage += 4_000_000;
    now += 1_000;
    expect(sampler.sample(8)).toBe(50);
    usage += 8_000_000;
    now += 1_000;
    expect(sampler.sample(8)).toBe(100);
  });

  it("resets its baseline after missing accounting or a counter reset", () => {
    let usage: number | null = 10_000;
    let now = 100;
    const sampler = new CgroupCpuUsageSampler({
      readUsageMicros: () => usage,
      nowMilliseconds: () => now,
    });

    expect(sampler.sample(2)).toBeNull();
    usage = null;
    now += 1_000;
    expect(sampler.sample(2)).toBeNull();
    usage = 20_000;
    now += 1_000;
    expect(sampler.sample(2)).toBeNull();
    usage = 5_000;
    now += 1_000;
    expect(sampler.sample(2)).toBeNull();
    usage = 10_000;
    now += 1_000;
    expect(sampler.sample(2)).toBe(0.25);
  });
});
