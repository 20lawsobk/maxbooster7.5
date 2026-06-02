/**
 * STRIPE WEBHOOK ROUTES
 *
 * Handles Stripe webhook events with signature verification.
 * Critical for payment security.
 */

import { Router, Request, Response } from "express";

interface StripeWebhookRequest extends Request {
  stripeEvent: Stripe.Event;
}
import Stripe from "stripe";
import { logger } from "../../logger.js";
import { stripeWebhookMiddleware, handleWebhookEvent, registerWebhookHandler } from "../../safety/stripeWebhookSecurity";
import { auditPayment } from "../../safety/auditLogger";
import { db } from "../../db";
import {
  orders,
  storefrontOrders,
  bogoPromotions,
  customerMemberships,
  users,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { notificationService } from "../../services/notificationService.js";
import { dunningService } from "../../services/dunningService.js";
import { env } from "../../config/env.js";

const router = Router();

// Register webhook handlers for various event types
registerWebhookHandler("checkout.session.completed", async (event) => {
  const session = event.data.object as Stripe.Checkout.Session;
  logger.info(`[Stripe] Checkout completed: ${session.id}`);

  await auditPayment.charge(
    session.metadata?.userId || session.metadata?.buyerId || "unknown",
    session.amount_total || 0,
    (session.payment_intent as string) || session.id,
    true,
  );

  const {
    beatId,
    buyerId,
    sellerId,
    licenseType,
    licenseSnapshot: snapshotStr,
  } = session.metadata || {};
  if (beatId && buyerId && sellerId) {
    try {
      const paymentRef = (session.payment_intent as string) || session.id;
      const [existing] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentRef))
        .limit(1);

      let parsedSnapshot = null;
      try {
        if (snapshotStr) parsedSnapshot = JSON.parse(snapshotStr);
      } catch {
        /* intentional: malformed snapshot JSON → parsedSnapshot stays null */
      }

      if (!existing) {
        await db.insert(orders).values({
          userId: buyerId,
          sellerId,
          listingId: beatId,
          amount: (session.amount_total || 0) / 100,
          currency: session.currency || "usd",
          status: "completed",
          licenseType: licenseType || "basic",
          licenseSnapshot: parsedSnapshot,
          stripePaymentIntentId: paymentRef,
          metadata: { licenseType, sessionId: session.id },
        });
        logger.info(
          `[Stripe] Order created for beat ${beatId}, buyer ${buyerId}, seller ${sellerId}, license ${licenseType}`,
        );
      } else {
        logger.info(
          `[Stripe] Order already exists for payment ${paymentRef}, skipping duplicate`,
        );
      }
    } catch (orderError) {
      logger.warn("[Stripe] Failed to create order record:", orderError);
    }
  }

  const { storefrontId, promotionId } = session.metadata || {};
  if (storefrontId) {
    try {
      await db
        .update(storefrontOrders)
        .set({ status: "completed" })
        .where(eq(storefrontOrders.stripeSessionId, session.id));
      logger.info(
        `[Stripe] Storefront orders marked completed for session ${session.id}`,
      );

      if (promotionId) {
        await db
          .update(bogoPromotions)
          .set({ redemptionCount: sql`${bogoPromotions.redemptionCount} + 1` })
          .where(eq(bogoPromotions.id, promotionId));
        logger.info(
          `[Stripe] BOGO promotion ${promotionId} redemption count incremented`,
        );
      }
    } catch (storefrontError) {
      logger.warn(
        "[Stripe] Failed to update storefront orders:",
        storefrontError,
      );
    }
  }

  const {
    type: sessionType,
    customerId: memberCustomerId,
    tierId: memberTierId,
    storefrontId: memberStorefrontId,
  } = session.metadata || {};
  if (
    sessionType === "storefront_membership" &&
    memberCustomerId &&
    memberTierId
  ) {
    try {
      const subscriptionId = session.subscription as string | undefined;

      const existing = await db
        .select({ id: customerMemberships.id })
        .from(customerMemberships)
        .where(
          and(
            eq(customerMemberships.customerId, memberCustomerId),
            eq(customerMemberships.tierId, memberTierId),
            eq(customerMemberships.status, "active"),
          ),
        )
        .limit(1);

      if (!existing[0]) {
        await db.insert(customerMemberships).values({
          customerId: memberCustomerId,
          tierId: memberTierId,
          storefrontId: memberStorefrontId || "",
          stripeSubscriptionId: subscriptionId || null,
          status: "active",
        });

        logger.info(
          `[Stripe] Storefront membership created: tier=${memberTierId}, customer=${memberCustomerId}`,
        );
      } else {
        logger.info(
          `[Stripe] Storefront membership already active for tier=${memberTierId}, customer=${memberCustomerId}, skipping`,
        );
      }
    } catch (membershipError) {
      logger.warn(
        "[Stripe] Failed to activate storefront membership:",
        membershipError,
      );
    }
  }

  // For subscription-mode checkouts with a planId in metadata, update the user's
  // tier immediately so they get access before customer.subscription.created fires.
  if (
    session.mode === "subscription" &&
    session.customer &&
    session.metadata?.planId
  ) {
    const checkoutCusId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as { id: string }).id;
    const planId = session.metadata.planId;
    try {
      const updated = await db
        .update(users)
        .set({
          subscriptionTier: planId,
          subscriptionStatus: "active",
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : null,
        })
        .where(eq(users.stripeCustomerId, checkoutCusId))
        .returning({ id: users.id });
      if (updated.length > 0) {
        logger.info(
          `[Stripe] checkout.session.completed: user ${updated[0].id} tier set to ${planId}`,
        );
      }
    } catch (checkoutErr) {
      logger.warn(
        { err: checkoutErr },
        "[Stripe] Failed to update tier on checkout.session.completed:",
      );
    }
  }

  return { success: true, message: "Checkout session processed" };
});

registerWebhookHandler("customer.subscription.created", async (event) => {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info(
    `[Stripe] Subscription created: ${subscription.id} - Status: ${subscription.status}`,
  );

  try {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const tier = subscription.metadata?.planId || "monthly";
    const endsAt = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    const updated = await db
      .update(users)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: subscription.status,
        subscriptionEndsAt: endsAt,
        stripeSubscriptionId: subscription.id,
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ id: users.id });

    if (updated.length > 0) {
      logger.info(
        `[Stripe] User ${updated[0].id} subscription created: tier=${tier}, status=${subscription.status}`,
      );
    } else {
      logger.warn(
        `[Stripe] No user found for Stripe customer ${customerId} on subscription.created`,
      );
    }
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to update user on subscription.created:",
    );
  }

  return { success: true, message: "Subscription created" };
});

registerWebhookHandler("customer.subscription.updated", async (event) => {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info(
    `[Stripe] Subscription updated: ${subscription.id} - Status: ${subscription.status}`,
  );

  try {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const tier = subscription.metadata?.planId || "monthly";
    const endsAt = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    const updated = await db
      .update(users)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: subscription.status,
        subscriptionEndsAt: endsAt,
        stripeSubscriptionId: subscription.id,
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ id: users.id });

    if (updated.length > 0) {
      logger.info(
        `[Stripe] User ${updated[0].id} subscription updated: tier=${tier}, status=${subscription.status}`,
      );
      const previousTier = subscription.metadata?.previousPlanId;
      if (subscription.status === "active") {
        if (previousTier && previousTier !== tier) {
          notificationService
            .sendSubscriptionChangedNotification(
              updated[0].id,
              previousTier,
              tier,
            )
            .catch(() => {});
        } else {
          notificationService
            .sendSubscriptionRenewedNotification(updated[0].id, tier)
            .catch(() => {});
        }
      }
    } else {
      logger.warn(
        `[Stripe] No user found for Stripe customer ${customerId} on subscription.updated`,
      );
    }
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to update user on subscription.updated:",
    );
  }

  return { success: true, message: "Subscription updated" };
});

registerWebhookHandler("customer.subscription.deleted", async (event) => {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info(`[Stripe] Subscription canceled: ${subscription.id}`);

  try {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const updated = await db
      .update(users)
      .set({
        subscriptionTier: "free",
        subscriptionStatus: "canceled",
        subscriptionEndsAt: subscription.ended_at
          ? new Date(subscription.ended_at * 1000)
          : new Date(),
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ id: users.id });

    if (updated.length > 0) {
      logger.info(
        `[Stripe] User ${updated[0].id} subscription canceled, downgraded to free`,
      );
    } else {
      logger.warn(
        `[Stripe] No user found for Stripe customer ${customerId} on subscription.deleted`,
      );
    }
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to update user on subscription.deleted:",
    );
  }

  return { success: true, message: "Subscription canceled" };
});

registerWebhookHandler("invoice.paid", async (event) => {
  const invoice = event.data.object as Stripe.Invoice;
  logger.info(
    `[Stripe] Invoice paid: ${invoice.id} - Amount: $${(invoice.amount_paid / 100).toFixed(2)}`,
  );

  await auditPayment.charge(
    invoice.customer as string,
    invoice.amount_paid,
    (invoice.payment_intent as string) || invoice.id,
    true,
  );

  try {
    await dunningService.resolveSequence(invoice.id, "paid");
  } catch (err) {
    logger.warn({ err: err }, "[Stripe] Failed to resolve dunning sequence:");
  }

  return { success: true, message: "Invoice paid" };
});

registerWebhookHandler("invoice.payment_failed", async (event) => {
  const invoice = event.data.object as Stripe.Invoice;
  logger.warn(`[Stripe] Payment failed: ${invoice.id}`);

  await auditPayment.charge(
    invoice.customer as string,
    invoice.amount_due,
    invoice.id,
    false,
    "Payment failed",
  );

  try {
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : (invoice.customer as Record<string, unknown>)?.id;
    if (customerId) {
      const found = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.stripeCustomerId, customerId))
        .limit(1);
      if (found.length > 0) {
        const amount = invoice.amount_due / 100;
        const reason = (invoice as Record<string, unknown>).last_payment_error
          ?.message;
        await notificationService.sendPaymentFailedNotification(
          found[0].id,
          amount,
          reason,
        );
        await notificationService.sendAdminPaymentIssueNotification(
          found[0].email!,
          found[0].id,
          amount,
          reason,
        );

        try {
          await dunningService.startSequence(found[0].id, invoice.id);
        } catch (dunningErr) {
          logger.warn("[Stripe] Failed to start dunning sequence:", dunningErr);
        }
      }
    }
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to send payment failure notification:",
    );
  }

  return { success: true, message: "Payment failure recorded" };
});

registerWebhookHandler("payment_intent.succeeded", async (event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  logger.info(
    `[Stripe] Payment intent succeeded: ${paymentIntent.id} — amount: $${(paymentIntent.amount / 100).toFixed(2)}`,
  );

  const userId = paymentIntent.metadata?.userId;
  if (!userId) {
    logger.warn(
      `[Stripe] payment_intent.succeeded has no userId in metadata: ${paymentIntent.id}`,
    );
    return {
      success: true,
      message: "Payment intent succeeded (no user context)",
    };
  }

  try {
    const [existingOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
      .limit(1);

    if (!existingOrder) {
      logger.warn(
        `[Stripe] payment_intent.succeeded: no order found for ${paymentIntent.id} — may have been handled via checkout.session.completed or subscription event`,
      );
    } else {
      logger.info(
        `[Stripe] payment_intent.succeeded: order ${existingOrder.id} confirmed for user ${userId}`,
      );
    }

    await auditPayment.charge(
      userId,
      paymentIntent.amount,
      paymentIntent.id,
      true,
    );
  } catch (err) {
    logger.warn(`[Stripe] payment_intent.succeeded audit error: ${err}`);
  }

  return { success: true, message: "Payment intent succeeded and audited" };
});

registerWebhookHandler("payment_intent.payment_failed", async (event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  logger.warn(`[Stripe] Payment failed: ${paymentIntent.id}`);
  return { success: true, message: "Payment failure recorded" };
});

// Stripe Connect webhook handlers for payouts
registerWebhookHandler("account.updated", async (event) => {
  const account = event.data.object as Stripe.Account;
  logger.info(
    `[Stripe Connect] Account updated: ${account.id} - Charges enabled: ${account.charges_enabled}`,
  );
  return { success: true, message: "Account updated" };
});

registerWebhookHandler("transfer.created", async (event) => {
  const transfer = event.data.object as Stripe.Transfer;
  logger.info(
    `[Stripe Connect] Transfer created: ${transfer.id} - Amount: $${(transfer.amount / 100).toFixed(2)}`,
  );
  return { success: true, message: "Transfer created" };
});

registerWebhookHandler("payout.paid", async (event) => {
  const payout = event.data.object as Stripe.Payout;
  logger.info(
    `[Stripe Connect] Payout completed: ${payout.id} - Amount: $${(payout.amount / 100).toFixed(2)}`,
  );
  return { success: true, message: "Payout completed" };
});

registerWebhookHandler("payout.failed", async (event) => {
  const payout = event.data.object as Stripe.Payout;
  logger.warn(
    `[Stripe Connect] Payout failed: ${payout.id} - Reason: ${payout.failure_message}`,
  );
  return { success: true, message: "Payout failure recorded" };
});

/**
 * POST /api/webhooks/stripe
 * Main webhook endpoint with signature verification
 */
router.post(
  "/",
  stripeWebhookMiddleware,
  async (req: StripeWebhookRequest, res: Response) => {
    try {
      const event = req.stripeEvent;

      if (!event) {
        return res.status(400).json({ error: "No event found" });
      }

      // Process the event
      const result = await handleWebhookEvent(event);

      if (result.success) {
        res.json({ received: true, message: result.message });
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error) {
      logger.warn({ err: error }, "[Stripe Webhook] Handler error:");
      res.status(500).json({ error: "Webhook handler failed" });
    }
  },
);

/**
 * GET /api/webhooks/stripe/health
 * Health check for webhook endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    webhookSecretConfigured: !!env.STRIPE_WEBHOOK_SECRET,
    stripeKeyConfigured: !!env.STRIPE_SECRET_KEY,
  });
});

export default router;
