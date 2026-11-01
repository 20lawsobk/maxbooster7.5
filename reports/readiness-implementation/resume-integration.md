# Resumed integration implementation

## Completed source changes

- Mounted the dedicated notification router at `/api/notifications` **before** the legacy inline handlers. Its SMS callbacks precede its authentication middleware; ordinary notification handlers retain authentication and ownership checks. Legacy unmatched handlers remain for compatibility.
- Mounted Resend at the single canonical `/api/webhooks/resend` path in the router registry. Corrected governance's previously unmatched `/webhooks/resend` exception to that actual mount.
- Replaced broad provider CSRF namespace exceptions and unmounted Stripe/SendGrid aliases with exact **POST-only** exceptions for `/api/webhooks/stripe`, `/webhooks/sendgrid`, `/api/webhooks/resend`, `/api/notifications/sms/status`, and `/api/notifications/sms/incoming`. Descendants, trailing slashes, unknown webhooks and other mutating methods receive ordinary CSRF enforcement. Existing non-provider CSRF policy is unchanged.
- Governance requires cryptographic verification before provider maintenance bypass. SendGrid continues to receive the captured Buffer directly; Resend verifies the captured Buffer with Svix identity/timestamp/signature. SMS now shares a dependency-light Twilio verifier between governance and both write consumers, uses the configured HTTPS callback URL rather than Host, and rejects nested/non-string form parameters. Both SMS handlers reverify before database writes. Verification exceptions fail closed.
- Preserved existing global JSON `verify` raw-body capture and middleware placement in `server/index.ts`; did not edit that file. No email signature input is reconstructed from parsed JSON. Twilio correctly verifies signed form parameters rather than raw JSON.
- Typed the password-change transaction's generation result via Drizzle's supported `execute<{ generation: string }>` contract while retaining runtime positive-integer string validation. On resumption, the obsolete user cache/invalidation wiring was **already absent**: authoritative `storage.getUser` hydration and `mfaLifecycle()` were retained, not reintroduced.
- Added isolated resume contract coverage and adjusted the existing integration harness to load the extracted SMS verifier.

No commerce service, client, schema, session configuration or logger changes were made by this work.

## Exact isolated evidence

All commands used an empty environment apart from PATH and disposable HOME. Tests used synthetic credentials, real local cryptographic verification and isolated database/provider boundaries; no live services were contacted.

1. `env -i PATH="$PATH" HOME=/tmp node --test tests/resume-integration-contracts.cjs tests/integration-webhooks.cjs tests/integrations-readiness.cjs tests/admin-governance-isolated.cjs tests/readiness-worker-composition.cjs server/services/securityJwtChain.test.mjs`
   - Final run: **26 passed, 0 failed, 0 skipped/cancelled/todo**, exit 0.
   - Five new resume tests cover exact CSRF methods/paths; real Twilio HMAC/canonical URL; verified Resend/Twilio governance bypass and negative cases; mount order/raw-body/auth-generation source contracts; and both SMS handlers rejecting unsigned requests before any database write.
   - The two existing non-TAP integration scripts each count as one file-level test in that total. They retain their internal assertions for exact-byte email verification, verified fan dispatch, notification policy, SMS consent/STOP, provider receipts, distribution/submission/posting and credential decryption.
   - Other totals: 12 governance tests, 4 JWT/security-chain tests, 3 worker composition tests.
2. `env -i PATH="$PATH" HOME=/tmp node_modules/.bin/tsx --test server/services/securityAuthority.test.ts`
   - **8 passed, 0 failed, 0 skipped/cancelled/todo**, exit 0.
3. Isolated TypeScript `transpileModule` parsing of routes, governance boundary, CSRF, SMS verifier and SMS notification service:
   - **5 files, 0 syntax diagnostics**. This is not a full type check.

## Remaining release gates

- No running-app/browser/proxy-chain test was performed. Mount/raw capture assertions are source contracts; isolated handlers are not full deployed Express/session/CSRF integration certification.
- Operator-approved migration provenance and application remain required, particularly SMS attempt storage, fan-mail event storage, security epochs/MFA/session authority and related constraints. No migration or SQL execution was performed.
- Configure/register authentic provider callbacks for the canonical paths and the same sending accounts: Resend signing secret, SendGrid verification key, Twilio auth token/Messaging Service and public HTTPS APP_URL. Verify provider delivery, retries, raw-body fidelity through ingress, and duplicate/unmatched receipt reconciliation in an authorized environment.
- Notification router precedence deliberately changes previously shadowed consumers to the dedicated implementation. Actual browser preference/SMS verification/push response compatibility still requires acceptance testing.
- Existing non-provider prefix CSRF exceptions/internal-service policy were not redesigned; they are not evidence of comprehensive CSRF hardening.
- Cross-worker revocation, real session-store/browser cookie behavior, downtime/recovery and provider acceptance-before-checkpoint races remain deployment gates. Commerce cutover/history/report/client findings and other owners' review findings remain outside this patch.

No app start/restart, workflow/log inspection, dependency installation, full tsc, full test suite, real database/provider call, migration, or screenshot was performed.