// @ts-nocheck
import { Router, raw } from "express";
import { emailTrackingService } from "../../services/emailTrackingService.js";
import { logger } from "../../logger.js";

const router = Router();

/**
 * SendGrid Event Webhook
 * Handles delivery events: delivered, bounce, spam, unsubscribe, open, click
 * SECURED with signature verification
 */
router.post("/", raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers[
      "x-twilio-email-event-webhook-signature"
    ] as string;
    const timestamp = req.headers[
      "x-twilio-email-event-webhook-timestamp"
    ] as string;
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.isBuffer(req.body) ? req.body : null;
    if (!rawBody) return res.status(400).json({ error: "Exact webhook body bytes are required" });

    if (
      !process.env.SENDGRID_WEBHOOK_PUBLIC_KEY
    ) {
      logger.warn(
        "❌ CRITICAL: SendGrid webhook public key not configured in production",
      );
      return res
        .status(500)
        .json({ error: "Webhook verification not configured" });
    }

    {
      if (!signature || !timestamp) {
        logger.warn("⚠️  SendGrid webhook missing required signature headers");
        return res.status(401).json({ error: "Missing signature headers" });
      }

      const isValid = emailTrackingService?.verifySendGridSignature(
        rawBody,
        signature,
        timestamp,
      );

      if (!isValid) {
        logger.warn("⚠️  SendGrid webhook signature verification failed");
        return res.status(401).json({ error: "Signature verification failed" });
      }
    }

    let payload;
    try { payload = JSON.parse(rawBody.toString("utf8")); }
    catch { return res.status(400).json({ error: "Invalid webhook JSON" }); }
    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const {
        sg_message_id,
        
        event: eventType,
        timestamp: eventTimestamp,
        reason,
        smtp_response,
      } = event;

      if (!sg_message_id || !eventType) {
        continue;
      }
      const mapped = mapSendGridEventType(eventType);
      if (!mapped) continue;
      if (!Number.isFinite(Number(eventTimestamp))) return res.status(400).json({ error: "Invalid event timestamp" });

      await emailTrackingService?.recordEmailEvent({
        messageId: sg_message_id,
        eventType: mapped,
        eventAt: new Date(eventTimestamp * 1000),
        smtpResponse: smtp_response,
        reason,
        metadata: event,
      });
    }

    res.status(200).json({ received: true });
  } catch (error: unknown) {
    logger.warn({ err: error }, "SendGrid webhook error:");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/**
 * Map SendGrid event types to our enum
 */
function mapSendGridEventType(
  eventType: string,
):
  | "delivered"
  | "bounce"
  | "spam"
  | "unsubscribe"
  | "open"
  | "click"
  | "deferred"
  | "dropped"
  | null {
  const typeMap: Record<string, any> = {
    delivered: "delivered",
    bounce: "bounce",
    dropped: "dropped",
    spamreport: "spam",
    unsubscribe: "unsubscribe",
    open: "open",
    click: "click",
    deferred: "deferred",
  };

  return typeMap[eventType] || null;
}

export default router;
