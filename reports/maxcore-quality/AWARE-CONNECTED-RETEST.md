# Retest with the server digital GPU and awareness path

## Result

The actual server model initializer and `/api/generate/text` handler were run
with the real digital GPU backend, dynamic batching, pocket GPU lifecycle,
request intelligence and the text handler's awareness assembly.

**20/20 requests failed with a 503 exception; model-output quality remains
unscored.** This is not another full-prefix diagnostic. No model implementation,
checkpoint, tokenizer, awareness implementation or generation response was
replaced.

### Positive execution evidence

* Initializer reported `Digital GPU (HyperGPU + SM102 + pdim)`.
* `HyperGPUBackend` owned the real `HyperCreativeTransformerLM` GPU; all 66
  GPU-bearing model/module references matched that backend instance.
* Actual backend status moved from **0 to 63 operations**. Server defaults were
  **512 lanes, 8 tensor cores, MIXED precision**, not the earlier single-lane
  isolated model construction.
* Call traces reached digital-GPU layer normalization and mixed GEMM for each
  request, as well as KV prefill/attention. Counters are observed runtime values,
  not simulated quality measurements.
* All 20 requests assembled **800–851 characters** of effective awareness.
* In the traced run, `quality_awareness.get_doc` and `brief_enrichment` each
  returned nonempty results **40 times** (one explicit observation plus the
  actual handler assembly per request).
* Traces include `build_context`, `merge_awareness`, `awareness_from_direction`,
  `_effective_awareness`, `_merged_awareness_for`, `_platform_optimization_awareness`,
  corpus self-sufficiency checks and quality-awareness document access.

### Observed failure chain

1. Generation executes GPU-backed normalization/projection and enters KV
   attention.
2. `forward_with_kv` raises
   `ValueError: too many values to unpack (expected 3)`.
3. Existing internal retries/batching paths also encounter that error. The
   tracer records propagation/retries; exception counts are **not** independent
   prompt counts.
4. ScriptAgent returns a candidate tagged **`source="awareness"`**, not model
   output. These actual candidates are preserved under `agent_outputs`.
5. The real text handler rejects the candidate:
   `ScriptAgent did not produce model output (source=awareness)`.
   All 20 calls end with that 503 detail.

Awareness systems were therefore not simply absent. They ran and supplied
nonempty context, but did not eliminate the failure in the model's attention
path. Counting the awareness-derived candidate as successful checkpoint
generation would contradict the handler's own source contract.

## Scope and limitations

This is an **in-process real-handler retest**, not a published HTTP,
authentication, Node-supervisor or full application test. The server was
stopped when the retest began. Its real `_init_ai_model` was invoked, including
backend setup, pocket priming, tokenizer/strict checkpoint loading, agents and
dynamic batching. `on_startup` and `_init_storage` were deliberately not called:
they launch autonomous data/training/watchdog writers. DB logging was unavailable
in the evaluation process. No temporary auth route or auth bypass was installed.

The awareness layers applicable to this existing text handler ran unchanged.
The handler itself uses `with_technique=False`; unrelated audio/video/reference
technique paths were not forced on. Nonempty awareness documents prove use of
available context, **not freshness/completeness of every external live signal**.
Background awareness refresh and storage-worker lifecycle were not part of this
test. No claim that every awareness subsystem for every modality was tested.

Importing the server also starts its existing upload janitor and job-GC daemons,
and model initialization creates render/batching infrastructure. The recorded
runs reported no upload-janitor removals and no checkpoint change; they were not
filesystem-pure. The delivered harness additionally blocks Python-side writes
to the weights directory and deletion/replacement of uploads/job files before
import. This guard was added after the recorded runs and does not change model
or awareness computation. It is not an OS sandbox. The DB logger is allowed to
fail with no database configured rather than being replaced with a mock.

GPU attachment plus operation traces prove real digital-GPU execution before
the error. They do **not** prove a complete successful exclusively-GPU generation:
generation failed, and the pre-existing awareness candidate path was exercised.
No CPU replacement model or full-prefix bypass was introduced by the harness.

The ten frozen fictional scenarios and both seed labels were retained. For the
real structured API, control tags were removed from `topic`, platform was taken
from its tag, case criteria were supplied as `instruction`, and the handler was
given `tone="authentic"` / `intent="engagement"`. Exact request envelopes are
saved. These are therefore **scenario-matched API trials, not byte-identical
prompts or decoding parameters** from the original raw-model test. The handler
owns prompt assembly, sampling and batching. Seeds are set but cross-thread
reproducibility of successful generation is not established by failed calls.

## Evidence and reproduction

* `2026-09-23-aware-connected/`: first actual-initializer/handler run.
* `2026-09-23-aware-traced/`: same requests with internal awareness-return,
  ScriptAgent-candidate and GPU-exception observations added.
* Each has `results.json` and `responses.jsonl`, including request envelopes,
  errors, per-request call traces, awareness fingerprints, GPU status,
  attachment checks and checkpoint identity.
* The traced run retains actual awareness-derived candidate text. It is labeled,
  not scored as model output. Python `StopIteration` trace entries are ordinary
  coroutine control-flow events, not additional GPU faults.

```sh
PYTHONDONTWRITEBYTECODE=1 timeout 180 python_runtime/bin/python \
  scripts/evaluate-maxcore-aware-serving.py \
  --output reports/maxcore-quality/new-aware-retest
```

Use a new output directory. Exit 0 means the requested attempts were recorded,
not that generation passed. An external timeout can leave partial evidence:
require `finished`, 20 sample rows and `checkpoint_preserved=true` before treating
the run as complete. No endpoint health/availability claim follows from this.

Both runs preserved checkpoint and release-manifest hashes. Checkpoint SHA-256:
`80c19ffc3ec155808f0a2a3ce5b75f09e203d336ebf3e076144dd6e970d3b419`.
No runtime source changes or training were made. The earlier accepted
runtime/recovery simulation remains unchanged and separate.

## Live app-to-MaxCore retest — 2026-09-27

This was a separate live-readiness retest after one controlled application
workflow restart. No model, awareness, or serving source files were changed.

### Observed

* The app listener opened on port 5000; local PDIM, the MaxCore API service, the
  model API, and local Redis listeners also came up.
* Public app `/api/health` returned **200**. The first readiness probe returned
  **503** while awareness was acquiring its ingest lease. After the initial
  scan completed, both app `/api/ready` and model `/ready` returned **200**;
  app status was `ok`.
* The MaxCore model API loaded **71/71** checkpoint tensors into
  `HyperCreativeTransformerLM` and reported `model_loaded=true`; the model
  health endpoint returned **200**.
* Unified awareness transitioned from `ready=false`, `ingest_owner=false`,
  `phase="acquiring_ingest_lease"` and
  `refresh_or_storage_unavailable` to `ready=true`, `ingest_owner=true`,
  `phase="idle"`. The completed live scan exposed 28 source-health records:
  **17 `ok`, 11 not ok**. These are the engine's observed source-health results,
  not model-quality metrics. They demonstrate that scanning ran, but do not
  establish that every source was healthy or that any one provider is the core
  awareness mechanism.
* Workflow logs showed the app querying `/api/awareness/unified/status` and
  MaxCore `/ready`, both with **200** responses. A separate startup log reported
  a MaxCore schema-ensure timeout; its relationship to the temporary lease
  failure is unproven.
* Focused offline awareness tests passed: 28 passed across `test_engine.py`,
  `test_lease.py`, and `test_sources.py`. These do not prove the live PDIM lease
  path.

### Evaluation impact and integrity

The frozen quality criteria in
[`evaluations/maxcore-quality/PROTOCOL.md`](../../evaluations/maxcore-quality/PROTOCOL.md)
remain unchanged: score each generated continuation for coherence, task
relevance, and constraint/grounding from 0–2; a sample passes only at 2/2/2,
and the suite threshold is 16/20 with at least one passing sample per category.
The live app-to-MaxCore readiness and awareness-status wiring recovered after
startup, but no authenticated context or generation request was issued in this
live retest. There are no new model outputs to score; this is **not** a quality
pass or a scored model failure. The earlier 20/20 serving-handler failures
remain historical evidence, not fresh samples from this retest.

The release manifest SHA-256 remained
`84b2d85f4ba64d97bd1e35bf939bd7faef533c5abaa1edd62d6aff6121dedef3`. The
109,368,185-byte checkpoint still matched its manifest SHA-256,
`80c19ffc3ec155808f0a2a3ce5b75f09e203d336ebf3e076144dd6e970d3b419`, after
startup. No training endpoint was called. The app did initialize its standard
background workers; this check establishes checkpoint integrity at the recorded
post-start hash, not future behavior of those workers. The accepted
runtime/recovery simulation remains separate and unchanged.