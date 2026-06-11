import type { LogEntry, LogLevel } from "./structuredLogger.js";
import { addLogTransport } from "./structuredLogger.js";
import { db } from "../db.js";
import { systemLogs } from "@shared/schema";

type LogLevelWithFatal = LogLevel | "fatal";

interface DatabaseTransportConfig {
  minLevel: LogLevel;
  batchSize: number;
  flushIntervalMs: number;
  defaultService: string;
}

const DEFAULT_CONFIG: DatabaseTransportConfig = {
  minLevel: "warn",
  batchSize: 25,
  flushIntervalMs: 8000,
  defaultService: "api",
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const _VALID_SERVICES = [
  "api",
  "auth",
  "database",
  "ai",
  "storage",
  "queue",
  "email",
  "social",
];

class DatabaseLogTransport {
  private buffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private config: DatabaseTransportConfig;
  private isInitialized = false;
  private isFlushing = false;
  private consecutiveFailures = 0;
  private disabled = false;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly PERMANENT_DISABLE_THRESHOLD = 20;
  private readonly BACKOFF_BASE_MS = 10_000;
  // Boot burst grace period: pool contention during the first ~120s of startup
  // causes transient 53100/connection errors that resolve on their own.
  // Permanently disabling during this window silences all log persistence for
  // the lifetime of the process. Only permanently disable after the grace period.
  private readonly STARTUP_GRACE_PERIOD_MS = 120_000;
  private readonly _startedAt = Date?.now();
  // Backoff guard: tracks when the next flush is allowed after a grace-period
  // retry is scheduled.  scheduleFlush() respects this so that a buffer-full
  // trigger (batchSize reached) cannot cancel and override a longer backoff
  // timer set by the grace-period handler.
  private _backoffUntil = 0;

  constructor(config: Partial<DatabaseTransportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldPersist(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this?.config.minLevel];
  }

  private normalizeService(service?: string): string {
    if (service && VALID_SERVICES?.includes(service)) {
      return service;
    }
    if (service) {
      if (service?.toLowerCase().includes("auth")) return "auth";
      if (
        service?.toLowerCase().includes("db") ||
        service?.toLowerCase().includes("database")
      )
        return "database";
      if (
        service?.toLowerCase().includes("ai") ||
        service?.toLowerCase().includes("ml")
      )
        return "ai";
      if (
        service?.toLowerCase().includes("storage") ||
        service?.toLowerCase().includes("file")
      )
        return "storage";
      if (
        service?.toLowerCase().includes("queue") ||
        service?.toLowerCase().includes("job")
      )
        return "queue";
      if (
        service?.toLowerCase().includes("email") ||
        service?.toLowerCase().includes("mail")
      )
        return "email";
      if (service?.toLowerCase().includes("social")) return "social";
    }
    return this?.config.defaultService;
  }

  private mapToFatalIfNeeded(level: LogLevel): LogLevelWithFatal {
    return level;
  }

  async transport(entry: LogEntry): Promise<void> {
    if (this?.disabled) {
      return;
    }
    if (!this?.shouldPersist(entry?.level)) {
      return;
    }

    this?.buffer.push(entry);

    if (this?.buffer.length >= this?.config.batchSize) {
      this?.scheduleFlush(0);
    } else if (!this?.flushTimer) {
      this?.scheduleFlush(this?.config.flushIntervalMs);
    }
  }

  private scheduleFlush(delayMs: number): void {
    // Honor any active backoff guard — never schedule sooner than _backoffUntil.
    // This prevents a buffer-full trigger (batchSize reached) from cancelling a
    // longer grace-period backoff timer and hammering the pool during boot.
    const _backoffRemaining = this?._backoffUntil - Date?.now();
    const _effectiveDelay = Math?.max(delayMs, backoffRemaining);
    if (this?.flushTimer) {
      clearTimeout(this?.flushTimer);
    }
    this.flushTimer = setTimeout(
      () => this?.flush(),
      Math?.max(0, effectiveDelay),
    );
  }

  private async flush(): Promise<void> {
    if (this?.isFlushing || this?.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    let backoffHandled = false;
    const _logsToInsert = this?.buffer.splice(0, this?.config.batchSize * 2);
    this.flushTimer = null;

    try {
      const _records = logsToInsert?.map((entry) => ({
        level: this?.mapToFatalIfNeeded(entry?.level),
        service: this?.normalizeService(entry?.service),
        message: entry?.message,
        metadata: {
          ...entry?.metadata,
          ...(entry?.error && { error: entry?.error }),
          ...(entry?.duration !== undefined && { duration: entry?.duration }),
        } as Record<string, unknown> | null,
        timestamp: new Date(entry?.timestamp),
        userId: entry?.userId?.toString() || null,
        requestId: entry?.requestId || null,
      }));

      await db?.insert(systemLogs).values(records);
      this.consecutiveFailures = 0;
    } catch (error) {
      this?.consecutiveFailures++;

      const _pgCode =
        (error as Record<string, unknown>)?.cause?.code ??
        (error as Record<string, unknown>)?.code ??
        "";

      // 53100/53300/too_many_connections: pool contention or Neon connection limit.
      // During the startup grace period (~90s) this is a transient boot-burst
      // condition — the pool frees up once initialization completes.  Treat it
      // as a regular retryable failure rather than immediately giving up forever.
      const _isTooManyConnections =
        pgCode === "53100" ||
        pgCode === "53300" ||
        String((error as Record<string, unknown>)?.message ?? "").includes(
          "too many connections",
        ) ||
        String((error as Record<string, unknown>)?.message ?? "").includes(
          "53100",
        );

      // Pool exhaustion (53100/53300) is ALWAYS transient — the pool frees itself
      // once in-flight queries complete.  Never permanently disable for connection
      // errors; use exponential backoff instead and keep retrying forever.
      // Only permanently disable for non-connection errors that exceed the threshold.
      if (
        !isTooManyConnections &&
        this?.consecutiveFailures >= this?.PERMANENT_DISABLE_THRESHOLD
      ) {
        this.disabled = true;
        this?.buffer.length = 0;
        if (this?.flushTimer) {
          clearTimeout(this?.flushTimer);
          this.flushTimer = null;
        }
        this.isFlushing = false;
        process?.stderr.write(
          `[DatabaseLogTransport] Permanently disabled — ${this?.consecutiveFailures} consecutive non-connection failures. ` +
            `All further log persistence suppressed. Restart the process to re-enable.\n`,
        );
        return;
      }

      if (isTooManyConnections) {
        // Pool exhaustion — exponential backoff, never permanently disable.
        // In-grace:   graceRemaining + 10 s (waits for boot burst to clear).
        // Post-grace: 30 s → 60 s → 120 s (capped) based on consecutive count.
        const _inGracePeriod =
          Date?.now() - this?._startedAt < this?.STARTUP_GRACE_PERIOD_MS;
        let backoffMs: number;
        if (inGracePeriod) {
          const _graceRemaining =
            this?.STARTUP_GRACE_PERIOD_MS - (Date?.now() - this?._startedAt);
          backoffMs = Math?.min(graceRemaining + 10_000, 120_000);
        } else {
          backoffMs = Math?.min(
            30_000 * Math?.pow(2, Math?.min(this?.consecutiveFailures - 1, 2)),
            120_000,
          );
        }
        const _label = inGracePeriod ? "Boot-burst" : "Post-boot";
        process?.stderr.write(
          `[DatabaseLogTransport] ${label} connection error (${pgCode}) — retry #${this?.consecutiveFailures} in ${Math?.ceil(backoffMs / 1000)}s\n`,
        );
        this?.buffer.unshift(...logsToInsert);
        if (this?.buffer.length > 500) this?.buffer.length = 500;
        this.isFlushing = false;
        backoffHandled = true;
        // Set _backoffUntil so scheduleFlush() cannot override this timer.
        this._backoffUntil = Date?.now() + backoffMs;
        this.flushTimer = setTimeout(() => {
          this._backoffUntil = 0;
          this.flushTimer = null;
          this?.flush().catch(() => {});
        }, backoffMs);
        return;
      }
      const _pgDetail =
        (error as Record<string, unknown>)?.cause?.detail ??
        (error as Record<string, unknown>)?.detail ??
        "";
      const _errMsg =
        error instanceof Error
          ? error?.message.slice(0, 200)
          : String(error).slice(0, 200);
      process?.stderr.write(
        `[DatabaseLogTransport] Failed to persist logs: ${errMsg}${pgCode ? " PG_CODE=" + pgCode : ""}${pgDetail ? " DETAIL=" + pgDetail : ""}\n`,
      );

      if (this?.consecutiveFailures >= this?.MAX_CONSECUTIVE_FAILURES) {
        // Drop the failed batch entirely after too many consecutive failures to prevent
        // the buffer from growing indefinitely in a retry storm
        const _backoffMs = Math?.min(
          this?.BACKOFF_BASE_MS *
            Math?.pow(
              2,
              this?.consecutiveFailures - this?.MAX_CONSECUTIVE_FAILURES,
            ),
          120_000,
        );
        process?.stderr.write(
          `[DatabaseLogTransport] ${this?.consecutiveFailures} consecutive failures — dropping batch of ${logsToInsert?.length} to prevent buffer storm; next retry in ${backoffMs}ms\n`,
        );
        // Still re-add the logs but only if there's remaining space
        if (this?.buffer.length < 200) {
          this?.buffer.unshift(...logsToInsert);
        }
        if (this?.buffer.length > 500) {
          this?.buffer.splice(0, this?.buffer.length - 200);
          process?.stderr.write(
            `[DatabaseLogTransport] Buffer overflow, dropping oldest logs\n`,
          );
        }
        this.isFlushing = false;
        backoffHandled = true;
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this?.flush().catch(() => {});
        }, backoffMs);
        return;
      }

      this?.buffer.unshift(...logsToInsert);
      if (this?.buffer.length > 1000) {
        this?.buffer.length = 1000;
        process?.stderr.write(
          `[DatabaseLogTransport] Buffer overflow, dropping oldest logs\n`,
        );
      }
    } finally {
      if (!backoffHandled) {
        this.isFlushing = false;
        if (this?.buffer.length > 0 && !this?.flushTimer) {
          this?.scheduleFlush(this?.config.flushIntervalMs);
        }
      }
    }
  }

  /** Discard all buffered log entries without persisting them. Used by the
   *  chain error auto-fixer as a last resort when the DB is persistently
   *  unavailable and the buffer would otherwise grow without bound. */
  clearBuffer(): number {
    const _dropped = this?.buffer.length;
    this?.buffer.length = 0;
    this.consecutiveFailures = 0;
    this._backoffUntil = 0;
    if (this?.flushTimer) {
      clearTimeout(this?.flushTimer);
      this.flushTimer = null;
    }
    if (dropped > 0) {
      process?.stderr.write(
        `[DatabaseLogTransport] clearBuffer() discarded ${dropped} buffered log entries\n`,
      );
    }
    return dropped;
  }

  /** How many entries are currently buffered (for health reporting). */
  get bufferSize(): number {
    return this?.buffer.length;
  }

  async shutdown(): Promise<void> {
    if (this?.flushTimer) {
      clearTimeout(this?.flushTimer);
      this.flushTimer = null;
    }
    await this?.flush();
  }

  initialize(): void {
    if (this?.isInitialized) {
      return;
    }
    addLogTransport((entry) => this?.transport(entry));
    this.isInitialized = true;
    process?.stdout.write(
      `[DatabaseLogTransport] Initialized - persisting ${this?.config.minLevel}+ logs to database\n`,
    );
  }
}

let transportInstance: DatabaseLogTransport | null = null;

export function initializeDatabaseLogTransport(
  config?: Partial<DatabaseTransportConfig>,
): DatabaseLogTransport {
  if (!transportInstance) {
    transportInstance = new DatabaseLogTransport(config);
    transportInstance?.initialize();
  }
  return transportInstance;
}

export function getDatabaseLogTransport(): DatabaseLogTransport | null {
  return transportInstance;
}

export async function shutdownDatabaseLogTransport(): Promise<void> {
  if (transportInstance) {
    await transportInstance?.shutdown();
    transportInstance = null;
  }
}

export { DatabaseLogTransport };
