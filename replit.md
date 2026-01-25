# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered platform designed to empower musicians, producers, and labels by streamlining music career management. It offers tools for music production, global distribution, social media management, a beat marketplace, and advanced analytics. The platform's core purpose is to provide a comprehensive, one-stop solution for artists to grow their careers and maximize market potential, from AI-assisted audio creation to detailed performance tracking.

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
Max Booster is built with a modern web stack, featuring a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui. The backend is an Express.js application written in TypeScript. Data persistence is handled by PostgreSQL with Drizzle ORM, and Redis Cloud is used for session management and distributed tasks.

### UI/UX Decisions
The frontend leverages shadcn/ui components for a modern and accessible user experience, focusing on intuitive workflows for music production, social media scheduling, and data visualization. The design incorporates concepts from professional DAWs like Studio One for features such as autoscroll modes, smart re-engagement, and "infinite" timeline bars, aiming for a clean, professional aesthetic.

### Responsive Layout System
The app uses a `ResponsiveLayout` component that automatically renders device-appropriate layouts:
- **Mobile**: Uses `MobileLayout` with bottom navigation, swipe gestures, and touch-optimized controls
- **Tablet**: Uses `TabletLayout` with split-pane layouts, multi-touch mixer, and floating action buttons
- **Desktop**: Uses standard `AppLayout` with sidebar navigation

Key responsive components:
- `client/src/components/layout/ResponsiveLayout.tsx` - Auto-switches between layouts
- `client/src/components/layout/MobileLayout.tsx` - Mobile wrapper with bottom nav
- `client/src/components/layout/TabletLayout.tsx` - Tablet wrapper with split panes
- `client/src/components/mobile/MobileDashboard.tsx` - Touch-optimized dashboard
- `client/src/components/mobile/MobileStudio.tsx` - Simplified mobile DAW
- `client/src/components/tablet/TabletDashboard.tsx` - Multi-column tablet dashboard
- `client/src/components/tablet/TabletStudio.tsx` - Side-by-side track/timeline view

### PWA Features
- Install banner with 7-day dismissal (`client/src/components/pwa/InstallBanner.tsx`)
- Deep linking via `web+maxbooster://` protocol (`client/src/lib/deepLinks.ts`)
- Service worker with caching strategies (`client/public/sw.js`)
- External link opener with URL sanitization (`client/src/lib/externalLinks.ts`)

### Technical Implementations
- **AI Studio**: Features real-time spectral editing, advanced modulation, analog warmth processing, real-time collaboration (Y.js), plugin hosting, professional DAW interface with advanced transport controls, mixer console, enhanced timeline, automation lanes, inspector panel, and browser panel. Includes Studio One-style autoscroll modes (Turn Over, Continuous Centered, Continuous Left) with smart re-engagement, adaptive grid snapping based on zoom level, event sync points (yellow diamond markers), and translucent waveform mode for grid alignment visualization.
- **Video Creation**: Utilizes an in-house WebGL render engine for custom video generation with shaders, audio visualizers, lyric engines, and text animators.
- **Distribution**: Integrates with LabelGrid for global music distribution, SLA tracking, Content ID registration, sync licensing, and automated royalty splits.
- **Social Media Management**: Provides approval workflows, bulk scheduling, unified inbox, competitor benchmarking, and social listening tools via OAuth connections.
- **Beat Marketplace**: Features license templates, customizable storefronts, advanced search, producer analytics, and zero-commission checkout via Stripe Connect.
- **Analytics Dashboard**: Offers multi-platform data ingestion (Spotify, Apple Music, YouTube, TikTok, Instagram), playlist tracking, trigger city detection, and cross-platform performance comparison.
- **Payment & Billing**: Implements Stripe Connect for split payments, instant payouts, automated PDF invoicing, and dispute handling.
- **User Retention**: Incorporates guided onboarding, progressive feature discovery, an achievement system, and an AI career coach.
- **Security Hardening**: Includes session fixation prevention, password change session invalidation, circuit breakers, webhook idempotency, rate limiting, token encryption, and input validation.
- **KYC/Identity Verification**: Provides an end-to-end workflow for users to submit identity documents and for admins to review and approve/reject verifications securely.

### System Design Choices
- **Microservices-oriented (conceptual)**: The backend is structured into distinct services to encapsulate business logic.
- **Robust Error Handling**: Utilizes try-catch wrappers, retries for external APIs, circuit breakers, and comprehensive validation.
- **Scalability**: Achieved through Redis for session/queue management, asynchronous operations, and memory safeguards.
- **Data Integrity**: Ensured by Drizzle ORM with strict schema validation and comprehensive input validation.

## External Dependencies
- **Stripe**: Payment processing, including Stripe Connect.
- **SendGrid**: Transactional email delivery.
- **Redis Cloud**: Session storage, caching, and distributed task management.
- **Sentry**: Error tracking and monitoring.
- **LabelGrid**: Music distribution, content ID, and sync licensing.
- **Replit Object Storage**: File asset storage.
- **Meta Graph API**: Unified Facebook and Instagram integration via single Meta OAuth.
- **music-metadata library**: Audio metadata extraction.
- **Y.js**: Real-time collaboration in the AI Studio.

## Social Media OAuth Configuration

### Overview
The platform uses a single unified Meta OAuth connection for Facebook and Instagram. All OAuth flows use secure token encryption and automatic refresh.

### Configured Platforms

| Platform | OAuth Type | Key Environment Variables | Callback URL |
|----------|-----------|---------------------------|--------------|
| Meta (Facebook + Instagram) | OAuth 2.0 | FACEBOOK_APP_ID, FACEBOOK_APP_SECRET | /auth/meta/callback |

### Developer Portal Setup Requirements

**Base Callback URL**: `https://maxbooster.replit.app`

#### Meta (Facebook + Instagram) (developers.facebook.com)
- Create Business App in Meta Developer Dashboard
- Add Facebook Login and Instagram Graph API products
- Add `maxbooster.replit.app` to App Domains
- Redirect URI: `https://maxbooster.replit.app/auth/meta/callback`
- Scopes: `public_profile email pages_show_list pages_read_engagement pages_manage_posts pages_read_user_content business_management instagram_basic instagram_content_publish instagram_manage_comments instagram_manage_insights`

### Token Management
- Access tokens are encrypted at rest using AES-256-GCM
- Automatic token refresh runs every minute for tokens expiring within 5 minutes
- Revoked tokens are automatically detected and users are prompted to reconnect

### Implementation Files
- `server/routes/socialOAuth.ts` - OAuth routes and callback handlers
- `server/services/socialOAuthService.ts` - Token encryption/refresh service
- `server/platform-apis.ts` - Platform-specific posting and analytics APIs
- `client/src/components/social/platform-connections.tsx` - Frontend connection UI

## HyperLearning Engine - 3x Human Learning Capacity

### Overview
The HyperLearning Engine is an advanced AI-powered learning system that analyzes social media performance at least 3x faster than human capability. It operates 24/7 without breaks, detecting subtle patterns humans would miss.

### Key Capabilities (3x Human Learning)

| Capability | Human Analyst | HyperLearning Engine |
|------------|---------------|---------------------|
| Patterns per hour | ~3 | 50+ |
| Dimensions analyzed | 5 | 15+ |
| Work hours per day | 8 | 24 |
| Break required | Yes | No |
| Cross-platform synthesis | Sequential | Parallel |
| Micro-pattern detection | Limited | 15+ pattern types |

### Learning Dimensions

**Micro-Pattern Detection** (15+ types):
1. Character count optimization
2. Emoji density and placement
3. Hashtag position analysis
4. Timing precision (minute-level)
5. Hook structure patterns
6. Line break optimization
7. Punctuation impact
8. Number usage patterns
9. CTA placement effectiveness
10. Sentiment correlation
11. Word frequency analysis
12. Temporal micro-patterns
13. Media type correlations
14. Audience response patterns
15. Virality precursors

**Cross-Platform Synthesis**:
- Identifies universal patterns that work across all platforms
- Creates platform-specific amplifiers for maximum impact
- Builds optimal content matrices combining multiple dimensions
- Models audience behavior across time zones and demographics

**Predictive Modeling**:
- Timing predictions (optimal hour/day combinations)
- Content predictions (hook + length + emoji optimization)
- Composite predictions (combined timing + content)
- Confidence scoring for each prediction

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/autopilot/learning/hyper/status | Get HyperLearning engine status |
| GET /api/autopilot/learning/hyper/insights | Get AI-generated insights |
| GET /api/autopilot/learning/hyper/predict/:platform | Get optimal content predictions |
| GET /api/autopilot/learning/hyper/metrics | Get learning efficiency metrics |
| POST /api/autopilot/learning/hyper/start | Start the HyperLearning engine |
| POST /api/autopilot/learning/hyper/stop | Stop the HyperLearning engine |

### Implementation Files
- `server/services/hyperLearningEngine.ts` - Core HyperLearning engine
- `server/routes/autopilot-learning.ts` - API endpoints
- `server/autonomous-autopilot.ts` - Integration with autonomous posting