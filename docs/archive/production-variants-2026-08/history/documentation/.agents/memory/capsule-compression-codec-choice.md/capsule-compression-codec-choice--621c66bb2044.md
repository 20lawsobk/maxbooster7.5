---
name: Deploy capsule compression codec choice and verification method
description: Real zstd/xz/gzip benchmark results for this project's deploy capsules, and how to validate a codec swap without corrupting live data
---

# Deploy capsule compression: codec choice + verification method

## The decision
zstd at level 19 with a long-distance-matching window (`--long=27 -T0`) beats both gzip-9 and xz-9e simultaneously on ratio, compress time, AND decompress time for this project's actual capsule content (dependency trees / vendored subsystem checkouts). xz's small ratio edge (~5%) was not worth ~5x the compress time. Do not re-litigate this by guessing — the numbers below are real, on this project's real directories.

**Why:** benchmarked gzip-9 vs zstd-19 vs xz-9e against the real `external/pdim` (499M) and `node_modules` (1.6G) trees. zstd won on every axis. Confirmed again during full production verification across all four real capsule directories.

**How to apply:** if re-benchmarking after a major dependency/vendor-tree change, re-run the same three-way comparison rather than assuming the old numbers still hold — but expect zstd to keep winning for this kind of content (source/dependency trees compress very differently than already-compressed binaries).

## Critical pitfall: benchmark the real restore code path, not a hand-rolled equivalent
A naive `zstd -T0 -d | tar -x` or `tar -xzf` CLI pipe has measurably different performance than this project's actual restore path, which prefers `bsdtar` (libarchive) for atomic single-process extraction. Measured on `node_modules` (1.6G real content): a raw-pipe benchmark suggested ~15.7s to decompress the legacy gzip-9 capsule, but the real `restoreCapsule()` function (via bsdtar) actually took 25.7s. Always drive timing evidence through the actual shipped function/script, not a proxy shell command — the gap between "looks fine in a benchmark script" and "what boot actually does" can be large enough to flip a regression conclusion.

Net result after switching to zstd-19 and measuring through the real restore path both times: node_modules decompression went from 25.7s (gzip-9) to 15.2s (zstd-19) — faster, not just smaller.

## Verification technique: hardlink copies for destructive-operation testing
The real capsule packer deletes its source directory after packing (by design, to avoid double-shipping the bytes). To verify a real production directory survives a pack→restore round trip byte-identically without risking the live directory, snapshot it first with `cp -al <src> <scratch>` (hardlink copy, same filesystem). This is near-instant and uses no extra disk (inodes are shared) since it doesn't duplicate file content — only when the pack step later deletes ITS copy do the hardlinks to the original's inodes keep the real data safe. Confirmed safe and fast on multi-GB real trees (`node_modules`, `external/maxcore`, `external/pdim`).

## Gotcha: live sidecar processes make point-in-time diffs look like false failures
`external/maxcore` contains `artifacts/ai-training-server/data/local_kv.db` (+ `-shm`/`-wal`), which is actively read/written by a running child process (its own Python server) throughout normal operation. Any `diff -rq` snapshot comparison taken while that process is alive will show these 2-3 files as "differ" — confirmed via process list + mtime correlation, not a compression/restore bug. Before concluding a round-trip corrupted something, check whether the differing paths belong to a live-mutated data file rather than static vendored content.

## Testability pattern: `isMainModule` guard for a zero-dependency ESM boot script
A boot-time `.mjs` script with no framework (e.g. a capsule restore CLI invoked directly by `start.sh`) can still expose its internal functions (e.g. `restoreCapsule`, a codec→tar-flags mapper) for direct import in tests, as long as its side-effecting CLI dispatch is gated behind an `import.meta.url === pathToFileURL(process.argv[1]).href`-style main-module check. This lets a test import the real functions and call them against scratch paths without triggering the script's real dispatch against the true project root.
