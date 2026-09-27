"""Opt-in adapter only. This module never alters server globals or legacy weights.

Integration contract for the server owner:
1. Keep the current CreativeModel initializer/release as the default.
2. Construct create_candidate_adapter(runtime_only=False) only in a separately
   configured candidate slot after registry selection. Inference exclusivity
   and training exclusivity are separately checked and exposed.
3. Manual transformer inference uses only dispatched DigitalGPU math/sampling.
   Older autograd training checkpoints still disclose their training limitation.
4. Existing temperature/top_p/top_k/repetition/min_length arguments are supported;
   an explicit seed controls local per-request sampling without global RNG state.
5. Treat context/parameter errors as explicit client errors, not truncation or
   fallback. Readiness must expose unreleased and scoped backend capabilities; it cannot
   advertise quality merely because runtime_only validation passed.
No server.py changes or production opt-in are performed by this module.
"""
import json
from pathlib import Path

from ai_model.model.candidate_model import CandidateModel
from ai_model.model.sampling_context import sampling_context
from ai_model.training import candidate_registry


class CandidateServingAdapter:
    """CreativeModel-compatible sampling interface, explicit context bounds."""
    def __init__(self, model, runtime_only, training_exclusive=False):
        self.model = model
        self.tokenizer = model.tokenizer
        self.runtime_only = runtime_only
        self.unreleased = True
        self.backend_exclusive = model.architecture == "byte-causal-transformer-v1"
        self.inference_backend_exclusive = self.backend_exclusive
        self.training_backend_exclusive = training_exclusive

    def generate(self, prompt, max_new_tokens=200, temperature=0.85, top_p=0.92,
                 top_k=50, repetition_penalty=1.15, min_length=10, seed=None,
                 snapshot_hash=None):
        result = self.model.generate(prompt, max_new_tokens, temperature=temperature,
                                     top_p=top_p, top_k=top_k,
                                     repetition_penalty=repetition_penalty,
                                     min_length=min_length, seed=seed,
                                     snapshot_hash=snapshot_hash)
        # Match current CreativeModel's prompt-plus-continuation string contract.
        return prompt + result["text"]

    def generate_batch(self, prompts, max_new_tokens=30, temperature=0.85, top_p=0.92,
                       top_k=50, repetition_penalty=1.15, min_length=5, chunk_size=4,
                       seed=None, snapshot_hash=None):
        seed, snapshot_hash = sampling_context(seed, snapshot_hash, default_seed=1729)
        if not 1 <= chunk_size <= 64 or len(prompts) > 64:
            raise ValueError("Candidate batch bound exceeded")
        # Preflight every full prompt before any compute; no partial silent truncation.
        for prompt in prompts:
            if len(self.tokenizer.encode(prompt)) + max_new_tokens > self.model.context:
                raise ValueError("Batch prompt plus generation budget exceeds candidate context")
        return [self.generate(p, max_new_tokens, temperature, top_p, top_k,
                              repetition_penalty, min_length, (seed + index) % 2**64,
                              snapshot_hash)
                for index, p in enumerate(prompts)]


def create_candidate_adapter(run=None, *, runtime_only=False, require_exclusive_backend=True,
                             require_exclusive_training=False):
    if runtime_only:
        if run is None:
            raise ValueError("Explicit isolated runtime candidate run required")
        verified, report, _ = candidate_registry.verify_bundle(run)
    else:
        if run is not None:
            raise ValueError("Reviewed serving must use the atomically selected registry entry")
        pointer = json.loads((candidate_registry.REGISTRY / "selected.json").read_text())
        decision = candidate_registry.eligibility(**pointer["evidence"])
        if not decision["eligible"] or decision["fingerprints"] != pointer["fingerprints"]:
            raise ValueError("Selected candidate evidence is missing, changed or ineligible")
        verified = decision["fingerprints"]
        _, report, _ = candidate_registry.verify_bundle(verified["run"])
    checkpoint = Path(verified["run"]) / "candidate.pt"
    # Re-read into immutable bytes and verify before loading to close path-swap race.
    import hashlib
    import io
    raw = checkpoint.read_bytes()
    if hashlib.sha256(raw).hexdigest() != verified["checkpoint_sha256"]:
        raise ValueError("Checkpoint changed before adapter load")
    model = CandidateModel.load_candidate(io.BytesIO(raw))
    inference_exclusive = model.architecture == "byte-causal-transformer-v1"
    training_exclusive = report.get("training_backend_scope") == "manual-digital-v1"
    if require_exclusive_backend and not inference_exclusive:
        raise ValueError("Exclusive candidate inference is implemented for transformer only")
    if require_exclusive_training and not training_exclusive:
        raise ValueError("Exclusive training unavailable: checkpoint used torch autograd accumulation")
    return CandidateServingAdapter(model, runtime_only, training_exclusive)