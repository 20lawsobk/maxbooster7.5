import type { RequestHandler } from "express";
import { enforceMaintenance } from "../services/governancePolicyService.js";

const recovery = new Set([
  "GET /", "GET /login", "GET /forgot-password", "GET /reset-password", "GET /favicon.ico",
  "GET /health", "GET /ready", "GET /healthz", "GET /api/health", "GET /api/ready",
  "GET /api/csrf-token", "GET /api/auth/me", "GET /api/auth/google",
  "GET /api/auth/google/callback", "GET /api/auth/2fa/challenge", "GET /api/auth/2fa/status",
  "POST /api/auth/login", "POST /api/auth/logout", "POST /api/auth/forgot-password",
  "POST /api/auth/reset-password", "POST /api/auth/2fa/challenge", "POST /api/auth/2fa/validate",
  "POST /api/auth/2fa/setup", "POST /api/auth/2fa/verify", "POST /api/auth/2fa/disable",
  "POST /api/auth/heartbeat", "POST /api/auth/refresh-token",
]);

/** Exact server-owned routes only. Provider exemptions require cryptographic
 * verification before bypass; neither a header nor a path is proof on its own. */
export const governanceBoundary: RequestHandler = async (req, res, next) => {
  try {
  const path = req.path;
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (recovery.has(`${method} ${path}`)) return next();
  // Static app-shell resources carry no application data/auth authority.
  if (method === "GET" && ["/assets/", "/js/", "/src/", "/node_modules/.vite/", "/@vite/", "/@react-refresh"]
    .some(prefix => path.startsWith(prefix))) return next();
  if (req.method === "POST" && path === "/api/webhooks/stripe") {
    const { stripeWebhookMiddleware } = await import("../safety/stripeWebhookSecurity.js");
    return stripeWebhookMiddleware(req, res, next);
  }
  if (req.method === "POST" && path === "/webhooks/sendgrid") {
    const signature = req.get("x-twilio-email-event-webhook-signature");
    const timestamp = req.get("x-twilio-email-event-webhook-timestamp");
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    const seconds = Number(timestamp);
    if (!signature || !timestamp || !Buffer.isBuffer(raw) || !Number.isFinite(seconds) ||
        Math.abs(Date.now() / 1000 - seconds) > 300) {
      return res.status(401).json({ error: "Signed webhook with current timestamp required" });
    }
    const { emailTrackingService } = await import("../services/emailTrackingService.js");
    if (!emailTrackingService.verifySendGridSignature(raw, signature, timestamp)) {
      return res.status(401).json({ error: "Webhook signature invalid" });
    }
    return next();
  }
  if (req.method === "POST" && path === "/api/webhooks/resend") {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: "Resend webhook verification is not configured" });
    const raw = (req as unknown as { rawBody?: unknown }).rawBody;
    if (!Buffer.isBuffer(raw)) return res.status(400).json({ error: "Exact webhook body bytes are required" });
    const { verifyResendEvent } = await import("../services/emailWebhookVerification.js");
    if (!verifyResendEvent(raw, req.get("svix-id") || "", req.get("svix-timestamp") || "",
      req.get("svix-signature") || "", secret)) {
      return res.status(401).json({ error: "Invalid Resend webhook signature" });
    }
    return next();
  }
  if (req.method === "POST" &&
      (path === "/api/notifications/sms/status" || path === "/api/notifications/sms/incoming")) {
    const { verifySmsWebhook } = await import("../services/smsWebhookVerification.js");
    if (!verifySmsWebhook(req, path.endsWith("/status") ? "status" : "incoming")) {
      return res.status(403).json({ error: "Invalid SMS webhook signature" });
    }
    return next();
  }
  return enforceMaintenance(req, res, next);
  } catch {
    return res.status(503).json({ error: "Governance verification unavailable" });
  }
};