---
name: Mobile load — dev/preview link vs published app
description: Why the Replit dev link can fail to load on cellular while production is fine, and the production service-worker mobile defects identified (and intentionally left unfixed)
---

## Two different load paths
- **Dev/preview link (`*.replit.dev`)**: serves the Vite **dev** server (hundreds of separate
  unbundled ES-module requests routed through Replit's dev proxy). The service worker is a
  transparent pass-through here — `client/public/sw.js` `IS_DEV` matches
  `localhost`/`127.0.0.1`/`.replit.dev`/`.picard.replit.dev`, so NO caching. High-latency/flaky
  cellular makes the many small module fetches stall intermittently → "didn't load, now it does."
  This is dev-only and not what real users hit. Don't chase it as an app bug.
- **Published app (`maxbooster.replit.app` + custom storefront domains)**: serves the optimized
  production build AND the service worker is fully active (caching).

## Production service-worker mobile defects (identified, NOT fixed — user declined)
In `client/public/sw.js` (also copied to `public/sw.js`):
1. `cacheFirst` (hashed `/assets/*-[hash].js|css`): on a failed fetch it returns
   `new Response("", { status: 503 })` — an EMPTY body served as JS/CSS, with no retry. One
   dropped request on cellular leaves the app permanently broken (blank / stuck loader) until the
   user clears the SW cache. Invisible on WiFi.
2. `shellNetworkFirst`: no timeout on the network fetch → a stalled cellular connection hangs on
   the loading screen until the OS-level timeout instead of falling back to the cached shell fast.
3. Large initial bundle (vendor-react ~1.4MB, Dashboard ~0.9MB, index.css ~0.67MB uncompressed;
   per-route code-split chunks up to ~4MB) — heavy first load on slow data. Served brotli'd.

**Why left unfixed:** user explicitly declined when offered (acute symptom was the dev link and it
self-resolved). If revisited: retry dropped assets (never poison with an empty 503), race the shell
fetch against a short timeout → cached shell, and trim/lazy the initial bundle. Any SW change also
needs a `CACHE_VER` bump + rebuild + redeploy to take effect.
**How to apply:** if a future "won't load on mobile" report names the PUBLISHED domain (not
`.replit.dev`), start with defect #1 — it's the one that turns a transient cellular blip into a
permanently broken load.
