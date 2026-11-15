# Endpoint topology repair candidate

This proposal is outside `/workspace/maxbooster7.5`. It changes no repository source,
configuration, canonical registry, page plan, result or branch. Apply only after
review. The patch targets two existing scripts and adds one helper plus three
portable test files:

- `scripts/audit-endpoints.mjs`
- `scripts/lib/finite-route-paths.mjs`
- `scripts/testing/platform-register.py`
- `tests/endpoint-topology.test.mjs`
- `tests/finite-route-paths.test.mjs`
- `tests/testing/test_endpoint_mount_resolution.py`

The existing scanner treated every imported `router.use` prefix as a root mount,
so `export.ts -> durableExports.ts` lost `/api/export`. It treated interpolated
backticks as literals, so two FanHub methods were reported at `${action}`.
The candidate composes relative import mount edges from existing root contexts,
retains each distinct prefix/process, bounds cycles explicitly, and expands only
source-proven finite literal loop values. It never imports/evaluates application
source. An actual source fixture writes a marker on execution; no marker appears.
Unknown template routes/prefixes remain diagnostics. Unmounted handlers remain in
the inventory and the real Python registry consumer now preserves their unresolved
status instead of treating a nonempty fallback path as a verified mount.

Existing backend IDs remain byte-for-byte compatible except actual identical
source/method/URL declarations mounted into different application processes; only
those collisions gain process-qualified identities. A permanent case executes the
actual consumer's ID expression for both process scopes. Mounted-router output
retains legacy `prefix` and additionally lists all finite contexts.

## Actual checks

Node22.23.3, TypeScript5.9.3 and Python3.12.14/pytest9.1.1 were used.

- `node-before-final.txt`: current original scanner plus final pure helper,
  30PASS/8FAIL. All eight real scanner fixtures fail on the original scanner.
- `finite-before-lexical.txt`: the earlier helper, 21PASS/9FAIL for the same30
  helper requirements. Independent `finite-review/` VM receipts prove real
  shadowed values differed from the proposed inferred outer values. Final
  scope guards reject classic for/for-in, switch/enum/namespace/class-expression
  names and destructuring writes; named array lookup also respects these scopes.
- `node-final.txt`: final candidate, **38PASS/0FAIL/0SKIP**. Eight full CLI fixtures
  cover both actual source examples, nested aliases, separate processes, cycles,
  unknown/shadowed dynamic paths, unmounted children and unknown mount prefixes.
  Thirty helper cases cover actual FanHub, correlated variables, bounded nested
  products, mutable/aliased/runtime arrays, lexical shadowing, writes, deferred
  functions, path/product bounds and switch-local arrays.
- `consumer-final.xml`/`.txt`: **7PASS/0FAIL/0SKIP** executing actual registry
  ingestion expressions for high/medium/unknown/unmounted/missing paths, stable
  unique IDs and distinct same-source process identities.
- `platform-self-test-final.txt`: existing parser self-test PASS.
- `patch-check.txt`: `git apply --check candidate.patch` exit0.

The final tests run from the repository root after landing:

```sh
node --test tests/endpoint-topology.test.mjs tests/finite-route-paths.test.mjs
python3 -m pytest tests/testing/test_endpoint_mount_resolution.py
python3 scripts/testing/platform-register.py --self-test
```

To test this outside candidate before landing, use absolute test paths and set
`ENDPOINT_AUDIT_CANDIDATE` to this candidate's scanner. The portable tests default
to repository scripts when that optional preflight override is absent.

## Full actual copied-source result and requirement preservation

`repository-scan.py` copied **1800** current server/client source files to an owned
fixture. Both original and final scanner ran `--static` with exit0,17seconds each,
no app startup or network. All1800 original source hashes remained unchanged.
`repository-before.json`, `repository-after.json`, the source inventory and real
command/time receipt retain the proof. Exactly **4old rows become6concrete rows**:

- POST `/jobs/:jobId/:action` becomes `/api/export/jobs/:jobId/:action`.
- DELETE `/history/:id` becomes `/api/export/history/:id`.
- GET/POST `/api/fan-hub/${action}/:token` each expand to consent and unsubscribe.

Backend audit rows2391→2393. The other2387 source/method/path/process identities
are unchanged; two rows gain stronger complete-mount provenance. No duplicate
source/method/path/process tuples exist. The scanner's13 unresolved diagnostics
remain13.

`backend-id-remap.json` records all4 old backend IDs, their6 replacements, and
all24 old required-check IDs expanding to35 new exact requirements. This relation
preserves every old obligation without transferring a historical PASS. BOTH
80-page work supplements contain **0references** to these4 IDs. Their80 page IDs
and2162 section IDs are retained explicitly with file hashes. No hand-authored
pagework edit is needed for this exact candidate. Generated registry, global work
items, backend reference indexes and plans must be regenerated after landing and
checked against this relation; retain all old130 mapping-resolution obligations.

The corrected consumer exposes **40previously masked unresolved main-router
mounts**. Expect130→170 total warnings when reindexed, not a claim that40 new
runtime bugs were introduced. The original130 mappings, conditional Python mounts,
dormant files and middleware ambiguity remain required work. No feature check or
page is closed by static topology. New helper/test files must be staged before
catalog/inventory generation. Refresh source-bound acceptance links only after
actual current-source case execution; never bless them from this scan.

## Limits and preserved earlier receipts

This is a bounded repair, not a replacement for the full route parser or runtime
admission proof. Existing regex import/receiver binding limitations, mixed routers
in a file, conditional/deferred app registration and absolute-looking relative
router paths remain unverified and require exact source/runtime tracing. Finite
path resolution returns candidate source alternatives, not assurance every
conditional branch registered at runtime or that handlers succeed. Alias and
process fixtures prevent a regression in this repair; they do not certify global
routing, authentication, data integrity, accessibility or deployment.

Earlier candidate logs and `build-candidate.py` are retained exploratory history,
not the final reconstruction command. `candidate.patch` and its six matching
source files are the delivery. The older `finite/manifest.json` has a source-size
fingerprint mismatch against its retained helper copy and is not accepted as
current proof; the independently recorded VM failures and the final38+7 outputs
are the evidence for this proposal. Do not reinterpret old PASS receipts as
proof of the corrected lexical cases. `manifest.json` binds the selected final
artifacts and explicitly does not include the temporary copied source tree or
ambiguous old helper manifest.

Production readiness remains false. No migration, payment/provider write, deployment,
coverage merge, source exclusion, signature requirement or threshold change occurs.

Independent final patch review found no blocking defect and separately reran38
Node cases with38PASS/0FAIL/0SKIP. It identified two retained limitations:
mount graph depth is bounded at13 while alias breadth lacks a global context
budget, and escaped literal interpolation can conservatively remain unresolved.
Both need explicit future inventory-resource/parser work; neither is credited as
closed by this candidate or silently omitted from the launch scope.
