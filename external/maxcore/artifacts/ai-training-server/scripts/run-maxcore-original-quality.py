#!/usr/bin/env python3
"""Run the original MaxCore quality suites against the already-running local stack.

No server startup, training, throughput section, source edits, or credential output.
Each invocation writes a new private report directory, even on failure/timeout.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "tests/test_w6_90m.py",
    "tests/test_awareness_and_quality.py",
    "ai_model/weights/model.pt",
    "ai_model/weights/model.release.json",
)
PROBES = (
    "/gpu/hyper/status",
    "/gpu/status",
    "/api/gpu/replica-pool/stats",
    "/api/gpu/gen-cache/stats",
    "/api/gpu/prefix-kv/stats",
    "/api/gpu/digest-cache/stats",
    "/api/maxcore/pocket-accelerator/stats",
)

# The original W6 suite is loaded directly from its unchanged file in each
# subprocess. Only its obsolete hard-coded proxy port is rebound in memory.
BOOTSTRAP = """
import runpy, sys
module = runpy.run_path(sys.argv[1], run_name="maxcore_original_quality")
module["API_PORT"] = int(sys.argv[2])
# runpy functions retain their own globals, not the returned dictionary.
module["main"].__globals__["API_PORT"] = int(sys.argv[2])
sys.argv = [sys.argv[1], "--quality-only"]
raise SystemExit(module["main"]())
"""

# Diagnostic only: the first, untouched original run is always retained.
# An exception from a checker becomes a *failed* check, never a pass.
DIAGNOSTIC_BOOTSTRAP = """
import runpy, sys, time
m = runpy.run_path(sys.argv[1], run_name="maxcore_w6_diagnostic")
g = m["main"].__globals__
g["API_PORT"] = int(sys.argv[2])
original = g["_run_task"]
def diagnostic_task(task):
    try:
        return original(task)
    except Exception as exc:
        return dict(label=task["label"], status=0, elapsed=0.0,
                    checks=[(False, "CHECKER EXCEPTION (diagnostic only)",
                             "%s: %s" % (type(exc).__name__, exc))], passed=False)
g["_run_task"] = diagnostic_task
sys.argv = [sys.argv[1], "--quality-only"]
raise SystemExit(m["main"]())
"""


def loopback_origin(raw: str) -> tuple[str, int]:
    parsed = urlsplit(raw)
    if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost")
            or parsed.username is not None or parsed.password is not None
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("Origin must be bare http://127.0.0.1:<port> (no path or credentials)")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Origin has invalid port") from exc
    if port is None or not 1 <= port <= 65535:
        raise ValueError("Origin requires a valid explicit port")
    return "127.0.0.1", port


def contract_port(name: str, default: int) -> int:
    raw = os.environ.get(name, str(default))
    if not re.fullmatch(r"[0-9]+", raw) or not 1 <= int(raw) <= 65535:
        raise ValueError(f"{name} must be an integer port in [1, 65535]")
    return int(raw)


def hashes() -> dict[str, str]:
    result = {}
    for name in FILES:
        digest = hashlib.sha256()
        with (ROOT / name).open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        result[name] = digest.hexdigest()
    return result


def _counters(value):
    """Keep only numeric/boolean counters; never persist arbitrary response text."""
    if isinstance(value, dict):
        return {k: selected for k, v in value.items()
                if (selected := _counters(v)) is not None}
    if isinstance(value, (int, float, bool)) and not isinstance(value, complex):
        return value
    return None


def snapshot(port: int) -> dict:
    out = {}
    for path in PROBES:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            # Auth is consumed solely at request time; never written into reports.
            conn.request("GET", path, headers={
                "X-Api-Key": os.environ.get("MAXCORE_TEST_API_KEY", ""),
            })
            response = conn.getresponse()
            body = response.read(1024 * 1024)
            entry = {"http_status": response.status}
            if response.status == 200:
                data = json.loads(body)
                entry["counters"] = _counters(data)
            out[path] = entry
        except (OSError, ValueError, json.JSONDecodeError, http.client.HTTPException) as exc:
            out[path] = {"error_type": type(exc).__name__}
        finally:
            conn.close()
    return out


def _delta(before, after):
    if isinstance(before, dict) and isinstance(after, dict):
        return {k: d for k in before.keys() & after.keys()
                if (d := _delta(before[k], after[k])) is not None}
    if (type(before) in (int, float) and type(after) in (int, float)
            and not isinstance(before, bool) and not isinstance(after, bool)):
        return after - before
    return None


def save(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def suite(label: str, command: list[str], timeout: int, report: Path, env: dict) -> dict:
    started = time.monotonic()
    timed_out = False
    try:
        result = subprocess.run(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=timeout)
        output = result.stdout or b""
        exit_code = result.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        output = exc.stdout or b""
        exit_code = None
    except OSError as exc:
        output = f"Runner subprocess error: {type(exc).__name__}\n".encode()
        exit_code = None
    (report / f"{label}.log").write_bytes(output)
    return {"exit_code": exit_code, "timed_out": timed_out,
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "log": f"{label}.log"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=int, default=600, help="Per-suite seconds (default 600)")
    parser.add_argument("--reports-root", type=Path, default=ROOT / "reports" / "original-quality")
    parser.add_argument("--diagnostic-on-w6-crash", action="store_true",
                        help="After a null-URL checker crash, rerun W6 with checker exceptions recorded as failures")
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    try:
        proxy_port = contract_port("MAXCORE_LOCAL_PORT", 8090)
        model_port = contract_port("MODEL_API_PORT", 9878)
        host, actual_port = loopback_origin(
            os.environ.get("MAXCORE_TEST_BASE", f"http://127.0.0.1:{model_port}"))
        if host != "127.0.0.1":
            raise ValueError("MAXCORE_TEST_BASE must resolve to loopback")
        # W6 embeds 9878 both in a constant and in function default arguments.
        # Do not silently run its requests against the wrong server or rewrite
        # any additional test behavior; only the proxy port is rebound.
        if actual_port != 9878:
            raise ValueError("Original W6 requires MAXCORE_TEST_BASE/model listener on 127.0.0.1:9878")
    except ValueError as exc:
        parser.error(str(exc))

    args.reports_root.mkdir(parents=True, exist_ok=True)
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report = Path(tempfile.mkdtemp(prefix=f"{timestamp}-", dir=args.reports_root))
    report.chmod(0o700)
    print(f"Report: {report}", flush=True)
    data = {"mode": "original quality only (no throughput/training)",
            "timestamp_utc": timestamp, "proxy_port": proxy_port,
            "model_port": actual_port, "suites": {}, "snapshots": {}}
    status = 1
    try:
        data["hashes_before"] = hashes()
        env = os.environ.copy()
        env["MAXCORE_TEST_BASE"] = f"http://127.0.0.1:{actual_port}"
        # These scripts consume MAXCORE_TEST_API_KEY from the inherited environment.
        # No credential is taken as a CLI argument or copied into the report.
        data["snapshots"]["before"] = snapshot(actual_port)
        w6 = ROOT / FILES[0]
        data["suites"]["w6_original"] = suite(
            "w6_original",
            [sys.executable, "-c", BOOTSTRAP, str(w6), str(proxy_port)],
            args.timeout, report, env)
        data["suites"]["awareness_original"] = suite(
            "awareness_original",
            [sys.executable, str(ROOT / FILES[1])],
            args.timeout, report, env)
        original_log = (report / "w6_original.log").read_bytes()
        null_url_crash = (
            b'in chk_generate_image' in original_log
            and b'url[:60]' in original_log
            and b"TypeError: 'NoneType' object is not subscriptable" in original_log
        )
        if (args.diagnostic_on_w6_crash
                and data["suites"]["w6_original"]["exit_code"] not in (None, 0)
                and null_url_crash):
            data["suites"]["w6_diagnostic_not_original"] = suite(
                "w6_diagnostic_not_original",
                [sys.executable, "-c", DIAGNOSTIC_BOOTSTRAP, str(w6), str(proxy_port)],
                args.timeout, report, env)
        status = 0 if all(
            item["exit_code"] == 0 and not item["timed_out"]
            for item in data["suites"].values()) else 1
    except Exception as exc:
        data["runner_error"] = type(exc).__name__  # no untrusted exception text
        status = 1
    finally:
        data["snapshots"]["after"] = snapshot(actual_port)
        data["counter_deltas"] = _delta(
            data["snapshots"]["before"], data["snapshots"]["after"])
        try:
            data["hashes_after"] = hashes()
            data["hashes_unchanged"] = data.get("hashes_before") == data["hashes_after"]
        except OSError:
            data["hashes_unchanged"] = False
        if not data["hashes_unchanged"]:
            status = 1
        data["exit_code"] = status
        save(report / "summary.json", data)
    print(f"Original suites exit status: {status}; details: {report / 'summary.json'}")
    return status


if __name__ == "__main__":
    sys.exit(main())