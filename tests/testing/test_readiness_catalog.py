import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2] / "scripts/testing/catalog-readiness.py"
spec = importlib.util.spec_from_file_location("readiness_catalog", SOURCE)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class ReadinessCatalog(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "input.json"
        self.output = self.root / "output"
        self.item = {
            "id": "one", "kind": "coverage_gap", "priority": 1,
            "file": "server/example.ts", "case": "unverified behavior",
            "status": "unresolved", "observed": "<script>alert('unsafe')</script>",
            "actions": ["Exercise the real failure path"],
            "requiredEvidence": ["A passing behavioral assertion"],
            "reproduce": {"command": "run the owning suite"}, "evidence": "receipt.json",
        }

    def test_preserves_items_and_input_digest_without_claiming_readiness(self):
        self.source.write_text(json.dumps({"items": [self.item]}))
        original = self.source.read_bytes()
        self.assertEqual(catalog.build_catalog(self.source, self.output), 1)
        result = json.loads((self.output / "readiness-catalog.json").read_text())
        self.assertEqual(result["items"], [self.item])
        self.assertFalse(result["productionReady"])
        self.assertEqual(result["sourceReportSha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(self.source.read_bytes(), original)
        page = (self.output / "readiness-catalog.html").read_text()
        self.assertNotIn(self.item["observed"], page)
        self.assertIn("&lt;script&gt;", page)

    def test_empty_inventory_cannot_imply_success(self):
        self.source.write_text('{"items":[]}')
        with self.assertRaises(ValueError):
            catalog.build_catalog(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_duplicate_ids_cannot_hide_missing_items(self):
        self.source.write_text(json.dumps({"items": [self.item, self.item]}))
        with self.assertRaises(ValueError):
            catalog.build_catalog(self.source, self.output)

    def test_missing_closure_contract_is_rejected(self):
        self.source.write_text(json.dumps({"items": [{**self.item, "requiredEvidence": []}]}))
        with self.assertRaises(ValueError):
            catalog.build_catalog(self.source, self.output)


if __name__ == "__main__":
    unittest.main()
