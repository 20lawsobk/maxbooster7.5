#!/bin/bash
set -e

echo "=== Post-merge setup ==="

# Install / sync dependencies (non-interactive)
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -5

# Push any schema changes to the database (Drizzle, non-interactive)
if npm run --silent db:push -- --force 2>/dev/null; then
  echo "✅ DB schema up to date"
else
  echo "⚠️  db:push not configured or no changes — skipping"
fi

echo "=== Post-merge setup complete ==="
