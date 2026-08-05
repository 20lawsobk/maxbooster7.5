"""
Instruction-leak guard tests
============================
Verify that numbered-line and colon-section instruction formats — including
prefaced schemas like "For launch day: 1. Hook… 2. Body… 3. CTA…" — are
blocked from leaking verbatim into user-facing hook copy, while genuine
narrative content and plain prose directives still produce usable output.

These tests run without a live server; they exercise pure-Python helpers
directly:
  - ``_narrative_clause`` / ``_strip_instruction_leadin`` from request_intelligence
  - ``_is_content_signal`` from script_agent
  - ``awareness_from_direction`` from request_intelligence

Runs as both ``pytest tests/test_instruction_leak_guard.py`` and a standalone
``python tests/test_instruction_leak_guard.py`` script.
"""
from __future__ import annotations

import sys
import os

# Make the ai_model package importable from the test directory.
_SERVER_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _SERVER_ROOT not in sys.path:
    sys.path.insert(0, _SERVER_ROOT)

from ai_model.request_intelligence import (
    _narrative_clause,
    _strip_instruction_leadin,
    awareness_from_direction,
)
from ai_model.agents.script_agent import _is_content_signal


# ---------------------------------------------------------------------------
# 1. Numbered-line instruction formats → _narrative_clause returns ""
# ---------------------------------------------------------------------------

def test_line_n_format():
    """'Line N:' directives return "" — the original bug trigger."""
    result = _narrative_clause(
        "Write exactly 3 lines. Line 1: attention hook. Line 2: value. Line 3: CTA."
    )
    assert result == "", f"expected '' got {result!r}"


def test_step_n_format():
    """'Step N:' directives return ""."""
    result = _narrative_clause(
        "Step 1: open with a hook. Step 2: describe the track. Step 3: CTA."
    )
    assert result == "", f"expected '' got {result!r}"


def test_part_n_format():
    """'Part N:' directives return ""."""
    result = _narrative_clause("Part 1: intro. Part 2: body. Part 3: closing CTA.")
    assert result == "", f"expected '' got {result!r}"


def test_numbered_list_with_period():
    """'1. Hook:' numbered-list format returns ""."""
    result = _narrative_clause(
        "1. Hook: grab attention.\n2. Body: describe the record.\n3. CTA: stream now."
    )
    assert result == "", f"expected '' got {result!r}"


def test_numbered_list_with_paren():
    """'1) Hook:' numbered-list format returns ""."""
    result = _narrative_clause(
        "1) Hook: stop the scroll\n2) Body: tell the story\n3) CTA: link in bio"
    )
    assert result == "", f"expected '' got {result!r}"


def test_plain_numbered_list():
    """Plain numbered list without section labels returns ""."""
    result = _narrative_clause(
        "1. Open with artist name.\n2. Describe the vibe.\n3. End with stream link."
    )
    assert result == "", f"expected '' got {result!r}"


# ---------------------------------------------------------------------------
# 2. Colon-section instruction formats → _narrative_clause returns ""
# ---------------------------------------------------------------------------

def test_hook_colon_format():
    result = _narrative_clause("Hook: Stop the scroll — new music is here.")
    assert result == "", f"expected '' got {result!r}"


def test_cta_colon_format():
    result = _narrative_clause("CTA: stream it now via the link in bio.")
    assert result == "", f"expected '' got {result!r}"


def test_body_colon_format():
    result = _narrative_clause("Body: describe the emotional arc of the record.")
    assert result == "", f"expected '' got {result!r}"


def test_headline_colon_format():
    result = _narrative_clause("Headline: New single from {artist} dropping Friday.")
    assert result == "", f"expected '' got {result!r}"


def test_caption_colon_format():
    result = _narrative_clause("Caption: Make it feel cinematic and emotionally resonant.")
    assert result == "", f"expected '' got {result!r}"


def test_intro_colon_format():
    result = _narrative_clause("Intro: Start with a relatable question.")
    assert result == "", f"expected '' got {result!r}"


# ---------------------------------------------------------------------------
# 3. Prefaced instruction schemas → _narrative_clause returns ""
# ---------------------------------------------------------------------------

def test_prefaced_numbered_list_single_line():
    """'For launch day: 1. Hook… 2. Body… 3. CTA…' on one line returns ""."""
    result = _narrative_clause(
        "For launch day: 1. Hook: grab attention. 2. Body: describe the drop. 3. CTA: stream now."
    )
    assert result == "", f"expected '' got {result!r}"


def test_prefaced_numbered_list_multiline():
    """Numbered list after a short preamble on its own line returns ""."""
    result = _narrative_clause(
        "For the album launch:\n1. Hook: open strong.\n2. Body: emotional arc.\n3. CTA: link in bio."
    )
    assert result == "", f"expected '' got {result!r}"


def test_prefaced_section_labels():
    """Section labels after preamble text return ""."""
    result = _narrative_clause(
        "Structure it like this — Hook: punchy opener. CTA: stream link."
    )
    assert result == "", f"expected '' got {result!r}"


def test_write_n_lines_then_line_n():
    """'Write N lines. Line 1: …' — lead-in stripped then schema guard catches remainder."""
    result = _narrative_clause(
        "Write 3 lines. Line 1: hook. Line 2: body. Line 3: CTA."
    )
    assert result == "", f"expected '' got {result!r}"


# ---------------------------------------------------------------------------
# 4. Plain prose directives → lead-in stripped, useful content returned
# ---------------------------------------------------------------------------

def test_prose_directive_stripped():
    """'Write a caption about X' → topic kept, imperative verb stripped."""
    result = _narrative_clause("Write a caption about the new single dropping Friday")
    assert result, "expected non-empty result"
    assert "caption" not in result.lower(), f"verb lead-in leaked: {result!r}"


def test_make_a_post_hyping():
    result = _narrative_clause("Make a post hyping the upcoming album release")
    assert result, f"expected non-empty, got {result!r}"


def test_hype_the_new_single():
    result = _narrative_clause("Hype the new single by focusing on the raw emotional delivery")
    assert result, f"expected non-empty, got {result!r}"


def test_always_directive_unchanged():
    """'Always lead with…' is not an imperative verb directive — unchanged."""
    result = _strip_instruction_leadin(
        "Always lead with the artist name. Focus on emotional connection."
    )
    assert result == "Always lead with the artist name. Focus on emotional connection.", \
        f"unexpectedly modified: {result!r}"


# ---------------------------------------------------------------------------
# 5. Genuine narrative content → passes through intact
# ---------------------------------------------------------------------------

GENUINE_NARRATIVES = [
    "A late-night session that turned into the most honest record of the year",
    "The collaboration nobody saw coming — two worlds colliding into one sound",
    "Six months of silence, then everything at once — this is that moment",
    "Raw, cinematic, and impossible to ignore — the kind of record that finds you",
]


def test_genuine_narrative_a():
    r = _narrative_clause(GENUINE_NARRATIVES[0])
    assert r and len(r.split()) >= 4, f"genuine narrative suppressed: {r!r}"


def test_genuine_narrative_b():
    r = _narrative_clause(GENUINE_NARRATIVES[1])
    assert r and len(r.split()) >= 4, f"genuine narrative suppressed: {r!r}"


def test_genuine_narrative_c():
    r = _narrative_clause(GENUINE_NARRATIVES[2])
    assert r and len(r.split()) >= 4, f"genuine narrative suppressed: {r!r}"


def test_genuine_narrative_d():
    r = _narrative_clause(GENUINE_NARRATIVES[3])
    assert r and len(r.split()) >= 4, f"genuine narrative suppressed: {r!r}"


# ---------------------------------------------------------------------------
# 6. _is_content_signal rejects instruction-format awareness lines
# ---------------------------------------------------------------------------

INSTRUCTION_LINES = [
    "Always open with the artist name",
    "Never use generic phrases",
    "Make sure to include the release date",
    "Line 1: attention hook here",
    "Step 2: describe the emotional arc",
    "Part 3: close with a CTA",
    "1. Hook: stop the scroll",
    "2) Body: describe the track",
    "Hook: Stop the scroll and listen",
    "CTA: stream it now via link in bio",
    "Body: describe the emotional arc",
    "Headline: new single dropping Friday",
    # Prefaced: contains 2+ schema markers
    "For launch day: 1. Hook: grab attention. 2. Body: describe.",
]

CONTENT_LINES = [
    "The late-night sound that's taking over every playlist",
    "Dark trap energy mixed with melodic highs — the perfect combination",
    "Emotional honesty in a genre that usually performs instead of confesses",
]


def test_is_content_signal_rejects_instructions():
    for line in INSTRUCTION_LINES:
        assert not _is_content_signal(line), \
            f"_is_content_signal returned True for instruction line: {line!r}"


def test_is_content_signal_accepts_content():
    for line in CONTENT_LINES:
        assert _is_content_signal(line), \
            f"_is_content_signal returned False for content line: {line!r}"


# ---------------------------------------------------------------------------
# 7. awareness_from_direction emits no [HIGH] for instruction schemas
# ---------------------------------------------------------------------------

INSTRUCTION_NARRATIVES = [
    "Write exactly 3 lines. Line 1: attention hook. Line 2: value prop. Line 3: CTA.",
    "1. Hook: grab attention.\n2. Body: describe the track.\n3. CTA: stream now.",
    "Hook: Make it punchy.\nCTA: Link in bio.",
    "For launch day: 1. Hook: grab attention. 2. Body: describe the drop. 3. CTA: stream now.",
]


def test_awareness_no_high_for_numbered_lines():
    result = awareness_from_direction(INSTRUCTION_NARRATIVES[0])
    assert "[HIGH]" not in result, \
        f"[HIGH] leaked for numbered-line instruction: {result!r}"


def test_awareness_no_high_for_numbered_list():
    result = awareness_from_direction(INSTRUCTION_NARRATIVES[1])
    assert "[HIGH]" not in result, \
        f"[HIGH] leaked for numbered list: {result!r}"


def test_awareness_no_high_for_section_labels():
    result = awareness_from_direction(INSTRUCTION_NARRATIVES[2])
    assert "[HIGH]" not in result, \
        f"[HIGH] leaked for section labels: {result!r}"


def test_awareness_no_high_for_prefaced_schema():
    """Regression: prefaced schema ('For launch day: 1. Hook…') must not produce [HIGH]."""
    result = awareness_from_direction(INSTRUCTION_NARRATIVES[3])
    assert "[HIGH]" not in result, \
        f"[HIGH] leaked for prefaced schema: {result!r}"


def test_awareness_high_for_genuine_narrative():
    """Genuine narrative MUST still produce a [HIGH] awareness signal."""
    genuine = "The most honest record of the year — raw, cinematic, impossible to ignore"
    result = awareness_from_direction(genuine)
    assert "[HIGH]" in result, \
        f"[HIGH] missing for genuine narrative: {result!r}"


# ---------------------------------------------------------------------------
# Standalone runner (also usable as sanity-check without pytest)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    tests = [
        test_line_n_format, test_step_n_format, test_part_n_format,
        test_numbered_list_with_period, test_numbered_list_with_paren,
        test_plain_numbered_list,
        test_hook_colon_format, test_cta_colon_format, test_body_colon_format,
        test_headline_colon_format, test_caption_colon_format, test_intro_colon_format,
        test_prefaced_numbered_list_single_line, test_prefaced_numbered_list_multiline,
        test_prefaced_section_labels, test_write_n_lines_then_line_n,
        test_prose_directive_stripped, test_make_a_post_hyping,
        test_hype_the_new_single, test_always_directive_unchanged,
        test_genuine_narrative_a, test_genuine_narrative_b,
        test_genuine_narrative_c, test_genuine_narrative_d,
        test_is_content_signal_rejects_instructions,
        test_is_content_signal_accepts_content,
        test_awareness_no_high_for_numbered_lines,
        test_awareness_no_high_for_numbered_list,
        test_awareness_no_high_for_section_labels,
        test_awareness_no_high_for_prefaced_schema,
        test_awareness_high_for_genuine_narrative,
    ]

    passed = failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  ✓  {fn.__name__}")
            passed += 1
        except AssertionError as exc:
            print(f"  ✗  {fn.__name__}: {exc}")
            failed += 1
        except Exception:
            print(f"  ✗  {fn.__name__}: unexpected error")
            traceback.print_exc()
            failed += 1

    print(f"\n{'✓ All' if not failed else '✗'} {passed}/{passed+failed} tests passed.")
    raise SystemExit(1 if failed else 0)
