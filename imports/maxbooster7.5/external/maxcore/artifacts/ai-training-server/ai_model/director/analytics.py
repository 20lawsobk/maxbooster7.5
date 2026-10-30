"""Analytics feedback — the performance stream.

When real engagement data is available (from deployed posts), it flows
back here and informs future generation. This closes the loop between
what we generate and what actually performs.

Sources, in priority order:
1. PdimAnalyticsSource — reads/writes via pdim (production)
2. FileAnalyticsSource — JSONL file (local/dev, always works)

record_feedback() writes performance data; get_recent() reads it back.
The loop starts empty and gets smarter with every deployed campaign.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Protocol
from dataclasses import dataclass, asdict, fields

from .observability import get_logger

log = get_logger("analytics")

_ANALYTICS_FILE = Path.home() / ".maxcore" / "director" / "analytics.jsonl"
_ANALYTICS_FILE.parent.mkdir(parents=True, exist_ok=True)


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

    recorded_at: float = 0.0

    @property
    def engagement_rate(self) -> float:
        return self.engagements / max(1, self.impressions)

    def to_dict(self) -> Dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict) -> "PerformanceRecord":
        valid = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in valid})


class AnalyticsSource(Protocol):
    """Pluggable analytics backend."""

    def get_recent(
        self,
        platform: Optional[str] = None,
        modality: Optional[str] = None,
        limit: int = 50,
    ) -> List[PerformanceRecord]:
        ...

    def record(self, record: PerformanceRecord) -> bool:
        ...


class FileAnalyticsSource:
    """JSONL-backed analytics — works everywhere, survives restarts."""

    def __init__(self, path: Optional[Path] = None):
        self.path = path or _ANALYTICS_FILE

    def get_recent(
        self,
        platform: Optional[str] = None,
        modality: Optional[str] = None,
        limit: int = 50,
    ) -> List[PerformanceRecord]:
        records = []
        try:
            if not self.path.is_file():
                return []
            with open(self.path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = PerformanceRecord.from_dict(json.loads(line))
                        if platform and rec.platform != platform:
                            continue
                        if modality and rec.modality != modality:
                            continue
                        records.append(rec)
                    except Exception:
                        continue
        except Exception as e:
            log.warn("analytics_read_failed", error=str(e))
        # Most recent first.
        records.sort(key=lambda r: r.recorded_at, reverse=True)
        return records[:limit]

    def record(self, record: PerformanceRecord) -> bool:
        try:
            if not record.recorded_at:
                record.recorded_at = time.time()
            with open(self.path, "a") as f:
                f.write(json.dumps(record.to_dict()) + "\n")
            return True
        except Exception as e:
            log.error("analytics_write_failed", error=str(e))
            return False


class PdimAnalyticsSource:
    """Pdim-backed analytics for production (falls back to file)."""

    def __init__(self):
        self._file = FileAnalyticsSource()

    def _pdim(self):
        try:
            from storage_client import get_storage
            return get_storage()
        except Exception:
            return None

    def get_recent(self, platform=None, modality=None, limit=50):
        # Try pdim first.
        try:
            store = self._pdim()
            if store:
                # Pdim stores as a list under a single key.
                raw = store.get("director:analytics")
                if raw:
                    records = [
                        PerformanceRecord.from_dict(d)
                        for d in json.loads(raw)
                    ]
                    if platform:
                        records = [r for r in records if r.platform == platform]
                    if modality:
                        records = [r for r in records if r.modality == modality]
                    records.sort(key=lambda r: r.recorded_at, reverse=True)
                    return records[:limit]
        except Exception:
            pass
        # Fall back to file.
        return self._file.get_recent(platform, modality, limit)

    def record(self, record: PerformanceRecord) -> bool:
        # Write to both pdim and file (belt and suspenders).
        ok = self._file.record(record)
        try:
            store = self._pdim()
            if store:
                raw = store.get("director:analytics")
                records = json.loads(raw) if raw else []
                if not record.recorded_at:
                    record.recorded_at = time.time()
                records.append(record.to_dict())
                # Keep last 1000.
                records = records[-1000:]
                store.set("director:analytics", json.dumps(records))
                return True
        except Exception:
            pass
        return ok


class FeedbackLoop:
    """Feeds performance data back into generation."""

    def __init__(self, source: Optional[AnalyticsSource] = None):
        # Production default: pdim with file fallback.
        self.source = source or PdimAnalyticsSource()

    def get_hints(self, platform: str) -> Dict[str, str]:
        """Get performance-informed hints for a platform."""
        try:
            records = self.source.get_recent(platform=platform, limit=20)
            if not records:
                return {}

            sorted_records = sorted(
                records, key=lambda r: r.engagement_rate, reverse=True)
            top = sorted_records[:5]
            bottom = sorted_records[-5:]

            hints = {}
            if top:
                avg_top = sum(r.engagement_rate for r in top) / len(top)
                hints["top_engagement_rate"] = f"{avg_top:.3f}"
                hints["sample_size"] = str(len(records))
                # What modalities overperform?
                top_modalities = {}
                for r in top:
                    top_modalities[r.modality] = (
                        top_modalities.get(r.modality, 0) + 1)
                best_mod = max(top_modalities, key=top_modalities.get)
                hints["top_modality"] = best_mod
            if bottom and len(records) >= 10:
                avg_bottom = sum(r.engagement_rate for r in bottom) / len(bottom)
                hints["bottom_engagement_rate"] = f"{avg_bottom:.3f}"

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
    ) -> bool:
        """Persist performance data for future learning."""
        try:
            record = PerformanceRecord(
                content_id=content_id,
                platform=platform,
                modality=modality,
                impressions=int(metrics.get("impressions", 0)),
                engagements=int(metrics.get("engagements", 0)),
                completion_rate=float(metrics.get("completion_rate", 0.0)),
                ctr=float(metrics.get("ctr", 0.0)),
                recorded_at=time.time(),
            )
            ok = self.source.record(record)
            log.info("performance_recorded",
                     content_id=content_id, platform=platform,
                     modality=modality, ok=ok)
            return ok
        except Exception as e:
            log.error("record_feedback_failed", error=str(e))
            return False
