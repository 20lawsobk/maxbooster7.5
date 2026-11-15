# C5 P2 admission prototype — REVIEW BLOCKED

This outside-only candidate has not been landed, merged into canonical coverage, or used for launch approval. The source is a review artifact with confirmed admission defects, retained so they can be repaired with regression tests. Do not run it to publish coverage.

## Verified limited results

- Fresh actual P1 collector command on captured `8a9b638c` ran both assertions, observed nine original scripts, completed all 27 complete-map comparisons, and cleaned its owned process group (zero survivors). Its parent command window was 2026-10-29 22:57:42.638–22:57:45.362 UTC. Source inventory `afd50ee1ca7c5f5f9391e2b81950478504b62a3af406b70767919082ae479757` was unchanged during capture.
- Historical replay of the captured epoch binds all nine raw originals to the official serialized global entries and demonstrates exact typed counter addition, unchanged map IDs, untouched functions/branch arms, and retained source-file denominator 2,653. It does not establish current-source admission. Historical candidate additions were 33 statement slots, six function slots, and 15 branch-arm slots; none were published as coverage credit.
- Current-source CLI rejected the root source changes as stale, exited 1, and created no candidate output. The official historical global hash remains `b9f9d1efbf2ac622020c708c90b621ef963e2bea2b373c370061917c64b10137`.
- Final portable algebra/guard tests: 52 passed, zero failures/skips. Initial 48-case test invocation retained two fixture errors (Buffer vs Uint8Array snapshots); corrected fixtures passed. Passing these cases did not prove all admission guards, as independent negative controls demonstrate below.

## Confirmed missing admission requirements

1. **Canonical JUnit parent binding:** the actual parent command receipt lacks the XML hash and leaf-count digest. Independent actual-epoch control substitutes one internally consistent passing case for the observed 2,771 cases and the candidate guard accepts it. Capture fresh XML hashes/counts in the parent runner during the actual command; a consumer-created hash later is insufficient.
2. **Unhandled runtime failures:** actual installed Vitest can exit 1 with clean JUnit plus four coverage threshold errors while an unhandled rejection also occurred. Add a public `onTestRunEnd` reporter that records its actual unhandled errors/counts/reason, and bind the reporter artifact to parent nonce, command window, source and hash. Log pattern matching alone cannot close this.
3. **Implementation inventory:** an empty `candidateFiles` skips all producer implementation verification. Require the exact immutable helper keyset and hashes anchored to the current source inventory, not only self-reported filenames/hashes.
4. **Output ownership:** lexical output containment permits an ancestor symlink escape. Validate resolved existing ancestors and create the fresh output transactionally under the owned root.
5. **TAP ambiguity:** duplicate earlier `# fail 1` followed by `# fail 0` is accepted because the current parser overwrites the earlier count. Require exactly one complete terminal summary and reject conflicting/duplicate counters.

## Replay and retention

`candidate/admission.test.mjs` is the portable regression harness; use the prepared Node 22 runtime:

```sh
PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH node --test --test-concurrency=1 /workspace/onboarding-results/c5-admission-prototype/candidate/admission.test.mjs
```

The actual stale CLI invocation and its rejection are retained in `admission.txt`; `historical-replay-final.txt` and `historical-replay.json` are explicitly historical algebra only. `review/canonical-junit-binding-control.*` preserves the one-vs-2,771 counterexample. The separate independent-review bundle preserves the actual installed-Vitest unhandled-error repro and other controls.

The full canonical coverage JSON is already retained in `reports/test-verification/history/2026-10-29-8a9b638c-master/master-evidence.tar.gz`, member `coverage/coverage-final.json`; do not retain another 49 MB duplicate. The producer runtime folder is one separate actual execution, not a synthetic map-only fixture. Vite cache, home, package symlinks, and duplicate native corroboration are excluded from the copy plan; inspector ranges, actual Debugger code/body/maps, typed wires and command receipts are retained.

The next source batch must implement the parent JUnit and public reporter foundation first. It then needs fresh canonical and P1 invocations at one frozen source epoch, repaired admission guards, and independent review. Other producer/process/language profiles and all 80 page acceptance gates remain separate work.
