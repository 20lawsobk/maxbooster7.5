# Publishing build and startup execution

## Publishing build

The configured `bash build.sh` command first runs `script/deployment/bootstrap.sh`
to recover authorized build inputs, preserve a compatible Node/npm/pnpm toolchain,
and isolate caches. Bootstrap validates the dependency graph, then runs the 18
build phases one at a time through `script/deployment/sequential-build.mjs`.

The phase order is derived from the dependencies in `script/deployment/plans.mjs`.
Each phase must exit successfully before the next one starts. A failed phase
stops the build and is reported with its phase name and exit status. This path
does not use the deployment executive, scheduler admission, executor-wide or
per-task deadlines, or automatic phase retries. Phase-local integrity checks
and bounded commands remain in effect. A signal that terminates the Publishing
process still terminates the build; the runner does not claim to resume a killed
Publishing job.

The sequential order retains the required barriers: runtime/source preparation
finishes before the app capsule is made; pruning follows that capsule; dependency
and runtime capsules are packed before source removal; the app remainder is
created after source packing; and finalization verifies every capsule, filenames,
and deployment image size. All phases share a temporary state directory, removed
after normal completion or a reported phase failure. A hard process termination
may leave that temporary directory behind; the runner does not resume from it.

The previous capacity-aware executor remains in the repository for startup
supervision and its isolated scheduler tests. It is not used for Publishing
build phases. Build-plan resource reservations, deadlines, and retry metadata
are therefore not active in this sequential Publishing path.

## Startup

`bash start.sh` still uses `script/deployment/executive.mjs` and `startPlan`.
The startup graph restores all required runtime capsules before launching the
application. Liveness remains separate from readiness: a successful
`/api/ready` response must contain `status: "ok"` and
`unifiedAwareness.ready: true`. Once ready, the startup executive supervises the
application process. SIGTERM/SIGINT terminate its owned process group.

## Verification boundaries

The isolated sequential rehearsal completed all 18 phases, verified five
capsules, passed the UTF-8 filename check, and passed the image-size gate. It
is evidence for the phase sequence and package-integrity path, not proof of a
successful Replit Publishing job or of immunity to platform-side interruption.
Never run destructive packing in the development checkout. A completed local
rehearsal does not count as a production publication.
