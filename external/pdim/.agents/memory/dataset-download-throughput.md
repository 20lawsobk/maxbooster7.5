---
name: Dataset download throughput
description: Why the dataset download queue drains slowly and what actually moves the needle (vs. what doesn't).
---

# Dataset download queue throughput

The download queue (16k+ rows) is NOT bottlenecked by local config in the way it looks.

**Bottleneck is per-request external latency + source rate-limits, not local parallelism.**
- The queue was strictly serial (one global lock) so a single large slow download (e.g. a 1.4 GB file) blocked the entire backlog behind it. Fixed by a bounded-parallel worker pool + a byte-budget semaphore (keeps memory safe because each file is fully buffered in RAM before erasure-coding).
- Raising download concurrency helps up to a point, then HURTS: at concurrency ~12 a clean steady-state was ~340 terminal rows/min; at ~32 it dropped to ~40/min — the external sources throttle many concurrent connections, making every request slower. **Sweet spot was ~12.** Tune via `DOWNLOAD_CONCURRENCY` / `DOWNLOAD_MEMORY_BUDGET_MB`.

**The "300 GB / 100 TB" target data does not exist.**
- Of ~556 rows that "completed" in a 5-min sample, only ~18 had real bytes (~820 MB); ~538 were zero-byte "complete" (sources resolve to empty/nothing), the rest error/skip. Historically ~2% of rows actually download data.
- So the queue drains fast in row-count but stores very little real data. A "10-minute full drain" of the row count is roughly attainable, but it does NOT mean hundreds of GB were stored — that volume isn't available upstream.

**Why:** measured reality, not theory — re-measuring after each restart is noisy because FIFO recovery serves a stretch of slow real downloads first; measure over ≥60s of steady state.

**How to apply:** before promising a drain ETA, separate row-count throughput from real-bytes-stored (`size_bytes > 0`). Don't chase impossible byte targets by cranking concurrency — it backfires via throttling and turns real downloads into 429 errors.
