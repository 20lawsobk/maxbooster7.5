import { createHash } from "node:crypto";
import type Stripe from "stripe";

export type SubscriptionPlan = "monthly" | "yearly" | "lifetime";
export type SubscriptionCheckoutResult = {
  clientSecret: string;
  type: "payment_intent" | "subscription";
  subscriptionId?: string;
};

type CheckoutStore = {
  replay(input: {
    id: string;
    userId: string;
    plan: SubscriptionPlan;
    priceId: string;
  }): Promise<SubscriptionCheckoutResult | null>;
  begin(input: {
    id: string;
    userId: string;
    plan: SubscriptionPlan;
    priceId: string;
    amountCents: number;
    currency: string;
  }): Promise<SubscriptionCheckoutResult | null>;
  recordProviderIds(id: string, ids: {
    customerId?: string;
    paymentIntentId?: string;
    subscriptionId?: string;
    invoiceId?: string;
  }): Promise<void>;
  complete(id: string, result: SubscriptionCheckoutResult): Promise<void>;
};

export class SubscriptionCheckoutConflictError extends Error {}
export class SubscriptionCheckoutReconciliationError extends Error {
  statusCode = 409;
  code = "CHECKOUT_RECONCILIATION_REQUIRED";
}
export class SubscriptionCheckoutInfrastructureError extends Error {
  statusCode = 503;
  code = "CHECKOUT_SCHEMA_UNAVAILABLE";
  retryable = false;
}

const PROVIDER_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;
const PLAN_CONTRACT = {
  monthly: { amountCents: 4900, type: "recurring", interval: "month" },
  yearly: { amountCents: 46800, type: "recurring", interval: "year" },
  lifetime: { amountCents: 69900, type: "one_time", interval: null },
} as const;

function translateStoreError(error: unknown): never {
  if ((error as { code?: string })?.code === "42P01") {
    throw new SubscriptionCheckoutInfrastructureError(
      "Subscription checkout is unavailable until the commerce schema is deployed",
    );
  }
  throw error;
}

type CheckoutPool = {
  connect(): Promise<{
    query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
    release(): void;
  }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

export function createSubscriptionCheckoutStore(database: CheckoutPool): CheckoutStore {
  return {
    async replay(input) {
      try {
        const prior = (
          await database.query(
            "SELECT user_id,state,payload FROM commerce_operations WHERE id=$1",
            [input.id],
          )
        ).rows[0];
        if (!prior) return null;
        if (
          prior.user_id !== input.userId ||
          prior.payload?.plan !== input.plan ||
          prior.payload?.priceId !== input.priceId
        ) {
          throw new SubscriptionCheckoutConflictError(
            "Idempotency-Key was already used for a different checkout",
          );
        }
        return prior.state === "checkout_ready"
          ? (prior.payload.result as SubscriptionCheckoutResult)
          : null;
      } catch (error) {
        translateStoreError(error);
      }
    },
    async begin(input) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`subscription-checkout:${input.id}`],
        );
        const prior = (
          await client.query(
            "SELECT user_id,currency,amount_cents,state,payload,created_at FROM commerce_operations WHERE id=$1",
            [input.id],
          )
        ).rows[0];
        if (prior) {
          const matches =
            prior.user_id === input.userId &&
            prior.currency === input.currency &&
            Number(prior.amount_cents) === input.amountCents &&
            prior.payload?.plan === input.plan &&
            prior.payload?.priceId === input.priceId;
          if (!matches) {
            throw new SubscriptionCheckoutConflictError(
              "Idempotency-Key was already used for a different checkout",
            );
          }
          if (prior.state === "checkout_ready") {
            await client.query("COMMIT");
            return prior.payload.result as SubscriptionCheckoutResult;
          }
          const createdAt = new Date(prior.created_at).getTime();
          if (!Number.isFinite(createdAt) || Date.now() - createdAt >= PROVIDER_REPLAY_WINDOW_MS) {
            throw new SubscriptionCheckoutReconciliationError(
              "Checkout provider response is unknown and the safe replay window has expired",
            );
          }
          await client.query("COMMIT");
          return null;
        }
        // A checkout-specific state prevents the generic commerce worker from
        // claiming this synchronous provider operation.
        await client.query(
          `INSERT INTO commerce_operations
            (id,kind,user_id,currency,amount_cents,state,payload)
           VALUES($1,'subscription_checkout',$2,$3,$4,'checkout_creating',$5)`,
          [
            input.id,
            input.userId,
            input.currency,
            input.amountCents,
            JSON.stringify({ plan: input.plan, priceId: input.priceId }),
          ],
        );
        await client.query("COMMIT");
        return null;
      } catch (error) {
        await client.query("ROLLBACK");
        translateStoreError(error);
      } finally {
        client.release();
      }
    },
    async recordProviderIds(id, ids) {
      try {
        const updated = await database.query(
          `UPDATE commerce_operations
           SET provider_id=COALESCE($2,provider_id),
               payload=payload || $3::jsonb,
               updated_at=now()
           WHERE id=$1 AND kind='subscription_checkout'
           RETURNING id`,
          [
            id,
            ids.subscriptionId ?? ids.paymentIntentId ?? null,
            JSON.stringify({ providerRefs: ids }),
          ],
        );
        if (!updated.rows.length) throw new Error("Checkout operation disappeared while saving provider references");
      } catch (error) {
        translateStoreError(error);
      }
    },
    async complete(id, result) {
      let updated;
      try {
        updated = await database.query(
        `UPDATE commerce_operations
         SET state='checkout_ready',
             provider_id=$2,
             payload=payload || $3::jsonb,
             updated_at=now()
         WHERE id=$1 AND kind='subscription_checkout'
         RETURNING id`,
        [
          id,
          result.subscriptionId ?? null,
          JSON.stringify({ result }),
        ],
        );
      } catch (error) {
        translateStoreError(error);
      }
      if (!updated.rows.length) {
        throw new Error("Checkout operation disappeared before its receipt was saved");
      }
    },
  };
}

function checkoutOperationId(userId: string, requestKey: string): string {
  return `subco_${createHash("sha256")
    .update(`${userId}:${requestKey}`)
    .digest("hex")}`;
}

export async function createSubscriptionCheckout(input: {
  stripe: Stripe;
  store: CheckoutStore;
  user: { id: string; email: string; username?: string | null; firstName?: string | null; stripeCustomerId?: string | null };
  plan: SubscriptionPlan;
  priceId: string;
  requestKey: string;
  saveCustomerId(userId: string, customerId: string): Promise<unknown>;
}): Promise<SubscriptionCheckoutResult> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.requestKey)) {
    throw Object.assign(
      new Error("A valid Idempotency-Key header is required"),
      { statusCode: 400, code: "IDEMPOTENCY_KEY_REQUIRED" },
    );
  }

  const operationId = checkoutOperationId(input.user.id, input.requestKey);
  const completed = await input.store.replay({
    id: operationId,
    userId: input.user.id,
    plan: input.plan,
    priceId: input.priceId,
  });
  if (completed) return completed;

  const price = await input.stripe.prices.retrieve(input.priceId);
  const amountCents = price.unit_amount;
  if (!price.active || price.currency !== "usd" || typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error("Selected billing price is not active or has an invalid USD amount"), {
      statusCode: 503,
      code: "INVALID_STRIPE_PRICE",
      retryable: false,
    });
  }
  if (input.plan === "lifetime" ? price.type !== "one_time" : price.type !== "recurring") {
    throw Object.assign(new Error("Selected billing price has the wrong payment type"), {
      statusCode: 503,
      code: "INVALID_STRIPE_PRICE",
      retryable: false,
    });
  }
  const contract = PLAN_CONTRACT[input.plan];
  if (
    amountCents !== contract.amountCents ||
    (contract.interval
      ? price.recurring?.interval !== contract.interval
      : price.recurring != null)
  ) {
    throw Object.assign(new Error("Selected billing price does not match the advertised plan amount or cadence"), {
      statusCode: 503,
      code: "INVALID_STRIPE_PRICE",
      retryable: false,
    });
  }

  const cached = await input.store.begin({
    id: operationId,
    userId: input.user.id,
    plan: input.plan,
    priceId: input.priceId,
    amountCents,
    currency: price.currency,
  });
  if (cached) return cached;

  let customerId = input.user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await input.stripe.customers.create(
      {
        email: input.user.email,
        name: input.user.username || input.user.firstName || input.user.email,
        metadata: { userId: input.user.id },
      },
      { idempotencyKey: `subscription-customer:${input.user.id}` },
    );
    customerId = customer.id;
    await input.store.recordProviderIds(operationId, { customerId });
    await input.saveCustomerId(input.user.id, customerId);
  }

  let result: SubscriptionCheckoutResult;
  if (input.plan === "lifetime") {
    const paymentIntent = await input.stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: price.currency,
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: { userId: input.user.id, planId: input.plan, planName: input.plan, checkoutOperationId: operationId },
      },
      { idempotencyKey: `${operationId}:payment-intent:v1` },
    );
    await input.store.recordProviderIds(operationId, {
      customerId,
      paymentIntentId: paymentIntent.id,
    });
    if (!paymentIntent.client_secret) throw new Error("Payment intent has no client secret");
    result = { clientSecret: paymentIntent.client_secret, type: "payment_intent" };
  } else {
    const subscription = await input.stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: input.priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.confirmation_secret"],
        metadata: { userId: input.user.id, planId: input.plan, planName: input.plan, checkoutOperationId: operationId },
      },
      { idempotencyKey: `${operationId}:subscription:v1` },
    );
    await input.store.recordProviderIds(operationId, {
      customerId,
      subscriptionId: subscription.id,
    });
    if (subscription.latest_invoice === null) {
      throw new Error("Subscription has no latest invoice");
    }
    if (typeof subscription.latest_invoice === "string") {
      throw new Error("Subscription latest invoice was not expanded");
    }
    await input.store.recordProviderIds(operationId, {
      customerId,
      subscriptionId: subscription.id,
      invoiceId: subscription.latest_invoice.id,
    });
    const confirmationSecret = subscription.latest_invoice.confirmation_secret;
    if (!confirmationSecret?.client_secret) {
      throw new Error("Subscription invoice has no confirmation client secret");
    }
    result = { clientSecret: confirmationSecret.client_secret, subscriptionId: subscription.id, type: "subscription" };
  }
  await input.store.complete(operationId, result);
  return result;
}