/**
 * Regression tests for Task #109: dunningService.startSequence/resolveSequence
 * must resolve `false` only on a genuine DB error, and `true` for both a real
 * write and a legitimate no-op (already-started sequence / nothing to
 * resolve). The Stripe invoice.paid and invoice.payment_failed webhook
 * handlers rely on this boolean to decide whether to report success or ask
 * Stripe to retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// `.from/.where/.set` keep the chain going. `.limit` and `.values` are
// explicit terminal calls used by the select/insert chains. The update chain
// used by resolveSequence has no `.returning()` — it terminates by awaiting
// `.where(...)` directly, so `chain` itself must also be thenable.
const limitMock = vi.fn();
const valuesMock = vi.fn();
const whereAwaitMock = vi.fn();

const chain: any = {
  from: vi.fn(() => chain),
  where: vi.fn(() => chain),
  set: vi.fn(() => chain),
  limit: limitMock,
  values: valuesMock,
  then: (resolve: any, reject: any) =>
    Promise.resolve()
      .then(() => whereAwaitMock())
      .then(resolve, reject),
};

vi.mock("../../server/db.js", () => ({
  db: {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/services/emailService.js", () => ({
  emailService: { sendTransactional: vi.fn().mockResolvedValue(undefined) },
}));

import { dunningService } from "../../server/services/dunningService.js";

describe("dunningService success/failure contract", () => {
  beforeEach(() => {
    limitMock.mockReset();
    valuesMock.mockReset();
    whereAwaitMock.mockReset();
  });

  describe("startSequence", () => {
    it("returns true when a new sequence is inserted", async () => {
      limitMock.mockResolvedValueOnce([]); // no existing dunning_state row
      valuesMock.mockResolvedValueOnce(undefined); // insert succeeds
      limitMock.mockResolvedValueOnce([]); // sendStep's user lookup: no match → exits quietly

      const result = await dunningService.startSequence("user-1", "in_1");
      expect(result).toBe(true);
    });

    it("returns true when a sequence already exists (legitimate no-op)", async () => {
      limitMock.mockResolvedValueOnce([{ id: "dunning-1" }]);

      const result = await dunningService.startSequence("user-1", "in_2");
      expect(result).toBe(true);
      expect(valuesMock).not.toHaveBeenCalled();
    });

    it("returns false when the existence check throws", async () => {
      limitMock.mockRejectedValueOnce(new Error("connection terminated"));

      const result = await dunningService.startSequence("user-1", "in_3");
      expect(result).toBe(false);
    });

    it("returns false when the insert throws", async () => {
      limitMock.mockResolvedValueOnce([]);
      valuesMock.mockRejectedValueOnce(new Error("connection terminated"));

      const result = await dunningService.startSequence("user-1", "in_4");
      expect(result).toBe(false);
    });
  });

  describe("resolveSequence", () => {
    it("returns true when the update succeeds", async () => {
      whereAwaitMock.mockResolvedValueOnce(undefined);

      const result = await dunningService.resolveSequence("in_5", "paid");
      expect(result).toBe(true);
    });

    it("returns false when the update throws", async () => {
      whereAwaitMock.mockRejectedValueOnce(new Error("connection terminated"));

      const result = await dunningService.resolveSequence("in_6", "paid");
      expect(result).toBe(false);
    });
  });
});
