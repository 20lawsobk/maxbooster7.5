"""Prepare disposable production artifacts; never copy workspace credentials/DB data.

Run after npm run build. Creates only /tmp/npm-start-* directories. PostgreSQL
initialization and schema installation are deliberately left to the caller.
"""
import json
from pathlib import Path
import shutil
import tempfile
from production_fixture_support import native_binary

source = Path(__file__).resolve().parents[1]
binary = native_binary(source)
root = Path(tempfile.mkdtemp(prefix="npm-start-isolated-"))
pg = Path(tempfile.mkdtemp(prefix="npm-start-pg-"))
manifest = json.loads((source / "dist/build-complete.json").read_text())

def copy_file(relative):
    destination = root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / relative, destination)

def excluded(directory, names):
    return [name for name in names if name in {
        ".git", "node_modules", "__pycache__", ".venv", ".cache",
    } or name.startswith(".env") or name.endswith((".pem", ".key"))]

try:
    for name in set(manifest["inputs"]) | set(manifest["files"]):
        copy_file(name)
    copy_file("dist/build-complete.json")
    for name in ("external/maxcore", "external/pdim", "python_runtime"):
        shutil.copytree(source / name, root / name, dirs_exist_ok=True,
                        ignore=excluded, symlinks=False)
    for name in ("node_modules", "external/maxcore/node_modules",
                 "external/pdim/node_modules", "dns-node/node_modules"):
        if (source / name).exists():
            destination = root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.symlink_to(source / name, target_is_directory=True)
    copy_file(binary)
    (pg / "socket").mkdir()
    (pg / "drizzle.json").write_text(json.dumps({
        "dialect": "postgresql", "schema": str(root / "shared/schema.ts"),
        "out": str(pg / "schema"),
    }))
    Path("/tmp/npm-start-isolated-path").write_text(str(root))
    Path("/tmp/npm-start-pg-path").write_text(str(pg))
    print(json.dumps({"fixture": str(root), "postgres": str(pg)}))
except BaseException:
    shutil.rmtree(root)
    shutil.rmtree(pg)
    raise
