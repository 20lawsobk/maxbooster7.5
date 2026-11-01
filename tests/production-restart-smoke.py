"""Two complete start/stop cycles in the same disposable network namespace.

Use the same arguments and unshare isolation as npm-start-isolated-smoke.py.
Both cycles run even if readiness fails; neither failure is suppressed.
"""
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 4:
    raise SystemExit("Expected fixture, disposable PostgreSQL directory and host namespace ID")
smoke = Path(__file__).with_name("npm-start-isolated-smoke.py")
results = []
for cycle in (1, 2):
    result = subprocess.run([sys.executable, "-B", str(smoke), *sys.argv[1:]],
                            timeout=160, check=False)
    results.append(result.returncode)
    print(f"Production start/shutdown cycle {cycle}: exit={result.returncode}", flush=True)
raise SystemExit(0 if results == [0, 0] else 1)
