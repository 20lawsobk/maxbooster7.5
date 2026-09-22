"""Export the full runtime dependency closure from the existing uv lock.

Runs with the newly unpacked Python, using only stdlib and pip's bundled marker
parser. No downloads or installation here; pip then enforces every package hash.
"""
import sys
import tomllib
from pip._vendor.packaging.markers import Marker


def export_requirements(lock):
    packages = {}
    for package in lock["package"]:
        name = package["name"]
        if name in packages:
            raise ValueError(f"Ambiguous locked package {name}; export requires explicit resolution")
        packages[name] = package

    selected = set()

    def visit(reference):
        if reference.get("marker") and not Marker(reference["marker"]).evaluate():
            return
        name = reference["name"]
        package = packages[name]
        if name not in selected:
            selected.add(name)
            for dependency in package.get("dependencies", []):
                visit(dependency)
        for extra in reference.get("extra", []):
            for dependency in package.get("optional-dependencies", {}).get(extra, []):
                visit(dependency)

    for name in ("numpy", "pillow", "scipy", "fastapi", "pydantic"):
        visit({"name": name})
    visit({"name": "uvicorn", "extra": ["standard"]})
    lines = []
    for name in sorted(selected):
        package = packages[name]
        artifacts = package.get("wheels", []) + ([package["sdist"]] if "sdist" in package else [])
        hashes = sorted({artifact["hash"] for artifact in artifacts})
        if not hashes or "registry" not in package.get("source", {}):
            raise ValueError(f"Runtime package {name} lacks registry hashes")
        lines.append(f'{name}=={package["version"]} ' + " ".join(f"--hash={digest}" for digest in hashes))
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    with open(sys.argv[1], "rb") as source:
        requirements = export_requirements(tomllib.load(source))
    with open(sys.argv[2], "w", encoding="utf-8") as destination:
        destination.write(requirements)