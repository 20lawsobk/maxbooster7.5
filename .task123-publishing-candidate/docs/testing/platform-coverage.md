# Platform-wide feature register and closure gate

The master runner calls `scripts/testing/platform-register.py` after the test
groups and coverage run. The register is exhaustive for its declared source
surfaces: every `Route` declaration in `client/src/App.tsx`, source JSX controls
and event bindings, the main endpoint-audit registrations, imported TypeScript
router declarations, Python FastAPI/Flask route decorators, Rust Axum routes
and Go handler declarations. It records every declared source location rather
than sampling only a few pages.

This is a test plan and evidence index. A source declaration is not proof that
the feature is mounted, executed or correct. Dynamic mounts, computed paths,
unparsed declarations and controls supplied through runtime data remain
explicit. Retained/unreferenced components may be retired code rather than
active features; prove their runtime admission or exclusion before calling
them production gaps.

## Run it

From the repository root, after installing root Node dependencies:

```sh
python3 scripts/testing/platform-register.py \
  --input reports/test-verification \
  --output reports/test-verification \
  --strict
```

Run the parser's disposable fixture assertions separately with
`python3 scripts/testing/platform-register.py --self-test`. They verify exact
page bindings, same-line control identity, event handlers, mount targets and
explicit unresolved paths without executing fixture application code.

Python uses the standard library. The extractor uses the repository's installed
TypeScript parser. It reads source; it never boots the app, calls providers,
loads model weights or mutates a database.

Inputs are the generated test catalog, reconciled file/case results,
`reports/endpoint-audit.json`, and optional Istanbul `coverage-final.json` under
`<input>/coverage/`. `--coverage /other/directory` selects another real coverage
artifact. Generate the catalog again after adding or changing tests.

Outputs:

- `platform-register.json`: every page, control, API contract and backend
  declaration; exact required-check IDs; source locations and digests; candidate
  test references; fixture instructions; actual uncovered functions/lines;
  unresolved mappings and invalid evidence links.
- `platform-register.md`: compact page/domain register, the behavioral check
  templates and the largest measured execution gaps. The machine file retains
  every detail when the human summary is bounded.

`--strict` exits 1 when the platform register is still unverified, even if a
smaller test group passed. Without `--strict`, successful source extraction
exits 0 and still writes the truthful `UNVERIFIED` gate. Extraction failure
exits 2. These exit codes do not change test outcomes or coverage thresholds.

## What a missing check tells you to add

Every subject has `requiredChecks` and `addTest`. A check refers to a named
template in `checkTemplates`, so the instruction is attached to the precise
route/method or control source location rather than a vague platform checklist.

- **Pages:** actual loading/empty/error/retry/success states, declared access
  policy, applicable user actions and persisted readback after reload.
- **Controls:** real events on that control, request/result assertions,
  disabled/invalid inputs, dependency failure, retry/cancellation and duplicate
  mutation handling.
- **Endpoints:** exact method/path/schema, access and tenant boundaries,
  malformed/excessive input and bounded dependency failure. Mutations additionally
  require durable readback, rollback, retry/idempotency and concurrency evidence.
- **Deletes/callbacks/readiness/media:** durable cleanup, applicable signatures
  and replays, real capability readiness and artifact ownership/decoding/durable
  bytes receive additional explicit checks.
- **DNS/native services:** the register selects native test locations and
  commands. DNS declarations require wire-format/RCODE/flags/TTL assertions;
  they are not incorrectly treated as authenticated HTTP routes.

The suggested test command and fixture template are stored with each subject.
New main-HTTP files must be added to `vitest.integration.config.ts`'s explicit
`test.include` list before selecting them with the isolated wrapper. New tracked
Node tests are discovered by `run-node-suites.py`. Native/Python fixtures must
use disposable state and ephemeral ports, following their scoped runner guides.
Do not create `expect(true)` placeholders, weaken an unavailable-capability
assertion, or point mutation tests at the development/production database to
make the gate green.

## Automatic evidence links, without approval or signatures

Passing line coverage and matching imports/URL strings remain separate from
behavioral acceptance. An existing behavioral case can close a requirement only
when the register can link the exact current passing case to that requirement.
This is ordinary test metadata, not a review/signature/permission requirement.
No reviewer identity, administrator approval or signature is requested.

A reporter can emit these fields on an executed case in `case-results.json`:

```json
{
  "group": "http",
  "file": "tests/integration/example-acceptance.test.ts",
  "name": "actual test case name from the runner",
  "status": "passed",
  "platformChecks": ["api-<generated-id>/mutation-durability"],
  "platformSourceDigest": "<current platformSourceDigest>",
  "testSha256": "<SHA-256 of the executed test file>"
}
```

`checkIds` is an alternative to `platformChecks`. The register consumes these
automatically. For runners that cannot emit additional case metadata, an
optional `tests/platform-acceptance-map.json` provides the same exact links:

```json
{
  "checks": [
    {
      "checkId": "api-<generated-id>/mutation-durability",
      "group": "http",
      "testFile": "tests/integration/example-acceptance.test.ts",
      "caseName": "actual test case name from the runner",
      "platformSourceDigest": "<current platformSourceDigest>",
      "testSha256": "<SHA-256 of the executed test file>"
    }
  ]
}
```

These examples are schemas, not passing evidence. The link is accepted only if
the named check exists, the platform and test digests match, and the exact
group/file/case currently passed. JUnit, the five focused browser cases and
declared passing Node TAP cases are linkable. Invalid or stale links remain
visible. A missing link means behavior is unverified; it does not ask for
human signoff. Inspect the existing candidate test's actual assertions, add
specific missing assertions when needed, rerun it, and emit the correct link.

## Interpret the measures correctly

`testCandidates` are source/import/exact-literal associations, never proof that
an assertion covered a specific branch. Import reachability is not a runtime
trace. JSX declarations are potential controls, not a count of distinct user
journeys; loops and runtime data can expand their state space.

`sourceCoverage` comes only from the real Istanbul artifact. It includes
covered/total statements, functions and branches plus exact uncovered function
names/lines. The master coverage configuration currently measures the executed
unit-suite scope; it must not be described as merged browser/Python/native
coverage. High line coverage alone does not establish authorization, provider
delivery, numeric/model quality, financial correctness or every UI state.

The overall register can close only after required behavior has passing exact
evidence, source mappings are resolved and execution coverage is present.
Domain-specific assertions can require more than the generated minimum plan.
Replit deployment, real provider journeys, model quality and native Linux VST3
processing remain independent evidence requirements.
