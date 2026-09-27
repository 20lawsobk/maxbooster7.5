#!/usr/bin/env python3
"""Retest real server initialization and text handler, never startup trainers.

This is an in-process handler evaluation, not HTTP/auth or production acceptance.
No awareness, batching, GPU, sampler or response implementation is replaced.
"""
import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import re
import sys
import threading
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "external/maxcore/artifacts/ai-training-server"


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def protect_evaluation_files(event, args):
    """Prevent Python-side checkpoint writes and janitor deletion of user files."""
    weights_dir = MODEL / "ai_model/weights"
    protected_deletion = (weights_dir, MODEL / "uploads", Path("/tmp/maxbooster_jobs"))

    def within(value, roots):
        if not isinstance(value, (str, bytes, os.PathLike)):
            return False
        path = Path(os.fsdecode(value)).resolve()
        return any(path == root or root in path.parents for root in roots)

    if event == "open":
        path, mode, flags = args
        writing = (flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)) != 0
        if writing and within(path, (weights_dir,)):
            raise PermissionError("Evaluation forbids checkpoint/weights writes")
    elif event in ("os.remove", "os.rmdir"):
        if within(args[0], protected_deletion):
            raise PermissionError("Evaluation forbids generated-file/checkpoint deletion")
    elif event in ("os.rename", "os.link", "os.symlink"):
        if any(within(path, protected_deletion) for path in args[:2]):
            raise PermissionError("Evaluation forbids replacing protected files")


async def evaluate(out):
    weights = MODEL / "ai_model/weights/model.pt"
    release = MODEL / "ai_model/weights/model.release.json"
    fixture_path = ROOT / "evaluations/maxcore-quality/cases.json"
    fixture = json.loads(fixture_path.read_text())
    before = {"checkpoint": sha(weights), "release": sha(release)}
    report = {"started": datetime.now(timezone.utc).isoformat(), "before": before,
              "fixture_sha256": sha(fixture_path), "samples": [],
              "scope": "Actual server model initializer and /api/generate/text handler; no HTTP/auth test, no startup training/storage workers.",
              "trace": {}, "status": "running"}
    calls = Counter()
    awareness_observations = []
    agent_outputs = []
    gpu_errors = []

    def profile(frame, event, arg):
        filename = frame.f_code.co_filename
        name = frame.f_code.co_name
        if str(MODEL) in filename and event == "return":
            if filename.endswith("quality_awareness.py") and name in ("get_doc", "brief_enrichment"):
                awareness_observations.append({"function": name, "nonempty_result": bool(arg)})
            if filename.endswith("agents/script_agent.py") and name == "run" and arg is not None:
                agent_outputs.append({key: getattr(arg, key, None) for key in ("source", "hook", "body", "cta")})
        if event != "call":
            return
        if str(MODEL) in filename and (
            "awareness" in filename or "/generation/" in filename or
            "request_intelligence" in filename or "/gpu/" in filename or
            name in ("_effective_awareness", "_merged_awareness_for", "_platform_optimization_awareness")
        ):
            calls[f"{Path(filename).relative_to(MODEL)}:{name}"] += 1

    def trace_errors(frame, event, arg):
        if "/ai_model/gpu/" not in frame.f_code.co_filename:
            return None
        if event == "exception":
            kind, exc, _ = arg
            gpu_errors.append({"function": frame.f_code.co_name, "error": f"{kind.__name__}: {exc}"})
        return trace_errors

    def save():
        report["trace"] = dict(sorted(calls.items()))
        report["awareness_observations"] = awareness_observations
        report["agent_outputs"] = agent_outputs
        report["gpu_errors"] = gpu_errors
        (out / "results.json").write_text(json.dumps(report, indent=2, default=str) + "\n")

    failure = None
    try:
        manifest = json.loads(release.read_text())
        assert before["checkpoint"] == manifest["sha256"]
        assert weights.stat().st_size == manifest["bytes"]
        # No DB credential is read/logged; DB logging is deliberately unavailable.
        # Do not call on_startup or _init_storage: both launch autonomous writers.
        os.environ["DATABASE_URL"] = ""
        os.environ["AI_DYNAMIC_BATCHING"] = "1"
        sys.addaudithook(protect_evaluation_files)
        sys.dont_write_bytecode = True
        sys.path.insert(0, str(MODEL))
        spec = importlib.util.spec_from_file_location("maxcore_eval_server", MODEL / "server.py")
        server = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = server
        spec.loader.exec_module(server)
        report["server_sha256"] = sha(MODEL / "server.py")
        report["runner_sha256"] = sha(Path(__file__))
        sys.setprofile(profile)
        threading.setprofile(profile)
        sys.settrace(trace_errors)
        threading.settrace(trace_errors)
        await asyncio.to_thread(server._init_ai_model)
        if not server._model_ready:
            raise RuntimeError(f"Real server initialization failed: {server._model_init_error}")
        backend = server._hyper_backend
        if backend is None:
            raise RuntimeError("Primary digital GPU backend unavailable; refusing alternate path")
        model = server._creative_model.model
        attached = {n: m.gpu is backend.gpu for n, m in model.named_modules() if hasattr(m, "gpu")}
        if not attached or not all(attached.values()):
            raise RuntimeError("Not all GPU modules reference the server backend")
        report["connection"] = {"backend": type(backend).__name__, "model": type(model).__name__,
                                "module_attachment": attached, "before": backend.status()}
        import numpy as np
        import torch
        from ai_model.model import creative_model
        from ai_model.generation import build_context
        save()
        with (out / "responses.jsonl").open("x") as stream:
            for case in fixture["cases"]:
                platform_match = re.search(r"<PLATFORM_(\w+)>", case["prompt"])
                topic = re.sub(r"<[^>]+>", "", case["prompt"]).strip()
                platform = platform_match[1].lower() if platform_match else "general"
                for seed in fixture["seeds"]:
                    random.seed(seed)
                    np.random.seed(seed)
                    torch.manual_seed(seed)
                    creative_model._gen_cache.clear()
                    req = server.ApiGenerateTextRequest(
                        mode="content", platform=platform, topic=topic, tone="authentic",
                        intent="engagement", instruction=case["criteria"])
                    row = {"id": case["id"], "seed": seed, "request": req.model_dump(),
                           "status": "running"}
                    start = time.monotonic()
                    previous = calls.copy()
                    aw_start, agent_start, gpu_start = len(awareness_observations), len(agent_outputs), len(gpu_errors)
                    try:
                        # Explicitly observe real awareness assembly before invoking
                        # the handler, which also executes its own assembly.
                        context = await asyncio.to_thread(
                            build_context, "text", req, with_technique=False,
                            platform=platform, topic=topic, goal="engagement", tone="authentic")
                        effective = await asyncio.to_thread(
                            server._effective_awareness, platform, context.awareness)
                        row["awareness"] = {
                            "merged_chars": len(context.awareness),
                            "effective_chars": len(effective),
                            "effective_sha256": hashlib.sha256(effective.encode()).hexdigest()}
                        row["response"] = await asyncio.wait_for(server.api_generate_text(req), timeout=60)
                        row["status"] = "returned"
                    except Exception as exc:
                        row.update(status="error", error=f"{type(exc).__name__}: {exc}",
                                   detail=getattr(exc, "detail", None), traceback=traceback.format_exc())
                    row["elapsed_seconds"] = time.monotonic() - start
                    row["trace_delta"] = dict(calls - previous)
                    row["awareness_observations"] = awareness_observations[aw_start:]
                    row["agent_outputs"] = agent_outputs[agent_start:]
                    row["gpu_errors"] = gpu_errors[gpu_start:]
                    report["samples"].append(row)
                    stream.write(json.dumps(row, default=str) + "\n")
                    stream.flush()
                    save()
                    print(case["id"], seed, row["status"], flush=True)
                    if isinstance(row.get("error"), str) and row["error"].startswith("TimeoutError"):
                        raise RuntimeError("Timed-out handler may still run; refusing overlapping trials")
        report["connection"]["after"] = backend.status()
        report["status"] = "attempts-recorded-not-quality-accepted"
    except Exception as exc:
        failure = exc
        report.update(status="blocked", error=f"{type(exc).__name__}: {exc}", traceback=traceback.format_exc())
    finally:
        sys.setprofile(None)
        threading.setprofile(None)
        sys.settrace(None)
        threading.settrace(None)
        report["after"] = {"checkpoint": sha(weights), "release": sha(release)}
        report["checkpoint_preserved"] = report["after"] == before
        report["finished"] = datetime.now(timezone.utc).isoformat()
        save()
    return 1 if failure or not report["checkpoint_preserved"] else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    # asyncio.run may wait for failed handler threads; outer shell timeout bounds it.
    raise SystemExit(asyncio.run(evaluate(args.output)))