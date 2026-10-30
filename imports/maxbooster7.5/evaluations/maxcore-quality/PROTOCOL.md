# Frozen MaxCore checkpoint quality protocol

This is an output-quality diagnostic, independent of runtime/recovery acceptance.
Neither successful loading nor finite logits count as a quality pass.
The later real-initializer/awareness-handler retest is documented separately in
`reports/maxcore-quality/AWARE-CONNECTED-RETEST.md`. It uses the same scenarios
mapped to actual API envelopes, not the old raw prompts/decoding settings.
Supported MaxCore inference requires exclusive digital-GPU execution. Merely
instantiating HyperGPU does not prove that requirement: an acceptance run must
verify execution routing and absence of CPU fallbacks in the actual serving
configuration. The recorded isolated runs did not establish this; their results
must not be generalized to properly configured digital-GPU-exclusive serving.

## Scope and preregistration

Freeze `cases.json` before the first inference; its digest is recorded in each run.
Ten newly authored nonprivate fictional scenarios cover release/process hooks,
captions, short scripts, optimization, factual constraints and Spanish. Each is
sampled with both declared seeds (20 outputs). This is a small purposive set,
not a population estimate, comprehensive safety test or media-quality benchmark.
Do not tune prompts, sampling, weights or tokenizer in response to results.

Use the checkpoint named by `model.release.json`, verify its size and SHA-256,
restore its BPE tokenizer and config, and strictly load the serving
`HyperCreativeTransformerLM`. Call the real `CreativeModel.generate` with the
script agent's 80-token, temperature 0.8 setting and its remaining defaults.
Single-lane mixed-precision HyperGPU and one BLAS/Torch thread make resource
settings explicit. No alternate model, trained replacement, server workers,
agent garble repair, prompt rewriting or synthetic response is allowed.
Clear the generation cache per sample so the second seed is not a cache hit.
Repeat the first case/seed without cache to measure replay determinism separately.
Preserve raw returned strings, sampled token IDs and all exceptions.
The serving wrapper returns the prompt followed by its completion. Score only
`raw_decoded_tokens` (the generated continuation), never credit an echoed prompt
as an answer. EOS/control markers are not prose; retain them in the evidence.

## Held-out status

The evaluator wrote the cases after this checkpoint was released, independently
of its training examples. They must never be sent to training or tokenizer
training. Scan accessible local training/data/knowledge and training-metadata
JSON/text files for exact normalized prompt matches and distinctive natural-
language spans before inference. Record file digests and matches, not corpus
contents. Fail on detected overlaps. This is an accessible-corpus contamination
check, **not proof of absence from unavailable historic corpora**, and does not
rule out semantic near-duplicates. Generic control tokens are not contamination.

## Quality criteria (fixed before seeing outputs)

Each output receives three evaluator-assigned scores, with a written rationale:

* **Coherence (0–2):** 0 = garbled/no usable sentence; 1 = understandable but
  materially broken or incomplete; 2 = fluent and understandable.
* **Task relevance (0–2):** 0 = unrelated/no usable response to task; 1 = on-topic
  but misses a principal requested element; 2 = fulfills the case's stated task.
* **Constraint/grounding (0–2):** 0 = contradicts/invents supplied facts or unusable
  text cannot demonstrate compliance; 1 = partially follows constraints;
  2 = meets the case-specific criteria without unsupported claims.

A sample passes only at **2/2/2**. This diagnostic suite passes at **16 of 20**
samples or better, with at least one passing sample in every category. Threshold
is a practical acceptance choice, not a statistically validated service-level
claim. Report per-case and aggregate counts, failures, truncation and repeated
tokens; do not use token diversity or latency as a substitute for quality.
Scores are the coding agent's explicit qualitative assessment, not independent
human review and not an external model's hidden/generated metric.

Infrastructure exceptions are recorded as errors, not assigned prose scores.
Incomplete runs cannot pass. A completed run may legitimately fail quality.
Checkpoint/release hashes must remain unchanged before and after inference.

## Reproduce

From repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python_runtime/bin/python \
  scripts/evaluate-maxcore-quality.py \
  --output reports/maxcore-quality/reproduction
```

The output directory must not already exist. No install, network credentials or
app startup is needed. `results.json` records environment, source digests,
checkpoint identity, corpus overlap checks, responses and token traces.
`responses.jsonl` is flushed after every sample for interrupted-run evidence.
Exit 0 means measurement completed and replay matched, **not quality passed**.
Exit nonzero means runner/identity/overlap/replay failure. The qualitative
assessment and final verdict are recorded separately in the checked-in report.

## Disclosed diagnostic extension after serving-path errors

The frozen serving run and trace-enabled rerun both failed in
`HyperAttention.forward_with_kv`, unpacking a four-dimensional tensor as three
dimensions, before any token. No checkpoint or runtime code was changed.
The runner therefore additionally exposes **explicit opt-in**
`--mode full-prefix-diagnostic`: the same strictly loaded HyperCreative model's
existing `forward` is called on the entire accumulated sequence at each step.
The original serving sampler, tokenizer, prompts, seeds, token budget and
rubric remain unchanged. This is not an automatic fallback, not the KV serving
path, and not proof that serving works. It is a separate measurement of the
current checkpoint through an available forward path. It cannot satisfy the
serving-path quality threshold; its scores are reported independently.
Reproduce it with the command above plus `--mode full-prefix-diagnostic` and a
new output directory. The initial pre-extension runner SHA is in the frozen
run, the traceback addition SHA in the traced run, and the final diagnostic
runner SHA in the diagnostic run. No case or threshold was revised.