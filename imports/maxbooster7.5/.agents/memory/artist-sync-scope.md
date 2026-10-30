---
name: Artist sync scope
description: Automatic catalog reconciliation must stay bound to the selected artist profile, not the user's shared platform-link map
---

Automatic artist sync must derive catalog targets from the selected artist profile's stored or newly verified platform identities. A user's shared streaming-profile map is not an artist boundary because it is keyed by user and platform and can contain another registered artist. Catalog scans should use the exact target profile URL, and name-based fallbacks must accept only exact normalized artist-name matches.

**Why:** A multi-artist user could otherwise open one profile and import another profile's catalog; popularity-based provider fallbacks could also select a namesake.

**How to apply:** Keep profile-target construction and scanning scoped to the current artist profile. Treat shared streaming links as optional persistence, never as the source of auto-discovery targets, and fail closed when a provider returns only a similar-name result.