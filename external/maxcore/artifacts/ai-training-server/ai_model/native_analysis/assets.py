"""Ephemeral, owner-scoped input assets for native analysis."""

from __future__ import annotations

import hashlib
import time
import uuid
from pathlib import Path

IMAGE_MAX_BYTES = 16 * 1024 * 1024
VIDEO_MAX_BYTES = 100 * 1024 * 1024
ASSET_TTL_SECONDS = 3600
IMAGE_MIMES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
VIDEO_MIMES = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}


class AssetError(Exception):
    pass


class AssetTypeError(AssetError):
    pass


class AssetDecodeError(AssetError):
    pass


def owner_hash(owner_id: str) -> str:
    return hashlib.sha256(owner_id.encode("utf-8")).hexdigest()


class AnalysisAssets:
    def __init__(self, uploads_root: str | Path):
        self.root = Path(uploads_root).resolve() / "analysis-inputs"

    def new_path(self, owner_id: str, suffix: str) -> Path:
        directory = self.root / owner_hash(owner_id)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        directory.chmod(0o700)
        return directory / f"{uuid.uuid4().hex}{suffix}"

    def url_for(self, path: Path) -> str:
        relative = path.resolve().relative_to(self.root.parent)
        return "/uploads/" + relative.as_posix()

    def resolve_owned(self, url: str, owner_id: str) -> Path | None:
        prefix = "/uploads/analysis-inputs/"
        if not isinstance(url, str) or not url.startswith(prefix):
            return None
        relative = url[len(prefix):]
        if "?" in relative or "#" in relative:
            return None
        expected = self.root / owner_hash(owner_id)
        try:
            candidate = (self.root / relative).resolve(strict=True)
            candidate.relative_to(expected.resolve())
        except (OSError, RuntimeError, ValueError):
            raise AssetError("Analysis upload is invalid or belongs to another user")
        try:
            stat = candidate.stat()
        except OSError as exc:
            raise AssetError("Analysis upload is invalid") from exc
        if not candidate.is_file() or time.time() >= stat.st_mtime + ASSET_TTL_SECONDS:
            candidate.unlink(missing_ok=True)
            raise AssetError("Analysis upload has expired")
        return candidate

    @staticmethod
    def expires_at(path: Path) -> float:
        """Return the actual expiry instant derived from the file's mtime."""
        return path.stat().st_mtime + ASSET_TTL_SECONDS

    def cleanup(self) -> None:
        if not self.root.exists():
            return
        cutoff = time.time() - ASSET_TTL_SECONDS
        for path in self.root.glob("*/*"):
            try:
                if path.is_file() and path.stat().st_mtime < cutoff:
                    path.unlink()
            except OSError:
                pass
        for directory in self.root.glob("*"):
            try:
                directory.rmdir()
            except OSError:
                pass

    @staticmethod
    def release(path: Path) -> None:
        path.unlink(missing_ok=True)


def validate_media(path: Path, kind: str) -> None:
    # Use the same signature checks, resource bounds, protocol restrictions,
    # and decoders as the eventual analysis. This prevents an upload from being
    # accepted under a claimed MIME type only to become a different input later.
    from .media import analyze_image, analyze_video

    if kind == "image":
        analyzer = analyze_image
    elif kind == "video":
        analyzer = analyze_video
    else:
        raise AssetTypeError("Analysis media kind is unsupported")
    try:
        analyzer(path)
    except Exception as exc:
        # Preserve native typed errors so the API can distinguish decoder
        # unavailability, resource limits, and malformed media.
        from .media import MediaAnalysisError

        if isinstance(exc, MediaAnalysisError):
            raise
        raise AssetDecodeError("Uploaded media cannot be decoded") from exc