/**
 * Vitest global setup — waits for the Express server to be ready before
 * any integration test suite starts. Prevents ECONNREFUSED failures when
 * the integration workflow starts before the app server is fully up.
 */
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:5000';
const MAX_WAIT_MS = 120_000;
const POLL_MS = 1_500;

export async function setup() {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 200) {
        console.log(`\n[globalSetup] Server ready at ${BASE} ✅`);
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`[globalSetup] Server at ${BASE} did not become ready within ${MAX_WAIT_MS / 1000}s — last error: ${lastError}`);
}
