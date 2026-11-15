---
name: Deployment autofix system coverage gaps
description: Durable accounting rules for deployment image preflight and live TypeScript diagnostic coverage.
---

## RESOLVED — build-stage blind spot (no coverage past `npm run build`)

`scripts/deployment-autofix.mjs` only classifies TS/lint/schema/import/runtime
errors and runs entirely before the real `npm run build` (script/build.ts:
vite → esbuild bundles → optional Python provisioning → capsule packing).
That later stage used to have zero classification — the direct cause of 3 of
4 consecutive deploy failures hitting the platform's raw "image size is over
the limit of 8 GiB" rejection with no attribution of which directory caused it.

**Fix applied:** `script/build.ts` now runs a pre-flight image-size check
right after capsule packing, and `error-fix-configuration.json`'s
`runtimeAndInfra` gained `deploy-image-size-exceeded` (reportOnly) and
`build-command-failure` (manualRequired) entries. `validate-error-research.mjs`
gained a drift check that fails if the build.ts check and the config entry
ever get out of sync.

**Rule:** Image preflight must add the deduplicated transitive Nix closure to
git-tracked payload bytes, built output, and real post-compression capsule
sizes. It must fail closed when a required payload or Nix root cannot be
measured; printing a caveat and returning PASS is not mitigation.

**Why:** Replit's 8 GiB image limit includes Nix layers. A payload-only check
reported 1.10 GiB and passed while CUDA and chip-design dependencies made the
Nix closure exceed the platform limit by itself. Raw project-root `du` is the
opposite error because ignored development caches do not ship.

**How to apply:** Use tracked-file accounting instead of workspace `du`; use
the Nix registration database's `narSize` and reference graph to compute one
deduplicated closure for the build environment; list per-root closure sizes
only for attribution because those overlap and must not be summed.

## RESOLVED — TS-diagnostic coverage self-check read a stale snapshot

`scripts/validate-error-research.mjs` used to diff `typescriptDiagnostics`
keys against committed `reports/fix-all/tc-server-current.txt` /
`tc-client-current.txt` files that were hand-refreshed and went ~24 days
stale with nothing to notice.

**Fix applied:** the validator now runs its own fresh `npx tsc -p <tsconfig>
--noEmit` for both `tsconfig.server.json` and `tsconfig.client.json` at
validation time and extracts `TSxxxx` codes from that live output — no
committed snapshot file involved anymore. The stale `-current.txt` files
were deleted (confirmed via grep they were referenced nowhere else).
`error-fix-configuration.json`'s `liveTsSnapshot` block now points at
`tsconfigs: [...]` instead of `sourceFiles: [...]`.

**Cost to know about:** this makes `validate-error-research.mjs` take
~1.5-2 minutes (it runs two full split typechecks), same order of
magnitude as the existing `fix-all.mjs` verify phase already accepted
elsewhere in this pipeline. Don't run it concurrently with another tsc
process or the live app workflow (see the sectioned-typecheck /
typecheck-oom memory entries for why).
