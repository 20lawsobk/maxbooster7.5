/**
 * Vitest global setup — waits for the Express server to be fully ready before
 * any integration test suite starts. The server listens immediately but loads
 * routes lazily via registerRoutes(). During the boot window the early-boot
 * stub at /api/auth/me returns { authenticated: false, bootPhase: true }. Once
 * registerRoutes() finishes, the stub calls next() and the real handler runs,
 * which returns JSON null for unauthenticated callers.
 *
 * Strategy: poll /api/auth/me until the response is no longer { bootPhase: true }
 * (i.e., it is null or an object without bootPhase) — that signals routes are live.
 */
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:5000';
const MAX_WAIT_MS = 480_000;  // 8 minutes — route registration can take ~5 min
const POLL_MS = 3_000;
const FETCH_TIMEOUT_MS = 10_000;

export async function setup() {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastError = '';
  let bootPhaseCount = 0;

  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${BASE}/api/auth/me`, { signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 200) {
        let body: unknown = undefined;
        try { body = await res.json(); } catch { /* ignore parse error */ }

        // Boot stub response: { authenticated: false, bootPhase: true }
        // Real handler response (unauthenticated): null
        const isBootPhase =
          body !== null &&
          typeof body === 'object' &&
          (body as Record<string, unknown>).bootPhase === true;

        if (isBootPhase) {
          bootPhaseCount++;
          if (bootPhaseCount % 10 === 1) {
            const elapsed = Math.round((Date.now() - (deadline - MAX_WAIT_MS)) / 1000);
            console.log(`[globalSetup] Boot phase still active (${elapsed}s elapsed) — routes loading...`);
          }
          lastError = `bootPhase:true (poll #${bootPhaseCount})`;
          await new Promise((r) => setTimeout(r, POLL_MS));
          continue;
        }

        // Real handler is active (null for unauth, or user object for authed)
        const elapsed = Math.round((Date.now() - (deadline - MAX_WAIT_MS)) / 1000);
        console.log(`\n[globalSetup] Server ready at ${BASE} ✅  (${elapsed}s elapsed)`);
        return;
      }

      lastError = `HTTP ${res.status}`;
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  throw new Error(
    `[globalSetup] Server at ${BASE} did not finish route registration within ` +
    `${MAX_WAIT_MS / 1000}s — last status: ${lastError}`,
  );
}
