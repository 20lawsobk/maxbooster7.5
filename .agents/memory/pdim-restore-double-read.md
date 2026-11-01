---
name: PDIM capsule restore double-read bottleneck
description: Checksumming a capsule fully before extracting it reads the file twice; for large capsules that alone can exceed a deploy platform's startup-probe window even after extraction is parallelized across capsules.
---

Even after parallelizing the four capsule restores with `Promise.all` and fixing the
event-loop-blocking sync hash (see pdim-restore-sync-hash-blocks-loop.md), the largest
capsule (`node_modules.pdim`) still never reached its "Extracting ..." log line within
the platform's crash-restart window. Root cause: the restore script read the entire
capsule once to compute its sha256, then handed the same file path to `tar` which read
it a second time to decompress it. Two full sequential reads of a very large file is
enough by itself to blow a startup-probe timeout, independent of any concurrency bug.

**Fix:** stream the capsule once — `fs.createReadStream(capsulePath).pipe(child.stdin)`
into `tar -xzf - -C ROOT` (stdin extraction) — while also feeding the same chunks into
the running sha256 hash via the stream's `data` event. Checksum verification happens
after `tar` exits, using the hash accumulated during the single pass, instead of a
separate up-front read.

**Why:** on a deploy target with an enforced startup-probe timeout, minimizing I/O
passes over the largest shipped artifact is often the deciding factor for whether boot
finishes in time at all — parallelizing across capsules only helps once the per-capsule
critical path itself is minimal.

**How to apply:** any time a script must both verify and consume a large file
(checksum + decompress, checksum + upload, etc.) under a tight time budget, look for a
way to do both in one streaming pass rather than reading the file twice.
