---
name: A middleware gate reading req.user must mount after the populator
description: An Express middleware that inspects req.user (or any request field another middleware sets) silently does nothing if it's registered/mounted before the populating middleware runs — no error, the gate just always sees the field as undefined and always calls next().
---

# A middleware gate reading req.user must mount after the populator

## The bug
A gating middleware (e.g. one that blocks write operations for a demo/read-only account by checking `req.user.email`) was mounted at the app's top-level entry point, executed early during boot. But the actual user-populating middleware (the one that reads the session and sets `req.user`) was registered *inside* a later `registerRoutes()` call, which runs after the top-level mounting already happened. Express runs middleware in registration order per request, not per some intended logical order — so every request hit the gate before `req.user` had ever been set, the gate's check against `req.user.email` was always against `undefined`, and it silently let every write through. No exception was thrown; the code looked correct in isolation and only failed as an interaction between two files that each looked fine on their own.

## Why this is easy to miss
Both middlewares can be individually correct — the populator correctly sets `req.user`, and the gate correctly checks it — and the bug only exists in the *relative order* they're wired into the app. Reading either file alone gives no signal that anything is wrong. It only surfaces by tracing the actual request-handling order end to end (or by testing the gated behavior directly, e.g. logging in as the restricted account and attempting a blocked action).

## How to apply
- When a middleware's logic depends on a field set by another middleware, mount it as close as possible to (and after) that populator — ideally in the same function/file that does the mounting, not from a separate, earlier-executing entry point (e.g. a top-level `index.ts` that runs before a `routes.ts` file's own `app.use(...)` calls).
- When adding or reviewing any auth/permission-gating middleware, verify empirically that it actually fires: log in as the restricted account and attempt the specific action it's supposed to block, and confirm the block happens — don't infer correctness from the gate's own code reading correctly.
- This is a general Express/Connect-style middleware pitfall, not specific to any one field — the same failure mode applies to any "populate X, then gate on X" pair mounted from different registration call sites.
