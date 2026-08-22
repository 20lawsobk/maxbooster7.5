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

export interface ComputeSizingOptions {
  /** Estimated memory footprint per worker, in GB. Required when the
   * caller wants a memory-aware ceiling; omit to size on CPU alone. */
  memPerWorkerGB?: number;
  /** Reserve one CPU core for a primary/coordinator process. Default true. */
  reserveCore?: boolean;
  /** Hard ceiling regardless of host capacity (e.g. a single-caller
   * loopback service that would just waste memory scaling with CPU count). */
  maxWorkers?: number;
  /** Env var name that, when set to a positive integer, pins the result
   * and bypasses auto-sizing entirely (for deliberate debugging/testing). */
  envOverrideVar?: string;
}

export interface ComputeSizingResult {
  numCPUs: number;
  freeMemGB: number;
  cpuLimit: number;
  memLimit: number | null;
  workerCount: number;
  source: "override" | "auto" | "capped";
}

/**
 * Derive a worker/parallelism count from the host's real CPU and memory
 * capacity. This is the single place that reads `os.cpus()`/`os.freemem()`
 * for sizing decisions — callers should not re-derive it independently.
 */
export function computeWorkerSizing(
  opts: ComputeSizingOptions = {},
): ComputeSizingResult {
  const numCPUs = os.cpus().length;
  const freeMemGB = os.freemem() / 1024 ** 3;

  const reserveCore = opts.reserveCore ?? true;
  const cpuLimit = Math.max(1, reserveCore ? numCPUs - 1 : numCPUs);
  const memLimit = opts.memPerWorkerGB
    ? Math.max(1, Math.floor(freeMemGB / opts.memPerWorkerGB))
    : null;

  const envOverride =
    opts.envOverrideVar && process.env[opts.envOverrideVar]
      ? parseInt(process.env[opts.envOverrideVar] as string, 10)
      : null;

  if (envOverride && envOverride > 0) {
    return {
      numCPUs,
      freeMemGB,
      cpuLimit,
      memLimit,
      workerCount: envOverride,
      source: "override",
    };
  }

  const autoSized = memLimit !== null ? Math.min(cpuLimit, memLimit) : cpuLimit;

  if (opts.maxWorkers && opts.maxWorkers > 0 && autoSized > opts.maxWorkers) {
    return {
      numCPUs,
      freeMemGB,
      cpuLimit,
      memLimit,
      workerCount: opts.maxWorkers,
      source: "capped",
    };
  }

  return {
    numCPUs,
    freeMemGB,
    cpuLimit,
    memLimit,
    workerCount: autoSized,
    source: "auto",
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
