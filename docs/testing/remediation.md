# From a master-test failure to a verified repair

`scripts/testing/remediation.py` turns final evidence into an actionable repair
queue. It reads the reconciled case/file reports, per-suite logs, dependency
audit, code coverage and platform register. It does not run application code,
write production state or change expectations to make tests pass.

```sh
python3 scripts/testing/summarize-results.py
python3 scripts/testing/remediation.py --input reports/test-verification
python3 scripts/testing/remediation.py --input reports/test-verification --strict
```

Outputs are `reports/test-verification/remediation.json` and `remediation.md`.
`--output /path/to/review` chooses another output directory. Default exit zero
means a guide was generated; `--strict` returns one while unresolved tasks
remain. Missing or malformed required reports produce repair tasks rather than
an empty success report.

The Markdown expands the first 100 prioritized tasks to keep it reviewable.
Use `--markdown-limit N` to expand more. The JSON always retains every task and
every uncovered source location; reducing the Markdown limit never reduces the
closure checks or changes the strict exit result.

Every task contains the exact file/case, observed error and evidence path,
reproduction command, confidence of the diagnosis, required changes and proof
needed to close it. The machine report also records source-report SHA-256
values. Coverage tasks retain every zero-hit function, statement line and branch
arm. Platform tasks retain page/route/control acceptance IDs from the feature
register. Test-file names that resemble a feature are never treated as proof
that its complete business journey passed.

Page repair references include the suggested test path, command and fixture
template from the register. Required-check template IDs resolve through the
single `platformCheckTemplates` table in the machine guide, so requirements
remain exact without repeating thousands of identical instructions.

The Istanbul figures describe the instrumented JavaScript/TypeScript unit run.
They do not merge Python execution or real-browser test coverage into one
percentage, and they do not measure business correctness or generated quality.

Unknown dynamic route/control mappings and rejected evidence links also remain
repair tasks. Resolve their actual source targets and matching proof identities
before declaring that feature covered.

The instructions distinguish these common cases:

| Evidence | Required response |
| --- | --- |
| Missing packaged Python | Prepare or restore the verified portable runtime and test its actual interpreter origin; do not substitute host Python. |
| Missing speech binary/data | Install matching espeak-ng/data, set an extracted data path if necessary, then decode actual narration output. |
| npm/proxy certificate failure | Preserve the approved proxy and configured Node CA trust, then repeat the registry request with TLS verification enabled. |
| Missing fixture dependency | Supply the subject's actual validator or owned disposable persistence dependency while retaining the business assertions. |
| HTTP 401/403 or missing authenticated user | Trace valid registration input, CSRF, cookie host/scheme and session persistence before changing the test or implementation. Never bypass the controls. |
| Retired billing route | Trace the current mounted route and retain equivalent subscription/settlement assertions, or implement a still-required missing contract. A 404 is not successful billing. |
| Readiness/capability unavailable | Identify the exact unavailable component, implement/configure it and verify real output. Keep unconfigured 503 and configured-success cases distinct. |
| Browser administrator policy | Use supported test-host policy configuration. Do not disable the policy or label an unrendered PDF as passing. |
| Missing deletion outbox target | Trace the supported deletion owner, restore or port the durability regression, and verify retry/restart acknowledgements rather than add an empty class. |
| Native Linux VST3 blocked | Restore original JUCE/C++ source and build it, then exercise a real native host and DSP/audio transport. Exports alone do not prove processing. |
| Historical evidence hash/file mismatch | Restore its matching immutable artifact generation; do not rewrite historical hashes to fit new bytes. |
| Uncovered source or feature behavior | Add meaningful isolated input/owner/error/durability/browser-interaction tests for the listed source locations, register them, and rerun the affected group. |
| Provider, private bucket, load/fault or hardware checks skipped | Supply the explicitly isolated prerequisite and execute the original bounded assertions. Missing execution is not a pass. |

An unrecognized error gets a source-level investigation task with the actual
assertion and reproduction command. Its cause is labeled `needs_verification`,
so a fixture problem is not automatically called a production defect.

After a repair, run the exact affected case, its dependent feature journeys and
the master sweep; regenerate the catalog, coverage, platform register and guide.
A task closes through fresh evidence, not by deleting a failure report,
broadening accepted status codes, disabling a gate or adding placeholder tests.
