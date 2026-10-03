# Publishing cache review and correction

## Review evidence

The reported publishing attempt completed compilation and all five capsules,
then failed because `.cache` was present at the post-cleanup exclusion scan.
This establishes late or recreated excluded state; it does not identify the
writer. The independent review rejected the prior diagnostics-only change as
a fix.

The review identified a separate, definite sequencing defect: Nix accounting
launched Python after cleanup and after payload measurement. That subprocess
could create new cache state without another exclusion check.

## Changes

- Isolate publishing-child cache locations outside the payload before npm/tsx
  starts, including the explicit BoosterState Cargo cache setting.
- Preserve inherited workspace caches, HOME and credentials. Remove only the
  private directory created for that invocation, after npm exits.
- Perform Nix accounting before final physical cleanup; use the cleaned
  measurement for the unchanged image budget.
- Assert that no excluded entries or unsafe surviving links remain after the
  journal completes. Unexpected late writers remain fatal.

## Verification and limits

15 Node tests and 46 Vitest tests passed, plus build-script syntax and diff
whitespace checks. The configured publishing-command fixtures use real npm,
tar/zstd, packing, cleanup and recovery; they test cache writes during build and
at process exit with inherited cache paths originally inside the fixture.
Negative tests retain the failure for recreated caches and unsafe links.

A small temporary Python startup file trace did not reproduce the original
cache creation. The specific writer in the failed publishing container remains
unconfirmed. The cache redirection and sequencing corrections are verified in
fixtures, not by a successful full publish.

No full application build, workspace-environment deletion, retained-simulation
cleanup, application restart, shared database access or publication was
performed. A subsequent real publish is needed to confirm that no platform
writer bypasses the redirected cache environment.