# Backend Services

185+ custom service files in `server/services/`. Every service is written in TypeScript and handles a specific domain. No external AI APIs are used — all intelligence is implemented in-house.

---

## Audio & Music Processing

### `aiMusicService.ts` — Core Audio AI (2,460 lines)
The primary audio intelligence engine, implemented entirely in TypeScript without any external AI APIs.

**Stem Separation**
- Separates audio into: vocals, drums, bass, melody, harmony
- Confidence scoring per stem
- FFT-based frequency domain analysis (FFT.js)

**Loudness Measurement (LUFS)**
- Integrates with FFmpeg for broadcast-standard loudness measurement
- Platform targets: Spotify (-14 LUFS), Apple Music (-16 LUFS), YouTube (-13 LUFS), Tidal (-14 LUFS), SoundCloud (-8 to -13 LUFS)

**Genre Preset System**
- Mixing and mastering presets for 20+ genres
- Per-genre EQ curves, compression settings, stereo width, saturation level

**Audio Analysis Features**
- BPM detection
- Musical key detection
- Mood analysis
- Energy, danceability, valence detection
- Spectral balance analysis
- Multiband compression settings

**Reference Track Analysis**
- Spectral profile extraction
- Dynamic range comparison
- Stereo width analysis
- Side-by-side matching suggestions

### `musicGenerationService.ts` — Generative Composition (573 lines)
Deterministic algorithmic music composition engine.

**Chord Progressions**: Generated from genre templates — Jazz (ii-V-I, tritone substitutions), Rock (I-IV-V), Pop (I-V-vi-IV), Blues (12-bar), Classical (authentic cadences), Electronic (modal)

**Melody Generation**: Scale-aware note selection, phrase repetition and variation, rhythmic diversity

**Technical**:
- All 24 major/minor keys with exact Hz frequencies (A4 = 440Hz)
- Seeded random number generation for reproducible output
- WAV synthesis via `wavefile` package
- Configurable sample rate and bit depth

### `audioFingerprint.ts` — Plagiarism Detection (519 lines)
Identifies duplicate and similar audio across the platform.

**Three Algorithms**:
- `chromaprint` — chroma-based fingerprinting
- `acoustid` — acoustic fingerprinting standard
- `maxbooster` — proprietary SHA-256 segment hashing

**Similarity Tiers**: Exact (≥0.98), Near Duplicate (≥0.90), Similar (≥0.75), Partial (≥0.50)

**Segment-Level Matching**: Detects when a user samples a portion of another track (not just full-song copies)

### `stemExportService.ts` — Professional Stem Export (988 lines)
- Formats: WAV, FLAC, MP3, AAC with configurable quality
- Sample rates: 8Hz – 192kHz
- Bit depths: 8, 16, 24, 32-bit
- Normalization options: peak, RMS, LUFS, or none
- Effect chain: include or bypass per stem
- ZIP bundling of multi-stem packages
- FFmpeg backend with fluent-ffmpeg interface

---

## Distribution & Platform Integration

### `distributionService.ts` — Multi-DSP Distribution (1,399 lines)
Delivers music to 150+ DSPs. Supports both live distribution (LabelGrid API) and demo mode.

**Release Workflow**: draft → packaging → submitted → processing → live

**Features**:
- DDEX metadata packaging
- Platform-specific delivery windows (Spotify: 7-day minimum, Apple: 14-day minimum)
- Content ID registration (YouTube monetization)
- Sync license management
- Pre-save campaign integration
- SLA tracking per platform

### `labelgrid-service.ts` — LabelGrid Integration (1,474 lines)
Direct integration with the LabelGrid distribution API:
- Submission to 150+ platforms
- Smart link generation
- ISRC/UPC assignment
- Publishing metadata (writers, publishers, IPIs, PRO codes: ASCAP, BMI, SESAC, GEMA, SACEM, PRS, JASRAC)
- Sync placement matching (film, TV, commercial, game)
- Circuit breaker protection for API reliability

### `releaseScheduler.ts` — Smart Scheduling (566 lines)
- Friday release optimization (industry standard)
- Platform-specific cutoff time management
- Timezone-aware release windows
- Pre-save campaign integration
- Countdown timer system

---

## Royalties & Payments

### `royaltyEngine.ts` — Global Royalty Calculator (887 lines)
The most complex financial service. Handles royalties across 20+ territories and 10+ DSPs.

**DSP Streaming Rates (per stream)**:
| DSP | Rate |
|---|---|
| Spotify | $0.003 |
| Apple Music | $0.010 |
| Tidal | $0.013 |
| Amazon | $0.004 |
| YouTube | $0.001 |
| Deezer | $0.006 |

**Royalty Types**: Streaming, Mechanical, Performance, Sync, Download

**Mechanical Statutory Rates** (per stream):
| Territory | Rate |
|---|---|
| US | $0.00091 |
| Canada | $0.00083 |
| UK | $0.00085 |
| EU | $0.00077 |

**Performance Royalties**: Split 50/50 publisher/writer via PROs (ASCAP, BMI, SESAC, GEMA, SACEM, PRS, JASRAC)

**Platform Fee Tiers**:
| Plan | Platform Fee | Distribution Fee |
|---|---|---|
| Free | 20% | 15% |
| Standard/Pro/Label/Enterprise | 0% | 0% |

**Distribution Models**: Pro-rata vs. user-centric streaming royalty calculation

### `instantPayoutService.ts` — Real-Time Payouts (1,504 lines)
- Stripe Connect for rapid (minutes) artist payouts
- Risk assessment before each payout:
  - 24-hour velocity: max 3 payouts, max $5,000
  - 7-day volume: max $10,000
- Ledger-based audit trail for every cent
- Collaborative split distribution
- Refund processing

### `recoupmentService.ts` — Advance Recoupment (717 lines)
Advanced waterfall recoupment system:
- **Modes**: Waterfall, pro-rata, oldest-first
- **Cross-collateralization**: Multiple advances sharing one recoupment pool
- **Milestones**: 25%, 50%, 75%, 90%, 100% recouped (with notifications)
- **Post-recoupment**: Automatic split ratio changes
- **Interest rates**: Configurable per advance
- **Deferral periods**: Grace periods before recoupment begins

---

## Analytics & Intelligence

### `aiInsightsEngine.ts` — AI Analytics (1,273 lines)
End-to-end analytics intelligence:

**Metric Forecasting**: 7/30/90-day predictions with confidence intervals using in-house time-series model

**Cohort Analysis**: Retention curves, LTV calculations, engagement by:
- Registration date cohorts
- Subscription plan cohorts
- Acquisition channel cohorts

**Churn Prediction**: Risk factors identified, risk score 0-100, intervention recommendations

**Anomaly Detection**: Statistical spike/drop detection with root cause analysis

**Narrative Insights**: Human-readable insight generation with action recommendations

### `advancedAnalyticsService.ts` — Multi-Platform Analytics (940 lines)
Aggregates data from 25+ platforms:
- Spotify, Apple Music, YouTube, Amazon, Tidal, Deezer, Pandora, SoundCloud, Shazam, TikTok, Instagram, Facebook, Twitter, Snapchat, Pinterest, SoundExchange, ASCAP, BMI, Pandora, iHeart, Sirius XM

**Special Features**:
- Playlist journey tracking (add date, position changes, removal)
- Sync placement impact analysis (stream lift, revenue lift per placement)
- Global artist ranking system
- "Trigger Cities" — cities where an artist is predicted to break out
- Natural Language query interpretation

### `analyticsAnomalyService.ts` — Anomaly Detection (404 lines)
- **Algorithm**: Z-score based spike and drop detection
- **Baselines**: 7-day and 30-day rolling windows
- **Severity thresholds**: Low (2σ), Medium (3σ), High (4σ), Critical (5σ)

### `viralScoring.ts` — Viral Prediction Engine (939 lines)
Predicts viral potential before a post goes live:

**Hook Pattern Detection** (12+ patterns): curiosity gap, urgency, relatability, controversy, social proof, exclusivity, challenge, nostalgia, fear of missing out, achievement, transformation, community

**Emotional Triggers** (25+): mind-blowing, shocking, life-changing, game-changer, must-watch, unbelievable, incredible, breakthrough, revolutionary, groundbreaking

**Music-Specific Keywords**: banger, fire, slaps, streams, royalties, label deal, chart, viral, collab, release, drop, exclusive

**Platform Multipliers**: TikTok (0.95), YouTube Shorts (0.88), Instagram Reels (0.82), Instagram (0.75), Twitter (0.68), Facebook (0.55), LinkedIn (0.45)

**Outputs**: Predicted engagement ranges (likes, shares, comments), A/B test recommendations, confidence scores

---

## AI Content Generation & Social

### `advancedSocialAIService.ts` — Social Content AI (1,349 lines)
In-house social media intelligence. Deep platform-specific knowledge base.

**Multi-variant generation** (for every post):
- Concise variant
- Question-based variant
- Urgency variant
- Storytelling variant
- Data-driven variant

**Audience Psychology**: Psychographic, demographic, and behavioral audience profiling for content tailoring

**Engagement Prediction**: 0–100 scale pre-posting score

**Optimal Timing**: Best days and hours per platform with timezone support

### `aiContentService.ts` — Multi-Format Content (1,756 lines)
- **Languages**: EN, ES, FR, DE, IT, PT, ZH, JA, KO, AR
- **Brand Voice Profiling**: Tone, emoji frequency, hashtag frequency, vocabulary complexity
- **A/B Variant Generation**: Multiple content versions for testing
- **Image Generation**: Via Sharp (production-ready, no Canvas dependency)
- **Model Versioning**: All AI inferences tracked with model ID and version

### `dynamicTrendsService.ts` — Real-Time Trends (438 lines)
- Genre hashtags: Hip-Hop, Trap, R&B, Pop, EDM, Afrobeats, Lo-Fi, Latin, Drill
- Platform trends: TikTok, Instagram, Twitter, YouTube
- Seasonal trends: New Year, Valentine's, Summer Vibes, Festival Season, Halloween, Year-End Wrapped
- Day-of-week trends: Monday Motivation, TBT, Friday New Music, Weekend Vibes
- 30-minute cache with automatic expiration

### `autoPostingService.ts` — Autonomous Publishing (728 lines)
- Viral prediction scoring before every post
- Platform OAuth token management
- Multi-platform parallelized posting
- Post status tracking: pending → posting → completed → failed
- Attribution: `social_autopilot`, `advertising_autopilot`, or `manual`

### `autopilotCoordinatorService.ts` — Multi-Autopilot Sync (529 lines)
Coordinates the Social and Advertising Autopilots:
- 2-hour minimum gap between posts on the same platform (spam prevention)
- Schedule conflict detection and resolution
- Shared insights: timing, content, audience, platform, engagement data
- Connected autopilot management

---

## Discovery Algorithm

### `discoveryAlgorithmService.ts` — Collaborative Filtering (592 lines)
Personalized beat recommendation engine with taste profile learning.

**Interaction Weights** (calibrated for music marketplace):
| Interaction | Weight |
|---|---|
| Exclusive purchase | 15.0 |
| Purchase | 12.0 |
| Like | 3.5 |
| Repeat play | 3.0 |
| Share | 2.5 |
| Download | 2.5 |
| Add to cart | 2.0 |
| Play | 1.0 |
| Preview | 0.4 |
| Skip | -0.8 |
| Hide | -2.0 |

**Completion Boost**: >85% completion = 1.5×, >65% = 1.2×, <25% bail = 0.5×

**Genre Trending Boost** (2024-2026 data):
| Genre | Boost |
|---|---|
| Afrobeats | 1.30 |
| Afropop | 1.25 |
| Drill | 1.22 |
| Trap | 1.20 |
| Hip-Hop | 1.18 |
| R&B | 1.15 |
| Lo-Fi | 1.08 |
| Latin | 1.10 |
| Pop | 1.08 |
| EDM | 1.05 |

**Cold-Start Handling**: New users receive curated starter recommendations before interaction data accumulates

**Diversity Injection**: Prevents filter bubbles by injecting outside-profile recommendations at a configurable rate

---

## Marketplace Services

### `marketplaceService.ts` — Beat Marketplace (1,112 lines)
**License Tier System**:
| License | Price | Rights | Streams | Copies |
|---|---|---|---|---|
| Basic | $29.99 | MP3, non-exclusive | 100K | 5K |
| Premium | $99.99 | WAV, non-exclusive, broadcast | 500K | 25K |
| Unlimited | $199.99 | WAV + stems, unlimited | Unlimited | Unlimited |
| Exclusive | $999.99 | Full ownership transfer | Unlimited | Unlimited |

**Order Flow**: payment intent → escrow → delivery → completion

### `studioService.ts` — DAW Project Management (1,071 lines)
- Multitrack project CRUD with nested schemas
- Audio and MIDI clip management (gain, fade in/out, take groups)
- Effect chain management per track (serialized plugin state)
- Automation data storage (parameter envelopes over time)
- Marker/cue point system
- Autosave with version snapshots
- Track freeze (cached pre-rendered audio)
- Template system for new projects

---

## Infrastructure Services

### `jwtAuthService.ts` — Token Management (243 lines)
- Access token: 15-minute TTL
- Refresh token: 30-day TTL, stored in PostgreSQL
- JTI (JWT ID): unique per token, revocable individually
- Token versioning: user-level version counter for mass invalidation
- Revoked token table: 24-hour retention for per-session logout

### `circuitBreaker.ts` — Fault Tolerance (399 lines)
State machine: CLOSED → OPEN → HALF_OPEN → CLOSED

Configuration defaults:
- Failure threshold: 5 failures
- Recovery threshold: 3 successes
- Minimum volume: 10 requests before circuit can open
- Timeout: 30 seconds before HALF_OPEN probe
- Call timeout: 10 seconds per individual call

Applied to: Stripe, SendGrid, LabelGrid API, Python AI microservice

### `queueService.ts` — BullMQ Job Processing (238 lines)
Redis-backed job queues with:
- Dead-letter queue (DLQ) for permanently failed jobs
- Exponential backoff retry (3 attempts)
- Auto-cleanup (500 completed, 200 failed retained)
- Type-safe job payloads for all job types

### `notificationService.ts` — Multi-Channel Notifications (809 lines)
Three simultaneous delivery channels:
1. **Email** (SendGrid) — HTML templates, per-type preferences
2. **Web Push** (VAPID) — Browser notifications with action buttons
3. **WebSocket** — Real-time in-app notifications

Notification types: releases, earnings, sales, marketing, system

Per-user preferences: opt-in/out per notification type

### `complianceService.ts` — SOC2/ISO27001/GDPR (804 lines)
- Control assessment: Implemented / Partial / Planned
- Gap analysis with priority-ranked remediation
- Evidence tracking with expiration dates
- Certification readiness scoring
- Executive report generation

### `userPocketDimensionService.ts` — Encrypted User Storage (313 lines)
- 5GB default quota
- AES-256 encryption (key = PBKDF2(userId + email))
- Zlib level-9 compression
- 1MB chunk storage
- Content deduplication
- Auto-initialized folder structure
