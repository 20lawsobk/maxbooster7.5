---
name: PDIM capsule build must flush before returning
description: PocketDimension.write() persists chunk blobs immediately, but the index and pocket-level metadata only hit disk on close()/flush(); a builder that writes then returns without flushing can look correct when checked in the same process but be empty on disk for any other process.
---

Any writer using the Pocket Dimension engine must call `flush()` (or `close()`) after its last write, before returning or claiming success — chunk blobs land on disk immediately, but the path→chunk index and the pocket's own metadata are otherwise only durable at flush/close time.

**Why:** a same-process read right after writing can pass purely by hitting the process-local pocket-manager cache, silently masking a missing on-disk index. The failure only surfaces when a *different* process later opens the same pocket and finds it empty.

**How to apply:** treat same-process "verify after build" as insufficient proof of durability — confirm persistence via a genuinely separate process (new `node`/`tsx` invocation), not just a second `await` in the same test.
