/**
 * Integration test: starts the REAL local MaxCore subsystem (imported Node
 * api-server supervising the Python model server) on alternate ports and
 * asserts the Python-backed health endpoint becomes healthy, then verifies
 * clean shutdown. Requires the nested workspace to be installed (the
 * supervisor bootstraps it automatically on a clean checkout).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
const PORT = await unusedPort();
const MODEL_PORT = await unusedPort();
const privateState = mkdtempSync(join(tmpdir(), "maxcore-supervisor-fixture-"));

process.env.MAXCORE_LOCAL = "1";
process.env.MAXCORE_LOCAL_PORT = String(PORT);
process.env.MODEL_API_PORT = String(MODEL_PORT);
process.env.MODEL_API_HEALTH_PORT = String(await unusedPort());
process.env.LOCAL_PDIM_PORT = String(await unusedPort());
process.env.LOCAL_PDIM_STORE_FILE = join(privateState, "pdim.json");
process.env.MAXCORE_PRIVATE_STATE_DIR = privateState;
process.env.MAXCORE_MODEL_STATE_DIR = join(privateState, "models");
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "integration-test-secret-0123456789abcdef";

// Use the same configuration reconciliation as production before importing
// clients. This process owns its PDIM instance and token; it never borrows the
// separately running application's storage credentials or files.
await import("../../server/lib/pdimEnvFix.js");
const pdim = await import("../../server/lib/localPdimServer.js");
const supervisor = await import(
  "../../server/services/maxcoreLocalSupervisor.js"
);
const { getMaxcoreGenerationHeaders } = await import(
  "../../server/services/maxcoreConnector.js"
);

async function waitForHealthy(deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
        headers: getMaxcoreGenerationHeaders(),
        signal: AbortSignal.timeout(3_000),
      });
      if (r.ok) {
        const body = (await r.json()) as { status?: string };
        if (body?.status === "healthy") return true;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 2_000));
  }
  return false;
}

describe("MaxCore local subsystem (real spawn)", () => {
  beforeAll(async () => {
    await pdim.startLocalPdimServer();
  });
  afterAll(async () => {
    supervisor.stopMaxcoreLocal();
    await pdim.stopLocalPdimServer();
    rmSync(privateState, { recursive: true, force: true });
  });

  it(
    "launches real Python and storage while keeping an absent inference candidate unready",
    { timeout: 240_000 },
    async () => {
      await supervisor.startMaxcoreLocal();

      const status = supervisor.getMaxcoreLocalStatus();
      expect(status.enabled).toBe(true);
      expect(status.error).toBeNull();
      expect(status.running).toBe(true);
      expect(status.pid).toBeGreaterThan(0);

      // An empty private model directory is deliberate. Process health is
      // executable evidence; generation admission remains false without a
      // candidate. This is not a production-generation acceptance test.
      expect(await waitForHealthy(210_000)).toBe(true);
      const health = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
        headers: getMaxcoreGenerationHeaders(), signal: AbortSignal.timeout(5_000),
      });
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "healthy", model_loaded: false });
      expect(await supervisor.checkMaxcoreLocalReady()).toBe(false);
      const storage = await fetch(process.env.STORAGE_HTTP_URL!, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PDIM_LOCAL_CHANNEL_TOKEN}` },
        body: JSON.stringify({ cmd: "PING", args: [] }), signal: AbortSignal.timeout(5_000),
      });
      expect(storage.status).toBe(200);
      expect(await storage.json()).toBe("PONG");
    },
  );

  it("stops cleanly and the port is released", { timeout: 30_000 }, async () => {
    supervisor.stopMaxcoreLocal();
    // The imported api-server SIGTERM handler stops Python + workers; the
    // supervisor escalates to a process-group SIGKILL after 8s.
    const deadline = Date.now() + 20_000;
    let closed = false;
    while (Date.now() < deadline && !closed) {
      try {
        await fetch(`http://127.0.0.1:${PORT}/healthz`, {
          signal: AbortSignal.timeout(1_000),
        });
      } catch {
        closed = true;
      }
      if (!closed) await new Promise((res) => setTimeout(res, 1_000));
    }
    expect(closed).toBe(true);
    expect(supervisor.getMaxcoreLocalStatus().running).toBe(false);
  });
});
