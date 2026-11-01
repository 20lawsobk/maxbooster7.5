# Max Booster Production-Grade Launch Blueprint

## 1. Purpose and non-negotiable rules

This document is the execution blueprint for taking the current Max Booster
repository from its present state to a production launch decision. It is a
plan, not a claim that the repository is already launch-ready.

The executor must follow these rules for every change:

1. A success response is allowed only after the real side effect has been
   verified. A database write must be confirmed by its affected row or a
   read-after-write; a file must be confirmed by a real stat/read; an external
   submission must be confirmed by the provider response and the persisted
   provider identifier.
2. Never replace a failed real operation with a successful-looking local,
   demo, simulated, placeholder, or in-memory result.
3. Never catch an error, log it, and return success or an empty value when the
   caller needs to know that the operation failed. Return a typed failure,
   throw, or mark the durable job/entity failed.
4. Retries are permitted only when the operation is idempotent or protected by
   an idempotency key. Retries must preserve the original error and final
   attempt count.
5. Do not weaken authorization, validation, rate limits, CSRF checks, webhook
   signatures, or money/ledger invariants to make a test pass.
6. Do not write fake provider credentials or invent third-party data. All
   provider credentials referenced by a test or launch step are assumed to be
   present in Replit Secrets, as requested. If one is absent, the result is
   **blocked**, never **passed**.
7. Every changed behavior gets a regression test that fails if the old
   behavior returns.
8. Do not mark a feature ready until its failure path has been exercised.

The final launch verdict is `GO` only if every required gate is green. A
single red, unknown, skipped-without-reason, simulated-success, missing
credential, failed migration, or unverified external side effect is `NO-GO`.

## 2. Current repository inventory

The inventory is generated from the filesystem at the start of execution so
new or renamed modules cannot escape review. Do not rely on a copied list from
an earlier run.

Run:

```bash
set -euo pipefail
mkdir -p reports/production-readiness
find server/routes -type f -name '*.ts' -o -name '*.tsx' | sort \
  > reports/production-readiness/backend-route-files.txt
find server/services -type f -name '*.ts' -o -name '*.tsx' | sort \
  > reports/production-readiness/backend-service-files.txt
find client/src/pages -type f -name '*.tsx' -o -name '*.ts' | sort \
  > reports/production-readiness/frontend-page-files.txt
find client/src/components -type f -name '*.tsx' -o -name '*.ts' | sort \
  > reports/production-readiness/frontend-component-files.txt
find server -type f \( -name '*.ts' -o -name '*.tsx' \) | sort \
  > reports/production-readiness/server-files.txt
find tests -type f | sort > reports/production-readiness/test-files.txt
```

The current feature domains that must each receive a completed checklist row
are:

- Authentication, registration, sessions, CSRF, password reset, email
  verification, 2FA, recovery codes, RBAC, API keys, and developer API.
- User onboarding, profiles, artist discovery, career coach, assistant,
  notifications, email preferences, achievements, personalization, and
  retention.
- Projects, workspaces, collaboration, contracts, budgets, songwriting,
  studio, comping, markers, MIDI, plugins, stems, warping, audio processing,
  audio analysis, and VST bridge.
- AI content, social AI, multimodal generation, creative models, AR
  intelligence, video generation, music videos, training, and MaxCore proxy/
  local-supervisor behavior.
- Beats, listings, marketplace, payments, subscriptions, invoices, payouts,
  billing, Stripe webhooks, royalty splits, royalty transactions, royalty
  statements, streaming rates, tax/KYC, and the beat money loop.
- Releases, catalog, distribution, LabelGrid, platform sync, playlist
  pitching, radio pitches, publishing, sync licensing, sample clearances,
  label submissions, release countdown, and content ID.
- Social OAuth, connected accounts, social posting, bulk posting,
  approvals, autonomous social, autopilot, dual autopilot, advertising,
  organic growth, fan campaigns, fan hub, memberships, outreach, and press
  kits.
- Storefronts, storefront domains/hosts, DNS, domain registrar, merch, fan
  commerce, downloads, files, uploads, hybrid storage, and offline mode.
- Analytics, internal analytics, revenue forecasting, monitoring, Prometheus,
  status, reliability endpoints, audit, security, self-healing, kill switch,
  backups, recovery, logs, testing, and executive/admin dashboards.
- Accessibility, SEO, blog/documentation/help, legal pages, landing/pricing,
  settings, public profiles/press kits, shows/venues, and every other page
  discovered by the inventory commands above.

For each discovered file, create a row in
`reports/production-readiness/feature-matrix.csv` with:

```text
path,domain,entrypoints,authz,side_effects,external_dependencies,
success_evidence,failure_evidence,test_files,status,owner,notes
```

`status` may be only `UNREVIEWED`, `FIXED`, `VERIFIED`, `BLOCKED`, or
`NOT_APPLICABLE`. `NOT_APPLICABLE` requires a written reason and reviewer
sign-off; it may not mean “not tested”.

## 3. Execution order and gates

Do not start a later phase while an earlier phase has a red gate.

### Phase 0 — Freeze, baseline, and safety

1. Create a clean branch/checkpoint.
2. Record `git status`, current commit, Node version, package-manager version,
   workflow name, and the database target.
3. Confirm that application schema and data work target `NEON_DATABASE_URL`,
   not the separate managed `DATABASE_URL`.
4. Run `npm run check`, `npm test -- --run`, `npm run build`, and the existing
   pre-launch/smoke commands. Save every output under
   `reports/production-readiness/baseline/`.
5. Start the configured `Start application` workflow. Do not run a second
   server process.
6. Record baseline responses for `/api/health`, `/api/ready`, and
   `/api/version`. A failed baseline is recorded as a defect; it is not
   edited out of the report.

**Gate:** the baseline report exists, the app starts, and all baseline
failures are listed with an owner. No baseline failure may be silently
discarded.

### Phase 1 — Configuration, secrets, dependencies, and schema

1. Extract every `process.env.X`, typed environment property, and documented
   secret name from `server`, `client`, scripts, workflows, and deployment
   files.
2. Compare the extracted set with `.env.example`, `docs/DEPLOYMENT.md`,
   `replit.md`, and the Secrets tab. Classify each as required, optional,
   development-only, test-only, or obsolete.
3. Remove plaintext production credentials from `.replit`, committed files,
   logs, fixtures, and generated artifacts. Replace reads with the supported
   environment/secrets path. Never print secret values while checking.
4. Run dependency audit. Upgrade vulnerable dependencies only with a
   passing lockfile, build, typecheck, and regression suite.
5. Apply schema changes to the actual application database using the project's
   migration/push procedure. Verify every new table, column, index, constraint,
   and uniqueness rule with read-only schema queries.
6. Confirm all foreign keys, unique constraints, money precision, timestamps,
   soft-delete rules, and idempotency keys used by the application.

**Gate:** no plaintext production secret, no undocumented runtime variable, no
schema mismatch, and no unresolved high/critical dependency finding.

### Phase 2 — Authentication and authorization

For registration, login, logout, session persistence, password reset, email
verification, 2FA, recovery codes, CSRF, RBAC, API keys, and admin routes:

1. Test valid, invalid, expired, replayed, missing, and cross-user requests.
2. Confirm passwords/tokens/secrets are never returned in JSON or logs.
3. Confirm session regeneration occurs at privilege boundaries and session
   revocation takes effect on the next request.
4. Confirm every admin route enforces authentication, admin role, and required
   2FA; hidden frontend links are not treated as authorization.
5. Confirm every mutation has CSRF protection where applicable and rate limits
   reject abusive requests without changing data.
6. Add live integration tests for each boundary and one browser test for the
   complete login-to-admin journey.

**Gate:** unauthorized requests cannot read or mutate protected data, valid
sessions survive restart according to the configured session store, and every
negative test fails safely.

### Phase 3 — Storage, files, audio, video, and downloads

1. Test upload URL issuance, token signature/expiry, MIME validation, size
   limits, path traversal, concurrent reuse, cancellation, and cleanup.
2. Verify every successful upload by reading/stat-ing the persisted object and
   confirming its tracking row. Verify failed writes return failure and leave
   no orphaned tracking record or bytes.
3. Test local/PDIM availability independently. A provider outage must produce
   a visible failure or an explicitly degraded operation, never fake success.
4. Verify download authorization, soft-deleted objects, range behavior,
   content disposition, MIME type, and cache headers.
5. For audio/video pipelines, verify actual codec, duration, sample rate,
   preview length, thumbnail/poster, storage key, and served URL. A database
   path without a readable media object is failure.
6. Test large files, duplicate submissions, process restart, and cleanup jobs.

**Gate:** every file returned as available is readable by the authorized
consumer, and every failure is durable, visible, and recoverable.

### Phase 4 — Money, subscriptions, royalties, tax, and payouts

1. Use Stripe test mode and the configured test credentials. Never use a fake
   payment provider response.
2. Exercise checkout creation, successful payment, failed payment, duplicate
   webhook, out-of-order webhook, refund, cancellation, renewal, past-due,
   lifetime plan, and idempotent replay.
3. For a beat sale, verify the provider charge, order, seller earnings,
   royalty split, royalty transaction, platform fee, notifications, and audit
   record. If any downstream booking fails, the operation must enter an
   explicit repairable failure state and alert; it must not report completed.
4. Exercise threshold payout with a real connected-account test fixture and
   verify the provider transfer/payout identifier and durable transaction
   state. Test insufficient balance, missing account, provider failure, and
   duplicate worker execution.
5. Verify royalty-rate source, effective date, currency, rounding, statement
   math, tax forms, KYC status, and auditability. Do not seed unsourced numbers.
6. Test every money mutation inside a transaction or with an explicit
   idempotency/reconciliation protocol.

**Gate:** every cent has one authoritative ledger trail, all provider events
are idempotent, and no paid user or seller sees success while money state is
missing or ambiguous.

### Phase 5 — Music workflow, release, distribution, and storefront commerce

For projects, releases, metadata, artwork, tracks, ISRC/UPC, distribution,
LabelGrid, DSP status, publishing, playlist/radio pitching, sync, samples,
storefronts, DNS, domains, merch, and downloads:

1. Create, edit, publish, unpublish, delete, restore, and permission-test each
   entity.
2. Validate required metadata, ownership, territory, explicit-content flags,
   artwork/audio requirements, and release scheduling.
3. Submit one real test release through the configured provider and verify the
   provider identifier, persisted dispatch, webhook signature, status
   transition, retry behavior, and terminal failure.
4. Confirm unconfigured providers return a visible unavailable/error state; no
   demo dispatch ID, simulated catalog, or local-only status may imply external
   delivery.
5. For storefront domains, confirm the active host is projected into the
   routing table before reporting live; test DNS failure, duplicate host, SSL
   mismatch, and takedown.
6. Verify checkout/download entitlements, ownership checks, file availability,
   and seller accounting.

**Gate:** every “live”, “submitted”, “published”, or “paid” state maps to a
   real external or durable internal fact that can be queried independently.

### Phase 6 — AI, studio, automation, social, and campaigns

1. Exercise every AI generation, analysis, mastering, mixing, assistant,
   multimodal, video, studio, autopilot, and campaign entrypoint with real
   configured MaxCore/provider credentials.
2. Verify request validation, timeouts, cancellation, job persistence, polling,
   output media, metadata, ownership, and cleanup.
3. If MaxCore is unavailable, return the documented explicit unavailable error;
   do not substitute local fake output or claim completion.
4. For social OAuth, test connect, refresh, expiry, revoke, wrong-user access,
   platform scope failures, publish success, provider rejection, and retry.
5. Confirm autonomous campaign/post success only after a real platform post
   identifier is returned and stored. “No platforms reachable” is a visible
   failed outcome.
6. Test worker restart, lock expiry, duplicate delivery, circuit-breaker open/
   half-open/closed states, and recovery after MaxCore returns.
7. Verify the beat money loop records scan, generation, upload, listing,
   advertising, and analysis outcomes separately; partial completion is never
   mislabeled as full completion.

**Gate:** every generated artifact is real and retrievable, every post/
campaign has provider evidence, and every dependency outage is visible and
does not permanently stall future work.

### Phase 7 — Admin, analytics, observability, security, and operations

1. Replace every hardcoded health, API, latency, score, growth, revenue, or
   “operational” value with a real query or a clearly labeled unavailable
   result.
2. Confirm `/api/ready`, `/api/health`, admin system health, health registry,
   circuit-breaker state, route-registration state, database, Redis, storage,
   MaxCore, and provider checks have bounded timeouts and truthful statuses.
3. Verify request IDs, structured logs, redaction, audit logs, dead-letter
   queues, retries, alerts, Sentry event delivery, Sentry silence detection,
   metrics, P50/P95/P99 calculations, and dashboard timestamps.
4. Run security checks for injection, SSRF, traversal, CSRF, XSS, IDOR,
   privilege escalation, secret leakage, webhook forgery, replay, rate-limit
   bypass, and unsafe file parsing.
5. Test backups, restore, migrations, disaster recovery, kill switch, operator
   notifications, and deployment rollback using disposable/test data.
6. Confirm every admin action has authorization, durable audit evidence, and
   affected-row verification.

**Gate:** operators can distinguish healthy, degraded, down, unknown, and
unconfigured states without log access, and every security/observability
control has a demonstrated failure test.

### Phase 8 — Frontend and client applications

For every discovered page and component:

1. Load it as anonymous, authenticated user, seller/creator, admin, and
   unauthorized user where those roles apply.
2. Exercise loading, empty, success, validation-error, provider-error,
   permission-denied, offline, retry, and destructive-confirmation states.
3. Confirm every displayed number/status comes from the API response and that
   stale cached data is visibly labeled or invalidated after mutations.
4. Confirm forms validate on both client and server, buttons cannot double
   submit, uploads show real completion, and payment/status UI matches the
   durable backend state.
5. Test keyboard navigation, focus management, screen-reader labels,
   responsive layouts, reduced motion, color contrast, error announcements,
   SEO metadata, deep links, and refresh behavior.
6. Test desktop/mobile builds and PWA/offline behavior using the actual build
   output, not a development-only approximation.

**Gate:** no page exposes a false success, dead action, unhandled error,
unauthorized data, broken deep link, or accessibility blocker.

## 4. Regression-proof testing matrix

Every matrix row needs a test file, a deterministic setup, a real assertion,
and a recorded failure-path assertion:

| Area | Unit | Integration | Browser/E2E | Failure cases |
|---|---|---|---|---|
| Auth/RBAC | token/session helpers | login, CSRF, role routes | register → login → admin | expired session, wrong role, replay |
| Storage | key/token/path helpers | upload/download/tracking | upload → view → delete | PDIM down, disk error, duplicate token |
| Payments | idempotency/ledger math | Stripe webhook/order/royalty | checkout/subscription | failed charge, duplicate/out-of-order webhook |
| Payouts | threshold/rounding | connected account transfer | seller payout view | missing account, provider rejection |
| Media | trim/metadata validators | persisted media readback | upload → preview/play | corrupt media, wrong duration/MIME |
| Distribution | payload/status mapping | provider submission/webhook | release submission UI | provider 4xx/5xx, invalid signature |
| AI/MaxCore | contract/timeout handling | job submit/poll/output | generator/studio UI | unavailable, timeout, malformed output |
| Social | OAuth/status mapping | token refresh/post record | connect → post | expired scope, no reachable platform |
| Admin/health | status aggregation | readiness/metrics | admin dashboard | each monitored dependency down |
| Security | validators/redaction | attack-request suite | protected navigation | IDOR, SSRF, XSS, CSRF |
| Operations | lock/retry calculations | worker restart/recovery | operator controls | duplicate worker, dead letter, restore |
| Frontend | component states | API mutation/cache | every page role matrix | loading/error/offline/denied |

Run each test tier in a clean environment. Do not mark skipped tests as passed.
Tests that require external services must use the configured real test
accounts/endpoints and record provider IDs; they must not replace calls with
mock servers.

## 5. Deterministic per-feature completion record

For each inventory row, the executor must fill this exact record:

1. **Entry points:** route, job, command, page, or worker.
2. **Actors:** anonymous, user, creator, admin, provider webhook, worker.
3. **Inputs:** valid and invalid schemas, limits, ownership fields.
4. **State changes:** exact tables/objects/files/provider resources changed.
5. **Success evidence:** the read-after-write or provider evidence required.
6. **Failure evidence:** status code/state/error/alert expected for each fault.
7. **Security evidence:** authorization, CSRF/signature, redaction, rate limit.
8. **Test evidence:** exact commands and test paths.
9. **Documentation evidence:** API, operations, env, and user-facing docs.
10. **Status:** `VERIFIED` only when all nine fields are complete.

## 6. Required cleanup and architecture consistency

After behavior is fixed and tests pass:

1. Remove dead fallback branches, demo IDs, simulated provider responses,
   unused feature flags, obsolete route duplicates, abandoned fixtures, and
   stale comments. Do not delete a branch until its real replacement and test
   are present.
2. Use one authoritative implementation per concern: one auth contract, one
   storage success contract, one health registry, one provider status shape,
   one ledger/idempotency protocol, and one error taxonomy.
3. Replace `@ts-nocheck`, unsafe casts, unchecked affected-row writes, and
   broad catch-and-continue blocks encountered in production paths. If a
   third-party boundary requires a cast, validate the runtime shape immediately
   and test malformed responses.
4. Ensure all relative media URLs are absolutized at the correct proxy seam,
   all optional values use explicit validation, all Express 5 params are
   normalized without double decoding, and all SQL optional values are
   explicitly null or omitted.
5. Update API, architecture, database, integrations, frontend, deployment,
   operations, threat-model, and feature documentation whenever behavior
   changes.

## 7. Final launch verification sequence

Run these commands in order from a clean checkpoint and save output:

```bash
set -euo pipefail
npm run check
npm run lint
npm test -- --run
npm run test:integration
npm run build
npm run prelaunch
npm run test:smoke
npm run security:audit
```

Then restart the configured workflow and verify:

1. The application boots without new errors or route-load failures.
2. `/api/health`, `/api/ready`, and `/api/version` return truthful responses.
3. The live browser smoke path completes registration/login, a Stripe test
   checkout, beat upload/listing/preview, sale/royalty booking, payout
   threshold handling, distribution submission, one social post, and admin
   dashboard inspection.
4. The database contains the expected durable rows and no orphaned temporary
   records after the smoke path.
5. Each dependency outage test returns to healthy after recovery.
6. No secret scan finds credentials in tracked files or build artifacts.
7. The generated inventory has no `UNREVIEWED` rows and no unowned `BLOCKED`
   rows. Any `NOT_APPLICABLE` row has evidence and approval.

## 8. Required final documentation

Create `PRODUCTION_READINESS.md` only after the final sequence passes. It must
contain:

- commit/checkpoint and verification date;
- exact runtime, workflow, database target, and deployment target;
- the complete generated inventory and feature matrix;
- every defect found, the real fix, and its regression test;
- every required/optional secret, purpose, and failure behavior, without values;
- schema/migration and backup/restore verification;
- the testing matrix results and saved command output locations;
- provider test resource IDs where safe to record;
- monitoring, alert, rollback, and incident procedures;
- explicit known limitations, each classified as launch-blocking or approved;
- a final `GO`/`NO-GO` decision signed by the operator.

`GO` is forbidden when documentation is incomplete. The document must never
say “production-ready” based only on typecheck or a green unit suite.