// @ts-nocheck
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
import { instantPayoutService } from "../../services/instantPayoutService.js";
import { env } from "../../config/env.js";

const router = Router();

// Register webhook handlers for various event types
registerWebhookHandler("checkout.session.completed", async (event) => {
  const session = event?.data.object as Stripe.Checkout.Session;
  logger.info(`[Stripe] Checkout completed: ${session?.id}`);

  await auditPayment?.charge(
    session?.metadata?.userId || session?.metadata?.buyerId || "unknown",
    session?.amount_total || 0,
    (session?.payment_intent as string) || session?.id,
    true,
  );

  const failures: string[] = [];

  const {
    beatId,
    buyerId,
    sellerId,
    licenseType,
    licenseSnapshot: snapshotStr,
  } = session?.metadata || {};
  if (beatId && buyerId && sellerId) {
    try {
      const paymentRef = (session?.payment_intent as string) || session?.id;
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
          amount: (session?.amount_total || 0) / 100,
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
      logger.warn(orderError, "[Stripe] Failed to create order record:");
      failures.push(`order creation for beat ${beatId} (payment ${session?.id})`);
    }
  }

  const { storefrontId, promotionId } = session?.metadata || {};
  if (storefrontId) {
    try {
      const updatedStorefrontOrders = await db
        .update(storefrontOrders)
        .set({ status: "completed" })
        .where(eq(storefrontOrders.stripeSessionId, session?.id))
        .returning({ id: storefrontOrders.id });

      if (updatedStorefrontOrders?.length > 0) {
        logger.info(
          `[Stripe] Storefront orders marked completed for session ${session?.id}`,
        );
      } else {
        logger.warn(
          `[Stripe] No storefront order found for session ${session?.id}`,
        );
        failures.push(`storefront order update for session ${session?.id}`);
      }

      if (promotionId) {
        const updatedPromotions = await db
          .update(bogoPromotions)
          .set({ redemptionCount: sql`${bogoPromotions.redemptionCount} + 1` })
          .where(eq(bogoPromotions.id, promotionId))
          .returning({ id: bogoPromotions.id });

        if (updatedPromotions?.length > 0) {
          logger.info(
            `[Stripe] BOGO promotion ${promotionId} redemption count incremented`,
          );
        } else {
          logger.warn(
            `[Stripe] BOGO promotion ${promotionId} not found for redemption increment`,
          );
          failures.push(`BOGO promotion redemption for ${promotionId}`);
        }
      }
    } catch (storefrontError) {
      logger.warn({ detail: storefrontError }, "[Stripe] Failed to update storefront orders:",
      );
      failures.push(`storefront order update for session ${session?.id}`);
    }
  }

  const {
    type: sessionType,
    customerId: memberCustomerId,
    tierId: memberTierId,
    storefrontId: memberStorefrontId,
  } = session?.metadata || {};
  if (
    sessionType === "storefront_membership" &&
    memberCustomerId &&
    memberTierId
  ) {
    try {
      const subscriptionId = session?.subscription as string | undefined;

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
      logger.warn({ detail: membershipError }, "[Stripe] Failed to activate storefront membership:",
      );
      failures.push(
        `membership activation for tier=${memberTierId}, customer=${memberCustomerId}`,
      );
    }
  }

  // For subscription-mode checkouts with a planId in metadata, update the user's
  // tier immediately so they get access before customer?.subscription.created fires.
  if (
    session?.mode === "subscription" &&
    session?.customer &&
    session?.metadata?.planId
  ) {
    const checkoutCusId =
      typeof session?.customer === "string"
        ? session?.customer
        : (session?.customer as { id: string }).id;
    const planId = session?.metadata.planId;
    try {
      const updated = await db
        .update(users)
        .set({
          subscriptionTier: planId,
          subscriptionStatus: "active",
          stripeSubscriptionId:
            typeof session?.subscription === "string"
              ? session?.subscription
              : null,
        })
        .where(eq(users.stripeCustomerId, checkoutCusId))
        .returning({ id: users.id });
      if (updated?.length > 0) {
        logger.info(
          `[Stripe] checkout.session.completed: user ${updated[0].id} tier set to ${planId}`,
        );
      } else {
        logger.warn(
          `[Stripe] checkout.session.completed: no user found for customer ${checkoutCusId} to set tier ${planId}`,
        );
        failures.push(`tier update for customer ${checkoutCusId}`);
      }
    } catch (checkoutErr) {
      logger.warn(
        { err: checkoutErr },
        "[Stripe] Failed to update tier on checkout.session.completed:",
      );
      failures.push(`tier update for customer ${checkoutCusId}`);
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      message: `Checkout session ${session?.id} processing incomplete: ${failures.join("; ")}`,
    };
  }

  return { success: true, message: "Checkout session processed" };
});

registerWebhookHandler("customer.subscription.created", async (event) => {
  const subscription = event?.data.object as Stripe.Subscription;
  logger.info(
    `[Stripe] Subscription created: ${subscription?.id} - Status: ${subscription?.status}`,
  );

  try {
    const customerId =
      typeof subscription?.customer === "string"
        ? subscription?.customer
        : subscription?.customer.id;

    const tier = subscription?.metadata?.planId || "monthly";
    const endsAt = (subscription as any)?.current_period_end
      ? new Date((subscription as any)?.current_period_end * 1000)
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

    if (updated?.length > 0) {
      logger.info(
        `[Stripe] User ${updated[0].id} subscription created: tier=${tier}, status=${subscription?.status}`,
      );
      return { success: true, message: "Subscription created" };
    }

    logger.warn(
      `[Stripe] No user found for Stripe customer ${customerId} on subscription.created`,
    );
    return {
      // The event is valid and has been fully evaluated. A customer can exist
      // in Stripe before its local account is created, so returning a failure
      // here would make Stripe retry an event that cannot become applicable.
      success: true,
      message: `Subscription created event acknowledged; no local user found for Stripe customer ${customerId}`,
    };
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to update user on subscription.created:",
    );
    return {
      success: false,
      message: `Failed to update user on subscription.created: ${(err as Error)?.message || err}`,
    };
  }
});

registerWebhookHandler("customer.subscription.updated", async (event) => {
  const subscription = event?.data.object as Stripe.Subscription;
  logger.info(
    `[Stripe] Subscription updated: ${subscription?.id} - Status: ${subscription?.status}`,
  );

  try {
    const customerId =
      typeof subscription?.customer === "string"
        ? subscription?.customer
        : subscription?.customer.id;

    const tier = subscription?.metadata?.planId || "monthly";
    const endsAt = (subscription as any)?.current_period_end
      ? new Date((subscription as any)?.current_period_end * 1000)
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

    if (updated?.length > 0) {
      logger.info(
        `[Stripe] User ${updated[0].id} subscription updated: tier=${tier}, status=${subscription?.status}`,
      );
      const previousTier = subscription?.metadata?.previousPlanId;
      if (subscription?.status === "active") {
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
      return { success: true, message: "Subscription updated" };
    }

    logger.warn(
      `[Stripe] No user found for Stripe customer ${customerId} on subscription.updated`,
    );
    return {
      success: false,
      message: `No user found for Stripe customer ${customerId} on subscription.updated`,
    };
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to update user on subscription.updated:",
    );
    return {
      success: false,
      message: `Failed to update user on subscription.updated: ${(err as Error)?.message || err}`,
    };
  }
});

registerWebhookHandler("customer.subscription.deleted", async (event) => {
  const subscription = event?.data.object as Stripe.Subscription;
  logger.info(`[Stripe] Subscription canceled: ${subscription?.id}`);

  try {
    const customerId =
      typeof subscription?.customer === "string"
        ? subscription?.customer
        : subscription?.customer.id;

    const updated = await db
      .update(users)
      .set({
        subscriptionTier: "free",
        subscriptionStatus: "canceled",
        subscriptionEndsAt: subscription.ended_at
          ? new Date(subscription?.ended_at * 1000)
          : new Date(),
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ id: users.id });

    if (updated?.length > 0) {
      logger.info(
        `[Stripe] User ${updated[0].id} subscription canceled, downgraded to free`,
      );
      return { success: true, message: "Subscription canceled" };
    }

    logger.warn(
      `[Stripe] No user found for Stripe customer ${customerId} on subscription.deleted`,
    );
    return {
      success: false,
      message: `No user found for Stripe customer ${customerId} on subscription.deleted`,
    };
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to update user on subscription.deleted:",
    );
    return {
      success: false,
      message: `Failed to update user on subscription.deleted: ${(err as Error)?.message || err}`,
    };
  }
});

registerWebhookHandler("invoice.paid", async (event) => {
  const invoice = event?.data.object as Stripe.Invoice;
  logger.info(
    `[Stripe] Invoice paid: ${invoice?.id} - Amount: $${(invoice?.amount_paid / 100).toFixed(2)}`,
  );

  await auditPayment?.charge(
    invoice?.customer as string,
    invoice?.amount_paid,
    ((invoice as any)?.payment_intent as string) || invoice?.id,
    true,
  );

  try {
    const resolved = await dunningService?.resolveSequence(invoice?.id, "paid");
    if (resolved === false) {
      return {
        success: false,
        message: `Failed to resolve dunning sequence for invoice ${invoice?.id}`,
      };
    }
  } catch (err) {
    logger.warn({ err: err }, "[Stripe] Failed to resolve dunning sequence:");
    return {
      success: false,
      message: `Failed to resolve dunning sequence for invoice ${invoice?.id}: ${(err as Error)?.message || err}`,
    };
  }

  return { success: true, message: "Invoice paid" };
});

registerWebhookHandler("invoice.payment_failed", async (event) => {
  const invoice = event?.data.object as Stripe.Invoice;
  logger.warn(`[Stripe] Payment failed: ${invoice?.id}`);

  await auditPayment?.charge(
    invoice?.customer as string,
    invoice?.amount_due,
    invoice?.id,
    false,
    "Payment failed",
  );

  try {
    const customerId =
      typeof invoice?.customer === "string"
        ? invoice?.customer
        : (invoice?.customer as unknown as Record<string, unknown>)?.id;

    if (!customerId) {
      logger.warn(
        `[Stripe] invoice.payment_failed has no customer id: ${invoice?.id}`,
      );
      return {
        success: false,
        message: `invoice.payment_failed has no customer id for invoice ${invoice?.id}`,
      };
    }

    const found = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);

    if (!found?.length) {
      logger.warn(
        `[Stripe] invoice.payment_failed: no user found for Stripe customer ${customerId}`,
      );
      return {
        success: false,
        message: `No user found for Stripe customer ${customerId} on invoice.payment_failed`,
      };
    }

    const amount = invoice?.amount_due / 100;
    const reason = (invoice as unknown as Record<string, unknown>).last_payment_error
      ?.message;

    // Notifications are best-effort — a delivery failure shouldn't mask
    // whether the critical write (the dunning sequence row) succeeded.
    await notificationService
      ?.sendPaymentFailedNotification(found[0].id, amount, reason)
      .catch((notifyErr: unknown) =>
        logger.warn(
          { err: notifyErr },
          "[Stripe] Failed to send payment-failed user notification:",
        ),
      );
    await notificationService
      ?.sendAdminPaymentIssueNotification(
        found[0].email!,
        found[0].id,
        amount,
        reason,
      )
      .catch((notifyErr: unknown) =>
        logger.warn(
          { err: notifyErr },
          "[Stripe] Failed to send payment-failed admin notification:",
        ),
      );

    const started = await dunningService?.startSequence(
      found[0].id,
      invoice?.id,
    );
    if (started === false) {
      return {
        success: false,
        message: `Failed to start dunning sequence for invoice ${invoice?.id}`,
      };
    }
  } catch (err) {
    logger.warn(
      { err: err },
      "[Stripe] Failed to process payment failure:",
    );
    return {
      success: false,
      message: `Failed to process invoice.payment_failed for invoice ${invoice?.id}: ${(err as Error)?.message || err}`,
    };
  }

  return { success: true, message: "Payment failure recorded" };
});

registerWebhookHandler("payment_intent.succeeded", async (event) => {
  const paymentIntent = event?.data.object as Stripe.PaymentIntent;
  logger.info(
    `[Stripe] Payment intent succeeded: ${paymentIntent?.id} — amount: $${(paymentIntent?.amount / 100).toFixed(2)}`,
  );

  const userId = paymentIntent?.metadata?.userId;
  if (!userId) {
    logger.warn(
      `[Stripe] payment_intent.succeeded has no userId in metadata: ${paymentIntent?.id}`,
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
      .where(eq(orders.stripePaymentIntentId, paymentIntent?.id))
      .limit(1);

    if (!existingOrder) {
      logger.warn(
        `[Stripe] payment_intent.succeeded: no order found for ${paymentIntent?.id} — may have been handled via checkout.session.completed or subscription event`,
      );
    } else {
      logger.info(
        `[Stripe] payment_intent.succeeded: order ${existingOrder?.id} confirmed for user ${userId}`,
      );
    }

    await auditPayment?.charge(
      userId,
      paymentIntent?.amount,
      paymentIntent?.id,
      true,
    );
  } catch (err) {
    logger.warn(`[Stripe] payment_intent.succeeded audit error: ${err}`);
    return {
      success: false,
      message: `payment_intent.succeeded processing failed for ${paymentIntent?.id}: ${(err as Error)?.message || err}`,
    };
  }

  return { success: true, message: "Payment intent succeeded and audited" };
});

// payment_intent.payment_failed has no order/subscription row of its own to
// update (that lives in checkout.session.completed / invoice.payment_failed),
// but it must still confirm the same kind of critical write its sibling
// payment_intent.succeeded handler makes: a persisted payment audit record.
registerWebhookHandler("payment_intent.payment_failed", async (event) => {
  const paymentIntent = event?.data.object as Stripe.PaymentIntent;
  const failureReason =
    (paymentIntent as unknown as Record<string, any>)?.last_payment_error
      ?.message || "Payment failed";
  logger.warn(
    `[Stripe] Payment failed: ${paymentIntent?.id} — ${failureReason}`,
  );

  try {
    await auditPayment.charge(
      paymentIntent?.metadata?.userId ||
        paymentIntent?.metadata?.buyerId ||
        "unknown",
      paymentIntent?.amount || 0,
      paymentIntent?.id,
      false,
      failureReason,
    );
  } catch (err) {
    logger.warn(
      { err },
      "[Stripe] Failed to record payment_intent.payment_failed audit:",
    );
    return {
      success: false,
      message: `Failed to record payment failure audit for ${paymentIntent?.id}: ${(err as Error)?.message || err}`,
    };
  }

  return { success: true, message: "Payment failure recorded" };
});

// Stripe Connect webhook handlers for payouts. Each one confirms its critical
// write by delegating to instantPayoutService, which persists the matching
// instant_payouts/users row (or, for account.application.deauthorized,
// clears the stored Connect account id) and confirms every update actually
// matched a row via `.returning()`. Every transfer/payout/account this
// platform's Connect setup produces is tagged with an internal id at
// creation time, so an event that cannot be matched to a local record is a
// reconciliation gap, not a legitimate no-op — instantPayoutService throws
// for that case (and for real DB errors) instead of resolving silently, and
// these handlers turn any throw into success:false so Stripe retries.
registerWebhookHandler("account.updated", async (event) => {
  const account = event?.data.object as Stripe.Account;
  logger.info(
    `[Stripe Connect] Account updated: ${account?.id} - Charges enabled: ${account?.charges_enabled}`,
  );
  try {
    await instantPayoutService.handleAccountWebhook(event);
  } catch (err) {
    logger.warn({ err }, "[Stripe Connect] Failed to process account.updated:");
    return {
      success: false,
      message: `Failed to process account.updated for ${account?.id}: ${(err as Error)?.message || err}`,
    };
  }
  return { success: true, message: "Account update processed" };
});

registerWebhookHandler("transfer.created", async (event) => {
  const transfer = event?.data.object as Stripe.Transfer;
  logger.info(
    `[Stripe Connect] Transfer created: ${transfer?.id} - Amount: $${(transfer?.amount / 100).toFixed(2)}`,
  );
  try {
    await instantPayoutService.handleTransferWebhook(event);
  } catch (err) {
    logger.warn(
      { err },
      "[Stripe Connect] Failed to process transfer.created:",
    );
    return {
      success: false,
      message: `Failed to process transfer.created for ${transfer?.id}: ${(err as Error)?.message || err}`,
    };
  }
  return { success: true, message: "Transfer processed" };
});

registerWebhookHandler("payout.paid", async (event) => {
  const payout = event?.data.object as Stripe.Payout;
  logger.info(
    `[Stripe Connect] Payout completed: ${payout?.id} - Amount: $${(payout?.amount / 100).toFixed(2)}`,
  );
  try {
    await instantPayoutService.handlePayoutWebhook(event);
  } catch (err) {
    logger.warn({ err }, "[Stripe Connect] Failed to process payout.paid:");
    return {
      success: false,
      message: `Failed to process payout.paid for ${payout?.id}: ${(err as Error)?.message || err}`,
    };
  }
  return { success: true, message: "Payout completion processed" };
});

registerWebhookHandler("payout.failed", async (event) => {
  const payout = event?.data.object as Stripe.Payout;
  logger.warn(
    `[Stripe Connect] Payout failed: ${payout?.id} - Reason: ${payout?.failure_message}`,
  );
  try {
    await instantPayoutService.handlePayoutWebhook(event);
  } catch (err) {
    logger.warn({ err }, "[Stripe Connect] Failed to process payout.failed:");
    return {
      success: false,
      message: `Failed to process payout.failed for ${payout?.id}: ${(err as Error)?.message || err}`,
    };
  }
  return { success: true, message: "Payout failure processed" };
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

      if (result?.success) {
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
    webhookSecretConfigured: !!env?.STRIPE_WEBHOOK_SECRET,
    stripeKeyConfigured: !!env?.STRIPE_SECRET_KEY,
  });
});

export default router;
