# Documented stack versus current quality-test path

Read-only source investigation, September 24, 2026. This is not a new live
generation run or confirmation of the documented historical 104/104 result.

## Documented design

`external/maxcore/DOCS.md` describes the awareness bridge, ScriptAgent,
HyperGPU-backed transformer, KV cache, pocket acceleration, dedicated modality
pipelines, and storage/proxy integration. Section 12 requires model compute
through the Digital GPU; the CPU is its physical substrate, not a replacement
model backend. Section 10 requires comparing ad model hooks against pool hooks.
Sections 7 and 10 also describe template degradation. Those historical
composition rules are not equivalent to accepting only raw checkpoint output.

## Current source observations

All paths below are relative to `external/maxcore/artifacts/ai-training-server/`.

* `server.py:780-812` initializes HyperGPUBackend and its HyperGPU, including
  pocket-accelerator initialization. The model/agent construction path continues
  through `server.py:849-937`. The Digital GPU is not simply absent from the
  serving implementation. Host CPU tensor placement alone is not a bypass.
* The awareness bridge still merges caller direction and signals in
  `ai_model/generation/orchestrator.py`; ScriptAgent formats an awareness prefix
  and calls CreativeModel (`ai_model/agents/script_agent.py:942-970`).
* `ai_model/model/creative_model.py:167-172` rejects encoded prompts with more
  than 40% unknown tokens. This happens before transformer generation. The
  original awareness-suite log records that exact rejection and a zero GPU
  operation delta. Those calls do not demonstrate the intended GPU generation
  stack processing the prompts unsuccessfully; they demonstrate an earlier
  rejection. A separate short-prompt probe did record GPU execution, but is not
  a substitute for these quality scenarios.
* `_ad_hook_score` remains defined at `server.py:5857`, but a source search
  finds no calls to that function in this file. Current `_generate_ad_creative`
  calls ScriptAgent and requires model provenance instead of performing the
  documented model-hook versus pool-hook comparison (`server.py:5888-5940`).
* Current ScriptAgent raises on failed or unsuitable model output rather than
  applying the documented template degradation. Recent repair work deliberately
  tightened generation and provenance checks. Consequently, the tests were run
  against a different acceptance/composition path from the historical docs.
* Some generic `/generate/*` handlers return explicitly labeled specifications,
  not rendered media. Their success must not be confused with execution of the
  dedicated rendering and storage paths.

## Conclusion and remaining boundary

The previous conclusion was too broad if interpreted as “the original documented
stack has been fully exercised and only the checkpoint is at fault.” The
checkpoint/tokenizer limits are measured facts, but wiring, early rejection,
composition, and dedicated-pipeline differences must be distinguished.

This inspection establishes current source differences, not that re-enabling
historical template behavior would restore legitimate model quality or satisfy
the user's no-fallback requirement. No guard, model, checkpoint, or runtime was
changed during this investigation. Properly routed live generation, exclusive
Digital-GPU compute across modalities, and the full storage/client chain remain
unaccepted. The independent runtime/recovery acceptance is unchanged.