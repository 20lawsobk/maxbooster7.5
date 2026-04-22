# BGP Anycast with BIRD2

This guide covers the implementation of BGP Anycast for the Max-Booster DNS infrastructure. Anycast allows multiple geographically distributed servers to share the same IP address, with BGP routing traffic to the nearest node.

## Architecture
- **Anycast IP**: A single IPv4 (usually a /24 or /32) announced from multiple PoPs.
- **BIRD2**: Internet Routing Daemon used to speak BGP with upstream providers.
- **Health Checker**: A service that monitors the DNS server and withdraws the BGP route if the server is unhealthy.
- **Dummy Interface**: A virtual interface (`anycast0`) that holds the Anycast IP.

## Components
- `setup-bgp.sh`: Installation and configuration script.
- `bird2.conf`: BIRD2 configuration template.
- `healthcheck.sh`: Health monitoring and route control script.
- `dummy-interface-setup.sh`: Persistent interface configuration.
- `arin-asn-application-guide.md`: Guide for obtaining ASN and IP resources.

## Quick Start
1. Run `./setup-bgp.sh <ANYCAST_IP> <MY_ASN> <UPSTREAM_ASN> <UPSTREAM_IP> <APP_URL>`
2. Verify BGP status with `birdc show protocols`
3. Check health status with `systemctl status healthcheck.service`

## Failover Mechanism
If the DNS service (checked via `<APP_URL>/api/dns/health`) fails 3 consecutive checks:
1. `healthcheck.sh` brings down the `anycast0` interface.
2. BIRD2 detects the interface is down and withdraws the route from BGP.
3. Traffic is automatically rerouted by the global BGP network to the next nearest healthy node.
