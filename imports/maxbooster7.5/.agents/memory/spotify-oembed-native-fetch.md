---
name: Spotify oEmbed native fetch
description: safeFetchText (axios custom SSRF agent) fails for Spotify's TLS — use native fetch for hardcoded oEmbed URLs
---

## Problem
`safeFetchText` uses a custom axios HTTPS agent with a `safeDnsLookup` lookup function to guard against SSRF. This custom lookup function is incompatible with Spotify's TLS stack in the Replit environment, producing `ERR_INVALID_IP_ADDRESS: undefined` even though the DNS lookup itself succeeds and returns public IPs.

Symptom: `[AdvancedUrlParser] metadata fetch failed for host=open.spotify.com: Invalid IP address: undefined` and `Spotify oEmbed failed for id=...` — both the initial page fetch AND the oEmbed fetch fail, leaving `ParsedUrl.title` empty. Generate-from-url then passes `"spotify music_stream — NewMusic, NewRelease"` as the topic instead of the real track name.

## Fix
In `server/services/advancedUrlParser.ts`, the Spotify oEmbed block uses native `fetch` (not `safeFetchText`) for the hardcoded `open.spotify.com/oembed` URL:

```ts
const oeFetch = await fetch(
  `https://open.spotify.com/oembed?url=${encodeURIComponent(u.href)}`,
  { headers: { "User-Agent": "MaxBooster/3.0", Accept: "application/json" },
    signal: AbortSignal.timeout(8_000) }
);
```

**Why this is safe:** The base URL `open.spotify.com/oembed` is hardcoded in the parser — not user-controlled. We are fetching FROM Spotify's public API endpoint, not FROM the user-supplied URL. The user-supplied URL appears only as a `?url=` query parameter that Spotify interprets on their end. There is no SSRF risk.

**How to apply:** Any future hardcoded external API call (YouTube oEmbed, SoundCloud API, etc.) embedded in the URL parser should use native `fetch` for the same reason. Only user-supplied URLs that we fetch directly need `safeFetchText`.

**Root cause (deeper):** The `safeDnsLookup` function uses `dns.lookup(hostname, {all:true}, ...)` and ignores the options argument passed by Node's https Agent. This option-ignoring combined with Spotify's TLS/CDN configuration triggers an internal Node.js error during socket creation. The exact mechanism is a Node https Agent + custom lookup + TLS interaction; workaround is native fetch for trusted hardcoded URLs.
