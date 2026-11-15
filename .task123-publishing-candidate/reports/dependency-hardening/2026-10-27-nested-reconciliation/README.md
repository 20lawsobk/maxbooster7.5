# Nested install fixture correction

The completed frozen master correctly rejected the success fixture's obsolete
qs6.16.0 install. That original5-case Node run records4passes/1failure and is
retained in `before.txt` with its command receipt. Production security floors
and reconciliation behavior were not changed.

The passing fixture now supplies qs6.16.1. Its stale-install case specifically
supplies vulnerable6.16.0 and requires rejection before promotion. The same
fixture's failure, configuration-mutation and offline cases preserve the old
installed tree and source/lock snapshots. The focused recheck passes5cases,
0failures/0skips; timestamps/exits/hashes are in `after-receipt.json` and
`summary.json`.

Run with Node22.12+ from the repository root:

```sh
node --import tsx --test --test-concurrency=1 tests/nested-reconciliation.test.mjs
```

1. Successful frozen install replaces the generated tree while retaining source
   and package configuration and refusing lifecycle scripts.
2. Failed install leaves the prior runtime intact.
3. Lock mutation is rejected before promotion.
4. Offline diagnostics never replace installed files.
5. Newly installed vulnerable qs is rejected before promotion.

This is a fixture/test correction, not deployed readiness or a new dependency
upgrade. The later master must bind the changed test source separately.
