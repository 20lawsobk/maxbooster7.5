# Deployment optimization — verification and remaining limits

## Full-path scope correction

The requested scope is both build entrypoints and startup, from pressing Publish
to a usable live application—not a bundling-only improvement. Replit's documented
pipeline is provision → security checks → build → bundle → promote. The repository
controls its build, payload and runtime work; platform provisioning/security/upload
durations must be measured from deployment history rather than inferred from a
local build.

Additional changes across that path:

- The publishing command and legacy build.sh still converge on npm's build
  implementation. The legacy entry now recovers packed dependencies before npm.
  npm build uses the installed TS loader directly, with no npx resolution step.
- Independent Python preparation, compilation and native-runtime preparation run
  through a bounded scheduler. Python can overlap compilation; native work takes
  the next slot. Containers below two CPUs or 6 GiB keep serial preparation.
  These are conservative concurrency estimates, not a measured RSS guarantee.
- All prerequisite subprocesses are drained before recovery snapshots or capsule
  packing. Failure never advances the pipeline to packing.
- Portable Node downloads have connect and overall deadlines. Hash-locked Python
  installation, isolated interpreter validation and pinned native compilation
  remain mandatory.
- The separate workspace production workflow now runs build before start. It is
  not the Publish command and was not started as part of verification.
- Startup launches the diffusion gateway while Python validation runs, then
  checks its actual loopback health response instead of sleeping two seconds.
  Failure to become healthy aborts startup.
- Readiness monitoring requires both the SPA boot flag and the real dependency
  readiness response. It does not count a listening port, the boot stub or a
  degraded dependency as live. The monitor reports failure after its deadline
  but does not terminate an otherwise running app.
- The boot stub retains homepage liveness, but returns 503 for API paths.
  Owned startup children are cleaned up on failure/shutdown; external or
  pre-existing processes are not claimed as owned.
- The readiness helper is explicitly admitted by the payload policy and required
  in the application capsule before packing.

Current verification: 60 Vitest tests and 22 Node tests passed. This includes real
concurrent child-process rendezvous, failure propagation, capsule round trips,
configured publishing-entry fixtures, HTTP readiness transitions and the actual
boot-stub process. Shell and TypeScript syntax checks passed. It is not a full
application startup against production services or a successful real publish.

No whole-pipeline percentage improvement is claimed. The unresolved platform
cache writer described below still prevents declaring publish-to-live complete.

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