---
name: PDIM bulk-store RAM constraint
description: Why bulk-downloading external files into PDIM must cap per-file size and serialize writes
---

# PDIM whole-file buffering constrains bulk ingestion

`pocket.write(key, data)` in the PocketDimension engine buffers the **entire file in RAM**
(readFile -> gzip -> Buffer.concat) — there is **no streaming write API**. Combined with a
small V8 heap (~2.19 GB) and ~1-2 GB free container RAM, any path that stores many/large
external files must:

- **Cap per-file size** before storing (a single oversized file can OOM the process).
- **Serialize the readFile+write step** across all concurrent workers (only ONE file
  buffered+compressed at a time) — network download (stream-to-temp-file on disk) can stay
  parallel, but the RAM-heavy store step must be a mutex (promise-chain lock).
- **Stream downloads to a temp file on the workspace volume**, not `/tmp` (only ~28 GB) and
  not into memory.

**Why:** Discovered while lifting the HuggingFace per-dataset shard cap to pull ALL shards.
Without these controls, concurrent multi-shard pulls exhaust the heap instantly.

**How to apply:** Any future bulk-ingestion into PDIM (or any feature calling `pocket.write`
on attacker/network-sized data) needs a per-file byte cap + serialized write lock + disk
headroom guard. Also: per-file failures must skip-and-continue, not abort the whole batch,
or one bad shard discards everything already stored.

**OOM crash-loop interaction:** The dataset download service buffers each whole file in RAM
(`streamToBuffer`) then EC-encodes it, so `MAX_CONCURRENT_DOWNLOADS > 1` runs several large
buffers at once and the OS SIGKILLs the process (exit 137 — container RAM, not the V8
`--max-old-space-size`). Once the download queue persists and re-arms the full backlog on
every boot, that turns into a permanent crash-loop (boot → recover backlog → OOM → repeat).
Keep `MAX_CONCURRENT_DOWNLOADS = 1` until the streaming-write rewrite lands; raising it
reintroduces the loop.
