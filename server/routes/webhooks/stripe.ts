/**
 * STRIPE WEBHOOK ROUTES
 * 
 * Handles Stripe webhook events with signature verification.
 * Critical for payment security.
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { logger } from '../../logger.js';
import { 
  stripeWebhookMiddleware, 
  handleWebhookEvent,
  checkIdempotency,
  registerWebhookHandler,
} from '../../safety/stripeWebhookSecurity';
import { auditPayment } from '../../safety/auditLogger';

const router = Router();

// Register webhook handlers for various event types
registerWebhookHandler('checkout.session.completed', async (event) => {
  const session = event.data.object as Stripe.Checkout.Session;
  logger.info(`[Stripe] Checkout completed: ${session.id}`);
  
  await auditPayment.charge(
    session.metadata?.userId || 'unknown',
    session.amount_total || 0,
    session.payment_intent as string || session.id,
    true
  );
  
  return { success: true, message: 'Checkout session processed' };
});

registerWebhookHandler('customer.subscription.created', async (event) => {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info(`[Stripe] Subscription created: ${subscription.id}`);
  return { success: true, message: 'Subscription created' };
});

registerWebhookHandler('customer.subscription.updated', async (event) => {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info(`[Stripe] Subscription updated: ${subscription.id} - Status: ${subscription.status}`);
  return { success: true, message: 'Subscription updated' };
});

registerWebhookHandler('customer.subscription.deleted', async (event) => {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info(`[Stripe] Subscription canceled: ${subscription.id}`);
  return { success: true, message: 'Subscription canceled' };
});

registerWebhookHandler('invoice.paid', async (event) => {
  const invoice = event.data.object as Stripe.Invoice;
  logger.info(`[Stripe] Invoice paid: ${invoice.id} - Amount: $${(invoice.amount_paid / 100).toFixed(2)}`);
  
  await auditPayment.charge(
    invoice.customer as string,
    invoice.amount_paid,
    invoice.payment_intent as string || invoice.id,
    true
  );
  
  return { success: true, message: 'Invoice paid' };
});

registerWebhookHandler('invoice.payment_failed', async (event) => {
  const invoice = event.data.object as Stripe.Invoice;
  logger.warn(`[Stripe] Payment failed: ${invoice.id}`);
  
  await auditPayment.charge(
    invoice.customer as string,
    invoice.amount_due,
    invoice.id,
    false,
    'Payment failed'
  );
  
  return { success: true, message: 'Payment failure recorded' };
});

registerWebhookHandler('payment_intent.succeeded', async (event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  logger.info(`[Stripe] Payment succeeded: ${paymentIntent.id}`);
  return { success: true, message: 'Payment intent succeeded' };
});

registerWebhookHandler('payment_intent.payment_failed', async (event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  logger.warn(`[Stripe] Payment failed: ${paymentIntent.id}`);
  return { success: true, message: 'Payment failure recorded' };
});

// Stripe Connect webhook handlers for payouts
registerWebhookHandler('account.updated', async (event) => {
  const account = event.data.object as Stripe.Account;
  logger.info(`[Stripe Connect] Account updated: ${account.id} - Charges enabled: ${account.charges_enabled}`);
  return { success: true, message: 'Account updated' };
});

registerWebhookHandler('transfer.created', async (event) => {
  const transfer = event.data.object as Stripe.Transfer;
  logger.info(`[Stripe Connect] Transfer created: ${transfer.id} - Amount: $${(transfer.amount / 100).toFixed(2)}`);
  return { success: true, message: 'Transfer created' };
});

registerWebhookHandler('payout.paid', async (event) => {
  const payout = event.data.object as Stripe.Payout;
  logger.info(`[Stripe Connect] Payout completed: ${payout.id} - Amount: $${(payout.amount / 100).toFixed(2)}`);
  return { success: true, message: 'Payout completed' };
});

registerWebhookHandler('payout.failed', async (event) => {
  const payout = event.data.object as Stripe.Payout;
  logger.warn(`[Stripe Connect] Payout failed: ${payout.id} - Reason: ${payout.failure_message}`);
  return { success: true, message: 'Payout failure recorded' };
});

/**
 * POST /api/webhooks/stripe
 * Main webhook endpoint with signature verification
 */
router.post('/', stripeWebhookMiddleware, async (req: Request, res: Response) => {
  try {
    const event = (req as any).stripeEvent as Stripe.Event;
    
    if (!event) {
      return res.status(400).json({ error: 'No event found' });
    }

    // Process the event
    const result = await handleWebhookEvent(event);

    if (result.success) {
      res.json({ received: true, message: result.message });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error: any) {
    logger.error('[Stripe Webhook] Handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * GET /api/webhooks/stripe/health
 * Health check for webhook endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    stripeKeyConfigured: !!process.env.STRIPE_SECRET_KEY,
  });
});

export default router;
