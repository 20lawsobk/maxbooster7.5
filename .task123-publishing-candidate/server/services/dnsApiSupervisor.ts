import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

const ROOT = process.cwd();
const SOURCE_ENTRY = path.join(ROOT, "dns-os/services/dns-api/src/index.ts");
const PRODUCTION_ENTRY = path.join(ROOT, "dist/dns-api.mjs");
const TSX_BIN = path.join(ROOT, "node_modules/.bin/tsx");
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const HEALTHY_RUN_MS = 60_000;
const READY_TTL_MS = 3_000;

export interface DnsApiStatus {
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
let lastExit: DnsApiStatus["lastExit"] = null;
let startupError: string | null = null;
let lastReady = false;
let lastReadyCheck = 0;

function internalToken(): string {
  if (!config.jwtSecret) return "";
  return createHmac("sha256", config.jwtSecret)
    .update("maxbooster-dns-api-internal-v1")
    .digest("hex");
}

function backoffMs(): number {
  return Math.min(
    INITIAL_BACKOFF_MS * 2 ** Math.max(0, consecutiveCrashes - 1),
    MAX_BACKOFF_MS,
  );
}

function childEnvironment(token: string): NodeJS.ProcessEnv {
  const inherited = process.env;
  const env: NodeJS.ProcessEnv = {
    PATH: inherited.PATH || "",
    HOME: inherited.HOME || "",
    NODE_ENV: config.nodeEnv,
    DATABASE_URL: config.dbUrl,
    DNS_API_DB_SCHEMA: config.dnsApi.schema,
    DNS_API_HOST: config.dnsApi.host,
    DNS_API_PORT: String(config.dnsApi.port),
    DNS_API_TOKEN: token,
  };
  for (const name of ["NODE_OPTIONS", "TMPDIR", "TMP", "TEMP", "LANG", "TZ"] as const) {
    if (inherited[name]) env[name] = inherited[name];
  }
  return env;
}

function scheduleRestart(): void {
  if (shuttingDown || restartTimer) return;
  const delay = backoffMs();
  logger.warn(
    `[DnsApi] Restarting after ${delay}ms (attempt ${restarts + 1}); last error=${startupError || "child_exit"}`,
  );
  restartTimer = setTimeout(() => {
    restartTimer = null;
    spawnChild();
  }, delay);
  restartTimer.unref();
}

function spawnChild(): void {
  if (shuttingDown || child) return;
  if (!config.dbUrl || !config.jwtSecret) {
    startupError = !config.dbUrl ? "database_not_configured" : "session_secret_not_configured";
    logger.error(`[DnsApi] Refusing to start: ${startupError}`);
    return;
  }

  const production = config.nodeEnv === "production";
  const entry = production ? PRODUCTION_ENTRY : SOURCE_ENTRY;
  const executable = production ? process.execPath : TSX_BIN;
  if (!fs.existsSync(entry) || (!production && !fs.existsSync(TSX_BIN))) {
    startupError = production ? "production_bundle_missing" : "development_runner_missing";
    logger.error(`[DnsApi] Refusing to start: ${startupError}`);
    scheduleRestart();
    return;
  }

  startupError = null;
  lastStartAt = Date.now();
  logger.info(`[DnsApi] Starting authenticated loopback API on ${config.dnsApi.host}:${config.dnsApi.port}`);
  try {
    child = spawn(
      executable,
      [production ? entry : "services/dns-api/src/index.ts"],
      {
        cwd: production ? ROOT : path.join(ROOT, "dns-os"),
        env: childEnvironment(internalToken()),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      },
    );
  } catch {
    startupError = "spawn_failed";
    scheduleRestart();
    return;
  }

  const childPid = child.pid;
  const forwardOutput = (data: Buffer) => {
    const text = data.toString().trimEnd();
    if (text) logger.info(`[DnsApi] ${text.slice(0, 2_000)}`);
  };
  child.stdout?.on("data", forwardOutput);
  child.stderr?.on("data", forwardOutput);
  child.on("error", (error) => {
    startupError = (error as NodeJS.ErrnoException).code || "spawn_failed";
    logger.error(`[DnsApi] Child process error (${startupError})`);
  });
  child.on("exit", (code, signal) => {
    child = null;
    lastReady = false;
    lastReadyCheck = 0;
    if (childPid) {
      try {
        process.kill(-childPid, "SIGKILL");
      } catch {
        /* group already exited */
      }
    }
    lastExit = { code, signal, at: new Date().toISOString() };
    if (shuttingDown) {
      logger.info("[DnsApi] Child exited during shutdown");
      return;
    }
    if (Date.now() - lastStartAt >= HEALTHY_RUN_MS) consecutiveCrashes = 0;
    consecutiveCrashes++;
    restarts++;
    startupError ||= `child_exit_${code ?? signal ?? "unknown"}`;
    scheduleRestart();
  });
}

export function startDnsApi(): void {
  if (child || shuttingDown) return;
  spawnChild();
}

export async function checkDnsApiReady(): Promise<boolean> {
  if (!child) return false;
  const now = Date.now();
  if (now - lastReadyCheck < READY_TTL_MS) return lastReady;
  lastReadyCheck = now;
  try {
    const response = await fetch(`http://${config.dnsApi.host}:${config.dnsApi.port}/ready`, {
      signal: AbortSignal.timeout(1_500),
      redirect: "manual",
    });
    lastReady = response.status === 200;
  } catch {
    lastReady = false;
  }
  return lastReady;
}

export function getDnsApiStatus(): DnsApiStatus {
  return {
    running: child !== null,
    ready: lastReady,
    pid: child?.pid ?? null,
    restarts,
    lastExit,
    error: startupError,
  };
}

export function stopDnsApi(): void {
  shuttingDown = true;
  lastReady = false;
  lastReadyCheck = 0;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  const pid = child?.pid;
  if (!child) return;
  logger.info("[DnsApi] Stopping supervised DNS API");
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        logger.warn({ err: error }, "[DnsApi] Could not signal child process group");
      }
    }
  }
  const killTimer = setTimeout(() => {
    try {
      if (pid) process.kill(-pid, "SIGKILL");
    } catch {
      /* child already exited */
    }
  }, 8_000);
  killTimer.unref();
  child = null;
}
