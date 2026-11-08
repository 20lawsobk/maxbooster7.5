#!/usr/bin/env python3
"""Stage diffusion source without generated shards; never mutate the source tree."""
from pathlib import Path
import os
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


def copied_totals(root):
    files = 0
    total_bytes = 0
    for current, directories, names in os.walk(root, followlinks=False):
        directories[:] = [name for name in directories if name not in GENERATED_DIRECTORIES]
        for name in names:
            path = Path(current) / name
            if path.suffix.lower() in GENERATED_SUFFIXES:
                raise RuntimeError(f"generated diffusion artifact survived staging: {path.relative_to(root)}")
            if path.is_file():
                files += 1
                total_bytes += path.stat().st_size
    return files, total_bytes


def copy_source(source, destination):
    source = source.resolve(strict=True)
    destination = destination.absolute()
    if not source.is_dir():
        raise RuntimeError("diffusion source must be a directory")
    if source == destination or source in destination.parents or destination in source.parents:
        raise RuntimeError("diffusion source and destination must be separate trees")
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
        count, size = copied_totals(staged)
        if count == 0:
            raise RuntimeError("diffusion source staging produced no files")

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
        print(f"Copied {count} diffusion source files ({size} bytes); generated shards and bytecode excluded")
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
