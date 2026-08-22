---
name: PDIM restore — only node_modules should block boot
description: Blocking server startup on ALL capsules (not just the one Node actually needs to import code) can burn through a deploy platform's startup-probe timeout even after extraction is fully parallelized and I/O-optimized.
---

Even with capsule extraction fully parallelized (Promise.all) and I/O-optimized (single
streaming pass for hash+extract, see pdim-restore-double-read.md), a cold boot still
failed the deployment's startup-probe window: extracting node_modules + python_runtime +
external/maxcore + external/pdim concurrently (~3.6GB combined at rest) took longer than
the platform's per-attempt timeout, so the app's `exec node dist/cluster.mjs` — which only
runs after ALL FOUR capsules finish — never happened in time, and the port never opened.

**Fix:** recognize that only `node_modules` has a genuine hard dependency — Node cannot
import anything without it. The other three are consumed by subsystems that already
start asynchronously after the server is listening and already tolerate the backing
files not being there yet (Python AI sidecar logs a WARNING and falls back; MaxCore's
local supervisor reports its readiness probe as degraded/unreachable via the existing
circuit-breaker/reachability design; external/pdim isn't imported by the running app at
all). So: restore node_modules synchronously and block on it (`node dist/pdim-restore.mjs
critical`), then kick off the other three in a detached background process (`node
dist/pdim-restore.mjs background &`) that keeps running after `start.sh`'s `exec` replaces
the shell — the app binds its port almost immediately, and the remaining subsystems come
online a short while later once their capsules finish extracting.

**Why:** a deploy platform's startup-probe timeout budgets the time until the port opens,
not the time until every subsystem is fully warm. Anything already designed to degrade
gracefully should never be allowed to gate that first port bind.

**How to apply:** when a boot sequence blocks on multiple heavy resources before starting
the server, audit which ones the process literally cannot run without (hard dependency)
versus which ones are used by code paths that already have fallback/degraded-mode
handling — only the former belong on the blocking critical path.
