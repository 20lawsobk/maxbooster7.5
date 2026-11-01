---
name: DNS/TLS edge architecture reality for max-booster.com
description: What actually terminates DNS/TLS for the custom domain today (not what the code/docs imply), why ACME cert issuance has always failed, and what blocks any cutover.
---

## Registrar and live delegation (verified via public DoH lookup, not code reading)

`max-booster.com`'s real, live nameservers are the registrar's own defaults:
`ns1cny.name.com`, `ns2ckr.name.com`, `ns3jkl.name.com`, `ns4hny.name.com` (registrar = Name.com).
Both the apex and a wildcard test subdomain resolve directly to `34.111.179.208` with no
Cloudflare proxy IP anywhere in the path. Re-check with a DoH JSON query (no local `dig` needed
in this sandbox — it isn't installed): `curl -s "https://dns.google/resolve?name=max-booster.com&type=NS"`.

**This means Cloudflare is not currently live in production at all**, despite `docs/DEPLOYMENT.md`
documenting it as the setup and `server/middleware/cloudflare.ts` / `cf-subdomain-worker.js` being
fully wired in code. Nameservers were simply never switched to Cloudflare's. No request in
production today carries a genuine `CF-Ray`/`CF-Connecting-IP` header. Removing Cloudflare code is
therefore not a live-traffic regression risk — it's already inert.

## A complete custom replacement already exists, also never cut over

`dns-os` (Go authoritative DNS), `dns-node` (TypeScript DNS meant to run as `ns1`), and `tls-proxy`
(hand-built Node TLS SNI proxy reading per-host certs from the `storefront_hosts` table) together
form a designed-from-scratch non-Cloudflare edge stack, all targeting a GCP box at `34.117.33.233`.
Root `deploy-gcp.sh` orchestrates deploying all three there as systemd services. Built 2026-07-28,
still refined as of 2026-08-21 (a comment in `deploy-gcp.sh` cites confirming the prod URL that
date) — not a same-day abandoned experiment. But it hits the exact same blocker below, so it was
never actually cut over either. Whether the GCP box is currently provisioned/running could not be
confirmed from this sandbox — see the curl caveat at the bottom.

## Root cause: ACME DNS-01 has a 0% historical success rate, and it's a delegation gap

`storefront_hosts.cert_status` has **never once been `issued`** for any domain, ever (checked all
rows). Real recorded errors:
- `Authorization not found in DNS TXT record: _acme-challenge.max-booster.com` (for our own base domain)
- `No dns_zone found for host '<seller-custom-domain>' — cannot publish DNS-01 challenge` (for seller domains with no zone row)

Our ACME client (`server/services/acmeClient.ts`) publishes the `_acme-challenge` TXT record into
**our own DB-backed DNS zone** (served only by our own `dnsServer.ts`/`dns-node`, when running).
But Let's Encrypt's public verifier queries the domain's **real** authoritative nameservers — Name.com's
defaults, per above — which have never heard of that record. Verification fails by construction,
every time, regardless of which edge solution (Cloudflare or custom) is chosen.

**Practical implication:** the actual precondition blocking every option (Cloudflare Worker,
custom tls-proxy, or anything else that needs our own wildcard cert) is a registrar-level NS
delegation change at Name.com — not application code. Note the asymmetry once that's done:
Cloudflare's path wouldn't even need our ACME automation (Cloudflare's Universal SSL issues its
own cert for free); the custom tls-proxy path still needs our own ACME to actually succeed
end-to-end, which has never happened even once.

No Name.com registrar or GCP SSH credential is available to the agent in this workspace (only
`SESSION_SECRET` was listed as an available secret as of 2026-09-10) — an NS/glue-record change or
GCP box verification requires the user's direct action or granting those credentials first.

**Design intent, confirmed by the user directly (2026-09-10):** the in-house dns-os/dns-node/tls-proxy
stack was built to fully replace the need for *any* third-party DNS provider — Name.com, GoDaddy,
Cloudflare, all of it — not just to replace Cloudflare's proxy/edge layer while keeping a
registrar's DNS underneath. Don't scope a future fix as "just swap the edge/CDN"; the end state is
our own nameservers being the domain's sole authoritative DNS. User chose to hold off on the actual
cutover for now (as of 2026-09-10) pending their own registrar/GCP access steps.

## Sandbox curl caveat

Curling an arbitrary external HTTPS IP directly from this Replit sandbox produced the identical
`TLSv1.3 ... TLS alert, decode error / unexpected eof while reading` failure against two unrelated
IPs (the GCP box AND max-booster.com's real origin). Treat that specific failure signature as
**inconclusive about remote server health** (likely a sandbox network/TLS quirk for raw direct-IP
HTTPS) rather than proof either server is actually down. The DNS-delegation finding above (from DoH
lookups, not raw TLS) is the solid one.
