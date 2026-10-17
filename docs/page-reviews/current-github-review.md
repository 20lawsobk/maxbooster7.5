# Page review execution — 2026-10-17

Base: `3fb831661d0b7a07c077692dc963cc8d9070e638` from `main`.
Scope: all 80 route declarations in `route-inventory.md`, reviewed as individual
frontend/backend boundaries. This file records the current pass only. Historical
reports do not certify current code. No page is production-certified yet.

## First review batch

| Page | Frontend/backend finding and implemented change | Current evidence |
|---|---|---|
| Landing | Demo sign-in bypassed account cleanup/verification; duplicate requests and missing deadline; broken API-docs link; unsupported guaranteed-payout copy. Uses AuthProvider, bounded request, same-account navigation, corrected link/copy. | Actual handler fixtures and shared auth boundary tests pass. Browser/cookie acceptance pending. |
| Login | Traced credential/MFA/demo exchange to shared boundary and session authority. Existing focused handlers pass; session-revocation visibility remains open. | Fixture tests pass; real cookies, cross-tab and provider acceptance pending. |
| Register | New passwords could exceed bcrypt's 72 UTF-8 byte limit; malformed password types reached hashing. Shared validator rejects unsafe new input before persistence. | Password/route fixtures pass, including multibyte collisions. Consent/session partial-failure review remains open. |
| ForgotPassword | Traced account-neutral UI, provider result and reset-token persistence. Existing request/resend fixtures pass. | Live email acceptance and outage-enumeration risk remain open. |
| ResetPassword | Character-count upper bound allowed multibyte bcrypt truncation. Uses shared byte policy; existing atomic reset/session-epoch backend remains intact. | Actual handler/password fixtures pass; live reset/revocation acceptance pending. |
| RegisterPayment | Undefined date bound crashed rendering; missing helper imports and double body parsing prevented checkout; duplicate JSX attributes. Restored bounded parser, validated hosted URL and UTC age bound. | Checkout page fixtures pass; real Stripe sandbox acceptance pending. |
| RegisterSuccess | Missing hook/session/consent variables crashed rendering; catch displayed a success toast; unbounded response parsing and missing paid-consent persistence. Restored state, bounded verified parsing, strict acknowledgment and backend consent recording before login. Partial failure reports an existing account. | Frontend and actual offline backend route fixtures pass; provider/database acceptance pending. |
| Subscribe | Undefined rawData/setupAttemptRef broke setup; setup failures did not populate retry state. Uses bounded real parser and error normalization while retaining intent keys. | Scope/race/retry fixtures pass; provider acceptance pending. |
| Dashboard | Countdown parser returns an array but UI expected a transport envelope; status ignored for paid access; full-mode action bypassed persistence. Corrected data boundary, shared access check, persisted mode switch and null-safe account rendering. | Focused dashboard/project fixtures pass. |
| SimplifiedDashboard | Undefined onboardingStatus crashed the effect; unauthenticated/restricted content could mount; full-mode handler bypassed duplicate guard. Reads persisted authenticated-user preferences and gates content/action. | Focused contracts pass. |
| Projects | Tests read a forwarding file after refactoring. Actual implementation lost fallback version checks, recovered draft base versions, async recovery fencing, and exact-version draft cleanup. Restored those contracts and test the implementation file. | Direct/queued conflict, recovery, playback and backend mutation fixtures pass. Real PostgreSQL concurrency acceptance remains open. |
| Settings password dialog (shared child only) | New password validation now agrees with the server's UTF-8 byte policy. | Shared policy checks pass; complete Settings page review remains queued. |

## Current verification

- Focused convergence: **269 passed, 14 files**, no retries, no skips
  (`/tmp/page-review-convergence.log`). These are isolated fixtures/unit tests,
  not a production rehearsal or live-provider test.
- Scoped ESLint: **0 errors, 20 warnings** across edited runtime files.
- Client semantic check: native `tsgo -p tsconfig.client.json --noEmit` passed.
- Server semantic check found an unused legacy date helper in consentService;
  removed it; rerun pending.
- A TypeScript symbol scan across page implementation files found no additional
  unbound runtime identifiers besides the now-fixed simplified dashboard effect.
  This is a narrow diagnostic, not review completion for the other pages.
- Full production build, complete unit suite, browser acceptance, isolated server
  startup and GitHub checks remain pending for this patch.

## GitHub and remaining pages

GitHub API initially failed at the network CONNECT proxy. Adding api.github.com
to environment networking enabled repository/PR access; access is now verified.
The earlier PR #84 is separate and remains unchanged by this pass.

All remaining routed pages in `route-inventory.md` are queued. Existing partial
reviews are starting evidence only; each needs its own route/service/persistence,
security, failure-path, accessibility and runtime checks. No code-review request,
empty test run, mocked provider response or runnerless CI result is a pass.

Required current-instance bindings are absent: development DATABASE_URL (or
NEON_DATABASE_URL) and SESSION_SECRET. Do not use a production/shared database
for destructive acceptance tests. Provider-dependent checks require configured
sandbox credentials; they have not been run.
