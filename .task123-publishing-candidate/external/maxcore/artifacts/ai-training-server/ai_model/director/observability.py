"""Observability — structured logging and metrics.

Production-grade means you can debug it at 3am. Every Director logs
structured events. Metrics track generation quality over time.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Dict, Any, Optional
from collections import defaultdict


_METRICS_FILE = Path.home() / ".maxcore" / "director" / "metrics.json"


class Logger:
    """Structured JSON logger."""

    def __init__(self, name: str):
        self.name = name

    def _log(self, level: str, event: str, **fields):
        record = {
            "ts": time.time(),
            "logger": self.name,
            "level": level,
            "event": event,
            **fields,
        }
        # In production, this goes to a log aggregator.
        # For now, print as JSON (captured by container logs).
        print(json.dumps(record), flush=True)

    def info(self, event: str, **fields):
        self._log("info", event, **fields)

    def warn(self, event: str, **fields):
        self._log("warn", event, **fields)

    def error(self, event: str, **fields):
        self._log("error", event, **fields)

    def debug(self, event: str, **fields):
        self._log("debug", event, **fields)


_loggers: Dict[str, Logger] = {}


def get_logger(name: str) -> Logger:
    if name not in _loggers:
        _loggers[name] = Logger(name)
    return _loggers[name]


class Metrics:
    """Metrics aggregator with disk persistence.

    Counters and score histories are saved to disk on every update
    (atomic write via temp file). Survives restarts. Exports Prometheus
    format for scraping.
    """

    def __init__(self, path: Optional[Path] = None):
        self.counters: Dict[str, int] = defaultdict(int)
        self.scores: Dict[str, list] = defaultdict(list)
        self.path = path or _METRICS_FILE
        self._load()

    def _load(self):
        try:
            if self.path.is_file():
                data = json.loads(self.path.read_text())
                self.counters.update(data.get("counters", {}))
                for k, v in data.get("scores", {}).items():
                    self.scores[k] = v[-1000:]  # cap on load
        except Exception:
            pass  # Corrupt file → start fresh, don't crash.

    def _save(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({
                "counters": dict(self.counters),
                "scores": {k: v[-1000:] for k, v in self.scores.items()},
            }))
            tmp.rename(self.path)  # atomic
        except Exception:
            pass  # Persistence is best-effort.

    def increment(self, name: str, value: int = 1):
        self.counters[name] += value
        self._save()

    def record_score(self, dimension: str, score: float):
        self.scores[dimension].append(score)
        if len(self.scores[dimension]) > 1000:
            self.scores[dimension] = self.scores[dimension][-1000:]
        self._save()

    def avg_score(self, dimension: str) -> Optional[float]:
        scores = self.scores.get(dimension, [])
        return sum(scores) / len(scores) if scores else None

    def summary(self) -> Dict[str, Any]:
        return {
            "counters": dict(self.counters),
            "avg_scores": {
                k: round(sum(v) / len(v), 3)
                for k, v in self.scores.items() if v
            },
        }

    def prometheus(self) -> str:
        """Export in Prometheus exposition format."""
        lines = []
        for name, value in sorted(self.counters.items()):
            safe = "director_" + re.sub(r"[^a-zA-Z0-9_]", "_", name)
            lines.append(f"# TYPE {safe} counter")
            lines.append(f"{safe} {value}")
        for dim, scores in sorted(self.scores.items()):
            if not scores:
                continue
            safe = "director_" + re.sub(r"[^a-zA-Z0-9_]", "_", dim)
            avg = sum(scores) / len(scores)
            lines.append(f"# TYPE {safe}_avg gauge")
            lines.append(f"{safe}_avg {avg:.4f}")
        return "\n".join(lines) + "\n" if lines else ""


_metrics = Metrics()


def get_metrics() -> Metrics:
    return _metrics
