"""Bounded isolated smoke training. No deployment or promotion operation exists."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from unittest.mock import patch

import torch

from ai_model.model.candidate_model import CandidateModel, CandidateTransformer
from ai_model.gpu.candidate_training import array
from ai_model.training.candidate_corpus import build_manifest, smoke_records

ROOT = Path(__file__).resolve().parents[2]
from ai_model.training.storage import training_root
CANDIDATES = training_root(ROOT) / "candidate_runs"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def protected_hashes():
    paths = list((ROOT / "ai_model" / "weights").glob("*"))
    paths.append(ROOT / "ai_model" / "model" / "tokenizer.py")
    return {str(p.relative_to(ROOT)): sha256(p) for p in sorted(paths) if p.is_file()}


def promotion_gate(report, *, evidence=None):
    # The registry validates files and signatures, not caller booleans.
    if evidence is not None:
        from ai_model.training.candidate_registry import eligibility
        return eligibility(**evidence)
    reasons = ["Verified artifact bundle, frozen evaluation and signed independent review required"]
    if report.get("smoke_only") is not False:
        reasons.append("Smoke-only or missing corpus classification")
    if report.get("protected_unchanged") is not True:
        reasons.append("Missing or failed release-integrity evidence")
    return {"eligible": False, "reasons": reasons, "promotion_performed": False}


def train_smoke(run_id, steps=24, seed=1729, architecture="mlp"):
    return train_validated(run_id, steps, seed, architecture,
                           build_manifest(smoke_records(), [], smoke_only=True))


def train_validated(run_id, steps, seed, architecture, manifest, *, holdout_sha256=None,
                    input_sha256=None, lr=0.2, manual_backward=False, context_tokens=128, learning_stream=None):
    if not run_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in run_id):
        raise ValueError("run-id must contain lowercase letters, digits, - or _")
    if not 1 <= steps <= 64:
        raise ValueError("Smoke steps must be 1..64")
    if architecture not in ("mlp", "transformer", "public-content"):
        raise ValueError("Unknown candidate architecture")
    transformer = architecture in {"transformer", "public-content"}
    if manual_backward and not transformer:
        raise ValueError("Manual backward requires transformer")
    if manifest["smoke_only"] and transformer and steps > 8:
        raise ValueError("Transformer smoke is capped at 8 steps")
    before = protected_hashes()
    destination = CANDIDATES / run_id
    # Refuse symlinks and existing runs; no path argument can target release weights.
    if CANDIDATES.is_symlink() or CANDIDATES.resolve() != CANDIDATES:
        raise ValueError("Candidate directory cannot contain symlinks")
    destination.mkdir(parents=True, exist_ok=False)
    os.environ["POCKET_ACCEL_ENABLED"] = "0"
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)
    parent = None
    model = None
    public_live = (not manifest["smoke_only"] and manifest.get("records") and all(
        row.get("provenance_type") == "maxcore_live_awareness_observation"
        for row in manifest["records"]))
    if public_live:
        if not transformer or not manual_backward:
            raise ValueError("Public cumulative training requires exclusive transformer backend")
        from .public_resume import load_public_parent
        model, parent = load_public_parent(CANDIDATES, context_tokens, learning_stream=learning_stream)
    if model is None:
        if architecture == "public-content":
            from ai_model.model.candidate_model import PublicContentTransformer
            from .public_curriculum import peak_stream
            if learning_stream != peak_stream(learning_stream.get("model_config") if learning_stream else None):
                raise ValueError("Explicit public peak-content migration stream required")
            model = PublicContentTransformer(seed, context=context_tokens, **learning_stream["model_config"])
        else:
            model = CandidateTransformer(seed, context=context_tokens) if transformer else CandidateModel(seed)
    model.train()
    optimizer_state = getattr(model, "_public_optimizer_state", {}) if learning_stream else None
    from .public_resume import optimizer_digest
    initial_optimizer_sha256 = optimizer_digest(optimizer_state) if learning_stream else None
    generation = parent["learning_generation"] + 1 if parent else 0

    model.smoke_only = manifest["smoke_only"]
    curriculum = None
    texts = [record["text"] for record in manifest["records"]]
    if learning_stream:
        from .public_curriculum import training_texts
        texts, curriculum = training_texts(manifest["records"])
    inputs, targets = [], []
    if architecture == "mlp":
        for record in manifest["records"]:
            ids = [257] + model.tokenizer.encode(record["text"]) + [258]
            for index in range(1, len(ids)):
                window = ids[max(0, index - model.context):index]
                inputs.append([256] * (model.context - len(window)) + window)
                targets.append(ids[index])
        x, y = torch.tensor(inputs), torch.tensor(targets)
    if transformer:
        # One packed sequence, explicit EOS/BOS boundaries, all next-byte targets.
        packed = []
        for text in texts:
            packed += [257] + model.tokenizer.encode(text) + [258]
        # Keep all targets addressable. Each bounded update visits only its
        # reported chunks, continuing the cursor across later public updates.
        chunks = [packed[i:i + model.context + 1]
                  for i in range(0, len(packed) - 1, model.context)]
        x, y = torch.tensor([chunks[0][:-1]]), torch.tensor(chunks[0][1:])
    def logits():
        if transformer:
            return model.sequence_logits(x).reshape(-1, 259)
        return model(x)
    initial_weights = {k: v.detach().clone() for k, v in model.state_dict().items()}
    from .public_resume import weights_digest
    initial_weights_sha256 = weights_digest(initial_weights)
    coverage = None
    if transformer:
        start_step = parent.get("coverage_steps", 0) if parent else 0
        indices = [(start_step + step) % len(chunks) for step in range(steps)]
        coverage = {"schema": 1, "policy": "rolling-chunk-cursor-v1",
                    "manifest_sha256": manifest["sha256"],
                    "start_step": start_step, "end_step": start_step + steps,
                    "chunk_indices": indices,
                    "target_counts": [len(chunks[index]) - 1 for index in indices]}
    losses, forward_calls, backward_calls, trained_tokens = [], 0, 0, 0
    try:
        # Count actual backend GEMM method invocations separately across backward;
        # this wraps real computation, not fabricated backend telemetry.
        with patch.object(model.backend.gpu, "gemm", wraps=model.backend.gpu.gemm) as calls:
            for step in range(steps):
                if transformer:
                    chunk = chunks[coverage["chunk_indices"][step]]
                    x, y = torch.tensor([chunk[:-1]]), torch.tensor(chunk[1:])
                trained_tokens += y.numel()
                for parameter in model.parameters():
                    parameter.grad = None
                start = calls.call_count
                if manual_backward:
                    phase_start = calls.call_count
                    def phase_hook(phase):
                        nonlocal phase_start, forward_calls, backward_calls
                        count = calls.call_count - phase_start
                        if phase == "forward":
                            forward_calls += count
                        else:
                            backward_calls += count
                        phase_start = calls.call_count
                    measured_loss, _gradients = model.backend.manual_train_step(
                        model, array(x), array(y), lr, phase_hook,
                        **({"optimizer_state": optimizer_state, "max_grad_norm": 1.0, "weight_decay": 0.01}
                           if learning_stream else {}))
                    losses.append(measured_loss)
                    continue
                loss = model.backend.cross_entropy(logits(), y)
                forward_calls += calls.call_count - start
                if not model.backend.dispatch("finite", array(loss)):
                    raise ValueError("Nonfinite candidate loss")
                start = calls.call_count
                loss.backward()
                backward_calls += calls.call_count - start
                if any(p.grad is None or not model.backend.dispatch("finite", array(p.grad))
                       for p in model.parameters()):
                    raise ValueError("Missing or nonfinite gradient")
                model.backend.sgd_step(model.parameters(), lr=lr)
                losses.append(float(loss.detach()))
        with torch.no_grad():
            if manual_backward:
                weights = {name: array(p) for name, p in model.named_parameters()}
                final_logits, _ = model.backend.dispatch("transformer_forward", weights, array(x),
                                                          getattr(model, "model_config", None))
                final_loss = float(model.backend.dispatch(
                    "cross_entropy", final_logits.reshape(-1, 259), array(y))[0])
            else:
                final_loss = float(model.backend.cross_entropy(logits(), y))
        changed = [k for k, v in model.state_dict().items()
                   if not model.backend.dispatch("equal", array(v), array(initial_weights[k]))]
        if backward_calls == 0 or not changed:
            raise ValueError("No backend backward computation or weight updates")
        checkpoint = destination / "candidate.pt"
        torch.save({"architecture": model.architecture, "context_tokens": model.context,
                    "smoke_only": manifest["smoke_only"],
                    "tokenizer": model.tokenizer.version, "seed": seed,
                    "model_config": getattr(model, "model_config", None),
                    "optimizer_state": optimizer_state,
                    "initial_optimizer_sha256": initial_optimizer_sha256,
                    "steps": steps, "manifest_sha256": manifest["sha256"],
                    "training_parent": parent, "learning_generation": generation,
                    "coverage": coverage, "learning_stream": learning_stream,
                    "curriculum": curriculum,
                    "initial_weights_sha256": initial_weights_sha256,
                    "state_dict": model.state_dict(),
                    "holdout_sha256": holdout_sha256,
                    "training_backend_scope": "manual-digital-v1" if manual_backward else "torch-autograd-v1",
                    "optimizer": {"type": "candidate-dispatched-adamw" if learning_stream else "candidate-dispatched-sgd", "lr": lr}}, checkpoint)
        after = protected_hashes()
        if before != after:
            raise RuntimeError("Protected artifact hashes changed during training")
        report = {"training_parent": parent, "learning_generation": generation, "initial_weights_sha256": initial_weights_sha256,
                  "initial_optimizer_sha256": initial_optimizer_sha256,
                  "optimizer_sha256": optimizer_digest(optimizer_state) if learning_stream else None,
                  "coverage": coverage, "learning_stream": learning_stream,
                  "curriculum": curriculum,
                  "final_weights_sha256": weights_digest(model.state_dict()), "schema": 1, "smoke_only": manifest["smoke_only"], "seed": seed, "steps": steps,
                  "holdout_sha256": holdout_sha256, "input_sha256": input_sha256,
                  "backend_exclusive": manual_backward, "trained_tokens": trained_tokens,
                  "training_backend_scope": "manual-digital-v1" if manual_backward else "torch-autograd-v1",
                  "inference_backend_scope": "manual-digital-v1" if transformer else "torch-storage-autograd-disabled",
                  "corpus_chunks": len(chunks) if transformer else 1,
                  "chunks_seen": len(set(coverage["chunk_indices"])) if coverage else 1,
                  "torch_version": str(torch.__version__), "device": "cpu",
                  "architecture": model.architecture, "model_config": getattr(model, "model_config", None),
                  "context_tokens": model.context, "training_loss": losses,
                  "final_training_loss": final_loss, "training_tokens": y.numel(),
                  "gemm_forward_calls": forward_calls, "gemm_backward_calls": backward_calls,
                  "candidate_dispatch_counts": dict(model.backend.dispatch_counts),
                  "execution_contract": (("software DigitalGPU initialization/forward/backward/clipped AdamW; torch storage and serialization"
                                          if learning_stream else
                                          "software DigitalGPU initialization/forward/backward/gradient accumulation/SGD; torch storage and serialization")
                                         if manual_backward else
                                         "software DigitalGPU NumPy kernels; torch storage, views, initialization and autograd orchestration/gradient accumulation"),
                  "changed_parameters": changed, "checkpoint_sha256": sha256(checkpoint),
                  "manifest_sha256": manifest["sha256"], "protected_before": before,
                  "protected_after": after, "protected_unchanged": True,
                  "sample": model.generate("T", min(6, model.context - 2)),
                  "quality_claim": "none; training loss is not holdout quality"}
        report["promotion"] = promotion_gate(report)
        for name, value in (("corpus.manifest.json", manifest), ("report.json", report)):
            with (destination / name).open("x") as stream:
                json.dump(value, stream, indent=2, sort_keys=True)
        return report
    except Exception:
        # An interrupted/failed run has no valid report and cannot pass any gate.
        (destination / "FAILED").touch(exist_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--steps", type=int, default=24)
    parser.add_argument("--seed", type=int, default=1729)
    parser.add_argument("--architecture", choices=("mlp", "transformer"), default="mlp")
    args = parser.parse_args()
    print(json.dumps(train_smoke(args.run_id, args.steps, args.seed, args.architecture), indent=2))


if __name__ == "__main__":
    main()
