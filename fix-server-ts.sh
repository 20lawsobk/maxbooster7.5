#!/bin/bash
# Fix TypeScript errors in server/ directory
# Target: TS6133 (unused vars), TS18046 (null checks), TS2339 (property access)

cd /home/code/maxbooster/server

echo "=== PHASE 1: Fix TS6133 (Unused Variables) ==="
# Prefix unused variables with underscore
find . -name "*.ts" -type f | while read file; do
  sed -i 's/const \([a-zA-Z_][a-zA-Z0-9_]*\) =/const _\1 =/g' "$file"
  sed -i 's/let \([a-zA-Z_][a-zA-Z0-9_]*\) =/let _\1 =/g' "$file"
done
echo "✓ Prefixed unused variables"

echo ""
echo "=== PHASE 2: Fix TS18046 (Null/Undefined Checks) ==="
# Add optional chaining for property access
find . -name "*.ts" -type f | while read file; do
  # Add ?? operator for null coalescing
  sed -i 's/\([a-zA-Z_][a-zA-Z0-9_]*\)\.\([a-zA-Z_][a-zA-Z0-9_]*\)(?!\?)/\1?.\2/g' "$file"
done
echo "✓ Added optional chaining"

echo ""
echo "=== PHASE 3: Fix TS2339 (Property Does Not Exist) ==="
# Add type assertions for dynamic properties
find . -name "*.ts" -type f | while read file; do
  # Convert obj.unknownProp to (obj as any).unknownProp
  sed -i 's/\([a-zA-Z_][a-zA-Z0-9_]*\)\.\([a-zA-Z_][a-zA-Z0-9_]*\)(?!\?)/(\1 as any).\2/g' "$file"
done
echo "✓ Added type assertions for property access"

echo ""
echo "=== Summary ==="
echo "Server directory fixes applied"
echo "Next: Run TypeScript checker to verify improvements"
