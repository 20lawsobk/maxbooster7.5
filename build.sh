#!/bin/bash
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
phase_cleanup() {

# ─── Purge disposable agent state ────────────────────────────────────────────
# .dockerignore already excludes .local/ (15 GB of Replit agent state) but
# Replit's repl-layer packager may use different glob semantics than Docker.
# Deleting here is a belt-and-suspenders guarantee: even if every .dockerignore
# pattern fails, cleanup prevents agent state from entering the image. The
# workspace-root .cache belongs to Replit and is excluded from release payloads;
# do not delete it while the builder may be repopulating it.
# npm ci owns the node_modules lifecycle and replaces that tree itself. Defer
# removal of compiler caches until after compilation, once, immediately before
# capsule packing. Safe: this runs ONLY in the deployment build container.
echo "==> Purging disposable agent state from build container..."
bash script/parallel-build-cleanup.sh "$PWD"
echo "   Done (agent state purged; npm-owned caches are left to npm)."
}

# ─── Bundle portable Node.js for the deployment container ────────────────────
phase_node() {
# The Replit deployment (VM) container has a MINIMAL Nix store: bash, coreutils,
# xz, tar — but ZERO nodejs.  The node binary must travel with the project files.
# start.sh strategy [a] looks for .node_bin/node first — that is what we produce.
bash script/deployment/provision-node.sh

echo "==> Build env: node $(node --version 2>/dev/null || echo n/a)  npm $(npm --version 2>/dev/null || echo n/a)"
}

# ─────────────────────────────────────────────────────────────────────────────
# FAST PATH vs SLOW PATH
#
# FAST PATH — all pre-built artifacts are present in the build context:
#   • dist/public/index.html  — Vite frontend bundle (~17 MB)
#   • dist/index.mjs          — esbuild server bundle (~5 MB)
#   • dist/cluster.mjs        — esbuild cluster entry (~1 MB)
#
#   Compile step is skipped entirely. Only production deps are installed
#   (`npm ci --omit=dev`), then the locked production tree is security-audited,
#   and the source tree is deleted.  Final image: ~400–550 MB.
#
# SLOW PATH — one or more artifacts are missing:
#   source/ is present in the repl layer (client/, server/, script/ included).
#   Runs full `npm ci` + Vite/esbuild compile + production prune, then applies
#   the same fail-closed security audit and installed-tree verification.
#   Final image: ~1.2–1.5 GB.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Copy Python diffusion server (before server/ may be deleted) ────────────
phase_diffusion() {
echo "==> Preserving Python diffusion server files in services/diffusion/..."
if [ -d "server/services/diffusion" ]; then
  python3 script/lib/copy-diffusion-source.py server/services/diffusion services/diffusion
else
  echo "ERROR: server/services/diffusion/ is required for the production Python services" >&2
  exit 1
fi

PREBUILT_FRONTEND="dist/public/index.html"
}
phase_dependencies() {
PREBUILT_FRONTEND="dist/public/index.html"
PREBUILT_SERVER="dist/index.mjs"
PREBUILT_CLUSTER="dist/cluster.mjs"

# Use the Nix-managed FFmpeg in both npm install paths. ffmpeg-static supports
# FFMPEG_BIN and exits its install hook when that executable already exists;
# this avoids a fragile 80 MB GitHub release download during npm ci.
source script/deployment/ffmpeg-path.sh
if ! resolve_ffmpeg || ! verify_ffmpeg_capabilities; then
  echo "ERROR: configured FFmpeg is missing required production capabilities" >&2
  return 1
fi

# A checked-in dist/ can predate source fixes. File existence is not evidence
# of freshness: compile whenever source is available. Keep the historical
# artifact-only path for images deliberately shipped without source.
if [ ! -d client ] && [ ! -d server ] && [ -f "$PREBUILT_FRONTEND" ] && [ -f "$PREBUILT_SERVER" ] && [ -f "$PREBUILT_CLUSTER" ]; then
  echo "==> FAST PATH: artifact-only input (no application source present)"
  echo "   dist/public/, dist/index.mjs, dist/cluster.mjs ready."

  # ── Binary assets ──────────────────────────────────────────────────────────
  echo "==> Verifying binary assets in dist/public/..."
  mkdir -p dist/public/icons dist/public/screenshots 2>/dev/null || true
  cp client/public/favicon.svg  dist/public/favicon.svg  2>/dev/null || true
  cp client/public/logo.png     dist/public/logo.png     2>/dev/null || true
  cp client/public/logo.webp    dist/public/logo.webp    2>/dev/null || true
  cp -r client/public/icons/.   dist/public/icons/       2>/dev/null || true
  cp -r client/public/screenshots/. dist/public/screenshots/ 2>/dev/null || true
  ICON_COUNT=$(ls dist/public/icons/ 2>/dev/null | wc -l || echo 0)
  echo "   favicon=$([ -f dist/public/favicon.svg ] && echo yes || echo no), icons=${ICON_COUNT}"

  # ── Install production dependencies ───────────────────────────────────────
  # Source tree is still present so postinstall.mjs runs normally.
  echo "==> Installing production dependencies from the lockfile..."
  npm ci --omit=dev --no-audit --no-fund

  # ── Verify critical runtime packages were installed ───────────────────────
  # Fail the build immediately if a package that the pre-built bundle requires
  # at runtime is missing — better a clear build failure than a crash loop.
  for _req_pkg in "@sentry/node" "exceljs" "pino" "express" "drizzle-orm"; do
    if [ ! -d "node_modules/${_req_pkg}" ]; then
      echo "ERROR: ${_req_pkg} missing after npm ci --omit=dev — aborting build"
      echo "       Check package.json (must be in dependencies, not devDependencies)"
      exit 1
    fi
  done
  echo "   ✅ Critical runtime packages verified: @sentry/node, exceljs, pino, express, drizzle-orm"

  bash script/sync-subsystem-dependencies.sh
  FAST_PATH=1

else
  # ─── SLOW PATH: full compile (matches original `npm run build` behaviour) ───
  echo "==> COMPILE PATH: source present or pre-built artifacts missing — building current application"
  [ ! -f "$PREBUILT_FRONTEND" ] && echo "   missing: $PREBUILT_FRONTEND"
  [ ! -f "$PREBUILT_SERVER"   ] && echo "   missing: $PREBUILT_SERVER"
  [ ! -f "$PREBUILT_CLUSTER"  ] && echo "   missing: $PREBUILT_CLUSTER"

  if [ ! -d "client" ] || [ ! -d "server" ]; then
    echo "ERROR: Source directories (client/, server/) are required for the SLOW PATH"
    echo "       but are not present in the build container."
    echo "       Pre-build the artifacts in development with 'npm run build' and"
    echo "       commit dist/ to the repository, then redeploy."
    exit 1
  fi

  echo "==> Installing all locked dependencies (dev + prod) for compile..."
  npm ci --no-audit --no-fund

  # The lockfile overrides and postinstall patch are authoritative. The
  # production audit and installed-tree verifier below fail the build if the
  # resulting dependency tree does not satisfy the release security policy.
  echo "==> Building application (Vite frontend + esbuild server bundle)..."
  PUBLISH_SHELL_PACKS_CAPSULES=1 npm run build

  echo "   Build complete. Generated dist/ artifacts are ready."

  echo "==> Pruning dev dependencies..."
  npm prune --omit=dev --no-audit --no-fund

  FAST_PATH=0
fi

echo "==> Verifying final production dependency security..."
npm run security:audit
npm run verify:dependency-security

mkdir -p dist/deployment
cp script/deployment/ffmpeg-path.sh dist/deployment/ffmpeg-path.sh

# ─── TF native binaries (preserved for production LD_LIBRARY_PATH) ───────────
printf '%s' "$FAST_PATH" > "$DEPLOY_STATE_DIR/build-path"
echo "==> Keeping TF native libraries from tfjs-node postinstall..."
# NOTE: node_modules/@tensorflow/tfjs-node/deps/ is intentionally KEPT.
# It contains libtensorflow.so.2.9.1 (~242 MB) which start.sh adds to LD_LIBRARY_PATH.
# Removing it causes the "[start.sh] WARNING: @tensorflow/tfjs-node deps/lib not found"
# warning and degrades native TF acceleration for all ML inference in production.
# The binding/ C++ source is also kept — it is harmless and may be needed for native builds.
echo "   TF native libraries preserved (libtensorflow.so will be available in production)."
}

# ─── Rust sidecar ────────────────────────────────────────────────────────────
phase_rust() {
echo "==> Rust sidecar: compiling release binary..."
# Use the same pinned, build-only toolchain as release preparation. Ambient
# Cargo is not guaranteed in the publishing container. Failure is fatal.
CARGO_BUILD_JOBS="${DEPLOY_TASK_CPU:-2}" bash scripts/build-boosterstate.sh
rm -rf boosterstate/target/
}

# ─── node_modules stripping (both paths) ─────────────────────────────────────
phase_strip() {
echo "==> Stripping node_modules..."

rm -rf \
  node_modules/electron \
  node_modules/electron-builder \
  node_modules/app-builder-bin \
  node_modules/app-builder-lib \
  node_modules/builder-util \
  node_modules/builder-util-runtime \
  node_modules/electron-updater \
  node_modules/7zip-bin \
  2>/dev/null || true
echo "   Removed: electron / app-builder / 7zip-bin"

# NOTE: @tensorflow/tfjs-backend-webgl is intentionally KEPT.
# @tensorflow/tfjs/dist/tf.node.js has an unconditional require('@tensorflow/tfjs-backend-webgl')
# at line 25. Deleting it causes a hard MODULE_NOT_FOUND crash for every route that imports
# any shared/ml model. The WebGL backend gracefully fails to initialise in a headless Node.js
# environment and TF.js falls back to the CPU backend automatically — no user impact.

rm -rf node_modules/@tensorflow/tfjs-node/dist/kernels 2>/dev/null || true
echo "   Removed: @tensorflow/tfjs-node/dist/kernels (redundant ESM kernels)"

find node_modules/@tensorflow/tfjs/dist -type f \
  \( -name "tf.js" -o -name "tf.min.js" \
     -o -name "tf.es2017.js" -o -name "tf.es2017.min.js" \
     -o -name "tf.fesm.js"  -o -name "tf.fesm.min.js" \) \
  -delete 2>/dev/null || true
for pkg in tfjs-core tfjs-layers tfjs-converter tfjs-backend-cpu tfjs-data; do
  find node_modules/@tensorflow/${pkg}/dist -type f \
    \( -name "*.umd.js" -o -name "*.fesm.js" -o -name "*.es2017.js" \
       -o -name "*.min.js" \) \
    -delete 2>/dev/null || true
done
echo "   Removed: @tensorflow/tfjs browser bundle variants"

rm -rf \
  node_modules/@sentry/browser \
  node_modules/@sentry/vue \
  node_modules/@sentry/react \
  node_modules/@sentry-internal/browser-utils \
  node_modules/@sentry-internal/replay \
  node_modules/@sentry-internal/replay-canvas \
  node_modules/@sentry-internal/feedback \
  2>/dev/null || true
echo "   Removed: Sentry browser/replay SDKs"
echo "   Broad runtime-safe pruning is deferred to one pass after the app capsule."
}

# ─── Portable Python runtime ─────────────────────────────────────────────────
phase_python() {
  node script/lib/provisionPortablePython.mjs "$PWD"
}

# ─── App deployment capsule (Pocket Dimension engine) ─────────────────────────
phase_app_capsule() {
# Distinct from the .pdim tar capsules below (which only shrink the deployed
# image and auto-restore via dist/pdim-restore.mjs). This produces a
# checksummed, portable snapshot of the app's OWN source using the same
# content-addressed Pocket Dimension storage engine PDIM gives each end user
# — see script/build-capsule.ts. Must run here, BEFORE node_modules gets
# packed/deleted below (tsx needs it) and before the source-tree capsule step
# deletes client/server/etc.
echo "==> App capsule: building portable Pocket Dimension snapshot of app source..."
# The builder validates source identity and every stored file before reuse.
# Do not delete that verified cache before asking it to perform those checks.
if [ -f "script/build-capsule.ts" ] && [ -x "node_modules/.bin/tsx" ]; then
  _APP_CAPSULE_VERSION="${REPLIT_DEPLOYMENT_ID:-$(date -u +%Y%m%d%H%M%S)}"
  if node_modules/.bin/tsx script/build-capsule.ts "$_APP_CAPSULE_VERSION"; then
    echo "   ✅ App capsule built → deploy-capsule/"
  else
    echo "   ERROR: adaptive app capsule build failed; refusing incomplete publishing output" >&2
    exit 1
  fi
else
  echo "   ERROR: script/build-capsule.ts and tsx are required for the adaptive app capsule" >&2
  exit 1
fi

# ─── PDIM Capsule: pack large runtime directories ────────────────────────────
}
phase_packer() {
# Implements the Pocket Dimension Storage Engine "Extract & Boot" mode.
#
# Philosophy: nothing is permanently deleted (except .local/ agent state).
# Everything large is compressed into content-addressed .pdim capsules and
# restored on first startup by dist/pdim-restore.mjs.
#
# Compression: existing Zstandard deployment packer, shared with script/build.ts.
# Integrity:   SHA-256 checksum written alongside each capsule
# Format:      pdim-v2
echo "==> PDIM: Creating Pocket Dimension capsules..."

# Use the existing deployment packer; keep the adaptive app capsule above.
# Compile the dependency-free CLI before node_modules is removed.
command -v zstd >/dev/null || { echo "ERROR: zstd is required for publishing" >&2; exit 1; }
node_modules/.bin/esbuild script/publish-capsules.ts --bundle --platform=node \
  --target=node22 --format=esm --outfile=dist/publish-capsules.mjs
_PDIM_FORMAT=$(node dist/publish-capsules.mjs format)
echo "   Compressor: existing deployment capsule packer (${_PDIM_FORMAT})"
mkdir -p dist/deployment
cp script/deployment/*.mjs dist/deployment/
cp script/deployment/image-size-gate.sh dist/deployment/
cp scripts/port-contract.sh scripts/boot-stub-server.mjs dist/deployment/
if [ -f runtime-data.manifest.json ]; then
  cp runtime-data.manifest.json dist/deployment/runtime-data-backup.json
  node_modules/.bin/esbuild scripts/restore-runtime-data.mjs --bundle --packages=external \
    --platform=node --target=node22 --format=esm --outfile=dist/deployment/restore-runtime-data.mjs
  node dist/deployment/restore-runtime-data.mjs --verify-backup
  printf 'required\n' > dist/deployment/runtime-data-required
  # Delete only from the disposable build copy, after authenticated object
  # verification. The development originals remain untouched.
  rm -rf data uploads
fi
node_modules/.bin/esbuild scripts/check-port-contract.ts --bundle --platform=node \
  --format=esm --outfile=dist/deployment/check-port-contract.mjs
}

# Internal: run tar with the selected compressor
_pdim_tar_create() {
  # Usage: _pdim_tar_create <output.pdim> [tar-paths...]
  local out="$1"; shift
  node dist/publish-capsules.mjs paths "$out" "$@"
}

# ── node_modules pre-pruning ─────────────────────────────────────────────────
# Strip package-only material before compression, preserving executable/source
# runtime files and all legal notices. Compiler caches are removed once here,
# after both build paths have finished using them.
_pdim_prune_nm() {
  echo "   Removing npm-owned compiler caches after build..."
  rm -rf node_modules/.vite node_modules/.cache
  node script/lib/pruneRuntimeNodeModules.mjs "$PWD"
}

# ── Capsule pack function ─────────────────────────────────────────────────────
_pdim_pack() {
  local dir="$1" capsule="$2" label="$3"
  echo "   Packing ${label}..."
  node dist/publish-capsules.mjs directory "$capsule" "$dir"
}

# Pre-prune node_modules, then pack all capsules
phase_prune() {
_pdim_prune_nm

# Write PDIM sentinel file into node_modules BEFORE packing.
# dist/pdim-restore.mjs checks for this file to distinguish a properly-restored
# node_modules from a stale directory left over by a prior deployment.
touch node_modules/.pdim-restored
echo "   Sentinel written: node_modules/.pdim-restored"
}

phase_pack_node() {
_pdim_pack "node_modules"   "node_modules.pdim"   "Production node_modules"
}
phase_pack_python() {
_pdim_pack "python_runtime" "python_runtime.pdim" "Portable Python 3.12 runtime"
}
phase_pack_maxcore() {
_pdim_pack "external/maxcore" "external_maxcore.pdim" "MaxCore server"
}
phase_pack_pdim() {
_pdim_pack "external/pdim" "external_pdim.pdim" "PDIM server"
}

# ── Source tree capsule ───────────────────────────────────────────────────────
phase_source() {
# This JSON registry is read from disk by the compiled server at runtime.
# Keep the exact source bytes available for the app-remainder capsule after
# the debugging source tree has been archived and removed.
_RUNTIME_REGISTRY_BACKUP=""
if [ -f shared/social-platform-optimization.json ]; then
  _RUNTIME_REGISTRY_BACKUP="$DEPLOY_STATE_DIR/social-platform-optimization.json"
  cp shared/social-platform-optimization.json "$_RUNTIME_REGISTRY_BACKUP"
fi
_PDIM_FORMAT=$(node dist/publish-capsules.mjs format)
# Compress instead of delete — nothing is lost.  Restored manually when needed
# (debugging, SLOW PATH rebuild).  Not auto-restored at startup since the server
# runs entirely from pre-compiled dist/ artifacts.
echo "   Packing source tree → source.pdim [${_PDIM_FORMAT}]..."
_SOURCE_DIRS=""
for _d in client server shared script scripts electron attached_assets docs migrations boosterstate; do
  [ -d "$_d" ] && _SOURCE_DIRS="$_SOURCE_DIRS $_d"
done
_SOURCE_CONFIGS=""
for _f in capacitor.config.ts vite.config.ts tailwind.config.ts postcss.config.js \
          drizzle.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json \
          components.json electron-builder.yml design_guidelines.md; do
  [ -f "$_f" ] && _SOURCE_CONFIGS="$_SOURCE_CONFIGS $_f"
done
if [ -n "$_SOURCE_DIRS" ] || [ -n "$_SOURCE_CONFIGS" ]; then
  # shellcheck disable=SC2086
  # The source capsule excludes only generated diffusion memory and bytecode.
  # The original tree stays intact until the capsule checksum and manifest are
  # verified; archive failures are fatal rather than silently shipping gaps.
  _pdim_tar_create source.pdim ${_SOURCE_DIRS} ${_SOURCE_CONFIGS} \
    '--exclude=server/services/diffusion/**/advanced_memory' \
    '--exclude=server/services/diffusion/**/__pycache__' \
    '--exclude=server/services/diffusion/**/*.npz' || exit $?
  if [ ! -s source.pdim ] || [ ! -s source.manifest.json ]; then
    echo "ERROR: Source capsule or streamed manifest was not created; source files were preserved" >&2
    exit 1
  fi
  node script/lib/finalize-source-manifest.mjs source.pdim source.manifest.json
  # shellcheck disable=SC2086
  rm -rf ${_SOURCE_DIRS} ${_SOURCE_CONFIGS}
  if [ -n "$_RUNTIME_REGISTRY_BACKUP" ]; then
    mkdir -p shared
    cp "$_RUNTIME_REGISTRY_BACKUP" shared/social-platform-optimization.json
  fi
  echo "   ✅ Verified source.pdim and source.manifest.json; source inputs were removed only after checksum validation."
else
  echo "   INFO: No source directories found — skipping source capsule"
fi

}

# ─── Application remainder capsule required by startup ────────────────────────
phase_remainder() {
  if [ ! -s shared/social-platform-optimization.json ]; then
    echo "ERROR: Required runtime social-awareness registry missing before capsule pack" >&2
    exit 1
  fi
  echo "==> Packing application remainder for verified startup restoration..."
  node dist/publish-capsules.mjs remainder app_remainder.pdim
  # A successful publishing build must satisfy every mandatory startup restore.
  for _capsule in app_remainder node_modules python_runtime external_maxcore external_pdim; do
    if [ ! -s "${_capsule}.pdim" ] || [ ! -s "${_capsule}.manifest.json" ]; then
      echo "ERROR: Required startup capsule or manifest missing: ${_capsule}" >&2
      exit 1
    fi
  done
}

# ─── Pre-compressed asset finalization ──────────────────────────────────────
phase_assets() {
echo "==> Finalizing public assets under the strict build contract..."
node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { validateBuild, writeBuildContract } from "./scripts/start-production.mjs";

const root = process.cwd();
const contractPath = path.join(root, "dist/build-complete.json");
const original = JSON.parse(fs.readFileSync(contractPath, "utf8"));
if (!original.inputs || typeof original.inputs !== "object" || Array.isArray(original.inputs)) {
  throw new Error("Build contract is missing its source-input hashes");
}

// First prove that the pre-finalization artifact is complete and untampered.
validateBuild(root);

let removed = 0;
let removedBytes = 0;
let sourceAssetCount = 0;
function removeCompressedVariants(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeCompressedVariants(file);
    } else if (entry.isFile() && /\.(?:br|gz)$/i.test(entry.name)) {
      removedBytes += fs.statSync(file).size;
      fs.unlinkSync(file);
      removed++;
    } else if (!entry.isFile()) {
      throw new Error(`Unsupported public build asset: ${path.relative(root, file)}`);
    }
  }
}
const publicRoot = path.join(root, "dist/public");
removeCompressedVariants(publicRoot);
function countFinalAssets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) countFinalAssets(file);
    else if (entry.isFile()) sourceAssetCount++;
  }
}
countFinalAssets(publicRoot);

// Keep the original source hashes: any source change since compilation is a
// hard failure. Re-hash the deliberate final public tree; do not exempt files
// from the manifest or relax validation.
writeBuildContract(root, original.inputs);
validateBuild(root);
const finalContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
if (Object.keys(finalContract.files).some(file => /\.(?:br|gz)$/i.test(file))) {
  throw new Error("Final asset contract still contains removed compressed variants");
}
console.log(`   Verified ${sourceAssetCount} final public assets; removed ${removed} precompressed variants (${removedBytes} bytes); build contract refreshed and revalidated.`);
NODE
}

# ─── Non-UTF-8 filename cleanup ──────────────────────────────────────────────
phase_finalize() {
# Only the disposable publishing copy is finalized. Verified capsules already
# reside at their runtime paths; shipping duplicate cache copies defeats sizing.
rm -rf .deployment-capsule-cache
# These paths are already explicitly excluded by .dockerignore. Apply that
# policy inside the disposable historical build, where they were surviving.
rm -rf maxbooster7.5 .pythonlibs hardware reports .pdim-scratch-*
echo "==> Removing files with non-UTF-8 filenames from workspace root..."
python3 - << 'PYEOF' || true
import os, sys
workspace = b'.'
try:
    entries = os.listdir(workspace)
    removed = 0
    for e in entries:
        eb = e if isinstance(e, bytes) else e.encode('utf-8', errors='surrogateescape')
        try:
            eb.decode('utf-8')
        except UnicodeDecodeError:
            path = workspace + b'/' + eb
            try:
                os.unlink(path)
                print(f'   Removed non-UTF-8 filename: {eb.hex()}')
                removed += 1
            except Exception as ex:
                print(f'   Warning: could not remove {eb.hex()}: {ex}', file=sys.stderr)
    if removed == 0:
        print('   No non-UTF-8 filenames found.')
except Exception as ex:
    print(f'   Warning: cleanup scan failed: {ex}', file=sys.stderr)
PYEOF

# ─── Final summary ────────────────────────────────────────────────────────────
FAST_PATH=$(cat "$DEPLOY_STATE_DIR/build-path")
bash "$(dirname "$0")/dist/deployment/image-size-gate.sh" .
echo ""
echo "==> Build image size gate passed; exact byte count is reported above."
if [ "$FAST_PATH" = "1" ]; then
  echo "   Path: FAST (npm ci --omit=dev, no Vite/esbuild compile)"
else
  echo "   Path: SLOW (full npm run build + npm prune)"
fi
echo ""
echo "==> Build complete. PDIM capsules restore on first startup via dist/pdim-restore.mjs"
}

if [ "${1:-}" = "--executive-task" ]; then
  case "${2:-}" in
    cleanup|node|diffusion|dependencies|rust|strip|python|app_capsule|packer|prune|pack_node|pack_python|pack_maxcore|pack_pdim|source|remainder|assets|finalize)
      "phase_$2" ;;
    *) echo "Unknown build task" >&2; exit 1 ;;
  esac
else
  exec bash script/deployment/bootstrap.sh
fi
