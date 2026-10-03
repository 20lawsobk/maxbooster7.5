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

## Subsequent publishing evidence and cleanup order

The next real publish still failed. Expanded diagnostics identified
`.cache/replit` as the surviving subtree, after `.cache` had been scheduled for
removal. Thus the earlier cache-environment changes did not resolve the reported
failure.

Cleanup's alphabetical deletion order removed `.cache` before `.config` and
`.replit`. Cache cleanup now happens after all other excluded inputs are removed.
A fresh policy scan admits only excluded cache roots for that final deletion
phase, including ones created during input removal; surviving links are
revalidated before that deletion. No repeated cleanup, ignored error or cache
exemption was added.

Verification: 49 Vitest regressions and 15 Node publishing/recovery tests passed.
Controlled configuration-invalidation fixtures cover both initially present
and newly created caches. Non-excluded cache data is retained and measured.
Existing tests still reject recreation during cache deletion or afterward.

These fixtures model configuration-triggered cache regeneration; they do not
identify the live producer's PID or establish that it has finished writing.
The observed publishing failure is not yet verified resolved in a real build.