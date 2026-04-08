/**
 * Mandatory Observability
 *
 * This file MUST be imported FIRST in server/index.ts.
 * In production, unhandled errors are always captured — to Sentry when configured,
 * and always to structured JSON logs. Observability cannot fail open.
 *
 * DESIGN RULE: This module only OBSERVES — it never calls process.exit().
 * Graceful shutdown (HTTP server close + DB pool drain) is the exclusive
 * responsibility of server/index.ts. Calling exit here would race against
 * that cleanup and leave connections open / requests half-answered.
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

// Non-fatal error codes — pipe/stream/network disconnects that occur during
// normal operation and must never trigger a shutdown or Sentry alert.
const NON_FATAL_CODES = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);

// Non-fatal message patterns — transient PDIM, LuaExecutor, and BullMQ errors
// expected under load and handled automatically by the ChainFixer / circuit breaker.
const NON_FATAL_MSG = /EPIPE|ECONNRESET|ECONNABORTED|ECONNREFUSED|AbortError|fetch failed|Failed to fetch|Command timed out|Connection is closed|\[PDIM\] Circuit OPEN|\[LuaExecutor\] script timeout|\[LuaExecutor\] Wait queue saturated|erroredJobIds|PDIM.*Circuit|LuaExecutor.*timeout/i;

// Completely silent patterns — circuit-open rejections already logged by the
// circuit breaker itself; logging them again here just duplicates the stack.
const SILENT_MSG = /\[LuaExecutor\] PDIM circuit OPEN|PDIM circuit OPEN.*skipping Worker|Circuit OPEN.*skipping/i;

process.on('uncaughtException', (err) => {
  const code = (err as NodeJS.ErrnoException).code;

  // Non-fatal stream/pipe errors — log as warn and continue.
  if (code && NON_FATAL_CODES.has(code)) {
    logger.warn({ err, type: 'non-fatal-uncaughtException', code }, `Non-fatal ${code}: ${err.message}`);
    return;
  }

  // Fatal: capture to Sentry + structured log.
  // Do NOT call process.exit() here — server/index.ts registers its own
  // uncaughtException handler that performs the full graceful shutdown
  // (HTTP server close → DB pool drain → process.exit).  Calling exit here
  // would race against that cleanup and terminate the process before in-flight
  // requests/queries have had a chance to complete.
  logger.warn({ err, type: 'uncaughtException' }, `FATAL uncaughtException: ${err.message}`);
  if (isProduction) Sentry.captureException(err);
  // Flush Sentry in background — index.ts gives the process 10 s to shut down,
  // which is sufficient time for an 8-second Sentry flush.
  Sentry.flush(8000).catch(() => { /* best-effort, must not throw */ });
});

process.on('unhandledRejection', (reason: any) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const code = (reason as NodeJS.ErrnoException)?.code;

  // Completely silent: circuit-open rejections are already owned by the
  // circuit breaker's own rate-limited logging — duplicating them here
  // with a full stack trace adds no signal, only noise.
  if (SILENT_MSG.test(err.message)) return;

  // Non-fatal: expected transient errors from PDIM / LuaExecutor / BullMQ.
  if ((code && NON_FATAL_CODES.has(code)) || NON_FATAL_MSG.test(err.message)) {
    logger.warn({ err, type: 'non-fatal-unhandledRejection' }, `Non-fatal rejection: ${err.message}`);
    return;
  }

  logger.warn({ err, type: 'unhandledRejection' }, `unhandledRejection: ${err.message}`);
  if (isProduction) Sentry.captureException(err);
});

if (isProduction) {
  logger.info('✅ [Observability] Sentry active — errors will be captured and reported');
} else {
  logger.info('✅ [Observability] Structured error logging active (Sentry disabled in dev)');
}

export { Sentry };
