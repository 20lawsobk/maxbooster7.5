#!/usr/bin/env python3
"""Provision a pinned official Rust toolchain without requiring /nix writes.

Archive hashes are pinned here, not supplied by the download server at runtime.
The installed file inventory is rechecked before every portable release build.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

VERSION = "1.93.1"
TARGET = "x86_64-unknown-linux-gnu"
ARCHIVES = {
    "rustc": "b9db2636f5a101c4cdaf46a26f8a0c8e4b5767ecdb02ae9c7ccc3ead577732bc",
    "cargo": "dbf12e8fd2a245a6bdd9f6c8df267cb2c25b0c56866ee91d8321337df0a00ddb",
    "rust-std": "82c4e41268f1741e4eb68796aeb6ca5042406ae858dd56144155c4ef8d87d8b6",
}


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(root):
    return {str(file.relative_to(root)): digest(file) for file in sorted(root.rglob("*"))
            if file.is_file() and file.name != "provenance.json"}


def verify(root):
    record = json.loads((root / "provenance.json").read_text())
    if record.get("version") != VERSION or record.get("target") != TARGET or record.get("archives") != ARCHIVES:
        raise RuntimeError("Portable Rust provenance does not match pinned toolchain")
    if record.get("files") != inventory(root):
        raise RuntimeError("Portable Rust installed file checksum mismatch")
    for tool in ("rustc", "cargo"):
        version = subprocess.check_output([str(root / "bin" / tool), "--version"], text=True)
        if version.split()[1] != VERSION:
            raise RuntimeError(f"Unexpected {tool} version")


def prepare(root):
    if root.exists():
        verify(root)
        return
    root.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rust-build-", dir=root.parent) as temp:
        temp = Path(temp)
        dest = temp / "toolchain"
        for component, expected in ARCHIVES.items():
            name = f"{component}-{VERSION}-{TARGET}"
            archive = temp / f"{name}.tar.xz"
            with urllib.request.urlopen(f"https://static.rust-lang.org/dist/{archive.name}", timeout=180) as response, archive.open("wb") as out:
                shutil.copyfileobj(response, out)
            if digest(archive) != expected:
                raise RuntimeError(f"Official Rust archive checksum mismatch: {component}")
            with tarfile.open(archive) as tar:
                tar.extractall(temp, filter="data")
            subprocess.run(["bash", str(temp / name / "install.sh"), f"--prefix={dest}", "--disable-ldconfig"], check=True)
            shutil.rmtree(temp / name)
            archive.unlink()
        (dest / "provenance.json").write_text(json.dumps({"version": VERSION, "target": TARGET,
            "archives": ARCHIVES, "files": inventory(dest)}, indent=2))
        verify(dest)
        dest.rename(root)
    verify(root)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare-rust-toolchain.py DESTINATION")
    prepare(Path(sys.argv[1]).resolve())
