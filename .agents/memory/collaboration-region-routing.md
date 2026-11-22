---
name: Collaboration region routing
description: The owner’s intended regional-discovery layer for collaboration media.
---

Max Booster’s built-in DNS and marketplace storefront are the intended canonical mechanisms for connection discovery and multi-region routing. Do not replace them with a hosted conferencing or external routing product.

**Why:** The owner stated this is how Max Booster’s existing DNS/storefront architecture is designed to provide connection and multi-region functionality.

**How to apply:** Integrate collaboration media region selection with that built-in path. Still require independent health, capacity, relay, and load-test evidence for each media endpoint; DNS resolution alone does not establish that a media region is healthy or provisioned.
