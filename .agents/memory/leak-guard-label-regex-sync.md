---
name: Leak-guard regex must track new AI-conditioning field labels
description: contentPostProcessor.ts strips leaked prompt-injection directive blocks by matching an exact allowlist of field labels; any new field added to that conditioning text needs the regex updated too, or the leak-guard silently misses it.
---

`server/lib/contentPostProcessor.ts`'s `DIRECTIVE_TAG_BLOCK_RE` strips a leaked `[PLATFORM_OPTIMIZATION ...]` directive block from AI-generated output by matching an exact allowlist of field labels (e.g. "Content shape:", "Engagement signals:"). Adding a new labeled line to the conditioning text built by `platformAwarenessOptimization()` (or any similar formatter feeding a leak-guarded block) requires adding that label to this regex in the same change, or a leak of the new field's content into user-facing output will silently bypass the guard.

**Why:** Found while adding a new "Documented algorithm signals" field to the platform-optimization conditioning text — the leak-guard regex was an exact-label allowlist, not a generic "strip anything that looks like this whole block" pattern, so it would have missed the new field if not updated in lockstep.

**How to apply:** Whenever a field is added to `PlatformOptimization`'s formatted output (or any other text block whose whole purpose is internal-only conditioning that must never reach the end user verbatim), find the leak-guard regex that scrubs it and extend it in the same change. Verify by confirming `DIRECTIVE_TAG_BLOCK_RE`'s pattern list still names every label the formatter can emit.
