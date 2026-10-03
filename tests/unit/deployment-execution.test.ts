import { describe, it, expect } from "vitest";
import { compressionPlan, runDeploymentJobs } from "../../script/lib/deploymentExecution";
import { buildServerBundles, SERVER_ENTRIES } from "../../script/lib/serverBundles";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("deployment execution", () => {
  it("bounds workers and threads by effective CPU quota, including fractional CPUs", () => {
    for (const cpus of [0.25, 1, 2, 4, 8, 32]) {
      for (const jobs of [0, 1, 2, 4]) {
        const plan = compressionPlan(cpus, jobs);
        expect(plan.concurrency * plan.threads).toBeLessThanOrEqual(Math.max(1, Math.floor(cpus)));
      }
    }
    expect(compressionPlan(2, 4)).toEqual({ concurrency: 2, threads: 1 });
    expect(() => compressionPlan(NaN, 4)).toThrow();
  });
  it("limits active jobs and preserves input order", async () => {
    let active = 0, peak = 0;
    const results = await runDeploymentJobs([3, 1, 2, 0], 2, async n => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, n));
      active--;
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([30, 10, 20, 0]);
  });
  it("does not start pending packs after failure and waits for active packs", async () => {
    const started: number[] = [];
    let drained = false;
    await expect(runDeploymentJobs([0, 1, 2, 3], 2, async n => {
      started.push(n);
      if (n === 0) throw new Error("pack failure");
      await new Promise(resolve => setTimeout(resolve, 20));
      drained = true;
      return n;
    })).rejects.toThrow(/active jobs have drained/);
    expect(started).toEqual([0, 1]);
    expect(drained).toBe(true);
  });
  it("handles no jobs and rejects invalid concurrency", async () => {
    expect(await runDeploymentJobs([], 1, async () => 0)).toEqual([]);
    await expect(runDeploymentJobs([], 0, async () => 0)).rejects.toThrow();
  });
  it("builds all bootstrap names as standalone executable ESM without shared chunks", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-bundles-"));
    try {
      fs.writeFileSync(path.join(root, "common.ts"), "export const shared = 41;");
      for (const [name, entry] of Object.entries(SERVER_ENTRIES)) {
        fs.mkdirSync(path.dirname(path.join(root, entry)), { recursive: true });
        const relative = path.relative(path.dirname(entry), "common.ts").replaceAll("\\", "/");
        fs.writeFileSync(path.join(root, entry), `import { shared } from ${JSON.stringify(relative.startsWith(".") ? relative : "./" + relative)}; console.log(${JSON.stringify(name)} + ':' + (shared+1));`);
      }
      await buildServerBundles(root);
      expect(fs.readdirSync(path.join(root, "dist")).sort()).toEqual(Object.keys(SERVER_ENTRIES).map(n => `${n}.mjs`).sort());
      for (const name of Object.keys(SERVER_ENTRIES)) {
        expect(execFileSync(process.execPath, [path.join(root, "dist", name + ".mjs")], { encoding: "utf8" }).trim()).toBe(name + ":42");
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});