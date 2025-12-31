import { structuredLogger, createLogger, StructuredLogger } from './services/structuredLogger.ts';

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      structuredLogger.info(message, args[0] as Record<string, unknown>);
    } else if (args.length > 0) {
      structuredLogger.info(message, { args });
    } else {
      structuredLogger.info(message);
    }
  },
  error: (message: string, ...args: unknown[]) => {
    if (args.length === 1 && args[0] instanceof Error) {
      structuredLogger.error(message, args[0]);
    } else if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      structuredLogger.error(message, args[0] as Record<string, unknown>);
    } else if (args.length > 0) {
      const firstArg = args[0];
      if (firstArg instanceof Error) {
        structuredLogger.error(message, firstArg, args.length > 1 ? { additionalArgs: args.slice(1) } : undefined);
      } else {
        structuredLogger.error(message, { args });
      }
    } else {
      structuredLogger.error(message);
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      structuredLogger.warn(message, args[0] as Record<string, unknown>);
    } else if (args.length > 0) {
      structuredLogger.warn(message, { args });
    } else {
      structuredLogger.warn(message);
    }
  },
  debug: (message: string, ...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      structuredLogger.debug(message, args[0] as Record<string, unknown>);
    } else if (args.length > 0) {
      structuredLogger.debug(message, { args });
    } else {
      structuredLogger.debug(message);
    }
  },
};

export { structuredLogger, createLogger, StructuredLogger };

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  logger.info(`${formattedTime} [${source}] ${message}`);
}
