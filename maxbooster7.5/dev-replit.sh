#!/bin/bash
# Max Booster Development Server for Replit

set -e

echo "🔨 Starting Max Booster 10.0 (Development Mode)..."

# Check if boosterstate binary exists (optional)
if [ -f "./boosterstate/target/release/boosterstate" ]; then
  echo "🔧 Starting boosterstate service..."
  ./boosterstate/target/release/boosterstate &
  BOOSTERSTATE_PID=$!
  sleep 1
fi

# Set development environment
export NODE_ENV=development
export PORT=${PORT:-5000}

echo "📦 Environment: $NODE_ENV"
echo "🔌 Port: $PORT"

# Start the development server with hot reload
echo "🎵 Starting Max Booster dev server..."
tsx server/index.ts

# Cleanup on exit
trap "kill $BOOSTERSTATE_PID 2>/dev/null || true" EXIT
