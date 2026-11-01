import json
import math

import pytest

from ai_model.native_analysis.website import analyze_website_html


ARTICLE_HTML = """<!doctype html>
<html lang="en">
<head>
  <title>River Restoration Field Notes</title>
  <meta name="description" content="Measurements from a community river survey.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="/field-notes">
  <style>.secret { display:none }</style>
  <script>window.noise = "terrible terrible Buy now";</script>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Article","headline":"River Restoration Field Notes"}
  </script>
</head>
<body>
  <!-- invisible comment noise -->
  <header><h1>River Restoration Field Notes</h1></header>
  <main>
    <p>Volunteers measured clear water at three sites. The work was not easy.</p>
    <img src="/media/river.jpg" alt="Volunteers sampling river water" width="1200" height="800">
    <a href="/methods">Read the survey methods</a>
    <a href="https://github.com/river-lab/project">Source data</a>
    <form action="/newsletter" method="post">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" required>
      <button type="submit">Subscribe</button>
    </form>
  </main>
</body>
</html>"""


def _assert_finite(value):
    if isinstance(value, dict):
        for child in value.values():
            _assert_finite(child)
    elif isinstance(value, list):
        for child in value:
            _assert_finite(child)
    elif isinstance(value, float):
        assert math.isfinite(value)


def test_extracts_actual_document_semantics_and_resolves_urls():
    result = analyze_website_html(ARTICLE_HTML, "https://river.example/reports/2025")
    analysis = result["analysis"]

    assert result["kind"] == "website"
    assert analysis["document"]["title"] == "River Restoration Field Notes"
    assert analysis["document"]["canonical_urls"] == ["https://river.example/field-notes"]
    assert analysis["document"]["meta_descriptions"] == [
        "Measurements from a community river survey."
    ]
    assert analysis["document"]["headings"] == [
        {"level": 1, "text": "River Restoration Field Notes"}
    ]
    assert analysis["link_counts_by_kind"] == {"external": 1, "internal": 1}
    assert analysis["links"][0]["resolved_url"] == "https://river.example/methods"
    assert analysis["social_links"] == [
        {
            "platform_domain": "github.com",
            "url": "https://github.com/river-lab/project",
            "text": "Source data",
        }
    ]
    assert analysis["images"][0]["alt"] == "Volunteers sampling river water"
    assert analysis["forms"][0]["resolved_action"] == "https://river.example/newsletter"
    assert analysis["labels"] == [{"for": "email", "text": "Email address"}]
    assert analysis["buttons"][0]["text"] == "Subscribe"
    assert analysis["structured_data"][0]["valid"] is True
    assert analysis["issues"] == []
    _assert_finite(result)


def test_visible_text_ignores_script_style_template_and_comments():
    html = """<html><head><title>Actual page</title>
      <style>fake style words</style><script>fake script words</script></head>
      <body><h1>Observed heading</h1><!-- fake comment -->
      <template>fake template words</template><p>Visible cedar forest.</p></body></html>"""
    visible = analyze_website_html(html, "https://example.test/")["analysis"]["visible_text"]

    assert "Observed heading" in visible
    assert "Visible cedar forest" in visible
    assert "fake" not in visible


def test_link_kinds_and_evidence_backed_issues():
    html = """<html><body>
      <img src="cover.png">
      <a href="/empty"><img src="dot.png" alt=""></a>
      <a href="#details">Details</a>
      <a href="mailto:editor@example.test">Email</a>
      <form><input id="phone" type="tel"></form>
      <script type="application/ld+json">{"value": NaN}</script>
    </body></html>"""
    analysis = analyze_website_html(html, "https://example.test/base")["analysis"]

    assert analysis["link_counts_by_kind"] == {
        "fragment": 1,
        "internal": 1,
        "mailto": 1,
    }
    codes = {issue["code"] for issue in analysis["issues"]}
    assert {
        "missing_title",
        "missing_meta_description",
        "missing_h1",
        "missing_mobile_viewport",
        "images_missing_alt_attribute",
        "links_without_accessible_text",
        "form_controls_without_observed_label",
        "invalid_json_ld",
    }.issubset(codes)
    assert analysis["structured_data"][0]["valid"] is False
    json.dumps(analysis, allow_nan=False)


def test_malformed_html_and_empty_document_return_finite_envelopes():
    malformed = "<html><body><h1>Open heading<p>Café text<script>ignored"
    for html in ("", malformed):
        result = analyze_website_html(html, "https://example.test/")
        assert result["schema_version"] == 1
        json.dumps(result, allow_nan=False)
        _assert_finite(result)


def test_non_string_arguments_are_rejected_without_network_fallback():
    with pytest.raises(TypeError, match="html must be a string"):
        analyze_website_html(None, "https://example.test/")
    with pytest.raises(TypeError, match="final_url must be a string"):
        analyze_website_html("<p>text</p>", None)