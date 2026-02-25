# Max Booster

AI-Powered Music Career Management Platform by B-Lawz Music.

## Architecture

- **Frontend**: React + TypeScript + Vite (built to `dist/public/`, served by Express in production)
- **Backend**: Express.js (Node.js/TypeScript), bundled to `dist/index.cjs` via esbuild
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless driver)
- **Storage**: Hybrid — Replit Object Storage (hot tier, `@replit/object-storage`) + Pocket Dimension (cold tier, compressed)
- **State Engine**: BoosterState (Rust-based KV store with WAL, runs on port 9877)
- **Build System**: Vite (frontend) + esbuild (backend via `script/build.ts`)
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4
- **Email**: SendGrid
- **Payments**: Stripe (live keys configured)
- **Monitoring**: Sentry

## Key Files

- `server/index.ts` — Express server entry point, serves on port 5000
- `server/vite.ts` — Vite dev middleware (dev mode only)
- `server/db.ts` — Drizzle ORM + Neon/WebSocket pool
- `server/routes.ts` — Route loader (dynamic import of all routes)
- `server/config/defaults.ts` — Centralized config from environment variables
- `server/services/storageService.ts` — Storage abstraction (Local/S3/Hybrid)
- `server/services/hybridStorageService.ts` — Hybrid storage (Replit hot + Pocket cold)
- `server/pocket-dimension/index.ts` — Pocket Dimension compressed storage engine
- `server/safety/index.ts` — Mandatory safety middleware (CSRF, rate limiting, helmet)
- `shared/schema.ts` — Drizzle schema definitions
- `client/src/App.tsx` — React app root
- `vite.config.ts` — Vite configuration (host: 0.0.0.0, port: 5000, allowedHosts: true)
- `script/build.ts` — Production build script (Vite frontend + esbuild backend)
- `drizzle.config.ts` — Drizzle Kit config

## Development

```bash
NODE_ENV=development npx tsx server/index.ts
```

## Production Build + Start

```bash
npm run build   # Builds frontend (Vite) + backend (esbuild) to dist/
npm run start   # Starts boosterstate + NODE_ENV=production node dist/index.cjs
```

The workflow uses: `npm run build && npm run start`

## Storage Configuration

The hybrid storage system is activated when `STORAGE_PROVIDER=replit`. It uses:
- **Hot tier**: `@replit/object-storage` with `REPLIT_BUCKET_ID`
- **Cold tier**: Pocket Dimension (compressed, chunked, content-addressed local storage)
- **Auto-tiering**: Files inactive for 30+ days are moved to cold tier every 6 hours

## Database

- Schema push: `npm run db:push`
- Uses `DATABASE_URL` environment variable (PostgreSQL / Neon)

## BoosterState

Custom Rust KV store with WAL (Write-Ahead Log) for job queues and session backing.
- Binary: `boosterstate/target/debug/boosterstate`
- Port: 9877 (set via `BOOSTERSTATE_PORT`)
- Secret: Set via `BOOSTERSTATE_SECRET`

## Environment Variables

All configured via Replit environment secrets. Key ones:
- `DATABASE_URL` — PostgreSQL connection (auto-provisioned)
- `STORAGE_PROVIDER=replit` — Activates hybrid storage
- `REPLIT_BUCKET_ID` — Replit Object Storage bucket ID
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe live keys
- `SENDGRID_API_KEY` — Email delivery
- `REDIS_URL` — Production session store
- `SESSION_SECRET` — Session signing
- `SENTRY_DSN` — Error monitoring
- Social OAuth keys: Facebook, Google, Instagram, LinkedIn, TikTok, Twitter, YouTube, Threads, Spotify
- `BOOSTERSTATE_PORT=9877`, `BOOSTERSTATE_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web push notifications
- `APP_URL=https://maxbooster.replit.app`

## Deployment

- Target: Autoscale
- Build command: `npm run build`
- Run command: `npm run start`

## Notification System

All notification types live in `client/src/components/notifications/types.ts`.
Service helpers are in `server/services/notificationService.ts`.

### Categories
`account_security`, `distribution`, `social_media`, `marketplace`, `royalties`, `collaboration`, `achievements`, `system`

### Wired Triggers
- **Achievement unlocked** → `achievementService.checkAndAwardAchievements` fires `sendAchievementNotification`
- **Streak milestones** (7/14/30/60/100/365 days) → `achievementService.updateStreak` fires `sendStreakMilestoneNotification`
- **New login** → login handler fires `sendLoginSecurityNotification`
- **Password changed** → change-password handler fires `sendPasswordChangedNotification`
- **Payment failed** → Stripe `invoice.payment_failed` webhook fires `sendPaymentFailedNotification`
- **Subscription updated** → Stripe `customer.subscription.updated` webhook fires `sendSubscriptionChangedNotification` or `sendSubscriptionRenewedNotification`
- **Analytics anomaly** → `analyticsAnomalyService` fires system notification
- **Marketplace sale** → `marketplace.ts` fires `sendSaleNotification`
- **Release status** → `notificationService.sendReleaseNotification`

### Available Helper Methods (not yet wired — call where applicable)
- `sendStorageQuotaNotification(userId, usedPercent)` — fire when storage hits 75%+
- `sendUploadCompleteNotification(userId, fileName, fileType)` — fire after file upload
- `sendAiProcessingCompleteNotification(userId, taskType, trackName)` — fire after AI tasks
- `sendStreamMilestoneNotification(userId, trackName, streams)` — fire at 1K/10K/100K/1M
- `sendFollowerMilestoneNotification(userId, platform, followers)` — fire at milestone counts
- `sendSocialTokenExpiringNotification(userId, platform)` — fire when OAuth token expiring
- `sendSubscriptionExpiringNotification(userId, plan, daysLeft)` — fire 7/3/1 days before expiry
- `sendBeatPlayMilestoneNotification(userId, beatName, plays)` — fire at beat play milestones

### Admin-Only Category: `platform_admin`
Only visible when `user.role === 'admin'`. Shows as an orange-highlighted tab/row. The admin notification helpers automatically look up the admin by `ADMIN_EMAIL` env var.

#### Admin notification types (all go to the admin user):
| Type | Method | Auto-triggered |
|------|---------|---------------|
| `admin_new_user` | `sendAdminNewUserNotification(email, userId, plan?)` | ✅ On every registration |
| `admin_payment_issue` | `sendAdminPaymentIssueNotification(email, userId, amount, reason?)` | ✅ On Stripe `invoice.payment_failed` |
| `admin_storage_critical` | `sendAdminStorageCriticalNotification(usedPercent, usedGB, totalGB)` | Wire when storage check runs |
| `admin_marketplace_review` | `sendAdminMarketplaceReviewNotification(itemName, itemId, sellerEmail)` | Wire when listing is submitted |
| `admin_user_report` | `sendAdminUserReportNotification(reporterEmail, reportedEmail, reason)` | Wire when report is filed |
| `admin_revenue_milestone` | `sendAdminRevenueMilestoneNotification(milestone, period)` | Wire at milestone thresholds |
| `admin_health_alert` | `sendAdminHealthAlertNotification(service, status, details?)` | Wire from health checks |
| `admin_user_flagged` | `sendAdminUserFlaggedNotification(email, userId, reason)` | Wire from fraud/abuse detection |
| `admin_support_ticket` | `sendAdminSupportTicketNotification(email, subject, ticketId?)` | Wire when ticket submitted |

## Desktop & Mobile Builds

Building the app requires GitHub Actions (Replit cannot create native installers).

- **Desktop (Electron)**: Push a tag `v3.x.x` to trigger `.github/workflows/build-desktop.yml`
  - Builds: Windows NSIS/Portable, macOS DMG/ZIP, Linux AppImage/DEB
  - Node 22 required (fixed in workflow)
  - Electron entry: `electron/main.js` (version 3.0.0)
- **Mobile (Capacitor)**: Push a tag to trigger `.github/workflows/build-mobile.yml`
  - Builds: Android APK/AAB, iOS IPA
  - Node 22, Java 21 required
  - Config: `capacitor.config.ts`, points to `https://maxbooster.replit.app`
- **Downloads page** (`/desktop-app`): Fetches release assets from GitHub API (`20lawsobk/maxbooster7.5`)

## Recent Fixes (Feb 2026)

- **Social OAuth**: Replaced in-memory `oauthStates` Map with HMAC-signed stateless tokens (`SESSION_SECRET`). TikTok state is URL-encoded since it contains `~` and `=`.
- **Studio DAW audio sync**: Added `requestAnimationFrame` position loop in `UltimateDAW.tsx` so `transport.position` updates at ~60fps during playback.
- **Settings tabs**: Fixed broken `grid-cols-7` layout for 9+ tabs — switched to `overflow-x-auto` + `inline-flex flex-wrap` scrollable tab list.
- **Settings keyboard shortcuts tab**: Added `TabsTrigger value="shortcuts"` + `TabsContent` with button that opens `ShortcutCustomizer` dialog.
- **Distribution upload route**: Was a non-functional stub. Now implemented with `releaseUpload.any()` (memory-storage multer), stores artwork + audio to hybrid storage, creates `distroReleases` and `distroTracks` DB records.
- **Notifications**: Added 14 new notification types + `achievements` category. Wired achievement, streak, login, password, payment failure, and subscription triggers. Fixed GitHub Actions Node version (20→22). Fixed Electron version mismatch (2.0.0→3.0.0).
