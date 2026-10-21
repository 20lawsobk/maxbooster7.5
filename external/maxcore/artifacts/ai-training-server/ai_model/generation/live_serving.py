"""Continuously learn from live observations; serve only registry-selected releases.

Certified public observations are selected automatically without signatures.
Traditional corpus selection retains its review policy. Requests pin one
immutable adapter even during a switch.
"""
from contextlib import contextmanager
from contextvars import ContextVar
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time


class LiveModelUnavailable(RuntimeError):
    pass


class LiveServingModel:
    def __init__(self):
        self._active = None
        self._pinned = ContextVar("live_serving_release", default=None)

    def install(self, adapter, status):
        if (getattr(adapter, "runtime_only", True)
                or not getattr(adapter, "inference_backend_exclusive", False)
                or not status.get("checkpoint_sha256")):
            raise ValueError("Live serving requires a verified certified or reviewed adapter")
        self._active = (adapter, dict(status))

    @property
    def available(self):
        return self._active is not None

    def status(self):
        selected = self._pinned.get() or self._active
        return dict(selected[1]) if selected else {
            "requested": "live-awareness", "active": None,
            "candidate_quality": "awaiting_operational_public_live_candidate",
            "unavailable_reason": "no_operationally_capable_certified_public_live_candidate",
            "review_required": False,
            "backend_exclusive": "not_verified",
        }

    @contextmanager
    def pin(self, checkpoint=None):
        selected = self._pinned.get() or self._active
        if selected is None:
            raise LiveModelUnavailable("No operationally capable certified public live-awareness candidate is selected")
        if checkpoint and checkpoint != selected[1]["checkpoint_sha256"]:
            raise LiveModelUnavailable("Saved generation plan requires a different model release")
        token = self._pinned.set(selected)
        try:
            yield dict(selected[1])
        finally:
            self._pinned.reset(token)

    def __getattr__(self, name):
        selected = self._pinned.get() or self._active
        if selected is None:
            raise LiveModelUnavailable("No operationally capable certified public live-awareness candidate is selected")
        return getattr(selected[0], name)


class _PinnedObservations:
    def __init__(self, value):
        self.value = value

    def training_observations(self):
        return self.value

    def peak_training_observations(self):
        return self.value


class LiveLearningLoop:
    def __init__(self, engine_factory, model, state_dir, *, notify=None,
                 interval=900, poll=30, steps=4, context_tokens=1024,
                 trainer=None, loader=None, clock=time.time, peak_content=True,
                 model_config=None, bootstrap_steps=16, bootstrap_cooldown=300,
                 bootstrap_window=3600, bootstrap_max_runs=12, worker_timeout=120):
        if not 60 <= interval <= 86400 or not 1 <= poll <= 300:
            raise ValueError("Live learning interval must be 60..86400s; poll 1..300s")
        if type(steps) is not int or not 1 <= steps <= 64:
            raise ValueError("Live learning steps must be an integer in 1..64")
        if type(context_tokens) is not int or not 128 <= context_tokens <= 4096:
            raise ValueError("Live learning context must be an integer in 128..4096")
        if (type(bootstrap_steps) is not int or not 1 <= bootstrap_steps <= 64
                or type(bootstrap_cooldown) is not int or not 30 <= bootstrap_cooldown <= 3600
                or type(bootstrap_window) is not int or not 300 <= bootstrap_window <= 86400
                or type(bootstrap_max_runs) is not int or not 1 <= bootstrap_max_runs <= 120
                or type(worker_timeout) is not int or not 10 <= worker_timeout <= 600):
            raise ValueError("Invalid bounded public bootstrap budget")
        from ai_model.training.public_curriculum import peak_stream
        self.peak_content = peak_content
        self.model_config = peak_stream(model_config)["model_config"] if peak_content else None
        self.bootstrap_steps, self.bootstrap_cooldown = bootstrap_steps, bootstrap_cooldown
        self.bootstrap_window, self.bootstrap_max_runs = bootstrap_window, bootstrap_max_runs
        self.worker_timeout = worker_timeout
        self.engine_factory, self.model = engine_factory, model
        self.directory = Path(state_dir)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.directory.is_symlink() or self.directory.resolve() != self.directory:
            raise ValueError("Live serving state directory must not contain symlinks")
        self.notify, self.interval, self.poll = notify, interval, poll
        self.steps, self.context_tokens = steps, context_tokens
        self.trainer, self.loader, self.clock = trainer, loader, clock
        self._stop = threading.Event()
        self._thread = None
        self._guard = threading.Lock()
        self._status = {"training": "waiting_for_observations", "serving": "waiting_for_candidate"}

    def status(self):
        return {**self._status, "interval_seconds": self.interval,
                "reload_seconds": self.poll, "steps": self.steps,
                "context_tokens": self.context_tokens, "review_required": False,
                "learning_policy": "public-peak-shortform-v1" if self.peak_content else "legacy-context-v1",
                "model_config": self.model_config,
                "bootstrap_steps": self.bootstrap_steps,
                "bootstrap_cooldown_seconds": self.bootstrap_cooldown,
                "bootstrap_window_seconds": self.bootstrap_window,
                "bootstrap_max_runs": self.bootstrap_max_runs,
                "worker_timeout_seconds": self.worker_timeout}

    def _read_state(self):
        path = self.directory / "live-learning.json"
        if not path.exists():
            return {}
        if path.is_symlink():
            raise ValueError("Live learning state must not be a symlink")
        value = json.loads(path.read_text())
        if not isinstance(value, dict):
            raise ValueError("Invalid live learning state")
        return value

    def _save_state(self, value):
        fd, name = tempfile.mkstemp(prefix=".live-learning-", dir=self.directory)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(value, stream, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.directory / "live-learning.json")
            directory = os.open(self.directory, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(name):
                os.unlink(name)

    def _refresh_release(self):
        from .release import load_selected_release
        try:
            load_release = True
            selected_checkpoint = None
            if self.loader is None:
                from ai_model.training.auto_selection import auto_select
                selection_options = {"learning_policy": "public-peak-shortform-v1"} if self.peak_content else {}
                selection = auto_select(**selection_options)
                self._status = {**self._status, "selection": selection}
                if (selection.get("state") in {"selected", "retained"}
                        and (not self.peak_content or (
                            selection.get("validated_selected") is True
                            and selection.get("learning_policy") == "public-peak-shortform-v1"))):
                    selected_checkpoint = selection.get("checkpoint_sha256")
                if self.peak_content and not selected_checkpoint:
                    # A historical context pointer is never a peak release.
                    load_release = False
                if selected_checkpoint and selected_checkpoint == self.model.status().get("checkpoint_sha256"):
                    # Selection has just validated immutable runtime evidence;
                    # retain the pinned RAM adapter without rerunning probes.
                    load_release = False
            adapter, status = ((self.loader or load_selected_release)("live-awareness")
                               if load_release else (None, {}))
            if selected_checkpoint and adapter is not None and status.get("checkpoint_sha256") != selected_checkpoint:
                raise ValueError("Selected checkpoint changed before live release load")
            if adapter is not None and not self._stop.is_set():
                if status["checkpoint_sha256"] != self.model.status().get("checkpoint_sha256"):
                    self.model.install(adapter, status)
                self._status = {**self._status, "serving": "active", "release_error": None}
            else:
                self._status = {**self._status, "serving": "active" if self.model.available else "waiting_for_candidate"}
        except Exception as exc:
            # A rejected update must not replace a previously loaded good model.
            self._status = {**self._status, "serving": "active" if self.model.available else "blocked_release",
                            "release_error": type(exc).__name__,
                            "unavailable_reason": (None if self.model.available else
                                "no_operationally_capable_certified_public_live_candidate")}
        if self.notify and not self._stop.is_set():
            self.notify(self.model.available, {**self.model.status(), "live_learning": self.status()})

    def tick(self):
        if self._stop.is_set():
            return self.status()
        if not self._guard.acquire(blocking=False):
            return self.status()
        try:
            # Serving refresh does not depend on source freshness or training.
            self._refresh_release()
            with (self.directory / ".live-learning.lock").open("a") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self._status = {**self._status, "training": "another_owner"}
                    return self.status()
                state = self._read_state()
                now = self.clock()
                if state.get("last_result"):
                    restored = state["last_result"]
                    if restored == "running":
                        restored = "cooldown_after_interruption"
                    self._status = {**self._status, "training": restored,
                                    "last_run_id": state.get("last_run_id"),
                                    "next_training_at": state.get("next_training_at")}
                if now < state.get("next_training_at", 0):
                    return self.status()
                from ai_model.training.live_learning import execute, eligible_records, Blocked
                engine = self.engine_factory()
                if self.peak_content:
                    from ai_model.training.public_curriculum import PEAK_POLICY
                    try:
                        observations = engine.peak_training_observations()
                    except Exception as exc:
                        raise Blocked("waiting_for_public_peak_content", "Fresh complete public peak posts unavailable", 503) from exc
                    if observations.get("policy") != PEAK_POLICY:
                        raise Blocked("waiting_for_public_peak_content", "Public peak-content policy required", 503)
                else:
                    observations = engine.training_observations()
                eligible_records(observations)
                # Refresh timestamps alone must not repeatedly retrain the same
                # content. Store only this fingerprint, never source text.
                content = [{k: row[k] for k in ("source", "domain", "text", "citation", "value", "metric")}
                           for row in observations["records"]]
                content.sort(key=lambda row: json.dumps(row, sort_keys=True))
                identity = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
                bootstrap = self.peak_content and not self.model.available
                if identity == state.get("trained_content_sha256") and not bootstrap:
                    self._status = {**self._status, "training": "unchanged_observations"}
                    return self.status()
                if bootstrap:
                    window_start = state.get("bootstrap_window_start", now)
                    if now - window_start >= self.bootstrap_window:
                        state.update(bootstrap_window_start=now, bootstrap_runs=0)
                    else:
                        state.setdefault("bootstrap_window_start", now)
                    if state.get("bootstrap_runs", 0) >= self.bootstrap_max_runs:
                        state.update(next_training_at=state["bootstrap_window_start"] + self.bootstrap_window,
                                     last_result="bootstrap_budget_cooldown")
                        self._save_state(state)
                        self._status = {**self._status, "training": "bootstrap_budget_cooldown",
                                        "next_training_at": state["next_training_at"]}
                        return self.status()
                    state["bootstrap_runs"] = state.get("bootstrap_runs", 0) + 1
                state.update(next_training_at=now + (self.bootstrap_cooldown if bootstrap else self.interval),
                             attempted_content_sha256=identity,
                             last_result="running", last_run_id=None)
                self._save_state(state)  # Persist cooldown before starting a worker.
                if self._stop.is_set():
                    return self.status()
                self._status = {**self._status, "training": "running"}
                options = {"context_tokens": self.context_tokens, "peak_content": self.peak_content}
                if self.peak_content:
                    options.update(model_config=self.model_config, worker_timeout=self.worker_timeout)
                result = (self.trainer or execute)(
                    _PinnedObservations(observations), self.bootstrap_steps if bootstrap else self.steps, **options)
                state.update(last_run_id=result.get("run_id"), last_result=result["status"])
                if result["status"] == "candidate_trained_unreviewed":
                    state["trained_content_sha256"] = identity
                self._save_state(state)
                self._status = {**self._status, "training": result["status"],
                                "last_run_id": result.get("run_id"), "next_training_at": state["next_training_at"]}
                self._refresh_release()
                return self.status()
        except Exception as exc:
            self._status = {**self._status, "training": getattr(exc, "code", "blocked_execution"),
                            "training_error": type(exc).__name__}
            return self.status()
        finally:
            self._guard.release()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        def run():
            while not self._stop.is_set():
                self.tick()
                self._stop.wait(self.poll)
        self._thread = threading.Thread(target=run, name="live-awareness-learning", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
