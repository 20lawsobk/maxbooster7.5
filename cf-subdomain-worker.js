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

const APEX = "max-booster.com";
// Hostname allow-list: apex or exactly one label of [a-z0-9-] + apex.
// Rejecting everything else prevents SSRF-style host smuggling via the
// X-Forwarded-Host header (the worker only ever forwards hosts it validated).
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?max-booster\.com$/i;

// Security headers applied to every response. CSP is only added when the
// origin didn't set one — the Express app owns its own CSP via helmet, so
// the worker must not override it.
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), payment=()",
};
const FALLBACK_CSP =
  "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; " +
  "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' https: wss:; frame-ancestors 'self'";

function withSecurityHeaders(response) {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(k)) out.headers.set(k, v);
  }
  if (!out.headers.has("Content-Security-Policy")) {
    out.headers.set("Content-Security-Policy", FALLBACK_CSP);
  }
  return out;
}

export default {
  async fetch(request, _env) {
    const url = new URL(request.url);
    const originalHost = url.hostname; // e.g. b-lawzmusic.max-booster.com

    // Error boundary: refuse hostnames outside *.max-booster.com outright.
    if (!HOST_RE.test(originalHost)) {
      return new Response(
        JSON.stringify({ error: "Unknown host", host: originalHost }),
        { status: 421, headers: { "Content-Type": "application/json" } },
      );
    }

    // Rewrite to the main origin — the only host with a Replit TLS cert.
    url.hostname = APEX;

    // Build headers: preserve everything the browser sent, then inject
    // routing metadata so the Express app can resolve the storefront.
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", originalHost);
    headers.set("X-Forwarded-Proto", "https");

    // Propagate the real client IP from the outer Cloudflare edge so that
    // the app's rate-limiter and audit logger see the correct address.
    const cfIp = request.headers.get("CF-Connecting-IP");
    if (cfIp) headers.set("CF-Connecting-IP", cfIp);
    const cfRay = request.headers.get("CF-Ray");
    if (cfRay) headers.set("CF-Ray", cfRay);

    const hasBody = !["GET", "HEAD", "OPTIONS"].includes(
      request.method.toUpperCase(),
    );

    // Cache static assets at the edge; never cache HTML or API responses
    // (they are per-user / per-storefront via X-Forwarded-Host).
    const isStatic = /\.(js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?|mp3|mp4|wav)$/i.test(
      url.pathname,
    );
    const cf = isStatic
      ? { cacheEverything: true, cacheTtl: 86400 }
      : { cacheTtl: 0 };

    const originRequest = new Request(url.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : null,
      redirect: "manual",
      cf,
    });

    try {
      const response = await fetch(originRequest);

      // Pass the origin response through with security headers layered on.
      // redirect:'manual' means 3xx responses are forwarded to the browser
      // rather than followed by the Worker (avoids redirect loops).
      return withSecurityHeaders(response);
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Upstream connection failed",
          detail: String(err),
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
