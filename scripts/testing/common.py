"""Process isolation and evidence helpers for the repository test runners."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]


def clean_environment(home):
    """Allow tools and library paths, never application/provider credentials."""
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home),
           "TMPDIR": str(home), "LANG": "C", "CI": "1"}
    for name in ("LD_LIBRARY_PATH", "CHROMIUM_PATH", "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", "ESPEAK_DATA_PATH"):
        if os.environ.get(name):
            env[name] = os.environ[name]
    return env


def sanitize(text):
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"(?i)(postgres(?:ql)?://)[^@\s]+@", r"\1[REDACTED]@", text)
    text = re.sub(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+", "[REDACTED_PROVIDER_KEY]", text)
    text = re.sub(r"(?i)(authorization\s*[:=]\s*bearer\s+)\S+", r"\1[REDACTED]", text)
    return text


def source_revision():
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def coverage_parse_exclusions(log):
    """A provider's skipped source is a failed evidence gate, even on exit0."""
    return sorted(set(re.findall(r"^Failed to parse (.+)\. Excluding it from coverage\.$", log, re.M)))


def source_inputs():
    """Hash code/config inputs, including new files, without generated evidence."""
    paths = set()
    for flags in (("--cached",), ("--others", "--exclude-standard")):
        raw = subprocess.check_output(["git", "ls-files", "-z", *flags], cwd=ROOT)
        paths.update(p for p in raw.decode().split("\0") if p)
    extensions = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sh",
                  ".go", ".rs", ".cpp", ".cc", ".h", ".json", ".yaml", ".yml",
                  ".toml", ".nix", ".sql"}
    hashes = {}
    for name in sorted(paths):
        path = Path(name)
        if path.parts[0] in {"reports", "docs", "dist"} or path.parts[0].startswith(".pdim-") or any(
                part in {"node_modules", "__pycache__", ".snapshots", "dist"}
                for part in path.parts):
            continue
        # tests/coverage contains executable database contracts, not generated
        # counters. Keep those inputs in the same source-integrity boundary.
        if "coverage" in path.parts and path.parts[:2] != ("tests", "coverage"):
            continue
        if path.suffix not in extensions and path.name not in {
                ".replit", ".dockerignore", "Dockerfile", "Dockerfile.prod", "package-lock.json",
                "pnpm-lock.yaml", "Cargo.lock", "go.sum", "requirements.txt"}:
            continue
        full = ROOT / path
        if full.is_file():
            hashes[name] = hashlib.sha256(full.read_bytes()).hexdigest()
    encoded = json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()
    return {"scope": "Git-visible code/config inputs; generated dist, reports, documentation and ignored state excluded",
            "sha256": hashlib.sha256(encoded).hexdigest(), "files": hashes}


def run_command(command, logfile, timeout=180, cwd=ROOT, extra_env=None):
    """Bound an owned process group, preserve its true exit status and log."""
    logfile = Path(logfile)
    logfile.parent.mkdir(parents=True, exist_ok=True)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    before = time.monotonic()
    timed_out = False
    with tempfile.TemporaryDirectory(prefix="maxbooster-test-") as home:
        env = clean_environment(home)
        env.update(extra_env or {})
        with tempfile.TemporaryFile() as output:
            try:
                process = subprocess.Popen(command, cwd=cwd, env=env, stdout=output,
                                           stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    code = process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    timed_out = True
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    code = 124
            except OSError as error:
                output.write(str(error).encode())
                code = 127
            output.seek(0)
            raw = output.read().decode("utf-8", errors="replace")
    log = sanitize(raw)
    logfile.write_text(log)
    try:
        log_path = str(logfile.relative_to(ROOT))
    except ValueError:
        log_path = str(logfile)
    return {"command": command, "cwd": str(Path(cwd).relative_to(ROOT)) or ".",
            "startedAt": started, "durationSeconds": round(time.monotonic() - before, 3),
            "exitCode": code, "timedOut": timed_out,
            "status": "passed" if code == 0 else "failed",
            "log": log_path,
            "logSha256": hashlib.sha256(log.encode()).hexdigest()}


def write_json(file, data):
    Path(file).parent.mkdir(parents=True, exist_ok=True)
    Path(file).write_text(json.dumps(data, indent=2) + "\n")
