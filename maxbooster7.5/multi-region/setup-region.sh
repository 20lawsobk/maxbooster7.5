#!/bin/bash
# setup-region.sh — installs DNS proxy on a region VPS

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 REGION_NAME APP_URL [ANYCAST_IP]"
    exit 1
fi

REGION_NAME=$1
APP_URL=$2
ANYCAST_IP=$3

echo "Setting up DNS Region Node: $REGION_NAME"

# 1. Update and install dependencies
apt-get update
apt-get install -y curl nginx unzip

# 2. Download AdGuard dnsproxy (fastest DNS-to-DoH proxy)
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    PROXY_ARCH="amd64"
else
    PROXY_ARCH="arm64"
fi

curl -L -o dnsproxy.tar.gz "https://github.com/AdguardTeam/dnsproxy/releases/latest/download/dnsproxy-linux-$PROXY_ARCH.tar.gz"
tar -xzf dnsproxy.tar.gz
mv linux-$PROXY_ARCH/dnsproxy /usr/local/bin/
rm -rf dnsproxy.tar.gz linux-$PROXY_ARCH

# 3. Create dnsproxy systemd service
cat > /etc/systemd/system/dnsproxy.service <<EOF
[Unit]
Description=AdGuard DNS Proxy (DoH Forwarder)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dnsproxy \
  -l 127.0.0.1 -p 5353 \
  -u $APP_URL/api/dns/query \
  --cache --cache-size=10000 \
  --edns --edns-addr=0.0.0.0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 4. Configure Nginx as a stream proxy (TCP/UDP port 53 to localhost:5353)
cat > /etc/nginx/modules-enabled/dns-stream.conf <<EOF
stream {
    upstream dns_backend {
        server 127.0.0.1:5353;
    }
    server {
        listen 53 udp;
        listen 53; # tcp
        proxy_pass dns_backend;
    }
}
EOF

# 5. Handle Anycast IP if provided
if [ -n "$ANYCAST_IP" ]; then
    echo "Configuring Anycast IP: $ANYCAST_IP"
    ip addr add $ANYCAST_IP/32 dev lo || true
fi

# 6. Set Region Environment Variable
echo "REGION_NAME=$REGION_NAME" >> /etc/environment

# 7. Restart services
systemctl daemon-reload
systemctl enable dnsproxy
systemctl restart dnsproxy
systemctl restart nginx

echo "✅ DNS Region Node $REGION_NAME setup complete!"
echo "Test with: dig @localhost max-booster.com"
