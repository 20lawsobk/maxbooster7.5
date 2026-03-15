/**
 * CHAIN ERROR AUTO-FIXER
 *
 * Real-time detection and automatic recovery for server-crippling error chains.
 *
 * Architecture:
 *  1. Hooks into the structured logger as a transport — intercepts every
 *     error/warn message the moment it is emitted, before it hits disk.
 *  2. Also installs a pre-handler on process.uncaughtException and
 *     process.unhandledRejection so it can absorb well-known non-fatal
 *     errors before the default graceful-shutdown handler fires.
 *  3. Runs a periodic health check (every 15 s) to catch silent degradation
 *     (stuck LuaExecutor semaphore, memory pressure, etc.).
 *
 * Each error pattern has:
 *  - A regex (or array of regexes) matched against the log message
 *  - A cooldown so the same fix is not triggered more than once per window
 *  - A max-attempts ceiling; beyond that the pattern is escalated (logged
 *    once to PDIM) then suppressed so it stops spamming
 *  - An async autoFix() that applies the recovery action
 */

import { EventEmitter } from 'events';
import { addLogTransport, type LogEntry } from './structuredLogger.ts';
import { logger } from '../logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface ErrorPattern {
  id: string;
  name: string;
  description: string;
  matchers: RegExp[];
  levels: Array<'error' | 'warn' | 'info'>;
  severity: Severity;
  category: string;
  cooldownMs: number;
  maxAttempts: number;
  autoFix: (triggeredBy: string) => Promise<void>;
  escalate?: (attempts: number) => Promise<void>;
}

interface PatternState {
  lastFix: number;
  attempts: number;
  suppressed: boolean;
  successCount: number;
  failCount: number;
  lastMessage: string;
  lastFixResult: 'success' | 'failed' | 'pending' | 'suppressed' | 'none';
}

interface FixHistoryEntry {
  patternId: string;
  patternName: string;
  triggeredAt: number;
  triggeredBy: string;
  result: 'success' | 'failed' | 'suppressed' | 'escalated';
  attemptNumber: number;
}

// ─── Chain Error Auto-Fixer ──────────────────────────────────────────────────

class ChainErrorAutoFixer extends EventEmitter {
  private patterns: ErrorPattern[] = [];
  private state = new Map<string, PatternState>();
  private history: FixHistoryEntry[] = [];
  private readonly MAX_HISTORY = 100;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private started = false;
  // Heap warning cooldown — GC still fires every 15 s to keep memory contained,
  // but the WARN log is suppressed to once per 5 min so it doesn't flood.
  private _lastHeapWarnMs = 0;
  private readonly _HEAP_WARN_COOLDOWN_MS = 5 * 60 * 1000;

  constructor() {
    super();
    this.registerPatterns();
  }

  // ─── Pattern Registry ──────────────────────────────────────────────────────

  private registerPatterns(): void {

    // 1. BullMQ stalled.forEach — LuaExecutor returns non-array from PDIM
    this.addPattern({
      id: 'bullmq_stalled_foreach',
      name: 'BullMQ stalled.forEach TypeError',
      description: 'BullMQ stalled-job Lua script returns a non-array from PDIM/wasmoon',
      matchers: [/stalled\.forEach is not a function/i],
      levels: ['error'],
      severity: 'medium',
      category: 'queue',
      cooldownMs: 45_000,
      maxAttempts: 20,
      autoFix: async () => {
        const { resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
        const released = resetLuaExecutorSemaphore();
        logger.info(`[ChainFixer] LuaExecutor semaphore reset — released ${released} stuck slot(s)`);
      },
      escalate: async (attempts) => {
        logger.warn(`[ChainFixer] bullmq_stalled_foreach suppressed after ${attempts} fix attempts — PDIM Lua stalled check is known non-fatal; server continues normally`);
      },
    });

    // 2. BullMQ null.then — repeatable job registration fails via LuaExecutor
    this.addPattern({
      id: 'bullmq_null_then',
      name: 'BullMQ null.then (repeatable job registration)',
      description: 'Autonomous job scheduler fails to register repeatable jobs; retried automatically',
      matchers: [
        /Cannot read properties of null \(reading ['"]then['"]\)/i,
        /AUTONOMOUS.*Failed to register repeatable/i,
      ],
      levels: ['error'],
      severity: 'high',
      category: 'queue',
      cooldownMs: 60_000,
      maxAttempts: 8,
      autoFix: async () => {
        await new Promise(r => setTimeout(r, 3_000));
        try {
          const { setupRepeatableJobs } = await import('./autonomousJobScheduler.js');
          await setupRepeatableJobs();
          logger.info('[ChainFixer] Repeatable jobs re-registered successfully');
        } catch (err: any) {
          logger.warn(`[ChainFixer] Repeatable job re-registration attempt failed: ${err.message}`);
          throw err;
        }
      },
      escalate: async (attempts) => {
        logger.warn(`[ChainFixer] bullmq_null_then escalated after ${attempts} attempts — autonomous repeatable jobs unavailable; non-critical features affected`);
      },
    });

    // 3. DatabaseLogTransport buffer overflow
    this.addPattern({
      id: 'db_log_overflow',
      name: 'DatabaseLogTransport buffer overflow',
      description: 'System log DB insert backlog too large; oldest entries dropped',
      matchers: [/Buffer overflow, dropping oldest logs/i],
      levels: ['warn', 'info'],
      severity: 'medium',
      category: 'database',
      cooldownMs: 30_000,
      maxAttempts: 50,
      autoFix: async () => {
        const { getDatabaseLogTransport } = await import('./databaseLogTransport.js');
        const transport = getDatabaseLogTransport();
        if (transport) {
          const dropped = transport.clearBuffer();
          logger.info(`[ChainFixer] DatabaseLogTransport buffer cleared — discarded ${dropped} stale entries to stop retry storm`);
        }
      },
    });

    // 4. PocketFabric init failure
    this.addPattern({
      id: 'pocket_fabric_init',
      name: 'PocketFabric initialization failure',
      description: 'Distributed PDIM fabric failed to start; retried automatically',
      matchers: [/PocketFabric.*Fabric init.*Cannot read properties of undefined/i],
      levels: ['warn'],
      severity: 'medium',
      category: 'storage',
      cooldownMs: 45_000,
      maxAttempts: 5,
      autoFix: async () => {
        await new Promise(r => setTimeout(r, 5_000));
        try {
          const { initializeFabric } = await import('../pocket-dimension/fabric/index.js');
          await initializeFabric();
          logger.info('[ChainFixer] PocketFabric re-initialized successfully');
        } catch (err: any) {
          logger.warn(`[ChainFixer] PocketFabric re-init failed: ${err.message}`);
          throw err;
        }
      },
      escalate: async () => {
        logger.warn('[ChainFixer] PocketFabric persistently failing — distributed fabric unavailable; local PDIM still active');
      },
    });

    // 5. LuaExecutor slot timeout (semaphore deadlock)
    this.addPattern({
      id: 'lua_executor_timeout',
      name: 'LuaExecutor worker slot timeout',
      description: 'All 6 LuaExecutor worker slots are occupied; new calls are timing out',
      matchers: [/LuaExecutor.*Timeout waiting for worker slot/i],
      levels: ['error'],
      severity: 'high',
      category: 'queue',
      cooldownMs: 10_000,
      maxAttempts: 30,
      autoFix: async () => {
        const { resetLuaExecutorSemaphore, getLuaExecutorStats } = await import('../lib/luaExecutor.js');
        const before = getLuaExecutorStats();
        const released = resetLuaExecutorSemaphore();
        logger.info(`[ChainFixer] LuaExecutor semaphore force-reset: ${before.active} active → 0, released ${released} slot(s), queue drained`);
      },
    });

    // 6. PDIM circuit breaker OPEN
    this.addPattern({
      id: 'pdim_circuit_open',
      name: 'PDIM circuit breaker opened',
      description: 'PDIM HTTP endpoint is unreachable; circuit is OPEN, falling back to PostgreSQL',
      matchers: [/\[PDIM\] Circuit OPEN/i],
      levels: ['warn'],
      severity: 'high',
      category: 'storage',
      cooldownMs: 20_000,
      maxAttempts: 50,
      autoFix: async () => {
        logger.info('[ChainFixer] PDIM circuit OPEN detected — session/cache fallback to PostgreSQL active; PDIM circuit breaker will auto-probe on next request');
      },
    });

    // 7. Slow query sustained (3+ occurrences in window — DB under pressure)
    // NOTE: autoFix deliberately does NOT call distributedCache.flush() here.
    // These slow queries are on autopilot_learning_data with no indexes (DB at
    // 512MB Neon limit — can't add indexes).  A cache flush would send a
    // FLUSHDB command to PDIM at the exact same moment HyperLearning cycle
    // ends and BullMQ pollers resume — triggering the synchronized 429 burst
    // that this fixer exists to prevent.  Logging only is the correct response.
    this.addPattern({
      id: 'sustained_slow_queries',
      name: 'Sustained slow database queries',
      description: 'Database query latency exceeding 300ms — expected under Neon connection-limit with no additional indexes available',
      matchers: [/Slow query detected \(\d{3,}ms\)/i],
      levels: ['warn'],
      severity: 'low',
      category: 'database',
      cooldownMs: 300_000,
      maxAttempts: 100,
      autoFix: async () => {
        // Intentionally no PDIM/cache interaction — see comment above.
        logger.info('[ChainFixer] Slow query pattern acknowledged (autopilot_learning_data, no indexes available) — no corrective action');
      },
    });

    // 7b. PDIM 429 rate-limit burst — acknowledge + suppress repeat noise
    // exec() already applies an exponential backoff when 429 is received and
    // logs only the first occurrence per window.  This pattern provides a
    // ChainFixer-level acknowledgement, resets the LuaExecutor semaphore
    // (often stuck when 429s cascade through Lua script redis.call()s), and
    // suppresses subsequent ChainFixer triggers until the next cooldown window.
    this.addPattern({
      id: 'pdim_rate_limit_429',
      name: 'PDIM HTTP 429 rate-limit burst',
      description: 'PDIM returned 429 — global rate-limit backoff applied automatically; LuaExecutor semaphore reset to clear any stuck slots',
      matchers: [/PDIM HTTP 429/i, /exec error.*429/i],
      levels: ['error', 'warn'],
      severity: 'medium',
      category: 'storage',
      cooldownMs: 60_000,
      maxAttempts: 50,
      autoFix: async () => {
        try {
          const { resetLuaExecutorSemaphore, getLuaExecutorStats } = await import('../lib/luaExecutor.js');
          const stats = getLuaExecutorStats();
          if (stats.active > 0 || stats.queued > 0) {
            const released = resetLuaExecutorSemaphore();
            logger.info(`[ChainFixer] 429 detected — LuaExecutor semaphore reset: active=${stats.active} queued=${stats.queued} released=${released}`);
          } else {
            logger.info('[ChainFixer] 429 detected — global backoff already active; LuaExecutor semaphore clean');
          }
        } catch {
          logger.info('[ChainFixer] 429 detected — global rate-limit backoff will resolve automatically');
        }
      },
    });

    // 8. Worker thread uncaught error (generic [Worker] Worker error)
    this.addPattern({
      id: 'worker_thread_error',
      name: 'Worker thread error',
      description: 'A background worker thread threw an unhandled error',
      matchers: [/\[Worker\] Worker error:/i],
      levels: ['error'],
      severity: 'medium',
      category: 'queue',
      cooldownMs: 30_000,
      maxAttempts: 20,
      autoFix: async () => {
        const { resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
        resetLuaExecutorSemaphore();
        logger.info('[ChainFixer] Worker thread error recovered — LuaExecutor semaphore reset');
      },
    });

    // 9. Memory pressure — heap approaching limit
    this.addPattern({
      id: 'memory_pressure',
      name: 'High memory pressure',
      description: 'Heap usage exceeding 85% of --max-old-space-size limit',
      matchers: [/memory.*critical|heap.*exhausted|FATAL ERROR.*heap/i],
      levels: ['error', 'warn'],
      severity: 'critical',
      category: 'memory',
      cooldownMs: 60_000,
      maxAttempts: 5,
      autoFix: async () => {
        if (typeof global.gc === 'function') {
          global.gc();
          logger.info('[ChainFixer] Forced GC cycle triggered due to memory pressure');
        }
        try {
          const { distributedCache } = await import('../infrastructure/distributedCache.js');
          await distributedCache.flush();
          logger.info('[ChainFixer] Cache flushed to relieve memory pressure');
        } catch { /* non-fatal */ }
      },
      escalate: async () => {
        logger.error('[ChainFixer] CRITICAL: Memory pressure unresolved after 5 fix attempts — consider increasing NODE_MAX_OLD_SPACE_SIZE or reducing concurrent workers');
      },
    });

    // 10. Unhandled promise rejection from autonomous systems
    this.addPattern({
      id: 'autonomous_system_rejection',
      name: 'Autonomous system unhandled rejection',
      description: 'An autonomous system produced an unhandled promise rejection',
      matchers: [/\[AUTONOMOUS\].*Error|autonomous.*failed|autopilot.*crashed/i],
      levels: ['error'],
      severity: 'high',
      category: 'queue',
      cooldownMs: 90_000,
      maxAttempts: 5,
      autoFix: async () => {
        await new Promise(r => setTimeout(r, 5_000));
        try {
          const { autonomousService } = await import('./autonomousService.js');
          const svcStatus = autonomousService.getStatus();
          if (!svcStatus.isRunning) {
            autonomousService.startAutonomousOperations();
            logger.info('[ChainFixer] Autonomous operations restarted');
          } else {
            logger.info('[ChainFixer] Autonomous system still running — no restart needed');
          }
        } catch (err: any) {
          logger.warn(`[ChainFixer] Autonomous restart attempt failed: ${err.message}`);
        }
      },
    });
  }

  private addPattern(p: ErrorPattern): void {
    this.patterns.push(p);
    this.state.set(p.id, {
      lastFix: 0,
      attempts: 0,
      suppressed: false,
      successCount: 0,
      failCount: 0,
      lastMessage: '',
      lastFixResult: 'none',
    });
  }

  // ─── Log Transport Hook ────────────────────────────────────────────────────

  private async onLogEntry(entry: LogEntry): Promise<void> {
    if (entry.level !== 'error' && entry.level !== 'warn' && entry.level !== 'info') return;

    const msg = entry.message + (entry.error?.message ? ' ' + entry.error.message : '');

    for (const pattern of this.patterns) {
      if (!pattern.levels.includes(entry.level as any)) continue;
      if (!pattern.matchers.some(r => r.test(msg))) continue;
      await this.triggerFix(pattern, msg);
    }
  }

  // ─── Process-Level Pre-Handler ─────────────────────────────────────────────

  private installProcessHooks(): void {
    process.prependListener('uncaughtException', (err: Error) => {
      const msg = err.message || '';
      for (const pattern of this.patterns) {
        if (pattern.matchers.some(r => r.test(msg))) {
          this.triggerFix(pattern, msg).catch(() => { /* best-effort */ });
          // Non-fatal known errors — swallow them so the default handler never fires
          if (pattern.severity === 'low' || pattern.severity === 'medium') {
            process.emit('_chainFixerAbsorbed' as any, err);
          }
        }
      }
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      for (const pattern of this.patterns) {
        if (pattern.matchers.some(r => r.test(msg))) {
          this.triggerFix(pattern, msg).catch(() => { /* best-effort */ });
        }
      }
    });
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.runHealthCheck();
      } catch { /* non-fatal */ }
    }, 15_000);
    this.healthCheckTimer.unref();
  }

  private async runHealthCheck(): Promise<void> {
    // Check LuaExecutor semaphore for deadlock
    try {
      const { getLuaExecutorStats, resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
      const stats = getLuaExecutorStats();
      this._luaStats = stats;
      if (stats.active >= stats.max && stats.queued > 3) {
        logger.warn(`[ChainFixer] Health check: LuaExecutor semaphore congested (active=${stats.active}, queued=${stats.queued}) — resetting`);
        resetLuaExecutorSemaphore();
      }
    } catch { /* lua executor may not be loaded yet */ }

    // Check memory — GC every 15 s when heap > 90% to keep memory contained.
    // WARN log is rate-limited to once per 5 min so it doesn't flood; a second
    // measurement taken immediately after GC shows whether it was effective.
    const mem = process.memoryUsage();
    const heapPct = mem.heapUsed / mem.heapTotal;
    if (heapPct > 0.90) {
      if (typeof global.gc === 'function') global.gc();
      const now = Date.now();
      if (now - this._lastHeapWarnMs >= this._HEAP_WARN_COOLDOWN_MS) {
        this._lastHeapWarnMs = now;
        // Re-sample after GC to reflect current state
        const memAfter = process.memoryUsage();
        const pctAfter = memAfter.heapUsed / memAfter.heapTotal;
        const rssMB = Math.round(memAfter.rss / 1024 / 1024);
        if (pctAfter > 0.90) {
          logger.warn(
            `[ChainFixer] Heap sustained at ${Math.round(pctAfter * 100)}% after GC ` +
            `(was ${Math.round(heapPct * 100)}%, RSS ${rssMB} MB) — process under memory pressure`
          );
        } else {
          logger.info(
            `[ChainFixer] GC effective: heap ${Math.round(heapPct * 100)}% → ${Math.round(pctAfter * 100)}% ` +
            `(RSS ${rssMB} MB)`
          );
        }
      }
    }
  }

  // ─── Fix Execution ─────────────────────────────────────────────────────────

  private async triggerFix(pattern: ErrorPattern, triggeredBy: string): Promise<void> {
    const st = this.state.get(pattern.id)!;

    if (st.suppressed) return;

    const now = Date.now();
    if (now - st.lastFix < pattern.cooldownMs) return;

    st.lastFix = now;
    st.attempts++;
    st.lastMessage = triggeredBy.slice(0, 200);
    st.lastFixResult = 'pending';

    const entry: FixHistoryEntry = {
      patternId: pattern.id,
      patternName: pattern.name,
      triggeredAt: now,
      triggeredBy: triggeredBy.slice(0, 200),
      result: 'success',
      attemptNumber: st.attempts,
    };

    if (st.attempts > pattern.maxAttempts) {
      st.suppressed = true;
      st.lastFixResult = 'suppressed';
      entry.result = 'suppressed';
      this.pushHistory({ ...entry, result: 'suppressed' });
      if (pattern.escalate) {
        await pattern.escalate(st.attempts).catch(() => { /* non-fatal */ });
      }
      this.emit('suppressed', { patternId: pattern.id, attempts: st.attempts });
      return;
    }

    try {
      await pattern.autoFix(triggeredBy);
      st.successCount++;
      st.lastFixResult = 'success';
      entry.result = 'success';
      this.emit('fixed', { patternId: pattern.id, attempt: st.attempts });
    } catch (err: any) {
      st.failCount++;
      st.lastFixResult = 'failed';
      entry.result = 'failed';
      this.emit('fixFailed', { patternId: pattern.id, error: err.message });
    }

    this.pushHistory(entry);
  }

  private pushHistory(entry: FixHistoryEntry): void {
    this.history.unshift(entry);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.length = this.MAX_HISTORY;
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  start(): void {
    if (this.started) return;
    this.started = true;

    addLogTransport((entry) => { this.onLogEntry(entry).catch(() => { /* non-fatal */ }); });
    this.installProcessHooks();
    this.startHealthCheck();

    logger.info('[ChainFixer] Chain error auto-fixer active — monitoring ' + this.patterns.length + ' error patterns');
  }

  /** Cached lua executor stats updated by health check */
  private _luaStats: { active: number; queued: number; max: number } | null = null;

  getStatus(): {
    started: boolean;
    patterns: Array<{
      id: string;
      name: string;
      severity: Severity;
      category: string;
      attempts: number;
      successCount: number;
      failCount: number;
      suppressed: boolean;
      lastFixResult: string;
      cooldownRemaining: number;
      lastMessage: string;
    }>;
    history: FixHistoryEntry[];
    luaExecutorStats: { active: number; queued: number; max: number } | null;
    memoryMB: { heapUsed: number; heapTotal: number; rss: number; heapPct: number };
  } {
    const mem = process.memoryUsage();
    const mb = (b: number) => Math.round(b / 1024 / 1024);
    const now = Date.now();
    return {
      started: this.started,
      patterns: this.patterns.map(p => {
        const st = this.state.get(p.id)!;
        return {
          id: p.id,
          name: p.name,
          severity: p.severity,
          category: p.category,
          attempts: st.attempts,
          successCount: st.successCount,
          failCount: st.failCount,
          suppressed: st.suppressed,
          lastFixResult: st.lastFixResult,
          cooldownRemaining: Math.max(0, p.cooldownMs - (now - st.lastFix)),
          lastMessage: st.lastMessage,
        };
      }),
      history: this.history.slice(0, 20),
      luaExecutorStats: this._luaStats,
      memoryMB: {
        heapUsed: mb(mem.heapUsed),
        heapTotal: mb(mem.heapTotal),
        rss: mb(mem.rss),
        heapPct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
    };
  }

  resetPattern(id: string): boolean {
    const st = this.state.get(id);
    if (!st) return false;
    st.attempts = 0;
    st.suppressed = false;
    st.lastFix = 0;
    st.lastFixResult = 'none';
    logger.info(`[ChainFixer] Pattern '${id}' manually reset`);
    return true;
  }

  forceCheck(message: string): void {
    for (const pattern of this.patterns) {
      if (pattern.matchers.some(r => r.test(message))) {
        this.triggerFix(pattern, message).catch(() => { /* non-fatal */ });
      }
    }
  }
}

export const chainErrorAutoFixer = new ChainErrorAutoFixer();
