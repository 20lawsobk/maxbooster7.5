import twilio from "twilio";
import { pool } from "../db.js";
import { notificationAllowed, notificationCategory } from "./notificationPreferences.js";
import type { Request, Response } from "express";
import { verifySmsWebhook } from "./smsWebhookVerification.js";

export async function sendSmsNotification(input: {
  userId: string; operationKey: string; preferences: unknown; type: string; title: string; message: string;
}): Promise<{ accepted: boolean; state: string; messageId?: string }> {
  const settings = input.preferences as any;
  if (!notificationAllowed(settings, input.type, "sms") ||
      !settings?.sms?.consentedAt || settings.sms.stoppedAt ||
      !["account_security", "royalties"].includes(notificationCategory(input.type))) {
    return { accepted: false, state: "not_eligible" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const base = process.env.APP_URL;
  if (!sid || !token || !service || !base || !base.startsWith("https://")) {
    throw new Error("SMS notifications require Twilio Messaging Service credentials and a public HTTPS APP_URL");
  }
  const claim = await pool.query(
    `INSERT INTO integration_sms_attempts(operation_key,user_id,state) VALUES($1,$2,'started')
     ON CONFLICT DO NOTHING RETURNING operation_key`, [input.operationKey, input.userId],
  );
  if (!claim.rows.length) {
    const existing = await pool.query(`SELECT state,provider_id FROM integration_sms_attempts WHERE operation_key=$1 AND user_id=$2`, [input.operationKey, input.userId]);
    const row = existing.rows[0];
    return { accepted: row?.state === "accepted" || row?.state === "delivered", state: row?.state || "unknown", messageId: row?.provider_id };
  }
  try {
    const result = await twilio(sid, token, { autoRetry: false }).messages.create({
      to: settings.sms.phoneNumber,
      messagingServiceSid: service,
      body: `Max Booster: ${input.title}\n${input.message}`.slice(0, 1400) + "\nReply STOP to opt out.",
      statusCallback: `${base.replace(/\/$/, "")}/api/notifications/sms/status`,
    });
    if (!result.sid) throw new Error("Twilio returned no message receipt");
    await pool.query(
      `UPDATE integration_sms_attempts SET state='accepted',provider_id=$2,provider_status=$3,updated_at=now()
       WHERE operation_key=$1`, [input.operationKey, result.sid, result.status],
    );
    return { accepted: true, state: "accepted", messageId: result.sid };
  } catch (error) {
    await pool.query(
      `UPDATE integration_sms_attempts SET state='unknown',error=$2,updated_at=now() WHERE operation_key=$1`,
      [input.operationKey, error instanceof Error ? error.message : "SMS outcome unknown"],
    );
    return { accepted: false, state: "unknown" }; // No automatic replay after ambiguity.
  }
}

export async function smsStatusCallback(req: Request, res: Response) {
  if (!verifySmsWebhook(req, "status")) return res.sendStatus(403);
  const { MessageSid, MessageStatus, ErrorCode } = req.body;
  if (!MessageSid || !["queued", "sending", "sent", "delivered", "undelivered", "failed"].includes(MessageStatus)) return res.sendStatus(400);
  try {
    const receipt = await pool.query(
      `UPDATE integration_sms_attempts SET provider_status=$2,
       state=CASE WHEN $2='delivered' THEN 'delivered' WHEN $2 IN ('failed','undelivered') THEN 'failed' ELSE state END,
       error=$3,updated_at=now() WHERE provider_id=$1 AND state NOT IN ('delivered','failed') RETURNING operation_key`,
      [MessageSid, MessageStatus, ErrorCode || null],
    );
    if (!receipt.rows.length) {
      const existing = await pool.query(`SELECT operation_key FROM integration_sms_attempts WHERE provider_id=$1`, [MessageSid]);
      if (!existing.rows.length) return res.sendStatus(503); // Receipt may race the acceptance checkpoint.
    }
    return res.sendStatus(204);
  } catch { return res.sendStatus(500); }
}
export async function smsIncomingCallback(req: Request, res: Response) {
  if (!verifySmsWebhook(req, "incoming")) return res.sendStatus(403);
  const stop = req.body.OptOutType === "STOP" || /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(String(req.body.Body || "").trim());
  try {
    if (stop && typeof req.body.From === "string") {
      await pool.query(
        `UPDATE users SET notification_settings=jsonb_set(COALESCE(notification_settings,'{}'::jsonb),'{sms}',
          COALESCE(notification_settings->'sms','{}'::jsonb) || jsonb_build_object('enabled',false,'stoppedAt',now()))
         WHERE notification_settings->'sms'->>'phoneNumber'=$1`, [req.body.From],
      );
    }
    // START does not recreate app consent automatically.
    return res.type("text/xml").send("<Response/>");
  } catch { return res.sendStatus(500); }
}