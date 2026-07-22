#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing dependencies..."
npm install --no-audit --no-fund --ignore-scripts --legacy-peer-deps 2>&1 | tail -5

echo "=== Done ==="
