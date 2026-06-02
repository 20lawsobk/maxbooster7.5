#!/usr/bin/env bash
# Max Booster — hnsd (Handshake SPV Resolver) Setup Script
# Installs and configures hnsd as a system service on Ubuntu 22.04+
#
# hnsd is a lightweight SPV node for the Handshake network.
# It syncs name proofs from HNS peers without downloading the full blockchain.
# Once running, it resolves Handshake names (e.g. max-booster.) locally.
#
# Usage:
#   bash setup-hnsd.sh [--recursive-port PORT] [--ns-port PORT] [--peers N]
#
# After setup:
#   - Recursive resolver: 127.0.0.1:<RECURSIVE_PORT>  (default 5350)
#   - Root nameserver:    127.0.0.1:<NS_PORT>          (default 5369)
#   - To resolve HNS names: dig @127.0.0.1 -p 5350 max-booster

set -euo pipefail

RECURSIVE_PORT=${RECURSIVE_PORT:-5350}
NS_PORT=${NS_PORT:-5369}
PEERS=${PEERS:-8}
INSTALL_DIR=${INSTALL_DIR:-/opt/hnsd}
HNSD_USER=${HNSD_USER:-hnsd}
HNSD_VERSION=${HNSD_VERSION:-master}

while [[ $# -gt 0 ]]; do
  case $1 in
    --recursive-port) RECURSIVE_PORT="$2"; shift 2 ;;
    --ns-port)        NS_PORT="$2";        shift 2 ;;
    --peers)          PEERS="$2";          shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

[[ $EUID -ne 0 ]] && { echo "❌ Run as root"; exit 1; }

echo "🌐 Max Booster hnsd Setup"
echo "   Recursive: 127.0.0.1:${RECURSIVE_PORT}"
echo "   Root NS:   127.0.0.1:${NS_PORT}"
echo "   Peers:     ${PEERS}"

# ── Build deps ────────────────────────────────────────────────────────────────
echo "📦 Installing build dependencies..."
apt-get update -qq
apt-get install -y -qq \
  git gcc g++ make autoconf automake libtool \
  pkg-config libunbound-dev bind9-utils dnsutils

# ── Clone + build ─────────────────────────────────────────────────────────────
if [[ ! -d /tmp/hnsd ]]; then
  git clone --depth 1 https://github.com/handshake-org/hnsd.git /tmp/hnsd
fi

cd /tmp/hnsd
./autogen.sh
./configure
make -j"$(nproc)"

# ── Install ───────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cp ./hnsd "$INSTALL_DIR/hnsd"
chmod +x "$INSTALL_DIR/hnsd"

# Grant cap to bind low ports
setcap 'cap_net_bind_service=+ep' "$INSTALL_DIR/hnsd"

# ── System user ───────────────────────────────────────────────────────────────
if ! id -u "$HNSD_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false "$HNSD_USER"
fi
chown -R "$HNSD_USER:$HNSD_USER" "$INSTALL_DIR"

# ── Systemd service ───────────────────────────────────────────────────────────
cat > /etc/systemd/system/hnsd.service <<SERVICE
[Unit]
Description=Handshake SPV Resolver (hnsd)
Documentation=https://github.com/handshake-org/hnsd
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${HNSD_USER}
Group=${HNSD_USER}
ExecStart=${INSTALL_DIR}/hnsd \\
  -p ${PEERS} \\
  -r 127.0.0.1:${RECURSIVE_PORT} \\
  -n 127.0.0.1:${NS_PORT} \\
  -i 0.0.0.0
Restart=always
RestartSec=10s
StartLimitInterval=60s
StartLimitBurst=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}
AmbientCapabilities=CAP_NET_BIND_SERVICE
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hnsd

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable hnsd
systemctl restart hnsd

# ── Verify ────────────────────────────────────────────────────────────────────
sleep 5
if systemctl is-active --quiet hnsd; then
  echo ""
  echo "✅ hnsd is running!"
  echo "   Syncing with Handshake network (takes a few minutes on first run)..."
  echo ""
  echo "   Test HNS resolution:"
  echo "   dig @127.0.0.1 -p ${RECURSIVE_PORT} max-booster"
  echo ""
  echo "   To use as system resolver, add to /etc/resolv.conf:"
  echo "   nameserver 127.0.0.1"
  echo "   options ndots:0"
  echo ""
  echo "Next steps:"
  echo "  1. Fund HNS wallet: hsd-cli rpc getinfo"
  echo "  2. Open auction via Max Booster DNS Hub UI"
  echo "  3. Wait for BIDDING period (~144 blocks ~24h)"
  echo "  4. Place bid, wait for REVEAL period, reveal, finalize"
else
  echo "❌ hnsd failed to start"
  journalctl -u hnsd -n 20
  exit 1
fi
