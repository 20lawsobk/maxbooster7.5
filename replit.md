# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an enterprise-level AI-powered music career management platform designed to revolutionize music career management. It integrates browser-based DAW capabilities, music distribution, a marketplace, social media management, and comprehensive analytics. The platform aims to empower artists and music professionals with AI-driven tools for growth and efficiency, all under the B-Lawz Music brand.

## User Preferences
- B-Lawz Music branding with custom anime character logo
- Modern dark/light theme support
- Professional enterprise UI design
- All dialog menus must have solid, non-transparent backgrounds

## System Architecture
Max Booster employs a hybrid rule-based and ML autopilot architecture for its social media and advertising functionalities, combining deterministic rules with machine learning for optimal performance and adherence to platform guidelines. The platform features 9 operational autonomous systems for 24/7 operations, content generation, updates, and more. A self-healing security system detects and responds to threats 10 times faster than typical attack vectors. The Advertisement Autopilot leverages connected social media profiles as a "Personal Ad Network" to achieve the results of paid advertising organically, saving artists significant ad spend.

**Key Features:**
-   **Authentication:** Session-based with bcrypt.
-   **Distribution:** DDEX packaging, ISRC/UPC generation, catalog imports.
-   **Storefront:** Marketplace listings, membership tiers, payment processing.
-   **Analytics:** AI-powered predictions, streaming/revenue tracking.
-   **Social Media:** Approval workflows, bulk scheduling, organic growth.
-   **Studio:** Browser-based DAW with comping, markers, plugins, stems, warping.
-   **Workspace:** Team collaboration, RBAC, SSO integration.
-   **Simulation Environment:** Comprehensive testing across various time periods, user archetypes, and realistic event generators.

**Technology Stack:**
-   **Frontend:** React, Vite, TailwindCSS, shadcn/ui.
-   **Backend:** Express.js with TypeScript.
-   **Database:** PostgreSQL with Drizzle ORM.

**Project Structure:**
-   `client/`: Frontend React application.
-   `server/`: Backend Express server with routes, services, and middleware.
-   `shared/`: Shared code including Drizzle database schema.
-   `uploads/`: User file uploads.

## AI Services API

Max Booster includes a comprehensive suite of 100% in-house AI services with no external API dependencies. All AI endpoints require authentication.

### API Endpoints

**Content Generation**
- `POST /api/ai/content/generate` - Generate AI-powered content
  - Body: `{ tone, platform, maxLength, genre, mood, audience, style, keywords, customPrompt, projectId }`
  - Returns: Generated caption with tone match confidence

**Sentiment Analysis**
- `POST /api/ai/sentiment/analyze` - Analyze text sentiment
  - Body: `{ text, includeEmotions?, includeToxicity?, includeAspects?, aspects? }`
  - Returns: Sentiment score, emotions, toxicity analysis

**Recommendations**
- `POST /api/ai/recommendations/get` - Get personalized recommendations
  - Body: `{ type: 'tracks'|'artists'|'similar', seedIds?, limit?, hybridWeight? }`
  - Returns: Recommended items with confidence scores

**Ad Optimization**
- `POST /api/ai/ads/optimize` - Optimize advertising campaigns
  - Body: `{ campaign, action: 'score'|'optimize_budget'|'predict_creative'|'forecast_roi', campaigns?, totalBudget?, forecastPeriod? }`
  - Returns: Campaign scores, budget allocations, or ROI forecasts

**Social Media Predictions**
- `POST /api/ai/social/predict` - Predict social media engagement
  - Body: `{ platform, content, action: 'predict_engagement'|'viral_potential'|'best_time'|'recommend_type'|'optimize_schedule', postsPerWeek? }`
  - Returns: Engagement predictions, optimal posting times

**Time Series Forecasting**
- `POST /api/ai/forecast` - Forecast metrics
  - Body: `{ metric: 'streams'|'revenue'|'followers'|'engagement', horizon: 7|30|90, historicalData[], timestamps? }`
  - Returns: Forecasted values with accuracy metrics

**Health & Monitoring**
- `GET /api/ai/health` - AI services health check
- `GET /api/ai/stats` - AI service statistics
- `GET /api/ai/models` - List registered ML models
- `GET /api/ai/models/:modelId/performance` - Model performance metrics

**Analytics Intelligence**
- `POST /api/ai/analytics/predict` - Predict analytics metrics
- `GET /api/ai/insights` - Generate AI insights
- `GET /api/ai/anomalies` - Detect anomalies
- `POST /api/ai/churn/predict` - Predict user churn
- `POST /api/ai/revenue/forecast` - Forecast revenue

**Utility Endpoints**
- `POST /api/ai/hashtags/generate` - Generate relevant hashtags
- `POST /api/ai/toxicity/analyze` - Analyze content toxicity
- `POST /api/ai/emotions/detect` - Detect emotions in text
- `GET /api/ai/trends` - Detect current trends
- `POST /api/ai/content/adapt` - Adapt content for different platforms

### AI Service Components
- **ContentGenerator**: NLP-based caption and content generation
- **SentimentAnalyzer**: Multi-aspect sentiment analysis with emotion detection
- **RecommendationEngine**: Hybrid collaborative/content-based recommendations
- **AdOptimizationEngine**: Campaign scoring and budget optimization
- **SocialAutopilotEngine**: Engagement prediction and scheduling optimization
- **AdvancedTimeSeriesModel**: TensorFlow-based forecasting models
- **MLModelRegistry**: Centralized model management and versioning

## VST/AU Plugin Bridge API

The platform supports external VST/AU plugins through a desktop app bridge:

**Bridge Management**
- `GET /api/studio/vst/status` - Get bridge status and statistics
- `POST /api/studio/vst/initialize` - Initialize the VST bridge
- `POST /api/studio/vst/connect-desktop` - Connect desktop app for native plugin support
- `POST /api/studio/vst/disconnect-desktop` - Disconnect desktop app

**Plugin Scanning & Discovery**
- `POST /api/studio/vst/scan` - Scan for VST/AU/VST3/AAX plugins
- `GET /api/studio/vst/plugins` - List scanned plugins
- `GET /api/studio/vst/plugins/:id` - Get plugin details
- `GET /api/studio/vst/formats` - Get supported plugin formats

**Plugin Instances**
- `POST /api/studio/vst/instances` - Create plugin instance
- `GET /api/studio/vst/instances` - List instances by project/track
- `PUT /api/studio/vst/instances/:id/parameters` - Update parameters
- `PUT /api/studio/vst/instances/:id/bypass` - Set bypass state
- `POST /api/studio/vst/instances/:id/program` - Load program/preset
- `POST /api/studio/vst/instances/:id/editor/open` - Open plugin GUI
- `DELETE /api/studio/vst/instances/:id` - Delete instance

**Supported Formats:** VST2, VST3, Audio Units (AU), AAX

## Offline Mode API

Full offline support with project caching and sync:

**Status & Capabilities**
- `GET /api/offline/status` - Get online status and cache stats
- `GET /api/offline/capabilities` - Get available offline features

**Project Caching**
- `POST /api/offline/cache` - Cache project for offline use
- `GET /api/offline/cache` - List cached projects
- `GET /api/offline/cache/:projectId` - Get cached project details
- `GET /api/offline/cache/:projectId/check` - Check if project is cached
- `DELETE /api/offline/cache/:projectId` - Remove project from cache
- `DELETE /api/offline/cache` - Clear all cache

**Synchronization**
- `POST /api/offline/sync/:projectId` - Sync single project
- `POST /api/offline/sync-all` - Sync all cached projects

**Settings & Management**
- `GET /api/offline/settings` - Get offline settings
- `PUT /api/offline/settings` - Update offline settings
- `POST /api/offline/cleanup` - Clean up old cached data
- `POST /api/offline/export/:projectId` - Export project for offline
- `POST /api/offline/import` - Import offline project

**Offline Capabilities:**
- Project editing, MIDI editing, audio playback
- Mixing (volume, pan, effects)
- Plugin processing with built-in plugins
- Local project storage with automatic sync on reconnect

## Expanded Plugin Collection

The platform now includes 40+ built-in audio plugins:

**Instruments (20+):**
- Piano, Strings, Drums, Bass, Synth Pad
- Analog Polysynth, Supersaw Lead, Acid Bass
- FM Electric Piano, Granular Synth, Tonewheel Organ
- FM Synth, Wavetable Synth, Sampler
- Plus additional variations per category

**Effects (20+):**
- Reverb: Spring, Shimmer, Room, Hall, Plate
- Delay: Ping Pong, Tape, Digital, Modulated
- Compression: Multiband, Bus Compressor, Transient Shaper, Vintage Limiter
- EQ: Parametric, Vintage Pultec-style, Dynamic EQ
- Distortion: Tape Saturation, Harmonic Exciter, Bitcrusher, Vinyl Simulator
- Modulation: Chorus, Flanger, Phaser, Auto Filter
- Utility: Stereo Imager, Pitch Shifter, De-Esser, Vocoder

## External Dependencies
-   **Payments:** Stripe
-   **Email:** SendGrid
-   **Storage:** Replit Object Storage, AWS S3
-   **Queue Management:** BullMQ (for Auto-Posting Service V2)
-   **Image Processing:** Sharp
-   **Social Media Integrations:** Twitter, Facebook, Instagram APIs (for various social media features)
-   **Monitoring:** Redis (for session persistence and job queues)