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

## External Dependencies
-   **Payments:** Stripe
-   **Email:** SendGrid
-   **Storage:** Replit Object Storage, AWS S3
-   **Queue Management:** BullMQ (for Auto-Posting Service V2)
-   **Image Processing:** Sharp
-   **Social Media Integrations:** Twitter, Facebook, Instagram APIs (for various social media features)
-   **Monitoring:** Redis (for session persistence and job queues)