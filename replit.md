# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a full-stack AI-powered music career management platform. It provides artists with professional AI studio tools, social media management, beat marketplace, analytics, music distribution, and more.

## Architecture
- **Frontend**: React + Vite + TailwindCSS (client directory)
- **Backend**: Express.js + TypeScript (server directory)
- **State Service**: Rust-based "BoosterState" microservice (boosterstate directory) running on port 9877
- **Database**: PostgreSQL via Drizzle ORM (schema in shared/schema.ts)
- **Desktop/Mobile**: Electron + Capacitor (android directory)

## Project Structure
```
client/          - React frontend (Vite)
server/          - Express backend (TypeScript)
shared/          - Shared types and schema (Drizzle ORM)
boosterstate/    - Rust microservice for state management
migrations/      - Drizzle database migrations
assets/          - Static assets (images, icons)
script/          - Build scripts
```

## Key Configuration
- Server listens on port 5000 (0.0.0.0)
- BoosterState Rust service on port 9877 (127.0.0.1)
- Vite dev server configured with allowedHosts: true for Replit proxy
- Database schema managed by Drizzle Kit (drizzle.config.ts)
- esbuild pinned to 0.25.12 for drizzle-kit compatibility

## Development
- Dev command: `./boosterstate/target/debug/boosterstate & sleep 1 && NODE_ENV=development npx tsx server/index.ts`
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
