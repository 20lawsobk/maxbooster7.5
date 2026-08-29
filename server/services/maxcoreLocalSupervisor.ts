/**
 * MaxCore Local Subsystem Supervisor
 *
 * Runs the imported MaxCore API server (external/maxcore/artifacts/api-server)
 * as a supervised child process on loopback. That process in turn supervises
 * the Python AI service (ai-training-server/server.py) — we intentionally do
 * NOT bypass it: the imported Node layer owns Python lifecycle, warm-up,
 * hung-detection and the /uploads proxy, and none of its source is modified.
 *
 * Responsibilities here:
 *  - spawn the child with the correct env (loopback port, shared credentials)
 *  - restart on crash with exponential backoff
 *  - expose status for readiness probes
 *  - stop the child cleanly on shutdown
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { config } from "../config/index.js";
import { logger } from "../logger.js";
import { computeWorkerSizing, computeHyperGpuSizing } from "../computeSizing.js";

const MAXCORE_ROOT = path.resolve(process.cwd(), "external", "maxcore");
const API_SERVER_DIR = path.join(MAXCORE_ROOT, "artifacts", "api-server");
const TSX_BIN = path.join(API_SERVER_DIR, "node_modules", ".bin", "tsx");

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
// A run this long counts as healthy — resets the backoff.
const HEALTHY_RUN_MS = 60_000;

// How often to re-check for the nested workspace while a background capsule
// restore is expected to still be landing it (cheap fs.existsSync — safe to
// poll frequently so we notice completion promptly).
const WORKSPACE_RESTORE_POLL_MS = 3_000;
// Throttle for the "still waiting" log line so a multi-minute restore
// doesn't flood the log every few seconds.
const WORKSPACE_RESTORE_LOG_INTERVAL_MS = 30_000;
// After waiting this long for a background restore that never lands,
// escalate the log level so operators can find a stuck/failed extraction
// instead of only ever seeing quiet info lines.
const WORKSPACE_RESTORE_STALL_MS = 3 * 60_000;

export interface MaxcoreLocalStatus {
  enabled: boolean;
  running: boolean;
  ready: boolean;
  pid: number | null;
  restarts: number;
  lastExit: { code: number | null; signal: string | null; at: string } | null;
  error: string | null;
}

let child: ChildProcess | null = null;
let shuttingDown = false;
let restarts = 0;
let consecutiveCrashes = 0;
let lastStartAt = 0;
let restartTimer: NodeJS.Timeout | null = null;
let lastExit: MaxcoreLocalStatus["lastExit"] = null;
let startupError: string | null = null;
let lastReady = false;
let lastReadyCheck = 0;
const READY_TTL_MS = 5_000;

// Pre-spawn provisioning state — getting the nested workspace installed
// before there is even a child to crash-restart. Tracked separately from
// restarts/consecutiveCrashes above, which describe the SPAWNED child's own
// stability; conflating the two would misrepresent both in status/metrics.
let startInFlight = false;
let provisionRetryTimer: NodeJS.Timeout | null = null;
let provisionAttempts = 0;
let workspaceWaitStartedAt = 0;
let lastWorkspaceWaitLogAt = 0;

/** Append `options=-csearch_path=maxcore` to a Postgres URL so the imported
 *  Python service's DDL stays in its own schema, never colliding with Max
 *  Booster's tables in `public`. */
export function withMaxcoreSchema(dbUrl: string): string {
  if (!dbUrl) return dbUrl;
  // Neon's pooler rejects the `options` startup parameter, so use the
  // unpooled host — the Python service maintains its own connection pool.
  const direct = dbUrl.replace("-pooler.", ".");
  const sep = direct.includes("?") ? "&" : "?";
  return `${direct}${sep}options=${encodeURIComponent("-csearch_path=maxcore")}`;
}

/** Postgres only *selects* schemas via search_path — it never creates them.
 *  On a fresh database the Python child's first CREATE TABLE would fail, so
 *  bootstrap the schema explicitly before each spawn (idempotent). */
export async function ensureMaxcoreSchema(dbUrl: string): Promise<boolean> {
  if (!dbUrl) return false;
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({
      connectionString: dbUrl.replace("-pooler.", "."),
      connectionTimeoutMillis: 8_000,
    });
    await client.connect();
    try {
      await client.query("CREATE SCHEMA IF NOT EXISTS maxcore");
    } finally {
      await client.end();
    }
    return true;
  } catch (err) {
    logger.error(
      `[MaxCoreLocal] Failed to ensure maxcore schema: ${(err as Error).message}`,
    );
    return false;
  }
}

function backoffMs(): number {
  return Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, Math.max(0, consecutiveCrashes - 1)),
    MAX_BACKOFF_MS,
  );
}

function provisionBackoffMs(): number {
  return Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, Math.max(0, provisionAttempts - 1)),
    MAX_BACKOFF_MS,
  );
}

function scheduleProvisionRetry(delayMs: number): void {
  if (shuttingDown || provisionRetryTimer) return;
  provisionRetryTimer = setTimeout(() => {
    provisionRetryTimer = null;
    void startMaxcoreLocal();
  }, delayMs);
  provisionRetryTimer.unref();
}

/** True only while external/maxcore is both absent AND a packed capsule for
 *  it sits at the project root — the signature of a deploy-style checkout
 *  where start.sh's background `dist/pdim-restore.mjs` restore (kicked off
 *  before this process even starts — see start.sh's "PDIM restore" step and
 *  the capsule packing in script/build.ts) is still landing it, as opposed
 *  to a git checkout that simply never had the nested workspace installed.
 *  Distinguishing the two matters: scripts/bootstrap-maxcore.sh immediately
 *  fails ("not present — nothing to do") when the directory doesn't exist
 *  yet, which is the expected, self-resolving state while a restore is in
 *  flight — not a real bootstrap failure. */
function backgroundRestorePending(): boolean {
  if (fs.existsSync(MAXCORE_ROOT)) return false;
  const capsule = path.resolve(process.cwd(), "external_maxcore.pdim");
  return fs.existsSync(capsule);
}

async function spawnChild(): Promise<void> {
  if (shuttingDown || child) return;

  // Non-fatal on failure: the child will crash, and the backoff loop retries
  // the bootstrap on the next spawn (e.g. DB briefly unreachable at boot).
  await ensureMaxcoreSchema(config.dbUrl);
  if (shuttingDown || child) return;

  const { port, modelApiPort } = config.maxcoreLocal;
  lastStartAt = Date.now();

  logger.info(
    `[MaxCoreLocal] Starting MaxCore api-server (port ${port}, model port ${modelApiPort})…`,
  );

  // Derived from the same shared compute-sizing source as server/cluster.ts
  // (server/computeSizing.ts) so this process's own Node cluster and
  // MaxCore's Python HyperGPU engine reason about host capacity the same
  // way the main app does. The node layer is intentionally not pinned to one
  // worker: the pocket-backed fabric owns elastic logical node lifecycle, and
  // this process uses all safely available local execution capacity.
  const nodeSizing = computeWorkerSizing({
    reserveCore: false,
    envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS",
  });
  // HyperGPU's modeled lanes/tensor_cores, derived from the same host CPU
  // capacity (see computeHyperGpuSizing docstring) instead of the 6
  // previously-hardcoded `lanes=512, tensor_cores=8` call sites in
  // server.py. Forwarded to the Python child automatically: this Node
  // process's env is inherited by the api-server child, which in turn
  // spreads `...process.env` into the Python child it spawns.
  const hyperGpuSizing = computeHyperGpuSizing(nodeSizing.cpuLimit);

  child = spawn(TSX_BIN, ["src/index.ts"], {
    cwd: API_SERVER_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      // MODEL_API_PORT set ⇒ this instance is the Python owner (see the
      // imported python-server.ts PYTHON_SPAWN_DISABLED logic).
      MODEL_API_PORT: String(modelApiPort),
      NODE_CLUSTER_WORKERS: String(nodeSizing.workerCount),
      HYPER_GPU_LANES: String(hyperGpuSizing.lanes),
      HYPER_GPU_TENSOR_CORES: String(hyperGpuSizing.tensorCores),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "",
      // Credentials — the Python service env-bypasses these exact values, so
      // the same keys the connector sends are accepted upstream.
      ADMIN_KEY: config.maxcoreAdminKey,
      AI_SERVER_KEY: config.maxcoreGenerationKey,
      // The Python service persists API keys / training state in Postgres.
      // It shares the app database but is confined to its own `maxcore`
      // schema via search_path — its DDL (e.g. api_keys with varchar ids)
      // collides with Max Booster's own tables in `public` otherwise.
      DATABASE_URL: withMaxcoreSchema(config.dbUrl),
    },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group so cluster workers / the Python child can be swept
    // as a tree if the primary dies uncleanly (SIGKILL leaves orphans).
    detached: true,
  });

  const prefixPipe = (data: Buffer) => {
    const text = data.toString().trimEnd();
    if (text) logger.info(`[MaxCoreLocal] ${text.slice(0, 2_000)}`);
  };
  child.stdout?.on("data", prefixPipe);
  child.stderr?.on("data", prefixPipe);

  child.on("error", (err) => {
    startupError = err.message;
    logger.error(`[MaxCoreLocal] spawn error: ${err.message}`);
  });

  const childPid = child.pid;
  child.on("exit", (code, signal) => {
    child = null;
    // The subsystem is gone — drop the cached readiness right away rather
    // than serving a stale `ready:true` for up to READY_TTL_MS.
    lastReady = false;
    lastReadyCheck = 0;
    // Sweep the process group — a SIGKILL'd cluster primary strands its
    // worker (which still holds the port) and the Python model server.
    if (childPid) {
      try {
        process.kill(-childPid, "SIGKILL");
      } catch { /* group already gone */ }
    }
    lastExit = { code, signal, at: new Date().toISOString() };
    if (shuttingDown) {
      logger.info("[MaxCoreLocal] Child exited during shutdown (intentional).");
      return;
    }
    const uptime = Date.now() - lastStartAt;
    if (uptime >= HEALTHY_RUN_MS) consecutiveCrashes = 0;
    consecutiveCrashes++;
    restarts++;
    const delay = backoffMs();
    logger.warn(
      `[MaxCoreLocal] Child exited (code=${code ?? "?"}, signal=${signal ?? "none"}) after ${Math.round(uptime / 1000)}s — restart #${restarts} in ${delay}ms`,
    );
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void spawnChild();
    }, delay);
    restartTimer.unref();
  });
}

/** Install the nested MaxCore workspace on a clean checkout so the normal
 *  application workflow is self-contained (no manual nested setup). */
async function bootstrapMaxcoreWorkspace(): Promise<boolean> {
  const script = path.resolve(process.cwd(), "scripts", "bootstrap-maxcore.sh");
  if (!fs.existsSync(script)) return false;
  logger.info("[MaxCoreLocal] Nested workspace not installed — bootstrapping…");
  return await new Promise<boolean>((resolve) => {
    const proc = spawn("bash", [script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const pipe = (d: Buffer) => {
      const t = d.toString().trimEnd();
      if (t) logger.info(`[MaxCoreLocal] [bootstrap] ${t.slice(0, 1_000)}`);
    };
    proc.stdout?.on("data", pipe);
    proc.stderr?.on("data", pipe);
    const timer = setTimeout(() => proc.kill("SIGKILL"), 10 * 60_000);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Start the local MaxCore subsystem. No-op when local mode is disabled.
 *
 *  Retryable and re-entrancy-safe. On a deploy-style boot, external/maxcore
 *  is deliberately stripped from the image (see script/build.ts) and lands
 *  moments later via a detached background capsule restore kicked off by
 *  start.sh — racing this call, which fires at module load. Previously,
 *  finding the workspace missing at that instant was treated as a permanent
 *  "clean checkout" bootstrap failure: bootstrapMaxcoreWorkspace() would run
 *  scripts/bootstrap-maxcore.sh, which fails immediately when the directory
 *  doesn't exist yet, latch a fatal startupError, and — because nothing ever
 *  called this function again — leave the app reporting the MaxCore probe
 *  degraded forever, even after the background restore finished seconds
 *  later. This function now distinguishes that transient case (wait, don't
 *  bootstrap) from a genuine bootstrap failure (retry with backoff), and
 *  never gives up permanently in either case. */
export async function startMaxcoreLocal(): Promise<void> {
  if (!config.maxcoreLocal.enabled) {
    logger.info("[MaxCoreLocal] Local mode disabled (MAXCORE_LOCAL=0) — using remote MaxCore URL.");
    return;
  }
  // Re-entrancy guard: a scheduled retry can fire while an earlier call is
  // still mid-bootstrap (that subprocess alone can take up to 10 minutes).
  // Without this, two overlapping calls could both pass the TSX_BIN check
  // and both invoke spawnChild(), racing two children for the same port.
  if (shuttingDown || child || startInFlight) return;
  startInFlight = true;
  try {
    if (fs.existsSync(TSX_BIN)) {
      workspaceWaitStartedAt = 0;
      provisionAttempts = 0;
      startupError = null;
      await spawnChild();
      return;
    }

    if (backgroundRestorePending()) {
      // Expected, self-resolving startup condition — not a failure. Report
      // it as such and keep polling instead of attempting (and failing) the
      // one-shot bootstrap script.
      if (!workspaceWaitStartedAt) workspaceWaitStartedAt = Date.now();
      const waitedMs = Date.now() - workspaceWaitStartedAt;
      startupError = `external/maxcore background capsule restore still in progress (waited ${Math.round(waitedMs / 1000)}s)`;
      const now = Date.now();
      if (now - lastWorkspaceWaitLogAt >= WORKSPACE_RESTORE_LOG_INTERVAL_MS) {
        lastWorkspaceWaitLogAt = now;
        if (waitedMs >= WORKSPACE_RESTORE_STALL_MS) {
          logger.warn(
            `[MaxCoreLocal] Still waiting for external/maxcore background capsule restore after ${Math.round(waitedMs / 1000)}s — check /tmp/pdim-background-restore.log for a stuck or failed extraction.`,
          );
        } else {
          logger.info(
            `[MaxCoreLocal] Waiting for external/maxcore background capsule restore to land (${Math.round(waitedMs / 1000)}s)…`,
          );
        }
      }
      scheduleProvisionRetry(WORKSPACE_RESTORE_POLL_MS);
      return;
    }

    // Not a pending background restore: either a genuine clean checkout
    // (source present via git, nested deps never installed) or nothing will
    // ever populate the directory. Either way the one-shot bootstrap script
    // is idempotent and safe to retry with backoff — never latch a
    // permanent failure with no path back to a spawn attempt.
    workspaceWaitStartedAt = 0;
    const ok = await bootstrapMaxcoreWorkspace();
    if (shuttingDown) return;
    if (!ok || !fs.existsSync(TSX_BIN)) {
      provisionAttempts++;
      const delay = provisionBackoffMs();
      startupError =
        "external/maxcore workspace bootstrap failed (see logs; manual fallback: bash scripts/bootstrap-maxcore.sh)";
      logger.error(`[MaxCoreLocal] ${startupError} — retrying in ${delay}ms`);
      scheduleProvisionRetry(delay);
      return;
    }

    provisionAttempts = 0;
    startupError = null;
    await spawnChild();
  } finally {
    startInFlight = false;
  }
}

/** Ready = the Python-backed model service is actually healthy. The Node
 *  layer's /healthz answers even while Python is crash-looping, so probe
 *  /api/health (proxied to Python) and require status "healthy". */
export async function checkMaxcoreLocalReady(): Promise<boolean> {
  if (!config.maxcoreLocal.enabled) return false;
  const now = Date.now();
  if (now - lastReadyCheck < READY_TTL_MS) return lastReady;
  lastReadyCheck = now;
  try {
    const r = await fetch(`http://127.0.0.1:${config.maxcoreLocal.port}/api/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!r.ok) {
      lastReady = false;
    } else {
      const body = (await r.json()) as { status?: string };
      lastReady = body?.status === "healthy";
    }
  } catch {
    lastReady = false;
  }
  return lastReady;
}

export function getMaxcoreLocalStatus(): MaxcoreLocalStatus {
  return {
    enabled: config.maxcoreLocal.enabled,
    running: child !== null,
    ready: lastReady,
    pid: child?.pid ?? null,
    restarts,
    lastExit,
    error: startupError,
  };
}

/** Stop the child cleanly. The imported api-server's own SIGTERM handler
 *  stops its Python child and cluster workers. */
export function stopMaxcoreLocal(): void {
  shuttingDown = true;
  // Invalidate the readiness cache immediately — nothing is ready once we
  // begin stopping, and a later re-start must not inherit a stale `true`.
  lastReady = false;
  lastReadyCheck = 0;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (provisionRetryTimer) {
    clearTimeout(provisionRetryTimer);
    provisionRetryTimer = null;
  }
  if (child) {
    logger.info("[MaxCoreLocal] Stopping MaxCore api-server…");
    child.kill("SIGTERM");
    // Escalate if it ignores SIGTERM (the imported primary self-exits in 3s).
    const pid = child.pid;
    const killTimer = setTimeout(() => {
      try {
        if (pid) process.kill(-pid, "SIGKILL");
      } catch { /* already gone */ }
    }, 8_000);
    killTimer.unref();
    child = null;
  }
}
