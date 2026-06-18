---
name: Additive optional-field injection (byte-for-byte no-feature path)
description: How to inject optional fields into existing request/config/queue objects without changing the no-feature object shape
---

When an OPTIONAL feature injects fields into an EXISTING object (an AI-request literal, a queue item, a config default) under a "no-feature ⇒ byte-for-byte identical behavior" requirement:

- Inject NEW keys with a CONDITIONAL SPREAD: `...(x ? { k: x } : {})`. Do NOT write `k: x ?? undefined` or `k: maybeUndef` — that adds an OWN property whose value is `undefined`, which changes `Object.keys`, `'k' in obj`, pre-serialize shape, and any shallow-merge / diff / event consumer. The conditional spread adds the key ONLY when defined.
- For a key that ALREADY existed on the no-feature path (e.g. `topic`, `contentType`), `value ?? original` is fine — the key was always present, only the value changes, and the value is identical when the override is undefined.
- Do NOT add a default empty value (`sourceUrls: []`) to an emitted/persisted config default just to "document" a new optional field. Rely on the consumer's `if (!x || x.length === 0)` guard so `absent === empty`, keeping the default-config shape unchanged. Grep-confirm the field is read ONLY through that guarded path before omitting the default.

**Why:** the repo's "honest / additive / reversible" rule means a consumer that observes the object BEFORE JSON serialization (events, diffs, shallow merges) must see the exact same shape when the feature is off. `undefined`-valued keys silently violate this. Caught by architect review on the advanced-URL-parser feature.

**How to apply:** any time you thread an optional `xBrief?` / `sourceUrls?` / override into a pre-existing object literal or config default in autopilot / content-generation code. Note there are TWO URL→generation seams to wire: the autopilot `advancedSocialAIService.generateAdvancedContent` call AND the manual `/generate-from-url` route (which overlays `UrlAnalysis` BEFORE `urlToContentSeed` → `unifiedAIController.generateContent`).
