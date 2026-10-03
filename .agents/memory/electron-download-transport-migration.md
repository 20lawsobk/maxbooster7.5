---
name: Electron downloader migration
description: Migrating electron-builder from Got-backed to Fetch-backed artifact downloads.
---

Upgrading Electron's artifact helper across its Fetch migration requires testing
the packaging consumer's options, not just successful downloads.

**Why:** The packager still supplies Node proxy agents and Got-shaped request
timeouts. Passing those fields unchanged to Fetch silently ignores them; HTTP
error response shapes also change the packager's retry behavior.

**How to apply:** Use the supported custom-downloader seam to preserve streaming,
proxy agents, deadlines, progress, checksum validation and disk artifact caching.
Keep the compatibility seam pinned, fail closed on upstream drift, and exercise
real network requests, cancellation and cache reuse after dependency changes.