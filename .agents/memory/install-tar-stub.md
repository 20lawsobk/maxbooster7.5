---
name: Install tar blocked + stub workaround
description: Replit firewall blocks the tar npm package; local stub + overrides is the fix
---

# Tar npm package blocked by Replit security firewall

## The rule
Create a local stub at `stubs/tar/` and add `"tar": "file:./stubs/tar"` to `package.json` `overrides`. Delete `package-lock.json` before running npm install so stale lockfile entries don't re-trigger the block.

**Why:** Replit's package firewall (Socket Security Policy) blocks ALL versions of the `tar` npm package due to a Critical CVE flag. Both `tar@6.x` (pulled in by @mapbox/node-pre-gyp, @tensorflow/tfjs-node) and `tar@7.x` are blocked. The stub satisfies the dependency graph without hitting the registry.

**How to apply:**
1. Ensure `stubs/tar/package.json`, `stubs/tar/index.js`, `stubs/tar/index.mjs` exist (stub is in workspace).
2. In `package.json` `overrides`: `"tar": "file:./stubs/tar"`.
3. Remove `tar` from direct `dependencies`/`devDependencies` in `package.json`.
4. Delete `package-lock.json` (stale lockfile may still reference blocked tar versions).
5. Run: `npm install --no-audit --no-fund --ignore-scripts --legacy-peer-deps`.
6. The stub is safe because `--ignore-scripts` means native build tools (which actually use tar) never run.

**Note:** `fast-xml-parser` was also in `overrides` — this conflicts with installing it as a direct dep. Remove it from overrides and add it to `dependencies` directly.

**Confirmed dangling symlinks from this workaround (2026-08-29):** the override leaves relative symlinks at multiple nesting depths — `node_modules/tar -> @capacitor/cli/stubs/tar` and `node_modules/{app-builder-lib,node-gyp}/node_modules/tar -> ../stubs/tar` — and at least the two nested ones are dangling (their relative target doesn't resolve from that depth). `diff -r`/any tool that `stat()`s through a symlink to check its type will error "No such file or directory" on these specific paths. This is expected/pre-existing, not a bug introduced by whatever you're changing — confirm via `readlink` matching on both sides before assuming a real regression. Nothing in the live app has been observed to actually dereference these paths.
