export interface StartupDatabaseRetryEvent {
  failedAttempt: number;
  nextAttempt: number;
  delayMs: number;
}

export interface StartupDatabaseRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  onRetry?: (event: StartupDatabaseRetryEvent) => void;
}

const TRANSIENT_CONNECTION_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EPIPE",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
]);

const TRANSIENT_CONNECTION_MESSAGES = [
  /connection terminated due to connection timeout/i,
  /websocket was closed before the connection was established/i,
  /websocket.*(?:closed|failed).*connection/i,
  /socket hang up/i,
  /connect(?:ion)? timed? out/i,
  /connection reset by peer/i,
  /server closed the connection unexpectedly/i,
  /temporarily unavailable/i,
];

export function isTransientDatabaseConnectionError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      originalError?: unknown;
    };
    if (
      typeof candidate.code === "string" &&
      TRANSIENT_CONNECTION_CODES.has(candidate.code.toUpperCase())
    ) {
      return true;
    }

    if (
      typeof candidate.message === "string" &&
      TRANSIENT_CONNECTION_MESSAGES.some((pattern) =>
        pattern.test(candidate.message as string),
      )
    ) {
      return true;
    }

    if (candidate.cause) pending.push(candidate.cause);
    if (candidate.originalError) pending.push(candidate.originalError);
  }

  return false;
}

/**
 * Retry only connection-level database failures during startup. Schema,
 * authentication, permission, and query errors remain immediate failures.
 */
export async function withStartupDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: StartupDatabaseRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 4));
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 500);
  const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? 4_000);
  const jitterMs = Math.max(0, options.jitterMs ?? 250);
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientDatabaseConnectionError(error)) {
        throw error;
      }

      const exponentialDelay = Math.min(
        initialDelayMs * 2 ** (attempt - 1),
        maxDelayMs,
      );
      const jitter = Math.floor(Math.max(0, Math.min(0.999999, random())) * jitterMs);
      const delayMs = exponentialDelay + jitter;
      options.onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  throw new Error("Unreachable startup database retry state");
}
