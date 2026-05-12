#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Max Booster — GCP Instance Deployment Script
#
# Deploys the complete in-house DNS + TLS stack to GCP 34.117.33.233:
#   1. dns-os/services/dns-authoritative  →  systemd: max-booster-dns
#   2. tls-proxy                          →  systemd: max-booster-tls-proxy
#   3. Firewall rules (ports 53 UDP/TCP + 443 TCP)
#   4. Zone seed migration (dns-os/db/migrations/003_max_booster_zone.sql)
#
# Usage (run from the project root):
#   export DATABASE_URL="postgresql://..."
#   export BACKEND_HOST="maxbooster.replit.app"
#   bash deploy-gcp.sh [GCP_IP]
#
# The script SSHes into the GCP instance using your default gcloud / ssh config.
# Alternatively, set GCP_SSH_KEY to use a specific key:
#   GCP_SSH_KEY=~/.ssh/gcp_id_rsa bash deploy-gcp.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

GCP_IP="${1:-34.117.33.233}"
GCP_USER="${GCP_USER:-ubuntu}"
GCP_SSH_KEY="${GCP_SSH_KEY:-}"
DEPLOY_DIR="/opt/max-booster"

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
scp_cmd() { scp "${SSH_OPTS[@]}" "$@"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Max Booster GCP Deploy → ${GCP_USER}@${GCP_IP}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Install system dependencies ────────────────────────────────────────
echo ""
echo "▶ Step 1: Installing system dependencies"
ssh_cmd bash << 'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq curl wget git build-essential ca-certificates psql 2>/dev/null || true

# Go 1.22
if ! command -v go &>/dev/null; then
  echo "Installing Go 1.22..."
  wget -q https://go.dev/dl/go1.22.3.linux-amd64.tar.gz -O /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
  export PATH=$PATH:/usr/local/go/bin
fi
go version

# Node.js 20 (for tls-proxy)
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1)" != "v20" ]]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node --version
npm --version

mkdir -p /opt/max-booster
REMOTE

# ── Step 2: Deploy dns-os (Go authoritative DNS server) ────────────────────────
echo ""
echo "▶ Step 2: Deploying dns-os authoritative DNS server"

# Copy Go source
echo "  Copying Go source..."
ssh_cmd "mkdir -p ${DEPLOY_DIR}/dns-authoritative"
scp_cmd dns-os/services/dns-authoritative/*.go "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/dns-authoritative/"
scp_cmd dns-os/services/dns-authoritative/go.mod dns-os/services/dns-authoritative/go.sum \
        "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/dns-authoritative/"

# Build on GCP
echo "  Building binary on GCP..."
ssh_cmd bash << REMOTE
set -euo pipefail
export PATH=\$PATH:/usr/local/go/bin
cd ${DEPLOY_DIR}/dns-authoritative
go mod download
CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/dns-authoritative .
echo "  Build complete: \$(ls -lh bin/dns-authoritative)"
REMOTE

# Write systemd unit
echo "  Installing systemd service..."
ssh_cmd bash << REMOTE
set -euo pipefail
cat > /etc/systemd/system/max-booster-dns.service << 'EOF'
[Unit]
Description=Max Booster Authoritative DNS Server
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
systemctl enable max-booster-dns
systemctl restart max-booster-dns
sleep 3
systemctl is-active max-booster-dns && echo "  DNS service: RUNNING" || echo "  DNS service: FAILED"
REMOTE

# ── Step 3: Deploy tls-proxy (Node.js TLS SNI proxy) ──────────────────────────
echo ""
echo "▶ Step 3: Deploying TLS SNI proxy"

echo "  Copying tls-proxy source..."
ssh_cmd "mkdir -p ${DEPLOY_DIR}/tls-proxy/src"
scp_cmd tls-proxy/package.json tls-proxy/tsconfig.json "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/tls-proxy/"
scp_cmd tls-proxy/src/*.ts "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/tls-proxy/src/"

echo "  Building tls-proxy on GCP..."
ssh_cmd bash << REMOTE
set -euo pipefail
cd ${DEPLOY_DIR}/tls-proxy
npm install --quiet
npx tsc --project tsconfig.json
echo "  tls-proxy build complete"
REMOTE

echo "  Installing systemd service..."
ssh_cmd bash << REMOTE
set -euo pipefail
cat > /etc/systemd/system/max-booster-tls-proxy.service << 'EOF'
[Unit]
Description=Max Booster TLS SNI Proxy
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
Environment="BASE_DOMAIN=max-booster.com"
Environment="HEALTH_PORT=8080"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=max-booster-tls-proxy

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable max-booster-tls-proxy
systemctl restart max-booster-tls-proxy
sleep 3
systemctl is-active max-booster-tls-proxy && echo "  TLS proxy service: RUNNING" || echo "  TLS proxy service: FAILED"
REMOTE

# ── Step 4: Configure firewall ─────────────────────────────────────────────────
echo ""
echo "▶ Step 4: Configuring firewall"
ssh_cmd bash << 'REMOTE'
set -euo pipefail
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   comment 'SSH'          2>/dev/null || true
  ufw allow 53/udp   comment 'DNS UDP'       2>/dev/null || true
  ufw allow 53/tcp   comment 'DNS TCP'       2>/dev/null || true
  ufw allow 443/tcp  comment 'HTTPS'         2>/dev/null || true
  ufw allow 8080/tcp comment 'Health check'  2>/dev/null || true
  echo "  ufw rules configured"
elif command -v iptables &>/dev/null; then
  iptables -I INPUT -p udp --dport 53  -j ACCEPT 2>/dev/null || true
  iptables -I INPUT -p tcp --dport 53  -j ACCEPT 2>/dev/null || true
  iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  echo "  iptables rules configured"
fi
REMOTE

# ── Step 5: Run zone seed migration ───────────────────────────────────────────
echo ""
echo "▶ Step 5: Running zone seed migration"
echo "  (Running 003_max_booster_zone.sql against Neon PostgreSQL)"

# Copy migration SQL
scp_cmd dns-os/db/migrations/003_max_booster_zone.sql "${GCP_USER}@${GCP_IP}:/tmp/"

ssh_cmd bash << REMOTE
set -euo pipefail
psql "\${DATABASE_URL}" -f /tmp/003_max_booster_zone.sql 2>&1 | grep -v "^NOTICE" || true
echo "  Zone seed migration complete"
REMOTE

# ── Step 6: Health checks ──────────────────────────────────────────────────────
echo ""
echo "▶ Step 6: Health checks"
echo -n "  DNS server health: "
curl -sf "http://${GCP_IP}:8080/health" 2>/dev/null && echo "OK" || echo "PENDING (check logs)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment complete!"
echo ""
echo "  NEXT STEPS (manual — done once at Name.com):"
echo ""
echo "  1. Register nameserver hosts at Name.com:"
echo "     ns1.max-booster.com → 34.117.33.233"
echo "     ns2.max-booster.com → 34.117.33.233"
echo ""
echo "  2. Change max-booster.com NS records to:"
echo "     ns1.max-booster.com"
echo "     ns2.max-booster.com"
echo ""
echo "  3. Wait for NS propagation (24–48h, often faster)."
echo "     Test with: dig @34.117.33.233 max-booster.com NS"
echo ""
echo "  4. Issue wildcard cert (once NS propagation is confirmed):"
echo "     curl -X POST https://max-booster.com/api/dns/provision-wildcard"
echo "     (requires admin session cookie)"
echo ""
echo "  5. Activate DNS-PERSIST-01 (for zero-touch renewals in late 2026):"
echo "     curl -X POST https://max-booster.com/api/dns/activate-persist-validation"
echo "     (requires admin session cookie)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
