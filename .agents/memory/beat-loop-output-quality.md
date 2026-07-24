---
name: Beat loop output quality
description: Quality problems found in the beat money loop's generated content and the fixes applied to each.
---

## Stale Hook Replacement (contentPostProcessor.ts)

**Problem:** MaxCore recycles the same opening phrase on ~30% of responses:
- "What the artist was really making this whole time…"
- "This is what you've been waiting for"
- "The algorithm is finally pushing"
- "Real listeners know [title] is special before the algorithm catches up" (score=100, not beat-sale)
- "In this video, I'm going to show you something incredible" (video endpoint bleed)
- "New Drop Alert" (template header)

**Fix:** `isStaleHook()` detects these prefixes; `freshHook(mood, title)` picks from a
mood-indexed pool (dark / aggressive / melancholy / empowering / chill / upbeat /
mysterious / euphoric / driven) so each beat gets a distinct, high-energy opener.
`cleanMaxCoreContent()` now accepts `mood` and `title` params and applies the replacement.

**How to apply:** Call `cleanMaxCoreContent({ …, mood, title })` — already wired in
`_generateMaxCoreCaption` at the bottom of `beatMoneyLoopService.ts`.

---

## CTA Gate — Positive Allowlist (contentPostProcessor.ts `fixPlatformCta`)

**Problem:** The old deny-list regex (`GENERIC_CTA_RE`) missed many non-sale CTAs that
MaxCore emits for beat posts on visual platforms:
- "Add NightFire to the playlist — link in bio" (has "link in bio" but is NOT purchase)
- "Drop a 🔥 if NightFire hits different" (engagement)
- "Follow now and be first for every drop" (follower growth)
- "Stay close: everything behind X drops here first!" (engagement)
- "Subscribe and hit the bell" (YouTube bleed)

**Fix:** Flipped from deny-list to **positive allowlist**. For `isBeatPost=true` on
instagram/tiktok/threads/facebook: replace the CTA unless it contains:
```
/\b(licen[sc]e|lease|buy|get the|grab the|purchase|available now|first access)\b/i
```
Note: `link in bio` alone is NOT sufficient — a purchase verb must be present.

**Why:** MaxCore PDIM fallback mode degrades CTA quality significantly. The deny-list
approach required continuously expanding as new templates appeared; the allowlist is stable.

**Test:** 13/13 cases pass. "Add X to the playlist — link in bio" → REPLACE. "License
this beat — link in bio" → KEEP. "First listeners get first access — link in bio" → KEEP.

---

## Shadow-Banned Hashtag Filtering (contentPostProcessor.ts `normalizeHashtags`)

**Problem:** When PDIM is offline, MaxCore returns platform names and broad terms as
hashtags: `#instagram`, `#tiktok`, `#twitter`, `#music`, `#newrelease`, `#artist`.
These are shadow-banned on all major platforms and waste discovery slots.

**Fix:** `SHADOW_BANNED_TAGS` Set in `normalizeHashtags` strips them before merging
genre-specific tags. Ensures `#NightFire #trapbeats #traptype #808trap #darktrapsound
#beatsforsale #typebeat #producerlife` instead of `#NightFire #instagram #music #newrelease`.

---

## Body Repair: Prompt Bleed + Title Casing (contentPostProcessor.ts `repairBody`)

**Problem A:** MaxCore PDIM-fallback mode sometimes leaks prompt instructions into body:
`"Write about the actual beat — trap sound, 145 BPM. Reference these real production
facts instead of generic hype."` — literal instruction text in the post body.

**Problem B:** MaxCore lowercases the beat title in body: `"Built around one thing:
nightfire — energetic, hype, no filler."` instead of `NightFire`.

**Fix:** `repairBody(body, title)` function:
1. Strips lines starting with imperative instruction verbs (`write about`, `reference
   these`, `use the following`, `include the`, `note:`, `instruction:`)
2. Restores proper title casing via case-insensitive replace with the original title

**Applied in:** `cleanMaxCoreContent()` — runs before other body transformations.

---

## Hashtag Quality (contentPostProcessor.ts)

**Problem:** MaxCore returns malformed tags with em-dashes, commas, and spaces baked in
(e.g. `#Trapbeat—dark808bass,hi-hatrolls,140BPM`). They break every platform and
silently kill discovery. Also, universal beat-market tags (`#beatsforsale`, `#typebeat`)
were getting crowded out by the 8-slot limit when MaxCore returned a full payload.

**Fix:**
1. `isBrokenHashtag()` catches unicode en-dash/em-dash (U+2013/U+2014), commas,
   spaces, parens, brackets — anything that would break a hashtag.
2. `normalizeHashtags()` now puts `UNIVERSAL_BEAT_TAGS` FIRST, then genre tags, then
   valid MaxCore tags — guaranteeing `#beatsforsale` and `#typebeat` always appear.
3. `GENRE_HASHTAGS` expanded from 12 to 18 genres (amapiano, phonk, cloud, jersey club)
   each with 4 specific discovery tags (was 3).
4. `UNIVERSAL_BEAT_TAGS` includes `#producerlife`.

---

## Concept-Driven Beat Titles (beatMoneyLoopService.ts)

**Problem:** Every generated beat had the same generic title format
(`Dark Trap Type Beat (G Minor) 140 BPM — 07/24`). Not searchable, not memorable.

**Fix:** When MaxCore returns a `concept` or `style_hook` field in the audio response,
use it as the title prefix. Strip surrounding quotes (ASCII, curly `"`, angle `«»`).
Result: "Midnight Chase — Dark Trap Type Beat (G Minor) 140 BPM".

**Quote regex:** `/^[\u0022\u0027\u00AB\u00BB\u201C\u201D\u2018\u2019]|[\u0022\u0027\u00AB\u00BB\u201C\u201D\u2018\u2019]$/g`

---

## Richer Caption Topic (beatMoneyLoopService.ts `_generateMaxCoreCaption`)

**Problem:** `beat_context` was being sent as a formatted string — MaxCore requires a
JSON dict `{bpm, price, genre, license_type}` or returns 422. Topic was also too long
(full metadata phrase), causing MaxCore to jam it into hashtag slot 0.

**Fix:**
- `topic`: beat title only (`args.title`)
- `beat_context`: always a dict `{title, bpm, price, license_type, marketplace, action, production_details, listen_url}`
- Added `cta: "License this beat — link in bio"`, `action: "license_beat"`, `platform_constraints: {allow_link_in_bio: true, cta_style: "direct_sale"}`

---

## Audio Quality Gate (beatMoneyLoopService.ts `_generateBeat`)

**Problem:** Near-silent or low-energy audio would complete the pipeline and get listed.

**Fix:** When MaxCore returns `audio_analysis` block (loudness_db + energy), a soft gate
rejects beats with loudness < −40 dB AND energy < 0.05. Generous threshold avoids
false positives on quiet cinematic intros.

---

## TypeScript Return Type Accuracy

`_maxcoreAudio` return type now exactly matches the `finish` closure:
- Added `concept?`, `styleHook?`, `mcMusicalKey?`
- `audioAnalysis` fields `spectral_brightness` and `bass_weight` are `string` (not `number`)
  per MaxCore's schema.

---

## MaxCore PDIM Offline Behaviour (Observed)

When PDIM storage is offline, MaxCore runs in local fallback mode:
- All endpoints still respond (HTTP 200)
- `quality_score` may appear inflated (98-100) but output is degraded
- Body copy is minimal: `"Built around one thing: {title} — {tone}, no filler."`
- Hook is always a recycled stale template
- CTA is rarely a beat-sale CTA
- Hashtags are generic platform names + `#music`, `#newrelease`
- A `storage_warning` field is present in the response

Post-processor catches all of the above; the cycle can still produce usable output
even with PDIM offline, as long as `cleanMaxCoreContent` runs with `isBeatPost: true`.
