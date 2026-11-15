# Resumed Settings security consumers

## Implemented

- Read `security.md` exact client contracts and `client-offline.md` account-boundary/preference implementation before editing.
- Settings now exposes enabled-factor replacement, sends `currentCode` for replacement (empty object for initial enrollment), verifies the pending factor with `{code}`, and refreshes authenticated user state after confirmed success.
- Dedicated MFA dialogs describe five-minute recent password/Google+MFA sign-in, single-use TOTP codes, waiting for a fresh code, ten-minute browser-session-bound setup, and keeping the old factor active until verification. Pending setup secrets are cleared on dialog close/reopen and local expiry; server expiry/errors remain authoritative. Disable sends `{password,code}` or `{code}` for passwordless OAuth, never a proof-free request.
- Explicit reauthentication flags are recognized both directly and inside structured error details. A 403 also displays sign-out/sign-in guidance because older shared transport versions discard that flag. No transport change or CSRF bypass was introduced.
- Erasure accepts only HTTP 202 with `accepted:true`, `erased:false`, and a pending-policy request. Messaging says queued/awaiting retention review, not deleted; the not-before date is not represented as a completion deadline. Passwordless OAuth can submit `{}` after recent sign-in/MFA.
- Authenticated status refresh distinguishes no request from unavailable/malformed status. Pending-policy requests expose cancellation, with server rejection/conflict errors retained explicitly. Cancelled requests can be submitted anew.
- The actual Settings Privacy tab previously had a separate, no-op destructive confirmation. Its erasure-only subsection now opens the dedicated status/request/cancel dialog and no longer promises irreversible immediate deletion. Preference/export behavior was not changed.
- Accepted erasure invokes the existing coordinated `logout()` rather than manually clearing storage, forcing a reload, or using an unawaited timer. A durable-duration toast tells users they can sign in again to view/cancel; cleanup failures are reported separately from accepted erasure.
- Security async completions are fenced by the existing owner/epoch identity; no new persistence, auth restoration, preference writes, draft clearing, or cross-account reassignment was introduced.
- Removed only the unused top-level `db` import from `server/routes/sync.ts`; transactional handler parameters remain untouched.

## Isolated beta evidence

Ran with no inherited application credentials:

```sh
env -i PATH="$PATH" HOME=/tmp node --test \
  tests/unit/client-auth-beta-contracts.test.mjs \
  tests/unit/client-account-boundary.test.mjs \
  tests/unit/client-offline-readiness.test.mjs
```

**13/13 passed.** Five new tests execute the production dialog-contract helpers against simulated responses/transport failures: initial/replacement proof bodies, local/OAuth disable, reauthentication/replay guidance, strict 202-not-erased handling, status/cancel/null/malformed/unavailable/conflict outcomes. Scoped TSX parsing and source assertions cover Settings/Privacy wiring, pending-setup expiry, account fences, and awaited coordinated logout. Existing tests cover account barriers/persistence and serialized preferences. Scoped `git diff --check` passed.

These are simulated boundary tests, not mounted React/browser or deployed security certification. No application/workflow startup, browser, live provider/DB request, full TypeScript check, installation, migration, or full suite was run. No changes to PayoutDashboard, shared apiRequest, main.tsx, or other workers' domains.

## Remaining gates

- Native browser/account-transition acceptance, real recent-sign-in/MFA/session revocation, CSRF, and screen-reader/mobile form acceptance remain required.
- Erasure remains policy-blocked server-side; no completed deletion, retention policy, worker, or subscription cancellation is claimed.
- Server security/sync migrations and production deployment evidence remain the owners' release gates.