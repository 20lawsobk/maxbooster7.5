/**
 * Sentry Instrumentation
 *
 * This file MUST be imported FIRST before any other imports in server/index.ts
 * Sentry v8 uses OpenTelemetry auto-instrumentation for request tracing
 */

import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

// Initialize Sentry for error tracking (enabled in all environments, but only reports in production)
Sentry.init({
  dsn:
    process.env.NODE_ENV === 'production'
      ? process.env.SENTRY_DSN ||
        'https://160f9a7fe10a384154f5087b2139b2ee@o4510378512613376.ingest.us.sentry.io/4510378520936448'
      : undefined, // Don't send data in non-production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
  environment: process.env.NODE_ENV || 'development',
  beforeSend(event) {
    // Never send events in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }
    return event;
  },
});

if (process.env.NODE_ENV === 'production') {
  logger.info('✅ Sentry error tracking initialized (production mode)');
} else {
  logger.info('✅ Sentry instrumentation loaded (development mode - no data sent)');
}
