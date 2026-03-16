#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm ci

echo "==> Removing TF native libraries downloaded by tfjs-node install script..."
# @tensorflow/tfjs-node downloads ~400 MB of native TF binaries during npm ci
# (via its postinstall script). They are not used at runtime — the server uses
# the WASM/CPU backend or tfjs-node-gpu. Remove immediately to reclaim space.
rm -rf node_modules/@tensorflow/tfjs-node/deps/ 2>/dev/null || true
rm -f  node_modules/@tensorflow/tfjs-node/binding/tfjs_binding.node 2>/dev/null || true
echo "   TF native binaries removed."

RUST_BIN=./boosterstate/target/release/boosterstate

echo "==> Rust sidecar..."
if [ -f "$RUST_BIN" ] && [ -s "$RUST_BIN" ]; then
  echo "   Pre-built binary found — skipping cargo compile (saves ~15 min)."
  echo "   Binary: $(du -sh "$RUST_BIN" | cut -f1)"
else
  echo "   No pre-built binary — running cargo build --release..."
  cargo build --release --manifest-path boosterstate/Cargo.toml
  echo "   Rust binary built: $(du -sh "$RUST_BIN" | cut -f1)"
fi

echo "==> Extracting Rust binary and removing Rust source tree..."
# Preserve only the release binary; delete the entire source + target tree to
# reclaim disk space (hundreds of MB of .rlib / .rmeta / incremental objects).
cp "$RUST_BIN" /tmp/boosterstate-release
rm -rf boosterstate/
mkdir -p boosterstate/target/release
mv /tmp/boosterstate-release boosterstate/target/release/boosterstate
chmod +x boosterstate/target/release/boosterstate
echo "   Rust source tree removed. Binary at: boosterstate/target/release/boosterstate"

echo "==> Clearing build caches before Vite compile..."
# .cache/ can contain multi-GB UV/Python and Electron caches from previous runs.
# node_modules/.vite/ is Vite's dep-optimizer cache (~40 MB). Both are safe to
# delete before the build; Vite will recreate a fresh cache during compilation.
rm -rf .cache/ node_modules/.vite/ node_modules/.cache/ 2>/dev/null || true
echo "   Pre-build caches cleared."

echo "==> Clearing any pre-built frontend assets to force a fresh Vite build..."
rm -rf dist/public
echo "   Pre-built assets cleared."

echo "==> Building application (Vite frontend + esbuild server bundle)..."
npm run build:deploy

echo "==> Removing source directories (compiled output lives in dist/ — sources not needed at runtime)..."
# TypeScript/TSX source compiled into dist/index.cjs (server) and dist/public/
# (frontend). Also clear ALL caches created by Vite/esbuild/UV during the build.
rm -rf \
  client/ \
  server/ \
  shared/ \
  script/ \
  scripts/ \
  electron/ \
  attached_assets/ \
  docs/ \
  .cache/ \
  node_modules/.vite/ \
  node_modules/.cache/ \
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
  2>/dev/null || true
REMOVED_SIZE=$(du -sh dist/ 2>/dev/null | cut -f1)
echo "   Source dirs + caches removed. dist/ size: ${REMOVED_SIZE}"

echo "==> Pruning dev dependencies..."
npm prune --omit=dev

echo "==> Stripping node_modules to reduce deployment image size..."

# Belt-and-suspenders: explicitly remove the largest known dev-only packages
# in case npm prune misses any transitive electron/builder dependencies.
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
echo "   Removed: electron / app-builder / 7zip-bin dev packages"

# WebGL backend — no GPU/WebGL in a Node.js server environment.
rm -rf node_modules/@tensorflow/tfjs-backend-webgl 2>/dev/null || true
echo "   Removed: @tensorflow/tfjs-backend-webgl"

# tfjs-node ships both ESM and CJS copies of every kernel; only CJS is used.
rm -rf node_modules/@tensorflow/tfjs-node/dist/kernels 2>/dev/null || true
echo "   Removed: @tensorflow/tfjs-node/dist/kernels (redundant ESM kernels)"

# @tensorflow/tfjs ships browser UMD/ESM bundle variants that are unused in Node.
# Only tf.node.js (1.3 MB) is needed; remove the larger browser bundles (~130 MB).
rm -f \
  node_modules/@tensorflow/tfjs/dist/tf.js \
  node_modules/@tensorflow/tfjs/dist/tf.min.js \
  node_modules/@tensorflow/tfjs/dist/tf.es2017.js \
  node_modules/@tensorflow/tfjs/dist/tf.es2017.min.js \
  node_modules/@tensorflow/tfjs/dist/tf.fesm.js \
  node_modules/@tensorflow/tfjs/dist/tf.fesm.min.js \
  2>/dev/null || true
echo "   Removed: @tensorflow/tfjs browser bundle variants (~130 MB)"

# Sentry ships separate SDKs for browser, browser-replay, and Node.js.
# In a server deployment only the Node.js SDK is needed.
rm -rf \
  node_modules/@sentry/browser \
  node_modules/@sentry/vue \
  node_modules/@sentry/react \
  node_modules/@sentry-internal/browser-utils \
  node_modules/@sentry-internal/replay \
  node_modules/@sentry-internal/replay-canvas \
  node_modules/@sentry-internal/feedback \
  2>/dev/null || true
echo "   Removed: Sentry browser/replay SDKs (server only needs @sentry/node)"

# Source maps add ~70 MB across thousands of packages — never used at runtime.
find node_modules -name "*.map" -type f -delete 2>/dev/null || true
echo "   Removed: *.map source map files"

# TypeScript declaration files are resolved at build time, not runtime.
find node_modules -name "*.d.ts" -type f -delete 2>/dev/null || true
echo "   Removed: *.d.ts TypeScript declaration files"

# Bundled test suites inside packages
find node_modules -type d \( -name "__tests__" -o -name "test" -o -name "tests" \) \
  -not -path "*/.bin/*" \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: test directories inside node_modules"

# Documentation, examples, and repository meta-files bundled inside packages
find node_modules -maxdepth 3 -type d \
  \( -name "docs" -o -name "doc" -o -name "examples" -o -name "example" \
     -o -name "tutorial" -o -name "tutorials" -o -name ".github" -o -name "benchmark" \
     -o -name "benchmarks" -o -name "fixtures" -o -name "scripts" \) \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: docs/examples/fixtures directories inside node_modules"

# Markdown, changelog, and license files duplicated inside every package
find node_modules -maxdepth 3 -type f \
  \( -name "CHANGELOG.md" -o -name "CHANGELOG" -o -name "HISTORY.md" \
     -o -name "CHANGES.md" -o -name "CONTRIBUTING.md" -o -name "AUTHORS" \
     -o -name "NOTICE" -o -name "*.md" \) \
  -delete 2>/dev/null || true
echo "   Removed: changelog/readme markdown files inside node_modules"

echo "   Final node_modules size: $(du -sh node_modules | cut -f1)"

echo ""
echo "==> Build image size summary:"
du -sh dist/ node_modules/ boosterstate/ .cache/ 2>/dev/null | awk '{printf "   %-15s %s\n", $2, $1}'
echo "   .cache should be absent above (2.8 GB if not cleaned)"
echo "   Total workspace: $(du -sh --exclude=.git . 2>/dev/null | cut -f1)"
echo ""
echo "==> Build complete."
