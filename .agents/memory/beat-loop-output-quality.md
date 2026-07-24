---
name: Beat loop output quality
description: Quality problems found in the beat money loop's generated content and the fixes applied to each.
---

## Stale Hook Replacement (contentPostProcessor.ts)

**Problem:** MaxCore recycles the same opening phrase on ~30% of responses:
- "What the artist was really making this whole time…"
- "This is what you've been waiting for"
- "The algorithm is finally pushing"

**Fix:** `isStaleHook()` detects these prefixes; `freshHook(mood, title)` picks from a
mood-indexed pool (dark / aggressive / melancholy / empowering / chill / upbeat /
mysterious / euphoric / driven) so each beat gets a distinct, high-energy opener.
`cleanMaxCoreContent()` now accepts `mood` and `title` params and applies the replacement.

**How to apply:** Call `cleanMaxCoreContent({ …, mood, title })` — already wired in
`_generateMaxCoreCaption` at the bottom of `beatMoneyLoopService.ts`.

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

**Problem:** Topic sent to MaxCore was `"${mood} ${genre} type beat — ${title}"` — no
price anchor, no call to action context, so MaxCore wrote awareness copy not purchase copy.

**Fix:** Topic now: `"${title} — ${mood} ${genre} type beat at ${bpm} BPM. Non-exclusive
license from $${price}. Available now on MaxBooster marketplace."` plus `beat_context`
with `license_type`, `marketplace` fields. `goal: "drive_purchase"` preserved.

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
