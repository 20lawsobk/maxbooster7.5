---
name: Storefront canonical origin
description: Required public origin versus retained customer DNS aliases
---
Generated marketplace/storefront URLs must use https://maxbooster.replit.app.
**Why:** The user explicitly required this canonical origin and removal of unintended max-booster.com storefront links.
**How to apply:** Keep customer-owned domains and historical DNS records intact as inbound aliases. Do not replace authoritative nameserver records with a web-app hostname or claim that a database domain claim proves public DNS/TLS availability.
