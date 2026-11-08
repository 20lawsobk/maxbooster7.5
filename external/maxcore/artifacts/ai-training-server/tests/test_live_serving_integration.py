"""Rights-safe live learning and reviewed-candidate integration contracts.

All training material here is authored solely for isolated tests. Signed review
fixtures verify the registry protocol; they do not claim production quality.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.awareness.engine import Engine
from ai_model.awareness.test_engine import MemoryStore, sources
from ai_model.training import candidate_registry, candidate_lifecycle, live_learning
from ai_model.training.candidate_manifest_train import train_from_manifest
from ai_model.model.candidate_model import CandidateModel


class LiveServingIntegrationTests(unittest.TestCase):
    def test_direct_manifest_worker_cannot_bypass_live_text_rights(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus = root / "live-corpus.json"
            record = {
                "text": "Public post text with no operator-granted training rights.",
                "license": "NOASSERTION",
                "private": False,
                "source": "public-test-feed",
                "author": "unattributed live observation",
                "purpose": "training",
                "provenance_type": "maxcore_live_awareness_observation",
                "live_provenance": {},
            }
            corpus.write_text(json.dumps({"schema": 1, "records": [record]}))
            corpus_sha = hashlib.sha256(corpus.read_bytes()).hexdigest()
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(live_learning.Blocked) as error:
                    train_from_manifest(
                        corpus, corpus_sha, run_id="live-test-no-rights",
                        steps=1, manual_backward=True, context_tokens=128,
                    )
            self.assertEqual(error.exception.code, "blocked_training_rights")

    def test_public_awareness_text_is_blocked_before_candidate_creation(self):
        engine = Engine(sources=sources(), store=MemoryStore(), timeout=1)
        engine.refresh()
        with tempfile.TemporaryDirectory() as directory:
            jobs = Path(directory) / "live_learning_runs"
            with patch.object(live_learning, "JOBS", jobs):
                with self.assertRaises(live_learning.Blocked) as error:
                    live_learning.execute(engine, steps=1, peak_content=False)
            self.assertEqual(error.exception.code, "blocked_training_rights")
            self.assertEqual(
                [p.name for p in jobs.iterdir() if p.name.startswith("live-")],
                [],
            )

    def test_operator_authored_candidate_requires_independent_signed_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidates = root / "candidate_runs"
            registry = root / "candidate_registry"
            corpus_path = root / "corpus.json"
            protocol = root / "protocol.json"
            records = [
                {
                    "text": "A green comet crossed above a silent harbor at dusk.",
                    "license": "CC0-1.0",
                    "private": False,
                    "source": "local:test-authored-fixture-v1",
                    "author": "Test fixture author",
                    "purpose": "training",
                },
                {
                    "text": "Three ceramic cups rested beside a folded map.",
                    "license": "CC0-1.0",
                    "private": False,
                    "source": "local:test-authored-fixture-v1",
                    "author": "Test fixture author",
                    "purpose": "training",
                },
                {
                    "text": "Rain tapped gently against the far window.",
                    "license": "CC0-1.0",
                    "private": False,
                    "source": "local:test-authored-fixture-v1",
                    "author": "Test fixture author",
                    "purpose": "training",
                },
            ]
            corpus_path.write_text(json.dumps({"schema": 1, "records": records}))
            protocol.write_text(json.dumps({
                "schema": 1,
                "frozen": True,
                "cases": [{
                    "id": "fixture-probe",
                    "prompt": "Describe a distant observatory.",
                    "expected": "A tower faces the northern sky.",
                }],
            }))
            corpus_sha = hashlib.sha256(corpus_path.read_bytes()).hexdigest()
            protocol_sha = hashlib.sha256(protocol.read_bytes()).hexdigest()
            run_id = "candidate-test-authored-review"

            with patch.object(candidate_lifecycle, "CANDIDATES", candidates), \
                 patch.object(candidate_registry, "REGISTRY", registry):
                result = train_from_manifest(
                    corpus_path, corpus_sha, holdout=protocol,
                    holdout_sha256=protocol_sha, run_id=run_id,
                    steps=1, manual_backward=True, context_tokens=256,
                )
                run = candidates / run_id
                verified, report, _ = candidate_registry.verify_bundle(run)
                self.assertTrue(report["changed_parameters"])
                self.assertGreater(report["gemm_backward_calls"], 0)
                self.assertFalse(verified["quality_eligible"])
                with self.assertRaises(ValueError):
                    candidate_registry.select_candidate(run=run)

                candidate = CandidateModel.load_candidate(run / "candidate.pt")
                output = candidate.generate("Describe a distant observatory.", max_new_tokens=4)
                self.assertIsInstance(output.get("text"), str)
                evaluation = root / "evaluation.json"
                evaluation.write_text(json.dumps({
                    "checkpoint_sha256": verified["checkpoint_sha256"],
                    "protocol_sha256": protocol_sha,
                    "protocol_conformant": True,
                    "records": [{
                        "id": "fixture-probe",
                        "prompt": "Describe a distant observatory.",
                        "output": output,
                    }],
                }))
                private, public = root / "reviewer-private.pem", root / "reviewer-public.pem"
                subprocess.run([
                    "openssl", "genpkey", "-algorithm", "EC", "-pkeyopt",
                    "ec_paramgen_curve:P-256", "-out", str(private),
                ], check=True, capture_output=True, timeout=10)
                subprocess.run([
                    "openssl", "pkey", "-in", str(private), "-pubout",
                    "-out", str(public),
                ], check=True, capture_output=True, timeout=10)
                policy = root / "trust.json"
                policy.write_text(json.dumps({
                    "require_exclusive_backend": True,
                    "minimum_pass_fraction": 1.0,
                    "reviewers": {
                        "test-only": {
                            "role": "independent-quality-reviewer",
                            "public_key": str(public),
                            "public_key_sha256": candidate_registry.sha256(public),
                        },
                    },
                }))
                policy.chmod(0o600)
                review = root / "review.json"
                bindings = {
                    key: verified[key]
                    for key in ("checkpoint_sha256", "manifest_sha256", "report_sha256")
                }
                bindings.update(
                    evaluation_sha256=candidate_registry.sha256(evaluation),
                    protocol_sha256=protocol_sha,
                )
                review.write_text(json.dumps({
                    "reviewer": "test-only",
                    "decision": "accept",
                    "bindings": bindings,
                    "quality_rationale": "Disposable fixture validates the signed review contract.",
                    "safety_rationale": "Disposable fixture does not approve production serving.",
                    "data_rights_rationale": "Training text was authored exclusively for this test.",
                    "case_scores": {
                        "fixture-probe": {"coherence": 2, "relevance": 2, "grounding": 2},
                    },
                }))
                signature = root / "review.sig"
                subprocess.run([
                    "openssl", "dgst", "-sha256", "-sign", str(private),
                    "-out", str(signature), str(review),
                ], check=True, capture_output=True, timeout=10)
                with patch.dict(os.environ, {"MAXCORE_CANDIDATE_TRUST": str(policy)}):
                    decision = candidate_registry.eligibility(
                        run=run, evaluation=evaluation, protocol=protocol,
                        review=review, signature=signature,
                    )
                    self.assertTrue(decision["eligible"], decision["reasons"])
                    selected = candidate_registry.select_candidate(
                        run=run, evaluation=evaluation, protocol=protocol,
                        review=review, signature=signature,
                    )
                    self.assertEqual(
                        selected["eligibility_policy"], "signed-review-v1",
                    )
                    review.write_text("{}")
                    self.assertFalse(candidate_registry.eligibility(
                        run=run, evaluation=evaluation, protocol=protocol,
                        review=review, signature=signature,
                    )["eligible"])


if __name__ == "__main__":
    unittest.main()
