import { performance } from "node:perf_hooks";

/** Keep compression inside the container CPU budget, not the host CPU count. */
export function compressionPlan(cpus: number, jobs: number) {
  if (!Number.isFinite(cpus) || cpus <= 0 || !Number.isInteger(jobs) || jobs < 0) {
    throw new Error("Invalid deployment compression capacity");
  }
  const budget = Math.max(1, Math.floor(cpus));
  const concurrency = Math.min(budget, Math.max(1, jobs));
  return { concurrency, threads: Math.max(1, Math.floor(budget / concurrency)) };
}

/** On failure stop admitting work, but drain active destructive operations
 * before returning control to recovery/exit. Preserve result ordering. */
export async function runDeploymentJobs<T, R>(
  jobs: readonly T[], concurrency: number, run: (job: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid deployment concurrency");
  const results: R[] = new Array(jobs.length);
  const failures: unknown[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (!failures.length && next < jobs.length) {
      const index = next++;
      try { results[index] = await run(jobs[index], index); }
      catch (error) { failures.push(error); }
    }
  }));
  if (failures.length) throw new AggregateError(failures, "Deployment jobs failed; active jobs have drained");
  return results;
}

/** Log-only timings: no report file or late subprocess can repopulate payload. */
export function deploymentTimings() {
  const started = performance.now();
  let previous = started;
  return (phase: string) => {
    const now = performance.now();
    console.log(`[deployment-timing] ${phase}: ${((now - previous) / 1000).toFixed(3)}s; elapsed ${((now - started) / 1000).toFixed(3)}s`);
    previous = now;
  };
}