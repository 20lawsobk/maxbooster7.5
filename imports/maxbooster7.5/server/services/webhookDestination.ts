import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2 || b === 88)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  // Only native global-unicast IPv6. Excludes mapped IPv4, NAT64, ULA and link-local.
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [first, second] = normalized.split(":").map(part => parseInt(part || "0", 16));
  return first >= 0x2000 && first < 0x4000 && first !== 0x2002 && first !== 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export function webhookUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443") || url.hash) {
    throw new Error("Webhook requires HTTPS port 443 without credentials or fragment");
  }
  return url;
}

/** Resolve once, reject mixed public/private answers, pin the socket, retain TLS hostname.
 * No redirects, proxy environment, connection pooling or response-body buffering.
 */
export async function postWebhook(raw: string, payload: unknown, secret?: string): Promise<void> {
  const url = webhookUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 256 * 1024) throw new Error("Webhook payload too large");
  if (secret && /[\r\n]/.test(secret)) throw new Error("Invalid webhook authorization");
  const deadline = AbortSignal.timeout(10_000);
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => deadline.addEventListener("abort",
      () => reject(new Error("Webhook DNS deadline exceeded")), { once: true })),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new Error("Webhook destination is not a public address");
  }
  const pinned = addresses[0];
  await new Promise<void>((resolve, reject) => {
    const req = request(url, {
      method: "POST", agent: false, signal: deadline,
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
        ...(secret ? { Authorization: secret } : {}) },
    }, (res) => {
      const status = res.statusCode ?? 0;
      res.destroy();
      if (status >= 200 && status < 300) resolve();
      else reject(new Error(`Webhook returned HTTP ${status}; redirects are not followed`));
    });
    req.on("error", reject);
    req.end(body);
  });
}