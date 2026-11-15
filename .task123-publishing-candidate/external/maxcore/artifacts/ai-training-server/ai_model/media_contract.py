"""Deterministic delivery checks; no model inference or service initialization."""
import errno
import hashlib
import json
import os
import subprocess
import time
import math
import base64
import urllib.request
import urllib.error
from collections.abc import Mapping
from datetime import datetime, timezone
from pathlib import Path


def load_checkpoint_archive(path, *, map_location="cpu"):
    """Load a tensor-only checkpoint without permitting pickle code execution."""
    import torch

    checkpoint = torch.load(
        str(path),
        map_location=map_location,
        weights_only=True,
    )
    if not isinstance(checkpoint, Mapping):
        raise ValueError("Checkpoint root must be a mapping")
    state = checkpoint.get("model_state_dict", checkpoint)
    if not isinstance(state, Mapping) or not state:
        raise ValueError("Checkpoint has no model state mapping")
    if not all(isinstance(key, str) for key in state):
        raise ValueError("Checkpoint model state contains a non-string key")
    return checkpoint


def quarantine_checkpoint(path, reason):
    """Preserve an invalid checkpoint and record why; never replace an older copy."""
    source = Path(path)
    hasher = hashlib.sha256()
    with source.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    base = source.with_suffix(".corrupt")
    candidate = base
    sequence = 0
    while True:
        try:
            os.link(source, candidate)
        except FileExistsError:
            sequence += 1
            candidate = Path(f"{base}.{sequence}")
            continue

        record = {
            "source": source.name,
            "quarantined_as": candidate.name,
            "sha256": digest,
            "reason": str(reason),
            "quarantined_at": datetime.now(timezone.utc).isoformat(),
        }
        record_path = Path(f"{candidate}.json")
        record_created = False
        try:
            with record_path.open("x", encoding="utf-8") as stream:
                record_created = True
                json.dump(record, stream, sort_keys=True)
                stream.write("\n")
            source.unlink()
            return candidate, record_path
        except FileExistsError:
            candidate.unlink()
            sequence += 1
            candidate = Path(f"{base}.{sequence}")
        except Exception:
            candidate.unlink(missing_ok=True)
            if record_created:
                record_path.unlink(missing_ok=True)
            raise

def load_complete_checkpoint(model, state):
    """Construction is not trained readiness: require every expected tensor."""
    if not state:
        raise ValueError("Inference requires a complete trained checkpoint")
    clean = {
        (k.removeprefix("_orig_mod.")): v for k, v in state.items()
    }
    target = model.state_dict()
    missing = sorted(set(target) - set(clean))
    unexpected = sorted(set(clean) - set(target))
    incompatible = sorted(k for k in target.keys() & clean.keys()
                          if target[k].shape != clean[k].shape)
    if missing or unexpected or incompatible:
        raise ValueError(
            f"Incompatible checkpoint: missing={len(missing)}, "
            f"unexpected={len(unexpected)}, wrong_shape={len(incompatible)}"
        )
    model.load_state_dict(clean, strict=True)


class RenderCancelled(Exception):
    pass


def validate_artifact(path, kind):
    """Reject plans/JSON/empty outputs and derive metadata from encoded bytes."""
    source = Path(path)
    if kind not in ("audio", "video", "image") or not source.is_file() or source.is_symlink():
        raise ValueError("A regular encoded media artifact is required")
    if source.stat().st_size < 32:
        raise ValueError("Generated artifact is empty or truncated")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format",
         "-of", "json", str(source)], check=True, capture_output=True, text=True, timeout=20)
    info = json.loads(probe.stdout)
    expected = "audio" if kind == "audio" else "video"
    stream = next((s for s in info.get("streams", []) if s.get("codec_type") == expected), None)
    if not stream:
        raise ValueError("Generated artifact has no required media stream")
    duration = float(stream.get("duration") or info.get("format", {}).get("duration") or 0)
    if kind != "image" and (not math.isfinite(duration) or duration <= 0):
        raise ValueError("Generated artifact has no actual duration")
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(source),
                    "-map", "0:a:0" if kind == "audio" else "0:v:0", "-f", "null", "-"],
                   check=True, capture_output=True, timeout=90)
    return {"duration": duration if math.isfinite(duration) else None,
            "width": stream.get("width"), "height": stream.get("height"),
            "codec": stream.get("codec_name"),
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "size_bytes": source.stat().st_size}


def commit_artifact(path, *, kind, owner_id, job_id, content_type,
                    metadata=None, cancelled=lambda: False, transport=None,
                    attempts=3, sleep=time.sleep):
    """Commit once and retry only delivery; caller removes scratch after journaling.

    Caller must persist its committing state and scratch path before entering.
    Recovery calls this with the SAME job/owner/file, never re-renders. The Node
    receipt represents an owner-tracked PDIM read-back, not merely upload success.
    Cancellation during commit is checked before publication by the caller too.
    """
    if not owner_id or not job_id:
        raise ValueError("Authenticated owner and stable job id are required")
    actual = validate_artifact(path, kind)
    payload = {"owner_id": owner_id, "job_id": job_id, "kind": kind,
               "filename": Path(path).name, "content_type": content_type,
               "data_base64": base64.b64encode(Path(path).read_bytes()).decode("ascii"),
               "metadata": {**(metadata or {}), **actual}}
    if transport is None:
        token = os.environ.get("PDIM_LOCAL_CHANNEL_TOKEN")
        endpoint = os.environ.get("MAXBOOSTER_ARTIFACT_COMMIT_URL")
        if not token or not endpoint:
            raise RuntimeError("Private artifact commit channel is not configured")
        def transport(body):
            request = urllib.request.Request(endpoint, data=json.dumps(body).encode(),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
    for attempt in range(attempts):
        if cancelled():
            raise RenderCancelled("Artifact delivery cancelled")
        try:
            receipt = transport(payload)
            if (receipt.get("durable") is not True or receipt.get("retrievable") is not True
                    or receipt.get("owner_id") != owner_id or receipt.get("job_id") != job_id
                    or receipt.get("sha256") != actual["sha256"]
                    or receipt.get("size_bytes") != actual["size_bytes"]
                    or not str(receipt.get("url", "")).startswith("/api/storage/file/")):
                raise ValueError("Invalid durable artifact receipt")
            # The durable job record must be saved before caller removes scratch.
            # Keeping scratch here closes the crash window between receipt and save.
            if cancelled():
                raise RenderCancelled("Artifact delivery cancelled")
            return {**(metadata or {}), **actual, **receipt}
        except (OSError, urllib.error.URLError) as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code < 500 and exc.code != 429:
                raise
            if attempt + 1 == attempts:
                raise
            sleep(min(2 ** attempt, 8))
    raise RuntimeError("Artifact commit attempt budget exhausted")


def render_with_budget(render, on_retry, *, attempts=3, seconds=120,
                       cancelled=lambda: False,
                       clock=time.monotonic, sleep=time.sleep):
    """Bound retries of transient I/O. A running native call is not preemptible."""
    deadline = clock() + seconds
    for attempt in range(1, attempts + 1):
        if cancelled():
            raise RenderCancelled("Audio render cancelled")
        if clock() >= deadline:
            raise TimeoutError("Audio render retry deadline exceeded")
        try:
            result = render()
            if cancelled():
                raise RenderCancelled("Audio render cancelled")
            if not isinstance(result, dict) or not result.get("url"):
                raise ValueError("Audio renderer returned no artifact URL")
            if clock() >= deadline:
                raise TimeoutError("Audio render exceeded delivery deadline")
            return result
        except OSError as exc:
            if exc.errno not in (errno.EAGAIN, errno.EBUSY, errno.ETIMEDOUT):
                raise
            delay = min(2 ** attempt, 8)
            if attempt == attempts or clock() + delay >= deadline:
                raise
            on_retry(attempt, f"{type(exc).__name__}: {exc}")
            sleep(delay)
    raise RuntimeError("Audio render attempt budget exhausted")


def require_audio_stream(path, *, minimum_duration=0):
    """Verify encoded audio exists and spans the requested media duration."""
    if not Path(path).is_file():
        raise ValueError("Required audio artifact is missing")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=duration:format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True, timeout=20,
    )
    info = json.loads(probe.stdout)
    streams = info.get("streams", [])
    if not streams:
        raise ValueError("Required audio stream is missing")
    duration = float(streams[0].get("duration") or info.get("format", {}).get("duration") or 0)
    if duration <= 0 or duration + 0.25 < minimum_duration:
        raise ValueError("Required audio stream is shorter than the requested video")
    return duration