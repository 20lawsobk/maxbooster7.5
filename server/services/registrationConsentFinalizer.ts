import { createStripeClient } from "../lib/stripeClient";
import { env } from "../config/env.js";
import { consentService } from "./consentService.js";
import { logger } from "../logger.js";

export interface PaidRegistrationConsentInput {
  sessionId: string;
  userId: string;
  marketingConsent: boolean;
  ipAddress?: string;
  userAgent?: string;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export async function finalizePaidRegistrationConsent(
  input: PaidRegistrationConsentInput,
): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-02-25.clover",
  });
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);

  if (session.payment_status !== "paid") {
    throw new Error("Registration checkout is not paid");
  }

  const birthdateValue = session.metadata?.birthdate?.trim() ?? "";
  const birthdate = parseDateOnly(birthdateValue);
  if (!birthdate) {
    throw new Error("Paid registration is missing a valid birthdate");
  }

  await consentService.recordRegistrationConsents(
    input.userId,
    {
      birthdate,
      tosAccepted: true,
      privacyAccepted: true,
      marketingConsent: input.marketingConsent,
    },
    input.ipAddress,
    input.userAgent,
  );

  logger.info(
    {
      userId: input.userId,
      checkoutSessionId: input.sessionId,
      marketingConsent: input.marketingConsent,
    },
    "Paid registration consent evidence finalized",
  );
}
