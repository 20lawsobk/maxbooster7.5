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
                    "evidence": item, "fingerprints": decision(**item)["fingerprints"]}))
            with patch.object(registry, "eligibility", side_effect=decision), \
                 patch.object(registry, "select_candidate", side_effect=select) as selected:
                submit_reviewed(**evidence("live-low", 1))
                submit_reviewed(**evidence("live-best", 2))
                with self.assertRaisesRegex(ValueError, "invalid signature"):
                    submit_reviewed(**evidence("live-invalid", 2))
                self.assertEqual(auto_select()["checkpoint_sha256"], "live-best")
                self.assertEqual(auto_select()["state"], "retained")
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
