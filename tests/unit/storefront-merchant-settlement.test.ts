import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  settleMerchantCheckout,
  type MerchantCheckoutSession,
  type MerchantSettlementDependencies,
} from "../../server/services/commerce/merchant";

function makeDependencies(rows: unknown[]) {
  const booked: Array<Record<string, unknown>> = [];
  let compensationCalls = 0;
  const dependencies: MerchantSettlementDependencies = {
    pool: {
      query: async () => ({ rows }),
    } as unknown as MerchantSettlementDependencies["pool"],
    repository: {
      book: async (sale) => {
        booked.push(sale as unknown as Record<string, unknown>);
      },
      compensate: async () => {
        compensationCalls += 1;
      },
    },
    verifyPayment: async () => ({
      processingFeeCents: 48,
      refundedCents: 0,
      pendingCents: 0,
      chargeId: "ch_test",
      disputed: false,
    }),
  };
  return { dependencies, booked, get compensationCalls() { return compensationCalls; } };
}

function makeSession(
  overrides: Partial<MerchantCheckoutSession> = {},
): MerchantCheckoutSession {
  return {
    id: "cs_storefront_test",
    metadata: {
      type: "storefront_purchase",
      commerceVersion: "2",
      commerceKind: "merchant",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      storefrontId: "store_1",
      platformFeeCents: "120",
      promotionId: "promo_1",
    },
    payment_status: "paid",
    amount_total: 1200,
    currency: "usd",
    payment_intent: "pi_storefront_test",
    ...overrides,
  };
}

function makeOrders() {
  return [
    {
      id: "order_1",
      buyer_id: "buyer_1",
      seller_id: "seller_1",
      storefront_id: "store_1",
      amount_cents: "500",
      currency: "usd",
      status: "pending",
      stripe_session_id: "cs_storefront_test",
      stripe_payment_intent_id: null,
      applied_promotion_id: "promo_1",
    },
    {
      id: "order_2",
      buyer_id: "buyer_1",
      seller_id: "seller_1",
      storefront_id: "store_1",
      amount_cents: "700",
      currency: "usd",
      status: "pending",
      stripe_session_id: "cs_storefront_test",
      stripe_payment_intent_id: null,
      applied_promotion_id: "promo_1",
    },
  ];
}

describe("storefront merchant settlement", () => {
  it("books every cart order under one PaymentIntent and one seller allocation", async () => {
    const context = makeDependencies(makeOrders());

    await settleMerchantCheckout(makeSession(), context.dependencies);

    assert.equal(context.booked.length, 1);
    assert.equal(context.booked[0].id, "merchant:checkout:cs_storefront_test");
    assert.equal(context.booked[0].paymentIntent, "pi_storefront_test");
    assert.equal(context.booked[0].grossCents, 1200);
    assert.equal(context.booked[0].feeCents, 120);
    assert.deepEqual(context.booked[0].allocations, [
      { userId: "seller_1", cents: 1080 },
    ]);
    assert.equal(context.compensationCalls, 0);
  });

  it("refuses checkout totals that do not match all persisted order rows", async () => {
    const context = makeDependencies(makeOrders());

    await assert.rejects(
      settleMerchantCheckout(makeSession({ amount_total: 1199 }), context.dependencies),
      /stored order total/,
    );
    assert.equal(context.booked.length, 0);
  });

  it("refuses cart rows that resolve to more than one seller", async () => {
    const orders = makeOrders();
    orders[1].seller_id = "seller_2";
    const context = makeDependencies(orders);

    await assert.rejects(
      settleMerchantCheckout(makeSession(), context.dependencies),
      /payment does not match stored order/,
    );
    assert.equal(context.booked.length, 0);
  });

  it("does not book checkout sessions that Stripe has not marked paid", async () => {
    const context = makeDependencies(makeOrders());

    await assert.rejects(
      settleMerchantCheckout(
        makeSession({ payment_status: "unpaid" }),
        context.dependencies,
      ),
      /not paid/,
    );
    assert.equal(context.booked.length, 0);
  });
});