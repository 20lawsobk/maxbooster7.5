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

const MAXCORE_ROOT = path.resolve(process.cwd(), "external", "maxcore");
const API_SERVER_DIR = path.join(MAXCORE_ROOT, "artifacts", "api-server");
const TSX_BIN = path.join(API_SERVER_DIR, "node_modules", ".bin", "tsx");

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
// A run this long counts as healthy — resets the backoff.
const HEALTHY_RUN_MS = 60_000;

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

  child = spawn(TSX_BIN, ["src/index.ts"], {
    cwd: API_SERVER_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      // MODEL_API_PORT set ⇒ this instance is the Python owner (see the
      // imported python-server.ts PYTHON_SPAWN_DISABLED logic).
      MODEL_API_PORT: String(modelApiPort),
      // Single Node worker: Max Booster is the only caller on loopback; the
      // imported default of 4 workers wastes ~600 MB here.
      NODE_CLUSTER_WORKERS: "1",
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

/** Start the local MaxCore subsystem. No-op when local mode is disabled. */
export async function startMaxcoreLocal(): Promise<void> {
  if (!config.maxcoreLocal.enabled) {
    logger.info("[MaxCoreLocal] Local mode disabled (MAXCORE_LOCAL=0) — using remote MaxCore URL.");
    return;
  }
  if (!fs.existsSync(TSX_BIN)) {
    // Clean checkout: provision the nested workspace automatically.
    const ok = await bootstrapMaxcoreWorkspace();
    if (!ok || !fs.existsSync(TSX_BIN)) {
      startupError =
        "external/maxcore workspace bootstrap failed (see logs; manual fallback: bash scripts/bootstrap-maxcore.sh)";
      logger.error(`[MaxCoreLocal] ${startupError}`);
      return;
    }
  }
  await spawnChild();
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
