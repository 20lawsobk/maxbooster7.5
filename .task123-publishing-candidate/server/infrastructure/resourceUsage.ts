import fs from "node:fs";
import { liveCapacity } from "../../script/deployment/capacity.mjs";

const MICROS_PER_MILLISECOND = 1_000;

function readOptional(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      return null;
    }
    throw error;
  }
}

/** Return container CPU time from cgroup v2 or v1 accounting, never host totals. */
export function readCgroupCpuUsageMicros(
  readFile: (path: string) => string | null = readOptional,
): number | null {
  const v2 = readFile("/sys/fs/cgroup/cpu.stat");
  const usageMicros = v2?.match(/^usage_usec\s+(\d+)$/m)?.[1];
  if (usageMicros !== undefined) {
    const parsed = Number(usageMicros);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
    throw new Error("Invalid cgroup v2 CPU usage counter");
  }

  const v1 = readFile("/sys/fs/cgroup/cpuacct/cpuacct.usage");
  if (v1 !== null) {
    let nanoseconds: bigint;
    try {
      nanoseconds = BigInt(v1.trim());
    } catch {
      throw new Error("Invalid cgroup v1 CPU usage counter");
    }
    if (nanoseconds < 0) throw new Error("Invalid cgroup v1 CPU usage counter");
    const micros = nanoseconds / 1_000n;
    if (micros > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Cgroup v1 CPU usage counter exceeds safe numeric range");
    }
    return Number(micros);
  }

  return null;
}

export interface CpuUsageSamplerOptions {
  readUsageMicros?: () => number | null;
  nowMilliseconds?: () => number;
  minimumIntervalMs?: number;
}

/** Calculate recent utilization against the actual cgroup CPU capacity. */
export class CgroupCpuUsageSampler {
  private readonly readUsageMicros: () => number | null;
  private readonly nowMilliseconds: () => number;
  private readonly minimumIntervalMs: number;
  private previous: { usageMicros: number; at: number } | null = null;
  private lastPercentage: number | null = null;

  constructor(options: CpuUsageSamplerOptions = {}) {
    this.readUsageMicros =
      options.readUsageMicros ?? (() => readCgroupCpuUsageMicros());
    this.nowMilliseconds =
      options.nowMilliseconds ??
      (() => Number(process.hrtime.bigint()) / 1_000_000);
    this.minimumIntervalMs = options.minimumIntervalMs ?? 1_000;
    if (!Number.isFinite(this.minimumIntervalMs) || this.minimumIntervalMs < 0) {
      throw new Error("CPU usage sample interval must be a nonnegative number");
    }
  }

  sample(cpus = liveCapacity().cpus): number | null {
    if (!Number.isFinite(cpus) || cpus <= 0) {
      throw new Error("Invalid live CPU capacity for usage sampling");
    }

    const usageMicros = this.readUsageMicros();
    if (usageMicros === null) {
      this.previous = null;
      this.lastPercentage = null;
      return null;
    }
    if (!Number.isSafeInteger(usageMicros) || usageMicros < 0) {
      throw new Error("Invalid cgroup CPU usage sample");
    }

    const at = this.nowMilliseconds();
    if (!Number.isFinite(at)) throw new Error("Invalid CPU sample clock");

    const previous = this.previous;
    if (!previous) {
      this.previous = { usageMicros, at };
      return null;
    }

    const elapsedMs = at - previous.at;
    if (elapsedMs < this.minimumIntervalMs) return this.lastPercentage;
    this.previous = { usageMicros, at };
    const elapsedCpuMicros = usageMicros - previous.usageMicros;
    if (elapsedMs <= 0 || elapsedCpuMicros < 0) {
      this.lastPercentage = null;
      return null;
    }

    const capacityMicros = elapsedMs * MICROS_PER_MILLISECOND * cpus;
    this.lastPercentage = Math.min(
      100,
      Math.max(0, (elapsedCpuMicros / capacityMicros) * 100),
    );
    return this.lastPercentage;
  }
}
