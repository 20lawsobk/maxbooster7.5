import type { LogEntry, LogLevel } from './structuredLogger.ts';
import { addLogTransport } from './structuredLogger.ts';
import { db } from '../db.js';
import { systemLogs } from '@shared/schema';

type LogLevelWithFatal = LogLevel | 'fatal';

interface DatabaseTransportConfig {
  minLevel: LogLevel;
  batchSize: number;
  flushIntervalMs: number;
  defaultService: string;
}

const DEFAULT_CONFIG: DatabaseTransportConfig = {
  minLevel: 'warn',
  batchSize: 10,
  flushIntervalMs: 5000,
  defaultService: 'api',
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const VALID_SERVICES = ['api', 'auth', 'database', 'ai', 'storage', 'queue', 'email', 'social'];

class DatabaseLogTransport {
  private buffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private config: DatabaseTransportConfig;
  private isInitialized = false;
  private isFlushing = false;
  private consecutiveFailures = 0;
  private disabled = false;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly PERMANENT_DISABLE_THRESHOLD = 10;
  private readonly BACKOFF_BASE_MS = 10_000;
  // Boot burst grace period: pool contention during the first ~90s of startup
  // causes transient 53100/connection errors that resolve on their own.
  // Permanently disabling during this window silences all log persistence for
  // the lifetime of the process. Only permanently disable after the grace period.
  private readonly STARTUP_GRACE_PERIOD_MS = 90_000;
  private readonly _startedAt = Date.now();

  constructor(config: Partial<DatabaseTransportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldPersist(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.minLevel];
  }

  private normalizeService(service?: string): string {
    if (service && VALID_SERVICES.includes(service)) {
      return service;
    }
    if (service) {
      if (service.toLowerCase().includes('auth')) return 'auth';
      if (service.toLowerCase().includes('db') || service.toLowerCase().includes('database')) return 'database';
      if (service.toLowerCase().includes('ai') || service.toLowerCase().includes('ml')) return 'ai';
      if (service.toLowerCase().includes('storage') || service.toLowerCase().includes('file')) return 'storage';
      if (service.toLowerCase().includes('queue') || service.toLowerCase().includes('job')) return 'queue';
      if (service.toLowerCase().includes('email') || service.toLowerCase().includes('mail')) return 'email';
      if (service.toLowerCase().includes('social')) return 'social';
    }
    return this.config.defaultService;
  }

  private mapToFatalIfNeeded(level: LogLevel): LogLevelWithFatal {
    return level;
  }

  async transport(entry: LogEntry): Promise<void> {
    if (this.disabled) {
      return;
    }
    if (!this.shouldPersist(entry.level)) {
      return;
    }

    this.buffer.push(entry);

    if (this.buffer.length >= this.config.batchSize) {
      this.scheduleFlush(0);
    } else if (!this.flushTimer) {
      this.scheduleFlush(this.config.flushIntervalMs);
    }
  }

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => this.flush(), delayMs);
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    let backoffHandled = false;
    const logsToInsert = this.buffer.splice(0, this.config.batchSize * 2);
    this.flushTimer = null;

    try {
      const records = logsToInsert.map((entry) => ({
        level: this.mapToFatalIfNeeded(entry.level),
        service: this.normalizeService(entry.service),
        message: entry.message,
        metadata: {
          ...entry.metadata,
          ...(entry.error && { error: entry.error }),
          ...(entry.duration !== undefined && { duration: entry.duration }),
        } as Record<string, unknown> | null,
        timestamp: new Date(entry.timestamp),
        userId: entry.userId?.toString() || null,
        requestId: entry.requestId || null,
      }));

      await db.insert(systemLogs).values(records);
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;

      const pgCode = (error as any)?.cause?.code ?? (error as any)?.code ?? '';

      // 53100/53300/too_many_connections: pool contention or Neon connection limit.
      // During the startup grace period (~90s) this is a transient boot-burst
      // condition — the pool frees up once initialization completes.  Treat it
      // as a regular retryable failure rather than immediately giving up forever.
      const isTooManyConnections = pgCode === '53100' || pgCode === '53300' ||
        String((error as any)?.message ?? '').includes('too many connections') ||
        String((error as any)?.message ?? '').includes('53100');

      const inGracePeriod = (Date.now() - this._startedAt) < this.STARTUP_GRACE_PERIOD_MS;

      if ((isTooManyConnections && !inGracePeriod) || this.consecutiveFailures >= this.PERMANENT_DISABLE_THRESHOLD) {
        this.disabled = true;
        this.buffer.length = 0;
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        this.isFlushing = false;
        process.stderr.write(
          `[DatabaseLogTransport] Permanently disabled — ${isTooManyConnections ? 'PG_CODE=53100 (too many connections, post-grace)' : `${this.consecutiveFailures} consecutive failures`}. ` +
          `All further log persistence suppressed. Restart the process to re-enable.\n`
        );
        return;
      }

      if (isTooManyConnections && inGracePeriod) {
        // Boot-burst transient error — back off and retry after the startup window clears.
        const graceRemaining = this.STARTUP_GRACE_PERIOD_MS - (Date.now() - this._startedAt);
        process.stderr.write(`[DatabaseLogTransport] Boot-burst connection error (${pgCode}) — retrying in ${Math.ceil(graceRemaining / 1000)}s when pool settles\n`);
        this.buffer.unshift(...logsToInsert);
        if (this.buffer.length > 500) this.buffer.length = 500;
        this.isFlushing = false;
        backoffHandled = true;
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flush().catch(() => {});
        }, Math.min(graceRemaining + 5_000, 100_000));
        return;
      }
      const pgDetail = (error as any)?.cause?.detail ?? (error as any)?.detail ?? '';
      const errMsg = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
      process.stderr.write(`[DatabaseLogTransport] Failed to persist logs: ${errMsg}${pgCode ? ' PG_CODE=' + pgCode : ''}${pgDetail ? ' DETAIL=' + pgDetail : ''}\n`);

      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        // Drop the failed batch entirely after too many consecutive failures to prevent
        // the buffer from growing indefinitely in a retry storm
        const backoffMs = Math.min(this.BACKOFF_BASE_MS * Math.pow(2, this.consecutiveFailures - this.MAX_CONSECUTIVE_FAILURES), 120_000);
        process.stderr.write(`[DatabaseLogTransport] ${this.consecutiveFailures} consecutive failures — dropping batch of ${logsToInsert.length} to prevent buffer storm; next retry in ${backoffMs}ms\n`);
        // Still re-add the logs but only if there's remaining space
        if (this.buffer.length < 200) {
          this.buffer.unshift(...logsToInsert);
        }
        if (this.buffer.length > 500) {
          this.buffer.splice(0, this.buffer.length - 200);
          process.stderr.write(`[DatabaseLogTransport] Buffer overflow, dropping oldest logs\n`);
        }
        this.isFlushing = false;
        backoffHandled = true;
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flush().catch(() => {});
        }, backoffMs);
        return;
      }

      this.buffer.unshift(...logsToInsert);
      if (this.buffer.length > 1000) {
        this.buffer.length = 1000;
        process.stderr.write(`[DatabaseLogTransport] Buffer overflow, dropping oldest logs\n`);
      }
    } finally {
      if (!backoffHandled) {
        this.isFlushing = false;
        if (this.buffer.length > 0 && !this.flushTimer) {
          this.scheduleFlush(this.config.flushIntervalMs);
        }
      }
    }
  }

  /** Discard all buffered log entries without persisting them. Used by the
   *  chain error auto-fixer as a last resort when the DB is persistently
   *  unavailable and the buffer would otherwise grow without bound. */
  clearBuffer(): number {
    const dropped = this.buffer.length;
    this.buffer.length = 0;
    this.consecutiveFailures = 0;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (dropped > 0) {
      process.stderr.write(`[DatabaseLogTransport] clearBuffer() discarded ${dropped} buffered log entries\n`);
    }
    return dropped;
  }

  /** How many entries are currently buffered (for health reporting). */
  get bufferSize(): number { return this.buffer.length; }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  initialize(): void {
    if (this.isInitialized) {
      return;
    }
    addLogTransport((entry) => this.transport(entry));
    this.isInitialized = true;
    process.stdout.write(`[DatabaseLogTransport] Initialized - persisting ${this.config.minLevel}+ logs to database\n`);
  }
}

let transportInstance: DatabaseLogTransport | null = null;

export function initializeDatabaseLogTransport(config?: Partial<DatabaseTransportConfig>): DatabaseLogTransport {
  if (!transportInstance) {
    transportInstance = new DatabaseLogTransport(config);
    transportInstance.initialize();
  }
  return transportInstance;
}

export function getDatabaseLogTransport(): DatabaseLogTransport | null {
  return transportInstance;
}

export async function shutdownDatabaseLogTransport(): Promise<void> {
  if (transportInstance) {
    await transportInstance.shutdown();
    transportInstance = null;
  }
}

export { DatabaseLogTransport };
