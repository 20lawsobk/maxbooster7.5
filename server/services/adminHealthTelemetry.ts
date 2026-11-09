export interface CpuTimesSample {
  times: {
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
  };
}

export interface HttpResponseMetrics {
  scope: "current_process";
  observedSince: string;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  errorResponses: number;
  errorRatePercent: number | null;
  available: boolean;
}

export function createHttpResponseMetrics(
  observedSince = new Date().toISOString(),
) {
  let requests = 0;
  let clientErrors = 0;
  let serverErrors = 0;

  return {
    record(statusCode: number): boolean {
      if (
        !Number.isInteger(statusCode) ||
        statusCode < 100 ||
        statusCode > 599
      ) {
        return false;
      }

      requests += 1;
      if (statusCode >= 500) serverErrors += 1;
      else if (statusCode >= 400) clientErrors += 1;
      return true;
    },

    snapshot(): HttpResponseMetrics {
      const errorResponses = clientErrors + serverErrors;
      return {
        scope: "current_process",
        observedSince,
        requests,
        clientErrors,
        serverErrors,
        errorResponses,
        errorRatePercent:
          requests > 0
            ? Number(((errorResponses / requests) * 100).toFixed(2))
            : null,
        available: requests > 0,
      };
    },
  };
}

const processHttpMetrics = createHttpResponseMetrics();

export function recordHttpResponse(statusCode: number): void {
  processHttpMetrics.record(statusCode);
}

export function getHttpResponseMetrics(): HttpResponseMetrics {
  return processHttpMetrics.snapshot();
}

export function createHostCpuUsageSampler() {
  let previous: Array<{ idle: number; total: number }> | null = null;

  return (cpus: CpuTimesSample[]): number | null => {
    if (!Array.isArray(cpus) || cpus.length === 0) {
      previous = null;
      return null;
    }

    const current = cpus.map(({ times }) => {
      const { user, nice, sys, idle, irq } = times ?? {};
      const values = [user, nice, sys, idle, irq].map(Number);
      if (!values.every(Number.isFinite)) return null;
      return {
        idle: values[3],
        total: values.reduce((sum, value) => sum + value, 0),
      };
    });

    if (
      current.some((sample) => sample === null) ||
      current.some((sample) => sample && sample.total < 0)
    ) {
      previous = null;
      return null;
    }

    const validCurrent = current as Array<{ idle: number; total: number }>;
    const prior = previous;
    previous = validCurrent;
    if (!prior || prior.length !== validCurrent.length) return null;

    let idleDelta = 0;
    let totalDelta = 0;
    for (let index = 0; index < validCurrent.length; index += 1) {
      const currentSample = validCurrent[index];
      const priorSample = prior[index];
      const currentTotalDelta = currentSample.total - priorSample.total;
      const currentIdleDelta = currentSample.idle - priorSample.idle;
      if (
        currentTotalDelta < 0 ||
        currentIdleDelta < 0 ||
        currentIdleDelta > currentTotalDelta
      ) {
        previous = null;
        return null;
      }
      totalDelta += currentTotalDelta;
      idleDelta += currentIdleDelta;
    }

    if (totalDelta <= 0) return null;
    return Math.round(((totalDelta - idleDelta) / (totalDelta || 1)) * 100);
  };
}

export function getDiskUsagePercent(
  stat:
    | { bsize: number | bigint; blocks: number | bigint; bfree: number | bigint }
    | null
    | undefined,
): number | null {
  if (!stat) return null;
  const blockSize = Number(stat.bsize);
  const blocks = Number(stat.blocks);
  const freeBlocks = Number(stat.bfree);
  if (
    !Number.isFinite(blockSize) ||
    blockSize <= 0 ||
    !Number.isFinite(blocks) ||
    blocks <= 0 ||
    !Number.isFinite(freeBlocks) ||
    freeBlocks < 0 ||
    freeBlocks > blocks
  ) {
    return null;
  }

  return Math.round(((blocks - freeBlocks) / blocks) * 100);
}
