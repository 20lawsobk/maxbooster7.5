# Threat Model

## Project Overview

Max Booster is a large TypeScript monorepo for music-career management, storefront hosting, payments, social/OAuth integrations, AI-assisted content workflows, and custom-domain/DNS management. The production application is primarily an Express API in `server/`, a React/Vite client in `client/`, shared schema/types in `shared/`, and domain/DNS components in `dns-os/` and `dns-node/`, with PostgreSQL, PDIM, Stripe, SendGrid, and multiple social platforms as external dependencies.

This scan assumes Replit deployment defaults: TLS is terminated by the platform, `NODE_ENV=production`, and mockup/sandbox-only code is not production reachable unless code paths demonstrate otherwise.

## Assets

- **User accounts, sessions, JWTs, and 2FA state** — compromise enables account takeover, subscription abuse, and access to artist operations.
- **Artist business data** — storefront configuration, releases, analytics, contracts, billing metadata, social account links, and campaign state are business-critical and often tenant-specific.
- **Domain and DNS control plane data** — custom domains, DNS zones, provider credentials, verification tokens, and publishing state control externally visible storefront routing and can redirect artist traffic.
- **Payment and subscription state** — Stripe identifiers, subscription status, payouts, and revenue reporting affect both access control and financial integrity.
- **Application and integration secrets** — session/JWT secrets, OAuth client secrets, SendGrid/Stripe credentials, PDIM access, and internal sidecar secrets must never be exposed to clients or logs.
- **Internal service trust** — MaxCore, internal sidecars, and background workers are trusted server-to-server components; external callers must not reach them as privileged peers.

## Trust Boundaries

- **Browser / API boundary** — all client input is untrusted, including authenticated requests.
- **Public / Authenticated / Admin boundary** — many route groups mix public endpoints with authenticated and privileged operations; server-side checks must be explicit per action.
- **Tenant / Tenant boundary** — artists share the same backend and database, so every read/write path touching IDs, storefronts, domains, files, analytics, or contracts must enforce ownership.
- **API / Database boundary** — the Express server has broad PostgreSQL access; injection or missing row scoping can expose or alter cross-tenant data.
- **API / External providers boundary** — OAuth providers, Stripe, SendGrid, DNS providers, LabelGrid, MaxCore, and DNS-over-HTTPS endpoints receive outbound calls that must not be attacker-steered into SSRF, secret leakage, or confused-deputy flows.
- **Main app / internal sidecar boundary** — internal proxy routes expose local services behind a shared secret and must never become an external privilege-escalation path.
- **Production / dev-only boundary** — `AI training server/`, experimental tooling, mock environments, and local-only utilities are out of scope unless production reachability is demonstrated.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, modular routers under `server/routes/`, middleware under `server/middleware/`.
- **Highest-risk areas:** auth/session/JWT handling (`server/auth.ts`, `server/middleware/auth.ts`, `server/services/jwtAuthService.ts`), domain/DNS management (`server/routes/storefrontDomains.ts`, `server/routes/dns.ts`, `server/routes/dnsManager.ts`, `server/services/storefrontDnsService.ts`), OAuth/integration routes, admin routes, uploads, and internal proxy surfaces.
- **Public surfaces:** storefront/public content, DNS-over-HTTPS resolver endpoints, availability/search/registry style routes, selected webhook callbacks.
- **Authenticated surfaces:** most `/api/*` business routes, especially storefront, domain, billing, file, and AI-generation APIs.
- **Admin surfaces:** `/api/admin` and any background-control or financial-configuration endpoints.
- **Usually dev-only / skip unless proven reachable:** `AI training server/`, test helpers, local scripts, and mock/sandbox code paths.

## Threat Categories

### Spoofing

The application supports session auth, JWT fallback, OAuth flows, and optional 2FA. Protected endpoints must resolve identity consistently across these mechanisms, reject forged or replayed tokens, and verify privileged state such as admin role and 2FA server-side. Webhook and callback paths must validate provider authenticity before mutating state.

### Tampering

Users can modify storefronts, DNS zones, contracts, releases, analytics inputs, and social automation settings. The server must treat all client-supplied identifiers, domain names, records, prices, and workflow parameters as untrusted, validate them strictly, and ensure business rules are enforced server-side rather than in the UI.

### Information Disclosure

The platform stores PII, tokens, OAuth artifacts, verification tokens, analytics, contract data, and DNS/provider credentials. API responses, logs, and error handlers must not expose secrets or cross-tenant records. Any endpoint returning tenant-linked objects by ID must verify ownership before disclosing state or operational metadata.

### Denial of Service

The project contains public DNS resolver endpoints, AI/media workflows, upload paths, external lookups, and domain-health verification. Public or lightly authenticated endpoints must enforce bounds, rate limits, and timeouts so attackers cannot cheaply trigger expensive DNS, AI, media, or network operations.

### Elevation of Privilege

This codebase has many route groups with mixed public and authenticated behavior and several tenant-owned resources referenced by IDs. Every state-changing or sensitive read endpoint must enforce ownership or role checks on the server. In this project, broken function-level authorization and cross-tenant ID access are higher priority than purely theoretical issues in dev-only code.

### Repudiation

Sensitive actions such as admin changes, subscription updates, domain attachment, DNS record changes, and publishing events should be attributable to the acting user with durable logs that avoid leaking secrets. Auditability matters because the platform automates artist workflows and can affect payments, routing, and public storefront visibility.

## Mitigation Matrix (STRIDE → Controls)

| STRIDE category | Primary threats | Implemented controls | Severity if broken (CVSS-style) |
|---|---|---|---|
| **S**poofing | Session/JWT forgery, OAuth callback forgery, webhook spoofing | Session cookies (`SESSION_SECRET`), JWT verification, CSRF double-submit (`csrf-token` cookie + `X-CSRF-Token` header), Stripe/webhook signature checks, 2FA via Twilio Verify | Critical (9.x) — account takeover |
| **T**ampering | Cross-tenant writes by ID, DNS record injection, price manipulation | Server-side ownership checks per route, Drizzle parameterized queries, Zod input validation on mutation routes | Critical (9.x) — cross-tenant data integrity |
| **R**epudiation | Untraceable admin/financial actions | `audit_logs` table (`risk` column: low→critical), pino structured logging, per-user attribution on sensitive routes | Medium (5.x) |
| **I**nformation disclosure | Secret leakage in responses/logs, cross-tenant reads | Secrets only via env/Replit Secrets, helmet security headers, worker-level HSTS/CSP fallback (cf-subdomain-worker.js), sanitized error responses | High (7.x–8.x) |
| **D**enial of service | Cheap triggering of expensive AI/DNS/media work | Rate limiting middleware, MaxCore circuit breaker + bulkhead, request timeouts (25s generation cap), SW/API cache TTLs | Medium-High (6.x) |
| **E**levation of privilege | Public routes reaching admin behavior, sidecar proxy abuse | `useRequireAdmin` client gating + server-side role checks on `/api/admin/*`, internal-proxy shared secret, MaxCore Bearer-only auth | Critical (9.x) |

## Automated Scanning

- `npm run lint` — ESLint with injection-primitive rules (`no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`) as hard errors.
- `npm audit` / dependency audit — run via `npm run audit`; `tar` is stubbed locally due to a platform-blocked advisory.
- Replit Agent security scans (SAST + dependency + secret-detection) available on demand.
- `npm run check` — split server/client typecheck, catches unsafe API-shape drift.

## Review Cadence

Re-run this model when adding: a new public route group, a new external provider, a new tenant-owned resource type, or any change to auth/session code.
