# Max Booster completion execution plan

Recorded October 26, 2026; updated October 27. This ledger governs the remaining work; it is not a
launch certificate. Repository baseline: `work` at
`4c72114a55a9425d4af743a72a71e4c58a532d2f`. Changes after that commit are currently
uncommitted. The scope is the existing Replit web/API application, its local
imported MaxCore/PDIM services, Neon, enabled provider journeys and 80 declared
pages. The owner's latest instruction extends the completion plan to the entire
platform: every page section and its backend, shared and unrouted code, desktop
and mobile clients, native/plugin integration, all supported languages, and
deployment, recovery and global operations. Those lanes remain explicit even
where their prerequisites are unavailable. The current Replit web/API release
rehearsal covers only its stated deployment scope.

The [full platform plan](platform-completion-plan.md) and its 80 individual page
ledgers are the exhaustive work breakdown for this execution sequence. Every
registered control, frontend contract, backend declaration, unresolved mapping
and measured source file retains its own work item and evidence requirements.
Page aliases are separate route declarations. Shared dependencies are linked
to their complete ledgers rather than discarded or counted as independently
verified each time a page imports them. Nothing becomes complete merely by
being inventoried or included in this plan.
The [execution schedule](platform-work-schedule.md) assigns all 80 declarations
to dependency-ordered work waves. Every named section and its six work
dimensions must execute; the waves sequence the work without narrowing it.

## Current position

The first full master run completed and exposed real defects plus stale test
fixtures. Focused repairs now cover numeric batching, public-awareness
conditioning, campaign orchestration, real instrumental/audio/artwork beat
creation, DSP defaults/lifecycle, lazy Stripe initialization, subscription
authority, signed webhook handling, durable posting admission, upload/read/delete
journeys, PDF rendering, storage deletion journals and writer fencing. Focused
receipts are now complemented by the completed October 26 integrated master,
whose source-input hashes remained unchanged during execution. That run passed
the Node, Python, commerce, native, focused-browser, scoped-page, bounded-load,
operational, build, type, lint and dependency-audit scopes. It retained three
unit failures, five HTTP failures and failed coverage/evidence gates. The
[original reports](../../reports/test-verification/history/2026-10-26-integrated-before-rechecks/README.md)
remain intact while those failures are repaired and a final integrated run is
prepared. The three stale unit contracts and five HTTP failures have focused
passing rechecks; security-alert delivery now targets real administrator rows,
and public social ingestion omits empty observations. Real PostgreSQL storage
and media-job assertions also execute directly under coverage instrumentation.
These changes still need one integrated stable-source run. A passing subset
cannot substitute for the missing launch evidence.

The frozen October 27 portable release passed preparation, copied-payload cold
startup and verification before/after startup. Its credential-free, egress-denied
scope correctly retained `productionReady: false` when fresh public awareness
was unavailable. Subsequent independent review found that an old cluster-test
bundle entered the app capsule and unrelated restore scratch affected source
identity. The narrow scratch-policy correction passes focused regressions; it
requires a new versioned preparation. The prior passing and failed receipts
remain available in the [release rehearsal](release-rehearsal.md).

Four distinctions determine the path:

1. Eighty page renders establish rendering/auth observations, not every control,
   business workflow, accessibility condition or provider side effect.
2. Model-free public awareness and dedicated media rendering work without a
   trained checkpoint. Semantic generation needs an operational generation
   engine; a fresh awareness snapshot alone does not execute that engine.
3. The documented first deployment is one Reserved VM with private local
   children. Cross-worker correctness still matters there. Multiple instances
   additionally need common storage/queue authority and staging; those are
   separate capacity gates, not an implied switch to Autoscale.
4. Existing 90M harnesses execute bounded samples and project to 90M. The new
   ten-repeat numeric receipt is actual execution of 1,101 calls per repeat; it
   does not prove 90M simultaneous clients or semantic output quality.

The owner's October 27 steering raises the coverage goal to **100%**, replacing
the earlier 20% JavaScript/TypeScript floor. The target applies to lines,
statements, functions and branches. Raising a configured threshold does not
execute any new behavior or close the measured gap. The October 26 evidence
remains unchanged: 12.97% lines, 12.85% statements, 8.51% functions and 8.58% branches.
Python/native coverage and feature-contract evidence require their own measured
proof; they are not supplied by a Vitest percentage.

## Ordered work packages

Within each package, independent owned changes may run concurrently. Never run
the final integrated suite while its source inputs are changing. Preserve prior
failures; do not lower thresholds or widen assertions to count broken behavior
as success. A new finding may change this ledger only with its source, impact
and the smallest justified next action recorded.

The resumed execution order minimizes stale work:

1. Finish disjoint, bounded safety-coverage batches for hybrid storage, media
   leases and security response. In parallel, verify the existing release
   receipts and fix only demonstrated measurement, packaging or runtime defects.
   Preserve each original assertion and record the actual missing counters.
2. Freeze **all** code, configuration and test inputs. Register new test files
   before catalog generation. Confirm executable tests under `tests/coverage`
   participate in the master source digest while generated coverage reports do
   not. Resolve discovery or source-map warnings before trusting percentages.
3. Run the complete master from that snapshot. A fresh release preparation may
   run concurrently only while its admitted inputs remain unchanged and owned
   resources fit available capacity. Retain source digests and actual exit codes
   for both; reject stale evidence rather than editing manifests. The previous
   master took about 22 minutes, which is an observation, not a timeout promise.
4. Triage exact integrated failures before expanding coverage. Prioritize a
   confirmed production defect over an uncovered guard; then select the next
   uncovered successful/adverse contract by user impact and shared dependencies.
   Reuse shared real-database assertions across Node and instrumented runs.
   Independent tests may be developed concurrently, but no final sweep may run
   against changing test inputs. Do not manufacture thousands of assertion-free
   tests from the remediation inventory.
5. Reconcile the per-feature register and cross-language counters with current
   evidence. Keep unavailable deployed identity, migration/recovery, provider
   delivery and capacity gates explicit. Finish documentation and provenance
   review, commit and normally push the review branch if the main-branch launch
   condition remains unmet. Main promotion still requires the actual requested
   readiness gates, including measured 100% coverage; a push is not launch proof.

| Step | Work, exact acceptance and evidence | State |
| --- | --- | --- |
| 0 | Read actual branch/SHA/status, current runtime readiness, existing receipts and active agents. Identify source ownership and reserve migration IDs. Retain proxy/CA and never print credentials. | Complete |
| 1A | Authentication: retain atomic Redis/PDIM rate admission, production private-IP enforcement and degraded bounds. Separate attack-probe identities in the isolated HTTP fixture so intentional IP blocks cannot invalidate unrelated user-flow assertions. Require actual 429/Retry-After and decrementing authenticated billing counters. | Focused rate, paid/billing and corrected HTTP fixtures pass; integrated rerun pending |
| 1B | Hybrid storage: replace whole-index snapshots with fresh, owner-scoped per-file PostgreSQL metadata. Commit verified bytes before metadata; prevent dedup aliases from deleting another file's bytes. Import legacy metadata once without resurrecting deletions. Prove concurrent two-instance insert/read/delete and failure propagation on disposable PostgreSQL. Migration 0097. | Source complete; SQL/codec/unit/type checks and all 15 owner-isolation/file-lifecycle HTTP cases pass |
| 1C | Media jobs: persist owner/family/status/results in PostgreSQL before accepting work; use worker leases, heartbeat and conditional completion. A different worker must poll the same result; an expired worker must expose interruption and cannot overwrite a successor. Preserve real renderer contracts. Migration 0098. | Complete source;16 focused leaf cases pass |
| 1D | Fabric migration: retain both physical keys and durable progress across target copying, verified publication, source deletion and capacity accounting. Prove restart, stale-owner rejection, duplicate retry and failed I/O with real disposable SQL. Migration 0099. | Confirmed orphan/accounting defect reproduced; durable repair and interruption tests active |
| 2 | Review each patch and focused receipt independently. Run applicable types and focused Node/Vitest/HTTP checks. Reconcile schema-generated fixture SQL, check migrations on disposable databases and record backward-compatibility/rollback limits. No actual Neon migration during this step. | Initial repairs and unit/HTTP corrections pass focused checks; final narrow coverage/measurement/packaging/runtime batch under review |
| 3 | Preserve before/after provenance and ten-repeat load evidence in portable repository reports. Refresh source/test inventory, add new canonical tests to discovery, fix stale instructions and record exact tool/runtime selectors. | Source inventory refreshed; targeted and completed-master histories preserved; final instruction reconciliation pending step 9 |
| 4 | Execute the full master once from stable source: build; root/additional/coverage with the requested 100% line/statement/function/branch target; Node; Python; commerce; native subsystems; Chromium; all 21 HTTP suites; 80 pages; bounded HTTP load; operations/recovery; types/lint/audit; strict source/register/remediation gates. Preserve real exit codes, source hashes, logs and cleanup status. | October 26 run completed with failures; repaired-source rerun queued after freeze; 100% coverage is not reached |
| 5 | Triage integrated failures by root cause. Repair confirmed reachable defects first, then inaccurate fixtures/reporting. Follow the 100% coverage sequence below, adding behavior assertions rather than excluding untested code. Re-run the affected group; re-run integrated checks when changes affect shared startup/auth/schema/runtime. | Active C1 safety coverage and demonstrated integrity/runtime corrections; broad measured coverage gap remains |
| 6 | Prepare the actual configured release in a disposable publishing copy. Verify capsule/hash/restore/runtime integrity, cold start, local child supervision, health/readiness and cleanup. Never run destructive publishing scripts in the working checkout. Compare prepared source hashes with final source; rebuild stale capsules. | October 27 cold payload scope passed, production readiness false; scratch-policy and subsequent source corrections require fresh versioned preparation/cold verification |
| 7 | Verify deployed Replit identity, actual published HTTPS origin, required schema, enabled provider callbacks/webhooks and real application journeys. Perform controlled migration/deploy only after a concrete reviewed package and required production-change authorization. Do not guess an app origin from the editor URL. | External gates remain |
| 8 | Capacity gate: run the bounded source HTTP profile and report measured concurrency/latency/errors. Before multi-instance/global capacity claims, establish shared PDIM/blob/queue authority, job routing, staging, recovery and a measured realistic topology. Projection arithmetic is retained separately. | Bounded 10/20 worker profile passed 150 requests; global capacity unverified |
| 9 | Reconcile one final release matrix, page/feature evidence and remaining tasks. Verify catalog consistency, log provenance/redaction, diff/size/whitespace and latest upstream. Commit source, tests, reports and usage instructions together. Normal push only; never certify a failing release to satisfy a requested percentage. | Evidence/docs preparation active; final verdict and commit await earlier gates |

## Detailed gate checks

The [platform register](../../reports/test-verification/platform-register.json)
decomposes individual pages, controls, backend registrations and frontend API
contracts into named behavior checks with source locations and evidence links.
The [remediation inventory](../../reports/test-verification/remediation.json)
adds failure families, prerequisites, suggested implementation/test locations
and commands. These machine-readable files hold the per-feature detail without
turning thousands of unverified checks into thousands of assumed defects. Each
entry closes only with current passing evidence for its actual contract.

## Execution sequence toward 100% coverage

These are ordered batches within steps 4–5. Each batch starts from actual missing
lines/functions/branches, adds successful and adverse behavior assertions, then
rechecks the affected scope. A failed assertion is fixed before expanding the
batch. There is no automatic exclusion, fabricated hit, threshold reduction or
blanket pass for code that has not run.

| Batch | Work and smallest reviewable unit | Evidence required before moving on |
| --- | --- | --- |
| C0: establish trustworthy measurement | Run the repaired source with 100% thresholds for all four JS/TS metrics. Check every transform/source-map warning, including the corrected dormant StudioLoader import. Keep previously declared source in the denominator and preserve the earlier failed run. | Current source digest, complete instrumented-file inventory, no silently dropped source, real counters and actual threshold exit. A configuration change alone remains incomplete. |
| C1: durable safety paths | Work one repository/handler at a time: authentication and assurance; subscription/payment authority; hybrid file publication/deletion; catalog generations and shared references; media-job leases. Add missing owner/foreign-owner/anonymous, invalid input, duplicate/replay, expired/stolen lease, concurrent mutation, interrupted commit, provider/storage failure and recovery cases. Use disposable real SQL/Redis where transactions or atomicity matter. | Exact state/bytes/accounting assertions, successful real outcome, denial without mutation, one authoritative concurrent outcome, and source-linked missing branches now executed. |
| C2: API journeys | Resolve the live frontend-to-route mappings before writing each journey. Exercise create/read/update/delete, persistence after another request/worker, version conflicts, authorization, CSRF, validation, timeouts and bounded retry behavior. Cover actual enabled provider adapters through controlled contracts and separately retain live sandbox/deployed delivery gates. | Real HTTP requests through authentication and middleware; exact status/payload, persisted reads, owner isolation and side-effect receipts. Mock transport coverage does not certify provider delivery. |
| C3: routed UI behavior | Take each of the 80 declared pages and its actual mapped controls in a small batch. Exercise valid and invalid form submissions, loading/empty/success/error states, transport failure, cancellation/unmount, stale sessions, duplicate submissions, navigation and saved-data rehydration. Check accessible names, keyboard/focus behavior and the relevant role/permission states. | Actual component/browser assertions tied to the named control and API contract; source-mapped execution counters. A rendered shell or imported module is insufficient. |
| C4: remaining libraries and adapters | Cover remaining DSP controls and lifecycle boundaries, codecs, caches, data transforms, provider adapters, runtime/deployment helpers and operational error paths. Test boundary/zero/invalid values and real outputs, not merely a function returning. Treat an unused source file as uncovered until it is tested or removed through a justified source change with caller checks. | Meaningful function/branch assertions and exact output/error behavior. Native calls, provider delivery and cold runtime still need their independent acceptance evidence. |
| C5: combine compatible execution evidence | Where Node, HTTP or Chromium runs execute code outside the instrumented Vitest scope, add reproducible source-mapped coverage producers and combine only artifacts from the same current source/configuration. Preserve raw maps and counters; reject stale or unmappable evidence. | Auditable source hashes, compatible statement/function/branch maps and actual merged counters. Do not add percentages, case totals or coverage from an older file revision. |
| C6: other languages and configuration | Use the existing Python JSON/arcs to add missing Python behaviors. Add reproducible per-module Go and Rust source-coverage profiles rather than calling their passing test counts coverage. Keep missing native C++ source unverified. Verify SQL constraints/migrations, shell processes and Nix/deployment configuration with the appropriate contract/recovery checks; a JS percentage cannot measure these. | Separate language/tool/version/source profiles and gaps. No claimed cross-language 100% while a language or required source is unmeasured. |
| C7: close and rerun | Link each passing case to its feature contract, resolve unknown live-route mappings, inspect every remaining zero-hit counter and run the full stable-source master again. Verify the current packaged release and the deployed gates separately. | All requested coverage counters reach 100% with valid measurement, required feature checks have current passing evidence, and deployment/provider/recovery/capacity gates pass for their actual scope. |

The [Istanbul counters and source maps](../../reports/test-verification/coverage/coverage-final.json)
identify each statement, function and branch; the
[per-file summary](../../reports/test-verification/coverage/coverage-summary.json)
provides the measured totals. The
[Python coverage report](../../reports/test-verification/python/coverage.json)
is separate. Use these with the platform register and remediation inventory to
select the next exact missing path. Skips, blocked prerequisites and unavailable
instrumentation remain visible. Do not write a test that merely mirrors a
condition or imports a file to raise its percentage.

At the last completed measurement, the remaining JS/TS gaps to 100% were 87.03
percentage points for lines, 87.15 for statements, 91.49 for functions and 91.42
for branches. These values describe the October 26 profile, not the result of
the newly configured 100% target or an unexecuted final rerun.

For each change: inspect exact callers and failure contracts; implement the
smallest coherent behavior; test owner isolation and a successful real outcome;
test interruption/concurrency where shared state changes; inspect diff and
types; record the command, exit, timestamp, source hashes and cleanup. Do not
introduce a new provider mutation when a previous sandbox receipt already
answers the same question.

The master command uses prepared tools on PATH and the prepared Python:

```sh
python3 scripts/testing/run-all.py --python /workspace/.cloud-python/bin/python
```

See [README.md](README.md) for portable setup rather than copying these
workspace-specific tool paths. The Stripe sandbox run is separately opt-in;
its existing dedicated-test-key receipt has 28 passes, 4 provider blocks and 1 skip.
Those blocks concern the dedicated sandbox account and newly created Connect
fixture; they do not establish production-account misconfiguration. Production
Tax/Connect capabilities remain unverified. API-only proof is not deployed
checkout proof.

The current read-only Neon observation confirms the deletion-journal/ref-count
migration is absent. Prepare a writer-drain/backup/migrate/verify/rollback
runbook; do not execute a live storage migration while old writers remain.
New 0097/0098 tables likewise require deployment migration verification.

## Stop conditions and completion definition

Source work is complete only when confirmed scoped defects have fixes, their
tests pass, the requested 100% coverage target has valid supporting measurements,
integrated results are current, and the release package is
reproducible. Launch is GO only when its required deployed/provider/data/recovery
gates also pass. Global capacity is verified only for measured topology and
workload. Any unavailable deployed identity, account capability, migration,
unverified feature contract or generation engine is a named remaining gate,
never a fabricated pass. This plan adds no review-signature requirement.

The final report must list exact commits/push destination, commands, outcomes,
links to evidence and remaining gates so another session can resume without
reconstructing this conversation.

## Evidence-driven adjustments

- Independent step 1B review reproduced a second whole-index race in the underlying
  PocketDimension byte directory. New hybrid files now use verified immutable
  manifests/chunks with the existing lossless codecs; SQL metadata alone was
  insufficient. Legacy readers remain supported and their backup proof is
  explicitly historical-format only.
- Root route review found `/api/storage/file/*key` passed the metadata owner's
  identity to the reader, allowing a different authenticated caller to bypass
  ownership for hybrid keys outside `users/`. Source freeze was reopened for
  a focused real-HTTP owner/foreign-owner regression and the route correction.
  Any release prepared before this correction is stale and must be rejected
  or prepared again. This belongs to step 1B's owner-isolation acceptance condition.
- The completed master exposed stale beat/media assertions after the actual
  control and persistence changes, plus HTTP client-risk/authorization fixture
  failures. Its coverage provider also excluded dormant `StudioLoader.tsx`
  because an invalid Wouter import prevented transformation. Repairs must
  retain the real controls, owner checks and explicit-input behavior; neither
  broader accepted error statuses nor a coverage exclusion closes these tasks.
- Independent release review verified the successful cold receipt's hashes,
  then inspected the actual application capsule. It contained an old
  `.pdim-cluster-test-*` bundle; `.pdim-scratch-*` was absent from the capsule but
  incorrectly included in the source identity. One shared scratch-prefix policy
  now excludes both families from the simulation copy, release inventory and
  app member selection. Focused tests check the omission without deleting the
  original scratch and confirm that genuine runtime changes still invalidate
  identity. This demonstrated packaging defect justifies reopening the source
  freeze and repeating preparation; the earlier cold scope pass remains valid
  evidence for its recorded source, not for the corrected source.
