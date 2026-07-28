# Max Booster — Documentation Index

**Max Booster** is an AI-powered music career management platform by B-Lawz Music. It includes a browser DAW, beat marketplace, social media autopilot, music distribution to 34+ DSPs, AI content generation, and an autonomous Beat Money Loop revenue engine.

---

## Docs

| File | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System overview, component diagram, request lifecycle, repo layout |
| [API.md](API.md) | Complete REST API reference — all routes, methods, auth requirements, error codes |
| [AUTH.md](AUTH.md) | Sessions, JWT fallback, CSRF, 2FA (Twilio Verify), RBAC, middleware stack |
| [DATABASE.md](DATABASE.md) | All Drizzle/PostgreSQL tables, columns, types, conventions |
| [SERVICES.md](SERVICES.md) | Server-side business logic services — what each does and its key methods |
| [BEAT_MONEY_LOOP.md](BEAT_MONEY_LOOP.md) | Beat Money Loop: lifecycle, self-optimization, admin API, MaxCore dependency |
| [INTEGRATIONS.md](INTEGRATIONS.md) | MaxCore AI, PDIM, Stripe, SendGrid, Twilio, social OAuth, Cloudflare, Redis |
| [FRONTEND.md](FRONTEND.md) | React architecture, routing, state, audio engine, service worker, offline |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, env vars, Cloudflare Worker, Capacitor, PM2, health checks, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, scripts, TS config, conventions, security checklist, gotchas |

## Other key docs

| File | Contents |
|---|---|
| [`replit.md`](../replit.md) | Quick-start, required env vars, key scripts, troubleshooting table |
| [`threat_model.md`](../threat_model.md) | STRIDE threat model, mitigation matrix, CVSS severity, scanning tools |
| [`design_guidelines.md`](../design_guidelines.md) | Spacing/type scales, motion, accessibility, component library mapping |
| [`HARDENING_COMPLETE.md`](../HARDENING_COMPLETE.md) | Security hardening summary |
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
