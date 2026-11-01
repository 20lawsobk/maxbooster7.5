import { Resend } from "resend";

export interface FanMailCommand {
  commandKey: string;
  to: string;
  subject: string;
  html: string;
}
export type FanMailReceipt =
  | { status: "accepted"; provider: "resend"; providerMessageId: string }
  | { status: "unknown"; reason: string };

/** One external attempt; no shared transport retry queue or success without receipt. */
export async function sendTransactionalNoRetry(command: FanMailCommand): Promise<FanMailReceipt> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Fan email requires RESEND_API_KEY and a verified sender address");
  const client = new Resend(apiKey);
  try {
    const result = await client.emails.send({
      from, to: command.to, subject: command.subject, html: command.html,
    }, { idempotencyKey: command.commandKey });
    if (result.error || !result.data?.id)
      return { status: "unknown", reason: result.error?.message ?? "Provider returned no acceptance receipt" };
    return { status: "accepted", provider: "resend", providerMessageId: result.data.id };
  } catch (error) {
    return { status: "unknown", reason: error instanceof Error ? error.message : "Unknown provider outcome" };
  }
}