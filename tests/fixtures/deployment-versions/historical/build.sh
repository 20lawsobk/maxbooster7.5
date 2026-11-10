#!/bin/bash
# Max Booster deployment build.
# Operates on a disposable deployment copy.
# Keep nounset off for compatibility with sourced project helpers.
set -Ee -o pipefail

_build_error() {
  local status="$1" line="$2"
  trap - ERR
  printf 'ERROR: build.sh task=%s line=%s exit=%s\n' \
    "${BUILD_TASK:-bootstrap}" "$line" "$status" >&2
  exit "$status"
}
trap '_build_error "$?" "$LINENO"' ERR

# Resolve the project root independently of the caller and CDPATH.
BUILD_ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly BUILD_ROOT
cd -- "$BUILD_ROOT"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_file() {
  [[ -s "$1" ]] || fail "Required nonempty file missing: $1"
}

require_state_dir() {
  [[ -n ${DEPLOY_STATE_DIR:-} &&
     -d $DEPLOY_STATE_DIR &&
     -w $DEPLOY_STATE_DIR ]] ||
    fail 'DEPLOY_STATE_DIR must name an existing writable directory supplied by bootstrap'
}

phase_cleanup() {
  # Leave workspace-root .cache alone: Replit may be repopulating it.
  # npm ci manages node_modules; compiler caches are removed after compilation.
  echo "==> Purging disposable agent state from build container..."
  bash script/parallel-build-cleanup.sh "$PWD"
  echo "   Done (agent state purged; npm-owned caches are left to npm)."
}

phase_node() {
  # Produce the portable Node runtime expected by start.sh.
  bash script/deployment/provision-node.sh
  echo "==> Build env: node $(node --version)  npm $(npm --version)"
}

phase_diffusion() {
  echo "==> Preserving Python diffusion server files in services/diffusion/..."

  if [ -d server/services/diffusion ]; then
    python3 script/lib/copy-diffusion-source.py \
      server/services/diffusion services/diffusion
  else
    fail 'server/services/diffusion/ is required for the production Python services'
  fi

  PREBUILT_FRONTEND="dist/public/index.html"
}

phase_dependencies() {
  require_state_dir

  PREBUILT_FRONTEND="dist/public/index.html"
  PREBUILT_SERVER="dist/index.mjs"
  PREBUILT_CLUSTER="dist/cluster.mjs"

  # Avoid ffmpeg-static downloading a separate binary when the configured
  # executable already provides the required production capabilities.
  source script/deployment/ffmpeg-path.sh
  if ! resolve_ffmpeg || ! verify_ffmpeg_capabilities; then
    fail 'Configured FFmpeg is missing required production capabilities'
  fi

  # Existing artifacts do not establish freshness when application source exists.
  if [ ! -d client ] &&
     [ ! -d server ] &&
     [ -f "$PREBUILT_FRONTEND" ] &&
     [ -f "$PREBUILT_SERVER" ] &&
     [ -f "$PREBUILT_CLUSTER" ]; then

    echo "==> FAST PATH: artifact-only input (no application source present)"
    echo "   Retaining public assets from the prebuilt dist artifact tree."
    echo "==> Installing production dependencies from the lockfile..."

    npm ci --omit=dev --no-audit --no-fund

    for _req_pkg in \
      "@sentry/node" \
      "exceljs" \
      "pino" \
      "express" \
      "drizzle-orm"; do
      if [ ! -d "node_modules/${_req_pkg}" ]; then
        fail "${_req_pkg} missing after npm ci --omit=dev; check production dependencies"
      fi
    done

    echo "   Critical runtime packages verified."
    bash script/sync-subsystem-dependencies.sh
    FAST_PATH=1
  else
    echo "==> COMPILE PATH: building current application"

    [ ! -f "$PREBUILT_FRONTEND" ] && echo "   missing: $PREBUILT_FRONTEND"
    [ ! -f "$PREBUILT_SERVER" ] && echo "   missing: $PREBUILT_SERVER"
    [ ! -f "$PREBUILT_CLUSTER" ] && echo "   missing: $PREBUILT_CLUSTER"

    if [ ! -d client ] || [ ! -d server ]; then
      fail 'Compile path requires both client/ and server/; provide complete source or complete prebuilt artifacts'
    fi

    # Explicitly include build tools even when NODE_ENV=production.
    echo "==> Installing all locked dependencies for compilation..."
    npm ci --include=dev --no-audit --no-fund

    echo "==> Building application (Vite frontend + esbuild server bundle)..."
    PUBLISH_SHELL_PACKS_CAPSULES=1 npm run build

    echo "==> Pruning development dependencies..."
    npm prune --omit=dev --no-audit --no-fund

    FAST_PATH=0
  fi

  echo "==> Verifying final production dependency security..."
  npm run security:audit
  npm run verify:dependency-security

  mkdir -p dist/deployment
  cp script/deployment/ffmpeg-path.sh dist/deployment/ffmpeg-path.sh

  printf '%s' "$FAST_PATH" > "$DEPLOY_STATE_DIR/build-path"

  # Preserve tfjs-node/deps and its native TensorFlow libraries.
  echo "==> Keeping TF native libraries from tfjs-node postinstall..."
  echo "   TF native libraries preserved for production."
}

phase_rust() {
  echo "==> Rust sidecar: compiling release binary..."
  CARGO_BUILD_JOBS="${DEPLOY_TASK_CPU:-2}" bash scripts/build-boosterstate.sh
  rm -rf boosterstate/target/
}

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
    node_modules/7zip-bin

  echo "   Removed: electron / app-builder / 7zip-bin"

  # Keep tfjs-backend-webgl: tf.node.js requires it even in a headless runtime.
  # Keep tfjs-node/deps: production needs the native TensorFlow libraries.
  rm -rf node_modules/@tensorflow/tfjs-node/dist/kernels

  if [ -d node_modules/@tensorflow/tfjs/dist ]; then
    find node_modules/@tensorflow/tfjs/dist -type f \
      \( -name "tf.js" -o -name "tf.min.js" \
         -o -name "tf.es2017.js" -o -name "tf.es2017.min.js" \
         -o -name "tf.fesm.js" -o -name "tf.fesm.min.js" \) \
      -delete
  fi

  for pkg in tfjs-core tfjs-layers tfjs-converter tfjs-backend-cpu tfjs-data; do
    if [ -d "node_modules/@tensorflow/${pkg}/dist" ]; then
      find "node_modules/@tensorflow/${pkg}/dist" -type f \
        \( -name "*.umd.js" -o -name "*.fesm.js" \
           -o -name "*.es2017.js" -o -name "*.min.js" \) \
        -delete
    fi
  done

  echo "   Removed: TensorFlow browser bundle variants"

  rm -rf \
    node_modules/@sentry/browser \
    node_modules/@sentry/vue \
    node_modules/@sentry/react \
    node_modules/@sentry-internal/browser-utils \
    node_modules/@sentry-internal/replay \
    node_modules/@sentry-internal/replay-canvas \
    node_modules/@sentry-internal/feedback

  echo "   Removed: Sentry browser/replay SDKs"
  echo "   Broad runtime pruning is deferred until after the app capsule."
}

phase_python() {
  node script/lib/provisionPortablePython.mjs "$PWD"
}

phase_app_capsule() {
  # This source snapshot is separate from the startup restoration capsules.
  # Run before source removal and before node_modules is packed.
  echo "==> App capsule: building portable Pocket Dimension snapshot..."

  if [ -f script/build-capsule.ts ] && [ -x node_modules/.bin/tsx ]; then
    _APP_CAPSULE_VERSION="${REPLIT_DEPLOYMENT_ID:-$(date -u +%Y%m%d%H%M%S)}"

    if node_modules/.bin/tsx script/build-capsule.ts "$_APP_CAPSULE_VERSION"; then
      echo "   App capsule built: deploy-capsule/"
    else
      fail 'Adaptive app capsule build failed; refusing incomplete publishing output'
    fi
  else
    fail 'script/build-capsule.ts and tsx are required for the adaptive app capsule'
  fi
}

phase_packer() {
  echo "==> PDIM: Creating Pocket Dimension capsules..."

  command -v zstd >/dev/null ||
    fail 'zstd is required for publishing'

  # Compile the CLI before node_modules is packed or removed.
  node_modules/.bin/esbuild script/publish-capsules.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=esm \
    --outfile=dist/publish-capsules.mjs

  _PDIM_FORMAT=$(node dist/publish-capsules.mjs format)
  echo "   Compressor: existing deployment capsule packer (${_PDIM_FORMAT})"

  mkdir -p dist/deployment
  cp script/deployment/*.mjs dist/deployment/
  cp script/deployment/image-size-gate.sh dist/deployment/
  cp script/lib/verify-utf8-root.py dist/deployment/
  cp scripts/port-contract.sh scripts/boot-stub-server.mjs dist/deployment/

  if [ -f runtime-data.manifest.json ]; then
    cp runtime-data.manifest.json dist/deployment/runtime-data-backup.json

    node_modules/.bin/esbuild scripts/restore-runtime-data.mjs \
      --bundle \
      --packages=external \
      --platform=node \
      --target=node22 \
      --format=esm \
      --outfile=dist/deployment/restore-runtime-data.mjs

    node dist/deployment/restore-runtime-data.mjs --verify-backup
    printf 'required\n' > dist/deployment/runtime-data-required

    # Remove only after backup verification, in the disposable build copy.
    rm -rf data uploads
  fi

  node_modules/.bin/esbuild scripts/check-port-contract.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --outfile=dist/deployment/check-port-contract.mjs
}

_pdim_tar_create() {
  local out="$1"
  shift
  node dist/publish-capsules.mjs paths "$out" "$@"
}

_pdim_prune_nm() {
  echo "   Removing npm-owned compiler caches after build..."
  rm -rf node_modules/.vite node_modules/.cache
  node script/lib/pruneRuntimeNodeModules.mjs "$PWD"
}

_pdim_pack() {
  local dir="$1" capsule="$2" label="$3"
  echo "   Packing ${label}..."
  node dist/publish-capsules.mjs directory "$capsule" "$dir"
}

phase_prune() {
  _pdim_prune_nm

  # Startup uses this sentinel to identify restored dependencies.
  touch node_modules/.pdim-restored
  echo "   Sentinel written: node_modules/.pdim-restored"
}

phase_pack_node() {
  _pdim_pack "node_modules" "node_modules.pdim" "Production node_modules"
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

phase_source() {
  require_state_dir

  local -a source_paths=()
  local _d _f

  # Preserve the registry needed by the application remainder capsule.
  _RUNTIME_REGISTRY_BACKUP=""
  if [ -f shared/social-platform-optimization.json ]; then
    _RUNTIME_REGISTRY_BACKUP="$DEPLOY_STATE_DIR/social-platform-optimization.json"
    cp shared/social-platform-optimization.json "$_RUNTIME_REGISTRY_BACKUP"
  fi

  _PDIM_FORMAT=$(node dist/publish-capsules.mjs format)
  echo "   Packing source tree: source.pdim [${_PDIM_FORMAT}]..."

  for _d in \
    client server shared script scripts electron \
    attached_assets docs migrations boosterstate; do
    if [[ -d "$_d" ]]; then
      source_paths+=("$_d")
    fi
  done

  for _f in \
    capacitor.config.ts \
    vite.config.ts \
    tailwind.config.ts \
    postcss.config.js \
    drizzle.config.ts \
    tsconfig.json \
    tsconfig.app.json \
    tsconfig.node.json \
    components.json \
    electron-builder.yml \
    design_guidelines.md; do
    if [[ -f "$_f" ]]; then
      source_paths+=("$_f")
    fi
  done

  if (( ${#source_paths[@]} )); then
    # Invoke directly so errexit remains active inside the helper.
    _pdim_tar_create source.pdim "${source_paths[@]}" \
      '--exclude=server/services/diffusion/**/advanced_memory' \
      '--exclude=server/services/diffusion/**/__pycache__' \
      '--exclude=server/services/diffusion/**/*.npz'

    if [ ! -s source.pdim ] || [ ! -s source.manifest.json ]; then
      fail 'Source capsule or manifest missing; source files were preserved'
    fi

    node script/lib/finalize-source-manifest.mjs \
      source.pdim source.manifest.json

    # Delete only after the existing finalizer validates the archive.
    rm -rf -- "${source_paths[@]}"

    if [ -n "$_RUNTIME_REGISTRY_BACKUP" ]; then
      mkdir -p shared
      cp "$_RUNTIME_REGISTRY_BACKUP" shared/social-platform-optimization.json
    fi

    echo "   Verified source capsule and manifest; archived inputs removed."
  else
    echo "   INFO: No source inputs found; skipping source capsule."
  fi
}

phase_remainder() {
  if [ ! -s shared/social-platform-optimization.json ]; then
    fail 'Required runtime social-awareness registry missing before capsule pack'
  fi

  echo "==> Packing application remainder for verified startup restoration..."
  node dist/publish-capsules.mjs remainder app_remainder.pdim

  for _capsule in \
    app_remainder \
    node_modules \
    python_runtime \
    external_maxcore \
    external_pdim; do
    if [ ! -s "${_capsule}.pdim" ] ||
       [ ! -s "${_capsule}.manifest.json" ]; then
      fail "Required startup capsule or manifest missing: ${_capsule}"
    fi
  done
}

phase_assets() {
  echo "==> Finalizing public assets under the strict build contract..."

  node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import {
  finalizeBuildContractAfterPublicVariantRemoval,
  validateBuild,
} from "./scripts/start-production.mjs";

const root = process.cwd();
const contractPath = path.join(root, "dist/build-complete.json");
const original = JSON.parse(fs.readFileSync(contractPath, "utf8"));

if (
  !original.inputs ||
  typeof original.inputs !== "object" ||
  Array.isArray(original.inputs)
) {
  throw new Error("Build contract is missing its source-input hashes");
}

// Verify the original artifacts before changing compressed variants.
validateBuild(root);

let removed = 0;
let removedBytes = 0;
let sourceAssetCount = 0;
const removedPaths = [];

function removeCompressedVariants(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      removeCompressedVariants(file);
    } else if (entry.isFile() && /\.(?:br|gz)$/i.test(entry.name)) {
      const relative = path.relative(root, file).split(path.sep).join("/");

      if (!Object.hasOwn(original.files, relative)) {
        throw new Error(
          `Refusing to remove unmanifested compressed public asset: ${relative}`
        );
      }

      removedBytes += fs.statSync(file).size;
      fs.unlinkSync(file);
      removedPaths.push(relative);
      removed++;
    } else if (!entry.isFile()) {
      throw new Error(
        `Unsupported public build asset: ${path.relative(root, file)}`
      );
    }
  }
}

const publicRoot = path.join(root, "dist/public");
removeCompressedVariants(publicRoot);

function countFinalAssets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      countFinalAssets(file);
    } else if (entry.isFile()) {
      sourceAssetCount++;
    }
  }
}

countFinalAssets(publicRoot);

// Retain validated hashes for untouched artifacts.
// Production startup still rehashes final artifacts.
const finalContract = finalizeBuildContractAfterPublicVariantRemoval(
  root,
  original,
  removedPaths
);

if (
  Object.keys(finalContract.files).some(
    file => file.startsWith("dist/public/") && /\.(?:br|gz)$/i.test(file)
  )
) {
  throw new Error("Final asset contract still contains removed compressed variants");
}

console.log(
  `   Verified ${sourceAssetCount} final public assets; removed ${removed} ` +
  `precompressed variants (${removedBytes} bytes); reused validated hashes ` +
  `for unchanged files.`
);
NODE
}

phase_finalize() {
  require_state_dir

  # Remove duplicate caches and paths excluded from the deployment payload.
  rm -rf .deployment-capsule-cache
  rm -rf maxbooster7.5 .pythonlibs hardware reports .pdim-scratch-*

  echo "==> Verifying UTF-8-safe filenames without deleting workspace data..."
  python3 dist/deployment/verify-utf8-root.py "$PWD"

  FAST_PATH=$(cat "$DEPLOY_STATE_DIR/build-path")
  bash dist/deployment/image-size-gate.sh .

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

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  printf 'Usage: bash build.sh [--executive-task TASK]\n'
  printf 'Runs bootstrap by default; individual tasks are internal bootstrap entry points.\n'
  exit 0
fi

if (( $# > 0 )) && [[ ${1:-} != --executive-task ]]; then
  fail "Unknown argument: $1 (use --help)"
fi

if [ "${1:-}" = "--executive-task" ]; then
  (( $# == 2 )) ||
    fail '--executive-task requires exactly one task name'

  BUILD_TASK=$2
  readonly BUILD_TASK

  case "$BUILD_TASK" in
    cleanup|node|diffusion|dependencies|rust|strip|python|app_capsule|packer|prune|pack_node|pack_python|pack_maxcore|pack_pdim|source|remainder|assets|finalize)
      printf '==> Starting task: %s\n' "$BUILD_TASK"
      SECONDS=0

      # Do not put this call in if, !, &&, or ||:
      # doing so disables errexit within the phase.
      "phase_$BUILD_TASK"

      printf '==> Finished task: %s (%ss)\n' "$BUILD_TASK" "$SECONDS"
      ;;
    *)
      fail "Unknown build task: $BUILD_TASK"
      ;;
  esac
else
  require_file script/deployment/bootstrap.sh
  exec bash script/deployment/bootstrap.sh
fi