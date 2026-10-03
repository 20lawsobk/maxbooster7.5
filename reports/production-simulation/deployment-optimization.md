# Deployment optimization — verification and remaining limits

## End-to-end path examined

The publishing entry authorizes a disposable root, recovers interrupted packing,
and isolates child caches. Build then validates dependencies/models, compiles
Vite and server entries, prepares Node/native/Python runtimes, snapshots recovery
inputs, packs four subsystem capsules and the application remainder, measures
Nix dependencies, removes excluded inputs and checks the final image budget.
Startup serves liveness while restoring critical capsules, restores subsystem
capsules in the background, checks dependencies and starts the application.

The latest observed failed publishing attempt lasted approximately 12 minutes
25 seconds, including platform-controlled work. All five capsules completed;
final excluded-cache cleanup failed. No successful publish was observed after
these changes.

## Implemented

- Five independent server bundles now share one esbuild graph scan. Output names,
  external dependencies and standalone ESM behavior are unchanged; no shared
  chunks or cross-entry execution dependencies were introduced.
- Compression uses the existing shared container capacity calculation rather
  than the host CPU count. Both concurrent job count and zstd thread allocation
  are bounded, including on fractional-CPU containers.
- Failed packing stops admitting queued work and drains already-started jobs
  before rejecting, instead of exiting while sibling destructive packs run.
- Cleanup measures and validates one final tree snapshot instead of walking it
  twice. The separate post-journal assertion remains.
- Build phase and critical/background restore timings are printed to stdout.
  Timing collection writes no files and starts no late cache-producing process.
- Restore lock timeout is fatal to that restore, not permission to extract over
  another process's live tree.

## Evidence

Run the non-destructive server benchmark with:

```sh
node --import tsx scripts/benchmark-deployment-bundles.ts
```

It reads actual project sources, writes only an owned temporary directory,
syntax-checks all five outputs, and deletes its temporary outputs. It never
starts the application or accesses its database. Serial/combined/combined/serial
ordering reduces systematic filesystem-cache bias.

Measured seconds:

| Implementation | Samples | Mean |
| --- | --- | --- |
| Previous separate builds | 1.221, 0.637 | 0.929 |
| Combined graph build | 0.652, 0.546 | 0.599 |

This is about 35% less time for **server bundling only**, approximately 0.33
seconds in this local sample. It is not evidence of a material reduction in the
whole 12-minute publishing process.

Verification: 57 Vitest checks across deployment execution, publishing payload
cleanup, interrupted-build recovery and real capsule pack/restore; 15 existing
Node publishing-entry/cache-isolation/recovery checks; two restore-lock tests.
All passed after correcting the lock logging branch uncovered by its new test.
The configured publishing entry was exercised in disposable fixtures, not by
running the destructive command in the checkout.

## Unchanged safety boundaries and remaining work

Hash-locked Python requirements, model admission, full recovery snapshots,
capsule checksum validation, secret exclusions and the complete Nix-plus-payload
size budget remain enforced. No cache exemption, blind deletion retry, runtime
artifact deletion in the workspace, database access or publication was performed.

Download/install, native compilation, recovery-copy and capsule compression costs
were not re-benchmarked on the full production payload. No cross-build cache was
introduced without a verified persistence and invalidation contract. Upload and
promotion duration remain unmeasured; the latest observed build never reached
them. The live platform writer recreating `.cache/replit` is still unidentified,
so the entire end-to-end deployment is **not yet verified successful or optimized**.
Use the new phase timings from a real publishing attempt to prioritize further
work rather than extrapolating the small bundling benchmark to the whole process.