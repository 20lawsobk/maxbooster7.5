"""Install and verify the declared application dependencies inside its portable runtime."""
from importlib.metadata import distributions
import os
from pathlib import Path
import sys
import subprocess
import tomllib
from pip._vendor.packaging.requirements import Requirement
from pip._vendor.packaging.utils import canonicalize_name


def runtime_requirements(root):
    manifest = root / "external/maxcore/artifacts/ai-training-server/pyproject.toml"
    with manifest.open("rb") as stream:
        configuration = tomllib.load(stream)
    requirements = set(configuration["project"]["dependencies"])
    uv_policy = configuration.get("tool", {}).get("uv", {})
    requirements.update(uv_policy.get("constraint-dependencies", []))
    requirements.update(uv_policy.get("override-dependencies", []))
    diffusion_manifest = root / "server/services/diffusion/requirements.txt"
    for line in diffusion_manifest.read_text(encoding="utf-8").splitlines():
        requirement = line.strip()
        if requirement and not requirement.startswith("#"):
            Requirement(requirement)
            requirements.add(requirement)
    requirements.add(locked_urllib3_requirement(root))
    return sorted(requirements)


def locked_urllib3_requirement(root):
    with (root / "pyproject.toml").open("rb") as stream:
        project = tomllib.load(stream)
    declared = [
        Requirement(text)
        for text in project.get("project", {}).get("dependencies", [])
        if canonicalize_name(Requirement(text).name) == "urllib3"
    ]
    if len(declared) != 1:
        raise RuntimeError("root pyproject.toml must declare exactly one urllib3 security constraint")

    with (root / "uv.lock").open("rb") as stream:
        lock = tomllib.load(stream)
    locked = [
        package.get("version")
        for package in lock.get("package", [])
        if canonicalize_name(package.get("name", "")) == "urllib3"
    ]
    if len(locked) != 1 or not isinstance(locked[0], str):
        raise RuntimeError("uv.lock must contain exactly one locked urllib3 version")
    if not declared[0].specifier.contains(locked[0], prereleases=True):
        raise RuntimeError("uv.lock urllib3 version is outside the declared security constraint")
    return f"urllib3=={locked[0]}"


def requirements_satisfied(requirements, installed):
    normalized = {canonicalize_name(name): version for name, version in installed.items()}
    for text in requirements:
        requirement = Requirement(text)
        if requirement.marker and not requirement.marker.evaluate():
            continue
        version = normalized.get(canonicalize_name(requirement.name))
        if version is None or (
            requirement.specifier
            and not requirement.specifier.contains(version, prereleases=True)
        ):
            return False
    return True


def pip_install_environment(base=None):
    environment = dict(os.environ if base is None else base)
    # The runtime is an isolated install prefix, not a user-site install.
    # Override builder-level pip configuration that may force --user.
    environment["PIP_USER"] = "0"
    return environment


def installed_versions():
    return {
        distribution.metadata["Name"]: distribution.version
        for distribution in distributions()
        if distribution.metadata.get("Name")
    }


def run_checked(command):
    result = subprocess.run(command, check=False, text=True, capture_output=True)
    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result.returncode == 0


def runtime_is_ready(root, runtime, requirements):
    if not requirements_satisfied(requirements, installed_versions()):
        return False
    checks = [
        [sys.executable, "-I", "-m", "pip", "check"],
        [
            sys.executable,
            "-I",
            "-B",
            str(root / "script/lib/verifyPortablePython.py"),
            str(runtime),
            "--runtime",
        ],
    ]
    return all(run_checked(command) for command in checks)


def main():
    root = Path(__file__).resolve().parents[2]
    runtime = Path(sys.argv[1]).resolve()
    if not sys.flags.isolated or Path(sys.prefix).resolve() != runtime:
        raise RuntimeError("Dependency installation requires the isolated portable interpreter")

    requirements = runtime_requirements(root)
    if runtime_is_ready(root, runtime, requirements):
        print("[portable-python] Existing MaxCore runtime is valid; package installation skipped.")
        return
    if "--verify-only" in sys.argv[2:]:
        raise RuntimeError("Portable Python runtime does not satisfy the declared dependencies")

    torch = [spec for spec in requirements if Requirement(spec).name.lower() == "torch"]
    ordinary = [spec for spec in requirements if spec not in torch]
    pip = [sys.executable, "-I", "-m", "pip", "install", "--no-cache-dir", "--no-input"]
    environment = pip_install_environment()
    if torch:
        # Never substitute the CUDA distribution for the declared CPU deployment.
        subprocess.run(
            [*pip, "--index-url", "https://download.pytorch.org/whl/cpu", *torch],
            check=True,
            env=environment,
        )
    subprocess.run([*pip, *ordinary], check=True, env=environment)
    subprocess.run([sys.executable, "-I", "-m", "pip", "check"], check=True)
    subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            str(root / "script/lib/verifyPortablePython.py"),
            str(runtime),
            "--runtime",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
