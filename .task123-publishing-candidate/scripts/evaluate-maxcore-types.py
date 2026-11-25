#!/usr/bin/env python3
"""Dedicated-handler measurements, isolated processes; no training/publishing."""
import argparse
import asyncio
from collections import Counter
import hashlib
import importlib.util
import inspect
import json
import os
from pathlib import Path
import random
import shutil
import signal
import subprocess
import sys
import threading
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "external/maxcore/artifacts/ai-training-server"
FIXTURE = ROOT / "evaluations/maxcore-quality/types.json"


def sha(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1048576), b""):
            h.update(b)
    return h.hexdigest()


def identity():
    return {str(p.relative_to(MODEL)): sha(p) for p in
            [MODEL / "ai_model/weights/model.pt", MODEL / "ai_model/weights/model.release.json"]}


async def child(case, fixture, out):
    report = {"id": case["id"], "case": case, "fixture_sha256": sha(FIXTURE),
              "before": identity(), "status": "starting", "scope": "in-process real handler, not HTTP/auth",
              "calls": {}, "exceptions": [], "agent_outputs": [], "awareness": [], "files": []}
    report["runner_sha256"] = sha(Path(__file__))
    report["server_sha256"] = sha(MODEL / "server.py")
    counts = Counter()
    labels = {}
    started = time.monotonic()
    uploads = MODEL / "uploads"
    old_files = {p.resolve() for p in uploads.rglob("*") if p.is_file()}
    jobs = Path("/tmp/maxbooster_jobs")
    old_files |= {p.resolve() for p in jobs.glob("*") if p.is_file()}
    protected = [MODEL / s for s in ("ai_model/weights", "training", "data", "knowledge")]

    def guard(event, args):
        targets = []
        if event == "open" and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND):
            targets = [args[0]]
        elif event in ("os.remove", "os.rmdir", "os.rename", "os.link", "os.symlink"):
            targets = list(args[:2]) if event in ("os.rename", "os.link", "os.symlink") else [args[0]]
        for target in targets:
            if isinstance(target, (str, bytes, os.PathLike)):
                p = Path(os.fsdecode(target)).resolve()
                if p in old_files or any(p == r or r in p.parents for r in protected):
                    raise PermissionError("Evaluation protects existing content and training data")

    def profile(frame, event, value):
        name, filename = frame.f_code.co_name, frame.f_code.co_filename
        if str(MODEL) not in filename:
            return
        if event == "call" and any(s in filename for s in ("/gpu/", "/rta/", "awareness", "/generation/", "/agents/", "request_intelligence")):
            # Cache labels per code object: pathlib work on every hot composer
            # call can dominate the measured workload instead of observing it.
            label = labels.get(frame.f_code)
            if label is None:
                label = filename.removeprefix(str(MODEL) + "/") + ":" + name
                labels[frame.f_code] = label
            counts[label] += 1
        if event == "return" and filename.endswith("quality_awareness.py") and name in ("get_doc", "brief_enrichment"):
            report["awareness"].append({"function": name, "nonempty": bool(value)})
        if event == "return" and filename.endswith("script_agent.py") and name == "run" and value is not None:
            report["agent_outputs"].append({k: getattr(value, k, None) for k in ("source", "hook", "body", "cta")})

    def trace(frame, event, value):
        filename = frame.f_code.co_filename
        if str(MODEL) not in filename or not any(s in filename for s in ("/gpu/", "/video/", "/image/", "/audio/", "/rta/")):
            return None
        if event == "exception" and len(report["exceptions"]) < 80:
            kind, exc, _ = value
            if kind not in (StopIteration, GeneratorExit):
                report["exceptions"].append({"file": str(Path(filename).relative_to(MODEL)),
                                              "function": frame.f_code.co_name, "error": f"{kind.__name__}: {exc}"})
        return trace

    def save():
        report["calls"] = dict(counts)
        report["elapsed_seconds"] = time.monotonic() - started
        (out / "result.json").write_text(json.dumps(report, indent=2, default=str) + "\n")

    try:
        # An empty libpq DSN can use inherited PG* defaults. Explicitly point
        # logging at a closed loopback port instead of risking a real DB write.
        os.environ["DATABASE_URL"] = "postgresql://evaluation@127.0.0.1:1/evaluation?connect_timeout=1"
        os.environ["AI_DYNAMIC_BATCHING"] = "1"
        sys.dont_write_bytecode = True
        sys.addaudithook(guard)
        sys.path.insert(0, str(MODEL))
        spec = importlib.util.spec_from_file_location("eval_server", MODEL / "server.py")
        server = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = server
        spec.loader.exec_module(server)
        # Isolate evaluation job metadata/locks, not their implementation.
        # Shared .updates.lock must not be mistaken for protected user content.
        (out / "jobs").mkdir(exist_ok=True)
        server._JOBS_DIR = str(out / "jobs")
        report["job_storage"] = "evaluation-local job metadata; not PDIM/client durability"
        await asyncio.to_thread(server._init_ai_model)
        if not server._model_ready or server._hyper_backend is None:
            raise RuntimeError("Actual server model/digital GPU initialization failed")
        backend = server._hyper_backend
        report["connection"] = {"backend": type(backend).__name__, "model": type(server._creative_model.model).__name__,
                                "before": backend.status(),
                                "all_modules_attached": all(m.gpu is backend.gpu for m in server._creative_model.model.modules() if hasattr(m, "gpu"))}
        import numpy as np
        import torch
        random.seed(fixture["seed"])
        np.random.seed(fixture["seed"])
        torch.manual_seed(fixture["seed"])
        payload = {**case["body"], "awareness": fixture["awareness"]}
        report["request"] = payload
        from starlette.requests import Request
        encoded = json.dumps(payload).encode()
        async def receive():
            return {"type": "http.request", "body": encoded, "more_body": False}
        request = Request({"type": "http", "method": "POST", "path": "/evaluation",
                           "headers": [(b"x-maxcore-user-id", b"quality-eval-fictional")]}, receive)
        owner_token = server._request_job_owner.set("quality-eval-fictional")
        key = {"id": "quality-eval-generate-only", "scopes": ["generate", "read"]}
        func = getattr(server, case["handler"])
        kwargs = {"_key": key}
        if case["request_class"]:
            req = getattr(server, case["request_class"])(**payload)
            kwargs["req"] = req
            report["validated_request"] = req.model_dump()
        if "request" in inspect.signature(func).parameters:
            kwargs["request"] = request
        sys.setprofile(profile)
        threading.setprofile_all_threads(profile)
        sys.settrace(trace)
        threading.settrace_all_threads(trace)
        report["status"] = "running"
        save()
        response = await asyncio.wait_for(func(**kwargs), 100)
        if hasattr(response, "body"):
            report["http_status"] = response.status_code
            response = json.loads(response.body)
        report["response"] = response
        report["status"] = "returned"
        save()
        if isinstance(response, dict) and response.get("job_id"):
            jid = response["job_id"]
            poll = server.api_poll_audio_job if case["kind"] == "audio" else server.api_poll_video_job
            report["polls"] = []
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                value = await poll(jid, request, _key=key)
                report["polls"].append(value)
                report["terminal"] = value
                save()
                if value.get("status") in ("done", "error", "cancelled"):
                    break
                await asyncio.sleep(2)
            else:
                report["status"] = "job-timeout"
        server._request_job_owner.reset(owner_token)
        report["connection"]["after"] = backend.status()
    except Exception as exc:
        report.update(status="error", error=f"{type(exc).__name__}: {exc}",
                      detail=getattr(exc, "detail", None), traceback=traceback.format_exc())
    finally:
        sys.setprofile(None)
        threading.setprofile_all_threads(None)
        sys.settrace(None)
        threading.settrace_all_threads(None)
        if "backend" in locals():
            report["connection"]["after"] = backend.status()
        def urls(value):
            if isinstance(value, dict):
                for item in value.values():
                    yield from urls(item)
            elif isinstance(value, list):
                for item in value:
                    yield from urls(item)
            elif isinstance(value, str) and value.startswith("/uploads/"):
                yield value
        own_files = { (uploads / u.removeprefix("/uploads/")).resolve()
                     for u in urls([report.get("response"), report.get("terminal")]) }
        for p in own_files:
            if uploads.resolve() in p.parents and p.is_file() and p.resolve() not in old_files and p.suffix.lower() in (".png", ".jpg", ".mp4", ".mp3", ".wav", ".webm"):
                target = out / "media" / p.relative_to(uploads)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(p, target)
                report["files"].append({"path": str(target.relative_to(ROOT)), "bytes": p.stat().st_size, "sha256": sha(p)})
        report["after"] = identity()
        report["checkpoint_preserved"] = report["before"] == report["after"]
        report["finished"] = True
        save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--case")
    parser.add_argument("--only", nargs="+")
    args = parser.parse_args()
    fixture = json.loads(FIXTURE.read_text())
    if args.case:
        asyncio.run(child(next(c for c in fixture["cases"] if c["id"] == args.case), fixture, args.output.resolve()))
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)  # Terminate only this disposable evaluator's background workers.
    args.output.mkdir(parents=True, exist_ok=False)
    for case in fixture["cases"]:
        if args.only and case["id"] not in args.only:
            continue
        folder = args.output / case["id"]
        folder.mkdir()
        before = identity()
        with (folder / "process.log").open("w") as log:
            proc = subprocess.Popen([sys.executable, __file__, "--case", case["id"], "--output", str(folder)],
                                    stdout=log, stderr=log, start_new_session=True,
                                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
            try:
                exit_code = proc.wait(timeout=220)
            except subprocess.TimeoutExpired:
                exit_code = 124
            finally:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait()
        (folder / "supervisor.json").write_text(json.dumps(
            {"exit_code": exit_code, "before": before, "after": identity()}, indent=2))
        print(case["id"], "exit", exit_code, flush=True)


if __name__ == "__main__":
    main()