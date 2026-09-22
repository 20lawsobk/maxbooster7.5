import twilio from "twilio";
import type { Request } from "express";

/** Use the configured public callback URL, never attacker-controlled Host headers.
 * Twilio signs the form parameters (unlike email providers' raw JSON bytes). */
export function verifySmsWebhook(req: Request, action: "status" | "incoming"): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.APP_URL;
  if (!token || !base || !base.startsWith("https://")) return false;
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.values(body).some(value => typeof value !== "string")) return false;
  return twilio.validateRequest(token, req.get("x-twilio-signature") || "",
    `${base.replace(/\/$/, "")}/api/notifications/sms/${action}`, body as Record<string, string>);
}