"""Actual bounded public-content training; fixtures never claim model quality."""
import hashlib
import json
import os
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import torch

from ai_model.awareness.engine import Engine, DOMAINS
from ai_model.awareness.test_engine import MemoryStore
from ai_model.generation.live_serving import LiveLearningLoop, LiveServingModel
from ai_model.model.candidate_serving import create_candidate_adapter
from ai_model.generation.capability import verify_text_capability
from ai_model.training import candidate_registry as registry, candidate_lifecycle as lifecycle, live_learning
from ai_model.training.public_curriculum import PEAK_METRIC, PEAK_POLICY, peak_stream, training_texts
from ai_model.training.public_resume import load_public_parent
from test_generation_route_bindings import snapshot

CONFIG = {"width": 128, "layers": 2, "heads": 4, "expansion": 2}


def peak_engine():
    sources = {}
    for domain in DOMAINS:
        text = ("Public " + domain + " music creator marketing art discussion shares useful ideas. "
                "The community responds to the complete original message with thoughtful comments. "
                "Listen to the public discussion and share your own experience.")
        def fetch(domain=domain, text=text):
            return [{"text": text, "citation": "https://mastodon.social/@fixture/" + domain,
                     "value": 25, "metric": PEAK_METRIC}]
        sources["mastodon_peak_" + domain] = (domain, "https://mastodon.social/tags/" + domain, fetch)
    engine = Engine(sources=sources, store=MemoryStore(), timeout=1)
    engine.refresh()
    return engine


class PublicPeakCurriculumTests(unittest.TestCase):
    def test_real_isolated_v2_updates_resume_weights_optimizer_and_cursor(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidates = root / "candidate_runs"
            with patch.dict(os.environ, {"MAXCORE_MODEL_STATE_DIR": str(root),
                                        "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"}), \
                 patch.object(lifecycle, "CANDIDATES", candidates), \
                 patch.object(registry, "REGISTRY", root / "candidate_registry"), \
                 patch.object(live_learning, "JOBS", root / "live_learning_runs"):
                engine = peak_engine()
                self.assertEqual(engine.peak_training_observations()["policy"], PEAK_POLICY)
                # These strings are authored by this test, not fetched posts.
                # Inject only the fixture ownership decision; production has no
                # environment switch or source-level license grant bypass.
                owned_hashes = {hashlib.sha256(row["text"].encode()).hexdigest()
                                for row in engine.peak_training_observations()["records"]}
                def owned_fixture_rights(records):
                    self.assertTrue(records)
                    self.assertTrue(all(hashlib.sha256(row["text"].encode()).hexdigest()
                                        in owned_hashes for row in records))
                with patch.object(live_learning, "require_peak_training_rights",
                                  side_effect=owned_fixture_rights):
                    first = live_learning.execute(engine, 1, context_tokens=128, model_config=CONFIG)
                    self.assertEqual(first["status"], "candidate_trained_unreviewed",
                                     (root / "live_learning_runs" / first["run_id"] / "worker.log").read_text())
                    second = live_learning.execute(engine, 1, context_tokens=128, model_config=CONFIG)
                    self.assertEqual(second["status"], "candidate_trained_unreviewed")
                one, two = (candidates / item["run_id"] for item in (first, second))
                reports = [json.loads((run / "report.json").read_text()) for run in (one, two)]
                self.assertEqual(reports[0]["learning_stream"], peak_stream(CONFIG))
                self.assertGreater(reports[0]["curriculum"]["derived_stage_records"], 0)
                self.assertEqual(reports[1]["initial_weights_sha256"], reports[0]["final_weights_sha256"])
                self.assertEqual(reports[1]["initial_optimizer_sha256"], reports[0]["optimizer_sha256"])
                self.assertEqual(reports[1]["coverage"]["start_step"], reports[0]["coverage"]["end_step"])
                data = torch.load(two / "candidate.pt", weights_only=True, map_location="cpu")
                self.assertEqual(data["optimizer_state"]["step"], 2)
                decision = registry.public_live_eligibility(two)
                self.assertTrue(decision["eligible"], decision["reasons"])
                adapter = create_candidate_adapter(two, runtime_only=True,
                    require_exclusive_backend=True, require_exclusive_training=True)
                with self.assertRaises(ValueError):
                    verify_text_capability(adapter, snapshot=snapshot("trained-v2-capability"))
                self.assertFalse((root / "candidate_registry/selected.json").exists())
                with self.assertRaisesRegex(ValueError, "migration"):
                    load_public_parent(candidates, 128, learning_stream=peak_stream({**CONFIG, "layers": 3}))
                # Public context/chart lineage must not become the v2 parent.
                model, parent = load_public_parent(candidates, 128)
                self.assertIsNone(model)
                self.assertIsNone(parent)
                (two / "candidate.pt").write_bytes((two / "candidate.pt").read_bytes() + b"tampered")
                with self.assertRaisesRegex(ValueError, "no longer public/valid"):
                    load_public_parent(candidates, 128, learning_stream=peak_stream(CONFIG))

    def test_unknown_rights_peak_posts_block_before_worker_and_preserve_awareness(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = peak_engine()
            snapshot_before = engine.require_snapshot().id
            protected_before = lifecycle.protected_hashes()
            with patch.object(live_learning, "JOBS", root / "live_learning_runs"), \
                 patch.object(live_learning, "candidate_path", lambda run: root / "candidate_runs" / run), \
                 patch.object(live_learning, "admission_path", lambda run: root / "admissions" / run), \
                 patch.object(live_learning.subprocess, "run") as worker:
                with self.assertRaises(live_learning.Blocked) as raised:
                    live_learning.execute(engine, 1, context_tokens=128, model_config=CONFIG)
            self.assertEqual(raised.exception.code, "blocked_training_rights")
            self.assertEqual(raised.exception.status, 409)
            worker.assert_not_called()
            self.assertFalse((root / "candidate_runs").exists())
            self.assertFalse((root / "admissions").exists())
            self.assertEqual([p.name for p in (root / "live_learning_runs").iterdir()], [".lock"])
            self.assertEqual(lifecycle.protected_hashes(), protected_before)
            self.assertEqual(engine.require_snapshot().id, snapshot_before)
            self.assertTrue(engine.peak_training_observations()["records"])

    def test_legacy_mode_cannot_train_unknown_rights_raw_peak_posts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = peak_engine()
            snapshot_before = engine.require_snapshot().id
            protected_before = lifecycle.protected_hashes()
            with patch.object(live_learning, "JOBS", root / "live_learning_runs"), \
                 patch.object(live_learning, "candidate_path", lambda run: root / "candidate_runs" / run), \
                 patch.object(live_learning, "admission_path", lambda run: root / "admissions" / run), \
                 patch.object(live_learning.subprocess, "run") as worker:
                with self.assertRaises(live_learning.Blocked) as raised:
                    live_learning.execute(engine, 1, context_tokens=128, peak_content=False)
            self.assertEqual(raised.exception.code, "blocked_training_rights")
            worker.assert_not_called()
            self.assertFalse((root / "candidate_runs").exists())
            self.assertFalse((root / "admissions").exists())
            self.assertEqual([p.name for p in (root / "live_learning_runs").iterdir()], [".lock"])
            self.assertEqual(lifecycle.protected_hashes(), protected_before)
            self.assertEqual(engine.require_snapshot().id, snapshot_before)

    def test_peak_training_rights_never_infer_license_from_public_metadata(self):
        owned = {"text": "Test-authored corpus material", "license": "CC0-1.0",
                 "author": "Test fixture author", "private": False,
                 "source": "authored:test-fixture", "purpose": "training"}
        live_learning.require_peak_training_rights([owned])
        for change in ({"license": "NOASSERTION", "live_provenance": {"access": "public"}},
                       {"author": "unattributed live observation"}, {"private": True},
                       {"source": ""}):
            with self.assertRaises(live_learning.Blocked):
                live_learning.require_peak_training_rights([{**owned, **change}])

    def test_explicit_owned_licensed_manifest_still_trains_real_weights(self):
        from ai_model.training.candidate_manifest_train import train_from_manifest
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corpus, holdout = root / "corpus.json", root / "holdout.json"
            # Original fixture prose with an explicit test-author license; no
            # real site's post, author, metrics or reuse permission is inferred.
            corpus.write_text(json.dumps({"schema": 1, "records": [{
                "text": "A cobalt lantern glowed beside the fictional rehearsal desk.",
                "license": "CC0-1.0", "private": False, "author": "Test fixture author",
                "source": "authored:owned-license-test", "purpose": "training"}]}))
            holdout.write_text(json.dumps({"schema": 1, "frozen": True, "cases": [{
                "id": "separate-owned-holdout", "prompt": "A copper kite"}]}))
            digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
            with patch.object(lifecycle, "CANDIDATES", root / "candidate_runs"):
                report = train_from_manifest(corpus, digest(corpus), holdout, digest(holdout),
                                             "owned-license-test", steps=1, manual_backward=True)
            self.assertFalse(report["smoke_only"])
            self.assertGreater(report["gemm_backward_calls"], 0)
            self.assertTrue(report["changed_parameters"])
            self.assertFalse(report["promotion"]["eligible"])
            self.assertFalse(report["promotion"]["promotion_performed"])
            self.assertTrue((root / "candidate_runs/owned-license-test/candidate.pt").is_file())

    def test_stage_supervision_preserves_exact_words_and_requires_real_cta(self):
        text = "A new public music performance opens tonight! Our community welcomes all listeners. Join the discussion."
        no_cta = "A public music discussion opens tonight. The community welcomes listeners. This is a statement."
        texts, evidence = training_texts([{"text": text}, {"text": no_cta}])
        self.assertEqual(texts[:2], [text, no_cta])
        self.assertEqual(evidence["derived_stage_records"], 1)
        self.assertEqual(re.sub(r"<STAGE_(?:HOOK|BODY|CTA)>", "", texts[2]), text)
        self.assertIn("<STAGE_CTA>Join the discussion.", texts[2])
        self.assertNotIn("<PLATFORM_", texts[2])
        self.assertNotIn("<GOAL_", texts[2])

    def test_bootstrap_replays_fresh_content_with_durable_budget_then_changed_only(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [1000]
            engine = peak_engine()
            model = LiveServingModel()
            trainer = Mock(return_value={"status": "candidate_trained_unreviewed", "run_id": "live-fixture"})
            loader = Mock(return_value=(None, {}))
            def loop():
                return LiveLearningLoop(lambda: engine, model, Path(directory),
                    clock=lambda: now[0], trainer=trainer, loader=loader,
                    model_config=CONFIG, bootstrap_cooldown=30, bootstrap_max_runs=2,
                    bootstrap_window=300, bootstrap_steps=3, interval=60)
            self.assertEqual(loop().tick()["training"], "candidate_trained_unreviewed")
            now[0] += 31
            self.assertEqual(loop().tick()["training"], "candidate_trained_unreviewed")
            self.assertEqual(trainer.call_count, 2)
            self.assertEqual(trainer.call_args.args[1], 3)
            now[0] += 31
            self.assertEqual(loop().tick()["training"], "bootstrap_budget_cooldown")
            self.assertEqual(trainer.call_count, 2)
            now[0] = 1301
            self.assertEqual(loop().tick()["training"], "candidate_trained_unreviewed")
            self.assertEqual(trainer.call_count, 3)
            adapter = Mock(runtime_only=False, inference_backend_exclusive=True)
            loader.return_value = (adapter, {"checkpoint_sha256": "fixture-capability-installed-by-test"})
            now[0] += 61
            self.assertEqual(loop().tick()["training"], "unchanged_observations")
            self.assertEqual(trainer.call_count, 3)
            self.assertNotIn('"text"', (Path(directory) / "live-learning.json").read_text())

    def test_missing_peak_content_never_falls_back_to_context(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = Mock()
            engine.peak_training_observations.side_effect = RuntimeError("unavailable")
            trainer = Mock()
            loop = LiveLearningLoop(lambda: engine, LiveServingModel(), Path(directory),
                trainer=trainer, loader=lambda _: (None, {}), model_config=CONFIG)
            self.assertEqual(loop.tick()["training"], "waiting_for_public_peak_content")
            engine.training_observations.assert_not_called()
            trainer.assert_not_called()

    def test_refresh_reuses_validated_peak_adapter_without_reloading_probes(self):
        with tempfile.TemporaryDirectory() as directory:
            model = LiveServingModel()
            model.install(Mock(runtime_only=False, inference_backend_exclusive=True),
                          {"checkpoint_sha256": "same-verified-checkpoint"})
            loop = LiveLearningLoop(peak_engine, model, Path(directory), model_config=CONFIG)
            selected = {"state": "retained", "checkpoint_sha256": "same-verified-checkpoint",
                        "learning_policy": PEAK_POLICY, "validated_selected": True}
            with patch("ai_model.training.auto_selection.auto_select", return_value=selected), \
                 patch("ai_model.generation.release.load_selected_release") as reload_release:
                loop._refresh_release()
                loop._refresh_release()
            reload_release.assert_not_called()
            self.assertTrue(model.available)

    def test_waiting_peak_selector_does_not_load_old_context_pointer(self):
        with tempfile.TemporaryDirectory() as directory:
            model = LiveServingModel()
            loop = LiveLearningLoop(peak_engine, model, Path(directory), model_config=CONFIG)
            with patch("ai_model.training.auto_selection.auto_select", return_value={"state": "waiting_for_candidate"}), \
                 patch("ai_model.generation.release.load_selected_release") as reload_release:
                loop._refresh_release()
            reload_release.assert_not_called()
            self.assertFalse(model.available)

    def test_iterative_ancestry_exceeds_128_and_rejects_cycles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index in range(160):
                run = root / ("live-" + str(index))
                run.mkdir()
                parent = None if not index else {"run": "live-" + str(index - 1)}
                (run / "report.json").write_text(json.dumps({"training_parent": parent}))
            visited = []
            @registry._bounded_public_ancestry
            def verify(run):
                visited.append(run.name)
                report = json.loads((run / "report.json").read_text())
                if report["training_parent"]:
                    self.assertTrue(verify(root / report["training_parent"]["run"])["eligible"])
                return {"eligible": True, "fingerprints": {}, "reasons": []}
            self.assertTrue(verify(root / "live-159")["eligible"])
            self.assertEqual(len(visited), 160)
            (root / "live-0/report.json").write_text(json.dumps({"training_parent": {"run": "live-159"}}))
            self.assertFalse(verify(root / "live-159")["eligible"])


if __name__ == "__main__":
    unittest.main()
