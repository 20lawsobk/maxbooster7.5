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

echo "==> Building Rust sidecar..."
cargo build --release --manifest-path boosterstate/Cargo.toml

echo "==> Extracting Rust release binary and removing entire Rust source tree..."
# Move the release binary to a stable top-level path, then delete the Rust
# source tree and the full target/ directory (hundreds of MB of build artifacts).
RUST_BIN=./boosterstate/target/release/boosterstate
if [ -f "$RUST_BIN" ]; then
  cp "$RUST_BIN" /tmp/boosterstate-release
  rm -rf boosterstate/
  mkdir -p boosterstate/target/release
  mv /tmp/boosterstate-release boosterstate/target/release/boosterstate
  chmod +x boosterstate/target/release/boosterstate
  echo "   Rust binary preserved at: boosterstate/target/release/boosterstate ($(du -sh boosterstate/target/release/boosterstate | cut -f1))"
else
  echo "   WARNING: Rust binary not found at $RUST_BIN"
fi

echo "==> Clearing any pre-built frontend assets to force a fresh Vite build..."
rm -rf dist/public
echo "   Pre-built assets cleared."

echo "==> Building application (Vite frontend + esbuild server bundle)..."
npm run build:deploy

echo "==> Removing source directories (compiled output lives in dist/ — sources not needed at runtime)..."
# These directories contain TypeScript/TSX source code that has been compiled
# into dist/index.cjs (server) and dist/public/ (frontend). Deleting them
# is safe and saves ~1 GB, primarily from binary blobs embedded in client source files.
rm -rf \
  client/ \
  server/ \
  shared/ \
  script/ \
  scripts/ \
  electron/ \
  attached_assets/ \
  docs/ \
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
echo "   Source directories removed. dist/ size: ${REMOVED_SIZE}"

echo "==> Pruning dev dependencies..."
npm prune --omit=dev

echo "==> Stripping node_modules to reduce deployment image size..."

# WebGL backend — no GPU/WebGL in a Node.js server environment.
# The CPU/WASM backend is used automatically instead.
rm -rf node_modules/@tensorflow/tfjs-backend-webgl
echo "   Removed: @tensorflow/tfjs-backend-webgl"

# tfjs-node ships both ESM and CJS copies of every kernel; only one is used.
# The ESM kernels directory is unused in a CJS bundle context.
rm -rf node_modules/@tensorflow/tfjs-node/dist/kernels 2>/dev/null || true
echo "   Removed: @tensorflow/tfjs-node/dist/kernels (redundant ESM kernels)"

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

# Source maps add ~70 MB across thousands of packages and are never used
# by the running Node.js process.
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
du -sh dist/ node_modules/ boosterstate/ 2>/dev/null | awk '{printf "   %-15s %s\n", $2, $1}'
echo "   Total workspace: $(du -sh . 2>/dev/null | cut -f1)"
echo ""
echo "==> Build complete."
