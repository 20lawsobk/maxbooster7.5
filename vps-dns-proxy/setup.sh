#!/bin/bash
# Max Booster — VPS DNS Proxy Setup Script
# Run this as root on a fresh Ubuntu 22.04 / Debian 12 VPS.
#
# Usage:
#   curl -sSL https://your-url/setup.sh | bash
#   OR: chmod +x setup.sh && ./setup.sh
#
# After running, the proxy will be live on port 53.
# Set APP_URL in /opt/maxbooster-dns/dns-proxy.service to your deployed app URL.

set -euo pipefail

APP_URL="${APP_URL:-https://maxbooster.replit.app}"
INSTALL_DIR="/opt/maxbooster-dns"

echo ""
echo "================================================"
echo "  Max Booster DNS Proxy — VPS Setup"
echo "================================================"
echo ""

# ── 1. System dependencies ────────────────────────────────────────────────────

echo "[1/5] Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl ufw

echo "[2/5] Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node --version)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "      Node.js $(node --version) ready"

# ── 2. Disable systemd-resolved on port 53 ───────────────────────────────────
# Ubuntu runs systemd-resolved on 127.0.0.53:53 by default — free port 53.

echo "[3/5] Freeing port 53 (disabling systemd-resolved stub resolver)..."
if systemctl is-active --quiet systemd-resolved; then
  sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
  sed -i 's/DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
  systemctl restart systemd-resolved
  echo "      systemd-resolved stub listener disabled"
fi

# ── 3. Install proxy ──────────────────────────────────────────────────────────

echo "[4/5] Installing Max Booster DNS Proxy to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/dns-proxy.js" "${INSTALL_DIR}/dns-proxy.js"
chmod 755 "${INSTALL_DIR}/dns-proxy.js"

# Write systemd service (substituting the app URL)
cat > /etc/systemd/system/maxbooster-dns.service <<EOF
[Unit]
Description=Max Booster DNS Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/dns-proxy.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=maxbooster-dns
Environment=APP_URL=${APP_URL}
Environment=LISTEN_IP=0.0.0.0
Environment=DNS_PORT=53
Environment=TIMEOUT_MS=5000
Environment=NODE_ENV=production
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF

# ── 4. Enable and start ───────────────────────────────────────────────────────

systemctl daemon-reload
systemctl enable maxbooster-dns
systemctl restart maxbooster-dns

# ── 5. Firewall ───────────────────────────────────────────────────────────────

echo "[5/5] Configuring firewall..."
ufw allow 22/tcp  comment "SSH"   2>/dev/null || true
ufw allow 53/tcp  comment "DNS"   2>/dev/null || true
ufw allow 53/udp  comment "DNS"   2>/dev/null || true
ufw allow 80/tcp  comment "HTTP"  2>/dev/null || true
ufw allow 443/tcp comment "HTTPS" 2>/dev/null || true
ufw --force enable 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────────

PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 https://checkip.amazonaws.com || echo "<your-vps-ip>")

echo ""
echo "================================================"
echo "  Max Booster DNS Proxy — Setup Complete"
echo "================================================"
echo ""
echo "  VPS IP   : ${PUBLIC_IP}"
echo "  App URL  : ${APP_URL}"
echo "  Service  : maxbooster-dns (systemd)"
echo ""
echo "  Status:"
systemctl status maxbooster-dns --no-pager -l 2>&1 | tail -5
echo ""
echo "  NEXT STEPS — Add glue records at your domain registrar:"
echo ""
echo "    ns1.max-booster.com  →  A  →  ${PUBLIC_IP}"
echo "    ns2.max-booster.com  →  A  →  ${PUBLIC_IP}"
echo ""
echo "  Then set max-booster.com nameservers to:"
echo "    ns1.max-booster.com"
echo "    ns2.max-booster.com"
echo ""
echo "  Verify after propagation (1-48h):"
echo "    dig @${PUBLIC_IP} max-booster.com A"
echo "    dig NS max-booster.com"
echo ""
echo "  Logs: journalctl -u maxbooster-dns -f"
echo ""
