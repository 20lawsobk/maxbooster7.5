"""Live awareness snapshot -> isolated candidate. Never a serving-weight writer."""
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

from ai_model.awareness.engine import Snapshot, canonical
from ai_model.training.candidate_corpus import build_manifest

ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT / "ai_model" / "training" / "live_learning_runs"


class Blocked(Exception):
    def __init__(self, code, message, status=409):
        super().__init__(message)
        self.code, self.status = code, status


def eligible_records(snapshot):
    """Use already-collected awareness observations, without claiming a license.

    The upstream live-source collectors and snapshot validation own admission.
    Candidate metadata explicitly records unknown licensing and attribution.
    """
    records, excluded = [], 0
    for domain, rows in snapshot.to_dict()["domains"].items():
        for row in rows:
            records.append({
                "text": row["text"], "license": "NOASSERTION", "private": "unknown",
                "source": row["citation"], "author": "unattributed live observation",
                "purpose": "training", "provenance_type": "maxcore_live_awareness",
                "live_provenance": {"snapshot_id": snapshot.id, "record_id": row["id"],
                                    "domain": domain, "source": row["source"],
                                    "observed_at": row["observed_at"],
                                    "text_sha256": hashlib.sha256(row["text"].encode()).hexdigest()},
            })
    if not records:
        raise Blocked("blocked_awareness", "Fresh live awareness snapshot contains no observations")
    return records, excluded


def split_snapshot(snapshot, records):
    """Reserve one distinct live observation as an automatic, run-frozen holdout.

    This is a leakage-resistant training split, not independent quality
    certification. Promotion still requires the separate reviewed protocol.
    """
    rows = [(domain, row) for domain, values in snapshot.to_dict()["domains"].items()
            for row in values]
    candidates = sorted(rows, key=lambda item: hashlib.sha256(
        (snapshot.id + "\0" + item[1]["id"]).encode()).hexdigest())
    last_error = None
    for domain, heldout in candidates:
        training = [record for record in records
                    if record["live_provenance"]["record_id"] != heldout["id"]]
        if not training:
            continue
        holdout = {
            "schema": 1, "frozen": True, "provenance": "same_snapshot_source_split",
            "snapshot_id": snapshot.id,
            "cases": [{"id": "snapshot-" + hashlib.sha256(
                heldout["id"].encode()).hexdigest()[:24], "prompt": heldout["text"]}],
        }
        holdout_text = holdout["cases"][0]["prompt"]
        try:
            manifest = build_manifest(training, [holdout_text], smoke_only=False)
            if any(item["reason"] != "duplicate" for item in manifest["rejected"]):
                raise ValueError("Reserved observation overlaps training or fails data screening")
            return training, holdout, canonical(holdout).encode()
        except ValueError as exc:
            last_error = exc
    raise Blocked("blocked_corpus", "Live snapshot lacks distinct, separable training and holdout observations") from last_error


def holdout_texts(data):
    cases = data.get("cases")
    if (data.get("schema") != 1 or data.get("frozen") is not True
            or not isinstance(cases, list) or not 1 <= len(cases) <= 64):
        raise Blocked("blocked_holdout", "Independent frozen holdout required")
    texts, ids = [], set()
    for case in cases:
        if (not isinstance(case, dict) or not isinstance(case.get("id"), str)
                or case["id"] in ids or not isinstance(case.get("prompt"), str)
                or not case["prompt"].strip()):
            raise Blocked("blocked_holdout", "Invalid or duplicate holdout case")
        ids.add(case["id"])
        texts.append(case["prompt"])
        if case.get("expected"):
            if not isinstance(case["expected"], str):
                raise Blocked("blocked_holdout", "Invalid holdout answer")
            texts.append(case["expected"])
    return texts


def write_new(path, raw):
    """Publish complete, fsynced bytes exclusively; readers never see partial JSON."""
    temporary = path.with_name("." + path.name + "-" + uuid.uuid4().hex)
    try:
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def candidate_path(run_id):
    return ROOT / "ai_model/training/candidate_runs" / run_id


def admission_path(run_id):
    return ROOT / "ai_model/training/live_candidate_admissions" / run_id


def file_hash(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Missing or symlink artifact")
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_report(run_id, corpus_hash, holdout_hash):
    candidate = candidate_path(run_id)
    report_path = candidate / "report.json"
    if report_path.stat().st_size > 2_000_000:
        raise ValueError("Oversized report")
    report = json.loads(report_path.read_bytes())
    if not isinstance(report, dict):
        raise ValueError("Report must be an object")
    if (type(report.get("schema")) is not int or report["schema"] != 1
            or report.get("protected_unchanged") is not True
            or report.get("smoke_only") is not False
            or report.get("backend_exclusive") is not True
            or report.get("training_backend_scope") != "manual-digital-v1"
            or report.get("input_sha256") != corpus_hash
            or report.get("holdout_sha256") != holdout_hash):
        raise ValueError("Missing execution contract")
    for key in ("gemm_forward_calls", "gemm_backward_calls"):
        if type(report.get(key)) is not int or report[key] <= 0:
            raise ValueError("Invalid operation counters")
    changed = report.get("changed_parameters")
    losses = report.get("training_loss")
    counts = report.get("candidate_dispatch_counts")
    if (not isinstance(changed, list) or not changed
            or any(not isinstance(p, str) or not p for p in changed)
            or not isinstance(losses, list) or not losses
            or any(type(n) not in (int, float) or not math.isfinite(n) for n in losses)
            or not isinstance(counts, dict)
            or type(counts.get("transformer_backward")) is not int
            or counts["transformer_backward"] < 1):
        raise ValueError("Invalid measured training evidence")
    checkpoint_hash = report.get("checkpoint_sha256")
    if (not isinstance(checkpoint_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", checkpoint_hash)
            or file_hash(candidate / "candidate.pt") != checkpoint_hash
            or file_hash(candidate / "input.manifest.json") != corpus_hash
            or (candidate / "FAILED").exists()):
        raise ValueError("Checkpoint or input evidence mismatch")
    return {"checkpoint_sha256": checkpoint_hash, "report_sha256": file_hash(report_path)}


def record_failure(folder, result):
    candidate = candidate_path(folder.name)
    if candidate.is_dir():
        with (candidate / "FAILED").open("ab") as stream:
            stream.flush()
            os.fsync(stream.fileno())
        sync_directory(candidate)
    for target in (folder, admission_path(folder.name)):
        if target.is_dir() and not (target / "result.json").exists():
            write_new(target / "result.json", canonical(result).encode())


def reconcile_locked():
    """Only called with exclusive global lock: no surviving inherited worker exists.

    Never recover success from worker files: an interrupted parent did not certify
    them. Existing success without its final certificate is also interrupted.
    """
    for folder in JOBS.iterdir():
        if not folder.is_dir() or not re.fullmatch(r"live-[0-9a-f]{32}", folder.name):
            continue
        marker = admission_path(folder.name)
        if (marker / "certified.json").is_file():
            continue
        try:
            result = json.loads((folder / "result.json").read_text())
            if isinstance(result, dict) and result.get("status") not in ("running", "candidate_trained_unreviewed"):
                continue
        except (OSError, ValueError):
            pass
        result = {"run_id": folder.name, "status": "failed_interrupted",
                  "quality_claim": "none", "promotion_performed": False}
        # Preserve previously published bytes as evidence; terminal reconciliation
        # overrides them in a separate immutable file.
        record_failure(folder, result)
        if not (folder / "reconciled.json").exists():
            write_new(folder / "reconciled.json", canonical(result).encode())


def list_runs():
    JOBS.mkdir(parents=True, exist_ok=True, mode=0o700)
    if JOBS.is_symlink() or JOBS.resolve() != JOBS:
        raise Blocked("blocked_storage", "Learning directory cannot contain symlinks")
    with (JOBS / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass  # A parent or inherited worker still owns the admission.
        else:
            reconcile_locked()
        results = []
        for folder in sorted(JOBS.iterdir()):
            if not folder.is_dir() or not re.fullmatch(r"live-[0-9a-f]{32}", folder.name):
                continue
            result = {"run_id": folder.name, "status": "running", "promotion_performed": False}
            for name in ("reconciled.json", "result.json", "admission.json"):
                try:
                    value = json.loads((folder / name).read_text())
                    if isinstance(value, dict):
                        result = value
                        break
                except (OSError, ValueError):
                    continue
            if (result.get("status") == "candidate_trained_unreviewed"
                    and not (admission_path(folder.name) / "certified.json").is_file()):
                result = {**result, "status": "running"}
            results.append(result)
        return results


def execute(engine, steps=4):
    """One bounded subprocess globally; serving process never imports the trainer."""
    if type(steps) is not int or not 1 <= steps <= 64:
        raise Blocked("blocked_bounds", "steps must be an integer in 1..64", 422)
    JOBS.mkdir(parents=True, exist_ok=True, mode=0o700)
    if JOBS.is_symlink() or JOBS.resolve() != JOBS:
        raise Blocked("blocked_storage", "Learning directory cannot contain symlinks")
    with (JOBS / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Blocked("blocked_busy", "An isolated learning run is already active", 429) from exc
        reconcile_locked()
        # Bounded retained jobs; never silently delete audit/provenance records.
        if sum(p.is_dir() for p in JOBS.iterdir()) >= 100:
            raise Blocked("blocked_capacity", "Learning audit capacity reached; operator archival required", 507)
        snapshot = Snapshot.parse(engine.require_snapshot().to_dict())
        records, excluded = eligible_records(snapshot)
        records, holdout, holdout_raw = split_snapshot(snapshot, records)
        holdout_hash = hashlib.sha256(holdout_raw).hexdigest()
        try:
            manifest = build_manifest(records, holdout_texts(holdout), smoke_only=False)
            if any(r["reason"] != "duplicate" for r in manifest["rejected"]):
                raise ValueError("Holdout overlap or sensitive text")
        except ValueError as exc:
            raise Blocked("blocked_corpus", "Live corpus failed privacy or holdout separation checks") from exc
        run_id = "live-" + uuid.uuid4().hex
        folder = JOBS / run_id
        folder.mkdir(mode=0o700)
        sync_directory(JOBS)
        # Separate sidecar exists durably BEFORE trainer creates its own directory.
        # Registry requires certification for every live-* ID even if this marker
        # is lost, so there is no candidate-directory creation race.
        marker = admission_path(run_id)
        marker.mkdir(parents=True, mode=0o700)
        if marker.resolve() != marker:
            raise Blocked("blocked_storage", "Admission directory cannot contain symlinks")
        sync_directory(marker.parent)
        sync_directory(marker.parent.parent)
        write_new(marker / "admission.json", canonical({"schema": 1, "run_id": run_id,
                                                      "state": "pending"}).encode())
        corpus = canonical({"schema": 1, "records": records}).encode()
        corpus_hash = hashlib.sha256(corpus).hexdigest()
        for name, raw in (("corpus.json", corpus), ("holdout.json", holdout_raw),
                          ("snapshot.json", snapshot._json.encode())):
            write_new(folder / name, raw)
        result = {"run_id": run_id, "snapshot_id": snapshot.id,
                  "holdout_sha256": holdout_hash,
                  "corpus_sha256": corpus_hash, "eligible_records": len(manifest["records"]),
                  "excluded_unlicensed_records": excluded, "status": "running",
                  "quality_claim": "none", "promotion_performed": False}
        write_new(folder / "admission.json", canonical(result).encode())
        command = [sys.executable, "-m", "ai_model.training.live_learning",
                   "--worker", str(lock.fileno()),
                   "--corpus", str(folder / "corpus.json"), "--corpus-sha256", corpus_hash,
                   "--holdout", str(folder / "holdout.json"), "--holdout-sha256", holdout_hash,
                   "--run-id", run_id, "--steps", str(steps), "--manual-backward"]
        try:
            # Output stays off the HTTP surface. Trainer has no network/source fetch
            # and uses only the existing manual DigitalGPU reverse-mode backend.
            with (folder / "worker.log").open("xb") as output:
                completed = subprocess.run(command, cwd=ROOT, stdout=output,
                                           stderr=subprocess.STDOUT, timeout=120,
                                           pass_fds=(lock.fileno(),))
            if completed.returncode == 124:
                result["status"] = "blocked_timeout"
            elif completed.returncode != 0:
                result["status"] = "failed_training"
            else:
                result.update(validate_report(run_id, corpus_hash, holdout_hash))
                result["status"] = "candidate_trained_unreviewed"
        except subprocess.TimeoutExpired:
            result["status"] = "blocked_timeout"
        except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError, RecursionError):
            result["status"] = "failed_execution_evidence"
        if result["status"] != "candidate_trained_unreviewed":
            record_failure(folder, result)
        else:
            raw = canonical(result).encode()
            write_new(folder / "result.json", raw)
            write_new(marker / "result.json", raw)
            # Last durable write is the certification commit point. This grants
            # only bundle review eligibility, never quality acceptance/promotion.
            write_new(marker / "certified.json", canonical({
                "schema": 1, "run_id": run_id, **{
                    k: result[k] for k in ("checkpoint_sha256", "report_sha256")},
                "admission_sha256": file_hash(marker / "admission.json"),
                "result_sha256": hashlib.sha256(raw).hexdigest(),
            }).encode())
        return result


def create_router(authorize, engine_factory):
    from fastapi import APIRouter, Depends
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel, ConfigDict, Field
    from ai_model.awareness.engine import AwarenessUnavailable

    class LearningRequest(BaseModel):
        model_config = ConfigDict(extra="forbid")
        steps: int = Field(default=4, ge=1, le=64, strict=True)

    router = APIRouter()

    @router.on_event("startup")
    def reconcile_startup():
        list_runs()

    @router.get("/api/training/candidates/live")
    def listing(_admin=Depends(authorize)):
        return {"runs": list_runs()}

    @router.get("/api/training/candidates/live/{run_id}")
    def status(run_id: str, _admin=Depends(authorize)):
        if not re.fullmatch(r"live-[0-9a-f]{32}", run_id):
            return JSONResponse({"status": "not_found"}, status_code=404)
        return next((r for r in list_runs() if r["run_id"] == run_id),
                    JSONResponse({"status": "not_found"}, status_code=404))

    @router.post("/api/training/candidates/live")
    def learn(body: LearningRequest, _admin=Depends(authorize)):
        try:
            result = execute(engine_factory(), body.steps)
            return JSONResponse(result, status_code=201 if result["status"] == "candidate_trained_unreviewed" else 409)
        except Blocked as exc:
            return JSONResponse({"status": exc.code, "detail": str(exc),
                                 "promotion_performed": False}, status_code=exc.status)
        except AwarenessUnavailable:
            return JSONResponse({"status": "blocked_awareness",
                                 "detail": "Validated fresh live snapshot unavailable"}, status_code=503)

    return router


def worker_main(arguments):
    """Independent deadline owner survives an API-parent crash.

    Both supervisor and actual trainer inherit the lock; API restart cannot
    reconcile or admit another job while either process is still executing.
    """
    if len(arguments) < 3 or arguments[0] != "--worker":
        raise ValueError("Internal bounded worker invocation required")
    lock_fd = int(arguments[1])
    try:
        return subprocess.run(
            [sys.executable, "-m", "ai_model.training.candidate_manifest_train", *arguments[2:]],
            timeout=110, pass_fds=(lock_fd,),
        ).returncode
    except subprocess.TimeoutExpired:
        return 124


if __name__ == "__main__":
    sys.exit(worker_main(sys.argv[1:]))