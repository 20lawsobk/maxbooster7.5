/**
 * EVENT LOOP WATCHDOG
 *
 * Detects a completely frozen main-thread event loop and forces a clean
 * process restart so Replit's reserved-VM deployment can recover automatically
 * without manual intervention.
 *
 * ── Why a worker thread? ──────────────────────────────────────────────────────
 * Every other health-check mechanism in this server (serverHealthMonitor,
 * startWatchdog, stayAliveService) runs callbacks on the MAIN event loop.
 * When that loop freezes for hundreds of seconds (a fully-blocking synchronous
 * operation), none of those callbacks can fire.  The process appears live to
 * the OS but responds to zero HTTP requests.
 *
 * A Node.js worker thread has its own independent event loop.  It continues
 * ticking normally even when the main thread is completely stuck.
 *
 * ── Mechanism ─────────────────────────────────────────────────────────────────
 *   Main thread  →  posts 'beat' message every HEARTBEAT_MS (5 s)
 *   Worker thread → checks age of last beat every CHECK_INTERVAL_MS (10 s)
 *   If age > FREEZE_THRESHOLD_MS (60 s) → process.kill(process.pid, 'SIGKILL')
 *
 * SIGKILL cannot be caught or blocked — it terminates the process immediately at
 * the kernel level regardless of event-loop state.  Replit restarts the process
 * automatically.  A clean 60-second window avoids spurious kills during normal
 * heavy but non-frozen operation (snapshot writes, dataset scans, etc.).
 *
 * ── Worker isolation ──────────────────────────────────────────────────────────
 * The worker code is embedded as a string and started with `eval: true`.
 * This avoids file-path resolution issues in both dev (tsx/ESM) and production
 * (esbuild CJS bundle where import.meta.url is undefined), since the Lua worker
 * pool silently disables itself in the CJS bundle for the same reason.
 * The eval'd code uses require() (CommonJS), which is always available in a
 * worker eval context regardless of the parent's module format.
 */

import { Worker } from "worker_threads";
import { logger } from "../logger.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Main thread sends a beat this often (ms). */
const HEARTBEAT_MS = 5_000;

/**
 * How long without a heartbeat before the worker declares a freeze (ms).
 * 60 s gives plenty of headroom for slow-but-not-frozen operations
 * (zstd compression, AOF flush, fabric uploads) while still reacting
 * fast enough for the user to notice only a brief outage.
 */
const FREEZE_THRESHOLD_MS = 60_000;

/** How often the worker checks the heartbeat age (ms). */
const CHECK_INTERVAL_MS = 10_000;

// ── Inline worker code ─────────────────────────────────────────────────────────
// Written as CommonJS so it works in the eval context regardless of whether the
// parent bundle is ESM or CJS.  Avoid backticks and ${} inside this string.

const WATCHDOG_WORKER_CODE = [
  "var workerThreads = require('worker_threads');",
  "var parentPort = workerThreads.parentPort;",
  "var lastBeat = Date.now();",
  "var FREEZE_THRESHOLD_MS = " + String(FREEZE_THRESHOLD_MS) + ";",
  "var CHECK_INTERVAL_MS = " + String(CHECK_INTERVAL_MS) + ";",
  "",
  "parentPort.on('message', function(msg) {",
  "  if (msg === 'beat') {",
  "    lastBeat = Date.now();",
  "  } else if (msg === 'stop') {",
  "    clearInterval(checkTimer);",
  // process.exit(0) in a worker only terminates the worker, not the process.
  // Send a 'stopped' ack and let the main thread clean up naturally.
  "    parentPort.postMessage('stopped');",
  "  }",
  "});",
  "",
  "var checkTimer = setInterval(function() {",
  "  var elapsed = Date.now() - lastBeat;",
  "  if (elapsed > FREEZE_THRESHOLD_MS) {",
  "    process.stderr.write(",
  "      '[EventLoopWatchdog] Main thread frozen for ' + elapsed + 'ms' +",
  "      ' — sending SIGKILL so the deployment auto-restarts.\\n'",
  "    );",
  // SIGKILL terminates the entire process immediately; cannot be caught or
  // blocked by a frozen event loop.
  "    process.kill(process.pid, 'SIGKILL');",
  "  }",
  "}, CHECK_INTERVAL_MS);",
  "",
  "process.stderr.write(",
  "  '[EventLoopWatchdog] Watchdog thread started" +
    " — freeze threshold " +
    String(FREEZE_THRESHOLD_MS / 1000) +
    "s\\n'",
  ");",
].join("\n");

// ── Service ────────────────────────────────────────────────────────────────────

class EventLoopWatchdog {
  private worker: Worker | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _running = false;

  /**
   * Start the watchdog worker thread.
   * Safe to call multiple times — idempotent after first call.
   */
  start(): void {
    if (this._running) return;

    try {
      this.worker = new Worker(WATCHDOG_WORKER_CODE, { eval: true });

      this.worker.on("error", (err) => {
        logger.error("[EventLoopWatchdog] Worker error:", err);
        this._running = false;
      });

      this.worker.on("exit", (code) => {
        if (code !== 0) {
          logger.warn(`[EventLoopWatchdog] Worker exited with code ${code}`);
        }
        this.worker = null;
        this._running = false;
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      });

      // Beat timer — runs on the main event loop.
      // When the main loop freezes this timer stops firing, which is exactly
      // when the worker declares a freeze and sends SIGKILL.
      this.heartbeatTimer = setInterval(() => {
        if (this.worker) {
          try {
            this.worker.postMessage("beat");
          } catch {
            // Worker may have already exited — ignore.
          }
        }
      }, HEARTBEAT_MS);

      this._running = true;
      logger.info(
        `[EventLoopWatchdog] Started — forces restart if event loop` +
          ` freezes for >${FREEZE_THRESHOLD_MS / 1000}s`,
      );
    } catch (err) {
      // Worker threads may be unavailable in some stripped-down environments.
      // Log a warning and carry on — other health checks remain active.
      logger.warn(
        "[EventLoopWatchdog] Could not start worker thread (non-fatal):",
        (err as Error).message,
      );
    }
  }

  /** Graceful shutdown — signals the worker to stop before the process exits. */
  stop(): void {
    this._running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.worker) {
      try {
        this.worker.postMessage("stop");
      } catch {
        // Best-effort
      }
      this.worker = null;
    }
  }

  isRunning(): boolean {
    return this._running;
  }
}

export const eventLoopWatchdog = new EventLoopWatchdog();
