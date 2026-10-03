---
name: Snapshot single-string ceiling
description: Whole-store persistence must support files larger than V8's maximum string.
---
PDIM snapshots can exceed V8's roughly 512 MiB single-string ceiling. Both serialization and restoration must process bounded pieces while retaining checkpoint consistency and journal watermarks.

**Why:** Real periodic saves failed with `RangeError: Invalid string length`; merely changing the writer would make the next restart fail in a whole-file reader.

**How to apply:** Exercise a snapshot larger than the runtime string limit, not only small fixture round-trips. Keep CPU-heavy verification separate from the live app where possible. Streaming disk writes alone do not eliminate synchronous serialization stalls.