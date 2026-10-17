import { describe, expect, it, vi } from "vitest";
import {
  parseRegistrationCompletionPayload,
  parseVerificationPayload,
  readRegistrationCompletionPayload,
  validateCheckoutSessionId,
  validateRegistrationPassword,
} from "../../client/src/lib/registrationCompletion";

describe("registration completion", () => {
  it.each(["cs_test_123", "cs_live_abcDEF123"])(
    "accepts a bounded Stripe checkout session id: %s",
    (sessionId) => {
      expect(validateCheckoutSessionId(sessionId)).toBe(sessionId);
    },
  );

  it.each([null, "", "pi_123", "cs_bad-value", `cs_${"a".repeat(253)}`])(
    "rejects an invalid checkout session id",
    (sessionId) => {
      expect(() => validateCheckoutSessionId(sessionId)).toThrow(/Invalid payment session/i);
    },
  );

  it("enforces the backend bcrypt password boundary", () => {
    expect(() => validateRegistrationPassword("1234567", "1234567")).toThrow(
      /at least 8/i,
    );
    expect(() =>
      validateRegistrationPassword("a".repeat(73), "a".repeat(73)),
    ).toThrow(/72 characters or fewer/i);
    expect(() => validateRegistrationPassword("abcdefgh", "abcdefgi")).toThrow(
      /do not match/i,
    );
    expect(() => validateRegistrationPassword("abcdefgh", "abcdefgh")).not.toThrow();
  });

  it("requires an explicit verified response", () => {
    expect(() => parseVerificationPayload({ verified: true })).not.toThrow();
    expect(() => parseVerificationPayload({ verified: false })).toThrow(
      /invalid verification response/i,
    );
    expect(() => parseVerificationPayload(null)).toThrow(
      /invalid verification response/i,
    );
  });

  it("requires both a created user and durable consent evidence", () => {
    expect(
      parseRegistrationCompletionPayload({
        user: { id: "user-1" },
        consentRecorded: true,
      }),
    ).toEqual({ userId: "user-1", consentRecorded: true });

    expect(() =>
      parseRegistrationCompletionPayload({ user: { id: "user-1" } }),
    ).toThrow(/did not finish completely/i);
  });

  it("surfaces a partially-created account as a special completion error", () => {
    try {
      parseRegistrationCompletionPayload({
        accountCreated: true,
        code: "ACCOUNT_CREATED_CONSENT_PENDING",
        message: "Registration needs attention",
      });
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toMatchObject({
        message: "Registration needs attention",
        code: "ACCOUNT_CREATED_CONSENT_PENDING",
        accountCreated: true,
      });
    }
  });

  it("times out a response body that never finishes", async () => {
    vi.useFakeTimers();
    try {
      const pending = readRegistrationCompletionPayload(
        { json: () => new Promise<never>(() => {}) },
        25,
      );
      const timedOut = expect(pending).rejects.toMatchObject({
        code: "REGISTRATION_RESPONSE_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(25);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });
});
