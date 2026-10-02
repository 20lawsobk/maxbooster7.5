/**
 * STRIPE WEBHOOK SECURITY
 *
 * Validates Stripe webhook signatures to prevent forged payment events.
 * CRITICAL for payment security - attackers cannot fake payments.
 */

import { Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import { logger } from "../logger.js";
import { pool } from "../db";
import { env } from "../config/env.js";
import { audit } from "./auditLogger";
import { processCommerceEvent } from "../services/commerceWebhookRepository";

// Audit log for webhook events
interface WebhookAuditEntry {
  timestamp: Date;
  eventId: string;
  eventType: string;
  success: boolean;
  error?: string;
  customerId?: string;
  amount?: number;
}

const webhookAuditLog: WebhookAuditEntry[] = [];

/**
 * Stripe webhook signature verification middleware
 * MUST be used on the /api/webhooks/stripe endpoint
 */
export function stripeWebhookMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const webhookSecret = env?.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    res.status(500).json({
      success: false,
      error: "Webhook secret not configured",
    });
    return;
  }

  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    logger.warn("[Stripe Webhook] Missing stripe-signature header");
    res.status(400).json({
      success: false,
      error: "Missing stripe-signature header",
    });
    return;
  }

  try {
    const stripe = new Stripe(env?.STRIPE_SECRET_KEY as string, {
      apiVersion: "2026-02-25.clover" as any,
    });

    // Verify the signature using the raw body
    const rawBody = (req as unknown as Record<string, unknown>).rawBody as string | Buffer | undefined;
    if (!rawBody) {
      throw new Error(
        "Raw body not available - ensure body parser preserves raw body",
      );
    }

    const event = stripe?.webhooks.constructEvent(
      rawBody,
      signature as string,
      webhookSecret,
    );

    // Attach verified event to request
    (req as unknown as Record<string, unknown>).stripeEvent = event;

    // Add to audit log
    addWebhookAudit({
      timestamp: new Date(),
      eventId: event.id,
      eventType: event.type,
      success: true,
      customerId: (event?.data.object as unknown as Record<string, unknown>).customer as string | undefined,
      amount: (event?.data.object as unknown as Record<string, unknown>).amount as number | undefined,
    });

    logger.info(`[Stripe Webhook] Verified event: ${event?.type} (${event?.id})`);

    next();
  } catch (error) {
    logger.warn(
      "[Stripe Webhook] Signature verification failed:",
      (error as any)?.message,
    );

    // Add failed attempt to audit log
    addWebhookAudit({
      timestamp: new Date(),
      eventId: "unknown",
      eventType: "unknown",
      success: false,
      error: (error as Error).message,
    });

    res.status(401).json({
      success: false,
      error: "Webhook signature verification failed",
    });
  }
}

/**
 * Express body parser that preserves raw body for Stripe webhook verification
 */
export function stripeRawBodyParser(
  req: Request,
  _res: Response,
  buf: Buffer,
  _encoding: BufferEncoding,
): void {
  if (req.path === "/api/webhooks/stripe" || req.path.includes("stripe")) {
    (req as unknown as Record<string, unknown>).rawBody = buf;
  }
}

/**
 * Get webhook audit log
 */
export function getWebhookAuditLog(limit: number = 100): WebhookAuditEntry[] {
  return webhookAuditLog?.slice(-limit);
}

/**
 * Add entry to webhook audit log
 */
function addWebhookAudit(entry: WebhookAuditEntry): void {
  webhookAuditLog?.push(entry);

  // Keep only last 1000 entries
  if (webhookAuditLog?.length > 1000) {
    webhookAuditLog?.splice(0, webhookAuditLog?.length - 1000);
  }
}

/**
 * Idempotency check - prevent duplicate webhook processing
 * Permanent receipt lookup for diagnostics and legacy callers.
 * Actual dispatch also takes a database transaction lock.
 */

// Check if event has already been successfully processed
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT event_id FROM commerce_webhook_receipts WHERE event_id = $1", [eventId],
  );
  return result.rows.length > 0;
}

// Legacy function for backward compatibility
export async function checkIdempotency(eventId: string): Promise<boolean> {
  const already = await isEventProcessed(eventId);
  if (already) {
    logger.info(`[Stripe Webhook] Duplicate event ignored: ${eventId}`);
    return true;
  }
  return false;
}

/**
 * Webhook event handlers
 */
export interface WebhookHandler {
  (event: Stripe.Event): Promise<{ success: boolean; message: string }>;
}

const webhookHandlers = new Map<string, WebhookHandler>();
export async function retryCommerceWebhookInbox(limit=50) {
  const result=await pool.query(`SELECT payload FROM commerce_webhook_inbox
    WHERE state<>'completed' AND (lease_until IS NULL OR lease_until<now())
    ORDER BY received_at LIMIT $1`,[limit]);
  let failed=0;
  for(const row of result.rows) if(!(await handleWebhookEvent(row.payload)).success) failed++;
  return {processed:result.rows.length-failed,failed};
}

export function registerWebhookHandler(
  eventType: string,
  handler: WebhookHandler,
): void {
  webhookHandlers?.set(eventType, handler);
  logger.info(`[Stripe Webhook] Registered handler for: ${eventType}`);
}

export async function handleWebhookEvent(
  event: Stripe.Event,
): Promise<{ success: boolean; message: string }> {
  const handler = webhookHandlers?.get(
    event.type === "checkout.session.async_payment_succeeded"
      ? "checkout.session.completed" : event.type,
  );

  if (!handler) {
    logger.warn(`[Stripe Webhook] No handler for event type: ${event?.type}`);
    return { success: true, message: "Event type not handled" };
  }

  try {
    const result = await processCommerceEvent(event, () => handler(event));

    // SECURITY FIX: Only mark as processed AFTER successful handling
    // This allows failed events to be retried by Stripe
    if (!result?.success) {
      // Log failed processing for retry tracking
      logger.warn(
        `[Stripe Webhook] Handler failed for ${event?.type} (${event?.id}): ${result?.message}`,
      );
      await recordWebhookFailureAudit(event, result?.message);
    }

    return result;
  } catch (error) {
    // SECURITY: Don't mark as processed on error - allow retry
    logger.warn(
      { err: error },
      `[Stripe Webhook] Handler error for ${event?.type} (${event?.id}):`,
    );
    const message = (error as Error).message;
    await recordWebhookFailureAudit(event, message);
    return { success: false, message };
  }
}

/**
 * Persist a critical, queryable audit record when a webhook's critical DB
 * write could not be confirmed — so operators can find and fix it by hand
 * even after Stripe's retry window (~3 days) exhausts, without needing raw
 * log access. Best-effort: never throws back into the webhook flow.
 */
async function recordWebhookFailureAudit(
  event: Stripe.Event,
  message: string | undefined,
): Promise<void> {
  try {
    const obj = event?.data?.object as unknown as Record<string, unknown> | undefined;
    const customerRef =
      (typeof obj?.customer === "string" ? obj?.customer : undefined) ||
      (obj?.metadata as Record<string, unknown> | undefined)?.userId ||
      (obj?.metadata as Record<string, unknown> | undefined)?.buyerId ||
      undefined;

    await audit({
      category: "payment",
      severity: "critical",
      action: "stripe_webhook_processing_failed",
      userId: typeof customerRef === "string" ? customerRef : undefined,
      targetId: event?.id,
      targetType: "stripe_webhook_event",
      details: {
        eventType: event?.type,
        eventId: event?.id,
        customerRef: customerRef ?? null,
        message: message ?? null,
      },
      success: false,
      errorMessage: message,
    });
  } catch (auditError) {
    logger.warn(
      { err: auditError },
      "[Stripe Webhook] Failed to record webhook-failure audit entry:",
    );
  }
}
