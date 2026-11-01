"""Prepare the pinned inference artifact; never train or invent replacement weights."""
import hashlib
import json
import os
from pathlib import Path
import tempfile


class CheckpointUnavailable(RuntimeError):
    pass


def _digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare_checkpoint(weights_dir, *, supplied_path=None):
    weights = Path(weights_dir)
    manifest = json.loads((weights / "model.release.json").read_text())
    prefix = "external/maxcore/artifacts/ai-training-server/ai_model/weights/"
    digest = manifest.get("sha256", "")
    size = manifest.get("bytes")
    if (manifest.get("schemaVersion") != 1
            or manifest.get("path") != prefix + "model.pt"
            or manifest.get("sourcePath") != prefix + "model.corrupt"
            or manifest.get("capability") != "numerical-inference"
            or manifest.get("qualityClaim") != "not-evaluated"
            or not isinstance(size, int) or isinstance(size, bool) or size <= 0
            or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest)):
        raise ValueError("Invalid inference checkpoint release manifest")
    pointer = (f"version https://git-lfs.github.com/spec/v1\n"
               f"oid sha256:{digest}\nsize {size}\n").encode()
    blob = hashlib.sha1(f"blob {len(pointer)}\0".encode() + pointer).hexdigest()
    if manifest.get("sourceGitBlob") != blob:
        raise ValueError("Checkpoint manifest does not match its pinned Git LFS object")

    def verify(path):
        if path.is_symlink() or not path.is_file():
            raise ValueError("Checkpoint must be a regular file, not a symlink")
        if path.stat().st_size != size or _digest(path) != digest:
            raise ValueError("Checkpoint size/SHA-256 does not match the pinned release")
        return path

    if supplied_path:
        return verify(Path(supplied_path))
    target = weights / "model.pt"
    if target.exists() or target.is_symlink():
        return verify(target)
    # A checkout can contain just the pointer, while git-lfs already has the
    # verified object cached. Do not require rewriting the tracked source file.
    root = weights.parents[5]
    candidates = [weights / "model.corrupt",
                  root / ".git/lfs/objects" / digest[:2] / digest[2:4] / digest]
    for source in candidates:
        if not source.is_file():
            continue
        if source.stat().st_size <= 1024 and source.read_bytes().startswith(
                b"version https://git-lfs.github.com/spec/v1\n"):
            continue
        verify(source)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=weights, prefix="model.pt.release-", delete=False) as out:
                temporary = Path(out.name)
                with source.open("rb") as stream:
                    import shutil
                    shutil.copyfileobj(stream, out)
                out.flush()
                os.fsync(out.fileno())
            verify(temporary)
            try:
                os.link(temporary, target)
            except FileExistsError:
                pass  # Another preparer won; verify its complete artifact.
            return verify(target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    raise CheckpointUnavailable(
        f"Inference checkpoint bytes are unavailable (Git LFS object {digest}, {size} bytes). "
        "Fetch the model.corrupt LFS object, then restart; or set MAXCORE_CHECKPOINT_PATH "
        "to an existing copy matching model.release.json. A Git LFS pointer is not weights. "
        "If GitHub reports an LFS quota/budget error, the repository owner must restore LFS access."
    )


if __name__ == "__main__":
    import argparse
    import sys
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights-dir", type=Path,
                        default=Path(__file__).resolve().parents[1] / "weights")
    parser.add_argument("--checkpoint", default=os.environ.get("MAXCORE_CHECKPOINT_PATH"))
    args = parser.parse_args()
    try:
        print(f"Verified inference checkpoint: {prepare_checkpoint(args.weights_dir, supplied_path=args.checkpoint)}")
    except (OSError, ValueError, CheckpointUnavailable) as exc:
        print(f"Checkpoint preparation failed: {exc}", file=sys.stderr)
        sys.exit(1)
