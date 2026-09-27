"""Real bounded runtime evidence tests, NOT synthetic quality-approval fixtures."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from ai_model.model.candidate_serving import create_candidate_adapter
from ai_model.training.candidate_manifest_train import train_from_manifest
from ai_model.training.candidate_benchmark import benchmark
from ai_model.training.candidate_registry import (
    verify_bundle, register_runtime, eligibility, select_candidate,
)


class GenericCandidateTests(unittest.TestCase):
    def test_actual_manifest_training_registry_and_adapter(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus, holdout = root / "corpus.json", root / "holdout.json"
            corpus.write_text(json.dumps({"schema": 1, "records": [{
                "text": "The silver spool rolled past a violet box.",
                "purpose": "runtime-validation", "private": False,
                "license": "CC0-1.0", "author": "Runtime test fixture author",
                "source": "local:new-runtime-fixture-not-acceptance"
            }]}))
            holdout.write_text(json.dumps({"schema": 1, "frozen": True,
                                          "decoding": {"method": "greedy"},
                                          "cases": [{"id": "runtime-only-probe",
                                                     "prompt": "A quartz disk",
                                                     "max_new_tokens": 4}]}))
            digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
            candidates = root / "runs"
            registry = root / "registry"
            with patch("ai_model.training.candidate_lifecycle.CANDIDATES", candidates), \
                 patch("ai_model.training.candidate_registry.REGISTRY", registry):
                report = train_from_manifest(corpus, digest(corpus), holdout, digest(holdout),
                                             "runtime-one-step", steps=1)
                run = candidates / "runtime-one-step"
                self.assertTrue(report["smoke_only"])
                self.assertGreater(report["gemm_backward_calls"], 0)
                verified, _, _ = verify_bundle(run)
                self.assertTrue(verified["runtime_eligible"])
                self.assertFalse(verified["quality_eligible"])
                self.assertEqual(register_runtime(run), register_runtime(run))
                self.assertFalse((registry / "selected.json").exists())
                self.assertFalse(eligibility(run)["eligible"])
                with self.assertRaisesRegex(ValueError, "Smoke/runtime"):
                    select_candidate(run=run)
                with self.assertRaisesRegex(ValueError, "Exclusive training"):
                    create_candidate_adapter(run, runtime_only=True, require_exclusive_training=True)
                adapter = create_candidate_adapter(run, runtime_only=True,
                                                   require_exclusive_backend=True)
                self.assertTrue(adapter.inference_backend_exclusive)
                self.assertFalse(adapter.training_backend_exclusive)
                output = adapter.generate("A quartz disk", max_new_tokens=4)
                self.assertTrue(output.startswith("A quartz disk"))
                with self.assertRaisesRegex(ValueError, "no prompt truncation"):
                    adapter.generate("x" * 128, max_new_tokens=1)
                with self.assertRaises(ValueError):
                    adapter.generate("short", 4, temperature=-0.85)
                evaluated = benchmark(run / "candidate.pt", holdout, digest(holdout),
                                      root / "evaluation.json")
                self.assertTrue(evaluated["protocol_conformant"])
                self.assertEqual(len(evaluated["records"]), 1)
                self.assertFalse(evaluated["promotion_eligible"])
                # Never fabricate quality review, signatures, or passing prose.
                self.assertFalse(eligibility(run, evaluation=root / "evaluation.json",
                                            protocol=holdout)["eligible"])
                with patch("torch.Tensor.backward", side_effect=AssertionError("autograd forbidden")):
                    manual = train_from_manifest(
                        corpus, digest(corpus), holdout, digest(holdout),
                        "runtime-manual-one-step", steps=1, manual_backward=True)
                manual_run = candidates / "runtime-manual-one-step"
                self.assertTrue(manual["backend_exclusive"])
                self.assertGreater(manual["gemm_backward_calls"], 0)
                manual_adapter = create_candidate_adapter(
                    manual_run, runtime_only=True, require_exclusive_backend=True,
                    require_exclusive_training=True)
                self.assertTrue(manual_adapter.training_backend_exclusive)
                self.assertTrue(manual_adapter.inference_backend_exclusive)
                self.assertFalse(eligibility(manual_run)["eligible"])
                self.assertAlmostEqual(manual["final_training_loss"],
                                       report["final_training_loss"], places=5)
                original = (run / "input.manifest.json").read_bytes()
                (run / "input.manifest.json").write_bytes(original + b" ")
                with self.assertRaisesRegex(ValueError, "input fingerprint"):
                    verify_bundle(run)
                (run / "input.manifest.json").write_bytes(original)
                manifest_file = run / "corpus.manifest.json"
                manifest = json.loads(manifest_file.read_text())
                manifest["records"][0]["text"] = "Tampered data"
                manifest_file.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, "fingerprint mismatch"):
                    verify_bundle(run)
                print(json.dumps({"generic_runtime_steps": 1,
                                  "initial_loss": report["training_loss"][0],
                                  "final_loss": report["final_training_loss"],
                                  "actual_output": output,
                                  "manual_initial_loss": manual["training_loss"][0],
                                  "manual_final_loss": manual["final_training_loss"],
                                  "manual_forward_gemms": manual["gemm_forward_calls"],
                                  "manual_backward_gemms": manual["gemm_backward_calls"],
                                  "runtime_registered": True, "quality_selected": False}))

    def test_generic_training_rejects_unfrozen_or_tampered_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus, holdout = root / "corpus.json", root / "holdout.json"
            corpus.write_text('{"schema":1,"records":[]}')
            holdout.write_text('{"schema":1,"frozen":false,"cases":[]}')
            digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
                train_from_manifest(corpus, "bad", holdout, digest(holdout), "bad")
            with self.assertRaisesRegex(ValueError, "frozen holdout"):
                train_from_manifest(corpus, digest(corpus), holdout, digest(holdout), "bad")