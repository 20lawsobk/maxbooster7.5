---
name: Content-generation endpoint crash/timeout bug class
description: Recurring failure modes across social/advertisement content-generation route handlers and how to harden them
---

# Content-generation endpoints: crash & timeout bug class

The artist-facing "generate a post / ad / video" endpoints live across
`server/routes/socialMedia.ts`, `server/routes/socialAI.ts`,
`server/routes/advertising.ts`, and `server/routes/ai.ts`. They were reported as
"failing or timing out on tasks that should've been super simple." Two distinct
failure modes recur:

## 1. Crashes from bare access on optional fields (the dominant mode)

The shared AI chokepoint `unifiedAIController.generateContent` →
`MaxCoreAIClient.infer` already has an internal `AbortSignal.timeout` (~25s) and a
local fallback, so callers of `generateContent` do NOT hang — they either return
content or crash. The crashes come from un-guarded property / `.length` access on
values that are optional or nullable:

- **`ctx = options?.userContext`** — most callers omit `userContext`, so bare
  `ctx.artistName` / `ctx.avoidTopics.length` throw. Use `ctx?.X` / `ctx?.X?.length`.
- **`options.keywords` / `options.tracklist`** — optional; use `?.length`.
- **`inlineUrlAnalysis`** — declared `null` and only assigned when a URL is found
  in the topic text; ~16 sites read `inlineUrlAnalysis.X` directly. Use
  `inlineUrlAnalysis?.X`. The `clientValue || inlineUrlAnalysis?.X` pattern is
  behavior-preserving (falls through to client value / `undefined`).
- **`autopilotPrefs` JSONB array columns** (`contentThemes`, `avoidTopics`,
  `preferredHashtags`) are nullable in the schema (no `.notNull()`/default). A
  prefs row can exist with null arrays → `autopilotPrefs.contentThemes.length`
  throws. Use `?.length`. **Fresh-user tests don't cover this** (no prefs row →
  the whole `if (autopilotPrefs)` block is skipped).
- **`performers` / `keywords` / `tags` from `req.body`** — destructured without
  defaults, so `undefined` when omitted, and may be a non-array if a client sends
  a string. Guard array ops with `Array.isArray(x) && x.length`, not just
  `x?.length` (a string has `.length` but no `.join`).

**Why:** these handlers fan a single MaxCore call out through a lot of
context-enrichment glue; every optional input is a latent null-deref. The crash
surfaces as a fast 500 ("Failed to generate ..."), not a timeout.

**How to apply:** when touching any content-generation handler, grep the handler
for destructured `req.body` fields and nullable objects and confirm every
`.length` / `.slice` / `.map` / property access is guarded. Verify with BOTH a
minimal payload (omit optional fields) AND a malformed payload (send a string
where an array is expected).

## 2. Un-timed storage / MaxCore awaits (calendar + hashtags)

Some endpoints awaited PDIM storage or a MaxCore call with NO timeout; under PDIM
queue depth they hung for minutes. Wrap in
`Promise.race([call, new Promise((_,rej)=>setTimeout(()=>rej(...), Nms))])` with a
sane fallback. Note empty-array truthiness: `mcResult.hashtags ?? FALLBACK` does
NOT trigger on `[]`; use `mcResult.hashtags?.length ? mcResult.hashtags : FALLBACK`.

## Verified endpoints (live API test)

`POST /api/social/generate-content`, `/api/social/generate-video`,
`/api/social/beat-analyze`, `GET /api/social/calendar(/stats)`,
`/api/social/hashtags/trending`, `POST /api/advertising/generate-content`,
`/api/ai/content/generate`, `POST /api/social/generate`,
`/api/social/strategy/plan`, `/api/social/strategy/campaign` — all return real
content quickly. `/api/social/generate` was the one with the inlineUrlAnalysis /
performers / autopilotPrefs crashes.

Caveat unchanged: the video *job* still errors at the remote MaxCore side
(see maxcore-video-no-file.md) — not a local bug.

## Testing note

tsx does NOT reliably hot-reload `server/services/*.ts` or route files — always
`restart_workflow "Start application"` after editing, or stale code keeps running
(stack-trace line numbers will not match the source). `/tmp/logs/*` are snapshots
written by refresh_all_logs; call it again after a new test run or you'll read
stale errors.

## Optional platform-rules fields (multimodal text slots)

`shared/config/platformRules.ts` makes `TextRules.hashtags` OPTIONAL and some platforms omit it
entirely (youtube has no `hashtags`). Multimodal text-slot building read
`rules.text.hashtags.allowed` unguarded (server/services/multimodalGenerationService.ts) — a pack
expansion or platform list that pulls in the youtube text slot 500s with "Cannot read properties of
undefined (reading 'allowed')". Use `rules.text.hashtags?.allowed` (and guard `rules` itself where
nullable). Same class as section 1: an optional config field treated as always-present. Verified via
the content-gen HTTP harness (tests/e2e/content-generation-http.ts) by sending platforms incl.
youtube with text modality (no media pack — a pack triggers heavy/slow image+audio+video gen).
