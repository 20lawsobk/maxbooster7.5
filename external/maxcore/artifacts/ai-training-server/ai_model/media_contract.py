"""Deterministic delivery checks; no model inference or service initialization."""
import errno
import json
import subprocess
import time
from pathlib import Path


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