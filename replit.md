# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive AI-powered platform designed to empower musicians, producers, and labels with tools for music production, distribution, social media management, a beat marketplace, and advanced analytics. Its core purpose is to streamline the music career management process, offering features from AI-assisted audio creation to global distribution and detailed performance tracking. The platform aims to be a one-stop solution for artists looking to grow their careers and maximize their market potential.

## Recent Changes
- **2026-01-09**: Imported from GitHub, configured all APIs (Stripe, SendGrid, LabelGrid, social media OAuth, Redis, Sentry), set up database, initialized admin account with lifetime subscription
- **2026-01-09**: Phase 1 Project Discovery completed - mapped 45+ pages, 1,150+ endpoints, 75 route files

---

## PHASE 1 PROJECT DISCOVERY MAP (2026-01-09)

### Entry Points
| Type | Path | Purpose |
|------|------|---------|
| Backend | `server/index.ts` | Main Express.js server |
| Frontend | `client/src/main.tsx` | React SPA entry point |
| Electron | `electron/main.js` | Desktop app entry |
| Build | `script/build.ts` | Production build script |

### System Statistics
- **Total Pages**: 45+ pages/views
- **Total Endpoints**: ~1,150 (1,045 in route modules + 105 in routes.ts)
- **Route Files**: 75 files in `server/routes/`
- **Frontend Components**: 200+ React components

### Page Inventory (45 Pages)
**Public Pages**: Landing, Login, Register, RegisterPayment, RegisterSuccess, Terms, Privacy, Pricing, About, Features, Documentation, API, Blog, SoloFounderStory, SecurityPage, DMCA, ForgotPassword, DesktopApp, not-found

**Authenticated Pages**: Dashboard, SimplifiedDashboard, Onboarding, Settings, Analytics (+ 6 sub-views), Studio, Distribution, Royalties, SocialMedia, Advertisement, Marketplace, Storefront, ProducerProfilePage, Projects, Help, DeveloperApi, Subscribe, ShowPage

**Admin Pages**: Admin, AdminDashboard, AdminAutonomy, admin/SecurityDashboard, admin/SupportDashboard

### Endpoint Domain Categories
| Domain | Route Files | Est. Endpoints |
|--------|-------------|----------------|
| Auth/Core | routes.ts | ~105 |
| Social Media | socialMedia, socialOAuth, socialApprovals, socialBulk, socialAI, autonomousSocial | ~150 |
| Distribution | distribution, releaseCountdown, storefront | ~80 |
| Studio/DAW | studio, studioComping, studioMarkers, studioPlugins, studioStems, studioWarping, studioGeneration, studioMidi, vstBridge, audioAnalysis, content-analysis | ~200 |
| AI/Automation | ai, autopilot, autopilot-coordinator, autopilot-learning, advertisingAutopilot, dualAutopilot, autoUpdates, careerCoach | ~150 |
| Billing/Payments | billing, payouts, invoices, kyc | ~60 |
| Admin/Monitoring | admin, adminMetrics, executiveDashboard, audit, logs, monitoring, security, killSwitch | ~100 |
| Analytics | analytics, certifiedAnalytics, analyticsAlerts, artistProgress, revenueForecast, v1Analytics | ~80 |
| Growth/Advertising | growth, organic, advertising | ~60 |
| Marketplace | marketplace, contracts, promotionalTools | ~50 |
| Collaboration | collaborations, workspace | ~40 |
| Support | helpDesk, support | ~30 |
| Infrastructure | reliability-endpoints, backup, offline, simulation, selfHealingApi, testing, developerApi | ~45 |

### Shared Module Inventory
- **ML Models** (`shared/ml/models/`): 18 AI models including GenreClassification, BPMDetection, ChurnPrediction, EngagementPrediction, Recommendation, TimeSeries, Advertising/Social Autopilot
- **Audio Processing** (`shared/ml/audio/`): AIAudioGenerator, IntelligentMasteringEngine, AudioFeatureExtractor, SynthesizerEngine, PatternGenerator
- **NLP** (`shared/ml/nlp/`): ContentGenerator, SentimentAnalyzer
- **Coordination** (`shared/ml/coordination/`): AutopilotCoordinator, AdvertisingRuleEngine, SocialMediaRuleEngine, FeatureStore
- **Video** (`shared/video/`): VideoRendererEngine (WebGL-based)
- **Schema** (`shared/schema.ts`): Drizzle ORM database schema - DO NOT MODIFY

### Server Infrastructure
- **Middleware** (`server/middleware/`): 22 middleware modules
- **Services** (`server/services/`): 50+ service modules
- **Safety** (`server/safety/`): Security and safety modules
- **Reliability** (`server/reliability/`): Database resilience, memory management, process monitoring
- **Monitoring** (`server/monitoring/`): Metrics, alerting, capacity monitoring

### Test Coverage
| Type | Location | Description |
|------|----------|-------------|
| Unit | `tests/unit/` | Basic unit tests |
| Integration | `tests/integration/` | Stripe verification |
| Load | `tests/load/` | Load testing |
| Smoke | `tests/smoke/` | Post-deployment tests |
| Chaos | `tests/chaos/` | Worker crash testing |
| Burn-in | `tests/burn-in/` | 24-hour stability tests |

### Extended Discovery (Workers, Simulations, Services)

**Workers** (`server/workers/`):
- `index.ts` - Worker orchestration
- `weeklyInsightsCron.ts` - Scheduled insights delivery

**Simulations** (`server/simulations/`):
- `adBoosterSimulation.ts` - Ad campaign simulations
- `autonomousUpgradeSimulation.ts` - Auto-upgrade testing
- `realLifeSimulation.ts` - Lifecycle simulations
- `runSimulation.ts`, `runLifecycleSimulation.ts` - Simulation runners

**Services** (`server/services/`): 130+ service files covering:
- Audio/DSP: 20+ audio processing engines (compressor, reverb, EQ, synth, vocals, etc.)
- AI: aiService, aiModelManager, aiAudioGeneratorService, aiContentService, careerCoachService
- Distribution: distributionService, labelGridService, ddexPackageService, dspPolicyChecker
- Social: socialService, socialQueueService, socialOAuthService, socialListeningService
- Payments: stripeService, payoutService, invoiceService, instantPayoutService
- Studio: studioService, pluginHostService, stemExportService, midiGeneratorService
- Analytics: advancedAnalyticsService, analyticsAlertService, dspAnalyticsService
- Security: securityService, selfHealingSecurityEngine, rbacService

**Pocket Dimensions** (`pocket-dimensions/`):
- Local file storage for user chunks and simulation data
- 14+ user storage directories with encrypted chunks

**Migrations** (`migrations/`):
- 10+ Drizzle migration files
- Proper versioned schema evolution with snapshots

### Evidence-Based Structural Risks
1. **Monolithic routes.ts** (3121 lines) - Contains 105+ core auth/user endpoints in single file; should be split into auth/, user/, storage/ route modules
2. **Legacy duplicate src/ directory** - `src/` contains duplicate components from `client/src/` - potential source of confusion and dead code
3. **Dynamic import fragility** - `registerRoutes()` loads 70+ route modules via dynamic imports with try/catch fallbacks; any failed import degrades silently
4. **Sparse automated test coverage** - Only 7 test files covering basic scenarios; no comprehensive endpoint testing for 1,150+ endpoints
5. **Local file storage in pocket-dimensions/** - Production should use object storage, not local filesystem

---

## PHASE 2 SCOPE FREEZE (2026-01-09)

### MVP Core Features (Launch Requirements)
The following 14 feature domains are REQUIRED for production launch:

| Priority | Feature | Routes | Status | Description |
|----------|---------|--------|--------|-------------|
| P0 | **Auth & User Management** | routes.ts | Core | Login, register, sessions, 2FA, password reset |
| P0 | **Dashboard** | /dashboard | Core | Overview metrics, AI career coach, revenue forecast |
| P0 | **Settings & Profile** | /settings | Core | User profile, preferences, notifications, security settings |
| P0 | **Onboarding** | /onboarding | Core | First-time user experience, account setup wizard |
| P0 | **Projects** | /projects | Core | Project creation, management, workspace organization |
| P0 | **Studio (DAW)** | /studio | Core | Music production, mixing, mastering, plugins |
| P0 | **Distribution** | /distribution | Core | Release wizard, DSP uploads, ISRC management |
| P0 | **Billing & Payments** | billing.ts | Core | Stripe subscriptions, invoices, payouts |
| P0 | **Admin Panel** | /admin | Core | User management, security dashboard, monitoring |
| P1 | **Analytics** | /analytics | Essential | Performance tracking, AI insights, charts |
| P1 | **Social Media** | /social-media | Essential | Platform connections, scheduling, content calendar |
| P1 | **Marketplace** | /marketplace | Essential | Beat store, producer profiles, licensing |
| P1 | **Royalties** | /royalties | Essential | Royalty tracking, splits, reconciliation |
| P1 | **Support & Helpdesk** | /help | Essential | Ticket system, AI assistant, knowledge base |
| P2 | **Advertising** | /advertising | Enhance | Paid ad campaigns, ROAS tracking |

### Features to DEFER (Post-Launch)
- Desktop App (Electron) - Focus on web-first
- Developer API marketplace - Limited demand initially
- Competitor benchmarking - Nice-to-have
- Advanced AI content generation - High resource usage

### Subscription Tiers
| Tier | Monthly | Features |
|------|---------|----------|
| Free | $0 | Basic dashboard, 3 projects, limited analytics |
| Monthly | $29/mo | Full access, unlimited projects |
| Yearly | $249/yr | Full access + priority support |
| Lifetime | $999 | All features forever |

### Launch Checklist (Phase 2 Exit Criteria)
- [ ] All P0 features fully functional with no critical bugs
- [ ] All P1 features functional with minor issues acceptable
- [ ] Authentication working with session management
- [ ] Payment processing (Stripe) tested with real transactions
- [ ] Email delivery (SendGrid) verified
- [ ] Distribution integration (LabelGrid) operational
- [ ] Social OAuth for all major platforms working
- [ ] Admin panel accessible and functional
- [ ] Error logging (Sentry) capturing exceptions
- [ ] Mobile responsive design verified

---

## User Preferences
I prefer clear and concise communication.
I value iterative development and frequent updates.
I like detailed explanations for complex features.
Do not make changes to folder `shared/`.
Do not make changes to file `shared/schema.ts`.
Prioritize robust, scalable, and secure solutions.
When making changes, always consider the impact on performance and user experience.
Always ask for confirmation before making significant architectural changes or adding new external dependencies.

## System Architecture
Max Booster is built with a modern web stack, featuring a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui for a consistent and responsive user interface. The backend is an Express.js application also written in TypeScript, ensuring type safety across the full stack. Data persistence is handled by PostgreSQL with Drizzle ORM, and Redis Cloud is used for session management and distributed tasks.

### UI/UX Decisions
The frontend leverages shadcn/ui components to provide a modern and accessible user experience. Design patterns focus on intuitive workflows for music production, social media scheduling, and data visualization in dashboards. Specific UI components include an AI Studio with real-time spectral processing, Studio One-style DAW elements, and advanced search filters for the marketplace. The platform aims for a clean, professional aesthetic.

### Technical Implementations
- **AI Studio**: Features real-time spectral editing, advanced modulation capabilities, analog warmth processing, and real-time collaboration. It supports plugin hosting and integrates with professional audio services for LUFS normalization, streaming target compliance, and audio metadata extraction.
- **Video Creation**: An in-house WebGL render engine allows for custom video generation with various shaders, audio visualizers, lyric engines, and text animators. It supports promo templates and automatic optimization for different social media platforms.
- **Distribution**: Integrates with LabelGrid for global music distribution, offering SLA tracking, Content ID registration, sync licensing opportunities, and automated royalty splits. It maintains a local DSP catalog and validates releases against platform-specific requirements.
- **Social Media Management**: Provides approval workflows, bulk scheduling, a unified inbox, competitor benchmarking, and social listening tools, with OAuth connections to major social platforms. Token management includes encryption, proactive refreshing, and revoked token detection.
- **Beat Marketplace**: Features license templates, customizable storefront themes, advanced search functionalities, and producer analytics. It supports zero-commission checkout via Stripe Connect.
- **Analytics Dashboard**: Offers multi-platform data ingestion (Spotify, Apple Music, YouTube, TikTok, Instagram), playlist tracking, trigger city detection, cross-platform performance comparison, and an alert system for key milestones.
- **Payment & Billing**: Implements Stripe Connect for split payments and instant payouts with risk assessment, a comprehensive ledger, automated PDF invoicing, and robust refund/dispute handling.
- **User Retention**: Incorporates features like a "First Week Success Path" for guided onboarding, progressive feature discovery, an achievement system, an AI career coach, revenue forecasting, and a release countdown hub.
- **Security Hardening**: Includes comprehensive security measures such as session fixation prevention, password change session invalidation, circuit breakers for external services, webhook idempotency, rate limiting, token encryption, input validation, and robust error handling across all modules.

### System Design Choices
- **Microservices-oriented (conceptual)**: The backend is structured into distinct services (e.g., distributionService, competitorBenchmarkService) to encapsulate business logic and promote maintainability.
- **Robust Error Handling**: Implementations include try-catch wrappers for user input, retries for external API rate limits (e.g., LabelGrid), circuit breakers for critical services, and comprehensive validation at various layers.
- **Scalability**: Utilizes Redis for session and queue management, and asynchronous file operations to prevent blocking. Memory safeguards and timeouts are implemented for audio processing.
- **Data Integrity**: Drizzle ORM with strict schema validation ensures data consistency, complemented by comprehensive input validation for all API endpoints.

## External Dependencies
- **Stripe**: For payment processing, including Stripe Connect for split payments and instant payouts.
- **SendGrid**: For transactional email delivery, including weekly insights emails.
- **Redis Cloud**: Used for session storage, caching, and managing distributed tasks like rate limiting.
- **Sentry**: For error tracking and monitoring.
- **LabelGrid**: Integrated for music distribution, content ID, and sync licensing services.
- **Replit Object Storage**: Utilized for storing file assets.
- **Social Media APIs**: Integrations with Twitter, Facebook, Instagram, TikTok, YouTube, and LinkedIn for social media management features.
- **music-metadata library**: For audio metadata extraction.
- **Y.js**: For real-time collaboration features in the AI Studio.