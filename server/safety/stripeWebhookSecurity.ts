/**
 * STRIPE WEBHOOK SECURITY
 * 
 * Validates Stripe webhook signatures to prevent forged payment events.
 * CRITICAL for payment security - attackers cannot fake payments.
 */

import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { logger } from '../logger.js';

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
  next: NextFunction
): void {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured');
    res.status(500).json({ 
      success: false, 
      error: 'Webhook secret not configured' 
    });
    return;
  }

  const signature = req.headers['stripe-signature'] as string;
  
  if (!signature) {
    logger.warn('[Stripe Webhook] Missing stripe-signature header');
    res.status(400).json({ 
      success: false, 
      error: 'Missing stripe-signature header' 
    });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Verify the signature using the raw body
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      throw new Error('Raw body not available - ensure body parser preserves raw body');
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    // Attach verified event to request
    (req as any).stripeEvent = event;

    // Add to audit log
    addWebhookAudit({
      timestamp: new Date(),
      eventId: event.id,
      eventType: event.type,
      success: true,
      customerId: (event.data.object as any).customer,
      amount: (event.data.object as any).amount,
    });

    logger.info(`[Stripe Webhook] Verified event: ${event.type} (${event.id})`);
    
    next();
  } catch (error: any) {
    logger.error('[Stripe Webhook] Signature verification failed:', error.message);
    
    // Add failed attempt to audit log
    addWebhookAudit({
      timestamp: new Date(),
      eventId: 'unknown',
      eventType: 'unknown',
      success: false,
      error: error.message,
    });

    res.status(401).json({ 
      success: false, 
      error: 'Webhook signature verification failed' 
    });
  }
}

/**
 * Express body parser that preserves raw body for Stripe webhook verification
 */
export function stripeRawBodyParser(
  req: Request,
  res: Response,
  buf: Buffer,
  encoding: BufferEncoding
): void {
  if (req.path === '/api/webhooks/stripe' || req.path.includes('stripe')) {
    (req as any).rawBody = buf;
  }
}

/**
 * Get webhook audit log
 */
export function getWebhookAuditLog(limit: number = 100): WebhookAuditEntry[] {
  return webhookAuditLog.slice(-limit);
}

/**
 * Add entry to webhook audit log
 */
function addWebhookAudit(entry: WebhookAuditEntry): void {
  webhookAuditLog.push(entry);
  
  // Keep only last 1000 entries
  if (webhookAuditLog.length > 1000) {
    webhookAuditLog.splice(0, webhookAuditLog.length - 1000);
  }
}

/**
 * Idempotency check - prevent duplicate webhook processing
 */
const processedEvents = new Set<string>();
const PROCESSED_EVENTS_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function checkIdempotency(eventId: string): boolean {
  if (processedEvents.has(eventId)) {
    logger.info(`[Stripe Webhook] Duplicate event ignored: ${eventId}`);
    return true;
  }
  
  processedEvents.add(eventId);
  
  // Clean up old events periodically
  setTimeout(() => {
    processedEvents.delete(eventId);
  }, PROCESSED_EVENTS_TTL);
  
  return false;
}

/**
 * Webhook event handlers
 */
export interface WebhookHandler {
  (event: Stripe.Event): Promise<{ success: boolean; message: string }>;
}

const webhookHandlers = new Map<string, WebhookHandler>();

export function registerWebhookHandler(eventType: string, handler: WebhookHandler): void {
  webhookHandlers.set(eventType, handler);
  logger.info(`[Stripe Webhook] Registered handler for: ${eventType}`);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<{ success: boolean; message: string }> {
  // Check idempotency first
  if (checkIdempotency(event.id)) {
    return { success: true, message: 'Event already processed' };
  }

  const handler = webhookHandlers.get(event.type);
  
  if (!handler) {
    logger.warn(`[Stripe Webhook] No handler for event type: ${event.type}`);
    return { success: true, message: 'Event type not handled' };
  }

  try {
    return await handler(event);
  } catch (error: any) {
    logger.error(`[Stripe Webhook] Handler error for ${event.type}:`, error);
    return { success: false, message: error.message };
  }
}
