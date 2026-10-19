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
