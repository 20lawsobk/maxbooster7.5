---
name: Cluster worker heap must be clamped to real VM RAM
description: A flat "--max-old-space-size" ceiling per deployment tier (not derived from actual free memory) can massively overcommit heap on a small VM and stall the whole process for tens of minutes.
---

## Rule

In `server/cluster.ts`, each forked worker's `--max-old-space-size` (workerHeapMB) must be derived from the VM's actual `sizing.freeMemGB` (from the shared `computeWorkerSizing()`), clamped by a tier ceiling (e.g. 4096MB deployed / 3072MB dev) — never applied as a flat per-tier constant on its own.

## Why

The prior code set `workerHeapMB = isDeployment ? 4096 : 3072` unconditionally. On a small deployed VM (observed: 1.9GB total RAM, 1.2GB free, 1 worker), a worker was launched with a 4096MB V8 heap ceiling — over 2x physical RAM. As heap usage grew toward real memory limits (well before V8 itself felt heap pressure at 4096MB), the OS thrashed/reclaimed aggressively, stalling the entire single-threaded event loop — including all logging — for ~40+ minutes during startup (observed as a real gap between two adjacent startup log lines with the same timestamp, i.e. logs buffered during the block and flushed together once it cleared). Every request during that window got a generic 500 with no application error logged, because the error never reached Express's error middleware — the process was just frozen.

## How to apply

Compute `workerHeapMB` AFTER `sizing.workerCount` is known: `min(tierCeilingMB, floor(freeMemGB * 1024 * 0.6 / workerCount))`, floored at a sane minimum (512MB). Log a warning when the real cap falls below the tier ceiling so a future undersized-VM regression is visible in boot logs instead of silently causing a multi-minute stall. This is a sibling gotcha to `pdim-startup-gap-cap.md` (28-min PDIM queue drain) — same symptom class (long unexplained startup stall on a resource-constrained deployment), different root cause (V8 heap/RAM overcommit, not PDIM AIMD gap).
