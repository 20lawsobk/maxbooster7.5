"""Transient account analytics: measured summaries and an explicit OLS baseline.

The trusted application gateway selects and aggregates the authenticated owner's
records. This module never persists those private aggregates, feeds them into
public awareness, or claims that a statistical baseline is a trained model.
"""
from __future__ import annotations

import math
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator


class _Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


def _day(value: str) -> date:
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Dates must use YYYY-MM-DD")
    return parsed


class DataWindow(_Contract):
    start: str
    end: str

    @model_validator(mode="after")
    def validate_window(self):
        start, end = _day(self.start), _day(self.end)
        if start >= end:
            raise ValueError("The UTC data window must be nonempty and end exclusive")
        if end > datetime.now(timezone.utc).date():
            raise ValueError("Only complete UTC days may be analyzed")
        return self


class MetricPoint(_Contract):
    date: str
    value: float = Field(ge=0, le=1_000_000_000_000)


class InsightPoint(_Contract):
    date: str
    streams: float = Field(ge=0, le=1_000_000_000_000)
    revenue: float = Field(ge=0, le=1_000_000_000_000)
    listeners: float = Field(ge=0, le=1_000_000_000_000)


class _WindowRequest(_Contract):
    version: int = Field(ge=1, le=1)
    timeframe: Literal["7d", "30d", "90d"]
    dataWindow: DataWindow

    def validate_points(self, points):
        start, end = _day(self.dataWindow.start), _day(self.dataWindow.end)
        if (end - start).days != int(self.timeframe[:-1]):
            raise ValueError("The UTC window must match the requested timeframe")
        days = [_day(point.date) for point in points]
        if days != sorted(set(days)):
            raise ValueError("Observed days must be unique and in chronological order")
        if any(day < start or day >= end for day in days):
            raise ValueError("Every observation must be inside the UTC window")
        return self


class PredictionRequest(_WindowRequest):
    metric: Literal["streams", "engagement", "revenue"]
    points: list[MetricPoint] = Field(max_length=90)

    @model_validator(mode="after")
    def validate_observations(self):
        return self.validate_points(self.points)


class InsightsRequest(_WindowRequest):
    points: list[InsightPoint] = Field(max_length=90)

    @model_validator(mode="after")
    def validate_observations(self):
        return self.validate_points(self.points)


def _window(request) -> dict[str, Any]:
    span = int(request.timeframe[:-1])
    return {"start": request.dataWindow.start, "end": request.dataWindow.end,
            "dataPoints": len(request.points), "missingDays": span - len(request.points)}


def _public_context(snapshot_getter: Callable[[], Any]) -> dict[str, Any]:
    # Fetch public state without exposing any account observations to it. A
    # public signal is not evidence of its causal effect on an account metric.
    unavailable = {"status": "unavailable", "usedForForecast": False}
    try:
        snapshot = snapshot_getter()
        ident, expires = snapshot.id, snapshot.expires_at
        if (not isinstance(ident, str) or not re.fullmatch(r"[0-9a-f]{64}", ident)
                or isinstance(expires, bool) or not isinstance(expires, (int, float))
                or not math.isfinite(expires) or expires <= time.time()):
            return unavailable
        return {"status": "ready", "snapshotId": ident, "expiresAt": expires,
                "usedForForecast": False}
    except Exception:
        return unavailable


def _critical_95(degrees_of_freedom: int) -> float:
    # Two-sided Student-t critical values. Beyond 30 df retain the conservative
    # df=30 value rather than understating small-sample uncertainty with 1.96.
    values = (12.706205, 4.302653, 3.182446, 2.776445, 2.570582,
              2.446912, 2.364624, 2.306004, 2.262157, 2.228139,
              2.200985, 2.178813, 2.160369, 2.144787, 2.131450,
              2.119905, 2.109816, 2.100922, 2.093024, 2.085963,
              2.079614, 2.073873, 2.068658, 2.063899, 2.059539,
              2.055529, 2.051831, 2.048407, 2.045230, 2.042273)
    return values[min(degrees_of_freedom, 30) - 1]


def predict(request: PredictionRequest) -> dict[str, Any]:
    """Fit only observed calendar days; an absent day is not a zero."""
    start, end = _day(request.dataWindow.start), _day(request.dataWindow.end)
    count = len(request.points)
    span = ((_day(request.points[-1].date) - _day(request.points[0].date)).days
            if request.points else 0)
    coverage = count / (end - start).days
    result = {
        "status": "insufficient_history", "predictions": [], "trend": "stable",
        "accuracy": None, "dataWindow": _window(request),
        "history": {"observedDays": count, "observedSpanDays": span,
                    "coverage": coverage, "minimumObservedDays": 7,
                    "minimumSpanDays": 6, "minimumCoverage": 0.5},
        "method": {"name": "ordinary_least_squares", "version": 1,
                   "uncertainty": "residual_prediction_interval_95",
                   "accuracyCalibrated": False,
                   "assumptions": "Linear trend with independent, constant-variance approximately normal residuals; intervals are conditional estimates, not guarantees.",
                   "missingDays": "unobserved_not_zero", "trainedModelRequired": False},
    }
    if count < 7 or span < 6 or coverage < 0.5:
        result["reason"] = "At least 7 observed days spanning 6 days and covering half the window are required."
        return result

    xs = [(_day(point.date) - start).days for point in request.points]
    ys = [point.value for point in request.points]
    mean_x, mean_y = math.fsum(xs) / count, math.fsum(ys) / count
    sxx = math.fsum((x - mean_x) ** 2 for x in xs)
    slope = math.fsum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / sxx
    residual_sum = math.fsum((y - (mean_y + slope * (x - mean_x))) ** 2
                             for x, y in zip(xs, ys))
    standard_error = math.sqrt(residual_sum / (count - 2))
    critical = _critical_95(count - 2)
    predictions = []
    for offset in range(min((end - start).days, 30)):
        target = end + timedelta(days=offset)
        target_x = (target - start).days
        estimate = mean_y + slope * (target_x - mean_x)
        half_width = critical * standard_error * math.sqrt(
            1 + 1 / count + (target_x - mean_x) ** 2 / sxx)
        predictions.append({"date": target.isoformat(), "value": max(0.0, estimate),
                            "lower95": max(0.0, estimate - half_width),
                            "upper95": max(0.0, estimate + half_width),
                            "confidence": None})
    normalized_slope = slope / mean_y if mean_y else 0.0
    result.update({"status": "ready", "predictions": predictions,
                   "trend": "stable" if abs(normalized_slope) <= 0.005 else "up" if slope > 0 else "down"})
    result["method"].update({"slopePerDay": slope, "residualStandardError": standard_error,
                             "degreesOfFreedom": count - 2,
                             "criticalValue": critical})
    return result


def _display(value: float) -> str:
    return f"{value:,.2f}".rstrip("0").rstrip(".")


def insights(request: InsightsRequest) -> dict[str, Any]:
    window = _window(request)
    count = len(request.points)
    metric_names = ("streams", "revenue", "listeners")
    totals = {name: math.fsum(getattr(point, name) for point in request.points) if count else None
              for name in metric_names}
    start, end = _day(request.dataWindow.start), _day(request.dataWindow.end)
    split = start + timedelta(days=(end - start).days // 2)
    previous = [point for point in request.points if _day(point.date) < split]
    current = [point for point in request.points if _day(point.date) >= split]
    comparison = {"splitDate": split.isoformat(), "previousObservedDays": len(previous),
                  "currentObservedDays": len(current), "metrics": {}}
    for name in metric_names:
        old = math.fsum(getattr(point, name) for point in previous) / len(previous) if previous else None
        new = math.fsum(getattr(point, name) for point in current) / len(current) if current else None
        change = 100 * (new - old) / old if old is not None and old > 0 and new is not None else None
        if change is not None and not math.isfinite(change):
            change = None
        comparison["metrics"][name] = {
            "previousPerObservedDay": old, "currentPerObservedDay": new,
            "changePercent": change}
    if count:
        text = (f"From {start.isoformat()} through {(end - timedelta(days=1)).isoformat()} UTC, "
                f"{count} observed days contain {_display(totals['streams'])} recorded streams, "
                f"{_display(totals['revenue'])} recorded revenue units, and "
                f"{_display(totals['listeners'])} daily listener observations. "
                "Daily listener observations may include the same listener on multiple days; this is not a unique audience count.")
        change = comparison["metrics"]["streams"]["changePercent"]
        if change is not None:
            text += (f" Streams per observed day changed by {change:+.2f}% between the earlier "
                     "and later calendar portions of this window. This comparison does not establish a cause.")
        else:
            text += " A percentage comparison is unavailable because one portion has no observations or its earlier rate is zero."
        text += f" {window['missingDays']} days have no observations and were not treated as zero."
    else:
        text = ("No recorded analytics observations are available for this UTC window. "
                "Connect a reporting source or wait for recorded activity; missing observations are not zero performance.")
    return {"status": "ready" if count else "insufficient_history", "insight": text,
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "dataWindow": window, "metrics": totals, "comparison": comparison,
            "method": {"name": "observed_summary", "version": 1,
                       "trainedModelRequired": False, "causalInference": False,
                       "missingDays": "unobserved_not_zero",
                       "metricDefinitions": {"streams": "sum_of_recorded_streams",
                                             "revenue": "sum_of_recorded_revenue_in_source_units",
                                             "listeners": "sum_of_daily_listener_observations_not_unique_audience"}}}


async def _finite_json(request: Request):
    # Python's JSON decoder accepts NaN/Infinity and overflowing exponents.
    # Reject them before Pydantic's error payload can echo a non-JSON float,
    # which otherwise makes FastAPI's validation-error serializer return 500.
    if request.method != "POST":
        return

    def reject_constant(_value):
        raise ValueError("Nonfinite number")

    def finite_float(value):
        parsed = float(value)
        if not math.isfinite(parsed):
            raise ValueError("Nonfinite number")
        return parsed

    try:
        json.loads(await request.body(), parse_constant=reject_constant, parse_float=finite_float)
    except ValueError:
        raise HTTPException(status_code=422, detail="A valid JSON body containing only finite numbers is required") from None


def create_router(require_generation: Callable, snapshot_getter: Callable[[], Any]) -> APIRouter:
    router = APIRouter(prefix="/api/analytics", dependencies=[Depends(require_generation), Depends(_finite_json)])

    @router.get("/capability")
    def capability():
        return {"available": True, "capability": "account-analytics", "version": 1, "trainedModelRequired": False,
                "methods": ["observed_summary", "ordinary_least_squares"],
                "timeframes": ["7d", "30d", "90d"], "privateDataRetention": "none",
                "publicContext": _public_context(snapshot_getter)}

    @router.post("/predict")
    def prediction_endpoint(request: PredictionRequest):
        return {**predict(request), "publicContext": _public_context(snapshot_getter)}

    @router.post("/insights")
    def insights_endpoint(request: InsightsRequest):
        return {**insights(request), "publicContext": _public_context(snapshot_getter)}

    return router
