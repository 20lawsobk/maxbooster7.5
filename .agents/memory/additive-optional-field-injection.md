---
name: Additive optional-field injection (byte-for-byte no-feature path)
description: How to inject optional fields into existing request/config/queue objects without changing the no-feature object shape
---

When an OPTIONAL feature injects fields into an EXISTING object (an AI-request literal, a queue item, a config default) under a "no-feature ⇒ byte-for-byte identical behavior" requirement:

- Inject NEW keys with a CONDITIONAL SPREAD: `...(x ? { k: x } : {})`. Do NOT write `k: x ?? undefined` or `k: maybeUndef` — that adds an OWN property whose value is `undefined`, which changes `Object.keys`, `'k' in obj`, pre-serialize shape, and any shallow-merge / diff / event consumer. The conditional spread adds the key ONLY when defined.
- For a key that ALREADY existed on the no-feature path (e.g. `topic`, `contentType`), `value ?? original` is fine — the key was always present, only the value changes, and the value is identical when the override is undefined.
- Do NOT add a default empty value (`sourceUrls: []`) to an emitted/persisted config default just to "document" a new optional field. Rely on the consumer's `if (!x || x.length === 0)` guard so `absent === empty`, keeping the default-config shape unchanged. Grep-confirm the field is read ONLY through that guarded path before omitting the default.

**Why:** the repo's "honest / additive / reversible" rule means a consumer that observes the object BEFORE JSON serialization (events, diffs, shallow merges) must see the exact same shape when the feature is off. `undefined`-valued keys silently violate this. Caught by architect review on the advanced-URL-parser feature.

**How to apply:** any time you thread an optional `xBrief?` / `sourceUrls?` / override into a pre-existing object literal or config default in autopilot / content-generation code. Note there are TWO URL→generation seams: the autopilot `advancedSocialAIService.generateAdvancedContent` call, and the manual routes (`/generate-from-url`, `/analyze-url`, socialAI inline detection) which call `analyzeUrl` → `urlToContentSeed` → `unifiedAIController.generateContent`.

**Parser-engine swap (later):** the Python URL parser (`urlAnalyzer.py` + the subprocess-based `analyzeUrl`) is DELETED. `analyzeUrl` is now a thin TS adapter over `advancedUrlParser.parseUrl` that maps `ParsedUrl` → the still-intact `UrlAnalysis` contract, so consumers/client are unchanged and there is no separate enrichment overlay anymore. The rich `UrlAnalysis` engagement/event/product fields (`view_count`, `event_date`, `price`, `performers`, …) are EMPTY BY DESIGN now — do NOT treat their emptiness as a bug or re-introduce a Python parser. When mapping the parser's structured `UrlCategory` into the flat `content_type`/`platform_category`, map faithfully (see `URL_CATEGORY_TO_ANALYSIS`) or you silently regress CTA selection and `=== "website"` promo detection.
