---
name: CSRF token endpoint must reuse middleware-set token
description: getCsrfToken-style endpoints must read req.csrfToken (set by the generation middleware), never independently re-derive/regenerate — avoids a double-Set-Cookie race
---
A dedicated "give me my CSRF token" endpoint must return the SAME token the upstream CSRF-generation middleware already computed and attached to `req.csrfToken` (falling back to `req.cookies` only if that's absent), never call its own independent derive/generate logic.

**Why:** independent re-derivation causes the endpoint to mint a second token and issue a second `Set-Cookie` in the same response cycle as the middleware's own cookie — a race on the very first request that can leave the client holding a cookie value that doesn't match the token the middleware validates against.

**How to apply:** any CSRF token-fetch endpoint (`/api/csrf-token` or equivalent) is a read of the already-generated token, not a second generation step.
