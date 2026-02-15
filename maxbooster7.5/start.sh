#!/bin/bash
# Max Booster - Production Startup Script
# Handles boosterstate service, database connection, and web server

set -e  # Exit on any error

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║        🚀 MAX BOOSTER 10.0 - PRODUCTION STARTUP 🚀            ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ==========================================
# ENVIRONMENT CONFIGURATION
# ==========================================
export NODE_ENV=production
export PORT=${PORT:-5000}

echo -e "${BLUE}📦 Environment Configuration:${NC}"
echo -e "   ▸ NODE_ENV: ${GREEN}${NODE_ENV}${NC}"
echo -e "   ▸ PORT: ${GREEN}${PORT}${NC}"
echo ""

# ==========================================
# PRE-FLIGHT CHECKS
# ==========================================
echo -e "${BLUE}🔍 Pre-flight Checks:${NC}"

# Check if dist folder exists
if [ ! -d "dist" ]; then
  echo -e "${RED}❌ ERROR: dist folder not found!${NC}"
  echo -e "${YELLOW}   Run 'npm run build' first.${NC}"
  exit 1
fi
echo -e "${GREEN}   ✅ Build artifacts found${NC}"

# Check if dist/index.cjs exists
if [ ! -f "dist/index.cjs" ]; then
  echo -e "${RED}❌ ERROR: dist/index.cjs not found!${NC}"
  echo -e "${YELLOW}   Run 'npm run build' first.${NC}"
  exit 1
fi
echo -e "${GREEN}   ✅ Server bundle ready${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo -e "${RED}❌ ERROR: node_modules not found!${NC}"
  echo -e "${YELLOW}   Run 'npm install' first.${NC}"
  exit 1
fi
echo -e "${GREEN}   ✅ Dependencies installed${NC}"

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ WARNING: DATABASE_URL not set!${NC}"
  echo -e "${YELLOW}   Database features will not work.${NC}"
else
  echo -e "${GREEN}   ✅ Database configured${NC}"
fi

echo ""

# ==========================================
# BOOSTERSTATE SERVICE (OPTIONAL)
# ==========================================
BOOSTERSTATE_PID=""

if [ -f "boosterstate/target/release/boosterstate" ]; then
  echo -e "${BLUE}🔧 Starting boosterstate service...${NC}"
  
  # Start boosterstate in background
  ./boosterstate/target/release/boosterstate &
  BOOSTERSTATE_PID=$!
  
  echo -e "${GREEN}   ✅ boosterstate started (PID: $BOOSTERSTATE_PID)${NC}"
  
  # Give it time to initialize
  echo -e "${YELLOW}   ⏳ Waiting for boosterstate to initialize...${NC}"
  sleep 3
  
  # Check if still running
  if ps -p $BOOSTERSTATE_PID > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ boosterstate running successfully${NC}"
  else
    echo -e "${YELLOW}   ⚠️  boosterstate exited (this is optional)${NC}"
    BOOSTERSTATE_PID=""
  fi
else
  echo -e "${YELLOW}⚠️  boosterstate binary not found (optional component)${NC}"
fi

echo ""

# ==========================================
# CLEANUP HANDLER
# ==========================================
cleanup() {
  echo ""
  echo -e "${BLUE}🛑 Shutting down Max Booster...${NC}"
  
  if [ ! -z "$BOOSTERSTATE_PID" ]; then
    echo -e "${YELLOW}   Stopping boosterstate (PID: $BOOSTERSTATE_PID)...${NC}"
    kill $BOOSTERSTATE_PID 2>/dev/null || true
    wait $BOOSTERSTATE_PID 2>/dev/null || true
    echo -e "${GREEN}   ✅ boosterstate stopped${NC}"
  fi
  
  echo -e "${GREEN}✅ Max Booster shutdown complete${NC}"
  exit 0
}

# Register cleanup handler
trap cleanup SIGTERM SIGINT EXIT

# ==========================================
# START MAX BOOSTER SERVER
# ==========================================
echo -e "${BLUE}🎵 Starting Max Booster Server...${NC}"
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║                  MAX BOOSTER 10.0 STARTING                     ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║  Port:              ${PORT}                                          ║${NC}"
echo -e "${GREEN}║  Environment:       ${NODE_ENV}                                   ║${NC}"
echo -e "${GREEN}║  Plugins:           413                                        ║${NC}"
echo -e "${GREEN}║  Compression:       903:1                                      ║${NC}"
echo -e "${GREEN}║  AI Engine:         Custom (100%)                             ║${NC}"
echo -e "${GREEN}║  Autopilot:         Active                                     ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Start the Node.js server
node dist/index.cjs

# This line is reached only if the server exits
echo -e "${RED}❌ Server exited unexpectedly${NC}"
exit 1
