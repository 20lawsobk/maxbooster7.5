import Stripe from "stripe";
import { validateCustomerRefund } from "./commercePolicy";
import { initiateCommerceRefund } from "./commerce/compensation";
import { storage } from "../storage";
import { getStripePriceIds } from "./stripeSetup.js";
import { logger } from "../logger.js";
import { executeStripeOperation } from "./externalServices.js";
import { db } from "../db.js";
import { users, orders, refunds, taxForms } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { instantPayoutService } from "./instantPayoutService";
import { env } from "../config/env.js";
import { isProductionEnv } from "../lib/envHelpers.js";

// Support both production and testing Stripe keys (same logic as routes.ts)
let actualStripeKey: string | undefined;
if (isProductionEnv()) {
  // Production: Only use STRIPE_SECRET_KEY
  if (env?.STRIPE_SECRET_KEY?.startsWith("sk_")) {
    actualStripeKey = env?.STRIPE_SECRET_KEY;
  }
} else {
  // Development: Try TESTING_STRIPE_SECRET_KEY first, then STRIPE_SECRET_KEY
  if (env?.TESTING_STRIPE_SECRET_KEY?.startsWith("sk_")) {
    actualStripeKey = env?.TESTING_STRIPE_SECRET_KEY;
  } else if (env?.STRIPE_SECRET_KEY?.startsWith("sk_")) {
    actualStripeKey = env?.STRIPE_SECRET_KEY;
  }
}

if (!actualStripeKey) {
  logger.warn("❌ STRIPE CONFIGURATION ERROR in stripeService.ts:");
  logger.warn("   Missing or invalid Stripe secret key.");
  logger.warn(
    "   Expected: STRIPE_SECRET_KEY (production) or TESTING_STRIPE_SECRET_KEY (development)",
  );
  logger.warn("   Format: sk_test_... or sk_live_...");
  throw new Error(
    "Invalid Stripe configuration - cannot initialize payment service",
  );
}

const stripe = new Stripe(actualStripeKey, {
  apiVersion: "2026-02-25.clover" as any,
});

export class StripeService {
  async getOrCreateSubscription(
    userId: string,
    tier: "monthly" | "yearly" | "lifetime",
  ) {
    try {
      let user = await storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      if ((user as any)?.stripeSubscriptionId && tier !== "lifetime") {
        const result = await executeStripeOperation(
          () =>
            stripe?.subscriptions?.retrieve((user as any)?.stripeSubscriptionId, {
              expand: ["latest_invoice.payment_intent"],
            }),
          { cacheKey: `subscription:${(user as any)?.stripeSubscriptionId}` },
        );
        const subscription = result?.data;
        const latestInvoice =
          subscription?.latest_invoice as Stripe.Invoice | null;
        const paymentIntent = latestInvoice
          ? ((latestInvoice as unknown as Record<string, unknown>)
              .payment_intent as Stripe.PaymentIntent | null)
          : null;
        return {
          subscriptionId: subscription.id,
          clientSecret: paymentIntent!.client_secret,
        };
      }

      if (!user?.email) {
        throw new Error("No user email on file");
      }

      let customerId = user?.stripeCustomerId;
      if (!customerId) {
        const result = await executeStripeOperation(() =>
          stripe?.customers?.create({
            email: user.email!,
            name: user.firstName
              ? `${user?.firstName} ${user?.lastName || ""}`.trim()
              : undefined,
          }),
        );
        customerId = result?.data?.id;
        await (storage as any)?.updateUserStripeInfo(userId, customerId, null);
      }

      // Get price ID based on tier
      const priceId = this.getPriceId(tier);

      if (tier === "lifetime") {
        const result = await executeStripeOperation(() =>
          stripe?.paymentIntents?.create({
            amount: 69900,
            currency: "usd",
            customer: customerId,
            metadata: {
              userId,
              tier: "lifetime",
              planId: "lifetime",
            },
          }),
        );

        return {
          clientSecret: result.data.client_secret,
          tier: "lifetime",
        };
      } else {
        const result = await executeStripeOperation(() =>
          stripe?.subscriptions?.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: "default_incomplete",
            metadata: { userId, planId: tier },
            expand: ["latest_invoice.payment_intent"],
          }),
        );
        const subscription = result?.data;

        await (storage as any)?.updateUserStripeInfo(userId, customerId, subscription?.id);

        const latestInvoice =
          subscription?.latest_invoice as Stripe.Invoice | null;
        const paymentIntent = latestInvoice
          ? ((latestInvoice as unknown as Record<string, unknown>)
              .payment_intent as Stripe.PaymentIntent | null)
          : null;
        return {
          subscriptionId: subscription.id,
          clientSecret: paymentIntent!.client_secret,
        };
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Subscription error:");
      throw error;
    }
  }

  async createBeatPurchaseIntent(
    beatId: string,
    buyerId: string,
    licenseType: "standard" | "exclusive",
    price: number,
    sellerId?: string,
  ) {
    try {
      const result = await executeStripeOperation(() =>
        stripe?.paymentIntents?.create({
          amount: Math.round(price * 100),
          currency: "usd",
          metadata: {
            beatId,
            buyerId,
            licenseType,
            amountCents: String(Math.round(price * 100)),
            ...(sellerId ? { sellerId } : {}),
          },
        }),
      );

      return result?.data;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Beat purchase intent error:");
      throw error;
    }
  }

  async verifyBeatPurchaseIntent(input: {
    paymentIntentId: string;
    beatId: string;
    buyerId: string;
    sellerId: string;
    licenseType: "standard" | "exclusive";
    amountCents: number;
  }) {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      input.paymentIntentId,
    );
    const metadata = paymentIntent.metadata;
    if (
      paymentIntent.status !== "succeeded" ||
      paymentIntent.amount_received !== input.amountCents ||
      paymentIntent.currency !== "usd" ||
      metadata?.beatId !== input.beatId ||
      metadata?.buyerId !== input.buyerId ||
      (metadata?.sellerId != null && metadata.sellerId !== input.sellerId) ||
      metadata?.licenseType !== input.licenseType ||
      (metadata?.amountCents != null &&
        metadata.amountCents !== String(input.amountCents))
    ) {
      throw new Error(
        "PaymentIntent is unpaid or does not match this beat purchase",
      );
    }
    return {
      paymentIntentId: paymentIntent.id,
      amountCents: paymentIntent.amount_received,
    };
  }

  private getPriceId(tier: "monthly" | "yearly" | "lifetime"): string {
    // Get actual Stripe price IDs created during server initialization
    const priceIds = getStripePriceIds();
    return priceIds[tier];
  }

  async handleWebhook(event: Stripe.Event) {
    try {
      switch (event?.type as string) {
        // Subscription & payment events
        case "payment_intent.succeeded":
          const paymentIntent = event?.data?.object as Stripe.PaymentIntent;
          await this.handlePaymentSuccess(paymentIntent);
          break;
        case "invoice.payment_succeeded":
          const invoice = event?.data?.object as Stripe.Invoice;
          await this.handleSubscriptionPayment(invoice);
          break;
        case "customer.subscription.deleted":
          const subscription = event?.data?.object as Stripe.Subscription;
          await this.handleSubscriptionCanceled(subscription);
          break;

        // Marketplace payout events (Transfers)
        case "transfer.created":
        case "transfer.paid":
        case "transfer.failed":
        case "transfer.reversed":
          await instantPayoutService?.handleTransferWebhook(event);
          break;

        // Stripe Connect account events
        case "account.updated":
        case "account.application.deauthorized":
          await instantPayoutService?.handleAccountWebhook(event);
          break;

        // Manual payout events (for withdrawals)
        case "payout.paid":
        case "payout.failed":
        case "payout.canceled":
          await instantPayoutService?.handlePayoutWebhook(event);
          break;

        default:
          logger.info(`Unhandled webhook event type: ${event?.type}`);
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Webhook error:");
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
    } = paymentIntent?.metadata ?? {};

    if (tier === "lifetime" && userId) {
      // Update user subscription status
      await storage.updateUser(userId, {
        subscriptionTier: "lifetime",
        subscriptionStatus: "active",
      });
    } else if (
      type === "stem_purchase" &&
      stemId &&
      buyerId &&
      sellerId &&
      listingId
    ) {
      // Handle stem purchase completion
      await this.handleStemPurchase({
        stemId,
        buyerId,
        sellerId,
        listingId,
        stemFileUrl: stemFileUrl || "",
        amountCents: paymentIntent.amount,
      });
    } else if (beatId && buyerId && licenseType) {
      if(paymentIntent.metadata?.commerceKind!=="marketplace" || !paymentIntent.metadata.orderId)
        throw new Error("Historical beat payment lacks a canonical checkout order; reconciliation required");
      const { marketplaceService }=await import("./marketplaceService");
      await marketplaceService.processPayment(paymentIntent.metadata.orderId,paymentIntent.id);
    }
  }

  private async handleStemPurchase(_data: {
    stemId: string;
    buyerId: string;
    sellerId: string;
    listingId: string;
    stemFileUrl: string;
    amountCents: number;
  }) {
    throw new Error("Historical stem payment lacks a frozen canonical order; reconciliation required");
  }

  private async handleSubscriptionPayment(invoice: Stripe.Invoice) {
    const invoiceSubscription = (invoice as unknown as Record<string, unknown>)
      .subscription;
    if (invoice?.customer && invoiceSubscription) {
      const customerId = invoice?.customer as string;
      const subscriptionId =
        typeof invoiceSubscription === "string"
          ? invoiceSubscription
          : (invoiceSubscription as any)?.id;

      // Find user by Stripe customer ID — direct indexed lookup (avoids getAllUsers)
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, customerId))
        .limit(1);

      if (user && subscriptionId) {
        // Update subscription status
        const subscription =
          await stripe?.subscriptions?.retrieve(subscriptionId);
        const tier =
          subscription?.items?.data[0].price?.recurring?.interval === "year"
            ? "yearly"
            : "monthly";
        await storage.updateUser(user?.id, {
          subscriptionTier: tier,
          subscriptionStatus: subscription.status,
        });
      }
    }
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    const customerId = subscription?.customer as string;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);

    if (user) {
      await storage.updateUser(user?.id, {
        subscriptionStatus: "canceled",
      });
    }
  }

  /**
   * Create a refund for an order
   */
  async createRefund(params: {
    orderId:string;userId:string;sellerId?:string;amountCents?:number;reason?:string;initiatedBy?:string;idempotencyKey?:string;
  }):Promise<{success:boolean;refundId?:string;stripeRefundId?:string;error?:string}> {
    try {
      const [order]=await db.select().from(orders).where(eq(orders.id,params.orderId)).limit(1);
      if(!order) throw new Error("Order not found");
      const cents=validateCustomerRefund({...order, status: order.status || "pending"},params.userId,params.amountCents);
      return await initiateCommerceRefund(params.orderId,params.userId,cents,params.idempotencyKey||"");
    } catch(error) {return {success:false,error:error instanceof Error?error.message:String(error)};}
  }


  /**
   * Handle refund webhook events
   */
  async handleRefundWebhook(refund: Stripe.Refund) {
    try {
      const refundId = refund.metadata!.refundId;
      if (!refundId) {
        logger.warn(
          { stripeRefundId: refund.id },
          "Refund webhook without refundId metadata",
        );
        return;
      }

      await db
        .update(refunds)
        .set({
          status: refund.status as string,
          processedAt: refund.status === "succeeded" ? new Date() : undefined,
          failureReason: refund.failure_reason || undefined,
        })
        .where(eq(refunds.id, refundId));

      logger.info(
        { refundId, status: refund.status },
        "Refund status updated from webhook",
      );
    } catch (error) {
      logger.warn({ err: error }, "Error handling refund webhook:");
    }
  }

  /**
   * Get refund status
   */
  async getRefundStatus(refundId: string) {
    try {
      const [refund] = await db
        .select()
        .from(refunds)
        .where(eq(refunds.id, refundId))
        .limit(1);

      if (!refund) {
        throw new Error("Refund not found");
      }

      return refund;
    } catch (error) {
      logger.warn({ err: error }, "Error getting refund status:");
      throw error;
    }
  }

  /**
   * Get refunds for an order
   */
  async getOrderRefunds(orderId: string, actorId: string) {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || order.userId !== actorId) throw new Error("Forbidden");
      const orderRefunds = await db
        .select()
        .from(refunds)
        .where(eq(refunds.orderId, orderId))
        .orderBy(desc(refunds.createdAt));

      return orderRefunds;
    } catch (error) {
      logger.warn({ err: error }, "Error getting order refunds:");
      throw error;
    }
  }

  /**
   * Generate 1099-K tax form data for a seller
   */
  async generateTaxFormData(userId: string, taxYear: number) {
    try {
      const startOfYear = new Date(`${taxYear}-01-01T00:00:00Z`);
      const endOfYear = new Date(`${taxYear}-12-31T23:59:59Z`);

      const earningsResult = await db.execute(
        sql`SELECT 
              COALESCE(SUM(amount), 0) as total_gross,
              COUNT(*) as transaction_count
            FROM orders 
            WHERE seller_id = ${userId} 
            AND status = 'completed'
            AND created_at >= ${startOfYear.toISOString()}
            AND created_at <= ${endOfYear.toISOString()}`,
      );

      const payoutsResult = await db.execute(
        sql`SELECT COALESCE(SUM(amount_cents), 0) as total_payouts
            FROM instant_payouts 
            WHERE user_id = ${userId} 
            AND status = 'completed'
            AND created_at >= ${startOfYear?.toISOString()}
            AND created_at <= ${endOfYear?.toISOString()}`,
      );

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const totalGross = Number(earningsResult?.rows?.[0]?.total_gross || 0);
      const transactionCount = Number(
        earningsResult?.rows?.[0]?.transaction_count || 0,
      );
      const totalPayouts =
        Number(payoutsResult?.rows?.[0]?.total_payouts || 0) / 100;

      const requires1099 = totalGross >= 600 || transactionCount >= 200;

      const formData = {
        payerName: "Max Booster Platform",
        payeeName: user
          ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
          : "Unknown",
        payeeEmail: user.email || "",
        taxYear,
        grossAmount: totalGross,
        transactionCount,
        totalPayouts,
        requiresForm: requires1099,
        box1a: totalGross,
        box1b: 0,
        federalWithholding: 0,
      };

      if (requires1099) {
        const [existingForm] = await db
          .select()
          .from(taxForms)
          .where(
            and(
              eq(taxForms.userId, userId),
              eq(taxForms.taxYear, taxYear),
              eq(taxForms.formType, "1099-K"),
            ),
          )
          .limit(1);

        if (existingForm) {
          await db
            .update(taxForms)
            .set({
              totalEarningsCents: Math.round(totalGross * 100),
              formData,
              status: "generated",
              generatedAt: new Date(),
            })
            .where(eq(taxForms.id, existingForm?.id));
        } else {
          await db.insert(taxForms).values({
            userId,
            formType: "1099-K",
            taxYear,
            totalEarningsCents: Math.round(totalGross * 100),
            formData,
            status: "generated",
            generatedAt: new Date(),
          });
        }
      }

      return formData;
    } catch (error) {
      logger.warn({ err: error }, "Error generating tax form data:");
      throw error;
    }
  }
}

export const stripeService = new StripeService();
