#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm ci

echo "==> Building Rust sidecar..."
cd boosterstate
cargo build --release
cd ..

echo "==> Building application..."
npm run build:deploy

echo "==> Pruning dev dependencies..."
npm prune --omit=dev

echo "==> Build complete."
