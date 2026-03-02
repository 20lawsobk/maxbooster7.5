# Max Booster — Technical Documentation

Max Booster is an AI-powered, full-stack TypeScript/Node.js music career management platform engineered for 90 million concurrent users. Every AI feature is 100% custom-built in-house — no OpenAI, no Anthropic, no third-party model APIs.

## Documentation Index

| File | Contents |
|---|---|
| [architecture.md](./architecture.md) | System architecture, tech stack, request lifecycle |
| [ai-models.md](./ai-models.md) | In-house AI model architecture, training pipeline, GPU simulation |
| [database-schema.md](./database-schema.md) | Complete PostgreSQL schema — all 80+ tables by domain |
| [infrastructure.md](./infrastructure.md) | Storage, queues, caching, security, WebSockets, circuit breakers |
| [studio.md](./studio.md) | DAW engine, audio processing, waveform rendering, collaboration |
| [backend-routes.md](./backend-routes.md) | All 70+ route files — endpoints, auth, technical purpose |
| [backend-services.md](./backend-services.md) | All 185+ services — algorithms, integrations, business logic |
| [frontend-pages.md](./frontend-pages.md) | All pages — features, UX patterns, AI integration |
| [frontend-components.md](./frontend-components.md) | Custom components — advanced technical implementations |

## Platform Summary

### Scale Targets
- **90 million** concurrent users
- **150+** music streaming platforms supported
- **97** DSP providers seeded and maintained
- **185+** custom backend services
- **80+** database tables

### Core Modules
1. **Studio** — Browser-based DAW (Digital Audio Workstation) with real-time multi-user collaboration
2. **Distribution** — Music delivery to 150+ DSPs with DDEX packaging, ISRC/UPC management
3. **Marketplace** — Beat licensing platform with 4-tier license system and escrow payments
4. **Analytics** — AI-powered streaming analytics across 25+ platforms with anomaly detection
5. **Social Autopilot** — Fully autonomous cross-platform content scheduling and publishing
6. **Advertising** — AI-driven campaign management (no manual budget setting)
7. **Royalties** — Complex waterfall royalty engine across 20+ territories and 10+ DSPs
8. **Collaboration** — Real-time Yjs CRDT-based multi-user editing

### Technology Stack
| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, TypeScript (strict mode) |
| Framework | Express.js |
| Database | PostgreSQL (Neon) via Drizzle ORM |
| Frontend | React 18, Vite, TanStack Query, Tailwind CSS |
| Real-time | WebSockets (ws), Yjs CRDT |
| Cache/Queue | Redis, BullMQ |
| Audio (client) | Tone.js, Web Audio API, PIXI.js (WebGL) |
| Audio (server) | FFmpeg, fluent-ffmpeg, FFT.js, wavefile, node-wav |
| AI Bridge | Custom Python FastAPI microservice (port 9878) |
| Storage | Replit Object Storage + custom Pocket Dimension Fabric |
| Payments | Stripe (subscriptions + Connect payouts) |
| Email | SendGrid |
| Push | Web Push (VAPID) |
| Security | JWT + refresh tokens, rate limiting, self-healing security engine |
