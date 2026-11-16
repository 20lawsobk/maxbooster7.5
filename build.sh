#!/usr/bin/env bash
# Run only in the disposable publishing copy.
# Sourced project helpers retain their existing shell contract.
set -Ee -o pipefail

_build_error() {
  local status="$1" line="$2"
  trap - ERR
  printf 'ERROR: build.sh task=%s line=%s exit=%s\n' \
    "${BUILD_TASK:-bootstrap}" "$line" "$status" >&2
  exit "$status"
}
trap '_build_error "$?" "$LINENO"' ERR

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
    fail 'DEPLOY_STATE_DIR must be an existing writable directory supplied by the executive'
}

phase_cleanup() {
  echo '==> Purging disposable agent state'
  bash script/parallel-build-cleanup.sh "$PWD"
}

phase_node() {
  bash script/deployment/provision-node.sh
  echo "==> Build environment: node $(node --version), npm $(npm --version)"
}

phase_diffusion() {
  [[ -d server/services/diffusion ]] ||
    fail 'server/services/diffusion/ is required for production Python services'

  python3 script/lib/copy-diffusion-source.py \
    server/services/diffusion services/diffusion
}

phase_dependencies() {
  require_state_dir

  local frontend=dist/public/index.html
  local server=dist/index.mjs
  local cluster=dist/cluster.mjs
  local artifact

  source script/deployment/ffmpeg-path.sh
  if ! resolve_ffmpeg || ! verify_ffmpeg_capabilities; then
    fail 'Configured FFmpeg lacks required production capabilities'
  fi

  # Both paths retain tools until capsule preparation finishes.
  if [[ ! -d client &&
        ! -d server &&
        -s "$frontend" &&
        -s "$server" &&
        -s "$cluster" ]]; then
    FAST_PATH=1
    echo '==> Installing locked dependencies for artifact inputs'
    npm ci --include=dev --no-audit --no-fund
    bash script/sync-subsystem-dependencies.sh
  else
    [[ -d client && -d server ]] ||
      fail 'Compilation requires both client/ and server/'

    FAST_PATH=0
    echo '==> Installing locked dependencies and compiling current source'
    npm ci --include=dev --no-audit --no-fund
    PUBLISH_SHELL_PACKS_CAPSULES=1 npm run build
  fi

  for artifact in "$frontend" "$server" "$cluster"; do
    require_file "$artifact"
  done

  mkdir -p dist/deployment
  cp script/deployment/ffmpeg-path.sh dist/deployment/ffmpeg-path.sh
  printf '%s\n' "$FAST_PATH" > "$DEPLOY_STATE_DIR/build-path"

  echo '==> Build tools retained until capsule preparation finishes'
}

phase_rust() {
  echo '==> Compiling Rust sidecar'
  local assigned_cpu="${DEPLOY_TASK_CPU:-}"

  if [[ -z "$assigned_cpu" ]]; then
    assigned_cpu=$(node --input-type=module -e \
      'import {deploymentTaskWorkerBudget} from "./script/deployment/capacity.mjs"; console.log(deploymentTaskWorkerBudget());')
  else
    assigned_cpu=$(DEPLOY_TASK_CPU="$assigned_cpu" node --input-type=module -e \
      'import {deploymentTaskWorkerBudget} from "./script/deployment/capacity.mjs"; console.log(deploymentTaskWorkerBudget(process.env.DEPLOY_TASK_CPU));')
  fi

  CARGO_BUILD_JOBS="$assigned_cpu" \
  GOMAXPROCS="$assigned_cpu" \
    bash scripts/build-boosterstate.sh
  rm -rf boosterstate/target/
}

# Preserve the existing task name while deferring actual stripping.
phase_strip() {
  echo '==> Runtime stripping deferred until production finalization'
}

_strip_runtime_modules() {
  echo '==> Stripping runtime dependencies'

  rm -rf \
    node_modules/electron \
    node_modules/electron-builder \
    node_modules/app-builder-bin \
    node_modules/app-builder-lib \
    node_modules/builder-util \
    node_modules/builder-util-runtime \
    node_modules/electron-updater \
    node_modules/7zip-bin

  # Preserve tfjs-node/deps and tfjs-backend-webgl.
  rm -rf node_modules/@tensorflow/tfjs-node/dist/kernels

  if [[ -d node_modules/@tensorflow/tfjs/dist ]]; then
    find node_modules/@tensorflow/tfjs/dist -type f \
      \( -name 'tf.js' -o -name 'tf.min.js' \
         -o -name 'tf.es2017.js' -o -name 'tf.es2017.min.js' \
         -o -name 'tf.fesm.js' -o -name 'tf.fesm.min.js' \) \
      -delete
  fi

  local pkg
  for pkg in \
    tfjs-core tfjs-layers tfjs-converter tfjs-backend-cpu tfjs-data; do
    if [[ -d "node_modules/@tensorflow/${pkg}/dist" ]]; then
      find "node_modules/@tensorflow/${pkg}/dist" -type f \
        \( -name '*.umd.js' -o -name '*.fesm.js' \
           -o -name '*.es2017.js' -o -name '*.min.js' \) \
        -delete
    fi
  done

  rm -rf \
    node_modules/@sentry/browser \
    node_modules/@sentry/vue \
    node_modules/@sentry/react \
    node_modules/@sentry-internal/browser-utils \
    node_modules/@sentry-internal/replay \
    node_modules/@sentry-internal/replay-canvas \
    node_modules/@sentry-internal/feedback
}

phase_python() {
  node script/lib/provisionPortablePython.mjs "$PWD"
}

phase_app_capsule() {
  require_state_dir
  require_file script/build-capsule.ts

  [[ -x node_modules/.bin/tsx ]] ||
    fail 'tsx is required for app capsule preparation'

  local version="${REPLIT_DEPLOYMENT_ID:-$(date -u +%Y%m%d%H%M%S)}"
  node_modules/.bin/tsx script/build-capsule.ts "$version"

  printf 'complete\n' > "$DEPLOY_STATE_DIR/app-capsule-ready"
}

phase_packer() {
  require_state_dir

  command -v zstd >/dev/null ||
    fail 'zstd is required for publishing'

  echo '==> Preparing deployment capsule tooling'

  node_modules/.bin/esbuild script/publish-capsules.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=esm \
    --outfile=dist/publish-capsules.mjs

  local format
  format=$(node dist/publish-capsules.mjs format)
  echo "   Capsule format: $format"

  mkdir -p dist/deployment
  cp script/deployment/*.mjs dist/deployment/
  cp script/deployment/image-size-gate.sh dist/deployment/
  cp script/lib/verify-utf8-root.py dist/deployment/
  cp scripts/port-contract.sh scripts/boot-stub-server.mjs dist/deployment/

  if [[ -f runtime-data.manifest.json ]]; then
    cp runtime-data.manifest.json \
      dist/deployment/runtime-data-backup.json

    node_modules/.bin/esbuild scripts/restore-runtime-data.mjs \
      --bundle \
      --packages=external \
      --platform=node \
      --target=node22 \
      --format=esm \
      --outfile=dist/deployment/restore-runtime-data.mjs

    node dist/deployment/restore-runtime-data.mjs --verify-backup
    printf 'required\n' > dist/deployment/runtime-data-required

    # Remove only after authenticated backup verification.
    rm -rf data uploads
  fi

  node_modules/.bin/esbuild scripts/check-port-contract.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --outfile=dist/deployment/check-port-contract.mjs

  printf 'complete\n' > "$DEPLOY_STATE_DIR/packer-ready"
}

_pdim_tar_create() {
  local out="$1"
  shift
  node dist/publish-capsules.mjs paths "$out" "$@"
}

_pdim_prune_nm() {
  rm -rf node_modules/.vite node_modules/.cache
  node script/lib/pruneRuntimeNodeModules.mjs "$PWD"
}

_pdim_pack() {
  local dir="$1" capsule="$2" label="$3"
  echo "==> Packing $label"
  node dist/publish-capsules.mjs directory "$capsule" "$dir"
}

_pack_directory_capsule() {
  local dir="$1" capsule="$2" label="$3"
  require_state_dir
  [[ -d "$dir" ]] || fail "Required capsule input directory missing: $dir"

  _pdim_pack "$dir" "$capsule" "$label"
  require_file "$capsule"
  require_file "${capsule%.pdim}.manifest.json"
}

phase_pack_node() {
  _pack_directory_capsule node_modules node_modules.pdim "Node dependencies"
}

phase_pack_python() {
  _pack_directory_capsule python_runtime python_runtime.pdim "Python runtime"
}

phase_pack_maxcore() {
  _pack_directory_capsule external/maxcore external_maxcore.pdim "MaxCore"
}

phase_pack_pdim() {
  _pack_directory_capsule external/pdim external_pdim.pdim "Pocket Dimension"
}

phase_prune() {
  require_state_dir

  # These markers belong to this execution, not a persistent cache.
  require_file "$DEPLOY_STATE_DIR/app-capsule-ready"
  require_file "$DEPLOY_STATE_DIR/packer-ready"
  require_file dist/publish-capsules.mjs

  echo '==> Finalizing production dependencies'
  npm prune --omit=dev --no-audit --no-fund
  npm run security:audit
  npm run verify:dependency-security

  # Remove only dependency-owned caches/package metadata, after compilation and
  # security checks but before the Node dependency capsule is created.
  _pdim_prune_nm

  # Preserve the original audit-before-stripping contract.
  _strip_runtime_modules

  if [ -f shared/social-platform-optimization.json ]; then
    cp shared/social-platform-optimization.json \
      "$DEPLOY_STATE_DIR/social-platform-optimization.json"
  fi
}

phase_source() {
  require_state_dir

  local -a source_paths=()
  local path

  for path in \
    client server shared src script scripts electron \
    attached_assets docs migrations boosterstate; do
    if [[ -d "$path" ]]; then
      source_paths+=("$path")
    fi
  done

  for path in \
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
    if [[ -f "$path" ]]; then
      source_paths+=("$path")
    fi
  done

  (( ${#source_paths[@]} > 0 )) ||
    fail 'No source inputs found for source capsule'

  echo "==> Packing source tree: source.pdim"
  _pdim_tar_create source.pdim "${source_paths[@]}" \
    '--exclude=server/services/diffusion/**/advanced_memory' \
    '--exclude=server/services/diffusion/**/__pycache__' \
    '--exclude=server/services/diffusion/**/*.npz'

  require_file source.pdim
  require_file source.manifest.json
  node script/lib/finalize-source-manifest.mjs \
    source.pdim source.manifest.json

  # Source and user data are removed only after archive/manifest validation.
  rm -rf -- "${source_paths[@]}"

  if [[ -s "$DEPLOY_STATE_DIR/social-platform-optimization.json" ]]; then
    mkdir -p shared
    cp "$DEPLOY_STATE_DIR/social-platform-optimization.json" \
      shared/social-platform-optimization.json
  fi

  echo '   Verified source capsule; removed archived source inputs.'
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

  require_file dist/pdim-restore.mjs
  echo '==> Verifying deployment capsule manifests and checksums without restoring...'
  node dist/pdim-restore.mjs --verify

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
  printf 'Usage: bash build.sh [--executive-task PHASE]\n'
  printf 'Runs the sequential Publishing build by default; phase dispatch is internal.\n'
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
