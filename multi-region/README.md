# Multi-Region DNS Nameserver Setup

This guide describes how to deploy and manage multiple authoritative DNS nodes in different geographic regions.

## Architecture

1.  **Central API (App Engine/Cloud Run):** Handles DoH queries via `/api/dns/query`.
2.  **Region Nodes (VPS):** Lightweight VPS nodes in regions like `us-east1`, `europe-west1`, `asia-east1`.
3.  **DNS Proxy:** Each node runs a DNS proxy (AdGuard `dnsproxy` or Node.js fallback) that listens on port 53 (UDP/TCP) and forwards queries to the Central API via DoH.
4.  **Anycast (Optional):** All nodes can share a single Anycast IP via BGP (see `bgp-anycast/` for details).

## Deployment Steps

For each new region node:

1.  Provision a fresh Ubuntu 22.04 VPS.
2.  Copy `setup-region.sh` to the VPS.
3.  Run the script:
    ```bash
    chmod +x setup-region.sh
    ./setup-region.sh US-EAST https://max-booster.com 34.111.179.208
    ```
    - `REGION_NAME`: A unique identifier for the node (e.g., `US-EAST`).
    - `APP_URL`: The URL of your central Max Booster API.
    - `ANYCAST_IP`: (Optional) The anycast IP if using BGP.

## Health Monitoring

Each node exposes a health check endpoint via the central API:
`GET /api/dns/health`

It returns:
- `ok`: Boolean status.
- `region`: The `REGION_NAME` of the node.
- `uptime`: Process uptime in seconds.
- `queryCount`: Number of DNS queries handled by this node.
- `version`: Application version.

The `health-check.sh` script can be used by monitoring tools or BGP health checkers to verify node health.
