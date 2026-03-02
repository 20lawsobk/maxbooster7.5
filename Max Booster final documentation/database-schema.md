# Database Schema

PostgreSQL database managed via Drizzle ORM. All table definitions live in `shared/schema.ts`. The schema is synced with `drizzle-kit push` — no manual migrations.

## Schema by Domain

---

### 1. Core Users & Sessions

| Table | Key Columns | Purpose |
|---|---|---|
| `users` | id, email, username, role, subscriptionTier, tokenVersion, twoFactorEnabled, emailVerified | Central user table. Stores profile, subscription, 2FA, and token versioning for instant logout |
| `sessions` | id, userId, token, ipAddress, userAgent, expiresAt | Active session tracking for security auditing and per-session logout |
| `social_accounts` | userId, platform, accessToken, refreshToken, platformUserId, followerCount | OAuth connections to Spotify, TikTok, Instagram, YouTube, etc. |
| `kyc_documents` | userId, documentType, status, verificationData | KYC identity verification (passport, ID, business docs) |

---

### 2. Studio & DAW

| Table | Key Columns | Purpose |
|---|---|---|
| `projects` | id, userId, name, bpm, key, genre, metadata (jsonb) | Top-level creative project container. Metadata stores lyrics, session state |
| `studio_projects` | projectId, mixBusConfig, masterSettings, automationData, markers | Extended DAW state: bus routing, automation curves, cue markers |
| `studio_tracks` | projectId, name, type, volume, pan, mute, solo, order, metadata | Individual tracks (Audio/MIDI/Bus/Master). Metadata stores plugin chain, routing |
| `take_groups` | projectId, name, color | Group container for multiple recording takes |
| `take_lanes` | groupId, name, color | Individual recording lanes within a take group |
| `take_segments` | laneId, trackId, startTime, endTime, audioFileUrl | Individual audio segments on each lane for comping |
| `studio_templates` | name, genre, bpm, trackLayout | Reusable project structures (beat templates, song templates) |
| `plugin_presets` | pluginId, userId, name, isFactory, parameters, metadata | Per-plugin presets. Factory presets + user-saved presets |
| `studio_recent_files` | userId, projectId, fileName, filePath, fileType, accessedAt | Recent files list for the file browser |
| `studio_pinned_folders` | userId, folderPath, displayName | Pinned folders in the studio file browser |
| `stem_exports` | projectId, userId, name, format, bitDepth, sampleRate, trackIds, status, outputUrl | Stem export job records with output location |

---

### 3. Distribution & Releases

| Table | Key Columns | Purpose |
|---|---|---|
| `artist_profiles` | userId, name, spotifyUri, appleMusicId, deezerId, genres, popularity | Artist identity with cross-platform IDs |
| `distro_releases` | artistId, title, status, releaseDate, upc, genre, primaryPlatform | Release records (draft → processing → live) |
| `distro_tracks` | releaseId, title, isrc, audioUrl, duration, explicit, trackNumber | Individual tracks within a release |
| `dsp_providers` | slug, name, logoUrl, isActive, metadata | Registry of 97 supported streaming platforms |
| `distribution_sla_metrics` | releaseId, platform, submittedAt, deliveredAt, slaHours | Tracks delivery speed per platform |
| `content_id_registrations` | releaseId, platform, policy, claimType, status | YouTube Content ID and monetization policies |
| `pre_save_pages` | releaseId, userId, slug, spotifyUrl, appleMusicUrl | Pre-save landing pages for fan conversion |
| `pre_save_entries` | pageId, email, platform, convertedAt | Fan pre-save signups (email capture) |

---

### 4. Marketplace & Storefronts

| Table | Key Columns | Purpose |
|---|---|---|
| `storefronts` | userId, name, slug, customDomain, theme | Customizable artist storefronts (yourname.maxbooster.app) |
| `beats` | userId, title, genre, bpm, key, audioUrl, price, isPublished, tags | Beat marketplace listings |
| `listings` | userId, beatId, licenseType, price, isPublished | Marketplace listing records |
| `membership_tiers` | storefrontId, name, price, benefits | Fan subscription tiers |
| `customer_memberships` | userId, tierId, status, renewalDate | Active fan subscriptions |
| `bogo_promotions` | storefrontId, buyQuantity, getQuantity, discountPercent, isActive | Buy X Get Y promotional rules |
| `marketplace_recommendations` | userId, beatId, score, reason | AI-generated beat recommendations |

---

### 5. Financials & Royalties

| Table | Key Columns | Purpose |
|---|---|---|
| `royalty_splits` | releaseId, userId, percentage, role | Percentage ownership per collaborator |
| `split_sheets` | releaseId, title, status, signatories | Formal digital contracts for royalty splits |
| `royalty_transactions` | userId, platform, amount, currency, period, trackId | Granular royalty income ledger by DSP |
| `ledger_entries` | userId, type, amount, description, balance, referenceId | Master financial audit trail |
| `instant_payouts` | userId, amount, method, status, stripeTransferId | Rapid artist payouts (Stripe Connect) |
| `refunds` | userId, orderId, amount, reason, status | Refund request tracking |
| `invoices` | userId, items, total, status, dueDate, pdfUrl | Invoice document records |
| `tax_forms` | userId, formType, taxYear, status, data | 1099-MISC, W-8BEN, W-9 generation |

---

### 6. AI & Automation

| Table | Key Columns | Purpose |
|---|---|---|
| `ai_models` | modelId, name, version, capabilities, performance | Registry of all in-house AI models |
| `social_autopilot_content` | userId, platform, content, hookType, tone, status, scheduledAt | AI-generated and scheduled social posts |
| `music_impact_metrics` | userId, postId, streamLift, revenueImpact, period | Correlation between posts and streaming uplift |
| `user_brand_voices` | userId, tone, vocabulary, emojiUsage, hashtagFrequency | AI training data for consistent artist voice |
| `content_calendar` | userId, platform, scheduledAt, contentType, contentId | Unified cross-platform content schedule |
| `ad_campaigns` | userId, name, platform, objective, status | AI-managed advertising campaigns |

---

### 7. Collaboration & Workspaces

| Table | Key Columns | Purpose |
|---|---|---|
| `workspaces` | name, ownerId, plan, memberLimit | Organizational units for team collaboration |
| `workspace_members` | workspaceId, userId, role, invitedAt, joinedAt | Workspace membership records |
| `workspace_roles` | workspaceId, name, permissions (jsonb) | Custom role definitions with permission matrices |
| `collaboration_comments` | projectId, userId, timestamp, content, parentId | Threaded, timestamped DAW comments |
| `collaboration_versions` | projectId, userId, label, snapshot | Project version snapshots |
| `approval_workflows` | workspaceId, type, requiredApprovers, status | Formal approval chains for publishing/spending |
| `posts` | userId, platform, content, status, scheduledAt, approvalStatus | Social media post queue |

---

### 8. Analytics

| Table | Key Columns | Purpose |
|---|---|---|
| `royalty_transactions` | (see Financials) | Revenue source tracking |
| `system_metrics` | service, metric, value, timestamp | Platform health time series |
| `system_logs` | level, message, service, metadata, timestamp | High-volume application logs |
| `customer_health_scores` | userId, score, riskLevel, factors | Churn prediction scores per user |
| `alert_rules` | metric, condition, threshold, channels | Alert configuration |
| `alert_incidents` | ruleId, triggeredAt, resolvedAt, severity | Active and historical alerts |

---

### 9. Storage & Infrastructure

| Table | Key Columns | Purpose |
|---|---|---|
| `user_storage_files` | userId, storageId, fileName, fileKey, folder, fileSize, deletedAt | User file metadata (soft-delete capable) |
| `fabric_pockets` | userId, name, quota, usedBytes | Logical storage containers per user |
| `fabric_volumes` | nodeId, path, totalBytes, usedBytes, health | Physical storage volumes |
| `fabric_objects` | pocketId, key, size, chunkCount, hash | File metadata with content hash |
| `fabric_chunks` | objectId, volumeId, chunkIndex, offset, size | Individual 8MB data chunks |
| `dns_record_cache` | domain, recordType, value, ttl, cachedAt | DNS record cache for custom domains |
| `dns_templates` | name, records (jsonb) | DNS record templates for storefront domains |

---

### 10. Security & Compliance

| Table | Key Columns | Purpose |
|---|---|---|
| `audit_logs` | actor, action, target, metadata, timestamp | Immutable audit trail for all sensitive actions |
| `revoked_tokens` | jti, revokedAt, expiresAt | Per-token revocation list (24h retention) |
| `dmca_notices` | reporter, targetId, contentUrl, status | DMCA takedown request tracking |

---

### 11. Marketing & Fan Engagement

| Table | Key Columns | Purpose |
|---|---|---|
| `fan_campaigns` | userId, name, type, status, reachCount | Fan engagement campaign records |
| `playlist_pitches` | userId, releaseId, curatorId, status, submittedAt | Playlist curator submission tracking |
| `press_kits` | userId, bio, photos, releases, links | Electronic Press Kit (EPK) data |
| `push_subscriptions` | userId, endpoint, p256dh, auth, deviceInfo | Web Push subscription records |
| `notifications` | userId, type, title, message, isRead, metadata | In-app notification records |

---

### 12. Business Operations

| Table | Key Columns | Purpose |
|---|---|---|
| `onboarding_tasks` | name, category, xpReward, isRequired | Onboarding checklist items |
| `user_onboarding` | userId, taskId, completedAt, xpEarned | Per-user onboarding progress |
| `achievements` | name, description, category, xpReward, icon | Achievement/badge definitions |
| `user_achievements` | userId, achievementId, unlockedAt | Unlocked achievements per user |
| `system_settings` | key (unique), value (jsonb), updatedAt | Platform-wide admin-configurable settings |
| `contracts` | userId, type, status, parties, terms, signatures | Legal contract records with e-signatures |
| `support_tickets` | userId, subject, status, priority, assignedTo | Customer support ticket queue |

---

## Key Design Patterns

**JSONB metadata columns**: `projects.metadata`, `studio_tracks.metadata`, `users.metadata`, `dsp_providers.metadata` — stores flexible structured data without schema migrations.

**Soft deletes**: `user_storage_files.deletedAt` — records are marked deleted rather than removed, enabling recovery.

**Ownership checks**: Every user-owned table has a `userId` (or `artistId`) column. All queries filter by the authenticated user's ID to prevent IDOR attacks.

**Token versioning**: `users.tokenVersion` increments on logout, invalidating all active JWTs for that user atomically.

**Composite indexes**: 50+ indexes added across the schema for query performance at scale (on userId, createdAt, status columns used in frequent WHERE clauses).
