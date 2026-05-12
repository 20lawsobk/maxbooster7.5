/**
 * Cloudflare Worker — Artist storefront subdomain proxy for *.max-booster.com
 *
 * DEPLOY INSTRUCTIONS (one-time, ~5 minutes):
 *   1. Sign up at cloudflare.com (free)
 *   2. Add max-booster.com as a site → Cloudflare gives you two nameservers
 *   3. In Replit Publishing → Domains → click "Manage" next to max-booster.com
 *      → change the nameservers to the two Cloudflare ones
 *   4. In Cloudflare DNS, ensure these records exist (proxied = orange cloud ON):
 *        A  @              34.111.179.208   Proxied
 *        A  *              34.111.179.208   Proxied
 *   5. In Cloudflare Workers & Pages → Create Worker → paste this file → Deploy
 *   6. In the worker's Settings → Triggers → add route:  *.max-booster.com/*
 *   7. SSL/TLS mode → set to "Full" (origin has a cert for max-booster.com)
 *
 * HOW IT WORKS:
 *   Browser → https://b-lawzmusic.max-booster.com  (Cloudflare handles wildcard TLS)
 *          → Worker rewrites destination to https://max-booster.com
 *          → sets X-Forwarded-Host: b-lawzmusic.max-booster.com
 *          → Replit's proxy routes max-booster.com to the VM (cert exists)
 *          → Express reads X-Forwarded-Host via trust proxy → routes storefront
 *
 * No changes to the Replit app are needed beyond what's already deployed.
 * The existing cloudflare.ts middleware and buildTrustProxyValue() already
 * trust Cloudflare IPs, so X-Forwarded-Host is honoured automatically.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originalHost = url.hostname; // e.g. b-lawzmusic.max-booster.com

    // Rewrite to the main origin — the only host with a Replit TLS cert.
    url.hostname = 'max-booster.com';

    // Build headers: preserve everything the browser sent, then inject
    // routing metadata so the Express app can resolve the storefront.
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', originalHost);
    headers.set('X-Forwarded-Proto', 'https');

    // Propagate the real client IP from the outer Cloudflare edge so that
    // the app's rate-limiter and audit logger see the correct address.
    const cfIp = request.headers.get('CF-Connecting-IP');
    if (cfIp) headers.set('CF-Connecting-IP', cfIp);
    const cfRay = request.headers.get('CF-Ray');
    if (cfRay) headers.set('CF-Ray', cfRay);

    const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());

    const originRequest = new Request(url.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : null,
      redirect: 'manual',
    });

    try {
      const response = await fetch(originRequest);

      // Pass the origin response straight through.
      // redirect:'manual' means 3xx responses are forwarded to the browser
      // rather than followed by the Worker (avoids redirect loops).
      return response;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Upstream connection failed', detail: String(err) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
