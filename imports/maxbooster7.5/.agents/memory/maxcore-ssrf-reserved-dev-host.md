---
name: MaxCore URL guard and Replit-hosted URLs
description: Replit development and production URLs may resolve to reserved addresses inside the workspace or MaxCore's server-side DNS-based SSRF guard.
---

Do not bypass MaxCore's SSRF protection for a Replit-hosted `.replit.dev` or `.replit.app` URL just because its hostname looks public or it can be fetched from the workspace shell. The caller's resolver and MaxCore's resolver can see different addresses; the actual fetcher's DNS and connect-time checks remain authoritative.

**Why:** On 2026-09-30, a self-hosted `.replit.app` pricing URL was rejected by the local safe fetcher as a reserved address, and MaxCore's social-generation endpoint returned HTTP 422 while the local model was ready. An earlier `.replit.dev` URL was also shell-fetchable but rejected by MaxCore's resolver. These are safety blocks, not evidence that the guard should be weakened.

**How to apply:** For URL-generation tests, distinguish service liveness from source-fetch readiness and verify resolution in the process that fetches the URL. Preserve DNS and redirect checks; use a genuinely public source or build a narrowly scoped first-party resolver that supplies verified content with provenance, never fabricated fallback metadata.