#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────────────
# FAST PATH vs SLOW PATH
#
# FAST PATH — all pre-built artifacts are committed to git:
#   • dist/public/index.html  — Vite frontend bundle (committed, ~17 MB)
#   • dist/index.cjs          — esbuild server bundle (committed, ~5 MB)
#   • dist/cluster.cjs        — esbuild cluster entry (committed, ~1 MB)
#   • boosterstate binary     — Rust sidecar (committed, ~2 MB)
#
#   No build tools needed → use `npm ci --omit=dev` which installs ONLY
#   production deps (~700 MB) instead of all deps + prune (~3 GB → 1.5 GB).
#   client/ + server/ are excluded by .dockerignore (pre-compiled into dist/).
#   Post-install stripping removes TF browser bundles, source maps, etc.
#   Final image: ~400–550 MB.
#
# SLOW PATH — one or more artifacts are missing:
#   Falls back to full `npm ci` + `npm run build:deploy` + `npm prune`.
#   Final image: ~1.2–1.5 GB (still correct after all the other fixes).
# ─────────────────────────────────────────────────────────────────────────────

PREBUILT_FRONTEND="dist/public/index.html"
PREBUILT_SERVER="dist/index.cjs"
PREBUILT_CLUSTER="dist/cluster.cjs"
RUST_BIN="./boosterstate/target/release/boosterstate"

if [ -f "$PREBUILT_FRONTEND" ] && [ -f "$PREBUILT_SERVER" ] && [ -f "$PREBUILT_CLUSTER" ]; then
  echo "==> FAST PATH: all pre-built artifacts present"
  echo "   dist/public/, dist/index.cjs, dist/cluster.cjs already committed."

  # Save postinstall.mjs BEFORE deleting scripts/ — it patches BullMQ after install.
  # We use --ignore-scripts below so npm doesn't try to run the deleted file,
  # then execute the saved copy manually once node_modules/ is ready.
  cp scripts/postinstall.mjs /tmp/postinstall.mjs 2>/dev/null || true

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
rm -f  node_modules/@tensorflow/tfjs-node/binding/tfjs_binding.node 2>/dev/null || true
echo "   TF native binaries removed."

# ─── Rust sidecar ────────────────────────────────────────────────────────────
echo "==> Rust sidecar..."
if [ -f "$RUST_BIN" ] && [ -s "$RUST_BIN" ]; then
  echo "   Pre-built binary found — skipping cargo compile."
  echo "   Binary: $(du -sh "$RUST_BIN" | cut -f1)"
else
  echo "   No pre-built binary — running cargo build --release..."
  cargo build --release --manifest-path boosterstate/Cargo.toml
  echo "   Rust binary built: $(du -sh "$RUST_BIN" | cut -f1)"
fi

echo "==> Preserving Rust binary and removing Rust source tree..."
cp "$RUST_BIN" /tmp/boosterstate-release
rm -rf boosterstate/
mkdir -p boosterstate/target/release
mv /tmp/boosterstate-release boosterstate/target/release/boosterstate
chmod +x boosterstate/target/release/boosterstate
echo "   Rust source tree removed. Binary at: boosterstate/target/release/boosterstate"

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

# Bundled test suites inside packages.
find node_modules -type d \( -name "__tests__" -o -name "test" -o -name "tests" \) \
  -not -path "*/.bin/*" \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: test directories inside node_modules"

# Documentation, examples, and meta-files bundled inside packages.
find node_modules -maxdepth 3 -type d \
  \( -name "docs" -o -name "doc" -o -name "examples" -o -name "example" \
     -o -name "tutorial" -o -name "tutorials" -o -name ".github" -o -name "benchmark" \
     -o -name "benchmarks" -o -name "fixtures" -o -name "scripts" \) \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: docs/examples/fixtures directories inside node_modules"

# Markdown, changelog, and license files duplicated inside every package.
find node_modules -maxdepth 3 -type f \
  \( -name "CHANGELOG.md" -o -name "CHANGELOG" -o -name "HISTORY.md" \
     -o -name "CHANGES.md" -o -name "CONTRIBUTING.md" -o -name "AUTHORS" \
     -o -name "NOTICE" -o -name "*.md" \) \
  -delete 2>/dev/null || true
echo "   Removed: changelog/readme files inside node_modules"

echo "   Final node_modules size: $(du -sh node_modules | cut -f1)"

# ─── Final summary ────────────────────────────────────────────────────────────
echo ""
echo "==> Build image size summary:"
du -sh dist/ node_modules/ boosterstate/ 2>/dev/null \
  | awk '{printf "   %-15s %s\n", $2, $1}'
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
