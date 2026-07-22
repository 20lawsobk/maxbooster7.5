/**
 * DUNNING SERVICE
 *
 * Multi-step email sequence for failed subscription payments.
 * Industry best practice: 4-step sequence over 14 days recovers ~40% of
 * involuntary churn (payment failures account for ~0.8% monthly churn on average).
 *
 * Steps:
 *   Step 0 (Day 0):  Immediate — "Payment failed, please update your card"
 *   Step 1 (Day 3):  Reminder — "Still failing, here's a direct link"
 *   Step 2 (Day 7):  Urgent — "Access pauses in 7 days without action"
 *   Step 3 (Day 14): Win-back — "Account paused — come back with 20% off"
 */

import { db } from "../db.js";
import { dunningState, users } from "@shared/schema";
import { eq, and, isNull, lte } from "drizzle-orm";
import { logger } from "../logger.js";
import { emailService } from "./emailService.js";

const DUNNING_STEPS: Array<{
  delayDays: number;
  subject: string;
  urgency: "low" | "medium" | "high" | "winback";
}> = [
  {
    delayDays: 0,
    subject: "Your payment failed — please update your card",
    urgency: "low",
  },
  {
    delayDays: 3,
    subject: "Reminder: Payment still failing on your Max Booster account",
    urgency: "medium",
  },
  {
    delayDays: 7,
    subject: "Action required: Your access pauses in 7 days",
    urgency: "high",
  },
  {
    delayDays: 14,
    subject: "Your account is paused — come back with 20% off",
    urgency: "winback",
  },
];

function buildDunningEmailHtml(
  firstName: string,
  step: number,
  updateCardUrl: string,
): string {
  const urgency = DUNNING_STEPS[step].urgency ?? "low";

  const bannerColor: Record<string, string> = {
    low: "#f59e0b",
    medium: "#ef4444",
    high: "#dc2626",
    winback: "#7c3aed",
  };

  const messages: Record<
    string,
    { heading: string; body: string; cta: string }
  > = {
    low: {
      heading: `Hi ${firstName}, there was a problem with your payment`,
      body: `We were unable to process your subscription payment for Max Booster. This is often caused by an expired card or insufficient funds. Please update your payment details to keep your access uninterrupted.`,
      cta: "Update Payment Details",
    },
    medium: {
      heading: `${firstName}, your payment is still failing`,
      body: `We've tried to collect your subscription payment again but couldn't complete it. Your account is still active right now — but we need you to update your card to avoid any disruption to your music career tools.`,
      cta: "Update My Card Now",
    },
    high: {
      heading: `${firstName}, your access pauses in 7 days`,
      body: `This is an important notice. Your subscription payment has now failed multiple times. If we cannot collect payment in the next 7 days, your account will be paused and you'll lose access to your releases, analytics, and autopilot campaigns. Please act now.`,
      cta: "Keep My Access — Update Card",
    },
    winback: {
      heading: `${firstName}, your account is paused`,
      body: `Your Max Booster account has been paused due to unpaid subscription fees. We'd love to have you back. Reactivate today and get <strong>20% off your first month back</strong> — no code needed, discount applied automatically.`,
      cta: "Reactivate My Account",
    },
  };

  const msg = messages[urgency];

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="background:${bannerColor[urgency]};padding:20px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Max Booster</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#111;margin-top:0;font-size:22px;">${msg.heading}</h2>
          <p style="color:#374151;line-height:1.6;">${msg.body}</p>
          <a href="${updateCardUrl}" style="display:inline-block;margin-top:16px;background:${bannerColor[urgency]};color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${msg.cta}</a>
          <p style="color:#9ca3af;font-size:13px;margin-top:32px;">If you believe this is a mistake or need help, reply to this email and we'll sort it out.</p>
        </div>
      </div>
    </body>
    </html>
  `.trim();
}

class DunningService {
  async startSequence(userId: string, invoiceId: string): Promise<void> {
    try {
      const existing = await db
        .select()
        .from(dunningState)
        .where(eq(dunningState?.stripeInvoiceId, invoiceId))
        .limit(1);

      if (existing?.length > 0) {
        logger.info(
          `[Dunning] Sequence already started for invoice ${invoiceId}`,
        );
        return;
      }

      const nextEmailAt = new Date();

      await db?.insert(dunningState).values({
        userId,
        stripeInvoiceId: invoiceId,
        currentStep: 0,
        nextEmailAt,
      });

      await this.sendStep(userId, invoiceId, 0);
    } catch (err) {
      logger.warn({ err: err }, "[Dunning] Failed to start sequence:");
    }
  }

  async resolveSequence(
    invoiceId: string,
    reason: "paid" | "cancelled",
  ): Promise<void> {
    try {
      await db
        .update(dunningState)
        .set({ resolvedAt: new Date(), resolvedReason: reason })
        .where(eq(dunningState?.stripeInvoiceId, invoiceId));

      logger.info(
        `[Dunning] Resolved sequence for invoice ${invoiceId} (${reason})`,
      );
    } catch (err) {
      logger.warn({ err: err }, "[Dunning] Failed to resolve sequence:");
    }
  }

  async processPendingSteps(): Promise<void> {
    try {
      // Keep existing entry point, call paged version
      await this.processPendingStepsPaged(50);
    } catch (err) {
      logger.warn({ err: err }, "[Dunning] Failed to process pending steps:");
    }
  }

  async processPendingStepsPaged(limit: number): Promise<number> {
    try {
      const now = new Date();

      const pending = await db
        .select()
        .from(dunningState)
        .where(
          and(
            isNull(dunningState?.resolvedAt),
            lte(dunningState?.nextEmailAt, now),
          ),
        )
        .limit(limit);

      let processed = 0;
      for (const record of pending) {
        const nextStep = record?.currentStep + 1;
        if (nextStep >= DUNNING_STEPS?.length) {
          await db
            .update(dunningState)
            .set({
              resolvedAt: new Date(),
              resolvedReason: "sequence_complete",
            })
            .where(eq(dunningState?.id, record?.id));
          processed++;
          continue;
        }

        await this.sendStep(
          record?.userId,
          record?.stripeInvoiceId,
          record?.currentStep,
        );

        const nextStepConfig = DUNNING_STEPS[nextStep];
        const nextEmailAt = new Date();
        nextEmailAt?.setDate(
          nextEmailAt?.getDate() + (nextStepConfig?.delayDays ?? 0),
        );

        await db
          .update(dunningState)
          .set({ currentStep: nextStep, nextEmailAt, updatedAt: new Date() })
          .where(eq(dunningState?.id, record?.id));
        processed++;
      }
      return processed;
    } catch (err) {
      logger.warn(
        { err: err },
        "[Dunning] Failed to process pending steps paged:",
      );
      return 0;
    }
  }

  private async sendStep(
    userId: string,
    invoiceId: string,
    step: number,
  ): Promise<void> {
    const stepConfig = DUNNING_STEPS[step];
    if (!stepConfig) return;

    const userRows = await db
      .select({
        email: users.email,
        firstName: users.firstName,
        subscriptionTier: users.subscriptionTier,
      })
      .from(users)
      .where(eq(users?.id, userId))
      .limit(1);

    if (!userRows?.length || !userRows[0].email) return;

    const { email, firstName } = userRows[0];
    const displayName = firstName ?? email?.split("@")[0];
    const updateCardUrl = `${process.env.APP_URL ?? "https://maxbooster.app"}/settings/billing?utm_source=dunning&utm_step=${step}`;

    const html = buildDunningEmailHtml(displayName, step, updateCardUrl);

    await emailService?.sendTransactional(email, stepConfig?.subject, html);

    logger.info(
      `[Dunning] Step ${step} email sent to ${email} for invoice ${invoiceId}`,
    );
  }
}

export const dunningService = new DunningService();
