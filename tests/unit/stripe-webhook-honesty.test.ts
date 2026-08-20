/**
 * Regression tests for Task #109: Stripe webhook handlers must only report
 * success once their critical DB write is confirmed (a real insert, or an
 * update that matched a row). On failure they must return a retryable
 * (success:false) result so Stripe retries the event; genuine no-ops must
 * still report success.
 *
 * These tests drive the real dispatcher (`handleWebhookEvent`) and the real
 * handler bodies registered by `server/routes/webhooks/stripe.ts`, with the
 * database, notification service, dunning service, and audit logger mocked
 * so each scenario (row matched / 0 rows matched / thrown error) can be
 * simulated deterministically.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// db mock: a single shared chainable query-builder stand-in. `.from/.where/
// .set` keep the chain going; `.limit/.values/.returning` are the terminal
// calls every handler in stripe.ts actually awaits, so each gets its own
// controllable mock.
// ---------------------------------------------------------------------------
const limitMock = vi.fn();
const valuesMock = vi.fn();
const returningMock = vi.fn();

const chain: any = {
  from: vi.fn(() => chain),
  where: vi.fn(() => chain),
  set: vi.fn(() => chain),
  limit: limitMock,
  values: valuesMock,
  returning: returningMock,
};

vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
  },
}));

vi.mock("../../server/services/notificationService.js", () => ({
  notificationService: {
    sendPaymentFailedNotification: vi.fn().mockResolvedValue(undefined),
    sendAdminPaymentIssueNotification: vi.fn().mockResolvedValue(undefined),
    sendSubscriptionChangedNotification: vi.fn().mockResolvedValue(undefined),
    sendSubscriptionRenewedNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../server/services/dunningService.js", () => ({
  dunningService: {
    startSequence: vi.fn(),
    resolveSequence: vi.fn(),
  },
}));

vi.mock("../../server/services/instantPayoutService.js", () => ({
  instantPayoutService: {
    handleAccountWebhook: vi.fn(),
    handleTransferWebhook: vi.fn(),
    handlePayoutWebhook: vi.fn(),
  },
}));

vi.mock("../../server/safety/auditLogger", () => ({
  audit: vi.fn().mockResolvedValue("audit-id"),
  auditPayment: {
    charge: vi.fn().mockResolvedValue(undefined),
    refund: vi.fn().mockResolvedValue(undefined),
    chargeback: vi.fn().mockResolvedValue(undefined),
    payout: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../server/lib/redisConnectionFactory.js", () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Side-effect import: registers all 12 handlers into stripeWebhookSecurity's
// shared map. Must be imported so `handleWebhookEvent` has something to call.
import "../../server/routes/webhooks/stripe";
import { handleWebhookEvent } from "../../server/safety/stripeWebhookSecurity";
import { dunningService } from "../../server/services/dunningService.js";
import { instantPayoutService } from "../../server/services/instantPayoutService.js";
import { notificationService } from "../../server/services/notificationService.js";
import { audit, auditPayment } from "../../server/safety/auditLogger";

let eventCounter = 0;
function makeEvent(
  type: string,
  object: Record<string, unknown>,
): Stripe.Event {
  eventCounter += 1;
  return {
    id: `evt_test_${eventCounter}`,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("Stripe webhook handler honesty (Task #109)", () => {
  beforeEach(() => {
    limitMock.mockReset();
    valuesMock.mockReset();
    returningMock.mockReset();
    (dunningService.startSequence as any).mockReset();
    (dunningService.resolveSequence as any).mockReset();
    (instantPayoutService.handleAccountWebhook as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (instantPayoutService.handleTransferWebhook as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (instantPayoutService.handlePayoutWebhook as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (notificationService.sendPaymentFailedNotification as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (notificationService.sendAdminPaymentIssueNotification as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (notificationService.sendSubscriptionChangedNotification as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (notificationService.sendSubscriptionRenewedNotification as any)
      .mockReset()
      .mockResolvedValue(undefined);
    (audit as any).mockClear();
    (auditPayment.charge as any).mockReset().mockResolvedValue(undefined);
  });

  describe("checkout.session.completed", () => {
    it("reports failure when the order insert throws", async () => {
      limitMock.mockResolvedValueOnce([]); // no existing order
      valuesMock.mockRejectedValueOnce(new Error("connection terminated"));

      const result = await handleWebhookEvent(
        makeEvent("checkout.session.completed", {
          id: "cs_test_1",
          amount_total: 2500,
          currency: "usd",
          payment_intent: "pi_test_1",
          metadata: {
            beatId: "beat-1",
            buyerId: "buyer-1",
            sellerId: "seller-1",
            licenseType: "basic",
          },
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports success without re-inserting when the order already exists", async () => {
      limitMock.mockResolvedValueOnce([{ id: "order-existing" }]);

      const result = await handleWebhookEvent(
        makeEvent("checkout.session.completed", {
          id: "cs_test_2",
          amount_total: 2500,
          currency: "usd",
          payment_intent: "pi_test_2",
          metadata: {
            beatId: "beat-1",
            buyerId: "buyer-1",
            sellerId: "seller-1",
            licenseType: "basic",
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(valuesMock).not.toHaveBeenCalled();
    });

    it("reports success once the order is actually created", async () => {
      limitMock.mockResolvedValueOnce([]);
      valuesMock.mockResolvedValueOnce(undefined);

      const result = await handleWebhookEvent(
        makeEvent("checkout.session.completed", {
          id: "cs_test_3",
          amount_total: 2500,
          currency: "usd",
          payment_intent: "pi_test_3",
          metadata: {
            beatId: "beat-1",
            buyerId: "buyer-1",
            sellerId: "seller-1",
            licenseType: "basic",
          },
        }),
      );

      expect(result.success).toBe(true);
    });

    it("reports failure when the storefront order update matches no rows", async () => {
      returningMock.mockResolvedValueOnce([]); // 0 rows matched

      const result = await handleWebhookEvent(
        makeEvent("checkout.session.completed", {
          id: "cs_test_4",
          amount_total: 1000,
          currency: "usd",
          metadata: { storefrontId: "storefront-1" },
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports success when the storefront order update matches a row", async () => {
      returningMock.mockResolvedValueOnce([{ id: "storefront-order-1" }]);

      const result = await handleWebhookEvent(
        makeEvent("checkout.session.completed", {
          id: "cs_test_5",
          amount_total: 1000,
          currency: "usd",
          metadata: { storefrontId: "storefront-1" },
        }),
      );

      expect(result.success).toBe(true);
    });
  });

  describe("customer.subscription.updated", () => {
    it("reports failure when no user matches the Stripe customer (0 rows)", async () => {
      returningMock.mockResolvedValueOnce([]);

      const result = await handleWebhookEvent(
        makeEvent("customer.subscription.updated", {
          id: "sub_test_1",
          status: "active",
          customer: "cus_missing",
          metadata: {},
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports failure when the update throws", async () => {
      returningMock.mockRejectedValueOnce(new Error("db down"));

      const result = await handleWebhookEvent(
        makeEvent("customer.subscription.updated", {
          id: "sub_test_2",
          status: "active",
          customer: "cus_1",
          metadata: {},
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports success when a user row is confirmed updated", async () => {
      returningMock.mockResolvedValueOnce([{ id: "user-1" }]);

      const result = await handleWebhookEvent(
        makeEvent("customer.subscription.updated", {
          id: "sub_test_3",
          status: "active",
          customer: "cus_1",
          metadata: {},
        }),
      );

      expect(result.success).toBe(true);
    });
  });

  describe("invoice.payment_failed", () => {
    it("reports failure when the dunning sequence fails to start", async () => {
      limitMock.mockResolvedValueOnce([{ id: "user-1", email: "u@test.com" }]);
      (dunningService.startSequence as any).mockResolvedValueOnce(false);

      const result = await handleWebhookEvent(
        makeEvent("invoice.payment_failed", {
          id: "in_test_1",
          amount_due: 999,
          customer: "cus_1",
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports success even when notification delivery fails, as long as the dunning sequence starts", async () => {
      limitMock.mockResolvedValueOnce([{ id: "user-1", email: "u@test.com" }]);
      (notificationService.sendPaymentFailedNotification as any).mockRejectedValueOnce(
        new Error("email provider down"),
      );
      (dunningService.startSequence as any).mockResolvedValueOnce(true);

      const result = await handleWebhookEvent(
        makeEvent("invoice.payment_failed", {
          id: "in_test_2",
          amount_due: 999,
          customer: "cus_1",
        }),
      );

      expect(result.success).toBe(true);
    });

    it("reports failure when the invoice has no customer id", async () => {
      const result = await handleWebhookEvent(
        makeEvent("invoice.payment_failed", {
          id: "in_test_3",
          amount_due: 999,
          customer: null,
        }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("invoice.paid", () => {
    it("reports failure when the dunning sequence fails to resolve", async () => {
      (dunningService.resolveSequence as any).mockResolvedValueOnce(false);

      const result = await handleWebhookEvent(
        makeEvent("invoice.paid", {
          id: "in_test_4",
          amount_paid: 999,
          customer: "cus_1",
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports success when the dunning sequence resolves (including a legitimate no-op)", async () => {
      (dunningService.resolveSequence as any).mockResolvedValueOnce(true);

      const result = await handleWebhookEvent(
        makeEvent("invoice.paid", {
          id: "in_test_5",
          amount_paid: 999,
          customer: "cus_1",
        }),
      );

      expect(result.success).toBe(true);
    });
  });

  describe("payment_intent.succeeded", () => {
    it("reports success with no DB work when metadata has no userId (nothing to persist)", async () => {
      const result = await handleWebhookEvent(
        makeEvent("payment_intent.succeeded", {
          id: "pi_test_1",
          amount: 500,
          metadata: {},
        }),
      );

      expect(result.success).toBe(true);
      expect(limitMock).not.toHaveBeenCalled();
    });

    it("reports failure when the audit call throws", async () => {
      limitMock.mockResolvedValueOnce([]);
      (auditPayment.charge as any).mockRejectedValueOnce(
        new Error("audit db down"),
      );

      const result = await handleWebhookEvent(
        makeEvent("payment_intent.succeeded", {
          id: "pi_test_2",
          amount: 500,
          metadata: { userId: "user-1" },
        }),
      );

      expect(result.success).toBe(false);
    });

    it("reports success on the normal path", async () => {
      limitMock.mockResolvedValueOnce([{ id: "order-1" }]);

      const result = await handleWebhookEvent(
        makeEvent("payment_intent.succeeded", {
          id: "pi_test_3",
          amount: 500,
          metadata: { userId: "user-1" },
        }),
      );

      expect(result.success).toBe(true);
    });
  });

  describe("payment_intent.payment_failed", () => {
    it("reports success once the failure audit record is confirmed", async () => {
      const result = await handleWebhookEvent(
        makeEvent("payment_intent.payment_failed", {
          id: "pi_fail_1",
          amount: 500,
          metadata: { userId: "user-1" },
          last_payment_error: { message: "card declined" },
        }),
      );

      expect(result.success).toBe(true);
      expect(auditPayment.charge).toHaveBeenCalledWith(
        "user-1",
        500,
        "pi_fail_1",
        false,
        "card declined",
      );
    });

    it("reports failure when the failure audit record cannot be written", async () => {
      (auditPayment.charge as any).mockRejectedValueOnce(
        new Error("audit db down"),
      );

      const result = await handleWebhookEvent(
        makeEvent("payment_intent.payment_failed", {
          id: "pi_fail_2",
          amount: 500,
          metadata: { userId: "user-1" },
        }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("Stripe Connect payout handlers", () => {
    it("account.updated reports success once instantPayoutService confirms the update", async () => {
      const result = await handleWebhookEvent(
        makeEvent("account.updated", {
          id: "acct_1",
          charges_enabled: true,
          payouts_enabled: true,
        }),
      );

      expect(result.success).toBe(true);
      expect(instantPayoutService.handleAccountWebhook).toHaveBeenCalledTimes(
        1,
      );
    });

    it("account.updated reports failure when instantPayoutService throws", async () => {
      (instantPayoutService.handleAccountWebhook as any).mockRejectedValueOnce(
        new Error("connection terminated"),
      );

      const result = await handleWebhookEvent(
        makeEvent("account.updated", {
          id: "acct_2",
          charges_enabled: true,
          payouts_enabled: true,
        }),
      );

      expect(result.success).toBe(false);
    });

    it("transfer.created reports success once instantPayoutService confirms the update", async () => {
      const result = await handleWebhookEvent(
        makeEvent("transfer.created", {
          id: "tr_1",
          amount: 5000,
        }),
      );

      expect(result.success).toBe(true);
      expect(
        instantPayoutService.handleTransferWebhook,
      ).toHaveBeenCalledTimes(1);
    });

    it("transfer.created reports failure when instantPayoutService throws", async () => {
      (instantPayoutService.handleTransferWebhook as any).mockRejectedValueOnce(
        new Error("connection terminated"),
      );

      const result = await handleWebhookEvent(
        makeEvent("transfer.created", {
          id: "tr_2",
          amount: 5000,
        }),
      );

      expect(result.success).toBe(false);
    });

    it("payout.paid reports success once instantPayoutService confirms the update", async () => {
      const result = await handleWebhookEvent(
        makeEvent("payout.paid", {
          id: "po_1",
          amount: 5000,
        }),
      );

      expect(result.success).toBe(true);
      expect(instantPayoutService.handlePayoutWebhook).toHaveBeenCalledTimes(
        1,
      );
    });

    it("payout.paid reports failure when instantPayoutService throws", async () => {
      (instantPayoutService.handlePayoutWebhook as any).mockRejectedValueOnce(
        new Error("connection terminated"),
      );

      const result = await handleWebhookEvent(
        makeEvent("payout.paid", {
          id: "po_2",
          amount: 5000,
        }),
      );

      expect(result.success).toBe(false);
    });

    it("payout.failed reports success once instantPayoutService confirms the update", async () => {
      const result = await handleWebhookEvent(
        makeEvent("payout.failed", {
          id: "po_3",
          amount: 5000,
          failure_message: "insufficient funds",
        }),
      );

      expect(result.success).toBe(true);
      expect(instantPayoutService.handlePayoutWebhook).toHaveBeenCalledTimes(
        1,
      );
    });

    it("payout.failed reports failure when instantPayoutService throws", async () => {
      (instantPayoutService.handlePayoutWebhook as any).mockRejectedValueOnce(
        new Error("connection terminated"),
      );

      const result = await handleWebhookEvent(
        makeEvent("payout.failed", {
          id: "po_4",
          amount: 5000,
          failure_message: "insufficient funds",
        }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("dispatcher-level regressions", () => {
    it("still reports success for an event type with no registered handler", async () => {
      const result = await handleWebhookEvent(
        makeEvent("charge.dispute.created", { id: "dp_1" }),
      );

      expect(result.success).toBe(true);
    });

    it("short-circuits an already-processed event instead of re-running the handler", async () => {
      (dunningService.resolveSequence as any).mockResolvedValueOnce(true);
      const event = makeEvent("invoice.paid", {
        id: "in_test_dup",
        amount_paid: 500,
        customer: "cus_1",
      });

      const first = await handleWebhookEvent(event);
      expect(first.success).toBe(true);

      const second = await handleWebhookEvent(event);
      expect(second.success).toBe(true);
      expect(dunningService.resolveSequence).toHaveBeenCalledTimes(1);
    });

    it("records a critical audit entry when a handler reports failure", async () => {
      (dunningService.resolveSequence as any).mockResolvedValueOnce(false);

      await handleWebhookEvent(
        makeEvent("invoice.paid", {
          id: "in_test_audit",
          amount_paid: 500,
          customer: "cus_audit",
        }),
      );

      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "payment",
          severity: "critical",
          success: false,
        }),
      );
    });
  });
});
