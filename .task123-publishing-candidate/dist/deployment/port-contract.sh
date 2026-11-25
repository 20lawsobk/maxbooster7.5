#!/usr/bin/env bash
# Shared process-launch port contract. PORT is public; every other value is
# loopback-only and must be distinct. The TypeScript runtime validates the same
# values in server/config/ports.ts before application startup.

set -euo pipefail

export PORT="${PORT:-5000}"
if [[ "${MAXBOOSTER_DEV_PORTS:-0}" == "1" ]]; then
  # Replit workspaces are unprivileged; keep the private DNS authority
  # listener testable without CAP_NET_BIND_SERVICE. Production can explicitly
  # retain port 53 on hosts that support privileged ports.
  export DNS_AUTHORITY_PORT="${DNS_AUTHORITY_PORT:-1053}"
else
  export DNS_AUTHORITY_PORT="${DNS_AUTHORITY_PORT:-53}"
fi
export DNS_NODE_LOCAL_PORT="${DNS_NODE_LOCAL_PORT:-5353}"
export DNS_API_PORT="${DNS_API_PORT:-8080}"
export LOCAL_PDIM_PORT="${LOCAL_PDIM_PORT:-5556}"
export VIDEO_DIFFUSION_PORT="${VIDEO_DIFFUSION_PORT:-8008}"
export MAXCORE_LOCAL_PORT="${MAXCORE_LOCAL_PORT:-8090}"
export BOOSTERSTATE_SIDECAR_PORT="${BOOSTERSTATE_SIDECAR_PORT:-9877}"
export MODEL_API_PORT="${MODEL_API_PORT:-9878}"
export MODEL_API_HEALTH_PORT="${MODEL_API_HEALTH_PORT:-9879}"
export PYTHON_AI_PORT="${PYTHON_AI_PORT:-9880}"
export DNS_NODE_LOCAL_HEALTH_PORT="${DNS_NODE_LOCAL_HEALTH_PORT:-5380}"

# Runtime service ports are required in .replit's private port table. The DNS
# health listener is still uniqueness-checked and readiness-probed, but its
# separate port-table mapping is optional because it carries no service traffic.
export DNS_NODE_LOCAL=1
export ENABLE_LEGACY_AI_SIDECAR=1
export PORT_CONTRACT_REQUIRE_ALL=1

_port_contract_validate_number() {
  local name="$1"
  local value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || (( value < 1 || value > 65535 )); then
    echo "[Ports] FATAL: ${name} must be an integer between 1 and 65535; received \"${value}\"" >&2
    return 1
  fi
}

_port_contract_validate_unique() {
  local -A owners=()
  local name value
  for name in PORT DNS_AUTHORITY_PORT DNS_NODE_LOCAL_PORT DNS_API_PORT LOCAL_PDIM_PORT VIDEO_DIFFUSION_PORT MAXCORE_LOCAL_PORT BOOSTERSTATE_SIDECAR_PORT MODEL_API_PORT MODEL_API_HEALTH_PORT PYTHON_AI_PORT DNS_NODE_LOCAL_HEALTH_PORT; do
    value="${!name}"
    _port_contract_validate_number "$name" "$value"
    if [[ -n "${owners[$value]:-}" ]]; then
      echo "[Ports] FATAL: ${name} and ${owners[$value]} are both configured for port ${value}. Internal services must use distinct ports." >&2
      return 1
    fi
    owners[$value]="$name"
  done
}

_port_contract_validate_unique

echo "[Ports] public=${PORT}; internal: DNS=${DNS_AUTHORITY_PORT}, local-DNS=${DNS_NODE_LOCAL_PORT}, DNS-API=${DNS_API_PORT}, DNS-health=${DNS_NODE_LOCAL_HEALTH_PORT}, pdim=${LOCAL_PDIM_PORT}, diffusion=${VIDEO_DIFFUSION_PORT}, maxcore=${MAXCORE_LOCAL_PORT}, boosterstate=${BOOSTERSTATE_SIDECAR_PORT}, model=${MODEL_API_PORT}/${MODEL_API_HEALTH_PORT}, legacy-python=${PYTHON_AI_PORT}"