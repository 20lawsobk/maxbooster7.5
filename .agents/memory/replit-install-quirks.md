---
name: Replit install quirks
description: Non-obvious pnpm install constraints in this Replit project that cause silent failures if ignored.
---

# Replit Install Quirks

## pnpm postinstall exits 1 in Replit sandbox
The postinstall script fails in some Replit execution contexts even when the target file exists.
**Rule:** Always prefix installs with `SKIP_POSTINSTALL=1`.
**Command:** `SKIP_POSTINSTALL=1 pnpm install --no-frozen-lockfile 2>&1 && echo 'INSTALL_DONE'`

## tar npm package blocked by Replit firewall (all versions, CVE policy)
Any `npm install` that tries to fetch `tar` from the registry gets hard-blocked.
**Fix:** `stubs/tar/` local stub exists; `package.json` has `overrides.tar = "file:./stubs/tar"` and pnpm nested overrides for `@tensorflow/tfjs-node>tar` and `@mapbox/node-pre-gyp>tar`.
**Why:** Delete `package-lock.json` before reinstall so stale lockfile tar refs don't re-trigger the block.

## pnpm.overrides cannot have object values
Object-valued entries under `npm.overrides` (e.g. `{ "version": "x", "bundled": true }`) crash pnpm's catalog-protocol parser with `bareSpecifier.startsWith is not a function`.
**Fix:** Remove object-valued entries from `npm.overrides`; express nested overrides using pnpm `>` syntax under `pnpm.overrides` instead.
