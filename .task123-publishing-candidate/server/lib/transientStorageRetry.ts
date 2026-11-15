const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function isTransientStorageTransportError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "object") {
      const candidate = current as {
        code?: unknown;
        name?: unknown;
        cause?: unknown;
      };
      if (typeof candidate.code === "string" && TRANSIENT_CODES.has(candidate.code)) {
        return true;
      }
      if (candidate.name === "AbortError" || candidate.name === "TimeoutError") {
        return true;
      }
      current = candidate.cause;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Retry only explicitly identified transient transport failures. Data
 * validation, authorization, and corruption errors fail immediately.
 */
export async function retryTransientStorageOperation<T>(
  operation: () => Promise<T>,
  options: { delaysMs?: number[] } = {},
): Promise<T> {
  const delays = options.delaysMs ?? [100, 300];
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= delays.length || !isTransientStorageTransportError(error)) {
        throw error;
      }
      const delay = delays[attempt];
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
