import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const freePort = async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
  if (!port) throw new Error("could not reserve integration port");
  return port;
};

const waitFor = async (
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("cluster recovery integration wait timed out");
};

describe("cluster-primary retained PDIM recovery authority", () => {
  it("shares one job and durable receipt across workers and replacement", async () => {
    const workspace = process.cwd();
    const scratch = await mkdtemp(join(workspace, ".pdim-cluster-test-"));
    const ports = await Promise.all([freePort(), freePort(), freePort()]);
    const [pdimPort, workerA, workerB] = ports;
    const bundle = join(scratch, "cluster-fixture.mjs");
    const jobStore = join(scratch, "pdim-recovery-jobs.json");
    await build({
      entryPoints: [
        join(workspace, "tests/fixtures/pdim-recovery-cluster-fixture.ts"),
      ],
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      outfile: bundle,
      packages: "external",
      logLevel: "silent",
    });
    const child = spawn(process.execPath, [bundle], {
      cwd: scratch,
      env: {
        ...process.env,
        NODE_ENV: "test",
        LOCAL_PDIM_PORT: String(pdimPort),
        PDIM_EXEC_URL:
          `http://127.0.0.1:${pdimPort}/api/redis/instances/local/exec`,
        PDIM_HTTP_EXEC_URL:
          `http://127.0.0.1:${pdimPort}/api/redis/instances/local/exec`,
        PDIM_RECOVERY_JOB_STORE_PATH: jobStore,
        RECOVERY_FIXTURE_PORTS: `${workerA},${workerB}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    try {
      await waitFor(async () => stdout.includes("RECOVERY_CLUSTER_READY"));
      const starts = await Promise.all([
        fetch(`http://127.0.0.1:${workerA}/create`, { method: "POST" }),
        fetch(`http://127.0.0.1:${workerB}/create`, { method: "POST" }),
      ]);
      expect(starts.map(response => response.status).sort()).toEqual([202, 409]);
      const acceptedIndex = starts.findIndex(response => response.status === 202);
      const accepted = await starts[acceptedIndex].json() as any;
      const jobId = accepted.job.id as string;
      const pollingPort = acceptedIndex === 0 ? workerB : workerA;

      let completed: any = null;
      await waitFor(async () => {
        const response = await fetch(
          `http://127.0.0.1:${pollingPort}/jobs/${jobId}`,
        );
        if (!response.ok) return false;
        const body = await response.json() as any;
        if (body.job?.state !== "complete") return false;
        completed = body.job;
        return true;
      });
      expect(completed.receipt).toMatchObject({
        generationBoundReadback: true,
        isolatedRestoreVerified: true,
        fileCount: 1,
        ownerCount: 1,
      });

      const beforeReplacementMarkers = stdout.split(
        "RECOVERY_CLUSTER_REPLACEMENT_READY",
      ).length;
      const exit = await fetch(`http://127.0.0.1:${pollingPort}/exit`, {
        method: "POST",
      });
      expect(exit.status).toBe(202);
      await waitFor(async () =>
        stdout.split("RECOVERY_CLUSTER_REPLACEMENT_READY").length >
          beforeReplacementMarkers);
      await waitFor(async () => {
        try {
          const response = await fetch(
            `http://127.0.0.1:${pollingPort}/jobs/${jobId}`,
          );
          if (!response.ok) return false;
          const body = await response.json() as any;
          return body.job?.receipt?.snapshotGeneration === "701";
        } catch {
          return false;
        }
      });

      const durable = JSON.parse(await readFile(jobStore, "utf8"));
      expect((await stat(jobStore)).mode & 0o777).toBe(0o600);
      const stored = durable.jobs.find((job: any) => job.id === jobId);
      expect(stored.state).toBe("complete");
      expect(stored.receipt.snapshotGeneration).toBe("701");
      expect(stderr).not.toMatch(/authority mismatch|ERR_MODULE_NOT_FOUND/);
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 2_000);
        child.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      await rm(scratch, { recursive: true, force: true });
    }
  }, 60_000);
});