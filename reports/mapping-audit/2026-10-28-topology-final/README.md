# Verified topology repair and retained launch obligations

This October 28, 2026 cohort preserves the bounded topology implementation and its
actual integrated checks. The original [130-warning source trace](../2026-10-28/README.md)
remains historical and unchanged. No feature, page or launch gate becomes Green
from route discovery.

The exact applied [six-file patch](candidate/candidate.patch), SHA256
`bb12479dfde12508348a5d7b8a4e7373322b8f73d16ef23c23c09d98b979eb86`,
composes nested imported-router mounts, preserves aliases/process contexts,
expands bounded scope-correct literal loop templates, and stops the registry
consumer from treating an unresolved raw-path fallback as a verified mount.
Existing unique backend IDs stay stable; actual same-source URL collisions in
separate processes receive distinct IDs. This is source inventory correctness,
not assurance that handlers or user journeys work.

## Current integrated evidence

[Integration receipt](integration-receipt.json) binds the exact proposal source
hashes that matched all six actual repository files when recorded. Its source
checkpoint was still pending; later source/commit changes require separate
validation. The source-freshness evidence gate being developed alongside this
repair is explicitly outside this immutable focused result.

- [Actual Node output](integration/node.txt):38 PASS,0 FAIL,0 SKIP.
- [Actual Python output](integration/consumer.txt) and
  [JUnit](integration/consumer.junit.xml):7 PASS,0 FAIL,0 SKIP.
- [Existing parser self-test](integration/selftest.txt):PASS.
- [Actual copied-source before/after receipt](candidate/repository-scan-receipt.json):
  both commands exited0;1800 original source hashes stayed unchanged.
- [Exact route difference](candidate/repository-route-diff.json):2391→2393 audit
  rows, only4 old source/method/path/process records replaced by6 correct ones;
  two other records improve complete-mount provenance. The scanner's13 dynamic
  diagnostics remain13. All other 2387 route identities are retained.

The corrected paths are POST `/api/export/jobs/:jobId/:action`, DELETE
`/api/export/history/:id`, and GET/POST × `/api/fan-hub/consent/:token` and
`/api/fan-hub/unsubscribe/:token`. These names are static candidates; no external
request or production mutation occurred.

## Reproduce the canonical focused tests

Run from the repository root with Node 22, installed root dependencies and Python 3
with pytest. No credentials, running app or provider account are required.

```sh
node --test tests/endpoint-topology.test.mjs tests/finite-route-paths.test.mjs
python3 -m pytest tests/testing/test_endpoint_mount_resolution.py
python3 scripts/testing/platform-register.py --self-test
```

`tests/endpoint-topology.test.mjs` runs the real scanner in eight owned temporary
source fixtures. It checks the actual export/FanHub declarations, nested aliases,
separate processes, bounded cycles, unknown/shadowed expressions, unmounted
children and unknown mount prefixes. A source execution marker proves the
scanner never imports/evaluates those source fixtures. Fixtures are removed by
the test runner's owned cleanup.

`tests/finite-route-paths.test.mjs` has30 focused cases. It checks the actual
FanHub values, repeated-variable correlation, bounded nested products and
switch-local arrays; mutable/aliased/runtime arrays, writes, shadowed loop,
switch/enum/namespace/class names, deferred functions and excessive bounds stay
unresolved. Unknown alternatives are never silently truncated into a complete
path list.

`tests/testing/test_endpoint_mount_resolution.py` executes the actual registry
consumer expressions for high/medium/unknown/unmounted/missing paths and stable
or process-distinct IDs. Its seven assertions prevent a raw path or ID collision
from silently changing the inventory's meaning. `--self-test` retains the
existing parser's broader source-extraction fixture contract.

[Candidate raw files](candidate/README.md) and their
[original manifest](candidate/manifest.json) preserve the 33 selected proposal
artifacts byte-for-byte. That README describes the proposal before it was
landed; it is not the current repository status. Its exploratory scripts retain
their original absolute paths and must not be run as canonical test commands.
[Earlier helper provenance](historical-helper/provenance.json) preserves the
exact 7f19 source hash used in independent adverse review, including the nine
lexical regressions fixed before integration. The ambiguous old 18-test helper
manifest is deliberately not treated as proof. Final 38+7 actual outputs govern
this repair.

## Every prior obligation remains tracked

[Historical warning requirements](historical-warning-requirements.json) retain
all 130 original warning objects, mapping IDs and `/resolve` work IDs, with
root causes, required fixes, dependencies and acceptance criteria. They bind the
original a160 master/cb trace inputs; they are not regenerated against newer
code. [Mapping preservation](mapping-preservation.json) independently checks
all 130 IDs and warning objects remain unchanged in the new 170-warning registry.
It also records all 40 newly exposed unresolved mounts and explicit next
acceptance. The consumer correction makes those gaps visible rather than
pretending they are mounted endpoints.

[Backend/check identity relationships](candidate/backend-id-remap.json) map all 4
old backend IDs to 6 replacements and all 24 old required checks to 35 concrete
checks. Every old requirement persists on each relevant new action/path; no old
PASS transfers. The two hand-authored pagework supplements have 0 references to
those four replaced IDs, so this exact batch requires 0 hand edits. Their 80 page
IDs and 2162 section IDs are retained with source-file hashes. Generated global
route/check work must follow these relations when reindexed.

The selected registry observation contains 80 page declarations, 2909 backend
registrations, 33549 required checks and 170 unresolved mappings. All33549 checks
were unverified at capture; six previous source-bound links were stale. Separate
current-source verification must resolve those links honestly. This cohort is
not a complete master run, current coverage result, runtime integration
certificate or launch approval.

## Remaining critical work and limits

The seven original source-batch deliverables remain in the linked historical
plan. Mount contexts and the FanHub finite loop now have bounded implementation
proof; middleware classification, other arrays/shared registration helpers,
distribution helper specialization, Python factory/conditional mounts,
legacy-source admission/retirement and full cross-process joins remain open.
All130 original mapping obligations and the 40 exposed mounts require their own
resolution. Runtime behavior, authorization, durability, provider delivery,
accessibility and global capacity are separate acceptance work.

Existing regex import/receiver scope limits, mixed routers in one file,
conditional/deferred registration and absolute-looking relative router paths
remain unverified. Graph depth is bounded at 13; alias breadth still needs an
explicit global resource budget. Escaped literal interpolation can conservatively
remain unresolved. Neither limitation is excluded from the production plan.
Rollback restores the prior discovery code while retaining these historical
receipts and all obligations; it cannot turn an inventory failure into launch
approval or lower the 100% coverage target.

## Cohort integrity

```sh
python3 reports/mapping-audit/2026-10-28-topology-final/validate-cohort.py
```

The report-only validator checks immutable artifact hashes, original 130 warning
IDs, all 40 new unresolved mount obligations, exact ID/check relations, all 80 page
identities/all 2162 section identities and focused result counts. It reads source
metadata and reports only; no app or provider runs. The
[validation receipt](validation.json) and [complete manifest](manifest.json)
record these report-integrity checks separately from product tests.
