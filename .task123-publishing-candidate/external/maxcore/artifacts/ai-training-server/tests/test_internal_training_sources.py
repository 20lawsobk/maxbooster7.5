import hashlib
import os
import unittest
from unittest.mock import patch

from ai_model.training import internal_training_sources as sources
from ai_model.training.candidate_corpus import build_manifest
from ai_model.training.live_learning import eligible_internal_bundle
from ai_model.training.rights_receipts import verify_training_record
from workers.admin_flywheel import _owner_training_records


class MemoryStorage:
    is_available = True
    _local_canonical = True

    def __init__(self):
        self.values = {}
        self.lists = {}
        self.failed_key = None

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        if self.failed_key == key:
            return False
        self.values[key] = value
        return True

    def lrange(self, key, start, stop):
        rows = self.lists.get(key, [])
        return rows[start:stop + 1 if stop >= 0 else None]


class InternalTrainingSourcesTests(unittest.TestCase):
    def setUp(self):
        self.key_patch = patch.dict(os.environ, {"AI_SERVER_KEY": "unit-test-receipt-key"})
        self.key_patch.start()
        self.addCleanup(self.key_patch.stop)
        self.storage = MemoryStorage()

    def test_generates_full_dual_track_ten_year_cycle_and_advances_rolling_state(self):
        first = sources.collect_internal_training_bundle(self.storage, now=120)
        self.assertEqual(first["source_status"]["simulation_horizon_days_per_track"], 3650)
        self.assertEqual(first["source_status"]["baseline_records_generated"], 3650)
        self.assertEqual(first["source_status"]["rolling_records_generated"], 3650)
        self.assertEqual(first["source_status"]["simulation_cycle"], 1)

        segment1 = sources._decode_segment(self.storage.get(sources._segment_key(1)))
        self.assertEqual(len(segment1["tracks"]["baseline"]), 3650)
        self.assertEqual(len(segment1["tracks"]["rolling"]), 3650)
        self.assertTrue(sources.verify_simulation_segment(segment1))
        self.assertTrue(all(verify_training_record(row) for row in first["records"]))

        # Repeated polling within the same minute reuses the immutable segment.
        same_minute = sources.collect_internal_training_bundle(self.storage, now=150)
        self.assertEqual(same_minute["id"], first["id"])
        self.assertEqual(self.storage.get(sources.STATE_KEY)["cycle"], 1)

        second = sources.collect_internal_training_bundle(self.storage, now=180)
        segment2 = sources._decode_segment(self.storage.get(sources._segment_key(2)))
        self.assertEqual(second["source_status"]["simulation_cycle"], 2)
        self.assertEqual(
            len(segment1["tracks"]["baseline"]),
            3650,
        )
        self.assertEqual(segment2["tracks"]["baseline"], [])
        self.assertEqual(segment2["baseline_reference_cycle"], 1)
        self.assertNotEqual(segment1["tracks"]["rolling"], segment2["tracks"]["rolling"])
        self.assertEqual(len(second["holdout"]["cases"]), 16)

    def test_owner_content_requires_owner_admin_and_excludes_awareness_mixtures(self):
        payload = {
            "source": "ai_model",
            "hook": "An original owner-authored music campaign hook",
            "body": "A distinct owner-authored campaign narrative",
            "cta": "Listen now",
        }
        records = _owner_training_records(
            "scripts", payload, {}, "env-admin", owner_admin=True
        )
        self.assertEqual(len(records), 2)
        self.assertTrue(all(verify_training_record(record) for record in records))
        self.assertEqual(
            _owner_training_records(
                "scripts", payload, {}, "ordinary-admin", owner_admin=True
            ),
            [],
        )
        self.assertEqual(
            _owner_training_records(
                "scripts", payload, {"awareness": {"source": "third-party"}},
                "env-admin", owner_admin=True,
            ),
            [],
        )
        self.assertEqual(
            _owner_training_records(
                "social", {"variants": [{"caption": "Owner text with URL source"}],
                           "input_resolution": {"url": "https://example.test/post"}},
                {}, "env-admin", owner_admin=True,
            ),
            [],
        )
        self.assertEqual(_owner_training_records(
            "scripts", payload, {}, "env-admin", owner_admin=False
        ), [])

    def test_internal_bundle_and_candidate_manifest_reject_tampering(self):
        bundle = sources.collect_internal_training_bundle(self.storage, now=240)
        records, holdout = eligible_internal_bundle(bundle)
        self.assertTrue(records)
        self.assertEqual(len(holdout), 32)
        manifest = build_manifest(records, holdout, smoke_only=False)
        self.assertFalse(manifest["smoke_only"])
        self.assertTrue(manifest["records"])

        damaged = dict(records[0])
        damaged["text"] += " tampered"
        self.assertFalse(verify_training_record(damaged))
        broken = dict(bundle)
        broken["records"] = [damaged, *records[1:]]
        with self.assertRaises(Exception):
            eligible_internal_bundle(broken)

    def test_corrupt_or_unacknowledged_segment_is_never_accepted(self):
        self.storage.failed_key = sources._segment_key(1)
        with self.assertRaisesRegex(RuntimeError, "not durably acknowledged"):
            sources.collect_internal_training_bundle(self.storage, now=300)
        self.assertNotIn(sources.STATE_KEY, self.storage.values)

        self.storage.failed_key = None
        sources.collect_internal_training_bundle(self.storage, now=300)
        key = sources._segment_key(1)
        encoded = self.storage.values[key]
        self.storage.values[key] = encoded[:-1] + ("A" if encoded[-1] != "A" else "B")
        with self.assertRaisesRegex(RuntimeError, "segment is unavailable"):
            sources.collect_internal_training_bundle(self.storage, now=301)

    def test_storage_authority_reports_bucket_backed_pdim_when_enabled(self):
        with patch.dict(os.environ, {"PDIM_PERSISTENCE": "app-storage"}):
            bundle = sources.collect_internal_training_bundle(self.storage, now=360)
        self.assertEqual(
            bundle["source_status"]["storage_authority"],
            "canonical_pdim_app_storage_generation_fenced_readback_verified",
        )


if __name__ == "__main__":
    unittest.main()
