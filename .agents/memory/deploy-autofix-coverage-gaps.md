---
name: Deployment autofix system coverage gaps
description: Two structural blind spots found and CLOSED in scripts/deployment-autofix.mjs's error coverage; how each was fixed and the pitfall avoided along the way.
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

**Pitfall hit while building the fix, worth remembering for any future
image-size check on this project:** the obvious approach — raw `du` on the
whole project root — is a false-positive machine. This workspace measured
~12 GiB via plain `du`, almost entirely gitignored dev-tooling caches
(`.cache`, `.pythonlibs`, `uploads`, `.local`, etc.) that never reach the
deploy image, vs. ~0.5 GiB actually `git ls-files`-tracked. The correct
measurement is: git-tracked file bytes + built `dist/` output + the real
post-compression capsule sizes already returned by `packCapsule()` (don't
re-derive those with `du` — the exact number is already in hand). Any
future size/footprint check on this repo must use tracked-file accounting,
not directory-level `du`, or it will constantly block on phantom weight.

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
