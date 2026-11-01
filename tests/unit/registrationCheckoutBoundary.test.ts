import { describe, expect, it } from "vitest";
import { normalizeRegistrationCheckoutBody } from "../../server/middleware/requestValidation";

const now = new Date(Date.UTC(2026, 9, 16, 12));

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    tier: "monthly",
    userEmail: "USER@Example.com",
    username: "artist_123",
    birthdate: "2000-02-29",
    artistName: " Stage Name ",
    tosAccepted: true,
    privacyAccepted: true,
    ...overrides,
  };
}

describe("registration checkout backend boundary", () => {
  it("normalizes the identity fields used by duplicate checks and Stripe", () => {
    expect(normalizeRegistrationCheckoutBody(validBody(), now)).toEqual({
      ok: true,
      value: {
        tier: "monthly",
        userEmail: "user@example.com",
        username: "artist_123",
        birthdate: "2000-02-29",
        artistName: "Stage Name",
        tosAccepted: true,
        privacyAccepted: true,
      },
    });
  });

  it.each(["2001-02-29", "2020-13-01", "not-a-date"])(
    "rejects an invalid calendar birthdate: %s",
    (birthdate) => {
      expect(normalizeRegistrationCheckoutBody(validBody({ birthdate }), now)).toEqual({
        ok: false,
        message: "Invalid birthdate format",
      });
    },
  );

  it("enforces the exact 16-year age boundary", () => {
    expect(
      normalizeRegistrationCheckoutBody(validBody({ birthdate: "2010-10-16" }), now)
        .ok,
    ).toBe(true);
    expect(
      normalizeRegistrationCheckoutBody(validBody({ birthdate: "2010-10-17" }), now),
    ).toEqual({
      ok: false,
      message: "You must be at least 16 years old to create an account",
    });
  });

  it("rejects missing legal consent before any Stripe checkout is created", () => {
    expect(
      normalizeRegistrationCheckoutBody(validBody({ tosAccepted: false }), now),
    ).toEqual({
      ok: false,
      message: "You must accept the Terms of Service before continuing to payment",
    });
    expect(
      normalizeRegistrationCheckoutBody(validBody({ privacyAccepted: false }), now),
    ).toEqual({
      ok: false,
      message: "You must accept the Privacy Policy before continuing to payment",
    });
  });

  it("rejects malformed direct-API identity values instead of throwing", () => {
    expect(
      normalizeRegistrationCheckoutBody(validBody({ userEmail: 123 }), now).ok,
    ).toBe(false);
    expect(
      normalizeRegistrationCheckoutBody(validBody({ username: { bad: true } }), now).ok,
    ).toBe(false);
    expect(
      normalizeRegistrationCheckoutBody(validBody({ artistName: "x".repeat(101) }), now)
        .ok,
    ).toBe(false);
  });
});
