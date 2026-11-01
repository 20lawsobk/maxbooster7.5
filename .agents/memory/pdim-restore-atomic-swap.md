---
name: PDIM restore atomic scratch-dir swap
description: Why node_modules capsule restore extracts to a scratch dir and renames into place instead of extracting directly onto the live target path
---

`tar: <path>: Directory renamed before its status could be extracted` during a **single** tar invocation extracting node_modules (not two racing processes) is a well-documented GNU tar/overlayfs extractor race (RHEL/Docker/Ubuntu kernel bug reports all show the identical message for large nested node_modules-style trees) triggered by thousands of nested mkdir/rename ops landing on a path that already has directory entries — happens on container/overlay filesystems regardless of whether anything else is touching the tree.

**Why:** A PID lockfile (preventing two concurrent restores of the same target) does NOT fix this — the failure reproduces within one lone extraction. The actual fix is extracting into an empty, never-before-seen scratch directory (`.pdim-scratch-<target>-<pid>`) and swapping it into the real target path with a single `renameSync` only after the archive is fully verified (checksum match). This removes any pre-existing directory entries for tar to collide with, and makes the live-path mutation atomic instead of thousands of individual creates.

**How to apply:** Any capsule/tarball restore onto a path that will hold many thousands of files (node_modules, vendored deps) should follow the same pattern: extract to scratch → verify → rm old target → rename scratch/<target> onto real target → write sentinel. Keep a PID lock too (cheap, harmless, guards true multi-process races) but don't rely on it alone for this class of failure. Implementation lives in `dist/pdim-restore.mjs` (git-tracked static file, not build-generated).

Separately, Replit's own health-check docs confirm: the platform's health check times out if `/` doesn't respond within ~5s of container start, and the health check reaches the container over the network so a liveness/boot-stub server must bind `0.0.0.0` explicitly, not just the default/loopback interface — see `scripts/boot-stub-server.mjs`.
