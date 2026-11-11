import os from "node:os";
import fs from "node:fs";

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

export const DEDICATED_DEPLOYMENT_LIMITS = Object.freeze({
  cpus: 16,
  memoryGB: 64,
});

function read(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch (error) {
    if ([
      "ENOENT",
      "ENOTDIR",
      "EACCES",
      "EPERM",
    ].includes(error.code)) {
      return null;
    }

    throw error;
  }
}

function nonnegative(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "max"
  ) {
    return null;
  }

  const result = Number(value);

  return Number.isFinite(result) && result >= 0
    ? result
    : null;
}

export function effectiveCapacity() {
  let cpus = os.availableParallelism();
  let memory = os.totalmem();

  const max = read("/sys/fs/cgroup/cpu.max")?.split(/\s+/);

  const quota = nonnegative(
    max?.[0] ??
    read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
  );

  const period = nonnegative(
    max?.[1] ??
    read("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
  );

  if (
    quota !== null && quota > 0 &&
    period !== null && period > 0
  ) {
    cpus = Math.min(cpus, quota / period);
  }

  for (const file of [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  ]) {
    const limit = nonnegative(read(file));

    if (limit !== null && limit > 0) {
      memory = Math.min(memory, limit);
    }
  }

  return {
    cpus,
    memoryGB: memory / GiB,
  };
}

export function clampDeploymentCapacity({cpus, memoryGB}) {
  if (
    !Number.isFinite(cpus) || cpus <= 0 ||
    !Number.isFinite(memoryGB) || memoryGB <= 0
  ) {
    throw new Error("Invalid detected deployment capacity");
  }

  return {
    cpus: Math.min(cpus, DEDICATED_DEPLOYMENT_LIMITS.cpus),
    memoryGB: Math.min(memoryGB, DEDICATED_DEPLOYMENT_LIMITS.memoryGB),
  };
}

/**
 * Resolve an optional worker allocation against both the live execution limit
 * and the configured dedicated-machine ceiling. A worker can be assigned at
 * least one CPU because the scheduler itself must make progress on fractional
 * quotas; it must never claim a larger budget than the detected capacity.
 */
export function deploymentWorkerBudget(
  requested,
  cpus = liveCapacity().cpus,
  variable = "DEPLOY_TASK_CPU",
) {
  if (!Number.isFinite(cpus) || cpus <= 0) {
    throw new Error("Invalid detected deployment CPU capacity");
  }

  const maximum = Math.max(
    1,
    Math.min(
      Math.floor(cpus),
      DEDICATED_DEPLOYMENT_LIMITS.cpus,
    ),
  );

  if (requested === undefined) return maximum;

  const value = String(requested);
  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > maximum
  ) {
    throw new Error(`${variable} must be an integer from 1 to ${maximum}`);
  }

  return Number(value);
}

/**
 * The executive's per-task assignment is advisory to child tools. If the
 * child observes a lower quota than its parent, reduce worker fan-out instead
 * of turning a valid scheduled task into an avoidable build failure.
 */
export function deploymentTaskWorkerBudget(
  requested,
  cpus = liveCapacity().cpus,
) {
  const available = deploymentWorkerBudget(undefined, cpus);
  if (requested === undefined) return available;

  const value = String(requested);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("DEPLOY_TASK_CPU must be a positive safe integer");
  }

  if (Number(value) > DEDICATED_DEPLOYMENT_LIMITS.cpus) {
    throw new Error(
      `DEPLOY_TASK_CPU must not exceed ${DEDICATED_DEPLOYMENT_LIMITS.cpus}`,
    );
  }

  return Math.min(Number(value), available);
}

export function liveCapacity() {
  // Replit's configured dedicated machine is 16 vCPU / 64 GiB. Continue to
  // honor lower cgroup limits, but never schedule beyond that configured size
  // if host-level capacity is visible to the process.
  const {cpus, memoryGB} = clampDeploymentCapacity(effectiveCapacity());
  const memoryBytes = memoryGB * GiB;

  const used =
    nonnegative(read("/sys/fs/cgroup/memory.current")) ??
    nonnegative(read(
      "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    ));

  const stats =
    read("/sys/fs/cgroup/memory.stat") ??
    read("/sys/fs/cgroup/memory/memory.stat") ??
    "";

  const reclaimable = Math.min(
    memoryBytes,
    nonnegative(
      stats.match(/^total_inactive_file\s+(\d+)$/m)?.[1],
    ) ??
    nonnegative(
      stats.match(/^inactive_file\s+(\d+)$/m)?.[1],
    ) ??
    0,
  );

  const meminfo = read("/proc/meminfo") ?? "";

  const hostAvailableKB = nonnegative(
    meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1],
  );

  const hostAvailable = hostAvailableKB === null
    ? os.freemem()
    : hostAvailableKB * 1024;

  // MemAvailable already accounts for reclaimable host cache.
  // Add inactive-file reclamation only to the cgroup calculation.
  const cgroupAvailable = used === null
    ? memoryBytes
    : Math.max(0, memoryBytes - used + reclaimable);

  const availableMB = Math.max(
    0,
    Math.min(
      memoryBytes,
      hostAvailable,
      cgroupAvailable,
    ),
  ) / MiB;

  const pressureText =
    read("/sys/fs/cgroup/io.pressure") ??
    read("/proc/pressure/io") ??
    "";

  const pressure = nonnegative(
    pressureText.match(/^some\s+avg10=([\d.]+)/m)?.[1],
  ) ?? 0;

  const ioSlots = pressure > 25
    ? 1
    : Math.max(1, Math.min(4, Math.floor(cpus / 2)));

  return {
    cpus,
    memoryMB: memoryBytes / MiB,
    availableMB,
    ioSlots,
  };
}