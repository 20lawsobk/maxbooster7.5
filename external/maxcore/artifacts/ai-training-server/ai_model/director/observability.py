"""Observability — structured logging and metrics.

Production-grade means you can debug it at 3am. Every Director logs
structured events. Metrics track generation quality over time.
"""
from __future__ import annotations

import json
import time
from typing import Dict, Any, Optional
from collections import defaultdict


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
    """In-memory metrics aggregator."""

    def __init__(self):
        self.counters: Dict[str, int] = defaultdict(int)
        self.scores: Dict[str, list] = defaultdict(list)

    def increment(self, name: str, value: int = 1):
        self.counters[name] += value

    def record_score(self, dimension: str, score: float):
        self.scores[dimension].append(score)
        # Keep last 1000.
        if len(self.scores[dimension]) > 1000:
            self.scores[dimension] = self.scores[dimension][-1000:]

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


_metrics = Metrics()


def get_metrics() -> Metrics:
    return _metrics
