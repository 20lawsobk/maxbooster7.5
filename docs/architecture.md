# System Architecture

## Overview

Max Booster uses a monorepo structure with a clear separation between the TypeScript/Node.js backend, the React frontend, and the Python AI microservice. All three components run in the same Replit container but are logically isolated.

```
/
├── server/          — Express.js API server (TypeScript)
│   ├── routes/      — 70+ route files
│   ├── services/    — 185+ service files
│   ├── middleware/  — Auth, rate limiting, security, uploads
│   ├── infrastructure/ — Circuit breakers, distributed cache
│   ├── realtime/    — WebSocket server (general + studio)
│   └── pocket-dimension/ — Custom distributed storage fabric
├── client/          — React 18 SPA (TypeScript + Vite)
│   ├── src/pages/   — 30+ full-page views
│   ├── src/components/ — 200+ custom components
│   └── src/hooks/   — 40+ custom React hooks
├── shared/          — Shared types between client and server
│   └── schema.ts    — Drizzle ORM schema (80+ tables)
├── ai_model/        — In-house Python AI ecosystem
│   ├── model/       — Transformer architecture
│   ├── training/    — Training pipeline
│   ├── agents/      — Domain-specific agent heads
│   ├── gpu/         — Software-defined GPU simulation
│   └── video/       — Cinematic video rendering engine
└── docs/            — This documentation
```

## Request Lifecycle

```
Client Request
    │
    ▼
Express Middleware Stack
    ├── Request ID injection (UUID per request)
    ├── Structured logger (correlation ID)
    ├── Security middleware (self-healing engine)
    ├── CORS + Helmet
    ├── Rate limiter (Redis sliding window)
    ├── Auth middleware (JWT or session)
    └── Route handler
              │
              ▼
        Service Layer
              ├── Database (Drizzle ORM → PostgreSQL)
              ├── Redis (cache / queue)
              ├── Python AI microservice (port 9878)
              └── External APIs (Stripe, SendGrid, LabelGrid, etc.)
              │
              ▼
        Structured Response
              ├── JSON payload
              ├── ETag caching headers
              └── Request duration logged
```

## Authentication Architecture

### Dual Token System
- **Access Token**: JWT, 15-minute TTL, signed with `JWT_SECRET`
- **Refresh Token**: 30-day TTL, stored in PostgreSQL `sessions` table
- **Token Versioning**: Each user has a `tokenVersion` integer. Incrementing it on logout instantly invalidates all existing tokens for that user regardless of expiry.
- **JTI Revocation**: Individual JWT IDs can be revoked for per-session logout

### Auth Flow
```
Login → Access token (15m) + Refresh token (30d)
     → Access token expires → /api/auth/refresh → new pair issued
     → Logout → tokenVersion++ → all tokens invalidated
```

### Middleware Guards
- `requireAuth` — validates JWT, checks token version
- `requireAdmin` — checks `req.user.role === 'admin'`
- `requireSubscription` — blocks trial-expired or unsubscribed users
- `requireKYC` — blocks payout routes without identity verification

## Real-Time Architecture

Two WebSocket endpoints serve different purposes:

### `/ws` — General Notifications
- Sends real-time alerts, system updates, achievement unlocks
- User sessions subscribed on connect
- Redis Pub/Sub backbone ensures messages reach users across multiple server instances

### `/ws/studio` — Collaborative DAW
- Powered by **Yjs** (CRDT-based conflict-free replicated data types)
- Multiple users editing the same project see changes in real time without conflicts
- Session awareness (presence indicators, cursor positions)
- `yjsService.ts` manages document lifecycle

## Multi-Instance Scalability

The platform is designed for horizontal scaling:

| Concern | Solution |
|---|---|
| Session state | PostgreSQL (not in-memory) |
| Rate limiting | Redis Lua scripts (atomic, shared across instances) |
| WebSocket messages | Redis Pub/Sub fan-out |
| Job processing | BullMQ (Redis-backed queues, any worker can pick up jobs) |
| File storage | Replit Object Storage / S3 (not local disk) |
| Caching | L1 (2s in-memory per instance) + L2 (Redis shared) |

## Port Layout
| Port | Service |
|---|---|
| 5000 | Main Express server (API + Vite dev proxy) |
| 9878 | Python AI FastAPI microservice |
