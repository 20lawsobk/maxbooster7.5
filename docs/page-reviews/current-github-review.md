# Page review execution — 2026-10-17

Base: `3fb831661d0b7a07c077692dc963cc8d9070e638` from `main`.
Scope: all 80 route declarations in `route-inventory.md`, reviewed as individual
frontend/backend boundaries. This file records the current pass only. Historical
reports do not certify current code. No page is production-certified yet.

## Platform code focus — owner direction

The owner requested that this pass ignore workflow execution and focus on the
actual platform. Workflow status is historical information below, not a blocker
to continuing page inspection, corrections or local verification. No workflow
files were changed in this follow-up.

### Notifications and notification detail

- Fixed an account-isolation defect in the category query: both OR branches now
  remain inside the authenticated owner AND predicate. A regression compiles the
  actual route expression with Drizzle's PostgreSQL dialect and verifies SQL
  grouping and bound parameters.
- Reject invalid, repeated/structured, negative or unbounded pagination/filter
  inputs before a database query.
- Detail now uses the existing owner-scoped single-record endpoint, instead of
  searching only the first 50 list records. Its response retains category,
  priority and action-label metadata consistently with the collection.
- Notification actions accept only local absolute paths or explicit HTTP(S)
  URLs without credentials or control characters. New tabs use noopener and
  noreferrer. Removed duplicate navigation from list items.

### Customer support and shared staff write boundaries

- Customer conversation requests have deadlines, cancellation and generation
  fencing; switching account/ticket remounts private state. Replies have a
  same-tick duplicate guard and use the shared CSRF-aware request helper.
- Ticket creation validates bounded text/types and enum values before writing.
  Staff replies enforce the same message bounds as customer replies. Admin
  updates reject null/empty enum values, invalid numeric ranges, invalid dates,
  empty patches and unexpected fields before persistence.
- Loopback HTTP fixtures exercise the real router and authentication middleware
  against isolated database/service doubles: unauthenticated access, absent
  owner-scoped records, malformed creation/staff writes and customer attempts
  to call staff-only routes. These do not certify live database concurrency,
  provider delivery or browser accessibility. The complete admin support UI
  review remains queued.

Follow-up validation: **366 passed across 26 files**, plus **2 passed** in
an additional page-handler fixture covering late-response fencing and same-tick
duplicate sends; all ran with retries disabled. Server/client native TypeScript
checks, scoped runtime ESLint and a fresh production build passed. Fresh build
output is retained outside the checkout at
`/workspace/.onboarding/page-review-notifications-support-built-dist`; tracked
generated assets were restored. Browser and live-provider acceptance
remain unperformed for these pages.

## First review batch

| Page | Frontend/backend finding and implemented change | Current evidence |
|---|---|---|
| Landing | Demo sign-in bypassed account cleanup/verification; duplicate requests and missing deadline; broken API-docs link; unsupported guaranteed-payout copy. Uses AuthProvider, bounded request, same-account navigation, corrected link/copy. | Actual handler fixtures and shared auth boundary tests pass. Browser/cookie acceptance pending. |
| Login | Traced credential/MFA/demo exchange to shared boundary and session authority. Existing focused handlers pass; session-revocation visibility remains open. | Fixture tests pass; real cookies, cross-tab and provider acceptance pending. |
| Register | New passwords could exceed bcrypt's 72 UTF-8 byte limit; malformed password types reached hashing. Shared validator rejects unsafe new input before persistence. | Password/route fixtures pass, including multibyte collisions. Consent/session partial-failure review remains open. |
| ForgotPassword | Traced account-neutral UI, provider result and reset-token persistence. Existing request/resend fixtures pass. | Live email acceptance and outage-enumeration risk remain open. |
| ResetPassword | Character-count upper bound allowed multibyte bcrypt truncation. Uses shared byte policy; existing atomic reset/session-epoch backend remains intact. | Actual handler/password fixtures pass; live reset/revocation acceptance pending. |
| RegisterPayment | Undefined date bound crashed rendering; missing helper imports and double body parsing prevented checkout; duplicate JSX attributes. Restored bounded parser, validated hosted URL and UTC age bound. | Checkout page fixtures pass; real Stripe sandbox acceptance pending. |
| RegisterSuccess | Missing hook/session/consent variables crashed rendering; catch displayed a success toast; unbounded response parsing and missing paid-consent persistence. Restored state, bounded verified parsing, strict acknowledgment and backend consent recording before login. Account, subscription metadata and consent writes now commit atomically; a failed consent write leaves no account, and the same paid request can be retried safely. | Frontend and actual offline backend route fixtures pass; provider/database acceptance pending. |
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
- Server semantic check initially found an unused legacy date helper in consentService;
  removed it; fresh server and client native semantic checks now both pass.
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


## GitHub review #85 and corrected findings

Review: https://github.com/20lawsobk/maxbooster7.5/pull/85
CodeRabbit returned four major findings and one minor wording finding on
`561f8da0`. All five were implemented and validated locally:

- Keep `/api/countdowns` cached as its response envelope and normalize only the
  Dashboard observer's `select`. A real QueryClient/QueryObserver regression
  proves other consumers retain the envelope while Dashboard receives an array.
- Enabling full mode changes only `preferSimplifiedView`; both dashboard paths
  preserve advanced experience/user levels. Focused mutation tests assert that
  no stale experience level or other preferences are resent.
- Manual device drafts include the edit-start version; reopening and direct
  fallback submission retain it. Older unversioned drafts get an explicit
  action to load the server snapshot without deleting the retained device copy.
- Paid account creation and consent/audit writes use one PostgreSQL transaction.
  A real private PostgreSQL test forces the second audit insert to fail, verifies
  all user/consent/log rows roll back, then retries the same paid request and
  verifies one user, one consent row and three audit entries. Cookie/session
  issuance occurs only after commit. Stripe remains an offline fixture here.
- Registration completion describes the upper bound as 72 UTF-8 bytes and
  connects the instruction to the password field accessibly.

Additional page work: Desktop download contracts passed; fixed the static route
inventory to follow default router re-exports instead of reporting the real
`/api/downloads/latest` route as absent. Developer API now normalizes/bounds key
names, rejects premium key creation for inactive subscriptions, bounds usage
queries to 1–365 whole days, prevents duplicate create clicks, and requires
positive key/revocation response contracts. Its real loopback HTTP tests use an
isolated service and no real key or provider side effects.

Fresh focused convergence after those changes: **311 passed, 20 files**, no
retries/skips. Server and client native semantic checks passed. A fresh ordinary
production build after the CodeRabbit correction batch passed, and scoped runtime
ESLint completed with zero errors. Initial full unit run: **1,947 passed,
12 failed, 3 skipped**. The PostgreSQL PATH/setup and download-audit failures were
subsequently corrected and targeted checks passed. Remaining full-suite failures
include legacy build/export/release assumptions, MaxCore mocked readiness,
undocumented environment variables and stale Dashboard source assertions; the
full suite has not been declared green.

## Isolated runtime and external blockers

The isolated runner now waits for the real CSRF endpoint (health and static HTML
precede lazy route registration), supplies the required synthetic adult DOB and
stages the required package/dependency paths in its disposable working directory.
It creates its own PostgreSQL cluster and blocks outbound TCP/UDP/child processes.
It never uses workspace credentials or production data.

Observed current rehearsal: schema generation and PostgreSQL passed; health and
frontend returned HTTP 200. Real registration, login, session persistence, CSRF
rejection and logout invalidation passed. The bounded authenticated HTTP load
recorded no request failures or threshold failures in steady and spike phases.
Project read/write coverage was **not** exercised: the unentitled synthetic user
received 403. Browser testing was intentionally not run in explicit HTTP mode.
The overall rehearsal **FAILED** because `/api/ready` remained HTTP 503 with
MaxCore deliberately unconfigured in this non-ML fixture. This is not full
production or model readiness. Raw current-instance evidence is retained at
`/workspace/.onboarding/page-review-isolated-result.json` (not portable Git data).

GitHub Actions did not execute any steps (`runner_id: 0`). The Type Check check
annotation explicitly states: **"The job was not started because your account is
locked due to a billing issue."** The owner must resolve GitHub account billing
before the external CI gates can run. No gate was bypassed. The CI unit job now
prepares PostgreSQL fixture binaries, but that change cannot be verified on a
GitHub runner until the account lock is resolved.

CodeRabbit's completed review states its included allowance is one review per
hour and zero remained immediately afterward. A subsequent review is not a pass
until the service actually completes it. Remaining routed pages are still queued;
this PR is a concrete first batch, not completion of all 80 route reviews.

The paid-consent transaction uses the existing tables from `migrations/0095_registration_consents.sql`; this migration was not applied to any shared or production database. Fresh build output is retained outside the checkout at `/workspace/.onboarding/page-review-final-built-dist`; tracked generated assets were restored to avoid unrelated generated-file churn.

Final local checks: the repository's `npm run check` completed successfully (server and client TypeScript). `npm audit --omit=dev --audit-level=high` completed with zero vulnerabilities. The incremental CodeRabbit request was accepted but then rate-limited (the service reported 44 minutes until the next included review); it has not approved the fixes. GitHub Actions remains externally blocked by the confirmed billing lock.
