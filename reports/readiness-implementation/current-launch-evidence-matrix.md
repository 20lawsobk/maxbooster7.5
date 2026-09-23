# Current launch evidence matrix

## Superseding continuation

The original dated reconciliation below is historical. Its absent-backup and
unapplied-commerce claims have been superseded: `database-recovery-drill.json`
proves retained private App Storage readback/restore; the generation-bound
`commerce-migration-live-receipt.json` records exact applied 0022/0023 schemas.
Do not rerun those live migrations or request GCS IAM evidence.

Credential-free provider processes passed with real isolated PostgreSQL, and
MaxCore's existing offline suite passed 494 tests (eight dependency skips).
Synthetic PDIM content restore passed through the production storage classes.
Neither substitutes for actual provider acceptance, full model serving or
retained recovery of actual user content. Current model loading remains blocked
on a compatible checkpoint; cold-boot/load acceptance remains blocked by runner
capacity/isolation. See `launch-blockers-current.md`,
`model-readiness-current.md`, `pdim-content-recovery-drill.json` and
`credential-free-simulation-handoff.md` for superseding evidence.

Current release decision remains **NOT READY**; publication has not occurred.

## Historical reconciliation (before retained recovery and live migrations)

**Decision: NOT READY.** This was a read-only reconciliation. No old passing
test was rerun, no runtime was started, and no database, provider, storage,
payment, DNS, or deployment call was made. No secret or environment value was
read or printed; presence-only checks remain with the main agent.

## Revision boundary

- Git HEAD observed: `bf6a902017b0e369469cc4c05998d07a129061af`
  (committed 2026-09-23T10:03:54Z).
- Point-in-time source digest (`server`, `client/src`, `shared`, `scripts`,
  `migrations`): `37be06bda485af31d4e27892b095e7d42d6bba7280c37db19c4361f59cb06c9b`.
- Point-in-time tests digest (`tests`):
  `442d69ffd5d7d5b25abe24d691d0fe41d9869e4dd1bbc90be681b5fe9b1976c6`.
- Selected launch evidence digest:
  `b4446898c20be87a7714addcce90483336b40c9349185181cd4b151f04b1ff3d`.
- Concurrent recovery-script work made the tree differ from HEAD at digest time.
  The digest covers the bytes observed at 2026-09-23T10:08:53Z only. It does
  not claim later edits, deployment incorporation, or a deployable artifact.
  Existing evidence does not supply a current source-to-deployment artifact
  digest.

## Observations and corrections

The published health/readiness result, the production-schema inspection, and
secret-existence metadata in `launch-blockers-current.md` remain **historical
observations**. They are not current live checks. In particular, the published
MaxCore half-open state cannot prove that current source was deployed.

Current source contains the reported checkout/webhook durability, canonical
admin API-key scope, local PDIM, MaxCore supervisor/circuit, Too Lost, and
browser-harness corrections, with corresponding test files. Commerce migration
files 0022/0023 exist. Source and test existence does not prove migration,
publication, or live acceptance.

The reported 12 Stripe, 25 PDIM/client/supervisor, 7 MaxCore, 2 admin, focused
provider, typecheck, frontend-build, and isolated auth results are labeled
**historical only**. None was rerun here, and none covers concurrent changes,
current deployment, retained backup, live providers, load, or cold image.

## Enabled provider path

**Too Lost is the active provider for new submissions.**

- `server/routes.ts` mounts `server/routes/distribution.ts` at
  `/api/distribution`.
- The main submission and Spotify, Apple, and YouTube submission routes call
  `submitToolostRelease`.
- `distribution-toolost-submission.ts` uses the `toolost` durable submission
  key and invokes the Too Lost client.
- LabelGrid is historical. Startup still imports its royalty-sync service, but
  `start()` is intentionally a no-op: it schedules no provider reads and makes
  no automatic ledger writes. Explicit operator-authorized historical
  reconciliation and legacy reads remain.

No provider mutation or call occurred in this review. Too Lost sandbox
acceptance is still missing.

## Four launch gates

| Gate | Current result | Reconciliation |
|---|---|---|
| 1. Retained backup and commerce migration | **Blocked** | Migration and isolated restore code/evidence exist, but the prior dump was ephemeral and removed. Missing: independent off-source destination, retention/access controls, retained checksum, restore/invariant proof, historical migration reconciliation, authorized apply, and post-apply verification. |
| 2. Credential migration/rotation | **Blocked — external pending** | No authoritative provisioning/rotation receipt was found. Overlapping Task 71 remains external pending. The main agent owns presence-only checks. |
| 3. Publish and verify corrected MaxCore | **Blocked — external pending** | Source/tests exist, but no artifact digest, rollout receipt, post-deploy owned-child check, or real model-ready/inference acceptance exists. Task 215 DNS also remains external pending without revision-linked DNS/TLS evidence. |
| 4. Provider/finance/DR/cold-image/load | **Blocked** | Too Lost is enabled and LabelGrid automation is disabled, but sandbox delivery, financial authority, retained DR, packed cold boot, and representative load/soak are unproven. Tasks 213/214 LabelGrid remain external pending and do not change the active provider. |

No task status was changed or inferred. Tasks 71, 213, 214, and 215 are treated
as external pending solely for ownership reconciliation; no authoritative
completion receipts were found.

## Storage and sandbox boundary

`server/config/index.ts` defaults `STORAGE_PROVIDER` to `pocket-dimension` and
the external storage HTTP URL to the empty string. This is a source-default
finding, not an environment check. **Release remains NOT READY** because no
independently retained recovery destination is established.

Too Lost sandbox acceptance needs:

- a registered sandbox OAuth app and exact redirect URI;
- an authenticated disposable user/account connection;
- authorization-code and refresh-token grants;
- `read:profile`, `read:releases`, `write:releases`, `read:catalog`,
  `read:analytics`, and `read:earnings`;
- API and presigned-upload egress;
- disposable FLAC/artwork/metadata with explicit rights, terms, and non-AI
  declarations; and
- separate authority before any sandbox create/edit/submit/delete mutation.

Exact evidence/permissions missing in this review: runtime start, source-DB
access, provider calls, provider mutations, an authorized sandbox connection,
granted-scope evidence, response fixtures, and provider delivery/accounting
receipts.

Genuine code/contract blockers are distinct: AI-assisted documentation fields
are not collected; pagination is not authoritative; no confirmed takedown,
royalty-statement, or payout-request API exists; and payable-ledger funding
lacks authoritative period, currency, reversal, entitlement, and duplicate-safe
receipt semantics. Credentials, user consent, scopes, provider entitlement, and
mutation authorization are external permissions—not code fixes.

## Load-script review

`tests/load/load-test.ts` was not run. It is a bounded GET-only public-read
probe: 60 seconds, 50 users, ramp-up, 10-second timeout, response consumption,
non-overlap per simulated user, P95/P99 measurement, and nonzero/99%/500ms/1s
exit thresholds. It exercises health, ping, readiness, unauthenticated auth
state, marketplace listing, and the SPA root.

Safety limitations:

- loopback is the default and no credential is sent;
- `LOAD_BASE_URL` has no built-in non-production allowlist or target
  confirmation;
- responses are scored by HTTP status, not business semantics; and
- no authenticated isolation, durable writes, payments/webhooks, provider
  behavior, storage recovery, MaxCore generation, workers, or cold start is
  covered.

Real acceptance still needs target-guarded isolated scripts for public
load/soak, seeded authenticated session/CSRF journeys, Stripe test-mode checkout
plus webhook/ledger reconciliation, authorized disposable Too Lost sandbox
delivery, PDIM interruption/restore, MaxCore model-ready/generation, packed
cold boot and worker/sidecar lifecycle, and revision-bound DNS/TLS/callback
checks.

## Concise blocker inventory

1. No retained independent off-source backup or retention receipt.
2. Commerce migrations 0022/0023 lack live apply/receipt/post-apply evidence.
3. Task 71 credential migration/rotation lacks an authoritative receipt.
4. MaxCore correction lacks deployment and real model-health evidence.
5. Too Lost sandbox delivery, response-shape, and accounting acceptance is
   absent.
6. Payout/statement and safe payable-ledger authority is unavailable or
   unconfirmed.
7. Packed cold image, authenticated load/soak, and revision-linked DNS/TLS
   evidence are absent.
8. External storage URL default is empty; independent recovery is unestablished.
9. Tasks 213/214 LabelGrid and 215 DNS remain external pending without receipts.