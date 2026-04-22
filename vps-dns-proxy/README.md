# Max Booster DNS Proxy — VPS Setup Guide

This proxy runs on a small VPS ($5–6/month) and bridges port 53 (the standard DNS port)
to the Max Booster app's DNS-over-HTTPS endpoint. The app already contains the full
authoritative DNS server logic — this proxy just gives it a public port 53 address.

## Architecture

```
Internet (DNS client)
  │  UDP/TCP port 53
  ▼
VPS (this proxy — ns1.max-booster.com / ns2.max-booster.com)
  │  HTTPS POST /api/dns/query
  ▼
Max Booster app (maxbooster.replit.app)
  │  Built-in authoritative DNS server
  ▼
DNS response back to client
```

## Requirements

- Ubuntu 22.04 or Debian 12 VPS with a **static public IP**
- Root access (for port 53)
- Any provider: DigitalOcean, Vultr, Hetzner, Linode (~$5–6/month)

## Quick Install

Copy both files to your VPS and run:

```bash
scp dns-proxy.js setup.sh root@<your-vps-ip>:~
ssh root@<your-vps-ip>
APP_URL=https://maxbooster.replit.app bash setup.sh
```

The script will:
1. Install Node.js 20
2. Free port 53 (disables systemd-resolved stub)
3. Install the proxy to `/opt/maxbooster-dns/`
4. Start and enable the `maxbooster-dns` systemd service
5. Open firewall ports 53/udp, 53/tcp, 22/tcp

## After Installation

### 1. Verify the proxy is running

```bash
systemctl status maxbooster-dns
journalctl -u maxbooster-dns -f
```

### 2. Test it locally from the VPS

```bash
# Install dnsutils if needed
apt-get install -y dnsutils

# Query through the local proxy
dig @127.0.0.1 max-booster.com A
dig @127.0.0.1 b-lawz-music.max-booster.com A
```

### 3. Add glue records at your registrar

At wherever `max-booster.com` is registered, add these **glue records**
(also called "host records" or "nameserver IP records"):

| Hostname              | Type | Value           |
|-----------------------|------|-----------------|
| ns1.max-booster.com   | A    | `<your-vps-ip>` |
| ns2.max-booster.com   | A    | `<your-vps-ip>` |

Both can point to the same VPS IP. For redundancy later, spin up a second
VPS and point ns2 there.

### 4. Set max-booster.com nameservers

At the same registrar, set the **nameservers** for `max-booster.com` to:

```
ns1.max-booster.com
ns2.max-booster.com
```

### 5. Verify propagation (can take 1–48 hours)

```bash
# From any machine
dig NS max-booster.com
dig @ns1.max-booster.com max-booster.com A
dig @<your-vps-ip> max-booster.com A
```

When you see `ns1.max-booster.com` in the NS answer section,
Max Booster is the authoritative DNS for the domain.

## Environment Variables

Edit `/etc/systemd/system/maxbooster-dns.service` then run
`systemctl daemon-reload && systemctl restart maxbooster-dns`:

| Variable     | Default                          | Description                          |
|-------------|-----------------------------------|--------------------------------------|
| `APP_URL`    | `https://maxbooster.replit.app`  | URL of the Max Booster app           |
| `LISTEN_IP`  | `0.0.0.0`                        | IP to bind (0.0.0.0 = all interfaces)|
| `DNS_PORT`   | `53`                             | Port to listen on                    |
| `TIMEOUT_MS` | `5000`                           | DoH request timeout in milliseconds  |

## Updating the App URL

If the Replit deployment URL changes (or you add a custom domain):

```bash
# Edit the service file
nano /etc/systemd/system/maxbooster-dns.service
# Change: Environment=APP_URL=https://your-new-url.com

systemctl daemon-reload
systemctl restart maxbooster-dns
```

## Monitoring

```bash
# Live logs
journalctl -u maxbooster-dns -f

# Check port 53 is open
ss -ulnp | grep 53
ss -tlnp | grep 53

# Test a query
dig @<your-vps-ip> max-booster.com ANY
```

## Production Notes

- Port 53 binds as root — the service runs as root intentionally (required for port < 1024)
- All DNS logic runs inside the Max Booster app — the proxy has zero business logic
- The proxy is stateless; restart it anytime safely
- For high availability: run identical proxies on two VPSes, point ns1 and ns2 to each
