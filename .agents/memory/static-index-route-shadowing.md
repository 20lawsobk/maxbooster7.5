---
name: Static index route shadowing
description: Pre-session express.static can intercept root callback URLs before later API or OAuth routes see their query parameters
---

Asset-only static middleware registered before API routes must disable directory index serving; otherwise `/` is answered by `index.html` and root-style OAuth callbacks silently become the SPA.

**Why:** The Too Lost sandbox callback uses a root URL with OAuth query parameters in development. Serving the SPA index first returned HTTP 200 instead of forwarding the authorization result, even though the callback route itself was correct.

**How to apply:** Keep early static serving limited to files/assets (`index: false`) and let the later route stack or SPA handler own `/`. Test root callback URLs through the running proxy, not only direct callback paths.