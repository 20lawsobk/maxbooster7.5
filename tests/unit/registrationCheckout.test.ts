import { describe, expect, it, vi } from "vitest";
import {
  getStripeCheckoutUrl,
  readRegistrationCheckoutPayload,
  validateRegistrationCheckoutInput,
} from "../../client/src/lib/registrationCheckout";

describe("registration checkout", () => {
  const now = new Date(2026, 9, 16, 12, 0, 0);

  it("normalizes valid registration input", () => {
    expect(
      validateRegistrationCheckoutInput(
        {
          username: "  artist_123  ",
          artistName: "  Stage Name  ",
          email: "  USER@Example.COM  ",
          birthdate: "2000-02-29",
        },
        now,
      ),
    ).toEqual({
      username: "artist_123",
      artistName: "Stage Name",
      email: "user@example.com",
      birthdate: "2000-02-29",
    });
  });

  it.each(["ab", "has-dash", "has space", "a".repeat(31)])(
    "rejects usernames that the backend will reject: %s",
    (username) => {
      expect(() =>
        validateRegistrationCheckoutInput(
          {
            username,
            email: "user@example.com",
            birthdate: "2000-01-01",
          },
          now,
        ),
      ).toThrow(/Username must be 3-30 characters/i);
    },
  );

  it("rejects malformed calendar dates instead of relying on Date normalization", () => {
    expect(() =>
      validateRegistrationCheckoutInput(
        {
          username: "valid_user",
          email: "user@example.com",
          birthdate: "2001-02-29",
        },
        now,
      ),
    ).toThrow(/valid date of birth/i);
  });

  it("rejects users who have not reached their 13th birthday", () => {
    expect(() =>
      validateRegistrationCheckoutInput(
        {
          username: "valid_user",
          email: "user@example.com",
          birthdate: "2013-10-17",
        },
        now,
      ),
    ).toThrow(/at least 13 years old/i);
  });

  it("accepts the exact 13th birthday boundary", () => {
    expect(
      validateRegistrationCheckoutInput(
        {
          username: "valid_user",
          email: "user@example.com",
          birthdate: "2013-10-16",
        },
        now,
      ).birthdate,
    ).toBe("2013-10-16");
  });

  it("accepts only HTTPS Stripe checkout URLs", () => {
    expect(
      getStripeCheckoutUrl({ url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
    ).toBe("https://checkout.stripe.com/c/pay/cs_test_123");

    expect(() =>
      getStripeCheckoutUrl({ url: "https://stripe.com.evil.invalid/phish" }),
    ).toThrow(/unsafe checkout link/i);
    expect(() =>
      getStripeCheckoutUrl({ url: "javascript:alert(1)" }),
    ).toThrow(/unsafe checkout link|invalid checkout link/i);
  });

  it("rejects malformed checkout response shapes", () => {
    expect(() => getStripeCheckoutUrl(null)).toThrow(/invalid response/i);
    expect(() => getStripeCheckoutUrl({})).toThrow(/did not return a checkout link/i);
    expect(() => getStripeCheckoutUrl({ url: 123 })).toThrow(/did not return a checkout link/i);
  });

  it("times out a checkout response body that never finishes", async () => {
    vi.useFakeTimers();
    try {
      const pending = readRegistrationCheckoutPayload(
        { json: () => new Promise<never>(() => {}) },
        25,
      );
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).rejects.toMatchObject({
        code: "CHECKOUT_RESPONSE_TIMEOUT",
        retryable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
