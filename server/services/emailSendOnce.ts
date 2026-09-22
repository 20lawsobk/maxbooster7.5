export interface SendOnceRequest {
  /** Stable caller-owned operation key, reused only for identical recipient/content. */
  operationKey: string;
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
}
export type SendOnceResult =
  | { status: "accepted"; operationKey: string; messageId: string }
  | { status: "rejected"; operationKey: string; error: string }
  | { status: "unknown"; operationKey: string; error: string };

export interface EmailAcceptanceProvider {
  emails: { send: (data: any, options: { idempotencyKey: string }) => Promise<any> };
}

/** One transport attempt only. Accepted means queued by Resend, NOT delivered.
 * Resend's idempotency window is 24 hours; callers must persist the receipt and
 * must not blindly retry unknown outcomes after that window.
 */
export async function sendEmailOnce(
  provider: EmailAcceptanceProvider | null, request: SendOnceRequest,
): Promise<SendOnceResult> {
  const { operationKey, ...email } = request;
  if (!operationKey || operationKey.length > 256 || /[\r\n]/.test(operationKey)) {
    throw new Error("A stable email operation key of 1–256 characters is required");
  }
  if (!email.to || !email.from || !email.subject || (!email.html && !email.text)) {
    throw new Error("Email recipient, sender, subject and content are required");
  }
  if (!provider) return { status: "rejected", operationKey, error: "Email provider is not configured" };
  try {
    const result = await provider.emails.send(email, { idempotencyKey: operationKey });
    if (result?.data?.id && !result.error) {
      return { status: "accepted", operationKey, messageId: result.data.id };
    }
    const error = result?.error;
    // Transport failures/server errors cannot prove the request was not accepted.
    const rejectionNames = ["validation_error", "missing_required_field", "invalid_access", "restricted_api_key", "invalid_idempotency_key", "invalid_parameter", "idempotency_key_conflict"];
    const rejected = rejectionNames.includes(error?.name) ||
      (typeof error?.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 408);
    return {
      status: rejected ? "rejected" : "unknown", operationKey,
      error: error?.message || "Provider returned no email acceptance receipt",
    };
  } catch {
    return { status: "unknown", operationKey, error: "Email transport ended without a definitive provider receipt" };
  }
}