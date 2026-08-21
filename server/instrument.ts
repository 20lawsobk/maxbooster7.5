/**
 * Mandatory Observability
 *
 * This file MUST be imported FIRST in server/index?.ts.
 * In production, unhandled errors are always captured — to Sentry when configured,
 * and always to structured JSON logs. Observability cannot fail open.
 *
 * DESIGN RULE: This module only OBSERVES — it never calls process.exit().
 * Graceful shutdown (HTTP server close + DB pool drain) is the exclusive
 * responsibility of server/index?.ts. Calling exit here would race against
 * that cleanup and leave connections open / requests half-answered.
 *
 * RESILIENCE: @sentry/node is loaded via a dynamic try/catch require so that a
 * missing package (e?.g. incomplete node_modules after PDIM capsule restore) never
 * crashes the entire server process.  If Sentry is unavailable, all error events
 * fall through to the structured JSON logger — no silent swallowing of errors.
 */

import { createRequire } from "module";
import { logger } from "./logger.js";
import { env } from "./config/env.js";

const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
const dsn = env?.SENTRY_DSN;

// Many subsystems (circuit breakers, workers, reliability monitors) each attach
// listeners to the global process object.  Raise the cap to silence the Node?.js
// MaxListeners warning that would otherwise fire at > 10 listeners.
process.setMaxListeners(50);

// ── Dynamic Sentry load — safe even when @sentry/node is absent ──────────────
// Using createRequire() inside a try/catch works in both ESM (development, tsx)
// and CJS (production bundle — esbuild converts import.meta.url to __filename).
// A missing module is caught gracefully instead of crashing the worker.
const _moduleRequire = createRequire(import.meta.url);
type SentryModule = typeof import("@sentry/node");
let Sentry: SentryModule | null = null;

try {
  Sentry = _moduleRequire("@sentry/node") as SentryModule;
  Sentry?.init({
    dsn: isProduction ? dsn : undefined,
    tracesSampleRate: isProduction ? 0.2 : 0,
    profilesSampleRate: isProduction ? 0.05 : 0,
    environment: process.env.NODE_ENV || "development",
    beforeSend(event) {
      if (!isProduction) return null;
      // ── Noise filter — keep the alert stream actionable ──────────────────
      // Only the first matching rule suppresses; fall through means "send it".
      const exMsg = event?.exception?.values?.[0]?.value ?? "";
      const evMsg = typeof event?.message === "string" ? event.message : "";
      const combined = `${exMsg} ${evMsg}`;
      // 1. 401/403 auth responses are normal user-facing flows, not bugs.
      if (/\b(401|403)\b/.test(combined) && /auth|unauthorized|forbidden/i.test(combined)) return null;
      // 2. PDIM 429 rate-limits — handled automatically by the circuit breaker.
      if (/429|rate.?limit/i.test(combined) && /pdim/i.test(combined)) return null;
      // 3. All patterns in NON_FATAL_MSG / SILENT_MSG (PDIM cold-start,
      //    LuaExecutor timeouts, BullMQ transients, etc.) — already handled
      //    by their own subsystems.
      if (NON_FATAL_MSG.test(combined) || SILENT_MSG.test(combined)) return null;
      return event;
    },
  });
} catch (loadErr) {
  // @sentry/node not available — observability degraded to structured local logs.
  // This is non-fatal: the server continues running; all errors are still logged.
  logger.warn(
    { err: loadErr },
    "[Observability] @sentry/node unavailable — Sentry disabled, local logging active",
  );
}

// Non-fatal error codes — pipe/stream/network disconnects that occur during
// normal operation and must never trigger a shutdown or Sentry alert.
const NON_FATAL_CODES = new Set(["EPIPE", "ECONNRESET", "ECONNABORTED"]);

// Non-fatal message patterns — transient PDIM, LuaExecutor, and BullMQ errors
// expected under load and handled automatically by the ChainFixer / circuit breaker.
const NON_FATAL_MSG =
  /EPIPE|ECONNRESET|ECONNABORTED|ECONNREFUSED|AbortError|fetch failed|Failed to fetch|Command timed out|Connection is closed|\[PDIM\] Circuit OPEN|\[LuaExecutor\] script timeout|\[LuaExecutor\] Wait queue saturated|erroredJobIds|PDIM.*Circuit|LuaExecutor.*timeout/i;

// Completely silent patterns — circuit-open rejections already logged by the
// circuit breaker itself; logging them again here just duplicates the stack.
const SILENT_MSG =
  /\[LuaExecutor\] PDIM circuit OPEN|PDIM circuit OPEN.*skipping Worker|Circuit OPEN.*skipping/i;

process.on("uncaughtException", (err) => {
  const code = (err as NodeJS.ErrnoException).code;

  // Non-fatal stream/pipe errors — log as warn and continue.
  if (code && NON_FATAL_CODES?.has(code)) {
    logger.warn(
      { err, type: "non-fatal-uncaughtException", code },
      `Non-fatal ${code}: ${err?.message}`,
    );
    return;
  }

  // Fatal: capture to Sentry + structured log.
  // Do NOT call process.exit() here — server/index?.ts registers its own
  // uncaughtException handler that performs the full graceful shutdown
  // (HTTP server close → DB pool drain → process.exit).  Calling exit here
  // would race against that cleanup and terminate the process before in-flight
  // requests/queries have had a chance to complete.
  logger.warn(
    { err, type: "uncaughtException" },
    `FATAL uncaughtException: ${err?.message}`,
  );
  if (isProduction && Sentry) Sentry?.captureException(err);
  // Flush Sentry in background — index?.ts gives the process 10 s to shut down,
  // which is sufficient time for an 8-second Sentry flush.
  if (Sentry)
    Sentry?.flush(8000).catch(() => {
      /* best-effort, must not throw */
    });
});

process.on("unhandledRejection", (reason: Record<string, unknown>) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const code = (reason as unknown as NodeJS.ErrnoException)?.code;

  // Completely silent: circuit-open rejections are already owned by the
  // circuit breaker's own rate-limited logging — duplicating them here
  // with a full stack trace adds no signal, only noise.
  if (SILENT_MSG?.test(err?.message)) return;

  // Non-fatal: expected transient errors from PDIM / LuaExecutor / BullMQ.
  if ((code && NON_FATAL_CODES?.has(code)) || NON_FATAL_MSG?.test(err?.message)) {
    logger.warn(
      { err, type: "non-fatal-unhandledRejection" },
      `Non-fatal rejection: ${err?.message}`,
    );
    return;
  }

  logger.warn(
    { err, type: "unhandledRejection" },
    `unhandledRejection: ${err?.message}`,
  );
  if (isProduction && Sentry) Sentry?.captureException(err);
});

if (isProduction) {
  if (Sentry) {
    logger.info(
      "✅ [Observability] Sentry active — errors will be captured and reported",
    );
  } else {
    logger.warn(
      "⚠️  [Observability] Sentry unavailable — structured JSON logging only (check @sentry/node installation)",
    );
  }
} else {
  logger.info(
    "✅ [Observability] Structured error logging active (Sentry disabled in dev)",
  );
}

export { Sentry };

/**
 * Report an exception to Sentry.
 * No-op in dev, or when Sentry is unavailable / not configured.
 * Import this instead of importing @sentry/node directly in service modules.
 */
export function captureSentryException(
  err: Error,
  extra?: Record<string, unknown>,
): void {
  if (!isProduction || !Sentry) return;
  try {
    Sentry.captureException(err, extra ? { extra } : undefined);
  } catch { /* best-effort — must never throw */ }
}

/**
 * Send a message-level event to Sentry.
 * No-op in dev, or when Sentry is unavailable / not configured.
 */
export function captureSentryMessage(
  msg: string,
  level: "info" | "warning" | "error" = "warning",
  extra?: Record<string, unknown>,
): void {
  if (!isProduction || !Sentry) return;
  try {
    Sentry.captureMessage(msg, { level, extra });
  } catch { /* best-effort */ }
}

// ── Sentry-silence detection ─────────────────────────────────────────────
// Sentry can go quiet for reasons that never throw locally: a revoked DSN,
// Sentry-side ingestion outage, or an egress/firewall change blocking
// sentry.io — the SDK call itself still "succeeds" (queues the event) even
// though nothing is ever delivered. Sentry.flush() is the one signal that
// actually confirms the transport finished sending queued events, so the
// heartbeat below uses it rather than trusting captureMessage() alone.
let lastSentryHeartbeatOkAt: number | null = null;
let lastSentryHeartbeatAttemptAt: number | null = null;
let lastSentryHeartbeatFailed = false;
const SENTRY_SILENCE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

async function sendSentryHeartbeat(): Promise<void> {
  if (!isProduction || !Sentry) return;
  lastSentryHeartbeatAttemptAt = Date.now();
  try {
    Sentry.captureMessage("[Heartbeat] Sentry delivery check", {
      level: "info",
      tags: { heartbeat: "true" },
    });
    const flushed = await Sentry.flush(8000);
    if (flushed) {
      lastSentryHeartbeatOkAt = Date.now();
      lastSentryHeartbeatFailed = false;
    } else {
      lastSentryHeartbeatFailed = true;
      logger.warn(
        "[Observability] Sentry heartbeat did not confirm delivery within 8s flush window",
      );
    }
  } catch (err) {
    lastSentryHeartbeatFailed = true;
    logger.warn({ err }, "[Observability] Sentry heartbeat send failed");
  }
}

/**
 * Snapshot of Sentry delivery health for /api/ready and alerting.
 * `silentForMs` is null until the first heartbeat attempt completes.
 */
export function getSentryHeartbeatStatus(): {
  configured: boolean;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastAttemptFailed: boolean;
  silentForMs: number | null;
  isSilent: boolean;
} {
  const configured = isProduction && !!Sentry && !!dsn;
  const silentForMs = lastSentryHeartbeatOkAt
    ? Date.now() - lastSentryHeartbeatOkAt
    : lastSentryHeartbeatAttemptAt
      ? Date.now() - lastSentryHeartbeatAttemptAt
      : null;
  return {
    configured,
    lastSuccessAt: lastSentryHeartbeatOkAt,
    lastAttemptAt: lastSentryHeartbeatAttemptAt,
    lastAttemptFailed: lastSentryHeartbeatFailed,
    silentForMs,
    isSilent: configured && silentForMs !== null && silentForMs > SENTRY_SILENCE_THRESHOLD_MS,
  };
}

let sentryHeartbeatTimer: NodeJS.Timeout | null = null;
let sentrySilenceAlertTimer: NodeJS.Timeout | null = null;

/**
 * Starts a periodic Sentry delivery heartbeat plus a silence watchdog that
 * pages operators (via AlertingService — email/webhook, independent of
 * Sentry) when no confirmed delivery has happened in 24+ hours. No-op
 * outside production or when Sentry isn't configured, since "silent" is
 * only meaningful when Sentry is expected to be receiving events.
 */
export function startSentryHeartbeatMonitor(): void {
  if (!isProduction || !Sentry || !dsn) return;
  if (sentryHeartbeatTimer) return; // already started

  // First heartbeat shortly after boot, then hourly.
  const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;
  const SILENCE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

  setTimeout(() => void sendSentryHeartbeat(), 15_000);
  sentryHeartbeatTimer = setInterval(
    () => void sendSentryHeartbeat(),
    HEARTBEAT_INTERVAL_MS,
  );
  sentryHeartbeatTimer.unref?.();

  sentrySilenceAlertTimer = setInterval(() => {
    const status = getSentryHeartbeatStatus();
    if (!status.isSilent) return;
    const hours = status.silentForMs
      ? Math.round(status.silentForMs / (60 * 60 * 1000))
      : null;
    logger.warn(
      { status },
      `[Observability] Sentry has not confirmed delivery in ~${hours}h — paging operators via AlertingService`,
    );
    import("./monitoring/alertingService.js")
      .then(({ alertingService }) => {
        alertingService?.sendAlert({
          severity: "critical",
          title: "Sentry error reporting is silent",
          message: `No confirmed Sentry event delivery in ~${hours}h. Error tracking may be blind — check the DSN, egress to sentry.io, and Sentry project status.`,
          timestamp: new Date(),
          metadata: status,
        });
      })
      .catch((err) => {
        logger.warn(
          { err },
          "[Observability] Failed to dispatch Sentry-silence alert via AlertingService",
        );
      });
  }, SILENCE_CHECK_INTERVAL_MS);
  sentrySilenceAlertTimer.unref?.();

  logger.info(
    "✅ [Observability] Sentry silence watchdog active (heartbeat hourly, alert threshold 24h)",
  );
}
