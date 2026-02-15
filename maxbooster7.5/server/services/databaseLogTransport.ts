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
    } catch (error) {
      process.stderr.write(`[DatabaseLogTransport] Failed to persist logs: ${error instanceof Error ? error.message : String(error)}\n`);
      this.buffer.unshift(...logsToInsert);
      if (this.buffer.length > 1000) {
        this.buffer.length = 1000;
        process.stderr.write(`[DatabaseLogTransport] Buffer overflow, dropping oldest logs\n`);
      }
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0 && !this.flushTimer) {
        this.scheduleFlush(this.config.flushIntervalMs);
      }
    }
  }

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
