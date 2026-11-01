/**
 * BullMQ must acknowledge an email job only after the provider confirms that
 * it accepted the message. A resolved SDK promise can still contain an error.
 * Provider acceptance is NOT proof of inbox delivery.
 */
export function requireAcceptedEmail(
  response: { data?: { id?: string } | null; error?: unknown } | null | undefined,
): string {
  if (!response || response.error) {
    throw new Error("Email provider rejected the send request");
  }
  const messageId = response.data?.id;
  if (typeof messageId !== "string" || messageId.trim().length === 0) {
    throw new Error("Email provider did not confirm a message ID");
  }
  return messageId;
}

/** Reject missing credentials before BullMQ is allowed to acknowledge a job. */
export function requireEmailSettings(
  apiKey: string | undefined,
  sender: string | undefined,
): { apiKey: string; sender: string } {
  if (!apiKey?.trim()) throw new Error("Email provider credentials are not configured");
  if (!sender?.trim()) throw new Error("Email sender is not configured");
  return { apiKey: apiKey.trim(), sender: sender.trim() };
}

/** Resend only promises idempotency inside a 24-hour provider window.
 * Use the original durable BullMQ enqueue timestamp as a conservative lower
 * bound on the first send. An old job must be reconciled, never silently sent
 * again with an expired idempotency key.
 */
export const EMAIL_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function requireRetrySafeEmailJob(
  jobId: string | undefined,
  queuedAtMs: number | undefined,
  nowMs = Date.now(),
): string {
  if (typeof jobId !== "string" || !/^[A-Za-z0-9._-]{1,200}$/.test(jobId)) {
    throw new Error("Email job requires a stable bounded queue ID");
  }
  if (!Number.isSafeInteger(queuedAtMs) || !Number.isSafeInteger(nowMs) ||
      (queuedAtMs ?? 0) <= 0 || nowMs < (queuedAtMs ?? 0) ||
      nowMs - (queuedAtMs ?? 0) >= EMAIL_IDEMPOTENCY_WINDOW_MS) {
    throw new Error("Email job is outside the safe provider retry window; manual reconciliation required");
  }
  return `maxbooster-email-${jobId}`;
}
