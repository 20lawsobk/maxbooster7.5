---
name: storefront_hosts routing projection
description: Every active storefront domain/subdomain MUST be written to storefront_hosts or the URL 404s despite showing "live"
---

The `storefront_hosts` table is the **single canonical routing projection** the multi-tenant
router reads to map an incoming Host header → storefront. `lookupStorefrontByHost` and the
`multiTenantRouter` middleware both resolve EXCLUSIVELY against `storefront_hosts` — the
`storefront_domains` table is bookkeeping only and is NOT consulted at request time.

**Rule:** any code path that marks a domain/subdomain `status='active'` in `storefront_domains`
MUST also upsert a matching `storefront_hosts` row (and delete it on removal/swap). Otherwise the
domain shows "live" in the UI but every request 404s.

**Why:** the free-domain claim path (`POST /api/storefront-domains/platform/claim`) wrote only
`storefront_domains` and returned "Your Domain is Live!" while never writing `storefront_hosts`,
so claimed custom storefront URLs never resolved. A user reported "the built-in DNS isn't
registering custom storefront URLs properly." A backfill found 4 already-broken active rows.

**How to apply:** the writers that DO honor this (use them as the pattern) are
`domain.controller.reserveManaged`, `domain.controller.verifyCustomDomain`,
`storefrontDnsService.activateStorefrontDomain`, and `dnsManager .../use-as-storefront`.
Wrap the `storefront_domains` + `storefront_hosts` mutations in one DB transaction so the two
tables can never diverge. `deleteDomain` already cleans up the host row (root + www variant).
When adding a NEW activation path, grep for `storefrontHosts` insert usage and mirror it.
