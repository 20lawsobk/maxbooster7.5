import { storage } from '../storage';
import type { InsertLogEvent, LogEvent } from '@shared/schema';
import { logger } from '../logger.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

interface LogFilters {
  level?: string;
  service?: string;
  userId?: string;
  startTime?: Date;
  endTime?: Date;
}

export class LoggingService {
  private static LOG_RETENTION_DAYS = 90;

  async log(
    level: LogLevel,
    service: string,
    message: string,
    context?: unknown,
    userId?: string,
    stackTrace?: string
  ): Promise<LogEvent> {
    const logData: InsertLogEvent = {
      level,
      service,
      message,
      userId: userId || null,
      context: context || null,
      stackTrace: stackTrace || null,
    };

    return storage.createLogEvent(logData);
  }

  async logDebug(
    service: string,
    message: string,
    context?: unknown,
    userId?: string
  ): Promise<LogEvent> {
    return this.log('debug', service, message, context, userId);
  }

  async logInfo(
    service: string,
    message: string,
    context?: unknown,
    userId?: string
  ): Promise<LogEvent> {
    return this.log('info', service, message, context, userId);
  }

  async logWarn(
    service: string,
    message: string,
    context?: unknown,
    userId?: string
  ): Promise<LogEvent> {
    return this.log('warn', service, message, context, userId);
  }

  async logError(
    service: string,
    message: string,
    error?: Error | any,
    context?: unknown,
    userId?: string
  ): Promise<LogEvent> {
    const stackTrace = error?.stack || (error instanceof Error ? error.stack : undefined);
    const errorContext = {
      ...context,
      errorMessage: error?.message,
      errorName: error?.name,
    };

    return this.log('error', service, message, errorContext, userId, stackTrace);
  }

  async logCritical(
    service: string,
    message: string,
    error?: Error | any,
    context?: unknown,
    userId?: string
  ): Promise<LogEvent> {
    const stackTrace = error?.stack || (error instanceof Error ? error.stack : undefined);
    const errorContext = {
      ...context,
      errorMessage: error?.message,
      errorName: error?.name,
    };

    return this.log('critical', service, message, errorContext, userId, stackTrace);
  }

  async queryLogs(filters: LogFilters, limit: number = 100): Promise<LogEvent[]> {
    return storage.queryLogs(filters, limit);
  }

  async cleanupOldLogs(): Promise<void> {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - LoggingService.LOG_RETENTION_DAYS);

    await storage.queryLogs(
      {
        endTime: retentionDate,
      },
      10000
    );
  }

  streamLogs(filters: LogFilters, callback: (log: LogEvent) => void): () => void {
    let isActive = true;

    const pollInterval = setInterval(async () => {
      if (!isActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const logs = await this.queryLogs(
          {
            ...filters,
            startTime: new Date(Date.now() - 5000),
          },
          50
        );

        logs.forEach((log) => callback(log));
      } catch (error: unknown) {
        logger.error('Error streaming logs:', error);
      }
    }, 2000);

    return () => {
      isActive = false;
      clearInterval(pollInterval);
    };
  }
}

export const loggingService = new LoggingService();

export const logDebug = loggingService.logDebug.bind(loggingService);
export const logInfo = loggingService.logInfo.bind(loggingService);
export const logWarn = loggingService.logWarn.bind(loggingService);
export const logError = loggingService.logError.bind(loggingService);
export const logCritical = loggingService.logCritical.bind(loggingService);
