/** Narrow SendGrid alert transport. Acceptance is not a delivery receipt. */
export interface AlertEmailMessage {
  to: string[];
  from: string;
  subject: string;
  text: string;
  html: string;
}

export class AlertEmailTransportError extends Error {}

function address(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/u.test(value);
}

export async function sendSendGridAlert(
  message: AlertEmailMessage,
  apiKey: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ accepted: true; status: 202; messageId: string | null }> {
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 10_000 ||
      typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 1024 || /[\r\n]/.test(apiKey) ||
      !message || !Array.isArray(message.to) || !message.to.length || message.to.length > 100 ||
      !message.to.every(address) || !address(message.from) ||
      typeof message.subject !== "string" || !message.subject.trim() || message.subject.length > 998 || /[\r\n]/.test(message.subject) ||
      typeof message.text !== "string" || !message.text.trim() || typeof message.html !== "string" || !message.html.trim()) {
    throw new AlertEmailTransportError("Invalid SendGrid alert request");
  }
  const body = JSON.stringify({
    // Separate personalizations keep monitoring recipients private.
    personalizations: [...new Set(message.to)].map(email => ({ to: [{ email }] })),
    from: { email: message.from },
    subject: message.subject,
    content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }],
  });
  if (Buffer.byteLength(body, "utf8") > 1024 * 1024) {
    throw new AlertEmailTransportError("SendGrid alert exceeds the size limit");
  }
  try {
    const response = await (options.fetch ?? globalThis.fetch)("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });
    // Never log or retain an untrusted response body or provider credentials.
    await response.body?.cancel();
    if (response.status !== 202) {
      throw new AlertEmailTransportError(`SendGrid rejected alert (HTTP ${response.status})`);
    }
    const id = response.headers.get("x-message-id");
    return { accepted: true, status: 202, messageId: id && /^[\w.-]{1,200}$/.test(id) ? id : null };
  } catch (error) {
    if (error instanceof AlertEmailTransportError) throw error;
    throw new AlertEmailTransportError(
      error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
        ? "SendGrid alert timed out" : "SendGrid alert request failed",
    );
  }
}
