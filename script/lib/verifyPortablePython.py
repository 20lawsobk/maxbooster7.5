"""Reject build-host packages in the interpreter that will ship in a capsule."""
import importlib
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
if not sys.flags.isolated:
    raise RuntimeError("Portable Python verification requires isolated mode")
if Path(sys.prefix).resolve() != root:
    raise RuntimeError("Portable Python prefix does not match the release directory")

for entry in sys.path:
    if not entry or not Path(entry).resolve().is_relative_to(root):
        raise RuntimeError("Portable Python search path escapes the release directory")

modules = ["pip"]
if "--runtime" in sys.argv[2:]:
    modules += [
        "numpy", "PIL", "scipy", "fastapi", "uvicorn", "pydantic",
        "psycopg2", "librosa", "sklearn", "soundfile", "torch",
    ]
for name in modules:
    module = importlib.import_module(name)
    if not module.__file__ or not Path(module.__file__).resolve().is_relative_to(root):
        raise RuntimeError(f"Portable Python module {name} escapes the release directory")
print("Portable Python isolation verified: " + ", ".join(modules))