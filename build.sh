#!/bin/bash
set -e

# ─── Purge agent/platform state from the build container ─────────────────────
# .dockerignore already excludes .local/ (15 GB of Replit agent state) but
# Replit's repl-layer packager may use different glob semantics than Docker.
# Deleting here is a belt-and-suspenders guarantee: even if every .dockerignore
# pattern fails, this single rm prevents the 15 GB from entering the image.
# Safe: this runs ONLY in the deployment build container, never in dev.
echo "==> Purging agent state / platform caches from build container..."
rm -rf \
  .local/ .agents/ \
  .cache/ node_modules/.vite/ node_modules/.cache/ \
  2>/dev/null || true
echo "   Done (agent state purged)."

# ─── Bundle portable Node.js for the deployment container ────────────────────
# The Replit deployment (VM) container has a MINIMAL Nix store: bash, coreutils,
# xz, tar — but ZERO nodejs.  The node binary must travel with the project files.
# start.sh strategy [a] looks for .node_bin/node first — that is what we produce.
echo "==> Bundling Node.js v22 → .node_bin/node ..."
mkdir -p .node_bin
if [ -f ".node_bin/node" ] && ".node_bin/node" --version >/dev/null 2>&1; then
  echo "   Cached: $(.node_bin/node --version) ($(du -sh .node_bin/node | cut -f1))"
else
  _NODE_VER="22.22.0"
  _NODE_ARCH="node-v${_NODE_VER}-linux-x64"
  _NODE_URL="https://nodejs.org/dist/v${_NODE_VER}/${_NODE_ARCH}.tar.xz"
  echo "   Downloading ${_NODE_ARCH} from nodejs.org..."
  if curl -fsSL "$_NODE_URL" | \
       tar -xJf - --strip-components=2 -C .node_bin "${_NODE_ARCH}/bin/node" 2>/dev/null; then
    chmod +x .node_bin/node
    if ".node_bin/node" --version >/dev/null 2>&1; then
      echo "   ✅ $(.node_bin/node --version) → .node_bin/node ($(du -sh .node_bin/node | cut -f1))"
    else
      # NixOS glibc: try patchelf to fix ELF interpreter path
      echo "   Node binary exists but won't run — attempting patchelf fix..."
      if command -v patchelf >/dev/null 2>&1; then
        _INTERP=$(find /nix/store -name 'ld-linux-x86-64.so.2' 2>/dev/null | head -1 || echo "")
        [ -n "$_INTERP" ] && patchelf --set-interpreter "$_INTERP" .node_bin/node 2>/dev/null || true
        ".node_bin/node" --version >/dev/null 2>&1 \
          && echo "   ✅ patchelf fix applied → $(.node_bin/node --version)" \
          || echo "   ERROR: patchelf failed — deployment may fail"
      else
        echo "   ERROR: patchelf not available — deployment may fail"
      fi
    fi
  else
    echo "   ERROR: Download/extraction failed — deployment will fail"
  fi
fi
echo "==> Build env: node $(node --version 2>/dev/null || echo n/a)  npm $(npm --version 2>/dev/null || echo n/a)"

# ─────────────────────────────────────────────────────────────────────────────
# FAST PATH vs SLOW PATH
#
# FAST PATH — all pre-built artifacts are committed to the repl layer:
#   • dist/public/index.html  — Vite frontend bundle (~17 MB)
#   • dist/index.cjs          — esbuild server bundle (~5 MB)
#   • dist/cluster.cjs        — esbuild cluster entry (~1 MB)
#
#   Compile step is skipped entirely.  Only production deps are installed
#   (`npm ci --omit=dev`), then security patches are applied to node_modules,
#   and the source tree is deleted.  Final image: ~400–550 MB.
#
# SLOW PATH — one or more artifacts are missing:
#   source/ is present in the repl layer (client/, server/, script/ included).
#   Runs full `npm ci` + security-fix + Vite/esbuild compile + prune.
#   This matches the behaviour of the original `npm run build` deploy command,
#   giving full security scanning on every build.
#   Final image: ~1.2–1.5 GB.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Copy Python diffusion server (before server/ may be deleted) ────────────
echo "==> Preserving Python diffusion server files in services/diffusion/..."
mkdir -p services/diffusion
if [ -d "server/services/diffusion" ]; then
  cp -r server/services/diffusion/. services/diffusion/
  # advanced_memory/ contains runtime-generated model shards (.npz) produced by the
  # diffusion API during training sessions.  These are NOT source code — they belong
  # in the PDIM storage layer (HybridStorage), not as loose deployment artifacts.
  # The Python API regenerates them at runtime.  Excluding saves ~158 MB from the
  # deployment image and eliminates a double-count (they would otherwise also land
  # inside source.pdim via the server/ tree pack below).
  rm -rf services/diffusion/advanced_memory/ services/diffusion/__pycache__/ 2>/dev/null || true
  # Mirror the exclusion in the source tree so source.pdim doesn't double-pack them.
  rm -rf server/services/diffusion/advanced_memory/ server/services/diffusion/__pycache__/ 2>/dev/null || true
  echo "   Copied $(ls services/diffusion | wc -l | tr -d ' ') source files → services/diffusion/ (shards excluded)"
else
  echo "   WARNING: server/services/diffusion/ not found — Python server unavailable in production"
fi

PREBUILT_FRONTEND="dist/public/index.html"
PREBUILT_SERVER="dist/index.cjs"
PREBUILT_CLUSTER="dist/cluster.cjs"

if [ -f "$PREBUILT_FRONTEND" ] && [ -f "$PREBUILT_SERVER" ] && [ -f "$PREBUILT_CLUSTER" ]; then
  echo "==> FAST PATH: all pre-built artifacts present"
  echo "   dist/public/, dist/index.cjs, dist/cluster.cjs ready."

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

  # ── Clear build caches only (source kept — PDIM will compress it below) ───
  rm -rf .cache/ node_modules/.vite/ node_modules/.cache/ 2>/dev/null || true

  # ── Install production dependencies ───────────────────────────────────────
  # Source tree is still present so postinstall.mjs runs normally.
  echo "==> Installing production dependencies (npm ci --omit=dev)..."
  npm ci --omit=dev

  # ── Verify critical runtime packages were installed ───────────────────────
  # Fail the build immediately if a package that the pre-built bundle requires
  # at runtime is missing — better a clear build failure than a crash loop.
  for _req_pkg in "@sentry/node" "exceljs"; do
    if [ ! -d "node_modules/${_req_pkg}" ]; then
      echo "ERROR: ${_req_pkg} missing after npm ci --omit=dev — aborting build"
      echo "       Check package.json (must be in dependencies, not devDependencies)"
      exit 1
    fi
  done
  echo "   ✅ Critical runtime packages verified: @sentry/node, exceljs"

  # ── Security fix on freshly-installed node_modules ────────────────────────
  echo "==> Applying security patches to production node_modules..."
  if [ -f "script/security-fix.ts" ] && [ -x "node_modules/.bin/tsx" ]; then
    node_modules/.bin/tsx script/security-fix.ts 2>&1 \
      || echo "   WARNING: security-fix.ts exited non-zero (non-fatal)"
  else
    echo "   INFO: security-fix.ts not available — patches already baked into pre-built dist/"
  fi

  FAST_PATH=1

else
  # ─── SLOW PATH: full compile (matches original `npm run build` behaviour) ───
  echo "==> SLOW PATH: one or more pre-built artifacts missing — running full build"
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

  echo "==> Installing all dependencies (dev + prod) for compile step..."
  npm ci

  echo "==> Clearing build caches before compile..."
  rm -rf .cache/ node_modules/.vite/ node_modules/.cache/ 2>/dev/null || true

  # Full build: security-fix → Vite frontend → esbuild server bundle
  # This mirrors the original deployment build command exactly.
  echo "==> Building application (security-fix + Vite frontend + esbuild server bundle)..."
  npm run build

  # Source tree is kept — PDIM will compress it below.
  rm -rf .cache/ node_modules/.vite/ node_modules/.cache/ 2>/dev/null || true
  echo "   Build complete. dist/: $(du -sh dist/ 2>/dev/null | cut -f1)"

  echo "==> Pruning dev dependencies..."
  npm prune --omit=dev

  FAST_PATH=0
fi

# ─── TF native binaries (preserved for production LD_LIBRARY_PATH) ───────────
echo "==> Keeping TF native libraries from tfjs-node postinstall..."
# NOTE: node_modules/@tensorflow/tfjs-node/deps/ is intentionally KEPT.
# It contains libtensorflow.so.2.9.1 (~242 MB) which start.sh adds to LD_LIBRARY_PATH.
# Removing it causes the "[start.sh] WARNING: @tensorflow/tfjs-node deps/lib not found"
# warning and degrades native TF acceleration for all ML inference in production.
# The binding/ C++ source is also kept — it is harmless and may be needed for native builds.
echo "   TF native libraries preserved (libtensorflow.so will be available in production)."

# ─── Rust sidecar ────────────────────────────────────────────────────────────
echo "==> Rust sidecar: compiling release binary..."
mkdir -p bin
_CARGO_OK=0
if command -v cargo >/dev/null 2>&1; then
  echo "   cargo found: $(cargo --version 2>/dev/null)"
  export RUSTFLAGS="-C link-arg=-static-libgcc \
    -C link-arg=-Wl,--dynamic-linker=/lib64/ld-linux-x86-64.so.2 \
    -C link-arg=-Wl,-rpath,/lib/x86_64-linux-gnu \
    -C link-arg=-Wl,-rpath,/lib64"
  if cargo build --release --manifest-path boosterstate/Cargo.toml 2>&1; then
    if cp boosterstate/target/release/boosterstate bin/boosterstate 2>/dev/null; then
      chmod +x bin/boosterstate
      echo "   ✅ boosterstate compiled → ./bin/boosterstate ($(du -sh bin/boosterstate | cut -f1))"
      _CARGO_OK=1
    else
      echo "   WARNING: binary compiled but cp failed"
    fi
  else
    echo "   WARNING: cargo build --release failed — sidecar unavailable in production"
  fi
else
  echo "   WARNING: cargo not found — sidecar unavailable in production"
fi
rm -rf boosterstate/target/ 2>/dev/null || true
[ "$_CARGO_OK" = "0" ] && echo "   App will run without boosterstate sidecar (graceful fallback active)."

# ─── node_modules stripping (both paths) ─────────────────────────────────────
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

find node_modules/googleapis -name "*.js.map" -delete 2>/dev/null || true
find node_modules/google-auth-library -name "*.js.map" -delete 2>/dev/null || true
echo "   Stripped: googleapis + google-auth-library source maps"

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

find node_modules -name "*.map" -type f -delete 2>/dev/null || true
echo "   Removed: *.map source map files"

find node_modules -name "*.d.ts" -type f -delete 2>/dev/null || true
echo "   Removed: *.d.ts TypeScript declaration files"

find node_modules -type d -name "__tests__" \
  -not -path "*/.bin/*" \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: __tests__ directories inside node_modules"

find node_modules -maxdepth 3 -type f \
  \( -name "CHANGELOG.md" -o -name "CHANGELOG" -o -name "HISTORY.md" \
     -o -name "CHANGES.md" -o -name "CONTRIBUTING.md" -o -name "AUTHORS" \
     -o -name "NOTICE" -o -name "*.md" \) \
  -delete 2>/dev/null || true
echo "   Removed: changelog/readme files inside node_modules"

echo "   Final node_modules size: $(du -sh node_modules | cut -f1)"

# ─── Portable Python runtime ─────────────────────────────────────────────────
# The run container is a Debian-based VM.  The Nix-installed Python in the
# build container embeds Nix store paths that don't exist in the run container.
# We download python-build-standalone which links against standard glibc and
# runs correctly in both environments.
_PYRUNTIME="python_runtime"
_PYVER="3.12.13"
_PYDATE="20260325"
_PYURL="https://github.com/astral-sh/python-build-standalone/releases/download/${_PYDATE}/cpython-${_PYVER}%2B${_PYDATE}-x86_64-unknown-linux-gnu-install_only.tar.gz"

echo "==> Downloading portable Python ${_PYVER} (x86_64-linux-gnu) ..."
mkdir -p "${_PYRUNTIME}"
_PYENV_OK=0
if curl -sL --max-time 120 "${_PYURL}" \
     | tar xz --strip-components=1 -C "${_PYRUNTIME}" python/ 2>/dev/null; then
  if [ -x "${_PYRUNTIME}/bin/python3" ] && "${_PYRUNTIME}/bin/python3" --version >/dev/null 2>&1; then
    _PY_VER_STR=$("${_PYRUNTIME}/bin/python3" --version 2>&1)
    echo "   Portable Python installed: ${_PY_VER_STR}"
    echo "   Installing numpy, pillow, fastapi, uvicorn, pydantic ..."
    "${_PYRUNTIME}/bin/pip3" install --no-cache-dir \
      numpy pillow "fastapi>=0.100.0" "uvicorn[standard]>=0.20.0" "pydantic>=2.0.0" \
      --quiet 2>&1 || \
      "${_PYRUNTIME}/bin/python3" -m pip install --no-cache-dir \
      numpy pillow "fastapi>=0.100.0" "uvicorn[standard]>=0.20.0" "pydantic>=2.0.0" \
      --quiet 2>&1 || true
    if "${_PYRUNTIME}/bin/python3" -c "import numpy, PIL, fastapi, uvicorn, pydantic" 2>/dev/null; then
      echo "   ✅ Python runtime ready: ${_PY_VER_STR} → ./${_PYRUNTIME}/"
      _PYENV_OK=1
    else
      echo "   WARNING: Python package import failed — runtime incomplete"
    fi
  else
    echo "   WARNING: downloaded Python binary not executable"
  fi
else
  echo "   WARNING: portable Python download failed — trying system Python fallback..."
  _PYTHON3=""
  for _p in /usr/bin/python3 /usr/local/bin/python3 python3; do
    if [ -x "$_p" ] && "$_p" --version >/dev/null 2>&1; then _PYTHON3="$_p"; break; fi
  done
  if [ -n "$_PYTHON3" ]; then
    "$_PYTHON3" -m venv "${_PYRUNTIME}" 2>&1 || true
    if [ -x "${_PYRUNTIME}/bin/python3" ]; then
      "${_PYRUNTIME}/bin/pip3" install --no-cache-dir numpy pillow --quiet 2>&1 || true
      echo "   System Python venv created (may not survive into run container)"
      _PYENV_OK=1
    fi
  fi
fi
[ "$_PYENV_OK" = "0" ] && echo "   Python runtime unavailable — audio/image analysis disabled in production."

# ─── PDIM Capsule: pack large runtime directories ────────────────────────────
# Implements the Pocket Dimension Storage Engine "Extract & Boot" mode.
#
# Philosophy: nothing is permanently deleted (except .local/ agent state).
# Everything large is compressed into content-addressed .pdim capsules and
# restored on first startup by dist/pdim-restore.mjs.
#
# Compression: auto-selects best available algorithm
#   xz -9e -T0  (XZ extreme, multi-threaded) if xz is present   ← preferred
#   GZIP=-9     (gzip maximum level)          fallback
# Integrity:   SHA-256 checksum written alongside each capsule
# Format:      pdim-v2
echo "==> PDIM: Creating Pocket Dimension capsules..."

# ── Compression algorithm auto-detection ─────────────────────────────────────
_PDIM_FORMAT="gzip-9"
if command -v xz >/dev/null 2>&1; then
  _PDIM_FORMAT="xz-9e"
  export XZ_OPT="-9e -T0"   # extreme preset + all CPU cores
  echo "   Compressor: xz $(xz --version 2>/dev/null | head -1) (XZ_OPT=${XZ_OPT})"
else
  echo "   Compressor: gzip-9 (xz not found)"
fi

# Internal: run tar with the selected compressor
_pdim_tar_create() {
  # Usage: _pdim_tar_create <output.pdim> [tar-paths...]
  local out="$1"; shift
  case "$_PDIM_FORMAT" in
    xz*)   tar -cJf "$out" "$@" 2>/dev/null ;;
    *)     GZIP=-9 tar -czf "$out" "$@" 2>/dev/null ;;
  esac
}

# ── node_modules pre-pruning ─────────────────────────────────────────────────
# Strip files that are never needed at runtime BEFORE compression.
# Typical savings: 30-40% reduction → compressor then works on a smaller corpus.
_pdim_prune_nm() {
  local before
  before=$(du -sh node_modules 2>/dev/null | cut -f1)
  echo "   Pre-pruning node_modules (${before})..."

  # Source maps — large, never needed at runtime
  find node_modules -name '*.map' -delete 2>/dev/null || true

  # Test / spec / coverage directories
  find node_modules -type d \( \
    -name 'test' -o -name 'tests' -o -name '__tests__' \
    -o -name 'spec'  -o -name 'specs' -o -name '__spec__' \
    -o -name 'coverage' \
  \) -prune -exec rm -rf {} \; 2>/dev/null || true

  # Documentation, examples, benchmarks
  # NOTE: 'doc' (singular) is intentionally excluded — some packages (e.g. exceljs)
  # use 'doc' as a code namespace for runtime modules, not documentation.
  # 'docs' (plural) is safe to remove and is the conventional documentation dir name.
  find node_modules -type d \( \
    -name 'docs' -o -name 'documentation' \
    -o -name 'examples' -o -name 'example' \
    -o -name 'benchmark' -o -name 'benchmarks' \
    -o -name 'man' -o -name '.github' \
  \) -prune -exec rm -rf {} \; 2>/dev/null || true

  # Changelog / history markdown (redundant in production)
  find node_modules -maxdepth 3 -type f \( \
    -name 'CHANGELOG*' -o -name 'CHANGES*' -o -name 'HISTORY*' \
    -o -name '*.md'    -o -name '*.markdown' \
    -o -name '*.flow'  -o -name '*.flow.js' \
  \) -delete 2>/dev/null || true

  # TypeScript source files — keep .d.ts declarations, drop .ts source
  # (safe: production server runs from pre-compiled dist/, never touches .ts in node_modules)
  find node_modules -name '*.ts' ! -name '*.d.ts' -delete 2>/dev/null || true

  local after
  after=$(du -sh node_modules 2>/dev/null | cut -f1)
  echo "   Pruned: ${before} → ${after}"
}

# ── Capsule pack function ─────────────────────────────────────────────────────
_pdim_pack() {
  local dir="$1" capsule="$2" label="$3"
  if [ ! -d "$dir" ]; then
    echo "   SKIP ${label}: directory not found"
    return 0
  fi
  local raw_size
  raw_size=$(du -sh "$dir" 2>/dev/null | cut -f1)
  echo "   Packing ${label} (${raw_size}) → ${capsule} [${_PDIM_FORMAT}]..."
  _pdim_tar_create "$capsule" "$dir/"
  local packed_size checksum
  packed_size=$(du -sh "$capsule" 2>/dev/null | cut -f1)
  checksum=$(sha256sum "$capsule" 2>/dev/null | cut -d' ' -f1 || echo "unavailable")
  cat > "${capsule%.pdim}.manifest.json" << MANIFEST_EOF
{
  "capsule": "${capsule}",
  "directory": "${dir}",
  "label": "${label}",
  "rawSize": "${raw_size}",
  "packedSize": "${packed_size}",
  "sha256": "${checksum}",
  "compression": "${_PDIM_FORMAT}",
  "format": "pdim-v2",
  "restore": "node dist/pdim-restore.mjs",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
MANIFEST_EOF
  rm -rf "${dir:?}/"
  echo "   ✅ ${label}: ${raw_size} → ${packed_size} (${_PDIM_FORMAT}, sha256=${checksum:0:16}...)"
}

# Pre-prune node_modules, then pack all capsules
_pdim_prune_nm

# Write PDIM sentinel file into node_modules BEFORE packing.
# dist/pdim-restore.mjs checks for this file to distinguish a properly-restored
# node_modules from a stale directory left over by a prior deployment.
touch node_modules/.pdim-restored
echo "   Sentinel written: node_modules/.pdim-restored"

_pdim_pack "node_modules"   "node_modules.pdim"   "Production node_modules"
_pdim_pack "python_runtime" "python_runtime.pdim" "Portable Python 3.12 runtime"

# ── Source tree capsule ───────────────────────────────────────────────────────
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
  _SRC_RAW=$(du -sh ${_SOURCE_DIRS} ${_SOURCE_CONFIGS} 2>/dev/null | awk '{sum+=$1} END{print sum}' || echo "?")
  # shellcheck disable=SC2086
  _pdim_tar_create source.pdim ${_SOURCE_DIRS} ${_SOURCE_CONFIGS} || true
  if [ -f source.pdim ]; then
    _SRC_PACKED=$(du -sh source.pdim 2>/dev/null | cut -f1)
    _SRC_CKSUM=$(sha256sum source.pdim 2>/dev/null | cut -d' ' -f1 || echo "unavailable")
    cat > source.manifest.json << MANIFEST_EOF
{
  "capsule": "source.pdim",
  "label": "Application source tree",
  "rawSize": "${_SRC_RAW}",
  "packedSize": "${_SRC_PACKED}",
  "sha256": "${_SRC_CKSUM}",
  "compression": "${_PDIM_FORMAT}",
  "format": "pdim-v2",
  "autoRestore": false,
  "note": "Not needed at runtime — restore manually: tar -xJf source.pdim (xz) or tar -xzf source.pdim (gzip)",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
MANIFEST_EOF
    # shellcheck disable=SC2086
    rm -rf ${_SOURCE_DIRS} ${_SOURCE_CONFIGS} 2>/dev/null || true
    echo "   ✅ Source tree: packed → ${_SRC_PACKED} (${_PDIM_FORMAT}, sha256=${_SRC_CKSUM:0:16}...)"
  else
    echo "   WARNING: source.pdim not created — source tree left uncompressed"
  fi
else
  echo "   INFO: No source directories found — skipping source capsule"
fi

echo "   PDIM image footprint: $(du -sh --exclude=.git --exclude=.local . 2>/dev/null | cut -f1)"

# ─── Pre-compressed asset cleanup ────────────────────────────────────────────
echo "==> Removing pre-compressed assets (.gz/.br) from dist/public/..."
find dist/public -type f \( -name '*.gz' -o -name '*.br' \) -delete 2>/dev/null || true
echo "   Done."

# ─── Non-UTF-8 filename cleanup ──────────────────────────────────────────────
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
echo ""
echo "==> Build image size summary:"
for _item in dist/ services/ bin/ *.pdim *.manifest.json; do
  [ -e "$_item" ] && du -sh "$_item" 2>/dev/null \
    | awk '{printf "   %-30s %s\n", $2, $1}'
done
echo "   ─────────────────────────────────────────"
echo "   Total image: $(du -sh --exclude=.git --exclude=.local . 2>/dev/null | cut -f1)"
if [ "$FAST_PATH" = "1" ]; then
  echo "   Path: FAST (npm ci --omit=dev, no Vite/esbuild compile)"
else
  echo "   Path: SLOW (full npm run build + npm prune)"
fi
echo ""
echo "==> Build complete. PDIM capsules restore on first startup via dist/pdim-restore.mjs"
