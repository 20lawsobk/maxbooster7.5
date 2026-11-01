# MaxCore held-out output quality — September 23, 2026

## Findings

**Expanded dedicated-type diagnostics:** See
[DEDICATED-TYPES.md](DEDICATED-TYPES.md) for 21 generation scenarios and eight
targeted corrected trials, including actual image/audio/video files.
**The full storage/client chain is not accepted:** see
[END-TO-END.md](END-TO-END.md) for the authenticated browser evidence and the
recurring startup prerequisite that blocked the expanded request.

**Subsequent connected retest:** See [AWARE-CONNECTED-RETEST.md](AWARE-CONNECTED-RETEST.md)
for actual server initialization and text-handler trials with verified
digital-GPU operations and nonempty awareness processing. All 20 calls raised
503 after the attention error and rejection of awareness-derived non-model
output. This supersedes the earlier lack of connection evidence, but still
does not establish successful generation or a model-output quality score.

**Required operating configuration:** MaxCore must use its digital GPU system
exclusively. These isolated runs instantiated HyperGPU/HyperCreativeTransformerLM,
but did not verify exclusive digital-GPU execution or the complete live server
configuration. The full-prefix result below is only a diagnostic observation,
not a quality verdict on properly configured digital-GPU-exclusive serving.
The isolated KV-path error likewise needs confirmation in that configuration.
The recorded CPU device denotes host tensor placement; it does not by itself
prove either digital-GPU bypass or exclusive digital-GPU execution.

**Current KV-cache serving quality: unmeasurable.** All 20 frozen trials
failed before a token was sampled. The traced rerun reproduced all 20 errors:
`ValueError: too many values to unpack (expected 3)` at
`HyperAttention.forward_with_kv`, where `q.shape` is four-dimensional.
No generated answers exist for these failed serving calls; none were invented
or assigned a prose score.

**Same-checkpoint full-prefix diagnostic: quality FAIL, 0/20 samples pass.**
The unchanged model's existing full forward path produced actual continuations
for all 20 trials. Direct inspection found garbled fragments, unknown markers
and leaked control tokens in every response. None met its requested task.
This is evidence about the checkpoint/tokenizer combination through that
explicit diagnostic path, **not a passing serving evaluation**.

**The accepted runtime/recovery simulation remains a separate result.**
This evaluation does not reopen, replace or declare that simulation failed.
Finite deterministic forward execution never established held-out text quality.

## Preservation and provenance

* Checkpoint: `external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt`
* Size: **109,368,185 bytes**
* SHA-256: `80c19ffc3ec155808f0a2a3ce5b75f09e203d336ebf3e076144dd6e970d3b419`
* Checkpoint and release-manifest hashes match before/after all three runs.
* No training, tokenizer fitting, model/runtime source changes, checkpoint
  promotion, quarantine, network service startup or release-claim edit occurred.
  The release manifest intentionally still says `not-evaluated`; this report
  is separate evidence, not permission to promote the checkpoint.
* Ten new fictional nonprivate inputs were frozen before inference, with two
  fixed seeds each. No case, seed, sampling setting or scoring threshold was
  changed after viewing results.
* Fixture SHA-256:
  `e23b2ff7ab71f554fd64ceb74d6ecfc2a39745798fd26aaa160806e1c690c66a`
* Accessible-corpus scan: **11 files, no exact normalized full-prompt or
  12-word-span matches**. File paths/digests are recorded, not corpus text.
  Historic unavailable corpora and semantic near-duplicates cannot be excluded.
  “Held out” means newly authored and excluded from all training in this work,
  not certified contamination-free across undocumented historic training.

## Fixed criteria and assessment

Protocol: `evaluations/maxcore-quality/PROTOCOL.md`.
Each sample must score 2/2 for coherence, relevance and constraint/grounding.
The suite threshold is at least 16/20 passing samples and at least one pass
in every category. Unusable text earns 0 for demonstrated grounding; that is
not a claim that every random fragment is a factual hallucination.
The evaluator is Replit Agent, reading the real outputs; this is not independent
human review, an external LLM judge or a generated metric.

| Case | Coherence / relevance / grounding, each seed | Passes |
|---|---|---|
| Release hook | 0 / 0 / 0 | 0/2 |
| Production hook | 0 / 0 / 0 | 0/2 |
| Event caption | 0 / 0 / 0 | 0/2 |
| Beat caption | 0 / 0 / 0 | 0/2 |
| Teaching script | 0 / 0 / 0 | 0/2 |
| Story script | 0 / 0 / 0 | 0/2 |
| Retention optimization | 0 / 0 / 0 | 0/2 |
| CTA optimization | 0 / 0 / 0 | 0/2 |
| Grounded summary | 0 / 0 / 0 | 0/2 |
| Spanish caption | 0 / 0 / 0 | 0/2 |

`assessment.json` contains case-specific rationales applying individually to
both listed seeds. Scores refer only to generated continuations: the real
wrapper's returned string includes its decoded input, which must not receive
credit as an answer.

## Actual output example

Release hook, seed 23101, **start of generated continuation** (not fabricated
or normalized; full output and token IDs remain in the evidence):

> &lt;UNK&gt; &lt;UNK&gt; &lt;UNK&gt; &lt;UNK&gt; &lt;UNK&gt; &lt;UNK&gt; believed &lt;UNK&gt; &lt;UNK&gt; 19 &lt;UNK&gt; &lt;UNK&gt; &lt;UNK&gt; &lt;UNK&gt; this &lt;UNK&gt; &lt;UNK&gt; Dreams

The full response continues with unknown markers, fragments such as `17on`,
`if'Frequency'`, and `<PLATFORM_LINKEDIN>` rather than a piano-release hook.
All other outputs were read as well; selection of this example did not determine
the scores.

## Measured diagnostics (not quality substitutes)

* **20/20** diagnostic calls returned, **1,600** generated token IDs total.
* **20/20** exhausted the fixed 80-token budget; no early EOS completion.
* **4,052/4,248** input token IDs were the tokenizer's unknown ID (**95.4%**).
* Generated continuations contained **989 literal `<UNK>` markers**. This is
  a decoded-marker count, not necessarily the number of sampled unknown IDs:
  the sampler masks its known unknown-ID entry, while unmapped output IDs can
  also decode to that marker. Root cause has not been established here.
* Per-sample distinct-token fraction: **0.500–0.6375**; distinct tokens still
  do not yield coherent sentences.
* Uncached repeat of the first diagnostic prompt/seed matched the token trace
  and returned string exactly. This is one replay check, not a cross-hardware
  determinism guarantee.
* Total measured generation time for the 20 diagnostic calls: **348.51 s**,
  excluding setup and replay. Not a production latency benchmark.

Environment: Python 3.12.13, Torch 2.13.0+cpu, NumPy 2.4.6, CPU, one Torch/BLAS
thread, one HyperGPU lane/core, MIXED precision. Actual model configuration is
dim=512, layers=8, heads=8, max_len=1024. Source digests and environment details
are recorded in `results.json`.

## Evidence and reproduction

* `2026-09-23-frozen/`: original serving trial, with all exceptions.
* `2026-09-23-traced/`: same cases with full exception stacks added.
* `2026-09-23-full-prefix/`: opt-in diagnostic with real outputs/token traces.
* Each directory contains `results.json` and per-sample flushed
  `responses.jsonl`. Historical runner digests differ because traceback
  recording and the disclosed diagnostic option were added; inputs did not.
* Full-prefix diagnosis recomputes the complete sequence at each step through
  the unchanged `HyperCreativeTransformerLM.forward`; it does not use the
  failing KV attention path. It retains the real sampler/tokenizer.
  It cannot establish equivalence to repaired KV serving.

Reproduction commands and scope are in the protocol. Quick evidence checks:

```sh
PYTHONDONTWRITEBYTECODE=1 python_runtime/bin/python evaluations/maxcore-quality/test_protocol.py
PYTHONDONTWRITEBYTECODE=1 python_runtime/bin/python evaluations/maxcore-quality/verify_evidence.py
```

No application UI changed, so no workflow restart or browser test is needed.
The model itself remains unchanged for further diagnosis. Repairing serving
attention and investigating checkpoint/tokenizer compatibility require
separate work before a fresh serving-quality claim can be made. This small
text suite says nothing about image, audio or video quality and makes no
population-level reliability or safety claim.