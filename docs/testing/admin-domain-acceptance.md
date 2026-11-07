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
