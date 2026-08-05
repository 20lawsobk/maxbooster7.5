/**
 * autoResolver.ts
 *
 * Monitors the live production deployment and automatically triggers a
 * Replit redeploy when the URL stays dark for more than FAILURE_THRESHOLD
 * consecutive polls.
 *
 * Design invariants
 * ─────────────────
 * • Runs ONLY in the dev workspace (primary cluster process, NODE_ENV ≠
 *   "production").  Production must never try to redeploy itself.
 * • Uses its own undici Agent so probe traffic never starves real requests.
 * • Never throws — all errors are caught, logged, and counted.
 * • Min redeploy interval prevents a death-loop if the build keeps failing.
 *
 * Required secret
 * ───────────────
 * REPLIT_API_TOKEN — a Replit personal access token with "deployments:write"
 *   scope.  Create one at https://replit.com/account/tokens and add it as a
 *   Replit Secret.  Without it the probe loop still runs but redeploys are
 *   skipped (logged as warnings).
 *
 * Env vars (all optional, defaults shown)
 * ────────────────────────────────────────
 * PROD_HEALTH_URL       — full URL to poll  (default: https://secure-ai-forge.replit.app/api/healthz)
 * PROD_POLL_INTERVAL_MS — ms between polls  (default: 60 000)
 * PROD_FAILURE_THRESHOLD— consecutive fails  (default: 5)
 * REPL_ID               — automatically set by Replit runtime
 */

import { Agent, request as undiciRequest } from "undici";

// ─── Configuration ────────────────────────────────────────────────────────────

const PROD_HEALTH_URL =
  process.env.PROD_HEALTH_URL ??
  "https://secure-ai-forge.replit.app/api/healthz";

const POLL_INTERVAL_MS = parseInt(
  process.env.PROD_POLL_INTERVAL_MS ?? "60000",
  10,
);

// Consecutive probe failures before triggering a redeploy.
// Default 5 × 60 s = 5 minutes of confirmed downtime.
const FAILURE_THRESHOLD = parseInt(
  process.env.PROD_FAILURE_THRESHOLD ?? "5",
  10,
);

// Minimum gap between successive redeploy triggers.
// Guards against redeploy loops if the build keeps failing.
const MIN_REDEPLOY_INTERVAL_MS = 15 * 60_000; // 15 min

// Replit Deployments REST API
const REPLIT_API_BASE = "https://replit.com/api/v1";
const REPL_ID = process.env.REPL_ID ?? "";

// ─── State ───────────────────────────────────────────────────────────────────

export interface AutoResolverStatus {
  running: boolean;
  prodUrl: string;
  consecutiveFailures: number;
  failureThreshold: number;
  lastProbeAt: string | null;      // ISO-8601
  lastProbeOk: boolean | null;
  lastRedeployAt: string | null;   // ISO-8601
  lastRedeployResult: string | null;
  totalRedeploys: number;
  totalProbes: number;
  totalFailures: number;
}

let _running = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

let _consecutiveFailures = 0;
let _lastProbeAt: Date | null = null;
let _lastProbeOk: boolean | null = null;
let _lastRedeployAt: Date | null = null;
let _lastRedeployResult: string | null = null;
let _totalRedeploys = 0;
let _totalProbes = 0;
let _totalFailures = 0;

// ─── Undici pool ─────────────────────────────────────────────────────────────

const _probeAgent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connections: 1,
  headersTimeout: 20_000,
  bodyTimeout: 20_000,
  connectTimeout: 10_000,
});

// ─── Probe ───────────────────────────────────────────────────────────────────

async function probe(): Promise<boolean> {
  try {
    const { statusCode } = await undiciRequest(PROD_HEALTH_URL, {
      method: "GET",
      dispatcher: _probeAgent,
    });
    return statusCode >= 200 && statusCode < 300;
  } catch {
    return false;
  }
}

// ─── Layer 1: Force-restart (no token needed) ────────────────────────────────
//
// POSTs to /api/admin/force-restart on the production server, authenticated
// with SESSION_SECRET.  Works when prod is alive at the OS level but stuck in
// a deadlock or hung GC — the endpoint exits the worker so the cluster primary
// (or the watchdog shell script) respawns it.
//
// This is NOT a substitute for the watchdog when prod is fully OOM-killed
// (nothing is listening), but it covers the partial-hang case cheaply.

async function tryForceRestart(): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return "SKIPPED — SESSION_SECRET not set";

  const baseUrl = PROD_HEALTH_URL.replace(/\/api\/healthz.*$/, "");
  const url = `${baseUrl}/api/admin/force-restart`;
  try {
    const { statusCode } = await undiciRequest(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      dispatcher: _probeAgent,
    });
    if (statusCode === 200 || statusCode === 201) {
      return `OK — worker restart triggered (HTTP ${statusCode})`;
    }
    return `no-op (HTTP ${statusCode}) — server may be fully dark; watchdog will recover`;
  } catch {
    // Connection refused → server is completely dark.  Watchdog handles this.
    return "unreachable — server fully dark; watchdog shell will restart it";
  }
}

// ─── Layer 2: Full Replit redeploy (needs REPLIT_API_TOKEN) ──────────────────
//
// Creates a fresh deployment build via the Replit REST API.  Only runs when
// REPLIT_API_TOKEN is set as a Replit Secret.  This is the nuclear option for
// when the production VM is unresponsive even after the watchdog restarts it
// (e.g. the watchdog script itself got killed, or an infra issue needs a
// clean deploy).

async function triggerRedeploy(): Promise<string> {
  const token = process.env.REPLIT_API_TOKEN;
  if (!token) {
    return "SKIPPED — add REPLIT_API_TOKEN secret to enable full redeployment";
  }
  if (!REPL_ID) {
    return "SKIPPED — REPL_ID env var not available";
  }

  // Replit Deployments API: create a new deployment build from the current
  // state of the repl.
  // POST /api/v1/repls/{replId}/deployments/builds
  const url = `${REPLIT_API_BASE}/repls/${REPL_ID}/deployments/builds`;
  try {
    const { statusCode, body } = await undiciRequest(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const text = await body.text();

    if (statusCode === 200 || statusCode === 201 || statusCode === 202) {
      return `OK (HTTP ${statusCode})`;
    }
    return `FAILED (HTTP ${statusCode}): ${text.slice(0, 200)}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `ERROR: ${msg}`;
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  _totalProbes++;
  const ok = await probe();
  _lastProbeAt = new Date();
  _lastProbeOk = ok;

  if (ok) {
    if (_consecutiveFailures > 0) {
      console.log(
        `[AutoResolver] Production recovered after ${_consecutiveFailures} failure(s)`,
      );
    }
    _consecutiveFailures = 0;
    return;
  }

  _consecutiveFailures++;
  _totalFailures++;
  console.warn(
    `[AutoResolver] Production probe FAILED (${_consecutiveFailures}/${FAILURE_THRESHOLD}): ${PROD_HEALTH_URL}`,
  );

  if (_consecutiveFailures < FAILURE_THRESHOLD) return;

  // Threshold reached — check cooldown before triggering
  const now = Date.now();
  if (
    _lastRedeployAt !== null &&
    now - _lastRedeployAt.getTime() < MIN_REDEPLOY_INTERVAL_MS
  ) {
    const remainMs = MIN_REDEPLOY_INTERVAL_MS - (now - _lastRedeployAt.getTime());
    console.warn(
      `[AutoResolver] Threshold reached but cooldown active — ${Math.ceil(remainMs / 1000)}s remaining before next attempt`,
    );
    return;
  }

  console.warn(
    `[AutoResolver] ⚠ Production dark for ${_consecutiveFailures} consecutive polls — attempting recovery…`,
  );

  // ── Layer 1: force-restart (no token needed) ─────────────────────────────
  // Works when prod is alive at OS level but deadlocked / health-failing.
  // When prod is fully OOM-killed, this call will be refused; the watchdog
  // shell script on the production VM handles that case automatically.
  const restartResult = await tryForceRestart();
  console.log(`[AutoResolver] Force-restart result: ${restartResult}`);

  // ── Layer 2: full Replit redeploy (requires REPLIT_API_TOKEN secret) ─────
  // Fires a fresh deployment build — nuclear option for when even the
  // watchdog fails to bring the VM back.
  const redeployResult = await triggerRedeploy();
  console.log(`[AutoResolver] Redeploy result: ${redeployResult}`);

  _lastRedeployAt = new Date();
  _lastRedeployResult = `restart=${restartResult} | redeploy=${redeployResult}`;
  _totalRedeploys++;
  _consecutiveFailures = 0; // reset — don't spam; wait for next failure window
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startAutoResolver(): void {
  if (_running) return;

  // Safety: never run inside the production VM
  if (process.env.NODE_ENV === "production") {
    console.log(
      "[AutoResolver] Skipped — running in production environment",
    );
    return;
  }

  _running = true;
  console.log(
    `[AutoResolver] Started — polling ${PROD_HEALTH_URL} every ${POLL_INTERVAL_MS / 1000}s, ` +
    `threshold=${FAILURE_THRESHOLD}, cooldown=${MIN_REDEPLOY_INTERVAL_MS / 60000}min`,
  );

  const schedule = () => {
    _timer = setTimeout(async () => {
      await runOnce();
      if (_running) schedule();
    }, POLL_INTERVAL_MS);
  };

  // First probe 10 s after boot so the server is fully up before we check prod
  setTimeout(async () => {
    await runOnce();
    if (_running) schedule();
  }, 10_000);
}

export function stopAutoResolver(): void {
  _running = false;
  if (_timer !== null) {
    clearTimeout(_timer);
    _timer = null;
  }
  console.log("[AutoResolver] Stopped");
}

export function getAutoResolverStatus(): AutoResolverStatus {
  return {
    running: _running,
    prodUrl: PROD_HEALTH_URL,
    consecutiveFailures: _consecutiveFailures,
    failureThreshold: FAILURE_THRESHOLD,
    lastProbeAt: _lastProbeAt?.toISOString() ?? null,
    lastProbeOk: _lastProbeOk,
    lastRedeployAt: _lastRedeployAt?.toISOString() ?? null,
    lastRedeployResult: _lastRedeployResult,
    totalRedeploys: _totalRedeploys,
    totalProbes: _totalProbes,
    totalFailures: _totalFailures,
  };
}
