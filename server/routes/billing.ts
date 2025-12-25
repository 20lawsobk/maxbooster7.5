/**
 * BILLING ROUTES
 * 
 * Handles subscription management, payment methods, and billing history
 * using Stripe as the payment provider.
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

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

async function getOrCreateStripeCustomer(user: AuthenticatedRequest['user']): Promise<string> {
  if (!user) throw new Error('User not found');
  
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id));
  
  if (dbUser?.stripeCustomerId) {
    return dbUser.stripeCustomerId;
  }
  
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });
  
  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id));
  
  return customer.id;
}

router.get('/subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let stripeSubscription = null;
    
    if (user.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1,
        });
        
        if (subscriptions.data.length > 0) {
          stripeSubscription = subscriptions.data[0];
        }
      } catch (err) {
        logger.warn('[Billing] Failed to fetch Stripe subscription:', err);
      }
    }
    
    res.json({
      tier: user.subscriptionTier || 'free',
      status: user.subscriptionStatus || 'inactive',
      currentPeriodEnd: stripeSubscription?.current_period_end 
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : user.subscriptionEndsAt?.toISOString() || null,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end || false,
      priceId: stripeSubscription?.items.data[0]?.price.id || null,
    });
  } catch (error) {
    logger.error('[Billing] Failed to get subscription:', error);
    res.status(500).json({ message: 'Failed to get subscription details' });
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
    
    if (!user?.stripeCustomerId) {
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
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ message: 'No active subscription found' });
    }
    
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      return res.status(400).json({ message: 'No active subscription found' });
    }
    
    const subscription = subscriptions.data[0];
    
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    
    logger.info(`[Billing] Subscription ${subscription.id} set to cancel at period end for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'Subscription will be canceled at the end of the billing period',
      cancelAt: new Date(subscription.current_period_end * 1000).toISOString(),
    });
  } catch (error) {
    logger.error('[Billing] Failed to cancel subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
});

router.post('/reactivate-subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ message: 'No subscription found' });
    }
    
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      return res.status(400).json({ message: 'No subscription found' });
    }
    
    const subscription = subscriptions.data[0];
    
    if (!subscription.cancel_at_period_end) {
      return res.status(400).json({ message: 'Subscription is not set to cancel' });
    }
    
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
    });
    
    logger.info(`[Billing] Subscription ${subscription.id} reactivated for user ${userId}`);
    
    res.json({ success: true, message: 'Subscription reactivated' });
  } catch (error) {
    logger.error('[Billing] Failed to reactivate subscription:', error);
    res.status(500).json({ message: 'Failed to reactivate subscription' });
  }
});

router.get('/invoices/:invoiceId/download', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { invoiceId } = req.params;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ message: 'No billing account found' });
    }
    
    const invoice = await stripe.invoices.retrieve(invoiceId);
    
    if (invoice.customer !== user.stripeCustomerId) {
      return res.status(403).json({ message: 'Invoice does not belong to this account' });
    }
    
    if (invoice.invoice_pdf) {
      // Redirect to Stripe's PDF URL so frontend can download it as a blob
      return res.redirect(invoice.invoice_pdf);
    }
    
    res.status(404).json({ message: 'Invoice PDF not available' });
  } catch (error) {
    logger.error('[Billing] Failed to download invoice:', error);
    res.status(500).json({ message: 'Failed to download invoice' });
  }
});

router.post('/update-payment-method', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
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

export default router;
