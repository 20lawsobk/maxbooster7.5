"""Administrator review annotations are durable but never grant training rights."""
import copy
import unittest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from ai_model.awareness.source_review import (
    REVIEW_NOTE,
    SourceReviewError,
    approve_current_inventory,
    create_router,
    inventory,
)


class ReviewStore:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return copy.deepcopy(self.data.get(key))

    def approve_source_reviews(self, entries):
        document = self.data.setdefault(
            "awareness:v1:admin-source-review", {"schema": 1, "items": {}},
        )
        for item_id, entry in entries.items():
            document["items"].setdefault(item_id, copy.deepcopy(entry))


class ReviewEngine:
    def __init__(self, store=None):
        self.store = store or ReviewStore()
        self.sources = {
            "youtube_music_business": ("music", "https://example.org/feed", lambda: []),
            "platform_discovery_auto_x": ("social", "https://api.exa.ai/search", lambda: []),
        }
        self.records = [{
            "source": "platform_discovery_auto_x",
            "platform": "x",
            "platform_scope": "x",
            "text": "A private snippet must never be returned by this admin inventory.",
            "citation": "https://x.com/artist/status/123",
            "observed_at": 1_800_000_000.0,
            "discovery": {
                "platform": "x",
                "platform_scope": "x",
                "retrieval_method": "index_snippet",
                "source_type": "platform_origin_search_index",
                "reuse_rights": "unknown",
                "training_eligible": False,
            },
        }]

    def discovery_observations(self, limit=500):
        return self.records[:limit]


class SourceReviewTests(unittest.TestCase):
    def test_inventory_lists_adapters_and_discovered_records_as_pending_without_snippets(self):
        engine = ReviewEngine()
        result = inventory(engine)
        self.assertEqual(result["adapter_count"], 2)
        self.assertEqual(result["record_count"], 1)
        self.assertEqual(result["pending_count"], 3)
        self.assertTrue(all(item["needs_to_be_reviewed"] for item in result["adapters"]))
        record = result["records"][0]
        self.assertTrue(record["needs_to_be_reviewed"])
        self.assertFalse(record["training_eligible"])
        self.assertEqual(record["reuse_rights"], "unknown")
        self.assertNotIn("text", record)
        self.assertNotIn("private snippet", repr(result))

    def test_approval_is_read_back_durable_and_does_not_change_rights(self):
        store = ReviewStore()
        first = ReviewEngine(store)
        result = approve_current_inventory(first, "admin-key-identity", now=1_800_000_100.0)
        self.assertEqual(result["approved_count"], 3)
        self.assertEqual(result["inventory"]["pending_count"], 0)
        second_process = ReviewEngine(store)
        restored = inventory(second_process)
        for item in restored["adapters"] + restored["records"]:
            self.assertFalse(item["needs_to_be_reviewed"])
            self.assertEqual(item["note"], REVIEW_NOTE)
            self.assertEqual(item["approver_id"], "admin-key-identity")
            self.assertEqual(item["reviewed_at"], 1_800_000_100.0)
        self.assertFalse(restored["records"][0]["training_eligible"])
        self.assertEqual(restored["records"][0]["reuse_rights"], "unknown")

    def test_new_source_and_record_remain_unreviewed_after_prior_approval(self):
        store = ReviewStore()
        engine = ReviewEngine(store)
        approve_current_inventory(engine, "admin-1", now=1_800_000_100.0)
        engine.sources["new_source"] = ("music", "https://example.org/new", lambda: [])
        engine.records.append({
            **engine.records[0],
            "citation": "https://x.com/artist/status/456",
            "observed_at": 1_800_000_200.0,
        })
        updated = inventory(engine)
        self.assertEqual(updated["pending_count"], 2)
        self.assertTrue(next(
            item for item in updated["adapters"] if item["source_id"] == "new_source"
        )["needs_to_be_reviewed"])
        self.assertTrue(next(
            item for item in updated["records"] if item["citation"].endswith("/456")
        )["needs_to_be_reviewed"])

    def test_admin_route_denies_unauthenticated_calls_and_confirms_durable_approval(self):
        engine = ReviewEngine()

        def require_admin():
            raise HTTPException(status_code=401, detail="Administrator required")

        app = FastAPI()
        app.include_router(create_router(require_admin, lambda: engine))
        client = TestClient(app)
        denied = client.post("/api/awareness/unified/admin/source-review", json={})
        self.assertEqual(denied.status_code, 401)

        app.dependency_overrides[require_admin] = lambda: {"id": "admin-2"}
        approved = client.post("/api/awareness/unified/admin/source-review", json={})
        self.assertEqual(approved.status_code, 200, approved.text)
        body = approved.json()
        self.assertEqual(body["inventory"]["pending_count"], 0)
        self.assertEqual(body["inventory"]["records"][0]["note"], REVIEW_NOTE)

    def test_review_storage_failure_is_not_acknowledged(self):
        engine = ReviewEngine()
        engine.store.approve_source_reviews = lambda _entries: (_ for _ in ()).throw(
            ConnectionError("storage unavailable")
        )
        with self.assertRaisesRegex(SourceReviewError, "source_review_write_unavailable"):
            approve_current_inventory(engine, "admin-3", now=1_800_000_100.0)


if __name__ == "__main__":
    unittest.main()
