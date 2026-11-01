# Committed keep-name attribution repair: fresh standalone Node coverage

The tested source is `bca5f4e1f632db835dc90b1e57d85f919ed6e0aa`. The complete
framework passed **22/22**, zero failed/skipped. The actual existing P1 replica
suite passed **2/2**, and the collector exited zero with one retained inspector
profile covering nine original production files. Both commands ran under the
credential-free canonical `common.run_command` environment using Node 22.23.3.
The collector's internal environment is independently constructed and smaller.

The framework took 3.494s and the collector 12.778s. These timings describe this
bounded local run, not platform latency or throughput. See `framework.txt`,
`collector.txt`, `profile/test.txt`, and `execution-receipt.json` for exact
commands/results. Use the root lockfile's dependencies and run from the repository:

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/testing/coverage-provenance.test.mjs
node scripts/testing/collect-node-coverage.mjs tests/fabric-replica-generation.test.mjs reports/coverage-producer/a-new-owned-run
node reports/coverage-producer/2026-10-28-keepnames-final/audit-profile.mjs
```

The collector refuses to overwrite an existing output and still admits only the
proven in-process replica suite. Do not add database/server/process fixtures to
that allowlist before independent-session ownership is implemented and verified.
The cohort audit is a read-only replay of this historical evidence; it requires
its original source bytes and the recorded canonical baseline to remain present.
It is not a portable all-revision smoke test.

The outer canonical source-input SHA-256 stayed
`c44c8f0c44b183eae69c52af00f56265c9de3e2fc9eabc846753faf71226f8e4`.
The collector's separately selected inventory stayed
`990fde30b009ca5814e6c62744ddce2347c52d79e9a5cc81b92ab7d344d11be0`.
Their algorithms select different files; their hashes are not interchangeable.
Full before/after maps are retained. Canonical global coverage stayed byte-exact
at SHA-256 `b869f5617c61a51182802193ec63ec70899e2bd45ab6e0811b6118120f160434`.
Owned-group cleanup completed with zero remaining live members and no timeout,
output-bound failure or invented assertion result.

The source repair excludes only proven compiler keep-name nodes from the
original-source attribution. It parses original source identifiers/declarations,
requires the exact unmapped generated binding pair, rejects collisions/writers,
and limits standalone helper calls to exact mapped original declaration names.
Function-valued wrappers and all original unexecuted nodes remain in the
coverage denominator. The framework's real isolated VM/inspector fixture checks
that the uncalled function retains zero hits, all original maps match a
no-keepNames denominator control, and unexecuted branches/statements remain zero.
The exact reviewed patch and two independent outside-checkout review cohorts are
retained here; their earlier source-protection hashes describe the pre-landing
review, not the final committed source.

`profile/receipt.json` records nine policies and their code/map/original hashes,
TypeScript parser identity and exact ignored-node offsets/reasons. The separate
`audit-profile.mjs` validated the raw manifests, original/runtime/map hashes,
UTF-16 counters and every converted record, then exactly reproduced all saved
file profiles. For ports.ts, the false helper attribution is gone: 21 original
statements / 3 functions, with original `loopbackUrl` still uncalled at 0 hits.

**All nine files remain strictly incompatible with the canonical producer and
remain UNMERGED.** Serialized complete-map diagnostics now match for ports.ts
and pdimCircuitBreaker.ts; the other seven still genuinely differ. Raw
Infinity/undefined coordinate representations still explain extra in-memory
branch differences. The diagnostic disk serialization is not a normalization
policy, a compatibility waiver or permission to copy hits. No global percentage,
source denominator, threshold, accepted page check or launch status changed.

This closes the specific C5 compiler-helper attribution repair and its bounded
regression gate. Later C5 conversion compatibility and P2–P7/C0–C7 ownership,
producer integration and complete platform coverage remain open. Production
readiness is false.
