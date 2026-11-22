"""Selection policy; real signatures and artifact verification covered by integration."""
import json
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch
from ai_model.training import candidate_registry as registry
from ai_model.training.auto_selection import auto_select, submit_reviewed
from ai_model.training.storage import training_root


class AutomaticSelectionTests(unittest.TestCase):
    def setUp(self):
        from ai_model.awareness import bind
        from test_generation_route_bindings import snapshot
        self.enterContext(bind(snapshot()))

    def test_best_reviewed_candidate_without_downgrade_or_protocol_swap(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(registry, "REGISTRY", Path(folder) / "registry"):
            def evidence(name, score):
                review = Path(folder) / (name + ".json")
                review.write_text(json.dumps({"case_scores": {"case": {
                    "coherence": score, "grounding": score, "relevance": score}}}))
                return {"run": str(Path(folder) / name), "review": str(review),
                        "protocol": str(Path(folder) / "protocol-a"),
                        "evaluation": "evaluation", "signature": "signature"}
            def decision(**item):
                return {"eligible": not item["run"].endswith("invalid"), "reasons": ["invalid signature"],
                        "fingerprints": {"checkpoint_sha256": Path(item["run"]).name,
                                         "protocol_sha256": item["protocol"], "review_sha256": registry.sha256(Path(item["review"]))}}
            def select(**item):
                (registry.REGISTRY / "selected.json").write_text(json.dumps({
                    "eligibility_policy": "signed-review-v1",
                    "evidence": item, "fingerprints": decision(**item)["fingerprints"]}))
            with (
                patch.object(registry, "eligibility", side_effect=decision),
                patch.object(registry, "select_candidate", side_effect=select) as selected,
                patch("ai_model.training.auto_selection._operational_candidate", return_value=True) as probe,
            ):
                submit_reviewed(**evidence("live-low", 1))
                submit_reviewed(**evidence("live-best", 2))
                with self.assertRaisesRegex(ValueError, "invalid signature"):
                    submit_reviewed(**evidence("live-invalid", 2))
                self.assertEqual(auto_select()["checkpoint_sha256"], "live-best")
                self.assertEqual(auto_select()["state"], "retained")
                self.assertEqual(probe.call_count, 0)
                submit_reviewed(**{**evidence("live-other", 2), "protocol": "protocol-b"})
                self.assertEqual(auto_select()["state"], "retained")
                self.assertEqual(selected.call_count, 1)
                with patch.dict(os.environ, {"MAXCORE_AUTO_SELECT": "0"}):
                    self.assertEqual(auto_select()["state"], "disabled")

    def test_unsigned_submission_cannot_change_selection(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(registry, "REGISTRY", Path(folder)):
            inbox = Path(folder) / "selection_requests"
            inbox.mkdir()
            (inbox / "invalid.json").write_text('{"schema":1,"evidence":{}}')
            result = auto_select()
            self.assertEqual(result["state"], "waiting_for_candidate")
            self.assertEqual(result["rejected"], 1)
            self.assertFalse((Path(folder) / "selected.json").exists())

    def test_signed_internal_candidate_is_selected_before_unreviewed_live_runs(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            registry, "REGISTRY", Path(folder) / "registry"
        ):
            review = Path(folder) / "internal-review.json"
            review.write_text(json.dumps({"case_scores": {"case": {
                "coherence": 2, "grounding": 2, "relevance": 2,
            }}}))
            submission = {
                "run": str(Path(folder) / "internal-owner-simulation"),
                "review": str(review),
                "protocol": str(Path(folder) / "protocol"),
                "evaluation": str(Path(folder) / "evaluation"),
                "signature": str(Path(folder) / "signature"),
            }

            def decision(**item):
                return {
                    "eligible": True,
                    "reasons": [],
                    "fingerprints": {
                        "checkpoint_sha256": "verified-internal-checkpoint",
                        "protocol_sha256": "frozen-protocol",
                        "review_sha256": registry.sha256(Path(item["review"])),
                    },
                }

            with patch.object(registry, "eligibility", side_effect=decision), \
                 patch.object(registry, "select_candidate") as select, \
                 patch("ai_model.training.auto_selection._operational_candidate", return_value=True), \
                 patch("ai_model.training.auto_selection._public_selection", return_value={
                     "state": "waiting_for_candidate", "rejected": 1,
                 }):
                submit_reviewed(**submission)
                result = auto_select()

            self.assertEqual(result["state"], "selected")
            self.assertEqual(result["checkpoint_sha256"], "verified-internal-checkpoint")
            self.assertEqual(result["eligibility_policy"], "signed-review-v1")
            self.assertEqual(result["release_source"], "owner_and_simulation")
            self.assertTrue(result["trained_checkpoint_loaded"])
            select.assert_called_once()

    def test_internal_candidate_submission_still_fails_closed_without_signed_eligibility(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            registry, "REGISTRY", Path(folder) / "registry"
        ), patch.object(registry, "eligibility", return_value={
            "eligible": False, "reasons": ["Independent review signature invalid"],
        }):
            review = Path(folder) / "review.json"
            review.write_text(json.dumps({"case_scores": {"case": {
                "coherence": 2, "grounding": 2, "relevance": 2,
            }}}))
            with self.assertRaisesRegex(ValueError, "signature invalid"):
                submit_reviewed(
                    run=str(Path(folder) / "internal-untrusted"),
                    evaluation="evaluation",
                    protocol="protocol",
                    review=str(review),
                    signature="signature",
                )

    def test_invalid_selected_internal_candidate_is_reported_not_retained(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            registry, "REGISTRY", Path(folder) / "registry"
        ):
            registry.safe_registry()
            pointer = registry.REGISTRY / "selected.json"
            pointer.write_text(json.dumps({
                "schema": 1,
                "scope": "candidate-only-not-production",
                "eligibility_policy": "signed-review-v1",
                "evidence": {
                    "run": str(Path(folder) / "internal-stale"),
                    "evaluation": "evaluation",
                    "protocol": "protocol",
                    "review": "review",
                    "signature": "signature",
                },
                "fingerprints": {"checkpoint_sha256": "stale-checkpoint"},
            }))
            with patch.object(registry, "eligibility", return_value={
                "eligible": False, "reasons": ["review trust policy changed"],
                "fingerprints": {},
            }), patch("ai_model.training.auto_selection._public_selection", return_value=None):
                result = auto_select()
            self.assertEqual(result["state"], "waiting_for_candidate")
            self.assertTrue(result["selected_candidate_invalid"])

    def test_registry_validation_error_blocks_selection_and_marks_active_release_invalid(self):
        with patch("ai_model.training.auto_selection._reviewed_selection",
                   side_effect=ValueError("registry contains a symlink")):
            result = auto_select()
        self.assertEqual(result["state"], "blocked_registry")
        self.assertTrue(result["selected_candidate_invalid"])
        self.assertEqual(result["reason"], "reviewed_selection_validation_failed")

    def test_public_path_rejects_traditional_mixed_smoke_and_private_sources(self):
        public = {"provenance_type": "maxcore_live_awareness_observation",
                  "source": "https://news.example/article", "live_provenance": {
                      "observation_set_id": "set", "observed_at": 123}}
        report = {"architecture": "byte-causal-transformer-v1", "training_backend_scope": "manual-digital-v1"}
        cases = [({"smoke_only": True, "records": [public]}, report),
                 ({"smoke_only": False, "records": [public, {"private": True}]}, report),
                 ({"smoke_only": False, "records": [{**public, "private": True}]}, report),
                 ({"smoke_only": False, "records": [{**public, "provenance_type": "authored"}]}, report),
                 ({"smoke_only": False, "records": [{**public, "source": "http://127.0.0.1/private"}]}, report),
                 ({"smoke_only": False, "records": [public]}, {**report, "training_backend_scope": "torch"})]
        for manifest, measured in cases:
            with self.subTest(manifest=manifest), patch.object(registry, "verify_bundle", return_value=({}, measured, manifest)):
                self.assertFalse(registry.public_live_eligibility("/runs/live-test")["eligible"])
        with patch.object(registry, "verify_bundle", side_effect=ValueError("uncertified")):
            self.assertFalse(registry.public_live_eligibility("/runs/live-test")["eligible"])

    def test_new_unusable_candidate_retains_operational_incumbent(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(registry, "REGISTRY", Path(folder) / "registry"):
            registry.safe_registry()
            runs = Path(folder) / "candidate_runs"
            for name in ("live-old", "live-new"):
                (runs / name).mkdir(parents=True)
            def decision(run):
                name = Path(run).name
                return {"eligible": True, "fingerprints": {"run": str(runs / name),
                    "observed_at": 1 if name == "live-old" else 2,
                    "checkpoint_sha256": name}}
            old = decision(runs / "live-old")
            pointer = registry.REGISTRY / "selected.json"
            original = json.dumps({"eligibility_policy": registry.PUBLIC_LIVE_POLICY,
                "evidence": {"run": str(runs / "live-old")}, "fingerprints": old["fingerprints"]})
            pointer.write_text(original)
            with patch.object(registry, "selected_eligibility", return_value=old), \
                 patch.object(registry, "public_live_eligibility", side_effect=decision), \
                 patch("ai_model.training.auto_selection._operational_candidate",
                       side_effect=lambda run, checkpoint: checkpoint == "live-old"), \
                 patch.object(registry, "select_candidate") as select:
                result = auto_select()
            self.assertEqual(result["state"], "retained")
            self.assertEqual(result["rejected"], 1)
            select.assert_not_called()
            self.assertEqual(pointer.read_text(), original)

    def test_durable_root_rejects_relative_or_symlink_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "models"
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": str(root)}):
                self.assertEqual(training_root("/application"), root)
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": "relative"}):
                with self.assertRaises(ValueError): training_root("/application")
            linked = Path(folder) / "link"
            linked.symlink_to(root)
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": str(linked)}):
                with self.assertRaises(ValueError): training_root("/application")
