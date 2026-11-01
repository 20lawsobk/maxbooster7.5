import json
import math

import pytest

from ai_model.native_analysis.text import analyze_text


def _assert_finite(value):
    if isinstance(value, dict):
        for child in value.values():
            _assert_finite(child)
    elif isinstance(value, list):
        for child in value:
            _assert_finite(child)
    elif isinstance(value, float):
        assert math.isfinite(value)


def test_counts_unicode_paragraphs_and_observed_tokens():
    text = (
        "Café teams make clear, useful release notes. Visit https://example.org/notes "
        "and ask @Zoë about #MusicTech.\n\n"
        "Get started today! Café teams make reliable tools."
    )
    result = analyze_text(text)

    assert result["schema_version"] == 1
    assert result["source"] == "maxcore_native_analysis"
    assert result["kind"] == "text"
    assert result["analysis"]["counts"] == {
        "characters": len(text),
        "characters_without_whitespace": sum(not char.isspace() for char in text),
        "words": 25,
        "unique_words_casefolded": 21,
        "sentences": 4,
        "paragraphs": 2,
    }
    assert {"term": "café", "count": 2} in result["analysis"]["top_keywords"]
    observed = result["analysis"]["observed_tokens"]
    assert observed["urls"][0]["token"] == "https://example.org/notes"
    assert observed["hashtags"] == [{"token": "#MusicTech", "count": 1}]
    assert observed["mentions"] == [{"token": "@Zoë", "count": 1}]
    assert observed["cta_phrases"][0]["phrase"] == "get started"
    assert "confidence" not in json.dumps(result).casefold()
    _assert_finite(result)


def test_negation_is_auditable_and_inverts_lexical_match():
    result = analyze_text(
        "The guide is good, but the setup is not reliable. "
        "The repair was not bad and the screen is never clear."
    )
    sentiment = result["analysis"]["lexical_sentiment"]

    assert sentiment["positive_matches"] == 2  # good, not bad
    assert sentiment["negative_matches"] == 2  # not reliable, never clear
    evidence = {item["token"].casefold(): item for item in sentiment["matched_evidence"]}
    assert evidence["reliable"]["effective_polarity"] == "negative"
    assert evidence["bad"]["effective_polarity"] == "positive"
    assert evidence["clear"]["negator"] == "never"
    assert sentiment["net_matches"] == 0
    assert sentiment["normalized_net"] == 0.0


def test_empty_text_has_explicit_non_applicable_readability():
    result = analyze_text("")
    assert result["analysis"]["counts"]["words"] == 0
    assert result["analysis"]["counts"]["sentences"] == 0
    assert result["analysis"]["counts"]["paragraphs"] == 0
    assert result["analysis"]["readability"]["applicable"] is False
    assert result["analysis"]["top_keywords"] == []
    assert result["analysis"]["lexical_sentiment"]["matched_evidence"] == []


def test_repeated_content_changes_keyword_and_ngram_measurements():
    first = analyze_text("Orchards need rain. Orchards shelter birds.")
    second = analyze_text("Harbors need tides. Harbors shelter boats.")

    assert first["analysis"]["top_keywords"][0] == {"term": "orchards", "count": 2}
    assert second["analysis"]["top_keywords"][0] == {"term": "harbors", "count": 2}
    assert first["analysis"]["top_bigrams"] != second["analysis"]["top_bigrams"]


def test_non_string_is_rejected_instead_of_coerced():
    with pytest.raises(TypeError, match="text must be a string"):
        analyze_text(None)