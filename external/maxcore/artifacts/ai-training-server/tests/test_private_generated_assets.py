import ast
import asyncio
from contextvars import ContextVar
import json
import os
import sys
import tempfile
from pathlib import Path
import unittest

from fastapi import HTTPException
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_model.generation.private_assets import (
    is_private_asset_authorized,
    register_private_asset,
    remove_private_asset_manifest,
)


class PrivateGeneratedAssetTests(unittest.TestCase):
    def _static_client(self, root: Path):
        source = Path(__file__).resolve().parents[1] / "server.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        node = next(
            value for value in tree.body
            if isinstance(value, ast.ClassDef)
            and value.name == "_GeneratedAssetsOnlyStaticFiles"
        )
        owner = ContextVar("test_maxcore_static_owner", default=None)
        namespace = {
            "StaticFiles": StaticFiles,
            "HTTPException": HTTPException,
            "_UPLOADS_PATH": root,
            "_request_job_owner": owner,
        }
        exec(
            compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"),
            namespace,
        )
        static = namespace["_GeneratedAssetsOnlyStaticFiles"](directory=str(root))

        async def get(path, owner_id):
            token = owner.set(owner_id)
            try:
                scope = {
                    "type": "http",
                    "method": "GET",
                    "path": f"/uploads/{path}",
                    "root_path": "",
                    "query_string": b"",
                    "headers": [],
                }
                return await static.get_response(path, scope)
            finally:
                owner.reset(token)

        return get

    def _job_writer(self, jobs: Path, uploads: Path):
        source = Path(__file__).resolve().parents[1] / "server.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        node = next(
            value for value in tree.body
            if isinstance(value, ast.FunctionDef) and value.name == "_job_write"
        )
        owner = ContextVar("test_maxcore_job_owner", default=None)
        namespace = {
            "_job_path": lambda job_id: str(jobs / f"{job_id}.json"),
            "_JOBS_DIR": str(jobs),
            "_UPLOADS_PATH": uploads,
            "_request_job_owner": owner,
            "os": os,
            "json": json,
        }
        exec(
            compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"),
            namespace,
        )
        return namespace["_job_write"]

    def test_static_mount_requires_current_owner_and_manifest_for_every_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = root / "images" / "generated.png"
            image.parent.mkdir()
            image.write_bytes(b"private image bytes")
            register_private_asset(root, "/uploads/images/generated.png", ["owner-a"])

            get = self._static_client(root)
            authorized = asyncio.run(get("images/generated.png", "owner-a"))
            self.assertEqual(authorized.status_code, 200)
            self.assertEqual(Path(authorized.path).read_bytes(), b"private image bytes")
            for owner in (None, "owner-b"):
                with self.assertRaises(HTTPException) as denied:
                    asyncio.run(get("images/generated.png", owner))
                self.assertEqual(denied.exception.status_code, 404)
            manifest = next((root / ".owner-manifests").glob("*.json")).name
            with self.assertRaises(HTTPException) as hidden:
                asyncio.run(get(f".owner-manifests/{manifest}", "owner-a"))
            self.assertEqual(hidden.exception.status_code, 404)

            unregistered = root / "videos" / "legacy.mp4"
            unregistered.parent.mkdir()
            unregistered.write_bytes(b"unowned legacy media")
            with self.assertRaises(HTTPException) as denied:
                asyncio.run(self._static_client(root)("videos/legacy.mp4", "owner-a"))
            self.assertEqual(denied.exception.status_code, 404)

    def test_manifest_is_durable_owner_scoped_and_revocable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            audio = root / "audio_job.wav"
            audio.write_bytes(b"audio bytes")
            register_private_asset(root, "/uploads/audio_job.wav", ["owner-a", "owner-b"])

            # A fresh process-equivalent lookup uses the durable manifest only.
            self.assertTrue(is_private_asset_authorized(root, "/uploads/audio_job.wav", "owner-a"))
            self.assertTrue(is_private_asset_authorized(root, "/uploads/audio_job.wav", "owner-b"))
            self.assertFalse(is_private_asset_authorized(root, "/uploads/audio_job.wav", None))
            self.assertFalse(is_private_asset_authorized(root, "/uploads/audio_job.wav", "owner-c"))
            self.assertFalse(is_private_asset_authorized(root, "/uploads/../secret", "owner-a"))

            remove_private_asset_manifest(root, "/uploads/audio_job.wav")
            self.assertFalse(is_private_asset_authorized(root, "/uploads/audio_job.wav", "owner-a"))
            self.assertTrue(audio.exists(), "revocation must not delete media bytes")

    def test_expired_media_manifest_revokes_access_without_deleting_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = root / "images" / "expired.png"
            image.parent.mkdir()
            image.write_bytes(b"still retained")
            register_private_asset(root, "/uploads/images/expired.png", ["owner-a"])
            manifest_path = next((root / ".owner-manifests").glob("*.json"))
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            payload["expires_at"] = 1
            manifest_path.write_text(json.dumps(payload), encoding="utf-8")

            self.assertFalse(
                is_private_asset_authorized(root, "/uploads/images/expired.png", "owner-a"),
            )
            self.assertTrue(image.exists())

    def test_manifest_registration_rejects_symlink_escape_and_ownerless_assets(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            root = Path(tmp)
            outside = Path(outside_tmp) / "outside.png"
            outside.write_bytes(b"private")
            images = root / "images"
            images.mkdir()
            (images / "link.png").symlink_to(outside)
            with self.assertRaisesRegex(ValueError, "regular file inside uploads"):
                register_private_asset(root, "/uploads/images/link.png", ["owner-a"])
            (images / "safe.png").write_bytes(b"safe")
            with self.assertRaisesRegex(ValueError, "trusted asset owner"):
                register_private_asset(root, "/uploads/images/safe.png", [])
            self.assertTrue(outside.exists())

    def test_completed_audio_and_video_jobs_register_their_real_output_owners(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            uploads = root / "uploads"
            jobs = root / "jobs"
            uploads.mkdir()
            jobs.mkdir()
            audio = uploads / "audio_job.wav"
            video = uploads / "videos" / "render.mp4"
            video.parent.mkdir()
            audio.write_bytes(b"audio")
            video.write_bytes(b"video")
            write_job = self._job_writer(jobs, uploads)

            write_job("audio", {
                "status": "done",
                "job_type": "audio",
                "owner_ids": ["owner-a"],
                "url": "/uploads/audio_job.wav",
            })
            write_job("video", {
                "status": "done",
                "job_type": "video",
                "owner_ids": ["owner-b"],
                "url": "/uploads/videos/render.mp4",
            })

            self.assertTrue(is_private_asset_authorized(uploads, "/uploads/audio_job.wav", "owner-a"))
            self.assertFalse(is_private_asset_authorized(uploads, "/uploads/audio_job.wav", "owner-b"))
            self.assertTrue(is_private_asset_authorized(uploads, "/uploads/videos/render.mp4", "owner-b"))
            self.assertFalse(is_private_asset_authorized(uploads, "/uploads/videos/render.mp4", "owner-a"))


if __name__ == "__main__":
    unittest.main()
