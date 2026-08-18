---
name: MaxCore /api/generate/content composer contract
description: How to call MaxCore's structured caption composer correctly — topic, instruction, variants, max_chars semantics — and the coalescer-key patch.
---

MaxCore's `/api/generate/content` is a **structured template composer**, not an instruction-follower.

Rules for callers (Node side: `callMaxCoreStructured` in `server/services/contentPipeline/contentTypeGenerators.ts` is the reference implementation):
- `topic` must be a SHORT clean phrase, **no quotes** — the composer templates it raw into hooks and hashtagifies it (`#"Title"byArtist` junk otherwise).
- `instruction`/`extra_context` = creative-angle phrases ("cliffhanger tease — what happens next stays unsaid"), NEVER meta-directives ("Write a punchy headline…") — the text is folded into awareness and can appear verbatim in body copy.
- `variants: N` returns N bodies that **share ONE hook** — distinct hooks require separate calls with different instructions, and even then the deterministic hook ranker often returns the same awareness-pool winner. Dedupe client-side; never fabricate.
- `max_chars` works and trims server-side.
- Keywords go in `content_themes` (bullets to awareness), never `preferred_hashtags` (echoed verbatim into hashtag output). Filter returned tags to `#[A-Za-z0-9_]+`.

**Why:** three rounds of live testing proved every one of these; violating any yields duplicated hooks, leaked instruction text, or junk hashtags.

**Coalescer patch (must survive reimport):** server.py `api_generate_content` async-coalescer `_key` originally covered only {platform, topic, tone, goal, awareness} — concurrent calls differing by instruction/max_chars/variants collapsed into one leader's result within the 500ms window. Patched to include instruction, extra_context, themes, brand_voice, audience, genre, mood, artist, title, variants, max_chars, include_hashtags, include_cta, preferred_hashtags. The PDIM dedup layer (`dedup_cache.key_for`) already hashes the full request and is fine.
