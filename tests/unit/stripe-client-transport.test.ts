import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { createStripeClient, hasStripeCredential } from "../../server/lib/stripeClient";

function transport(status = 200) {
  const makeRequest = vi.fn(async () => ({
    getHeaders: () => ({}), getStatusCode: () => status, getRawResponse: () => ({}),
    toJSON: async () => status === 200 ? { object: "balance", livemode: false } :
      { error: { type: "invalid_request_error", message: "Invalid authentication" } },
  }));
  return { getClientName: () => "isolated-test", makeRequest };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Stripe credential transport", () => {
  it("keeps raw keys and caller transport working without a proxy", async () => {
    vi.stubEnv("HTTPS_PROXY", "");
    const http = transport();
    const client = createStripeClient("sk_test_fixture", { httpClient: http as never });
    expect((await client.balance.retrieve()).livemode).toBe(false);
    expect(http.makeRequest).toHaveBeenCalledOnce();
  });

  it("sends opaque proxy bindings as Bearer credentials over verified HTTPS", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.invalid:8080");
    const http = transport();
    const create = vi.spyOn(Stripe, "createNodeHttpClient").mockReturnValue(http as never);
    const client = createStripeClient("opaque-binding-fixture", { maxNetworkRetries: 0 });
    expect((await client.balance.retrieve()).livemode).toBe(false);
    expect(create.mock.calls[0][0]).toBeDefined();
    const args = http.makeRequest.mock.calls[0] as unknown as unknown[];
    expect(args[0]).toBe("api.stripe.com");
    expect(args[6]).toBe("https");
    expect(args[4]).toMatchObject({ Authorization: "Bearer opaque-binding-fixture" });
    expect(Object.keys(args[4] as object).filter(key => key.toLowerCase() === "authorization")).toHaveLength(1);
  });

  it("does not mistake credential presence for successful authentication", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.invalid:8080");
    const http = transport(401);
    vi.spyOn(Stripe, "createNodeHttpClient").mockReturnValue(http as never);
    await expect(createStripeClient("opaque-invalid-binding", { maxNetworkRetries: 0 })
      .balance.retrieve()).rejects.toMatchObject({ type: "StripeAuthenticationError", statusCode: 401 });
    expect(http.makeRequest).toHaveBeenCalledOnce();
  });

  it("rejects missing/header-injected credentials and foreign proxy destinations", async () => {
    for (const key of [undefined, "", " ", "token\r\nAuthorization: other"])
      expect(hasStripeCredential(key)).toBe(false);
    expect(() => createStripeClient("")).toThrow(/not configured/);
    vi.stubEnv("HTTPS_PROXY", "http://proxy.invalid:8080");
    const http = transport();
    vi.spyOn(Stripe, "createNodeHttpClient").mockReturnValue(http as never);
    await expect(createStripeClient("opaque-binding-fixture", {
      host: "example.invalid", protocol: "http", port: 80, maxNetworkRetries: 0,
    }).balance.retrieve()).rejects.toMatchObject({ detail: { message: "Stripe transport destination rejected" } });
    expect(http.makeRequest).not.toHaveBeenCalled();
  });
});
