import { Router, raw } from "express";
import { verifyResendEvent, fanMailEventFromResend } from "../../services/emailWebhookVerification.js";
import { applyVerifiedFanMailEvent } from "../../services/fanDeliveryService.js";
import { logger } from "../../logger.js";

const router = Router();
router.post("/", raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "Resend webhook verification is not configured" });
  const captured = (req as unknown as { rawBody?: unknown }).rawBody;
  const body = Buffer.isBuffer(captured) ? captured : Buffer.isBuffer(req.body) ? req.body : null;
  if (!body) return res.status(400).json({ error: "Exact webhook body bytes are required" });
  const id = req.get("svix-id") || "";
  if (!verifyResendEvent(body, id, req.get("svix-timestamp") || "", req.get("svix-signature") || "", secret)) {
    return res.status(401).json({ error: "Invalid Resend webhook signature" });
  }
  let event;
  try { event = fanMailEventFromResend(JSON.parse(body.toString("utf8")), id); }
  catch { return res.status(400).json({ error: "Invalid Resend event payload" }); }
  if (!event) return res.status(200).json({ received: true, ignored: true });
  try {
    await applyVerifiedFanMailEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    logger.warn({ err: error }, "Verified Resend fan event processing failed");
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});
export default router;