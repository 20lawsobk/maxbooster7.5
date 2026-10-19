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
