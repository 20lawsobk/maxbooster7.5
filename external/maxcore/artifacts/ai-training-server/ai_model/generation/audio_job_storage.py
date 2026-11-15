"""Safe, job-owned storage operations for asynchronous audio outputs."""
from __future__ import annotations

import os
import re
import shutil
import stat
import uuid
from pathlib import Path
from urllib.parse import urlsplit


_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_MAIN_AUDIO = re.compile(rf"^audio_({_UUID})\.(mp3|wav)$")
_STEM_AUDIO = re.compile(rf"^audio_({_UUID})_stem_([a-zA-Z0-9_-]+)\.wav$")


def _validated_job_id(job_id: str) -> str:
    try:
        canonical = str(uuid.UUID(job_id))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError("Invalid audio job identifier") from exc
    if canonical != job_id.lower():
        raise ValueError("Invalid audio job identifier")
    return canonical


def _upload_url_path(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("Audio artifact URL must be a local upload path")
    if not parsed.path.startswith("/uploads/"):
        return None
    return parsed.path


def _copy_exclusive(source: Path, target: Path, uploads_root: Path) -> None:
    root = uploads_root.resolve()
    if source.parent.resolve() != root or target.parent.resolve() != root:
        raise ValueError("Audio artifacts must remain directly inside the uploads directory")
    if target.exists() or target.is_symlink():
        raise FileExistsError("Audio output path is not available for this job")
    source_fd = -1
    target_fd = -1
    created = False
    try:
        source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
        if not stat.S_ISREG(os.fstat(source_fd).st_mode):
            raise ValueError("Cached audio source is not a regular upload file")
        src = os.fdopen(source_fd, "rb")
        source_fd = -1
        with src:
            target_fd = os.open(
                target,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
            )
            created = True
            dst = os.fdopen(target_fd, "wb")
            target_fd = -1
            with dst:
                shutil.copyfileobj(src, dst, length=1024 * 1024)
                dst.flush()
                os.fsync(dst.fileno())
    except FileExistsError:
        raise
    except OSError as exc:
        if created:
            target.unlink(missing_ok=True)
        raise ValueError("Audio source could not be safely copied") from exc
    except Exception:
        if created:
            target.unlink(missing_ok=True)
        raise
    finally:
        if source_fd >= 0:
            os.close(source_fd)
        if target_fd >= 0:
            os.close(target_fd)


def materialize_cached_audio_job(
    job_id: str, cached: dict, uploads_root: Path,
) -> dict:
    """Give a cache hit unique output files so one owner's purge cannot erase another's."""
    job_id = _validated_job_id(job_id)
    uploads_root = Path(uploads_root)
    cached_url = _upload_url_path(cached.get("url") or cached.get("audio_url"))
    if cached_url is None:
        raise ValueError("Cached audio has no local upload artifact")
    source_name = Path(cached_url).name
    source_match = _MAIN_AUDIO.fullmatch(source_name)
    if source_match is None:
        raise ValueError("Cached audio source has an unexpected filename")
    source = uploads_root / source_name
    output = uploads_root / f"audio_{job_id}.{source_match.group(2)}"
    created: list[Path] = []
    try:
        _copy_exclusive(source, output, uploads_root)
        created.append(output)
        copied_stems: dict[str, str] = {}
        for name, value in (cached.get("stems") or {}).items():
            if not isinstance(name, str) or not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
                raise ValueError("Cached audio stem name is invalid")
            source_path = _upload_url_path(value)
            if source_path is None:
                raise ValueError("Cached audio stem has no local upload artifact")
            stem_source_name = Path(source_path).name
            stem_match = _STEM_AUDIO.fullmatch(stem_source_name)
            if stem_match is None:
                raise ValueError("Cached audio stem filename is invalid")
            stem_source = uploads_root / stem_source_name
            stem_target = uploads_root / f"audio_{job_id}_stem_{name}.wav"
            _copy_exclusive(stem_source, stem_target, uploads_root)
            created.append(stem_target)
            copied_stems[name] = f"/uploads/{stem_target.name}"
        return {
            **cached,
            "url": f"/uploads/{output.name}",
            "audio_url": f"/uploads/{output.name}",
            "stems": copied_stems,
        }
    except Exception:
        for path in reversed(created):
            path.unlink(missing_ok=True)
        raise


def purge_audio_job_artifacts(job_id: str, job: dict, uploads_root: Path) -> int:
    """Delete only uniquely named outputs belonging to this job; reject shared/foreign URLs."""
    job_id = _validated_job_id(job_id)
    uploads_root = Path(uploads_root).resolve()
    files: set[Path] = set()

    for value in (job.get("url"), job.get("audio_url")):
        artifact_url = _upload_url_path(value)
        if artifact_url is None:
            continue
        name = Path(artifact_url).name
        main_match = _MAIN_AUDIO.fullmatch(name)
        stem_match = _STEM_AUDIO.fullmatch(name)
        if main_match and main_match.group(1) == job_id:
            files.add(uploads_root / name)
        elif stem_match and stem_match.group(1) == job_id:
            files.add(uploads_root / name)
        elif main_match or stem_match:
            raise ValueError("Audio artifact is shared with another job and cannot be safely purged")
        else:
            raise ValueError("Audio job references an unsupported artifact path")

    for value in (job.get("stems") or {}).values():
        artifact_url = _upload_url_path(value)
        if artifact_url is None:
            continue
        name = Path(artifact_url).name
        match = _STEM_AUDIO.fullmatch(name)
        if match is None or match.group(1) != job_id:
            raise ValueError("Audio stem is shared with another job and cannot be safely purged")
        files.add(uploads_root / name)

    removed = 0
    changed_directories: set[Path] = set()
    for path in files:
        if path.is_symlink():
            raise ValueError("Refusing to purge a symlinked audio artifact")
        if path.exists():
            path.unlink()
            removed += 1
            changed_directories.add(path.parent)

    stems_dir = uploads_root / "stems" / job_id
    if stems_dir.is_symlink():
        raise ValueError("Refusing to purge a symlinked audio stems directory")
    if stems_dir.exists():
        if not stems_dir.is_dir() or stems_dir.resolve().parent != (uploads_root / "stems").resolve():
            raise ValueError("Audio stems directory is outside its owned storage path")
        shutil.rmtree(stems_dir)
        removed += 1
        changed_directories.add(stems_dir.parent)

    for directory in changed_directories:
        flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | os.O_NOFOLLOW
        directory_fd = os.open(directory, flags)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    return removed
