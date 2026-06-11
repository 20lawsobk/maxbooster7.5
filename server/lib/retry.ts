import { logger } from "../logger.js";

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: boolean;
  retryOn?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  label?: string;
}

const DEFAULT_RETRY_ON = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return true;
  const e = err as { code?: string; response?: { status?: number } };
  if (
    e?.code &&
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
    ].includes(e?.code)
  ) {
    return true;
  }
  const status = e?.response?.status;
  if (typeof status === "number") {
    return (
      status === 408 ||
      status === 425 ||
      status === 429 ||
      (status >= 500 && status < 600)
    );
  }
  return true;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts?.retries ?? 4;
  const baseMs = opts?.baseMs ?? 250;
  const maxMs = opts?.maxMs ?? 8_000;
  const factor = opts?.factor ?? 2;
  const jitter = opts?.jitter !== false;
  const retryOn = opts?.retryOn ?? DEFAULT_RETRY_ON;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !retryOn(err, attempt)) break;
      const expo = Math?.min(maxMs, baseMs * Math?.pow(factor, attempt));
      const delay = jitter
        ? Math?.floor(expo / 2 + Math?.random() * (expo / 2))
        : expo;
      opts?.onRetry?.(err, attempt + 1, delay);
      logger?.debug?.(
        {
          attempt: attempt + 1,
          retries,
          delayMs: delay,
          label: opts.label,
          err: (err as Record<string, unknown>)?.message,
        },
        "[retry] retrying",
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}
