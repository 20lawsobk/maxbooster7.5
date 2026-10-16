"""Read-only, bounded-memory inventory of retained checkpoint candidates.

Hashes are evidence of byte identity only, not authority to delete or restore.
Never decodes or prints stored account content.
"""
import hashlib
import json
from pathlib import Path
from collections import Counter

root = Path(__file__).resolve().parents[1] / "data"
rows = []
paths = sorted(root.glob("local-pdim-store.json.async-*"))
initial_stats = {path: path.stat() for path in paths}
size_counts = Counter(stat.st_size for stat in initial_stats.values())
for path in paths:
    before = initial_stats[path]
    # Different byte lengths prove non-identity without reading gigabytes.
    # Hash only candidates that could actually be duplicate byte sequences.
    digest = None
    if size_counts[before.st_size] > 1:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
    after = path.stat()
    stable = (before.st_ino, before.st_size, before.st_mtime_ns) == (
        after.st_ino, after.st_size, after.st_mtime_ns)
    rows.append({"file": path.name, "bytes": after.st_size, "stable": stable,
                 "comparison": "sha256" if digest else "unique_size",
                 "sha256": digest.hexdigest() if stable and digest else None})
groups = {}
for row in rows:
    if row["stable"] and row["sha256"]:
        groups.setdefault(row["sha256"], []).append(row["file"])
print(json.dumps({"files": rows, "totalBytes": sum(r["bytes"] for r in rows),
                  "byteIdenticalGroups": [g for g in groups.values() if len(g) > 1],
                  "deletionAuthorized": False, "restorationValidated": False}, indent=2))
raise SystemExit(0 if all(r["stable"] for r in rows) else 1)
