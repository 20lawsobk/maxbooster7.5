"""Operator receipts bind test-authored posts; no source permissions are inferred."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from ai_model.awareness.engine import Engine, DOMAINS
from ai_model.awareness.test_engine import MemoryStore
from ai_model.training import live_learning
from ai_model.training.public_curriculum import PEAK_METRIC


class TextTrainingRightsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        sources = {}
        for domain in DOMAINS:
            text = ("An original test-authored " + domain + " rehearsal story opens beside a cobalt lantern. "
                    "Our fictional community welcomes listeners to a newly imagined performance. "
                    "Join the test fixture discussion.")
            def fetch(domain=domain, text=text):
                return [{"text": text, "citation": "https://mastodon.social/@fixture/" + domain,
                         "value": 25, "metric": PEAK_METRIC}]
            sources["mastodon_peak_" + domain] = (domain, "https://mastodon.social/tags/" + domain, fetch)
        self.engine = Engine(sources=sources, store=MemoryStore(), timeout=1)
        self.engine.refresh()
        self.records = live_learning.eligible_records(self.engine.peak_training_observations())[0]
        evidence = b"Test-only author permits training on the exact fixture posts in this manifest."
        (self.root / "grant.txt").write_bytes(evidence)
        self.evidence_sha = hashlib.sha256(evidence).hexdigest()
        self.manifest = {"schema": 1, "policy": "text-source-training-rights-v1", "grants": []}
        for record in self.records:
            provenance = record["live_provenance"]
            self.manifest["grants"].append({
                "source_id": provenance["source"], "domain": provenance["domain"],
                "citation": record["source"], "text_sha256": provenance["text_sha256"],
                "author": "Test fixture author", "license": "CC0-1.0", "purpose": "training",
                "rights": {"training_allowed": True, "rights_holder": "Test fixture author",
                           "attested_by": "Test fixture operator", "license": "CC0-1.0",
                           "attested_at": "2025-01-01T00:00:00Z",
                           "evidence_path": "grant.txt", "evidence_sha256": self.evidence_sha},
            })
        self.path = self.root / "rights.json"
        self.write_manifest()

    def write_manifest(self, manifest=None):
        self.path.write_text(json.dumps(manifest or self.manifest))
        self.path.chmod(0o600)
        self.environment = {
            "MAXCORE_TEXT_TRAINING_RIGHTS_MANIFEST": str(self.path),
            "MAXCORE_TEXT_TRAINING_RIGHTS_SHA256": hashlib.sha256(self.path.read_bytes()).hexdigest(),
        }

    def admit(self, records=None):
        with patch.dict(os.environ, self.environment):
            return live_learning.require_peak_training_rights(self.records if records is None else records)

    def assert_blocked(self, records=None):
        with self.assertRaises(live_learning.Blocked) as raised:
            self.admit(records)
        self.assertEqual(raised.exception.code, "blocked_training_rights")
        self.assertNotIn(str(self.root), str(raised.exception))

    def test_exact_operator_grants_attach_bound_receipts_without_relabeling_awareness(self):
        original = copy.deepcopy(self.records)
        self.admit()
        for before, after in zip(original, self.records):
            receipt = after.pop("training_rights")
            self.assertEqual(after, before)
            self.assertEqual(after["license"], "NOASSERTION")
            self.assertEqual(receipt["status"], "operator_attested")
            self.assertTrue(receipt["admitted_at"].endswith("+00:00"))
            self.assertEqual(receipt["manifest_sha256"], self.environment["MAXCORE_TEXT_TRAINING_RIGHTS_SHA256"])
            self.assertEqual(receipt["grant"]["text_sha256"], after["live_provenance"]["text_sha256"])
            self.assertEqual(receipt["grant"]["rights"]["evidence_sha256"], self.evidence_sha)

    def test_missing_either_operator_configuration_value_cannot_grant_permission(self):
        for omitted in self.environment:
            with self.subTest(omitted=omitted), patch.dict(os.environ, {omitted: ""}):
                configured = {key: value for key, value in self.environment.items() if key != omitted}
                with patch.dict(os.environ, configured):
                    with self.assertRaises(live_learning.Blocked):
                        live_learning.require_peak_training_rights(self.records)

    def test_receipts_supplied_as_record_metadata_are_not_operator_configuration(self):
        records = copy.deepcopy(self.records)
        for record, grant in zip(records, self.manifest["grants"]):
            record["training_rights"] = {"status": "operator_attested", "grant": grant}
        with patch.dict(os.environ, {key: "" for key in self.environment}):
            with self.assertRaises(live_learning.Blocked):
                live_learning.require_peak_training_rights(records)

    def test_manifest_and_evidence_mutations_fail_closed(self):
        for target in (self.path, self.root / "grant.txt"):
            original = target.read_bytes()
            try:
                target.write_bytes(original + b"mutated")
                with self.subTest(target=target.name):
                    self.assert_blocked()
            finally:
                target.write_bytes(original)

    def test_source_domain_citation_and_complete_text_must_match(self):
        changes = {"source_id": "mastodon_peak_other", "domain": "other",
                   "citation": "https://mastodon.social/@another/post", "text_sha256": "0" * 64}
        for key, value in changes.items():
            manifest = copy.deepcopy(self.manifest)
            manifest["grants"][0][key] = value
            self.write_manifest(manifest)
            with self.subTest(field=key):
                self.assert_blocked()
        self.write_manifest()
        changed = copy.deepcopy(self.records)
        changed[0]["text"] += " A changed ending."
        self.assert_blocked(changed)

    def test_permission_license_purpose_and_dated_evidence_are_required(self):
        changes = (("training_allowed", "true"), ("rights_holder", ""),
                   ("attested_by", ""), ("license", "NOASSERTION"),
                   ("attested_at", "2999-01-01T00:00:00Z"),
                   ("attested_at", "2025-01-01"), ("expires_at", "2025-01-02T00:00:00Z"))
        for key, value in changes:
            manifest = copy.deepcopy(self.manifest)
            manifest["grants"][0]["rights"][key] = value
            self.write_manifest(manifest)
            with self.subTest(field=key):
                self.assert_blocked()
        for key, value in (("license", "NOASSERTION"), ("author", ""), ("purpose", "runtime-validation")):
            manifest = copy.deepcopy(self.manifest)
            manifest["grants"][0][key] = value
            self.write_manifest(manifest)
            with self.subTest(field=key):
                self.assert_blocked()

    def test_invalid_batches_never_partially_attach_receipts(self):
        self.manifest["grants"].pop()
        self.write_manifest()
        self.assert_blocked()
        self.assertTrue(all("training_rights" not in row for row in self.records))

    def test_duplicate_grants_and_oversized_manifest_are_refused(self):
        duplicate = copy.deepcopy(self.manifest)
        duplicate["grants"].append(copy.deepcopy(duplicate["grants"][0]))
        self.write_manifest(duplicate)
        self.assert_blocked()
        self.path.write_bytes(b" " * (2_000_001))
        self.environment["MAXCORE_TEXT_TRAINING_RIGHTS_SHA256"] = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.assert_blocked()

    def test_ambiguous_or_excessively_nested_json_fails_closed(self):
        for raw in (b'{"schema":1,"schema":1,"policy":"text-source-training-rights-v1","grants":[]}',
                    b'[' * 2000 + b']' * 2000):
            self.path.write_bytes(raw)
            self.environment["MAXCORE_TEXT_TRAINING_RIGHTS_SHA256"] = hashlib.sha256(raw).hexdigest()
            with self.subTest(payload=raw[:20]):
                self.assert_blocked()

    def test_evidence_cannot_escape_local_directory_or_use_symlinks(self):
        (self.root / "linked.txt").symlink_to(self.root / "grant.txt")
        for relative in ("../grant.txt", "/tmp/grant.txt", "https://example.org/grant", "linked.txt"):
            manifest = copy.deepcopy(self.manifest)
            manifest["grants"][0]["rights"]["evidence_path"] = relative
            self.write_manifest(manifest)
            with self.subTest(path=relative):
                self.assert_blocked()
        self.write_manifest()
        linked = self.root / "linked.json"
        linked.symlink_to(self.path)
        self.environment["MAXCORE_TEXT_TRAINING_RIGHTS_MANIFEST"] = str(linked)
        self.assert_blocked()

    def test_symlink_directories_and_writable_evidence_are_refused(self):
        linked_directory = self.root / "linked-directory"
        linked_directory.symlink_to(self.root, target_is_directory=True)
        self.environment["MAXCORE_TEXT_TRAINING_RIGHTS_MANIFEST"] = str(linked_directory / "rights.json")
        self.assert_blocked()
        self.environment["MAXCORE_TEXT_TRAINING_RIGHTS_MANIFEST"] = str(self.path)
        (self.root / "grant.txt").chmod(0o666)
        self.assert_blocked()

    def test_private_record_is_not_licensed_by_a_matching_public_receipt(self):
        changed = copy.deepcopy(self.records)
        changed[0]["private"] = True
        self.assert_blocked(changed)

    def test_admission_persists_receipts_in_hash_bound_input_without_running_trainer(self):
        with patch.dict(os.environ, {**self.environment, "MAXCORE_MODEL_STATE_DIR": str(self.root)}), \
             patch.object(live_learning, "JOBS", self.root / "live_learning_runs"), \
             patch.object(live_learning.subprocess, "run", return_value=Mock(returncode=1)) as worker:
            result = live_learning.execute(self.engine, 1, context_tokens=128)
        worker.assert_called_once()
        self.assertEqual(result["status"], "failed_training")
        corpus = self.root / "live_learning_runs" / result["run_id"] / "corpus.json"
        self.assertEqual(hashlib.sha256(corpus.read_bytes()).hexdigest(), result["corpus_sha256"])
        document = json.loads(corpus.read_text())
        self.assertTrue(all(row["training_rights"]["status"] == "operator_attested" for row in document["records"]))
        self.assertFalse((self.root / "candidate_runs").exists())
        self.assertFalse((self.root / "candidate_registry/selected.json").exists())


if __name__ == "__main__":
    unittest.main()
