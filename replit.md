# Max Booster - AI-Powered Music Career Management Platform

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry. The project envisions becoming the go-to platform for artists looking to boost their careers through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture

The Max Booster application is structured as a monorepo, separating concerns into distinct directories:
- `client/`: React frontend, built with Vite, TypeScript, TailwindCSS, Wouter for routing, Zustand for state management, and TanStack Query for data fetching. The UI/UX emphasizes a clean, responsive design suitable for creative professionals.
- `server/`: Express.js backend, handling all API routes, written in TypeScript.
- `shared/`: Contains shared TypeScript types and Drizzle ORM schema for consistent data definitions across frontend and backend.
- `boosterstate/`: A custom Rust-based Write-Ahead Log (WAL) key-value store, pre-compiled for performance. It's used for per-replica session data, social media queues, and fast key-value lookups.
- `ai_model/`: Python AI model components and weights.
- `server/pocket-dimension/`: A custom virtual storage engine providing streaming compression and deduplication for cold-tier storage.
- `server/services/hybridStorageService.ts`: Manages the abstraction layer for the hybrid storage solution.

The server serves the frontend using Vite middleware in development and as static assets in production. Both frontend and backend operate on **port 5000**.

**Key Architectural Decisions:**
- **Hybrid Storage System**: A three-tier approach for data storage:
    1.  **Replit Object Storage (hot tier)**: For frequently accessed and recent files, utilizing `@replit/object-storage`.
    2.  **Pocket Dimension (cold tier)**: For archival and rarely accessed data, employing custom compression/deduplication.
    3.  **BoosterState (metadata/queuing)**: A Rust WAL store for session data, queues, and fast lookups.
- **AI Model Fine-Tuning**: All core AI/ML models are specifically fine-tuned for music artist use cases using 2024-2026 data. This includes models for Viral Scoring, Timing Optimization, Algorithm Intelligence, Customer Health Scoring, and Discovery Algorithms, with specific genre multipliers and platform-specific weighting.
- **Microservices-like Structure**: Within the monorepo, services are logically separated (e.g., `musicWorkflowAutomationService.ts`, `storefrontService.ts`) to manage complexity.
- **Scalability**: Designed for Replit Autoscale, supporting up to 10 replicas with 6 workers per replica, leveraging Redis for shared state (sessions, queues, pub/sub) across replicas.
- **Robust Authentication**: Implements session fixation prevention, a JWT bearer token system for mobile API clients with refresh tokens and full revocation capabilities, and a session heartbeat mechanism.
- **Comprehensive Workflow Automations**: Features 21 automation templates across five career phases (Creation, Pre-Release, Release Day, Post-Release, Revenue), managed by `musicWorkflowAutomationService.ts` with CRUD, event dispatching, and cron scheduling.
- **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles to eliminate ad spend, avoiding traditional ad platform integrations.
- **Read Replica Routing**: Production environments utilize a PostgreSQL read replica for analytical and dashboard reads to offload the primary database, while critical write operations and authentication queries are directed to the primary DB.
- **Silent Deployment System**: A self-evolution engine triggers silent deployments after atomic file writes, queuing deployment windows, performing rolling cluster restarts via IPC with health checks, and auto-rollback on degradation. Audit logs are maintained in the `optimization_tasks` table.
- **Security Hardening**: Implemented comprehensive security fixes including IDOR prevention, improved session cookie security, AI route rate limiting, input validation, authentication consistency, and SSRF protection.
- **Performance Hardening**: Pagination applied to all list endpoints, Redis query caching for stats endpoints, and composite DB indexes for major user-owned tables. Neon PostgreSQL primary and replica databases are used for improved performance and reliability. Request correlation IDs are implemented for end-to-end tracing.

## External Dependencies

- **Frontend Frameworks**: React 19, Vite 7, TypeScript, TailwindCSS 4, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js 22, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM. NEON_DATABASE_URL configured.
- **Caching/Queuing/Sessions**: Redis (REDIS_URL configured, Pub/Sub active for cross-instance broadcasting).
- **Object Storage**: Replit Object Storage (hot tier, runtime-managed bucket).
- **Payment Processing**: Stripe (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, WEBHOOK_SECRET configured; live price IDs fetched automatically).
- **Email Delivery**: SendGrid (SENDGRID_API_KEY configured).
- **Error Tracking**: Sentry (SENTRY_DSN configured).
- **Push Notifications**: Web Push Protocol (VAPID keys configured).
- **Music Integrations**: Spotify (SPOTIFY_CLIENT_ID/SECRET), LabelGrid (LABELGRID_API_TOKEN).
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok (sandbox+live), YouTube, LinkedIn, Google, Threads — all credentials configured.
- **Version Control**: GitHub (GITHUB_PAT, GITHUB_REPO configured for CI/CD desktop/mobile builds).
- **Search APIs**: Exa (EXA_API_KEY), Tavily (TAVILY_API_KEY).

## Max AI Assistant

All AI in Max Booster — including the Max assistant — is built and trained entirely in-house by the B-Lawz Music engineering team. No external AI APIs (OpenAI, etc.) are used anywhere.

**Architecture:**
- `server/services/maxAssistantService.ts`: In-house knowledge engine with 25+ topic entries covering Studio/DAW, distribution, royalties, marketplace, social media, advertising, analytics, career tools, account management, and the in-house AI system itself. Uses word-boundary scoring (not substring) to match user intent.
- `server/routes/assistant.ts`: REST API — `GET /api/assistant/history`, `POST /api/assistant/chat`, `DELETE /api/assistant/history`
- `shared/schema.ts`: `assistantConversations` and `assistantMessages` tables for persistent per-user chat history

**Frontend components:**
- `client/src/components/support/AIAssistantBubble.tsx`: Authenticated-user bubble (cyan/blue, bottom-right). Loads full history from server on open, sends messages via API, supports clearing history.
- `client/src/components/support/AIAssistantPublic.tsx`: Public/unauthenticated bubble (purple/pink, public pages). Uses the same server API but does not persist history.

**Key behaviors:**
- Authenticated users: conversation history persists to DB across sessions
- Unauthenticated users: chat works via API but history is not saved
- Context-aware follow-up detection using conversation history
- Comprehensive knowledge base covers all platform features in detail

## Production Configuration

- **Run Mode**: `npm run start` (production cluster, `dist/cluster.cjs`)
- **Build**: `npm run build` (Vite frontend + esbuild server bundle)
- **Workflow**: Configured for autoscale deployment
- **Environment**: NODE_ENV=production, all 23 required env vars validated at startup
- **BoosterState**: Pre-compiled Rust WAL binary at `./boosterstate/target/debug/boosterstate`, port 9877
- **Storage**: Hybrid — Replit Object Storage (hot) + Pocket Dimension (cold) + BoosterState (metadata)
- **Admin**: blawzmusic@gmail.com (role: admin), credentials synced on every startup
- **Self-Evolution**: Disabled (ENABLE_SELF_EVOLUTION=false)
- **Rate Limits**: RATE_LIMIT_MAX=3000/min, RATE_LIMIT_CRITICAL_MAX=600/min (set in .env)

## Security — Internal Network Bypass

Replit internal IPs (`10.x.x.x`), localhost (`127.0.0.1`, `::1`) and loopback variants are whitelisted from all rate limiters and the self-healing security engine:
- `server/middleware/globalRateLimiter.ts` — globalRateLimiter skip + criticalEndpointLimiter skip
- `server/middleware/rateLimiter.ts` — loginRateLimiter bypass
- `server/services/selfHealingSecurityEngine.ts` — processSecurityEvent bypass + blockIp bypass

This ensures internal monitoring, health checks, and Replit's own infrastructure (plus test agents) are never locked out. External public traffic remains fully rate-limited and monitored.

**Mandatory middleware limiters** (`server/safety/mandatoryMiddleware.ts`):
- `isInternalIp()` helper added — checks `127.0.0.1`, `::1`, `10.*`, `172.16.*`, `192.168.*`
- General mandatory limiter (1000/15min): `skip` now returns `true` for internal IPs
- Strict auth limiter (50/15min, `/api/auth` + `/api/kill-switch`): `skip` now returns `true` for internal IPs

**SelfHealing middleware** (`server/middleware/selfHealingMiddleware.ts`):
- `isInternalIp()` helper added — strips `::ffff:` prefix, whitelists `127.0.0.1`, `::1`, `10.*`, `172.16.*`, `192.168.*`
- IP_BLOCKED check (line 48) only fires when `!isWhitelisted` — internal IPs are always whitelisted, permanently preventing false blocks of Replit test agents

## Studio DAW — Toolbar & Layout

- **Toolbar height**: 44px base (set in `client/src/hooks/useStudioScale.ts`)
- **Toolbar layout** (inline in `StudioOneDAW.tsx`): Single-row flex, no wrap. Left-to-right: "Add Track ▾" | Edit modes (Select/Draw/Erase/Slice icons) | Snap | "Browse ▾" | Zoom | [spacer] | "View ▾" | "File ▾" | ⌨ | **Lyrics** | 🎧 | ⛶ | | "Inspector" | "Editor" | "Mixer"
- **Browse dropdown**: All Plugins, Instruments, Effects (opens plugin browser panel)
- **View dropdown**: Automation (purple dot), Surround (cyan dot), Video Track (green dot) — View button shows blue indicator when any active
- **File dropdown**: Export Audio (Ctrl+Shift+E), Import Audio (Ctrl+I), Export Stems (Ctrl+Shift+S)
- **Transport & toolbar scroll fix**: `overflow-x-auto` + inner `min-w-max` div prevents controls from clipping
- **EditorPanel**: Drag handle (6px blue), resizable 80–600px, default 192px
- **MixerPanel**: Drag handle (6px blue), resizable 120–700px, default 240px

### Lyrics Panel (`client/src/components/studio/LyricsPanel.tsx`)
- Docked bottom panel, drag-resize (80–700px, default 280px), toggled by Lyrics button (Ctrl+Shift+L)
- Section tabs (Verse=blue, Chorus=pink, Bridge=amber, Intro=indigo, Pre-Chorus=purple, Outro=gray, Custom=green)
- Per-line numbered text inputs; Enter = new line, Backspace-on-empty = delete line
- Clock icon stamps playhead time to a line; click timestamp to scrub timeline
- Auto-scroll follows playhead during playback; "Follow" toggle disables it
- Font size S/M/L toggle; word count display
- **State is lifted to StudioOneDAW** (`lyricsSections` + `lyricsActiveSectionId`) so lyrics persist across panel toggles

### Audio Device Management (`client/src/components/studio/AudioDeviceDialog.tsx`)
- Dialog opened by Headphones toolbar button (Ctrl+Shift+D shortcut)
- Enumerates real OS audio devices via Web Audio API (`navigator.mediaDevices.enumerateDevices()`)
- Output + Input device selects; requests microphone permission if needed
- Sample rate chips: 44.1kHz / 48kHz / 88.2kHz / 96kHz / 192kHz (blue when selected)
- Buffer size chips: 64 / 128 / 256 / 512 / 1024 / 2048 (purple when selected)
- Real-time latency estimate; "Test Audio" plays 440Hz sine tone and shows result
- "Refresh Devices" re-enumerates hardware; "Apply" closes

### Fullscreen Mode
- Maximize2 / Minimize2 icon at right of toolbar; keyboard shortcut F11
- **Platform-adaptive**:
  - **Electron desktop**: Uses native OS window fullscreen via IPC (`toggle-fullscreen`, `is-fullscreen`, `fullscreen-changed` events in `electron/main.js` + `electron/preload.js`)
  - **Web / Capacitor**: Uses Browser Fullscreen API (`containerRef.current.requestFullscreen()`)
- `fullscreenchange` / Electron IPC listener keeps `isFullscreen` state in sync; button turns yellow when active

### Platform Detection (`client/src/hooks/usePlatform.ts`)
- Exports `usePlatform()` hook and `getPlatform()` utility
- Returns `{ type, isElectron, isCapacitor, isAndroid, isIOS, isMobile, isDesktop, electronOS }`
- Detects: Electron via `window.electronAPI?.isElectron`, Capacitor via `window.Capacitor?.isNativePlatform()`
- Cached on first call (singleton, no React re-renders)

### Mobile Lyrics Panel (`client/src/components/studio/MobileLyricsPanel.tsx`)
- Full-screen overlay (fixed inset-0, z-50) instead of docked panel — used when `platform.isMobile === true`
- Shares the same `LyricSection` / `LyricLine` / `SectionType` types from `LyricsPanel.tsx`
- Touch-friendly: large tap targets, auto-growing textarea, swipeable section tabs
- Same features as desktop: numbered lines, timestamp stamping, auto-scroll, S/M/L font sizes

### Mobile Audio Dialog (`client/src/components/studio/MobileAudioDialog.tsx`)
- Bottom-sheet overlay — used when `platform.isMobile === true`
- Simplified for mobile OS: microphone permission request, sample rate chips, system output (no device enumeration)
- "Test Audio" button plays 440Hz tone; "Refresh" re-checks permissions

### GitHub Actions CI/CD
- **`.github/workflows/build-desktop.yml`**: Builds on push/tag — Linux (AppImage, DEB, tar.gz), Windows (NSIS, Portable), macOS (DMG, ZIP). macOS optional code signing via `MAC_CERTIFICATE_BASE64` secret.
- **`.github/workflows/build-mobile.yml`**: Builds on push/tag — Android (debug APK + release APK + AAB), iOS (Simulator build + IPA). Play Store upload via `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret.
- **`.github/workflows/build-all.yml`**: Manual trigger (`workflow_dispatch`) to build all 5 platforms in one run. Selectable desktop platforms, mobile platforms, and build type (debug/release). Creates a GitHub Release when a `version_tag` is provided.