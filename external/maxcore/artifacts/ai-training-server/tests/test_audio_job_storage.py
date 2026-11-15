import tempfile
import unittest
import uuid
from pathlib import Path
import sys
import ast
import asyncio
import json
import os
import threading
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_model.generation.audio_job_storage import (
    materialize_cached_audio_job,
    purge_audio_job_artifacts,
)


class AudioJobStorageTests(unittest.TestCase):
    def _load_cancel_endpoint(self, jobs_dir: Path, uploads_root: Path):
        server_path = Path(__file__).resolve().parents[1] / "server.py"
        tree = ast.parse(server_path.read_text(encoding="utf-8"))
        endpoint = next(
            node for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "api_cancel_audio_job"
        )
        endpoint.decorator_list = []
        jobs = jobs_dir

        def job_path(job_id):
            return str(jobs / f"{job_id}.json")

        def read_job(job_id):
            try:
                return json.loads(Path(job_path(job_id)).read_text(encoding="utf-8"))
            except FileNotFoundError:
                return None

        def update_job(job_id, updates):
            record = read_job(job_id)
            if record is None:
                return
            if record.get("status") in ("done", "error", "failed", "cancelled") and \
                    updates.get("status", record["status"]) != record["status"]:
                return
            record.update(updates)
            Path(job_path(job_id)).write_text(json.dumps(record), encoding="utf-8")

        class TestHTTPException(Exception):
            def __init__(self, status_code, detail):
                super().__init__(detail)
                self.status_code = status_code
                self.detail = detail

        active_workers = set()
        namespace = {
            "Request": SimpleNamespace,
            "Depends": lambda dependency: None,
            "require_scope": lambda scope: lambda: scope,
            "HTTPException": TestHTTPException,
            "_job_read": read_job,
            "_job_update": update_job,
            "_job_path": job_path,
            "_JOBS_DIR": str(jobs),
            "_UPLOADS_PATH": uploads_root,
            "_api_jobs_lock": threading.Lock(),
            "_active_audio_job_workers": active_workers,
            "_active_audio_job_workers_lock": threading.Lock(),
            "_require_job_owner": lambda job, request: (
                None if request.owner in job.get("owner_ids", [])
                else (_ for _ in ()).throw(TestHTTPException(403, "not owner"))
            ),
            "os": os,
        }
        module = ast.Module(body=[endpoint], type_ignores=[])
        exec(compile(module, str(server_path), "exec"), namespace)
        return namespace["api_cancel_audio_job"], active_workers, TestHTTPException

    def test_cancel_endpoint_purges_owned_terminal_job_and_rejects_other_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            jobs_dir = base / "jobs"
            uploads = base / "uploads"
            jobs_dir.mkdir()
            uploads.mkdir()
            job_id = str(uuid.uuid4())
            audio = uploads / f"audio_{job_id}.mp3"
            audio.write_bytes(b"rendered bytes")
            job_file = jobs_dir / f"{job_id}.json"
            job_file.write_text(json.dumps({
                "job_type": "audio",
                "status": "done",
                "owner_ids": ["owner-1"],
                "url": f"/uploads/{audio.name}",
                "stems": {},
            }))
            endpoint, _, http_error = self._load_cancel_endpoint(jobs_dir, uploads)

            with self.assertRaises(http_error) as denied:
                asyncio.run(endpoint(job_id, SimpleNamespace(owner="owner-2")))
            self.assertEqual(denied.exception.status_code, 403)
            self.assertTrue(audio.exists())
            self.assertTrue(job_file.exists())

            result = asyncio.run(endpoint(job_id, SimpleNamespace(owner="owner-1")))
            self.assertEqual(result["action"], "purged")
            self.assertFalse(audio.exists())
            self.assertFalse(job_file.exists())

    def test_cancel_endpoint_reports_cancellation_then_requires_worker_stop_before_purge(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            jobs_dir = base / "jobs"
            uploads = base / "uploads"
            jobs_dir.mkdir()
            uploads.mkdir()
            job_id = str(uuid.uuid4())
            audio = uploads / f"audio_{job_id}.wav"
            audio.write_bytes(b"rendered bytes")
            job_file = jobs_dir / f"{job_id}.json"
            job_file.write_text(json.dumps({
                "job_type": "audio",
                "status": "rendering",
                "owner_ids": ["owner-1"],
                "url": f"/uploads/{audio.name}",
                "stems": {},
            }))
            endpoint, active_workers, http_error = self._load_cancel_endpoint(jobs_dir, uploads)
            request = SimpleNamespace(owner="owner-1")

            cancelled = asyncio.run(endpoint(job_id, request))
            self.assertEqual(cancelled["action"], "cancelled")
            self.assertEqual(json.loads(job_file.read_text())["status"], "cancelled")

            active_workers.add(job_id)
            with self.assertRaises(http_error) as active:
                asyncio.run(endpoint(job_id, request))
            self.assertEqual(active.exception.status_code, 409)
            self.assertTrue(audio.exists())
            self.assertTrue(job_file.exists())

            active_workers.remove(job_id)
            purged = asyncio.run(endpoint(job_id, request))
            self.assertEqual(purged["action"], "purged")
            self.assertFalse(audio.exists())
            self.assertFalse(job_file.exists())

    def test_cache_hit_is_copied_to_independent_job_owned_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original_id = str(uuid.uuid4())
            new_id = str(uuid.uuid4())
            audio = root / f"audio_{original_id}.mp3"
            stem = root / f"audio_{original_id}_stem_drums.wav"
            audio.write_bytes(b"cached audio")
            stem.write_bytes(b"cached stem")

            copy = materialize_cached_audio_job(
                new_id,
                {
                    "url": f"/uploads/{audio.name}",
                    "stems": {"drums": f"/uploads/{stem.name}"},
                    "bpm": 120,
                },
                root,
            )

            self.assertEqual(copy["url"], f"/uploads/audio_{new_id}.mp3")
            self.assertEqual(copy["stems"], {
                "drums": f"/uploads/audio_{new_id}_stem_drums.wav",
            })
            self.assertEqual((root / f"audio_{new_id}.mp3").read_bytes(), b"cached audio")
            self.assertEqual((root / f"audio_{new_id}_stem_drums.wav").read_bytes(), b"cached stem")
            self.assertTrue(audio.exists(), "copying a cache hit must preserve the shared source")
            self.assertTrue(stem.exists(), "copying a cache hit must preserve shared stems")

    def test_purge_removes_only_job_files_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            job_id = str(uuid.uuid4())
            audio = root / f"audio_{job_id}.wav"
            stem = root / f"audio_{job_id}_stem_bass.wav"
            unrelated = root / "audio_other.wav"
            stem_copy_dir = root / "stems" / job_id
            stem_copy_dir.mkdir(parents=True)
            stem_copy = stem_copy_dir / "bass.wav"
            for path in (audio, stem, unrelated, stem_copy):
                path.write_bytes(b"fixture")

            job = {
                "url": f"/uploads/{audio.name}",
                "stems": {
                    "bass": f"/uploads/{stem.name}",
                },
            }
            self.assertEqual(purge_audio_job_artifacts(job_id, job, root), 3)
            self.assertFalse(audio.exists())
            self.assertFalse(stem.exists())
            self.assertFalse(stem_copy_dir.exists())
            self.assertTrue(unrelated.exists())
            self.assertEqual(purge_audio_job_artifacts(job_id, job, root), 0)

    def test_purge_rejects_foreign_urls_and_traversal_without_deleting_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            job_id = str(uuid.uuid4())
            foreign_id = str(uuid.uuid4())
            foreign = root / f"audio_{foreign_id}.mp3"
            foreign.write_bytes(b"preserve")
            with self.assertRaisesRegex(ValueError, "shared with another job"):
                purge_audio_job_artifacts(
                    job_id, {"url": f"/uploads/{foreign.name}"}, root,
                )
            with self.assertRaisesRegex(ValueError, "unsupported artifact path"):
                purge_audio_job_artifacts(
                    job_id, {"url": "/uploads/../private.wav"}, root,
                )
            self.assertEqual(foreign.read_bytes(), b"preserve")

    def test_materialization_failure_cleans_its_partial_copies(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source_id = str(uuid.uuid4())
            target_id = str(uuid.uuid4())
            audio = root / f"audio_{source_id}.mp3"
            audio.write_bytes(b"cached")
            with self.assertRaisesRegex(ValueError, "local upload path"):
                materialize_cached_audio_job(
                    target_id,
                    {
                        "url": f"/uploads/{audio.name}",
                        "stems": {"drums": "https://example.invalid/drums.wav"},
                    },
                    root,
                )
            self.assertFalse((root / f"audio_{target_id}.mp3").exists())
            self.assertTrue(audio.exists())

    @unittest.skipIf(os.name == "nt", "O_NOFOLLOW is POSIX-only")
    def test_materialization_rejects_symlinked_cache_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source_id = str(uuid.uuid4())
            target_id = str(uuid.uuid4())
            outside = root.parent / f"outside-audio-{source_id}.mp3"
            outside.write_bytes(b"must not be copied")
            source = root / f"audio_{source_id}.mp3"
            source.symlink_to(outside)
            try:
                with self.assertRaisesRegex(ValueError, "safely copied"):
                    materialize_cached_audio_job(
                        target_id,
                        {"url": f"/uploads/{source.name}", "stems": {}},
                        root,
                    )
                self.assertFalse((root / f"audio_{target_id}.mp3").exists())
                self.assertEqual(outside.read_bytes(), b"must not be copied")
            finally:
                outside.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
