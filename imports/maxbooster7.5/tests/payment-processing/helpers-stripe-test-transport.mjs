/** Dedicated test bindings only; opaque proxy bindings require observed test mode. */
import Stripe from "stripe";
import { HttpsProxyAgent } from "https-proxy-agent";

const verified = new Set();

export function assertDedicatedTestBindings() {
  const secret = process.env.STRIPE_TEST_SECRET;
  const client = process.env.STRIPE_TEST_CLIENT;
  if (!secret || !client || /^(?:sk|rk)_live_/.test(secret) || /^pk_live_/.test(client)) {
    throw new Error("Dedicated Stripe test bindings required; live bindings are forbidden");
  }
  if ((!secret.startsWith("sk_test_") || !client.startsWith("pk_test_")) && !process.env.HTTPS_PROXY) {
    throw new Error("Opaque Stripe bindings require their configured HTTPS proxy");
  }
  return { secret, client };
}

function clientTransport(secret) {
  const proxy = process.env.HTTPS_PROXY;
  const transport = Stripe.createNodeHttpClient(proxy ? new HttpsProxyAgent(proxy) : undefined);
  return {
    getClientName: () => "dedicated-stripe-test",
    async makeRequest(host, port, path, method, headers, data, protocol, timeout) {
      if (host !== "api.stripe.com" || Number(port) !== 443 || protocol !== "https" || !path.startsWith("/v1/")) {
        throw new Error("Stripe test transport destination rejected");
      }
      if (method !== "GET" && !verified.has(secret)) {
        throw new Error("Stripe mutation rejected before observed livemode=false balance preflight");
      }
      const safeHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== "authorization"));
      // Keep opaque bindings visible to the host's HTTPS credential replacement.
      // Basic/base64 encoding would hide the placeholder from that replacement.
      safeHeaders.Authorization = `Bearer ${secret}`;
      const response = await transport.makeRequest(host, port, path, method, safeHeaders, data, protocol, timeout);
      if (method === "GET" && path.split("?")[0] === "/v1/balance") {
        const parse = response.toJSON.bind(response);
        response.toJSON = async () => {
          const result = await parse();
          if (response.getStatusCode() === 200) {
            if (result.livemode !== false) throw new Error("Stripe test-mode guard failed; no writes permitted");
            verified.add(secret);
          }
          return result;
        };
      }
      return response;
    },
  };
}

export function createTestStripe(secret, options = {}) {
  const binding = assertDedicatedTestBindings();
  if (secret !== binding.secret) throw new Error("Non-dedicated Stripe credential rejected");
  return new Stripe(secret, { ...options, httpClient: clientTransport(secret) });
}

export async function readWithTestPublishableKey(endpoint) {
  const { client } = assertDedicatedTestBindings();
  const url = new URL(endpoint);
  if (url.origin !== "https://api.stripe.com" || !url.pathname.startsWith("/v1/payment_intents/")) {
    throw new Error("Publishable-key test destination rejected");
  }
  const transport = Stripe.createNodeHttpClient(process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined);
  const response = await transport.makeRequest(url.hostname, 443, url.pathname + url.search,
    "GET", { Authorization: `Bearer ${client}` }, "", "https", 15000);
  return { ok: response.getStatusCode() >= 200 && response.getStatusCode() < 300,
    json: () => response.toJSON() };
}
