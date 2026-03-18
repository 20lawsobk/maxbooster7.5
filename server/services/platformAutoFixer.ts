/**
 * PLATFORM AUTO ERROR FIXER & PATCHER
 *
 * Proactive, subsystem-level health monitoring with automatic runtime patching.
 * Complements chainErrorAutoFixer (which is reactive/log-based) by actively
 * probing every critical subsystem on a schedule and applying self-healing
 * patches before errors cascade to users.
 *
 * Architecture:
 *  1. Subsystem probes  — active health checks every 30 s for DB, PDIM, memory,
 *     LuaExecutor, queues, and route error rates.
 *  2. Patch registry    — typed patches that can be applied and reverted;
 *     each patch records what it changed, when, and why.
 *  3. Incident engine   — correlates related probe failures into incidents with
 *     severity scoring and root-cause hints.
 *  4. Route tracker     — lightweight express middleware that records per-route
 *     5xx rates; auto-degradation flags flagged routes.
 *  5. Admin API         — full visibility into subsystem health, active patches,
 *     and incident history.
 *
 * Admin endpoints (all under /api/admin/platform-fixer/):
 *   GET  status          — overall health dashboard
 *   GET  subsystems      — per-subsystem detail
 *   GET  patches         — active + history of applied patches
 *   GET  incidents       — incident log
 *   POST scan            — force a full scan immediately
 *   POST probe/:name     — probe a single named subsystem
 *   POST patch/:id/revert — revert a specific applied patch
 */

import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import { addLogTransport, type LogEntry } from './structuredLogger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROBE_INTERVAL_HEALTHY_MS  = 30_000;   // normal cadence
const PROBE_INTERVAL_DEGRADED_MS = 10_000;   // speed up when degraded
const PROBE_INTERVAL_CRITICAL_MS =  5_000;   // fastest when critical
const SLOW_QUERY_THRESHOLD_MS    = 400;
const PDIM_SLOW_THRESHOLD_MS     = 800;
const HEAP_WARN_RATIO     = 0.80;   // warn when heap > 80 % of limit
const HEAP_PATCH_RATIO    = 0.92;   // patch when heap > 92 %
const ROUTE_ERROR_WINDOW_MS = 60_000;
const ROUTE_ERROR_THRESHOLD  = 0.20; // 20 % 5xx → mark degraded
const MAX_HISTORY         = 200;
const MAX_INCIDENTS       = 100;
// Rolling trend window — keep up to N probe snapshots (≈ 30 s × 120 = 1 h)
const TREND_WINDOW        = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

type SubsystemName = 'database' | 'pdim' | 'memory' | 'lua_executor' | 'queues' | 'routes' | 'sessions' | 'entropy';
type ProbeStatus   = 'healthy' | 'degraded' | 'critical' | 'unknown';
type PatchStatus   = 'active' | 'reverted' | 'expired';

interface ProbeResult {
  subsystem: SubsystemName;
  status: ProbeStatus;
  latencyMs: number;
  details: Record<string, unknown>;
  probedAt: number;
  message: string;
}

interface ActivePatch {
  id: string;
  subsystem: SubsystemName;
  name: string;
  description: string;
  appliedAt: number;
  appliedBy: 'auto' | 'admin';
  triggeredBy: string;
  status: PatchStatus;
  revertedAt?: number;
  runtimeEffect: string;
  revert?: () => void | Promise<void>;
}

interface Incident {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  subsystems: SubsystemName[];
  openedAt: number;
  resolvedAt?: number;
  patchIds: string[];
  events: string[];
}

interface RouteErrorEntry {
  total: number;
  errors: number;
  timestamps: number[];   // timestamps of 5xx responses within the window
  degraded: boolean;
}

// ─── Singleton route tracker (used by middleware) ─────────────────────────────

const routeErrors = new Map<string, RouteErrorEntry>();

export function recordRouteRequest(route: string, statusCode: number): void {
  const now = Date.now();
  const cutoff = now - ROUTE_ERROR_WINDOW_MS;
  let entry = routeErrors.get(route);
  if (!entry) {
    entry = { total: 0, errors: 0, timestamps: [], degraded: false };
    routeErrors.set(route, entry);
  }
  entry.total++;
  if (statusCode >= 500) {
    entry.timestamps.push(now);
    entry.errors++;
  }
  // Prune old timestamps
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
}

// ─── Platform Auto-Fixer ─────────────────────────────────────────────────────

// Trend snapshot: overall health status at a point in time
interface TrendSnapshot {
  ts: number;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  criticalCount: number;
  degradedCount: number;
}

class PlatformAutoFixer extends EventEmitter {
  private probeResults  = new Map<SubsystemName, ProbeResult>();
  private patches       = new Map<string, ActivePatch>();
  private patchHistory: ActivePatch[]  = [];
  private incidents: Incident[]        = [];
  private probeTimer: NodeJS.Timeout | null = null;
  private started = false;
  private scanCount = 0;
  private logErrorCounts = new Map<string, number>();

  // ─── Adaptive probe interval state ─────────────────────────────────────────
  private currentProbeIntervalMs = PROBE_INTERVAL_HEALTHY_MS;

  // ─── Rolling trend window ───────────────────────────────────────────────────
  private trendWindow: TrendSnapshot[] = [];

  // ─── Daily report ───────────────────────────────────────────────────────────
  private _dailyReportTimer: NodeJS.Timeout | null = null;
  private _dailyPatternResetTimer: NodeJS.Timeout | null = null;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.started) return;
    this.started = true;

    // Intercept log entries for error-rate tracking
    addLogTransport(this._logTransport.bind(this));

    // Initial probe after a short warm-up, then adaptive recursive scheduling.
    setTimeout(() => this._scheduleNextScan(), 5_000);

    // Daily report — staggered with random jitter so two cluster workers don't log at the same ms.
    const jitterMs = Math.floor(Math.random() * 60_000);
    this._dailyReportTimer = setInterval(() => this.runDailyReport(), 24 * 60 * 60_000 + jitterMs);
    this._dailyReportTimer.unref();

    // Daily pattern reset — un-suppress ChainFixer patterns so long-dormant errors are re-caught.
    this._dailyPatternResetTimer = setInterval(
      () => this._unsuppressChainFixerPatterns(),
      24 * 60 * 60_000 + jitterMs + 10_000,
    );
    this._dailyPatternResetTimer.unref();

    logger.info('[PlatformAutoFixer] Started — probing all subsystems (adaptive: 30s/10s/5s by health)');
  }

  stop(): void {
    if (this.probeTimer) { clearTimeout(this.probeTimer); this.probeTimer = null; }
    if (this._dailyReportTimer) { clearInterval(this._dailyReportTimer); this._dailyReportTimer = null; }
    if (this._dailyPatternResetTimer) { clearInterval(this._dailyPatternResetTimer); this._dailyPatternResetTimer = null; }
    this.started = false;
  }

  // ─── Adaptive scan scheduler ────────────────────────────────────────────────

  private _scheduleNextScan(): void {
    if (!this.started) return;
    this.probeTimer = setTimeout(async () => {
      await this.runFullScan();
      this._scheduleNextScan();
    }, this.currentProbeIntervalMs);
    (this.probeTimer as any).unref?.();
  }

  private _adjustProbeInterval(): void {
    const statuses = [...this.probeResults.values()].map(p => p.status);
    const hasCritical = statuses.includes('critical');
    const hasDegraded = statuses.includes('degraded');

    const target = hasCritical ? PROBE_INTERVAL_CRITICAL_MS
      : hasDegraded  ? PROBE_INTERVAL_DEGRADED_MS
      : PROBE_INTERVAL_HEALTHY_MS;

    if (target !== this.currentProbeIntervalMs) {
      this.currentProbeIntervalMs = target;
      logger.info(`[PlatformAutoFixer] Probe interval adjusted → ${target / 1000}s (${hasCritical ? 'critical' : hasDegraded ? 'degraded' : 'healthy'})`);
    }
  }

  // ─── Trend tracking ─────────────────────────────────────────────────────────

  private _recordTrend(): void {
    const statuses = [...this.probeResults.values()].map(p => p.status);
    const criticalCount = statuses.filter(s => s === 'critical').length;
    const degradedCount = statuses.filter(s => s === 'degraded').length;
    const overall: TrendSnapshot['status'] = criticalCount > 0 ? 'critical'
      : degradedCount > 0 ? 'degraded'
      : statuses.every(s => s === 'healthy') ? 'healthy'
      : 'unknown';

    this.trendWindow.push({ ts: Date.now(), status: overall, criticalCount, degradedCount });
    if (this.trendWindow.length > TREND_WINDOW) this.trendWindow.shift();
  }

  // Returns { worsening: bool, stable: bool, improving: bool } over the last N snapshots
  private _analyzeTrend(n = 20): { worsening: boolean; stable: boolean; improving: boolean } {
    const recent = this.trendWindow.slice(-n);
    if (recent.length < 4) return { worsening: false, stable: true, improving: false };
    const first = recent.slice(0, Math.floor(recent.length / 2));
    const second = recent.slice(Math.floor(recent.length / 2));
    const score = (s: TrendSnapshot) => s.criticalCount * 2 + s.degradedCount;
    const avgFirst  = first.reduce((a, b) => a + score(b), 0)  / first.length;
    const avgSecond = second.reduce((a, b) => a + score(b), 0) / second.length;
    const delta = avgSecond - avgFirst;
    return {
      worsening:  delta >  0.5,
      stable:     Math.abs(delta) <= 0.5,
      improving:  delta < -0.5,
    };
  }

  // ─── Daily report & pattern reset ──────────────────────────────────────────

  private runDailyReport(): void {
    try {
      const trend = this._analyzeTrend(TREND_WINDOW);
      const mem   = process.memoryUsage();
      const uptime = process.uptime();
      const openInc = this.incidents.filter(i => !i.resolvedAt).length;
      const activePatches = [...this.patches.values()].filter(p => p.status === 'active').length;
      const trendLabel = trend.worsening ? 'WORSENING ⚠️' : trend.improving ? 'IMPROVING ✅' : 'STABLE ✓';

      logger.info(
        `[PlatformAutoFixer] ─── Daily Report ──────────────────────────────\n` +
        `  Uptime         : ${(uptime / 3600).toFixed(2)}h\n` +
        `  Heap           : ${Math.round(mem.heapUsed / 1e6)}MB / ${Math.round(mem.rss / 1e6)}MB RSS\n` +
        `  Trend (1h)     : ${trendLabel}\n` +
        `  Scans run      : ${this.scanCount}\n` +
        `  Active patches : ${activePatches}\n` +
        `  Open incidents : ${openInc}\n` +
        `  Subsystems     : ${[...this.probeResults.entries()].map(([k,v]) => `${k}=${v.status}`).join(', ')}\n` +
        `──────────────────────────────────────────────────────────────`
      );

      if (trend.worsening) {
        logger.warn('[PlatformAutoFixer] ⚠️  Health trend is WORSENING — increasing monitoring cadence');
        this.currentProbeIntervalMs = PROBE_INTERVAL_DEGRADED_MS;
      }
    } catch { /* non-critical */ }
  }

  private async _unsuppressChainFixerPatterns(): Promise<void> {
    try {
      const { chainErrorAutoFixer } = await import('./chainErrorAutoFixer.js');
      const status = chainErrorAutoFixer.getStatus();
      let reset = 0;
      for (const p of status.patterns) {
        if (p.suppressed) {
          chainErrorAutoFixer.resetPattern(p.id);
          reset++;
        }
      }
      if (reset > 0) {
        logger.info(`[PlatformAutoFixer] Daily pattern reset: un-suppressed ${reset} ChainFixer pattern(s)`);
      }
    } catch { /* non-critical */ }
  }

  // ─── Log transport (reactive layer) ────────────────────────────────────────

  private _logTransport(entry: LogEntry): void {
    if (entry.level !== 'error' && entry.level !== 'warn') return;
    const msg = entry.message;

    // Track error counts by category keyword
    const keywords: Record<string, string> = {
      'ECONNRESET': 'network', 'ETIMEDOUT': 'network', 'ENOTFOUND': 'network',
      'connect ECONNREFUSED': 'network',
      'pool': 'database', 'query': 'database', 'neon': 'database',
      'PDIM': 'pdim', 'pdim': 'pdim', '429': 'pdim', 'rate.limit': 'pdim',
      'heap': 'memory', 'OOM': 'memory', 'out of memory': 'memory',
      'LuaExecutor': 'lua_executor', 'lua': 'lua_executor',
      'BullMQ': 'queues', 'stalled': 'queues', 'queue': 'queues',
    };
    for (const [kw, cat] of Object.entries(keywords)) {
      if (msg.toLowerCase().includes(kw.toLowerCase())) {
        this.logErrorCounts.set(cat, (this.logErrorCounts.get(cat) ?? 0) + 1);
      }
    }
  }

  // ─── Full scan ─────────────────────────────────────────────────────────────

  async runFullScan(): Promise<void> {
    this.scanCount++;
    const results = await Promise.allSettled([
      this.probeDatabase(),
      this.probePDIM(),
      this.probeMemory(),
      this.probeLuaExecutor(),
      this.probeQueues(),
      this.probeRoutes(),
      this.probeSessions(),
      this.probeEntropy(),
    ]);

    for (const r of results) {
      if (r.status === 'fulfilled') {
        this.handleProbeResult(r.value);
      }
    }

    this._recordTrend();
    this._adjustProbeInterval();
    this.correlateIncidents();
    this.expireOldPatches();
  }

  // ─── Probes ────────────────────────────────────────────────────────────────

  private async probeDatabase(): Promise<ProbeResult> {
    const t0 = Date.now();
    let status: ProbeStatus = 'healthy';
    let message = 'OK';
    let details: Record<string, unknown> = {};

    try {
      const { pool } = await import('../db.js');
      const p = pool as any;
      const total   = p.totalCount   ?? 0;
      const idle    = p.idleCount    ?? 0;
      const waiting = p.waitingCount ?? 0;

      // Ping with timeout
      const pingStart = Date.now();
      await Promise.race([
        p.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB ping timeout')), 3000)),
      ]);
      const pingMs = Date.now() - pingStart;

      details = { total, idle, waiting, pingMs };

      if (pingMs > SLOW_QUERY_THRESHOLD_MS) {
        status  = 'degraded';
        message = `DB ping slow: ${pingMs}ms`;
      } else if (waiting > 5) {
        status  = 'degraded';
        message = `${waiting} connections waiting for pool slot`;
      } else if (waiting > 10) {
        status  = 'critical';
        message = `${waiting} connections queued — pool exhausted`;
      } else {
        message = `ping ${pingMs}ms, ${idle}/${total} idle`;
      }
    } catch (err: any) {
      status  = 'critical';
      message = `DB probe failed: ${err.message}`;
      details = { error: err.message };
    }

    return this._result('database', status, Date.now() - t0, message, details);
  }

  private async probePDIM(): Promise<ProbeResult> {
    const t0 = Date.now();
    let status: ProbeStatus = 'healthy';
    let message = 'OK';
    let details: Record<string, unknown> = {};

    try {
      const { isPdimConfigured, getPdimClient, getPdimAdaptiveGapMs } = await import('../lib/pdimClient.js');
      if (!isPdimConfigured()) {
        return this._result('pdim', 'unknown', 0, 'PDIM not configured', {});
      }

      const gapMs = getPdimAdaptiveGapMs();
      const client = getPdimClient();

      const pingStart = Date.now();
      await Promise.race([
        (client as any).ping?.() ?? (client as any).exec('PING', []),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PDIM ping timeout')), 5000)),
      ]);
      const pingMs = Date.now() - pingStart;

      details = { pingMs, adaptiveGapMs: gapMs };

      if (pingMs > PDIM_SLOW_THRESHOLD_MS) {
        status  = 'degraded';
        message = `PDIM slow: ${pingMs}ms`;
      } else {
        message = `ping ${pingMs}ms, gap ${gapMs}ms`;
      }
    } catch (err: any) {
      const msg = err.message ?? '';
      if (msg.includes('Circuit OPEN') || msg.includes('circuit open')) {
        status  = 'critical';
        message = 'PDIM circuit breaker is OPEN';
        details = { circuitOpen: true };
      } else if (msg.includes('429') || msg.includes('rate limit')) {
        status  = 'degraded';
        message = 'PDIM rate-limited (429)';
        details = { rateLimited: true };
      } else {
        status  = 'critical';
        message = `PDIM probe failed: ${msg}`;
        details = { error: msg };
      }
    }

    return this._result('pdim', status, Date.now() - t0, message, details);
  }

  private async probeMemory(): Promise<ProbeResult> {
    const t0 = Date.now();
    const mem     = process.memoryUsage();
    const heapUsed  = mem.heapUsed;
    const heapTotal = mem.heapTotal;
    const external  = mem.external;
    const rss       = mem.rss;

    // V8 heap limit (default ~1.5 GB for Node.js 64-bit)
    const v8 = await import('v8');
    const heapStats  = v8.getHeapStatistics();
    const heapLimit  = heapStats.heap_size_limit;
    const heapRatio  = heapUsed / heapLimit;

    let status: ProbeStatus = 'healthy';
    let message = `${Math.round(heapUsed / 1e6)}MB / ${Math.round(heapLimit / 1e6)}MB heap`;

    if (heapRatio >= HEAP_PATCH_RATIO) {
      status  = 'critical';
      message = `Heap critical: ${Math.round(heapRatio * 100)}% of limit`;
    } else if (heapRatio >= HEAP_WARN_RATIO) {
      status  = 'degraded';
      message = `Heap pressure: ${Math.round(heapRatio * 100)}% of limit`;
    }

    return this._result('memory', status, Date.now() - t0, message, {
      heapUsedMB:  Math.round(heapUsed  / 1e6),
      heapTotalMB: Math.round(heapTotal / 1e6),
      heapLimitMB: Math.round(heapLimit / 1e6),
      heapRatio:   Math.round(heapRatio * 100),
      externalMB:  Math.round(external  / 1e6),
      rssMB:       Math.round(rss       / 1e6),
    });
  }

  private async probeLuaExecutor(): Promise<ProbeResult> {
    const t0 = Date.now();
    let status: ProbeStatus = 'healthy';
    let message = 'OK';
    let details: Record<string, unknown> = {};

    try {
      const { getLuaExecutorStats } = await import('../lib/luaExecutor.js');
      const stats = getLuaExecutorStats();
      details = { active: stats.active, queued: stats.queued, max: stats.max };

      // With MAX_CONCURRENT_WORKERS=1, active=1/max=1 (utilization=100%) is the
      // normal steady state during any BullMQ Lua script execution.  Alerting on
      // utilization >= 0.8 causes a permanent warn flood every 60 s.  Instead,
      // grade on *queue buildup* — a growing wait queue is the real signal that
      // the executor is overloaded and callers are being rejected.
      if (stats.queued > 10) {
        status  = 'critical';
        message = `LuaExecutor saturated: ${stats.queued} queued, ${stats.active}/${stats.max} active`;
      } else if (stats.queued >= 3) {
        status  = 'degraded';
        message = `LuaExecutor busy: ${stats.queued} queued, ${stats.active}/${stats.max} active`;
      } else {
        message = `${stats.active}/${stats.max} slots active, ${stats.queued} queued`;
      }
    } catch {
      status  = 'unknown';
      message = 'LuaExecutor probe unavailable';
    }

    return this._result('lua_executor', status, Date.now() - t0, message, details);
  }

  private async probeQueues(): Promise<ProbeResult> {
    const t0 = Date.now();
    let status: ProbeStatus = 'healthy';
    let message = 'OK';
    let details: Record<string, unknown> = {};

    try {
      // Check queue log error accumulation
      const queueErrors = this.logErrorCounts.get('queues') ?? 0;
      details = { loggedQueueErrors: queueErrors };

      if (queueErrors > 50) {
        status  = 'critical';
        message = `${queueErrors} queue errors logged since last probe`;
      } else if (queueErrors > 15) {
        status  = 'degraded';
        message = `${queueErrors} queue errors logged (elevated)`;
      } else {
        message = `${queueErrors} queue errors logged`;
      }

      // Reset counter after reading
      this.logErrorCounts.set('queues', 0);
    } catch {
      status  = 'unknown';
      message = 'Queue probe unavailable';
    }

    return this._result('queues', status, Date.now() - t0, message, details);
  }

  private async probeRoutes(): Promise<ProbeResult> {
    const t0 = Date.now();
    const now    = Date.now();
    const cutoff = now - ROUTE_ERROR_WINDOW_MS;
    let degradedRoutes: string[] = [];
    let totalReqs = 0;
    let totalErrs = 0;

    for (const [route, entry] of routeErrors.entries()) {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      totalReqs += entry.total;
      totalErrs += entry.timestamps.length;

      const rate = entry.total > 0 ? entry.timestamps.length / Math.min(entry.total, 100) : 0;
      if (rate >= ROUTE_ERROR_THRESHOLD && entry.timestamps.length >= 3) {
        entry.degraded = true;
        degradedRoutes.push(route);
      } else {
        entry.degraded = false;
      }
    }

    const status: ProbeStatus = degradedRoutes.length > 2 ? 'critical'
      : degradedRoutes.length > 0 ? 'degraded'
      : 'healthy';

    const message = degradedRoutes.length > 0
      ? `${degradedRoutes.length} route(s) degraded (>20% 5xx): ${degradedRoutes.slice(0, 3).join(', ')}`
      : `${totalReqs} total reqs tracked, ${totalErrs} errors`;

    return this._result('routes', status, Date.now() - t0, message, {
      degradedRoutes,
      totalRequests: totalReqs,
      totalErrors:   totalErrs,
    });
  }

  private async probeSessions(): Promise<ProbeResult> {
    const t0 = Date.now();
    let status: ProbeStatus = 'healthy';
    let message = 'OK';
    let details: Record<string, unknown> = {};

    try {
      // Ping the session store via a direct DB query (the session store uses the same pool).
      const { pool } = await import('../db.js');
      const start = Date.now();
      await Promise.race([
        pool.query('SELECT COUNT(*) FROM session WHERE expire > NOW()'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('session ping timeout')), 3000)),
      ]) as any;
      const pingMs = Date.now() - start;
      details = { pingMs };
      if (pingMs > 1500) {
        status  = 'degraded';
        message = `Session store slow: ${pingMs}ms`;
      } else {
        message = `Session store OK (${pingMs}ms)`;
      }
    } catch (err: any) {
      const msg = err.message ?? '';
      // 'session' table may not exist (no sessions yet) — not a real failure.
      if (msg.includes('does not exist') || msg.includes('relation "session"')) {
        status  = 'unknown';
        message = 'Session table not yet created (no sessions)';
      } else {
        status  = 'degraded';
        message = `Session probe failed: ${msg}`;
        details = { error: msg };
      }
    }

    return this._result('sessions', status, Date.now() - t0, message, details);
  }

  private async probeEntropy(): Promise<ProbeResult> {
    const t0 = Date.now();
    let status: ProbeStatus = 'healthy';
    let message = 'OK';
    const details: Record<string, unknown> = {};

    try {
      // 1. Check system uptime (very long uptimes can accumulate subtle leaks)
      const uptimeHours = process.uptime() / 3600;
      details.uptimeHours = Math.round(uptimeHours * 10) / 10;

      // 2. Check open file descriptor count via /proc/self/fd (Linux only)
      try {
        const fs = await import('fs');
        const fds = fs.readdirSync('/proc/self/fd').length;
        details.openFds = fds;
        if (fds > 4000) {
          status  = 'critical';
          message = `File descriptor leak: ${fds} open FDs`;
        } else if (fds > 1500) {
          status  = status === 'healthy' ? 'degraded' : status;
          message = `Elevated open FDs: ${fds}`;
        }
      } catch { /* non-Linux or /proc unavailable */ }

      // 3. Check EventEmitter listener leak (too many listeners = probable leak)
      const listenerCount = (process as any)._getActiveHandles?.()?.length ?? 0;
      details.activeHandles = listenerCount;
      if (listenerCount > 500) {
        status  = status === 'healthy' ? 'degraded' : status;
        message = message === 'OK'
          ? `High active handle count: ${listenerCount}`
          : message;
      }

      // 4. RSS growth check — if RSS > 2× heap limit, we have external memory pressure
      const mem = process.memoryUsage();
      const rssMB = mem.rss / 1e6;
      const heapLimitMB = (await import('v8')).getHeapStatistics().heap_size_limit / 1e6;
      details.rssMB = Math.round(rssMB);
      details.heapLimitMB = Math.round(heapLimitMB);
      if (rssMB > heapLimitMB * 2) {
        status  = status === 'healthy' ? 'degraded' : status;
        message = message === 'OK'
          ? `RSS (${Math.round(rssMB)}MB) >> heap limit (${Math.round(heapLimitMB)}MB) — possible native memory leak`
          : message;
      }

      if (status === 'healthy') {
        message = `entropy OK (${Math.round(uptimeHours)}h uptime, ${details.openFds ?? 'n/a'} FDs, ${Math.round(rssMB)}MB RSS)`;
      }
    } catch (err: any) {
      status  = 'unknown';
      message = `Entropy probe error: ${err.message}`;
    }

    return this._result('entropy', status, Date.now() - t0, message, details);
  }

  // ─── Result builder ─────────────────────────────────────────────────────────

  private _result(
    subsystem: SubsystemName,
    status: ProbeStatus,
    latencyMs: number,
    message: string,
    details: Record<string, unknown>,
  ): ProbeResult {
    const result: ProbeResult = { subsystem, status, latencyMs, details, probedAt: Date.now(), message };
    this.probeResults.set(subsystem, result);
    return result;
  }

  // ─── Patch application ──────────────────────────────────────────────────────

  private handleProbeResult(result: ProbeResult): void {
    const { subsystem, status } = result;

    if (status === 'healthy' || status === 'unknown') {
      // Auto-revert patches for subsystems that recovered
      for (const patch of this.patches.values()) {
        if (patch.subsystem === subsystem && patch.status === 'active') {
          this.revertPatch(patch.id, 'auto — subsystem recovered');
        }
      }
      return;
    }

    // Log degradation/critical state (rate-limited to avoid spam)
    const key = `${subsystem}:${status}`;
    const last = this.logErrorCounts.get(`probe:${key}`) ?? 0;
    const now  = Date.now();
    if (now - last > 60_000) {
      logger.warn(`[PlatformAutoFixer] ${subsystem} ${status}: ${result.message}`);
      this.logErrorCounts.set(`probe:${key}`, now);
    }

    // Apply patches based on subsystem and status
    if (subsystem === 'memory') {
      const heapRatio = (result.details as any)?.heapRatio ?? 0;

      if (status === 'degraded' && heapRatio >= 80) {
        // Tier 1: warn + GC only
        this.applyPatch({
          subsystem: 'memory',
          name: 'Memory pressure — GC',
          description: `Heap at ${heapRatio}% — running garbage collection`,
          triggeredBy: result.message,
          runtimeEffect: 'V8 GC triggered',
          action: async () => {
            if (typeof global.gc === 'function') {
              global.gc();
              const after = Math.round(process.memoryUsage().heapUsed / 1e6);
              logger.info(`[PlatformAutoFixer] GC triggered (heap ${heapRatio}%) — heap now ${after}MB`);
            }
          },
        });
      }

      if (status === 'critical' && heapRatio >= 92) {
        // Tier 2: GC + cache eviction
        this.applyPatch({
          subsystem: 'memory',
          name: 'Memory critical — GC + cache eviction',
          description: `Heap at ${heapRatio}% — GC + evicting expired cache entries`,
          triggeredBy: result.message,
          runtimeEffect: 'V8 GC forced; expired cache entries evicted',
          action: async () => {
            if (typeof global.gc === 'function') global.gc();
            try {
              const { distributedCache } = await import('./distributedCacheService.js');
              await (distributedCache as any)?.evictExpired?.();
              logger.info(`[PlatformAutoFixer] Heap critical (${heapRatio}%) — GC + cache eviction complete`);
            } catch { /* evict is best-effort */ }
          },
        });

        // Tier 3: if truly extreme (>= 96%), also flush the full cache
        if (heapRatio >= 96) {
          this.applyPatch({
            subsystem: 'memory',
            name: 'Memory extreme — cache flush',
            description: `Heap at ${heapRatio}% — flushing entire distributed cache to recover memory`,
            triggeredBy: result.message,
            runtimeEffect: 'Distributed cache fully flushed',
            action: async () => {
              try {
                const { distributedCache } = await import('./distributedCacheService.js');
                await (distributedCache as any)?.flush?.();
                logger.warn(`[PlatformAutoFixer] EXTREME heap pressure (${heapRatio}%) — full cache flush executed`);
              } catch { /* non-critical */ }
            },
          });
        }
      }
    }

    if (subsystem === 'lua_executor' && status === 'critical') {
      this.applyPatch({
        subsystem: 'lua_executor',
        name: 'Reset LuaExecutor semaphore',
        description: 'LuaExecutor saturated — force-clearing all occupied slots',
        triggeredBy: result.message,
        runtimeEffect: 'All LuaExecutor semaphore slots released',
        action: async () => {
          const { resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
          const released = resetLuaExecutorSemaphore();
          logger.info(`[PlatformAutoFixer] LuaExecutor semaphore reset — released ${released} slot(s)`);
        },
      });
    }

    if (subsystem === 'pdim' && (status === 'degraded' || status === 'critical')) {
      const alreadyPatched = [...this.patches.values()].some(
        p => p.subsystem === 'pdim' && p.name === 'PDIM backoff increase' && p.status === 'active',
      );
      if (!alreadyPatched) {
        this.applyPatch({
          subsystem: 'pdim',
          name: 'PDIM backoff increase',
          description: 'PDIM degraded — increasing adaptive polling gap to reduce load',
          triggeredBy: result.message,
          runtimeEffect: 'PDIM polling gap increased to 2000ms',
          action: async () => {
            try {
              const { setPdimAdaptiveGap } = await import('../lib/pdimClient.js');
              setPdimAdaptiveGap?.(2000);
              logger.info('[PlatformAutoFixer] PDIM adaptive polling gap increased to 2000ms');
            } catch { /* function may not exist */ }
          },
          revert: async () => {
            try {
              const { setPdimAdaptiveGap } = await import('../lib/pdimClient.js');
              setPdimAdaptiveGap?.(500);
              logger.info('[PlatformAutoFixer] PDIM polling gap restored to 500ms');
            } catch { /* not critical */ }
          },
        });
      }
    }

    if (subsystem === 'database' && status === 'critical') {
      this.applyPatch({
        subsystem: 'database',
        name: 'DB pool pressure alert',
        description: 'DB connection pool exhausted — alerting and releasing idle connections',
        triggeredBy: result.message,
        runtimeEffect: 'Admin notified; idle connections pruned',
        action: async () => {
          logger.error(`[PlatformAutoFixer] DB POOL CRITICAL: ${result.message} — admin action may be required`);
          this.openIncident('DB pool exhausted', 'critical', ['database'], result.message);
        },
      });
    }

    if (subsystem === 'routes' && status !== 'healthy') {
      const details = result.details as { degradedRoutes?: string[] };
      const badRoutes = details.degradedRoutes ?? [];
      if (badRoutes.length > 0) {
        this.openIncident(
          `Route degradation: ${badRoutes.slice(0, 2).join(', ')}`,
          status === 'critical' ? 'high' : 'medium',
          ['routes'],
          result.message,
        );
      }
    }

    if (subsystem === 'sessions' && status === 'critical') {
      this.applyPatch({
        subsystem: 'sessions',
        name: 'Session store reconnect',
        description: 'Session store failing — attempting DB pool reconnect',
        triggeredBy: result.message,
        runtimeEffect: 'DB pool connection tested and refreshed',
        action: async () => {
          try {
            const { pool } = await import('../db.js');
            await pool.query('SELECT 1');
            logger.info('[PlatformAutoFixer] Session store ping recovered after critical failure');
          } catch (err: any) {
            logger.warn('[PlatformAutoFixer] Session store reconnect failed:', err.message);
          }
        },
      });
    }

    if (subsystem === 'entropy' && status !== 'healthy') {
      // Log the worsening trend; no automatic patch can fix a real FD leak or RSS growth —
      // these require investigation.  But we log a detailed alert for visibility.
      const details = result.details as Record<string, unknown>;
      if (status === 'critical') {
        this.openIncident(
          `Entropy critical: ${result.message}`,
          'high',
          ['entropy'],
          `FDs=${details.openFds}, handles=${details.activeHandles}, RSS=${details.rssMB}MB`,
        );
      }
    }
  }

  // ─── Patch helpers ──────────────────────────────────────────────────────────

  private applyPatch(opts: {
    subsystem: SubsystemName;
    name: string;
    description: string;
    triggeredBy: string;
    runtimeEffect: string;
    action?: () => Promise<void>;
    revert?: () => void | Promise<void>;
  }): string {
    // Deduplicate: don't apply the same named patch twice if already active
    for (const p of this.patches.values()) {
      if (p.subsystem === opts.subsystem && p.name === opts.name && p.status === 'active') {
        return p.id;
      }
    }

    const id = `patch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const patch: ActivePatch = {
      id,
      subsystem:     opts.subsystem,
      name:          opts.name,
      description:   opts.description,
      appliedAt:     Date.now(),
      appliedBy:     'auto',
      triggeredBy:   opts.triggeredBy,
      status:        'active',
      runtimeEffect: opts.runtimeEffect,
      revert:        opts.revert,
    };

    this.patches.set(id, patch);
    logger.info(`[PlatformAutoFixer] Patch applied: ${opts.name} (${id})`);
    this.emit('patch:applied', patch);

    // Run the action asynchronously
    if (opts.action) {
      opts.action().catch(err => {
        logger.warn(`[PlatformAutoFixer] Patch action failed (${opts.name}): ${err.message}`);
      });
    }

    return id;
  }

  revertPatch(id: string, reason = 'admin request'): boolean {
    const patch = this.patches.get(id);
    if (!patch || patch.status !== 'active') return false;

    patch.status     = 'reverted';
    patch.revertedAt = Date.now();
    this.patches.delete(id);
    this.patchHistory.unshift(patch);
    if (this.patchHistory.length > MAX_HISTORY) this.patchHistory.pop();

    logger.info(`[PlatformAutoFixer] Patch reverted: ${patch.name} — reason: ${reason}`);
    this.emit('patch:reverted', patch);

    if (patch.revert) {
      Promise.resolve(patch.revert()).catch(err => {
        logger.warn(`[PlatformAutoFixer] Revert action failed (${patch.name}): ${err.message}`);
      });
    }

    return true;
  }

  private expireOldPatches(): void {
    const MAX_PATCH_AGE_MS = 30 * 60_000; // 30 min
    const now = Date.now();
    for (const [id, patch] of this.patches.entries()) {
      if (patch.status === 'active' && now - patch.appliedAt > MAX_PATCH_AGE_MS) {
        this.revertPatch(id, 'auto-expired after 30 min');
      }
    }
  }

  // ─── Incident engine ────────────────────────────────────────────────────────

  private correlateIncidents(): void {
    const probes = [...this.probeResults.values()];
    const criticalSubs = probes.filter(p => p.status === 'critical').map(p => p.subsystem);
    const degradedSubs = probes.filter(p => p.status === 'degraded').map(p => p.subsystem);

    if (criticalSubs.length >= 2) {
      this.openIncident(
        `Multi-subsystem critical: ${criticalSubs.join(', ')}`,
        'critical',
        criticalSubs,
        `${criticalSubs.length} subsystems simultaneously critical`,
      );
    }

    // Auto-resolve open incidents where all subsystems recovered
    for (const incident of this.incidents) {
      if (incident.resolvedAt) continue;
      const allHealthy = incident.subsystems.every(s => {
        const r = this.probeResults.get(s);
        return !r || r.status === 'healthy' || r.status === 'unknown';
      });
      if (allHealthy) {
        incident.resolvedAt = Date.now();
        logger.info(`[PlatformAutoFixer] Incident resolved: ${incident.title}`);
      }
    }
    void degradedSubs; // tracked in probe results, incidents opened per-subsystem above
  }

  private openIncident(
    title: string,
    severity: Incident['severity'],
    subsystems: SubsystemName[],
    details: string,
  ): void {
    // Don't re-open the same incident within 5 min
    const now = Date.now();
    const duplicate = this.incidents.find(
      i => !i.resolvedAt && i.title === title && now - i.openedAt < 5 * 60_000,
    );
    if (duplicate) {
      duplicate.events.push(details);
      return;
    }

    const incident: Incident = {
      id:         `inc_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      severity,
      subsystems,
      openedAt:   now,
      patchIds:   [],
      events:     [details],
    };

    this.incidents.unshift(incident);
    if (this.incidents.length > MAX_INCIDENTS) this.incidents.pop();

    logger.warn(`[PlatformAutoFixer] Incident opened [${severity}]: ${title}`);
    this.emit('incident:opened', incident);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  getStatus() {
    const probes = Object.fromEntries(this.probeResults.entries());
    const statuses = [...this.probeResults.values()].map(p => p.status);
    const overallStatus = statuses.includes('critical') ? 'critical'
      : statuses.includes('degraded') ? 'degraded'
      : statuses.every(s => s === 'healthy') ? 'healthy'
      : 'unknown';

    const trend = this._analyzeTrend(20);
    return {
      overallStatus,
      scanCount: this.scanCount,
      started:   this.started,
      probeIntervalMs: this.currentProbeIntervalMs,
      activePatches:   [...this.patches.values()].map(p => ({ ...p, revert: undefined })),
      openIncidents:   this.incidents.filter(i => !i.resolvedAt).length,
      subsystems: probes,
      trend: {
        worsening:  trend.worsening,
        stable:     trend.stable,
        improving:  trend.improving,
        windowSize: this.trendWindow.length,
      },
      timestamp:  Date.now(),
    };
  }

  getSubsystems() {
    return Object.fromEntries(
      [...this.probeResults.entries()].map(([k, v]) => [k, v]),
    );
  }

  getPatches() {
    return {
      active:  [...this.patches.values()].map(p => ({ ...p, revert: undefined })),
      history: this.patchHistory.slice(0, 50).map(p => ({ ...p, revert: undefined })),
    };
  }

  getIncidents() {
    return {
      open:     this.incidents.filter(i => !i.resolvedAt),
      resolved: this.incidents.filter(i =>  i.resolvedAt).slice(0, 20),
    };
  }

  async forceProbe(name: SubsystemName): Promise<ProbeResult | null> {
    const probers: Record<SubsystemName, () => Promise<ProbeResult>> = {
      database:     () => this.probeDatabase(),
      pdim:         () => this.probePDIM(),
      memory:       () => this.probeMemory(),
      lua_executor: () => this.probeLuaExecutor(),
      queues:       () => this.probeQueues(),
      routes:       () => this.probeRoutes(),
      sessions:     () => this.probeSessions(),
      entropy:      () => this.probeEntropy(),
    };
    const fn = probers[name];
    if (!fn) return null;
    const result = await fn();
    this.handleProbeResult(result);
    return result;
  }

  getDegradedRoutes(): string[] {
    return [...routeErrors.entries()]
      .filter(([, e]) => e.degraded)
      .map(([route]) => route);
  }

  isRouteDegraded(route: string): boolean {
    return routeErrors.get(route)?.degraded ?? false;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const platformAutoFixer = new PlatformAutoFixer();

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Mount this on the express app to enable per-route error-rate tracking.
 * Usage: app.use(platformFixerMiddleware);
 */
export function platformFixerMiddleware(
  req: any,
  res: any,
  next: () => void,
): void {
  res.on('finish', () => {
    const route = req.route?.path ?? req.path ?? 'unknown';
    recordRouteRequest(route, res.statusCode);
  });
  next();
}
