# Deployment task executive

`bash build.sh` runs the build graph through `script/deployment/executive.mjs`.
Before cleanup, bootstrap preserves Node and compatible npm/pnpm using temporary
launchers outside the workspace caches. Immutable Nix store installations are
referenced directly; other installations are copied with explicit deadlines.
npm must match the project's declared version. Verification occurs outside the
project because pnpm rejects even its version command inside an npm-managed
project. Temporary launchers/copies are removed after the executive exits and
are not added to the deployment image. Bootstrap logs selection, preservation,
verification and handoff stages before the executive starts. A lost connection
without an exit error does not establish which operation failed.
The packer preparation task copies the dependency-free executive and startup
controls to `dist/deployment/` before source removal. `bash start.sh` locates
Node, validates ports, starts the liveness stub, then enters the startup graph.

## Scheduling and transition rules

- A task starts only after all its declared prerequisites finish successfully.
- Eligible tasks with more downstream work receive priority.
- Admission is recalculated after task completion and while waiting, using
  effective CPU/RAM limits, available memory (including reclaimable inactive
  file cache), and I/O pressure. Existing jobs are not suspended mid-write.
- Compression and Rust receive the scheduler's CPU allocation. Resource
  estimates govern admission; they are not OS-enforced per-process limits.
  Compression allocations expand to available capacity (up to eight source
  block workers or four zstd threads per archive), sharing CPUs with other
  eligible tasks. I/O admission ranges from one to four concurrent tasks.
- Cleanup, dependency installation, source snapshot readers, packers, and source
  deletion have explicit ordering barriers. Do not remove a barrier merely to
  increase concurrency: the source snapshot includes MaxCore.
- Task failures block successors. The executive terminates child process groups,
  escalates to SIGKILL after a grace period, and waits for child closure.
  Completed destructive tasks are not automatically retried.

## Bounded waiting

The local build safety budget defaults to 1,800 seconds; startup readiness
defaults to 900 seconds. These are **not claimed Replit platform limits**.
Optional process settings `DEPLOY_BUILD_BUDGET_SECONDS` and
`DEPLOY_START_BUDGET_SECONDS` control the local totals. Build-task deadlines
are declared in `plans.mjs`; the overall deadline also includes admission waits.

Progress reports show running tasks, waiting tasks, available memory, I/O slots,
elapsed time, and remaining budget. A deadline is an explicit failure, not
permission to skip a prerequisite or label an incomplete capsule successful.
Waiting kernel I/O may delay process termination even after a kill signal.

## Startup

All required runtime capsules are restored before application launch. Liveness
remains separate from readiness: a successful `/api/ready` response must contain
`status: "ok"` and `unifiedAwareness.ready: true`. Once ready, the startup deadline
is disabled and the executive continues supervising the application process.
SIGTERM/SIGINT terminate its process group, including sidecars.

## Verification boundaries

Isolated tests exercise real subprocess overlap, prerequisites, capacity
recovery, cycle rejection, deadline interruption, descendant cleanup, readiness
deadline disarming, and a real `build.sh` pack task plus restoration.
They do not establish full production build duration, final image size, or
publication success. Never run the destructive full build in the working tree.
