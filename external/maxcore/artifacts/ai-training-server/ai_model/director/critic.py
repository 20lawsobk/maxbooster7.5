"""Critic — the adversarial loop.

The Maker generates. The Critic indicts. The Maker regenerates.
This is how the last 2-3 points get closed — the Critic sees what
the Maker can't.

Each critique is specific and actionable: not "bad hook" but
"Hook lacks a tension marker; benchmark emotionalArc will score 0.0.
Add 'nobody' or 'secret' or a question mark."
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class Critique:
    """A specific, actionable indictment of generated copy."""

    dimension: str
    score: float  # 0-1
    threshold: float  # elite bar
    indictment: str  # what's wrong
    prescription: str  # how to fix it
    passed: bool = False

    def __post_init__(self):
        self.passed = self.score >= self.threshold


@dataclass
class CritiqueReport:
    """Full critique across all dimensions."""

    critiques: List[Critique] = field(default_factory=list)

    def passed(self) -> bool:
        return all(c.passed for c in self.critiques)

    def failures(self) -> List[Critique]:
        return [c for c in self.critiques if not c.passed]

    def summary(self) -> str:
        lines = []
        for c in self.critiques:
            status = "PASS" if c.passed else "FAIL"
            lines.append(f"[{status}] {c.dimension}: {c.score:.2f} (bar: {c.threshold:.2f})")
            if not c.passed:
                lines.append(f"  → {c.indictment}")
                lines.append(f"  → Fix: {c.prescription}")
        return "\n".join(lines)


class Critic:
    """Scores generated copy against elite bars."""

    # Elite thresholds per dimension (from benchmark elite means).
    THRESHOLDS = {
        "engagement": 0.65,
        "hook_strength": 0.55,
        "cta": 0.70,
        "clarity": 0.40,
        "brand": 0.75,
        "specificity": 0.60,
        "emotional_arc": 0.60,
    }

    def critique_social(
        self,
        caption: str,
        hook: str = "",
        body: str = "",
        cta: str = "",
        platform: str = "instagram",
    ) -> CritiqueReport:
        """Critique a social caption across all dimensions."""
        report = CritiqueReport()
        low = caption.lower()

        # Engagement: arousal + identity + structure.
        arousal = sum(1 for w in ["fire", "insane", "unreal", "obsessed", "need"]
                      if w in low)
        identity = "you" in low or "your" in low
        eng = min(1.0, arousal * 0.2 + (0.3 if identity else 0) + 0.3)
        report.critiques.append(Critique(
            "engagement", eng, self.THRESHOLDS["engagement"],
            "Thin arousal vocabulary; no identity language" if eng < 0.65 else "",
            "Add high-arousal words (fire, obsessed) and 'you/your' language" if eng < 0.65 else "",
        ))

        # Hook strength.
        hook_ok = len(hook) <= 125 and bool(hook)
        hs = 1.0 if hook_ok else 0.3
        report.critiques.append(Critique(
            "hook_strength", hs, self.THRESHOLDS["hook_strength"],
            "Hook missing or exceeds 125 chars" if not hook_ok else "",
            "Front-load the hook within the visible fold" if not hook_ok else "",
        ))

        # CTA: one-tap verbs.
        one_tap = any(v in low for v in ["save ", "comment", "tag ", "reply", "duet"])
        cta_score = 1.0 if one_tap else (0.66 if any(v in low for v in ["stream", "link in bio"]) else 0.25)
        report.critiques.append(Critique(
            "cta", cta_score, self.THRESHOLDS["cta"],
            "CTA is not one-tap; uses high-friction ask" if cta_score < 0.7 else "",
            "Use save/comment/tag/duet — one-tap interactive verbs" if cta_score < 0.7 else "",
        ))

        # Emotional arc: tension + resolution.
        tension = any(t in low for t in ["nobody", "secret", "struggle", "3am", "doubt"])
        resolution = any(r in low for r in ["finally", "survived", "arrived", "out now"])
        arc = 1.0 if (tension and resolution) else (0.5 if tension or resolution else 0.0)
        report.critiques.append(Critique(
            "emotional_arc", arc, self.THRESHOLDS["emotional_arc"],
            "No tension→resolution progression" if arc < 0.6 else "",
            "Add a struggle word (3am, scrapped) AND a payoff word (finally, survived)" if arc < 0.6 else "",
        ))

        return report

    def critique_video(
        self,
        scenes: Dict[int, str],
        platform: str = "tiktok",
    ) -> CritiqueReport:
        """Critique video scenes."""
        report = CritiqueReport()
        texts = list(scenes.values())

        # Diversity: unique templates.
        unique = len(set(texts))
        div = unique / max(1, len(texts))
        report.critiques.append(Critique(
            "diversity", div, 0.8,
            f"Only {unique}/{len(texts)} unique scenes — template convergence" if div < 0.8 else "",
            "Force diversity: exclude recently-used templates" if div < 0.8 else "",
        ))

        # Hook immediacy (TikTok: first frame).
        hook = texts[0] if texts else ""
        hook_ok = len(hook.split()) <= 10 and len(hook) > 0
        report.critiques.append(Critique(
            "hook_immediacy", 1.0 if hook_ok else 0.0, 0.8,
            "Hook too long for on-screen" if not hook_ok else "",
            "Keep hook ≤10 words for on-screen readability" if not hook_ok else "",
        ))

        return report
