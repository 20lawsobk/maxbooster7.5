import cluster from "cluster";
import os from "os";
import app from "./app";
import { logger } from "./logger.js";
import { redisManager } from "./redis/manager.js";
import { autoPushService } from "./auto-push/service.js";
import { datasetDiscovery } from "./services/datasetDiscoveryService.js";
import { datasetDownloader } from "./services/datasetDownloadService.js";
import { healthMonitor } from "./services/serverHealthMonitor.js";
import { stayAliveService } from "./services/stayAliveService.js";
import { eventLoopWatchdog } from "./services/eventLoopWatchdog.js";
import { luaPool } from "./workers/lua-pool.js";
import { registerPrimaryIPCHandler } from "./cluster/primary-handler.js";
import { initializeFabric } from "./pocket-dimension/fabric/index.js";
import http from "http";

// ── Global error containment ─────────────────────────────────────────────────
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[Process] Unhandled promise rejection:", reason);
});

// Survive uncaught exceptions rather than exiting.  The health monitor probes
// every 10 s and will auto-heal any service that became inconsistent as a
// side-effect of the throw.  Forcing GC helps reclaim any leaked memory.
process.on("uncaughtException", (err: Error) => {
  logger.error(
    "[Process] Uncaught exception — surviving (health monitor will repair affected services):",
    err,
  );
  try {
    if (typeof global.gc === "function") global.gc();
  } catch {}
});

// ── Port validation ───────────────────────────────────────────────────────────
const rawPort = process.env["PORT"];
if (!rawPort)
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0)
  throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── Cluster configuration ─────────────────────────────────────────────────────
// Set CLUSTER_WORKERS=8 (or any N) to enable cluster mode.
// Primary owns all state; workers handle HTTP connections.
const NUM_WORKERS = Number(process.env["CLUSTER_WORKERS"] ?? 0);
const isClusterMode = NUM_WORKERS > 0;

// ============================================================================
// PRIMARY / STANDALONE — initializes all state and services
// ============================================================================

async function startStateServices(): Promise<void> {
  // The fabric is the single durability backbone — the Redis layer now loads and
  // persists its snapshots through it, so the fabric (and its storage nodes)
  // must be live BEFORE any Redis instance bootstraps or warms up from disk.
  await initializeFabric();
  logger.info("[PocketFabric] Storage fabric activated");

  await redisManager.bootstrapSystemInstances();
  await redisManager.initialize();

  // Register all warmed-up instances with the stay-alive service so their
  // authenticated GET endpoints are pinged on every tick.
  for (const { id, token } of redisManager.listInstanceTokens()) {
    stayAliveService.registerInstance(id, token);
  }

  luaPool.start();
  logger.info(
    `[Lua] Worker pool started with ${process.env["LUA_WORKER_THREADS"] ?? 2} threads`,
  );

  await autoPushService.start();

  datasetDiscovery.startScheduler(6 * 60 * 60 * 1000);

  // Restart orphans the in-memory download queue; rebuild it from the DB so any
  // in-flight downloads resume automatically instead of stalling silently.
  await datasetDownloader.recoverPendingDownloads();

  healthMonitor.start({ redisManager, autoPushService, datasetDownloader });

  // Worker-thread watchdog — independent of the main event loop.  If the main
  // thread freezes for >60 s the worker sends SIGKILL so Replit auto-restarts.
  eventLoopWatchdog.start();
}

// ── Startup retry ─────────────────────────────────────────────────────────────
// Transient errors during init (e.g. a brief DB blip right at boot) should not
// permanently kill the server.  Retry up to MAX_INIT_ATTEMPTS times with
// exponential back-off before giving up.
const MAX_INIT_ATTEMPTS = 5;
const INIT_BACKOFF_BASE_MS = 2_000;

async function startStateServicesWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt++) {
    try {
      await startStateServices();
      return;
    } catch (err) {
      if (attempt === MAX_INIT_ATTEMPTS) {
        logger.error(
          `[Process] Initialization failed after ${MAX_INIT_ATTEMPTS} attempts — giving up:`,
          err,
        );
        throw err;
      }
      const delayMs = INIT_BACKOFF_BASE_MS * 2 ** (attempt - 1);
      logger.warn(
        `[Process] Initialization attempt ${attempt}/${MAX_INIT_ATTEMPTS} failed — retrying in ${delayMs}ms:`,
        err,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ── Process-level watchdog ────────────────────────────────────────────────────
// Runs every 5 s and ensures the health monitor and stay-alive service haven't
// silently stopped.  Both are idempotent to restart, so recovery is immediate
// rather than waiting up to a minute.
const WATCHDOG_INTERVAL_MS = 5_000;

function startWatchdog(port: number): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      // Ensure the worker-thread event-loop watchdog is still alive.
      if (!eventLoopWatchdog.isRunning()) {
        logger.warn("[Watchdog] Event-loop watchdog stopped — restarting");
        eventLoopWatchdog.start();
      }
      if (!healthMonitor.isRunning()) {
        logger.warn(
          "[Watchdog] Health monitor stopped unexpectedly — restarting",
        );
        healthMonitor.start({
          redisManager,
          autoPushService,
          datasetDownloader,
        });
      }
      // In cluster mode, stay-alive is owned by worker 1 — the primary must
      // never start its own copy or we'd have duplicate keep-alive loops.
      if (!(isClusterMode && cluster.isPrimary)) {
        if (!stayAliveService.isRunning()) {
          logger.warn("[Watchdog] Stay-alive service stopped — restarting");
          stayAliveService.start(port);
        } else {
          // Immediate self-heal for partially-dead timers
          stayAliveService.ensureAlive();
        }
      }
    } catch (err) {
      logger.error("[Watchdog] Error during watchdog tick:", err);
    }
  }, WATCHDOG_INTERVAL_MS);
}

async function gracefulShutdown(
  signal: string,
  server?: http.Server,
): Promise<void> {
  logger.warn(`[Process] ${signal} received — starting graceful shutdown`);

  eventLoopWatchdog.stop(); // stop first — don't trigger a SIGKILL during shutdown
  stayAliveService.stop();
  healthMonitor.stop();
  autoPushService.stop();

  if (server) {
    server.close(() => logger.info("[Process] HTTP server closed"));
  }

  try {
    logger.info("[Process] Flushing all Redis stores to PDIM...");
    await redisManager.flushAll();
    logger.info("[Process] All stores flushed — exiting cleanly");
  } catch (err) {
    logger.error("[Process] Flush error during shutdown:", err);
  }

  process.exit(0);
}

// ============================================================================
// CLUSTER MODE — primary forks workers and owns state; workers serve HTTP
// ============================================================================

if (isClusterMode && cluster.isPrimary) {
  logger.info(
    `[Cluster] Primary PID ${process.pid} — starting ${NUM_WORKERS} workers`,
  );

  startStateServicesWithRetry()
    .then(() => {
      // Register IPC handler AFTER state is ready so workers get valid responses
      registerPrimaryIPCHandler();

      for (let i = 0; i < NUM_WORKERS; i++) {
        const w = cluster.fork();
        logger.info(`[Cluster] Forked worker ${w.id} (PID ${w.process.pid})`);
      }

      cluster.on("exit", (worker, code, signal) => {
        logger.warn(
          `[Cluster] Worker ${worker.id} exited (code=${code}, sig=${signal ?? "none"}) — respawning`,
        );
        const w = cluster.fork();
        logger.info(
          `[Cluster] Respawned worker ${w.id} (PID ${w.process.pid})`,
        );
      });

      const watchdog = startWatchdog(port);

      process.once("SIGTERM", () => {
        clearInterval(watchdog);
        gracefulShutdown("SIGTERM").catch(() => process.exit(1));
      });
      process.once("SIGINT", () => {
        clearInterval(watchdog);
        gracefulShutdown("SIGINT").catch(() => process.exit(1));
      });
    })
    .catch((err) => {
      logger.error("[Cluster] Primary failed to initialize:", err);
      process.exit(1);
    });

  // ============================================================================
  // WORKER MODE — pure HTTP server, no state (delegates via IPC to primary)
  // ============================================================================
} else if (isClusterMode && cluster.isWorker) {
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.timeout = 60_000;

  server.listen(port, () => {
    logger.info(
      `[Cluster] Worker ${cluster.worker?.id} listening on port ${port}`,
    );
    // Only worker 1 runs stay-alive pings to avoid duplicate traffic
    if (cluster.worker?.id === 1) {
      stayAliveService.start(port);
    }
  });

  // Workers don't do graceful flush — primary handles that
  process.once("SIGTERM", () => {
    stayAliveService.stop();
    server.close();
    process.exit(0);
  });
  process.once("SIGINT", () => {
    stayAliveService.stop();
    server.close();
    process.exit(0);
  });

  // ============================================================================
  // STANDALONE MODE — single process handles both state and HTTP (default)
  // ============================================================================
} else {
  startStateServicesWithRetry()
    .then(() => {
      const server = http.createServer(app);
      server.keepAliveTimeout = 65_000;
      server.headersTimeout = 66_000;
      server.timeout = 60_000;

      server.listen(port, () => {
        logger.info(`Server listening on port ${port}`);
        stayAliveService.start(port);
      });

      const watchdog = startWatchdog(port);

      process.once("SIGTERM", () => {
        clearInterval(watchdog);
        gracefulShutdown("SIGTERM", server).catch(() => process.exit(1));
      });
      process.once("SIGINT", () => {
        clearInterval(watchdog);
        gracefulShutdown("SIGINT", server).catch(() => process.exit(1));
      });
    })
    .catch((err) => {
      logger.error("Failed to initialize:", err);
      process.exit(1);
    });
}
