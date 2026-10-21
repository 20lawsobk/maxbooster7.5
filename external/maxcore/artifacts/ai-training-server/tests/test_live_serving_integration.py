"""Real training and cryptographic selection in a disposable test-only registry.

Test review scores/signatures below exercise verification, not model quality or
production approval. No real source, production pointer or trust policy is used.
"""
import json
import os
import shutil
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
from ai_model.generation.live_serving import LiveLearningLoop, LiveServingModel, LiveModelUnavailable
from ai_model.generation.plan import GenerationPlan, active_plan
from ai_model.model.candidate_model import CandidateModel
from ai_model.training import live_learning, candidate_registry, candidate_lifecycle
from ai_model.training.candidate_manifest_train import train_from_manifest


class LiveServingIntegrationTests(unittest.TestCase):
    def test_observations_train_certify_review_select_and_generate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            training = root / "ai_model/training"
            engine = Engine(sources=sources(), store=MemoryStore(), timeout=1)
            engine.refresh()
            candidates, registry = training / "candidate_runs", training / "candidate_registry"
            commands = subprocess.run

            def worker(command, **kwargs):
                def arg(name):
                    return command[command.index(name) + 1]
                train_from_manifest(arg("--corpus"), arg("--corpus-sha256"),
                                    run_id=arg("--run-id"), steps=int(arg("--steps")),
                                    manual_backward=True, context_tokens=int(arg("--context-tokens")))
                return subprocess.CompletedProcess(command, 0)

            with patch.object(live_learning, "ROOT", root), \
                 patch.object(live_learning, "JOBS", training / "live_learning_runs"), \
                 patch.object(candidate_lifecycle, "CANDIDATES", candidates), \
                 patch.object(candidate_registry, "REGISTRY", registry), \
                 patch("ai_model.awareness.engine.get_engine", return_value=engine), \
                 patch("ai_model.training.auto_selection._public_selection", return_value=None):
                model = LiveServingModel()
                loop = LiveLearningLoop(lambda: engine, model, root / "state",
                                        peak_content=False, interval=60, steps=1, context_tokens=256)
                # Replace only subprocess dispatch so the real worker/trainer
                # runs inside the isolated temporary directories above.
                with patch.object(live_learning.subprocess, "run", side_effect=worker):
                    status = loop.tick()
                self.assertEqual(status["training"], "candidate_trained_unreviewed")
                self.assertFalse(model.available)
                run = candidates / status["last_run_id"]
                verified, report, _ = candidate_registry.verify_bundle(run)
                self.assertEqual(report["context_tokens"], 256)
                self.assertTrue((training / "live_candidate_admissions" / run.name / "certified.json").is_file())
                with self.assertRaises(ValueError):
                    candidate_registry.select_candidate(run=run)

                protocol = root / "protocol.json"
                protocol.write_text(json.dumps({"schema": 1, "frozen": True,
                    "cases": [{"id": "fixture-probe", "prompt": "bronze"}]}))
                candidate = CandidateModel.load_candidate(run / "candidate.pt")
                output = candidate.generate("bronze", max_new_tokens=2)
                evaluation = root / "evaluation.json"
                evaluation.write_text(json.dumps({
                    "checkpoint_sha256": verified["checkpoint_sha256"],
                    "protocol_sha256": candidate_registry.sha256(protocol), "protocol_conformant": True,
                    "records": [{"id": "fixture-probe", "prompt": "bronze", "output": output}],
                }))
                private, public = root / "fixture-private.pem", root / "fixture-public.pem"
                commands(["openssl", "genpkey", "-algorithm", "EC", "-pkeyopt",
                          "ec_paramgen_curve:P-256", "-out", str(private)], check=True, capture_output=True)
                commands(["openssl", "pkey", "-in", str(private), "-pubout", "-out", str(public)],
                         check=True, capture_output=True)
                policy = root / "fixture-trust.json"
                policy.write_text(json.dumps({"require_exclusive_backend": True,
                    "reviewers": {"test-only": {"role": "independent-quality-reviewer",
                        "public_key": str(public), "public_key_sha256": candidate_registry.sha256(public)}}}))
                policy.chmod(0o600)
                review = root / "fixture-review.json"
                review.write_text(json.dumps({"reviewer": "test-only", "decision": "accept",
                    "bindings": {key: verified[key] for key in
                                 ("checkpoint_sha256", "manifest_sha256", "report_sha256")} | {
                                     "evaluation_sha256": candidate_registry.sha256(evaluation),
                                     "protocol_sha256": candidate_registry.sha256(protocol)},
                    "quality_rationale": "Disposable test fixture; no production quality claim.",
                    "safety_rationale": "Disposable test fixture; no production safety approval.",
                    "data_rights_rationale": "Authored fixture observations used only by this test.",
                    "case_scores": {"fixture-probe": {"coherence": 2, "relevance": 2, "grounding": 2}},
                }))
                signature = root / "fixture-review.sig"
                commands(["openssl", "dgst", "-sha256", "-sign", str(private),
                          "-out", str(signature), str(review)], check=True, capture_output=True)
                with patch.dict(os.environ, {"MAXCORE_CANDIDATE_TRUST": str(policy)}):
                    from ai_model.training.auto_selection import submit_reviewed
                    submit_reviewed(run=run, protocol=protocol, evaluation=evaluation,
                                    review=review, signature=signature)
                    self.assertFalse((registry / "selected.json").exists())
                    loop.tick()  # Hot-load even though training is on cooldown.
                    self.assertTrue(model.available)
                    self.assertEqual(model.status()["active"], "reviewed-live-awareness")
                    with model.pin() as selected:
                        plan = GenerationPlan.from_request({"topic": "fixture"}, "text",
                                                           selected["checkpoint_sha256"])
                        token = active_plan.set(plan)
                        try:
                            output = model.generate("bronze", max_new_tokens=2, min_length=0)
                            self.assertIsInstance(output, str)
                            self.assertFalse(output.startswith("bronze"))
                        finally:
                            active_plan.reset(token)
                    # Altered review evidence cannot select or install an update.
                    review.write_text("{}")
                    self.assertFalse(candidate_registry.eligibility(run=run, protocol=protocol,
                        evaluation=evaluation, review=review, signature=signature)["eligible"])
                    previous = model.status()["checkpoint_sha256"]
                    loop.tick()
                    self.assertEqual(model.status()["checkpoint_sha256"], previous)
                    self.assertEqual(loop.status()["release_error"], "ValueError")

    def test_public_observations_train_but_unusable_generation_is_not_selected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            training = root / "ai_model/training"
            candidates, registry = training / "candidate_runs", training / "candidate_registry"
            # More than three 256-byte chunks, so bounded updates must advance
            # beyond the first prefix rather than silently retrain chunk zero.
            long_sources = {}
            for domain, (name, url, fetch) in sources().items():
                def long_fetch(fetch=fetch, domain=domain):
                    rows = fetch()
                    rows[0]["text"] += " " + " ".join(
                        domain + str(index) for index in range(24))
                    return rows
                long_sources[domain] = (name, url, long_fetch)
            engine = Engine(sources=long_sources, store=MemoryStore(), timeout=1)
            engine.refresh()
            def worker(command, **kwargs):
                def arg(name): return command[command.index(name) + 1]
                train_from_manifest(arg("--corpus"), arg("--corpus-sha256"),
                    run_id=arg("--run-id"), steps=int(arg("--steps")), manual_backward=True,
                    context_tokens=int(arg("--context-tokens")))
                return subprocess.CompletedProcess(command, 0)
            with patch.object(live_learning, "ROOT", root), \
                 patch.object(live_learning, "JOBS", training / "live_learning_runs"), \
                 patch.object(candidate_lifecycle, "CANDIDATES", candidates), \
                 patch.object(candidate_registry, "REGISTRY", registry), \
                 patch.dict(os.environ, {"MAXCORE_CANDIDATE_TRUST": ""}), \
                 patch("ai_model.awareness.engine.get_engine", return_value=engine):
                model = LiveServingModel()
                loop = LiveLearningLoop(lambda: engine, model, root / "state",
                                        peak_content=False, interval=60, steps=1, context_tokens=256)
                with patch.object(live_learning.subprocess, "run", side_effect=worker):
                    result = loop.tick()
                self.assertEqual(result["training"], "candidate_trained_unreviewed")
                # A numerical training/logit pass is not an operational script.
                # This intentionally tiny fresh model must not claim readiness.
                self.assertFalse(model.available)
                self.assertFalse(loop.status()["review_required"])
                self.assertEqual(loop.status()["selection"]["state"], "waiting_for_candidate")
                self.assertGreaterEqual(loop.status()["selection"]["rejected"], 1)
                self.assertFalse((registry / "selected.json").exists())
                run = candidates / result["last_run_id"]
                self.assertTrue(candidate_registry.public_live_eligibility(run)["eligible"])
                with self.assertRaises(LiveModelUnavailable):
                    model.generate("fixture")
                # A second certified public observation update continues the
                # first weights even when neither model can yet serve prose.
                from ai_model.training.public_resume import load_public_parent
                def legacy_parent(*args, **kwargs):
                    model, parent = load_public_parent(*args, **kwargs)
                    parent["run"] = str((candidates / parent["run"]).resolve())
                    return model, parent
                with patch.object(live_learning.subprocess, "run", side_effect=worker), \
                     patch("ai_model.training.public_resume.load_public_parent", side_effect=legacy_parent):
                    second = live_learning.execute(engine, peak_content=False, steps=1, context_tokens=256)
                self.assertEqual(second["status"], "candidate_trained_unreviewed")
                next_run = candidates / second["run_id"]
                first_report = json.loads((run / "report.json").read_text())
                next_report = json.loads((next_run / "report.json").read_text())
                self.assertGreater(first_report["corpus_chunks"], 1)
                self.assertEqual(first_report["coverage"]["chunk_indices"], [0])
                self.assertEqual(next_report["coverage"]["chunk_indices"], [1])
                for measured in (first_report, next_report):
                    self.assertEqual(measured["trained_tokens"],
                                     sum(measured["coverage"]["target_counts"]))
                    self.assertGreater(measured["trained_tokens"], 1)
                self.assertEqual(next_report["training_parent"]["checkpoint_sha256"],
                                 first_report["checkpoint_sha256"])
                self.assertEqual(next_report["initial_weights_sha256"],
                                 first_report["final_weights_sha256"])
                self.assertNotEqual(next_report["initial_weights_sha256"],
                                    next_report["final_weights_sha256"])
                self.assertTrue(candidate_registry.public_live_eligibility(next_run)["eligible"])
                with self.assertRaisesRegex(ValueError, "incompatible"):
                    load_public_parent(candidates, 128)
                # Immutable legacy absolute parent references survive full state
                # relocation without consulting or rewriting the old location.
                copied = root / "relocated"
                shutil.copytree(training, copied)
                shutil.rmtree(training)
                candidates = copied / "candidate_runs"
                run, next_run = candidates / run.name, candidates / next_run.name
                self.assertTrue(candidate_registry.public_live_eligibility(next_run)["eligible"])
                _, resumed = load_public_parent(candidates, 256)
                self.assertEqual(resumed["run"], next_run.name)
                self.assertEqual(resumed["coverage_steps"], 2)
                # A third bounded update reaches every remaining tail target.
                # The aggregate includes all targets exactly once, across runs.
                with patch.object(candidate_lifecycle, "CANDIDATES", candidates), \
                     patch.object(live_learning, "training_root", return_value=copied), \
                     patch.object(live_learning, "JOBS", copied / "live_learning_runs"), \
                     patch.object(live_learning.subprocess, "run", side_effect=worker):
                    third = live_learning.execute(
                        engine, peak_content=False, steps=first_report["corpus_chunks"] - 2, context_tokens=256)
                third_run = candidates / third["run_id"]
                third_report = json.loads((third_run / "report.json").read_text())
                self.assertEqual(third_report["coverage"]["chunk_indices"],
                                 list(range(2, third_report["corpus_chunks"])))
                manifest = json.loads((third_run / "corpus.manifest.json").read_text())
                actual_targets = sum(len(row["text"].encode("utf-8")) + 2
                                     for row in manifest["records"]) - 1
                self.assertEqual(sum(item["trained_tokens"] for item in
                                     (first_report, next_report, third_report)), actual_targets)
                decision = candidate_registry.public_live_eligibility(third_run)
                self.assertTrue(decision["eligible"], decision["reasons"])
                original_report = (third_run / "report.json").read_bytes()
                third_report["coverage"]["chunk_indices"] = [0]
                (third_run / "report.json").write_text(json.dumps(third_report))
                self.assertFalse(candidate_registry.public_live_eligibility(third_run)["eligible"])
                (third_run / "report.json").write_bytes(original_report)
                with patch.object(candidate_registry, "REGISTRY", copied / "candidate_registry"):
                    stale = {"eligibility_policy": candidate_registry.PUBLIC_LIVE_POLICY,
                             "evidence": {"run": str(training / "candidate_runs" / next_run.name)}}
                    self.assertFalse(candidate_registry.selected_eligibility(stale)["eligible"])
                for reference in ("../" + run.name, "nested/" + run.name,
                                  str(candidates / ".." / run.name)):
                    with self.subTest(reference=reference), self.assertRaises(ValueError):
                        candidate_registry.resolve_public_run(reference, candidates)
                checkpoint = run / "candidate.pt"
                outside = root / "substituted.pt"
                checkpoint.rename(outside)
                checkpoint.symlink_to(outside)
                self.assertFalse(candidate_registry.public_live_eligibility(next_run)["eligible"])
                checkpoint.unlink()
                outside.rename(checkpoint)
                checkpoint = run / "candidate.pt"
                checkpoint.write_bytes(checkpoint.read_bytes() + b"tampered")
                with self.assertRaisesRegex(ValueError, "no longer public/valid"):
                    load_public_parent(candidates, 256)
                self.assertFalse(candidate_registry.public_live_eligibility(next_run)["eligible"])




if __name__ == "__main__":
    unittest.main()
