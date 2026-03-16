/**
 * Mandatory Observability
 *
 * This file MUST be imported FIRST in server/index.ts.
 * In production, unhandled errors are always captured — to Sentry when configured,
 * and always to structured JSON logs. Observability cannot fail open.
 */

import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

const isProduction = process.env.NODE_ENV === 'production';
const dsn = process.env.SENTRY_DSN;

// Many subsystems (circuit breakers, workers, reliability monitors) each attach
// listeners to the global process object.  Raise the cap to silence the Node.js
// MaxListeners warning that would otherwise fire at > 10 listeners.
process.setMaxListeners(50);

Sentry.init({
  dsn: isProduction ? dsn : undefined,
  tracesSampleRate: isProduction ? 0.2 : 0,
  profilesSampleRate: isProduction ? 0.05 : 0,
  environment: process.env.NODE_ENV || 'development',
  beforeSend(event) {
    if (!isProduction) return null;
    return event;
  },
});

// Pipe/stream errors (EPIPE, ECONNRESET, ECONNABORTED) are non-fatal — they occur
// when a client disconnects mid-stream or an FFmpeg/child process exits while
// Node.js is still writing to it. Log them as warnings and continue.
const NON_FATAL_CODES = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);

process.on('uncaughtException', (err) => {
  const code = (err as NodeJS.ErrnoException).code;
  if (code && NON_FATAL_CODES.has(code)) {
    logger.warn({ err, type: 'non-fatal-uncaughtException', code }, `Non-fatal ${code}: ${err.message}`);
    return;
  }
  logger.error({ err, type: 'uncaughtException' }, `FATAL uncaughtException: ${err.message}`);
  if (isProduction) Sentry.captureException(err);
  Sentry.close(2000).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason: any) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err, type: 'unhandledRejection' }, `unhandledRejection: ${err.message}`);
  if (isProduction) Sentry.captureException(err);
});

if (isProduction) {
  logger.info('✅ [Observability] Sentry active — errors will be captured and reported');
} else {
  logger.info('✅ [Observability] Structured error logging active (Sentry disabled in dev)');
}

export { Sentry };
