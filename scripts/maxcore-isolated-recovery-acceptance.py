#!/usr/bin/env python3
"""Disposable MaxCore journal/restart/HTTP drill; never import the full server."""
import ast
import base64
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "external/maxcore/artifacts/ai-training-server"
REPORT = ROOT / "reports/maxcore-acceptance"
FUNCTIONS = {
    "_job_path", "_job_write", "_job_read", "_job_update", "_persist_generation_job",
    "_journal_job_id", "_journal_records", "recover_dedicated_delivery",
    "generation_readiness",
}


def child(root, port):
    import asyncio
    from fastapi import FastAPI
    import uvicorn
    import ai_model.media_contract as media_contract
    from ai_model.generation import dedicated

    jobs = root / "jobs"
    jobs.mkdir(mode=0o700, exist_ok=True)
    app = FastAPI()
    tree = ast.parse((SERVICE / "server.py").read_text())
    nodes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name in FUNCTIONS]
    if {node.name for node in nodes} != FUNCTIONS:
        raise RuntimeError("MaxCore production journal/readiness contract changed")
    scope = {
        "app": app, "Path": Path, "os": os, "json": json, "time": time,
        "asyncio": asyncio, "hashlib": hashlib, "_JOBS_DIR": str(jobs),
        "_request_job_owner": ContextVar("acceptance_owner", default=None),
        "_api_jobs_lock": threading.Lock(), "_render_manager": object(),
        "_model_ready": False,
    }
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SERVICE / "server.py"), "exec"), scope)

    # Delivery is the REAL production validation + journal transition; only the
    # private external storage transport is replaced by a disposable local fixture.
    def transport(payload):
        if (root / "offline").exists():
            raise OSError("isolated fixture storage unavailable")
        receipt = {
            "durable": True, "retrievable": True, "owner_id": payload["owner_id"],
            "job_id": payload["job_id"], "sha256": payload["metadata"]["sha256"],
            "size_bytes": payload["metadata"]["size_bytes"],
            "url": "/api/storage/file/isolated-acceptance",
        }
        with (root / "deliveries.jsonl").open("a") as stream:
            stream.write(json.dumps({"receipt": receipt, "bytes_sha256":
                hashlib.sha256(base64.b64decode(payload["data_base64"])).hexdigest()}) + "\n")
        return receipt

    real_commit = media_contract.commit_artifact
    media_contract.commit_artifact = lambda *args, **kwargs: real_commit(
        *args, **kwargs, transport=transport, attempts=1)
    # Startup reads isolated journals, never a live credential, weight or PDIM.
    @app.post("/fixture/seed")
    def seed():
        artifact = root / "dedicated_fixture.wav"
        with wave.open(str(artifact), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(8000)
            wav.writeframes(b"\x01\x00" * 800)
        scope["_job_write"]("commit", {
            "job_id": "commit", "owner_id": "fixture-owner", "owner_ids": ["fixture-owner"],
            "dedicated": True, "status": "committing", "type": "audio",
            "scratch_path": str(artifact), "scratch_root": str(root),
            "scratch_owned": True, "content_type": "audio/wav",
        })
        partial = root / "dedicated_partial.wav"
        partial.write_bytes(b"partial bytes")
        scope["_job_write"]("running", {
            "job_id": "running", "owner_id": "fixture-owner", "owner_ids": ["fixture-owner"],
            "dedicated": True, "status": "running", "type": "audio",
            "scratch_path": str(partial), "scratch_root": str(root),
            "scratch_owned": True,
        })
        return {"seeded": True}

    @app.get("/fixture/jobs/{job_id}")
    def job(job_id: str):
        if job_id not in {"commit", "running"}:
            return {"error": "not a fixture job"}
        return scope["_job_read"](job_id)

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error", access_log=False)


def port_number():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(port, path, method="GET"):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method)
    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def launch(root, port, home):
    # Allowlist: inherited credentials, workflow configuration and localhost
    # production bindings cannot enter the child.
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home),
           "PYTHONPATH": str(SERVICE), "PYTHONUNBUFFERED": "1"}
    proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()),
                             "--child", str(root), str(port)],
                            cwd=home, env=env, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    end = time.monotonic() + 40
    while time.monotonic() < end:
        if proc.poll() is not None:
            raise RuntimeError(f"isolated child exited {proc.returncode}: "
                               f"{proc.stderr.read().decode(errors='replace')[-2000:]}")
        try:
            status, _ = request(port, "/fixture/jobs/commit")
            if status == 200:
                return proc
        except (OSError, ValueError):
            time.sleep(.1)
    proc.kill()
    _, stderr = proc.communicate(timeout=5)
    raise TimeoutError("isolated MaxCore acceptance listener timed out: "
                       + stderr.decode(errors="replace")[-1500:])


def stop(proc):
    if proc.poll() is None:
        proc.terminate()
    try:
        proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        _, stderr = proc.communicate(timeout=5)
        raise TimeoutError("isolated MaxCore child did not stop: "
                           + stderr.decode(errors="replace")[-1000:])


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def percentile(values, pct):
    values = sorted(values)
    return round(values[max(0, (len(values) * pct + 99) // 100 - 1)], 2)


def run():
    evidence = {"scope": "isolated production journal/recovery/readiness functions; "
                         "disposable fixture storage transport and loopback HTTP only",
                "production_data_touched": False, "inference_invoked": False}
    failure = None
    with tempfile.TemporaryDirectory(prefix="maxcore-isolated-acceptance-") as scratch:
        scratch = Path(scratch)
        state = scratch / "state"
        state.mkdir(mode=0o700)
        home = scratch / "home"
        home.mkdir(mode=0o700)
        backup = scratch / "offline-backup"
        port = port_number()
        proc = None
        try:
            evidence["stage"] = "first_launch"
            proc = launch(state, port, home)
            evidence["stage"] = "seed"
            check(request(port, "/fixture/seed", "POST") == (200, {"seeded": True}), "seed failed")
            original = (state / "dedicated_fixture.wav").read_bytes()
            digest = hashlib.sha256(original).hexdigest()
            (state / "offline").touch()
            evidence["stage"] = "first_stop"
            stop(proc)
            evidence["stage"] = "outage_launch"
            proc = launch(state, port, home)
            committing = request(port, "/fixture/jobs/commit")[1]
            interrupted = request(port, "/fixture/jobs/running")[1]
            check(committing["status"] == "committing" and "unavailable" in committing["delivery_error"],
                  "outage lost retryable committing state or did not surface storage failure")
            check(hashlib.sha256((state / "dedicated_fixture.wav").read_bytes()).hexdigest() == digest,
                  "outage lost original scratch bytes")
            check(interrupted["status"] == "failed" and interrupted["failure_stage"] == "rendering"
                  and not (state / "dedicated_partial.wav").exists(),
                  "interrupted render incorrectly resumed or retained partial scratch")
            readiness_status, readiness = request(port, "/ready")
            check(readiness_status == 503 and readiness["ready"] is False
                  and readiness["model_loaded"] is False,
                  "unloaded model readiness must fail closed")
            evidence["outage"] = "committing retained with explicit delivery error and identical scratch SHA-256"
            evidence["restart"] = "interrupted render failed without rerender; readiness HTTP 503"
            stop(proc)
            proc = None

            # Separate copy then destroy disposable instance state, restore same
            # path (absolute scratch references require that location).
            shutil.copytree(state, backup)
            shutil.rmtree(state)
            shutil.copytree(backup, state)
            (state / "offline").unlink()
            proc = launch(state, port, home)
            done = request(port, "/fixture/jobs/commit")[1]
            check(done["status"] == "done" and done["result"]["sha256"] == digest
                  and done["result"]["durable"] is True
                  and not (state / "dedicated_fixture.wav").exists(),
                  "restored delivery was not durably journalled and cleaned")
            deliveries = (state / "deliveries.jsonl").read_text().splitlines()
            check(len(deliveries) == 1 and json.loads(deliveries[0])["bytes_sha256"] == digest,
                  "delivery did not use the original encoded fixture bytes exactly once")
            evidence["instance_loss"] = ("destroyed isolated state directory; restored copy to same path; "
                                         "delivery-only startup produced one validated fixture receipt")
            evidence["fixture_artifact_sha256"] = digest

            # Hard bounded load: 96 GETs, <=8 in flight, no retries, 4s/request.
            def probe(index):
                path = ("/ready", "/fixture/jobs/commit", "/fixture/jobs/running")[index % 3]
                started = time.perf_counter()
                status, body = request(port, path)
                expected = 503 if path == "/ready" else 200
                check(status == expected, f"{path}: HTTP {status} != {expected}")
                if path == "/fixture/jobs/commit":
                    check(body["status"] == "done", "load job state changed")
                return (time.perf_counter() - started) * 1000
            started = time.perf_counter()
            with ThreadPoolExecutor(max_workers=8) as workers:
                latencies = list(workers.map(probe, range(96)))
            evidence["http_load"] = {"requests": 96, "max_concurrency": 8,
                                     "expected_unready_responses": 32, "unexpected_responses": 0,
                                     "wall_seconds": round(time.perf_counter() - started, 2),
                                     "p50_ms": percentile(latencies, 50),
                                     "p95_ms": percentile(latencies, 95),
                                     "p99_ms": percentile(latencies, 99)}
            stop(proc)
            proc = launch(state, port, home)
            check(request(port, "/fixture/jobs/commit")[1]["status"] == "done"
                  and len((state / "deliveries.jsonl").read_text().splitlines()) == 1,
                  "subsequent restart delivered completed job again")
            evidence["idempotent_restart"] = "completed job remained terminal; no second fixture delivery"
            evidence.pop("stage", None)
        except Exception as error:
            failure = f"{type(error).__name__}: {error}"
        finally:
            if proc is not None:
                try:
                    stop(proc)
                except Exception as error:
                    failure = f"{failure or ''}; cleanup: {error}"
    result = {"status": "failed" if failure else "passed",
              "command": "python3 scripts/maxcore-isolated-recovery-acceptance.py",
              "evidence": evidence, "failure": failure,
              "limitations": [
                  "Not the full MaxCore server or production inference; no model weights, quality, GPU or throughput-scale claims.",
                  "Test-only fixture routes and local storage receipt; not a production PDIM or remote storage availability test.",
                  "Instance-loss restore copied the same disposable filesystem to its original path; not off-host backup or cross-host failover.",
                  "Bounded GET load measures only isolated journal/readiness HTTP, not generation throughput or application load.",
              ]}
    REPORT.mkdir(parents=True, exist_ok=True)
    (REPORT / "isolated-recovery-load.json").write_text(json.dumps(result, indent=2) + "\n")
    (REPORT / "isolated-recovery-load.md").write_text(
        "# MaxCore isolated recovery and bounded HTTP acceptance\n\n"
        f"**Result:** {result['status'].upper()}\n\n"
        f"**Run:** `{result['command']}`\n\n"
        + "\n".join(f"- {key}: {value}" for key, value in evidence.items())
        + (f"\n\nFailure: {failure}" if failure else "")
        + "\n\n## Limits\n\n" + "\n".join(f"- {item}" for item in result["limitations"]) + "\n")
    print(f"{result['status'].upper()}: {REPORT / 'isolated-recovery-load.json'}"
          + (f" — {failure}" if failure else ""))
    return 1 if failure else 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--child":
        child(Path(sys.argv[2]), int(sys.argv[3]))
    elif len(sys.argv) == 1:
        sys.exit(run())
    else:
        raise SystemExit("usage: python3 scripts/maxcore-isolated-recovery-acceptance.py")