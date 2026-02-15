type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
  context?: string;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
  }

  private formatLog(level: LogLevel, message: string, data?: unknown, context?: string): LogEntry {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) {
      return true;
    }

    return level === 'error' || level === 'warn';
  }

  private log(level: LogLevel, message: string, data?: unknown, context?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatLog(level, message, data, context);

    if (this.isDevelopment) {
      const prefix = `[${level.toUpperCase()}]${context ? ` [${context}]` : ''}`;
      const style = this.getConsoleStyle(level);

      if (data !== undefined) {
        console.log(`%c${prefix} ${message}`, style, data);
      } else {
        console.log(`%c${prefix} ${message}`, style);
      }
    } else {
      if (level === 'error') {
        console.error(logEntry.message, logEntry.data);
      }
    }
  }

  private getConsoleStyle(level: LogLevel): string {
    const styles = {
      info: 'color: #3b82f6; font-weight: bold',
      warn: 'color: #f59e0b; font-weight: bold',
      error: 'color: #ef4444; font-weight: bold',
      debug: 'color: #8b5cf6; font-weight: bold',
    };
    return styles[level];
  }

  info(message: string, data?: unknown, context?: string): void {
    this.log('info', message, data, context);
  }

  warn(message: string, data?: unknown, context?: string): void {
    this.log('warn', message, data, context);
  }

  error(message: string, data?: unknown, context?: string): void {
    this.log('error', message, data, context);
  }

  debug(message: string, data?: unknown, context?: string): void {
    this.log('debug', message, data, context);
  }
}

export const logger = new Logger();
