# October 27 focused hardening evidence

This directory preserves separate focused rechecks after the failed October 26
integrated master. It is not an integrated master run, a production launch
certificate or a claim of global 100% coverage. Production source, test scopes
and times differ between the retained runs. Do not sum duplicate cases or merge
these coverage profiles into a global percentage.

[artifact-manifest.json](artifact-manifest.json) maps each byte-identical artifact
to its original executor path, copy time, size and SHA-256. Once copied, an artifact
retains its bytes even if an executor output path is later reused; a later result
needs a new archived source identity. Retained receipt commands still
use their original workspace output paths; use the manifest to locate their
portable copies. [validation.json](validation.json) records parsed JSON/XML,
actual JUnit leaf counts and credential-scan counts without secret values.
[Receipt-log validation](receipt-log-validation.json) independently compares
retained receipt log hashes and the Studio producer artifact hashes.
[SHA256SUMS](SHA256SUMS) verifies this archive, including its manifest and README.

| Evidence | Actual result and limit |
| --- | --- |
| [Initial critical shared contracts](critical-coverage-source-receipt.json) | 24 instrumented assertions passed; the original 90 assertion calls and leaf labels were preserved by the shared-helper refactor. Six-file coverage was 78.99% lines, 71.74% statements, 66.66% functions and 67.76% branches. The configured 100% thresholds failed. The later hybrid/media profiles below supersede this measurement for their own scopes. |
| [Final hybrid contracts](hybrid-coverage-closure-final/source-receipt.json) | Node 22 leaf cases and instrumented Vitest 29 cases passed. Three-file coverage: 98.55% lines, 98.51% statements, 94.11% functions and 97.62% branches. `HybridStorageRepository.ts` reached 100% for all four metrics. The run retains exit 1 for the unmet aggregate 100% target; the receipt identifies remaining guards and default transport callbacks. |
| [Reviewed media contracts](media-coverage-reviewed/receipt.json) | Node 21/21 and instrumented Vitest 21/21 passed. The media job repository, poll/scene handlers and staged-upload cleanup reached 100% for all four metrics: 81/81 lines, 110/110 statements, 25/25 functions and 110/110 branches. This is three named files, not the whole platform or deployed provider delivery. |
| [Security behavior baseline and first closure](security-coverage-closure-receipt.json) | Baseline 29 and expanded 46 unit cases passed. The named engine improved from 92.51% to 98.93% lines, 91.5% to 97.75% statements, 92.59% to 100% functions and 77.35% to 88.67% branches. The final command retains exit 1 for the unmet 100% thresholds; remaining counters are recorded. |
| [Normalized threat-history regression](security-history-regression-receipt.json) | A new selected public-behavior regression failed before the fix (1 failed; 46 unselected skips) because scores clamped to 0–1 were compared with 80. After changing the threshold to 0.8, the full 47-case suite passed. Latest named-engine coverage is 98.93% lines, 98% statements, 100% functions and 89.05% branches; exit 1 still records unmet 100% coverage thresholds. This is a later production-source revision than the 46-case profile. |
| [Actual PostgreSQL admin alert delivery](security-alert-recipients-source-receipt.json) | Four real disposable-PostgreSQL cases and the earlier 29-unit recheck passed. The production engine inserts notifications for actual admin IDs, handles no admins and delivery faults, and retains owner/FK authority. No production data or external notification service was used. |
| [Tightened HTTP rechecks](http-final-tightened/source-receipt.json) | Two source-application suites: 61 passed, 3 skipped, 0 failed. Authenticated positive contracts require exact 200 and response shapes. Admin 403, auth 401 and unsupported analytics-prediction 503 remain explicit. Disposable database/app logs are retained; no configured application credentials were forwarded. |
| [Repaired unit contracts](final-unit-contract-rechecks.xml) | 18 assertions passed after aligning beat controls, mounting actual route registrations and fixing the dormant StudioLoader import. Later StudioLoader behavior work is a separate source revision and receipt. |
| [Public-awareness focused fixtures](public-social-contract-recheck/results.json) | Engine 26 top-level cases; sources 20 top-level cases plus 9 passing subtests. The runner reports 55 units in total; the XML contains 46 distinct top-level `<testcase>` elements. No live ingestion, model quality, public snapshot publication or production capacity is established by these isolated fixtures. Separate live feed evidence is retained under `reports/live-awareness-acceptance/2026-10-27`. |
| [Release scratch-copy filter](release-scratch-filter/results.json) | Three Vitest and two Node cases passed, with lint passing. This verifies the named copy/filter contracts; it does not establish a Replit Nix image or cold production deployment. |
| [Fabric migration journal and stale-publication fencing](fabric-migration-final/receipt.json) | Fifteen real PostgreSQL/filesystem/canonical-PDIM Node leaf cases passed, with server types and lint passing; the separate canonical-owner unit recheck has seven passing cases. This cohort predates the later corrupt-target key-rotation decision and does not claim that recovery path, a deployed migration or global capacity. Migration 0099 and exact source hashes are identified in the receipt. |
| [Fabric corrupt-target key rotation](fabric-migration-rotation-final/receipt.json) | Seventeen real Node leaf cases and seven canonical-owner unit cases passed, with lint and server types passing. This later source cohort verifies fresh-process recovery from a corrupt immutable target and SQL/key-rotation rollback. It predates the separately identified target-loss-before-source-cleanup guard; its passing cases do not certify that later failure boundary. The prior 15-case cohort remains unchanged. |
| [Master evidence framework](master-integrity-recheck/receipt.json) | 12 Python framework cases passed, covering source identity, coverage parse exclusions, case retention and strict remediation reporting. These are framework checks, not platform feature cases. |
| [StudioLoader actual browser behavior and validated counters](studio-loader-final-receipt.json) | One comprehensive browser case passed on Node 22.23.3 and Chromium 154, exercising loading/success, critical and degraded errors, retry, creation/invalidation, navigation, actual reload and unmount. The dormant wrapper/HOC reached 100% lines/statements/functions and 98.57% branches (69/70); its fixed-five-key fallback remains uncovered. This profile is not merged into global Vitest coverage. The receipt validates executed bundle/source-map hashes and records every artifact hash. It is not proof of an active routed page or provider/backend delivery. |
| [Query v5 callback audit](query-v5-callback-audit.json) | An audit found four obsolete query callbacks in StudioLoader before its behavior repair. The audit explicitly does not resolve wrapper/spread options. The final browser receipt above verifies the repaired wrapper; preserve this audit as a pre-fix finding, not a current defect verdict. |

The Studio history distinguishes two actual component failures from collector
and harness failures. [Its final receipt](studio-loader-final-receipt.json)
labels each retained failed XML/log. The earlier unvalidated browser profile was
invalid because missing UTF-8 response encoding shifted source positions; its
[diagnosis](studio-loader-browser-coverage-before-charset/invalid-profile.json)
records the offset drift. Its percentages are not a valid baseline. The final
producer uses explicit UTF-8, checks actual `Debugger.getScriptSource` bytes,
verifies original source-map contents and combines only non-overlapping counter
snapshots from byte-identical executed bundles. Its complete final bundle, source
map, raw snapshots, converted maps and provenance are retained; the invalid old
4MB duplicate is deliberately omitted.

These scoped profiles retain raw Istanbul statement/function/branch maps and hit
counters. Threshold errors are real failing exits even when all assertions pass.
No configured threshold was lowered to produce this archive. The old integrated
failures remain in
[the October 26 archive](../2026-10-26-integrated-before-rechecks/README.md).
The final canonical master, release preparation and cold-start results are
managed separately and must be reconciled against their own source identities.

To verify portability, run `sha256sum -c SHA256SUMS` from this directory. To rerun
a scope, use its retained command with the tool setup in
[the testing instructions](../../../../docs/testing/README.md), updating only
workspace-specific output paths. PostgreSQL contracts must use the documented
owned disposable fixture, not an application's configured database.
