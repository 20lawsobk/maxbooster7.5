---
name: Artist discovery provider boundary
description: The supported separation between artist identity discovery and the Too Lost distribution integration
---

Artist auto-discovery must query the public DSP identity endpoints directly. Too Lost is the authenticated distribution/catalog provider, but its confirmed API surface has no artist-search, artist-roster, or artist-presence resource.

**Why:** Treating a distributor roster lookup as cross-platform identity discovery made the feature depend on the retired LabelGrid path and fail when that account had no matching artist. Fabricating a Too Lost artist endpoint would misattribute identities.

**How to apply:** Keep auto-discover and Apply provider-independent. Use Too Lost for user-authorized release, catalog, delivery, and status operations only; use direct DSP matches, UPC lookups, and explicit user-entered IDs for artist fields. Every discovery run must reconcile catalogs for all known linked/stored identities, not just newly saved matches; merge by UPC/title/artist and report per-platform scan results.

Catalog profile linking must be serialized before parallel catalog scans. Each link reads and rewrites the shared streaming-profile preferences object, so concurrent first-run links can overwrite one another even when the in-memory map contains all platforms.

**Why:** Full reconciliation expands a single discovery request from one possible link to several simultaneous platform links; the existing read/merge/write persistence path is not an atomic multi-profile update.

**How to apply:** Ensure each target profile is linked sequentially, then scan and import the already-linked targets concurrently.