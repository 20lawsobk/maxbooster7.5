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

from ai_model.awareness.engine import canonical
from ai_model.training.candidate_corpus import build_manifest
from ai_model.training.public_curriculum import PEAK_POLICY, peak_stream, validate_peak_record

ROOT = Path(__file__).resolve().parents[2]
from ai_model.training.storage import training_root
JOBS = training_root(ROOT) / "live_learning_runs"


class Blocked(Exception):
    def __init__(self, code, message, status=409):
        super().__init__(message)
        self.code, self.status = code, status


def eligible_records(observation_set):
    """Use fresh scanner observations without requiring a complete snapshot.

    Candidate metadata records public scanner access and unknown licensing and
    attribution explicitly. Public-live serving retains numerical validation.
    """
    rows = observation_set.get("records") if isinstance(observation_set, dict) else None
    set_id = observation_set.get("id") if isinstance(observation_set, dict) else None
    if not isinstance(rows, list) or not rows:
        raise Blocked("blocked_observations", "No recent validated source observations are available")
    row_keys = {"id", "source", "domain", "observed_at", "text", "citation",
                "value", "metric", "score"}
    if any(not isinstance(row, dict) or set(row) != row_keys for row in rows):
        raise Blocked("blocked_observations", "Source observation set failed integrity validation")
    identity = {
        "schema": 1,
        "records": [{key: row[key] for key in
                     ("id", "source", "domain", "observed_at")} for row in rows],
    }
    if observation_set.get("policy") is not None:
        if observation_set["policy"] != PEAK_POLICY:
            raise Blocked("blocked_observations", "Unknown public learning policy")
        identity["policy"] = PEAK_POLICY
    sources = sorted({row["source"] for row in rows})
    domains = sorted({row["domain"] for row in rows})
    if (not isinstance(set_id, str)
            or not re.fullmatch(r"[0-9a-f]{64}", set_id)
            or hashlib.sha256(canonical(identity).encode()).hexdigest() != set_id
            or observation_set.get("sources") != sources
            or observation_set.get("domains") != domains
            or type(observation_set.get("collected_at")) not in (int, float)
            or not math.isfinite(observation_set["collected_at"])):
        raise Blocked("blocked_observations", "Source observation set failed integrity validation")
    records, excluded = [], 0
    for row in rows:
        records.append({
            "text": row["text"], "license": "NOASSERTION", "private": False,
            "source": row["citation"], "author": "unattributed live observation",
            "purpose": "training",
            "provenance_type": "maxcore_live_awareness_observation",
            "live_provenance": {
                "access": "public",
                "observation_set_id": set_id, "record_id": row["id"],
                "domain": row["domain"], "source": row["source"],
                "observed_at": row["observed_at"],
                "text_sha256": hashlib.sha256(row["text"].encode()).hexdigest(),
            },
        })
        if observation_set.get("policy") == PEAK_POLICY:
            records[-1]["live_provenance"].update(
                learning_policy=PEAK_POLICY, metric=row["metric"], value=row["value"])
            try:
                validate_peak_record(records[-1])
            except ValueError as exc:
                raise Blocked("waiting_for_public_peak_content", str(exc), 503) from exc
    if not records:
        raise Blocked("blocked_observations", "No recent validated source observations are available")
    return records, excluded


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
    return training_root(ROOT) / "candidate_runs" / run_id


def admission_path(run_id):
    return training_root(ROOT) / "live_candidate_admissions" / run_id


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


def execute(engine, steps=4, *, context_tokens=1024, peak_content=True,
            model_config=None, worker_timeout=120):
    """One bounded subprocess globally; serving process never imports the trainer."""
    if type(steps) is not int or not 1 <= steps <= 64:
        raise Blocked("blocked_bounds", "steps must be an integer in 1..64", 422)
    if type(context_tokens) is not int or not 128 <= context_tokens <= 4096:
        raise Blocked("blocked_bounds", "context_tokens must be an integer in 128..4096", 422)
    if type(worker_timeout) is not int or not 10 <= worker_timeout <= 600:
        raise Blocked("blocked_bounds", "worker_timeout must be an integer in 10..600", 422)
    stream = peak_stream(model_config) if peak_content else None
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
        maximum_runs = int(os.environ.get("MAXCORE_LEARNING_MAX_RETAINED_RUNS", "10000"))
        if not 100 <= maximum_runs <= 100000:
            raise Blocked("blocked_bounds", "Learning retained run limit must be 100..100000", 422)
        if sum(p.is_dir() for p in JOBS.iterdir()) >= maximum_runs:
            raise Blocked("blocked_capacity", "Learning audit capacity reached; operator archival required", 507)
        if peak_content:
            if not callable(getattr(engine, "peak_training_observations", None)):
                raise Blocked("waiting_for_public_peak_content", "Public peak-content scanner unavailable", 503)
            observation_set = engine.peak_training_observations()
            if observation_set.get("policy") != PEAK_POLICY:
                raise Blocked("waiting_for_public_peak_content", "Public peak-content policy required", 503)
        else:
            observation_set = engine.training_observations()
        records, excluded = eligible_records(observation_set)
        try:
            manifest = build_manifest(
                records, [], smoke_only=False, allow_live_without_holdout=True,
            )
            if any(r["reason"] != "duplicate" for r in manifest["rejected"]):
                raise ValueError("Live corpus failed privacy or sensitive-data screening")
        except ValueError as exc:
            raise Blocked("blocked_corpus", "Validated live corpus failed data screening") from exc
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
        corpus_document = {"schema": 1, "records": records}
        if stream:
            corpus_document["learning_stream"] = stream
        corpus = canonical(corpus_document).encode()
        corpus_hash = hashlib.sha256(corpus).hexdigest()
        observation_manifest = {
            "schema": 1, "id": observation_set["id"],
            "collected_at": observation_set["collected_at"],
            "sources": observation_set["sources"], "domains": observation_set["domains"],
            "records": [{"id": row["id"], "source": row["source"],
                         "domain": row["domain"], "observed_at": row["observed_at"]}
                        for row in observation_set["records"]],
        }
        for name, raw in (("corpus.json", corpus),
                          ("observation_set.json", canonical(observation_manifest).encode())):
            write_new(folder / name, raw)
        result = {"run_id": run_id, "observation_set_id": observation_set["id"],
                  "observed_sources": observation_set["sources"],
                  "observation_count": len(observation_set["records"]),
                  "holdout_sha256": None,
                  "corpus_sha256": corpus_hash, "eligible_records": len(manifest["records"]),
                  "excluded_unlicensed_records": excluded, "status": "running",
                  "quality_claim": "none", "promotion_performed": False}
        write_new(folder / "admission.json", canonical(result).encode())
        command = [sys.executable, "-m", "ai_model.training.live_learning",
                   "--worker", str(lock.fileno()),
                   "--corpus", str(folder / "corpus.json"), "--corpus-sha256", corpus_hash,
                   "--run-id", run_id, "--steps", str(steps),
                   "--context-tokens", str(context_tokens), "--manual-backward"]
        command.extend(["--worker-timeout", str(worker_timeout)])
        try:
            # Output stays off the HTTP surface. Trainer has no network/source fetch
            # and uses only the existing manual DigitalGPU reverse-mode backend.
            with (folder / "worker.log").open("xb") as output:
                completed = subprocess.run(command, cwd=ROOT, stdout=output,
                                           stderr=subprocess.STDOUT, timeout=worker_timeout + 10,
                                           pass_fds=(lock.fileno(),))
            if completed.returncode == 124:
                result["status"] = "blocked_timeout"
            elif completed.returncode != 0:
                result["status"] = "failed_training"
            else:
                result.update(validate_report(run_id, corpus_hash, None))
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


def create_router(authorize, engine_factory, *, peak_content=True):
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
            result = execute(engine_factory(), body.steps, peak_content=peak_content)
            return JSONResponse(result, status_code=201 if result["status"] == "candidate_trained_unreviewed" else 409)
        except Blocked as exc:
            return JSONResponse({"status": exc.code, "detail": str(exc),
                                 "promotion_performed": False}, status_code=exc.status)
        except AwarenessUnavailable as exc:
            return JSONResponse({
                "status": "blocked_observations",
                "detail": "Validated recent observations from configured sources are unavailable",
                "reason": getattr(exc, "code", "observation_cache_unavailable"),
            }, status_code=503)

    return router


def worker_main(arguments):
    """Independent deadline owner survives an API-parent crash.

    Both supervisor and actual trainer inherit the lock; API restart cannot
    reconcile or admit another job while either process is still executing.
    """
    if len(arguments) < 3 or arguments[0] != "--worker":
        raise ValueError("Internal bounded worker invocation required")
    lock_fd = int(arguments[1])
    trainer_arguments = list(arguments[2:])
    timeout_index = trainer_arguments.index("--worker-timeout") if "--worker-timeout" in trainer_arguments else None
    timeout = 110
    if timeout_index is not None:
        timeout = int(trainer_arguments[timeout_index + 1])
        del trainer_arguments[timeout_index:timeout_index + 2]
    if not 10 <= timeout <= 600:
        raise ValueError("Worker deadline outside bounds")
    try:
        return subprocess.run(
            [sys.executable, "-m", "ai_model.training.candidate_manifest_train", *trainer_arguments],
            timeout=timeout, pass_fds=(lock_fd,),
        ).returncode
    except subprocess.TimeoutExpired:
        return 124


if __name__ == "__main__":
    sys.exit(worker_main(sys.argv[1:]))
