"""Versioned immutable request contract, independent of runtime/quality claims."""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any, Literal

Modality = Literal["text", "content", "image", "audio", "video", "campaign"]
active_plan: ContextVar["GenerationPlan | None"] = ContextVar("generation_plan", default=None)


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


@dataclass(frozen=True)
class GenerationPlan:
    """JSON strings deliberately prevent nested caller mutations after planning."""
    version: str
    modality: Modality
    topic: str
    request_json: str
    facts_json: str
    artist_context_json: str
    provenance_json: str
    constraints_json: str
    modalities: tuple[str, ...]
    snapshot_json: str
    checkpoint: str
    seed: int

    @classmethod
    def from_request(cls, req: Any, modality: Modality, checkpoint: str = "") -> "GenerationPlan":
        from ai_model.awareness import bound_snapshot
        snapshot = bound_snapshot()
        if modality not in {"text", "content", "image", "audio", "video", "campaign"}:
            raise ValueError("Unsupported generation modality")
        data = (req.model_dump(mode="json") if hasattr(req, "model_dump")
                else dict(req) if isinstance(req, dict) else vars(req).copy())
        topic = next((data[k] for k in ("topic", "prompt", "idea", "description")
                      if isinstance(data.get(k), str) and data[k].strip()), "")
        requested = data.get("modalities") or [modality]
        if not isinstance(requested, (list, tuple)) or not all(
                isinstance(v, str) and v in {"text", "content", "image", "audio", "video", "campaign"}
                for v in requested):
            raise ValueError("modalities must be a list of supported modalities")
        seed = data.get("seed")
        controls = data.get("dedicated_controls")
        if isinstance(controls, dict) and controls.get("seed") is not None:
            if seed is not None and seed != controls["seed"]:
                raise ValueError("Conflicting request and dedicated seed controls")
            seed = controls["seed"]
        if seed is None:
            seed = int(sha256(canonical([data, snapshot.to_dict(), checkpoint]).encode()).hexdigest()[:8], 16)
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
            raise ValueError("seed must be an integer in [0, 2**32)")
        return cls("generation-plan-v2", modality, topic, canonical(data),
                   canonical(data.get("facts")), canonical({
                       k: data.get(k) for k in ("artist_context", "artist", "artistProfileId",
                                               "brand_voice", "beat_context", "context")}),
                   canonical(data.get("provenance")), canonical(data.get("constraints")),
                   tuple(requested), canonical(snapshot.to_dict()), checkpoint, seed)

    @property
    def snapshot_hash(self) -> str:
        return json.loads(self.snapshot_json)["id"]

    @property
    def plan_hash(self) -> str:
        return sha256(canonical(self.to_dict(include_hash=False)).encode()).hexdigest()

    def to_dict(self, include_hash: bool = True) -> dict:
        result = {
            "version": self.version, "modality": self.modality, "topic": self.topic,
            "request": json.loads(self.request_json), "facts": json.loads(self.facts_json),
            "artist_context": json.loads(self.artist_context_json),
            "provenance": json.loads(self.provenance_json),
            "constraints": json.loads(self.constraints_json), "modalities": list(self.modalities),
            "snapshot": json.loads(self.snapshot_json),
            "snapshot_id": json.loads(self.snapshot_json)["id"],
            "snapshot_hash": self.snapshot_hash,
            "checkpoint": self.checkpoint, "seed": self.seed,
        }
        if include_hash:
            result["plan_hash"] = self.plan_hash
        return result

    def conditioning(self) -> str:
        # Explicitly data, not independently verified facts or model instructions.
        return "[CALLER_GENERATION_PLAN_UNVERIFIED] " + canonical(self.to_dict())


def validate_output(plan: GenerationPlan, output: Any, *, specification=False) -> dict:
    """Only observable checks; never infer semantic quality from render success."""
    if not isinstance(output, dict) or not output:
        raise ValueError("Generation returned no structured result")
    if output.get("success") is False or output.get("status") in {"failed", "error"}:
        return {"status": "failed", "checks": ["renderer_reported_failure"],
                "quality": "not_evaluated"}
    if specification:
        return {"status": "specification_only", "checks": ["structured_specification"],
                "artifact_validated": False, "quality": "not_evaluated"}
    if output.get("status") in {"pending", "queued", "running", "processing"} or (
            output.get("job_id") and not output.get("url")):
        return {"status": "pending", "checks": ["job_submission_only"],
                "artifact_validated": False, "quality": "not_evaluated"}
    if plan.modality in {"text", "content"}:
        strings = []
        def collect(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in {"text", "hook", "body", "caption", "script", "content"} and isinstance(child, str):
                        strings.append(child)
                    elif isinstance(child, (dict, list)):
                        collect(child)
            elif isinstance(value, list):
                for child in value:
                    collect(child)
        collect(output)
        if not any(s.strip() for s in strings):
            raise ValueError("Generation returned no nonempty text")
        constraints = json.loads(plan.constraints_json) or {}
        max_chars = (constraints.get("max_chars") if isinstance(constraints, dict) else None)
        if max_chars is not None:
            if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars < 1:
                raise ValueError("constraints.max_chars must be a positive integer")
            if any(len(s) > max_chars for s in strings):
                raise ValueError("Generated text exceeds requested constraints.max_chars")
        return {"status": "structurally_valid", "checks": ["nonempty_text", "explicit_max_chars"],
                "quality": "not_evaluated"}
    return {"status": "not_evaluated", "checks": [],
            "artifact_validated": False, "quality": "not_evaluated"}