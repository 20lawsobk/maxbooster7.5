---
name: Awareness layer dual-mechanism research verification
description: When checking whether an AI content-awareness config is backed by genuine research, verify both the static registry file and any live keyword-triggered note generator — fixing one leaves the other emitting unsourced text.
---

Max Booster's content-generation awareness layer for platform-algorithm guidance has TWO independent mechanisms that both inject text into AI generation prompts: (1) a static per-platform JSON registry (`shared/social-platform-optimization.json`) loaded by `platformAwarenessOptimization.ts`, and (2) a live keyword-triggered note generator (`PLATFORM_ALGORITHM_KW` in `ContentGenerationAwarenessService.ts`, under the `awareness layer/` directory — note the literal space in the dirname) that scans real-time signals and attaches a canned note on pattern match. Verifying or fixing "is this awareness layer research-backed" requires checking BOTH; each was found unsourced independently of the other (the JSON had plausible-but-uncited fields, the keyword mechanism had ~10 generic keyword-to-canned-note entries), and fixing only one would leave the other still emitting ungrounded claims.

**Why:** Discovered during a research-and-wire task: the JSON registry's lack of sourcing was obvious on first read, but the separate live keyword mechanism doing the same conceptual job (telling the AI generator "here's how platform X's algorithm works") was easy to miss because it lives in a differently-named directory and is triggered by runtime signal matching rather than loaded as static config.

**How to apply:** Before declaring any AI-conditioning/config data "verified" or "research-backed" in this codebase, grep for every place that injects platform- or topic-specific "here's what to know" text into a generation prompt, not just the obvious static config file. Both mechanisms must carry the same evidentiary bar (dated, sourced, tier-rated) or the fix is incomplete.
