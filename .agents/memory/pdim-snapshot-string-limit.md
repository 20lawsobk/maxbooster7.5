---
name: Snapshot single-string ceiling
description: Whole-store persistence must support files larger than V8's maximum string.
---
PDIM snapshots can exceed V8's roughly 512 MiB single-string ceiling. Both serialization and restoration must process bounded pieces while retaining checkpoint consistency and journal watermarks.

**Why:** Real periodic saves failed with `RangeError: Invalid string length`; merely changing the writer would make the next restart fail in a whole-file reader.

**How to apply:** Exercise a snapshot larger than the runtime string limit, not only small fixture round-trips. Keep CPU-heavy verification separate from the live app where possible. Streaming disk writes alone do not eliminate synchronous serialization stalls.

Moving JSON serialization to a worker is insufficient if the entire snapshot
is passed as workerData: structured cloning itself can block the main thread
for seconds. Capture mutable containers while holding the checkpoint boundary,
retain immutable strings, and transfer bounded batches with event-loop yields.
Publish and compact only after the writer has exited successfully.

**Why:** A 545 MB test blocked for roughly seven seconds during a whole-object
worker transfer; container capture plus incremental transfer reduced the
capture pause to milliseconds while preserving all entries.

**How to apply:** Measure capture latency separately from background write
duration and verify mutation isolation, failed writes, and large restoration.
Eval workers should not inherit application TS loaders or CLI input-type flags.