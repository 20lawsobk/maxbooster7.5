---
name: PocketDimension durability
description: Why fabric chunk writes need an explicit flush, and how index persistence works
---

# PocketDimension index persistence

`PocketDimension` (artifacts/api-server/src/pocket-dimension/index.ts) keeps its
key→chunk index (`entries`/`chunks` maps) in memory. Chunk **blobs** are written
to disk immediately on `write()`, but the **index** (`index.json` + `metadata.json`)
is only persisted by `persistMetadata()`, which historically was called *only* from
`close()`.

**Why this bites:** a SIGKILL/crash restart never runs `close()`. After reboot,
`open()` finds no `index.json` and starts with empty maps, so every chunk read
returns null even though the blob is still on disk. For the erasure fabric this
surfaced as `Object unrecoverable: only 0/N shards available` after a restart.

**How to apply:**
- Any consumer that needs write durability (the fabric `PocketDimensionChunkStore`)
  must call the public `flush()` after mutating writes/deletes — do not rely on
  graceful shutdown.
- `flush()` is serialized + coalesced (a single trailing persist runs after the
  last mutation) so concurrent writers can't have a slow older persist overwrite
  newer index state.
- `persistMetadata()` writes atomically (temp file + rename) so a crash mid-write
  can't truncate `index.json` and lose the entire pocket.
- The redis store has its own ~5s flush timer, so it was unaffected; this gap was
  specific to the fabric chunk store path.
