# Three access-policy proof candidates

This four-file patch remains outside the checkout until parent approval. It retains the six previously reviewed map links and proposes only three more access-policy links. It does not establish complete endpoints, data ownership, response schemas, provider delivery, whole pages or launch readiness.

The public plan case now performs a direct request with no session cookie or authorization header. The owned fixture's fetch wrapper adds only trusted forwarding/client identity; it does not add authentication. The two existing anonymous protected-route cases now demand exact 401 error-only bodies and restore cookie/CSRF state in `finally`.

Each protected-route conjunctive bundle now contains authenticated success, anonymous rejection and five additional real HTTP account-policy cases: suspended, banned, unverified MFA, expired trial and expired subscription. The full SQL-backed HTTP runner still needs to execute all these exact cases successfully from the final frozen source. The map is a candidate, not a current PASS.

Each additional case warms the exact same URL successfully, changes the owned user's actual SQL policy fields, requests the exact URL again with its existing session, requires the source-declared denial and exact body, restores the original SQL fields and saved cookie, and requires the same URL to work again. There is no query nonce, cache eviction, middleware replacement or artificial authorization bypass. The existing loopback fixture client selector assigns each policy state its own stable TEST-NET client for warm/denied/restored requests so intentional denials do not poison another case's abuse counters. Real rate limits and security handling remain enabled.

The traced session path is important:

- `AuthoritativeSessionStore.get()` validates durable account/session authority and excludes suspended/banned rows. These cookie sessions reach the route as anonymous and receive 401 `{ "error": "Authentication required" }`.
- `attachUser` re-reads the real user on every request and removes a user with enabled MFA unless the session has verified its factor. Existing non-MFA sessions therefore receive the same 401. JWT assurance paths can emit distinct 403 responses; this matrix specifically exercises actual browser sessions.
- An expired trial remains authenticated and receives the exact 403 trial-expiry body.
- An expired monthly subscription remains authenticated and receives the exact 403 subscription-expiry body. The helper neutralizes other policy conditions and sets this temporary tier deterministically, then restores every original value.
- The blanket API cache has no explicit authorize callback and skips lookup, preserving route authorization. The same-URL warm/deny/restore sequence guards against a later cached-success bypass.

`withFixtureAccountPolicyState()` delegates to the existing strict isolated database guard: loopback database/application origins, `.invalid` synthetic identity, `test_fixture` role and exact ownership proof are required. It changes only five account policy fields for the original exact ID/email. It snapshots/restores timestamps as SQL text to retain original microseconds and checks the returned original row after restoration. Auth epochs, sessions, passwords, Stripe state and production data are not modified.

Executed before landing: `helper-sql-acceptance.mjs`, under an empty environment with the prepared Node 22/PostgreSQL 17 toolchain, produced `helper-sql-acceptance.json`: **12 checks PASS**. All five states restored exact original SQL values after both successful and intentionally failing callbacks; unknown state and wrong owned-proof failed before mutation. PostgreSQL was stopped and its temporary directory removed. This proves helper safety and restoration only; HTTP authorization remains pending the real isolated runner.

All three TypeScript files parse successfully. The map has nine unique check IDs; both protected candidates require seven distinct exact cases and the public candidate one. Candidate case names and source hashes match the proposed files. Any later source edit requires hash refresh and a new actual source-bound run.
