# Publishing build authorization

The configured command is:

```
bash build.sh --publish-disposable-copy .
```

**Destructive command: use only in the disposable publishing build copy. Never
run this command in the working checkout.** It authorizes packing and physical
removal of build inputs in the copy. The August 26 publishing scaffold now
compiles the current application, prepares portable runtimes and the native
sidecar, validates dependencies/model, and packs the runtime capsules.
No `.prepared-release` is required.

The shell entrypoint invokes the dependency-free recovery/authorization helper:

```
node script/lib/deploymentPackRecovery.mjs --publish-disposable-copy .
```

A local full-path test requires a separate
disposable copy and verified scratch capacity first.

Replit documentation describes `REPLIT_DEPLOYMENT=1` on running published apps;
it does not guarantee that indicator during build. Neither it nor
`REPLIT_DEPLOYMENT_ID` is build authorization.

The explicit CLI declaration is the trust boundary (operator consent, not
cryptographic proof of a platform container). The helper validates that its own
root, cwd, and the declared root are the same real, non-symlink directory. It
rejects inherited packing/cleanup/root declarations rather than silently
overriding them. It then supplies `DEPLOY_PACK=1`,
`PUBLISH_PAYLOAD_CLEANUP=1`, and the absolute `PUBLISH_BUILD_ROOT` to recovery and
the npm build child. Do not persist these variables in project settings or
export them into development shells.

Every mutating recovery entry and build expectation validates that tuple.
Cleanup additionally validates its target root. Runtime indicators alone never
enable packing, relocate recovery, or authorize cleanup. `DEPLOY_PACK=1` alone
remains a packing simulation with in-tree recovery and no publishing cleanup.
It is still destructive packing, so simulations must run in disposable copies.

Publishing recovery lives in `/tmp/maxbooster-build-recovery-<sha256(root)>`,
independent of runtime IDs. It survives same-container command reentry but not
container replacement. The bootstrap helper and dependency control files remain
outside capsules, so Node can recover build sources before npm/tsx loads.
Recovery merges missing files without overwriting later edits; normal model and
dependency gates still run. Concurrent owners, conflicting local/external
journals, unsafe destinations and missing backups fail closed. Local simulation
cannot ignore an outstanding publishing journal for the same root.

Backups stay outside both the physical upload tree and app-remainder capsule.
Cleanup still enforces protected runtime files and symlink checks. Payload and
Nix accounting, the 7.5 GiB safety budget, model validation and dependency
security gates are unchanged.

Tests:

```
env -i PATH="$PATH" HOME=/tmp node --import tsx --test tests/publishing-build-entry.test.mjs tests/deployment-recovery-location.test.mjs tests/deployment-control-files.test.ts tests/deployment-contracts.cjs
env -i PATH="$PATH" HOME=/tmp node node_modules/vitest/vitest.mjs run tests/unit/publishing-payload-cleanup.test.ts tests/unit/deployment-pack-reentry.test.ts
```

The entry-point fixture uses real npm, recovery, capsule packing and cleanup,
with a tiny build script instead of the full application. It is not evidence
of a successful full application build or publication.

The wiring regression reads `deployment.build` directly from `.replit` and checks
the build-free installer command. Separate installer fixtures exercise verified
payload replacement and rejection before mutation. Packing regressions derive
the preparation command from its real implementation and execute it only inside
disposable fixtures. They verify one npm build per preparation invocation, the canonical root context, absent
and empty runtime indicators, repeated recovery, and rejection of inherited
authorization before npm or filesystem mutation. Testing a separately written
helper command alone does not validate the publishing configuration.

## Workspace Python environment exclusion

The root `venv` is development state, not the portable runtime. Its Python
wrapper may point outside the publishing tree into the host Nix store.
`/venv/` is excluded by the real publishing policy, and the simulation copier
excludes the same top-level name before traversing it. Nested dependency
directories named `venv` are not covered by this root-only rule.

App-remainder selection omits these development files. Authorized publishing
cleanup removes only the excluded copy without following its links. The
workspace original and external interpreter targets are not cleanup inputs.
Surviving external, broken, cyclic and excluded-target links still cause
failure before deletion.

Production continues to use the separately built and verified portable Python
capsule. Capsules, manifests and bootstrap helpers remain outside app_remainder
and retain their existing protected-path and runtime-validation requirements.

Focused fixture regressions:

```
env -i PATH="$PATH" HOME=/tmp node node_modules/vitest/vitest.mjs run tests/unit/publishing-payload-cleanup.test.ts tests/unit/dockerignore-scan-sensitive-paths.test.ts tests/unit/production-simulation-copy.test.ts tests/unit/deployment-pack-reentry.test.ts --maxWorkers=2
```

These fixtures test selection, copying, packing, authorized cleanup and
measurement. They are not a full application build or successful publication.

## Publishing cache lifecycle

The publishing entry point gives its npm child a private, mode-0700 temporary
cache directory outside the payload. XDG, npm (both environment spellings),
Node compile, BoosterState Cargo, pip and uv caches point into that directory.
The override is child-only: HOME, credentials, workspace cache locations and
Python environments are not changed. Only the newly allocated directory is
removed when npm exits, including failure exits.

Nix/Python closure accounting runs before physical cleanup. The image budget
uses cleanup's returned measurement, and a final read-only exclusion/symlink
assertion runs after journal completion. A late writer still fails publishing;
there are no retries, exemptions for `.cache`, or suppressed safety checks.

Physical cleanup is dependency-ordered: remove excluded configuration/source
inputs first, rescan and validate surviving links, then remove policy-excluded
`.cache` roots once. This includes an excluded cache first created during input
removal. Non-excluded caches are retained and measured. Writes after the cache
phase still fail the final assertion; cache files are not permitted to survive.

Cache-isolation and entry-point verification:

```
env -i PATH="$PATH" HOME=/tmp node --test tests/publishing-cache-isolation.test.mjs tests/publishing-build-entry.test.mjs tests/deployment-recovery-location.test.mjs
```

The configured-entry fixtures deliberately inherit in-payload cache paths,
write to redirected caches during the build and on child exit, and inspect the
payload after npm and the publishing helper have exited.