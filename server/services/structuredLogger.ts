import { requestContext } from './requestContext.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: number;
  service?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  error?: { message: string; stack?: string; code?: string };
}

interface LoggerOptions {
  service?: string;
  defaultMetadata?: Record<string, unknown>;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: '✅',
  warn: '⚠️',
  error: '❌',
};

class StructuredLogger {
  private service?: string;
  private defaultMetadata?: Record<string, unknown>;
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor(options: LoggerOptions = {}) {
    this.service = options.service;
    this.defaultMetadata = options.defaultMetadata;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (this.isProduction ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  private getRequestContext(): { requestId?: string; userId?: number; duration?: number } {
    const ctx = requestContext.getContext();
    if (!ctx) {
      return {};
    }
    return {
      requestId: ctx.requestId,
      userId: ctx.userId,
      duration: ctx.startTime ? Date.now() - ctx.startTime : undefined,
    };
  }

  private formatMessage(entry: LogEntry): string {
    if (this.isProduction) {
      return JSON.stringify(entry);
    }

    const color = LEVEL_COLORS[entry.level];
    const icon = LEVEL_ICONS[entry.level];
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const reqId = entry.requestId ? `${COLORS.dim}[${entry.requestId.substring(0, 8)}]${COLORS.reset}` : '';
    const svc = entry.service ? `${COLORS.cyan}[${entry.service}]${COLORS.reset}` : '';
    const dur = entry.duration !== undefined ? `${COLORS.dim}(${entry.duration}ms)${COLORS.reset}` : '';
    const usr = entry.userId ? `${COLORS.magenta}user:${entry.userId}${COLORS.reset}` : '';

    let output = `${COLORS.dim}${timestamp}${COLORS.reset} ${color}${icon} ${entry.level.toUpperCase().padEnd(5)}${COLORS.reset} ${reqId}${svc} ${entry.message} ${dur} ${usr}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n  ${COLORS.dim}metadata: ${JSON.stringify(entry.metadata)}${COLORS.reset}`;
    }

    if (entry.error) {
      output += `\n  ${COLORS.red}error: ${entry.error.message}${COLORS.reset}`;
      if (entry.error.code) {
        output += ` ${COLORS.dim}(${entry.error.code})${COLORS.reset}`;
      }
      if (entry.error.stack) {
        const stackLines = entry.error.stack.split('\n').slice(1, 6);
        output += `\n${COLORS.dim}${stackLines.join('\n')}${COLORS.reset}`;
      }
    }

    return output;
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: Error | unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const ctx = this.getRequestContext();
    const errorObj = error ? this.formatError(error) : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: ctx.requestId,
      userId: ctx.userId,
      service: this.service,
      duration: ctx.duration,
      metadata: { ...this.defaultMetadata, ...metadata },
      error: errorObj,
    };

    if (Object.keys(entry.metadata || {}).length === 0) {
      delete entry.metadata;
    }

    const formattedMessage = this.formatMessage(entry);

    if (level === 'error') {
      process.stderr.write(formattedMessage + '\n');
    } else {
      process.stdout.write(formattedMessage + '\n');
    }
  }

  private formatError(error: unknown): { message: string; stack?: string; code?: string } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }
    if (typeof error === 'string') {
      return { message: error };
    }
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return {
        message: String(err.message || JSON.stringify(error)),
        stack: err.stack as string | undefined,
        code: err.code as string | undefined,
      };
    }
    return { message: String(error) };
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, errorOrMetadata?: Error | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (errorOrMetadata instanceof Error) {
      this.log('error', message, metadata, errorOrMetadata);
    } else {
      this.log('error', message, errorOrMetadata);
    }
  }

  child(options: LoggerOptions): StructuredLogger {
    return new StructuredLogger({
      service: options.service || this.service,
      defaultMetadata: { ...this.defaultMetadata, ...options.defaultMetadata },
    });
  }

  withContext(metadata: Record<string, unknown>): StructuredLogger {
    return this.child({ defaultMetadata: metadata });
  }

  time(label: string): () => void {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.info(`${label} completed`, { durationMs: Math.round(durationMs * 100) / 100 });
    };
  }

  measure<T>(label: string, fn: () => T): T {
    const end = this.time(label);
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.finally(end) as T;
      }
      end();
      return result;
    } catch (error) {
      end();
      throw error;
    }
  }

  static createMemorySnapshot(): Record<string, number> {
    const usage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(usage.external / 1024 / 1024 * 100) / 100,
    };
  }
}

export const structuredLogger = new StructuredLogger({ service: 'max-booster' });

export function createLogger(service: string): StructuredLogger {
  return new StructuredLogger({ service });
}

export { StructuredLogger };
