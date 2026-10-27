import Stripe from "stripe";
import { HttpsProxyAgent } from "https-proxy-agent";

/** Presence is configuration, not proof of authentication. Proxy-delivered
 * bindings need not expose the provider's key prefix to this process. */
export function hasStripeCredential(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    && !/[\r\n]/.test(value);
}

export class StripeUnavailableError extends Error {
  readonly code = "STRIPE_NOT_CONFIGURED";
  readonly status = 503;
  readonly statusCode = 503;
  constructor() {
    super("Billing service is not configured");
    this.name = "StripeUnavailableError";
  }
}

/** Importing local billing/history services must not require a remote provider.
 * Resolve the SDK only when an operation actually needs Stripe. */
export function lazyStripeClient(
  credential: () => string | undefined,
  options: Stripe.StripeConfig = {},
): () => Stripe {
  let configured: { secret: string; client: Stripe } | undefined;
  return () => {
    const secret = credential();
    if (!hasStripeCredential(secret)) throw new StripeUnavailableError();
    if (!configured || configured.secret !== secret) {
      configured = { secret, client: createStripeClient(secret, options) };
    }
    return configured.client;
  };
}

export function createStripeClient(secret: string, options: Stripe.StripeConfig = {}): Stripe {
  if (!hasStripeCredential(secret)) throw new Error("Stripe credential is not configured");
  const proxy = process.env.HTTPS_PROXY;
  if (!proxy) return new Stripe(secret, options);
  const transport = Stripe.createNodeHttpClient(new HttpsProxyAgent(proxy));
  const httpClient: Stripe.HttpClient = {
    getClientName: () => "stripe-https-proxy",
    async makeRequest(host, port, path, method, headers, data, protocol, timeout) {
      // Never send a credential through a configurable alternate destination.
      if (host !== "api.stripe.com" || Number(port) !== 443 || protocol !== "https") {
        throw new Error("Stripe transport destination rejected");
      }
      const authorized = Object.fromEntries(Object.entries(headers)
        .filter(([name]) => name.toLowerCase() !== "authorization"));
      // Basic authentication hides opaque bindings from credential substitution.
      // Bearer authentication is supported by Stripe and preserves that binding.
      authorized.Authorization = `Bearer ${secret}`;
      return transport.makeRequest(host, port, path, method, authorized, data, protocol, timeout);
    },
  };
  return new Stripe(secret, { ...options, httpClient });
}
