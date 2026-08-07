/**
 * STAY-ALIVE SERVICE v2
 *
 * Two-tier keep-alive strategy that keeps the server reachable 100% of the
 * time rather than just warm internally.
 *
 * ── Tier 1: External heartbeat (highest priority) ─────────────────────────
 *   Pings the server's public Replit domain every HEARTBEAT_INTERVAL_MS.
 *   This is the critical tier — Replit's proxy only stays active when it sees
 *   real external HTTP traffic.  Internal-only pings are invisible to the
 *   proxy, so without this tier the server can become unreachable even while
 *   the process is still running.
 *
 * ── Tier 2: Continuous rolling internal warm-up ───────────────────────────
 *   Advances through all GET endpoints one-at-a-time on a short tick
 *   (ROLL_TICK_MS), so hot code paths are always warm and there is never a
 *   burst/idle cycle.  All internal pings use 127.0.0.1 and bypass the
 *   rate-limiter token bucket.
 *
 * User-Agent: "PDIM-StayAlive/2.0" — lets log filters distinguish these
 * pings from real client traffic.
 *
 * Lifecycle: start(port) → running → stop() on graceful shutdown.
 */

import { logger } from "../logger.js";

// ── Configuration ─────────────────────────────────────────────────────────────

/** How often to ping the public external URL (ms). Keep well under 30 s. */
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * How often to advance the internal rolling-ping queue (ms).
 * One endpoint is pinged per tick; all endpoints are covered within
 * (numEndpoints × ROLL_TICK_MS).  At 1 000 ms with ~22 endpoints the full
 * cycle completes in ~22 s — always active, never bursty.
 */
const ROLL_TICK_MS = 1_000;

const REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = "PDIM-StayAlive/2.0";

/**
 * Wake/stall detector: a lightweight sentinel runs every SENTINEL_TICK_MS and
 * compares wall-clock drift.  If the gap between ticks exceeds
 * STALL_THRESHOLD_MS the process was asleep, frozen, or the event loop was
 * blocked — reactivation fires IMMEDIATELY (heartbeat + timer restart).
 */
const SENTINEL_TICK_MS = 1_000;
const STALL_THRESHOLD_MS = 5_000;

/** Failed external heartbeats retry immediately at this interval, this many times. */
const HEARTBEAT_RETRY_MS = 2_000;
const HEARTBEAT_MAX_RETRIES = 3;

/** Every safe GET endpoint that requires no authentication. */
const PUBLIC_ENDPOINTS: string[] = [
  // Core liveness / info
  "/api/healthz",
  "/api/",
  // Auto-push pipeline
  "/api/autopush/status",
  // Redis instance registry (list — no auth)
  "/api/redis/instances",
  // Monitor
  "/api/monitor/health",
  "/api/monitor/scale",
  "/api/monitor/stay-alive",
  "/api/monitor/events",
  // Datasets
  "/api/datasets",
  "/api/datasets/discover/status",
  "/api/datasets/download/progress",
  "/api/datasets/download/history",
  // Fabric storage
  "/api/fabric/status",
  "/api/fabric/nodes",
  "/api/fabric/scrub/status",
  "/api/fabric/capacity",
  "/api/fabric/migrate-backend/status",
  "/api/fabric/buckets",
];

interface InstanceEntry {
  id: string;
  token: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class StayAliveService {
  private static _instance: StayAliveService;

  // Tier 1 — external heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private externalBaseUrl = "";

  // Tier 2 — rolling internal warm-up
  private rollTimer: ReturnType<typeof setInterval> | null = null;
  private rollQueue: Array<{ path: string; token?: string }> = [];
  private rollIndex = 0;

  // Sentinel — wake/stall detector for immediate reactivation
  private sentinelTimer: ReturnType<typeof setInterval> | null = null;
  private lastSentinelTick = 0;
  private port = 0;
  private stopped = true; // true only after explicit stop() (graceful shutdown)

  // Single-flight guards — prevent overlapping executions
  private heartbeatInFlight = false;
  private reactivating = false;

  private internalBaseUrl = "";
  private readonly instances: Map<string, string> = new Map(); // id → token

  /** Cumulative stats since start() */
  readonly stats = {
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    lastHeartbeatAt: null as Date | null,
    lastHeartbeatOk: null as boolean | null,
    lastRollAt: null as Date | null,
    activatedAt: null as Date | null,
    reactivations: 0,
    lastReactivationAt: null as Date | null,
    lastReactivationReason: null as string | null,
  };

  private constructor() {}

  static getInstance(): StayAliveService {
    if (!StayAliveService._instance) {
      StayAliveService._instance = new StayAliveService();
    }
    return StayAliveService._instance;
  }

  /**
   * Register a Redis instance so its GET endpoints are included in the
   * rolling queue.  Safe to call multiple times with the same id — the token
   * is just updated and the queue is rebuilt on the next tick.
   */
  registerInstance(id: string, token: string): void {
    this.instances.set(id, token);
    this.rebuildQueue();
  }

  /** Unregister a deleted instance so it stops being pinged. */
  unregisterInstance(id: string): void {
    this.instances.delete(id);
    this.rebuildQueue();
  }

  /**
   * Start both tiers.  `port` must match the port Express is listening on.
   * The external heartbeat URL is derived from REPLIT_DOMAINS; if the env var
   * is absent (local dev) it falls back to the internal URL so the service
   * still works.
   */
  start(port: number): void {
    if (this.heartbeatTimer || this.rollTimer) return;

    this.port = port;
    this.stopped = false;
    this.stats.activatedAt = new Date();
    this.internalBaseUrl = `http://127.0.0.1:${port}`;

    // Resolve the public URL for external heartbeats.
    //
    // Priority:
    //   1. PDIM_APP_URL — explicitly configured production URL (e.g. set as a
    //      production env var to "https://pocketdimensionstorage.replit.app").
    //      This is the only reliable way to get the production URL on Replit
    //      VM deployments.
    //   2. REPLIT_DOMAINS — only used when it contains a stable production
    //      domain (*.replit.app).  On Replit, REPLIT_DOMAINS always holds the
    //      *.replit.dev dev URL (even inside a deployed VM), and that URL is
    //      not reachable via unauthenticated server-side fetch, so we must
    //      ignore it in that case.
    //   3. Fall back to internalBaseUrl — heartbeat stays local; still keeps
    //      the process warm, just doesn't exercise the external proxy.
    const explicitUrl = (process.env["PDIM_APP_URL"] ?? "").trim();
    const replitDomain = (process.env["REPLIT_DOMAINS"] ?? "")
      .split(",")[0]
      ?.trim();
    const replitDomainUrl =
      replitDomain && !replitDomain.includes(".replit.dev")
        ? `https://${replitDomain}`
        : "";
    this.externalBaseUrl =
      explicitUrl || replitDomainUrl || this.internalBaseUrl;

    this.rebuildQueue();

    const totalPublic = PUBLIC_ENDPOINTS.length;
    const totalInstance = this.instances.size * 2;
    const externalLabel =
      this.externalBaseUrl !== this.internalBaseUrl
        ? this.externalBaseUrl
        : "internal (no REPLIT_DOMAINS)";

    logger.info(
      `[StayAlive] Started — external heartbeat every ${HEARTBEAT_INTERVAL_MS / 1_000}s → ${externalLabel}` +
        ` | rolling ${totalPublic} public + ${totalInstance} instance endpoints every ${ROLL_TICK_MS}ms`,
    );

    this.activateTimers();
    this.startSentinel();
  }

  /**
   * (Re)arm both keep-alive timers and fire the first heartbeat + roll ping
   * IMMEDIATELY — activation is instant, with zero startup delay.
   */
  private activateTimers(): void {
    // ── Tier 1: External heartbeat — fire NOW, then on the fixed interval.
    this.heartbeat().catch(() => {});
    this.heartbeatTimer = setInterval(
      () => this.heartbeat().catch(() => {}),
      HEARTBEAT_INTERVAL_MS,
    );

    // ── Tier 2: Rolling internal warm-up — fire NOW, then every tick.
    this.rollOne().catch(() => {});
    this.rollTimer = setInterval(
      () => this.rollOne().catch(() => {}),
      ROLL_TICK_MS,
    );
  }

  /**
   * Sentinel loop: detects process sleep / event-loop stalls / dead timers
   * and reactivates the service the instant a problem is observed.
   */
  private startSentinel(): void {
    if (this.sentinelTimer) return;
    this.lastSentinelTick = Date.now();

    this.sentinelTimer = setInterval(() => {
      const now = Date.now();
      const gap = now - this.lastSentinelTick;
      this.lastSentinelTick = now;

      if (this.stopped) return;

      // 1. Wake-from-sleep / stall detection: the tick arrived far later than
      //    scheduled — the process was suspended.  Reactivate immediately.
      if (gap > STALL_THRESHOLD_MS) {
        this.reactivate(
          `process slept/stalled for ${(gap / 1_000).toFixed(1)}s`,
        );
        return;
      }

      // 2. Dead-timer detection: timers were cleared without stop() being
      //    called (e.g. an exotic crash path).  Reactivate immediately.
      if (!this.heartbeatTimer || !this.rollTimer) {
        this.reactivate("keep-alive timers were down");
      }
    }, SENTINEL_TICK_MS);

    // Never let the sentinel keep the process alive on its own during exit.
    this.sentinelTimer.unref?.();
  }

  /**
   * Immediate reactivation: tear down whatever is left, re-arm all timers,
   * and fire a heartbeat right away.  Called by the sentinel on wake/stall,
   * by the watchdog, or manually via ensureAlive().
   */
  reactivate(reason: string): void {
    if (this.stopped) return;
    // Single-flight: sentinel + watchdog + manual calls must not stack.
    if (this.reactivating) return;
    this.reactivating = true;

    this.stats.reactivations++;
    this.stats.lastReactivationAt = new Date();
    this.stats.lastReactivationReason = reason;
    logger.warn(`[StayAlive] REACTIVATING immediately — ${reason}`);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.rollTimer) {
      clearInterval(this.rollTimer);
      this.rollTimer = null;
    }

    try {
      this.activateTimers();
    } finally {
      this.reactivating = false;
    }
  }

  /**
   * Idempotent guard: if the service should be running but isn't, bring it
   * back immediately.  Safe to call from anywhere (watchdog, routes, etc.).
   */
  ensureAlive(): void {
    if (this.stopped) return;
    if (!this.heartbeatTimer || !this.rollTimer) {
      this.reactivate("ensureAlive() found service down");
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.sentinelTimer) {
      clearInterval(this.sentinelTimer);
      this.sentinelTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.rollTimer) {
      clearInterval(this.rollTimer);
      this.rollTimer = null;
      logger.info("[StayAlive] Stopped");
    }
  }

  isRunning(): boolean {
    return this.heartbeatTimer !== null || this.rollTimer !== null;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /** Rebuild the rolling endpoint queue from current PUBLIC_ENDPOINTS + instances. */
  private rebuildQueue(): void {
    const queue: Array<{ path: string; token?: string }> = PUBLIC_ENDPOINTS.map(
      (path) => ({ path }),
    );
    for (const [id, token] of this.instances) {
      queue.push({ path: `/api/redis/instances/${id}`, token });
      queue.push({ path: `/api/redis/instances/${id}/keys`, token });
    }
    this.rollQueue = queue;
    // Keep the index in bounds after a rebuild
    if (this.rollIndex >= this.rollQueue.length) {
      this.rollIndex = 0;
    }
  }

  /**
   * Tier 1: Ping the external public URL at /api/healthz.
   * This is what keeps Replit's proxy routing traffic to this server.
   */
  private async heartbeat(): Promise<void> {
    // Single-flight: a heartbeat with retries can outlast the 20 s interval;
    // never let executions overlap.
    if (this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;

    try {
      this.stats.lastHeartbeatAt = new Date();
      let ok = await this.ping("/api/healthz", undefined, this.externalBaseUrl);
      this.stats.totalPings++;

      // Immediate retries: don't wait for the next 20 s cycle if we failed —
      // retry right away at a short interval until reachability is confirmed.
      let retries = 0;
      while (!ok && retries < HEARTBEAT_MAX_RETRIES && !this.stopped) {
        retries++;
        logger.warn(
          `[StayAlive] External heartbeat failed — immediate retry ${retries}/${HEARTBEAT_MAX_RETRIES} in ${HEARTBEAT_RETRY_MS / 1_000}s`,
        );
        await new Promise((r) => setTimeout(r, HEARTBEAT_RETRY_MS));
        if (this.stopped) return; // shutdown during the retry sleep — no late pings
        ok = await this.ping("/api/healthz", undefined, this.externalBaseUrl);
        this.stats.totalPings++;
      }

      this.stats.lastHeartbeatOk = ok;
      if (ok) {
        this.stats.successfulPings += 1;
        this.stats.failedPings += retries;
      } else {
        this.stats.failedPings += 1 + retries;
        logger.error(
          `[StayAlive] External heartbeat still failing after ${retries} immediate retries — server may be unreachable`,
        );
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  /**
   * Tier 2: Advance one step in the rolling internal endpoint queue.
   */
  private async rollOne(): Promise<void> {
    if (this.rollQueue.length === 0) return;

    this.stats.lastRollAt = new Date();
    const entry = this.rollQueue[this.rollIndex]!;
    this.rollIndex = (this.rollIndex + 1) % this.rollQueue.length;

    const ok = await this.ping(entry.path, entry.token, this.internalBaseUrl);
    this.stats.totalPings++;
    if (ok) {
      this.stats.successfulPings++;
    } else {
      this.stats.failedPings++;
    }
  }

  /** Returns true on HTTP 2xx, false on any error or non-2xx. */
  private async ping(
    path: string,
    token: string | undefined,
    baseUrl: string,
  ): Promise<boolean> {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Connection: "keep-alive",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const stayAliveService = StayAliveService.getInstance();
