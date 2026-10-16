import { describe, expect, it, vi } from "vitest";
import {
  getSubscriptionAuthAction,
  normalizeSubscriptionSetupError,
  parseSubscriptionSetupPayload,
  readSubscriptionSetupPayload,
} from "../../client/src/lib/subscriptionCheckout";

describe("subscription checkout lifecycle", () => {
  it("waits for authentication to resolve instead of redirecting early", () => {
    expect(
      getSubscriptionAuthAction({
        authLoading: true,
        userId: null,
        tier: "monthly",
      }),
    ).toEqual({ kind: "wait" });
  });

  it("preserves the requested subscription tier when login is required", () => {
    expect(
      getSubscriptionAuthAction({
        authLoading: false,
        userId: null,
        tier: "yearly",
      }),
    ).toEqual({
      kind: "redirect",
      href: "/login?redirect=%2Fsubscribe%2Fyearly",
    });
  });

  it("continues checkout for an authenticated user", () => {
    expect(
      getSubscriptionAuthAction({
        authLoading: false,
        userId: "user-1",
        tier: "monthly",
      }),
    ).toEqual({ kind: "continue" });
  });

  it("accepts a usable Stripe client secret", () => {
    expect(
      parseSubscriptionSetupPayload({
        clientSecret: "pi_123_secret_abc",
      }),
    ).toEqual({
      ok: true,
      clientSecret: "pi_123_secret_abc",
    });
  });

  it.each([
    {},
    { clientSecret: null },
    { clientSecret: 123 },
    { clientSecret: "   " },
  ])("rejects checkout objects without a usable client secret", (payload) => {
    expect(parseSubscriptionSetupPayload(payload)).toEqual({
      ok: false,
      error: {
        message:
          "The payment service did not return a usable checkout session. Please try again.",
        code: "INVALID_CHECKOUT_RESPONSE",
        retryable: true,
      },
    });
  });

  it.each([null, undefined, [], "not-json-object"])(
    "maps non-object malformed payloads to a retryable checkout error",
    (payload) => {
      expect(parseSubscriptionSetupPayload(payload)).toEqual({
        ok: false,
        error: {
          message:
            "The payment service returned an invalid response. Please try again.",
          code: "INVALID_CHECKOUT_RESPONSE",
          retryable: true,
        },
      });
    },
  );

  it("recognizes Stripe configuration failures", () => {
    expect(
      parseSubscriptionSetupPayload({ code: "STRIPE_NOT_CONFIGURED" }),
    ).toEqual({
      ok: false,
      error: {
        message: "Payment service is temporarily unavailable.",
        code: "STRIPE_NOT_CONFIGURED",
        retryable: false,
      },
    });
  });

  it("times out a response body that never finishes", async () => {
    vi.useFakeTimers();
    try {
      const response = {
        json: () => new Promise<never>(() => {}),
      };
      const pending = readSubscriptionSetupPayload(response, 25);
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).rejects.toMatchObject({
        code: "CHECKOUT_RESPONSE_TIMEOUT",
        retryable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses structured API errors safely for checkout setup failures", () => {
    expect(
      normalizeSubscriptionSetupError({
        code: "TIMEOUT",
        userMessage: "The request took too long. Please try again.",
        retryable: true,
      }),
    ).toEqual({
      message: "The request took too long. Please try again.",
      code: "TIMEOUT",
      retryable: true,
    });
  });
});
