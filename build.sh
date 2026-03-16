#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm ci

echo "==> Removing TF native libraries downloaded by tfjs-node install script..."
# @tensorflow/tfjs-node is a dev dep that downloads ~400 MB of native TF binaries
# during npm ci (via its postinstall script). Remove them immediately — they are
# not needed at build time and the package itself is pruned after build anyway.
rm -rf node_modules/@tensorflow/tfjs-node/deps/ 2>/dev/null || true
rm -f  node_modules/@tensorflow/tfjs-node/binding/tfjs_binding.node 2>/dev/null || true
echo "   TF native binaries removed."

echo "==> Building Rust sidecar..."
cd boosterstate
cargo build --release
cd ..

echo "==> Pruning Rust intermediate build artifacts (keep only release binary)..."
# The Rust target/ directory contains hundreds of MB of .rlib, .rmeta, .d and
# incremental-compilation objects that are not needed after the binary is built.
RUST_BIN=./boosterstate/target/release/boosterstate
if [ -f "$RUST_BIN" ]; then
  cp "$RUST_BIN" /tmp/boosterstate-bin
  rm -rf boosterstate/target
  mkdir -p boosterstate/target/release
  mv /tmp/boosterstate-bin boosterstate/target/release/boosterstate
  chmod +x boosterstate/target/release/boosterstate
  echo "   Rust binary preserved: $(du -sh boosterstate/target/release/boosterstate | cut -f1)"
else
  echo "   WARNING: Rust binary not found at $RUST_BIN"
fi

echo "==> Building application..."
npm run build:deploy

echo "==> Pruning dev dependencies..."
npm prune --omit=dev

echo "==> Stripping node_modules to reduce deployment image size..."

# Remove WebGL backend — WebGL does not exist in a Node.js server environment;
# the CPU backend (@tensorflow/tfjs-backend-cpu) is used automatically instead.
rm -rf node_modules/@tensorflow/tfjs-backend-webgl
echo "   Removed: @tensorflow/tfjs-backend-webgl"

# Source maps are not used at runtime (saves ~70 MB across 16k+ files)
find node_modules -name "*.map" -type f -delete 2>/dev/null || true
echo "   Removed: *.map source map files"

# TypeScript declaration files are not needed at runtime
find node_modules -name "*.d.ts" -type f -delete 2>/dev/null || true
echo "   Removed: *.d.ts TypeScript declaration files"

# Bundled test suites inside node_modules
find node_modules -type d \( -name "__tests__" -o -name "test" -o -name "tests" \) \
  -not -path "*/.bin/*" \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: test directories inside node_modules"

# Documentation and example directories bundled inside packages
find node_modules -maxdepth 3 -type d \
  \( -name "docs" -o -name "doc" -o -name "examples" -o -name "example" \
     -o -name "tutorial" -o -name "tutorials" -o -name ".github" \) \
  -exec rm -rf {} + 2>/dev/null || true
echo "   Removed: docs/examples directories inside node_modules"

echo "   Final node_modules size: $(du -sh node_modules | cut -f1)"

echo "==> Build complete."
