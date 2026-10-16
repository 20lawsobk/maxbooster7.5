import { describe, expect, it } from "vitest";
import {
  normalizeRegistrationCompletionBody,
  normalizeRegistrationVerificationBody,
} from "../../server/middleware/requestValidation";

describe("paid registration completion boundary", () => {
  it("normalizes verification requests", () => {
    expect(
      normalizeRegistrationVerificationBody({ sessionId: " cs_test_123 " }),
    ).toEqual({ ok: true, value: { sessionId: "cs_test_123" } });
  });

  it.each([{}, { sessionId: 123 }, { sessionId: "pi_123" }])(
    "rejects invalid verification sessions",
    (body) => {
      expect(normalizeRegistrationVerificationBody(body)).toEqual({
        ok: false,
        message: "Invalid checkout session",
      });
    },
  );

  it("normalizes a valid completion request", () => {
    expect(
      normalizeRegistrationCompletionBody({
        sessionId: "cs_test_123",
        password: "secure-pass-123",
        tosAccepted: true,
        privacyAccepted: true,
        marketingConsent: false,
      }),
    ).toEqual({
      ok: true,
      value: {
        sessionId: "cs_test_123",
        password: "secure-pass-123",
        tosAccepted: true,
        privacyAccepted: true,
        marketingConsent: false,
      },
    });
  });

  it("caps password length before bcrypt is called", () => {
    expect(
      normalizeRegistrationCompletionBody({
        sessionId: "cs_test_123",
        password: "a".repeat(73),
        tosAccepted: true,
        privacyAccepted: true,
      }),
    ).toEqual({
      ok: false,
      message: "Password must be 72 characters or fewer",
    });
  });

  it("requires the legal acceptances used for durable consent evidence", () => {
    expect(
      normalizeRegistrationCompletionBody({
        sessionId: "cs_test_123",
        password: "secure-pass-123",
        tosAccepted: false,
        privacyAccepted: true,
      }).ok,
    ).toBe(false);
    expect(
      normalizeRegistrationCompletionBody({
        sessionId: "cs_test_123",
        password: "secure-pass-123",
        tosAccepted: true,
        privacyAccepted: false,
      }).ok,
    ).toBe(false);
  });

  it("rejects non-boolean marketing consent", () => {
    expect(
      normalizeRegistrationCompletionBody({
        sessionId: "cs_test_123",
        password: "secure-pass-123",
        tosAccepted: true,
        privacyAccepted: true,
        marketingConsent: "yes",
      }),
    ).toEqual({ ok: false, message: "Invalid marketing consent value" });
  });
});
