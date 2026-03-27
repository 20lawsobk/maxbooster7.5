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
- **Platform Rules Config** (`shared/config/platformRules.ts`): `PLATFORM_RULES` const covering all 7 platforms — character limits, recommended lengths, hashtag rules (allowed/max), tone arrays, image aspect ratios, video durations/aspect ratios, requiresHook flag, audio voiceover/duration/style. Helpers: `getRules(platform)`, `enforceTextLength(text, rules)`, `enforceHashtagLimit(tags, rules)`. Wired into: `normalizeInput` (sent to MaxCore `/analyze`), `planTasks` planner prompt and input, `buildDefaultPlan` step params (per slot), all four workers (text/image/audio/video) — every MaxCore call receives `platformRules`. Local text fallback uses rules for hashtag capping and text truncation. Exposed via `GET /api/multimodal/platform-rules` and `GET /api/multimodal/platform-rules/:platform`.
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

### Multimodal Generation Engine v2 (Mar 2026)
Six enhancements to `server/services/multimodalGenerationService.ts`:

**B1 — Per-platform differentiated copy**: `buildCopyFromContext` accepts `targetPlatform` and returns genuinely distinct copy per platform. TikTok: POV/hook-first; Facebook: conversational/story; LinkedIn: professional; Twitter: punchy ≤240 chars; Threads: casual/no-hashtags; Instagram: punchy+aesthetic. `localAnalyzeUrl` generates `perPlatformCopy` map stored in `normalized.perPlatformCopy[platform]`.

**B2 — Dynamic hashtag engine**: `HASHTAG_LIBRARY` + `getHashtagsForPlatform()` replaces all hardcoded hashtags. Category+platform-aware selection: Instagram max 8, Facebook max 3, Threads 0, TikTok max 5, Twitter max 2. Category matching on `music_stream`, `music_video`, `event`, `website`, etc.

**B3 — Parallel step execution**: `handleGeneration` orchestrator runs all independent text/image steps via `Promise.all`. All per-platform steps now log `[parallel]` and fire concurrently (6 platforms = 1 parallel batch, not 6 serial calls).

**B4 — Platform-calibrated engagement scoring**: `enrichTextAssetMetadata` has per-platform scoring logic with tailored suggestions. Hook/body/cta passed as `existingMeta` so scoring accurately detects structured content without re-parsing. TikTok scores hook-first momentum, LinkedIn scores word count, Instagram scores emoji+hashtag density.

**B5 — Studio N+1 fix**: `server/services/studioService.ts` `loadProject` batch-fetches all audio+MIDI clips via `Promise.all` instead of a serial loop.

**B6 — Twitter/X platform restored**: Added `twitter` to `shared/types/multimodalGeneration.ts`, `shared/config/platformRules.ts` (280-char, 2 hashtags, punchy tone), `server/routes/multimodal.ts` `VALID_PLATFORMS`, and client `MULTIMODAL_PLATFORMS`. `expandPlatform('twitter')` returns `['twitter']`. Validated end-to-end: Twitter assets generate correctly within 280-char limit with score=100.

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

### Data Integrity Breakthroughs (Mar 2026) — Session 3

Ten hardcoded/random data sources replaced with real DB-sourced or deterministic logic:

**BT-1 — Playlist Journey: real DB query**
- `GET /api/analytics/playlist-journeys` now queries the `playlistJourneys` table instead of returning 4 hardcoded Spotify events.
- `positionHistory` is derived from real rows for the user's active playlist.
- `typeBreakdown` is computed from actual type distribution across the user's journey records.
- Response now includes `totalPlaylists` and `activePlaylists` counts.

**BT-2 — Global Ranking: real weekly analytics**
- `rankingHistory` in `/api/analytics/global-ranking` now uses `DATE_TRUNC('week', date)` aggregated weekly stream data for the past 6 weeks instead of the fake formula `baseScore - i * 2`.
- Falls back to the formula only when the user has no analytics data at all.

**BT-3 — A&R Discovery: real platform growth leaders**
- `/api/analytics/ar-discovery` now executes a raw SQL query against `users` + `analytics` joining 30-day vs 60-day stream windows.
- Returns real subscribers sorted by recent stream growth instead of 5 hardcoded fictional artists ("Luna Waves", "Neon Pulse", etc.).
- Computes `growthScore`, `signingPotential`, and `trajectory` from actual data.

**BT-4 — certifiedAnalytics sync-all: parallel execution**
- `POST /api/certified-analytics/sync-all` now runs `Promise.all` over all platforms instead of a serial `for...await` loop.
- Each platform's `syncPlaylistsFromPlatform` and `syncCohortData` calls also run in parallel via an inner `Promise.all`.

**BT-5 — aiContentService multilingual: parallel translation**
- The legacy fallback path in `generateMultilingualContent` now uses `Promise.allSettled(targetLanguages.map(...))` instead of a serial `for...of` loop.
- Failed languages are filtered out rather than stopping the entire batch.

**BT-6 — Natural Language Query: 10+ query types**
- `/api/analytics/natural-language-query` expanded from 3 to 10 distinct query branches:
  - revenue/earnings (with 30-day vs prior comparison and % change)
  - playlist placements (count + streams from `playlistJourneys`)
  - platform breakdown (top platforms by stream volume)
  - audience/listener count (monthly vs total)
  - growth rate (30-day vs prior 30-day)
  - release/track performance (joins `releases` + `analytics`)
  - period comparison (explicit month-over-month comparison)
  - recent activity (last 7 days chart)
  - top tracks and trends (existing, improved)

**BT-7 — Studio VU Meters: realistic exponential decay + peak hold**
- `ChannelStrip.tsx` meter animation replaced with proper signal simulation:
  - Exponential decay with `DECAY = 0.82` preserves signal momentum between ticks
  - Occasional transient bursts (~15% per channel) mimic audio transients
  - Peak hold logic: hold for ~2 seconds (40 ticks at 50ms) then slowly release at 0.97× per tick
  - Left and right channels are independent

**BT-8 — Music Insights: personalized from real analytics**
- `/api/analytics/music/insights` now runs `EXTRACT(DOW FROM date)` across the user's analytics to find their actual peak streaming day.
- Release strategy insight dynamically changes: "Your peak streaming day is Saturday — X% more than Friday" vs. "Your data confirms Fridays are your peak day."
- Growth rate computed from 30-day vs 60-day window.
- Revenue-per-listener and top platform surfaced for the monetization insight.
- `/api/analytics/music/release-strategy` also uses the computed best day and the user's release count to recommend optimal release frequency.

**BT-9 — advancedSocialAIService: seeded deterministic template selection**
- `seededIndex(seed, length)` added: FNV-1a hash of any string → deterministic array index.
- All `Math.floor(Math.random() * templates.length)` calls in `buildHook`, `buildEmotionalArcBody`, `buildCuriosityGapHook`, `generateBody` (body variants, emotional closers, urgency lines), and `generateCTA` now use `seededIndex` with context-specific seeds (artistName + topic + contentType).
- Same input → same template selection every time; different artist/topic → different selections.

**BT-10 — ChannelOverview: smooth realistic level animation**
- `ChannelOverview.tsx` master bus meter replaced with exponential interpolation:
  - Level converges toward `TARGET_BASE = -20 * volume` with `DECAY = 0.84`
  - Occasional burst resets (~12% chance) simulate musical transients
  - Full peak hold logic matching BT-7 behavior (40-tick hold, 0.97× release)

### Data Integrity Breakthroughs (Mar 2026) — Session 4

**BT-11 — autoPostGenerator: seeded deterministic template selection**
- `seededIndex(seed, length)` added (FNV-1a, identical to advancedSocialAIService pattern).
- All 8 `Math.floor(Math.random() * templates.length)` calls across `generateAwarenessHeadline`, `generateAwarenessBody`, `generateEngagementHeadline`, `generateEngagementBody`, `generateConversionHeadline`, `generateConversionBody`, `generateViralHeadline`, `generateViralBody` now use distinct context seeds: `"awareness-headline:${artist}:${topic}:${tone}"` etc.
- Same artist + topic + tone → same post template selection every time.

**BT-12 — custom-ai-engine: fully deterministic content pipeline**
- `seededIndex` + `seededShuffle` helpers added (FNV-1a PRNG, identical algorithm).
- `generateHook`: template pick + `{percentage}` value seeded from `${topic}:${hookType}`.
- `generateHashtags`: `sort(() => Math.random() - 0.5)` replaced with `seededShuffle` seeded from content + platform.
- `optimizeSocialPosting`: `bestPostingTime` seeded per platform; `selectContentFormat` seeded by platform + weight string.
- `selectHookType` fallback: seeded from sorted businessGoals.
- `buildContentFromTemplate`: emojiSet, emoji, and hook-from-template all seeded from `${topic}:${template.id}:${variationIndex}`.
- `selectCallToAction`: all three CTA branches seeded from `${template.id}:${sorted goals}`.
- `selectByWeight` (ML weighted template selector): deterministic seeded weighted selection replaces `Math.random() * adjustedTotal`; weights and recency penalties fully preserved; cursor position derived from `seededIndex(seed, 10000)`.
- `analyzeMusicTrack`: BPM, key, mood, confidence, genre all seeded from JSON-stringified audioData input.
- `selectGenreWithTrends`: `Math.random() > 0.5` trend/non-trend flip seeded from trends array; both branches use deterministic index.

**BT-13 — WaveformAudioPlayer: deterministic waveform visualization**
- Marketplace beat player was regenerating 100 random bar heights on every component mount, making the waveform visually different each load.
- Replaced with a seeded PRNG (FNV-1a seed init → xorshift iterations) seeded from `audioUrl || title || 'default'`.
- Same track URL → identical waveform shape every time. Different tracks → visually distinct shapes.

### Data Integrity Breakthroughs (Mar 2026) — Session 5

**BT-14 — batch.ts: 19 serial DB loops → Promise.allSettled parallel**
- Every batch API endpoint (releases, posts, files, marketplace, tracks, beats) was processing IDs one at a time in sequential `for (const id of ids) { await db... }` loops.
- Converted all 19 loops across 19 endpoints to `Promise.allSettled(ids.map(async (id) => { ... }))`.
- Pattern: throw on not-found → collect fulfilled IDs as successes, rejected reasons as failures, mapped by index.
- Affected endpoints: `/releases/submit`, `/releases/takedown`, `/releases/update`, `/releases/delete`, `/posts/schedule`, `/posts/delete`, `/posts/update`, `/posts/approve`, `/files/delete`, `/files/move`, `/files/download`, `/files/update`, `/marketplace/update`, `/marketplace/delete`, `/tracks/move`, `/tracks/tag`, `/tracks/delete`, `/beats/update`, `/beats/delete`.
- Tracks/tag (2-step read+update) and tracks/move (conditional no-op) both safely parallelized.

**BT-15 — contentVariantGenerator: seeded hashtag/hook/emotion/shuffle**
- `seededIndex` and `seededShuffle` (FNV-1a) added at module level.
- Hashtag fill loop: seeded from `${content.id || content.caption}:hashtag-fill:${set.length}`.
- Music tag shuffle: seeded from `${content.id || content.caption}:music-tags`.
- Hook template selection per type: seeded from `${content.id || content.caption}:hook:${type}`.
- Emotion word injection: seeded from `${text}:emotion`.
- `shuffleArray()` private method now delegates to `seededShuffle` (accepts optional seed param).

**BT-16 — image-generation.ts: seeded waveform + geometric patterns in generated images**
- Social media cover images regenerated random bar heights and 20 random line endpoints on every call.
- Both `addWaveformVisualization` and `addAIPatterns` now use inline FNV-1a seeded from `musicData.artist + ':' + musicData.title`.
- Waveform: each bar's height seeded from `${seed}:waveform:${barIndex}`.
- Pattern lines: each of 20 lines seeded from `${seed}:pattern:${i}:x1/y1/x2/y2`.
- Same artist + title → identical generated image every time.

**BT-17 — contentQualityPipeline: seeded template picker in generateContentByStrategy**
- Local `rnd(arr)` helper used `Math.random()` to pick among template arrays by strategy (storytelling, announcement, teaser, milestone, journey, question, poll-style, FOMO, controversy, viral, educational, CTA).
- Replaced with inline `seededIndex` seeded from `${artistName}:${topic}:${strategy}:${objective}`.
- Same artist + topic + strategy + objective → same template variant every time.

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
