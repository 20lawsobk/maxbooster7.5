# Max Booster — Documentation Index

**Max Booster** is an AI-powered music career management platform by B-Lawz Music. It includes a browser DAW, beat marketplace, social media autopilot, music distribution to 34+ DSPs, AI content generation, and an autonomous Beat Money Loop revenue engine.

---

## Current evidence and operational entrypoints

Start with the [October 23 continuation](sophia-production-continuation-2026-10-23.md),
[deployment guide](DEPLOYMENT.md), [npm build/start contract](npm-build-start.md),
and [October 21 generation limits](generation-verification-2026-10-21.md).
Dated reports apply only to their recorded revision and fixture boundaries.
Architecture catalogs and design examples are not feature-completeness claims.
Desktop/mobile and multi-application workflows are excluded from this web/API gate.

## Docs

| File | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System overview, component diagram, request lifecycle, repo layout |
| [API.md](API.md) | Selected route reference; verify mounted handlers and actual contracts |
| [AUTH.md](AUTH.md) | Sessions, JWT fallback, CSRF, authenticator TOTP, RBAC, middleware stack |
| [DATABASE.md](DATABASE.md) | Selected Drizzle/PostgreSQL schema reference |
| [SERVICES.md](SERVICES.md) | Server-side business logic services — what each does and its key methods |
| [BEAT_MONEY_LOOP.md](BEAT_MONEY_LOOP.md) | Beat Money Loop: lifecycle, self-optimization, admin API, MaxCore dependency |
| [INTEGRATIONS.md](INTEGRATIONS.md) | MaxCore AI, PDIM, Stripe, SendGrid, Twilio, social OAuth, Cloudflare, Redis |
| [FRONTEND.md](FRONTEND.md) | React architecture, routing, state, audio engine, service worker, offline |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Current build/start, local service authority, readiness and isolated acceptance |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, scripts, TS config, conventions, security checklist, gotchas |

## Other key docs

| File | Contents |
|---|---|
| [`replit.md`](../replit.md) | Quick-start, required env vars, key scripts, troubleshooting table |
| [`threat_model.md`](../threat_model.md) | STRIDE threat model, mitigation matrix, CVSS severity, scanning tools |
| [`design_guidelines.md`](../design_guidelines.md) | Spacing/type scales, motion, accessibility, component library mapping |
| [`HARDENING_COMPLETE.md`](../HARDENING_COMPLETE.md) | Historical utility hardening report; not current release certification |
| [`EXECUTIVE_BRIEFING.txt`](../EXECUTIVE_BRIEFING.txt) | Platform overview for stakeholders |

---

## Quick orientation

**"How does the app boot?"** → [ARCHITECTURE.md § Server Startup Sequence](ARCHITECTURE.md) then [DEPLOYMENT.md](DEPLOYMENT.md)

**"What routes exist?"** → [API.md](API.md)

**"How does login work?"** → [AUTH.md](AUTH.md)

**"What tables are in the DB?"** → [DATABASE.md](DATABASE.md)

**"What is the Beat Money Loop?"** → [BEAT_MONEY_LOOP.md](BEAT_MONEY_LOOP.md)

**"How do I add a new feature safely?"** → [CONTRIBUTING.md](CONTRIBUTING.md)

**"Something is broken in production"** → [DEPLOYMENT.md § Troubleshooting](DEPLOYMENT.md)

**"How is MaxCore integrated?"** → [INTEGRATIONS.md § MaxCore](INTEGRATIONS.md)
