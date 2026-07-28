# Max Booster — System Architecture

## Overview

Max Booster is an AI-powered music career management platform built as a TypeScript monorepo. It provides a browser DAW, beat marketplace, social media autopilot, music distribution, AI content generation, and an autonomous revenue loop (Beat Money Loop) for independent artists and producers.

**Production URL:** https://maxbooster.replit.app  
**Custom domain:** https://max-booster.com (storefront subdomains via Cloudflare Worker)  
**Version:** 3.0.0

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  React 19 + Vite  │  Wouter routing  │  TanStack Query         │
│  Service Worker (PWA/offline)  │  Web Audio API (DAW)          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS / WSS
┌────────────────────────▼────────────────────────────────────────┐
│                   CLOUDFLARE EDGE (optional)                    │
│  cf-subdomain-worker.js — *.max-booster.com proxy              │
│  HSTS, CSP fallback, hostname validation, static caching        │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    EXPRESS SERVER (port 5000)                   │
│  server/index.ts — startup, middleware stack, route mounting    │
│                                                                 │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────────────┐   │
│  │  REST API   │  │  WebSocket │  │  Vite dev middleware   │   │
│  │  /api/*     │  │  /ws/*     │  │  (dev only)            │   │
│  └─────────────┘  └────────────┘  └───────────────────────┘   │
└──────┬─────────────────────────────────────┬────────────────────┘
       │                                     │
┌──────▼──────┐                   ┌──────────▼──────────────────┐
│  PostgreSQL  │                   │     EXTERNAL SERVICES       │
│  (Neon/DB)  │                   │                             │
│  Primary +  │                   │  MaxCore AI Server          │
│  Read       │                   │  (secure-ai-forge.replit.app)│
│  Replica    │                   │                             │
└─────────────┘                   │  PDIM (Redis-compatible     │
                                  │   session/job store)        │
┌─────────────┐                   │                             │
│    Redis    │                   │  Stripe  │  SendGrid        │
│  (BullMQ   │                   │  Twilio  │  Social OAuth    │
│   queues)   │                   │  (IG/TikTok/Spotify/etc.)   │
└─────────────┘                   └─────────────────────────────┘
```

---

## Repository Layout

```
/
├── client/                   React 19 + Vite frontend
│   ├── public/               Static assets served by Express in prod
│   │   ├── sw.js             Service worker (PWA, push, offline)
│   │   ├── manifest.json     PWA manifest
│   │   ├── icons/            App icons 72→512px
│   │   └── screenshots/      PWA install screenshots
│   └── src/
│       ├── pages/            Route-level page components
│       ├── components/       Reusable UI (ui/, layout/, studio/, auth/)
│       ├── hooks/            Custom React hooks
│       ├── stores/           Zustand global state
│       ├── lib/              API client, audio engine, offline sync
│       ├── contexts/         React context providers
│       └── types/            TypeScript declarations
│
├── server/                   Express 5 backend
│   ├── index.ts              Entry point, startup sequence
│   ├── routes.ts             Route registration (100+ route groups)
│   ├── auth.ts               Session/JWT dual-auth, requireAuth, requireAdmin
│   ├── db.ts                 Drizzle ORM instances (primary + read replica)
│   ├── storage.ts            Data access layer (DatabaseStorage class)
│   ├── logger.ts             Pino structured logger
│   ├── routes/               Modular route files (one per domain)
│   │   └── admin/            Admin-only route files
│   ├── services/             Business logic services
│   ├── middleware/           Express middleware (auth, CSRF, rate limit, etc.)
│   ├── config/               Typed env-var config (config object)
│   ├── workers/              BullMQ workers
│   └── monitoring/           Health, metrics, alerting
│
├── shared/
│   ├── schema.ts             Drizzle table definitions (100+ tables)
│   ├── audioConstants.ts     Shared audio enums/constants
│   └── domainValidation.ts   Domain/hostname validation utilities
│
├── scripts/                  Dev/admin scripts (tsx-runnable)
├── migrations/               Drizzle migration files
├── stubs/                    Local package stubs (tar firewall bypass)
├── electron/                 Desktop app wrapper
├── dns-node/                 Node.js DNS utilities
├── dns-os/                   OS-level DNS tooling
├── cf-subdomain-worker.js    Cloudflare Worker for *.max-booster.com
├── capacitor.config.json     Mobile app config (Android/iOS)
├── ecosystem.config.js       PM2 process config for AI server box
└── docs/                     This documentation
```

---

## Request Lifecycle

### Authenticated API request

```
Browser
  → TanStack Query (api.ts)
  → HTTPS POST /api/beats/create
  → Express middleware stack:
      1. PlatformFixerMiddleware      (tracks 5xx rate)
      2. express-session              (L1 Map → PDIM → pg_sessions)
      3. Origin validation            (SameSite=Lax + Origin check)
      4. CSRF middleware              (double-submit cookie validation)
      5. Demo write guard             (blocks demo@maxbooster.ai mutations)
      6. Global rate limiter          (Redis-backed, scalable)
      7. Admission control            (concurrency gate)
      8. requireAuth                  (session → JWT fallback → 401)
      9. Optional: require2FA         (checks session.twoFactorVerified)
     10. Optional: requireAdmin       (checks user.role === 'admin')
  → Route handler
  → DatabaseStorage method (Drizzle ORM)
  → PostgreSQL (primary for writes, replica for reads)
  → JSON response
```

### MaxCore AI request (e.g. beat generation)

```
Route handler
  → requireMaxCore middleware (503 if MaxCore unreachable)
  → maxcoreProxy.ts or direct callMaxcore()
  → HTTPS to secure-ai-forge.replit.app
      Authorization: Bearer <MAXCORE_API_KEY>
  → For async jobs: returns job_id → poll /api/video-job/:id
  → For sync: returns content directly (25s timeout)
```

---

## Key Subsystems

### Authentication
Multi-layer: session (PDIM → pg fallback), JWT dual-auth, CSRF double-submit, 2FA (Twilio Verify), token versioning. See [AUTH.md](AUTH.md).

### Data Access Layer
Single `DatabaseStorage` class (`server/storage.ts`) implementing `IStorage`. Primary + read-replica routing, `_retryQuery` wrapper for transient failures. See [DATABASE.md](DATABASE.md).

### Service Worker / PWA
`client/public/sw.js` (v11): versioned caches (static/dynamic/API/shell), stale-while-revalidate, offline fallback, background sync, push notifications with per-category actions, URL sanitization against open-redirect. Dev mode: transparent pass-through (no caching).

### Beat Money Loop
Autonomous AI revenue engine: scans → MaxCore beat generation → upload → marketplace listing → competitive pricing → social ad dispatch. Self-optimizes genre selection, pricing multiplier, and batch size from cycle history. Admin-only. See [BEAT_MONEY_LOOP.md](BEAT_MONEY_LOOP.md).

### Social Autopilot
UCB1 bandit-based platform selection, scheduled posting across Instagram/TikTok/X/Facebook/YouTube, AI content generation via MaxCore, ad campaign lifecycle management.

### Multi-Tenant Storefronts
Artist domains (e.g. `b-lawzmusic.max-booster.com`) are proxied by the Cloudflare Worker to the Replit origin, which reads `storefront_hosts` table to route requests. Every active subdomain must have a row in `storefront_hosts` or the URL 404s.

---

## Environment & Infrastructure

| Component | Technology |
|---|---|
| Runtime | Node.js ≥ 22, tsx (dev), compiled JS (prod) |
| Framework | Express 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Neon — `NEON_DATABASE_URL`) |
| Cache/Sessions | PDIM (Redis-compatible) + pg fallback |
| Job queues | BullMQ + Redis (port 6379) |
| Frontend build | Vite 5 |
| Styling | Tailwind CSS 4 |
| Mobile | Capacitor (iOS + Android) |
| Desktop | Electron |
| CI/Lint | ESLint v10 flat config + TypeScript split-config check |
| Deployment | Replit autoscale + Cloudflare Worker edge |
