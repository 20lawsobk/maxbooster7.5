# PHASE 1: FULL PROJECT DISCOVERY AND MAPPING
## Max Booster Production Hardening - Project Map
**Generated**: January 9, 2026

---

## 1. PROJECT OVERVIEW

| Metric | Count |
|--------|-------|
| **UI Pages** | 48 |
| **Route Files** | 75 |
| **API Endpoints (in route files)** | 1,039 |
| **Inline Routes (routes.ts)** | 97 |
| **Total Estimated Endpoints** | ~1,136 |
| **Service Files** | 151 |
| **Database Tables** | 160 |
| **Schema Lines** | 3,562 |
| **ML Models** | 18 |
| **UI Components** | 226+ |
| **Custom Hooks** | 22 |
| **Lib Utilities** | 51 |

---

## 2. ENTRY POINTS

### Backend Entry Points
- `server/index.ts` - Main Express server entry point
- `server/routes.ts` - Route registration and inline auth routes (3,065 lines)
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage abstraction layer

### Frontend Entry Points
- `client/src/main.tsx` - React app entry point
- `client/src/App.tsx` - Main app component with routing
- `client/index.html` - HTML template

### Scripts & Tools
| Script | Purpose |
|--------|---------|
| `scripts/pre-launch-check.ts` | 30-point health verification |
| `scripts/security-audit.ts` | Security vulnerability scan |
| `scripts/load-test.ts` | Performance load testing |
| `scripts/penetration-test.ts` | Security penetration testing |
| `scripts/backup-database.ts` | Database backup |
| `scripts/restore-database.ts` | Database restoration |
| `scripts/bootstrap-admin.ts` | Admin account creation |
| `scripts/setup-admin-lifetime.ts` | Admin lifetime subscription |
| `scripts/validate-secrets.ts` | Environment validation |
| `scripts/deployment-runbook.ts` | Deployment procedures |

---

## 3. PAGES (48 Total)

### Public Pages (12)
| Page | Path | Purpose |
|------|------|---------|
| Landing | `/` | Marketing homepage |
| Login | `/login` | User authentication |
| Register | `/register` | User registration |
| RegisterPayment | `/register/payment` | Payment during registration |
| RegisterSuccess | `/register/success` | Registration confirmation |
| ForgotPassword | `/forgot-password` | Password recovery |
| Pricing | `/pricing` | Subscription plans |
| Features | `/features` | Feature showcase |
| About | `/about` | Company information |
| Terms | `/terms` | Terms of service |
| Privacy | `/privacy` | Privacy policy |
| DMCA | `/dmca` | DMCA policy |

### Core App Pages (22)
| Page | Path | Purpose |
|------|------|---------|
| Dashboard | `/dashboard` | Main user dashboard |
| SimplifiedDashboard | `/simplified` | Simplified view |
| Studio | `/studio` | AI Music Studio / DAW |
| Distribution | `/distribution` | Music distribution management |
| SocialMedia | `/social` | Social media management |
| Advertisement | `/ads` | Advertising campaigns |
| Analytics | `/analytics` | Analytics dashboard |
| Marketplace | `/marketplace` | Beat marketplace |
| Storefront | `/storefront` | Producer storefront |
| Royalties | `/royalties` | Royalty tracking |
| Projects | `/projects` | Project management |
| Settings | `/settings` | User settings |
| Subscribe | `/subscribe` | Subscription management |
| Help | `/help` | Help center |
| Documentation | `/docs` | Platform documentation |
| Blog | `/blog` | Blog/news |
| DeveloperApi | `/api-docs` | API documentation |
| DesktopApp | `/desktop` | Desktop app download |
| ProducerProfilePage | `/producer/:id` | Public producer profile |
| ShowPage | `/show/:id` | Public show page |
| SecurityPage | `/security` | Security settings |
| Onboarding | `/onboarding` | User onboarding flow |

### Admin Pages (6)
| Page | Path | Purpose |
|------|------|---------|
| Admin | `/admin` | Main admin panel |
| AdminDashboard | `/admin/dashboard` | Admin overview |
| AdminAutonomy | `/admin/autonomy` | Autonomous systems control |
| SupportDashboard | `/admin/support` | Customer support |
| SecurityDashboard | `/admin/security` | Security monitoring |
| SoloFounderStory | `/founder` | Founder story page |

### Analytics Sub-Pages (6)
| Page | Path | Purpose |
|------|------|---------|
| AIDashboard | `/analytics/ai` | AI-powered insights |
| ARDiscoveryPanel | `/analytics/ar` | A&R discovery tools |
| GlobalRankingDashboard | `/analytics/rankings` | Global rankings |
| HistoricalAnalyticsView | `/analytics/history` | Historical data |
| NaturalLanguageQuery | `/analytics/query` | Natural language queries |
| PlaylistJourneysVisualization | `/analytics/playlists` | Playlist tracking |

### Utility Pages (2)
| Page | Path | Purpose |
|------|------|---------|
| API | `/api` | API status page |
| not-found | `*` | 404 error page |

---

## 4. ENDPOINT CATEGORIES (~1,136 Total)

### By Domain (Route Files)

#### Distribution Domain (98 endpoints)
- `distribution.ts` - Music distribution to DSPs, Content ID, sync licensing

#### Studio Domain (157 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| studio.ts | 65 | Core studio features |
| studioPlugins.ts | 23 | Plugin management |
| studioComping.ts | 20 | Comping features |
| vstBridge.ts | 17 | VST plugin bridge |
| studioMidi.ts | 15 | MIDI features |
| studioWarping.ts | 10 | Time warping |
| studioStems.ts | 7 | Stem management |
| studioMarkers.ts | 4 | Marker management |
| studioGeneration.ts | 3 | AI generation |

#### Social Media Domain (109 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| socialMedia.ts | 48 | Core social management |
| socialAI.ts | 31 | AI content generation |
| socialApprovals.ts | 10 | Approval workflows |
| socialBulk.ts | 6 | Bulk scheduling |
| socialOAuth.ts | 4 | OAuth connections |
| autonomousSocial.ts | 3 | Autonomous posting |

#### Advertising Domain (57 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| advertisingAutopilot.ts | 31 | AI advertising autopilot |
| advertising.ts | 26 | Campaign management |

#### Marketplace Domain (64 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| marketplace.ts | 44 | Beat marketplace |
| storefront.ts | 20 | Producer storefronts |

#### Autopilot Domain (60 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| dualAutopilot.ts | 29 | Dual autopilot system |
| autopilot-coordinator.ts | 14 | Autopilot coordination |
| autopilot-learning.ts | 9 | Pattern learning |
| autopilot.ts | 8 | Core autopilot |

#### Analytics Domain (56 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| api/v1/analytics.ts | 17 | Public analytics API |
| analytics-internal.ts | 10 | Internal analytics |
| careerCoach.ts | 8 | AI career recommendations |
| revenueForecast.ts | 5 | Revenue projections |
| artistProgress.ts | 5 | Progress tracking |
| achievements.ts | 7 | Achievement system |
| api/certifiedAnalytics.ts | - | Certified analytics |
| api/analyticsAlerts.ts | - | Alert system |

#### Workspace & Collaboration (51 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| workspace.ts | 38 | Workspace management |
| collaborations.ts | 13 | Collaboration features |

#### Contracts & Legal (29 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| contracts.ts | 29 | Contract management |

#### Growth & Promotion (50 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| promotionalTools.ts | 27 | Promotional tools |
| growth.ts | 23 | Growth features |

#### AI & Content (31 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| ai.ts | 24 | AI services |
| content-analysis.ts | 7 | Content analysis |

#### Billing & Payments (46 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| payouts.ts | 15 | Payout management |
| billing.ts | 12 | Subscription billing |
| kyc.ts | 12 | KYC verification |
| invoices.ts | 10 | Invoice generation |
| paymentBypass.ts | 4 | Payment bypass |

#### Admin Domain (42 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| admin/index.ts | 19 | Admin dashboard |
| admin.ts | - | Legacy admin |
| admin/metrics.ts | 6 | Admin metrics |
| executiveDashboard.ts | 2 | Executive view |

#### Infrastructure & Monitoring (64 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| status.ts | 17 | System status |
| simulation.ts | 16 | System simulation |
| offline.ts | 16 | Offline mode |
| monitoring.ts | 10 | System monitoring |
| selfHealingApi.ts | 7 | Self-healing API |
| killSwitch.ts | 6 | Kill switch controls |
| autoUpdates.ts | 4 | Auto-updates |
| audit.ts | 2 | Audit logging |
| testing.ts | 2 | Testing endpoints |
| logs.ts | 3 | Log management |
| backup.ts | 3 | Backup management |

#### User & Onboarding (21 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| onboarding.ts | 7 | Onboarding flow |
| emailPreferences.ts | 7 | Email preferences |
| security.ts | 5 | Security settings |
| dmca.ts | 11 | DMCA management |
| helpDesk.ts | 5 | Help desk |

#### Webhooks (3 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| webhooks/stripe.ts | 2 | Stripe webhooks |
| webhooks/sendgrid.ts | 1 | SendGrid webhooks |
| webhooks-admin.ts | 4 | Webhook administration |

#### Audio Processing (14 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| audioAnalysis.ts | 6 | Audio analysis |
| audio-processing.ts | 4 | Audio processing |

#### Release Management (10 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| releaseCountdown.ts | 10 | Release countdown |

#### Developer API (6 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| developerApi.ts | 6 | Developer API management |

#### Support (6 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| support.ts | 6 | Support tickets |

#### Organic Growth (11 endpoints)
| File | Count | Purpose |
|------|-------|---------|
| organic.ts | 11 | Organic growth features |

---

## 5. BACKEND MODULES

### Core Services (151 total)
| Category | Services | Purpose |
|----------|----------|---------|
| **Audio** | audioNormalizationService, audioMetadataService, waveformCacheService, timeStretchService, midiTransformService, midiGeneratorService, microtonalService | Audio processing |
| **AI/ML** | musicGenerationService, aiService, aiContentService, aiInsightsEngine, unifiedAIController | AI features |
| **Social** | socialService, socialOAuthService, socialQueueService, socialListeningService, socialChatbotService, socialAmplificationService, socialStrategyAIService, socialFanbaseService, approvalService | Social management |
| **Distribution** | labelGridService, distributionService, releaseWorkflowService, releaseScheduler, releaseCountdownService | Distribution |
| **Billing** | stripeService, stripeSetup, payoutService, instantPayoutService, invoiceService, paymentBypassService | Payments |
| **Analytics** | musicCareerAnalyticsService, analyticsAlertService, revenueForecastService, revenueForecaster | Analytics |
| **Storage** | storageService, replitStorageService, s3StorageService | File storage |
| **User** | onboardingService, kycService, ssoService, rbacService, securityService | User management |
| **Email** | emailService, emailTrackingService, weeklyInsightsService | Email |
| **Monitoring** | monitoringService, loggingService, structuredLogger, metricsService, statusPageService | Observability |
| **Infrastructure** | queueService, queueBackpressure, webhookReliabilityService, idempotencyService | Infrastructure |

### ML Models (18 models in shared/ml/models/)
| Model | Purpose |
|-------|---------|
| AdOptimizationEngine | Ad campaign optimization |
| AdvertisingAutopilotAI | Autonomous advertising |
| AnomalyDetectionModel | Anomaly detection |
| BPMDetectionModel | BPM analysis |
| BrandVoiceAnalyzer | Brand voice analysis |
| ChurnPredictionModel | Churn prediction |
| ContentPatternLearner | Content pattern learning |
| EngagementPredictionModel | Engagement prediction |
| GenreClassificationModel | Genre classification |
| IntelligentMixingModel | Intelligent mixing |
| RecommendationEngine | Recommendations |
| SocialAutopilotEngine | Social automation |
| SocialMediaAutopilotAI | Social media AI |
| TimeSeriesForecastModel | Time series forecasting |
| AdvancedTimeSeriesModel | Advanced forecasting |

### Audio AI Services (shared/ml/audio/)
| Service | Purpose |
|---------|---------|
| AIAudioGenerator | AI audio generation |
| AudioFeatureExtractor | Feature extraction |
| IntelligentMasteringEngine | AI mastering |
| PatternGenerator | Pattern generation |
| SynthesizerEngine | Synthesizer |
| TextToSynthAI | Text to synth |

### NLP Services (shared/ml/nlp/)
| Service | Purpose |
|---------|---------|
| ContentGenerator | Content generation |
| SentimentAnalyzer | Sentiment analysis |

---

## 6. FRONTEND MODULES

### Component Domains (226+ components)
| Domain | Count | Purpose |
|--------|-------|---------|
| studio | 82 | DAW/Studio components |
| ui | 53 | Shared UI components (shadcn) |
| distribution | 17 | Distribution UI |
| social | 13 | Social media UI |
| onboarding | 9 | Onboarding flows |
| marketplace | 7 | Marketplace UI |
| layout | 6 | Layout components |
| advertising | 6 | Advertising UI |
| releases | 5 | Release management |
| dialogs | 5 | Modal dialogs |
| dashboard | 5 | Dashboard widgets |
| collaboration | 5 | Collaboration UI |
| support | 4 | Support UI |
| achievements | 4 | Achievement UI |
| video | 3 | Video creation |
| feature-discovery | 2 | Feature discovery |
| content | 2 | Content components |

### Custom Hooks (22)
Located in `client/src/hooks/`

### Utility Libraries (51)
Located in `client/src/lib/`

---

## 7. CONFIGURATION FILES

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, build config |
| `tsconfig.json` | TypeScript configuration |
| `vite.config.ts` | Vite bundler configuration |
| `tailwind.config.ts` | Tailwind CSS configuration |
| `postcss.config.js` | PostCSS configuration |
| `drizzle.config.ts` | Drizzle ORM configuration |
| `components.json` | shadcn/ui configuration |

### Environment Variables (18 required)
| Variable | Purpose |
|----------|---------|
| DATABASE_URL | PostgreSQL connection |
| SESSION_SECRET | Session encryption |
| REDIS_URL | Redis connection |
| STRIPE_SECRET_KEY | Stripe API |
| STRIPE_PUBLISHABLE_KEY | Stripe public key |
| STRIPE_WEBHOOK_SECRET | Stripe webhooks |
| SENDGRID_API_KEY | Email delivery |
| SENTRY_DSN | Error monitoring |
| REPLIT_BUCKET_ID | Object storage |
| STORAGE_PROVIDER | Storage type |
| LABELGRID_API_KEY | Distribution API |
| TWITTER_API_KEY/SECRET | Twitter integration |
| FACEBOOK_APP_ID/SECRET | Facebook integration |
| INSTAGRAM_APP_ID/SECRET | Instagram integration |
| TIKTOK_CLIENT_KEY/SECRET | TikTok integration |
| YOUTUBE_CLIENT_ID/SECRET | YouTube integration |
| LINKEDIN_CLIENT_ID/SECRET | LinkedIn integration |

---

## 8. TEST FILES

| Test Type | File | Purpose |
|-----------|------|---------|
| Unit | `tests/unit/example.test.ts` | Example unit test |
| Smoke | `tests/smoke/post-deployment-tests.ts` | Post-deployment validation |
| Load | `tests/load/load-test.ts` | Performance testing |
| Integration | `tests/integration/stripe-verification.ts` | Stripe integration |
| Chaos | `tests/chaos/worker-crash-test.ts` | Chaos engineering |
| Burn-in | `tests/burn-in/24-hour-test.ts` | Long-running stability |
| Burn-in | `tests/burn-in/feature-validators.ts` | Feature validation |
| Burn-in | `tests/burn-in/scheduled-start.ts` | Scheduled startup |

---

## 9. DOCUMENTATION

| Document | Purpose |
|----------|---------|
| `docs/LAUNCH_RUNBOOK.md` | Launch day procedures |
| `docs/TEST_MATRIX.md` | Test matrix documentation |
| `docs/competitive-analysis.md` | Competitive analysis |
| `docs/maxbooster-loadtest-results.md` | Load test results |
| `replit.md` | Project overview and architecture |
| `SYSTEMS_AND_FEATURES.md` | Feature documentation |
| `design_guidelines.md` | Design guidelines |
| `server/routes/README.md` | Routes documentation |
| `tests/TEST_COVERAGE_GUIDE.md` | Test coverage guide |

---

## 10. STRUCTURAL ISSUES IDENTIFIED

### 10.1 No Circular Dependencies Found
- Services do not import from routes (good)
- Routes do not cross-import from each other (good)

### 10.2 Potentially Unused Services (10+)
The following services have 0 direct imports and may be dead code:
- accountDeletionService
- advertisingAIService
- advertisingDispatchService
- advertisingNormalizationService
- advertisingRulesService
- aiAnalyticsService
- aiContentService
- aiInsightsEngine
- aiMusicService
- aiService

**Recommendation**: Verify if these are dynamically loaded or truly unused before removal.

### 10.3 Large Files Requiring Attention
| File | Lines | Risk |
|------|-------|------|
| `server/routes.ts` | 3,065 | Maintainability - consider splitting |
| `shared/schema.ts` | 3,562 | Size acceptable for schema |

### 10.4 Duplicate/Overlapping Logic
- Multiple autopilot systems: `autopilot.ts`, `autopilot-coordinator.ts`, `autopilot-learning.ts`, `dualAutopilot.ts`
- Multiple advertising services: `advertising.ts`, `advertisingAutopilot.ts`
- Two LabelGrid services: `labelGridService.ts`, `labelgrid-service.ts`

**Recommendation**: Document the distinction between these or consolidate.

### 10.5 Schema Column Mismatch (FIXED)
- `approvalService.ts` was querying non-existent `social_role` column
- **Status**: Fixed by using existing `role` column

---

## 11. HEALTH STATUS SUMMARY

| Check | Status |
|-------|--------|
| Pre-launch checks | 30/30 PASSED |
| Circuit breakers | 12/12 healthy |
| Database | Connected (52 queries, P95: 36ms) |
| Redis | Connected |
| Stripe | Configured (sk_live) |
| SendGrid | Configured |
| Sentry | Configured |
| Object Storage | Configured |
| LabelGrid | Configured |

---

## 12. NEXT STEPS (Phase 2)

1. Define core features vs. experimental features
2. Scope freeze for production launch
3. Identify features to disable/hide
4. Confirm feature list before major refactors
