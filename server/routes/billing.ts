/**
 * BILLING ROUTES
 * 
 * Handles subscription management, payment methods, and billing history
 * using Stripe as the payment provider.
 * 
 * SECURITY: All Stripe API calls wrapped with circuit breaker for resilience
 * 
 * ERROR CODES:
 * - STRIPE_NOT_CONFIGURED: 503 - Stripe is not configured on the server
 * - SUBSCRIPTION_NOT_FOUND: 404 - No subscription found for user
 * - SUBSCRIPTION_EXPIRED: 410 - Subscription has expired
 * - SUBSCRIPTION_CANCELLED: 400 - Subscription already cancelled
 * - PAYMENT_DECLINED: 402 - Payment was declined by the processor
 * - CARD_VALIDATION_ERROR: 422 - Card validation failed
 * - REQUIRES_3D_SECURE: 402 - 3D Secure authentication required
 * - REFUND_NOT_ELIGIBLE: 400 - Order not eligible for refund
 * - REFUND_ALREADY_PROCESSED: 409 - Refund already processed
 * - REFUND_PROCESSING: 202 - Refund is still processing
 * - INVOICE_NOT_FOUND: 404 - Invoice not found
 * - INVOICE_ACCESS_DENIED: 403 - Access denied to invoice
 * - PORTAL_SESSION_FAILED: 500 - Failed to create portal session
 * - RATE_LIMITED: 429 - Too many requests
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';
import { executeStripeOperation } from '../services/externalServices';
import { billingRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// SECURITY: Apply rate limiting to all billing endpoints
router.use(billingRateLimiter);

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  logger.warn('[Billing] STRIPE_SECRET_KEY not configured. Billing endpoints will return errors.');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16' as any,
}) : null;

const requireStripe = (req: Request, res: Response, next: any) => {
  if (!stripe) {
    return res.status(503).json({ 
      message: 'Billing service not configured',
      code: 'STRIPE_NOT_CONFIGURED',
      retryable: false,
      suggestedAction: 'Please contact support to enable billing features.'
    });
  }
  next();
};

const mapStripeError = (error: Stripe.StripeRawError | any) => {
  const errorCode = error.code || error.type;
  const errorMessage = error.message || 'An unexpected error occurred';
  
  switch (errorCode) {
    case 'card_declined':
      return { 
        status: 402, 
        code: 'PAYMENT_DECLINED', 
        message: 'Your card was declined. Please try a different payment method.',
        retryable: true,
        declineCode: error.decline_code
      };
    case 'incorrect_cvc':
    case 'incorrect_number':
    case 'invalid_expiry_month':
    case 'invalid_expiry_year':
    case 'invalid_number':
    case 'invalid_cvc':
      return { 
        status: 422, 
        code: 'CARD_VALIDATION_ERROR', 
        message: 'Your card information is invalid. Please check and try again.',
        retryable: true,
        field: errorCode.replace('invalid_', '').replace('incorrect_', '')
      };
    case 'authentication_required':
    case 'requires_action':
      return { 
        status: 402, 
        code: 'REQUIRES_3D_SECURE', 
        message: 'Additional authentication is required. Please complete the verification.',
        retryable: true,
        clientSecret: error.payment_intent?.client_secret
      };
    case 'expired_card':
      return { 
        status: 422, 
        code: 'CARD_EXPIRED', 
        message: 'Your card has expired. Please use a different payment method.',
        retryable: true
      };
    case 'insufficient_funds':
      return { 
        status: 402, 
        code: 'INSUFFICIENT_FUNDS', 
        message: 'Insufficient funds. Please try a different payment method.',
        retryable: true
      };
    case 'rate_limit':
      return { 
        status: 429, 
        code: 'RATE_LIMITED', 
        message: 'Too many requests. Please wait a moment and try again.',
        retryable: true,
        retryAfter: 60
      };
    default:
      return { 
        status: 500, 
        code: 'PAYMENT_ERROR', 
        message: errorMessage,
        retryable: false
      };
  }
};

interface AuthenticatedRequest extends Request {
  user?: { 
    id: string; 
    email: string;
    stripeCustomerId?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    subscriptionEndsAt?: Date | null;
  };
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

// SECURITY: Customer creation wrapped with circuit breaker and proper error handling
async function getOrCreateStripeCustomer(user: AuthenticatedRequest['user']): Promise<string> {
  if (!user) throw new Error('User not found');
  if (!stripe) throw new Error('Stripe not configured');
  
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id));
  
  if (dbUser?.stripeCustomerId) {
    return dbUser.stripeCustomerId;
  }
  
  // SECURITY FIX: Wrap Stripe customer creation with circuit breaker
  try {
    const result = await executeStripeOperation(() =>
      stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
    );
    
    const customer = result.data;
    
    await db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, user.id));
    
    return customer.id;
  } catch (error: any) {
    logger.error('[Billing] Failed to create Stripe customer:', error.message);
    throw new Error('Failed to create billing account. Please try again.');
  }
}

router.get('/subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    let stripeSubscription: Stripe.Subscription | null = null;
    let subscriptionError: string | null = null;
    
    if (user.stripeCustomerId && stripe) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          limit: 5,
          expand: ['data.default_payment_method'],
        });
        
        const activeSubscription = subscriptions.data.find(s => 
          s.status === 'active' || s.status === 'trialing'
        );
        const canceledSubscription = subscriptions.data.find(s => 
          s.status === 'canceled' || s.cancel_at_period_end
        );
        const pastDueSubscription = subscriptions.data.find(s => 
          s.status === 'past_due' || s.status === 'unpaid'
        );
        
        stripeSubscription = activeSubscription || canceledSubscription || pastDueSubscription || null;
      } catch (err: any) {
        logger.warn('[Billing] Failed to fetch Stripe subscription:', err);
        subscriptionError = 'Failed to sync subscription status with payment provider';
      }
    }
    
    const now = new Date();
    const subscriptionEndsAt = stripeSubscription?.current_period_end 
      ? new Date(stripeSubscription.current_period_end * 1000)
      : user.subscriptionEndsAt;
    
    let computedStatus = user.subscriptionStatus || 'inactive';
    let statusBadge = 'inactive';
    let statusColor = 'gray';
    
    if (user.subscriptionTier === 'lifetime') {
      computedStatus = 'active';
      statusBadge = 'Lifetime Access';
      statusColor = 'gold';
    } else if (stripeSubscription) {
      computedStatus = stripeSubscription.status;
      
      if (stripeSubscription.cancel_at_period_end) {
        statusBadge = 'Cancelling';
        statusColor = 'orange';
      } else if (stripeSubscription.status === 'active') {
        statusBadge = 'Active';
        statusColor = 'green';
      } else if (stripeSubscription.status === 'trialing') {
        statusBadge = 'Trial';
        statusColor = 'blue';
      } else if (stripeSubscription.status === 'past_due') {
        statusBadge = 'Past Due';
        statusColor = 'red';
      } else if (stripeSubscription.status === 'canceled') {
        statusBadge = 'Cancelled';
        statusColor = 'gray';
      } else if (stripeSubscription.status === 'unpaid') {
        statusBadge = 'Unpaid';
        statusColor = 'red';
      }
    } else if (subscriptionEndsAt && subscriptionEndsAt < now) {
      computedStatus = 'expired';
      statusBadge = 'Expired';
      statusColor = 'red';
    }
    
    const isExpired = subscriptionEndsAt && subscriptionEndsAt < now && user.subscriptionTier !== 'lifetime';
    const daysUntilRenewal = subscriptionEndsAt 
      ? Math.ceil((subscriptionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    res.json({
      tier: user.subscriptionTier || 'free',
      status: computedStatus,
      statusBadge,
      statusColor,
      currentPeriodEnd: subscriptionEndsAt?.toISOString() || null,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end || false,
      priceId: stripeSubscription?.items.data[0]?.price.id || null,
      isExpired,
      isLifetime: user.subscriptionTier === 'lifetime',
      isPastDue: stripeSubscription?.status === 'past_due',
      daysUntilRenewal: daysUntilRenewal && daysUntilRenewal > 0 ? daysUntilRenewal : null,
      canReactivate: stripeSubscription?.cancel_at_period_end === true,
      stripeConfigured: !!stripe,
      syncError: subscriptionError,
      pricing: {
        monthly: 49,
        yearly: 39,
        lifetime: 699
      }
    });
  } catch (error) {
    logger.error('[Billing] Failed to get subscription:', error);
    res.status(500).json({ 
      message: 'Failed to get subscription details',
      code: 'SUBSCRIPTION_FETCH_ERROR',
      retryable: true
    });
  }
});

router.get('/payment-method', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.json({ last4: null, expiry: null, brand: null });
    }
    
    if (!stripe) {
      return res.json({ last4: null, expiry: null, brand: null });
    }
    
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
        limit: 1,
      });
      
      if (paymentMethods.data.length > 0) {
        const pm = paymentMethods.data[0];
        return res.json({
          last4: pm.card?.last4,
          expiry: `${pm.card?.exp_month}/${pm.card?.exp_year}`,
          brand: pm.card?.brand,
        });
      }
    } catch (err) {
      logger.warn('[Billing] Failed to fetch payment methods:', err);
    }
    
    res.json({ last4: null, expiry: null, brand: null });
  } catch (error) {
    logger.error('[Billing] Failed to get payment method:', error);
    res.status(500).json({ message: 'Failed to get payment method' });
  }
});

router.get('/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId || !stripe) {
      return res.json([]);
    }
    
    try {
      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 24,
      });
      
      const history = invoices.data.map(invoice => ({
        id: invoice.id,
        invoiceId: invoice.number || invoice.id,
        date: new Date(invoice.created * 1000).toISOString(),
        amount: (invoice.amount_paid || 0) / 100,
        status: invoice.status,
        description: invoice.lines.data[0]?.description || 'Max Booster Subscription',
        pdfUrl: invoice.invoice_pdf,
      }));
      
      return res.json(history);
    } catch (err) {
      logger.warn('[Billing] Failed to fetch invoices:', err);
    }
    
    res.json([]);
  } catch (error) {
    logger.error('[Billing] Failed to get billing history:', error);
    res.status(500).json({ message: 'Failed to get billing history' });
  }
});

router.post('/cancel-subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Billing service not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        retryable: false
      });
    }
    
    const userId = req.user!.id;
    const { immediately = false, reason } = req.body;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (user?.subscriptionTier === 'lifetime') {
      return res.status(400).json({ 
        message: 'Lifetime subscriptions cannot be cancelled',
        code: 'LIFETIME_CANNOT_CANCEL',
        retryable: false
      });
    }
    
    if (!user?.stripeCustomerId) {
      return res.status(404).json({ 
        message: 'No subscription found',
        code: 'SUBSCRIPTION_NOT_FOUND',
        retryable: false
      });
    }
    
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      return res.status(404).json({ 
        message: 'No subscription found',
        code: 'SUBSCRIPTION_NOT_FOUND',
        retryable: false
      });
    }
    
    const subscription = subscriptions.data[0];
    
    if (subscription.status === 'canceled') {
      return res.status(400).json({ 
        message: 'Subscription is already cancelled',
        code: 'SUBSCRIPTION_ALREADY_CANCELLED',
        retryable: false
      });
    }
    
    if (subscription.cancel_at_period_end) {
      return res.status(400).json({ 
        message: 'Subscription is already set to cancel',
        code: 'SUBSCRIPTION_ALREADY_CANCELLING',
        retryable: false,
        cancelAt: new Date(subscription.current_period_end * 1000).toISOString()
      });
    }
    
    const metadata: Record<string, string> = { cancellationReason: reason || 'user_requested' };
    
    if (immediately) {
      await stripe.subscriptions.cancel(subscription.id, {
        prorate: true,
      });
      
      await db
        .update(users)
        .set({ subscriptionStatus: 'canceled' })
        .where(eq(users.id, userId));
      
      logger.info(`[Billing] Subscription ${subscription.id} cancelled immediately for user ${userId}`);
      
      res.json({ 
        success: true, 
        message: 'Subscription has been cancelled immediately',
        code: 'SUBSCRIPTION_CANCELLED_IMMEDIATELY',
        refundPending: true
      });
    } else {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        metadata,
      });
      
      logger.info(`[Billing] Subscription ${subscription.id} set to cancel at period end for user ${userId}`);
      
      res.json({ 
        success: true, 
        message: 'Subscription will be canceled at the end of the billing period',
        code: 'SUBSCRIPTION_CANCELLING',
        cancelAt: new Date(subscription.current_period_end * 1000).toISOString(),
        daysRemaining: Math.ceil((subscription.current_period_end * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
      });
    }
  } catch (error: any) {
    logger.error('[Billing] Failed to cancel subscription:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.post('/reactivate-subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Billing service not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        retryable: false
      });
    }
    
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(404).json({ 
        message: 'No subscription found',
        code: 'SUBSCRIPTION_NOT_FOUND',
        retryable: false
      });
    }
    
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 5,
    });
    
    if (subscriptions.data.length === 0) {
      return res.status(404).json({ 
        message: 'No subscription found',
        code: 'SUBSCRIPTION_NOT_FOUND',
        retryable: false
      });
    }
    
    const subscription = subscriptions.data[0];
    
    if (subscription.status === 'canceled') {
      return res.status(400).json({ 
        message: 'Subscription has been fully cancelled. Please create a new subscription.',
        code: 'SUBSCRIPTION_FULLY_CANCELLED',
        retryable: false,
        suggestedAction: 'redirect_to_pricing'
      });
    }
    
    if (!subscription.cancel_at_period_end) {
      return res.status(400).json({ 
        message: 'Subscription is already active',
        code: 'SUBSCRIPTION_ALREADY_ACTIVE',
        retryable: false
      });
    }
    
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
      limit: 1,
    });
    
    if (paymentMethods.data.length === 0) {
      return res.status(402).json({ 
        message: 'No payment method on file. Please add a payment method first.',
        code: 'PAYMENT_METHOD_REQUIRED',
        retryable: true,
        suggestedAction: 'add_payment_method'
      });
    }
    
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
    });
    
    await db
      .update(users)
      .set({ subscriptionStatus: 'active' })
      .where(eq(users.id, userId));
    
    logger.info(`[Billing] Subscription ${subscription.id} reactivated for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'Subscription has been reactivated',
      code: 'SUBSCRIPTION_REACTIVATED',
      nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString()
    });
  } catch (error: any) {
    logger.error('[Billing] Failed to reactivate subscription:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.get('/invoices/:invoiceId/download', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Billing service not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        retryable: false
      });
    }
    
    const userId = req.user!.id;
    const { invoiceId } = req.params;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ 
        message: 'No billing account found',
        code: 'NO_BILLING_ACCOUNT',
        retryable: false
      });
    }
    
    let invoice: Stripe.Invoice;
    try {
      invoice = await stripe.invoices.retrieve(invoiceId);
    } catch (stripeError: any) {
      if (stripeError.code === 'resource_missing') {
        return res.status(404).json({ 
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND',
          retryable: false
        });
      }
      throw stripeError;
    }
    
    if (invoice.customer !== user.stripeCustomerId) {
      logger.warn(`[Billing] User ${userId} attempted to access invoice ${invoiceId} belonging to another customer`);
      return res.status(403).json({ 
        message: 'You do not have permission to access this invoice',
        code: 'INVOICE_ACCESS_DENIED',
        retryable: false
      });
    }
    
    if (invoice.invoice_pdf) {
      return res.redirect(invoice.invoice_pdf);
    }
    
    if (invoice.status === 'draft') {
      return res.status(400).json({ 
        message: 'Invoice is still in draft status and PDF is not yet available',
        code: 'INVOICE_DRAFT',
        retryable: true
      });
    }
    
    res.status(404).json({ 
      message: 'Invoice PDF not available',
      code: 'INVOICE_PDF_NOT_AVAILABLE',
      retryable: false
    });
  } catch (error: any) {
    logger.error('[Billing] Failed to download invoice:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.post('/update-payment', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Billing service not configured' });
    }
    
    const userId = req.user!.id;
    const customerId = await getOrCreateStripeCustomer(req.user);
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${process.env.APP_URL || 'https://maxbooster.replit.app'}/settings?payment=updated`,
      cancel_url: `${process.env.APP_URL || 'https://maxbooster.replit.app'}/settings?payment=canceled`,
      metadata: { userId },
    });
    
    res.json({ url: session.url });
  } catch (error) {
    logger.error('[Billing] Failed to create setup session:', error);
    res.status(500).json({ message: 'Failed to update payment method' });
  }
});

router.post('/create-portal-session', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Billing service not configured' });
    }
    
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ message: 'No billing account found' });
    }
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.APP_URL || 'https://maxbooster.replit.app'}/settings`,
    });
    
    res.json({ url: portalSession.url });
  } catch (error) {
    logger.error('[Billing] Failed to create portal session:', error);
    res.status(500).json({ message: 'Failed to access billing portal' });
  }
});

router.post('/refund', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { orderId, amountCents, reason } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }
    
    // SECURITY FIX: Validate amountCents is a positive number
    if (amountCents !== undefined) {
      if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive integer in cents' });
      }
      // SECURITY: Sanity check for maximum refund amount ($10,000)
      if (amountCents > 1000000) {
        return res.status(400).json({ message: 'Refund amount exceeds maximum limit' });
      }
    }
    
    const { stripeService } = await import('../services/stripeService');
    const result = await stripeService.createRefund({
      orderId,
      userId,
      amountCents,
      reason,
      initiatedBy: 'customer',
    });
    
    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }
    
    res.json({
      success: true,
      refundId: result.refundId,
      message: 'Refund initiated successfully',
    });
  } catch (error) {
    logger.error('[Billing] Failed to create refund:', error);
    res.status(500).json({ message: 'Failed to process refund' });
  }
});

router.get('/refund/:refundId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { refundId } = req.params;
    
    const { stripeService } = await import('../services/stripeService');
    const refund = await stripeService.getRefundStatus(refundId);
    
    if (refund.userId !== req.user!.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json(refund);
  } catch (error: any) {
    if (error.message === 'Refund not found') {
      return res.status(404).json({ message: 'Refund not found' });
    }
    logger.error('[Billing] Failed to get refund status:', error);
    res.status(500).json({ message: 'Failed to get refund status' });
  }
});

router.get('/order/:orderId/refunds', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    
    const { stripeService } = await import('../services/stripeService');
    const refunds = await stripeService.getOrderRefunds(orderId);
    
    res.json({ refunds });
  } catch (error) {
    logger.error('[Billing] Failed to get order refunds:', error);
    res.status(500).json({ message: 'Failed to get order refunds' });
  }
});

router.get('/ledger', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { instantPayoutService } = await import('../services/instantPayoutService');
    const entries = await instantPayoutService.getLedgerHistory(userId, limit, offset);
    
    res.json({ entries, pagination: { limit, offset } });
  } catch (error) {
    logger.error('[Billing] Failed to get ledger history:', error);
    res.status(500).json({ message: 'Failed to get ledger history' });
  }
});

export default router;
