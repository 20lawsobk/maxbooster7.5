# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a full-stack AI-powered music career management platform. It provides artists with professional AI studio tools, social media management, beat marketplace, analytics, music distribution, and more.

## Architecture
- **Frontend**: React + Vite + TailwindCSS (client directory)
- **Backend**: Express.js + TypeScript (server directory)
- **AI Model**: Custom PyTorch transformer (ai_model directory) running on port 9878
- **State Service**: Rust-based "BoosterState" microservice (boosterstate directory) running on port 9877
- **Database**: PostgreSQL via Drizzle ORM (schema in shared/schema.ts)
- **Desktop/Mobile**: Electron + Capacitor (android directory)

## Project Structure
```
client/          - React frontend (Vite)
server/          - Express backend (TypeScript)
shared/          - Shared types and schema (Drizzle ORM)
ai_model/        - Custom PyTorch AI content generation model
  model/         - Transformer LM, tokenizer, creative model wrapper
  agents/        - Script, visual spec, distribution, optimization agents
  training/      - Dataset, trainer, config, synthetic data generator, logger
  boostsheets/   - BoostSheet data model, repository, lifecycle, versioning
  api/           - FastAPI service (schemas + app)
  adapters/      - URL-to-BoostSheet adapter
  weights/       - Saved model checkpoints
boosterstate/    - Rust microservice for state management
migrations/      - Drizzle database migrations
assets/          - Static assets (images, icons)
script/          - Build scripts
training/        - Training data (boostsheet_samples.json)
```

## Key Configuration
- Server listens on port 5000 (0.0.0.0)
- AI Model FastAPI service on port 9878 (127.0.0.1)
- BoosterState Rust service on port 9877 (127.0.0.1)
- Vite dev server configured with allowedHosts: true for Replit proxy
- Database schema managed by Drizzle Kit (drizzle.config.ts)
- esbuild pinned to 0.25.12 for drizzle-kit compatibility

## AI Model
- Custom transformer language model (PyTorch) for social media content generation
- Supports 8 platforms: TikTok, Instagram, YouTube, Facebook, Twitter/X, LinkedIn, Google Business, Threads
- Architecture: TransformerLM with configurable dim/layers/heads/max_len (env vars: AI_MODEL_DIM, AI_MODEL_LAYERS, AI_MODEL_HEADS, AI_MODEL_MAX_LEN)
- Agents: ScriptAgent (hook/body/cta), DistributionAgent (caption/hashtags/timing), VisualSpecAgent (thumbnails), OptimizationAgent
- Training: Synthetic data generation, BoostSheet-to-training-sample converter, TrainingLogger for continuous learning
- Fallback: If model output is low-quality (untrained/gibberish), agents produce template-based content
- Integration: Node.js client (server/services/pythonAIService.ts) calls Python API; social media routes try Python AI first, fall back to unifiedAIController
- Endpoints: /generate/content, /generate/multi-platform, /generate/script, /generate/visual-spec, /generate/distribution, /train, /train/synthetic, /train/status, /train/log-sheet, /optimize, /boostsheet/create, /health

## Development
- Dev command: `python3 -m ai_model.serve & ./boosterstate/target/debug/boosterstate & sleep 2 && NODE_ENV=development npx tsx server/index.ts`
- The Express server serves both API routes and the Vite dev frontend on port 5000
- DB push: `npx drizzle-kit push`

## External Services (optional, configured via env vars)
- Stripe (payments)
- SendGrid (email)
- Various social media APIs (Twitter, Facebook, Instagram, TikTok, etc.)
- Sentry (error tracking)
- LabelGrid (music distribution)

## Security & Hardening
- XSS prevention: `escapeHtml()` and `escapeRegex()` helpers in server/routes/search.ts sanitize all search highlighting
- IDOR protection on pocket dimension routes (stats/list/write) - verify userId matches session
- Data leak prevention: export-data endpoint strips twoFactorSecret, passwordResetToken, emailVerificationToken
- Input validation on change-password (min 8 chars) and delete-account (confirmation required)
- Admin-only auth on infrastructure status endpoint
- Log injection prevention in error reporting
- Removed duplicate insecure 2FA disable route
- Session security: httpOnly, sameSite, secure cookies configured
- Rate limiting on auth endpoints
- Circuit breakers for all external streaming services
- API response caching (8 routes cached)

## Recent Changes
- 2026-02-19: Production hardening pass (phase 5)
  - Replaced console.error with structured logger in helpDesk.ts (2 instances) and distributionPlatformService.ts
  - Fixed JS code sample in developerApi.ts (was using console.log in example)
  - Added try/catch error handling to all 6 handlers in killSwitch.ts
  - Added isError handling to 6 data-fetching pages: Admin, AdminAutonomy, AdminDashboard, Advertisement, ReleaseCountdown, SimplifiedDashboard
  - Input validation audit confirmed: all parseInt calls have NaN checks, no secrets in responses
  - Remaining console.log instances only in scripts/tests/seed files (appropriate)
- 2026-02-19: AI Model integration across all content generators
  - unifiedAIController: generateContent() and generateSocialContent() now try Python AI model first
  - contentQualityPipeline: generateSingleVariant() uses AI for headline/body/cta with template fallback
  - socialStrategyAIService: getContentRecommendations() generates AI-powered suggested content
  - contentVariantGenerator: generateCaptionVariants() produces AI-powered variants before templates
  - autoPostGenerator: generateSocialContent() and generateViralContent() use AI model first
  - All integrations validate hook/body/cta fields before accepting AI results
  - Graceful fallback: if Python AI model is unavailable or returns incomplete data, templates are used
- 2026-02-19: AI Model training pipeline integration
  - Added DEFAULT_TRAIN_CONFIG (dim=256, layers=4, heads=4, max_len=256, lr=3e-4, batch_size=8, epochs=3)
  - Added TrainingLogger: appends BoostSheet-to-training-sample conversions to training data
  - Added synthetic data generator: 50+ diverse samples across 8 platforms, 3 goals, 3 tones
  - Added train_max_booster() standalone entrypoint (ai_model/training/run.py)
  - API endpoints: POST /train (with auto-synthetic generation), POST /train/synthetic, GET /train/status, POST /train/log-sheet
  - Fixed tokenizer freeze/unfreeze for inference vs training (prevents embedding index out of range)
  - Fixed padding in CreativeDataset for batched training (variable-length sequences)
  - Model auto-resizes embeddings when vocab grows during training
  - Agents (Script, Distribution, VisualSpec) now gracefully fall back to templates when model output is gibberish
  - Trained initial model: 50 samples, 3 epochs, perplexity 369.86, vocab 269, weights saved to ai_model/weights/
- 2026-02-19: TikTok OAuth sandbox/production split
  - Env-driven config: `TIKTOK_ENV=sandbox` switches between sandbox and production mode
  - Separate env vars: `TIKTOK_SANDBOX_CLIENT_KEY`, `TIKTOK_SANDBOX_CLIENT_SECRET`, `TIKTOK_SANDBOX_SCOPES`, `TIKTOK_SANDBOX_REDIRECT_URI` for sandbox; `TIKTOK_PROD_*` for production
  - Different default scopes: sandbox=`user.info.basic,video.list,video.upload,video.publish`, production=`user.info.basic`
  - Consistent redirect URI handling across auth URL generation and token exchange
  - Both routes and service files aligned on the same env var pattern
- 2026-02-19: Twitter/X OAuth fix - switched to public client mode (client_id in body, no Basic Auth)
- 2026-02-19: Production hardening pass (phase 4)
  - Replaced console.log with logger in 10 more server files: personalization.ts, storage.ts, platform-capsule.ts, ultra-quality-engine.ts, performanceRegression.ts, undo.ts, files.ts, notifications.ts, collaborations.ts, shortcuts.ts
  - Added isError handling to 15 more frontend pages: Dashboard, Analytics, Distribution, Marketplace, SocialMedia, Settings, Royalties, Storefront, Contracts, Collaborations, Workspaces, Invoices, Projects, CareerCoach, DeveloperApi
  - Redacted OAuth clientId from Threads auth log (security)
  - Fixed corrupted developer API doc examples (logger wrongly injected into JS/Python code samples)
  - Verified all unhandled .then() chains already have .catch() handlers
- 2026-02-19: Production hardening pass (phase 3)
  - Replaced all console.log/error/warn with structured logger in routes.ts, achievements.ts, batch.ts
  - Removed sensitive auth debug logging (cookie headers, session details, response headers)
  - Fixed remaining try/catch gaps in 6 more route files: audio-processing, developerApi, kyc, promotionalTools, search, workspace
  - Added error states (isError handling) to 7 frontend pages: Notifications, ProducerProfilePage, and 5 analytics pages
- 2026-02-19: Production hardening pass (phase 2)
  - Fixed SMS verification code leak (was logging actual codes to console)
  - Added try/catch to 8 route files (55+ handlers): artistProgress, careerCoach, executiveDashboard, growth, monitoring, organic, releaseCountdown, revenueForecast
  - Added global MutationCache onError handler - all 390 mutations now show toast errors
  - Verified promise handling in search.ts (Promise.all covers .then chains)
- 2026-02-19: Production hardening pass (phase 1)
  - Fixed 7 critical and 13 high-severity security vulnerabilities
  - Added XSS prevention (HTML/regex escaping) to search autocomplete
  - Added IDOR protection to pocket dimension routes
  - Hardened data export to strip sensitive fields
  - Added input validation to auth endpoints
  - Verified error handling coverage across all services
  - Confirmed performance infrastructure (caching, circuit breakers, rate limiting)
- 2026-02-19: Initial Replit environment setup
  - Installed Node.js 20 and Rust stable
  - Created PostgreSQL database
  - Pushed Drizzle schema
  - Built Rust boosterstate service
  - Pinned esbuild to 0.25.12 for drizzle-kit compatibility
  - Configured workflow and deployment
