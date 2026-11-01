# Reviewed Python factory mount candidate

This is an outside-checkout candidate. It has not modified the repository,
canonical master, deployed service, database, provider or page acceptance map.
The current production decision remains NO-GO. Source topology is independent
of runtime readiness and behavioral acceptance.

## Concrete result

The candidate traces all 19 direct MaxCore factory declarations to their
entrypoint include: analytics 3, native analysis 5, live learning 3, media
learning 2, and Director 6. Fourteen source paths acquire a missing router or
include prefix; five already carry their full literal path. Thirteen have
unconditional finite source topology. All six Director rows retain their
optional import/None-return/try/if conditions. Every row retains
`runtimeAvailability: UNVERIFIED`.

The actual full registry generation retains 80 pages, 8,374 controls, 2,909
backend IDs, 932 frontend contracts and all 33,549 original required-check IDs.
Every original one of the 170 unknown records and mapping work IDs is retained
with identical canonical bytes. The existing 2,162 business sections and 12,972 dimensions remain
present. All 53,020 prior work IDs survive; the observed in-flight source tree
adds 5 repository-file tasks independently of this unlanded helper/test.

All 221 Python declaration IDs and all 1,287 Python required-check IDs remain
unchanged. Finite prefix enrichment uses the original declaration subject ID;
it does not substitute a new path-based identity and discard old requirements.
The original 19 mount warning records remain because live mount acceptance has
not been proved. Multiple mount contexts are explicitly retained as unknown
with the original declaration until a reviewed process identity contract exists.

The full outside generation rejects the nine configured feature links because the
parent's newly landed source changes have made the old master stale. That is
expected fail-closed behavior, not a new product assertion failure or permission
to transfer the historical PASS results. It marks all 33,549 checks unverified. The current parent acceptance map contains nine links; no stale link is promoted.
A fresh frozen master is required after landing the coherent batch.

## Patch and verification

`candidate-source.patch` changes exactly:

- `scripts/testing/platform-register.py`: scoped factory enrichment, stable
  declaration IDs and original runtime warning retention. Current JUnit/source
  provenance protections are retained from the parent's in-flight source.
- `scripts/testing/python_factory_mounts.py`: bounded AST-only direct-factory
  parser. It never imports application code, loads models or starts services.
- `tests/testing/test_python_factory_mounts.py`: 21 behavioral parser/consumer
  tests, including actual consumer AST execution and adverse ambiguity cases.

`base.json` records the exact parent source bytes used for rebasing. The full
candidate consumer is retained for review; it must never overwrite a later
parent consumer wholesale. Apply the narrow patch after `git apply --check`.

The latest actual test run passed all 21 tests without skips/failures. Its
12 source-comparison checks and 11 full-register/plan preservation checks all
passed. `validation-receipt.json`, `actual-source-comparison.json` and
`full-register-preservation.json` retain exact results and subject hashes.
`focused-tests.txt` and `registry-generation.txt` retain the corresponding logs.
The final patch passed a read-only `git apply --check` against the in-flight
parent checkout.

The framework tests cover constructor and factory aliases; lexical shadowing;
method/alias escape; reassignment/delete/with/match/named bindings;
decorated/async/generator/early/implicit-return factories; conditional imports
and None fallback; same-module/relative imports; reexport cycles and ambiguous
packages; invalid/dynamic prefixes and argument spreads; deferred and loop,
comprehension, with, match and except-star mount calls; lifecycle decorators;
Unicode paths; finite file budget; actual consumer IDs/checks/warning retention;
multiple contexts; nonliteral paths; and a source-raise sentinel proving no app
module import occurs.

The narrow contract intentionally leaves indirect factories, reexports,
computed prefixes, function/class-deferred mounts and unsupported control flow
unresolved. It also does not infer HTTP availability, auth, request behavior,
startup success, provider connectivity, generated artifact quality or a Green
page from static source.

From this candidate directory in the prepared environment:

```sh
python3 build-candidate.py
MAXBOOSTER_FACTORY_REPO_ROOT=/workspace/maxbooster7.5 \
PYTHON_FACTORY_MOUNTS_CANDIDATE=/workspace/onboarding-results/python-mount-review/python_factory_mounts.py \
PLATFORM_REGISTER_CANDIDATE=/workspace/onboarding-results/python-mount-review/platform-register.next.py \
python3 run-validation.py
PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH python3 generate-outside.py
python3 compare-full-register.py
```

After landing, the canonical command is:

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_python_factory_mounts.py
```

The master regenerates discovery and runs the same real source suite. Preserve
the historical master before replacing canonical outputs. Revert the narrow
source commit for rollback while retaining receipts; no database rollback or
external data mutation is involved.

## Review history

The unreviewed October 28 proposal was not landed. This revision adds explicit
imports, lexical binding checks, bounded analysis, mutation/escape rejection,
constructor/factory source-order checks, optional-import conditions and stable
identity/warning preservation. An early outside comparison correctly failed
three count checks because live learning uses a real `on_event` lifecycle
decorator. That registration path now has its own passing regression. A later
candidate import initially failed because its isolated directory lacked the
parent's newly added sibling JUnit helper; copying the exact helper for import
reproduced the current source successfully. The latest receipts represent the
completed revision; no earlier diagnostic run is called a product PASS.

`independent-junit-review.py` and its JSON receipt are a separate read-only
review of the other agent's shared JUnit helper: five additional checks passed.
They are not extra platform feature acceptance or unique product test counts.

## Paired helper import correction

The consumer loads the factory helper with the same explicit `importlib.util`
paired-sibling loader as its current JUnit helper. It does not require
`scripts/testing` on `sys.path`. The 21st regression launches an actual isolated
`python -I` child from a temporary directory, imports the consumer by file spec,
verifies that neither consumer nor testing directory is on `sys.path`, then
parses the real fixture through `python_routes`. The child passes and confirms
both paired helpers are loaded. The existing JUnit/source-provenance functions
remain unchanged.
