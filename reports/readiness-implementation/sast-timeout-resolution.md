# SAST per-rule timeout resolution

## Scope and diagnosis

This work addresses only the `Timeout` reported for
`javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag`
on `shared/schema.ts`. No source/schema refactor, rule removal, suppression, parser-worker
change, full repository scan, or live operation was performed.

Semgrep 1.172.0 was run with `PYTHONPATH` and `PYTHONHOME` removed,
`PYTHONNOUSERSITE=1`, metrics/version checks disabled, one job, the single exact rule,
and the single target. The fetched `p/security-audit` bytes had SHA-256
`b109a039df712f30c6d3e25e1e8358053fd0f1c91b92d0e8d2871cd141fe602f`,
which exactly matches the rule-pack digest recorded by `sast-resumed-full.json`.
The focused target bytes had SHA-256
`50864e829a1ed30889968be18e00dd8f0e3f810825b104d2d4afd019ff2aef24`.

Measured focused results:

| Per-rule timeout | Wall time | Exit | Findings | Errors |
|---:|---:|---:|---:|---:|
| 30 seconds | 35.959 seconds | 2 | 0 | 1 `Timeout` |
| 60 seconds | 46.487 seconds | 0 | 0 | 0 |
| 90 seconds | 47.900 seconds | 0 | 0 | 0 |
| 120 seconds | 49.066 seconds | 0 | 0 | 0 |

The rule therefore completes normally in about 46–49 seconds and produces no finding.
The prior 30-second default, rather than a parser failure or a finding in the schema,
caused the reported error.

## Resolution

The runner's default per-rule timeout is now 90 seconds. This is bounded, retains the
existing 30-minute outer process bound, and gives almost twice the observed rule runtime.
A retry/merge path was intentionally not added: raising the measured bound is simpler and
avoids any possibility that a partial first attempt could be mistaken for complete or
merged against a different scan state. The inventory is still hashed then copied to the
private staging tree before scanning, and each ruleset is still materialized once and
identified by its byte digest.

The report remains incomplete on any scanner nonzero exit, timeout/error, explicit skip,
omitted inventory path, unexpected path, or empty ruleset. Regression coverage verifies
that a timeout and a finding returned together are both retained and make the report
incomplete; it also verifies that only a genuinely successful scanner result is reported
without the timeout.

`node --test tests/readiness-sast-scan.test.mjs` passes all 9 tests.

## Final scan command and effective options

The full runner command remains:

```sh
node scripts/readiness-sast-scan.mjs \
  --root . \
  --output-json reports/readiness-implementation/sast-recovery.json \
  --output-md reports/readiness-implementation/sast-recovery.md
```

Its relevant effective Semgrep options are:

```text
scan --json-output <private-temp-file>
--metrics off --disable-version-check --no-rewrite-rule-ids
--project-root <private-staged-inventory>
--no-autofix --strict
--timeout 90 --timeout-threshold 3
--max-memory 4096 --max-target-bytes 0 --jobs 2
--config <materialized-security-audit-pack>
--config <materialized-coverage-probes>
<every path from the immutable inventory manifest>
```

The focused completion measurement used the same security rule bytes and target bytes,
with `--jobs 1`, only the named rule config, and only `shared/schema.ts`. No full scan was
run as part of this resolution.