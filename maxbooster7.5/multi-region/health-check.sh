#!/bin/bash
# health-check.sh — checks DNS proxy health

APP_URL=${APP_URL:-"http://localhost:3000"}

# 1. Check if the central API health endpoint is reachable
HEALTH_JSON=$(curl -s $APP_URL/api/dns/health)

if [ $? -ne 0 ]; then
    echo "CRITICAL: Central API health endpoint unreachable"
    exit 2
fi

OK=$(echo $HEALTH_JSON | grep -o '"ok":true')

if [ -n "$OK" ]; then
    echo "OK: DNS Node is healthy"
    exit 0
else
    echo "CRITICAL: DNS Node health check failed"
    echo $HEALTH_JSON
    exit 2
fi
