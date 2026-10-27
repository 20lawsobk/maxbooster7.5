import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyStripeClient, StripeUnavailableError } from "../../server/lib/stripeClient";

afterEach(() => vi.unstubAllEnvs());

describe("optional Stripe operation boundary", () => {
  it("allows a service to initialize without credentials, but rejects provider use as unavailable", () => {
    const resolve = vi.fn(() => undefined);
    const getClient = lazyStripeClient(resolve);
    expect(resolve).not.toHaveBeenCalled();
    expect(getClient).toThrow(StripeUnavailableError);
    try { getClient(); } catch (error) {
      expect(error).toMatchObject({ status: 503, code: "STRIPE_NOT_CONFIGURED" });
      expect(String(error)).not.toContain("undefined");
    }
  });

  it("creates and reuses a real SDK only for a configured binding, and invalidates it when removed", () => {
    // Construction makes no requests. No provider credentials are used here.
    vi.stubEnv("HTTPS_PROXY", "");
    let binding: string | undefined = "isolated-test-binding";
    const getClient = lazyStripeClient(() => binding);
    const first = getClient();
    expect(typeof first.customers.retrieve).toBe("function");
    expect(getClient()).toBe(first);
    binding = "replacement-isolated-binding";
    expect(getClient()).not.toBe(first);
    binding = undefined;
    expect(getClient).toThrow(StripeUnavailableError);
  });
});
