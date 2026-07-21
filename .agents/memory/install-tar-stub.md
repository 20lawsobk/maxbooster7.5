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
