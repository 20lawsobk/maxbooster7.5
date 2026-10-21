"""Real procedural artifacts through actual ASGI admission and private delivery.

Public observations and the durable transport are disposable fixtures. The
production owner middleware, request models, renderers, full media decoding,
journaling and commit receipt checks execute without a generative checkpoint.
"""
import ast
import asyncio
import base64
from contextvars import ContextVar
from functools import partial
from hashlib import sha256
import json
import os
from pathlib import Path
import tempfile
import time
import subprocess
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlparse
import uuid
import wave

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from ai_model.awareness import AwarenessUnavailable, bound_snapshot
from ai_model.generation.live_serving import LiveServingModel
from ai_model.generation.plan import active_plan
from ai_model.media_contract import commit_artifact, validate_artifact
from test_live_awareness_planner_http import fresh_snapshot


SERVER = Path(__file__).parents[1] / "server.py"
PRIVATE_CHANNEL = "isolated-dedicated-media-channel"


async def post_json(app, path, body, *, owner="owner-a", credential=PRIVATE_CHANNEL,
                    peer="127.0.0.1"):
    payload = json.dumps(body).encode()
    messages, received = [], False
    connected = asyncio.Event()

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": payload, "more_body": False}
        await connected.wait()
        return {"type": "http.disconnect"}

    async def collect(message):
        messages.append(message)

    headers = [(b"content-type", b"application/json")]
    if credential is not None:
        headers.append((b"authorization", f"Bearer {credential}".encode()))
    if owner is not None:
        headers.append((b"x-maxcore-user-id", owner.encode()))
    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
               "method": "POST", "scheme": "http", "path": path, "raw_path": path.encode(),
               "root_path": "", "query_string": b"", "headers": headers,
               "client": (peer, 12345), "server": ("127.0.0.1", 80)}, receive, collect)
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    data = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, json.loads(data)


def actual_media_app(root, model, persist, read):
    app = FastAPI()

    def require_scope(scope):
        async def check(request: Request):
            if request.headers.get("authorization") != f"Bearer {PRIVATE_CHANNEL}":
                raise HTTPException(status_code=401, detail="Generation authorization required")
            return {"scope": scope}
        return check

    names = {"bind_job_owner_middleware", "_planned_generation", "_in_thread",
             "_AwarenessMixin", "ApiGenerateImageRequest", "ApiGenerateAudioRequest",
             "ApiGenerateVideoRequest", "ApiGenerateContentRequest", "SceneOverride",
             "ApiVideoExtendRequest", "_audio_upload_owner_dir", "_resolve_owner_audio_upload",
             "api_generate_image", "api_generate_audio", "api_generate_video",
             "api_video_generate_ai", "api_generate_content", "api_video_extend"}
    tree = ast.parse(SERVER.read_text())
    nodes = [n for n in tree.body
             if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
             and n.name in names]
    scope = {"app": app, "Any": Any, "Dict": Dict, "List": List, "Optional": Optional,
             "BaseModel": BaseModel, "Field": Field, "model_validator": model_validator,
             "Depends": Depends, "HTTPException": HTTPException, "Request": Request,
             "require_scope": require_scope, "json": json, "time": time, "uuid": uuid,
             "Path": Path, "hashlib": __import__("hashlib"), "urlparse": urlparse,
             "os": os, "asyncio": asyncio, "_model_ready": False,
             "_live_serving_model": model, "_serving_release_status": {},
             "_UPLOADS_PATH": root, "_persist_generation_job": persist, "_job_read": read,
             "_request_job_owner": ContextVar("dedicated_http_owner", default=None)}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SERVER), "exec"), scope)
    return app, scope


class DedicatedMediaHTTP(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(directory)
        self.uploads = self.root / "uploads"
        self.uploads.mkdir()
        self.store = self.root / "durable"
        self.store.mkdir()
        self.journals = self.root / "journals"
        self.journals.mkdir()
        self.snapshot = fresh_snapshot()
        self.engine = SimpleNamespace(current_snapshot=Mock(return_value=self.snapshot))
        self.enterContext(patch("ai_model.awareness.engine.get_engine", return_value=self.engine))
        self.enterContext(patch.dict(os.environ, {"PDIM_LOCAL_CHANNEL_TOKEN": PRIVATE_CHANNEL}))
        self.enterContext(patch("ai_model.image.image_engine._UPLOADS_DIR", self.uploads / "images"))
        self.enterContext(patch("ai_model.video.cinematic_engine.OUTPUT_DIR", str(self.uploads / "videos")))
        self.saved = []
        self.commits = []

        def persist(job, record):
            self.saved.append(json.loads(json.dumps(record)))
            (self.journals / f"{job}.json").write_text(json.dumps(record))

        def read(job):
            path = self.journals / f"{job}.json"
            return json.loads(path.read_text()) if path.exists() else None

        def transport(payload):
            self.commits.append(payload)
            owner = payload["owner_id"]
            target = self.store / owner / (payload["job_id"] + Path(payload["filename"]).suffix)
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(base64.b64decode(payload["data_base64"], validate=True))
            # Actual filesystem read-back binds the private owner/job receipt to
            # the exact encoded artifact. No production store is contacted.
            stored = target.read_bytes()
            return {"durable": True, "retrievable": True, "owner_id": owner,
                    "job_id": payload["job_id"], "sha256": sha256(stored).hexdigest(),
                    "size_bytes": len(stored), "url": f"/api/storage/file/{owner}/{target.name}"}

        self.enterContext(patch("ai_model.media_contract.commit_artifact",
                                new=partial(commit_artifact, transport=transport, attempts=1)))
        self.model = LiveServingModel()
        self.model.pin = Mock(wraps=self.model.pin)
        self.app, self.scope = actual_media_app(self.uploads, self.model, persist, read)
        self.read = read

    def assert_clean_context(self):
        self.assertIsNone(active_plan.get())
        self.assertIsNone(self.scope["_request_job_owner"].get())
        with self.assertRaises(AwarenessUnavailable):
            bound_snapshot()

    async def test_real_image_audio_video_artifacts_without_language_checkpoint(self):
        cases = [
            ("/api/generate/image", "image", {"dedicated_controls": {
                "headline": "My release", "width": 128, "height": 128, "seed": 11}}),
            ("/api/generate/audio", "audio", {"dedicated_controls": {
                "duration_sec": .125, "sample_rate": 8000, "instrument": "piano",
                "bpm": 120, "key": "C minor"}}),
            ("/api/generate-video", "video", {"idea": "My release", "dedicated_controls": {
                "duration_sec": .25, "width": 128, "height": 96, "fps": 8,
                "headline": "My release"}}),
        ]
        for path, modality, body in cases:
            with self.subTest(modality=modality):
                status, result = await post_json(self.app, path, {**body,
                    "owner_id": "body-spoof", "user_id": "body-spoof"})
                self.assertEqual(status, 200, result)
                self.assertEqual(result["delivery_status"], "durable")
                self.assertEqual(result["status"], "completed")
                self.assertEqual(result["snapshot_id"], self.snapshot.id)
                self.assertEqual(result["generation_plan"]["checkpoint"], "")
                self.assertIs(result["checkpoint_inference"], False)
                self.assertIs(result["capability"]["trained"], False)
                self.assertEqual(result["source"], result["capability"]["renderer"])
                self.assertIs(result["validation"]["artifact_validated"], True)
                self.assertEqual(result["validation"]["quality"], "not_evaluated")
                self.assertEqual(result["receipt"]["owner_id"], "owner-a")
                self.assertEqual(self.read(result["job_id"])["status"], "done")
                committed = self.commits[-1]
                artifact = self.store / "owner-a" / (result["job_id"] + Path(committed["filename"]).suffix)
                actual = validate_artifact(artifact, modality)
                self.assertEqual(actual["sha256"], result["receipt"]["sha256"])
                self.assertGreater(actual["size_bytes"], 32)
                self.assertFalse(Path(self.read(result["job_id"])["scratch_path"]).exists())
                self.assert_clean_context()
        self.model.pin.assert_not_called()
        self.assertEqual(len(self.commits), 3)

    async def test_raw_video_alias_runs_the_same_explicit_procedural_contract(self):
        status, result = await post_json(self.app, "/api/video/generate-ai", {
            "dedicated_controls": {"duration_sec": .25, "width": 128, "height": 96, "fps": 8}})
        self.assertEqual(status, 200, result)
        self.assertEqual(result["capability"]["kind"], "procedural")
        self.assertIs(result["validation"]["artifact_validated"], True)
        self.model.pin.assert_not_called()
        self.assert_clean_context()

    async def test_normal_learned_media_and_text_still_require_a_capable_candidate(self):
        cases = [
            ("/api/generate/image", {"prompt": "A photographic artist"}),
            ("/api/generate/audio", {"prompt": "An arbitrary soundtrack"}),
            ("/api/generate-video", {"idea": "Arbitrary cinematic subjects"}),
            ("/api/generate/content", {"topic": "A new release", "platform": "instagram", "tone": "casual"}),
        ]
        for path, body in cases:
            with self.subTest(path=path):
                status, result = await post_json(self.app, path, body)
                self.assertEqual(status, 503, result)
                self.assertIn("No operationally capable", result["detail"])
                self.assert_clean_context()
        self.assertEqual(self.model.pin.call_count, 4)
        self.assertEqual(self.commits, [])

    async def test_missing_or_stale_awareness_never_dispatches_a_renderer(self):
        for snapshot in (None, fresh_snapshot(time.time() - 1000)):
            self.engine.current_snapshot.return_value = snapshot
            status, result = await post_json(self.app, "/api/generate/image", {"dedicated_controls": {}})
            self.assertEqual(status, 503, result)
            self.assertIn("Live awareness unavailable", result["detail"])
            self.assert_clean_context()
        self.assertEqual(self.commits, [])
        self.model.pin.assert_not_called()

    async def test_semantic_controls_and_unrelated_routes_cannot_select_procedural_success(self):
        for body in [{"dedicated_controls": {"subject": "a celebrity"}},
                     {"dedicated_controls": {"reference": "some image"}},
                     {"style": "photorealism", "dedicated_controls": {}},
                     {"dedicated_controls": {"width": 16}},
                     {"dedicated_controls": []}]:
            status, result = await post_json(self.app, "/api/generate/image", body)
            self.assertEqual(status, 422, result)
            self.assert_clean_context()
        status, result = await post_json(self.app, "/api/generate/content", {
            "platform": "instagram", "topic": "release", "tone": "casual", "dedicated_controls": {}})
        self.assertEqual(status, 422, result)
        self.assertIn("does not support", result["detail"])
        self.assertEqual(self.commits, [])
        self.model.pin.assert_not_called()

    async def test_real_private_owner_middleware_blocks_spoofed_or_missing_identity(self):
        for owner, credential, peer in [(None, PRIVATE_CHANNEL, "127.0.0.1"),
                                        ("owner-a", "public-generation-key", "127.0.0.1"),
                                        ("owner-a", PRIVATE_CHANNEL, "198.51.100.10")]:
            status, result = await post_json(self.app, "/api/generate/image", {"dedicated_controls": {}},
                                             owner=owner, credential=credential, peer=peer)
            self.assertEqual(status, 403, result)
            self.assert_clean_context()
        self.assertEqual(self.commits, [])
        self.engine.current_snapshot.assert_not_called()

    async def test_video_audio_references_are_resolved_only_for_the_private_owner(self):
        common = {"idea": "Release video", "dedicated_controls": {
            "duration_sec": .25, "width": 128, "height": 96, "fps": 8}}
        for reference, expected in [("/etc/passwd", 422),
                                     ("file:///etc/passwd", 422),
                                     ("/uploads/audio-inputs/other-owner/example.wav", 403),
                                     ("/uploads/audio-inputs/../../outside.wav", 403)]:
            body = {**common, "dedicated_controls": {**common["dedicated_controls"], "audio_path": reference}}
            status, result = await post_json(self.app, "/api/generate-video", body)
            self.assertEqual(status, expected, result)
            self.assert_clean_context()
        self.assertEqual(self.commits, [])

    async def test_video_muxes_a_real_owner_upload_but_rejects_other_owner_and_symlink(self):
        own = self.scope["_audio_upload_owner_dir"]("owner-a")
        other = self.scope["_audio_upload_owner_dir"]("owner-b")
        for directory in (own, other):
            directory.mkdir(parents=True)
            with wave.open(str(directory / "fixture.wav"), "wb") as wav:
                wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(8000)
                wav.writeframes(b"\x20\x00\x20\x00" * 2000)
        (own / "cross-owner.wav").symlink_to(other / "fixture.wav")
        reference = lambda path: "/uploads/" + path.relative_to(self.uploads).as_posix()
        controls = {"duration_sec": .25, "width": 128, "height": 96, "fps": 8}
        for source in (other / "fixture.wav", own / "cross-owner.wav"):
            status, result = await post_json(self.app, "/api/generate-video", {
                "idea": "Release", "dedicated_controls": {**controls, "audio_path": reference(source)}})
            self.assertEqual(status, 403, result)
            self.assertEqual(self.commits, [])
        status, result = await post_json(self.app, "/api/generate-video", {
            "idea": "Release", "user_audio_path": reference(own / "fixture.wav"),
            "dedicated_controls": controls})
        self.assertEqual(status, 200, result)
        committed = self.commits[-1]
        artifact = self.store / "owner-a" / (result["job_id"] + Path(committed["filename"]).suffix)
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(artifact)],
                               check=True, capture_output=True, text=True, timeout=20)
        self.assertIn("audio", {stream["codec_type"] for stream in json.loads(probe.stdout)["streams"]})
        self.assertEqual(self.read(result["job_id"])["effective_controls"]["audio_path"],
                         str((own / "fixture.wav").resolve()))
        self.assert_clean_context()


if __name__ == "__main__":
    unittest.main()
