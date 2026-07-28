#!/bin/bash
# setup-bgp.sh - Install and configure BIRD2 for BGP Anycast

if [ "$#" -ne 5 ]; then
    echo "Usage: $0 <ANYCAST_IP> <MY_ASN> <UPSTREAM_ASN> <UPSTREAM_IP> <APP_URL>"
    exit 1
fi

ANYCAST_IP=$1
MY_ASN=$2
UPSTREAM_ASN=$3
UPSTREAM_IP=$4
APP_URL=$5

# 1. Install BIRD2
apt update && apt install -y bird2 curl

# 2. Setup dummy interface
./dummy-interface-setup.sh "$ANYCAST_IP"

# 3. Configure BIRD2
ROUTER_ID=$(hostname -I | awk '{print $1}')

cat > /etc/bird/bird.conf <<EOF
router id $ROUTER_ID;

protocol device {
}

protocol direct {
    interface "anycast0";
}

protocol kernel {
    ipv4 {
        export all;
    };
}

protocol bgp upstream {
    local as $MY_ASN;
    neighbor $UPSTREAM_IP as $UPSTREAM_ASN;
    
    ipv4 {
        import none;
        export filter {
            if proto = "direct" then accept;
            reject;
        };
    };
}
EOF

# Verify BIRD2 config
bird -p

if [ $? -eq 0 ]; then
    systemctl restart bird
    echo "BIRD2 configured and restarted."
else
    echo "BIRD2 configuration check failed!"
    exit 1
fi

# 4. Setup health check service
sed -i "s|REPLACE_APP_URL|$APP_URL|g" healthcheck.sh
cp healthcheck.sh /usr/local/bin/dns-healthcheck.sh
chmod +x /usr/local/bin/dns-healthcheck.sh

cp systemd/healthcheck.service /etc/systemd/system/
cp systemd/healthcheck.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now healthcheck.timer

echo "BGP Anycast setup complete."
