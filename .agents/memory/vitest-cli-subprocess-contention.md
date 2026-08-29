---
name: Vitest false timeouts from concurrent heavy CLI-subprocess tests
description: This project's vitest config has a tight 15s global testTimeout while some test files spawn real CLI subprocesses (zstd/xz) or worker_threads pools; running several such files together causes contention-driven timeout failures that look like regressions but aren't.
---

## The trap
`vitest.config.ts` sets `testTimeout: 15000` globally and runs files under `pool: "forks"`. Tests that shell out to real CLI tools (zstd, xz) or spin up `worker_threads` pools are fast in isolation (sub-second to ~1s each) but when multiple such heavy files run concurrently — e.g. a manual `vitest run fileA fileB fileC` invocation, especially right after a container restart — CPU/process contention can blow even a generous per-test override (one pre-existing test with a 60s override still timed out under this contention).

**Why:** confirmed directly — a new compression round-trip test file plus a pre-existing capsule cross-process test both failed with timeouts when run together, but every single test passed cleanly (some in under 100ms) when each file was re-run alone immediately after.

**How to apply:** if a vitest test that does real subprocess/worker-thread work times out, re-run that one file alone before concluding it's a real regression — contention from concurrent heavy files (including ones you didn't touch) is a more likely explanation than a logic bug, in this project specifically. Give CLI-subprocess-heavy tests an explicit per-test timeout override (20-30s+) rather than relying on the tight 15s global default, matching the pattern already used by the pre-existing capsule test.
