# Targeted hardening evidence — October 26, 2026

This retained snapshot preserves focused checks executed after the October 25
master run and before the next complete integrated run. Its baseline is
`4c72114a55a9425d4af743a72a71e4c58a532d2f`; checks also exercised uncommitted
working-tree changes. It is **not a production-readiness certificate** and is not
an aggregate test run.

The [provenance manifest](manifest.json) records the original source path, byte
length and SHA-256 of every copied artifact. Original receipts are preserved
byte-for-byte, including execution timestamps and absolute paths to logs in the
original cloud workspace. Use the relative links below to inspect the portable
copies. Raw application logs, screenshots, private provider journals, database
dumps, dependencies and duplicate coverage outputs were deliberately excluded.
The later passing rate-limit/HTTP rechecks are appended without replacing the
earlier failures or five-case unit receipt. The original manifest and its
checksum are retained under `provenance/`; `appendEvents` records that boundary.
The private hybrid-download owner-isolation failure and its passing repair are
also retained separately; their application logs and synthetic uploaded bytes
were excluded.

## Preserved outcomes and boundaries

| Scope | Receipt and case evidence | Observed result |
| --- | --- | --- |
| Public-awareness regressions | [Results and isolation](python-awareness/results.json), adjacent JUnit files | Six suites report 110 cases passing. JUnit has 105 testcase elements because unittest subtests also contribute to suite counters. |
| Campaign and generation handlers | [Results](python-generation/results.json), adjacent JUnit files | 54 cases passed; handler availability and actual renderer modes remain distinct. |
| Studio DSP | [JUnit](studio-dsp/final.junit.xml) | 203 sample-processing/lifecycle cases passed; this is not native Linux VST3 proof. |
| Subscription authority | [Results](subscription-authority/results.json), [JUnit](subscription-authority/subscription-authority-postgres.test.xml) | 16 disposable-PostgreSQL leaf cases passed. |
| Beat loop | [Results](beat-loop/results.json), [JUnit](beat-loop/beat-loop-lifecycle-postgres.test.xml) | 10 cases passed, including real Python audio/artwork rendering, decoded delivery and SQL listing/royalty persistence. |
| Social publishing | [JUnit](social-publish/unit-publish.junit.xml) | 26 admission, ownership, queue/claim and race cases passed. |
| Billing HTTP | [Receipt](billing-http/summary.json), [JUnit](billing-http/integration.junit.xml) | 12 cases passed against an isolated real application/database. |
| Critical HTTP paths | [Receipt](critical-http/summary.json), [JUnit](critical-http/integration.junit.xml) | 47 passed, three explicit provider/model skips. |
| Feature and storage HTTP paths | [Receipt](feature-http/summary.json), [JUnit](feature-http/integration.junit.xml) | 202 cases passed. |
| Readiness HTTP | [Receipt](readiness-http/summary.json), [JUnit](readiness-http/integration.junit.xml) | 48 cases passed within the fixture's declared capability scope. |
| Authentication/billing limits | [JUnit](rate-limits/unit-rate-limit.junit.xml) | Five real Redis/canonical PDIM concurrency cases passed. |
| Subsequent paid/billing HTTP recheck | [Receipt](rate-http-failed/summary.json), [JUnit](rate-http-failed/integration.junit.xml) | 69 passed, 18 failed, four skipped. Preserved as a failing historical recheck; later source repairs must be verified by fresh evidence. |
| Later repaired paid/billing HTTP recheck | [Receipt](rate-http-recheck/summary.json), [JUnit](rate-http-recheck/integration.junit.xml) | 87 passed, zero failed, four explicit provider skips. The earlier failing recheck remains above. |
| Later authentication/billing limiter recheck | [JUnit](rate-limits-recheck/unit-rate-limit.junit.xml), [reporter receipt](rate-limits-recheck/unit-rate-limit.txt) | Six cases passed, including per-user billing isolation and degraded authority bounds. The earlier five-case receipt remains unchanged. |
| Private hybrid download before repair | [Receipt](hybrid-owner-http-before/summary.json), [JUnit](hybrid-owner-http-before/integration.junit.xml) | 11 passed, four failed. This reproduced cross-owner byte access before the repair. |
| Private hybrid download after repair | [Receipt](hybrid-owner-http-final/summary.json), [JUnit](hybrid-owner-http-final/integration.junit.xml) | All 15 cases passed, including both download-route owner checks and ordinary file operations. |
| Storage, PDF and original PDIM | [Summary](storage/summary-followup.json), [Node receipts](storage/node-followup/results.json), [last regressions](storage/final-regression-rechecks/results.json), [PDIM receipt](storage/pdim-smoke-results.json) | Targeted storage/PDF checks and the original 54-case disposable PDIM suite passed. Counts overlap and are not additive. |
| Page observations | [Detailed receipt](page80/page80.json) | 80 render observations passed; decision is `PASS_WITH_UNTESTED_CATEGORIES`, with sealed non-ML scope and expected degraded aggregate readiness. |
| Configured Neon schema | [Read-only receipt](deployment/neon-schema-readonly.json) | Existing fabric tables found; deletion journal and chunk reference-count additions absent. No production DDL or application-row reads occurred. |
| Candidate public hosts | [Probe receipt](deployment/replit-candidate-public-probes.json) | Both guessed origins returned generic 404 responses. Their deployment identity was not established; this does not prove failure of the user's actual published app. |
| Numeric scale profile | [Ten-run receipt](engine-load/final/results.json), adjacent `run-01.txt` through `run-10.txt` | Ten bounded profiles passed; each executed 1,101 orchestrator calls with eight workers. No HTTP clients or global deployment were exercised. |
| Initial numeric profile failure | [Receipt](engine-load/initial-receipt.json), [raw output](engine-load/initial.txt) | Current default backend did not emit the legacy engine counters; the first dispatch also completed 496 of 500 configured contention calls. The later explicit-backend run includes the dispatch correction. |

The separately retained [dedicated Stripe TEST API report](../../../provider-acceptance/stripe-test-api-2026-10-26.json)
records 28 passes, four account/fixture prerequisite blocks and one skip, with
26 successful cleanup operations and six documented cleanup skips. The manifest
records its SHA-256 without duplicating it. Those sandbox Tax/Connect observations
do not establish the state of the production Stripe account. No deployed
application route, webhook delivery or browser confirmation was tested by that
API-only run.

## Verify provenance

From this directory, check the manifest itself:

```sh
sha256sum --check manifest.sha256
```

Then validate each copied artifact from the repository root:

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
base = Path('reports/test-verification/history/2026-10-26-targeted-hardening')
manifest = json.loads((base / 'manifest.json').read_text())
for item in manifest['files']:
    data = (base / item['path']).read_bytes()
    assert len(data) == item['bytes'], item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
print(f"Verified {len(manifest['files'])} preserved artifacts")
PY
```

`recordedSourceDigestComparisons` compares digests already present in original
receipts with source bytes observed at preservation. Some checks predate later
changes, so mismatches remain visible. This comparison is not a rerun and does
not prove unrecorded dependency identity. JUnit-only checks are not assigned
invented execution-time source hashes. The count-only secret-pattern scan found
zero matches in all copied bytes; no credential values were printed or retained.

Use the current [master results](../../../../docs/testing/results.md) for the
latest integrated run and [launch gates](../../../../docs/testing/global-launch-readiness.md)
for deployment and capability boundaries. Never sum these focused receipts into
one unique-case total or silently replace a retained failure with a later pass.
