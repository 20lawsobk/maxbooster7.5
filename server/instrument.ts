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

process.on('uncaughtException', (err) => {
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
