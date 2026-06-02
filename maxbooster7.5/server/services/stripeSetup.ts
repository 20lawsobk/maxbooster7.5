import Stripe from "stripe";
import { logger } from "../logger.js";

const stripeKey =
  process.env.STRIPE_SECRET_KEY || process.env.TESTING_STRIPE_SECRET_KEY;

if (!stripeKey || !stripeKey.startsWith("sk_")) {
  logger.warn("⚠️  Stripe setup skipped - invalid API key");
} else {
  logger.info("✅ Initializing Stripe product and price setup...");
}

const stripe =
  stripeKey && stripeKey.startsWith("sk_")
    ? new Stripe(stripeKey, { apiVersion: "2026-01-28.clover" })
    : null;

export interface StripePriceIds {
  monthly: string;
  yearly: string;
  lifetime: string;
}

let cachedPriceIds: StripePriceIds | null = null;

export async function ensureStripeProductsAndPrices(): Promise<StripePriceIds> {
  // Return cached IDs if already set up
  if (cachedPriceIds) {
    return cachedPriceIds;
  }

  if (!stripe) {
    logger.warn("⚠️  Stripe not configured - using fallback price IDs");
    // Return fallback IDs that will fail at payment time (graceful degradation)
    cachedPriceIds = {
      monthly: "price_monthly_placeholder",
      yearly: "price_yearly_placeholder",
      lifetime: "price_lifetime_placeholder",
    };
    return cachedPriceIds;
  }

  try {
    logger.info("🔧 Setting up Stripe products and prices...");

    // Check if products already exist
    const existingProducts = await stripe.products.list({ limit: 100 });
    let product = existingProducts.data.find(
      (p) => p.metadata?.app === "max-booster",
    );

    // Create product if it doesn't exist
    if (!product) {
      product = await stripe.products.create({
        name: "Max Booster Subscription",
        description: "AI-Powered Music Distribution & Marketing Platform",
        metadata: {
          app: "max-booster",
        },
      });
      logger.info("✅ Created Stripe product:", product.id);
    } else {
      logger.info("✅ Found existing Stripe product:", product.id);
    }

    // Check existing prices for this product
    const existingPrices = await stripe.prices.list({
      product: product.id,
      limit: 100,
    });

    // Helper to find or create price
    const findOrCreatePrice = async (
      type: "monthly" | "yearly" | "lifetime",
      amount: number,
      recurring?: { interval: "month" | "year" },
    ): Promise<string> => {
      // Look for existing price with matching metadata
      const existing = existingPrices.data.find(
        (p) => p.metadata?.type === type,
      );

      if (existing) {
        logger.info(`✅ Found existing ${type} price:`, existing.id);
        return existing.id;
      }

      // Create new price
      const priceParams: Stripe.PriceCreateParams = {
        product: product!.id,
        unit_amount: amount * 100, // Convert to cents
        currency: "usd",
        metadata: {
          type,
          app: "max-booster",
        },
      };

      if (recurring) {
        priceParams.recurring = recurring;
      }

      const price = await stripe!.prices.create(priceParams);
      logger.info(`✅ Created ${type} price:`, price.id, `($${amount})`);
      return price.id;
    };

    // Create or find all price tiers
    const monthlyPriceId = await findOrCreatePrice("monthly", 49, {
      interval: "month",
    });
    const yearlyPriceId = await findOrCreatePrice("yearly", 468, {
      interval: "year",
    });
    const lifetimePriceId = await findOrCreatePrice("lifetime", 699); // One-time payment

    cachedPriceIds = {
      monthly: monthlyPriceId,
      yearly: yearlyPriceId,
      lifetime: lifetimePriceId,
    };

    logger.info("✅ Stripe setup complete:");
    logger.info("   Monthly ($49):", monthlyPriceId);
    logger.info("   Yearly ($468):", yearlyPriceId);
    logger.info("   Lifetime ($699):", lifetimePriceId);

    return cachedPriceIds;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("❌ Error setting up Stripe products/prices:", message);
    // Do NOT cache placeholder IDs here — Stripe is configured but had a transient
    // error. Leaving cachedPriceIds as null forces a retry on the next call and
    // ensures billing routes surface a clear 500 rather than silently using stale IDs.
    throw error;
  }
}

export function getStripePriceIds(): StripePriceIds {
  if (!cachedPriceIds) {
    throw new Error(
      "Stripe price IDs not initialized - call ensureStripeProductsAndPrices() first",
    );
  }
  return cachedPriceIds;
}
