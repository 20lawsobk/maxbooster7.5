"""Analytics feedback — the performance stream.

When real engagement data is available (from deployed posts), it flows
back here and informs future generation. This closes the loop between
what we generate and what actually performs.

Interface is defined; the concrete analytics source is pluggable.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Protocol
from dataclasses import dataclass

from .observability import get_logger

log = get_logger("analytics")


@dataclass
class PerformanceRecord:
    """Observed performance of a deployed piece of content."""

    content_id: str
    platform: str
    modality: str  # audio, video, social, ads

    # Engagement metrics.
    impressions: int = 0
    engagements: int = 0  # likes + comments + shares + saves
    completion_rate: float = 0.0  # for video
    ctr: float = 0.0  # for ads

    @property
    def engagement_rate(self) -> float:
        return self.engagements / max(1, self.impressions)


class AnalyticsSource(Protocol):
    """Pluggable analytics backend."""

    def get_recent(
        self,
        platform: Optional[str] = None,
        modality: Optional[str] = None,
        limit: int = 50,
    ) -> List[PerformanceRecord]:
        ...


class NullAnalyticsSource:
    """No-op when analytics isn't connected."""

    def get_recent(self, platform=None, modality=None, limit=50):
        return []


class FeedbackLoop:
    """Feeds performance data back into generation."""

    def __init__(self, source: Optional[AnalyticsSource] = None):
        self.source = source or NullAnalyticsSource()

    def get_hints(self, platform: str) -> Dict[str, str]:
        """Get performance-informed hints for a platform.

        Returns e.g. {"top_pattern": "behind-the-scenes hooks overperform",
                       "avoid": "link-in-bio CTAs underperform vs save asks"}
        """
        try:
            records = self.source.get_recent(platform=platform, limit=20)
            if not records:
                return {}

            # Simple analysis: what correlates with high engagement?
            # In production, this would be a proper model.
            sorted_records = sorted(
                records, key=lambda r: r.engagement_rate, reverse=True)
            top = sorted_records[:5]

            hints = {}
            if top:
                avg_top = sum(r.engagement_rate for r in top) / len(top)
                hints["top_engagement_rate"] = f"{avg_top:.3f}"
                hints["sample_size"] = str(len(records))

            log.info("feedback_hints", platform=platform, hints=hints)
            return hints
        except Exception as e:
            log.warn("feedback_failed", error=str(e))
            return {}

    def record_feedback(
        self,
        content_id: str,
        platform: str,
        modality: str,
        metrics: Dict,
    ):
        """Log performance for future learning (fire-and-forget)."""
        try:
            log.info("performance_record",
                     content_id=content_id, platform=platform,
                     modality=modality, **metrics)
            # In production, this writes to the analytics store.
        except Exception:
            pass
