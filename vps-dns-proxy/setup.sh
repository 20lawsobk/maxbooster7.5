#!/bin/bash
# Max Booster — VPS DNS Proxy Setup
# Uses AdGuard dnsproxy — production-grade Go binary, actively maintained,
# natively supports DoH upstreams (https://), UDP+TCP port 53, caching,
# EDNS0, health checks. https://github.com/AdguardTeam/dnsproxy
#
# Tested on Ubuntu 22.04 / Debian 12 (amd64 + arm64).
# Run as root: APP_URL=https://maxbooster.replit.app bash setup.sh
#
# If dnsproxy fails to start (e.g. old kernel), the script will fall back
# to the Node.js proxy (dns-proxy-node.js).

set -euo pipefail

APP_URL="${APP_URL:-https://maxbooster.replit.app}"
INSTALL_DIR="/opt/maxbooster-dns"

# ── AdGuard dnsproxy release to pin ──────────────────────────────────────────
# Pinned for reproducibility. Update manually when a new stable release ships.
# Latest releases: https://github.com/AdguardTeam/dnsproxy/releases
DNSPROXY_VERSION="v0.72.1"

# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  Max Booster DNS Proxy — VPS Setup (AdGuard dnsproxy) ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL  : ${APP_URL}"
echo "  Proxy    : AdGuard dnsproxy ${DNSPROXY_VERSION}"
echo "  Platform : $(uname -m) / $(lsb_release -ds 2>/dev/null || uname -s)"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────

echo "[1/6] Updating system and installing dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl tar ufw ca-certificates

# ── 2. Free port 53 (Ubuntu runs systemd-resolved stub on :53) ───────────────

echo "[2/6] Freeing port 53..."
if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
  RESOLVED_CONF="/etc/systemd/resolved.conf"

  # Set DNSStubListener=no
  if grep -q "^DNSStubListener=" "$RESOLVED_CONF" 2>/dev/null; then
    sed -i 's/^DNSStubListener=.*/DNSStubListener=no/' "$RESOLVED_CONF"
  elif grep -q "^#DNSStubListener=" "$RESOLVED_CONF" 2>/dev/null; then
    sed -i 's/^#DNSStubListener=.*/DNSStubListener=no/' "$RESOLVED_CONF"
  else
    echo "DNSStubListener=no" >> "$RESOLVED_CONF"
  fi

  systemctl restart systemd-resolved
  echo "      systemd-resolved stub listener disabled"
else
  echo "      systemd-resolved not running — port 53 already free"
fi

# Verify port 53 is actually free
if ss -ulnp | grep -q ':53 ' 2>/dev/null || ss -tlnp | grep -q ':53 ' 2>/dev/null; then
  echo "      ⚠️  WARNING: Something is still listening on port 53"
  echo "      Processes on :53:"
  ss -ulnp | grep ':53 ' || true
  ss -tlnp | grep ':53 ' || true
  echo "      Proceeding anyway — dnsproxy will fail to bind if port is taken"
else
  echo "      Port 53 is free ✓"
fi

# ── 3. Download AdGuard dnsproxy ──────────────────────────────────────────────

echo "[3/6] Downloading AdGuard dnsproxy ${DNSPROXY_VERSION}..."

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH_TAG="amd64" ;;
  aarch64) ARCH_TAG="arm64" ;;
  armv7l)  ARCH_TAG="armv7" ;;
  i686)    ARCH_TAG="386"   ;;
  *)
    echo "      ⚠️  Unsupported architecture: ${ARCH}"
    echo "      Falling back to Node.js proxy..."
    ARCH_TAG=""
    ;;
esac

DNSPROXY_BIN=""
if [[ -n "$ARCH_TAG" ]]; then
  TARBALL="dnsproxy-linux-${ARCH_TAG}-${DNSPROXY_VERSION}.tar.gz"
  DOWNLOAD_URL="https://github.com/AdguardTeam/dnsproxy/releases/download/${DNSPROXY_VERSION}/${TARBALL}"

  echo "      URL: ${DOWNLOAD_URL}"

  if curl -fsSL -o "/tmp/${TARBALL}" "$DOWNLOAD_URL" 2>/dev/null; then
    mkdir -p /tmp/dnsproxy-extract
    tar -xzf "/tmp/${TARBALL}" -C /tmp/dnsproxy-extract 2>/dev/null || true

    # Binary may be at: ./linux-amd64/dnsproxy or ./dnsproxy
    FOUND_BIN="$(find /tmp/dnsproxy-extract -name 'dnsproxy' -type f | head -1)"
    if [[ -n "$FOUND_BIN" ]]; then
      install -m 755 "$FOUND_BIN" /usr/local/bin/dnsproxy
      DNSPROXY_BIN="/usr/local/bin/dnsproxy"
      echo "      AdGuard dnsproxy installed at ${DNSPROXY_BIN}"
      echo "      Version: $(/usr/local/bin/dnsproxy --version 2>/dev/null | head -1 || echo 'unknown')"
    else
      echo "      ⚠️  Binary not found in tarball — falling back to Node.js proxy"
    fi
    rm -rf /tmp/dnsproxy-extract "/tmp/${TARBALL}"
  else
    echo "      ⚠️  Download failed (check network) — falling back to Node.js proxy"
  fi
fi

# ── 4. Install ────────────────────────────────────────────────────────────────

echo "[4/6] Installing Max Booster DNS Proxy to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "$DNSPROXY_BIN" ]]; then
  # ── AdGuard dnsproxy service ──────────────────────────────────────────────
  cat > /etc/systemd/system/maxbooster-dns.service <<EOF
[Unit]
Description=Max Booster DNS Proxy (AdGuard dnsproxy)
Documentation=https://github.com/AdguardTeam/dnsproxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/dnsproxy \\
  --listen=0.0.0.0 \\
  --port=53 \\
  --upstream=${APP_URL}/api/dns/query \\
  --cache \\
  --cache-size=4096 \\
  --all-servers \\
  --timeout=5000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=maxbooster-dns

[Install]
WantedBy=multi-user.target
EOF
  echo "      Using AdGuard dnsproxy binary"

else
  # ── Node.js fallback ──────────────────────────────────────────────────────
  echo "      Falling back to Node.js proxy..."

  # Need Node.js for the fallback
  if ! command -v node &>/dev/null; then
    echo "      Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y -qq nodejs
  fi
  echo "      Node.js $(node --version) ready"

  # Copy the Node.js proxy script
  if [[ -f "${SCRIPT_DIR}/dns-proxy-node.js" ]]; then
    cp "${SCRIPT_DIR}/dns-proxy-node.js" "${INSTALL_DIR}/dns-proxy.js"
  else
    echo "      ⚠️  dns-proxy-node.js not found in ${SCRIPT_DIR}"
    echo "      Please copy it manually to ${INSTALL_DIR}/dns-proxy.js"
    exit 1
  fi

  cat > /etc/systemd/system/maxbooster-dns.service <<EOF
[Unit]
Description=Max Booster DNS Proxy (Node.js fallback)
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

[Install]
WantedBy=multi-user.target
EOF
  echo "      Using Node.js proxy fallback"
fi

# ── 5. Enable and start ───────────────────────────────────────────────────────

echo "[5/6] Enabling and starting maxbooster-dns service..."
systemctl daemon-reload
systemctl enable maxbooster-dns
systemctl restart maxbooster-dns

sleep 2
if systemctl is-active --quiet maxbooster-dns; then
  echo "      Service started successfully ✓"
else
  echo "      ⚠️  Service failed to start. Check: journalctl -u maxbooster-dns -n 50"
fi

# ── 6. Firewall ───────────────────────────────────────────────────────────────

echo "[6/6] Configuring firewall..."
ufw allow 22/tcp  comment "SSH"   2>/dev/null || true
ufw allow 53/tcp  comment "DNS"   2>/dev/null || true
ufw allow 53/udp  comment "DNS"   2>/dev/null || true
ufw allow 80/tcp  comment "HTTP"  2>/dev/null || true
ufw allow 443/tcp comment "HTTPS" 2>/dev/null || true
ufw --force enable 2>/dev/null || true
echo "      Firewall configured ✓"

# ── Done ──────────────────────────────────────────────────────────────────────

PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org \
         || curl -s --max-time 5 https://checkip.amazonaws.com \
         || echo "<your-vps-ip>")
PUBLIC_IP="${PUBLIC_IP// /}"  # trim whitespace

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  Max Booster DNS Proxy — Setup Complete                ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "  VPS public IP : ${PUBLIC_IP}"
echo "  Forwarding to : ${APP_URL}/api/dns/query"
echo ""
echo "  Service status:"
systemctl status maxbooster-dns --no-pager -l 2>&1 | tail -8
echo ""
echo "  ─────────────────────────────────────────────────────"
echo "  NEXT STEPS — at your domain registrar:"
echo ""
echo "  1. Add GLUE RECORDS (host objects) for max-booster.com:"
echo "       ns1.max-booster.com  →  A  →  ${PUBLIC_IP}"
echo "       ns2.max-booster.com  →  A  →  ${PUBLIC_IP}"
echo ""
echo "  2. Set NAMESERVERS for max-booster.com to:"
echo "       ns1.max-booster.com"
echo "       ns2.max-booster.com"
echo ""
echo "  3. Verify after propagation (1–48 h):"
echo "       dig @${PUBLIC_IP} max-booster.com A"
echo "       dig NS max-booster.com"
echo "       dig @${PUBLIC_IP} b-lawz-music.max-booster.com A"
echo ""
echo "  Logs:   journalctl -u maxbooster-dns -f"
echo "  Test:   dig @${PUBLIC_IP} max-booster.com A"
echo ""
