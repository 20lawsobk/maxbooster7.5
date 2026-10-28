# Exact feature-evidence link review

This review identifies six narrow access-policy checks that exact HTTP
assertions can establish. All six linked successfully through eight distinct
passing cases in the October 27 master with unchanged source/configuration/test
inputs SHA-256
`8cad7cae3ab4895c19ba78fba1b7ff5d9670c16a2a4fea7008a3e7631180c6be`.
That run used the then-uncommitted source above checkpoint `c06fbecd`, with
platform-source digest
`4415d58fb1b71328c1d44b5453d1c7e34da5d82cd87b8720c8239483d6e7e476`;
the common input digest and platform-source digest describe different scopes.
Its [preserved evidence](../../reports/test-verification/history/2026-10-27-before-awareness-release-isolation/README.md)
retains the full case results, register and exact inputs. This establishes only
those checks at that snapshot, not whole endpoints, pages or launch readiness.

Subsequent production and verification changes make that result historical.
The current source checkpoint is `10d192675beefcf1b7beef3ce47c271db0cc17cf`;
its integrated master completed09:30:12–09:53:54 America/Detroit on October28
with unchanged common digest
`cbf794e080119fa4f64ec6ebce2b29b3d78641d606a3059c0c207b2420324418`.
All eight exact current HTTP cases qualified, establishing the six reviewed
checks with zero invalid links. This closes no complete endpoint, page or launch
gate. Future changed source must execute the exact cases again. Refreshing a candidate map's
`platformSourceDigest` does not transfer an earlier result to later source.
A passing test name, import, page render or source association never supplies
missing assertions. The [source-binding repair receipt](../../reports/platform-evidence/2026-10-28-source-binding-final/README.md)
preserves the demonstrated false pass and final 133 passing focused regressions.
That focused result tests evidence machinery and grants no feature or page Green.

## Conjunctive evidence format

`scripts/testing/platform-register.py` preserves the existing single-case link
format and also accepts an explicit bundle:

```json
{
  "checks": [{
    "checkId": "the-exact-generated-check-id",
    "platformSourceDigest": "the-current-complete-platform-source-digest",
    "cases": [{
      "testFile": "tests/the-actual-test.ts",
      "testSha256": "sha256-of-that-current-file",
      "caseName": "the-exact-case-results-name",
      "group": "http"
    }]
  }]
}
```

Every unique case is required. Any missing, skipped, failed, stale, changed or
unregistered member rejects the entire bundle. Mixed legacy/bundle identities
and duplicate case identities are rejected. The validator does not create
bundles from static associations or decide whether assertions satisfy a check;
that semantic review still applies to every explicit link. Source/test hashes
must match and the exact case must appear in current passing results bound to
its actual execution, as described below.

## Current execution is required

`collect_current_passing_cases` first matches the complete common source-input
file/hash map and calculated digest to both the current repository and the
master's actual unchanged-input ledger. Each qualifying leaf must then belong
to a selected, uniquely recorded command with valid start/duration, owned raw
artifacts, exact command-log hash and current artifact timestamps. Normal final
postprocessing fields do not change the stable execution binding.

The raw producer must prove the exact unique passing identity. XML failures,
errors, skips and duplicate identities are rejected. Python/commerce default-file
reports require the matching successful per-file producer and command; Python
also requires the file's current source hash. A JSON case label alone is not
evidence. Node requires one actual successful execution of its exact file and
unique passing TAP names; duplicate executions reject that file even if either
run passed. Aggregate browser TAP cannot attribute a case to several possible
files; supported proof needs an unambiguous exact file/command/case binding.
Malformed timing/results, booleans as exit codes, stale logs, changed hashes,
unselected groups and ambiguous identities cannot supply a passing leaf.

A distinct failed coverage threshold does not erase a valid passing leaf. Leaf
qualification still closes only the exact reviewed check; the full master,
100% source coverage, complete pages and launch approval have separate gates.
The [historical schema diagnostic](../../reports/platform-evidence/2026-10-28-historical-compatibility/README.md)
accepted the eight old HTTP identities only with explicitly injected old-source
context and returned zero with real current inputs. Never use that diagnostic
injection to claim current readiness.

Run the focused validator and existing plan regressions with the prepared
Python interpreter:

```sh
python -m pytest -q tests/testing/test_platform_evidence.py \
  tests/testing/test_endpoint_mount_resolution.py \
  tests/testing/test_launch_readiness_audit.py tests/testing/test_platform_plan.py
python scripts/testing/platform-register.py --self-test
```

The final focused run passed 133 cases: 77 evidence, seven mount-consumer,
42 launch-audit and seven plan regressions, with no failures/errors/skips.
The retained original main-linker reproduction fails once because old execution
was wrongly accepted after refreshing an editable candidate digest. The three
original duplicate-file reproductions also fail before their repair. Actual
credential-free temporary Node/Python executions exercise the repaired gate;
conjunctive format tests retain legacy compatibility and reject stale, malformed
and ambiguous proof. These are evidence-system regressions, not product feature
or application readiness proof. Use a fresh output directory and retain actual
command, exit, logs/XML and source hashes as instructed in the cohort README.

## Reviewed links requiring current frozen-source evidence

All rows below use group `http` and file `tests/health.test.ts`. Its `get` helper
performs a real fetch without a Cookie, authorization header or cookie jar.
The named endpoints deliberately expose public operational state. Their public
policy has no denied role, so unauthorized rejection is inapplicable to this
specific access-policy check. This does not establish response schemas,
readiness recovery, capacity, authentication elsewhere or full endpoint closure.

| Exact check ID | Exact method/path and declaration | Exact passing case name |
| --- | --- | --- |
| `api-7f174c69ff83279c/access-policy` | `GET /api/health`, `server/routes.ts:7989` | `Liveness and Readiness Endpoints > GET /api/health returns 200` |
| `api-2153be5bc8e5692b/access-policy` | `GET /health`, `server/startup-probes.ts:430` | `Liveness and Readiness Endpoints > GET /health returns 200` |
| `api-50167c08abd2dfe2/access-policy` | `GET /api/ping`, `server/startup-probes.ts:421` | `Liveness and Readiness Endpoints > GET /api/ping returns ok:true` |
| `api-059a423751b44e6c/access-policy` | `GET /ready`, `server/startup-probes.ts:503` | `Liveness and Readiness Endpoints > GET /ready reflects the actual admitted dependency set` |
| `api-ebf54287f664010e/access-policy` | `GET /readyz`, `server/startup-probes.ts:514` | `Liveness and Readiness Endpoints > GET /readyz uses the same truthful readiness contract` |

The readiness cases assert the fixture's truthful 503 dependency state; that
response is a successful observation of public probe access, not a ready=200
claim. Do not map either case to `readiness-truth`: recovery after real
capability admission is not exercised in this sealed fixture.

The sixth reviewed link is the conjunctive policy proof
`api-ef05357bba6ab833/access-policy` for the real `GET /api/auth/me` declaration
in `server/routes.ts:278`. Its complete bundle requires all three exact
identities below. They passed in the preserved master and must pass together
again against the next frozen source:

- `tests/auth-flows.test.ts`, `Full Auth Flow > 4. GET /api/auth/me returns user when authenticated`: checks the fixture's own email and excludes its password.
- `tests/auth-flows.test.ts`, `Full Auth Flow > 10. /api/auth/me returns null or 401 after logout`: clears cookies and requires a null body when status is 200.
- `tests/api-guards.test.ts`, `Unauthenticated route guards > GET /api/auth/me → 200 (public, returns null)`: performs an independent cookie-free fetch and requires public 200. This case alone does not inspect its body despite its title.

The startup declaration `api-1279b72cbeaf739c` in `server/index.ts:396` is a
different handler. It returns a boot-phase object before routes load and calls
`next()` afterwards. These post-startup cases do not close that handler's
requirements. Keep both declarations distinct.

## Rejected partial proofs

- `tests/billing-lifecycle.test.ts` case 11 says the plan list is fetched
  "without auth", but its `api()` helper sends `authCookies`, which case 10
  restores. The title is not anonymous-access proof.
- The file-management hybrid isolation case verifies actual owned bytes and a
  different authenticated user's read denial on two download paths. It does
  not test anonymous access or foreign writes. It cannot close all ownership,
  access, durability, input, dependency-failure or artifact requirements.
- File upload, download, delete, 404 and restore assertions are meaningful
  lifecycle evidence, but they omit the full interrupted-cleanup, concurrent
  retry, rollback and shared-reference conditions in the corresponding broad
  durability templates. Do not turn their union into complete durability proof.
- Quota and subscription cases separately establish an authenticated shape and
  anonymous rejection status. Their denial assertions do not inspect the body
  for protected data; do not mark the whole access-policy wording satisfied
  merely because a response is 401/403.
- Authentication guard cases that permit 404 or return before actual route
  authorization do not establish that the intended endpoint exists or that its
  own authorization handler ran. An absent endpoint is not a passing guard.
- OAuth invalid-state cases do not establish the complete signed callback,
  successful exchange, nonce, replay and stored-state requirement. Stripe
  signature/admission tests likewise do not substitute for deployed provider
  delivery or every callback-integrity condition.
- Public health, ping and readiness aliases are separate declarations. Do not
  copy a path's receipt to an alias that the exact case did not request, or to
  the later `/ready` declaration in `server/infrastructure/autoScaling.ts`.

`tests/platform-acceptance-map.json` implements these six reviewed links; the
preserved master register records six passing checks and no invalid links.
The current 10d register leaves33,543 of 33,549requirements unverified and
170 mapping warnings tracked rather than extrapolating from the eight cases. Recompute the platform digest and generated IDs after source
freeze, verify the actual current declarations and unchanged test hashes, then
require the next run's exact passing cases. Keep the earlier source-bound
result as historical evidence when current inputs differ.

## Frozen-master procedure and current acceptance

1. Verify each exact generated check, route declaration, test hash and all eight
   case identities. Set the candidate platform digest before freezing source;
   changing the acceptance map afterwards also changes common test/config inputs.
2. Finish source/config/test changes and discovery. Freeze all common inputs. Run
   the actual canonical master with its owned command/log/JUnit/TAP producers;
   retain the real unchanged-source ledger and all failures, blocks and skips.
3. Let canonical postprocessing resolve links from those actual producer files.
   Do not synthesize execution rows or refresh old artifact timestamps. A manual
   `platform-register.py` refresh can account for existing current execution; it
   cannot execute a missing test or repair stale provenance.
4. Inspect `evidenceProvenance`, rejected-evidence reasons and invalid links in
   the resulting register. Require every case in a bundle to qualify against the
   unchanged current common source and current platform/test hashes.
5. Keep prior source-bound results historical when inputs differ. Reconcile all
   exact feature checks and every page/shared/deployed/accessibility/coverage
   requirement separately. The completed 10d master admits only the six reviewed
   checks;33,543requirements and all 80full-page launch decisions remain open.

The six map IDs and eight exact HTTP case identities above remain unchanged.
The current candidate digest alone grants none of them a pass. The original
8cad and a160 results remain source-bound historical observations. The completed
10d master supplies the actual current eight-case proof. Its evidenceProvenance
reports CURRENT source; 90 identities not proven by bound XML and 14 unbound default-file
proofs are rejected as feature evidence, not counted as product test failures. The current 10d four-command cold rehearsal and 37-check audit also pass their
startup scope, retainingproductionReady:false; they do not broaden any of the
six policy checks. No review signature, private dataset or trained-checkpoint
requirement is introduced.
