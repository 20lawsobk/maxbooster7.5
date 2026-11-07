# Private-admin gap catalog

## Evidence boundaries

PR 211 (`8afd5c0bec6e8f3eace70c8d5d8bcea63e9564ad`) provides account,
Developer API entitlement, and controlled storage recovery evidence in
`reports/admin-release-verification/2026-11-07/verification.json`.
Those receipts do not certify a deployed platform or all admin journeys.
The previously preserved `review/aso-pr-209` branch contains further work;
checking out PR 211 did not incorporate that work automatically.

`admin-gap-inventory.json` records static source discovery, source hashes,
declared handlers, domain candidates and unresolved declarations. Generate it
with `node scripts/testing/admin-gap-inventory.mjs`. A discovered route is
not a working feature. Relative paths and dynamic registration require tracing.

## Cross-cutting implementation differences addressed

| Difference in imported PR branch | Correction | Acceptance scope |
|---|---|---|
| Registration defaults enabled | Default disabled; private-launch policy takes precedence over stored registration setting | Policy and shared-boundary tests |
| General non-admin access remains available | Shared governance boundary defaults to administrator-only, preserving existing explicit recovery and signed-provider entry points | Boundary denial tests, not every handler's behavior |
| UI has no private-launch state | Session response carries authoritative policy; non-admin shell stays closed while policy is unknown; sign-out remains available | Type checking and pure display-policy tests; rendered/authenticated UI not yet verified |
| Payment bypass is queried before stored-account verification | Verify account first; stored admins need no payment-bypass service or public subscription | Negative entitlement tests |
| Premium guard can admit suspended accounts if used without the upstream guard | Deny stored suspended/banned status before any entitlement or bypass | Negative tests; upstream MFA retained |
| Private boundary runs before route-local bearer authentication | Resolve trusted bearer identity before private admission, then enforce MFA | Real admin bearer admitted without cookies; ordinary bearer denied |
| Historical source and scoped receipts were confused with current acceptance | Inventory and this ledger distinguish discovered, implemented and executed behavior | No readiness percentage inferred |

## Executed validation for this reconciliation

- Focused unit/route regressions: **83 passed**, zero retries requested.
- Static inventory parser regressions: **3 passed**.
- Real source-app HTTP account/content/auth/MFA regressions: **71 passed**,
  zero failures, errors or skips. This fixture explicitly enables public access
  so ordinary-account regression paths remain testable.
- Real private-admin HTTP fixture: **7 passed**, zero failures, errors or skips.
  Proves admin cookie login, cookie-free admin bearer access, ordinary bearer
  denial, closed registration, ordinary/anonymous application denial, server-owned
  project creation in SQL, persistence through logout/login, and admin Enterprise
  key creation without a public plan. It does not prove process restart.
- Complete server/client type checks and changed-TypeScript lint: passed.
- Production build: passed after reinstalling the exact frozen MaxCore/PDIM
  dependency locks. Initial failure and offline-cache miss were not suppressed.
- Authenticated rendered UI: **not verified**. The primary preview refused the
  connection; the configured service was not restarted against live settings.
- Packaged restart rehearsal: the **startup/shutdown and artifact-integrity
  portions passed in both cycles**, but overall acceptance remains **failed**
  because `/api/ready` returned 503 twice. Both cycles served `/` and
  `/api/health` with HTTP 200, shut down with exit code 0 after SIGTERM, released
  all checked ports, and required no forced kill. Each cycle had zero public
  asset additions, missing assets, or hash mismatches. The readiness failure
  was `maxcore=degraded/model_not_ready` plus unified awareness with 28 configured
  sources and no fresh snapshot. The test intentionally denied external
  TCP/TLS/UDP, so it cannot prove a live-source snapshot. Evidence is retained
  at `reports/admin-gap-audit/packaged-restart.json`.
- The earlier second-start integrity rejection was caused by
  `server/cluster.ts` generating `.br` and `.gz` siblings in `dist/public/assets`
  after the build contract was written. The prior failure showed 270 additional
  sidecars (135 Brotli and 135 gzip); its retained receipt did not preserve the
  individual path list. Compression now runs in the build before the unchanged
  strict contract hashes all outputs; runtime startup no longer mutates them.
- HTTP receipts: `reports/admin-gap-audit/http-final/` and
  `reports/admin-gap-audit/private-http-final/`. Both retained fixture ownership
  checks, external-network denial and process/database cleanup.

These are scoped passes, not full-domain or production certification.
The disposable runtime database must use the current generated schema as its
baseline; replaying overlapping historic table-creation migrations is invalid.
The initial HTTP attempt stopped on Python 3.11 versus installed 3.12 packages;
the successful runs explicitly selected the matching test interpreter, without
changing the serving runtime or bypassing dependency checks.

## Private-admin domain journeys

The newer bounded domain run is recorded in
[`admin-domain-acceptance.md`](admin-domain-acceptance.md), with the source action
map in [`admin-domain-action-inventory.md`](admin-domain-action-inventory.md).
The private-admin source-app fixture passed **18 tests** in disposable
PostgreSQL: representative saved journeys for all twelve domains, logout and
fresh-login project reload, durable SQL ownership checks, and ordinary plus
anonymous denial on one representative route per domain. Distribution reported
no connected provider; no submit was attempted. AI generation, external
delivery, payments, asset storage, authenticated browser rendering, and the
remaining operations were not claimed as passes.

## Domain comparison

All domains retain UNVERIFIED complete end-to-end acceptance. The newer receipt
proves only the bounded journeys it names; it does not close the remaining
actions in the inventory. Global boundary fixes apply across these domains; they
do not substitute for full UI and data-flow acceptance.

| Domain | Existing capability/evidence | Difference still requiring acceptance | Owner / reviewer |
|---|---|---|---|
| Artist management | Artist/profile routes and pages | Create/edit saved identity, upload assets, reload and export with owner-only access | Product engineer / security engineer |
| Fans | Fan and membership surfaces | Imports, consent, deduplication, saved segments and authorized export | CRM engineer / privacy reviewer |
| Projects | PR211 tests cover project persistence, ownership and concurrent edits | Existing admin UI journey, process restart, attachments and recovery | Full-stack engineer / persistence reviewer |
| Studio/DAW | Studio, audio and beat routes | Upload/import, edit, render, download, reopen project, interrupted-job recovery and measured audio quality | Audio engineer / independent media reviewer |
| Distribution | Distribution/release routes | Provider-authorized submission, truthful status, rejection/retry and attributable earnings | Integration engineer / financial reviewer |
| Marketing | Social, campaign and advertising routes | Saved drafts, consented provider publishing, scheduling, cancellation and truthful delivery | Integration engineer / security reviewer |
| Revenue analytics | Analytics/royalty/earnings surfaces | Reconcile source transactions, refunds, fees and payout totals; no inferred settlement | Financial engineer / independent ledger reviewer |
| AI assistant | PR211 verifies entitlement admission, not generation | Qualified text/image/audio/video results, provenance, timeout/cancellation and durable outputs | AI engineer / content-quality reviewer |
| Collaboration | Collaboration/team/message routes | Invitations, least-privilege sharing, revocation and persistence across accounts | Full-stack engineer / security reviewer |
| Marketplace | PR211 rejects premature purchase signals | Complete owned-asset upload, listing, sandbox purchase, entitlement delivery, refund and withdrawal | Commerce engineer / payment reviewer |
| Subscriptions | Paid trial-conversion and entitlement fixes | Sandbox checkout/webhooks/replay/cancellation and reconciliation; admin access independent of buying a public plan | Billing engineer / financial reviewer |
| Administration | PR211 API-key fix and controlled SQL/PDIM recovery | Full admin UI operation, monitoring, packaged restart, rollback, offsite restore and actionable alerts | Operations engineer / security reviewer |

## Operational and reconciliation differences

- Prior-branch generation-quality controls and other changes are not implicitly
  merged by this policy reconciliation. Review their dependencies and tests
  before reintroducing them; do not overwrite PR211's newer entitlement fixes.
- ASO executors/reviewers and an actual release acceptance producer require
  configured execution, bounded retries, retained evidence and independent
  negative testing. A task catalog alone is not an executing team.
- Full coverage, accessibility, security review and real release-builder gates
  remain distinct from unit and HTTP acceptance. Do not lower thresholds.
- Packaged restart, deployment rollback and offsite recovery need isolated
  operational fixtures; controlled SQL/PDIM recovery is narrower evidence.
- Live payments, provider writes, external delivery and production mutations
  require separate approval. Unavailable evidence must remain blocked, not pass.

## Closure rule

Each remaining action requires: exact source and environment, real execution,
saved/reloaded state where applicable, negative permission and failure cases,
and a reviewed receipt. No domain is complete solely because code or tests exist.
