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