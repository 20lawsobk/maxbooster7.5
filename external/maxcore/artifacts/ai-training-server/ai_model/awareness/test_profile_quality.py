import unittest

from ai_model.awareness.engine import Engine
from ai_model.awareness.profile_quality import (
    PROFILE_MATCH_METRIC,
    assess_profile_quality,
)
from ai_model.platform_optimization import profile_sourcing_quality_policy


class ProfileQualityTests(unittest.TestCase):
    def setUp(self):
        self.policy = profile_sourcing_quality_policy()
        self.strong = {
            "creativeQuality": 90,
            "musicRelevance": 88,
            "platformFit": 92,
            "measuredPerformance": 85,
            "freshness": 90,
            "sourceProvenance": 100,
        }

    def test_policy_defines_a_provisional_potential_band_not_exact_similarity(self):
        self.assertEqual(self.policy["minimumEligibleScore"], 70)
        self.assertEqual(self.policy["preferredScoreRange"], {"min": 80, "max": 95})
        self.assertIs(self.policy["exactMatchRequired"], False)
        self.assertEqual(self.policy["calibrationStatus"], "provisional")

    def test_quality_assessment_accepts_potential_without_exact_match(self):
        assessment = assess_profile_quality(self.strong, self.policy)
        self.assertTrue(assessment["eligible"])
        self.assertEqual(assessment["qualityBand"], "preferred")
        self.assertFalse(assessment["exactMatchRequired"])
        self.assertEqual(assessment["evidenceCoverage"], 1.0)

    def test_required_benchmark_factors_and_evidence_coverage_are_mandatory(self):
        assessment = assess_profile_quality(
            {"musicRelevance": 100, "platformFit": 100}, self.policy
        )
        self.assertFalse(assessment["eligible"])
        self.assertEqual(assessment["status"], "insufficient_evidence")
        self.assertIsNone(assessment["qualityPotentialScore"])
        self.assertIn("creativeQuality", assessment["missingRequiredFactors"])

    def test_missing_optional_metrics_are_not_imputed(self):
        factors = {
            "creativeQuality": 90,
            "musicRelevance": 90,
            "platformFit": 90,
            "measuredPerformance": 90,
        }
        assessment = assess_profile_quality(factors, self.policy)
        self.assertTrue(assessment["eligible"])
        self.assertEqual(assessment["evidenceCoverage"], 0.85)
        self.assertEqual(assessment["missingFactors"], ["freshness", "sourceProvenance"])
        self.assertEqual(assessment["status"], "eligible")

    def test_scores_below_floor_are_rejected_and_scores_above_preferred_stay_eligible(self):
        below = {factor: 65 for factor in self.policy["weights"]}
        top = {factor: 99 for factor in self.policy["weights"]}
        self.assertEqual(assess_profile_quality(below, self.policy)["status"], "below_limit")
        above = assess_profile_quality(top, self.policy)
        self.assertTrue(above["eligible"])
        self.assertEqual(above["qualityBand"], "above_preferred")
        self.assertEqual(above["qualityPotentialScore"], 99)

    def test_invalid_measurements_fail_explicitly(self):
        factors = dict(self.strong, creativeQuality=True)
        result = assess_profile_quality(factors, self.policy)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["status"], "invalid_evidence")
        self.assertEqual(result["invalidFactors"], ["creativeQuality"])

    def test_engine_enforces_floor_and_ranks_by_match_potential(self):
        engine = Engine(
            sources={"profile-test": lambda: []},
            store=object(),
        )
        engine._health["profile-test"] = {}
        low_quality = {
            "text": "A complete public music post with sufficient source evidence.",
            "citation": "https://example.org/profile/low/post/1",
            "profile_source": True,
            "quality_factors": {factor: 65 for factor in self.policy["weights"]},
        }
        high_quality = {
            "text": "A complete public music post with sufficient source evidence.",
            "citation": "https://example.org/profile/high/post/1",
            "profile_source": True,
            "quality_factors": self.strong,
        }
        medium_quality = {
            "text": "A complete public music post with sufficient source evidence.",
            "citation": "https://example.org/profile/medium/post/1",
            "profile_source": True,
            "quality_factors": {factor: 82 for factor in self.policy["weights"]},
        }
        def rank(values, inverse=False):
            order = sorted(
                range(len(values)),
                key=lambda index: values[index],
                reverse=not inverse,
            )
            scores = [0.0 for _ in values]
            for position, index in enumerate(order):
                scores[index] = 1.0 - position / max(1, len(order) - 1)
            return scores, order

        normalized = engine._normalize_source_records(
            "profile-test",
            [low_quality, medium_quality, high_quality],
            1_800_000_000,
            rank,
        )
        self.assertEqual(len(normalized), 2)
        self.assertEqual(
            [row["metric"] for row in normalized],
            [PROFILE_MATCH_METRIC, PROFILE_MATCH_METRIC],
        )
        ranked = sorted(normalized, key=lambda row: row["score"], reverse=True)
        self.assertGreater(ranked[0]["value"], ranked[1]["value"])
        self.assertGreaterEqual(
            normalized[1]["value"], self.policy["minimumEligibleScore"]
        )


if __name__ == "__main__":
    unittest.main()
