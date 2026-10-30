"""Real encoded file checks; isolated receipt transport exercises retry semantics."""
import hashlib
import tempfile
import unittest
import wave
import subprocess
from pathlib import Path
from ai_model.media_contract import validate_artifact, commit_artifact, RenderCancelled
from ai_model.render_manager import RenderManager


class ArtifactDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "audio.wav"
        with wave.open(str(self.path), "wb") as wav:
            wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
            wav.writeframes(b"\0\0" * 8000)

    def receipt(self, payload):
        return {"durable": True, "retrievable": True, "owner_id": payload["owner_id"],
                "job_id": payload["job_id"], "sha256": payload["metadata"]["sha256"],
                "size_bytes": payload["metadata"]["size_bytes"],
                "url": "/api/storage/file/users%2Fu1%2Fgenerated%2Faudio.wav"}

    def commit(self, **kwargs):
        return commit_artifact(self.path, kind="audio", owner_id="u1", job_id="j1",
                               content_type="audio/wav", **kwargs)

    def test_actual_duration_and_scratch_retained_until_journal_saved(self):
        receipt = self.commit(transport=self.receipt, metadata={"duration": 999, "quality": "measured"})
        self.assertEqual(receipt["duration"], 1)
        self.assertEqual(receipt["quality"], "measured")
        self.assertTrue(self.path.exists())
        self.assertEqual(receipt["sha256"], hashlib.sha256(self.path.read_bytes()).hexdigest())

    def test_specification_is_not_media(self):
        self.path.write_text('{"duration": 10, "url": "/outputs/fake.wav"}')
        with self.assertRaises(Exception):
            validate_artifact(self.path, "audio")

    def test_retry_keeps_identity_and_bytes(self):
        calls = []
        def transport(payload):
            calls.append(payload)
            if len(calls) == 1:
                raise OSError("lost acknowledgement")
            return self.receipt(payload)
        self.commit(transport=transport, sleep=lambda _: None)
        self.assertEqual(calls[0], calls[1])

    def test_wrong_owner_or_digest_never_completes(self):
        for field in ("owner_id", "sha256"):
            def transport(payload):
                return {**self.receipt(payload), field: "wrong"}
            with self.assertRaises(ValueError):
                self.commit(transport=transport)
        self.assertTrue(self.path.exists())

    def test_cancel_does_not_upload(self):
        def transport(_):
            self.fail("Cancelled job must not upload")
        with self.assertRaises(RenderCancelled):
            self.commit(transport=transport, cancelled=lambda: True)

    def test_manager_saves_receipt_before_cleanup(self):
        saved = []
        def persist(job):
            if job["status"] == "done":
                self.assertTrue(self.path.exists())
            saved.append(dict(job))
        def commit(path, **kwargs):
            return commit_artifact(path, transport=self.receipt, **kwargs)
        manager = RenderManager(artifact_committer=commit, persist_job=persist)
        self.addCleanup(manager.shutdown)
        manager._jobs["j1"] = {"job_id": "j1", "owner_id": "u1", "status": "running"}
        manager._deliver("j1", self.path, "audio", {"quality": "measured"})
        self.assertEqual([j["status"] for j in saved], ["committing", "done"])
        self.assertFalse(self.path.exists())
        self.assertEqual(manager.get_job_status("j1")["result"]["duration"], 1)

    def test_cancelled_manager_cannot_publish_and_removes_scratch(self):
        manager = RenderManager(persist_job=lambda _: None)
        self.addCleanup(manager.shutdown)
        manager._jobs["j1"] = {"job_id": "j1", "owner_id": "u1", "status": "running"}
        self.assertEqual(manager.cancel("j1", "stranger")["status"], "not_found")
        manager.cancel("j1", "u1")
        with self.assertRaises(RenderCancelled):
            manager._deliver("j1", self.path, "audio", {})
        self.assertFalse(self.path.exists())
        manager._update_job("j1", status="done")
        self.assertEqual(manager.get_job_status("j1")["status"], "cancelled")

    def test_interrupted_commit_recovers_without_rendering(self):
        video = Path(self.tmp.name) / "video.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        "color=size=16x16:rate=10:duration=0.2", "-c:v", "mpeg4",
                        str(video)], check=True, capture_output=True)
        def commit(path, **kwargs):
            return commit_artifact(path, transport=self.receipt, **kwargs)
        manager = RenderManager(artifact_committer=commit, persist_job=lambda _: None)
        self.addCleanup(manager.shutdown)
        record = {"job_id": "j1", "owner_id": "u1", "type": "video",
                  "status": "committing", "scratch_path": str(video),
                  "delivery_metadata": {"quality": "measured"}}
        manager._jobs["j1"] = record
        manager._recover_delivery(record)
        self.assertEqual(manager.get_job_status("j1")["status"], "done")
        self.assertAlmostEqual(manager.get_job_status("j1")["result"]["duration"], 0.2)
        self.assertFalse(video.exists())


if __name__ == "__main__":
    unittest.main()