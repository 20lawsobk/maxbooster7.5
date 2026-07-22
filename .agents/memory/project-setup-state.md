---
name: Max Booster project setup state
description: What was done to get the imported project running, and what's still pending.
---

# Max Booster — Project Setup State

## What works (verified live)
- App boots on port 5000 via `npm run dev` (tsx server/index.ts)
- Admin account: blawzmusic@gmail.com (role: admin, id: 31b06dba-b992-4da5-90ef-3dac95692716)
- MaxCore AI (https://secure-ai-forge.replit.app) — Bearer-only auth with AI_SERVER_KEY/MAXCORE_ADMIN_KEY:
  - /api/platform/model/info → 200 (model_ready: true)
  - /api/generate/content → 200 (98% confidence)
  - /api/generate/audio → 200 async (job_id → poll /api/audio-job/:id)
  - /api/generate/image → 200 (PIL engine)
  - /api/platform/social/generate → 200
  - /api/platform/distribution/plan → 200
  - /api/platform/video/generate → 200 (scene script)
  - /api/platform/daw/generate → 200
  - /api/platform/social/autopilot → 200
- In-app MaxCore proxy (/api/generate/*, /api/platform/*) → 200
- Beat Money Loop admin API (/api/admin/beat-money-loop):
  - GET /status → 200 (enabled: true, totalCycles: 40+)
  - POST /run-now → 202 (async, cycle starts generating)
  - GET /cycles → 200 (real cycles in DB)
- Marketplace: real beats in beats_money_loop_cycles table
- PDIM: connected (with intermittent timeouts — has PG fallback)
- All 24 required env vars validated at startup

## Critical files created/fixed
- `shared/ml/training/musicIndustryTrainingData.ts` — stub created; absence kills 10+ route modules
- `package.json`: pnpm.overrides — object-valued npm overrides removed (caused bareSpecifier crash)
- `package.json`: pnpm.overrides — @tensorflow>tar, @mapbox>tar added with pnpm > syntax

## Install quirks
- pnpm install must run with `SKIP_POSTINSTALL=1` (postinstall script exits 1 in some Replit contexts)
- Install workflow command: `SKIP_POSTINSTALL=1 pnpm install --no-frozen-lockfile 2>&1 && echo 'INSTALL_DONE'`
- tar npm package is blocked by Replit firewall; stubs/tar/ stub + pnpm.overrides.tar = "file:./stubs/tar" handles it

## PDIM status
- URL: pocketdimensionstorage.replit.app (may sleep — wake with a GET to root first)
- STORAGE_BEARER_TOKEN is the live bearer (PDIM_BEARER_TOKEN was reconciled to same value at startup)
- App has PG session fallback so PDIM timeouts don't break auth

## What needs follow-up
- Full codebase audit (TypeScript errors, unused routes, security gaps)
- PDIM wake/reliability (it's timing out intermittently)
- FCM_SERVICE_ACCOUNT_KEY may have been truncated in source file (push notifications)
- Beat Money Loop: verify a full cycle completes (generates beat, prices, uploads, advertises, records)
