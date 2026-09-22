// Shared compute-sizing source of truth.
//
// Multiple independent processes on this host each decide "how much
// parallelism to use": the main app's Node cluster (server/cluster.ts), the
// imported MaxCore api-server's own Node cluster
// (server/services/maxcoreLocalSupervisor.ts), and MaxCore's Python HyperGPU
// engine (external/maxcore/.../server.py, via env vars this module derives).
// Before this module existed, each one read `os.cpus()`/hardcoded a number
// independently. This module centralizes that derivation so every consumer
// reasons about the same host capacity the same way, while still letting
// each caller apply its own constraints (memory ceiling, a hard cap for a
// single-caller loopback service, an env override for debugging).
import os from "os";
import fs from "node:fs";

function limitFile(file: string): string | null {
  try { return fs.readFileSync(file, "utf8").trim(); }
  catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
    throw error;
  }
}

/** Effective cgroup v2/v1 limits, bounded by process affinity and physical RAM. */
export function effectiveCapacity(): { cpus: number; memoryGB: number } {
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

export interface ComputeSizingOptions {
  /** Optional caller minimum RSS estimate. Role-specific configured minima
   * apply when omitted. Never use a compiler heap requirement here. */
  memPerWorkerGB?: number;
  /** Compatibility input; coordinator reservation is always enforced. */
  reserveCore?: boolean;
  /** Hard ceiling regardless of host capacity (e.g. a single-caller
   * loopback service that would just waste memory scaling with CPU count). */
  maxWorkers?: number;
  /** Positive integer worker override, always bounded by the role budget. */
  envOverrideVar?: string;
}

export interface ComputeSizingResult {
  numCPUs: number;
  freeMemGB: number;
  cpuLimit: number;
  memLimit: number | null;
  workerCount: number;
  source: "override" | "auto" | "capped";
  workerHeapMB: number;
  workerMemoryMB: number;
  primaryHeapMB: number;
  maxcorePrimaryHeapMB: number;
  pythonMemoryMB: number;
  pythonThreads: number;
  /** Fractional CPU shares may be time-shared on small quota allocations. */
  cpuBudget: number;
  reservationsMB: { headroom: number; primary: number; maxcorePrimary: number; sidecars: number; python: number };
}

function positiveConfig(name: string, defaultValue: number): number {
  const value = process.env[name] === undefined ? defaultValue : Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return value;
}

/**
 * Derive worker counts and heap ceilings from one deterministic host budget.
 * Callers must not interpret freeMemGB (the allocated role pool) as free RAM.
 */
export function computeWorkerSizing(
  opts: ComputeSizingOptions = {},
): ComputeSizingResult {
  const capacity = effectiveCapacity();
  const numCPUs = capacity.cpus;
  // Minimum-first allocation, not the old 4.5/6 GiB compiler/heap tiers.
  // Defaults are conservative configurable runtime reservations, not measured
  // per-service peaks. Reserve every enabled role before distributing surplus.
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
    python: local ? Math.ceil(positiveConfig("PYTHON_MEMORY_MB", 1024)) : 0,
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

  // CPU quota is shared, not a claim that each Node process needs a dedicated
  // physical CPU. Keep one worker per role at low quotas; larger quotas can
  // admit more within disjoint shares. reserveCore:false never steals a share.
  const cpuBudget = numCPUs * (local ? 0.25 : 0.75);
  const cpuLimit = Math.max(1, Math.floor(cpuBudget));
  const memoryPerWorker = opts.memPerWorkerGB ?? (maxcore && local ? maxcoreMinimumMB : appMinimumMB) / 1024;
  if (!Number.isFinite(memoryPerWorker) || memoryPerWorker <= 0) throw new Error("Invalid per-worker memory budget");
  const memLimit = Math.floor(freeMemGB / memoryPerWorker);
  if (memLimit < 1) throw new Error(`Insufficient aggregate memory for ${maxcore ? "MaxCore" : "app"} workers: ${freeMemGB.toFixed(2)} GiB available`);

  const envOverride =
    opts.envOverrideVar && process.env[opts.envOverrideVar]
      ? Number(process.env[opts.envOverrideVar])
      : null;

  const automatic = Math.min(cpuLimit, memLimit);
  let workerCount = Math.min(automatic, opts.maxWorkers ?? Infinity);
  let source: ComputeSizingResult["source"] = workerCount < automatic ? "capped" : "auto";
  if (opts.maxWorkers !== undefined && (!Number.isInteger(opts.maxWorkers) || opts.maxWorkers < 1)) {
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
    reservationsMB,
  };
}

/**
 * Derive HyperGPU's modeled `lanes`/`tensor_cores` sizing from host CPU
 * capacity. These are software-modeled parallel units (see
 * external/maxcore DOCS.md §12) — there is no physical register to read —
 * but the underlying NumPy/BLAS math genuinely uses more OS threads on a
 * host with more CPUs, so scaling the modeled unit count with `cpuLimit`
 * keeps the model's parallelism proportional to what the host can actually
 * execute concurrently, instead of a fixed guess.
 *
 * Bounds keep both dimensions inside HyperGPU's tested/expected range:
 * lanes must stay a multiple of 32 (SIMD width) and tensor_cores mirrors
 * a small pool of modeled compute units (each already models an 8x
 * throughput multiplier — many more units would not reflect anything real).
 */
export function computeHyperGpuSizing(
  cpuLimit: number = computeWorkerSizing().cpuLimit,
): { lanes: number; tensorCores: number } {
  const lanes = Math.min(1024, Math.max(128, cpuLimit * 64));
  const tensorCores = Math.min(16, Math.max(2, cpuLimit));
  return { lanes, tensorCores };
}
