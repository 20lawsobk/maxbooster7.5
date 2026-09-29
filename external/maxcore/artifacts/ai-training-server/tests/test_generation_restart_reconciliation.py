"""Exercise registered startup handlers with isolated on-disk production journals."""
import ast
import asyncio
from contextvars import ContextVar
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class RestartTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        names = {"_job_path", "_job_write", "_job_read", "_job_update",
                 "_persist_generation_job", "_journal_records", "_journal_job_id", "_job_gc",
                 "recover_dedicated_delivery", "generation_readiness"}
        tree = ast.parse((ROOT / "server.py").read_text())
        nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and n.name in names]
        self.app = FastAPI()
        self.scope = {
            "app": self.app, "Path": Path, "os": os, "json": json, "time": time,
            "asyncio": asyncio, "hashlib": hashlib, "_JOBS_DIR": str(self.root),
            "_request_job_owner": ContextVar("test_owner", default=None),
            "_api_jobs_lock": threading.Lock(), "_active_jobs_lock": threading.Lock(),
            "_active_jobs": {}, "_JOB_TTL_S": 600, "_render_manager": None,
            "_model_ready": False, "_create_durable_render_manager": Mock(return_value=object()),
        }
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(ROOT / "server.py"), "exec"),
             self.scope)

    def save(self, job_id, **fields):
        record = {"job_id": job_id, "owner_id": "owner", "owner_ids": ["owner"], **fields}
        self.scope["_job_write"](job_id, record)
        return record

    def read(self, job_id):
        return self.scope["_job_read"](job_id)

    def startup(self):
        async def lifespan():
            async with self.app.router.lifespan_context(self.app):
                pass
        asyncio.run(lifespan())

    def test_registered_startup_reconciles_legacy_without_touching_delivery_or_owners(self):
        for status in ("pending", "queued", "running", "rendering", "done", "cancelled", "committing"):
            self.save(status, status=status, generation_plan={"pinned": True})
        self.save("manager", status="running", render_manager=True)
        self.scope["_job_write"]("legacy-no-id", {"status": "pending", "owner_ids": ["owner"]})
        self.startup()
        self.assertEqual(self.read("legacy-no-id")["status"], "error")
        self.scope["_create_durable_render_manager"].assert_called_once()
        for status in ("pending", "queued", "running", "rendering"):
            record = self.read(status)
            self.assertEqual(record["status"], "error")
            self.assertEqual(record["failure_stage"], "restart")
            self.assertEqual(record["owner_ids"], ["owner"])
            self.assertEqual(record["generation_plan"], {"pinned": True})
        for status in ("done", "cancelled", "committing"):
            self.assertEqual(self.read(status)["status"], status)
        self.assertEqual(self.read("manager")["status"], "running")
        self.startup()  # Terminal records remain terminal on repeated reconciliation.
        self.assertEqual(self.read("running")["status"], "error")

    def test_delivery_outage_keeps_journal_bytes_and_allows_later_delivery_only_retry(self):
        artifact = self.root / "dedicated_retry.wav"
        artifact.write_bytes(b"original encoded bytes")
        self.save("retry", status="committing", dedicated=True, scratch_path=str(artifact),
                  scratch_owned=True, scratch_root=str(self.root))
        with patch("ai_model.generation.dedicated.deliver", side_effect=OSError("offline")) as deliver:
            self.startup()
            deliver.assert_called_once()
        self.assertEqual(self.read("retry")["status"], "committing")
        self.assertEqual(self.read("retry")["delivery_error"], "offline")
        self.assertEqual(artifact.read_bytes(), b"original encoded bytes")
        with patch("ai_model.generation.dedicated.deliver") as deliver:
            self.startup()
            self.assertEqual(deliver.call_args.args[0]["job_id"], "retry")

    def test_dedicated_interrupt_and_completed_cleanup_are_ownership_scoped(self):
        for name, owned, status in (("dedicated_partial.wav", True, "running"),
                                    ("dedicated_done.wav", True, "done"),
                                    ("shared.wav", False, "done"),
                                    ("dedicated_unowned.wav", False, "done")):
            artifact = self.root / name
            artifact.write_bytes(b"keep unless exclusively owned")
            self.save(name, status=status, dedicated=True, scratch_owned=owned,
                      scratch_path=str(artifact), scratch_root=str(self.root),
                      result={"durable": True})
        target = self.root / "shared.wav"
        link = self.root / "dedicated_link.wav"
        link.symlink_to(target)
        self.save("link", status="done", dedicated=True, scratch_owned=True,
                  scratch_path=str(link), scratch_root=str(self.root), result={"durable": True})
        self.startup()
        self.assertEqual(self.read("dedicated_partial.wav")["status"], "failed")
        self.assertFalse((self.root / "dedicated_partial.wav").exists())
        self.assertFalse((self.root / "dedicated_done.wav").exists())
        self.assertTrue(target.exists())
        self.assertTrue(link.is_symlink())
        self.assertTrue((self.root / "dedicated_unowned.wav").exists())

    def test_gc_retains_retryable_manager_delivery_but_expires_terminal_jobs(self):
        self.save("retry", status="error", render_manager=True, scratch_path="original.wav")
        self.save("committing", status="committing", dedicated=True)
        self.save("failed", status="error")
        for path in self.root.glob("*.json"):
            os.utime(path, (time.time() - 1200,) * 2)
        self.assertEqual(self.scope["_job_gc"](), 1)
        self.assertIsNotNone(self.read("retry"))
        self.assertIsNotNone(self.read("committing"))
        self.assertIsNone(self.read("failed"))

    def test_readiness_requires_both_model_and_fresh_awareness(self):
        for model, awareness, expected in ((False, False, 503), (False, True, 503),
                                           (True, False, 503), (True, True, 200)):
            self.scope["_model_ready"] = model
            engine = Mock()
            engine.status.return_value = {"ready": awareness}
            with patch("ai_model.awareness.get_engine", return_value=engine):
                response = asyncio.run(self.scope["generation_readiness"]())
            self.assertEqual(response.status_code, expected)
            self.assertEqual(json.loads(response.body)["ready"], expected == 200)

    def test_invalid_journal_names_rejected_before_reconciliation_or_delivery(self):
        self.save("valid", status="running")
        for filename in (".json", "..json", "...json"):
            with self.subTest(filename=filename):
                invalid = self.root / filename
                payload = json.dumps({"status": "committing", "dedicated": True,
                                      "job_id": "valid", "owner_id": "owner"})
                invalid.write_text(payload)
                with patch("ai_model.generation.dedicated.deliver") as delivery:
                    with self.assertRaisesRegex(ValueError, "Invalid generation journal filename"):
                        self.startup()
                    delivery.assert_not_called()
                self.assertEqual(self.read("valid")["status"], "running")
                self.assertEqual(invalid.read_text(), payload)
                invalid.unlink()

    def test_terminal_gc_retries_failed_owned_unlink_before_deleting_journal(self):
        artifacts = set()
        for status in ("done", "failed"):
            artifact = self.root / f"dedicated_{status}.wav"
            artifact.write_bytes(b"owned bytes")
            artifacts.add(artifact)
            self.save(status, status=status, dedicated=True, scratch_owned=True,
                      scratch_path=str(artifact), scratch_root=str(self.root),
                      result={"durable": True})
            os.utime(self.root / f"{status}.json", (time.time() - 1200,) * 2)
        real_unlink = Path.unlink
        attempts = []

        def unavailable(path, *args, **kwargs):
            if path in artifacts:
                attempts.append(path)
                raise PermissionError("fixture: owned scratch unlink temporarily unavailable")
            return real_unlink(path, *args, **kwargs)

        with patch.object(Path, "unlink", new=unavailable):
            self.assertEqual(self.scope["_job_gc"](), 0)
        self.assertEqual(set(attempts), artifacts)
        for status in ("done", "failed"):
            self.assertEqual(self.read(status)["status"], status)
        self.assertTrue(all(path.exists() for path in artifacts))
        self.assertEqual(self.scope["_job_gc"](), 2)
        self.assertFalse(any(path.exists() for path in artifacts))
        for status in ("done", "failed"):
            self.assertIsNone(self.read(status))

    def test_terminal_gc_never_deletes_unowned_or_symlink_scratch(self):
        shared = self.root / "renderer-cache.wav"
        shared.write_bytes(b"shared bytes")
        link = self.root / "dedicated_link.wav"
        link.symlink_to(shared)
        for job_id, artifact, owned in (("unowned", shared, False),
                                         ("unrelated", shared, True), ("link", link, True)):
            self.save(job_id, status="failed", dedicated=True, scratch_owned=owned,
                      scratch_path=str(artifact), scratch_root=str(self.root))
            os.utime(self.root / f"{job_id}.json", (time.time() - 1200,) * 2)
        self.assertEqual(self.scope["_job_gc"](), 2)
        self.assertEqual(shared.read_bytes(), b"shared bytes")
        self.assertTrue(link.is_symlink())
        self.assertIsNone(self.read("unowned"))
        self.assertIsNone(self.read("unrelated"))
        self.assertEqual(self.read("link")["status"], "failed")
        # Replacing the link with the safe, originally owned allocation makes
        # cleanup possible without ever following/deleting the unrelated target.
        link.unlink()
        link.write_bytes(b"owned replacement")
        self.assertEqual(self.scope["_job_gc"](), 1)
        self.assertFalse(link.exists())
        self.assertIsNone(self.read("link"))
        self.assertEqual(shared.read_bytes(), b"shared bytes")


if __name__ == "__main__":
    unittest.main()