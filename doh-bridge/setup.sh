#!/usr/bin/env bash
# Max Booster — DoH Bridge Setup Script
# Deploys the DoH-to-UDP bridge on any public VPS running Ubuntu 22.04+
#
# Usage:
#   bash setup.sh \
#     --doh-url https://your-app.replit.app/api/dns/query \
#     --listen-ip 0.0.0.0 \
#     --listen-port 53
#
# Arguments (all optional — defaults in square brackets):
#   --doh-url URL          DoH endpoint         [http://localhost:5000/api/dns/query]
#   --listen-ip IP         Bind address         [0.0.0.0]
#   --listen-port PORT     DNS listen port      [53]
#   --metrics-port PORT    Metrics HTTP port    [9053]
#   --user USER            System user          [dohbridge]
#   --install-dir DIR      Install directory    [/opt/doh-bridge]

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
DOH_URL="http://localhost:5000/api/dns/query"
LISTEN_IP="0.0.0.0"
LISTEN_PORT="53"
METRICS_PORT="9053"
BRIDGE_USER="dohbridge"
INSTALL_DIR="/opt/doh-bridge"

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --doh-url)      DOH_URL="$2";      shift 2 ;;
    --listen-ip)    LISTEN_IP="$2";    shift 2 ;;
    --listen-port)  LISTEN_PORT="$2";  shift 2 ;;
    --metrics-port) METRICS_PORT="$2"; shift 2 ;;
    --user)         BRIDGE_USER="$2";  shift 2 ;;
    --install-dir)  INSTALL_DIR="$2";  shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Require root ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "❌ Must be run as root (sudo bash setup.sh ...)"
  exit 1
fi

echo "🚀 Max Booster DoH Bridge Setup"
echo "   DoH URL:      $DOH_URL"
echo "   Listen:       ${LISTEN_IP}:${LISTEN_PORT}"
echo "   Metrics:      :${METRICS_PORT}"
echo "   Install dir:  ${INSTALL_DIR}"
echo ""

# ── Install Node.js 20 LTS ────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -e "process.exit(parseInt(process.version.split('.')[0].slice(1)) < 18 ? 1 : 0)" 2>/dev/null; echo $?) -ne 0 ]]; then
  echo "📦 Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "✅ Node.js $(node --version)"

# ── Create system user ────────────────────────────────────────────────────────
if ! id -u "$BRIDGE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false "$BRIDGE_USER"
  echo "✅ Created system user: $BRIDGE_USER"
fi

# ── Copy bridge file ──────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/bridge.js" "$INSTALL_DIR/bridge.js"
chown -R "$BRIDGE_USER:$BRIDGE_USER" "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR/bridge.js"

# ── Grant CAP_NET_BIND_SERVICE so bridge can bind port 53 without root ────────
setcap 'cap_net_bind_service=+ep' "$(which node)"
echo "✅ Granted cap_net_bind_service to node"

# ── Write config file ─────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/config.env" <<EOF
DOH_URL=${DOH_URL}
LISTEN_IP=${LISTEN_IP}
LISTEN_PORT=${LISTEN_PORT}
METRICS_PORT=${METRICS_PORT}
QUERY_TIMEOUT_MS=5000
MAX_RETRIES=2
MAX_PENDING=10000
NODE_ENV=production
EOF
chmod 600 "$INSTALL_DIR/config.env"
echo "✅ Config written to $INSTALL_DIR/config.env"

# ── Install systemd service ───────────────────────────────────────────────────
cp "$SCRIPT_DIR/bridge.service" /etc/systemd/system/doh-bridge.service
# Patch user and dir into service file
sed -i "s|BRIDGE_USER|${BRIDGE_USER}|g"   /etc/systemd/system/doh-bridge.service
sed -i "s|INSTALL_DIR|${INSTALL_DIR}|g"   /etc/systemd/system/doh-bridge.service

systemctl daemon-reload
systemctl enable doh-bridge
systemctl restart doh-bridge

echo ""
echo "✅ doh-bridge service started"
echo ""

# ── Open firewall ─────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow "$LISTEN_PORT/udp" comment "DNS UDP"
  ufw allow "$LISTEN_PORT/tcp" comment "DNS TCP"
  ufw allow "$METRICS_PORT/tcp" comment "DoH bridge metrics"
  echo "✅ UFW rules added"
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port="$LISTEN_PORT/udp"
  firewall-cmd --permanent --add-port="$LISTEN_PORT/tcp"
  firewall-cmd --reload
  echo "✅ firewalld rules added"
fi

# ── Verify ────────────────────────────────────────────────────────────────────
sleep 2
STATUS=$(systemctl is-active doh-bridge)
if [[ $STATUS == "active" ]]; then
  echo ""
  echo "🎉 DoH Bridge is running!"
  echo "   Test: dig @$(curl -sf ifconfig.me 2>/dev/null || echo '<YOUR_IP>') max-booster.com"
  echo "   Health: curl http://localhost:${METRICS_PORT}/health"
  echo ""
  echo "Next: Set ns1.max-booster.com → $(curl -sf ifconfig.me 2>/dev/null || echo '<THIS_VPS_IP>') in your zone records"
else
  echo "❌ Service failed to start — check: journalctl -u doh-bridge -n 50"
  exit 1
fi
