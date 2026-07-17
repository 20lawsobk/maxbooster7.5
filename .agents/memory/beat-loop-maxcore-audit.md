---
name: Beat Loop + MaxCore Audit
description: Live audit results for Beat Money Loop and MaxCore content endpoint connections (July 2026)
---

## MaxCore Endpoint Live Test Results

All tested via direct `fetch` with `Authorization: Bearer AI_SERVER_KEY`.

### ✅ Working (HTTP 200)
| Endpoint | Latency | Notes |
|---|---|---|
| `POST /api/generate/content` | ~0.6s | Returns caption, variants, hashtags, confidence |
| `POST /api/platform/social/generate` | ~1.3s | Returns personalized variants per platform |
| `POST /api/platform/ads/generate` | ~0.7s | Returns video/audio/text creative briefs |
| `POST /api/generate/image` | ~4.8s | Returns relative URL `/uploads/images/img_xxx.png` (PIL typographic card) |
| `POST /api/platform/video/generate` | ~2.2s | Returns scene script (sync, not job_id) |
| `POST /api/generate/audio` | ~0.6s | Returns `{job_id, status:"processing"}` — async |
| `GET /api/audio-job/:id` | slow/timeout | Endpoint exists, job is processing — poll for up to 5 min |

### ❌ Non-existent (connection timeout — not just slow)
- `POST /api/safety/screen`
- `POST /api/infer/viral-score`
- `POST /api/predict/engagement`
- `POST /api/analyze` / `/api/analyze/sentiment`
- `POST /api/platform/social/autopilot`
- `POST /api/platform/ads/autopilot`
- `POST /api/platform/distribution/plan`
- `GET /api/platform/model/info`

These are registered in `maxcoreProxy.ts` POST_PATHS/GET_PATHS but MaxCore doesn't serve them. Calls return null from `MaxCoreAIClient`, swallowed or surfaced as 503/AIUnavailableError.

## Auth: Bearer Only
- MaxCore 401s the entire request if `X-API-Key` or `X-Admin-Key` are present alongside Bearer.
- `maxcoreProxy.ts` and `maxcoreClient.ts` both enforce Bearer-only.
- `X-Admin-Key` added ONLY for `/platform/model/reload` and `/training/start-from-storage`.

## Beat Money Loop Status (live as of 2026-07-17)
- **Enabled:** true
- **20+ total cycles**, 8 successful, 12+ failed, 8 consecutive failures
- **Revenue: $0** (MaxCore audio failures prevent any cycle from completing)
- **On 12-hour backoff** cadence

### Failure Analysis
| Failure mode | Count | Root cause |
|---|---|---|
| ffmpeg error on MaxCore | 4 | MaxCore's internal audio render failing server-side |
| Both modes timeout (45s) | 3+ | MaxCore overloaded/busy |
| AI service unavailable | 2 | MaxCore returned null |

### Structural Bugs Fixed (July 2026, Session 1)
1. **`_distillScan` always returned genre=indie, mood=empowering** → fixed with random pool selection from 8-genre/mood baseline
2. **`createAdDeliveryLog` missing** from schema + storage → added `adDeliveryLogs` table + method
3. **`adCampaigns` missing `organicMetrics`/`connectedPlatforms`/`impressions`/`clicks`** → added 4 columns
4. **`musicIndustryTrainingData.ts` missing** → created full stub with all required exports

### Structural Bugs Fixed (July 2026, Session 2)
5. **Token expiry not enforced before posting** → `getUserSocialToken` in storage.ts now returns null for expired tokens; `publishContent` in platform-apis.ts logs clear per-platform failure
6. **`PLATFORMS_FOR_CAMPAIGN` only had 3 platforms** → expanded to all 6 (instagram, facebook, tiktok, twitter, threads, linkedin) — expired ones skip gracefully via (5)
7. **Orphaned "generating" cycles on server restart** → `recoverOrphanedCycles()` method added; called at startup in `setupRepeatableJobs()` via autonomousJobScheduler

### Remaining Blockers
1. **MaxCore audio ffmpeg failures**: Server-side — nothing to fix in app code; watch for stabilization
2. **Expired tokens (tiktok Jun 13, twitter Jun 17, youtube+googlebusiness Jul 14)**: Need OAuth re-connect via Social Media Management UI (Task #4)
3. **`PUBLIC_BASE_URL` env var not set**: Ad video URLs fall back to `REPLIT_DEV_DOMAIN`; set to production domain after Task #3 (publish)

## Social Accounts Token Status (admin blawzmusic@gmail.com)
| Platform | Status | Expiry |
|---|---|---|
| facebook | NO_EXPIRY (valid) | long-lived Meta token |
| instagram | NO_EXPIRY (valid) | same Meta token |
| threads | NO_EXPIRY (valid) | no expiry stored |
| linkedin | VALID | 2026-08-11 |
| tiktok | EXPIRED | 2026-06-13 |
| twitter | EXPIRED | 2026-06-17 |
| youtube | EXPIRED | 2026-07-14 |
| googlebusiness | EXPIRED | 2026-07-14 |

When a cycle succeeds with audio, facebook + instagram + threads + linkedin will post; tiktok/twitter/youtube will log a clear "expired" skip.

## How the Ad System Works
MaxCore AI replicates paid ad performance using its model. Social accounts are delivery conduits (zero ad spend). `advertisingDispatchService.activateCampaign` fans out to all matching connected+requested platforms. Expired tokens skip per-platform without aborting the whole campaign.
