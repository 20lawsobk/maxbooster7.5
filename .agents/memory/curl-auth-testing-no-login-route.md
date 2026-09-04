---
name: Authenticated curl/E2E testing when there is no public login route
description: This app has no register/login HTTP route and its only seeded account (demo) is write-blocked; use a temporary dev-gated login route to get a real session, then fully remove it.
---

**Situation:** auth is session-cookie based (`req.session.userId`, custom `sessionId` cookie,
`requireAuth` resolves session or a JWT bearer token). There is no `/api/auth/login` or
`/api/auth/register` route — the only self-service way to get a session via HTTP is
`POST /api/auth/demo`, which logs in as the seeded `demo@maxbooster.ai` account. That account is
real and its session works, but a separate middleware check
(`user?.email === "demo@maxbooster.ai"` in `server/auth.ts`) makes most write endpoints respond
`403 { message: "Demo mode is read-only..." }`. So the demo route is fine for read-path checks but
useless for verifying any POST/PUT/mutation fix end-to-end.

**Do not** try to forge a session by hand-writing to the Redis/Postgres session store or signing a
`cookie-signature` value yourself — the store implementation is custom (`IoredsSessionStore` in
`server/middleware/sessionConfig.ts`, ioredis-backed with a `PgOnlySessionStore` fallback) and which
one is active depends on PDIM reachability at boot; matching its exact serialization by hand is
fragile and easy to get subtly wrong.

**What actually works:** temporarily add a narrow route that mirrors the real `/api/auth/demo`
handler exactly (`storage.getUserByEmail`/`createUser`, force `subscriptionStatus: "active"`,
`sessionRegenerate` → set `req.session.userId` → `sessionSave`), but for a **new, non-demo** email,
and gate it behind `if (!isProductionEnv())`. This reuses the app's own real session code path (no
guessing at internals), yields a normal full-access account, and is trivial to verify is fully
removed afterward (the net `git diff` on the file should show zero change once the temporary block
is deleted — added-then-fully-removed nets to nothing).

**Steps that worked:**
1. Fetch `/` once to receive the `csrf-token` cookie; read it from the curl cookie jar with
   `awk -F'\t' '/csrf-token/ {print $7}'` (the Netscape cookie file is tab-separated — plain `grep`
   + `awk '{print $NF}'` silently grabs nothing useful because the fields don't split on spaces).
2. `POST` that temp route with `-H "X-CSRF-Token: $CSRF"` and the same cookie jar (`-b`/`-c`) to get
   a session cookie for the fresh test user.
3. Exercise the real endpoints under test with that cookie jar.
4. Delete the temporary route block entirely; confirm with `git diff --stat` on the file (expect no
   diff left) and a grep for the temp route's unique strings (expect zero hits).
5. Clean up the created test-user row afterward — see the NEON_DATABASE_URL memory note; the
   `executeSql` sandbox callback silently hit 0 rows against the *wrong* database, `psql
   "$NEON_DATABASE_URL"` found and deleted the real row. This is the same app-DB-identity gotcha,
   not a new one — re-confirming it here because it bit a DELETE, not just a schema check.
