"""Owner manifests for private files served from MaxCore's scratch uploads."""
from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import stat
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit


_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def _relative_upload_path(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Media path must be a string")
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("Media path must be local and query-free")
    path = unquote(parsed.path)
    if path.startswith("/uploads/"):
        path = path[len("/uploads/"):]
    if (
        not path
        or path.startswith("/")
        or "\\" in path
        or "\0" in path
        or any(part in ("", ".", "..") for part in path.split("/"))
    ):
        raise ValueError("Media path is not a safe uploads-relative path")
    return path


def _paths(
    uploads_root: Path, relative: str, *, create_manifest_dir: bool = True,
) -> tuple[Path, Path, Path]:
    root = Path(uploads_root).resolve()
    asset = root / relative
    manifest_dir = root / ".owner-manifests"
    if manifest_dir.is_symlink():
        raise ValueError("Media owner manifest directory cannot be a symlink")
    if create_manifest_dir:
        manifest_dir.mkdir(mode=0o700, exist_ok=True)
        os.chmod(manifest_dir, 0o700)
    key = hashlib.sha256(relative.encode("utf-8")).hexdigest()
    return root, asset, manifest_dir / f"{key}.json"


def _lock_for(lock_path: Path):
    with _LOCKS_GUARD:
        lock = _LOCKS.get(str(lock_path))
        if lock is None:
            lock = threading.Lock()
            _LOCKS[str(lock_path)] = lock
        return lock


def _asset_is_regular_inside_root(asset: Path, root: Path) -> bool:
    try:
        if asset.is_symlink() or not stat.S_ISREG(asset.lstat().st_mode):
            return False
        asset.resolve(strict=True).relative_to(root)
        return True
    except (OSError, ValueError):
        return False


def _read_manifest(manifest_path: Path) -> dict | None:
    try:
        if manifest_path.is_symlink() or not stat.S_ISREG(manifest_path.lstat().st_mode):
            return None
        with manifest_path.open("r", encoding="utf-8") as source:
            value = json.load(source)
        return value if isinstance(value, dict) else None
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def _atomic_write(manifest_path: Path, payload: dict) -> None:
    directory = manifest_path.parent
    temp_path: Path | None = None
    fd = -1
    try:
        fd, name = tempfile.mkstemp(prefix=".owner-", suffix=".tmp", dir=directory)
        temp_path = Path(name)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            fd = -1
            json.dump(payload, output, separators=(",", ":"), sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_path, manifest_path)
        dir_fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | os.O_NOFOLLOW)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if fd >= 0:
            os.close(fd)
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def register_private_asset(
    uploads_root: Path, media_path: str, owners: list[str] | tuple[str, ...],
    *, ttl_seconds: float | None = 86400,
) -> None:
    """Durably grant only the named owners access to one contained regular file."""
    relative = _relative_upload_path(media_path)
    clean_owners = sorted({
        value.strip()
        for value in owners
        if isinstance(value, str) and value.strip() and len(value) <= 256
    })
    if not clean_owners:
        raise ValueError("At least one trusted asset owner is required")
    if ttl_seconds is not None and (
        isinstance(ttl_seconds, bool)
        or not isinstance(ttl_seconds, (int, float))
        or not math.isfinite(float(ttl_seconds))
        or ttl_seconds <= 0
    ):
        raise ValueError("Private media lifetime must be positive and finite")
    root, asset, manifest_path = _paths(uploads_root, relative)
    if not _asset_is_regular_inside_root(asset, root):
        raise ValueError("Private media must be a regular file inside uploads")
    lock_path = manifest_path.parent / ".lock"
    with _lock_for(lock_path):
        lock_fd = os.open(
            lock_path,
            os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW,
            0o600,
        )
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            previous = _read_manifest(manifest_path)
            if previous is not None and previous.get("path") != relative:
                raise ValueError("Media owner manifest does not match its asset")
            if manifest_path.exists() or manifest_path.is_symlink():
                if previous is None:
                    raise ValueError("Existing media owner manifest is invalid")
            previous_owners = previous.get("owners", []) if previous else []
            if not isinstance(previous_owners, list) or any(
                not isinstance(value, str) for value in previous_owners
            ):
                raise ValueError("Existing media owner manifest has invalid owners")
            merged = set(previous_owners)
            merged.update(clean_owners)
            if ttl_seconds is None or (
                previous is not None and previous.get("expires_at") is None
            ):
                expires_at = None
            else:
                existing_expiry = previous.get("expires_at") if previous else None
                if existing_expiry is not None and (
                    isinstance(existing_expiry, bool)
                    or not isinstance(existing_expiry, (int, float))
                    or not math.isfinite(float(existing_expiry))
                ):
                    raise ValueError("Existing media owner manifest has an invalid expiry")
                expires_at = max(
                    float(existing_expiry or 0),
                    time.time() + float(ttl_seconds),
                )
            _atomic_write(manifest_path, {
                "version": 1,
                "path": relative,
                "owners": sorted(merged),
                "expires_at": expires_at,
            })
        finally:
            os.close(lock_fd)


def is_private_asset_authorized(
    uploads_root: Path, media_path: str, owner_id: str | None,
) -> bool:
    """Fail closed unless a durable manifest and the current file both match."""
    if not isinstance(owner_id, str) or not owner_id.strip():
        return False
    try:
        relative = _relative_upload_path(media_path)
        root, asset, manifest_path = _paths(
            uploads_root, relative, create_manifest_dir=False,
        )
    except (OSError, ValueError):
        return False
    if not manifest_path.parent.is_dir():
        return False
    if not _asset_is_regular_inside_root(asset, root):
        return False
    manifest = _read_manifest(manifest_path)
    expires_at = manifest.get("expires_at") if manifest else None
    return bool(
        manifest
        and manifest.get("version") == 1
        and manifest.get("path") == relative
        and isinstance(manifest.get("owners"), list)
        and all(isinstance(value, str) for value in manifest["owners"])
        and owner_id in manifest["owners"]
        and (
            expires_at is None
            or (
                not isinstance(expires_at, bool)
                and isinstance(expires_at, (int, float))
                and math.isfinite(float(expires_at))
                and expires_at > time.time()
            )
        )
    )


def remove_private_asset_manifest(uploads_root: Path, media_path: str) -> None:
    """Remove access metadata after deleting or retiring an asset."""
    relative = _relative_upload_path(media_path)
    _, _, manifest_path = _paths(
        uploads_root, relative, create_manifest_dir=False,
    )
    if not manifest_path.parent.is_dir():
        return
    lock_path = manifest_path.parent / ".lock"
    with _lock_for(lock_path):
        lock_fd = os.open(
            lock_path,
            os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW,
            0o600,
        )
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            existing = _read_manifest(manifest_path)
            if existing is None:
                if manifest_path.exists() or manifest_path.is_symlink():
                    raise ValueError("Existing media owner manifest is invalid")
                return
            if existing.get("path") != relative:
                raise ValueError("Media owner manifest does not match its asset")
            manifest_path.unlink()
            dir_fd = os.open(manifest_path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | os.O_NOFOLLOW)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        finally:
            os.close(lock_fd)
