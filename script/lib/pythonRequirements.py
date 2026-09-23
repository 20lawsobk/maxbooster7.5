"""Export the full runtime dependency closure from the existing uv lock.

Runs with the newly unpacked Python, using only stdlib and pip's bundled marker
parser. No downloads or installation here; pip then enforces every package hash.
"""
import sys
import tomllib
from pip._vendor.packaging.markers import Marker


RUNTIME_ROOTS = (
    "fastapi",
    "librosa",
    "numpy",
    "pillow",
    "psycopg2-binary",
    "pydantic",
    "scikit-learn",
    "scipy",
    "soundfile",
    "torch",
    "uvicorn",
)


def export_requirements(lock):
    packages = {}
    for package in lock["package"]:
        name = package["name"]
        packages.setdefault(name, []).append(package)

    selected = set()

    def visit(reference):
        if reference.get("marker") and not Marker(reference["marker"]).evaluate():
            return
        name = reference["name"]
        candidates = packages[name]
        version = reference.get("version")
        registry = reference.get("source", {}).get("registry")
        if version:
            candidates = [p for p in candidates if p["version"] == version]
        if registry:
            candidates = [
                p for p in candidates
                if p.get("source", {}).get("registry") == registry
            ]
        active = []
        for candidate in candidates:
            markers = candidate.get("resolution-markers")
            if not markers or any(Marker(marker).evaluate() for marker in markers):
                active.append(candidate)
        if len(active) != 1:
            raise ValueError(
                f"Locked package {name} has {len(active)} active resolutions"
            )
        package = active[0]
        key = (name, package["version"], package["source"]["registry"])
        if key not in selected:
            selected.add(key)
            for dependency in package.get("dependencies", []):
                visit(dependency)
        for extra in reference.get("extra", []):
            for dependency in package.get("optional-dependencies", {}).get(extra, []):
                visit(dependency)

    for name in RUNTIME_ROOTS:
        if name == "uvicorn":
            continue
        visit({"name": name})
    visit({"name": "uvicorn", "extra": ["standard"]})
    registries = sorted({
        registry for _, _, registry in selected
        if registry != "https://pypi.org/simple"
    })
    lines = [f"--extra-index-url {registry}" for registry in registries]
    for name, version, registry in sorted(selected):
        package = next(
            p for p in packages[name]
            if p["version"] == version
            and p["source"]["registry"] == registry
        )
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