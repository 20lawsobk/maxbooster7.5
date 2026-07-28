---
name: MaxCore endpoint quality & beat-loop fixes
description: Which MaxCore endpoints produce usable beat-sale content, which are broken, and what post-processing is required.
---

## Content quality per endpoint (tested July 2026)

### POST /api/generate/content  ← PRIMARY — use this
- quality_score=98 when topic is SHORT (beat title only, ≤ 25 chars)
- hook is original and on-topic when topic is brief
- **CRITICAL**: with a long topic ("145BPM $29 non-exclusive…") MaxCore jams the full phrase into hashtag[0] producing a broken 80-char tag; topic MUST be args.title only
- CTA varies: "Add {title} to playlist" (acceptable), "License This Beat" (ideal)
- hashtags are clean with short topic

### POST /api/platform/social/generate  ← BROKEN — post-processor required
- ALWAYS returns `"Exclusive: playlist editors are watching — {topic}"` hook (stale template)
- ALWAYS returns `"Support the Artist"` as CTA (generic, not a beat sale)
- Both are now caught by `cleanMaxCoreContent` / `fixPlatformCta` with `isBeatPost=true`
- The beat loop calls this endpoint; the post-processor shields it

### POST /api/platform/ads/generate  ← BROKEN — do not use for DB inserts
- headline = "Support the Artist" on every creative
- body = generic awareness copy
- filler lines ("Spotify. Spotify.") in output
- Loop ignores its output and builds its own headline/CTA from beatMoneyLoopService

### POST /api/platform/daw/generate  ← BROKEN — do not use in production
- `cta` field returns a category label (e.g. "faith and spirituality") not a CTA
- `main` hook is stale
- Never use for beat loop

### POST /api/generate/audio  ← WORKS — async, long render
- Returns {job_id, status:"processing"} in ~10s
- Render: 15–30 min; sometimes much longer
- Poll via GET /api/audio-job/:id
- 404 on poll = job expired (not auth failure) — handled with descriptive error

### POST /api/infer/viral-score  ← WORKS (heuristic only)
- Returns {viral_score: 0.45, …} — always ~0.45 regardless of content
- Consistent/safe to call; ignore the actual score value

### POST /api/safety/screen  ← WORKS
- Returns {allowed, flagged, severity, categories}

### POST /api/platform/ads/audience  ← WORKS
- Returns cold/lookalike/retargeting audiences + campaign funnel

### POST /api/platform/distribution/plan  ← WORKS (weak)
- Friday-release strategy but hashtags are just platform names; copy is generic

### POST /api/platform/video/generate  ← WORKS (skeletal)
- Sync response with 3-scene script
- Scenes contain only "{topic} — cinematic scene N"

### POST /api/platform/social/autopilot  ← PARTIAL
- autopilot_ready=false without engagement history; no topics/schedule returned

### GET /api/storage/artist/:id  ← WORKS (empty)
- Returns {profile_id, profile:{}, releases:[]} — no artist data seeded

### POST /api/storage/artist/:id  ← BROKEN (404)
- Does not accept POST; no write path found

## Stale hook prefixes (contentPostProcessor.ts STALE_HOOK_PREFIXES)
Prefixes MaxCore recycles at high volume — beat loop post-processor strips them:
- "exclusive: playlist editors are watching"
- "this is what the viral algorithm wants right now"
- "don't scroll —" / "don't scroll—"
- "what the artist was really making this whole time"
- "the secret the artist kept for six months just dropped"
- "what the producer was really making this whole time"
- "this is what you've been waiting for"
- "the algorithm is finally pushing"
- "the beat that's been on repeat in my studio"
- "drop everything and listen"

## Beat loop payload decisions
- `topic` = args.title ONLY (short string); never full "BPM $price …" phrase
- Explicit `cta: "License this beat — link in bio"` and `action: "license_beat"` added
- `platform_constraints: { allow_link_in_bio: true, cta_style: "direct_sale" }`
- `callToAction` in adCreatives DB insert = "License This Beat"
- `isBeatPost: true` passed to cleanMaxCoreContent → triggers BEAT_SALE_CTAS pool swap for generic CTAs on instagram/tiktok/threads/facebook

## MaxCore cold-sleep behavior
- secure-ai-forge.replit.app enters deep sleep after ~30 min of no traffic
- Recovery time: unknown (has been 60+ min with 000 on all endpoints)
- Health ping at /api/health fails even when generation endpoints work (flaky)
- All PDIM/Redis timeouts in app logs are unrelated to MaxCore connectivity
