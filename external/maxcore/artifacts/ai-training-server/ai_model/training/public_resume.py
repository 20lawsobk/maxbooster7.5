"""Resume bounded learning only from fingerprinted public scanner candidates."""
import hashlib
import io
import json
from pathlib import Path


def weights_digest(state):
    from ai_model.gpu.candidate_training import array
    digest = hashlib.sha256()
    for name, value in sorted(state.items()):
        digest.update(name.encode())
        digest.update(array(value).tobytes())
    return digest.hexdigest()


def optimizer_digest(state):
    identity = {"step": state.get("step", 0),
                "m": weights_digest(state.get("m", {})),
                "v": weights_digest(state.get("v", {}))}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def load_public_parent(candidates, context_tokens, *, learning_stream=None):
    from .candidate_registry import public_live_eligibility
    from ai_model.model.candidate_model import CandidateModel
    candidates = Path(candidates)
    parents = []
    for run in sorted(candidates.glob("live-*")):
        certificate = candidates.parent / "live_candidate_admissions" / run.name / "certified.json"
        # Pending/failed workers are not committed learning history.
        if not certificate.exists():
            continue
        if run.is_symlink() or certificate.is_symlink():
            raise ValueError("Public learning history cannot contain symlinks")
        report_file = run / "report.json"
        if report_file.is_symlink() or report_file.stat().st_size > 2_000_000:
            raise ValueError("Invalid certified learning report")
        raw_report = report_file.read_bytes()
        certificate_data = json.loads(certificate.read_bytes())
        if hashlib.sha256(raw_report).hexdigest() != certificate_data.get("report_sha256"):
            raise ValueError("Certified learning history report changed")
        report = json.loads(raw_report)
        existing_stream = report.get("learning_stream")
        if (existing_stream is None) != (learning_stream is None):
            continue  # Explicit separate v2 migration; preserve all old v1 runs.
        if existing_stream != learning_stream:
            raise ValueError("Public learning stream changed; explicit migration required")
        generation = report.get("learning_generation", 0)
        if type(generation) is not int or generation < 0:
            raise ValueError("Invalid cumulative learning generation")
        parents.append((generation, run.name, run))
    if not parents:
        return None, None
    generation, _, run = max(parents)
    # Never fall back around the newest compatible candidate when it is corrupt.
    decision = public_live_eligibility(run)
    if not decision["eligible"]:
        raise ValueError("Certified learning history is no longer public/valid")
    identity = decision["fingerprints"]
    raw = (run / "candidate.pt").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != identity["checkpoint_sha256"]:
        raise ValueError("Public parent checkpoint changed before resume")
    model = CandidateModel.load_candidate(io.BytesIO(raw))
    expected_architecture = learning_stream["architecture"] if learning_stream else "byte-causal-transformer-v1"
    if (model.architecture != expected_architecture or model.smoke_only
            or model.context != context_tokens):
        raise ValueError("Public parent configuration is incompatible; explicit migration required")
    report = json.loads((run / "report.json").read_text())
    if learning_stream:
        if getattr(model, "model_config", None) != learning_stream["model_config"]:
            raise ValueError("Public parent dimensions changed; explicit migration required")
        import torch
        state = torch.load(io.BytesIO(raw), map_location="cpu", weights_only=True)
        optimizer = state.get("optimizer_state")
        if not isinstance(optimizer, dict) or type(optimizer.get("step")) is not int or optimizer["step"] < 1:
            raise ValueError("Public peak parent optimizer state missing")
        model._public_optimizer_state = optimizer
    return model, {"run": run.name, "checkpoint_sha256": digest,
                   "policy": "certified-public-live-v1", "learning_generation": generation,
                   "coverage_steps": report.get("coverage", {}).get("end_step", 0)}
