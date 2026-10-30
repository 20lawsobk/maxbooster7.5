"""Fail-closed live-media learning admission; never loads or mutates serving weights.

The current audio renderer is DSP, not a learned generator. Video has neural
components, but no verified media trainer on the exclusive digital backend.
This module deliberately does not turn a successful corpus check into training
readiness. Rights below are operator attestations, not legal verification.
"""
from __future__ import annotations

import hashlib
import json
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[2]
MAX_ITEMS = 256
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_CORPUS_BYTES = 256 * 1024 * 1024


class MediaLearningBlocked(RuntimeError):
    def __init__(self, report):
        super().__init__("Live media learning blocked: " + "; ".join(report["blockers"]))
        self.report = report


def _timestamp(value):
    if not isinstance(value, str):
        raise ValueError("timestamp must be an ISO-8601 string with timezone")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def _local_file(root, relative):
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ValueError("asset and rights evidence paths must be relative local paths")
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("asset or rights evidence missing or outside corpus root")
    return path


def validate_media_manifest(manifest, corpus_root, *, modality, now=None):
    """Validate bounded, local-only, hash-bound, rights-attested live examples.

    Each item binds media and an awareness observation to a source and a dated
    training-rights attestation. No URLs are fetched, decoded, or executed.
    Container/codec usability remains a trainer prerequisite.
    """
    if modality not in ("audio", "video"):
        raise ValueError("modality must be audio or video")
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError("media manifest schema_version must be 1")
    items = manifest.get("items")
    if not isinstance(items, list) or not 2 <= len(items) <= MAX_ITEMS:
        raise ValueError("manifest requires 2..256 examples, including train and holdout")
    root = Path(corpus_root).resolve(strict=True)
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must include timezone")
    seen_ids, seen_hashes, source_splits = set(), set(), {}
    observation_splits = {}
    splits, total = set(), 0
    for item in items:
        if not isinstance(item, dict) or item.get("modality") != modality:
            raise ValueError("every example must match requested modality")
        for field in ("id", "source_id", "awareness"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"example requires nonempty {field}")
        if len(item["awareness"]) > 16384:
            raise ValueError("awareness exceeds 16384 characters")
        if item["id"] in seen_ids:
            raise ValueError("duplicate example id")
        seen_ids.add(item["id"])
        split = item.get("split")
        if split not in ("train", "holdout"):
            raise ValueError("split must be train or holdout")
        observation = " ".join(
            unicodedata.normalize("NFKC", item["awareness"]).casefold().split()
        )
        if observation in observation_splits and observation_splits[observation] != split:
            raise ValueError("normalized awareness observation leakage across train and holdout")
        observation_splits[observation] = split
        splits.add(split)
        source = item["source_id"]
        if source in source_splits and source_splits[source] != split:
            raise ValueError("source leakage across train and holdout")
        source_splits[source] = split
        observed = _timestamp(item.get("observed_at"))
        if observed > now:
            raise ValueError("observation cannot be in the future")
        rights = item.get("rights")
        if not isinstance(rights, dict) or rights.get("training_allowed") is not True:
            raise ValueError("explicit source training rights required")
        for field in ("rights_holder", "attested_by", "license"):
            if not isinstance(rights.get(field), str) or not rights[field].strip():
                raise ValueError(f"rights requires {field}")
        if _timestamp(rights.get("attested_at")) > now:
            raise ValueError("rights attestation cannot be in the future")
        if rights.get("expires_at") is not None and _timestamp(rights["expires_at"]) <= now:
            raise ValueError("source training rights expired")
        evidence = _local_file(root, rights.get("evidence_path"))
        if not 0 < evidence.stat().st_size <= 1024 * 1024:
            raise ValueError("rights evidence must be nonempty and at most 1 MiB")
        if hashlib.sha256(evidence.read_bytes()).hexdigest() != rights.get("evidence_sha256"):
            raise ValueError("rights evidence hash mismatch")
        asset = _local_file(root, item.get("path"))
        size = asset.stat().st_size
        total += size
        if not 0 < size <= MAX_FILE_BYTES or total > MAX_CORPUS_BYTES:
            raise ValueError("media corpus exceeds bounded size limits or contains empty asset")
        digest = hashlib.sha256(asset.read_bytes()).hexdigest()
        if digest != item.get("sha256"):
            raise ValueError("media asset hash mismatch")
        if digest in seen_hashes:
            raise ValueError("duplicate media content (including holdout leakage)")
        seen_hashes.add(digest)
    if splits != {"train", "holdout"}:
        raise ValueError("both train and holdout required")
    fingerprint = hashlib.sha256(json.dumps(
        manifest, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode()).hexdigest()
    return {"valid": True, "examples": len(items), "bytes": total,
            "manifest_sha256": fingerprint, "rights_status": "operator_attested",
            "media_decode_validated": False}


def media_learning_preflight(modality, manifest=None, corpus_root=None):
    """Read-only capability report, suitable for an admin admission endpoint."""
    if modality not in ("audio", "video"):
        raise ValueError("modality must be audio or video")
    blockers = []
    evidence = []
    if modality == "audio":
        blockers.append("No learned audio generator, media objective, or candidate trainer is wired; serving synthesis is procedural DSP.")
        evidence.append("ai_model/audio/digital_gpu_synth.py")
        checkpoints = []
    else:
        blockers.extend([
            "Video neural components exist but no rights-bound live-media training loop or held-out media evaluation is wired.",
            "Exclusive digital-backend forward/backward/optimizer support for VAE convolutions, normalization and temporal attention is not verified; CPU fallback is prohibited.",
        ])
        evidence.extend(["ai_model/video/diffusion/music_vae.py",
                         "ai_model/video/diffusion/temporal_dit.py",
                         "ai_model/video/diffusion/awareness_conditioner.py",
                         "ai_model/video/diffusion/maxcore_diffusion.py"])
        checkpoints = [
            {"component": name, "present": (SERVER_ROOT / "uploads" / "diffusion" / f"{name}.pt").is_file(),
             "training_provenance_verified": False}
            for name in ("vae", "dit", "conditioner")
        ]
        if not all(c["present"] for c in checkpoints):
            blockers.append("Required video component checkpoint files are missing; random initialization is not learned media.")
        blockers.append("Video checkpoint provenance, strict architecture compatibility and quality gate are not verified.")
    corpus = None
    if manifest is None or corpus_root is None:
        blockers.append("A local, hash-bound live-media manifest with source training rights and independent holdout is required.")
    else:
        try:
            corpus = validate_media_manifest(manifest, corpus_root, modality=modality)
        except (ValueError, TypeError, OSError) as exc:
            blockers.append(f"Media corpus rejected: {exc}")
    return {"schema_version": 1, "modality": modality, "status": "blocked",
            "training_ready": False, "learned_generation_verified": False,
            "serving_checkpoints_modified": False, "cpu_fallback_allowed": False,
            "external_services_used": False, "blockers": blockers,
            "implementation_evidence": evidence, "checkpoints": checkpoints, "corpus": corpus}


def require_media_learning_ready(modality, manifest=None, corpus_root=None):
    """Mandatory admission guard; never schedules a fake successful training job."""
    report = media_learning_preflight(modality, manifest, corpus_root)
    if not report["training_ready"]:
        raise MediaLearningBlocked(report)
    return report


def create_router(authorize):
    """Admin-only read-only checks. Corpus root is operator-configured, not HTTP input."""
    import os
    from fastapi import APIRouter, Body, Depends, HTTPException
    from fastapi.responses import JSONResponse

    router = APIRouter()

    def check(modality, manifest=None):
        if modality not in ("audio", "video"):
            raise HTTPException(status_code=422, detail="modality must be audio or video")
        root = os.environ.get("MAXCORE_MEDIA_LEARNING_CORPUS_ROOT")
        report = media_learning_preflight(modality, manifest, root)
        if manifest is not None and not root:
            report["blockers"].append(
                "Operator must configure MAXCORE_MEDIA_LEARNING_CORPUS_ROOT; HTTP clients cannot choose filesystem roots."
            )
        return JSONResponse(report, status_code=409)

    @router.get("/api/training/media/{modality}/preflight")
    def capability(modality: str, _admin=Depends(authorize)):
        return check(modality)

    @router.post("/api/training/media/{modality}/preflight")
    def validate_corpus(modality: str, manifest: dict = Body(...), _admin=Depends(authorize)):
        return check(modality, manifest)

    return router