/**
 * Regression tests for Task #109 (Stripe Connect follow-up): the
 * instantPayoutService webhook handlers that back account.updated,
 * transfer.created, payout.paid, and payout.failed must only resolve once a
 * real DB write (or an explicit, persisted reconciliation record) is
 * confirmed. An event that cannot be matched to a local record — or an
 * update that matches zero rows — must throw so the route reports a
 * retryable failure instead of a false "processed" success.
 *
 * Unlike tests/unit/stripe-webhook-honesty.test.ts (which mocks the whole
 * instantPayoutService to test the route's try/catch wiring), these tests
 * exercise the real service methods against a mocked `db`, so the no-record
 * and zero-rows-matched branches inside the service itself are actually
 * covered rather than assumed away by a service-level mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

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

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../server/safety/auditLogger", () => ({
  audit: vi.fn().mockResolvedValue("audit-id"),
  auditConfirmed: vi.fn().mockResolvedValue("audit-confirmed-id"),
  auditPayment: {
    charge: vi.fn().mockResolvedValue(undefined),
    refund: vi.fn().mockResolvedValue(undefined),
    chargeback: vi.fn().mockResolvedValue(undefined),
    payout: vi.fn().mockResolvedValue(undefined),
  },
}));

import { instantPayoutService } from "../../server/services/instantPayoutService.js";
import { audit, auditConfirmed } from "../../server/safety/auditLogger";

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

const payoutRecord = {
  id: "payout-1",
  userId: "user-1",
  status: "pending",
  processedAt: null,
  amountCents: 5000,
};

const splitRecord = {
  id: "split-1",
  orderId: "order-1",
  userId: "user-2",
  collaboratorId: "user-2",
  status: "completed",
  processedAt: null,
  amountCents: 3000,
  failureReason: null,
};

beforeEach(() => {
  limitMock.mockReset();
  valuesMock.mockReset().mockResolvedValue(undefined);
  returningMock.mockReset();
  (audit as any).mockClear();
  (auditConfirmed as any).mockReset().mockResolvedValue("audit-confirmed-id");
});

describe("instantPayoutService.handleTransferWebhook", () => {
  it("throws when metadata.payoutId is present but matches no instantPayouts or splitPayments record", async () => {
    // instantPayouts.id, instantPayouts.stripePayoutId is skipped (splitPaymentId
    // absent doesn't matter here — payoutId takes the instantPayouts branch),
    // then splitPayments.stripeTransferId is skipped too since payoutId is set.
    limitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_orphan",
          amount: 5000,
          metadata: { payoutId: "missing-payout" },
        }),
      ),
    ).rejects.toThrow(/No local record found/);
  });

  it("throws when metadata.splitPaymentId is present but matches no splitPayments record", async () => {
    limitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_orphan_split",
          amount: 5000,
          metadata: { splitPaymentId: "missing-split" },
        }),
      ),
    ).rejects.toThrow(/No local record found/);
  });

  it("persists a confirmed audit record and resolves for an untracked transfer with no id metadata (legacy createSplitPayment)", async () => {
    // No payoutId/splitPaymentId in metadata: both stripe-id fallback lookups
    // (instantPayouts.stripePayoutId, then splitPayments.stripeTransferId)
    // run and miss. This must NOT throw — createSplitPayment() creates real,
    // legitimate transfers with no trackable local row by design — but it
    // must leave a persisted trace rather than a silent no-op. No other
    // table gets a write on this branch, so it must go through
    // auditConfirmed (durable, awaited insert) rather than audit (buffered,
    // resolves before the row is guaranteed to exist).
    limitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_untracked",
          amount: 2700,
          metadata: { type: "split_payment", orderId: "order-9" },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(auditConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stripe_transfer_untracked_reconciled",
        targetId: "tr_untracked",
        success: true,
      }),
    );
    expect(audit).not.toHaveBeenCalled();
  });

  it("rejects (does not report success) when the untracked-transfer audit write fails to persist", async () => {
    // Proves the handler doesn't just call the audit API and hope for the
    // best: if auditConfirmed can't actually write the row, the webhook
    // must fail (so Stripe retries) instead of reporting a false success
    // for an event whose only trace just failed to persist.
    limitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    (auditConfirmed as any).mockRejectedValueOnce(
      new Error("audit_logs insert failed: connection reset"),
    );

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_untracked_fail",
          amount: 2700,
          metadata: { type: "split_payment", orderId: "order-10" },
        }),
      ),
    ).rejects.toThrow(/audit_logs insert failed/);
  });

  it("finds the record via metadata.payoutId and confirms the write via returning()", async () => {
    limitMock.mockResolvedValueOnce([payoutRecord]);
    returningMock.mockResolvedValueOnce([{ id: "payout-1" }]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_1",
          amount: 5000,
          metadata: { payoutId: "payout-1" },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(returningMock).toHaveBeenCalledTimes(1);
    // Only one select was needed — metadata.payoutId matched immediately.
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to stripePayoutId when the transfer has no metadata", async () => {
    limitMock.mockResolvedValueOnce([payoutRecord]);
    returningMock.mockResolvedValueOnce([{ id: "payout-1" }]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", { id: "tr_1", amount: 5000 }),
      ),
    ).resolves.toBeUndefined();
  });

  it("throws when the record is found but the status update matches no rows", async () => {
    limitMock.mockResolvedValueOnce([payoutRecord]);
    returningMock.mockResolvedValueOnce([]); // update raced with a delete

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_1",
          amount: 5000,
          metadata: { payoutId: "payout-1" },
        }),
      ),
    ).rejects.toThrow(/matched no rows/);
  });

  it("finds a split payment via metadata.splitPaymentId and confirms the write via returning() (createEnhancedSplitPayment)", async () => {
    limitMock.mockResolvedValueOnce([splitRecord]);
    returningMock.mockResolvedValueOnce([{ id: "split-1" }]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_split_1",
          amount: 3000,
          metadata: { splitPaymentId: "split-1", orderId: "order-1" },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(returningMock).toHaveBeenCalledTimes(1);
    // Only one select was needed — metadata.splitPaymentId matched immediately,
    // and the instantPayouts branch never ran a query for this transfer.
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to splitPayments.stripeTransferId when a transfer with no id metadata matches an old-style split payment", async () => {
    // No payoutId/splitPaymentId: instantPayouts.stripePayoutId misses, then
    // splitPayments.stripeTransferId matches.
    limitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([splitRecord]);
    returningMock.mockResolvedValueOnce([{ id: "split-1" }]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", { id: "tr_split_legacy", amount: 3000 }),
      ),
    ).resolves.toBeUndefined();

    // The untracked-transfer audit path must NOT fire once a real record is
    // matched via the Stripe-id fallback.
    expect(audit).not.toHaveBeenCalled();
  });

  it("sends a failure notification and confirms the write for a failed split payment transfer", async () => {
    limitMock.mockResolvedValueOnce([{ ...splitRecord, status: "completed" }]);
    returningMock.mockResolvedValueOnce([{ id: "split-1" }]);

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.failed", {
          id: "tr_split_1",
          amount: 3000,
          failure_message: "account closed",
          metadata: { splitPaymentId: "split-1" },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(valuesMock).toHaveBeenCalledTimes(1);
  });

  it("throws when a split payment is found but the status update matches no rows", async () => {
    limitMock.mockResolvedValueOnce([splitRecord]);
    returningMock.mockResolvedValueOnce([]); // update raced with a delete

    await expect(
      instantPayoutService.handleTransferWebhook(
        makeEvent("transfer.created", {
          id: "tr_split_1",
          amount: 3000,
          metadata: { splitPaymentId: "split-1" },
        }),
      ),
    ).rejects.toThrow(/Split payment transfer webhook update matched no rows/);
  });
});

describe("instantPayoutService.handlePayoutWebhook", () => {
  it("throws when no local record matches metadata.payoutId or stripePayoutId", async () => {
    limitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      instantPayoutService.handlePayoutWebhook(
        makeEvent("payout.paid", {
          id: "po_orphan",
          amount: 5000,
          metadata: { payoutId: "missing-payout" },
        }),
      ),
    ).rejects.toThrow(/No local payout record found/);
  });

  it("confirms the write via returning() once the record is matched", async () => {
    limitMock.mockResolvedValueOnce([payoutRecord]);
    returningMock.mockResolvedValueOnce([{ id: "payout-1" }]);

    await expect(
      instantPayoutService.handlePayoutWebhook(
        makeEvent("payout.paid", {
          id: "po_1",
          amount: 5000,
          metadata: { payoutId: "payout-1" },
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("throws when payout.failed matches a record but the update matches no rows", async () => {
    limitMock.mockResolvedValueOnce([payoutRecord]);
    returningMock.mockResolvedValueOnce([]);

    await expect(
      instantPayoutService.handlePayoutWebhook(
        makeEvent("payout.failed", {
          id: "po_1",
          amount: 5000,
          failure_message: "insufficient funds",
          metadata: { payoutId: "payout-1" },
        }),
      ),
    ).rejects.toThrow(/matched no rows/);
  });
});

describe("instantPayoutService.handleAccountWebhook", () => {
  const user = { id: "user-1", stripeConnectedAccountId: "acct_1" };

  it("throws when no user matches the Stripe connected account id", async () => {
    limitMock.mockResolvedValueOnce([]); // user lookup misses

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.updated", {
          id: "acct_missing",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        }),
      ),
    ).rejects.toThrow(/No user found/);
  });

  it("inserts a success notification once payouts and charges are both enabled", async () => {
    limitMock.mockResolvedValueOnce([user]);

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.updated", {
          id: "acct_1",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it("inserts an onboarding-reminder notification when details are not yet submitted", async () => {
    limitMock.mockResolvedValueOnce([user]);

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.updated", {
          id: "acct_1",
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it("writes a confirmed audit record — not a silent success — when details are submitted but capabilities are still pending", async () => {
    limitMock.mockResolvedValueOnce([user]);

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.updated", {
          id: "acct_1",
          charges_enabled: true,
          payouts_enabled: false, // still pending Stripe review
          details_submitted: true,
        }),
      ),
    ).resolves.toBeUndefined();

    // No notification is warranted for this intermediate state, but the
    // event must still leave a real persisted trace instead of no write at
    // all. No other table gets a write on this branch, so it must go
    // through auditConfirmed (durable, awaited insert), not the buffered
    // audit() call.
    expect(valuesMock).not.toHaveBeenCalled();
    expect(auditConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stripe_connect_account_pending_capabilities",
        success: true,
      }),
    );
    expect(audit).not.toHaveBeenCalled();
  });

  it("rejects (does not report success) when the pending-capabilities audit write fails to persist", async () => {
    limitMock.mockResolvedValueOnce([user]);
    (auditConfirmed as any).mockRejectedValueOnce(
      new Error("audit_logs insert failed: connection reset"),
    );

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.updated", {
          id: "acct_1",
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
        }),
      ),
    ).rejects.toThrow(/audit_logs insert failed/);
  });

  it("throws when account.application.deauthorized matches a user but the update matches no rows", async () => {
    limitMock.mockResolvedValueOnce([user]);
    returningMock.mockResolvedValueOnce([]); // update raced with something else

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.application.deauthorized", { id: "acct_1" }),
      ),
    ).rejects.toThrow(/matched no rows/);
  });

  it("confirms the deauthorize write and notifies once the update matches a row", async () => {
    limitMock.mockResolvedValueOnce([user]);
    returningMock.mockResolvedValueOnce([{ id: "user-1" }]);

    await expect(
      instantPayoutService.handleAccountWebhook(
        makeEvent("account.application.deauthorized", { id: "acct_1" }),
      ),
    ).resolves.toBeUndefined();

    expect(valuesMock).toHaveBeenCalledTimes(1);
  });
});
