"""Dispatch exact opt-in controls to honest, decoded-artifact-validated renderers."""
import inspect
import shutil
from pathlib import Path
from uuid import uuid4


def conditioned_controls(modality, controls):
    """Only measured, compatible absent controls get snapshot defaults."""
    from ai_model.awareness import bound_snapshot
    snapshot = bound_snapshot()
    result = dict(controls)
    if modality == "audio" and "bpm" not in result:
        features = snapshot.to_dict().get("secondary", {}).get("music_features", {})
        genre = str(result.get("genre") or "").strip().lower()
        measured = features.get(genre if genre else "global", {})
        bpm = measured.get("bpm_median")
        if (measured.get("measured_previews", 0) > 0
                and isinstance(bpm, (float, int)) and not isinstance(bpm, bool)
                and 60 <= bpm <= 200):
            result["bpm"] = bpm
    # Chart prose cannot establish image text, key, mood, duration or geometry.
    return result


def render(modality, controls, uploads_path, *, owner_id, persist_job, read_job,
           job_id=None, committer=None):
    from .awareness import require_context, sampling_seed
    from .plan import active_plan
    require_context("general", modality)
    plan = active_plan.get()
    if plan is None:
        raise ValueError("Dedicated rendering requires a pinned generation plan")
    if not owner_id:
        raise ValueError("An authenticated private owner is required")
    job_id = job_id or uuid4().hex
    record = {"job_id": job_id, "owner_id": owner_id, "owner_ids": [owner_id],
              "type": modality, "dedicated": True, "status": "running",
              "snapshot_id": plan.to_dict()["snapshot_id"],
              "generation_plan": plan.to_dict()}
    persist_job(job_id, record)
    stage = "rendering"
    try:
        if modality == "audio":
            from ai_model.audio.controls import render_audio as renderer
        elif modality == "image":
            from ai_model.image.controls import render_image as renderer
        elif modality == "video":
            from ai_model.video.controls import render_video as renderer
        else:
            raise ValueError("Dedicated controls require audio, image or video")
        controls = conditioned_controls(modality, controls)
        if "seed" in inspect.signature(renderer).parameters:
            controls.setdefault("seed", sampling_seed())
        record["effective_controls"] = dict(controls)
        internal = {"path", "job_id"}
        unknown = set(controls) - (set(inspect.signature(renderer).parameters) - internal)
        if unknown:
            raise ValueError("Unsupported dedicated controls: " + ", ".join(sorted(unknown)))
        root = Path(uploads_path).resolve()
        # Allocate an exclusively owned artifact; never delete engine cache files.
        artifact_path = root / ("dedicated_" + uuid4().hex + (".wav" if modality == "audio" else ".artifact"))
        record.update(scratch_path=str(artifact_path), scratch_owned=False, scratch_root=str(root))
        persist_job(job_id, record)
        if modality == "audio":
            artifact_path.touch(exist_ok=False)
            record["scratch_owned"] = True
            persist_job(job_id, record)
            # The synthesizer derives its local random stream from job_id.
            # Delivery identity stays private/random, sampling identity does not.
            renderer(artifact_path, job_id=f"seed:{plan.seed}", **controls)
        else:
            result = renderer(**controls)
            if modality == "image":
                from ai_model.image.image_engine import _UPLOADS_DIR
                source = Path(_UPLOADS_DIR) / result.filename
            else:
                source = Path(result.file_path)
            if source.is_symlink() or not source.is_file():
                raise ValueError("Renderer did not return a regular artifact")
            artifact_path = artifact_path.with_suffix(source.suffix)
            record["scratch_path"] = str(artifact_path)
            persist_job(job_id, record)
            artifact_path.touch(exist_ok=False)
            record["scratch_owned"] = True
            persist_job(job_id, record)
            shutil.copyfile(source, artifact_path)
        from ai_model.capabilities import capabilities
        import mimetypes
        committing = {**record, "status": "committing",
                      "content_type": mimetypes.guess_type(str(artifact_path))[0] or "application/octet-stream",
                      "delivery_metadata": {"capability": capabilities(modality),
                                            "snapshot_id": plan.to_dict()["snapshot_id"],
                                            "effective_controls": dict(controls),
                                            "generation_plan": plan.to_dict()}}
        persist_job(job_id, committing)
        record = committing
        stage = "committing"
    except Exception as exc:
        current = read_job(job_id) or {}
        if current.get("status") != "cancelled":
            persist_job(job_id, {**record, "status": "failed", "error": str(exc),
                                 "failure_stage": stage})
        raise
    finally:
        if stage != "committing":
            cleanup_owned_scratch(record)
    receipt = deliver(record, persist_job=persist_job, read_job=read_job, committer=committer)
    return {
        "url": receipt["url"], "job_id": job_id, "receipt": receipt,
        "success": True, "status": "completed", "delivery_status": "durable",
        "capability": capabilities(modality),
        "validation": {"status": "artifact_validated", "artifact_validated": True,
                       "checks": ["decoded_artifact_matches_controls"],
                       "quality": "not_evaluated"},
    }


def cleanup_owned_scratch(record):
    """Return False for blocked owned cleanup; unrelated paths are not owned."""
    if not record.get("scratch_owned") or not record.get("scratch_path") or not record.get("scratch_root"):
        return True
    path = Path(record["scratch_path"])
    root = Path(record["scratch_root"]).resolve()
    if path.parent.resolve() != root or not path.name.startswith("dedicated_"):
        return True
    # An otherwise owned allocation replaced by a link cannot be safely
    # cleaned. Retain its journal so cleanup can retry after safe replacement.
    if path.is_symlink():
        return False
    path.unlink(missing_ok=True)
    return True


def interrupt_render(record, *, persist_job):
    """Restart cannot infer render success or safely repeat generation."""
    failed = {**record, "status": "failed", "failure_stage": "rendering",
              "error": "Render interrupted before committing artifact journal"}
    persist_job(record["job_id"], failed)
    cleanup_owned_scratch(record)
    return failed


def deliver(record, *, persist_job, read_job, committer=None):
    """Recovery enters here with the same scratch bytes; never runs inference."""
    from ai_model.media_contract import commit_artifact, RenderCancelled
    job_id = record["job_id"]
    cancelled = lambda: (read_job(job_id) or {}).get("status") == "cancelled"
    if cancelled():
        raise RenderCancelled("Delivery cancelled")
    receipt = (committer or commit_artifact)(
        record["scratch_path"], kind=record["type"], owner_id=record["owner_id"],
        job_id=job_id, content_type=record["content_type"],
        metadata=record.get("delivery_metadata"), cancelled=cancelled)
    if cancelled():
        raise RenderCancelled("Delivery cancelled")
    persist_job(job_id, {**record, "status": "done", "result": receipt})
    cleanup_owned_scratch(record)
    return receipt