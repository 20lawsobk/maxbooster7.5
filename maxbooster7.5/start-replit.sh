#!/bin/bash
# Max Booster Replit Startup Script

set -e

echo "🚀 Starting Max Booster 10.0..."

# Check if boosterstate binary exists (optional Rust component)
if [ -f "./boosterstate/target/release/boosterstate" ]; then
  echo "🔧 Starting boosterstate service..."
  ./boosterstate/target/release/boosterstate &
  BOOSTERSTATE_PID=$!
  sleep 2
else
  echo "⚠️  boosterstate binary not found, skipping (optional)"
fi

# Set production environment
export NODE_ENV=production
export PORT=${PORT:-5000}

echo "📦 Environment: $NODE_ENV"
echo "🔌 Port: $PORT"

# Start the server
echo "🎵 Starting Max Booster server..."
node dist/index.cjs

# Cleanup on exit
trap "kill $BOOSTERSTATE_PID 2>/dev/null || true" EXIT
