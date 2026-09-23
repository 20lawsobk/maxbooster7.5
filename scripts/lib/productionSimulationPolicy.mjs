import { readFileSync, statfsSync } from "node:fs";
import os from "node:os";

const GIB = 1024 ** 3;

function readNumber(path) {
  try {
    const value = readFileSync(path, "utf8").trim();
    return value === "max" ? null : Number(value);
  } catch {
    return null;
  }
}

export function inspectProductionProfile(path = ".") {
  const memoryLimitBytes = readNumber("/sys/fs/cgroup/memory.max");
  const memoryCurrentBytes = readNumber("/sys/fs/cgroup/memory.current");
  let cpuQuota = null;
  try {
    const [quota, period] = readFileSync("/sys/fs/cgroup/cpu.max", "utf8").trim().split(/\s+/);
    if (quota !== "max") cpuQuota = Number(quota) / Number(period);
  } catch {}
  const disk = statfsSync(path);
  return {
    configured: { cpu: 4, memoryBytes: 8 * GIB, imageHardLimitBytes: 8 * GIB },
    observed: {
      cpuQuota,
      logicalCpuCount: os.availableParallelism(),
      memoryLimitBytes,
      memoryCurrentBytes,
      memoryHeadroomBytes: memoryLimitBytes === null || memoryCurrentBytes === null
        ? null
        : memoryLimitBytes - memoryCurrentBytes,
      diskAvailableBytes: Number(disk.bavail) * Number(disk.bsize),
    },
  };
}

export function assessHeavyRun(profile, estimatedScratchBytes, capabilities = {}) {
  const reasons = [];
  const { configured, observed } = profile;
  if (observed.memoryLimitBytes !== configured.memoryBytes) {
    reasons.push(`observed cgroup memory limit ${observed.memoryLimitBytes ?? "unknown"} does not equal configured 8 GiB`);
  }
  if (observed.cpuQuota !== configured.cpu) {
    reasons.push(`observed cgroup CPU quota ${observed.cpuQuota ?? "unknown"} does not equal configured 4 CPU`);
  }
  if (observed.memoryHeadroomBytes === null || observed.memoryHeadroomBytes < 4 * GIB) {
    reasons.push(`less than 4 GiB memory headroom (${observed.memoryHeadroomBytes ?? "unknown"} bytes observed)`);
  }
  if (observed.diskAvailableBytes < estimatedScratchBytes + 8 * GIB) {
    reasons.push("insufficient disk for a disposable copy plus an 8 GiB safety reserve");
  }
  if (capabilities.networkNamespaceAvailable !== true) {
    reasons.push("required host-level Linux network namespace creation is unavailable in this test environment");
  }
  return { safe: reasons.length === 0, reasons, estimatedScratchBytes };
}

export function assertSanitizedEnvironment(env) {
  const forbidden = Object.keys(env).filter((name) =>
    /(?:API_KEY|ACCESS_KEY|SECRET_ACCESS|DATABASE_URL|NEON_|STRIPE_|TOKEN$|_TOKEN$)/i.test(name),
  );
  if (forbidden.length) throw new Error(`credential-bearing environment was not sanitized: ${forbidden.join(", ")}`);
}

export const runtimeIsolationPolicy = Object.freeze({
  required: true,
  transport: "Linux user+network namespace; only namespace-local loopback is reachable by the app and every native/Python descendant",
  filesystem: "all build and runtime writes are rooted in the disposable copy; source credentials, data, logs, media, and VCS metadata are excluded",
  credentials: "env-i style allowlist; generated simulation-only secrets; ephemeral local PostgreSQL only",
});