export const CHECKOUT_CURRENCY = "usd" as const;

/**
 * The amounts used to create real checkout sessions. First-party content
 * generation reads from this catalog rather than copying presentation text.
 */
export const CHECKOUT_PRICING = {
  monthly: {
    amountCents: 4900,
    mode: "subscription",
    interval: "month",
  },
  yearly: {
    amountCents: 46800,
    mode: "subscription",
    interval: "year",
  },
  lifetime: {
    amountCents: 69900,
    mode: "payment",
  },
} as const;

export type CheckoutPlanId = keyof typeof CHECKOUT_PRICING;