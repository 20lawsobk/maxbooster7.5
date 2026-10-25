import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const loader = join(workspace, "node_modules/tsx/dist/loader.mjs");

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => server.once("error", reject).listen(0, "127.0.0.1", accept));
  const { port } = server.address();
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
  assert.ok(port > 0 && port <= 65528, "private runtime ports must fit the contract");
  return port;
}

async function within(promise, deadlineMs, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), deadlineMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function startOwned(childScript, cwd, port) {
  // The production module receives no database/provider/remote bucket binding.
  const env = {
    NODE_ENV: "test", LOCAL_PDIM_PORT: String(port), PORT: String(port + 1),
    VIDEO_DIFFUSION_PORT: String(port + 2), MAXCORE_LOCAL_PORT: String(port + 3),
    BOOSTERSTATE_SIDECAR_PORT: String(port + 4), MODEL_API_PORT: String(port + 5),
    MODEL_API_HEALTH_PORT: String(port + 6), PYTHON_AI_PORT: String(port + 7),
  };
  const child = spawn(process.execPath, ["--max-old-space-size=256", "--import", loader, childScript], {
    cwd, env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let readyResolve, readyReject;
  let exited = false;
  const announced = new Promise((accept, reject) => { readyResolve = accept; readyReject = reject; });
  const ready = within(announced, 12_000, "private PDIM startup deadline exceeded");
  const closed = new Promise(accept => {
    child.once("close", (code, signal) => {
      exited = true;
      readyReject(new Error(`private PDIM exited before ready (${code ?? signal})`));
      accept({ code, signal });
    });
  });
  child.once("error", error => readyReject(error));
  child.stdout.on("data", chunk => {
    output = (output + chunk).slice(-64 * 1024);
    if (output.includes("ACK_CAPACITY_READY")) readyResolve();
  });
  child.stderr.on("data", chunk => { output = (output + chunk).slice(-64 * 1024); });
  return { child, ready, closed, exited: () => exited };
}

async function stopOwned(process, signal) {
  if (!process.exited()) process.child.kill(signal);
  return within(process.closed, 5_000, "owned private PDIM process did not close");
}

async function command(port, cmd, args) {
  const response = await fetch(`http://127.0.0.1:${port}/api/redis/instances/local/exec`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }), signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, `${cmd} must be acknowledged successfully`);
  return response.json();
}

test("local PDIM preserves every concurrent acknowledged increment after abrupt process loss", { timeout: 60_000 }, async t => {
  const scratch = await mkdtemp("/tmp/pdim-ack-capacity-");
  const children = [];
  let peakObservedRssKiB = 0;
  const sampleMemory = async child => {
    try {
      const status = await readFile(`/proc/${child.pid}/status`, "utf8");
      peakObservedRssKiB = Math.max(peakObservedRssKiB, Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0));
    } catch { /* Memory telemetry is optional; correctness assertions are not. */ }
  };
  try {
    const childScript = join(scratch, "child.mjs");
    await writeFile(childScript, `
      import {startLocalPdimServer,stopLocalPdimServer} from ${JSON.stringify(pathToFileURL(join(workspace, "server/lib/localPdimServer.ts")).href)};
      await startLocalPdimServer();
      process.once("SIGTERM", async () => {
        try { await stopLocalPdimServer(); process.exit(process.exitCode ?? 0); }
        catch { process.exit(1); }
      });
      console.log("ACK_CAPACITY_READY");
    `, { mode: 0o600 });
    const port = await freePort();
    const first = startOwned(childScript, scratch, port);
    children.push(first);
    await first.ready;
    assert.equal(await command(port, "SET", ["probe:counter", "0"]), "OK");
    const latencies = [], values = [];
    const started = performance.now();
    await Promise.all(Array.from({ length: 8 }, async () => {
      for (let index = 0; index < 32; index++) {
        const begin = performance.now();
        values.push(await command(port, "INCR", ["probe:counter"]));
        latencies.push(performance.now() - begin);
        await sampleMemory(first.child);
      }
    }));
    const wallMs = Math.round(performance.now() - started);
    assert.equal(values.length, 256);
    assert.equal(new Set(values).size, 256, "concurrent atomic increments cannot lose or duplicate results");
    assert.equal(Math.max(...values), 256);

    // No grace period or graceful save: every response already crossed the AOF
    // acknowledgement boundary. Recovery must include the last acknowledged op.
    assert.equal((await stopOwned(first, "SIGKILL")).signal, "SIGKILL");
    const second = startOwned(childScript, scratch, port);
    children.push(second);
    await second.ready;
    assert.equal(await command(port, "GET", ["probe:counter"]), "256");
    assert.equal((await stopOwned(second, "SIGTERM")).code, 0);

    latencies.sort((a, b) => a - b);
    const percentile = value => Math.round(latencies[Math.ceil(latencies.length * value) - 1] * 100) / 100;
    t.diagnostic(JSON.stringify({
      scope: "actual local PDIM HTTP/canonical RedisStore/AOF with disposable local state",
      concurrency: 8, acknowledgedMutations: 256, recoveredCounter: 256, retries: 0,
      wallMs, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), peakObservedRssKiB,
      productionDataTouched: false,
      limitations: "bounded local probe, not worldwide capacity, saturation/soak, power loss, remote bucket or application/inference load",
    }));
  } finally {
    try {
      // Every handle was spawned here; never kill an unknown listener or PID.
      for (const child of children) await stopOwned(child, "SIGKILL");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
});
