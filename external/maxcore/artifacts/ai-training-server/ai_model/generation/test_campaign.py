"""Campaign generation must not substitute the retired template composer."""
import unittest
from unittest.mock import patch

from ai_model.generation.campaign import build_campaign


class CampaignFailClosedTests(unittest.TestCase):
    def test_campaign_reports_unavailable_backend_without_snapshot_gate(self):
        with self.assertRaisesRegex(RuntimeError, "Learned campaign generation unavailable"):
            build_campaign(artist="Artist", title="Release")

    def test_bound_campaign_explicitly_reports_missing_learned_backend(self):
        with patch("ai_model.generation.awareness.require_context", return_value="fixture") as require:
            with self.assertRaisesRegex(RuntimeError, "Learned campaign generation unavailable"):
                build_campaign(artist="Artist", title="Release", platforms=["instagram"])
            require.assert_called_once_with("general", "campaign")


if __name__ == "__main__":
    unittest.main()