import copy
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_model.training.media_learning import (
    MediaLearningBlocked, media_learning_preflight,
    require_media_learning_ready, validate_media_manifest,
    create_router,
)


class MediaLearningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        evidence = b"Test-only source owner training-rights attestation"
        (self.root / "rights.txt").write_bytes(evidence)
        self.manifest = {"schema_version": 1, "items": []}
        for n, split in enumerate(("train", "holdout")):
            data = f"test fixture asset {n}".encode()
            (self.root / f"{n}.bin").write_bytes(data)
            self.manifest["items"].append({
                "id": str(n), "source_id": str(n), "modality": "audio",
                "split": split, "path": f"{n}.bin",
                "sha256": hashlib.sha256(data).hexdigest(),
                "awareness": f"Test-only observation {n}", "observed_at": "2025-01-01T00:00:00Z",
                "rights": {"training_allowed": True, "rights_holder": "Test owner",
                           "attested_by": "Test operator", "license": "Test grant",
                           "attested_at": "2025-01-01T00:00:00Z",
                           "evidence_path": "rights.txt",
                           "evidence_sha256": hashlib.sha256(evidence).hexdigest()},
            })

    def validate(self, manifest=None):
        return validate_media_manifest(manifest or self.manifest, self.root, modality="audio")

    def test_valid_corpus_is_not_claimed_decodable_or_trainable(self):
        result = self.validate()
        self.assertTrue(result["valid"])
        self.assertFalse(result["media_decode_validated"])
        report = media_learning_preflight("audio", self.manifest, self.root)
        self.assertFalse(report["training_ready"])
        self.assertIsNotNone(report["corpus"])

    def test_rights_must_be_explicit_and_current(self):
        for key, value in (("training_allowed", "true"), ("license", ""),
                           ("expires_at", "2025-01-02T00:00:00Z"),
                           ("evidence_sha256", "invalid")):
            manifest = copy.deepcopy(self.manifest)
            manifest["items"][0]["rights"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(manifest)

    def test_mutation_and_source_leakage_rejected(self):
        for key, value in (("source_id", "1"), ("sha256", "invalid"),
                           ("observed_at", "2999-01-01T00:00:00Z"),
                           ("observed_at", "2025-01-01"),
                           ("path", "../outside.bin"),
                           ("path", "https://example.org/audio.wav")):
            manifest = copy.deepcopy(self.manifest)
            manifest["items"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(manifest)

    def test_duplicate_content_rejected(self):
        item = self.manifest["items"][1]
        item["path"] = self.manifest["items"][0]["path"]
        item["sha256"] = self.manifest["items"][0]["sha256"]
        with self.assertRaisesRegex(ValueError, "duplicate media"):
            self.validate()

    def test_normalized_observation_overlap_rejected_across_splits(self):
        self.manifest["items"][0]["awareness"] = "New Artist Release"
        for overlap in ("New Artist Release", "  NEW\tartist\nrelease  ",
                        "Ｎｅｗ　Ａｒｔｉｓｔ　Ｒｅｌｅａｓｅ"):
            manifest = copy.deepcopy(self.manifest)
            manifest["items"][1]["awareness"] = overlap
            # Different source IDs and asset hashes must not hide prompt leakage.
            with self.subTest(overlap=overlap), self.assertRaisesRegex(
                ValueError, "normalized awareness observation leakage"
            ):
                self.validate(manifest)
            report = media_learning_preflight("audio", manifest, self.root)
            self.assertFalse(report["training_ready"])
            self.assertIsNone(report["corpus"])
            self.assertTrue(any("observation leakage" in b for b in report["blockers"]))

    def test_guard_never_trains_or_changes_files(self):
        before = {p.name: p.read_bytes() for p in self.root.iterdir()}
        for modality in ("audio", "video"):
            with self.assertRaises(MediaLearningBlocked) as ctx:
                require_media_learning_ready(modality)
            report = ctx.exception.report
            self.assertFalse(report["cpu_fallback_allowed"])
            self.assertFalse(report["serving_checkpoints_modified"])
            self.assertFalse(report["learned_generation_verified"])
            self.assertTrue(report["blockers"])
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir()})

    def test_invalid_corpus_returns_explicit_blocker(self):
        report = media_learning_preflight("audio", {}, self.root)
        self.assertTrue(any("corpus rejected" in b for b in report["blockers"]))

    def client(self):
        from fastapi import FastAPI, Header, HTTPException
        from fastapi.testclient import TestClient

        def authorize(x_admin_key: str = Header(None)):
            if x_admin_key != "test-admin":
                raise HTTPException(status_code=403, detail="Admin authorization required")

        app = FastAPI()
        app.include_router(create_router(authorize))
        return TestClient(app)

    def test_routes_require_admin_before_preflight(self):
        with self.client() as client, patch(
            "ai_model.training.media_learning.media_learning_preflight"
        ) as preflight:
            for method in ("get", "post"):
                for modality in ("audio", "video"):
                    kwargs = {"json": self.manifest} if method == "post" else {}
                    for headers in ({}, {"x-admin-key": "ordinary-user"}):
                        response = getattr(client, method)(
                            f"/api/training/media/{modality}/preflight",
                            headers=headers, **kwargs)
                        self.assertEqual(response.status_code, 403)
            preflight.assert_not_called()

    def test_routes_supported_modalities_return_full_blocked_report(self):
        with self.client() as client:
            for modality in ("audio", "video"):
                response = client.get(f"/api/training/media/{modality}/preflight",
                                      headers={"x-admin-key": "test-admin"})
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["modality"], modality)
                self.assertEqual(response.json()["status"], "blocked")
                self.assertFalse(response.json()["training_ready"])
                self.assertIn("implementation_evidence", response.json())
                self.assertIn("checkpoints", response.json())
            for method in ("get", "post"):
                kwargs = {"json": self.manifest} if method == "post" else {}
                response = getattr(client, method)(
                    "/api/training/media/text/preflight",
                    headers={"x-admin-key": "test-admin"}, **kwargs)
                self.assertEqual(response.status_code, 422)

    def test_post_validates_only_operator_configured_corpus(self):
        with self.client() as client, patch.dict(
            "os.environ", {"MAXCORE_MEDIA_LEARNING_CORPUS_ROOT": str(self.root)}
        ):
            response = client.post("/api/training/media/audio/preflight",
                                   headers={"x-admin-key": "test-admin"},
                                   json=self.manifest)
            self.assertEqual(response.status_code, 409)
            self.assertTrue(response.json()["corpus"]["valid"])
            self.assertFalse(response.json()["training_ready"])

    def test_post_without_root_is_explicitly_blocked(self):
        with self.client() as client, patch.dict("os.environ", {}, clear=True):
            response = client.post("/api/training/media/audio/preflight",
                                   headers={"x-admin-key": "test-admin"},
                                   json=self.manifest)
            self.assertEqual(response.status_code, 409)
            self.assertIsNone(response.json()["corpus"])
            self.assertTrue(any("MAXCORE_MEDIA_LEARNING_CORPUS_ROOT" in b
                                for b in response.json()["blockers"]))


if __name__ == "__main__":
    unittest.main()