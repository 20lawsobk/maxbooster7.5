---
name: Vitest timeout and sharding hygiene
description: Distinguish runner timeouts from test failures, isolate subprocess-heavy tests, and combine sharded coverage correctly.
---

## The trap
`vitest.config.ts` sets `testTimeout: 15000` globally and runs files under `pool: "forks"`. Tests that shell out to real CLI tools (zstd, xz) or spin up `worker_threads` pools are fast in isolation (sub-second to ~1s each) but when multiple such heavy files run concurrently — e.g. a manual `vitest run fileA fileB fileC` invocation, especially right after a container restart — CPU/process contention can blow even a generous per-test override (one pre-existing test with a 60s override still timed out under this contention).

**Why:** confirmed directly — a new compression round-trip test file plus a pre-existing capsule cross-process test both failed with timeouts when run together, but every single test passed cleanly (some in under 100ms) when each file was re-run alone immediately after.

**How to apply:** if a vitest test that does real subprocess/worker-thread work times out, re-run that one file alone before concluding it's a real regression — contention from concurrent heavy files (including ones you didn't touch) is a more likely explanation than a logic bug, in this project specifically. Give CLI-subprocess-heavy tests an explicit per-test timeout override (20-30s+) rather than relying on the tight 15s global default, matching the pattern already used by the pre-existing capsule test.

## Sharded coverage and clean environments

When the test command is terminated at the shell/tool execution limit, check its elapsed time and completed-file count before calling it a test failure. Run disjoint Vitest shards into separate coverage directories, then merge their `coverage-final.json` maps and evaluate the unchanged global thresholds once. Each shard can correctly exit nonzero because its partial coverage is below the full-suite threshold even when every selected test passes.

For credential-free runs, invoke the repository's local Vitest entry with `node node_modules/vitest/vitest.mjs` under a deliberately constructed `env -i` environment. The `npx` wrapper may fail before starting Vitest when `XDG_CONFIG_HOME` is absent. Keep separate JUnit and coverage outputs per shard so test-file overlap and the merged coverage can be checked.

**Why:** A 300-second shell limit stopped an unsharded run before Vitest completed; two non-overlapping halves completed in about two minutes each. The first unsanitized attempt also had one local Redis fixture fail its bounded connection retries, while an isolated run and the clean full shard passed it, consistent with startup contention rather than a product-test assertion failure.

**How to apply:** distinguish the outer command deadline from Vitest's per-test timeout; run shards with separate output paths and a clean environment; confirm their test-file sets are disjoint and complete; merge raw coverage before deciding whether the original thresholds pass. If a local service fixture hits retry exhaustion under load, confirm readiness is bounded and rerun it in isolation before attributing the failure to product behavior.
