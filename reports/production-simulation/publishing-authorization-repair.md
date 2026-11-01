# Publishing authorization repair evidence

## Confirmed

- The supplied October 2 error was a pre-npm guard rejection, not the historical
  simulation restore failure.
- Official configuration/publishing documentation guarantees the deployment
  runtime indicator on published apps, not as mandatory build evidence.
- The helper repair documented the new entry point, but the configuration
  remained on the legacy command until the wiring correction recorded below.
- Real small-fixture tests run that entry point through real npm and tar/zstd,
  including absent, empty and runtime-present indicators, repeated builds,
  SIGKILL interruption, byte-identical recovery, protected-file preservation,
  later edits, mismatched roots and non-mutating authorization rejection.
- Recovery snapshots are external to the shipped tree and stable across reentry.
- Focused cleanup and recovery regression suites pass without app startup.

## Full-build capacity gate

A temporary `/tmp` reservation of 17 GiB failed with `Disk quota exceeded`.
The probe was removed. This is the prior conservative full-build scratch
allowance, not a platform deployment storage requirement. `df` reported over
31 GiB available at that path, which does not establish quota headroom.
Existing source trees alone total approximately 4.42 GiB across node_modules,
Python, MaxCore and PDIM, before the rest of the copy, snapshots and outputs.

No full disposable application build was attempted because adequate capacity
was not verified. No subsequent application-build blocker was observed in this
task. No restore/startup/readiness claim or publication-success claim is made.
No services were started, no shared database was accessed, and no existing
simulation copy, user data or working source was deleted to free storage.

The earlier simulation's successful build and quota-limited restore remain
historical evidence only; they do not validate this publishing command.

## October 3 configuration wiring correction

The screenshot at
`attached_assets/0_Screenshot_20261003-051856_Chrome_1791019219860.png`
records a pre-npm root-authorization refusal. The configured legacy command
exported authorization variables and called `--recover`, rather than using
the repaired helper's publishing entry point.

The platform configuration was changed to:

```
["node", "script/lib/deploymentPackRecovery.mjs", "--publish-disposable-copy", "."]
```

A hash comparison excluding only the deployment build line confirmed that
all other configuration remained unchanged, including target, run command,
ports and unrelated settings.

Verification passed: 22 Node tests plus 34 focused Vitest regressions.
The entry fixtures now derive their command from the actual `.replit` build
array and exercise real npm, packing, cleanup and recovery. They count exactly
one npm build per invocation, verify canonical root authorization with absent
or empty runtime indicators, and verify inherited authorization is rejected
without npm execution or changes to fixture source/data.

No full application build, workflow start, shared-database access, or
publication was performed. Fixture results do not establish full-build or
publication success. Full-build validation remains with its existing
capacity-gated validation task; no existing copies were deleted for space.

## Workspace Python environment exclusion evidence

The workspace contains `venv/bin/.python-wrapped` pointing to an external Nix
interpreter. The policy previously excluded `.venv` but not the root `venv`.
The narrowly rooted `/venv/` publishing rule and matching top-level simulation
exclusion now omit that development environment without excluding nested
dependency directories named `venv`.

Verification: **43 Vitest regressions and 22 Node publishing-entry/recovery
tests passed**. The fixture evidence covers:

- Real-policy app-remainder member selection omits root environment regular
  files and a Python-wrapper symlink chain ending outside the disposable root.
- Portable runtime capsules, manifests and startup helpers are not nested into
  app_remainder and remain available to protected-path cleanup validation.
- Authorized cleanup and payload measurement skip the excluded environment,
  preserve required artifacts, and leave external interpreter bytes unchanged.
- The real simulation copier omits the environment before traversal, retains
  nested dependency directories and portable runtime sources, and preserves
  source-environment links and external target bytes.
- The configured publishing command runs real npm and tar/zstd fixture builds
  with the actual publishing policy, including cleanup and recovery reentry.
- Surviving external, broken, cyclic and excluded-target links still fail
  before any excluded environment data is removed. Existing authorization,
  protected-file and recovery tests remain passing.

No full application build or publishing attempt was made. No application
services were started for these tests, no shared database was accessed, and no
workspace Python environment or retained simulation copy was altered or deleted.
The existing capacity-gated full-build validation remains separate.