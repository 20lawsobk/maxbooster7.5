# PHASE 1 — FULL PROJECT DISCOVERY AND MAPPING
**Generated: January 9, 2026**

## Executive Summary

Max Booster is an AI-powered music career management platform with:
- **48 pages/views** (frontend)
- **1,044 endpoints** (across 75 route files)
- **243 React components**
- **176 backend services**
- **161 database tables** (3,598 lines in schema.ts)

---

## 1. Entry Points

### Backend Entry
- `server/index.ts` - Main server entry point
- `server/routes.ts` - Route registration (3,121 lines)

### Frontend Entry
- `client/src/main.tsx` - React app entry
- `client/src/App.tsx` - Main app component with routing

### Scripts/Commands
```json
"dev": "NODE_ENV=development tsx server/index.ts"
"build": "tsx script/build.ts"
"start": "NODE_ENV=production node dist/index.cjs"
"db:push": "drizzle-kit push"
"prelaunch": "tsx scripts/pre-launch-check.ts"
"test:all": "npm run security:audit && npm run test:load && npm run test:security"
```

---

## 2. Backend Modules (75 Route Files)

### Endpoint Distribution by Domain

| Domain | Route File | Endpoints | Priority |
|--------|-----------|-----------|----------|
| **Distribution** | distribution.ts | 98 | CRITICAL |
| **AI Studio** | studio.ts | 62 | CRITICAL |
| **Social Media** | socialMedia.ts | 48 | CRITICAL |
| **Marketplace** | marketplace.ts | 44 | CRITICAL |
| **Workspace** | workspace.ts | 38 | HIGH |
| **Contracts** | contracts.ts | 38 | HIGH |
| **Social AI** | socialAI.ts | 31 | HIGH |
| **Advertising Autopilot** | advertisingAutopilot.ts | 31 | HIGH |
| **Dual Autopilot** | dualAutopilot.ts | 29 | MEDIUM |
| **Promotional Tools** | promotionalTools.ts | 27 | MEDIUM |
| **Advertising** | advertising.ts | 26 | MEDIUM |
| **AI** | ai.ts | 24 | HIGH |
| **Studio Plugins** | studioPlugins.ts | 23 | HIGH |
| **Growth** | growth.ts | 23 | MEDIUM |
| **Studio Comping** | studioComping.ts | 20 | MEDIUM |
| **Storefront** | storefront.ts | 20 | MEDIUM |
| **VST Bridge** | vstBridge.ts | 17 | LOW |
| **Status** | status.ts | 17 | HIGH |
| **Simulation** | simulation.ts | 16 | LOW |
| **Offline** | offline.ts | 16 | LOW |
| **Studio MIDI** | studioMidi.ts | 15 | MEDIUM |
| **Payouts** | payouts.ts | 15 | CRITICAL |
| **Autopilot Coordinator** | autopilot-coordinator.ts | 14 | MEDIUM |
| **Collaborations** | collaborations.ts | 13 | MEDIUM |
| **KYC** | kyc.ts | 12 | HIGH |
| **Billing** | billing.ts | 12 | CRITICAL |
| **Other routes** | (45 files) | ~350 | VARIOUS |

### Route Categories

**Core Business (CRITICAL - 217 endpoints)**
- distribution.ts (98)
- marketplace.ts (44)
- billing.ts (12)
- payouts.ts (15)
- studio.ts (62)

**Social/Automation (196 endpoints)**
- socialMedia.ts (48)
- socialAI.ts (31)
- advertisingAutopilot.ts (31)
- dualAutopilot.ts (29)
- advertising.ts (26)
- organic.ts (11)
- autopilot.ts (10)

**Studio/Production (130 endpoints)**
- studio.ts (62)
- studioPlugins.ts (23)
- studioComping.ts (20)
- studioMidi.ts (15)
- studioWarping.ts (10)

**User/Account (67 endpoints)**
- security.ts (8)
- kyc.ts (12)
- onboarding.ts (10)
- achievements.ts (8)
- collaborations.ts (13)
- careerCoach.ts (8)

**Admin/Monitoring (65 endpoints)**
- admin.ts (15)
- monitoring.ts (10)
- status.ts (17)
- logs.ts (6)
- audit.ts (8)

---

## 3. Frontend Modules

### Pages (48 total)

**Public Pages (12)**
- Landing.tsx, About.tsx, Blog.tsx, Features.tsx, Documentation.tsx
- Terms.tsx, Privacy.tsx, DMCA.tsx, SecurityPage.tsx
- Login.tsx, Register.tsx, ForgotPassword.tsx

**Dashboard/Main (10)**
- Dashboard.tsx, SimplifiedDashboard.tsx, Admin.tsx, AdminDashboard.tsx
- AdminAutonomy.tsx, Analytics.tsx, Settings.tsx, Help.tsx
- Projects.tsx, Onboarding.tsx

**Core Features (14)**
- Studio.tsx, Distribution.tsx, Marketplace.tsx, SocialMedia.tsx
- Royalties.tsx, Storefront.tsx, Advertisement.tsx
- ProducerProfilePage.tsx, ShowPage.tsx
- RegisterPayment.tsx, RegisterSuccess.tsx, Subscribe.tsx, Pricing.tsx
- DeveloperApi.tsx

**Admin Subdirectory (2)**
- admin/SecurityDashboard.tsx
- admin/SupportDashboard.tsx

**Analytics Subdirectory (6)**
- analytics/AIDashboard.tsx
- analytics/ARDiscoveryPanel.tsx
- analytics/GlobalRankingDashboard.tsx
- analytics/HistoricalAnalyticsView.tsx
- analytics/NaturalLanguageQuery.tsx
- analytics/PlaylistJourneysVisualization.tsx

### Components (243 total)

**By Category:**
- achievements/ (5 components)
- advertising/ (7 components)
- analytics/ (1 component)
- auth/ (1 component)
- autonomous/ (1 component)
- autopilot/ (1 component)
- collaboration/ (6 components)
- content/ (2 components)
- dashboard/ (5 components)
- dialogs/ (5 components)
- distribution/ (17 components)
- feature-discovery/ (2 components)
- growth/ (1 component)
- layout/ (6 components)
- marketplace/ (7 components)
- notifications/ (1 component)
- onboarding/ (9 components)
- releases/ (6 components)
- royalties/ (1 component)
- settings/ (1 component)
- social/ (14 components)
- studio/ (80+ components including studioone/ subdirectory)
- support/ (4 components)
- ui/ (60+ shadcn/ui components)

---

## 4. Backend Services (176 files)

### Core Services
- stripeService.ts - Payment processing
- emailService.ts - SendGrid integration
- storageService.ts - File storage (Replit Object Storage)
- socialOAuthService.ts - Social platform OAuth
- distributionService.ts - Music distribution
- studioService.ts - DAW/audio processing
- marketplaceService.ts - Beat marketplace

### AI/ML Services
- aiModelManager.ts - ML model orchestration
- aiAudioGeneratorService.ts - Audio generation
- aiContentService.ts - Content generation
- aiAnalyticsService.ts - Analytics AI
- aiInsightsEngine.ts - Insights generation

### Automation Services
- autoPostingServiceV2.ts - Social posting automation
- autopilotCoordinatorService.ts - Autopilot orchestration
- autonomousService.ts - 24/7 autonomous operations
- advertisingDispatchService.ts - Ad automation

### DSP/Audio Services (server/services/dsp/)
- 9 instrument engines (piano, drums, bass, strings, etc.)
- 8 effect engines (reverb, delay, compressor, etc.)

### Infrastructure Services
- circuitBreaker.ts - External service protection
- idempotencyService.ts - Request deduplication
- queueBackpressure.ts - Queue management
- sessionTrackingService.ts - Session management

---

## 5. Shared/ML Modules

### ML Models (shared/ml/models/)
- SocialAutopilotEngine.ts
- AdvertisingAutopilotAI.ts
- EngagementPredictionModel.ts
- ChurnPredictionModel.ts
- RecommendationEngine.ts
- GenreClassificationModel.ts
- BPMDetectionModel.ts
- IntelligentMixingModel.ts

### Audio Processing (shared/ml/audio/)
- AIAudioGenerator.ts
- AudioFeatureExtractor.ts
- IntelligentMasteringEngine.ts
- SynthesizerEngine.ts
- PatternGenerator.ts

### NLP (shared/ml/nlp/)
- ContentGenerator.ts
- SentimentAnalyzer.ts

---

## 6. Database Schema (161 tables)

### Critical Tables
- users, sessions, subscriptions
- projects, tracks, releases
- analytics, platform_analytics
- listings, orders, marketplace_disputes
- social_accounts, social_posts, social_campaigns
- instant_payouts, royalty_statements

### Full Schema: 3,598 lines in shared/schema.ts

---

## 7. Configuration Files

- package.json - Dependencies (122 production, 20 dev)
- tsconfig.json - TypeScript configuration
- vite.config.ts - Vite bundler config
- drizzle.config.ts - Database ORM config
- tailwind.config.ts - CSS framework config
- postcss.config.js - PostCSS config
- components.json - shadcn/ui config

---

## 8. Test Infrastructure

### Test Directories
- tests/burn-in/ - 24-hour stability tests
- tests/chaos/ - Chaos engineering tests
- tests/integration/ - Integration tests
- tests/load/ - Load testing
- tests/smoke/ - Post-deployment tests
- tests/unit/ - Unit tests

### Scripts
- scripts/security-audit.ts
- scripts/penetration-test.ts
- scripts/load-test.ts
- scripts/pre-launch-check.ts

---

## 9. Infrastructure

### Middleware (server/middleware/)
- auth.ts, csrf.ts, rateLimiter.ts, scalableRateLimiter.ts
- errorHandler.ts, validation.ts, idempotency.ts
- auditLogger.ts, requestLogger.ts, requestCorrelation.ts
- uploadHandler.ts, uploadSecurity.ts
- sessionConfig.ts, cachingLayer.ts

### Safety (server/safety/)
- killSwitch.ts - Emergency stop
- envValidation.ts - Environment validation
- inputValidation.ts - Input sanitization
- refundHandler.ts - Refund processing
- stripeWebhookSecurity.ts - Webhook verification

### Monitoring (server/monitoring/)
- metricsCollector.ts
- alertingService.ts
- capacityMonitor.ts
- performanceRegression.ts

### Reliability (server/reliability/)
- database-resilience.ts
- memory-manager.ts
- process-monitor.ts
- reliability-coordinator.ts

---

## 10. Identified Structural Issues

### A. Duplicate/Overlapping Logic
1. **Two LabelGrid services**: `labelgrid-service.ts` AND `labelGridService.ts`
2. **Multiple autopilot services**: autopilot.ts, dualAutopilot.ts, autopilotCoordinator.ts
3. **Duplicate royalty components**: distribution/RoyaltySplitManager.tsx AND royalties/RoyaltySplitManager.tsx

### B. Large Files (Maintainability Risk)
1. `server/routes.ts` - 3,121 lines
2. `shared/schema.ts` - 3,598 lines (but necessary for schema)
3. `server/routes/distribution.ts` - 98 endpoints

### C. Potential Dead/Unused Code
- `server/enhancements/` - 8 enhancement files (appear unused)
- `scripts/refactor-to-excellence.ts` - Meta refactoring script
- Various simulation files may be dev-only

### D. Missing/Incomplete
- Limited unit test coverage
- Some services lack error handling
- Inconsistent logging patterns

---

## 11. External Dependencies

### Critical Integrations
- **Stripe** - Payments, Connect, webhooks
- **SendGrid** - Transactional email
- **Redis Cloud** - Sessions, queues, caching
- **PostgreSQL (Neon)** - Primary database
- **Replit Object Storage** - File storage
- **LabelGrid** - Music distribution

### Social Platform APIs
- Twitter, Facebook, Instagram, TikTok
- YouTube, LinkedIn, Threads

---

## 12. Recommended Phase 2 Focus

### Priority Order for Stabilization
1. **CRITICAL**: Distribution (98 endpoints) - Revenue-critical
2. **CRITICAL**: Billing/Payouts (27 endpoints) - Revenue-critical
3. **CRITICAL**: Studio (62 endpoints) - Core product
4. **CRITICAL**: Marketplace (44 endpoints) - Revenue-critical
5. **HIGH**: Social Media (48 endpoints) - User engagement
6. **HIGH**: Authentication/Security - Trust foundation
7. **MEDIUM**: Automation/Autopilot - Enhanced features
8. **LOW**: Simulation, VST Bridge - Can be deferred

---

## Phase 1 Complete

**Status**: Project fully mapped
**Next Step**: Phase 2 - Core Feature Identification and Scope Freeze
