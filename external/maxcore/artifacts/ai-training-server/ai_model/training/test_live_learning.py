"""Contract tests cover complete live-snapshot admission and candidate isolation."""
import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from ai_model.awareness.engine import Engine
from ai_model.awareness.test_engine import MemoryStore, sources
from ai_model.training import live_learning as live


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

    def tearDown(self):
        self.assertEqual(self.snapshot._json, self.original)
        self.jobs_patch.stop()
        self.candidate_patch.stop()
        self.admission_patch.stop()
        self.env.stop()
        self.temp.cleanup()

    def inputs(self):
        pass

    def client(self):
        def admin(x_admin_key: str = Header(None)):
            if x_admin_key != "test-admin":
                raise HTTPException(403, "admin required")
        app = FastAPI()
        app.include_router(live.create_router(admin, lambda: self.engine))
        return TestClient(app)

    def test_actual_router_auth_and_validation(self):
        with self.client() as client:
            self.assertEqual(client.post("/api/training/candidates/live", json={}).status_code, 403)
            headers = {"x-admin-key": "test-admin"}
            for body in ({"steps": True}, {"steps": 65}, {"records": []}, {"steps": "1"}):
                self.assertEqual(client.post("/api/training/candidates/live", json=body, headers=headers).status_code, 422)
            with patch.object(live.subprocess, "run",
                              return_value=subprocess.CompletedProcess([], 1)):
                response = client.post("/api/training/candidates/live", json={"steps": 1}, headers=headers)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["status"], "failed_training")

    def test_live_observations_need_no_rights_file_and_do_not_claim_license(self):
        records, excluded = live.eligible_records(self.snapshot)
        self.assertGreater(len(records), 0)
        self.assertEqual(excluded, 0)
        self.assertTrue(all(r["license"] == "NOASSERTION" for r in records))
        self.assertTrue(all(r["private"] == "unknown" for r in records))
        self.assertTrue(all(r["provenance_type"] == "maxcore_live_awareness" for r in records))

    def test_live_snapshot_trains_every_unique_selected_observation(self):
        records, excluded = live.eligible_records(self.snapshot)
        manifest = live.build_manifest(
            records, [], smoke_only=False, allow_live_without_holdout=True,
        )
        snapshot_ids = {
            row["id"]
            for rows in self.snapshot.to_dict()["domains"].values()
            for row in rows
        }
        trained_ids = {row["live_provenance"]["record_id"] for row in manifest["records"]}
        self.assertEqual(excluded, 0)
        self.assertEqual(trained_ids, snapshot_ids)
        self.assertEqual(manifest["holdout_sha256"], [])
        self.assertEqual(manifest["rejected"], [])

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
            result = live.execute(self.engine, 1)
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
                    result = live.execute(self.engine, 1)
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
                live.execute(self.engine, 1)
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
                live.execute(self.engine, 1)
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
                live.execute(self.engine)
        self.assertEqual(error.exception.code, "blocked_busy")

    def test_timeout_and_failure_are_not_success(self):
        self.inputs()
        for outcome, expected in ((subprocess.TimeoutExpired("worker", 120), "blocked_timeout"),
                                  (subprocess.CompletedProcess([], 1), "failed_training")):
            with patch.object(live.subprocess, "run", side_effect=outcome if isinstance(outcome, Exception) else None,
                              return_value=outcome):
                result = live.execute(self.engine, 1)
            self.assertEqual(result["status"], expected)
            self.assertFalse(result["promotion_performed"])
            folder = live.JOBS / result["run_id"]
            self.assertEqual(json.loads((folder / "snapshot.json").read_text())["id"], self.snapshot.id)
            corpus = json.loads((folder / "corpus.json").read_text())
            observed = {
                row["text"]
                for rows in self.snapshot.to_dict()["domains"].values()
                for row in rows
            }
            self.assertEqual({row["text"] for row in corpus["records"]}, observed)

    def test_real_worker_contract_and_digital_training(self):
        # Real isolated trainer, one step, temporary artifact root via subprocess
        # harness. No inference call or native backend substitution.
        self.inputs()
        actual_run = subprocess.run
        harness = (
            "from pathlib import Path; import sys; "
            "from ai_model.training import candidate_lifecycle as c; "
            "c.CANDIDATES=Path(sys.argv.pop(1)); "
            "from ai_model.training.candidate_manifest_train import main; main()"
        )
        candidates = self.root / "candidates"
        def isolated(command, **kwargs):
            return actual_run([command[0], "-c", harness, str(candidates), *command[5:]], **kwargs)
        # Service report lookup uses ROOT; only artifact lookup is redirected.
        original_root = live.ROOT
        def redirected(command, **kwargs):
            kwargs["cwd"] = original_root
            return isolated(command, **kwargs)
        with patch.object(live, "ROOT", self.root), patch.object(live.subprocess, "run", side_effect=redirected):
            # Match the service's fixed candidate artifact layout in the temp root.
            candidates = self.root / "ai_model/training/candidate_runs"
            result = live.execute(self.engine, 1)
        self.assertEqual(result["status"], "candidate_trained_unreviewed")
        report = json.loads((candidates / result["run_id"] / "report.json").read_text())
        self.assertTrue(report["backend_exclusive"])
        self.assertGreater(report["gemm_backward_calls"], 0)
        self.assertFalse(report["promotion"]["eligible"])
        from ai_model.training.candidate_registry import verify_bundle
        self.assertTrue(verify_bundle(candidates / result["run_id"])[0]["runtime_eligible"])
        # Crash window between success-result publication and final certification.
        (live.admission_path(result["run_id"]) / "certified.json").unlink()
        with self.assertRaisesRegex(ValueError, "pending or uncertified"):
            verify_bundle(candidates / result["run_id"])
        self.assertEqual(live.list_runs()[0]["status"], "failed_interrupted")
        self.assertTrue((candidates / result["run_id"] / "FAILED").exists())

    def test_worker_has_independent_timeout_and_inherits_global_lock(self):
        with patch.object(live.subprocess, "run", side_effect=subprocess.TimeoutExpired("trainer", 110)) as run:
            self.assertEqual(live.worker_main(["--worker", "9", "--steps", "1"]), 124)
        self.assertEqual(run.call_args.kwargs["timeout"], 110)
        self.assertEqual(run.call_args.kwargs["pass_fds"], (9,))
        self.assertEqual(run.call_args.args[0][2], "ai_model.training.candidate_manifest_train")


if __name__ == "__main__":
    unittest.main()