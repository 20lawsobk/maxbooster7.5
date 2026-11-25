#!/usr/bin/env python3
"""Stage diffusion source without generated shards; never mutate the source tree."""
from pathlib import Path
import hashlib
import os
import stat
import shutil
import sys
import tempfile
import uuid


GENERATED_DIRECTORIES = {"advanced_memory", "__pycache__"}
GENERATED_SUFFIXES = {".npz", ".pyc", ".pyo"}


def ignore_generated(directory, names):
    ignored = []
    for name in names:
        path = Path(directory) / name
        if name in GENERATED_DIRECTORIES or path.suffix.lower() in GENERATED_SUFFIXES:
            ignored.append(name)
    return ignored


def generated(path):
    return path.name in GENERATED_DIRECTORIES or path.suffix.lower() in GENERATED_SUFFIXES


def link_record(path, root):
    target = os.readlink(path)
    if os.path.isabs(target):
        resolved = Path(target).resolve(strict=True)
    else:
        resolved = (path.parent / target).resolve(strict=True)
    try:
        relative_target = resolved.relative_to(root)
    except ValueError as error:
        raise RuntimeError(f"diffusion symlink escapes its source tree: {path.relative_to(root)}") from error
    if any(part in GENERATED_DIRECTORIES for part in relative_target.parts) or \
            relative_target.suffix.lower() in GENERATED_SUFFIXES:
        raise RuntimeError(f"diffusion symlink targets an excluded generated artifact: {path.relative_to(root)}")
    return {"path": path.relative_to(root).as_posix(), "kind": "symlink", "target": target}


def tree_manifest(root, exclude_generated):
    root = Path(root).resolve(strict=True)
    entries = []
    def fail_walk(error):
        raise error

    for current, directories, names in os.walk(
        root, topdown=True, onerror=fail_walk, followlinks=False
    ):
        current_path = Path(current)
        remaining_directories = []
        for name in sorted(directories):
            path = current_path / name
            if generated(path):
                if exclude_generated:
                    continue
                entries.append({
                    "path": path.relative_to(root).as_posix(),
                    "kind": "unexpected-generated",
                })
                continue
            if path.is_symlink():
                entries.append(link_record(path, root))
                continue
            metadata = path.stat()
            if not stat.S_ISDIR(metadata.st_mode):
                raise RuntimeError(f"unsupported diffusion directory entry: {path.relative_to(root)}")
            entries.append({
                "path": path.relative_to(root).as_posix(),
                "kind": "directory",
                "mode": stat.S_IMODE(metadata.st_mode),
            })
            remaining_directories.append(name)
        directories[:] = remaining_directories

        for name in sorted(names):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if exclude_generated and generated(path):
                continue
            if not exclude_generated and generated(path):
                # Stale generated output in the destination forces a replacement
                # without reading a potentially large shard just to reject it.
                entries.append({"path": relative, "kind": "unexpected-generated"})
                continue
            metadata = path.lstat()
            if stat.S_ISLNK(metadata.st_mode):
                entries.append(link_record(path, root))
            elif stat.S_ISREG(metadata.st_mode):
                digest = hashlib.sha256()
                with path.open("rb") as source_file:
                    for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
                        digest.update(chunk)
                entries.append({
                    "path": relative,
                    "kind": "file",
                    "bytes": metadata.st_size,
                    "mode": stat.S_IMODE(metadata.st_mode),
                    "sha256": digest.hexdigest(),
                })
            else:
                raise RuntimeError(f"unsupported diffusion source entry: {relative}")
    return sorted(entries, key=lambda item: item["path"])


def totals(manifest):
    files = [entry for entry in manifest if entry["kind"] == "file"]
    return len(files), sum(entry["bytes"] for entry in files)


def copy_source(source, destination):
    source = source.resolve(strict=True)
    destination = destination.absolute()
    if not source.is_dir():
        raise RuntimeError("diffusion source must be a directory")
    if source == destination or source in destination.parents or destination in source.parents:
        raise RuntimeError("diffusion source and destination must be separate trees")
    source_manifest = tree_manifest(source, exclude_generated=True)
    if not source_manifest:
        raise RuntimeError("diffusion source staging produced no files")
    source_count, source_size = totals(source_manifest)
    if destination.is_dir() and not destination.is_symlink():
        if tree_manifest(destination, exclude_generated=False) == source_manifest:
            print(
                f"Diffusion source unchanged ({source_count} files, {source_size} bytes); "
                "skipped copy and replacement"
            )
            return

    parent = destination.parent
    parent.mkdir(parents=True, exist_ok=True)

    stage_root = Path(tempfile.mkdtemp(prefix=".diffusion-stage-", dir=parent))
    staged = stage_root / "diffusion"
    backup = parent / f".diffusion-backup-{uuid.uuid4().hex}"
    moved_old = False
    try:
        shutil.copytree(
            source,
            staged,
            symlinks=True,
            copy_function=shutil.copy2,
            ignore=ignore_generated,
        )
        if tree_manifest(staged, exclude_generated=False) != source_manifest:
            raise RuntimeError("staged diffusion tree differs from the verified source manifest")

        if destination.is_symlink():
            os.replace(destination, backup)
            moved_old = True
        elif destination.exists():
            if not destination.is_dir():
                raise RuntimeError("diffusion destination exists and is not a directory")
            os.replace(destination, backup)
            moved_old = True
        os.replace(staged, destination)
        if moved_old:
            if backup.is_dir() and not backup.is_symlink():
                shutil.rmtree(backup)
            else:
                backup.unlink()
        print(
            f"Copied {source_count} diffusion source files ({source_size} bytes); "
            "generated shards and bytecode excluded"
        )
    except BaseException:
        if moved_old and not destination.exists() and not destination.is_symlink() and backup.exists():
            os.replace(backup, destination)
        raise
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: copy-diffusion-source.py <source-directory> <destination-directory>")
    copy_source(Path(sys.argv[1]), Path(sys.argv[2]))
