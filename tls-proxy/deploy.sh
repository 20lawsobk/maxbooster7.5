#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Max Booster — TLS Proxy Incremental Re-Deploy
#
# Use this for tls-proxy-only updates (no DNS server changes needed).
# For a full first-time deploy use deploy-gcp.sh from the project root.
#
# Usage:
#   GCP_IP=34.117.33.233 bash tls-proxy/deploy.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

GCP_IP="${GCP_IP:-34.117.33.233}"
GCP_USER="${GCP_USER:-ubuntu}"
GCP_SSH_KEY="${GCP_SSH_KEY:-}"
DEPLOY_DIR="/opt/max-booster"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "$GCP_SSH_KEY" ]]; then SSH_OPTS+=(-i "$GCP_SSH_KEY"); fi

scp_cmd() { scp "${SSH_OPTS[@]}" "$@"; }
ssh_cmd() { ssh "${SSH_OPTS[@]}" "${GCP_USER}@${GCP_IP}" "$@"; }

echo "▶ Copying tls-proxy source to ${GCP_IP}..."
ssh_cmd "mkdir -p ${DEPLOY_DIR}/tls-proxy/src"
scp_cmd tls-proxy/package.json tls-proxy/tsconfig.json "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/tls-proxy/"
scp_cmd tls-proxy/src/*.ts "${GCP_USER}@${GCP_IP}:${DEPLOY_DIR}/tls-proxy/src/"

echo "▶ Building tls-proxy..."
ssh_cmd bash << REMOTE
set -euo pipefail
cd ${DEPLOY_DIR}/tls-proxy
npm install --quiet
npx tsc --project tsconfig.json
echo "  Build OK"
REMOTE

echo "▶ Restarting service..."
ssh_cmd "systemctl restart max-booster-tls-proxy"
sleep 3
ssh_cmd "systemctl is-active max-booster-tls-proxy && echo '  Service: RUNNING' || echo '  Service: FAILED'"

echo ""
echo "▶ Health check:"
curl -sf "http://${GCP_IP}:8080/health" && echo "" || echo "  (health endpoint not reachable yet)"
echo ""
echo "Done."
