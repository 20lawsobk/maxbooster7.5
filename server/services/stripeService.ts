import Stripe from 'stripe';
import { storage } from '../storage';
import { getStripePriceIds } from './stripeSetup.js';
import { logger } from '../logger.js';
import { stripeCircuit, executeStripeOperation } from './externalServices.js';

// Support both production and testing Stripe keys (same logic as routes.ts)
let actualStripeKey: string | undefined;
if (process.env.NODE_ENV === 'production') {
  // Production: Only use STRIPE_SECRET_KEY
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    actualStripeKey = process.env.STRIPE_SECRET_KEY;
  }
} else {
  // Development: Try TESTING_STRIPE_SECRET_KEY first, then STRIPE_SECRET_KEY
  if (process.env.TESTING_STRIPE_SECRET_KEY?.startsWith('sk_')) {
    actualStripeKey = process.env.TESTING_STRIPE_SECRET_KEY;
  } else if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    actualStripeKey = process.env.STRIPE_SECRET_KEY;
  }
}

if (!actualStripeKey) {
  logger.error('❌ STRIPE CONFIGURATION ERROR in stripeService.ts:');
  logger.error('   Missing or invalid Stripe secret key.');
  logger.error(
    '   Expected: STRIPE_SECRET_KEY (production) or TESTING_STRIPE_SECRET_KEY (development)'
  );
  logger.error('   Format: sk_test_... or sk_live_...');
  throw new Error('Invalid Stripe configuration - cannot initialize payment service');
}

const stripe = new Stripe(actualStripeKey, {
  apiVersion: '2025-08-27.basil',
});

export class StripeService {
  async getOrCreateSubscription(userId: string, tier: 'monthly' | 'yearly' | 'lifetime') {
    try {
      let user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.stripeSubscriptionId && tier !== 'lifetime') {
        const result = await executeStripeOperation(
          () => stripe.subscriptions.retrieve(user.stripeSubscriptionId!, {
            expand: ['latest_invoice.payment_intent'],
          }),
          { cacheKey: `subscription:${user.stripeSubscriptionId}` }
        );
        const subscription = result.data;
        const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
        const paymentIntent = latestInvoice
          ? ((latestInvoice as any).payment_intent as Stripe.PaymentIntent | null)
          : null;
        return {
          subscriptionId: subscription.id,
          clientSecret: paymentIntent?.client_secret,
        };
      }

      if (!user.email) {
        throw new Error('No user email on file');
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const result = await executeStripeOperation(
          () => stripe.customers.create({
            email: user.email!,
            name: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined,
          })
        );
        customerId = result.data.id;
        await storage.updateUserStripeInfo(userId, customerId, null);
      }

      // Get price ID based on tier
      const priceId = this.getPriceId(tier);

      if (tier === 'lifetime') {
        const result = await executeStripeOperation(
          () => stripe.paymentIntents.create({
            amount: 69900,
            currency: 'usd',
            customer: customerId,
            metadata: {
              userId,
              tier: 'lifetime',
            },
          })
        );

        return {
          clientSecret: result.data.client_secret,
          tier: 'lifetime',
        };
      } else {
        const result = await executeStripeOperation(
          () => stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
          })
        );
        const subscription = result.data;

        await storage.updateUserStripeInfo(userId, customerId, subscription.id);

        const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
        const paymentIntent = latestInvoice
          ? ((latestInvoice as any).payment_intent as Stripe.PaymentIntent | null)
          : null;
        return {
          subscriptionId: subscription.id,
          clientSecret: paymentIntent?.client_secret,
        };
      }
    } catch (error: unknown) {
      logger.error('Subscription error:', error);
      throw error;
    }
  }

  async createBeatPurchaseIntent(
    beatId: string,
    buyerId: string,
    licenseType: 'standard' | 'exclusive',
    price: number
  ) {
    try {
      const result = await executeStripeOperation(
        () => stripe.paymentIntents.create({
          amount: Math.round(price * 100),
          currency: 'usd',
          metadata: {
            beatId,
            buyerId,
            licenseType,
          },
        })
      );

      return result.data;
    } catch (error: unknown) {
      logger.error('Beat purchase intent error:', error);
      throw error;
    }
  }

  private getPriceId(tier: 'monthly' | 'yearly' | 'lifetime'): string {
    // Get actual Stripe price IDs created during server initialization
    const priceIds = getStripePriceIds();
    return priceIds[tier];
  }

  async handleWebhook(event: Stripe.Event) {
    try {
      // Import instantPayoutService here to avoid circular dependency
      const { instantPayoutService } = await import('./instantPayoutService');

      switch (event.type) {
        // Subscription & payment events
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.handlePaymentSuccess(paymentIntent);
          break;
        case 'invoice.payment_succeeded':
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleSubscriptionPayment(invoice);
          break;
        case 'customer.subscription.deleted':
          const subscription = event.data.object as Stripe.Subscription;
          await this.handleSubscriptionCanceled(subscription);
          break;

        // Marketplace payout events (Transfers)
        case 'transfer.created':
        case 'transfer.paid':
        case 'transfer.failed':
        case 'transfer.reversed':
          await instantPayoutService.handleTransferWebhook(event);
          break;

        // Stripe Connect account events
        case 'account.updated':
        case 'account.application.deauthorized':
          await instantPayoutService.handleAccountWebhook(event);
          break;

        // Manual payout events (for withdrawals)
        case 'payout.paid':
        case 'payout.failed':
        case 'payout.canceled':
          await instantPayoutService.handlePayoutWebhook(event);
          break;

        default:
          logger.info(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error: unknown) {
      logger.error('Webhook error:', error);
      throw error;
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    const {
      userId,
      tier,
      beatId,
      buyerId,
      licenseType,
      type,
      stemId,
      sellerId,
      listingId,
      stemFileUrl,
    } = paymentIntent.metadata;

    if (tier === 'lifetime' && userId) {
      // Update user subscription status
      await storage.updateUser(userId, {
        subscriptionPlan: 'lifetime',
        subscriptionStatus: 'active',
      });
    } else if (type === 'stem_purchase' && stemId && buyerId && sellerId && listingId) {
      // Handle stem purchase completion
      await this.handleStemPurchase({
        stemId,
        buyerId,
        sellerId,
        listingId,
        stemFileUrl: stemFileUrl || '',
        amountCents: paymentIntent.amount,
      });
    } else if (beatId && buyerId && licenseType) {
      // Beat purchase webhook handler reserved for future beat-specific purchases
      // Currently marketplace uses stem purchase flow above
      logger.info('Beat purchase completed:', { beatId, buyerId, licenseType });
    }
  }

  private async handleStemPurchase(data: {
    stemId: string;
    buyerId: string;
    sellerId: string;
    listingId: string;
    stemFileUrl: string;
    amountCents: number;
  }) {
    const { db } = await import('../db');
    const { orders, stemOrders, listingStems } = await import('@shared/schema');
    const { eq, sql } = await import('drizzle-orm');
    const crypto = await import('crypto');

    // Create order record
    const [order] = await db
      .insert(orders)
      .values({
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        listingId: parseInt(data.listingId),
        licenseType: 'stem_purchase',
        amountCents: data.amountCents,
        currency: 'usd',
        status: 'completed',
        downloadUrl: data.stemFileUrl,
      })
      .returning();

    // Generate download token
    const downloadToken = crypto.randomBytes(32).toString('hex');

    // Create stem order
    await db.insert(stemOrders).values({
      orderId: order.id,
      stemId: data.stemId,
      price: (data.amountCents / 100).toString(),
      downloadToken,
      downloadCount: 0,
    });

    // Update stem download count
    await db
      .update(listingStems)
      .set({ downloadCount: sql`${listingStems.downloadCount} + 1` })
      .where(eq(listingStems.id, data.stemId));

    logger.info(`✅ Stem purchase completed: ${data.stemId} by ${data.buyerId}`);
  }

  private async handleSubscriptionPayment(invoice: Stripe.Invoice) {
    const invoiceSubscription = (invoice as any).subscription;
    if (invoice.customer && invoiceSubscription) {
      const customerId = invoice.customer as string;
      const subscriptionId =
        typeof invoiceSubscription === 'string' ? invoiceSubscription : invoiceSubscription.id;

      // Find user by Stripe customer ID
      const users = await storage.getAllUsers();
      const user = users.find((u) => u.stripeCustomerId === customerId);

      if (user && subscriptionId) {
        // Update subscription status
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const tier =
          subscription.items.data[0].price.recurring?.interval === 'year' ? 'yearly' : 'monthly';
        await storage.updateUser(user.id, {
          subscriptionPlan: tier,
          subscriptionStatus: subscription.status,
        });
      }
    }
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    const users = await storage.getAllUsers();
    const user = users.find((u) => u.stripeCustomerId === customerId);

    if (user) {
      await storage.updateUser(user.id, {
        subscriptionStatus: 'canceled',
      });
    }
  }
}

export const stripeService = new StripeService();
