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

// Tracks recent fire timestamps per pattern for adaptive cooldown
interface AdaptiveCooldownState {
  recentFires: number[];   // Unix ms timestamps of last N fires
}

class ChainErrorAutoFixer extends EventEmitter {
  private patterns: ErrorPattern[] = [];
  private state = new Map<string, PatternState>();
  private adaptiveCooldown = new Map<string, AdaptiveCooldownState>();
  private history: FixHistoryEntry[] = [];
  private readonly MAX_HISTORY = 200;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private _unsuppressTimer: NodeJS.Timeout | null = null;
  private started = false;
  // Heap warning cooldown — GC still fires every 15 s to keep memory contained,
  // but the WARN log is suppressed to once per 5 min so it doesn't flood.
  private _lastHeapWarnMs = 0;
  private readonly _HEAP_WARN_COOLDOWN_MS = 5 * 60 * 1000;

  // Unknown error log — novel errors that matched no known pattern
  private _unknownErrors: Array<{ ts: number; msg: string }> = [];
  private readonly _MAX_UNKNOWN = 50;

  constructor() {
    super();
    this.registerPatterns();
  }

  // ─── Pattern Registry ──────────────────────────────────────────────────────

  private registerPatterns(): void {

    // 0. BullMQ "Missing lock for job" — self-healing lock race during moveToFinished
    // This fires when the LuaExecutor round-trip is slow enough to expire the job
    // lock before moveToFinished can run.  BullMQ re-queues the job automatically,
    // so no manual fix is needed — only suppress further error-level logging.
    this.addPattern({
      id: 'bullmq_missing_lock',
      name: 'BullMQ Missing lock (moveToFinished race)',
      description: 'Job lock expires during slow LuaExecutor moveToFinished; BullMQ self-heals by re-queuing',
      matchers: [/Missing lock for job \d+/i, /Missing lock.*moveToFinished/i],
      levels: ['error'],
      severity: 'low',
      category: 'queue',
      cooldownMs: 10_000,
      maxAttempts: 100,
      autoFix: async () => {
        // No repair needed — just reset the LuaExecutor semaphore slot to
        // ensure future jobs can acquire locks promptly.
        const { resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
        resetLuaExecutorSemaphore();
        logger.info('[ChainFixer] BullMQ lock race acknowledged — LuaExecutor semaphore slot cleared');
      },
      escalate: async (attempts) => {
        logger.warn(`[ChainFixer] bullmq_missing_lock: ${attempts} occurrences — consider increasing lockDuration or reducing LuaExecutor concurrency`);
      },
    });

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

    // 7. Slow query sustained (3+ occurrences in window — Neon cold-connection latency)
    // NOTE: autoFix deliberately does NOT call distributedCache.flush() here.
    // These slow queries are caused by Neon serverless suspending idle connections
    // after ~1–2 min; the first query after a quiet period takes 400–900ms even
    // with correct indexes in place.  A DB keepalive ping (added in server/index.ts)
    // prevents this by sending SELECT 1 every 30s.  A cache flush here would send a
    // FLUSHDB command to PDIM at the exact same moment HyperLearning cycle ends and
    // BullMQ pollers resume — triggering the synchronized 429 burst this fixer exists
    // to prevent.  Logging only is the correct response once the keepalive is running.
    this.addPattern({
      id: 'sustained_slow_queries',
      name: 'Sustained slow database queries',
      description: 'Database query latency exceeding 300ms — Neon cold-connection latency; DB keepalive ping suppresses this after first boot',
      matchers: [/Slow query detected \(\d{3,}ms\)/i],
      levels: ['warn'],
      severity: 'low',
      category: 'database',
      cooldownMs: 300_000,
      maxAttempts: 100,
      autoFix: async () => {
        // Intentionally no PDIM/cache interaction — see comment above.
        logger.info('[ChainFixer] Slow query acknowledged — Neon cold-connection latency (DB keepalive running; will not recur after first 30s cycle)');
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
          const { getLuaExecutorStats, resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
          const stats = getLuaExecutorStats();
          // Only reset if there are genuinely leaked slots (active > max).
          // DO NOT reset on 429 alone — the PDIM circuit breaker already applies
          // backoff and the semaphore queue is healthy backpressure, not a deadlock.
          // Resetting unconditionally causes a thundering herd (all queued waiters
          // spawn Workers simultaneously → more 429s → feedback loop).
          if (stats.active > stats.max) {
            const released = resetLuaExecutorSemaphore();
            logger.info(`[ChainFixer] 429 — leaked slots freed: active=${stats.active} queued=${stats.queued} released=${released}`);
          } else {
            logger.info(`[ChainFixer] 429 — PDIM circuit breaker handling backoff; semaphore healthy (active=${stats.active}, queued=${stats.queued})`);
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

    // 9. BullMQ lock-manager erroredJobIds.includes is not a function
    // extendJobLocks() Lua script returns null/undefined via PDIM on timeout;
    // the postinstall patch guards new installs but this catches any residual
    // instances at runtime and resets the LuaExecutor semaphore so the next
    // lock renewal attempt can succeed cleanly.
    this.addPattern({
      id: 'bullmq_errored_job_ids_includes',
      name: 'BullMQ erroredJobIds.includes TypeError',
      description: 'extendJobLocks returned non-array from PDIM — guard missing or patch not applied',
      matchers: [/erroredJobIds\.includes is not a function/i],
      levels: ['error'],
      severity: 'high',
      category: 'queue',
      cooldownMs: 30_000,
      maxAttempts: 20,
      autoFix: async () => {
        const { resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
        resetLuaExecutorSemaphore();
        logger.info('[ChainFixer] erroredJobIds.includes crash recovered — LuaExecutor semaphore reset');
      },
    });

    // 10. Memory pressure — heap approaching limit
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

    // 11. Session store failure — session reads/writes fail due to DB/PDIM degradation
    this.addPattern({
      id: 'session_store_failure',
      name: 'Session store failure',
      description: 'Session store read/write failed — users may lose sessions; auto-fallback to in-memory attempted',
      matchers: [
        /session.*store.*fail|session.*timeout|Failed to create.*session/i,
        /connect-pg-simple.*error|PgSessionStore.*fail/i,
      ],
      levels: ['error', 'warn'],
      severity: 'high',
      category: 'database',
      cooldownMs: 60_000,
      maxAttempts: 10,
      autoFix: async () => {
        try {
          const { pool } = await import('../db.js');
          await pool.query('SELECT 1');
          logger.info('[ChainFixer] Session store — DB pool responsive; sessions will auto-recover');
        } catch (err: any) {
          logger.warn(`[ChainFixer] Session store — DB pool also failing: ${err.message}`);
        }
      },
      escalate: async (attempts) => {
        logger.error(`[ChainFixer] session_store_failure: ${attempts} occurrences — check DB pool and PDIM; users may be unable to authenticate`);
      },
    });

    // 12. External API credential exhaustion (expired keys, quota exceeded)
    this.addPattern({
      id: 'api_credential_expired',
      name: 'External API credential expired or exhausted',
      description: 'An external API returned 401/403 — API key may be expired or quota exceeded',
      matchers: [
        /API.*401|401.*Unauthorized.*key|403.*Forbidden.*api.*key/i,
        /API key.*expired|quota.*exceeded|rate.*limit.*exceeded.*api/i,
        /invalid_api_key|authentication.*failed.*api/i,
      ],
      levels: ['error'],
      severity: 'high',
      category: 'external',
      cooldownMs: 300_000,    // 5 min — no point hammering expired credentials
      maxAttempts: 3,
      autoFix: async () => {
        logger.warn('[ChainFixer] External API credential issue detected — check API key environment variables (OPENAI_API_KEY, STRIPE_SECRET_KEY, SENDGRID_API_KEY, etc.)');
      },
      escalate: async (attempts) => {
        logger.error(`[ChainFixer] ESCALATION: External API credential expired or quota exceeded (${attempts} occurrences). Manual key rotation required.`);
      },
    });

    // 13. Filesystem errors — disk full, permission denied, file not found in critical paths
    this.addPattern({
      id: 'filesystem_error',
      name: 'Filesystem error (ENOSPC / EACCES / EMFILE)',
      description: 'Disk full, permission denied, or too many open files — storage is compromised',
      matchers: [
        /ENOSPC|no space left on device/i,
        /EACCES.*\/|EPERM.*\/|permission denied.*file/i,
        /EMFILE|too many open files/i,
      ],
      levels: ['error'],
      severity: 'critical',
      category: 'storage',
      cooldownMs: 60_000,
      maxAttempts: 5,
      autoFix: async () => {
        // Force GC to release any pending file buffers
        if (typeof global.gc === 'function') global.gc();
        logger.warn('[ChainFixer] Filesystem error detected — GC triggered to release buffers; check disk space and file descriptor limits');
        try {
          const { distributedCache } = await import('./distributedCacheService.js');
          await (distributedCache as any)?.evictExpired?.();
          logger.info('[ChainFixer] Cache evicted to reduce storage pressure after filesystem error');
        } catch { /* non-critical */ }
      },
      escalate: async (attempts) => {
        logger.error(`[ChainFixer] CRITICAL filesystem errors (${attempts}x) — disk may be full or permissions corrupted. Manual intervention required.`);
      },
    });

    // 14. AI provider timeout / overload — OpenAI, Anthropic etc.
    this.addPattern({
      id: 'ai_provider_timeout',
      name: 'AI provider timeout or overload',
      description: 'External AI API timed out or returned 503/overloaded — AI features degrade gracefully',
      matchers: [
        /openai.*timeout|anthropic.*timeout|AI.*provider.*503/i,
        /Request timed out.*openai|overloaded.*anthropic/i,
        /model.*unavailable|ai.*service.*unavailable/i,
      ],
      levels: ['error', 'warn'],
      severity: 'medium',
      category: 'external',
      cooldownMs: 120_000,
      maxAttempts: 20,
      autoFix: async () => {
        // No automatic fix possible for external AI provider issues.
        // Just log and let the circuit breaker in the API client handle retries.
        logger.info('[ChainFixer] AI provider timeout — graceful degradation active; AI features will retry automatically');
      },
      escalate: async (attempts) => {
        logger.warn(`[ChainFixer] AI provider repeatedly unavailable (${attempts}x) — non-AI features unaffected`);
      },
    });

    // 15. Node.js native worker thread crash
    this.addPattern({
      id: 'worker_thread_crash',
      name: 'Node.js worker thread crash',
      description: 'A Node.js worker_threads Worker exited with non-zero code',
      matchers: [/Worker.*exited with code [^0]|worker_thread.*crashed|Worker stopped with exit code [^0]/i],
      levels: ['error'],
      severity: 'high',
      category: 'queue',
      cooldownMs: 30_000,
      maxAttempts: 15,
      autoFix: async () => {
        const { resetLuaExecutorSemaphore } = await import('../lib/luaExecutor.js');
        resetLuaExecutorSemaphore();
        logger.info('[ChainFixer] Worker thread crash — LuaExecutor semaphore reset; BullMQ will respawn the worker');
      },
      escalate: async (attempts) => {
        logger.error(`[ChainFixer] Worker threads crashing repeatedly (${attempts}x) — possible OOM or code bug in job handler`);
      },
    });

    // 16. OOM killer signal / V8 heap allocation failure
    this.addPattern({
      id: 'oom_error',
      name: 'V8 heap allocation failure / OOM',
      description: 'V8 failed to allocate memory — process is under extreme heap pressure',
      matchers: [/FATAL ERROR.*Reached heap limit|FATAL ERROR.*allocation failure|JavaScript heap out of memory/i],
      levels: ['error'],
      severity: 'critical',
      category: 'memory',
      cooldownMs: 10_000,
      maxAttempts: 3,
      autoFix: async () => {
        // At this point we're in a very bad state. Best effort: force GC and flush cache.
        if (typeof global.gc === 'function') { try { global.gc(); } catch { /* ignore */ } }
        try {
          const { distributedCache } = await import('./distributedCacheService.js');
          await (distributedCache as any)?.flush?.();
        } catch { /* non-critical */ }
        logger.error('[ChainFixer] OOM detected — emergency GC + cache flush executed. Process may be unstable until it is recycled by the cluster.');
      },
      escalate: async () => {
        logger.error('[ChainFixer] CRITICAL: OOM escalated — cluster will recycle this worker on the next health check');
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
    this.adaptiveCooldown.set(p.id, { recentFires: [] });
  }

  // ─── Adaptive cooldown ─────────────────────────────────────────────────────
  // If a pattern fires > 5 times within 1 hour → double its effective cooldown.
  // If it hasn't fired in 24 hours → reset adaptive multiplier (back to base).
  private _adaptiveCooldownMs(pattern: ErrorPattern): number {
    const state = this.adaptiveCooldown.get(pattern.id)!;
    const now = Date.now();
    const oneHour  = 60 * 60_000;
    const oneDay   = 24 * oneHour;

    // Prune fires older than 1 hour
    state.recentFires = state.recentFires.filter(t => now - t < oneHour);

    // If fired 5+ times in the last hour, back off (double cooldown, max 4×)
    const firesInHour = state.recentFires.length;
    if (firesInHour >= 5)  return Math.min(pattern.cooldownMs * 4, 10 * 60_000);
    if (firesInHour >= 3)  return Math.min(pattern.cooldownMs * 2, 5 * 60_000);

    // If no fires in 24 h, halve cooldown to restore sensitivity
    const lastFire = state.recentFires[state.recentFires.length - 1] ?? 0;
    if (lastFire && now - lastFire > oneDay) return Math.max(pattern.cooldownMs / 2, 5_000);

    return pattern.cooldownMs;
  }

  private _recordFire(id: string): void {
    const state = this.adaptiveCooldown.get(id)!;
    if (state) state.recentFires.push(Date.now());
  }

  // ─── Log Transport Hook ────────────────────────────────────────────────────

  private async onLogEntry(entry: LogEntry): Promise<void> {
    if (entry.level !== 'error' && entry.level !== 'warn' && entry.level !== 'info') return;

    const msg = entry.message + (entry.error?.message ? ' ' + entry.error.message : '');
    let matched = false;

    for (const pattern of this.patterns) {
      if (!pattern.levels.includes(entry.level as any)) continue;
      if (!pattern.matchers.some(r => r.test(msg))) continue;
      matched = true;
      await this.triggerFix(pattern, msg);
    }

    // Unknown error detection — log novel errors that no pattern covers.
    // Only track error-level messages to avoid noise from warn/info.
    if (!matched && entry.level === 'error') {
      this._trackUnknownError(msg);
    }
  }

  private _trackUnknownError(msg: string): void {
    const now = Date.now();
    // Don't record the same message repeatedly (check last 10)
    const recent = this._unknownErrors.slice(-10);
    if (recent.some(e => e.msg === msg.slice(0, 120))) return;

    this._unknownErrors.push({ ts: now, msg: msg.slice(0, 200) });
    if (this._unknownErrors.length > this._MAX_UNKNOWN) this._unknownErrors.shift();

    // Log it so it's visible in the audit trail
    logger.warn(`[ChainFixer] Novel error (no pattern match) — may need a new recovery rule: ${msg.slice(0, 120)}`);
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
        this._consecutiveCongestedChecks++;
        if (this._consecutiveCongestedChecks >= ChainErrorAutoFixer._CONGESTION_DEADLOCK_THRESHOLD) {
          logger.warn(
            `[ChainFixer] LuaExecutor deadlock confirmed (${this._consecutiveCongestedChecks} consecutive congested checks, ` +
            `active=${stats.active}, queued=${stats.queued}) — resetting semaphore`
          );
          resetLuaExecutorSemaphore();
          this._consecutiveCongestedChecks = 0;
        } else {
          logger.warn(
            `[ChainFixer] LuaExecutor semaphore congested — check ${this._consecutiveCongestedChecks}/${ChainErrorAutoFixer._CONGESTION_DEADLOCK_THRESHOLD} ` +
            `(active=${stats.active}, queued=${stats.queued}) — monitoring before reset`
          );
        }
      } else {
        this._consecutiveCongestedChecks = 0;
      }
    } catch { /* lua executor may not be loaded yet */ }

    // Check memory — GC every 15 s when heap > 85% to keep memory contained.
    // Use heap_size_limit (the configured --max-old-space-size) rather than
    // heapTotal (the JIT-grown current size) so the percentage is accurate
    // against the true limit.  At boot, heapTotal might be 900 MB while
    // heap_size_limit is 4096 MB — using heapTotal gives false "98%" alarms.
    const mem = process.memoryUsage();
    const { getHeapStatistics } = await import('v8');
    const v8stats = getHeapStatistics();
    const limitBytes = v8stats.heap_size_limit > 0 ? v8stats.heap_size_limit : mem.heapTotal;
    const heapPct = mem.heapUsed / limitBytes;
    if (heapPct > 0.85) {
      if (typeof global.gc === 'function') global.gc();
      const now = Date.now();
      if (now - this._lastHeapWarnMs >= this._HEAP_WARN_COOLDOWN_MS) {
        this._lastHeapWarnMs = now;
        // Re-sample after GC to reflect current state
        const memAfter = process.memoryUsage();
        const pctAfter = memAfter.heapUsed / limitBytes;
        const rssMB = Math.round(memAfter.rss / 1024 / 1024);
        const limitMB = Math.round(limitBytes / 1024 / 1024);
        if (pctAfter > 0.90) {
          logger.warn(
            `[ChainFixer] Heap sustained at ${Math.round(pctAfter * 100)}% of ${limitMB} MB limit after GC ` +
            `(was ${Math.round(heapPct * 100)}%, RSS ${rssMB} MB) — process under memory pressure`
          );
        } else {
          logger.info(
            `[ChainFixer] GC effective: heap ${Math.round(heapPct * 100)}% → ${Math.round(pctAfter * 100)}% ` +
            `of ${limitMB} MB limit (RSS ${rssMB} MB)`
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
    // Use adaptive cooldown (may be longer or shorter than the base cooldown).
    const effectiveCooldown = this._adaptiveCooldownMs(pattern);
    if (now - st.lastFix < effectiveCooldown) return;

    this._recordFire(pattern.id);
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

    // Every 24 h: un-suppress all patterns that have been quiet for at least 6 h.
    // This ensures long-dormant error classes are re-monitored after they reoccur
    // following an extended quiet period — critical for 100+ year deployments.
    const jitterMs = Math.floor(Math.random() * 30_000);
    this._unsuppressTimer = setInterval(() => {
      this._dailyUnsuppress();
    }, 24 * 60 * 60_000 + jitterMs);
    this._unsuppressTimer.unref();

    logger.info(`[ChainFixer] Chain error auto-fixer active — monitoring ${this.patterns.length} error patterns (adaptive cooldowns, daily un-suppress)`);
  }

  private _dailyUnsuppress(): void {
    const now = Date.now();
    let reset = 0;
    for (const pattern of this.patterns) {
      const st = this.state.get(pattern.id)!;
      if (!st.suppressed) continue;
      // Only reset if the pattern hasn't fired in the last 6 h (it genuinely went quiet).
      const lastFire = this.adaptiveCooldown.get(pattern.id)?.recentFires.slice(-1)[0] ?? st.lastFix;
      if (now - lastFire > 6 * 60 * 60_000) {
        this.resetPattern(pattern.id);
        reset++;
      }
    }
    if (reset > 0) {
      logger.info(`[ChainFixer] Daily un-suppress: reset ${reset} pattern(s) that were quiet for 6+ hours`);
    }
  }

  /** Cached lua executor stats updated by health check */
  private _luaStats: { active: number; queued: number; max: number } | null = null;

  /**
   * Consecutive health-check cycles where semaphore was congested.
   * Boot bursts clear within ~30s (2 cycles @ 15s). Only reset after
   * 3 consecutive congested readings (45s) to distinguish true deadlock
   * from normal startup saturation. Resets to 0 whenever congestion clears.
   */
  private _consecutiveCongestedChecks = 0;
  private static readonly _CONGESTION_DEADLOCK_THRESHOLD = 3;

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
      unknownErrors: this._unknownErrors.slice(-10),
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
