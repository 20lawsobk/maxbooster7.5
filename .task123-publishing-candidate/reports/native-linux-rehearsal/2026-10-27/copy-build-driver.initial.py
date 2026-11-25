"""Owned current-filesystem copy and bounded configured Linux DIR build.

Run from the matching repository root after heavyweight-test coordination.
Never installs into, hardlinks, or modifies the original workspace.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path.cwd().resolve()
OUT = ROOT / "reports/native-linux-rehearsal/2026-10-27"
sys.path.insert(0, str(ROOT / "scripts/testing"))
from common import run_command, source_inputs, write_json

ownership = json.loads((OUT / "ownership.json").read_text())
owned = Path(ownership["ownedRoot"])
assert owned.parent == Path("/tmp") and owned.name.startswith("maxbooster-linux-")
project = owned / "project"
assert not project.exists(), "Never reuse or overwrite an earlier attempt"
archive = owned / "downloads/electron-v43.8.3-linux-x64.zip"
assert archive.stat().st_size == 127277783
assert hashlib.sha256(archive.read_bytes()).hexdigest() == "73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22"
assert shutil.disk_usage(owned).free >= 10 * 1024 ** 3, "Insufficient owned-copy headroom"
baseline = source_inputs()
write_json(OUT / "source-inputs-before.json", baseline)
started = time.monotonic()
project.mkdir()

files = set()
for flags in [("--cached",), ("--others", "--exclude-standard")]:
    raw = subprocess.check_output(["git", "ls-files", "-z", *flags], cwd=ROOT)
    files.update(name for name in raw.decode().split("\0") if name)
copied = []
for name in sorted(files):
    relative = Path(name)
    if relative.parts[0] in {"docs", "reports", "dist", ".git"} or relative.parts[0].startswith(".pdim-"):
        continue
    if "node_modules" in relative.parts or ".git" in relative.parts:
        continue
    source = ROOT / relative
    if not source.is_file() and not source.is_symlink():
        continue  # Includes the unavailable legacy gitlink, not source files.
    target = project / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_symlink():
        resolved = source.resolve(strict=True)
        assert resolved.is_relative_to(ROOT), f"Unexpected outside source link: {name}"
        os.symlink(os.path.relpath(project / resolved.relative_to(ROOT), target.parent), target)
    else:
        shutil.copy2(source, target)
        assert source.stat().st_ino != target.stat().st_ino or source.stat().st_dev != target.stat().st_dev
    copied.append(name)

trees = ["node_modules", "external/maxcore/node_modules", "external/pdim/node_modules", "dist",
         "external/maxcore/artifacts/api-server/dist"]
for name in trees:
    source, target = ROOT / name, project / name
    assert source.is_dir(), f"Required installed/build tree missing: {name}"
    if target.exists():
        raise RuntimeError(f"Unexpected target before regular copy: {name}")
    shutil.copytree(source, target, symlinks=True, copy_function=shutil.copy2)

links = 0
for folder, directories, names in os.walk(project, followlinks=False):
    for name in directories + names:
        candidate = Path(folder) / name
        if candidate.is_symlink():
            target = candidate.resolve(strict=True)
            assert target.is_relative_to(project), f"Copied link permits outside writeback: {candidate.relative_to(project)}"
            links += 1

for name, expected in baseline["files"].items():
    target = project / name
    assert target.is_file(), f"Missing admitted current input: {name}"
    assert hashlib.sha256(target.read_bytes()).hexdigest() == expected, f"Copied input mismatch: {name}"
write_json(OUT / "copy.json", {"durationSeconds": round(time.monotonic() - started, 3),
    "copiedGitVisibleFiles": len(copied), "regularCopiedTrees": trees,
    "validatedInternalSymlinks": links, "originalInputSha256": baseline["sha256"],
    "allAdmittedInputsCopiedExactly": True, "noHardlinksOrOutsideLinks": True})

proxies = {name: os.environ[name] for name in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS"] if name in os.environ}
affinity = str(min(os.sched_getaffinity(0)))
def execute(name, command, timeout, network=False, extra=None):
    values = dict(proxies) if network else {}
    values.update({"ELECTRON_BUILDER_CACHE": str(owned / "cache"), "npm_config_cache": str(owned / "npm-cache")})
    values.update(extra or {})
    result = run_command(["taskset", "-c", affinity, *command], OUT / f"{name}.txt",
                         timeout=timeout, cwd=project, extra_env=values)
    write_json(OUT / f"{name}.json", result)
    print(name, result["exitCode"], flush=True)
    return result

result = execute("copied-build-validation", ["node", "--input-type=module", "-e",
    'import("./scripts/start-production.mjs").then(m=>m.validateBuild(process.cwd()))'], 30)
if result["exitCode"] != 0:
    result = execute("owned-build", ["npm", "run", "build"], 300,
                     extra={"NODE_ENV": "production", "SKIP_BOOSTERSTATE": "1"})
    if result["exitCode"] != 0:
        raise RuntimeError("Owned current build failed; native packaging was not attempted")

result = execute("linux-dir-build", ["node", "node_modules/electron-builder/cli.js", "--linux", "dir", "--x64", "--publish", "never",
    f"--config.electronDist={archive}", f"--config.directories.output={owned / 'out'}"], 450, network=True)
after = source_inputs()
write_json(OUT / "source-integrity-after-build.json", {"beforeSha256": baseline["sha256"],
    "afterSha256": after["sha256"], "unchanged": baseline == after})
assert baseline == after, "Original source inputs changed during native work"
print(json.dumps({"ownedRoot": str(owned), "buildExitCode": result["exitCode"], "originalSourceUnchanged": True}), flush=True)
