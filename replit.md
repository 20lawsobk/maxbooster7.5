# Max Booster - AI-Powered Music Career Management Platform

## Version
**Current Version**: 2.0.0 (January 2026)

## Overview
Max Booster is an AI-powered platform designed to empower musicians, producers, and labels by streamlining music career management. It offers tools for music production, global distribution, social media management, a beat marketplace, and advanced analytics. The platform's core purpose is to provide a comprehensive, one-stop solution for artists to grow their careers and maximize market potential, from AI-assisted audio creation to detailed performance tracking.

### Platform Availability
- **Web**: https://maxbooster.replit.app
- **Desktop**: Windows, macOS, Linux (Electron)
- **Mobile**: iOS, Android (Capacitor)

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
Max Booster is built with a modern web stack, featuring a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui for a consistent and responsive user interface. The backend is an Express.js application written in TypeScript. Data persistence is handled by PostgreSQL with Drizzle ORM, and Redis Cloud is used for session management and distributed tasks.

### UI/UX Decisions
The frontend leverages shadcn/ui components for a modern and accessible user experience, focusing on intuitive workflows for music production, social media scheduling, and data visualization. Key UI elements include an AI Studio with real-time spectral processing, DAW-like features, and advanced search filters for the marketplace, aiming for a clean, professional aesthetic.

### Technical Implementations
- **AI Studio**: Features real-time spectral editing, advanced modulation, analog warmth processing, real-time collaboration, plugin hosting, and integration with professional audio services for LUFS normalization and metadata extraction. Includes professional DAW interface matching industry standards (Ableton, Logic Pro, Pro Tools, Studio One).
  - **Professional Transport**: Punch in/out recording, pre-roll/count-in (0-4 bars), recording modes (Replace/Overdub/Stacked), input monitoring toggle
  - **Advanced Mixer Console**: Record arm, input monitoring, phase invert, 4 sends with pre/post fader options, bus assignments (Main Out, Bus 1-4, Group 1-2)
  - **Enhanced Timeline**: Snap grid visualization, range selection tool, split tool cursor, crossfade indicators, editing tool badge
  - **Automation Lanes**: Automation modes (OFF/READ/WRITE/TOUCH/LATCH), drawing tools (POINTER/PENCIL/LINE/CURVE), extended parameter support
  - **Inspector Panel**: Track properties (name, color, type, routing), clip properties (gain, pitch, time stretch, fades), quick automation controls
  - **Browser Panel**: Type/sort/favorites filter bar, localStorage persistence for favorites, waveform preview panel, debounced search
  - **Keyboard Shortcuts**: Tools (1-7), grid (g, G, n), panels (b, i, y), recording (p), automation modes (Alt+1-5)
- **Video Creation**: Utilizes an in-house WebGL render engine for custom video generation with shaders, audio visualizers, lyric engines, and text animators, supporting promo templates and optimization for social media.
- **Distribution**: Integrates with LabelGrid for global music distribution, including SLA tracking, Content ID registration, sync licensing, automated royalty splits, and local DSP catalog management.
- **Social Media Management**: Provides approval workflows, bulk scheduling, a unified inbox, competitor benchmarking, and social listening tools, with secure OAuth connections to major social platforms.
- **Beat Marketplace**: Features license templates, customizable storefronts, advanced search, producer analytics, and zero-commission checkout via Stripe Connect.
- **Analytics Dashboard**: Offers multi-platform data ingestion (Spotify, Apple Music, YouTube, TikTok, Instagram), playlist tracking, trigger city detection, cross-platform performance comparison, and an alert system.
- **Payment & Billing**: Implements Stripe Connect for split payments, instant payouts with risk assessment, automated PDF invoicing, and robust refund/dispute handling.
- **User Retention**: Incorporates guided onboarding ("First Week Success Path"), progressive feature discovery, an achievement system, an AI career coach, revenue forecasting, and a release countdown hub.
- **Security Hardening**: Includes session fixation prevention, password change session invalidation, circuit breakers for external services, webhook idempotency, rate limiting, token encryption, input validation, and robust error handling.

### System Design Choices
- **Microservices-oriented (conceptual)**: The backend is structured into distinct services to encapsulate business logic and promote maintainability.
- **Robust Error Handling**: Utilizes try-catch wrappers, retries for external API rate limits, circuit breakers for critical services, and comprehensive validation.
- **Scalability**: Achieved through Redis for session/queue management, asynchronous file operations, and memory safeguards for audio processing.
- **Data Integrity**: Ensured by Drizzle ORM with strict schema validation and comprehensive input validation for all API endpoints.

## External Dependencies
- **Stripe**: For payment processing, including Stripe Connect for split payments and instant payouts.
- **SendGrid**: For transactional email delivery and weekly insights emails.
- **Redis Cloud**: Used for session storage, caching, and managing distributed tasks like rate limiting.
- **Sentry**: For error tracking and monitoring.
- **LabelGrid**: Integrated for music distribution, content ID, and sync licensing services.
- **Replit Object Storage**: Utilized for storing file assets.
- **Social Media APIs**: Integrations with Twitter, Facebook, Instagram, TikTok, YouTube, and LinkedIn for social media management features.
- **music-metadata library**: For audio metadata extraction.
- **Y.js**: For real-time collaboration features in the AI Studio.

## Production Hardening Status (January 2026)

### Phase Completion Summary
| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Project Discovery & Mapping | ✅ Complete |
| Phase 2 | Core Feature Identification & Scope Freeze | ✅ Complete |
| Phase 3 | Architecture & Module Organization | ✅ Complete |
| Phase 4 | Test & Diagnostic Matrix | ✅ Complete |
| Phase 5 | Runtime Stability & Bug Elimination | ✅ Complete |
| Phase 6 | Error Handling, Logging & Observability | ✅ Complete |
| Phase 7 | State Management & Data Flow | ✅ Complete |
| Phase 8 | Performance & Responsiveness | ✅ Complete |
| Phase 9 | Security, Secrets & Dependency Safety | ✅ Complete |
| Phase 10 | Replit-Specific Hardening | ✅ Complete |
| Phase 11 | UX, Clarity & Polish | ✅ Complete |
| Phase 12 | Documentation & Handoff | ✅ Complete |

### System Metrics (Production Ready)
- **Database P95 Latency**: 21ms (excellent)
- **Slow Queries**: 0
- **Memory Usage**: 141MB / 1024MB warning threshold
- **Circuit Breakers**: 12/12 healthy
- **Error Rate**: 0%
- **Environment Variables**: All 18+ configured correctly

### Key Documentation Files
- `docs/MAX_BOOSTER_PRODUCTION_INSTRUCTIONS.md` - Complete workflow & action mapping (~1,181 endpoints)
- `docs/COMPLETE_TEST_MATRIX.md` - All 146 test cases across 19 categories
- `docs/PRODUCTION_READINESS_REPORT.md` - Final handoff document
- `docs/USER_WORKFLOWS_AND_ACTIONS.md` - User-facing workflow guide
- `docs/PHASE4_TEST_MATRIX.md` - Phase 4 test matrix with P0 verification
- `SYSTEMS_AND_FEATURES.md` - System documentation
- `scripts/pre-launch-check.ts` - Pre-deployment verification (30 checks)
- `tests/p0-verification.ts` - Automated P0 feature tests (12 tests)
- `tests/p0-verification-results.md` - P0 test execution results
- `tests/smoke/post-deployment-tests.ts` - Post-deployment validation

### System Statistics
- **Pages/Views**: 40
- **Route Files**: 75
- **Total Endpoints**: ~1,181
- **Service Files**: 176
- **Workflow Domains**: 22 categories
- **User Action Categories**: 12 categories
- **Test Cases**: 146 (15 automated, 131 manual)

### Admin Access
Admin credentials stored in environment variables:
- `ADMIN_EMAIL` - blawzmusic@gmail.com
- `ADMIN_USERNAME` - blawzmusic
- `ADMIN_PASSWORD` - (configured in environment)

### Storage Configuration
- **Provider**: Replit Object Storage
- **Bucket ID**: replit-objstore-e75041f4-5045-4b3b-a8c7-29bb5b43b9d4
- **Service**: `server/services/storageService.ts`

### KYC/Identity Verification Workflow
Complete end-to-end identity verification system for payout eligibility:

**User Flow:**
1. Type Selection - Choose Individual or Business verification
2. Information Entry - Submit personal/business details
3. Document Upload - Upload required documents (government ID, proof of address, selfie, etc.)
4. Review Submission - Submit for admin review

**Admin Flow:**
- Access via `/admin/kyc` or "KYC Verification Review" button on Admin page
- Filter by status (all, under_review, pending, verified, rejected)
- View uploaded documents securely
- Approve or reject verifications with notes/reasons

**Key Files:**
- `client/src/pages/Verification.tsx` - User verification form
- `client/src/pages/admin/KYCReview.tsx` - Admin review dashboard
- `server/routes/kyc.ts` - API endpoints
- `server/services/kycService.ts` - Business logic with ownership verification

**Security Features:**
- Server-side ownership verification for all user operations
- Admin authorization required for review endpoints
- Secure file uploads using multer with size limits (10MB)
- Server-generated storage paths (ignores client metadata)
- Allowed file types: JPG, PNG, PDF

### Configured Environment Variables
All 28 environment variables are properly configured:
- **Payment**: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
- **Email**: SENDGRID_API_KEY
- **Distribution**: LABELGRID_API_TOKEN
- **Social Media**: TWITTER_API_KEY/SECRET, FACEBOOK_APP_ID/SECRET, INSTAGRAM_APP_ID/SECRET, TIKTOK_CLIENT_KEY/SECRET, YOUTUBE_CLIENT_ID/SECRET, LINKEDIN_CLIENT_ID/SECRET, THREADS_APP_ID/SECRET
- **Google**: GOOGLE_CLIENT_ID/SECRET, GOOGLE_BUSINESS_CLIENT_ID/SECRET
- **Infrastructure**: DATABASE_URL, SESSION_SECRET, REDIS_URL, SENTRY_DSN
- **Admin**: ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD

## Build & Deployment

### GitHub Actions (Recommended for Production)
Production builds are handled by GitHub Actions for all platforms:

| Workflow | Trigger | Platforms |
|----------|---------|-----------|
| `build-desktop.yml` | Tag `v*` or manual | Windows, macOS, Linux |
| `build-mobile.yml` | Tag `v*` or manual | iOS, Android |

**To trigger a release build:**
```bash
git tag v2.0.1
git push origin v2.0.1
```

**Required secrets:** See `.github/SECRETS_SETUP.md`

### Local Build Scripts (Development/Testing)
| Command | Description |
|---------|-------------|
| `npm run build:desktop` | Build desktop apps for current OS |
| `npm run build:mobile` | Setup mobile apps (Capacitor) |
| `npm run build:apps` | Build all platforms locally |
| `npm run build:version` | Bump patch version |
| `npm run cap:sync` | Sync Capacitor projects |
| `npm run cap:ios` | Open iOS project in Xcode |
| `npm run cap:android` | Open Android project in Android Studio |

### Desktop Build Output
- **Windows**: NSIS Installer, Portable
- **macOS**: DMG, ZIP
- **Linux**: AppImage, DEB, tar.gz
- **Output Directory**: `dist-installers/`

### Mobile Build Output
- **Android**: Debug APK, Release APK, App Bundle (AAB)
- **iOS**: Debug Build, Release IPA

### Build Requirements
- **iOS**: macOS + Xcode 15+ (Apple Developer Account for distribution)
- **Android**: Android Studio Flamingo+ (Java 17)
- **Capacitor Version**: 8.x

### Build Configuration Files
- `electron/main.js` - Electron main process
- `electron/preload.js` - Electron preload script
- `capacitor.config.ts` - Capacitor configuration
- `scripts/build-apps.ts` - Unified build script
- `.github/workflows/build-desktop.yml` - Desktop CI/CD
- `.github/workflows/build-mobile.yml` - Mobile CI/CD
- `.github/SECRETS_SETUP.md` - Secrets documentation