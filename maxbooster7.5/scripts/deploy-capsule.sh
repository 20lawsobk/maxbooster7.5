#!/bin/bash
#
# CAPSULE DEPLOYMENT SCRIPT
# 
# Builds the Max Booster capsule and prepares it for deployment.
# 
# Usage: ./scripts/deploy-capsule.sh [deployment-dir]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="${1:-$PROJECT_ROOT/deploy}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           MAX BOOSTER - CAPSULE DEPLOYMENT                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Project Root: $PROJECT_ROOT"
echo "Deploy Dir:   $DEPLOY_DIR"
echo ""

# Step 1: Build the capsule
echo "🔨 Building capsule..."
cd "$PROJECT_ROOT"
npm run build:capsule

# Step 2: Create deployment directory
echo ""
echo "📁 Preparing deployment directory..."
mkdir -p "$DEPLOY_DIR"

# Step 3: Copy capsule files
echo "📋 Copying deployment files..."
cp -r "$PROJECT_ROOT/dist-capsule/platform-capsule.pocket" "$DEPLOY_DIR/"
cp "$PROJECT_ROOT/dist-capsule/capsule-loader.js" "$DEPLOY_DIR/"
cp "$PROJECT_ROOT/dist-capsule/deploy-info.json" "$DEPLOY_DIR/"

# Step 4: Create a simple start script
cat > "$DEPLOY_DIR/start.sh" << 'EOF'
#!/bin/bash
# Max Booster Capsule Start Script
cd "$(dirname "${BASH_SOURCE[0]}")"
node capsule-loader.js
EOF
chmod +x "$DEPLOY_DIR/start.sh"

# Step 5: Calculate and display sizes
echo ""
echo "📊 Deployment Summary:"
echo "═══════════════════════════════════════════════════════════"

CAPSULE_SIZE=$(du -sh "$DEPLOY_DIR/platform-capsule.pocket" 2>/dev/null | cut -f1)
LOADER_SIZE=$(du -sh "$DEPLOY_DIR/capsule-loader.js" 2>/dev/null | cut -f1)
TOTAL_SIZE=$(du -sh "$DEPLOY_DIR" 2>/dev/null | cut -f1)

echo "  Capsule:      $CAPSULE_SIZE"
echo "  Loader:       $LOADER_SIZE"
echo "  Total:        $TOTAL_SIZE"
echo ""
echo "📁 Deployment Contents:"
ls -la "$DEPLOY_DIR"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ Deployment ready at: $DEPLOY_DIR"
echo ""
echo "To run the platform:"
echo "  cd $DEPLOY_DIR"
echo "  ./start.sh"
echo ""
echo "Or directly:"
echo "  node $DEPLOY_DIR/capsule-loader.js"
echo ""
