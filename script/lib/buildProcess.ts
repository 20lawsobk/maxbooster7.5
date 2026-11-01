import { spawn } from "node:child_process";

/** A phase completes only after its subprocess and stdio have closed. */
export function runBuildProcess(command: string, args: string[], cwd: string, env = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Build process ${command} failed (${signal || code})`));
    });
  });
}

/** At most two heavyweight preparation jobs; retain ~3 GiB per job.
 * This is a conservative concurrency budget, not a measured RSS guarantee. */
export function preparationConcurrency(capacity: { cpus: number; memoryGB: number }): number {
  return capacity.cpus >= 2 && capacity.memoryGB >= 6 ? 2 : 1;
}