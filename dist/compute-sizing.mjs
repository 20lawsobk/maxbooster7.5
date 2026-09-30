// server/computeSizing.ts
import os from "os";
import fs from "node:fs";
function limitFile(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code ?? "")) return null;
    throw error;
  }
}
function effectiveCapacity() {
  let cpus = os.availableParallelism();
  let memory = os.totalmem();
  const cpuMax = limitFile("/sys/fs/cgroup/cpu.max")?.split(/\s+/);
  const quota = cpuMax ? Number(cpuMax[0]) : Number(limitFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"));
  const period = cpuMax ? Number(cpuMax[1]) : Number(limitFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us"));
  if (quota > 0 && period > 0) cpus = Math.min(cpus, quota / period);
  for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    const n = Number(limitFile(file));
    if (n > 0 && Number.isFinite(n)) memory = Math.min(memory, n);
  }
  return { cpus, memoryGB: memory / 1024 ** 3 };
}
function positiveConfig(name, defaultValue) {
  const value = process.env[name] === void 0 ? defaultValue : Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return value;
}
function computeWorkerSizing(opts = {}) {
  const capacity = effectiveCapacity();
  const numCPUs = capacity.cpus;
  const local = process.env.MAXCORE_LOCAL !== "0";
  const maxcore = opts.envOverrideVar === "MAXCORE_LOCAL_CLUSTER_WORKERS";
  const memoryMB = Math.floor(capacity.memoryGB * 1024);
  const headroomPercent = positiveConfig("COMPUTE_HEADROOM_PERCENT", 20);
  if (headroomPercent >= 100) throw new Error("COMPUTE_HEADROOM_PERCENT must be below 100");
  const reservationsMB = {
    headroom: Math.max(512, Math.ceil(memoryMB * headroomPercent / 100)),
    primary: Math.ceil(positiveConfig("APP_PRIMARY_MEMORY_MB", 768)),
    maxcorePrimary: local ? Math.ceil(positiveConfig("MAXCORE_PRIMARY_MEMORY_MB", 256)) : 0,
    sidecars: Math.ceil(positiveConfig("SIDECAR_MEMORY_MB", 512)),
    python: local ? Math.ceil(positiveConfig("PYTHON_MEMORY_MB", 1024)) : 0
  };
  const appMinimumMB = Math.ceil(positiveConfig("APP_WORKER_MIN_MEMORY_MB", 1024));
  const maxcoreMinimumMB = local ? Math.ceil(positiveConfig("MAXCORE_WORKER_MIN_MEMORY_MB", 768)) : 0;
  const reservedMB = Object.values(reservationsMB).reduce((sum, n) => sum + n, 0);
  const surplusMB = memoryMB - reservedMB - appMinimumMB - maxcoreMinimumMB;
  if (surplusMB < 0) {
    throw new Error(`Insufficient aggregate memory: configured role minima and headroom require ${reservedMB + appMinimumMB + maxcoreMinimumMB} MiB, quota is ${memoryMB} MiB`);
  }
  const appPoolMB = appMinimumMB + Math.floor(surplusMB * (local ? 0.7 : 1));
  const maxcorePoolMB = local ? memoryMB - reservedMB - appPoolMB : 0;
  const freeMemGB = (maxcore && local ? maxcorePoolMB : appPoolMB) / 1024;
  const cpuBudget = numCPUs * (local ? 0.25 : 0.75);
  const appCluster = opts.envOverrideVar === "CLUSTER_WORKERS";
  const workerCpuShare = appCluster ? positiveConfig("APP_WORKER_CPU_SHARE", 1) : 1;
  if (workerCpuShare > 1) {
    throw new Error("APP_WORKER_CPU_SHARE must be at most 1");
  }
  const cpuLimit = Math.min(
    os.availableParallelism(),
    Math.max(1, Math.floor(cpuBudget / workerCpuShare))
  );
  const memoryPerWorker = opts.memPerWorkerGB ?? (maxcore && local ? maxcoreMinimumMB : appMinimumMB) / 1024;
  if (!Number.isFinite(memoryPerWorker) || memoryPerWorker <= 0) throw new Error("Invalid per-worker memory budget");
  const memLimit = Math.floor(freeMemGB / memoryPerWorker);
  if (memLimit < 1) throw new Error(`Insufficient aggregate memory for ${maxcore ? "MaxCore" : "app"} workers: ${freeMemGB.toFixed(2)} GiB available`);
  const envOverride = opts.envOverrideVar && process.env[opts.envOverrideVar] ? Number(process.env[opts.envOverrideVar]) : null;
  const automatic = Math.min(cpuLimit, memLimit);
  let workerCount = Math.min(automatic, opts.maxWorkers ?? Infinity);
  let source = workerCount < automatic ? "capped" : "auto";
  if (opts.maxWorkers !== void 0 && (!Number.isInteger(opts.maxWorkers) || opts.maxWorkers < 1)) {
    throw new Error("maxWorkers must be a positive integer");
  }
  if (envOverride !== null) {
    if (!Number.isInteger(envOverride) || envOverride < 1 || envOverride > Math.min(cpuLimit, memLimit, opts.maxWorkers ?? Infinity)) {
      throw new Error(`${opts.envOverrideVar} exceeds the shared compute budget or is not a positive integer`);
    }
    workerCount = envOverride;
    source = "override";
  }
  const workerMemoryMB = Math.floor(freeMemGB * 1024 / workerCount);
  const workerHeapMB = Math.floor(workerMemoryMB * 0.6);
  const primaryHeapMB = Math.min(512, Math.floor(reservationsMB.primary * 2 / 3));
  if (workerHeapMB < 1 || primaryHeapMB < 1) throw new Error("Configured memory allocations cannot provide a positive V8 heap");
  return {
    numCPUs,
    freeMemGB,
    cpuLimit,
    memLimit,
    workerCount,
    source,
    workerMemoryMB,
    // Leave 40% of each RSS allocation for native/non-V8 memory. This cap is
    // not an OS RSS limit; the container quota and measured admission remain
    // the outer enforcement boundaries.
    workerHeapMB,
    primaryHeapMB,
    maxcorePrimaryHeapMB: Math.floor(reservationsMB.maxcorePrimary * 0.6),
    pythonMemoryMB: reservationsMB.python,
    pythonThreads: 1,
    cpuBudget,
    workerCpuShare,
    reservationsMB
  };
}
function computeHyperGpuSizing(cpuLimit = computeWorkerSizing().cpuLimit) {
  const lanes = Math.min(1024, Math.max(128, cpuLimit * 64));
  const tensorCores = Math.min(16, Math.max(2, cpuLimit));
  return { lanes, tensorCores };
}
export {
  computeHyperGpuSizing,
  computeWorkerSizing,
  effectiveCapacity
};
