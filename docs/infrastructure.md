# Infrastructure & Platform Engineering

## Security Architecture

### Self-Healing Security Engine (`selfHealingSecurityEngine.ts`)

The platform's security system is designed to respond to threats faster than they can cause damage:

| Phase | Target Latency |
|---|---|
| Detection | < 50ms |
| Response | < 250ms |
| Total Healing Time | < 800ms |

**Autonomous remediation actions**:
- `block_ip` — blacklists the source IP
- `session_kill` — immediately terminates the active session
- `feature_disable` — disables a specific feature under attack

**Pattern recognition** (high-performance regex, real-time):
- SQL Injection
- Cross-Site Scripting (XSS)
- Path Traversal (`../`)
- Command Injection (`;`, `&&`, `|`)

Every inbound request passes through `selfHealingMiddleware.ts` which cross-references the request against the security engine's threat model.

### Rate Limiting (`scalableRateLimiter.ts`)

**Distributed sliding window** using Redis Lua scripts for atomic counters across multiple server instances.

```
Incoming Request → Redis Lua script (atomic check+increment)
                → Under limit: proceed
                → Over limit: 429 Too Many Requests
```

**Degraded mode**: If Redis is unavailable, a local in-memory limiter runs at 25% capacity — the platform throttles rather than going unprotected or completely offline.

**Adaptive throttling** (`adaptiveRateLimiter`): Dynamically adjusts limits based on real-time RPS (requests per second) and system health metrics. Under load, non-critical endpoints are throttled first.

### Authentication Middleware (`auth.ts`, `jwtAuthService.ts`)

```
JWT Access Token (15 min) ─────────────────────────────────── hot path
Refresh Token (30 day, PostgreSQL) ── /api/auth/refresh ────── token rotation

Token Version (per user, integer):
  - Incremented on logout
  - Any token with version < current is instantly invalid
  - Enables instant "log out all devices"

JTI (JWT ID):
  - Unique ID per token
  - Stored in revoked-token table (24h retention)
  - Enables per-session logout without version bump
```

**Upload Security (`uploadSecurity.ts`)**: Dedicated middleware layer for file uploads:
- MIME type validation (whitelist, not blacklist)
- File size enforcement
- Malware scanning before storage

## Storage Architecture

### Hybrid Storage Service (`hybridStorageService.ts`)

Intelligent two-tier storage with automatic routing:

| Tier | Backend | Use Case |
|---|---|---|
| Hot | Replit Object Storage | Active projects, recent files, anything accessed in last 30 days |
| Cold | Pocket Dimension | Archives, old versions, large files (>50MB), rarely accessed data |

**Auto-tiering**: A background scheduler runs every 6 hours. Files idle for 30+ days are automatically moved to cold storage. On access, cold files are promoted back to hot.

**Deduplication**: SHA-256 content hashing — if two users upload the same audio file, only one copy is stored. References point to the same chunk.

### Pocket Dimension Fabric (`server/pocket-dimension/fabric/`)

A custom-built distributed object store designed for large audio assets:

```
Object Upload
     │
     ▼
Chunking Engine (8MB chunks)
     │
     ▼
Placement Algorithm (weighted by node health + capacity)
     │
     ▼
Volume/Node distribution
     │
     ▼
fabric_objects / fabric_chunks (database tracking)
```

**Components**:
- **`PocketStorageService.ts`** — Core chunking and reassembly
- **`Rebalancer.ts`** — Background service that reshuffles chunks when nodes become unhealthy or approach capacity
- **Placement strategy** — Weighted algorithm considering node health score and available capacity
- **Redundancy** — Configurable redundancy policies for durability

**Database tables**:
- `fabric_pockets` — Logical storage containers
- `fabric_volumes` — Physical storage volumes
- `fabric_objects` — File metadata and chunk mapping
- `fabric_chunks` — Individual 8MB data chunks and their node locations

### User Pocket Dimension (`userPocketDimensionService.ts`)

Per-user encrypted private storage:

| Feature | Detail |
|---|---|
| Default quota | 5GB per user (configurable) |
| Encryption | AES-256 (key derived from userId + email) |
| Compression | Zlib level 9 |
| Chunk size | 1MB chunks |
| Deduplication | Enabled |
| Auto-folders | `audio/`, `artwork/`, `documents/`, `beats/`, `stems/`, `exports/` |

## Queue Architecture (`queueService.ts`)

Built on **BullMQ** with Redis as the backend:

| Queue | Job Types | Purpose |
|---|---|---|
| `audio` | AudioConvert, AudioMix, StemExport | Heavy audio processing (offloaded from request cycle) |
| `csv` | CSVImport | Royalty and analytics bulk imports |
| `analytics` | AnomalyDetection, ReportGeneration | Analytics computation |
| `email` | EmailDelivery | Transactional email sending |

**Job reliability features**:
- Exponential backoff retry (3 attempts default)
- Priority support (urgent jobs jump the queue)
- Dead-letter queue (DLQ) for permanently failed jobs
- Auto-cleanup (500 completed, 200 failed retained)
- Rate limiting via Redis token bucket

### Autonomous Job Scheduler (`autonomousJobScheduler.ts`)

Repeatable BullMQ jobs that survive server restarts:

| Job | Interval |
|---|---|
| `content-dispatch` | Every 60 seconds |
| `analytics` | Every 1 hour |
| `metrics-persist` | Every 60 seconds |
| Campaign optimization | Every 5 minutes (per active campaign) |

## Caching Architecture

### Distributed Cache (`distributedCache.ts`)

Two-tier cache with drastically different latency profiles:

| Tier | Latency | Scope | TTL |
|---|---|---|---|
| L1 (in-memory) | ~0.01ms | Per server instance | 2 seconds |
| L2 (Redis) | ~1–3ms | Cross-instance shared | Configurable |

On cache read: L1 → L2 → database. On write: both tiers updated.

### API Response Cache (`apiCache.ts`)

ETag-based JSON caching:
- Varies by user ID and query parameters
- Returns `304 Not Modified` when content hasn't changed
- Dramatically reduces database load for read-heavy endpoints (analytics, settings)

### Waveform Cache (`waveformCacheService.ts`)

Audio visualization data (peak arrays, RMS values) is expensive to compute. This service caches processed waveform data to avoid re-analysing audio files on every load.

### Query Cache (inline, stats endpoints)

Stats endpoints across the platform use `queryCache.getOrCompute()` with 300s TTL and `queryCache.invalidate()` on mutations. Applied to: fan campaigns, venues, radio pitches, label submissions, sample clearances, music videos, songwriting, merch, project budgets, playlist pitching.

## Circuit Breaker Pattern (`circuitBreaker.ts`)

Protects against cascading failures when downstream services (AI, payments, email) fail:

```
CLOSED (normal) ──── 5 failures ──────► OPEN (blocking)
                                              │
                                         30 seconds
                                              │
                                              ▼
CLOSED ◄──── 3 successes ────── HALF_OPEN (testing)
```

**Configuration defaults**:
| Setting | Default |
|---|---|
| Failure threshold | 5 failures |
| Success threshold | 3 successes (for HALF_OPEN) |
| Volume threshold | 10 requests minimum before triggering |
| Reset timeout | 30 seconds |
| Call timeout | 10 seconds |

**Events emitted**: `state_change`, `failure`, `success`, `timeout`, `fallback`

Integrated with: Stripe, SendGrid, LabelGrid API, Python AI microservice

## Autonomous Operations

### Autonomous Service (`autonomousService.ts`)

Allows the platform to operate without manual intervention for whitelisted users:
- Schedules social posts based on AI timing recommendations
- Optimizes ad campaigns
- Manages distribution releases
- Triggers re-engagement campaigns for inactive fans

### Kill Switch (`killSwitch.ts`)

Emergency protocol for disabling systems:

| Endpoint | Action |
|---|---|
| `POST /kill-all` | Shuts down all autonomous systems |
| `POST /resume-all` | Restores all systems |
| `POST /kill/:system` | Disables a specific subsystem |
| `GET /status` | Current kill switch state |

Registered systems: `autonomous-service`, `automation-system`, `autonomous-updates`, `autonomous-autopilot`, `autopilot-engine`, `auto-posting-v1`, `auto-posting-v2`, `auto-post-generator`, `autopilot-publisher`

## Observability

### Structured Logging
- Every request gets a UUID correlation ID
- Logs include: request ID, user ID, method, path, status, duration
- Winston-based with database transport (`databaseLogTransport.ts`)
- Slow query detection: queries > 200ms trigger a WARN log

### Metrics Service (`metricsService.ts`)
- 1-minute bucket granularity (upsert by minute)
- Alert rule evaluation: `gt`, `lt`, `inside`, `outside` conditions
- Alert incident creation with deduplication
- Default evaluation window: 300 seconds

### System Health Routes (`monitoring.ts`)
| Endpoint | Data |
|---|---|
| `/api/monitoring/health` | Service health summary |
| `/api/monitoring/memory` | Heap usage, RSS, external |
| `/api/monitoring/cpu` | CPU usage per core |
| `/api/monitoring/event-loop` | Event loop lag (latency indicator) |

## Compliance Systems

### SOC2 / ISO 27001 / GDPR (`complianceService.ts`)
- Control assessment: Implemented / Partial / Planned
- Gap analysis with priority-ranked remediation steps
- Evidence tracking with automatic expiration
- Certification readiness score
- Executive report generation

### Audit Trail (`auditLoggerService.ts`)
Every sensitive action (settings change, role modification, payout, KYC approval) is written to the `audit_logs` table with actor, target, action, and timestamp.

### GDPR Compliance
- `consentService.ts` — Privacy consent management (GDPR, CCPA)
- `accountDeletionService.ts` — Full data purge on account deletion
- Right to access and right to erasure supported
