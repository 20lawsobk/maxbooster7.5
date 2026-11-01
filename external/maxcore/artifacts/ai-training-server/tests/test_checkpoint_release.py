import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.model.checkpoint_release import prepare_checkpoint, CheckpointUnavailable


class CheckpointReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.weights = self.root / "external/maxcore/artifacts/ai-training-server/ai_model/weights"
        self.weights.mkdir(parents=True)
        self.content = b"pinned test artifact bytes"
        self.write_manifest(self.content)

    def write_manifest(self, content):
        digest = hashlib.sha256(content).hexdigest()
        self.pointer = (f"version https://git-lfs.github.com/spec/v1\n"
                        f"oid sha256:{digest}\nsize {len(content)}\n").encode()
        prefix = "external/maxcore/artifacts/ai-training-server/ai_model/weights/"
        self.manifest = {
            "schemaVersion": 1, "sourcePath": prefix + "model.corrupt",
            "path": prefix + "model.pt", "bytes": len(content), "sha256": digest,
            "sourceGitBlob": hashlib.sha1(f"blob {len(self.pointer)}\0".encode() + self.pointer).hexdigest(),
            "capability": "numerical-inference", "qualityClaim": "not-evaluated",
        }
        (self.weights / "model.release.json").write_text(json.dumps(self.manifest))

    def test_materializes_verified_source_once_even_with_concurrent_preparers(self):
        (self.weights / "model.corrupt").write_bytes(self.content)
        with ThreadPoolExecutor(max_workers=4) as pool:
            paths = list(pool.map(lambda _: prepare_checkpoint(self.weights), range(8)))
        self.assertEqual({p.read_bytes() for p in paths}, {self.content})
        self.assertFalse(list(self.weights.glob("model.pt.release-*")))

    def test_reuses_lfs_cache_without_rewriting_tracked_pointer(self):
        (self.weights / "model.corrupt").write_bytes(self.pointer)
        digest = self.manifest["sha256"]
        cached = self.root / ".git/lfs/objects" / digest[:2] / digest[2:4] / digest
        cached.parent.mkdir(parents=True)
        cached.write_bytes(self.content)
        self.assertEqual(prepare_checkpoint(self.weights).read_bytes(), self.content)
        self.assertEqual((self.weights / "model.corrupt").read_bytes(), self.pointer)

    def test_pointer_only_checkout_is_actionable_and_never_creates_weights(self):
        (self.weights / "model.corrupt").write_bytes(self.pointer)
        with self.assertRaisesRegex(CheckpointUnavailable, "LFS quota/budget"):
            prepare_checkpoint(self.weights)
        self.assertFalse((self.weights / "model.pt").exists())

    def test_bad_active_checkpoint_is_preserved_and_rejected(self):
        active = self.weights / "model.pt"
        active.write_bytes(b"wrong")
        (self.weights / "model.corrupt").write_bytes(self.content)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            prepare_checkpoint(self.weights)
        self.assertEqual(active.read_bytes(), b"wrong")

    def test_supplied_artifact_requires_the_same_release_digest(self):
        supplied = self.root / "supplied.pt"
        supplied.write_bytes(self.content)
        self.assertEqual(prepare_checkpoint(self.weights, supplied_path=supplied), supplied)
        supplied.write_bytes(b"different")
        with self.assertRaises(ValueError):
            prepare_checkpoint(self.weights, supplied_path=supplied)

    def test_manifest_must_bind_to_its_git_pointer(self):
        self.manifest["sourceGitBlob"] = "0" * 40
        (self.weights / "model.release.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "pinned Git LFS"):
            prepare_checkpoint(self.weights)

    def test_missing_bytes_block_before_model_or_gpu_allocation(self):
        (self.weights / "model.corrupt").write_bytes(self.pointer)
        tree = ast.parse((ROOT / "server.py").read_text())
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_init_ai_model")
        legacy = Mock(side_effect=AssertionError("Missing bytes must not allocate a model"))
        scope = {"os": os, "Path": Path, "__file__": str(self.weights.parents[1] / "server.py"),
                 "_init_legacy_ai_model": legacy, "_model_ready": True}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "startup", "exec"), scope)
        with patch.dict(os.environ, {"MAXCORE_SERVING_RELEASE": "legacy"}):
            scope["_init_ai_model"]()
        self.assertFalse(scope["_model_ready"])
        self.assertIn("CheckpointUnavailable", scope["_model_init_error"])
        self.assertIn("Git LFS", scope["_serving_release_status"]["error"])
        legacy.assert_not_called()

    def test_verified_archive_loads_complete_tensor_state_for_numerical_execution(self):
        import torch
        from ai_model.media_contract import load_checkpoint_archive, load_complete_checkpoint
        trained = torch.nn.Linear(2, 1)
        with torch.no_grad():
            trained.weight.fill_(2)
            trained.bias.fill_(1)
        source = self.weights / "model.corrupt"
        torch.save({"model_state_dict": trained.state_dict()}, source)
        self.write_manifest(source.read_bytes())
        checkpoint = load_checkpoint_archive(prepare_checkpoint(self.weights))
        restored = torch.nn.Linear(2, 1)
        load_complete_checkpoint(restored, checkpoint["model_state_dict"])
        self.assertEqual(restored(torch.tensor([[3., 4.]])).item(), 15.)
        with self.assertRaisesRegex(ValueError, "Incompatible checkpoint"):
            load_complete_checkpoint(restored, {"weight": trained.weight})


if __name__ == "__main__":
    unittest.main()
