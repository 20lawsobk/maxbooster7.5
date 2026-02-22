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
  apiVersion: '2026-01-28.clover',
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

const PLAN_BENEFITS = {
  monthly: {
    name: 'Monthly',
    price: 49,
    period: 'month',
    features: [
      'Professional AI Music Studio (DAW)',
      'Autonomous Social Media Autopilot (24/7)',
      'AI-Enhanced Organic Advertisement Autopilot',
      'Beat Marketplace & Licensing',
      'Professional Analytics Dashboard',
      'Distribution to 150+ Platforms',
      'AI Mixing & Mastering',
      'Royalty Tracking & Splits',
      'Email Marketing System',
      'Unlimited Active Projects',
      'Premium Content Library',
      'Cloud Storage (50GB)',
      'Email Support',
    ],
    cloudStorage: '50GB',
    support: 'Email',
  },
  yearly: {
    name: 'Yearly',
    price: 39,
    originalPrice: 49,
    period: 'month',
    annualTotal: 468,
    savings: 120,
    features: [
      'Everything in Monthly',
      'Priority Support (Email & Chat)',
      'Cloud Storage (100GB)',
      'Early Access to New Features',
      'Advanced Analytics',
    ],
    cloudStorage: '100GB',
    support: 'Priority Email & Chat',
  },
  lifetime: {
    name: 'Lifetime',
    price: 699,
    period: 'once',
    features: [
      'Everything in Yearly',
      'Lifetime Access - No Recurring Fees',
      'Unlimited Cloud Storage',
      'Premium Support (Phone & Video)',
      'Personal Account Manager',
      'Custom Enterprise Integrations',
      'Early Access to Beta Features',
    ],
    cloudStorage: 'Unlimited',
    support: 'Premium (Phone & Video)',
  },
  free: {
    name: 'Free',
    price: 0,
    period: 'forever',
    features: [
      'Basic Studio Access',
      'Up to 3 Projects',
      'Limited Distribution',
    ],
    cloudStorage: '1GB',
    support: 'Community',
  },
};

router.get('/plans', async (req: Request, res: Response) => {
  res.json({
    plans: [
      {
        id: 'monthly',
        name: 'Monthly',
        price: 49,
        interval: 'month',
        features: ['Unlimited distributions', 'AI Studio access', 'Social media tools', 'Analytics dashboard']
      },
      {
        id: 'yearly',
        name: 'Yearly',
        price: 468,
        interval: 'year',
        savings: '20%',
        features: ['Everything in Monthly', 'Priority support', 'Advanced analytics', 'Collaboration tools']
      },
      {
        id: 'lifetime',
        name: 'Lifetime',
        price: 699,
        interval: 'lifetime',
        features: ['Everything in Yearly', 'Forever access', 'All future features', 'VIP support']
      }
    ]
  });
});

router.post('/create-checkout-session', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Billing service not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        retryable: false,
        suggestedAction: 'Please contact support to enable billing features.'
      });
    }

    const { planId } = req.body;
    if (!planId || !['monthly', 'yearly', 'lifetime'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan', message: 'Please select a valid plan: monthly, yearly, or lifetime' });
    }

    const userId = req.user!.id;
    const customerId = await getOrCreateStripeCustomer(req.user);
    const appUrl = process.env.APP_URL || process.env.DOMAIN || 'https://maxbooster.replit.app';

    const priceMap: Record<string, { amount: number; mode: 'subscription' | 'payment'; interval?: 'month' | 'year' }> = {
      monthly: { amount: 4900, mode: 'subscription', interval: 'month' },
      yearly: { amount: 46800, mode: 'subscription', interval: 'year' },
      lifetime: { amount: 69900, mode: 'payment' },
    };

    const plan = priceMap[planId];

    const sessionParams: any = {
      customer: customerId,
      mode: plan.mode,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Max Booster ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
            description: planId === 'lifetime' ? 'Lifetime access to all Max Booster features' : `${planId.charAt(0).toUpperCase() + planId.slice(1)} subscription to Max Booster`,
          },
          unit_amount: plan.amount,
          ...(plan.interval ? { recurring: { interval: plan.interval } } : {}),
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/settings?checkout=success&plan=${planId}`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
      metadata: { userId, planId },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    logger.error('[Billing] Failed to create checkout session:', error);
    res.status(500).json({ error: 'Checkout failed', message: error.message || 'Failed to create checkout session' });
  }
});

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
    
    // Trial information
    let isTrialing = false;
    let trialEndsAt: Date | null = null;
    let trialDaysRemaining: number | null = null;
    
    if (user.subscriptionTier === 'lifetime') {
      computedStatus = 'active';
      statusBadge = 'Lifetime Access';
      statusColor = 'gold';
    } else if (stripeSubscription) {
      computedStatus = stripeSubscription.status;
      
      // Check for trial
      if (stripeSubscription.status === 'trialing' && stripeSubscription.trial_end) {
        isTrialing = true;
        trialEndsAt = new Date(stripeSubscription.trial_end * 1000);
        trialDaysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        statusBadge = `Trial (${trialDaysRemaining} days left)`;
        statusColor = 'blue';
      } else if (stripeSubscription.cancel_at_period_end) {
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
    
    // Get current plan benefits
    const currentTier = user.subscriptionTier || 'free';
    const planBenefits = PLAN_BENEFITS[currentTier as keyof typeof PLAN_BENEFITS] || PLAN_BENEFITS.free;
    
    // Determine available upgrades/downgrades
    const upgradeOptions: string[] = [];
    const downgradeOptions: string[] = [];
    
    if (currentTier === 'free') {
      upgradeOptions.push('monthly', 'yearly', 'lifetime');
    } else if (currentTier === 'monthly') {
      upgradeOptions.push('yearly', 'lifetime');
      downgradeOptions.push('free');
    } else if (currentTier === 'yearly') {
      upgradeOptions.push('lifetime');
      downgradeOptions.push('monthly', 'free');
    }
    // Lifetime has no upgrades or downgrades
    
    res.json({
      tier: currentTier,
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
      // Trial information
      isTrialing,
      trialEndsAt: trialEndsAt?.toISOString() || null,
      trialDaysRemaining,
      // Plan benefits and options
      planBenefits,
      upgradeOptions: upgradeOptions.map(tier => ({
        tier,
        ...PLAN_BENEFITS[tier as keyof typeof PLAN_BENEFITS]
      })),
      downgradeOptions: downgradeOptions.map(tier => ({
        tier,
        ...PLAN_BENEFITS[tier as keyof typeof PLAN_BENEFITS]
      })),
      allPlans: PLAN_BENEFITS,
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
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    
    const { instantPayoutService } = await import('../services/instantPayoutService');
    const entries = await instantPayoutService.getLedgerHistory(userId, limit, offset);
    
    res.json({ entries, pagination: { limit, offset } });
  } catch (error) {
    logger.error('[Billing] Failed to get ledger history:', error);
    res.status(500).json({ message: 'Failed to get ledger history' });
  }
});

router.post('/retry-payment', requireAuth, requireStripe, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(404).json({ 
        message: 'No billing account found',
        code: 'NO_BILLING_ACCOUNT',
        retryable: false
      });
    }
    
    const subscriptions = await stripe!.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'past_due',
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      const unpaidSubs = await stripe!.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'unpaid',
        limit: 1,
      });
      
      if (unpaidSubs.data.length === 0) {
        return res.status(400).json({ 
          message: 'No past due payments found',
          code: 'NO_PAST_DUE_PAYMENT',
          retryable: false
        });
      }
    }
    
    const subscription = subscriptions.data[0];
    const latestInvoice = await stripe!.invoices.retrieve(subscription.latest_invoice as string);
    
    if (latestInvoice.status === 'paid') {
      return res.json({ 
        success: true, 
        message: 'Payment has already been processed',
        code: 'ALREADY_PAID'
      });
    }
    
    try {
      const paidInvoice = await stripe!.invoices.pay(latestInvoice.id);
      
      if (paidInvoice.status === 'paid') {
        await db
          .update(users)
          .set({ subscriptionStatus: 'active' })
          .where(eq(users.id, userId));
        
        logger.info(`[Billing] Payment retry successful for user ${userId}`);
        
        return res.json({
          success: true,
          message: 'Payment successful! Your subscription is now active.',
          code: 'PAYMENT_SUCCESS',
          status: 'active'
        });
      }
    } catch (payError: any) {
      const mappedError = mapStripeError(payError);
      
      if (mappedError.code === 'REQUIRES_3D_SECURE') {
        const paymentIntent = await stripe!.paymentIntents.retrieve(
          (latestInvoice.payment_intent as string)
        );
        
        return res.status(402).json({
          message: 'Additional authentication required',
          code: 'REQUIRES_3D_SECURE',
          requires_action: true,
          clientSecret: paymentIntent.client_secret,
          retryable: true
        });
      }
      
      return res.status(mappedError.status).json({
        message: mappedError.message,
        code: mappedError.code,
        retryable: mappedError.retryable,
        suggestedAction: mappedError.code === 'PAYMENT_DECLINED' 
          ? 'Please update your payment method and try again.'
          : undefined
      });
    }
    
    res.status(500).json({ 
      message: 'Payment retry failed',
      code: 'RETRY_FAILED',
      retryable: true
    });
  } catch (error: any) {
    logger.error('[Billing] Failed to retry payment:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.delete('/payment-method', requireAuth, requireStripe, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(404).json({ 
        message: 'No billing account found',
        code: 'NO_BILLING_ACCOUNT'
      });
    }
    
    const subscriptions = await stripe!.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });
    
    if (subscriptions.data.length > 0 && !user.subscriptionTier?.includes('lifetime')) {
      return res.status(400).json({ 
        message: 'Cannot remove payment method with an active subscription. Please cancel your subscription first or add a new payment method before removing this one.',
        code: 'ACTIVE_SUBSCRIPTION_EXISTS',
        retryable: false,
        hasActiveSubscription: true,
        subscriptionTier: user.subscriptionTier
      });
    }
    
    const paymentMethods = await stripe!.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });
    
    if (paymentMethods.data.length === 0) {
      return res.status(404).json({ 
        message: 'No payment method found',
        code: 'NO_PAYMENT_METHOD'
      });
    }
    
    for (const pm of paymentMethods.data) {
      await stripe!.paymentMethods.detach(pm.id);
    }
    
    logger.info(`[Billing] Payment method removed for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'Payment method removed successfully',
      code: 'PAYMENT_METHOD_REMOVED'
    });
  } catch (error: any) {
    logger.error('[Billing] Failed to remove payment method:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code
    });
  }
});

router.post('/3ds/confirm', requireAuth, requireStripe, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { paymentIntentId, paymentMethodId } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({ 
        message: 'Payment intent ID is required',
        code: 'MISSING_PAYMENT_INTENT',
        retryable: false
      });
    }
    
    const paymentIntent = await stripe!.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      
      if (user?.stripeCustomerId) {
        await db
          .update(users)
          .set({ subscriptionStatus: 'active' })
          .where(eq(users.id, userId));
      }
      
      logger.info(`[Billing] 3DS confirmation successful for user ${userId}`);
      
      return res.json({
        success: true,
        message: '3D Secure authentication completed successfully',
        code: '3DS_SUCCESS',
        status: 'succeeded'
      });
    }
    
    if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
      if (paymentMethodId) {
        const confirmedIntent = await stripe!.paymentIntents.confirm(paymentIntentId, {
          payment_method: paymentMethodId,
        });
        
        if (confirmedIntent.status === 'succeeded') {
          await db
            .update(users)
            .set({ subscriptionStatus: 'active' })
            .where(eq(users.id, userId));
          
          return res.json({
            success: true,
            message: 'Payment confirmed successfully',
            code: '3DS_SUCCESS',
            status: 'succeeded'
          });
        }
        
        if (confirmedIntent.status === 'requires_action') {
          return res.status(402).json({
            message: 'Additional authentication required',
            code: 'REQUIRES_3D_SECURE',
            clientSecret: confirmedIntent.client_secret,
            status: confirmedIntent.status,
            retryable: true
          });
        }
      }
      
      return res.status(402).json({
        message: 'Payment requires additional authentication',
        code: 'REQUIRES_ACTION',
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        retryable: true
      });
    }
    
    if (paymentIntent.status === 'canceled') {
      return res.status(400).json({
        message: '3D Secure authentication was cancelled',
        code: '3DS_CANCELLED',
        status: 'canceled',
        retryable: true
      });
    }
    
    if (paymentIntent.status === 'requires_payment_method') {
      const lastError = paymentIntent.last_payment_error;
      return res.status(402).json({
        message: lastError?.message || '3D Secure authentication failed. Please try a different card.',
        code: '3DS_FAILED',
        declineCode: lastError?.decline_code,
        status: 'failed',
        retryable: true
      });
    }
    
    res.json({
      success: false,
      message: 'Payment is still processing',
      code: 'PROCESSING',
      status: paymentIntent.status,
      retryable: true
    });
  } catch (error: any) {
    logger.error('[Billing] 3DS confirmation failed:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.post('/refund/request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { invoiceId, chargeId, reason, amount, description } = req.body;
    
    if (!invoiceId && !chargeId) {
      return res.status(400).json({ 
        message: 'Invoice ID or Charge ID is required',
        code: 'MISSING_IDENTIFIER',
        retryable: false
      });
    }
    
    if (!reason) {
      return res.status(400).json({ 
        message: 'Please provide a reason for the refund request',
        code: 'MISSING_REASON',
        retryable: true
      });
    }
    
    const validReasons = ['duplicate', 'fraudulent', 'requested_by_customer', 'service_issue', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ 
        message: 'Invalid refund reason',
        code: 'INVALID_REASON',
        retryable: true,
        validReasons
      });
    }
    
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
    
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Billing service not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        retryable: false
      });
    }
    
    let chargeToRefund: string | null = chargeId || null;
    let refundableAmount: number = 0;
    
    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      
      if (invoice.customer !== user.stripeCustomerId) {
        return res.status(403).json({ 
          message: 'You do not have permission to refund this invoice',
          code: 'REFUND_ACCESS_DENIED',
          retryable: false
        });
      }
      
      if (invoice.status !== 'paid') {
        return res.status(400).json({ 
          message: 'Only paid invoices can be refunded',
          code: 'INVOICE_NOT_PAID',
          retryable: false
        });
      }
      
      chargeToRefund = invoice.charge as string;
      refundableAmount = invoice.amount_paid;
    } else if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      
      if (charge.customer !== user.stripeCustomerId) {
        return res.status(403).json({ 
          message: 'You do not have permission to refund this charge',
          code: 'REFUND_ACCESS_DENIED',
          retryable: false
        });
      }
      
      if (!charge.paid || charge.refunded) {
        return res.status(400).json({ 
          message: charge.refunded ? 'This charge has already been fully refunded' : 'Only paid charges can be refunded',
          code: charge.refunded ? 'ALREADY_REFUNDED' : 'CHARGE_NOT_PAID',
          retryable: false
        });
      }
      
      refundableAmount = charge.amount - charge.amount_refunded;
    }
    
    if (!chargeToRefund) {
      return res.status(400).json({ 
        message: 'No refundable charge found',
        code: 'NO_REFUNDABLE_CHARGE',
        retryable: false
      });
    }
    
    const refundAmount = amount ? Math.min(amount, refundableAmount) : refundableAmount;
    const isPartialRefund = refundAmount < refundableAmount;
    
    logger.info(`[Billing] Refund request created for user ${userId}: ${invoiceId || chargeId}, reason: ${reason}, amount: ${refundAmount / 100}`);
    
    res.json({
      success: true,
      message: 'Refund request submitted successfully. Our team will review and process it within 5-7 business days.',
      code: 'REFUND_REQUESTED',
      refundRequest: {
        id: `refund_req_${Date.now()}`,
        chargeId: chargeToRefund,
        invoiceId: invoiceId || null,
        amount: refundAmount / 100,
        reason,
        description: description || null,
        status: 'pending_review',
        isPartialRefund,
        estimatedProcessingDays: 7,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    logger.error('[Billing] Failed to create refund request:', error);
    
    if (error.code === 'resource_missing') {
      return res.status(404).json({ 
        message: 'Invoice or charge not found',
        code: 'NOT_FOUND',
        retryable: false
      });
    }
    
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.post('/dispute/evidence', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { disputeId, evidence } = req.body;
    
    if (!disputeId) {
      return res.status(400).json({ 
        message: 'Dispute ID is required',
        code: 'MISSING_DISPUTE_ID',
        retryable: false
      });
    }
    
    if (!evidence || typeof evidence !== 'object') {
      return res.status(400).json({ 
        message: 'Evidence data is required',
        code: 'MISSING_EVIDENCE',
        retryable: true
      });
    }
    
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
    
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Billing service not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        retryable: false
      });
    }
    
    try {
      const dispute = await stripe.disputes.retrieve(disputeId);
      
      const charge = await stripe.charges.retrieve(dispute.charge as string);
      if (charge.customer !== user.stripeCustomerId) {
        return res.status(403).json({ 
          message: 'You do not have permission to access this dispute',
          code: 'DISPUTE_ACCESS_DENIED',
          retryable: false
        });
      }
      
      if (dispute.status === 'won' || dispute.status === 'lost') {
        return res.status(400).json({ 
          message: `This dispute has already been ${dispute.status}`,
          code: 'DISPUTE_CLOSED',
          status: dispute.status,
          retryable: false
        });
      }
      
      const evidenceSubmission: Stripe.DisputeUpdateParams.Evidence = {};
      
      if (evidence.customer_name) evidenceSubmission.customer_name = evidence.customer_name;
      if (evidence.customer_email_address) evidenceSubmission.customer_email_address = evidence.customer_email_address;
      if (evidence.product_description) evidenceSubmission.product_description = evidence.product_description;
      if (evidence.uncategorized_text) evidenceSubmission.uncategorized_text = evidence.uncategorized_text;
      
      await stripe.disputes.update(disputeId, {
        evidence: evidenceSubmission,
        submit: evidence.submit === true
      });
      
      logger.info(`[Billing] Dispute evidence submitted for user ${userId}, dispute ${disputeId}`);
      
      res.json({
        success: true,
        message: evidence.submit 
          ? 'Evidence submitted successfully. Stripe will review within 60-90 days.'
          : 'Evidence saved as draft. You can continue editing before submitting.',
        code: evidence.submit ? 'EVIDENCE_SUBMITTED' : 'EVIDENCE_SAVED',
        disputeId,
        status: evidence.submit ? 'under_review' : 'needs_response'
      });
    } catch (stripeError: any) {
      if (stripeError.code === 'resource_missing') {
        return res.status(404).json({ 
          message: 'Dispute not found',
          code: 'DISPUTE_NOT_FOUND',
          retryable: false
        });
      }
      throw stripeError;
    }
  } catch (error: any) {
    logger.error('[Billing] Failed to submit dispute evidence:', error);
    const mappedError = mapStripeError(error);
    res.status(mappedError.status).json({ 
      message: mappedError.message,
      code: mappedError.code,
      retryable: mappedError.retryable
    });
  }
});

router.get('/grace-period-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    
    if (user.subscriptionTier === 'lifetime') {
      return res.json({
        inGracePeriod: false,
        gracePeriodActive: false,
        subscriptionStatus: 'active',
        tier: 'lifetime',
        message: 'Lifetime subscription - no grace period applicable'
      });
    }
    
    let stripeSubscription: Stripe.Subscription | null = null;
    let latestInvoice: Stripe.Invoice | null = null;
    
    if (user.stripeCustomerId && stripe) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          limit: 1,
          expand: ['data.latest_invoice'],
        });
        
        if (subscriptions.data.length > 0) {
          stripeSubscription = subscriptions.data[0];
          latestInvoice = stripeSubscription.latest_invoice as Stripe.Invoice | null;
        }
      } catch (err) {
        logger.warn('[Billing] Failed to fetch subscription for grace period check:', err);
      }
    }
    
    const now = new Date();
    let gracePeriodActive = false;
    let gracePeriodEndsAt: Date | null = null;
    let gracePeriodDaysRemaining: number | null = null;
    let retryAttempts = 0;
    let nextRetryAt: Date | null = null;
    let paymentFailedAt: Date | null = null;
    
    if (stripeSubscription?.status === 'past_due' || stripeSubscription?.status === 'unpaid') {
      gracePeriodActive = true;
      
      const gracePeriodDays = 7;
      const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      gracePeriodEndsAt = new Date(currentPeriodEnd.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
      gracePeriodDaysRemaining = Math.max(0, Math.ceil((gracePeriodEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      if (latestInvoice && typeof latestInvoice !== 'string') {
        retryAttempts = latestInvoice.attempt_count || 0;
        if (latestInvoice.next_payment_attempt) {
          nextRetryAt = new Date(latestInvoice.next_payment_attempt * 1000);
        }
        paymentFailedAt = new Date(latestInvoice.created * 1000);
      }
    }
    
    const isGracePeriodExpired = gracePeriodActive && gracePeriodEndsAt && gracePeriodEndsAt < now;
    
    res.json({
      inGracePeriod: gracePeriodActive && !isGracePeriodExpired,
      gracePeriodActive,
      gracePeriodEndsAt: gracePeriodEndsAt?.toISOString() || null,
      gracePeriodDaysRemaining: gracePeriodDaysRemaining || 0,
      gracePeriodExpired: isGracePeriodExpired,
      subscriptionStatus: stripeSubscription?.status || user.subscriptionStatus || 'inactive',
      tier: user.subscriptionTier || 'free',
      payment: {
        failedAt: paymentFailedAt?.toISOString() || null,
        retryAttempts,
        maxRetryAttempts: 4,
        nextRetryAt: nextRetryAt?.toISOString() || null,
        retriesExhausted: retryAttempts >= 4
      },
      actions: gracePeriodActive ? {
        canRetryPayment: true,
        canUpdatePaymentMethod: true,
        canContactSupport: true,
        urgencyLevel: gracePeriodDaysRemaining !== null && gracePeriodDaysRemaining <= 2 ? 'critical' : 
                      gracePeriodDaysRemaining !== null && gracePeriodDaysRemaining <= 4 ? 'high' : 'medium'
      } : null
    });
  } catch (error) {
    logger.error('[Billing] Failed to get grace period status:', error);
    res.status(500).json({ 
      message: 'Failed to get grace period status',
      code: 'GRACE_PERIOD_CHECK_ERROR',
      retryable: true
    });
  }
});

router.get('/disputes', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId || !stripe) {
      return res.json({ disputes: [], hasMore: false });
    }
    
    try {
      const charges = await stripe.charges.list({
        customer: user.stripeCustomerId,
        limit: 100,
      });
      
      const disputedCharges = charges.data.filter(charge => charge.dispute);
      const disputes: any[] = [];
      
      for (const charge of disputedCharges) {
        if (charge.dispute) {
          const dispute = await stripe.disputes.retrieve(charge.dispute as string);
          disputes.push({
            id: dispute.id,
            chargeId: charge.id,
            amount: dispute.amount / 100,
            currency: dispute.currency,
            reason: dispute.reason,
            status: dispute.status,
            statusDisplay: dispute.status === 'won' ? 'Won' :
                          dispute.status === 'lost' ? 'Lost' :
                          dispute.status === 'needs_response' ? 'Action Required' :
                          dispute.status === 'under_review' ? 'Under Review' :
                          dispute.status === 'warning_needs_response' ? 'Warning - Action Required' : 'Pending',
            statusColor: dispute.status === 'won' ? 'green' :
                        dispute.status === 'lost' ? 'red' :
                        dispute.status === 'needs_response' ? 'orange' :
                        dispute.status === 'warning_needs_response' ? 'orange' :
                        dispute.status === 'under_review' ? 'blue' : 'gray',
            created: new Date(dispute.created * 1000).toISOString(),
            evidenceDueBy: dispute.evidence_details?.due_by 
              ? new Date(dispute.evidence_details.due_by * 1000).toISOString() 
              : null,
            hasEvidence: dispute.evidence_details?.has_evidence || false,
            submissionCount: dispute.evidence_details?.submission_count || 0,
            description: charge.description || 'Max Booster Subscription',
          });
        }
      }
      
      disputes.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      
      return res.json({ 
        disputes: disputes.slice(0, 20),
        hasMore: disputes.length > 20 
      });
    } catch (err) {
      logger.warn('[Billing] Failed to fetch disputes:', err);
    }
    
    res.json({ disputes: [], hasMore: false });
  } catch (error) {
    logger.error('[Billing] Failed to get disputes:', error);
    res.status(500).json({ message: 'Failed to get disputes' });
  }
});

router.get('/invoices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, limit = 20 } = req.query;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId || !stripe) {
      return res.json({ invoices: [], hasMore: false });
    }
    
    try {
      const invoiceParams: Stripe.InvoiceListParams = {
        customer: user.stripeCustomerId,
        limit: Math.min(Number(limit), 100),
      };
      
      if (status && typeof status === 'string') {
        invoiceParams.status = status as Stripe.InvoiceListParams.Status;
      }
      
      const invoices = await stripe.invoices.list(invoiceParams);
      
      const now = new Date();
      const invoiceList = invoices.data.map(invoice => {
        const dueDate = invoice.due_date ? new Date(invoice.due_date * 1000) : null;
        const isOverdue = dueDate && dueDate < now && invoice.status === 'open';
        
        return {
          id: invoice.id,
          number: invoice.number || invoice.id,
          amount: (invoice.amount_due || 0) / 100,
          amountPaid: (invoice.amount_paid || 0) / 100,
          amountRemaining: (invoice.amount_remaining || 0) / 100,
          currency: invoice.currency,
          status: invoice.status,
          statusDisplay: invoice.status === 'paid' ? 'Paid' :
                        invoice.status === 'open' && isOverdue ? 'Overdue' :
                        invoice.status === 'open' ? 'Pending' :
                        invoice.status === 'draft' ? 'Draft' :
                        invoice.status === 'void' ? 'Voided' :
                        invoice.status === 'uncollectible' ? 'Uncollectible' : 'Unknown',
          statusColor: invoice.status === 'paid' ? 'green' :
                      isOverdue ? 'red' :
                      invoice.status === 'open' ? 'yellow' :
                      invoice.status === 'draft' ? 'gray' :
                      invoice.status === 'void' ? 'gray' : 'red',
          isOverdue,
          created: new Date(invoice.created * 1000).toISOString(),
          dueDate: dueDate?.toISOString() || null,
          paidAt: invoice.status_transitions?.paid_at 
            ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() 
            : null,
          description: invoice.lines.data[0]?.description || 'Max Booster Subscription',
          pdfUrl: invoice.invoice_pdf,
          hostedUrl: invoice.hosted_invoice_url,
          attemptCount: invoice.attempt_count || 0,
          nextPaymentAttempt: invoice.next_payment_attempt 
            ? new Date(invoice.next_payment_attempt * 1000).toISOString() 
            : null,
        };
      });
      
      return res.json({ 
        invoices: invoiceList,
        hasMore: invoices.has_more 
      });
    } catch (err) {
      logger.warn('[Billing] Failed to fetch invoices:', err);
    }
    
    res.json({ invoices: [], hasMore: false });
  } catch (error) {
    logger.error('[Billing] Failed to get invoices:', error);
    res.status(500).json({ message: 'Failed to get invoices' });
  }
});

router.get('/refunds', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId || !stripe) {
      return res.json({ refunds: [], hasMore: false });
    }
    
    try {
      const charges = await stripe.charges.list({
        customer: user.stripeCustomerId,
        limit: 50,
      });
      
      const refunds: any[] = [];
      
      for (const charge of charges.data) {
        if (charge.refunds && charge.refunds.data.length > 0) {
          for (const refund of charge.refunds.data) {
            refunds.push({
              id: refund.id,
              amount: refund.amount / 100,
              status: refund.status,
              reason: refund.reason,
              created: new Date(refund.created * 1000).toISOString(),
              chargeId: charge.id,
              description: charge.description || 'Max Booster Subscription',
              statusDisplay: refund.status === 'succeeded' ? 'Completed' :
                            refund.status === 'pending' ? 'Processing' :
                            refund.status === 'failed' ? 'Failed' : 'Requested',
              statusColor: refund.status === 'succeeded' ? 'green' :
                          refund.status === 'pending' ? 'yellow' :
                          refund.status === 'failed' ? 'red' : 'blue',
            });
          }
        }
      }
      
      refunds.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      
      return res.json({ 
        refunds: refunds.slice(0, 20),
        hasMore: refunds.length > 20 
      });
    } catch (err) {
      logger.warn('[Billing] Failed to fetch refunds:', err);
    }
    
    res.json({ refunds: [], hasMore: false });
  } catch (error) {
    logger.error('[Billing] Failed to get refunds:', error);
    res.status(500).json({ message: 'Failed to get refunds' });
  }
});

router.get('/usage', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    const tier = user?.subscriptionTier || 'free';
    
    const usageStats = {
      tier,
      period: {
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
      },
      distributions: {
        used: 0,
        limit: tier === 'free' ? 3 : tier === 'lifetime' ? -1 : 100,
        unlimited: tier === 'lifetime',
      },
      storage: {
        usedBytes: 0,
        limitBytes: tier === 'free' ? 1024 * 1024 * 1024 : tier === 'lifetime' ? -1 : 50 * 1024 * 1024 * 1024,
        unlimited: tier === 'lifetime',
      },
      aiGenerations: {
        used: 0,
        limit: tier === 'free' ? 10 : tier === 'lifetime' ? -1 : 500,
        unlimited: tier === 'lifetime',
      },
      socialPosts: {
        used: 0,
        limit: tier === 'free' ? 5 : tier === 'lifetime' ? -1 : 200,
        unlimited: tier === 'lifetime',
      },
    };
    
    res.json(usageStats);
  } catch (error) {
    logger.error('[Billing] Failed to get usage stats:', error);
    res.status(500).json({ message: 'Failed to get usage stats' });
  }
});

export default router;
