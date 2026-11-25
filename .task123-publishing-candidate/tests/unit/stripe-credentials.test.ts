import { describe, expect, it } from "vitest";
import {
  selectStripePublishableKey,
  selectStripeSecretKey,
} from "../../shared/stripeCredentials";

describe("Stripe credential environment selection", () => {
  it("uses only the production secret in a deployed runtime", () => {
    expect(
      selectStripeSecretKey(
        {
          STRIPE_SECRET_KEY: "live-secret",
          STRIPE_TEST_SECRET: process.env.STRIPE_TEST_SECRET as string,
          TESTING_STRIPE_SECRET_KEY: "legacy-sandbox-secret",
        },
        true,
      ),
    ).toBe("live-secret");
  });

  it("prefers the configured sandbox secret in development", () => {
    expect(
      selectStripeSecretKey(
        {
          STRIPE_SECRET_KEY: "live-secret",
          STRIPE_TEST_SECRET: process.env.STRIPE_TEST_SECRET as string,
          TESTING_STRIPE_SECRET_KEY: "legacy-sandbox-secret",
        },
        false,
      ),
    ).toBe("sandbox-secret");
  });

  it("supports the legacy test-secret alias but never falls through to production", () => {
    expect(
      selectStripeSecretKey(
        {
          STRIPE_SECRET_KEY: "live-secret",
          TESTING_STRIPE_SECRET_KEY: "legacy-sandbox-secret",
        },
        false,
      ),
    ).toBe("legacy-sandbox-secret");
    expect(
      selectStripeSecretKey({ STRIPE_SECRET_KEY: "live-secret" }, false),
    ).toBeUndefined();
  });

  it("allows synthetic test fixtures without enabling production-key fallback", () => {
    expect(
      selectStripeSecretKey(
        { NODE_ENV: "test", STRIPE_SECRET_KEY: "local-fixture" },
        false,
      ),
    ).toBe("local-fixture");
  });

  it("selects a publishable key from the matching environment only", () => {
    const bindings = {
      STRIPE_PUBLISHABLE_KEY: "pk_live_fixture",
      VITE_STRIPE_PUBLIC_KEY: "pk_live_vite_fixture",
      STRIPE_TEST_CLIENT: "pk_test_fixture",
    };
    expect(selectStripePublishableKey(bindings, true)).toBe("pk_live_fixture");
    expect(selectStripePublishableKey(bindings, false)).toBe("pk_test_fixture");
  });

  it("rejects whitespace-padded credentials", () => {
    expect(
      selectStripeSecretKey(
        { STRIPE_TEST_SECRET: " sandbox-secret " },
        false,
      ),
    ).toBeUndefined();
  });
});
