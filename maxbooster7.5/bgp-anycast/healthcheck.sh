#!/bin/bash
# healthcheck.sh - Monitor DNS service and control Anycast route

APP_URL="REPLACE_APP_URL"
INTERFACE="anycast0"
FAIL_COUNT_FILE="/tmp/dns_health_fail_count"
MAX_FAILS=3

if [ ! -f "$FAIL_COUNT_FILE" ]; then
    echo 0 > "$FAIL_COUNT_FILE"
fi

current_fails=$(cat "$FAIL_COUNT_FILE")

# Check DNS health
if curl -s -f "$APP_URL/api/dns/health" | grep -q '"ok":true'; then
    echo "DNS is healthy"
    echo 0 > "$FAIL_COUNT_FILE"
    # Ensure interface is up
    if ! ip link show "$INTERFACE" | grep -q "UP"; then
        echo "Bringing $INTERFACE up"
        ip link set "$INTERFACE" up
    fi
else
    echo "DNS health check failed"
    current_fails=$((current_fails + 1))
    echo "$current_fails" > "$FAIL_COUNT_FILE"
    
    if [ "$current_fails" -ge "$MAX_FAILS" ]; then
        echo "Max failures reached. Bringing $INTERFACE down"
        ip link set "$INTERFACE" down
    fi
fi
