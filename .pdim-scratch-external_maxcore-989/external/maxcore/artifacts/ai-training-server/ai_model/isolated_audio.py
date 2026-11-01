"""Bound native audio work with an exec'd process group, not a Python fork."""
import errno
import inspect
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time

from .media_contract import RenderCancelled
from .isolated_audio_worker import EXPORTS

# Co-located deployment reserves one Python CPU. Do not multiply it per request.
_RENDER_SLOT = threading.BoundedSemaphore(1)


def _stop_group(process):
    """Reap leader and terminate inherited FFmpeg/native descendants as well."""
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=.5)
    except subprocess.TimeoutExpired:
        pass
    # Leader exit is not proof its descendants exited.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=2)


def run_process(command, *, deadline, cancelled, env):
    """Small independently testable process boundary. No shell/preexec hooks."""
    if os.name != "posix":
        raise RuntimeError("Isolated audio requires POSIX process-group termination")
    if cancelled():
        raise RenderCancelled("Audio render cancelled before spawn")
    if time.monotonic() >= deadline:
        raise TimeoutError("Audio renderer admission deadline exceeded")
    process = subprocess.Popen(
        command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, env=env, start_new_session=True,
    )
    try:
        while True:
            if cancelled():
                raise RenderCancelled("Audio render cancelled")
            if time.monotonic() >= deadline:
                raise TimeoutError("Audio renderer hard deadline exceeded")
            code = process.poll()
            if code is not None:
                if code != 0:
                    raise RuntimeError(f"Audio renderer exited with code {code}")
                return
            time.sleep(.025)
    finally:
        _stop_group(process)


def render_isolated(exports, request, uploads_path, *, deadline, cancelled=lambda: False):
    """Run trusted canonical functions with private staging and bounded JSON IPC.

    Source export is strictly local: callers pass canonical function objects,
    never request-supplied source. The worker intentionally imports no server.
    """
    if set(exports) != set(EXPORTS):
        raise ValueError("Incomplete canonical renderer exports")
    acquired = False
    try:
        while not acquired:
            if cancelled():
                raise RenderCancelled("Audio render cancelled while queued")
            if time.monotonic() >= deadline:
                raise TimeoutError("Audio renderer admission deadline exceeded")
            acquired = _RENDER_SLOT.acquire(timeout=.05)
        uploads = Path(uploads_path).resolve()
        # Same filesystem: completed files can be atomically promoted.
        with tempfile.TemporaryDirectory(prefix=".audio-job-", dir=uploads) as staging:
            root = Path(staging)
            invocation = root / "request.json"
            result_path = root / "result.json"
            payload = {"exports": {k: inspect.getsource(v) for k, v in exports.items()},
                       "staging": staging, "request": request}
            with open(invocation, "x", opener=lambda path, flags: os.open(path, flags, 0o600)) as out:
                json.dump(payload, out)
            env = os.environ.copy()
            for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
                        "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "BLIS_NUM_THREADS"):
                env[key] = "1"
            run_process(
                [sys.executable, str(Path(__file__).with_name("isolated_audio_worker.py")),
                 str(invocation), str(result_path)],
                deadline=deadline, cancelled=cancelled, env=env,
            )
            if not result_path.is_file() or result_path.stat().st_size > 262_144:
                raise RuntimeError("Audio renderer returned no bounded result")
            response = json.loads(result_path.read_text())
            if response.get("version") != 1:
                raise RuntimeError("Unsupported audio worker result version")
            if response.get("status") != "done":
                if response.get("errno") in (errno.EAGAIN, errno.EBUSY, errno.ETIMEDOUT):
                    raise OSError(response["errno"], response.get("error", "Renderer I/O failed"))
                raise RuntimeError(response.get("error", "Audio renderer failed"))
            if cancelled():
                raise RenderCancelled("Audio render cancelled before artifact promotion")
            if time.monotonic() >= deadline:
                raise TimeoutError("Audio artifact promotion deadline exceeded")
            result = response.get("result")
            if not isinstance(result, dict) or not isinstance(result.get("stems", {}), dict):
                raise ValueError("Malformed audio result")
            urls = [result.get("url"), *result.get("stems", {}).values()]
            artifacts = []
            for url in urls:
                if not isinstance(url, str) or not url.startswith("/uploads/"):
                    raise ValueError("Invalid audio artifact URL")
                name = url.removeprefix("/uploads/")
                if Path(name).name != name or request["job_id"] not in name:
                    raise ValueError("Audio artifact is outside this job")
                file = root / name
                if file.is_symlink() or not file.is_file() or not file.stat().st_size:
                    raise ValueError("Audio artifact missing or empty")
                artifacts.append((file, uploads / name))
            promoted = []
            try:
                for source, destination in artifacts:
                    source.replace(destination)
                    promoted.append(destination)
                if cancelled():
                    raise RenderCancelled("Audio render cancelled during artifact promotion")
                if time.monotonic() >= deadline:
                    raise TimeoutError("Audio artifact promotion deadline exceeded")
            except Exception:
                for file in promoted:
                    file.unlink(missing_ok=True)
                raise
            return result
    finally:
        if acquired:
            _RENDER_SLOT.release()