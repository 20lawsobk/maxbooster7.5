"""Real WAV bytes and production commit validation; only private transport is doubled."""
import ast
import asyncio
import json
import os
from contextvars import ContextVar
from pathlib import Path
import sys
import tempfile
import unittest
import wave
from functools import partial
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_model.generation.dedicated import deliver, render, interrupt_render, cleanup_owned_scratch
from ai_model.generation.owner import verify_owner
from ai_model.media_contract import commit_artifact, RenderCancelled


class DeliveryTests(unittest.TestCase):
    def test_actual_invalid_compact_image_control_is_terminal_failed(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "invalid.json"
            def persist(job, record):
                journal.write_text(json.dumps(record))
            with self.assertRaises(ValueError):
                render("image", {"width": 16, "height": 16}, directory,
                       owner_id="owner", job_id="invalid", persist_job=persist,
                       read_job=lambda job: json.loads(journal.read_text()))
            record = json.loads(journal.read_text())
            self.assertEqual(record["status"], "failed")
            self.assertEqual(record["failure_stage"], "rendering")
            self.assertTrue(record["error"])
            self.assertFalse(Path(record["scratch_path"]).exists())

    def test_renderer_failure_cleans_only_its_owned_partial_scratch(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "broken.json"
            unrelated = Path(directory) / "another-job.wav"
            unrelated.write_bytes(b"keep unrelated file")
            transitions = []
            def persist(job, record):
                transitions.append(record["status"])
                journal.write_text(json.dumps(record))
            def broken(path, *, job_id):
                path.write_bytes(b"partial encoded bytes")
                raise ValueError("Decoded artifact validation failed")
            with patch("ai_model.audio.controls.render_audio", new=broken):
                with self.assertRaisesRegex(ValueError, "Decoded artifact"):
                    render("audio", {}, directory, owner_id="owner", job_id="broken",
                           persist_job=persist, read_job=lambda job: json.loads(journal.read_text()))
            record = json.loads(journal.read_text())
            self.assertEqual(transitions[-1], "failed")
            self.assertNotIn("committing", transitions)
            self.assertFalse(Path(record["scratch_path"]).exists())
            self.assertTrue(unrelated.exists())

    def test_delivery_failure_stays_committing_and_preserves_rendered_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "pending.json"
            def persist(job, record):
                journal.write_text(json.dumps(record))
            def rendered(path, *, job_id):
                with wave.open(str(path), "wb") as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(8000)
                    wav.writeframes(b"\x01\x00" * 800)
            def unavailable(payload):
                raise OSError("offline transport")
            with patch("ai_model.audio.controls.render_audio", new=rendered):
                with self.assertRaises(OSError):
                    render("audio", {}, directory, owner_id="owner", job_id="pending",
                           persist_job=persist, read_job=lambda job: json.loads(journal.read_text()),
                           committer=partial(commit_artifact, transport=unavailable, attempts=1))
            record = json.loads(journal.read_text())
            self.assertEqual(record["status"], "committing")
            self.assertTrue(Path(record["scratch_path"]).exists())

    def test_restart_marks_running_failed_without_rerender_or_unsafe_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dedicated_interrupted.wav"
            path.write_bytes(b"partial render")
            record = {"job_id": "interrupted", "status": "running", "scratch_owned": True,
                      "scratch_path": str(path), "scratch_root": directory}
            saved = []
            def persist(job, failed):
                self.assertTrue(path.exists(), "Persist failure before removing partial bytes")
                saved.append(failed)
            failed = interrupt_render(record, persist_job=persist)
            self.assertEqual(failed["status"], "failed")
            self.assertIn("interrupted", failed["error"])
            self.assertFalse(path.exists())
            outside = Path(directory) / "shared-renderer-cache.png"
            outside.write_bytes(b"preserve")
            cleanup_owned_scratch({**record, "scratch_path": str(outside)})
            self.assertTrue(outside.exists())

    def test_http_private_node_header_contract_against_actual_middleware(self):
        from fastapi import FastAPI, Request
        import httpx
        app = FastAPI()
        owner_context = ContextVar("test_http_owner", default=None)
        source = Path(__file__).resolve().parents[1] / "server.py"
        tree = ast.parse(source.read_text())
        middleware = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef)
                          and n.name == "bind_job_owner_middleware")
        scope = {"app": app, "Request": Request, "os": os,
                 "_request_job_owner": owner_context}
        exec(compile(ast.Module(body=[middleware], type_ignores=[]), str(source), "exec"), scope)

        @app.post("/api/generate/audio")
        async def owned(request: Request):
            body = await request.json()
            return {"owner_id": owner_context.get(), "submitted_owner": body.get("owner_id")}

        async def send(headers, peer="127.0.0.1"):
            transport = httpx.ASGITransport(app=app, client=(peer, 45221))
            async with httpx.AsyncClient(transport=transport, base_url="http://maxcore.test") as client:
                return await client.post("/api/generate/audio", headers=headers,
                                         json={"owner_id": "body-spoof", "user_id": "body-spoof"})

        with patch.dict(os.environ, {"PDIM_LOCAL_CHANNEL_TOKEN": "unit-channel"}, clear=False):
            node_headers = {"Authorization": "Bearer unit-channel", "X-MaxCore-User-Id": "real_owner-1"}
            accepted = asyncio.run(send(node_headers))
            self.assertEqual(accepted.status_code, 200)
            self.assertEqual(accepted.json()["owner_id"], "real_owner-1")
            # Body metadata has no effect on the authenticated principal.
            self.assertEqual(accepted.json()["submitted_owner"], "body-spoof")
            accepted_api = asyncio.run(send({"X-Api-Key": "unit-channel", "X-MaxCore-User-Id": "real_owner-1"}))
            self.assertEqual(accepted_api.status_code, 200)
            for headers, peer in (
                (node_headers, "198.51.100.25"),
                ({**node_headers, "X-Forwarded-For": "127.0.0.1"}, "198.51.100.25"),
                ({"Authorization": "Bearer public-service", "X-MaxCore-User-Id": "victim"}, "127.0.0.1"),
                ({"X-Admin-Key": "unit-channel", "X-MaxCore-User-Id": "victim"}, "127.0.0.1"),
                ({"X-Admin-Key": "public-admin", "X-MaxCore-User-Id": "victim"}, "127.0.0.1"),
                ({**node_headers, "X-Api-Key": "unit-channel"}, "127.0.0.1"),
                ({"Authorization": "Bearer unit-channel"}, "127.0.0.1"),
                ({"Authorization": "Bearer public-service"}, "127.0.0.1"),
                ({**node_headers, "X-MaxCore-User-Id": "bad owner"}, "127.0.0.1"),
            ):
                with self.subTest(headers=headers, peer=peer):
                    self.assertEqual(asyncio.run(send(headers, peer)).status_code, 403)
        self.assertIsNone(owner_context.get())

    def test_private_identity_requires_exact_channel_and_actual_loopback(self):
        secret = "unit-test-channel-only"
        headers = {"x-maxcore-user-id": "owner-a", "authorization": f"Bearer {secret}"}
        kwargs = dict(peer="127.0.0.1", path="/api/generate/audio", secret=secret)
        self.assertEqual(verify_owner(headers, **kwargs), "owner-a")
        for changed in ({"peer": "203.0.113.1"}, {"secret": ""}, {"secret": "public-admin"}):
            with self.assertRaises(ValueError):
                verify_owner(headers, **{**kwargs, **changed})
        with self.assertRaises(ValueError):
            verify_owner({**headers, "x-api-key": secret}, **kwargs)

    def test_commit_journal_then_cleanup_and_delivery_only_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "actual.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(8000)
                wav.writeframes(b"\x01\x00" * 800)
            journal = Path(directory) / "job.json"
            record = {"job_id": "stable-job", "owner_id": "owner-a", "status": "committing",
                      "type": "audio", "scratch_path": str(path), "content_type": "audio/wav"}
            def persist(job_id, value):
                self.assertTrue(path.exists(), "scratch must survive until durable journal save")
                journal.write_text(json.dumps(value))
            read = lambda job: json.loads(journal.read_text())
            persist("stable-job", record)
            def unavailable(payload):
                self.assertEqual(read("stable-job")["status"], "committing")
                raise OSError("transport unavailable")
            with self.assertRaises(OSError):
                deliver(record, persist_job=persist, read_job=read,
                        committer=partial(commit_artifact, transport=unavailable, attempts=1))
            self.assertTrue(path.exists())
            self.assertEqual(read("stable-job")["status"], "committing")
            def success(payload):
                return {"durable": True, "retrievable": True, "owner_id": payload["owner_id"],
                        "job_id": payload["job_id"], "sha256": payload["metadata"]["sha256"],
                        "size_bytes": payload["metadata"]["size_bytes"], "url": "/api/storage/file/object"}
            receipt = deliver(read("stable-job"), persist_job=persist, read_job=read,
                              committer=partial(commit_artifact, transport=success))
            self.assertEqual(read("stable-job")["status"], "done")
            self.assertTrue(receipt["durable"])
            self.assertFalse(path.exists())

    def test_cancelled_job_never_calls_transport(self):
        with self.assertRaises(RenderCancelled):
            deliver({"job_id": "cancelled"}, persist_job=lambda *a: self.fail("must not publish"),
                    read_job=lambda job: {"status": "cancelled"},
                    committer=lambda *a, **k: self.fail("must not deliver"))


if __name__ == "__main__":
    unittest.main()