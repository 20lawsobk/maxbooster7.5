---
name: Dependency install (pnpm hoisted + run via workflow)
description: How to install deps for this repo — pnpm needs hoisted layout, and the install must run as a workflow, not a detached bash process.
---

# Installing dependencies in this repo

Two non-obvious constraints, both learned the hard way during a from-scratch import (empty `node_modules`).

## 1. pnpm MUST use a hoisted (flat) node_modules

`.npmrc` carries `node-linker=hoisted`. **Do not remove it.**

**Why:** server code imports transitive deps that are NOT declared in `package.json`
(confirmed example: `msgpackr`, imported by `server/lib/luaExecutor.ts`). Under npm's
default flat hoisting these were accidentally importable; pnpm's default isolated
(symlinked) layout only exposes *declared* deps, so the app crashes at boot with
`ERR_MODULE_NOT_FOUND: Cannot find package 'msgpackr'`. The whole repo assumes a flat
tree anyway (`start.sh`, the PDIM capsule packer, security-fix patches all walk a flat
`node_modules`). `node-linker=hoisted` makes pnpm reproduce npm's flat layout.

**How to apply:** install with `pnpm install` (lockfile is `pnpm-lock.yaml`). If a future
boot dies on `Cannot find package 'X'` for an undeclared dep, the fix is the hoisted
linker (already set), NOT adding X to package.json. `pnpm-workspace.yaml` uses
`onlyBuiltDependencies:` to allow native builds (bcrypt, @tensorflow/tfjs-node, sharp,
esbuild, etc.); electron/electron-winstaller are excluded (desktop-only).

## 2. Run the install as a WORKFLOW, never a detached bash process

**Why:** long-running background processes spawned from a bash tool call get reaped by
the sandbox when the foreground command returns — even with `setsid`, `nohup`, or
`disown`. Symptom: the process vanishes mid-link leaving a 0-byte log and no exit
sentinel. This was repeatedly misdiagnosed as OOM; it also happens with healthy memory
(5+ Gi free). Replit's workflow supervisor runs the process persistently across tool
calls, so it survives.

**How to apply:** to do a heavy install, `configureWorkflow({name:"Install deps",
command:"pnpm install ... && echo DONE_OK", outputType:"console", autoStart:true})`,
poll `getWorkflowStatus` until `state:"finished"` and the DONE sentinel prints, then
`removeWorkflow` it. Separately, plain `npm install` here OOMs (exit 137) and corrupts
native binaries (tsx, @esbuild/linux-x64) — use pnpm.

## Boot baseline after a clean install

`Start application` = `npm run dev` (→ `tsx server/index.ts`), serves port 5000.
Required env: `DATABASE_URL` + `SESSION_SECRET` (≥32). A boot-time WARN that
`relation "storefront_domains" does not exist` is non-fatal (schema not pushed to the
attached DB); app catches it and continues. Note `NEON_DATABASE_URL` is the intended
app DB (see app-db-is-neon-database-url.md) but was unset on this import, so it fell
back to `DATABASE_URL`.
