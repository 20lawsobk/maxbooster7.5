/**
 * DNS Node — Local Subsystem Supervisor (backend-only, internal testing).
 *
 * Runs the imported dns-node authoritative nameserver (dns-node/src) as a
 * supervised child process on loopback, for internal verification that the
 * app's DNS wiring (zone data → authoritative answers) works end-to-end.
 *
 * IMPORTANT — this is NOT a path to a publicly reachable nameserver:
 * Replit's deployment proxy is HTTP(S)-only and does not forward raw
 * UDP/TCP:53 traffic from the internet. No registrar could ever delegate to
 * this instance. Real production authoritative DNS runs on the separate GCP
 * VMs provisioned by scripts/deploy-gcp.sh, which pull zone data from this
 * same app via the existing /api/dns/zone/:domain sync endpoint. This local
 * subsystem exists purely so backend/CI checks can `dig @127.0.0.1 -p 5353`
 * and confirm the zone pipeline is wired correctly before it ever reaches
 * those VMs.
 *
 * Disabled by default. Enable with DNS_NODE_LOCAL=1.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

const DNS_NODE_DIR = path.resolve(process.cwd(), "dns-node");
const TSX_BIN = path.join(process.cwd(), "node_modules", ".bin", "tsx");

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const HEALTHY_RUN_MS = 60_000;

export interface DnsNodeLocalStatus {
  enabled: boolean;
  running: boolean;
  ready: boolean;
  pid: number | null;
  restarts: number;
  lastExit: { code: number | null; signal: string | null; at: string } | null;
  error: string | null;
  note: string;
}

let child: ChildProcess | null = null;
let shuttingDown = false;
let restarts = 0;
let consecutiveCrashes = 0;
let lastStartAt = 0;
let restartTimer: NodeJS.Timeout | null = null;
let lastExit: DnsNodeLocalStatus["lastExit"] = null;
let startupError: string | null = null;
let lastReady = false;
let lastReadyCheck = 0;
const READY_TTL_MS = 5_000;

const NOTE =
  "internal-only: not publicly reachable (Replit proxy is HTTP(S)-only, no UDP/TCP:53 passthrough)";

function backoffMs(): number {
  return Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, Math.max(0, consecutiveCrashes - 1)),
    MAX_BACKOFF_MS,
  );
}

function spawnChild(): void {
  if (shuttingDown || child) return;

  const { port, healthPort, domain } = config.dnsNodeLocal;
  lastStartAt = Date.now();

  logger.info(
    `[DnsNodeLocal] Starting dns-node authoritative server (udp/tcp :${port}, health :${healthPort}, domain ${domain}) [${NOTE}]`,
  );

  // The app already exposes zone data in exactly the shape dns-node expects
  // at GET /api/dns/zone/:domain (server/routes/dns.ts) — point the child's
  // sync loop at our own loopback port so it hot-loads real zone records.
  child = spawn(TSX_BIN, ["src/index.ts"], {
    cwd: DNS_NODE_DIR,
    env: {
      ...process.env,
      DNS_PORT: String(port),
      HEALTH_PORT: String(healthPort),
      DNS_SERVER_ROLE: "local-test",
      ZONE_SYNC_URL: `http://127.0.0.1:${config.port}/api/dns/zone/${domain}`,
      ZONE_SYNC_INTERVAL_S: "60",
      DNSSEC_ENABLED: process.env.DNS_NODE_LOCAL_DNSSEC === "true" ? "true" : "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const prefixPipe = (data: Buffer) => {
    const text = data.toString().trimEnd();
    if (text) logger.info(`[DnsNodeLocal] ${text.slice(0, 2_000)}`);
  };
  child.stdout?.on("data", prefixPipe);
  child.stderr?.on("data", prefixPipe);

  child.on("error", (err) => {
    startupError = err.message;
    logger.error(`[DnsNodeLocal] spawn error: ${err.message}`);
  });

  const childPid = child.pid;
  child.on("exit", (code, signal) => {
    child = null;
    lastReady = false;
    lastReadyCheck = 0;
    if (childPid) {
      try {
        process.kill(-childPid, "SIGKILL");
      } catch {
        /* group already gone */
      }
    }
    lastExit = { code, signal, at: new Date().toISOString() };
    if (shuttingDown) {
      logger.info("[DnsNodeLocal] Child exited during shutdown (intentional).");
      return;
    }
    const uptime = Date.now() - lastStartAt;
    if (uptime >= HEALTHY_RUN_MS) consecutiveCrashes = 0;
    consecutiveCrashes++;
    restarts++;
    const delay = backoffMs();
    logger.warn(
      `[DnsNodeLocal] Child exited (code=${code ?? "?"}, signal=${signal ?? "none"}) after ${Math.round(uptime / 1000)}s — restart #${restarts} in ${delay}ms`,
    );
    restartTimer = setTimeout(() => {
      restartTimer = null;
      spawnChild();
    }, delay);
    restartTimer.unref();
  });
}

/** Start the local DNS node subsystem. No-op unless DNS_NODE_LOCAL=1. */
export function startDnsNodeLocal(): void {
  if (!config.dnsNodeLocal.enabled) {
    logger.info(
      "[DnsNodeLocal] Disabled (set DNS_NODE_LOCAL=1 to run an internal-only dns-node instance for backend testing).",
    );
    return;
  }
  spawnChild();
}

/** Ready = the child's own health HTTP server reports ok. */
export async function checkDnsNodeLocalReady(): Promise<boolean> {
  if (!config.dnsNodeLocal.enabled) return false;
  const now = Date.now();
  if (now - lastReadyCheck < READY_TTL_MS) return lastReady;
  lastReadyCheck = now;
  try {
    const r = await fetch(
      `http://127.0.0.1:${config.dnsNodeLocal.healthPort}/health`,
      { signal: AbortSignal.timeout(3_000) },
    );
    lastReady = r.ok;
  } catch {
    lastReady = false;
  }
  return lastReady;
}

export function getDnsNodeLocalStatus(): DnsNodeLocalStatus {
  return {
    enabled: config.dnsNodeLocal.enabled,
    running: child !== null,
    ready: lastReady,
    pid: child?.pid ?? null,
    restarts,
    lastExit,
    error: startupError,
    note: NOTE,
  };
}

export function stopDnsNodeLocal(): void {
  shuttingDown = true;
  lastReady = false;
  lastReadyCheck = 0;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (child) {
    logger.info("[DnsNodeLocal] Stopping dns-node child…");
    child.kill("SIGTERM");
    const pid = child.pid;
    const killTimer = setTimeout(() => {
      try {
        if (pid) process.kill(-pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, 8_000);
    killTimer.unref();
    child = null;
  }
}
