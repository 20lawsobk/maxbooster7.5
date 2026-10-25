# Database Reference

> Selected schema reference. Current declarations and migrations are authoritative.
> The runtime prefers NEON_DATABASE_URL and supports its documented DATABASE_URL
> fallback. Verify the actual selected target before any writes.

## Connection

The runtime prefers `NEON_DATABASE_URL` and supports the configured `DATABASE_URL` fallback. Determine the actual selected target before any operation; variable names alone do not establish database ownership or isolation.

- Primary connection: used for all writes and auth reads (to avoid replica lag).
- Read replica (`READ_REPLICA_URL`): used for analytics, dashboard, and high-volume reads.
- ORM: **Drizzle ORM**; use the actual adapters in `server/db.ts` (including the Neon/isolated PostgreSQL paths), not historical driver examples.
- Config: `drizzle.config.ts`
- Migrations: `migrations/` (Drizzle-managed), `server/migrations/` (manual)

Schema push and migration commands can modify shared data. Use explicitly
disposable fixtures for rehearsal, and establish retained backup/restore,
migration provenance, authorization and postconditions before a shared-data
change. Do not infer safety from a development label or a host Publish diff.
Consult the current migration files and `server/db.ts`; no migration is applied
merely because its source file exists.

---

## Schema Overview

Defined in `shared/schema.ts` using Drizzle's `pgTable`. Primary-key types vary; consult the actual table declarations. Most flexible metadata fields use `jsonb`.

---

## Table Reference

### Users & Auth

#### `users`
Core user accounts.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| email | varchar | Unique |
| username | varchar | Unique |
| password | text | bcrypt hash; never returned in account responses |
| role | varchar | `user` \| `admin` |
| twoFactorEnabled | boolean | Default false |
| twoFactorPhone | varchar | E.164 format |
| subscriptionStatus | varchar | `trial` \| `active` \| `expired` |
| subscriptionTier | text | Subscription tier identifier |
| subscriptionExpiresAt | timestamp | |
| stripeCustomerId | varchar | |
| stripeSubscriptionId | varchar | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

#### `pg_sessions`
Express session persistence fallback.

| Column | Type | Notes |
|---|---|---|
| sid | varchar PK | Session ID |
| sess | jsonb | Full session data |
| expire | timestamp | |

#### `jwtTokens`
Issued JWT tracking for revocation.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| tokenHash | varchar | SHA-256 of token |
| expiresAt | timestamp | |
| revokedAt | timestamp | Null = active |

#### `refreshTokens`
Refresh token store.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| token | varchar | Hashed |
| expiresAt | timestamp | |
| revokedAt | timestamp | |

#### `passwordResetTokens`
| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| token | varchar | |
| expiresAt | timestamp | |
| used | boolean | |

---

### Beats & Marketplace

#### `beatListings`
Beat marketplace entries.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | Seller |
| title | varchar | First line only (no mid-word truncation) |
| genre | varchar | |
| bpm | numeric | |
| key | varchar | e.g. "G Major" |
| price | numeric | USD cents |
| status | varchar | `draft` \| `listed` \| `sold` |
| backend | varchar | `maxcore` \| `local` |
| audioUrl | varchar | Served file path |
| waveformData | jsonb | Waveform peak data |
| tags | jsonb | String array |
| plays | integer | |
| downloads | integer | |
| createdAt | timestamp | |

#### `royaltySplits`
Revenue ownership records for beats.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| beatId | varchar FK → beatListings | |
| userId | varchar FK → users | |
| splitPercent | numeric | 0–100 |
| role | varchar | `creator` \| `collaborator` |

#### `orders`
Beat purchases.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| buyerId | varchar FK → users | |
| sellerId | varchar FK → users | |
| beatId | varchar FK → beatListings | |
| amount | numeric | USD cents |
| stripePaymentId | varchar | |
| licenseType | varchar | `basic` \| `exclusive` |
| createdAt | timestamp | |

---

### Beat Money Loop

#### `beatMoneyLoopCycles`
History of autonomous Beat Loop executions.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | Admin user |
| status | varchar | `running` \| `completed` \| `failed` |
| genre | varchar | Selected genre |
| bpm | numeric | |
| key | varchar | |
| beatId | varchar FK → beatListings | Resulting beat |
| price | numeric | Listed price |
| trigger | varchar | `scheduled` \| `manual` |
| startedAt | timestamp | Used for orphan detection |
| completedAt | timestamp | |
| meta | jsonb | Scan context, quality scores, optimizer results |

---

### Social Media

#### `socialAccounts`
Connected OAuth platform accounts.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| platform | varchar | `instagram` \| `tiktok` \| `x` \| `facebook` \| `youtube` \| `spotify` \| `soundcloud` |
| platformUserId | varchar | |
| accessToken | varchar | Encrypted |
| refreshToken | varchar | Encrypted |
| tokenExpiresAt | timestamp | |
| status | varchar | `active` \| `disconnected` \| `error` |

#### `scheduledPosts`
Posts queued for future publishing.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| platform | varchar | |
| content | text | Caption/copy |
| mediaUrls | jsonb | Array of media URLs |
| scheduledAt | timestamp | |
| status | varchar | `pending` \| `published` \| `failed` |
| errorMessage | varchar | |
| publishedAt | timestamp | |

#### `socialPosts`
Published post history.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| platform | varchar | |
| platformPostId | varchar | Native ID on platform |
| content | text | |
| mediaUrls | jsonb | |
| engagementData | jsonb | Likes, shares, views, comments |
| publishedAt | timestamp | |

#### `storefront_hosts`
Domain routing for artist subdomains. **Every active subdomain must have a row here** or the URL 404s.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| hostname | varchar | Unique — e.g. `b-lawzmusic.max-booster.com` |
| storefrontId | varchar | |
| active | boolean | |

---

### Advertising

#### `adCampaigns`
Advertising campaign definitions.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| name | varchar | |
| status | varchar | `draft` \| `active` \| `paused` \| `completed` |
| budget | numeric | USD cents |
| platforms | jsonb | Array of target platforms |
| targetAudience | jsonb | Audience spec incl. `priorityPlatforms` |
| creativeAssets | jsonb | Array of creative objects |
| aiOptimizations | jsonb | Optimization history via `appendOptimization()` |
| organicMetrics | jsonb | Stores `posts[]` with `creativeId` |
| startDate | timestamp | |
| endDate | timestamp | |

#### `adDeliveryLogs`
Per-delivery tracking.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| campaignId | varchar FK → adCampaigns | |
| platform | varchar | |
| creativeId | varchar | |
| deliveredAt | timestamp | |
| impressions | integer | |
| clicks | integer | |
| conversions | integer | |
| spend | numeric | |

---

### Distribution

#### `distroReleases`
Music releases for DSP distribution.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| title | varchar | |
| artistName | varchar | |
| releaseType | varchar | `single` \| `ep` \| `album` |
| releaseDate | date | |
| status | varchar | `draft` \| `submitted` \| `live` \| `rejected` |
| upc | varchar | |
| coverArt | varchar | URL |
| dspStatuses | jsonb | Per-DSP submission status map |

#### `distroTracks`

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| releaseId | varchar FK → distroReleases | |
| title | varchar | |
| isrc | varchar | |
| audioFile | varchar | URL |
| duration | integer | Seconds |
| trackNumber | integer | |
| explicit | boolean | |

#### `dspProviders`
Registered DSP platform configs.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| name | varchar | e.g. "Spotify" |
| apiEndpoint | varchar | |
| credentials | jsonb | Encrypted |
| active | boolean | |

---

### Studio

#### `studioTemplates`
Reusable DAW project templates.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| name | varchar | |
| templateData | jsonb | Full project state |
| isPublic | boolean | |

#### `studioRecentFiles`
Recently accessed studio projects.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | |
| projectId | varchar | |
| accessedAt | timestamp | |

---

### Audit & System

#### `audit_logs`
Durable record of sensitive platform actions.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| userId | varchar FK → users | Actor |
| action | varchar | Action code |
| resource | varchar | Affected resource type |
| resourceId | varchar | |
| risk | varchar | `low` \| `medium` \| `high` \| `critical` |
| metadata | jsonb | Action context |
| ipAddress | varchar | |
| createdAt | timestamp | |

> ⚠️ The column is `risk`, not `severity`. Queries filtering audit logs must use `AND risk != 'critical'`, not `severity`.

#### `isrcRegistry` / `upcRegistry`
ISRC and UPC code allocation registries. Managed by the platform to issue unique codes to releases.

#### `dnsRecordCache` / `dnsZones` / `dnsProviderCredentials` / `storefrontDomains`
DNS and custom domain management tables. See [INTEGRATIONS.md](INTEGRATIONS.md) for the domain routing flow.

---

## Conventions

- **Primary keys:** `varchar` UUIDs using `defaultRandom()` unless using serial integers (legacy tables).
- **Timestamps:** All use `timestamp` with `defaultNow()`.
- **Flexible metadata:** `jsonb` — always document the expected shape in code comments.
- **Soft deletes:** Not universal — some tables hard-delete, others have `status` or `deletedAt`.
- **Encryption:** OAuth tokens and provider credentials are encrypted at the application layer before storage.
