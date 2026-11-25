/**
 * SERVER HEALTH MONITOR — AUTO-DETECT & AUTO-FIX
 *
 * Continuously watches every layer of the Max Booster PDIM chain for crippling
 * errors and fixes them in real time without human intervention.
 *
 * Chain:  max-booster-agent ──► PDIM Storage Server ──► max-booster-training
 *
 * Layers monitored:
 *   1. Redis instances      — connectivity, response time, memory
 *   2. Auto-push pipeline   — stall detection, progress regression
 *   3. Dataset downloads    — stuck transfers, dead queue entries
 *   4. PDIM pockets         — write failures, open-handle leaks
 *   5. Process health       — heap, event-loop lag, crash loops
 *   6. Chain endpoints      — agent ↔ server ↔ training reachability
 *
 * Auto-fix actions:
 *   • Dead Redis store      → reload from DB + reconnect
 *   • Stalled auto-push     → stop + restart from checkpoint
 *   • Stuck download        → mark error, re-queue after delay
 *   • Memory pressure       → force GC, close idle pockets
 *   • Event-loop lag        → log + quarantine heavy operations
 *   • Crash loop            → exponential back-off before restart
 */

import { EventEmitter } from "events";
import v8 from "v8";
import { db } from "../lib/db.js";
import {
  redisInstances,
  datasetDownloads,
  discoveredDatasets,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";
import { pocketManager } from "../pocket-dimension/index.js";

// ── Constants ─────────────────────────────────────────────────────────────

const PROBE_INTERVAL_MS = 10_000; // probe every 10 s
const REDIS_PING_TIMEOUT_MS = 3_000;
const AUTOPUSH_STALL_MS = 45_000; // stall if no chunk progress in 45 s
const DOWNLOAD_STUCK_MS = 8 * 60 * 1000; // stuck if downloading for > 8 min
const HEAP_WARN_RATIO = 0.8; // warn at 80% heap
const HEAP_CRITICAL_RATIO = 0.92; // critical at 92% heap
const LOOP_LAG_WARN_MS = 200; // event-loop lag warning threshold
const LOOP_LAG_CRITICAL_MS = 1_000; // critical threshold
const MAX_FIX_HISTORY = 200; // keep last N fix events in memory
const CRASH_LOOP_WINDOW_MS = 60_000; // crash-loop detection window
const CRASH_LOOP_THRESHOLD = 3; // N fixes within window = crash loop
const HEAP_ALERT_COOLDOWN_MS = 60_000; // suppress repeat heap-critical alerts for 60 s

// ── Types ─────────────────────────────────────────────────────────────────

export type Severity = "info" | "warn" | "critical";

export interface HealthEvent {
  ts: Date;
  layer: string;
  check: string;
  severity: Severity;
  message: string;
  fixed: boolean;
  fixAction?: string;
  details?: Record<string, unknown>;
}

export interface LayerStatus {
  healthy: boolean;
  lastCheck: Date | null;
  lastError: string | null;
  errorCount: number;
  fixCount: number;
}

export interface HealthSnapshot {
  healthy: boolean;
  uptime: number;
  layers: Record<string, LayerStatus>;
  recentEvents: HealthEvent[];
  process: {
    heapUsedMB: number;
    heapTotalMB: number;
    heapLimitMB: number; // V8 max-old-space-size ceiling (authoritative limit)
    heapRatio: number; // heapUsed / heapLimit — true pressure against the ceiling
    eventLoopLagMs: number;
    uptimeSeconds: number;
  };
  chain: {
    agentInstanceId: string;
    trainingInstanceId: string;
    agentReachable: boolean;
    trainingReachable: boolean;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mbOf(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1_000_000;
      resolve(lag);
    });
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout after ${ms}ms: ${label}`)),
        ms,
      ),
    ),
  ]);
}

// ── Monitor ───────────────────────────────────────────────────────────────

export class ServerHealthMonitor extends EventEmitter {
  private static instance: ServerHealthMonitor;

  private timer: ReturnType<typeof setInterval> | null = null;
  private history: HealthEvent[] = [];
  private layers: Record<string, LayerStatus> = {};
  private fixTimestamps: number[] = [];
  private _agentReachable = false;
  private _trainingReachable = false;
  /** Cached canary pocket handle — reused across probe cycles to prevent open-handle accumulation. */
  private _canaryPocket: any = null;
  /** Timestamp of the last heap-critical alert — used to enforce a 60 s cooldown. */
  private _lastHeapCriticalAt = 0;

  // Injected at start() — avoids circular imports at module load time
  private redisManager: any = null;
  private autoPushService: any = null;
  private datasetDownloader: any = null;

  // Tracked state for stall detection
  private lastAutoPushChunkIndex = -1;
  private lastAutoPushMovedAt = Date.now();
  private autoPushRestarts = 0;

  private constructor() {
    super();
    for (const layer of [
      "redis",
      "autopush",
      "downloads",
      "pdim",
      "process",
      "chain",
    ]) {
      this.layers[layer] = {
        healthy: true,
        lastCheck: null,
        lastError: null,
        errorCount: 0,
        fixCount: 0,
      };
    }
  }

  static getInstance(): ServerHealthMonitor {
    if (!ServerHealthMonitor.instance) {
      ServerHealthMonitor.instance = new ServerHealthMonitor();
    }
    return ServerHealthMonitor.instance;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  start(deps: {
    redisManager: any;
    autoPushService: any;
    datasetDownloader?: any;
  }): void {
    if (this.timer) return;
    this.redisManager = deps.redisManager;
    this.autoPushService = deps.autoPushService;
    this.datasetDownloader = deps.datasetDownloader ?? null;

    logger.info(
      "[HealthMonitor] Starting — probing every " +
        PROBE_INTERVAL_MS / 1000 +
        "s",
    );
    this.probe().catch(() => {});
    this.timer = setInterval(
      () => this.probe().catch(() => {}),
      PROBE_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("[HealthMonitor] Stopped");
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  getSnapshot(): HealthSnapshot {
    const mem = process.memoryUsage();
    // Use V8's actual configured ceiling (reflects --max-old-space-size) instead
    // of the dynamic heapTotal.  V8 keeps heapTotal near the live-set size and
    // grows it on demand — so heapUsed/heapTotal is always near 95% even when
    // there is plenty of headroom, causing false CRITICAL alarms.
    const heapLimitBytes = v8.getHeapStatistics().heap_size_limit;
    const heapRatio = mem.heapUsed / heapLimitBytes;
    return {
      healthy: Object.values(this.layers).every((l) => l.healthy),
      uptime: process.uptime(),
      layers: { ...this.layers },
      recentEvents: this.history.slice(-50),
      process: {
        heapUsedMB: mbOf(mem.heapUsed),
        heapTotalMB: mbOf(mem.heapTotal),
        heapLimitMB: mbOf(heapLimitBytes),
        heapRatio: Math.round(heapRatio * 1000) / 1000,
        eventLoopLagMs: 0, // populated by probe
        uptimeSeconds: Math.round(process.uptime()),
      },
      chain: {
        agentInstanceId: "22c8e6d237afe8ae41541f87",
        trainingInstanceId: "f26378c8b4faf9f237a0f816",
        agentReachable: this._agentReachable,
        trainingReachable: this._trainingReachable,
      },
    };
  }

  // ── Master Probe ──────────────────────────────────────────────────────

  private async probe(): Promise<void> {
    await Promise.allSettled([
      this.checkRedis(),
      this.checkAutoPush(),
      this.checkDownloads(),
      this.checkProcess(),
      this.checkChain(),
    ]);
    await this.checkPdim(); // sequential — accesses shared pocket state
  }

  // ── Layer: Redis Instances ────────────────────────────────────────────

  private async checkRedis(): Promise<void> {
    const layer = "redis";
    try {
      const rows = await db
        .select()
        .from(redisInstances)
        .then((r) => r.filter((x) => x.isActive));
      let deadCount = 0;
      let fixedCount = 0;

      for (const row of rows) {
        let store = await this.redisManager.getStore(row.id);

        if (!store) {
          // Store completely missing from manager — reload it
          this.record(
            layer,
            "store-missing",
            "critical",
            `Redis store "${row.name}" (${row.id}) not in manager — reloading`,
            false,
          );
          try {
            await this.redisManager.initialize();
            store = await this.redisManager.getStore(row.id);
            if (store) {
              this.record(
                layer,
                "store-missing",
                "critical",
                `Reloaded store "${row.name}"`,
                true,
                "reinitialize-manager",
              );
              fixedCount++;
            }
          } catch (err) {
            deadCount++;
            continue;
          }
        }

        // Ping health check with timeout
        const ok = await withTimeout(
          Promise.resolve().then(() => {
            const result = store.execSync("PING", []);
            return result === "PONG" || result === "+PONG";
          }),
          REDIS_PING_TIMEOUT_MS,
          `PING ${row.id}`,
        ).catch(() => false);

        if (!ok) {
          deadCount++;
          this.record(
            layer,
            "ping-fail",
            "critical",
            `Redis instance "${row.name}" not responding to PING`,
            false,
          );

          // Auto-fix: force reload from DB
          try {
            await this.redisManager.initialize();
            const healed = await this.redisManager.getStore(row.id);
            if (healed) {
              const ok2 = await Promise.resolve()
                .then(() => healed.execSync("PING", []) === "PONG")
                .catch(() => false);
              if (ok2) {
                this.record(
                  layer,
                  "ping-fail",
                  "warn",
                  `Healed "${row.name}" — PING now OK`,
                  true,
                  "reinitialize-store",
                );
                fixedCount++;
                deadCount--;
              }
            }
          } catch (err) {
            logger.error(
              `[HealthMonitor] Redis heal failed for ${row.name}:`,
              err,
            );
          }
        }
      }

      this.setLayerHealth(
        layer,
        deadCount === 0,
        deadCount === 0 ? null : `${deadCount} Redis instance(s) unresponsive`,
      );
      // fixCount already incremented inside record() for each fixed=true call
      this.layers[layer].lastCheck = new Date();
    } catch (err) {
      this.setLayerHealth(layer, false, (err as Error).message);
    }
  }

  // ── Layer: Auto-Push Pipeline ─────────────────────────────────────────

  private async checkAutoPush(): Promise<void> {
    const layer = "autopush";
    try {
      const svc = this.autoPushService;
      if (!svc) {
        this.layers[layer].lastCheck = new Date();
        return;
      }

      const progress = svc.progress;
      const running = svc.running;
      const now = Date.now();

      // Detect progress regression (chunkIndex went backwards).
      // Exempt legitimate restarts: chunkIndex drops to 0 when restart() is called.
      const isRestartReset =
        progress.chunkIndex === 0 && this.lastAutoPushChunkIndex > 0;
      if (isRestartReset) {
        // Reset stall tracking so the restart isn't mistaken for a stall
        this.lastAutoPushChunkIndex = 0;
        this.lastAutoPushMovedAt = Date.now();
      } else if (running && progress.chunkIndex < this.lastAutoPushChunkIndex) {
        this.record(
          layer,
          "progress-regression",
          "warn",
          `Auto-push chunkIndex regressed: ${this.lastAutoPushChunkIndex} → ${progress.chunkIndex}`,
          false,
        );
      }

      // Detect stall: running but chunkIndex hasn't moved
      if (
        running &&
        progress.chunkIndex === this.lastAutoPushChunkIndex &&
        this.lastAutoPushChunkIndex >= 0 &&
        now - this.lastAutoPushMovedAt > AUTOPUSH_STALL_MS
      ) {
        this.record(
          layer,
          "stall",
          "critical",
          `Auto-push stalled at chunk ${progress.chunkIndex} for ` +
            `${Math.round((now - this.lastAutoPushMovedAt) / 1000)}s`,
          false,
        );

        // Auto-fix: restart the pipeline
        if (!this.isCrashLooping()) {
          try {
            svc.stop();
            await new Promise((r) => setTimeout(r, 1000));
            await svc.start();
            this.lastAutoPushMovedAt = Date.now();
            this.autoPushRestarts++;
            this.record(
              layer,
              "stall",
              "warn",
              `Auto-push restarted (restart #${this.autoPushRestarts})`,
              true,
              "restart-pipeline",
            );
            this.fixTimestamps.push(Date.now());
            // fixCount already incremented by record() above — no manual increment needed
          } catch (err) {
            logger.error("[HealthMonitor] Auto-push restart failed:", err);
          }
        } else {
          this.record(
            layer,
            "crash-loop",
            "critical",
            "Crash loop detected — suppressing auto-push restart",
            false,
            "crash-loop-suppressed",
          );
        }
      }

      // Update stall tracking
      if (progress.chunkIndex !== this.lastAutoPushChunkIndex) {
        this.lastAutoPushChunkIndex = progress.chunkIndex;
        this.lastAutoPushMovedAt = now;
      }

      // Detect total completion (not a problem, just note it)
      const isDone =
        progress.totalChunks > 0 && progress.chunkIndex >= progress.totalChunks;
      this.setLayerHealth(layer, true, null);
      this.layers[layer].lastCheck = new Date();
    } catch (err) {
      this.setLayerHealth(layer, false, (err as Error).message);
    }
  }

  // ── Layer: Dataset Downloads ──────────────────────────────────────────

  private async checkDownloads(): Promise<void> {
    const layer = "downloads";
    try {
      const rows = await db.select().from(datasetDownloads);
      const now = Date.now();
      let stuckCount = 0;
      let fixedCount = 0;

      for (const dl of rows) {
        if (dl.status !== "downloading") continue;
        if (!dl.startedAt) continue;
        const age = now - dl.startedAt.getTime();

        if (age > DOWNLOAD_STUCK_MS) {
          stuckCount++;
          this.record(
            layer,
            "stuck-download",
            "warn",
            `Download #${dl.id} stuck in "downloading" for ${Math.round(age / 60000)}min`,
            false,
          );

          // Auto-fix: reset to error, clear queued flag, allow re-queue
          try {
            await db
              .update(datasetDownloads)
              .set({
                status: "error",
                errorMessage: "Auto-fixed: timed out (health monitor)",
              })
              .where(eq(datasetDownloads.id, dl.id));

            await db
              .update(discoveredDatasets)
              .set({ isQueued: false })
              .where(eq(discoveredDatasets.id, dl.datasetId));

            // Remove from active downloads in downloader service
            if (this.datasetDownloader) {
              this.datasetDownloader.activeDownloads?.delete(dl.id);
            }

            stuckCount--;
            fixedCount++;
            this.record(
              layer,
              "stuck-download",
              "info",
              `Reset stuck download #${dl.id} — re-queuable`,
              true,
              "reset-download",
            );
          } catch (err) {
            logger.warn("[HealthMonitor] Could not reset stuck download:", err);
          }
        }
      }

      this.setLayerHealth(
        layer,
        stuckCount === 0,
        stuckCount > 0 ? `${stuckCount} download(s) stuck` : null,
      );
      // fixCount already incremented by record() for each fixed=true event
      this.layers[layer].lastCheck = new Date();
    } catch (err) {
      this.setLayerHealth(layer, false, (err as Error).message);
    }
  }

  // ── Layer: Process Health ─────────────────────────────────────────────

  private async checkProcess(): Promise<void> {
    const layer = "process";
    try {
      const mem = process.memoryUsage();
      // Compare against the configured V8 limit (--max-old-space-size), NOT the
      // dynamic heapTotal.  V8 grows heapTotal lazily, so heapUsed/heapTotal is
      // always ~95% at steady state even with huge headroom — giving constant false
      // CRITICAL alarms and triggering unnecessary pocket-close "fixes".
      const heapLimitBytes = v8.getHeapStatistics().heap_size_limit;
      const heapRatio = mem.heapUsed / heapLimitBytes;
      const lagMs = await measureEventLoopLag();
      let issues: string[] = [];

      // Memory checks
      if (heapRatio >= HEAP_CRITICAL_RATIO) {
        issues.push(`Heap critical: ${Math.round(heapRatio * 100)}%`);

        // Emit the critical event at most once per HEAP_ALERT_COOLDOWN_MS to prevent log floods.
        // The alert is still tracked in issues[], which keeps the layer marked unhealthy.
        const now2 = Date.now();
        if (now2 - this._lastHeapCriticalAt >= HEAP_ALERT_COOLDOWN_MS) {
          this._lastHeapCriticalAt = now2;
          this.record(
            layer,
            "heap-critical",
            "critical",
            `Heap at ${Math.round(heapRatio * 100)}% (${mbOf(mem.heapUsed)}/${mbOf(heapLimitBytes)} MB limit)`,
            false,
          );
        }

        // Auto-fix: force GC + close idle pockets.
        // Protected pockets must NEVER be closed — they hold live Redis or canary data.
        const PROTECTED_POCKETS = new Set([
          "max-booster-agent",
          "max-booster-datasets",
          "max-booster-training",
          "health-canary",
        ]);
        let fixed = false;
        if (typeof global.gc === "function") {
          global.gc();
          fixed = true;
          this.record(
            layer,
            "heap-critical",
            "warn",
            "Forced GC",
            true,
            "force-gc",
          );
        }

        try {
          const pocketList = pocketManager.listPockets();
          const idlePockets = pocketList.filter(
            (id) => !PROTECTED_POCKETS.has(id),
          );
          for (const id of idlePockets.slice(0, 5)) {
            await pocketManager.closePocket(id);
          }
          if (idlePockets.length > 0) {
            this.record(
              layer,
              "heap-critical",
              "warn",
              `Closed ${Math.min(idlePockets.length, 5)} idle PDIM pocket(s)`,
              true,
              "close-idle-pockets",
            );
            fixed = true;
          }
        } catch {}

        // fixCount already incremented by each record(fixed=true) call above
      } else if (heapRatio >= HEAP_WARN_RATIO) {
        this.record(
          layer,
          "heap-warn",
          "warn",
          `Heap at ${Math.round(heapRatio * 100)}% (${mbOf(mem.heapUsed)}/${mbOf(heapLimitBytes)} MB limit)`,
          false,
        );
        issues.push(`Heap warn: ${Math.round(heapRatio * 100)}%`);
      }

      // Event-loop lag checks
      if (lagMs >= LOOP_LAG_CRITICAL_MS) {
        issues.push(`Event loop lag: ${Math.round(lagMs)}ms`);
        this.record(
          layer,
          "loop-lag-critical",
          "critical",
          `Event loop blocked for ${Math.round(lagMs)}ms`,
          false,
        );
      } else if (lagMs >= LOOP_LAG_WARN_MS) {
        this.record(
          layer,
          "loop-lag-warn",
          "warn",
          `Event loop lag: ${Math.round(lagMs)}ms`,
          false,
        );
      }

      this.setLayerHealth(
        layer,
        issues.length === 0,
        issues.length > 0 ? issues.join("; ") : null,
      );
      this.layers[layer].lastCheck = new Date();
    } catch (err) {
      this.setLayerHealth(layer, false, (err as Error).message);
    }
  }

  // ── Layer: PDIM Pocket Health ─────────────────────────────────────────

  private async checkPdim(): Promise<void> {
    const layer = "pdim";
    try {
      const pocketList = pocketManager.listPockets();
      const issues: string[] = [];

      // Write a canary key to the primary data pocket and read it back.
      // The pocket handle is cached on the class instance so it is NOT reopened
      // on every probe cycle — that was the root cause of open-handle accumulation
      // and the 97-98% heap pressure seen in production.
      const CANARY_ID = "health-canary";
      const CANARY_VAL = Buffer.from(`ok:${Date.now()}`);

      try {
        if (!this._canaryPocket) {
          this._canaryPocket = await withTimeout(
            pocketManager.openPocket(CANARY_ID, { compressionLevel: 1 }),
            5_000,
            "open canary pocket",
          );
        }
        const pocket = this._canaryPocket;
        await withTimeout(
          pocket.write("__health__", CANARY_VAL),
          3_000,
          "canary write",
        );
        const readBack = await withTimeout(
          pocket.read("__health__"),
          3_000,
          "canary read",
        );

        if (!readBack || readBack.toString() !== CANARY_VAL.toString()) {
          issues.push("Canary read-back mismatch");
          this.record(
            layer,
            "canary-mismatch",
            "critical",
            "PDIM canary write/read mismatch — possible pocket corruption",
            false,
          );

          // Reset the cached handle and close so the next probe reopens it cleanly
          this._canaryPocket = null;
          await pocketManager.closePocket(CANARY_ID).catch(() => {});
          this.record(
            layer,
            "canary-mismatch",
            "warn",
            "Closed and reset canary pocket",
            true,
            "reset-pocket",
          );
        }
      } catch (err) {
        const errMsg = (err as Error).message ?? "";
        const isEnospc =
          (err as NodeJS.ErrnoException).code === "ENOSPC" ||
          errMsg.includes("ENOSPC") ||
          errMsg.includes("no space left");

        issues.push(`Canary failed: ${errMsg}`);
        this.record(
          layer,
          "canary-error",
          "critical",
          `PDIM canary error: ${errMsg}`,
          false,
        );

        // Reset cached handle — will be reopened on next probe
        this._canaryPocket = null;

        if (isEnospc) {
          // Disk is full — run GC on ALL open pockets to delete orphaned chunk files
          // left by previous writes.  This reclaims disk space so the next probe
          // and persist() calls can succeed.
          try {
            const pocketIds = pocketManager.listPockets();
            let totalFreed = 0;
            for (const pid of pocketIds) {
              try {
                const p = await pocketManager.openPocket(pid);
                totalFreed += await p.compact();
              } catch {}
            }
            this.record(
              layer,
              "enospc-compact",
              "warn",
              `ENOSPC: compacted ${pocketIds.length} pocket(s), freed ${totalFreed} orphaned chunk files`,
              true,
              "enospc-compact",
            );
          } catch (gcErr) {
            this.record(
              layer,
              "enospc-compact-fail",
              "critical",
              `ENOSPC compact failed: ${(gcErr as Error).message}`,
              false,
            );
          }
        } else {
          // Non-disk error — close ONLY the canary pocket, NOT the live data pockets.
          // Calling closeAll() here would close main Redis-store pockets mid-write,
          // risking data loss. The canary is isolated and safe to close alone.
          try {
            await pocketManager.closePocket(CANARY_ID).catch(() => {});
            this.record(
              layer,
              "canary-error",
              "warn",
              "Reset canary pocket for recovery (data pockets untouched)",
              true,
              "reset-canary-pocket",
            );
          } catch {}
        }
      }

      this.setLayerHealth(
        layer,
        issues.length === 0,
        issues.length > 0 ? issues.join("; ") : null,
      );
      this.layers[layer].lastCheck = new Date();
    } catch (err) {
      this.setLayerHealth(layer, false, (err as Error).message);
    }
  }

  // ── Layer: Chain Endpoint Reachability ───────────────────────────────

  private async checkChain(): Promise<void> {
    const layer = "chain";
    try {
      const AGENT_ID = "22c8e6d237afe8ae41541f87";
      const TRAINING_ID = "f26378c8b4faf9f237a0f816";
      const issues: string[] = [];

      for (const { id, label, flag } of [
        { id: AGENT_ID, label: "max-booster-agent", flag: "agent" as const },
        {
          id: TRAINING_ID,
          label: "max-booster-training",
          flag: "training" as const,
        },
      ]) {
        let linkOk = false;

        const store = await withTimeout(
          this.redisManager.getStore(id),
          REDIS_PING_TIMEOUT_MS,
          `getStore ${label}`,
        ).catch(() => null);

        if (!store) {
          issues.push(`${label} store unavailable`);
          this.record(
            layer,
            "chain-link-down",
            "critical",
            `Chain link "${label}" (${id}) is unreachable`,
            false,
          );

          // Auto-fix: reinitialize manager to reload chain stores
          try {
            await this.redisManager.initialize();
            const healed = await this.redisManager.getStore(id);
            if (healed) {
              this.record(
                layer,
                "chain-link-down",
                "warn",
                `Chain link "${label}" restored`,
                true,
                "reinitialize-chain-store",
              );
              // fixCount already incremented by record() — no explicit increment needed
              issues.pop();
              linkOk = true;
            }
          } catch {}
        } else {
          // Ping the chain endpoint
          const alive = await (store as any)
            .exec("PING", [])
            .then((r: unknown) => r === "PONG")
            .catch(() => false);

          if (!alive) {
            issues.push(`${label} not responding`);
            this.record(
              layer,
              "chain-ping-fail",
              "critical",
              `Chain endpoint "${label}" PING failed`,
              false,
            );
          } else {
            linkOk = true;
          }
        }

        if (flag === "agent") this._agentReachable = linkOk;
        if (flag === "training") this._trainingReachable = linkOk;
      }

      this.setLayerHealth(
        layer,
        issues.length === 0,
        issues.length > 0 ? issues.join("; ") : null,
      );
      this.layers[layer].lastCheck = new Date();
    } catch (err) {
      this.setLayerHealth(layer, false, (err as Error).message);
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private record(
    layer: string,
    check: string,
    severity: Severity,
    message: string,
    fixed: boolean,
    fixAction?: string,
    details?: Record<string, unknown>,
  ): void {
    const event: HealthEvent = {
      ts: new Date(),
      layer,
      check,
      severity,
      message,
      fixed,
      fixAction,
      details,
    };

    this.history.push(event);
    if (this.history.length > MAX_FIX_HISTORY) this.history.shift();

    const prefix = fixed ? "✔ FIXED" : severity.toUpperCase();
    const logFn =
      severity === "critical" ? "error" : severity === "warn" ? "warn" : "info";
    logger[logFn](
      `[HealthMonitor][${layer}] ${prefix}: ${message}${fixAction ? ` (${fixAction})` : ""}`,
    );

    this.emit("event", event);

    if (fixed) this.layers[layer].fixCount++;
    if (!fixed && severity !== "info") {
      this.layers[layer].errorCount++;
      this.layers[layer].lastError = message;
    }
  }

  private setLayerHealth(
    layer: string,
    healthy: boolean,
    error: string | null,
  ): void {
    this.layers[layer].healthy = healthy;
    if (!healthy && error) this.layers[layer].lastError = error;
    if (healthy) this.layers[layer].lastError = null;
    this.layers[layer].lastCheck = new Date();
  }

  private isCrashLooping(): boolean {
    const now = Date.now();
    this.fixTimestamps = this.fixTimestamps.filter(
      (t) => now - t < CRASH_LOOP_WINDOW_MS,
    );
    return this.fixTimestamps.length >= CRASH_LOOP_THRESHOLD;
  }

  /** Expose all recent fix events for the dashboard. */
  getHistory(limit = 50): HealthEvent[] {
    return this.history.slice(-limit);
  }

  /** Manual trigger: force an immediate probe cycle. */
  async forceProbe(): Promise<HealthSnapshot> {
    await this.probe();
    return this.getSnapshot();
  }
}

export const healthMonitor = ServerHealthMonitor.getInstance();
