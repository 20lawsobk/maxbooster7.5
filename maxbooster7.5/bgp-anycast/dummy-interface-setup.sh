#!/bin/bash
# dummy-interface-setup.sh - Setup persistent anycast0 interface

ANYCAST_IP=$1

if [ -z "$ANYCAST_IP" ]; then
    echo "Usage: $0 <ANYCAST_IP>"
    exit 1
fi

# Create dummy interface
ip link add anycast0 type dummy || true
ip addr add "$ANYCAST_IP/32" dev anycast0 || true
ip link set anycast0 up

# Make it persistent (Ubuntu/Netplan)
if [ -d /etc/netplan ]; then
    NETPLAN_FILE="/etc/netplan/99-anycast.yaml"
    cat > "$NETPLAN_FILE" <<EOF
network:
  version: 2
  dummy-devices:
    anycast0:
      addresses:
        - $ANYCAST_IP/32
EOF
    netplan apply
fi

# Make it persistent (Debian/interfaces)
if [ -f /etc/network/interfaces ]; then
    if ! grep -q "anycast0" /etc/network/interfaces; then
        cat >> /etc/network/interfaces <<EOF

auto anycast0
iface anycast0 inet static
    address $ANYCAST_IP
    netmask 255.255.255.255
    pre-up ip link add anycast0 type dummy
EOF
    fi
fi

echo "Interface anycast0 configured with $ANYCAST_IP"
