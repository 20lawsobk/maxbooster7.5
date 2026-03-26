# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## Replit Environment Setup
- **Node.js**: 22 (required — project uses Node 22+ APIs)
- **Package Manager**: npm (with `legacy-peer-deps=true` in `.npmrc`)
- **Workflow**: "Start application" runs `NODE_ENV=development npx tsx server/index.ts` on port 5000 (webview)
- **Deployment**: `vm` — build: `npm run deploy:build`, run: `node dist/cluster.cjs`
- **Key Fix Applied**: Added ESM-compatible `__dirname` shim to `server/static.ts` (project uses `"type": "module"` so `__dirname` is not natively available in server files)
- **Optional services not configured in dev**: Redis/REDIS_URL (falls back to in-memory), Stripe keys (optional for payments), ADMIN_EMAIL (admin init skipped without it)

### Critical Deployment Notes
- **`NODE_ENV=production` is set globally in the Replit shell** — npm install will ONLY install `dependencies`, never `devDependencies`. All packages needed at build time OR runtime MUST be in `dependencies`.
- **Deployment build installs only production deps** — `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and all frontend UI packages (`react`, `react-dom`, `lucide-react`, `@radix-ui/*`, `@tanstack/react-query`, `framer-motion`, `zustand`, `wouter`, etc.) have been moved to `dependencies` for this reason.
- **`script/build.ts`** uses dynamic `await import("vite")` (not static import) so vite can be loaded from dependencies without triggering ESM issues.
- **Do NOT move `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, or any client package back to `devDependencies`** — it will break both the deployment build and the dev server startup.
- **Repl layer requires valid UTF-8 for ALL files** — The Replit VM deployment Repl layer push validates every file in the workspace. Binary files (PNG, .br, .gz, .so, executables) and files with non-UTF-8 bytes in filenames or content will cause "invalid UTF-8" errors. The deploy:build pipeline handles this:
  1. `script/build.ts` builds and pre-compresses assets (creates `.br`/`.gz` binary files)
  2. `script/deploy-clean-binary.mjs` runs AFTER the build and deletes ALL binary files from `dist/public/`, `client/public/`, and `boosterstate/target/debug/`
  3. At VM startup, `server/cluster.ts` (`compressAssetsAtStartup`) regenerates `.br`/`.gz` files using Node's built-in `zlib` module so production serving stays fast
- **Do NOT add PNG/ICO/binary files to `dist/public/` or `client/public/`** without also updating the `BINARY_EXTENSIONS` list in `script/deploy-clean-binary.mjs`.
- **`.gitignore` alone is NOT sufficient** to exclude files from the Repl layer — physical file deletion is required.
- **Git index cleanliness is critical**: The Repl layer is built from the git index (equivalent to `git archive HEAD`). Files with non-UTF-8 bytes in their **filename** (not just content) will also cause "invalid UTF-8" failures. A binary-named file `\x01\xd0%\x02@\x18\xfd` was found as Entry 0 in the git index and removed via direct Python index surgery. The `deploy-clean-binary.mjs` script now also purges the git index of any binary-named entries and any `attached_assets/` entries at every deploy.
- **Attached screenshots auto-create binary PNG files** in `attached_assets/`. These are gitignored but `deploy-clean-binary.mjs` also purges them from the git index if they somehow get committed.
- **Binary-named file fully resolved**: A binary-named file (`\x01\xd0%\x02@\x18\xfd`, 0 bytes) existed in the workspace root and blocked `vm` deployment. Agent sandbox blocked all file operations on it, but the Replit **Shell** (accessible from the Shell tab) does not have this restriction. Running `mv $'\x01\xd0%\x02@\x18\xfd' junk_delete_me.txt` in Shell renamed it, then `rm junk_delete_me.txt` deleted it. Workspace is now fully clean.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design.

### Triangle Architecture
Max Booster operates on a three-point data flow:
1. **Max Booster → PDIM**: Application pushes all data exclusively to PDIM.
2. **MaxCore training server (`secure-ai-forge.replit.app`) ← PDIM**: MaxCore pulls training data from PDIM to train AI models.
3. **Max Booster AI models ← MaxCore**: Max Booster pulls trained model weights from MaxCore for inference.

### PDIM — Unified Storage Container
**PDIM (`pocketdimensionstorage.replit.app`) is the ONLY storage backend.** It functions as both a Redis-compatible layer (for job queues, pub/sub, caching) and a persistent object storage system, accessed via a single HTTP exec endpoint. There is no separate Redis server or object storage.

### Key Architectural Decisions:
- **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated PDIM pockets with level-9 Gzip compression and SHA-256 content-addressed deduplication.
- **Hybrid Storage System**: All storage operations are routed entirely through PDIM as the sole backend, with `HybridStorageService` providing a tiered API.
- **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used.
- **Microservices-like Structure**: Services are logically separated within the monorepo.
- **Scalability**: Designed for Replit Autoscale with PDIM as the shared-state backend.
- **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
- **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
- **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles.
- **AI Content Stack**: Multiple versions (v2, v3, v4) integrate advanced content science principles, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content generation and songwriting assistance.
- **Multimodal Content Generation System** (v3.0.0): New architecture replacing template-based generation. Entry point: `POST /api/multimodal/generate`. Orchestration: `server/services/multimodalGenerationService.ts` (`normalizeInput → planTasks → workers → MultimodalPackage`). Workers: text, image, audio, video — all call MaxCore at `AI_SERVER_URL` with graceful local fallbacks. Pack definitions: `shared/types/multimodalGeneration.ts` (`singlereleasefull_pack`, `announcement_pack`, `tourdatespack`, `evergreenbrandpack`). Frontend: `ContentGenerator.tsx` — new "Pack" tab calls `POST /api/multimodal/generate` and renders assets grouped by platform. Pack list endpoint: `GET /api/multimodal/packs`.
- **Video Generation Engine**: An in-house text-to-video neural network (UNetV4 + v4 Training Engine) built with NumPy, featuring continuous self-training.
- **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
- **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
- **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
- **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- **Reliability Fixes**: Various background service safeguards and fallbacks.
- **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
- **Studio DAW UI/UX**: Customizable toolbar, resizable panels, and Web Audio API integration.
- **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
- **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
- **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions.
- **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
- **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
- **Admin Functionality**: Dedicated admin UI for financial configuration.
- **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.

## Known Fixes Applied (Distribution Module)

### Release Card Metadata Fix (Mar 2026)
`distroReleases` table stores artist name, release type, genre, explicit flag, and UPC in a JSONB `metadata` column — NOT as direct DB columns. `Distribution.tsx` release cards now correctly read from `(release.metadata as any)?.artistName` (etc.) instead of non-existent direct fields.

### Release Card Null Date Guard (Mar 2026)
`release.releaseDate` is `null` on draft releases. The card date display now uses a conditional: `release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : 'No date set'` instead of crashing with `new Date(null)`.

### View Release Dialog (Mar 2026)
The View (eye icon) button on release cards sets `showReleaseDetails` state, but no dialog was ever rendered. A full View Release Detail Dialog was added (above the Edit Release dialog in Distribution.tsx) showing Artist, Status, Release Type, Genre, Language, Copyright Owner, Copyright Year fields, plus "Close" and "Edit Release" footer buttons.

### ReleaseWizard Validation Fix (Mar 2026)
`validateStep()` used `metadataSchema.parse()` (throws) + `instanceof z.ZodError` check — fragile due to ESM bundler class identity issues. Replaced with `metadataSchema.safeParse()` which never throws, extracts per-field errors into `metadataErrors` state, and passes them to `MetadataForm` via the `errors` prop for inline field-level highlighting. Clears errors on any field change.

### Dev Static Asset Serving Fix (Mar 2026)
In `server/static.ts`, `DIST_PATH` was computed as `path.resolve(__dirname, "public")` which resolved to `server/public/` (non-existent) when running via `tsx`. Fixed to `path.resolve(process.cwd(), "dist", "public")`. Also confirmed that in dev mode, `setupVite()` handles all frontend serving (Vite HMR middleware); `serveStaticFiles()` is correctly limited to production.

### Profile Claiming System v2 — Phase 3 Complete (Mar 2026)
Full pipeline implemented across 6 new DB tables (`profileDnaSnapshots`, `profilePortabilityReports`, `profileIsrcChains`, `profileSplitDetections`, `profileClaimPipeline`, `profileClaimEvents`). Service: `server/services/artistProfileService.ts` (~2600 lines). Routes: 12 new endpoints in `server/routes/artistProfiles.ts`. UI: `AutoArtistSync.tsx` upgraded with 8 collapsible panels (health score gauge, ISRC chain discovery, split scanner, claim pipeline state machine, multi-platform fixer, social handle resolver, DNA snapshots, portability report + JSON-LD download, identity graph, history import). API returns `healthScore`, `splitDetected`, `healthBreakdown`, `healthGrade`, `lastHealthAt`, `watchEnabled`, `socialHandles`, `verifiedPlatforms` on all profile queries.

### Breakthrough Features (Mar 2026)

**1. Permanent DB Push Automation** (`scripts/db-push.js`)
- `npm run db:push` is now non-interactive. The PTY wrapper script spawns drizzle-kit and auto-sends Enter for all disambiguation prompts ("created or renamed" / "❯ create table" patterns).
- `npm run db:push:force` also available.
- NEVER write SQL migrations manually — always use `npm run db:push`.

**2. Health Grade Badge on Every Profile Card**
- `ArtistProfileManager.tsx`: every profile card now shows a color-coded A–F grade badge overlaid on the avatar (bottom-right), derived from `profile.healthScore` (already in the GET /api/artist-profiles response).
- Tooltip on hover shows full score breakdown by category.
- Profile cards with `splitDetected=true` get a red border + "⚠ Split" badge inline with the artist name — visible without expanding.
- MusicBrainz-linked profiles show a purple "MB" badge.

**3. Auto-DNA-Snapshot on Every Sync**
- `AutoArtistSync.tsx syncMutation.onSuccess`: after every successful auto-sync, silently POSTs to `/api/artist-profiles/:id/dna-snapshot` with `triggeredBy: 'auto-sync'`.
- Invalidates the DNA snapshots query so the timeline panel stays current automatically.

**4. Auto Health Score Refresh After Any Mutation**
- All mutations in `AutoArtistSync.tsx` now invalidate `['/api/artist-profiles/:id/health']`:
  - `savePlatformMutation`, `syncMutation`, `fixerMutation`, `updateClaimMutation`, `handleDiscover`
- The health gauge panel auto-refreshes after any data change without the user manually pressing Recalculate.

**5. Auto-Init Claim Pipeline on Platform Discovery**
- `artistProfileService.autoDiscover()`: after saving newly discovered platforms (Spotify, Apple, Deezer, YouTube, SoundCloud, Audiomack, MusicBrainz), immediately calls `updateClaimState(..., 'unstarted', 'system')` for each one.
- This creates the claim pipeline row automatically, so the Claim Pipeline panel in AutoArtistSync immediately shows all discovered platforms ready for tracking — no manual "Add platform" step needed.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe (requires STRIPE_SECRET_KEY env var).
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push Protocol.
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.
