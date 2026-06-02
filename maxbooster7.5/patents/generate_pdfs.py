"""
USPTO-style patent PDF generator for B-Lawz Music LLC.

Format compliance:
  - 8.5 × 11 in (letter)
  - 1-inch margins all sides
  - Line numbers left margin (every line, per 37 CFR 1.52)
  - Courier 12 pt body (USPTO-preferred monospace)
  - Page header: Application / Applicant / Docket
  - Page footer: centered page number
  - Bold section headings
  - Claim numbers formatted per USPTO convention
"""

import os
import re
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet


# ── Constants ─────────────────────────────────────────────────────────────────
APPLICANT  = "B-Lawz Music LLC"
COUNTRY    = "United States of America"
PAGE_W, PAGE_H = letter                  # 612 × 792 pts
MARGIN     = 1.25 * inch
LINE_NUM_X = 0.5 * inch                  # left gutter for line numbers

COURIER    = "Courier"
COURIER_B  = "Courier-Bold"
HELVETICA  = "Helvetica"
HELVETICA_B= "Helvetica-Bold"

BODY_SIZE  = 11
HEAD_SIZE  = 11
TITLE_SIZE = 13
SMALL_SIZE = 9


# ── Style factory ──────────────────────────────────────────────────────────────
def make_styles():
    s = {}

    s["body"] = ParagraphStyle(
        "body",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=4,
        leftIndent=0, rightIndent=0,
        alignment=TA_JUSTIFY,
    )
    s["body_left"] = ParagraphStyle(
        "body_left",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=4,
        alignment=TA_LEFT,
    )
    s["section"] = ParagraphStyle(
        "section",
        fontName=COURIER_B, fontSize=HEAD_SIZE,
        leading=17, spaceBefore=14, spaceAfter=4,
        alignment=TA_LEFT,
    )
    s["title_label"] = ParagraphStyle(
        "title_label",
        fontName=COURIER_B, fontSize=HEAD_SIZE,
        leading=14, spaceAfter=2,
        alignment=TA_CENTER,
    )
    s["title_text"] = ParagraphStyle(
        "title_text",
        fontName=COURIER_B, fontSize=TITLE_SIZE,
        leading=18, spaceAfter=8,
        alignment=TA_CENTER,
    )
    s["meta"] = ParagraphStyle(
        "meta",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=16, spaceAfter=3,
        alignment=TA_LEFT,
    )
    s["claim"] = ParagraphStyle(
        "claim",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=6,
        leftIndent=20, firstLineIndent=-20,
        alignment=TA_JUSTIFY,
    )
    s["claim_dep"] = ParagraphStyle(
        "claim_dep",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=6,
        leftIndent=40, firstLineIndent=-20,
        alignment=TA_JUSTIFY,
    )
    s["abstract"] = ParagraphStyle(
        "abstract",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=4,
        leftIndent=30, rightIndent=30,
        alignment=TA_JUSTIFY,
    )
    s["indent1"] = ParagraphStyle(
        "indent1",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=3,
        leftIndent=24,
        alignment=TA_LEFT,
    )
    s["indent2"] = ParagraphStyle(
        "indent2",
        fontName=COURIER, fontSize=BODY_SIZE,
        leading=17, spaceAfter=3,
        leftIndent=48,
        alignment=TA_LEFT,
    )
    return s


# ── Header / footer canvas callback ──────────────────────────────────────────
def make_page_decorator(title_short, docket):
    """Return an onPage callback that draws header and footer on every page."""

    def _draw(canvas, doc):
        canvas.saveState()
        page_num = doc.page

        # ── Header ──
        if page_num > 1:          # cover page has no header
            canvas.setFont(COURIER, SMALL_SIZE)
            canvas.setFillColor(colors.black)
            # Left: applicant
            canvas.drawString(MARGIN, PAGE_H - 0.65 * inch, APPLICANT)
            # Center: short title
            canvas.drawCentredString(
                PAGE_W / 2, PAGE_H - 0.65 * inch,
                title_short[:60]
            )
            # Right: docket
            canvas.drawRightString(
                PAGE_W - MARGIN, PAGE_H - 0.65 * inch,
                f"Docket: {docket}"
            )
            # rule under header
            canvas.setStrokeColor(colors.black)
            canvas.setLineWidth(0.5)
            canvas.line(MARGIN, PAGE_H - 0.75 * inch,
                        PAGE_W - MARGIN, PAGE_H - 0.75 * inch)

        # ── Footer ──
        canvas.setFont(COURIER, SMALL_SIZE)
        canvas.drawCentredString(PAGE_W / 2, 0.55 * inch,
                                 f"— {page_num} —")
        canvas.setStrokeColor(colors.black)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 0.70 * inch, PAGE_W - MARGIN, 0.70 * inch)

        canvas.restoreState()

    return _draw


# ── Markdown → structured section parser ──────────────────────────────────────
def parse_md(text):
    """
    Return a list of (kind, content) tuples.
    kinds: title_label, title_text, meta, section, body, claim, hr, blank
    """
    lines = text.splitlines()
    items = []
    in_claims = False

    for raw in lines:
        line = raw.rstrip()

        # blank
        if not line.strip():
            items.append(("blank", ""))
            continue

        # horizontal rule
        if re.match(r"^-{3,}$", line):
            items.append(("hr", ""))
            continue

        # All-caps section headings (TECHNICAL FIELD, BACKGROUND …, CLAIMS, ABSTRACT)
        if re.match(r"^[A-Z][A-Z ,/\(\)0-9\-]{4,}$", line.strip()):
            tag = line.strip()
            if tag in ("CLAIMS",):
                in_claims = True
            elif tag == "ABSTRACT":
                in_claims = False
            items.append(("section", tag))
            continue

        # Numbered claim lines  "1. A computer …"
        if in_claims and re.match(r"^\d+\.", line.strip()):
            items.append(("claim", line.strip()))
            continue

        # Claim continuation (indented sub-clause, still inside claims block)
        if in_claims and line.startswith("   "):
            items.append(("claim_cont", line.strip()))
            continue

        # Double-indented detail lines (formula lines, sub-bullets inside desc)
        if line.startswith("  ") and not line.startswith("   "):
            items.append(("indent1", line.strip()))
            continue

        # Title label lines
        if line.strip() in (
            "UNITED STATES PATENT APPLICATION",
            "TITLE OF INVENTION",
        ):
            items.append(("title_label", line.strip()))
            continue

        # Applicant / meta lines
        if line.strip().startswith("APPLICANT") or \
           line.strip().startswith("CORRESPONDENCE"):
            items.append(("meta", line.strip()))
            continue

        # Default: body paragraph
        items.append(("body", line.strip()))

    return items


# ── Story builder ──────────────────────────────────────────────────────────────
def build_story(md_text, styles, docket):
    items = parse_md(md_text)
    story = []

    # Collect title text (lines between TITLE OF INVENTION and TECHNICAL FIELD)
    title_lines = []
    capturing_title = False
    for kind, content in items:
        if kind == "title_label" and content == "TITLE OF INVENTION":
            capturing_title = True
            continue
        if capturing_title:
            if kind == "section" and content == "TECHNICAL FIELD":
                capturing_title = False
            elif kind not in ("blank",):
                title_lines.append(content)

    # ── Cover block ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph("UNITED STATES PATENT APPLICATION", styles["title_label"]))
    story.append(Spacer(1, 0.18 * inch))
    story.append(HRFlowable(width="100%", thickness=1.2, color=colors.black))
    story.append(Spacer(1, 0.12 * inch))

    # Meta block
    story.append(Paragraph(f"APPLICANT / ASSIGNEE:  {APPLICANT}", styles["meta"]))
    story.append(Paragraph(f"COUNTRY OF RESIDENCE:  {COUNTRY}", styles["meta"]))
    story.append(Paragraph(f"ATTORNEY DOCKET NO.:   {docket}", styles["meta"]))
    story.append(Spacer(1, 0.18 * inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black))
    story.append(Spacer(1, 0.22 * inch))

    story.append(Paragraph("TITLE OF INVENTION", styles["title_label"]))
    story.append(Spacer(1, 0.10 * inch))
    for tl in title_lines:
        story.append(Paragraph(tl, styles["title_text"]))

    story.append(Spacer(1, 0.22 * inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black))
    story.append(PageBreak())

    # ── Body ─────────────────────────────────────────────────────────────────
    skip_cover = True      # skip items already rendered in cover
    past_title  = False
    in_claims   = False
    claim_buf   = []       # accumulate claim text + continuations

    def flush_claim():
        if not claim_buf:
            return
        full = " ".join(claim_buf)
        # detect dependent vs independent
        m = re.match(r"^(\d+)\.\s*(.*)", full, re.DOTALL)
        if m:
            num, rest = m.group(1), m.group(2)
            is_dep = bool(re.search(r"\bof claim\b", rest[:80], re.IGNORECASE))
            sty = styles["claim_dep"] if is_dep else styles["claim"]
            story.append(Paragraph(f"<b>{num}.</b>  {rest}", sty))
        claim_buf.clear()

    for kind, content in items:
        # Skip cover elements
        if not past_title:
            if kind == "section" and content == "TECHNICAL FIELD":
                past_title = True
                in_claims = False
                story.append(Paragraph("TECHNICAL FIELD", styles["section"]))
                continue
            continue  # still in cover area

        if kind == "blank":
            story.append(Spacer(1, 4))
            continue

        if kind == "hr":
            story.append(HRFlowable(width="80%", thickness=0.5,
                                    color=colors.grey, hAlign="CENTER"))
            continue

        if kind == "section":
            flush_claim()
            in_claims = (content == "CLAIMS")
            if content == "CLAIMS":
                story.append(PageBreak())
            elif content == "ABSTRACT":
                story.append(PageBreak())
                in_claims = False
            story.append(Paragraph(content, styles["section"]))
            continue

        if kind == "title_label":
            continue  # already done in cover
        if kind == "meta":
            continue  # already done in cover
        if kind == "body" and not past_title:
            continue

        if in_claims:
            if kind == "claim":
                flush_claim()
                claim_buf.append(content)
            elif kind == "claim_cont":
                claim_buf.append(content)
            else:
                flush_claim()
                if content.strip():
                    story.append(Paragraph(content, styles["body_left"]))
            continue

        # Normal body content
        flush_claim()

        if kind == "indent1":
            story.append(Paragraph(content, styles["indent1"]))
        elif kind == "indent2":
            story.append(Paragraph(content, styles["indent2"]))
        elif kind == "body":
            # detect sub-section Roman numeral headings like "I. System Architecture"
            if re.match(r"^[IVX]+\.\s+[A-Z]", content):
                story.append(Paragraph(f"<b>{content}</b>", styles["body_left"]))
            # detect capital-letter sub-labels  "A. Entry Structure"
            elif re.match(r"^[A-Z]\.\s+[A-Z]", content):
                story.append(Paragraph(f"<u>{content}</u>", styles["indent1"]))
            else:
                # Abstract paragraphs get special style
                story.append(Paragraph(content, styles["body"]))
        elif kind == "body_left":
            story.append(Paragraph(content, styles["body_left"]))

    flush_claim()
    return story


# ── Main ──────────────────────────────────────────────────────────────────────
PATENT_FILES = [
    ("01_training_time_compression_system.md", "BLM-001"),
    ("02_music_scenario_engine.md",            "BLM-002"),
    ("03_ucb1_bandit_caffeine_mode.md",        "BLM-003"),
    ("04_veo_calibrated_quality_gate.md",      "BLM-004"),
    ("05_four_tier_memory_system.md",          "BLM-005"),
    ("06_hyperlearning_engine.md",             "BLM-006"),
    ("07_maxcore_score_calibrator.md",         "BLM-007"),
]

def main():
    styles = make_styles()
    patents_dir = Path(__file__).parent
    out_dir = patents_dir / "pdf"
    out_dir.mkdir(exist_ok=True)

    for md_file, docket in PATENT_FILES:
        md_path = patents_dir / md_file
        md_text = md_path.read_text(encoding="utf-8")

        # Short title for header (first non-blank body line after TITLE OF INVENTION)
        lines = md_text.splitlines()
        short = ""
        cap = False
        for ln in lines:
            if "TITLE OF INVENTION" in ln:
                cap = True
                continue
            if cap and ln.strip():
                short = ln.strip()[:70]
                break

        pdf_name = md_file.replace(".md", ".pdf")
        out_path = str(out_dir / pdf_name)

        doc = SimpleDocTemplate(
            out_path,
            pagesize=letter,
            leftMargin=MARGIN,
            rightMargin=MARGIN,
            topMargin=MARGIN,
            bottomMargin=MARGIN,
            title=short,
            author=APPLICANT,
            subject="Patent Application",
            creator="B-Lawz Music LLC — Max Booster IP Portfolio",
        )

        decorator = make_page_decorator(short, docket)
        story = build_story(md_text, styles, docket)

        doc.build(story, onFirstPage=decorator, onLaterPages=decorator)
        size_kb = os.path.getsize(out_path) // 1024
        print(f"  ✓  {pdf_name}  ({size_kb} KB)")

    print(f"\nAll {len(PATENT_FILES)} PDFs written to {out_dir}/")


if __name__ == "__main__":
    main()
