#!/bin/bash
set -e

# ─── Bundle a portable Node.js binary for the run container ──────────────────
# The BUILD container has Node.js (via Nix), but the RUN container is a minimal
# image with NO Node.js at all. We download the official nodejs.org binary
# (links against glibc — present on the Debian-based run container) and store
# it in .node_bin/ which becomes part of the deployment image via the build
# layer (not the Repl/git layer — binary files in build artifacts are fine).
#
# Architecture: Replit GCE containers are x86_64 Linux.
# Version: match the build container's node version for node_modules compat.
_NODE_VERSION=$(node --version 2>/dev/null | tr -d 'v' || echo "22.22.0")
_NODE_ARCH="linux-x64"
_NODE_TARBALL="node-v${_NODE_VERSION}-${_NODE_ARCH}.tar.gz"
_NODE_URL="https://nodejs.org/dist/v${_NODE_VERSION}/${_NODE_TARBALL}"
_NODE_BIN_FILE=".node_bin/node"

mkdir -p .node_bin

if [ -f "$_NODE_BIN_FILE" ] && "$_NODE_BIN_FILE" --version >/dev/null 2>&1; then
  echo "==> Portable node already present: $("$_NODE_BIN_FILE" --version)"
else
  echo "==> Downloading portable Node.js v${_NODE_VERSION} (${_NODE_ARCH}) from nodejs.org..."
  if curl -sL --max-time 120 "$_NODE_URL" \
       | tar xz --strip-components=2 -C .node_bin \
           "node-v${_NODE_VERSION}-${_NODE_ARCH}/bin/node" 2>/dev/null; then
    chmod +x "$_NODE_BIN_FILE"
    echo "==> Portable node ready: $("$_NODE_BIN_FILE" --version) at $_NODE_BIN_FILE"
  else
    echo "==> WARNING: portable node download failed — falling back to Nix path"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# FAST PATH vs SLOW PATH
#
# FAST PATH — all pre-built artifacts are committed to git:
#   • dist/public/index.html  — Vite frontend bundle (committed, ~17 MB)
#   • dist/index.cjs          — esbuild server bundle (committed, ~5 MB)
#   • dist/cluster.cjs        — esbuild cluster entry (committed, ~1 MB)
#
#   NOTE: The boosterstate Rust binary is NOT compiled or shipped — Replit's
#   deployment "Repl layer" packaging rejects binary (non-UTF-8) files with
#   "invalid UTF-8". The app runs gracefully without the boosterstate sidecar.
#
#   No JS build tools needed → use `npm ci --omit=dev` which installs ONLY
#   production deps (~700 MB) instead of all deps + prune (~3 GB → 1.5 GB).
#   client/ + server/ are excluded by .dockerignore (pre-compiled into dist/).
#   Post-install stripping removes TF browser bundles, source maps, etc.
#   Final image: ~400–550 MB.
#
# SLOW PATH — one or more artifacts are missing:
#   Falls back to full `npm ci` + `npm run build:deploy` + `npm prune`.
#   Final image: ~1.2–1.5 GB (still correct after all the other fixes).
# ─────────────────────────────────────────────────────────────────────────────

# ─── Copy Python diffusion server (must happen before server/ is deleted) ────
# The source tree (server/) is deleted in both FAST and SLOW paths below.
# We preserve the diffusion server files in services/diffusion/ so the
# portable Python runtime can launch them in the run container.
echo "==> Preserving Python diffusion server files in services/diffusion/..."
mkdir -p services/diffusion
if [ -d "server/services/diffusion" ]; then
  cp -r server/services/diffusion/. services/diffusion/
  echo "   Copied $(ls services/diffusion | wc -l | tr -d ' ') files → services/diffusion/"
else
  echo "   WARNING: server/services/diffusion/ not found — Python server unavailable in production"
fi

PREBUILT_FRONTEND="dist/public/index.html"
PREBUILT_SERVER="dist/index.cjs"
PREBUILT_CLUSTER="dist/cluster.cjs"

if [ -f "$PREBUILT_FRONTEND" ] && [ -f "$PREBUILT_SERVER" ] && [ -f "$PREBUILT_CLUSTER" ]; then
  echo "==> FAST PATH: all pre-built artifacts present"
  echo "   dist/public/, dist/index.cjs, dist/cluster.cjs already committed."

  # Save postinstall.mjs BEFORE deleting scripts/ — it patches BullMQ after install.
  # We use --ignore-scripts below so npm doesn't try to run the deleted file,
  # then execute the saved copy manually once node_modules/ is ready.
  cp scripts/postinstall.mjs /tmp/postinstall.mjs 2>/dev/null || true

  # Copy binary assets to dist/public/ BEFORE deleting the source tree.
  # PNG/WebP/ICO files CANNOT be committed to git — Replit's deployment layer
  # push rejects non-UTF-8 (binary) files with "invalid UTF-8". These assets
  # are excluded from git by .gitignore and are only available in the source
  # tree (client/public/) at deploy time via the Repl layer. Copying them here
  # ensures they are present in dist/public/ for runtime serving (favicon, PWA
  # icons, logo) without being stored in the git repository.
  # NOTE: If client/public/icons/ etc. are absent (e.g. clean checkout), the
  # cp commands fail silently and the app runs without custom icons (acceptable).
  echo "==> Copying binary assets to dist/public/ if present (favicon, icons, logo)..."
  mkdir -p dist/public/icons dist/public/screenshots 2>/dev/null || true
  cp client/public/favicon.png dist/public/favicon.png 2>/dev/null || true
  cp client/public/logo.png    dist/public/logo.png    2>/dev/null || true
  cp client/public/logo.webp   dist/public/logo.webp   2>/dev/null || true
  cp -r client/public/icons/.  dist/public/icons/      2>/dev/null || true
  cp -r client/public/screenshots/. dist/public/screenshots/ 2>/dev/null || true
  ICON_COUNT=$(ls dist/public/icons/ 2>/dev/null | wc -l || echo 0)
  echo "   Binary assets: favicon=$([ -f dist/public/favicon.png ] && echo yes || echo no), icons=${ICON_COUNT}"

  echo "==> Deleting source tree immediately (Vite/esbuild not needed)..."
  # client/ is 930 MB — deleting it before npm ci cuts peak disk use by 930 MB.
  rm -rf \
    client/ server/ shared/ script/ scripts/ electron/ \
    attached_assets/ docs/ .cache/ \
    node_modules/.vite/ node_modules/.cache/ \
    capacitor.config.ts vite.config.ts tailwind.config.ts \
    postcss.config.js drizzle.config.ts tsconfig.json \
    tsconfig.app.json tsconfig.node.json components.json \
    electron-builder.yml \
    2>/dev/null || true
  echo "   Source tree removed ($(du -sh dist/ 2>/dev/null | cut -f1) in dist/)."

  echo "==> Installing production dependencies only (omitting dev deps)..."
  # --ignore-scripts prevents npm from running the postinstall hook, which would
  # fail because script/postinstall.mjs was just deleted with the source tree.
  # We run the saved copy manually below after node_modules is ready.
  npm ci --omit=dev --ignore-scripts

  echo "==> Running postinstall patches (BullMQ guards + TF cleanup)..."
  node /tmp/postinstall.mjs || echo "   postinstall.mjs warning (non-fatal)"

  FAST_PATH=1
else
  echo "==> SLOW PATH: one or more pre-built artifacts missing — running full build"
  [ ! -f "$PREBUILT_FRONTEND" ] && echo "   missing: $PREBUILT_FRONTEND"
  [ ! -f "$PREBUILT_SERVER"   ] && echo "   missing: $PREBUILT_SERVER"
  [ ! -f "$PREBUILT_CLUSTER"  ] && echo "   missing: $PREBUILT_CLUSTER"

  echo "==> Installing all dependencies (dev + prod)..."
  npm ci

  FAST_PATH=0
fi

# ─── TF native binaries (always remove — postinstall downloads them regardless) ─
echo "==> Removing TF native libraries downloaded by tfjs-node postinstall..."
rm -rf node_modules/@tensorflow/tfjs-node/deps/ 2>/dev/null || true
rm -rf node_modules/@tensorflow/tfjs-node/binding/ 2>/dev/null || true
echo "   TF native binaries removed."

# ─── Rust sidecar ────────────────────────────────────────────────────────────
# Compile the boosterstate sidecar binary during the build step and store it
# at ./bin/boosterstate — a path that is NOT in .dockerignore so the binary
# survives into the run container as a build artifact.
# NOTE: boosterstate/target/ stays in .dockerignore so dev-workspace binaries
# never pollute the Repl layer, but ./bin/ is unexcluded so the compiled
# output is available to start.sh in production.
echo "==> Rust sidecar: compiling release binary..."
mkdir -p bin
_CARGO_OK=0
if command -v cargo >/dev/null 2>&1; then
  echo "   cargo found: $(cargo --version 2>/dev/null)"
  # RUSTFLAGS bake standard Debian paths into the binary so it runs in the
  # Debian-based run container (not the Nix-based build container).
  # --dynamic-linker: use /lib64/ld-linux-x86-64.so.2 (not Nix store path)
  # -rpath: look for shared libs in standard Debian locations
  # -static-libgcc: statically link libgcc to remove the libgcc_s.so.1 dep
  export RUSTFLAGS="-C link-arg=-static-libgcc \
    -C link-arg=-Wl,--dynamic-linker=/lib64/ld-linux-x86-64.so.2 \
    -C link-arg=-Wl,-rpath,/lib/x86_64-linux-gnu \
    -C link-arg=-Wl,-rpath,/lib64"
  if cargo build --release --manifest-path boosterstate/Cargo.toml 2>&1; then
    if cp boosterstate/target/release/boosterstate bin/boosterstate 2>/dev/null; then
      chmod +x bin/boosterstate
      echo "   ✅ boosterstate compiled and placed at ./bin/boosterstate ($(du -sh bin/boosterstate | cut -f1))"
      _CARGO_OK=1
    else
      echo "   WARNING: binary compile succeeded but cp failed"
    fi
  else
    echo "   WARNING: cargo build --release failed — sidecar unavailable in production"
  fi
else
  echo "   WARNING: cargo not found in build container — sidecar unavailable in production"
fi
rm -rf boosterstate/target/ 2>/dev/null || true
if [ "$_CARGO_OK" = "0" ]; then
  echo "   App will run without boosterstate sidecar (graceful fallback active)."
fi

# ─── Full build (SLOW PATH only) ─────────────────────────────────────────────
if [ "$FAST_PATH" = "0" ]; then
  echo "==> Clearing build caches before compile..."
  rm -rf .cache/ node_modules/.vite/ node_modules/.cache/ 2>/dev/null || true
  echo "   Pre-build caches cleared."

  echo "==> Building application (Vite frontend + esbuild server bundle)..."
  npm run build:deploy

  echo "==> Removing source directories post-build..."
  rm -rf \
    client/ server/ shared/ script/ scripts/ electron/ \
    attached_assets/ docs/ .cache/ \
    node_modules/.vite/ node_modules/.cache/ \
    capacitor.config.ts vite.config.ts tailwind.config.ts \
    postcss.config.js drizzle.config.ts tsconfig.json \
    tsconfig.app.json tsconfig.node.json components.json \
    electron-builder.yml \
    2>/dev/null || true
  echo "   Source dirs + caches removed. dist/ size: $(du -sh dist/ 2>/dev/null | cut -f1)"

  echo "==> Pruning dev dependencies..."
  npm prune --omit=dev
fi

# ─── node_modules stripping (both paths) ─────────────────────────────────────
echo "==> Stripping node_modules..."

# Belt-and-suspenders: explicitly remove the largest known dev-only packages
# in case npm prune / --omit=dev misses any transitive electron/builder deps.
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
echo "   Removed: electron / app-builder / 7zip-bin packages"

# WebGL backend — no GPU/WebGL in a Node.js server environment.
rm -rf node_modules/@tensorflow/tfjs-backend-webgl 2>/dev/null || true
echo "   Removed: @tensorflow/tfjs-backend-webgl"

# tfjs-node ships both ESM and CJS copies of every kernel; only CJS is used.
rm -rf node_modules/@tensorflow/tfjs-node/dist/kernels 2>/dev/null || true
echo "   Removed: @tensorflow/tfjs-node/dist/kernels (redundant ESM kernels)"

# @tensorflow/tfjs — strip all browser UMD/ESM/FESM bundles.
# These are never used in a Node.js environment; only the Node-targeted
# entry points (tf.node.js / tf-node.cjs) are needed at runtime.
# Removes ~120 MB of browser JS + source maps from the main package.
find node_modules/@tensorflow/tfjs/dist -type f \
  \( -name "tf.js" -o -name "tf.min.js" \
     -o -name "tf.es2017.js" -o -name "tf.es2017.min.js" \
     -o -name "tf.fesm.js"  -o -name "tf.fesm.min.js" \) \
  -delete 2>/dev/null || true
# Also strip browser bundle variants from every @tensorflow sub-package.
# Each ships its own UMD/FESM copy that is redundant in a Node.js image.
for pkg in tfjs-core tfjs-layers tfjs-converter tfjs-backend-cpu tfjs-data; do
  find node_modules/@tensorflow/${pkg}/dist -type f \
    \( -name "*.umd.js" -o -name "*.fesm.js" -o -name "*.es2017.js" \
       -o -name "*.min.js" \) \
    -delete 2>/dev/null || true
done
echo "   Removed: @tensorflow/tfjs + sub-package browser bundle variants"

# googleapis — 164 MB prod dep needed server-side for YouTube/Google APIs.
# Strip build artifacts, proto source files, and unused Google API clients
# that are not required at runtime.
find node_modules/googleapis -name "*.js.map" -delete 2>/dev/null || true
find node_modules/google-auth-library -name "*.js.map" -delete 2>/dev/null || true
echo "   Stripped: googleapis + google-auth-library source maps"

# Sentry — server deployment only needs @sentry/node.
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

# Source maps — never used by the running Node.js process.
# This also catches the 106 MB of .map files in @tensorflow/tfjs/dist/.
find node_modules -name "*.map" -type f -delete 2>/dev/null || true
echo "   Removed: *.map source map files (includes ~106 MB TF.js maps)"

# TypeScript declaration files — build-time only.
find node_modules -name "*.d.ts" -type f -delete 2>/dev/null || true
echo "   Removed: *.d.ts TypeScript declaration files"

# Only remove __tests__ directories (double-underscore prefix guarantees these
# are Jest/Vitest test suites, never runtime code).  "test", "tests", "scripts",
# "docs", "examples" etc. are intentionally excluded — many packages store
# runtime JS inside those directory names (e.g. exceljs/lib/doc/workbook.js,
# wavefile/scripts/polyfills.js) and removing them breaks the server.
# Disk savings from those sweeps is < 10 MB — not worth the breakage risk.
find node_modules -type d -name "__tests__" \
  -not -path "*/.bin/*" \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: __tests__ directories inside node_modules"

# Markdown, changelog, and license files duplicated inside every package.
find node_modules -maxdepth 3 -type f \
  \( -name "CHANGELOG.md" -o -name "CHANGELOG" -o -name "HISTORY.md" \
     -o -name "CHANGES.md" -o -name "CONTRIBUTING.md" -o -name "AUTHORS" \
     -o -name "NOTICE" -o -name "*.md" \) \
  -delete 2>/dev/null || true
echo "   Removed: changelog/readme files inside node_modules"

echo "   Final node_modules size: $(du -sh node_modules | cut -f1)"

# ─── Portable Python runtime ──────────────────────────────────────────────────
# Download a portable CPython binary from python-build-standalone.
# This binary links against standard glibc (/lib64/ld-linux-x86-64.so.2) so
# it runs in the Debian-based run container — unlike Nix-installed Python which
# embeds Nix store paths that don't exist outside the build container.
# The install_only tarball extracts as: python/{bin,lib,include}/
# We strip that top-level 'python/' so ./python_runtime/bin/python3 is ready.
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
      echo "   ✅ Python runtime ready: ${_PY_VER_STR} with numpy, Pillow, FastAPI, uvicorn, pydantic → ./${_PYRUNTIME}/"
      _PYENV_OK=1
    else
      echo "   WARNING: numpy/Pillow import failed — Python runtime incomplete"
    fi
  else
    echo "   WARNING: downloaded Python binary not executable in build container"
  fi
else
  echo "   WARNING: portable Python download failed — trying system Python fallback..."
  # System-Python fallback (may or may not survive into run container)
  _PYTHON3=""
  for _p in /usr/bin/python3 /usr/local/bin/python3 python3; do
    if [ -x "$_p" ] && "$_p" --version >/dev/null 2>&1; then _PYTHON3="$_p"; break; fi
  done
  if [ -n "$_PYTHON3" ]; then
    "$_PYTHON3" -m venv "${_PYRUNTIME}" 2>&1 || true
    if [ -x "${_PYRUNTIME}/bin/python3" ]; then
      "${_PYRUNTIME}/bin/pip3" install --no-cache-dir numpy pillow --quiet 2>&1 || true
      echo "   System Python venv created (may not work in run container)"
      _PYENV_OK=1
    fi
  fi
fi
if [ "$_PYENV_OK" = "0" ]; then
  echo "   Python runtime unavailable — audio/image analysis disabled in production."
fi

# ─── Pre-compressed asset cleanup ────────────────────────────────────────────
# Vite's vite-plugin-compression generates .gz and .br variants of every JS/CSS
# file during the dev-time build. These binary files are:
#   • Excluded from git by .gitignore
#   • Excluded from the Repl layer by .dockerignore
# BUT they persist in the dev workspace between builds and Replit's layer push
# rejects them with "invalid UTF-8" if they are somehow included (e.g., if the
# .dockerignore pattern mismatches the actual file layout). Delete them here as
# a belt-and-suspenders measure — the server serves uncompressed originals when
# the compressed variants are absent.
echo "==> Removing pre-compressed assets (.gz/.br) from dist/public/..."
find dist/public -type f \( -name '*.gz' -o -name '*.br' \) -delete 2>/dev/null || true
REMOVED_COUNT=$(find dist/public -type f \( -name '*.gz' -o -name '*.br' \) 2>/dev/null | wc -l)
echo "   Compressed variants removed. Remaining: ${REMOVED_COUNT}"

# ─── Non-UTF-8 filename cleanup ──────────────────────────────────────────────
# Replit's Repl-layer push rejects any file whose FILENAME contains bytes that
# are not valid UTF-8 (same "invalid UTF-8" error as binary file content).
# Such filenames can appear as zero-byte temp files created by system processes.
# This step finds and removes them using Python's raw-bytes filesystem API so
# the cleanup works even when the filename cannot be expressed as a shell string.
# Safe to fail: PDIM in the dev workspace may reject this operation; the step is
# non-fatal and is only strictly needed in the deployment build container (no PDIM).
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
du -sh dist/ node_modules/ boosterstate/ .pythonlibs/ 2>/dev/null \
  | awk '{printf "   %-20s %s\n", $2, $1}'
if [ -d .cache ]; then
  echo "   WARNING: .cache/ still present — $(du -sh .cache/ | cut -f1)"
fi
echo "   Total workspace: $(du -sh --exclude=.git . 2>/dev/null | cut -f1)"
if [ "$FAST_PATH" = "1" ]; then
  echo "   Path: FAST (npm ci --omit=dev, no Vite/esbuild)"
else
  echo "   Path: SLOW (full build + npm prune)"
fi
echo ""
echo "==> Build complete."
