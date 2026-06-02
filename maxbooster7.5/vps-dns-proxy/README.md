# Max Booster DNS Proxy — VPS Setup Guide

This proxy runs on a small VPS and bridges **standard port 53 DNS** (UDP + TCP)
to the Max Booster app's **DNS-over-HTTPS (DoH, RFC 8484)** endpoint.

The primary tool is **AdGuard dnsproxy** — a production-grade Go binary with
zero dependencies, built-in answer caching, EDNS0 support, health-checking,
and native `https://` DoH upstream support.

---

## Architecture

```
Internet (any DNS client)
  │  UDP/TCP port 53
  ▼
VPS  →  ns1.max-booster.com  (+ ns2.max-booster.com for redundancy)
  │  HTTPS POST /api/dns/query
  │  Content-Type: application/dns-message  (RFC 8484)
  ▼
Max Booster app  (maxbooster.replit.app)
  │  Built-in authoritative DNS server (dns2, Node.js)
  ▼
DNS wire-format response → back to client
```

---

## Files

| File                | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `setup.sh`          | One-command installer (primary)                                        |
| `dns-proxy.service` | Systemd unit file for AdGuard dnsproxy (reference)                     |
| `dns-proxy-node.js` | Node.js fallback proxy (used automatically if dnsproxy download fails) |

---

## Requirements

- Ubuntu 22.04 LTS or Debian 12 (amd64 or arm64)
- Static public IPv4 address
- Root access
- Network egress to `maxbooster.replit.app` on port 443
- ~$5–6/month: DigitalOcean Droplet, Hetzner CX11, Vultr Cloud Compute, Linode Nanode

---

## Quick Install

```bash
# Option A — Clone the repo (if you have it)
APP_URL=https://maxbooster.replit.app bash vps-dns-proxy/setup.sh

# Option B — Copy the two files to your VPS and run
scp vps-dns-proxy/setup.sh vps-dns-proxy/dns-proxy-node.js root@<vps-ip>:~
ssh root@<vps-ip>
APP_URL=https://maxbooster.replit.app bash setup.sh
```

The installer will:

1. Free port 53 (disable systemd-resolved stub)
2. Download and install AdGuard `dnsproxy` binary (falls back to Node.js if download fails)
3. Install and start the `maxbooster-dns` systemd service
4. Configure the firewall (ports 22, 53, 80, 443)

---

## After Installation

### 1. Verify the service is running

```bash
systemctl status maxbooster-dns
journalctl -u maxbooster-dns -f
```

### 2. Test local DNS resolution

```bash
apt-get install -y dnsutils   # if dig is not installed

# Test through the local proxy
dig @127.0.0.1 max-booster.com A
dig @127.0.0.1 b-lawz-music.max-booster.com A
dig @127.0.0.1 max-booster.com NS
dig @127.0.0.1 max-booster.com SOA
```

Expected output:

```
;; ANSWER SECTION:
max-booster.com.   300   IN   A   34.111.179.208
```

### 3. Add glue records at your registrar

Glue records (also called "host records") hard-code the IP of your nameservers
so resolvers can find them without a circular lookup.

At wherever `max-booster.com` is registered, create these **host objects**:

| Hostname            | Type | Value           |
| ------------------- | ---- | --------------- |
| ns1.max-booster.com | A    | `<your VPS IP>` |
| ns2.max-booster.com | A    | `<your VPS IP>` |

Both point to the same VPS IP. For true redundancy, spin up a second identical
VPS and point `ns2` there.

**Registrar-specific guides:**

- **Namecheap**: Domain list → Manage → Advanced DNS → "Personal DNS Servers"
- **GoDaddy**: Domain settings → Manage DNS → "Host names"
- **Porkbun**: Manage → Glue Records
- **Cloudflare Registrar**: Dashboard → Registrar → "Custom nameservers"

### 4. Set nameservers for max-booster.com

After creating the glue records, set the **authoritative nameservers** for
`max-booster.com` to:

```
ns1.max-booster.com
ns2.max-booster.com
```

### 5. Verify propagation (1–48 hours)

```bash
# Check what nameservers the root servers see
dig NS max-booster.com +short

# Query directly through your VPS
dig @<your-vps-ip> max-booster.com A
dig @<your-vps-ip> max-booster.com SOA
dig @<your-vps-ip> max-booster.com NS
```

When `dig NS max-booster.com` returns `ns1.max-booster.com`, Max Booster
is the authoritative DNS for the entire domain.

---

## Updating the App URL

If the Replit deployment URL changes (or you add a custom domain):

```bash
# Edit the upstream URL
nano /etc/systemd/system/maxbooster-dns.service
# Change --upstream=https://your-new-url.com/api/dns/query

systemctl daemon-reload
systemctl restart maxbooster-dns
```

---

## Operations

```bash
# Live logs
journalctl -u maxbooster-dns -f

# Service status
systemctl status maxbooster-dns

# Restart
systemctl restart maxbooster-dns

# Verify port 53 is bound
ss -ulnp | grep ':53'
ss -tlnp | grep ':53'

# End-to-end test (from any machine, replace IP)
dig @<vps-ip> max-booster.com A
dig @<vps-ip> max-booster.com NS
dig @<vps-ip> b-lawz-music.max-booster.com A
```

---

## DoH Endpoint Details

The Max Booster app exposes these endpoints:

| Method | URL                              | Description                 |
| ------ | -------------------------------- | --------------------------- |
| `POST` | `/api/dns/query`                 | RFC 8484 POST (binary body) |
| `GET`  | `/api/dns/query?dns=<base64url>` | RFC 8484 GET                |
| `GET`  | `/api/dns/info`                  | JSON status / configuration |

**AdGuard dnsproxy** uses the POST method by default — it sends:

```
POST /api/dns/query HTTP/2
Content-Type: application/dns-message
Accept: application/dns-message
[binary DNS wire format body]
```

The response is:

```
HTTP/2 200 OK
Content-Type: application/dns-message
Cache-Control: max-age=300   ← per RFC 8484 §5.1, from answer TTL
[binary DNS wire format response]
```

---

## Why AdGuard dnsproxy?

| Feature                   | AdGuard dnsproxy    | Custom Node.js |
| ------------------------- | ------------------- | -------------- |
| DoH upstream (`https://`) | ✅ Native           | ✅ Custom      |
| DoT upstream (`tls://`)   | ✅                  | ❌             |
| Answer cache              | ✅ Built-in         | ❌ None        |
| EDNS0 / large responses   | ✅                  | ⚠️ Basic       |
| Health checks             | ✅ Automatic        | ❌ None        |
| Parallel upstreams        | ✅                  | ❌ Single      |
| TCP fallback              | ✅                  | ✅             |
| Production track record   | ✅ AdGuard Home     | —              |
| Binary size               | ~15 MB Go binary    | Node.js + npm  |
| Maintenance               | Actively maintained | Manual         |

---

## Troubleshooting

**Port 53 already in use after setup:**

```bash
ss -ulnp | grep ':53'
# Kill whatever is using it, then:
systemctl restart maxbooster-dns
```

**Service fails to start:**

```bash
journalctl -u maxbooster-dns -n 50 --no-pager
# Common issues: port 53 in use, binary permission, upstream unreachable
```

**Upstream unreachable:**

```bash
# Test the DoH endpoint from the VPS
curl -sv https://maxbooster.replit.app/api/dns/info
```

**Queries not resolving after propagation:**

```bash
# Check if VPS is responding on port 53
dig @<vps-ip> max-booster.com A
# If no answer, the VPS proxy is down — check service status

# Check if NS delegation is complete
dig NS max-booster.com @a.gtld-servers.net  # ask the .com TLD servers directly
```
