# Private-admin domain acceptance

## Result

This receipt proves a bounded real-source HTTP journey in the private-admin
mode, using the repository's owned disposable PostgreSQL runner. It does not
certify every UI operation or production readiness. `productionReady` remains
`false`; the complete source action inventory is
[admin-domain-action-inventory.md](admin-domain-action-inventory.md), and its
source discovery records all domains as `UNVERIFIED` until each action has its
own acceptance evidence.

## Fixture and evidence

- Application: real `server/index.ts` source process, started by
  `scripts/testing/integration-browser.mjs`.
- Data: disposable PostgreSQL generated from the current schema plus migrations;
  admin and ordinary synthetic accounts were inserted into that database only.
- Access: public registration disabled, admin-only mode enabled, loopback-only
  application, external TCP/TLS and UDP denied.
- Source revision: `c8fe48fbd1f5a01797b4427a70baa4673cfc7423`.
- Dirty test source SHA-256 captured by the runner:
  `23ecf57da08ffa233838913e17abcbc6cca32557fa8a100b5d760af413a3a3c8`.
- Static inventory: 515 tracked source files, 88 UI pages, 2,483 declared
  handlers, 11 unresolved declarations, and 123 unclassified files. The
  generated domain action map exposes each page's literal API references and
  registered route/worker declarations; it is not proof of UI behavior.
- Result: **18 passed, 0 failed, 0 skipped**. The runner reported disposable
  database, application startup, analytics fixture startup, and process cleanup
  as passed; no owned processes remained.
- Receipts: `reports/admin-gap-audit/private-domain-journeys/summary.json` and
  `reports/admin-gap-audit/private-domain-journeys/integration.junit.xml`.
- Test source: `tests/private-admin-http.test.ts`.

The setup output also contains an earlier failed attempt made with a relative
Python executable path. It stopped at process ownership validation before
application startup. The passing retry used the absolute Python 3.12 executable;
only the passing receipt is acceptance evidence.

## Outcomes by domain

| Domain | Executed admin journey | Outcome and boundary |
|---|---|---|
| Artists | Save the admin press kit, reload it, and inspect its SQL owner and saved profile fields. | **Scoped PASS.** Photo upload, profile discovery, external artist lookup, claim verification, and public publishing are not covered. |
| Fans | Create, update, list, verify durable ownership, and delete a subscriber; create, update, reload, and delete an unsent campaign draft. | **Scoped PASS.** Consent delivery, sending, imports/exports, memberships, and provider delivery are not covered. No campaign was sent. |
| Projects | Create an admin-owned project despite a submitted foreign `userId`, verify the database owner, then logout, prove the old session is rejected, login again, and reopen the saved project. | **PASS for this journey.** Attachments, recovery, process restart, and remaining project actions are not covered. |
| Studio | Create a studio project, reopen it through the real Studio route, verify its SQL owner/title, create/edit/reload/delete a track. | **Scoped PASS.** Audio uploads, render/export, plugins, recovery, and audio-quality review are not covered. |
| Distribution | Create, edit, reload, and delete an undispatched release draft. Query the configured distributor state. | **Scoped PASS.** Distributor status returned `409` with `connected:false`, `requiresConnection:true`, and `apiStatus:"not_connected"`. No submission or takedown was attempted; provider receipt is absent. |
| Marketing | Create, list, and delete a playlist-pitch draft. | **Scoped PASS.** Social publishing, OAuth, campaign delivery, scheduling, and cancellation are not covered; no external post was sent. |
| Revenue | Load saved forecast, projection, accuracy, and rate reports; generate a two-month scenario and verify the durable SQL row and provenance. | **Scoped PASS for scenario/report flow.** The saved scenario explicitly labels `heuristic-scenario-v2`, an assumed revenue rate, and no verified currency. It does not reconcile real transactions, refunds, fees, or settlement, and does not prove payout accuracy. |
| Assistant | Load assistant history and verify empty-message validation. | **Scoped PASS for history/validation only.** Valid generation, timeout/cancellation, and durable generated outputs are blocked: the isolated runner has no real generation service or receipt. |
| Collaboration | Create an admin-owned private collaboration project and reload it through the owner's project list. | **Scoped PASS.** Cross-account invitations, join/leave, permission levels, revocation, and two-account persistence are not covered. |
| Marketplace | Create, update, list, and delete an admin-owned merch catalog item. | **Scoped PASS for local catalog CRUD.** Asset upload, listing purchase, checkout, entitlement delivery, refund, payout, and withdrawal are not covered. |
| Subscriptions | Load plan choices and the current admin subscription state without buying a plan. | **Scoped PASS for reads.** Checkout, webhook/replay, cancellation, payment method changes, refunds, and reconciliation require real provider receipts and were not run. |
| Administration | Load dashboard, users, and system-health pages; create an Enterprise Developer API key while submitting a different owner ID; verify admin ownership in SQL; list and revoke the key. | **Scoped PASS.** Other administrator controls, monitoring mutations, recovery, backups, and authenticated rendered UI are not covered. |

“Scoped PASS” is deliberately not promoted to full-domain acceptance. All
remaining actions stay unverified unless an individual receipt proves the
specific UI action, route/worker, durable result, reload, and permission or
failure case.

## Negative permission evidence

The suite checked these representative read paths for both a logged-in
ordinary account and an anonymous visitor. Every request returned HTTP `403`
with `code: "ADMIN_ONLY_MODE"` before domain handling:

- Projects: `/api/projects`
- Artists: `/api/press-kit`
- Fans: `/api/fan-hub/subscribers`
- Studio: `/api/studio/projects`
- Distribution: `/api/distribution/releases`
- Marketing: `/api/playlist-pitching`
- Revenue: `/api/revenue-forecast`
- Assistant: `/api/assistant/history`
- Collaboration: `/api/collaborations/projects`
- Marketplace: `/api/marketplace/my-beats`
- Subscriptions: `/api/billing/subscription`
- Administration: `/api/admin/dashboard`
- Developer API: `/api/developer/keys`

The suite also proves forged administrator registration is denied without
creating a user, the ordinary account's bearer token is denied, and a project
cannot be accessed with the pre-logout session after logout.

## Provider and operational blocks

No sandbox connection or external-delivery receipt was present. The following
actions are **BLOCKED**, not passed: distributor linking/submission/takedown;
social OAuth and publish; email/fan campaign delivery; assistant or media
generation; storage-backed asset upload; marketplace checkout/refund/payout;
subscription checkout/webhooks/cancellation; and settled revenue or royalty
reconciliation. External network access was denied by the acceptance fixture.

Authenticated browser rendering, all Studio audio/media workflows, recovery,
packaged restart, rollback, and offsite restore also remain unverified. The
existing admin gap catalog retains these as separate acceptance requirements.
The static inventory also includes an `admin/intelligence.ts` source file whose
six declarations are not mounted; the active admin intelligence handlers are
registered in `server/routes/admin.ts`. The unmounted declarations are listed
for visibility but are not counted as reachable UI actions.

## Current-source reconciliation (2026-11-12)

The source inventory and navigation ledger were refreshed after syncing with
main. The source inventory now covers 524 tracked candidate files, including
88 UI pages, 2,530 declared handlers, 11 unresolved
declarations, and 123 unclassified candidates. See
[admin-domain-action-inventory.md](admin-domain-action-inventory.md) for page
API references, mounts, handler declarations, and local service dependencies,
and [admin-navigation-flow-ledger.md](admin-navigation-flow-ledger.md) for the
79 router patterns, 30 shared sidebar destinations, six admin-only sidebar
links, four mobile shortcuts, More-menu behavior, and route-only distinctions.
These are reviewed source maps, not blanket acceptance.

### Current-source verification

- `node --test tests/layout-navigation-accessibility-browser.test.mjs`:
  **12 passed, 0 failed** after the rebase, in Chromium using the production
  stylesheet. The
  ordinary-user fixture verified mobile menu accessible names, closed-drawer
  focus exclusion, Enter/Escape behavior, focus restoration, and desktop resize.
  It did not exercise admin links or business operations.
- `tests/unit/auth-page-age-policy.test.ts` and
  `tests/unit/private-admin-boundaries.test.ts` plus
  `tests/unit/admin-health-telemetry.test.ts`: **90 passed, 0 failed**. These
  include the actual registration route callback with explicit closed policy
  and unavailable-policy errors, account-creation denial, policy boundaries,
  and telemetry calculation.
- `npm run check`: passed for server and client TypeScript.
- `node --check scripts/testing/page80-acceptance.mjs` and
  `git diff --check`: passed.
- The isolated page-acceptance harness had two setup failures before the final
  rerun: first it inherited the intended closed-launch policy; after making its
  local opt-in explicit, it still lacked the persisted registration setting.
  After the rebase, its current-source run at
  `16e53e0d64ceba3b10165dc99eeb65e619365bf4` returned
  **PASS_WITH_UNTESTED_CATEGORIES** with no failed routes:
  42 authenticated, 11 administrator, and 27 public routes rendered in real
  Chromium. The real form-login/session/logout flow, synthetic-user cleanup,
  2FA setup and TOTP verification, project CRUD and cross-owner denial,
  preferences reload, workspace persistence/owner checks, and press-kit form
  save/reload/public projection/cache invalidation/unpublish passed. The report
  is `reports/admin-gap-audit/2026-11-12/page80-rebased/page80.json`.
  Its app and PostgreSQL were isolated, external networking and provider
  credentials were absent, readiness correctly remained degraded at HTTP 503
  for missing MaxCore/model, and process/database cleanup passed. The temporary
  account received a paid entitlement in the disposable database and its role
  was changed to admin only there; this is not the intended administrator or
  separate representative paid/free-account acceptance. Route rendering does
  not prove each page's material workflow.
- The private-admin and ordinary paid/free HTTP suites were not rerun against
  this source snapshot. Their isolated runner requires
  `.pythonlibs/lib/python3.12/site-packages`, which is absent in this workspace.
  The current shell has Python 3.12.13 but not the matching test dependency
  directory. Previous receipts remain revision-bound and are not treated as
  current acceptance.

### Confirmed shared-path correction

The password-registration route previously translated the explicit
`RegistrationDisabledError` (403) and `GovernancePolicyUnavailableError` (503)
into a generic HTTP 500. It now preserves those safe policy outcomes and does
not create an account on either failure. The two real-route callback regressions
passed in the unit run above. This does not enable registration in production;
the disposable page fixture opts in only within its isolated process/database.

### Remaining acceptance blockers

- **Intended administrator and ordinary accounts:** No designated non-production
  acceptance environment or authorized existing sessions were supplied to this
  isolated workspace. The browser fixture's administrator is a synthetic row
  whose role is changed only inside disposable PostgreSQL. It is useful for
  route rendering, but cannot stand in for the intended admin, representative
  paid account, or representative free account.
- **Shared workflows:** The source ledger identifies endpoints and expected
  saved/generated states, but there is no current-source, real-account UI
  journey for each of the 30 shared navigation destinations. Prior scoped HTTP
  receipts are not elevated to full UI acceptance.
- **Provider-dependent actions:** No charges, settlement, fan/customer messages,
  OAuth writes, publishing, distribution submission, KYC decision, or other
  external mutations were performed. Where no genuine sandbox receipt exists,
  these remain blocked, not passed.
- **MaxCore/model service:** The isolated browser harness deliberately starts
  without MaxCore or a loaded model. Separate older evidence found local
  MaxCore health without a loaded model; the configured remote probe returned
  HTTP 404 for health and awareness paths. Neither proves current model-serving
  readiness.
- **Awareness/native discovery:** The retained direct source scan saw 28
  configured observations with 16 healthy and 12 failed (five access-denied,
  five not-found, one DNS failure, one unsafe feed). It does not prove lawful
  native discovery on all eight approved platforms or provide eight-platform
  attributable results. Respect the reported access denials; do not scrape
  around them.
- **Storage, training, and generated media:** Existing storage/restart receipts
  are scoped and task-specific. This acceptance run supplies no current
  checkpoint/restart proof, actual training receipt, or genuine attributable
  text, image, audio, and video model outputs. Those requirements remain open
  alongside their already-active task references.

The final page-acceptance verdict and cleanup are recorded in the linked
2026-11-12 report directory. Overall acceptance and `productionReady` remain
**false** until each blocked flow has its own authorized, current-source
evidence.
