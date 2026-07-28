---
name: MaxCore image endpoint is a PIL typographic card
description: /api/generate/image renders its composed awareness prompt AS TEXT on the artwork; prompts must be clean marketing copy, and no payload field suppresses the typography
---

# MaxCore image = typographic card, not a diffusion model

`/api/generate/image` on MaxCore (secure-ai-forge) returns meta
`engine: "maxbooster-pil-v1"` and `prompt_used: "Bold cinematic cover art for
<prompt> | tone: … | goal: … | audience: … | themes: …"`. The PIL engine
**renders that whole composed prompt as the card headline**, plus a
"#PROMOTIONAL • CINEMATIC" label, blue divider, and MAXBOOSTER/platform corners.

**Rules:**
- Send `prompt` = clean, short marketing copy (the hook). Keyword-stuffed
  diffusion prompts ("photorealistic…, 8k resolution, no text, no watermarks")
  get printed verbatim onto the artwork and look like debug output. "no text"
  in a prompt is meaningless — the engine isn't diffusion and always draws text.
- Only `prompt` drives the headline. Probed and ineffective: `hook`/`title`/
  `text`/`headline` fields, `intent` (background/artwork/photo), `layout`,
  `text_overlay:false`, `no_text:true`, `advanced:true`, `awareness_version`.
  The engine and prompt composition never change.
- There are NO `/advanced` or `/v2` endpoint variants — POSTs to them 404 into
  the SPA catch-all. GETs to ANY unknown path (including `/openapi.json`,
  `/docs`, `/api/capabilities`) return the dashboard HTML, so URL probing is
  useless; discover schemas via FastAPI 422 errors (POST `{}` lists required
  fields). Awareness enrichment is injected server-side by MaxCore's Node layer.
- Local compositor consequences: the card headline band sits mid-frame after
  cover-scaling, so local body overlays must live in the height-relative lower
  third (`y=h-<offset>`), and any body copy pulled from MaxCore's `script`
  must be filtered — the script interleaves narration with visual-direction/
  prompt lines (`cover art|photorealistic|8k resolution|no text|…`) and must be
  deduped against the hook.

**Why:** a user-visible bug shipped where the full image prompt appeared as
on-video text in two places (baked into the card by MaxCore + drawn locally
from script line 2), plus overlapping caption layers.

**Still open (MaxCore-side):** the card always prints the pipe-separated
awareness metadata ("| tone: … | audience: …") in its headline. Fix belongs on
secure-ai-forge (render only the topic as headline, or add a real
no-text/background mode). No client-side payload can suppress it.
