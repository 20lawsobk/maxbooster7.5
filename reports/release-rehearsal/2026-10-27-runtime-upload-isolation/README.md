# MaxCore runtime upload isolation and publishing exclusion

The previous release rehearsal detected two concurrent admitted mutations: a
legitimate generated API bundle and a retrieval test's new image in the source
upload directory. Its failed source guard and full log remain in
[the previous attempt](../2026-10-27-analytics-dependencies-final/README.md).

This batch excludes only
`external/maxcore/artifacts/ai-training-server/uploads` from filtered source
copies, release source identity and the real MaxCore tar capsule. Images, audio,
video and staging under that runtime tree belong in serving storage. Project
source, intentional assets, image fixtures and an adjacent `uploads-fixtures`
tree remain admitted. Existing upload files are preserved on disk.

| Verification | Actual result |
| --- | --- |
| New assertions against the old policies, two existing packaging suites | 9 passed, 2 failed: runtime content appeared in the copy and restored archive |
| Same suites after the narrow exclusion, plus existing app-remainder policy checks | 14 passed, no failures/errors/skips |
| Actual canonical retrieval pytest files | 18 passed, no failures/errors/skips |
| Documented pipeline module entrypoint | 37 checks passed |
| Documented phase4 module entrypoint | 40 checks passed |
| Late-import alias restoration and deliberate render/exception cleanup | Passed |
| Source upload preservation after each Python command | All 36 existing files retained identical hashes, sizes and modes; no owned temporary root remained |
| Scoped lint and whitespace | No errors; 8 pre-existing lint warnings in the capsule packer; whitespace passed |

The direct-module checks overlap pytest's behavior and are not added to its
case count. The [Python receipt and instructions](python/README.md) retain exact
commands, artifact hashes, temporary-directory cleanup and preserved development
failure history. The shared context redirects the actual image engine and its
already-imported and later-imported retrieval aliases, restores them afterward,
and also covers direct module entrypoints without requiring pytest there. The
production image generator is unchanged.

The packaging regressions exercise real zstd packing and the actual production
restorer. They prove the upload subtree does not return after extraction,
changes there do not invalidate source identity, and real source/asset changes
still matter. The copy check also preserves an owned private symlink target
without admitting its upload link.

Reproduce the packaging checks from the repository root with Node 22, locked
dependencies, zstd and tar on `PATH`:

```sh
node node_modules/vitest/vitest.mjs run \
  tests/unit/production-simulation-copy.test.ts \
  tests/unit/capsule-pack-restore-roundtrip.test.ts \
  tests/unit/dockerignore-scan-sensitive-paths.test.ts \
  --retry=0 --maxWorkers=1
```

The exact command receipts, JUnit and logs are `packaging-before.*` and
`packaging-after.*`; `packaging-sources.json` binds the four policy/test files.
`checks.json` binds lint and whitespace outputs. The before run intentionally
failed; it remains preserved.

Finish the master build/checks before the next release preparation, because the
build legitimately regenerates an admitted imported API bundle. The next
versioned driver retains full admitted inventories before and after execution,
alongside the separate master-style code/configuration inventories. It keeps the
real source and payload guards. A changed capsule-policy module invalidates
cache keys for all runtime capsules; no cache-policy bypass is introduced.

These are targeted packaging and test-isolation results. They are not a new
prepared release, a cold-start result, deployment evidence or production approval.
