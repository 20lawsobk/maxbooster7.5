---
name: PDIM capsule restore uses bsdtar, not GNU tar
description: Why capsule extraction switched from GNU tar to bsdtar/libarchive, and the risk to watch for
---

GNU tar's "Directory renamed before its status could be extracted" overlayfs
race (RHEL 3449271 / Ubuntu #1728489 / moby/moby #19647) recurred even after
scratch-dir atomic-swap and exit-code tolerance workarounds. The real,
tool-level fix: libarchive added `ARCHIVE_EXTRACT_ATOMIC` and bsdtar enables
it by default — atomic directory creation avoids the create→rename window
the kernel race lands in. `dist/pdim-restore.mjs` now prefers `bsdtar` (added
via `installSystemDependencies(["libarchive"])` → `replit.nix`), falling
back to GNU tar + the exit-code-1-tolerance path only if bsdtar is absent.

**Why bundling wasn't needed:** `start.sh` manually bundles a portable Node
binary (`.node_bin/`) because Node is provisioned as a separate "language
module," not a `replit.nix` package, and that module isn't included in the
VM deploy image. Plain `replit.nix` packages (e.g. `ffmpeg`, now
`libarchive`) ARE confirmed present at runtime in this app's Reserved VM
deploys — ffmpeg-based beat-preview trimming already worked in production
before this change. Do not assume every native binary needs Node-style
manual bundling; check whether it's a language-module dependency (bundle it)
vs. a plain nix package (trust replit.nix) first.

**Unverified as of 2026-08-22:** this fix has not yet been confirmed against
a real production deploy log (only dev-workflow tested + syntax-checked).
Don't declare the crash loop resolved until a fresh prod log shows a full
boot: bsdtar extraction log line → sanity check pass → real server bind →
health check pass.
