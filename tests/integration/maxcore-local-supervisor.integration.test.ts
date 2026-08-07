/**
 * Integration test: starts the REAL local MaxCore subsystem (imported Node
 * api-server supervising the Python model server) on alternate ports and
 * asserts the Python-backed health endpoint becomes healthy, then verifies
 * clean shutdown. Requires the nested workspace to be installed (the
 * supervisor bootstraps it automatically on a clean checkout).
 */
import { afterAll, describe, expect, it } from "vitest";

const PORT = 8091;
const MODEL_PORT = 9891;

process.env.MAXCORE_LOCAL = "1";
process.env.MAXCORE_LOCAL_PORT = String(PORT);
process.env.MODEL_API_PORT = String(MODEL_PORT);
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "integration-test-secret-0123456789abcdef";

const supervisor = await import(
  "../../server/services/maxcoreLocalSupervisor.js"
);

async function waitForHealthy(deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
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
  afterAll(() => {
    supervisor.stopMaxcoreLocal();
  });

  it(
    "launches, becomes healthy (Python-backed), and reports ready",
    { timeout: 240_000 },
    async () => {
      await supervisor.startMaxcoreLocal();

      const status = supervisor.getMaxcoreLocalStatus();
      expect(status.enabled).toBe(true);
      expect(status.error).toBeNull();
      expect(status.running).toBe(true);
      expect(status.pid).toBeGreaterThan(0);

      // Cold start includes Python model warm-up.
      expect(await waitForHealthy(210_000)).toBe(true);
      expect(await supervisor.checkMaxcoreLocalReady()).toBe(true);
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
