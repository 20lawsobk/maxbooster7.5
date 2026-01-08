# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive music career management platform powered by AI. It provides tools for music production, distribution, social media management, marketplace, and analytics.

## Tech Stack
- **Frontend**: React 18 with TypeScript, Vite, TailwindCSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Build System**: Vite for frontend, tsx for server
- **Storage**: Replit Object Storage for file assets
- **Session Store**: Redis Cloud for distributed sessions
- **Payments**: Stripe (Connect for split payments, webhooks for events)
- **Email**: SendGrid for transactional emails
- **Monitoring**: Sentry for error tracking

## Project Structure
```
├── client/               # React frontend application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   │   ├── studio/   # AI Studio components (SpectralProcessor, ModulationMatrix, etc.)
│   │   │   │   └── studioone/    # Studio One-style DAW components (Jan 2026)
│   │   │   ├── marketplace/ # Marketplace components (AdvancedBeatSearch, ProducerAnalytics)
│   │   │   └── social/   # Social media components (UnifiedInbox, CompetitorBenchmark)
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utility libraries
│   │   ├── pages/        # Page components
│   │   └── i18n/         # Internationalization
├── server/               # Express backend
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   │   ├── distributionService.ts    # Distribution SLA, Content ID, sync licensing
│   │   ├── competitorBenchmarkService.ts # Social competitor analysis
│   │   ├── analyticsAlertService.ts  # Trigger cities, playlist tracking, alerts
│   │   ├── instantPayoutService.ts   # Risk-checked instant payouts with ledger
│   │   ├── invoiceService.ts         # Automated invoice generation
│   │   ├── audioNormalizationService.ts  # LUFS measurement, EBU R128, streaming targets
│   │   ├── audioMetadataService.ts   # Metadata extraction, distribution validation
│   │   └── waveformCacheService.ts   # Server-side waveform generation with caching
│   ├── middleware/       # Express middleware
│   ├── monitoring/       # System monitoring
│   └── safety/           # Security features
├── shared/               # Shared code between client/server
│   └── schema.ts         # Drizzle database schema (50+ tables)
├── migrations/           # Database migrations
└── public/               # Static assets
```

## Development
- **Start dev server**: `npm run dev` (runs on port 5000)
- **Database push**: `npm run db:push`
- **Build**: `npm run build`
- **Production**: `npm run start`

## Pre-Launch & Testing
- **Pre-launch check**: `npm run prelaunch` - Runs 16-point health verification
- **Security audit**: `npm run security:audit`
- **Load test**: `npm run test:load`
- **All tests**: `npm run test:all`
- **Launch runbook**: See `docs/LAUNCH_RUNBOOK.md` for launch day procedures

## Admin Account
- **Email**: blawzmusic@gmail.com
- **Password**: Iamadmin123!
- **Subscription**: Lifetime (full access to all features)

## Configuration
All environment variables are configured and validated at startup:

### Core Services (All Configured)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `REPLIT_BUCKET_ID` - Object storage bucket
- `STORAGE_PROVIDER` - Set to "replit" for Replit Object Storage

### External Services (All Configured)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` - Payment processing
- `SENDGRID_API_KEY` - Email delivery
- `REDIS_URL` - Redis for session storage and queues
- `SENTRY_DSN` - Error monitoring
- `TWITTER_API_KEY`, `TWITTER_API_SECRET` - Twitter integration
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` - Facebook integration
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` - Instagram integration
- `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` - TikTok integration
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` - YouTube integration
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` - LinkedIn integration
- `LABELGRID_API_KEY` - LabelGrid distribution integration

## Production-Ready Features

### AI Studio
- **SpectralProcessor**: Real-time spectral editing with FFT visualization
- **ModulationMatrix**: LFO routing, envelope followers, step sequencers
- **AnalogWarmthProcessor**: Tube saturation, tape simulation, vinyl characteristics
- **SessionStateBus**: Session-wide state management with real-time sync
- Plugin hosting with VST3/AU support via bridge
- Real-time collaboration with Y.js and WebSocket

### Professional Audio Services (Jan 2026)
- **LUFS Normalization**: EBU R128 loudness measurement with K-weighting, gating, and true peak detection
- **Streaming Targets**: Spotify (-14 LUFS), Apple Music (-16 LUFS), YouTube (-14 LUFS), Tidal, Amazon, Deezer
- **Broadcast Standards**: EBU R128 (-23 LUFS), ATSC A/85 (-24 LUFS), ARIB (-24 LUFS)
- **Metadata Extraction**: Full ID3/Vorbis/APE tag support via music-metadata library
- **Distribution Validation**: Platform-specific requirements check (sample rate, bit depth, codec, duration)
- **Waveform Generation**: Server-side waveform with 24-hour caching (WAV files)
- **Accessible Audio Player**: WCAG 2.2 compliant with full keyboard navigation (Space/K/J/L/M/0-9/arrows)
- **File Upload Security**: 500MB limit, magic bytes validation, supports WAV/AIFF/FLAC/MP3/AAC/OGG/Opus/ALAC/CAF
- **Audio Analysis API**: `/api/audio-analysis/analyze-metadata`, `/analyze-loudness`, `/generate-waveform`, `/validate-distribution`

### Video Creation (Custom In-House, Integrated into Content Flows)
- **WebGL Render Engine**: OffscreenCanvas + WebGL2 with scene graph and layer compositing
- **Shader Library**: 13 GLSL shaders (particle systems, bloom, gradient, wave distortion, chromatic aberration, vignette, color grading, noise, blur, kaleidoscope, pixelate, glitch)
- **Audio Visualizers**: 4 types (spectrum bars, waveform, circular radial, particle physics) with 11 presets
- **Lyric Engine**: LRC/SRT parsing, karaoke-style animation, word-by-word highlight, 5 style presets
- **Text Animator**: Character/word animation, gradient text, glow, outline, shadow, text path (curved text)
- **Promo Templates**: 4 quick templates (Social Teaser, Release Promo, Quote Card, Lyric Video)
- **Video Export**: MediaRecorder API with WebM/MP4, 720p/1080p/4K, 24/30/60 fps
- **Platform Auto-Optimization**: Auto-selects aspect ratio based on platform (9:16 for TikTok/Reels, 16:9 for YouTube/Twitter, 1:1 for Instagram Feed)
- **Integration Points**:
  - Social Media page: Video format option in content generation (select "Video" format)
  - Advertisement page: Video creative generator in Creative AI tab
  - Autopilot: Video creation actions available in automation workflows

### Distribution (LabelGrid Integration)
- **LabelGrid API**: Handles releases, distribution submission, analytics, and royalties
- **Local DSP Catalog**: 53 platforms maintained locally, validated by LabelGrid during distribution
- **Architecture**: DSP catalog is reference data; LabelGrid validates platform support when submitting releases
- **SLA Tracking**: Delivery SLA with target dates and status monitoring
- **Content ID**: YouTube Content ID registration and claim management
- **Sync Licensing**: Licensing opportunities for film/TV/advertising
- **Royalty Splits**: Collaborator split management with automatic payouts
- **Pre-Save Campaigns**: Spotify/Apple Music pre-save with follower/save tracking
- **Platform Endpoints**: 
  - `GET /api/distribution/platforms` - Get all DSP providers from local catalog
  - `GET /api/distribution/platforms/status` - Check LabelGrid API and catalog status
  - `POST /api/distribution/platforms/verify` - Verify catalog integrity
- **Distribution Platforms** (fetched dynamically from LabelGrid, fallback to local catalog):
  - **Major Streaming**: Spotify (preferred), Apple Music, iTunes, Amazon Music, Tidal, Deezer, YouTube Music, Pandora, iHeartRadio, Napster
  - **Electronic/Indie**: Beatport (EDM), Juno Download, Bandcamp, SoundCloud, Audiomack, Traxsource
  - **China**: NetEase Cloud Music, QQ Music, Kugou, Kuwo, Kuaishou (Tencent ecosystem)
  - **India**: JioSaavn, Gaana
  - **Middle East/Africa**: Anghami, Boomplay
  - **Asia Pacific**: JOOX, KKBOX (Taiwan/HK), AWA (Japan), FLO (Korea), Melon (Korea)
  - **Russia**: Yandex Music, VK Music
  - **Latin America**: Claro Música, Trebel
  - **Social/Content ID**: TikTok, Meta Library (FB/IG), Instagram, Facebook, Snapchat, YouTube Content ID, Twitch, SoundExchange
  - **Niche/Lifestyle**: Peloton, Soundtrack Your Brand (B2B), Pretzel Rocks (streamer-safe), Roblox
  - **Additional Stores**: Amazon MP3, 7digital, Qobuz, MediaNet, Gracenote, Shazam, Tencent Music

### Social Media Management
- **Approval Workflows**: Draft → Pending Review → Approved → Scheduled → Published
- **Bulk Scheduling**: Schedule up to 500 posts across platforms with optimal timing
- **Unified Inbox**: Consolidated messages from all platforms with assignment
- **Competitor Benchmarking**: Track competitor metrics, share of voice analysis
- **Social Listening**: Real-time mentions, sentiment analysis, trending topics
- OAuth connection for Twitter, Facebook, Instagram, TikTok, YouTube, LinkedIn

### Beat Marketplace
- **License Templates**: Basic, Premium, Exclusive, Unlimited with contract generation
- **Storefront Themes**: 8 professional themes with custom branding
- **Advanced Search**: Filter by genre, BPM, key, mood, price range, tags
- **Producer Analytics**: Views, plays, sales, conversion rates, traffic sources
- Zero-commission checkout with Stripe Connect
- Custom storefronts with embeddable widgets

### Analytics Dashboard (Chartmetric-Inspired)
- **Multi-Platform Ingestion**: Spotify, Apple Music, YouTube, TikTok, Instagram
- **Playlist Tracking**: Adds/removes notifications for major playlists
- **Trigger Cities**: Regional hotspot detection with 50%+ growth threshold
- **Cross-Platform Comparison**: Side-by-side platform performance
- **Alert System**: Milestones, growth spikes, viral detection, decline warnings
- A&R tools with audience demographics and engagement metrics

### Payment/Billing
- **Split Payments**: Stripe Connect for automatic collaborator payouts
- **Instant Payouts**: Risk-assessed with velocity limits and fraud detection
- **Ledger Tracking**: Complete audit trail with balance snapshots
- **Invoicing**: Automated PDF invoice generation with status tracking
- **Refund Handling**: Webhooks for charge.refunded, disputes, chargebacks
- **Tax Documents**: 1099-K generation for qualifying sellers

### User Retention Features (NEW)
- **First Week Success Path**: Guided onboarding with XP points, task categories, and progress tracking
- **Progressive Feature Discovery**: Persona-based AI feature spotlights (artist/producer/label/manager) with contextual hints
- **PowerFeatureSpotlight Component**: Shows one key AI feature at a time based on user persona, resets when feature changes
- **ContextualFeatureHint Component**: Floating hints triggered after completing basic tasks (profile→AI generator, etc.)
- **AI Feature Milestones**: 3 dedicated onboarding tasks for AI Music Generator, Social Autopilot, Zero-Cost Advertising
- **Artist Progress Dashboard**: Visual career metrics with animated gauge, growth charts, milestone timeline
- **Achievement System**: 16+ achievements with tiers (bronze/silver/gold/platinum), confetti animations, leaderboard
- **AI Career Coach**: Personalized daily recommendations, gap analysis, SMART goal suggestions
- **Revenue Forecasting**: 3/6/12 month projections with confidence intervals, seasonality factors
- **Weekly Insights Email**: Automated Monday emails with stats, achievements, recommendations (SendGrid + cron)
- **Collaboration Network**: Artist connections, AI-powered matching, project management
- **Release Countdown Hub**: Pre-release campaign tracking with 20-task checklist, analytics

## API Routes Summary
The server loads 60+ API route modules including:
- `/api/distribution` - Music distribution management
- `/api/analytics` - Analytics and reporting
- `/api/marketplace` - Beat marketplace
- `/api/social/*` - Social media management
- `/api/billing` - Payments and billing
- `/api/payouts` - Payout management
- `/api/invoices` - Invoice generation
- `/api/analytics-alerts` - Alert and trigger city detection
- `/api/studio/*` - AI studio features
- `/api/admin/*` - Admin dashboard
- `/api/onboarding` - First Week Success Path
- `/api/achievements` - Achievement system and streaks
- `/api/artist-progress` - Career progress dashboard
- `/api/career-coach` - AI career recommendations
- `/api/revenue-forecast` - Earnings projections
- `/api/email-preferences` - Weekly insights settings
- `/api/collaborations` - Artist networking
- `/api/countdowns` - Release countdown hub

## Notes
- The server binds to 0.0.0.0:5000 for both frontend and API
- Vite is configured with `allowedHosts: true` for Replit proxy compatibility
- In production, the frontend is served from `dist/public`
- All autonomous systems (auto-posting, automation engine, autopilot) start automatically
- Background workers for audio, CSV, analytics, and email processing are active
- Circuit breakers protect external service calls (Stripe, SendGrid, social APIs)
