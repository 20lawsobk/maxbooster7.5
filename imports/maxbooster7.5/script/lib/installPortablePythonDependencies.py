"""Install and verify the declared application dependencies inside its portable runtime."""
from pathlib import Path
import subprocess
import sys
import tomllib

root = Path(__file__).resolve().parents[2]
runtime = Path(sys.argv[1]).resolve()
if not sys.flags.isolated or Path(sys.prefix).resolve() != runtime:
    raise RuntimeError("Dependency installation requires the isolated portable interpreter")
requirements = []
for manifest in (root / "pyproject.toml",
                 root / "external/maxcore/artifacts/ai-training-server/pyproject.toml"):
    with manifest.open("rb") as stream:
        requirements.extend(tomllib.load(stream)["project"]["dependencies"])
requirements = sorted(set(requirements))
torch = [spec for spec in requirements if spec.startswith("torch")]
ordinary = [spec for spec in requirements if spec not in torch]
pip = [sys.executable, "-I", "-m", "pip", "install", "--no-cache-dir"]
if torch:
    # Never substitute the CUDA distribution for the declared CPU deployment.
    subprocess.run([*pip, "--index-url", "https://download.pytorch.org/whl/cpu", *torch], check=True)
subprocess.run([*pip, *ordinary], check=True)
subprocess.run([sys.executable, "-I", "-m", "pip", "check"], check=True)
subprocess.run([sys.executable, "-I", "-B", str(root / "script/lib/verifyPortablePython.py"),
                str(runtime), "--runtime"], check=True)
