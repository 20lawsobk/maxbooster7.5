# Exhaustive launch audit and 80-page status matrix

This extends the existing platform plan and its exact identities. It does not
restart or replace any page, section, backend, source-coverage or shared lane.
The current [matrix](../../reports/launch-readiness/current/matrix.md) contains
all 80 route declarations, including aliases. Machine-readable
[status](../../reports/launch-readiness/current/status.json),
[features](../../reports/launch-readiness/current/features.json),
[gaps](../../reports/launch-readiness/current/gaps.json),
[seven-level roadmap](../../reports/launch-readiness/current/roadmap.json) and
[dependencies](../../reports/launch-readiness/current/dependencies.json) preserve
the detail behind every row.

The canonical inventory currently contains 2,162 business sections, 12,972 section
dimension steps and 52,965 existing work items after the latest source additions.
These are snapshot denominators;
regeneration reports the actual counts and rejects missing identities. The
[governing critical path](launch-critical-path.md),
[execution plan](completion-execution-plan.md),
[all-page schedule](platform-work-schedule.md) and
[original full plan](platform-completion-plan.md) remain authoritative for
execution order. This audit adds explicit launch decisions and acceptance
criteria without removing their work.

## Reproduce the audit

From the repository root, after the canonical register and plan are generated:

```sh
python3 scripts/testing/launch-readiness-audit.py
```

The command reads the actual platform register, exhaustive plan, current source
bytes and path sets. It writes only `reports/launch-readiness/current/`. Exit 0
means the report was produced, not that launch is approved. For a launch gate:

```sh
python3 scripts/testing/launch-readiness-audit.py --require-green
```

That command returns 1 until all 80 pages and all global prerequisites actually
pass. An invalid/incomplete inventory raises an error; it is not converted into
an empty successful report. Use `--output /new/evidence/path` to preserve a
versioned run. `--register` and `--plan` select already generated matching
inventories; their identities and digest must agree.

Run the meaningful gate/provenance regressions:

```sh
python3 -m pytest tests/testing/test_launch_readiness_audit.py -q
```

The canonical Python test runner discovers the new file after catalog refresh:

```sh
python3 scripts/testing/run-python-suites.py \
  --file tests/testing/test_launch_readiness_audit.py \
  --output /new/owned/launch-audit-test-run
```

These tests prove fail-closed reporting behavior, not product feature acceptance.
They include all 80 aliases sharing one component; missing/duplicate identities;
lost checks/shared work/section dimensions; empty, skipped, failed and stale
evidence; unchanged source with a changed test; SQL/test full-manifest drift;
exact registered-case classification; the complete reachable Green conjunction;
and an unowned/unrouted backend or API consumer remaining open despite every
page-level criterion passing. No application/provider/database mutation occurs.

## Completion and color semantics

`implementationCompletionPercent` is null until complete verified production
acceptance. Source presence does not establish an implementation percentage.
`verifiedAcceptanceCoveragePercent` counts only exact current passing registered
checks divided by all applicable page/control/backend registered checks. A page
can have 100% of that narrow metric and still fail section, accessibility,
coverage, integration, deployment or other launch gates.

The launch score counts eight complete independently verified domains. It is a
measurement of supplied acceptance evidence, not a probability or estimated
fraction of implementation. All 34 criterion instances per page remain explicit;
2,720 instances across 80 pages are not interchangeable. A majority score never
overrides a missing criterion.

- **Green:** current source and test/artifact provenance; every exact associated
  check; every exact page/control/API/backend work item; all six dimensions of
  every named section; all 34 page criteria; all global source, coverage,
  unresolved, shared and unrouted work; and every cross-platform prerequisite
  pass. Evidence is retained with the designation.
- **Yellow:** page-level acceptance remains incomplete while no known global
  prerequisite, source drift, failed gate or unresolved binding forces Red.
  Yellow grants no launch approval.
- **Red:** stale/mismatched source/evidence, a failed gate, unresolved binding or
  any open cross-platform/global prerequisite blocks launch. The current report
  is Red; report creation does not grant approval.

`SOURCE_PRESENT_UNVERIFIED` means a named source section exists and its complete
behavior remains unverified. It does not mean the feature is missing. Each
feature retains exact source locations, controls and API/backend candidate IDs.
Section dimension acceptance is measured separately. Implemented, partially
implemented and missing behavior must be classified from actual reproduced
contracts and their current passing/adverse evidence. Unknown work remains
unknown instead of inventing a missing feature or an implemented percentage.

The retained focused cohorts document bounded completed work, including
[owned account statistics](account-analytics.md),
[monitoring transport/acceptance](monitoring-alerts.md),
[joint SQL/PDIM recovery](current-storage-joint-recovery.md),
[required-awareness outage classification](../../reports/awareness-dependency-acceptance/2026-10-27/README.md),
[authoritative Python assertion oracles](test-oracle-review.md),
[runtime-upload isolation](../../reports/release-rehearsal/2026-10-27-runtime-upload-isolation/README.md),
[dependency hardening](dev-dependency-advisory-plan.md),
[SendGrid SDK replacement](deepmerge-advisory-plan.md),
[shared navigation accessibility](accessibility-launch-audit.md) and
[actual ASAR module loading](electron-asar-module-acceptance.md).
Their source hashes, actual exits and limitations must be consulted; an earlier
bounded pass is not a current complete page or global launch certificate.

## Explicit production validation

Every page's `criteria` array records `passIf`, `failIf`, required method and
exact evidence for each item below. Every named business section points to
those criteria and retains its own six exact work dimensions. A failed,
skipped, blocked, missing or stale required observation fails acceptance;
non-applicability requires traced source/behavior proof, never an empty array.

| Domain | Independent required validation |
| --- | --- |
| Frontend | Exact controls and handler effects; responsive layouts/zoom; loading/empty/success/reload/cancel state; actionable actual errors/retry; declared-device/network performance budget; all supported localization/RTL/date/number/currency behavior. |
| Backend | Exact mounted API contracts; real schema/source-of-truth reads/writes; session lifecycle; owner/foreign-owner/workspace/role/subscription/admin authorization; durable/replay/concurrent/delete/recovery integrity; malformed/excessive/missing inputs and outages before side effects. |
| Integration | Real browser-to-handler outcomes and reload; actual worker/provider/payment workflow terminal state and receipts; owner-scoped live updates/reconnect/cancel; bounded failure/restart/replay recovery. |
| Database | Required actual target schema/index/constraint and compatible writers; fresh-owner consistent SQL/PDIM/blob/job restore plus actual deployed backup/RTO/RPO/offsite proof. |
| AI | Actual capability routing and truthful dependency readiness; fresh permitted public awareness provenance with private account data excluded from public learning; real requested text/image/audio/video/statistical output contracts and complete ownership/delivery/failure lifecycle. |
| QA | Every exact functional check; canonical regression and authoritative oracles/cleanup; every section's successful/adverse E2E journey; measured realistic deployment load budgets; applicable security/supply-chain/secret tests; actual requested 100% line/statement/function/branch coverage with source-map provenance and explicit other-language counters. |
| Accessibility | WCAG 2.2 A/AA automated checks; actual keyboard/focus/dialog review; actual documented browser/screen-reader review; measured contrast/reflow/zoom/target size/motion and applicable captions/transcripts/media alternatives. Automated checks alone cannot establish compliance. |
| Deployment | Actual published HTTPS origin/release/callback/private-child identity; current prepared artifact integrity/cold startup/readiness/supervision/cleanup; actual monitoring/delivery/recovery/rollback/capacity/provider operational evidence. |

Full accessibility requirements and all 80 route rows are retained in the
[accessibility launch audit](accessibility-launch-audit.md). The matrix does not
assign compliance from nine shared-navigation assertions or a render.

## Exact evidence and source provenance

An optional `--criterion-evidence /path/to/map.json` accepts the canonical map
shape, `{ "checks": [...] }`. Each row names an exact `checkId`, the actual
`platformSourceDigest`, and either one exact case identity or a conjunctive
`cases` bundle. Each identity includes `testFile`, `testSha256`, `caseName` and
`group`. It is resolved against actual passing canonical cases and the current
test inventory; support files, duplicate claims, changed test bytes, skips and
missing case identities are rejected. A status string or source association
cannot supply a pass. This is automated evidence linking; it introduces no
review-signature requirement.

Supported IDs are exact existing work-item IDs, exact existing section
work-step IDs, `page-id/domain/criterion`, and `platform/prerequisite-id` from
the generated global requirements. Page-level proofs cannot close an omitted
section, a shared/source coverage task or an unrouted API. The test's actual
assertions and execution method must substantiate the mapped criterion; a map
is not a way to substitute an unrelated passing assertion for manual
screen-reader, native-device, provider-delivery or global-load evidence.

Source freshness checks both the platform producer's exact suffix/path policy
and the exhaustive plan's full repository manifest. This includes SQL, C++,
requirements and tests omitted from the narrower platform digest. It also
checks digest consistency, input artifact hashes and current bytes of every
previously linked passing test. Missing/new paths are drift. Historical cases
remain visible but contribute zero current verified acceptance after drift.

The actual completed master receipt must also bind the current
`common.source_inputs()` file map and digest, report unchanged inputs, and
select every required group. Passing the master command gate requires the
producer's real `executed_groups_passed` status, a successful catalog, all
required groups actually represented, all five postprocessing steps and every
command passing without timeout or coverage parse exclusions. The producer
intentionally leaves `allTestsPassed` null after an executed-group pass because
excluded scopes are not inferred to pass. This audit preserves that meaning;
it never requires an impossible `allTestsPassed: true` or equates that nullable
field with the complete global launch decision. Regenerating a source
inventory cannot promote old case results into a current execution.

`dependencies.json` retains every discovered exact declaring manifest/lockfile,
runtime prerequisites and the limits of static declarations. Per-page source,
frontend request, mounted backend and candidate AI/database dependencies remain
in `status.json`; shared prerequisites do not masquerade as each page's direct
dependency. Dynamic mappings remain explicit unresolved work.

`gaps.json` retains root cause, affected systems, fixes, prerequisite IDs/order,
risk, validation and production acceptance for every existing work item and
observed cross-platform blocker. Unknown risk is explicitly unassessed rather
than a fabricated severity. The fresh
[Neon metadata observation](../../reports/deployment-observations/2026-10-28/README.md)
is a confirmed target schema dependency; it does not authorize blind DDL.
No tooling can establish the absence of all hidden runtime dependencies from
source scanning alone. Unresolved discovery, manual, target and provider work
remains tracked and blocks Green.
