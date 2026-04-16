# Max Booster - AI-Powered Music Career Management Platform

## Professional Artist Audit — Completed Upgrades (2026-04)
- **Dashboard / Shows / Settings / Collaborations / FanHub / CareerCoach** — all audited and polished (previous sessions).
- **Marketplace bottom player bar** — Replaced plain white bar with dark glassmorphism player: cover art + animated EQ bars when playing, gradient seek-progress bar spanning full width, BPM/key/genre badges, large gradient play button, ±10 s skip buttons, 60-bar waveform visualization, volume slider, share button.
- **Marketplace genre quick-filter chips** — Horizontal scrollable chip strip of all 22 genres above the tabs; click to filter, click again to clear.
- **Studio transport LCD display** — Dark inset LCD panel for time readout (emerald-glow monospace), amber LCD BPM input, dark-panel time-signature display.
- **Studio Master Volume** — Slider in the transport bar right section, wired to `masterTrack.volume` via the store + audioEngine; color-coded readout (green/yellow/red).
- **Studio track header volume/pan** — Compact horizontal volume slider + pan dot in each track header (visible when not collapsed); clicking the pan dot resets pan to center.
- **Studio empty track state** — Professional "Start Your Session" empty state with quick-add buttons for Audio / Instrument / MIDI / Bus track types.

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design and a Studio DAW-like interface with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector.

The core of the system is a "Triangle Architecture" data flow: Max Booster pushes all data exclusively to PDIM, MaxCore training server pulls training data from PDIM, and Max Booster pulls trained model weights from MaxCore for inference. PDIM serves as the ONLY unified storage backend, functioning as both a Redis-compatible layer and a persistent object storage system with level-9 Gzip compression and SHA-256 content-addressed deduplication.

Key architectural decisions include:
- All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. MaxCore (`secure-ai-forge.replit.app`) is the sole AI source across all endpoints.
- Microservices-like logical separation within the monorepo for scalability, designed for Replit Autoscale with PDIM (`pocketdimensionstorage.replit.app`) as the shared-state backend.
- Robust authentication with session fixation prevention, JWTs with refresh, and session heartbeat.
- Comprehensive workflow automations managed by `musicWorkflowAutomationService.ts`, and a Unified Content Orchestration System for all content generation.
- Custom in-house AI models exclusively used for Advertisement and Autopilot Systems, integrating an advanced AI Content Stack (v2, v3, v4) for social content and songwriting.
- A Multimodal Content Generation System via `server/services/multimodalGenerationService.ts` orchestrates text, image, audio, and video generation, all calling MaxCore.
- Video Generation Engine: `advancedVideoRendererService.ts` is MaxCore-only.
- Voice Synthesis Engine (`voiceSynthesisService.ts`) offering 14 distinct voice profiles using FFmpeg processing chains.
- Python Audio Analysis Engine using `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch`.
- Beat Audio Separator (`server/services/audioSeparator.py` + `server/services/audioSeparatorService.ts`) for generating MP3s and frequency-band stems from uploaded WAV beats.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing, including a `dns-os/` monorepo for a fully self-hosted DNS provider.
- Built-in Authoritative DNS Server (`server/services/dnsServer.ts`) using `dns2` for `maxboostermusic.com` subdomains.
- Built-in DNS Zone Manager (`server/routes/dnsManager.ts`) for users to manage custom domains and DNS records.
- **Domain Registrar System** (`server/routes/domainRegistrar.ts`, `server/services/domainRegistrarService.ts`): Full domain registrar experience backed by Namecheap reseller API. Artists search any name across 15 TLDs (.com, .music, .band, .studio, .io, etc.), claim domains included with their subscription, and get automatic NS configuration to `ns1/ns2.maxboostermusic.com`. `claimed_domains` DB table tracks all registered domains. Falls back to DNS-based availability checks when Namecheap credentials aren't configured. UI at `StorefrontDnsZoneManager.tsx` has three tabs: Find Domain (search + claim), My Domains (portfolio management), DNS Records (full zone editor).
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore.
- Seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- Three-Tier Video Diffusion Architecture: Max Booster → MaxCore Rendering Engine relay (port 8000, DiT-24 + DigitalGPU) → MaxCore AI Content Gateway (port 8008, continuous self-training DiT-24 UNetV4 LITE) → MaxCore (`secure-ai-forge.replit.app`).
- Performance hardening features include pagination, composite DB indexes, Neon PostgreSQL, request correlation IDs, server-side in-memory API cache (30s TTL, per-user, per-query, globally wired via `cacheMiddleware` / `invalidateCacheOnMutation`), Brotli compression middleware (`server/middleware/brotliCompression.ts`), browser caching for media, i18n lazy-loading, IndexedDB async query-cache persister, non-blocking Google Fonts loading, DNS resource hints for Stripe/Sentry/Neon, and production static caching.
- **Image upload canonical pattern**: All image uploads use `uploadImageFile(file, '/api/storage/upload', 'file')` for general images, `POST /api/auth/avatar` (field: `avatar`) for avatars. Rendering uses `SafeImg` component. Blob preview lifecycle managed via `createLocalPreview` / `revokeLocalPreview`. Fully standardized across: WelcomeFlow, WelcomeWizard, Advertisement, and Marketplace (new beat, edit beat, bulk-edit-pending, bulk-edit-uploaded, per-item bulk upload — both compact and expanded views). `getStableBlobUrl` WeakMap (memory leak) fully eliminated.
- **Beat marketplace cover art**: Server endpoints (`POST /api/marketplace/upload`, `PUT /api/marketplace/listings/:id`) accept `artworkUrl` text field (pre-uploaded URL) as alternative to multipart file. Client uploads cover art immediately on file select (upload-on-select), stores server URL in separate state, passes URL at form submission.
- **Marketplace storefront custom-domain security audit (2026-04)**: Four security gaps in `server/routes/storefrontDomains.ts` were resolved: (1) `DELETE /custom/detach/:domainId` now verifies that the domain's parent storefront is owned by the requesting user before deleting (was auth-only, no ownership check — any logged-in user could detach another user's domain); (2) `GET /dns/status` now requires authentication (was unauthenticated, leaked DNS server IP/port/state); (3) `GET /hosts/:host` now requires authentication (was unauthenticated, allowed enumeration of internal host→storefront routing table); (4) `POST /storefront/:storefrontId/attach-domain` now runs `validateDomain()` on the raw body value and passes only the normalized hostname to the service layer (previously skipped format validation before the service call). Domain input normalization (`stripDomainInput` — strips `https://`, trailing slashes, and paths) and the admin storefront canonical-URL auto-update were completed in the same audit cycle.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs`.
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.

## Platform Audit Changes (2026-04-16 Session 2)
AI Career Coach & UX polish pass:
- **Career Coach**: Full chat upgrade — loads persistent conversation history from `/api/assistant/history` on mount (no more blank state on revisit); quick-action chips rendered below AI responses so artists can follow up with one click; proactive suggestion pills shown as Zap tips; auto-scroll to bottom on new messages; "Clear conversation" trash button wired to `DELETE /api/assistant/history`; sidebar Quick Questions buttons now trigger actual AI chat questions (not dead buttons); input focuses automatically after AI responds
- **FanHub**: Export CSV, Add Tag dialog, CSV Import tab all verified working end-to-end
- **Collaborations**: Start a Project dialog fully wired with genre + description fields, POST /api/collaborations/projects
- **Shows**: Go Live button (red, animated pulse) per upcoming show navigates to `/show?id=&name=` with context; Edit dialog + Delete confirmation both functional
- **Settings**: Musical key dropdown confirmed to have all 24 keys (12 major + 12 minor)
- **Dashboard**: Quick Actions verified — Create New Project (mutation), Launch Campaign (/advertising), Distribute Music (/distribution), AI Content Optimization (paid-only)

## Platform Audit Changes (2026-04-16)
Professional artist UX audit and comprehensive improvements:
- **Sidebar Navigation**: Fixed duplicate icons (AI Insights → Sparkles, Career Coach → GraduationCap, Admin Security → ShieldAlert), added Video Generator page link (Clapperboard icon)
- **Press Kit (EPK)**: Working "Copy EPK Link" clipboard button with toast feedback; full public URL shown in visibility panel; "View Live" direct link when published; public EPK page at `/epk/:slug` (PublicPressKit.tsx) with clean design for promoters/press
- **Playlist Pitching**: 3-step onboarding empty state with actionable guidance; Conversion Rate stat card now shows a progress bar; curator search empty state
- **Sync Licensing**: Rich empty state with TV/Film/Ads/Gaming use-case cards + direct CTA; color-coded status badges (blue=available, yellow=submitted, orange=under review, green=licensed)
- **Publishing**: Rich empty state with PRO organization badges (ASCAP, BMI, SESAC, PRS, SOCAN, APRA) + direct CTA; color-coded status badges (green=confirmed, yellow=pending)
- **Merch Store**: Low Stock (≤5) and Out of Stock (0) warning badges on product cards; corrected reversed salePrice display (sale price now green, original crossed out)
- **i18n**: Added `navigation.videoGenerator` translation key