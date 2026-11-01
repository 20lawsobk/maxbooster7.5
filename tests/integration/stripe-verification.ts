import { logger } from "../../server/logger.ts";
import Stripe from "stripe";

interface StripeVerificationResult {
  configured: boolean;
  mode: "test" | "live" | "invalid";
  verified: boolean;
  capabilities: {
    createCustomer: boolean;
    createPaymentIntent: boolean;
    listProducts: boolean;
    webhookEndpoint: boolean;
    createSubscription: boolean;
    createInvoice: boolean;
  };
  error?: string;
}

class StripeVerificationService {
  private stripe: Stripe | null = null;

  async verify(): Promise<StripeVerificationResult> {
    logger.info("🔍 Verifying Stripe integration...\n");

    const result: StripeVerificationResult = {
      configured: false,
      mode: "invalid",
      verified: false,
      capabilities: {
        createCustomer: false,
        createPaymentIntent: false,
        listProducts: false,
        webhookEndpoint: false,
        createSubscription: false,
        createInvoice: false,
      },
    };

    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey || !stripeKey.startsWith("sk_")) {
      result.error = "STRIPE_SECRET_KEY not configured or invalid format";
      this.printReport(result);
      return result;
    }

    result.configured = true;
    result.mode = stripeKey.startsWith("sk_live_") ? "live" : "test";

    this.stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    await this.testCapabilities(result);

    this.printReport(result);

    return result;
  }

  private async testCapabilities(
    result: StripeVerificationResult,
  ): Promise<void> {
    if (!this.stripe) return;

    try {
      logger.info("Testing: Create customer capability...");
      const customer = await this.stripe.customers.create({
        email: `test-${Date.now()}@maxbooster-verification.com`,
        metadata: { test: "verification" },
      });

      if (customer.id) {
        result.capabilities.createCustomer = true;
        logger.info("   ✅ PASS - Customer created:", customer.id);

        await this.stripe.customers.del(customer.id);
        logger.info("   🧹 Cleanup - Test customer deleted\n");
      }
    } catch (error) {
      logger.error(
        "   ❌ FAIL:",
        error instanceof Error ? error.message : "Unknown error",
      );
      result.error = `Customer creation failed: ${error instanceof Error ? error.message : "Unknown"}`;
    }

    try {
      logger.info("Testing: Payment Intent capability...");
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: 100,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
      });

      if (paymentIntent.id) {
        result.capabilities.createPaymentIntent = true;
        logger.info("   ✅ PASS - Payment Intent created:", paymentIntent.id);

        await this.stripe.paymentIntents.cancel(paymentIntent.id);
        logger.info("   🧹 Cleanup - Test payment intent cancelled\n");
      }
    } catch (error) {
      logger.error(
        "   ❌ FAIL:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    try {
      logger.info("Testing: List products capability...");
      const products = await this.stripe.products.list({ limit: 1 });

      result.capabilities.listProducts = true;
      logger.info(
        `   ✅ PASS - Retrieved ${products.data.length} product(s)\n`,
      );
    } catch (error) {
      logger.error(
        "   ❌ FAIL:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    try {
      logger.info("Testing: Subscription capability (revenue-critical)...");

      const testCustomer = await this.stripe.customers.create({
        email: `subscription-test-${Date.now()}@maxbooster-verification.com`,
        metadata: { test: "subscription-verification" },
      });

      const recurringPrices = await this.stripe.prices.list({
        type: "recurring",
        limit: 1,
      });

      let testPriceId: string | undefined = recurringPrices.data[0]?.id;

      if (!testPriceId) {
        const testProduct = await this.stripe.products.create({
          name: "Verification Test Product",
          metadata: { test: "verification" },
        });

        const testPrice = await this.stripe.prices.create({
          product: testProduct.id,
          unit_amount: 999,
          currency: "usd",
          recurring: { interval: "month" },
          metadata: { test: "verification" },
        });

        testPriceId = testPrice.id;
      }

      const subscription = await this.stripe.subscriptions.create({
        customer: testCustomer.id,
        items: [{ price: testPriceId }],
        payment_behavior: "default_incomplete",
        metadata: { test: "verification" },
      });

      if (subscription.id) {
        result.capabilities.createSubscription = true;
        logger.info("   ✅ PASS - Subscription created:", subscription.id);

        await this.stripe.subscriptions.cancel(subscription.id);
        logger.info("   🧹 Cleanup - Test subscription cancelled");
      }

      await this.stripe.customers.del(testCustomer.id);
      logger.info("   🧹 Cleanup - Test customer deleted\n");
    } catch (error) {
      logger.error(
        "   ❌ FAIL:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    try {
      logger.info("Testing: Invoice capability (revenue-critical)...");

      const testCustomer = await this.stripe.customers.create({
        email: `invoice-test-${Date.now()}@maxbooster-verification.com`,
        metadata: { test: "invoice-verification" },
      });

      const invoiceItem = await this.stripe.invoiceItems.create({
        customer: testCustomer.id,
        amount: 1500,
        currency: "usd",
        description: "Verification test invoice item",
      });

      const invoice = await this.stripe.invoices.create({
        customer: testCustomer.id,
        auto_advance: false,
        metadata: { test: "verification" },
      });

      if (invoice.id) {
        result.capabilities.createInvoice = true;
        logger.info("   ✅ PASS - Invoice created:", invoice.id);

        try {
          const finalizedInvoice = await this.stripe.invoices.finalizeInvoice(
            invoice.id,
          );
          if (finalizedInvoice.status === "open") {
            await this.stripe.invoices.voidInvoice(finalizedInvoice.id);
            logger.info("   🧹 Cleanup - Test invoice finalized and voided");
          }
        } catch (cleanupError) {
          logger.info(
            "   🧹 Cleanup - Invoice created successfully (finalization skipped)",
          );
        }
      }

      await this.stripe.customers.del(testCustomer.id);
      logger.info("   🧹 Cleanup - Test customer deleted\n");
    } catch (error) {
      logger.error(
        "   ❌ FAIL:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret && webhookSecret.startsWith("whsec_")) {
      result.capabilities.webhookEndpoint = true;
      logger.info("Testing: Webhook configuration...");
      logger.info("   ✅ PASS - STRIPE_WEBHOOK_SECRET configured\n");
    } else {
      logger.warn("   ⚠️  WARNING - STRIPE_WEBHOOK_SECRET not configured\n");
    }

    result.verified =
      result.capabilities.createCustomer &&
      result.capabilities.createPaymentIntent &&
      result.capabilities.listProducts &&
      result.capabilities.createSubscription &&
      result.capabilities.createInvoice;
  }

  private printReport(result: StripeVerificationResult): void {
    console.log("\n" + "═".repeat(70));
    console.log("             STRIPE INTEGRATION VERIFICATION");
    console.log("═".repeat(70) + "\n");

    console.log(
      `Configuration:     ${result.configured ? "✅ Configured" : "❌ Not Configured"}`,
    );
    console.log(`Mode:              ${result.mode.toUpperCase()}`);
    console.log(`Verified:          ${result.verified ? "✅ Yes" : "❌ No"}\n`);

    console.log("Capabilities:");
    console.log(
      `  Create Customer:       ${result.capabilities.createCustomer ? "✅" : "❌"}`,
    );
    console.log(
      `  Create Payment:        ${result.capabilities.createPaymentIntent ? "✅" : "❌"}`,
    );
    console.log(
      `  List Products:         ${result.capabilities.listProducts ? "✅" : "❌"}`,
    );
    console.log(
      `  Create Subscription:   ${result.capabilities.createSubscription ? "✅" : "❌"} (revenue-critical)`,
    );
    console.log(
      `  Create Invoice:        ${result.capabilities.createInvoice ? "✅" : "❌"} (revenue-critical)`,
    );
    console.log(
      `  Webhook Endpoint:      ${result.capabilities.webhookEndpoint ? "✅" : "⚠️  (Optional)"}\n`,
    );

    if (result.error) {
      console.log("Error:", result.error, "\n");
    }

    console.log("═".repeat(70));

    if (result.verified) {
      console.log("                ✅ STRIPE: VERIFIED");
      console.log("");
      console.log("  Stripe payment processing is operational.");
      if (result.mode === "test") {
        console.log(
          "  ⚠️  Note: Running in TEST mode. Use live keys for production.",
        );
      } else {
        console.log("  ✅ Running in LIVE mode - production ready.");
      }
    } else {
      console.log("                ❌ STRIPE: VERIFICATION FAILED");
      console.log("");
      console.log("  Payment processing will not work.");
      console.log("  Fix configuration before deploying.");
    }

    console.log("═".repeat(70) + "\n");
  }
}

const verifier = new StripeVerificationService();
verifier
  .verify()
  .then((result) => {
    process.exit(result.verified ? 0 : 1);
  })
  .catch((error) => {
    logger.error("Stripe verification failed:", error);
    process.exit(1);
  });
