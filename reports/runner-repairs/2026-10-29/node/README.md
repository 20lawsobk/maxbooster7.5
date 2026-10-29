# Canonical Node runner support ownership repair candidate

Source: local main `8a9b638c6c1ce1b46a19501ee4a48893497c2518`. This is an outside-only candidate. No source or canonical report was modified, and no production-readiness status is promoted.

The full master's single Node failure is `scripts/testing/coverage-node-vite-entry.mjs`. It imports `node:test` only for lifecycle cleanup and correctly rejects direct execution without the collector-owned target, output and nonce. The catalog already treats it as support, but standalone discovery matched its import. The candidate adds that exact lifecycle child to an explicit parent-owned support set. It does not change the helper or remove a real test.

`source.patch` changes only the Node discoverer, its existing catalog/runner regression and the collector instructions. `git apply --check` passes. The expanded regression proves catalog/runner parity, continued discovery of the actual canonical suites and exact child-selector rejection before output creation. Six tests pass. Running these expanded tests against the original discoverer fails as expected (`baseline-negative-control.txt`).

`discovery-retention.json` compares the actual complete Git-tracked inventory: 126 standalone selections become 125. The only removed entry is the parent-owned helper; all 125 genuine suites remain, exactly matching the actual catalog. The original two-assertion `tests/fabric-replica-generation.test.mjs` remains among them.

The unchanged real P1 producer was copied byte-for-byte into an outside review directory and invoked using its existing `--repository-root` review mode. `candidate/producer/actual-p1/receipt.json` records 2/2 assertions passed, nine original profiles, 27/27 complete statement/function/branch map comparisons against the completed master's raw canonical sidecar, unchanged authoritative common digest and unchanged global coverage bytes. Owned cleanup completed with no remaining live process. These counters remain unmerged and grant no global coverage credit. `p1-command.txt` retains an initial missing copied dependency setup error; `p1-command-retry.txt` and the actual receipt retain the successful correction.

Reproduce the candidate regression with:

```sh
MAXBOOSTER_TEST_REPO_ROOT=/workspace/onboarding-results/node-failure-2026-10-29/candidate \
MAXBOOSTER_CATALOG_SOURCE=/workspace/onboarding-results/node-failure-2026-10-29/candidate/scripts/testing/generate-catalog.py \
/workspace/.cloud-python/bin/python -B \
/workspace/onboarding-results/node-failure-2026-10-29/candidate/tests/testing/test_catalog_snapshot_ownership.py -v
```

The review-only `candidate/node_modules` symlink selects the existing installed root dependencies and is deliberately not retained in the artifact manifest; it is not test source. Root files still match HEAD byte-for-byte. After landing, root verification must rerun the catalog/runner regression and the actual Node group under the new current-source epoch.
