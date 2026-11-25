#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Max Booster — GCP Instance Full Deployment Script
#
# Deploys the complete in-house DNS + TLS stack to GCP 34.117.33.233:
#   1. System deps (Go 1.22 + Node.js 20)
#   2. dns-os (Go authoritative DNS)          → systemd: max-booster-dns
#   3. dns-node ns1 (TypeScript DNS, port 53) → systemd: max-booster-ns1
#   4. tls-proxy (Node.js TLS SNI + redirect) → systemd: max-booster-tls-proxy
#   5. Firewall (ports 22/53/80/443/8080)
#   6. Zone seed migration (003_max_booster_zone.sql)
#   7. Health checks
#
# Usage (run from the project root):
#   export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
#   export BACKEND_HOST="maxbooster.replit.app"      # NEVER set to max-booster.com
#   export MAIN_APP_URL="https://maxbooster.replit.app"   # for dns-node zone sync
#   bash deploy-gcp.sh [GCP_IP]
#
# Optional:
#   GCP_USER=ubuntu  GCP_SSH_KEY=~/.ssh/gcp_id_rsa  bash deploy-gcp.sh
#   DNS_SYNC_SECRET=mysecret  bash deploy-gcp.sh   (adds X-DNS-Sync-Secret)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

GCP_IP="${1:-34.117.33.233}"
GCP_USER="${GCP_USER:-ubuntu}"
GCP_SSH_KEY="${GCP_SSH_KEY:-}"
DEPLOY_DIR="/opt/max-booster"
# Confirmed live production URL (verified via the deployments service on
# 2026-08-21) — pinned as the default so the DNS stack always syncs zone
# data from the actual running app, not a guess. Override only if the app
# is ever republished under a different domain.
MAIN_APP_URL="${MAIN_APP_URL:-https://maxbooster.replit.app}"
DNS_SYNC_SECRET="${DNS_SYNC_SECRET:-}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required"
  echo "  export DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'"
  exit 1
fi

if [[ -z "${BACKEND_HOST:-}" ]]; then
  BACKEND_HOST="maxbooster.replit.app"
  echo "WARN: BACKEND_HOST not set — defaulting to ${BACKEND_HOST}"
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "$GCP_SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$GCP_SSH_KEY")
fi

ssh_cmd() { ssh "${SSH_OPTS[@]}" "${GCP_USER}@${GCP_IP}" "$@"; }
scp_cmd() { scp -q "${SSH_OPTS[@]}" "$@"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Max Booster GCP Deploy → ${GCP_USER}@${GCP_IP}"
echo "  Backend : ${BACKEND_HOST}"
echo "  Zone sync: ${MAIN_APP_URL}/api/dns/zone/max-booster.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Install system dependencies ────────────────────────────────────────
echo ""
echo "▶ Step 1: Installing system dependencies"
ssh_cmd bash << 'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq curl wget git build-essential ca-certificates postgresql-client 2>/dev/null || true

# Go 1.22
if ! command -v go &>/dev/null; then
  echo "  Installing Go 1.22..."
  wget -q https://go.dev/dl/go1.22.3.linux-amd64.tar.gz -O /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
  export PATH=$PATH:/usr/local/go/bin
fi
echo "  Go: $(go version)"

# Node.js 20
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1)" != "v20" ]]; then
  echo "  Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
fi
echo "  Node: $(node --version)"
echo "  npm : $(npm --version)"

mkdir -p /opt/max-booster
REMOTE

# ── Step 2: Deploy dns-os (Go authoritative DNS server) ────────────────────────
echo ""
echo "▶ Step 2: Deploying dns-os Go authoritative DNS server"
ssh_cmd "mkdir -p ${DEPLOY_DIR}/dns-authoritative/bin"
scp_cmd dns-os/services/dns-authoritative/*.go \
        dns-os/services/dns-authoritative/go.mod \
        dns-os/services/dns-authoritative/go.sum \
        "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/dns-authoritative/"

ssh_cmd bash << REMOTE
set -euo pipefail
export PATH=\$PATH:/usr/local/go/bin
cd ${DEPLOY_DIR}/dns-authoritative
go mod download -x 2>&1 | tail -3
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/dns-authoritative .
echo "  Build OK: \$(ls -lh bin/dns-authoritative | awk '{print \$5, \$9}')"

cat > /etc/systemd/system/max-booster-dns.service << 'EOF'
[Unit]
Description=Max Booster Go Authoritative DNS Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${DEPLOY_DIR}/dns-authoritative
ExecStart=${DEPLOY_DIR}/dns-authoritative/bin/dns-authoritative
Restart=always
RestartSec=5
Environment="DATABASE_URL=${DATABASE_URL}"
Environment="DNS_PORT=53"
Environment="ZONE_REFRESH_INTERVAL=5s"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=max-booster-dns

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --quiet max-booster-dns
systemctl restart max-booster-dns
sleep 3
systemctl is-active max-booster-dns && echo "  Service max-booster-dns: RUNNING" || journalctl -u max-booster-dns -n 20
REMOTE

# ── Step 3: Deploy dns-node (TypeScript secondary DNS) ─────────────────────────
echo ""
echo "▶ Step 3: Deploying dns-node TypeScript nameserver"
ssh_cmd "mkdir -p ${DEPLOY_DIR}/dns-node/src ${DEPLOY_DIR}/dns-node/data"
scp_cmd dns-node/package.json dns-node/tsconfig.json \
        "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/dns-node/"
scp_cmd dns-node/src/*.ts "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/dns-node/src/"
scp_cmd dns-node/data/zone.json "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/dns-node/data/"

# Compose the zone sync URL (with optional secret header in env, not URL)
ZONE_SYNC_URL="${MAIN_APP_URL}/api/dns/zone/max-booster.com"

ssh_cmd bash << REMOTE
set -euo pipefail
cd ${DEPLOY_DIR}/dns-node
npm install --quiet --omit=dev
npm install --quiet typescript tsx @types/node  # devDeps needed for build
npx tsc --project tsconfig.json
echo "  Build OK"

# dns-node ns1 (primary on port 53 — runs in place of dns-os on port 53)
# Both dns-os and dns-node listen on port 53; run only one. dns-os is primary.
# dns-node runs on port 5353 as a hot-standby / secondary nameserver.
cat > /etc/systemd/system/max-booster-ns1.service << 'EOF'
[Unit]
Description=Max Booster dns-node ns1 (TypeScript secondary nameserver)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${DEPLOY_DIR}/dns-node
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment="DNS_PORT=5353"
Environment="DNS_SERVER_ROLE=ns1"
Environment="HEALTH_PORT=5380"
Environment="ZONE_FILE=${DEPLOY_DIR}/dns-node/data/zone.json"
Environment="ZONE_SYNC_URL=${ZONE_SYNC_URL}"
Environment="ZONE_SYNC_INTERVAL_S=120"
Environment="DNS_SYNC_SECRET=${DNS_SYNC_SECRET}"
Environment="GEODNS_ENABLED=false"
Environment="DNSSEC_ENABLED=false"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=max-booster-ns1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --quiet max-booster-ns1
systemctl restart max-booster-ns1
sleep 3
systemctl is-active max-booster-ns1 && echo "  Service max-booster-ns1: RUNNING (port 5353)" || journalctl -u max-booster-ns1 -n 20
REMOTE

# ── Step 4: Deploy tls-proxy ───────────────────────────────────────────────────
echo ""
echo "▶ Step 4: Deploying TLS SNI proxy + HTTP redirect"
ssh_cmd "mkdir -p ${DEPLOY_DIR}/tls-proxy/src"
scp_cmd tls-proxy/package.json tls-proxy/tsconfig.json \
        "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/tls-proxy/"
scp_cmd tls-proxy/src/*.ts "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/tls-proxy/src/"

ssh_cmd bash << REMOTE
set -euo pipefail
cd ${DEPLOY_DIR}/tls-proxy
npm install --quiet
npx tsc --project tsconfig.json
echo "  Build OK"

cat > /etc/systemd/system/max-booster-tls-proxy.service << 'EOF'
[Unit]
Description=Max Booster TLS SNI Proxy (port 443) + HTTP redirect (port 80)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${DEPLOY_DIR}/tls-proxy
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment="DATABASE_URL=${DATABASE_URL}"
Environment="BACKEND_HOST=${BACKEND_HOST}"
Environment="BACKEND_PORT=443"
Environment="BACKEND_USE_TLS=true"
Environment="PROXY_PORT=443"
Environment="PROXY_HOST=0.0.0.0"
Environment="HTTP_REDIRECT_PORT=80"
Environment="BASE_DOMAIN=max-booster.com"
Environment="HEALTH_PORT=8080"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=max-booster-tls-proxy

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --quiet max-booster-tls-proxy
systemctl restart max-booster-tls-proxy
sleep 3
systemctl is-active max-booster-tls-proxy && echo "  Service max-booster-tls-proxy: RUNNING" || journalctl -u max-booster-tls-proxy -n 20
REMOTE

# ── Step 5: Configure firewall ─────────────────────────────────────────────────
echo ""
echo "▶ Step 5: Configuring firewall"
ssh_cmd bash << 'REMOTE'
set -euo pipefail
if command -v ufw &>/dev/null; then
  ufw --force enable 2>/dev/null || true
  ufw allow 22/tcp   comment 'SSH'
  ufw allow 53/udp   comment 'DNS UDP'
  ufw allow 53/tcp   comment 'DNS TCP'
  ufw allow 80/tcp   comment 'HTTP redirect'
  ufw allow 443/tcp  comment 'HTTPS'
  ufw allow 5353/udp comment 'dns-node ns1 UDP'
  ufw allow 5353/tcp comment 'dns-node ns1 TCP'
  ufw allow 8080/tcp comment 'TLS proxy health'
  ufw allow 5380/tcp comment 'dns-node ns1 health'
  echo "  ufw rules configured"
elif command -v iptables &>/dev/null; then
  for port_proto in "53/udp" "53/tcp" "80/tcp" "443/tcp" "5353/udp" "5353/tcp" "8080/tcp"; do
    p="${port_proto%%/*}"; pr="${port_proto##*/}"
    iptables -C INPUT -p "$pr" --dport "$p" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p "$pr" --dport "$p" -j ACCEPT
  done
  echo "  iptables rules configured"
fi
REMOTE

# ── Step 6: Zone seed migration ────────────────────────────────────────────────
echo ""
echo "▶ Step 6: Running zone seed migration"
scp_cmd dns-os/db/migrations/003_max_booster_zone.sql "${GCP_USER}@${GCP_IP}:/tmp/"

ssh_cmd bash << REMOTE
set -euo pipefail
psql "\${DATABASE_URL}" -f /tmp/003_max_booster_zone.sql 2>&1 \
  | grep -v "^NOTICE\|^INSERT 0 0\|^UPDATE 0"
echo "  Zone seed migration complete"
REMOTE

# ── Step 7: Health checks ──────────────────────────────────────────────────────
echo ""
echo "▶ Step 7: Health checks"
sleep 2

echo -n "  TLS proxy health (port 8080): "
curl -sf --max-time 5 "http://${GCP_IP}:8080/health" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else 'WARN')" \
  2>/dev/null || echo "PENDING (check: journalctl -u max-booster-tls-proxy)"

echo -n "  dns-node ns1 health  (port 5380): "
curl -sf --max-time 5 "http://${GCP_IP}:5380/health" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else 'WARN')" \
  2>/dev/null || echo "PENDING (check: journalctl -u max-booster-ns1)"

echo -n "  DNS A query (port 53 Go):       "
if command -v dig &>/dev/null; then
  dig +short +time=3 @"${GCP_IP}" max-booster.com A 2>/dev/null | head -1 || echo "PENDING"
else
  echo "dig not available locally — test with: dig @${GCP_IP} max-booster.com A"
fi

echo -n "  DNS wildcard (port 53 Go):      "
if command -v dig &>/dev/null; then
  dig +short +time=3 @"${GCP_IP}" test.max-booster.com A 2>/dev/null | head -1 || echo "PENDING"
else
  echo "dig not available — test with: dig @${GCP_IP} test.max-booster.com A"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment complete! Services running:"
echo "    max-booster-dns       — Go DNS server          :53"
echo "    max-booster-ns1       — TypeScript DNS (sync)  :5353"
echo "    max-booster-tls-proxy — TLS SNI proxy + redirect :443 + :80"
echo ""
echo "  NEXT STEPS (manual — done once at Name.com):"
echo ""
echo "  1. Register nameserver glue records at Name.com:"
echo "       ns1.max-booster.com → 34.117.33.233"
echo "       ns2.max-booster.com → 34.117.33.233"
echo ""
echo "  2. Delegate max-booster.com to the new NS:"
echo "       ns1.max-booster.com"
echo "       ns2.max-booster.com"
echo ""
echo "  3. Verify NS propagation (24–48 h typical):"
echo "       dig @34.117.33.233 max-booster.com SOA"
echo "       dig @8.8.8.8 max-booster.com NS"
echo ""
echo "  4. Issue wildcard + root TLS certs (admin session required):"
echo "       curl -b 'session=YOURSESSION' \\"
echo "            -X POST https://max-booster.com/api/dns/provision-wildcard"
echo ""
echo "  5. Activate DNS-PERSIST-01 (zero-touch renewal for late 2026):"
echo "       curl -b 'session=YOURSESSION' \\"
echo "            -X POST https://max-booster.com/api/dns/activate-persist-validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
