# Publishing authorization repair evidence

## Confirmed

- The supplied October 2 error was a pre-npm guard rejection, not the historical
  simulation restore failure.
- Official configuration/publishing documentation guarantees the deployment
  runtime indicator on published apps, not as mandatory build evidence.
- The configured command now uses the dependency-free publishing entry point.
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