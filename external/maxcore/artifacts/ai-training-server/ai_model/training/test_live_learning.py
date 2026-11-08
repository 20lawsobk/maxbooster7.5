"""Contract tests cover rolling live-source admission and candidate isolation."""
import ast
import asyncio
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from urllib.parse import urlsplit
from unittest.mock import patch

from fastapi import FastAPI, Header, HTTPException

from ai_model.awareness.engine import Engine
from ai_model.awareness.test_engine import MemoryStore, sources
from ai_model.training import live_learning as live


class _Response:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body

    def json(self):
        return json.loads(self.body.decode("utf-8"))


class TestClient:
    """Tiny standard-library ASGI client for isolated tests; no httpx extra."""

    def __init__(self, app):
        self.app = app

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def request(self, method, url, *, json_body=None, headers=None):
        parsed = urlsplit(url)
        body = b"" if json_body is None else json.dumps(json_body).encode("utf-8")
        header_pairs = [(key.lower().encode("latin-1"), value.encode("latin-1"))
                        for key, value in (headers or {}).items()]
        if json_body is not None:
            header_pairs.append((b"content-type", b"application/json"))
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": method.upper(),
            "scheme": "http",
            "path": parsed.path,
            "raw_path": parsed.path.encode("utf-8"),
            "query_string": parsed.query.encode("ascii"),
            "root_path": "",
            "headers": header_pairs,
            "client": ("127.0.0.1", 12345),
            "server": ("127.0.0.1", 80),
        }
        messages = []
        received = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            messages.append(message)

        asyncio.run(self.app(scope, receive, send))
        start = next(message for message in messages if message["type"] == "http.response.start")
        payload = b"".join(message.get("body", b"") for message in messages
                           if message["type"] == "http.response.body")
        return _Response(start["status"], payload)

    def get(self, url, *, headers=None):
        return self.request("GET", url, headers=headers)

    def post(self, url, *, json=None, headers=None):
        return self.request("POST", url, json_body=json, headers=headers)


class LiveLearningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.engine = Engine(sources=sources(), store=MemoryStore(), timeout=1)
        self.snapshot = self.engine.refresh()
        self.original = self.snapshot._json
        self.jobs_patch = patch.object(live, "JOBS", self.root / "jobs")
        self.jobs_patch.start()
        self.candidate_patch = patch.object(live, "candidate_path",
                                           lambda run_id: self.root / "ai_model/training/candidate_runs" / run_id)
        self.admission_patch = patch.object(live, "admission_path",
                                           lambda run_id: self.root / "ai_model/training/live_candidate_admissions" / run_id)
        self.candidate_patch.start()
        self.admission_patch.start()
        self.env = patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.execution_policy_patches = []

    def tearDown(self):
        self.assertEqual(self.snapshot._json, self.original)
        for policy_patch in reversed(self.execution_policy_patches):
            policy_patch.stop()
        self.jobs_patch.stop()
        self.candidate_patch.stop()
        self.admission_patch.stop()
        self.env.stop()
        self.temp.cleanup()

    def inputs(self):
        # These cases exercise worker/recovery internals after the separately
        # tested rights gate. They use only local test fixtures and replace
        # corpus admission so they cannot imply a production-eligible corpus.
        for policy_patch in (
            patch.object(live, "require_live_training_eligibility", return_value=None),
            patch.object(
                live, "build_manifest",
                side_effect=lambda records, *_args, **_kwargs: {
                    "records": records, "rejected": [],
                },
            ),
        ):
            self.execution_policy_patches.append(policy_patch)
            policy_patch.start()

    def client(self):
        def admin(x_admin_key: str = Header(None)):
            if x_admin_key != "test-admin":
                raise HTTPException(403, "admin required")
        app = FastAPI()
        app.include_router(live.create_router(admin, lambda: self.engine, peak_content=False))
        return TestClient(app)

    def test_actual_router_auth_and_validation(self):
        # Training reads the shared source-observation ledger, not the currently
        # published snapshot envelope.
        self.engine._snapshot = None
        with self.client() as client:
            self.assertEqual(client.post("/api/training/candidates/live", json={}).status_code, 403)
            headers = {"x-admin-key": "test-admin"}
            for body in ({"steps": True}, {"steps": 65}, {"records": []}, {"steps": "1"}):
                self.assertEqual(client.post("/api/training/candidates/live", json=body, headers=headers).status_code, 422)
            response = client.post("/api/training/candidates/live", json={"steps": 1}, headers=headers)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["status"], "blocked_training_rights")

    def test_public_observations_are_awareness_only_without_exact_rights(self):
        records, excluded = live.eligible_records(self.engine.training_observations())
        self.assertGreater(len(records), 0)
        self.assertEqual(excluded, 0)
        self.assertTrue(all(r["license"] == "NOASSERTION" for r in records))
        self.assertTrue(all(r["private"] is False and r["live_provenance"]["access"] == "public" for r in records))
        self.assertTrue(all(
            r["provenance_type"] == "maxcore_live_awareness_observation"
            for r in records
        ))
        for allow_public_live in (False, True):
            with self.subTest(allow_public_live=allow_public_live):
                with self.assertRaises(live.Blocked) as error:
                    live.require_peak_training_rights(
                        records, allow_public_live=allow_public_live,
                    )
                self.assertEqual(error.exception.code, "blocked_training_rights")
        self.assertTrue(all("learning_admission" not in row for row in records))
        self.assertTrue(all("training_rights" not in row for row in records))

    def test_live_observation_set_never_reaches_trainer_without_rights(self):
        with self.assertRaises(live.Blocked) as error:
            live.execute(self.engine, 1, peak_content=False)
        self.assertEqual(error.exception.code, "blocked_training_rights")
        self.assertFalse(any(path.name.startswith("live-") for path in live.JOBS.iterdir()))

    def test_candidate_registry_rechecks_operator_rights_manifest(self):
        from ai_model.training.candidate_registry import _verify_live_training_rights

        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "Pinned operator rights manifest required"):
                _verify_live_training_rights([{"live_provenance": {}}])

    def test_empty_observation_cache_blocks_without_starting_training(self):
        empty_engine = Engine(sources=sources(), store=MemoryStore(), timeout=1)
        with self.assertRaises(live.Blocked) as error:
            live.execute(empty_engine, 1, peak_content=False)
        self.assertEqual(error.exception.code, "blocked_observations")

    def test_server_wires_real_admin_and_keeps_write_guard(self):
        server = ast.parse((live.ROOT / "server.py").read_text())
        calls = [node for node in ast.walk(server) if isinstance(node, ast.Call)]
        router = next(node for node in calls if isinstance(node.func, ast.Name)
                      and node.func.id == "_live_learning_router")
        self.assertEqual([arg.id for arg in router.args], ["verify_admin", "_live_learning_engine"])
        guard = next(node for node in server.body if isinstance(node, ast.FunctionDef)
                     and node.name == "_reject_serving_write")
        self.assertTrue(any(isinstance(node, ast.Raise) for node in ast.walk(guard)))
        self.assertGreater(sum(isinstance(node.func, ast.Name) and node.func.id == "_reject_serving_write"
                               for node in calls), 3)

    def test_status_endpoint_is_authorized_and_does_not_expose_text(self):
        self.inputs()
        with patch.object(live.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)):
            result = live.execute(self.engine, 1, peak_content=False)
        with self.client() as client:
            url = "/api/training/candidates/live/" + result["run_id"]
            self.assertEqual(client.get(url).status_code, 403)
            response = client.get(url, headers={"x-admin-key": "test-admin"})
            self.assertEqual(response.json(), result)
            self.assertNotIn("records", response.json())

    def fake_worker(self, command, report_change=None, interrupt=False, **kwargs):
        run_id = command[command.index("--run-id") + 1]
        candidate = live.candidate_path(run_id)
        # This assertion exercises the no-directory-race admission contract.
        self.assertFalse(candidate.exists())
        self.assertTrue((live.admission_path(run_id) / "admission.json").is_file())
        candidate.mkdir(parents=True)
        corpus_path = Path(command[command.index("--corpus") + 1])
        (candidate / "input.manifest.json").write_bytes(corpus_path.read_bytes())
        (candidate / "candidate.pt").write_bytes(b"test-only-not-a-model")
        report = {"schema": 1, "protected_unchanged": True, "smoke_only": False,
                  "backend_exclusive": True, "training_backend_scope": "manual-digital-v1",
                  "input_sha256": command[command.index("--corpus-sha256") + 1],
                  "holdout_sha256": None,
                  "gemm_forward_calls": 1, "gemm_backward_calls": 1,
                  "changed_parameters": ["test"], "training_loss": [1.0],
                  "candidate_dispatch_counts": {"transformer_backward": 1},
                  "checkpoint_sha256": live.file_hash(candidate / "candidate.pt")}
        report = report_change(report, candidate) if report_change else report
        (candidate / "report.json").write_text(json.dumps(report))
        (candidate / "corpus.manifest.json").write_text('{"records": []}')
        if interrupt:
            raise KeyboardInterrupt("simulate parent termination after worker exit")
        return subprocess.CompletedProcess(command, 0)

    def test_invalid_reports_always_fail_closed_and_record_terminal_result(self):
        self.inputs()
        def missing_checkpoint(report, candidate):
            (candidate / "candidate.pt").unlink()
            return report
        changes = [
            lambda r, p: [],
            lambda r, p: {**r, "gemm_backward_calls": "1"},
            lambda r, p: {**r, "gemm_forward_calls": True},
            lambda r, p: {**r, "holdout_sha256": "0" * 64},
            lambda r, p: {k: v for k, v in r.items() if k != "checkpoint_sha256"},
            lambda r, p: {**r, "checkpoint_sha256": "0" * 64},
            lambda r, p: {**r, "changed_parameters": "weight"},
            missing_checkpoint,
        ]
        for change in changes:
            with self.subTest(change=change):
                with patch.object(live.subprocess, "run",
                                  side_effect=lambda cmd, **kw: self.fake_worker(cmd, change, **kw)):
                    result = live.execute(self.engine, 1, peak_content=False)
                self.assertEqual(result["status"], "failed_execution_evidence")
                self.assertTrue((live.candidate_path(result["run_id"]) / "FAILED").exists())
                self.assertEqual(json.loads((live.JOBS / result["run_id"] / "result.json").read_text()), result)
                self.assertFalse((live.admission_path(result["run_id"]) / "certified.json").exists())

    def test_interrupted_worker_never_passes_registry_and_list_reconciles(self):
        from ai_model.training.candidate_registry import verify_bundle
        self.inputs()
        with patch.object(live.subprocess, "run",
                          side_effect=lambda cmd, **kw: self.fake_worker(cmd, interrupt=True, **kw)):
            with self.assertRaises(KeyboardInterrupt):
                live.execute(self.engine, 1, peak_content=False)
        folder = next(p for p in live.JOBS.iterdir() if p.is_dir())
        candidate = live.candidate_path(folder.name)
        with self.assertRaisesRegex(ValueError, "pending or uncertified"):
            verify_bundle(candidate)
        with self.client() as client:
            self.assertEqual(client.get("/api/training/candidates/live").status_code, 403)
            response = client.get("/api/training/candidates/live", headers={"x-admin-key": "test-admin"})
        self.assertEqual(response.json()["runs"][0]["status"], "failed_interrupted")
        self.assertTrue((candidate / "FAILED").exists())
        self.assertEqual(live.list_runs()[0]["status"], "failed_interrupted")

    def test_inherited_worker_lock_defers_reconciliation_until_worker_exit(self):
        self.inputs()
        with patch.object(live.subprocess, "run",
                          side_effect=lambda cmd, **kw: self.fake_worker(cmd, interrupt=True, **kw)):
            with self.assertRaises(KeyboardInterrupt):
                live.execute(self.engine, 1, peak_content=False)
        with (live.JOBS / ".lock").open("a") as lock:
            live.fcntl.flock(lock, live.fcntl.LOCK_EX)
            worker = subprocess.Popen([live.sys.executable, "-c",
                                       "import sys; sys.stdin.read()"],
                                      stdin=subprocess.PIPE, pass_fds=(lock.fileno(),))
        try:
            self.assertEqual(live.list_runs()[0]["status"], "running")
        finally:
            worker.communicate(timeout=10)
        self.assertEqual(live.list_runs()[0]["status"], "failed_interrupted")

    def test_concurrent_admission_blocked(self):
        live.JOBS.mkdir()
        with (live.JOBS / ".lock").open("a") as lock:
            live.fcntl.flock(lock, live.fcntl.LOCK_EX | live.fcntl.LOCK_NB)
            with self.assertRaises(live.Blocked) as error:
                live.execute(self.engine, peak_content=False)
        self.assertEqual(error.exception.code, "blocked_busy")

    def test_timeout_and_failure_are_not_success(self):
        self.inputs()
        for outcome, expected in ((subprocess.TimeoutExpired("worker", 120), "blocked_timeout"),
                                  (subprocess.CompletedProcess([], 1), "failed_training")):
            with patch.object(live.subprocess, "run", side_effect=outcome if isinstance(outcome, Exception) else None,
                              return_value=outcome):
                result = live.execute(self.engine, 1, peak_content=False)
            self.assertEqual(result["status"], expected)
            self.assertFalse(result["promotion_performed"])
            folder = live.JOBS / result["run_id"]
            observation_set = self.engine.training_observations()
            audit = json.loads((folder / "observation_set.json").read_text())
            self.assertEqual(audit["id"], observation_set["id"])
            corpus = json.loads((folder / "corpus.json").read_text())
            observed = {row["text"] for row in observation_set["records"]}
            self.assertEqual({row["text"] for row in corpus["records"]}, observed)

    def test_real_smoke_training_measures_updates_but_is_not_live_eligible(self):
        from ai_model.training.candidate_corpus import build_manifest, smoke_records
        from ai_model.training import candidate_lifecycle
        from ai_model.training.candidate_registry import verify_bundle

        candidates = self.root / "candidates"
        with patch.object(candidate_lifecycle, "CANDIDATES", candidates):
            result = candidate_lifecycle.train_validated(
                "smoke-rights-boundary-test", 1, 1729, "transformer",
                build_manifest(smoke_records(), [], smoke_only=True),
                manual_backward=True, context_tokens=128,
            )
        run = candidates / "smoke-rights-boundary-test"
        report = json.loads((run / "report.json").read_text())
        self.assertGreater(report["gemm_backward_calls"], 0)
        self.assertTrue(report["changed_parameters"])
        self.assertFalse(result["promotion"]["eligible"])
        verified, _, manifest = verify_bundle(run)
        self.assertTrue(verified["runtime_eligible"])
        self.assertTrue(manifest["smoke_only"])
        self.assertFalse(verified["quality_eligible"])

    def test_worker_has_independent_timeout_and_inherits_global_lock(self):
        with patch.object(live.subprocess, "run", side_effect=subprocess.TimeoutExpired("trainer", 110)) as run:
            self.assertEqual(live.worker_main(["--worker", "9", "--steps", "1"]), 124)
        self.assertEqual(run.call_args.kwargs["timeout"], 110)
        self.assertEqual(run.call_args.kwargs["pass_fds"], (9,))
        self.assertEqual(run.call_args.args[0][2], "ai_model.training.candidate_manifest_train")


if __name__ == "__main__":
    unittest.main()
