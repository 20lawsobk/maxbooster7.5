---
name: MaxCore-only fail-explicit AI contract
description: The durable rule that AI features must be MaxCore-sourced and fail explicitly, plus the deliberate carve-outs
---

# AI features are MaxCore-only and must FAIL EXPLICITLY — never substitute local output

**The rule:** every AI generation feature is sourced from the external MaxCore server via `server/lib/aiSource.ts` (`requireMaxCore` / `AIUnavailableError`, HTTP 503). When MaxCore is unavailable, the feature fails explicitly — it must NOT fall back to local ML models, rule engines, DSP synthesis, template strings, or caller-supplied input dressed up as generated content.

**Why:** local fallbacks silently produced template-tier output; the product requires users to see explicit unavailability, never fabricated local content. Both the "return original/opts input on empty MaxCore" pattern and the "success on a non-null-but-empty response" pattern are prohibited.

**How to apply — two failure modes, both required:**
1. **Null result** → `requireMaxCore(result, feature)` throws.
2. **Structurally-empty result** (non-null but no *usable domain content*) → throw `AIUnavailableError` explicitly. Gate on the actual required fields (e.g. notes/hits/chords for music, a non-empty caption OR hook/body/cta for copy, a non-empty recommendation array), NOT merely on `!= null`. Conversely, do not over-narrow: accept ALL valid response shapes before declaring unavailability (rejecting a caption-only response because "hook" was absent is a regression).
- **Request paths:** the global error handler maps `AIUnavailableError.statusCode` → 503. A catch-all `res.status(500)` will SWALLOW the 503 — the catch MUST check `instanceof AIUnavailableError` first.
- **Background callers:** the throw is caught by their existing try/catch (log-and-skip), never a crash.

## Deliberate carve-outs — do NOT "fix" these into MaxCore-only
- The **"Max" in-app assistant** stays fully local.
- **Four render-helper models** (CreativePlannerModel, BeatSyncAlignmentModel, VideoCreativeScorer, KeyframeStyleSelector) have **no MaxCore counterpart** and stay local, including their local synthetic training-data seeding at startup. A MaxCore endpoint for them is a *new feature*, not a fallback.
- **Compliance screening** is fail-CLOSED on MaxCore's safety screen but deliberately KEEPS local deterministic regex checks as an *additive* guardrail — MaxCore's screen was observed to miss obvious abuse. This is added safety, not a leftover content fallback.
- Supplementary metadata (e.g. hashtags) may fall back to a caller-supplied list when MaxCore omits it — that is metadata, not the generated body.

Video/FFmpeg compositing and DSP metering (loudness) are processing, not AI generation — leaving their non-AI fallbacks is fine.

## External servers are always-on BY DESIGN
The external **MaxCore** (AI/inference) and **PDIM** (storage) servers are designed to stay active and available at all times (owner-confirmed). This is the premise of the fail-explicit contract: a MaxCore/PDIM failure is a *real* operational signal to surface (503 / explicit error), NOT a routine condition to mask with locally-generated content. Do not add "resilience" local fallbacks on the assumption these servers go down normally — they aren't supposed to.
