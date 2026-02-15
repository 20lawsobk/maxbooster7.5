#!/bin/bash
# Max Booster - Replit Development Server

set -e

# Color codes
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        🔨 MAX BOOSTER 10.0 - REPLIT DEV MODE 🔨               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ==========================================
# ENVIRONMENT
# ==========================================
export NODE_ENV=development
export PORT=${PORT:-5000}

echo -e "${BLUE}📦 Environment:${NC}"
echo -e "   ▸ Platform: ${GREEN}Replit${NC}"
echo -e "   ▸ NODE_ENV: ${YELLOW}${NODE_ENV}${NC}"
echo -e "   ▸ PORT: ${GREEN}${PORT}${NC}"
echo -e "   ▸ Hot Reload: ${GREEN}Enabled${NC}"
echo ""

# ==========================================
# BOOSTERSTATE (OPTIONAL)
# ==========================================
BOOSTERSTATE_PID=""

if [ -f "./boosterstate/target/release/boosterstate" ]; then
  echo -e "${BLUE}🔧 Starting boosterstate...${NC}"
  ./boosterstate/target/release/boosterstate &
  BOOSTERSTATE_PID=$!
  sleep 1
  echo -e "${GREEN}✅ boosterstate running${NC}"
else
  echo -e "${YELLOW}⚠️  boosterstate not found (optional)${NC}"
fi

echo ""

# ==========================================
# CLEANUP
# ==========================================
cleanup() {
  echo ""
  echo -e "${BLUE}🛑 Shutting down...${NC}"
  if [ ! -z "$BOOSTERSTATE_PID" ]; then
    kill $BOOSTERSTATE_PID 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# ==========================================
# START DEV SERVER
# ==========================================
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          MAX BOOSTER 10.0 - DEVELOPMENT MODE                   ║${NC}"
echo -e "${YELLOW}║                                                                ║${NC}"
echo -e "${YELLOW}║  Hot Reload:      Enabled                                      ║${NC}"
echo -e "${YELLOW}║  TypeScript:      tsx                                          ║${NC}"
echo -e "${YELLOW}║  Port:            ${PORT}                                            ║${NC}"
echo -e "${YELLOW}║                                                                ║${NC}"
echo -e "${YELLOW}║  Press Ctrl+C to stop                                          ║${NC}"
echo -e "${YELLOW}║                                                                ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

tsx server/index.ts
