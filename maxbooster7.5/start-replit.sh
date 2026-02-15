#!/bin/bash
# Max Booster - Replit Production Startup Script

set -e

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        🚀 MAX BOOSTER 10.0 - REPLIT PRODUCTION 🚀             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ==========================================
# ENVIRONMENT CONFIGURATION
# ==========================================
export NODE_ENV=production
export PORT=${PORT:-5000}

echo -e "${BLUE}📦 Environment:${NC}"
echo -e "   ▸ Platform: ${GREEN}Replit${NC}"
echo -e "   ▸ NODE_ENV: ${GREEN}${NODE_ENV}${NC}"
echo -e "   ▸ PORT: ${GREEN}${PORT}${NC}"
echo ""

# ==========================================
# PRE-FLIGHT CHECKS
# ==========================================
echo -e "${BLUE}🔍 Checking build...${NC}"

if [ ! -f "dist/index.cjs" ]; then
  echo -e "${YELLOW}⚠️  Build not found, building now...${NC}"
  npm run build
fi

echo -e "${GREEN}✅ Build ready${NC}"
echo ""

# ==========================================
# BOOSTERSTATE SERVICE (OPTIONAL)
# ==========================================
BOOSTERSTATE_PID=""

if [ -f "./boosterstate/target/release/boosterstate" ]; then
  echo -e "${BLUE}🔧 Starting boosterstate...${NC}"
  ./boosterstate/target/release/boosterstate &
  BOOSTERSTATE_PID=$!
  sleep 2
  
  if ps -p $BOOSTERSTATE_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ boosterstate running (PID: $BOOSTERSTATE_PID)${NC}"
  else
    echo -e "${YELLOW}⚠️  boosterstate optional service not running${NC}"
    BOOSTERSTATE_PID=""
  fi
else
  echo -e "${YELLOW}⚠️  boosterstate not found (optional)${NC}"
fi

echo ""

# ==========================================
# CLEANUP HANDLER
# ==========================================
cleanup() {
  echo ""
  echo -e "${BLUE}🛑 Shutting down...${NC}"
  if [ ! -z "$BOOSTERSTATE_PID" ]; then
    kill $BOOSTERSTATE_PID 2>/dev/null || true
    wait $BOOSTERSTATE_PID 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# ==========================================
# START SERVER
# ==========================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              MAX BOOSTER 10.0 ON REPLIT                        ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║  🎹 Plugins:       413                                         ║${NC}"
echo -e "${GREEN}║  💾 Compression:   903:1                                       ║${NC}"
echo -e "${GREEN}║  🤖 AI:            100% Custom                                 ║${NC}"
echo -e "${GREEN}║  ⚡ Autopilot:     Active                                      ║${NC}"
echo -e "${GREEN}║  🌐 Port:          ${PORT}                                           ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

node dist/index.cjs
