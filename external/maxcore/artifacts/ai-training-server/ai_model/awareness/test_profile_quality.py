import unittest

from ai_model.awareness.engine import Engine
from ai_model.awareness.profile_quality import (
    PROFILE_MATCH_METRIC,
    assess_profile_quality,
    rank_observation_cohort,
    summarize_quality_cohort,
)
from ai_model.platform_optimization import profile_sourcing_quality_policy
from ai_model.awareness.test_engine import MemoryStore


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
        self.assertEqual(self.policy["decisionUnit"], "public_content_observation")
        self.assertEqual(self.policy["rangeScope"], "global_observation_cohort")
        self.assertIs(self.policy["profileSpecificThresholds"], False)
        self.assertIs(self.policy["maximumIsHardLimit"], False)

    def test_quality_assessment_accepts_potential_without_exact_match(self):
        assessment = assess_profile_quality(self.strong, self.policy)
        self.assertTrue(assessment["eligible"])
        self.assertEqual(assessment["qualityBand"], "preferred")
        self.assertFalse(assessment["exactMatchRequired"])
        self.assertEqual(assessment["evidenceCoverage"], 1.0)
        self.assertEqual(assessment["decisionUnit"], "public_content_observation")

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

    def test_global_cohort_range_reports_distribution_without_profile_thresholds(self):
        assessments = [
            assess_profile_quality(
                {factor: 69 for factor in self.policy["weights"]}, self.policy
            ),
            assess_profile_quality(self.strong, self.policy),
            assess_profile_quality(
                {factor: 99 for factor in self.policy["weights"]}, self.policy
            ),
            assess_profile_quality({"freshness": 90}, self.policy),
        ]
        cohort = summarize_quality_cohort(assessments, self.policy)
        self.assertEqual(
            cohort["decision_unit"], "public_content_observation_cohort"
        )
        self.assertFalse(cohort["profile_specific_thresholds"])
        self.assertEqual(cohort["candidate_observations"], 4)
        self.assertEqual(cohort["scored_observations"], 3)
        self.assertEqual(cohort["counts"]["eligible"], 2)
        self.assertEqual(cohort["counts"]["preferred"], 1)
        self.assertEqual(cohort["counts"]["above_preferred"], 1)
        self.assertEqual(cohort["counts"]["below_range"], 1)
        self.assertEqual(cohort["counts"]["insufficient_evidence"], 1)
        self.assertFalse(cohort["quality_range"]["maximum_is_hard_limit"])
        self.assertIsNotNone(cohort["score_distribution"]["median"])

    def test_observation_cohort_ranking_does_not_grade_profile_identity(self):
        cohort = rank_observation_cohort([
            {
                "profile_citation": "https://example.org/profile/shared",
                "post_citation": "https://example.org/post/low",
                "quality_factors": {factor: 69 for factor in self.policy["weights"]},
                "query_relevance_score": 99,
            },
            {
                "profile_citation": "https://example.org/profile/shared",
                "post_citation": "https://example.org/post/high",
                "quality_factors": self.strong,
                "query_relevance_score": 40,
            },
        ], self.policy)
        self.assertEqual(cohort["quality_cohort"]["candidate_observations"], 2)
        self.assertEqual(
            cohort["observations"][0]["post_citation"],
            "https://example.org/post/high",
        )
        self.assertEqual(
            cohort["observations"][0]["quality_assessment"]["decisionUnit"],
            "public_content_observation",
        )

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

    def test_scored_profile_records_reach_snapshot_and_above_95_remains_eligible(self):
        low = {
            "text": "A measured public music post below the quality threshold.",
            "citation": "https://www.youtube.com/watch?v=abcdefghijk",
            "profile_source": True,
            "quality_factors": {factor: 69 for factor in self.policy["weights"]},
        }
        high = {
            "text": "A measured public music profile post with very high match potential.",
            "citation": "https://www.youtube.com/watch?v=lmnopqrstuv",
            "profile_source": True,
            "quality_factors": {factor: 99 for factor in self.policy["weights"]},
            "profile_evidence": {
                "platform": "youtube",
                "profile_citation": "https://www.youtube.com/channel/UC123",
                "public_metrics": {"views": 1200},
            },
        }
        engine = Engine(
            sources={"youtube_profile_fixture": (
                "music", "https://www.youtube.com/feeds/videos.xml",
                lambda: [low, high],
            )},
            store=MemoryStore(),
            timeout=1,
        )

        snapshot = engine.refresh().to_dict()
        records = snapshot["domains"]["music"]
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["citation"], high["citation"])
        self.assertEqual(records[0]["metric"], PROFILE_MATCH_METRIC)
        self.assertEqual(records[0]["value"], 99)
        health = snapshot["source_health"]["youtube_profile_fixture"]
        self.assertEqual(health["profile_candidate_count"], 2)
        self.assertEqual(health["profile_eligible_count"], 1)
        self.assertEqual(
            {candidate["status"] for candidate in health["profile_candidates"]},
            {"below_limit", "eligible"},
        )


class NativeProfileObservatoryTests(unittest.TestCase):
    def test_searches_local_public_index_and_returns_global_quality_cohort(self):
        from ai_model.awareness.profile_observatory import search_profile_sources

        result = search_profile_sources(
            {
                "youtube_feed": {
                    "profile_candidates": [{
                        "source": "youtube_feed",
                        "platform": "youtube",
                        "text": "A classical violin performance",
                        "profile_citation": "https://www.youtube.com/channel/UC123",
                        "post_citation": "https://www.youtube.com/watch?v=abcdefghijk",
                        "status": "insufficient_evidence",
                        "quality_potential_score": None,
                        "missing_metrics": ["creativeQuality", "musicRelevance"],
                    }],
                },
            },
            query="classical violinist",
            platforms=["youtube"],
            platform_status={"youtube": {"status": "public_feed_configured"}},
        )
        self.assertEqual(result["mode"], "native_local_profile_observatory")
        self.assertIsNone(result["external_search_provider"])
        self.assertTrue(result["preview"])
        self.assertEqual(result["benchmark_reference"]["provider"], "Google DeepMind")
        self.assertTrue(result["benchmark_reference"]["metadata_verified"])
        self.assertEqual(result["indexed_observation_count"], 1)
        self.assertEqual(result["matched_observation_count"], 1)
        self.assertEqual(result["quality_cohort"]["scored_observations"], 0)
        observation = result["observations"][0]
        self.assertEqual(observation["decision_unit"], "public_content_observation")
        self.assertEqual(observation["query_relevance_score"], 50)
        self.assertIsNone(observation["quality_potential_score"])

    def test_custom_benchmark_must_be_a_public_youtube_video(self):
        from ai_model.awareness.profile_observatory import search_profile_sources

        with self.assertRaisesRegex(ValueError, "public HTTPS YouTube URL"):
            search_profile_sources(
                {},
                benchmark_reference={
                    "title": "Veo music sample",
                    "url": "https://example.org/video",
                },
            )

    def test_lexically_unrelated_items_are_not_reported_as_matches(self):
        from ai_model.awareness.profile_observatory import search_profile_sources

        result = search_profile_sources(
            {
                "youtube_feed": {
                    "profile_candidates": [{
                        "platform": "youtube",
                        "text": "Electronic dance remix",
                        "profile_citation": "https://www.youtube.com/channel/UC123",
                        "post_citation": "https://www.youtube.com/watch?v=abcdefghijk",
                        "status": "insufficient_evidence",
                        "quality_potential_score": None,
                    }],
                },
            },
            query="classical violinist",
            platforms=["youtube"],
        )
        self.assertEqual(result["status"], "no_text_match")
        self.assertEqual(result["indexed_observation_count"], 1)
        self.assertEqual(result["matched_observation_count"], 0)
        self.assertEqual(result["returned_observation_count"], 0)
        self.assertEqual(
            result["quality_cohort"]["candidate_observations"], 1
        )


if __name__ == "__main__":
    unittest.main()
