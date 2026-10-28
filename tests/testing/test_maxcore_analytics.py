"""Real authenticated FastAPI contracts for transient MaxCore account analytics.

Run: /workspace/.cloud-python/bin/python -m pytest -q tests/testing/test_maxcore_analytics.py
The ASGI transport calls the real router and numerical code without httpx,
trained weights, external HTTP, a database, or public-awareness ingestion.
"""
import asyncio
import copy
import importlib.util
import json
import math
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Header, HTTPException


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "external/maxcore/artifacts/ai-training-server/ai_model/analytics.py"
SPEC = importlib.util.spec_from_file_location("maxcore_account_analytics", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
TOKEN = "Bearer fixture-generation-only"


def _authorize(authorization: str | None = Header(None)):
    if authorization is None:
        raise HTTPException(status_code=401, detail="Missing generation credential")
    if authorization != TOKEN:
        raise HTTPException(status_code=403, detail="Generation scope required")
    return {"scopes": ["generate"]}


def _app(snapshot_getter=lambda: None):
    application = FastAPI()
    application.include_router(MODULE.create_router(_authorize, snapshot_getter))
    return application


def _request(path, payload=None, *, application=None, token=TOKEN, method="POST", raw_body=None):
    application = application or _app()
    body = raw_body if raw_body is not None else json.dumps(payload).encode() if payload is not None else b""
    headers = [(b"content-type", b"application/json")]
    if token is not None:
        headers.append((b"authorization", token.encode()))
    events = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        events.append(message)

    asyncio.run(application({"type": "http", "asgi": {"version": "3.0"},
                             "http_version": "1.1", "scheme": "http", "method": method,
                             "path": path, "raw_path": path.encode(), "query_string": b"",
                             "headers": headers, "server": ("test.invalid", 80),
                             "client": ("127.0.0.1", 1234)}, receive, send))
    status = next(event["status"] for event in events if event["type"] == "http.response.start")
    raw = b"".join(event.get("body", b"") for event in events if event["type"] == "http.response.body")
    # Any Infinity/NaN on the response side must fail the contract.
    def reject_constant(value):
        raise AssertionError(f"Nonfinite response: {value}")
    return status, json.loads(raw, parse_constant=reject_constant)


def _prediction(days=7, points=None):
    start = date(2026, 1, 1)
    return {"version": 1, "metric": "streams", "timeframe": f"{days}d",
            "dataWindow": {"start": start.isoformat(), "end": (start + timedelta(days=days)).isoformat()},
            "points": points if points is not None else [
                {"date": (start + timedelta(days=index)).isoformat(), "value": 10 + 2 * index}
                for index in range(days)]}


def _insights(days=7, points=None):
    prediction = _prediction(days)
    return {"version": 1, "timeframe": prediction["timeframe"], "dataWindow": prediction["dataWindow"],
            "points": points if points is not None else [
                {"date": point["date"], "streams": point["value"], "revenue": point["value"] / 10,
                 "listeners": 2} for point in prediction["points"]]}


@pytest.mark.parametrize("path,method,payload", [
    ("/api/analytics/predict", "POST", _prediction()),
    ("/api/analytics/insights", "POST", _insights()),
    ("/api/analytics/capability", "GET", None),
])
def test_all_routes_require_generation_authorization(path, method, payload):
    for token, expected in ((None, 401), ("Bearer read-only", 403)):
        status, body = _request(path, payload, token=token, method=method)
        assert status == expected
        assert "detail" in body


def test_capability_advertises_real_methods_without_weights_or_private_retention():
    status, body = _request("/api/analytics/capability", method="GET")
    assert status == 200
    assert body == {"available": True, "capability": "account-analytics", "version": 1, "trainedModelRequired": False,
                    "methods": ["observed_summary", "ordinary_least_squares"],
                    "timeframes": ["7d", "30d", "90d"], "privateDataRetention": "none",
                    "publicContext": {"status": "unavailable", "usedForForecast": False}}


@pytest.mark.parametrize("days,horizon", [(7, 7), (30, 30), (90, 30)])
def test_exact_linear_calendar_series_has_correct_horizon_and_first_day(days, horizon):
    request = _prediction(days)
    status, body = _request("/api/analytics/predict", request)
    assert status == 200 and body["status"] == "ready"
    assert body["trend"] == "up" and body["accuracy"] is None
    assert len(body["predictions"]) == horizon
    assert body["predictions"][0] == {"date": request["dataWindow"]["end"], "value": 10 + 2 * days,
                                       "lower95": 10 + 2 * days, "upper95": 10 + 2 * days,
                                       "confidence": None}
    assert body["method"]["slopePerDay"] == 2
    assert body["history"]["coverage"] == 1


def test_calendar_gaps_remain_missing_and_do_not_compress_the_regression_axis():
    request = _prediction(30)
    request["points"] = [point for index, point in enumerate(request["points"]) if index % 2 == 0]
    status, body = _request("/api/analytics/predict", request)
    assert status == 200 and body["status"] == "ready"
    assert body["predictions"][0]["value"] == 70
    assert body["method"]["slopePerDay"] == 2
    assert body["dataWindow"]["missingDays"] == 15
    assert body["history"]["coverage"] == 0.5


@pytest.mark.parametrize("days,indices", [(7, []), (7, [0]), (7, list(range(6))),
                                           (30, list(range(14))), (90, list(range(44)))])
def test_insufficient_history_never_produces_values_or_a_fake_accuracy(days, indices):
    request = _prediction(days)
    request["points"] = [request["points"][index] for index in indices]
    status, body = _request("/api/analytics/predict", request)
    assert status == 200 and body["status"] == "insufficient_history"
    assert body["predictions"] == [] and body["accuracy"] is None
    assert body["dataWindow"]["missingDays"] == days - len(indices)
    assert "required" in body["reason"]


def test_noise_produces_finite_widening_residual_intervals_with_explicit_assumptions():
    request = _prediction()
    for index, point in enumerate(request["points"]):
        point["value"] += [0, 1, -1, 2, -2, 1, 0][index]
    status, body = _request("/api/analytics/predict", request)
    assert status == 200
    forecasts = body["predictions"]
    for forecast in forecasts:
        assert 0 <= forecast["lower95"] <= forecast["value"] <= forecast["upper95"]
        assert forecast["confidence"] is None
    assert forecasts[-1]["upper95"] - forecasts[-1]["lower95"] > forecasts[0]["upper95"] - forecasts[0]["lower95"]
    assert body["method"]["residualStandardError"] > 0
    assert body["method"]["accuracyCalibrated"] is False
    assert "not guarantees" in body["method"]["assumptions"]


@pytest.mark.parametrize("values,trend", [([0] * 7, "stable"), ([5] * 7, "stable"),
                                          ([12, 10, 8, 6, 4, 2, 0], "down")])
def test_zero_constant_and_decreasing_series_stay_finite_nonnegative(values, trend):
    request = _prediction()
    for point, value in zip(request["points"], values):
        point["value"] = value
    status, body = _request("/api/analytics/predict", request)
    assert status == 200 and body["trend"] == trend
    assert all(forecast["value"] >= 0 and math.isfinite(forecast["upper95"]) for forecast in body["predictions"])
    if trend == "down":
        assert all(forecast["value"] == 0 for forecast in body["predictions"])


@pytest.mark.parametrize("mutation", [
    lambda body: body.update(version=True),
    lambda body: body.update(version=2),
    lambda body: body.update(metric="followers"),
    lambda body: body.update(timeframe="365d"),
    lambda body: body.update(horizon=90),
    lambda body: body.update(awareness={"private": "must not enter public engine"}),
    lambda body: body["dataWindow"].update(start="2026-01-02"),
    lambda body: body["dataWindow"].update(start="2026-01-08"),
    lambda body: body["dataWindow"].update(start="2026-01-09"),
    lambda body: body["dataWindow"].update(end="9999-01-08"),
    lambda body: body["dataWindow"].update(end="2026-01-08T00:00:00Z"),
    lambda body: body["points"][0].update(date="2026-01-08"),
    lambda body: body["points"][-1].update(date="2026-01-08"),
    lambda body: body["points"][0].update(date="2025-12-31"),
    lambda body: body["points"][0].update(date="20260101"),
    lambda body: body["points"].reverse(),
    lambda body: body["points"].append(body["points"][0]),
    lambda body: body["points"][0].update(value=-1),
    lambda body: body["points"][0].update(value=True),
    lambda body: body["points"][0].update(value="10"),
    lambda body: body["points"][0].update(value=float("nan")),
    lambda body: body["points"][0].update(value=float("inf")),
    lambda body: body["points"][0].update(value=1_000_000_000_001),
    lambda body: body["points"][0].update(rawAccountEmail="never-accepted@example.invalid"),
    lambda body: body.update(points=body["points"] * 14),
])
def test_prediction_rejects_invalid_authority_dates_horizons_and_values(mutation):
    request = _prediction()
    mutation(request)
    status, body = _request("/api/analytics/predict", request)
    assert status == 422 and "detail" in body


def test_overflowing_json_exponent_is_rejected_before_error_serialization():
    request = _prediction()
    raw = json.dumps(request).replace('"value": 10', '"value": 1e999', 1).encode()
    status, body = _request("/api/analytics/predict", raw_body=raw)
    assert status == 422
    assert body == {"detail": "A valid JSON body containing only finite numbers is required"}


def test_insights_report_measured_totals_and_calendar_comparisons_without_causality():
    status, body = _request("/api/analytics/insights", _insights())
    assert status == 200 and body["status"] == "ready"
    assert body["metrics"] == {"streams": 112, "revenue": 11.2, "listeners": 14}
    assert body["comparison"]["splitDate"] == "2026-01-04"
    assert body["comparison"]["metrics"]["streams"] == {
        "previousPerObservedDay": 12, "currentPerObservedDay": 19,
        "changePercent": pytest.approx(100 * 7 / 12)}
    assert "112 recorded streams" in body["insight"]
    assert "not a unique audience count" in body["insight"]
    assert "does not establish a cause" in body["insight"]
    assert body["method"]["causalInference"] is False
    assert body["method"]["metricDefinitions"]["listeners"] == "sum_of_daily_listener_observations_not_unique_audience"
    assert body["generatedAt"].endswith("Z")


def test_empty_and_sparse_insights_do_not_invent_zero_performance():
    request = _insights(points=[])
    status, body = _request("/api/analytics/insights", request)
    assert status == 200 and body["status"] == "insufficient_history"
    assert body["metrics"] == {"streams": None, "revenue": None, "listeners": None}
    assert body["dataWindow"]["missingDays"] == 7
    assert "not zero performance" in body["insight"]
    request = _insights(points=[{"date": "2026-01-07", "streams": 9, "revenue": 2.5, "listeners": 2}])
    status, body = _request("/api/analytics/insights", request)
    assert status == 200 and body["status"] == "ready"
    assert body["metrics"]["streams"] == 9
    assert body["comparison"]["metrics"]["streams"]["changePercent"] is None
    assert "6 days have no observations" in body["insight"]


def test_zero_and_tiny_denominator_comparisons_are_explicit_and_finite():
    request = _insights()
    for index, point in enumerate(request["points"]):
        point["streams"] = 0 if index < 3 else 10
        point["revenue"] = 1e-320 if index < 3 else 1_000_000_000_000
    status, body = _request("/api/analytics/insights", request)
    assert status == 200
    assert body["comparison"]["metrics"]["streams"]["changePercent"] is None
    assert body["comparison"]["metrics"]["revenue"]["changePercent"] is None
    assert "percentage comparison is unavailable" in body["insight"]


@pytest.mark.parametrize("mutation", [
    lambda body: body["points"][0].update(listeners=-1),
    lambda body: body["points"][0].update(streams=float("inf")),
    lambda body: body["points"][0].update(revenue="1.5"),
    lambda body: body["points"][0].update(date="2026-02-01"),
    lambda body: body["points"].append(body["points"][0]),
    lambda body: body.update(privateTraining=True),
])
def test_insights_enforce_same_bounded_private_aggregate_contract(mutation):
    request = _insights()
    mutation(request)
    status, body = _request("/api/analytics/insights", request)
    assert status == 422 and "detail" in body


def test_public_context_is_separate_fresh_metadata_and_never_receives_private_points():
    calls = []
    expires = time.time() + 60

    def snapshot_getter(*args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(id="a" * 64, expires_at=expires)

    application = _app(snapshot_getter)
    request = _prediction()
    before = copy.deepcopy(request)
    status, body = _request("/api/analytics/predict", request, application=application)
    assert status == 200
    assert calls == [((), {})]
    assert request == before
    assert body["publicContext"] == {"status": "ready", "snapshotId": "a" * 64,
                                      "expiresAt": expires, "usedForForecast": False}
    status, insight_body = _request("/api/analytics/insights", _insights(), application=application)
    assert status == 200 and len(calls) == 2
    assert insight_body["publicContext"] == body["publicContext"]


@pytest.mark.parametrize("snapshot", [None, SimpleNamespace(id="bad", expires_at=time.time() + 100),
                                       SimpleNamespace(id="b" * 64, expires_at=time.time() - 1),
                                       SimpleNamespace(id="b" * 64, expires_at=float("inf"))])
def test_missing_invalid_or_expired_public_context_does_not_masquerade_as_fresh(snapshot):
    status, body = _request("/api/analytics/predict", _prediction(), application=_app(lambda: snapshot))
    assert status == 200 and body["status"] == "ready"
    assert body["publicContext"] == {"status": "unavailable", "usedForForecast": False}


def test_snapshot_failure_leaves_statistical_computation_available_and_no_data_is_retained():
    def unavailable():
        raise RuntimeError("public snapshot unavailable")
    application = _app(unavailable)
    status, first = _request("/api/analytics/predict", _prediction(), application=application)
    assert status == 200 and first["status"] == "ready"
    status, second = _request("/api/analytics/predict", _prediction(points=[]), application=application)
    assert status == 200 and second["status"] == "insufficient_history"
    assert second["predictions"] == []
    assert first["publicContext"]["status"] == "unavailable"


def test_canonical_server_mounts_router_with_generation_scope_and_read_only_snapshot():
    import ast
    canonical = ROOT / "external/maxcore/artifacts/ai-training-server/server.py"
    tree = ast.parse(canonical.read_text())
    include = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
               and isinstance(node.func, ast.Attribute) and node.func.attr == "include_router"
               and node.args and isinstance(node.args[0], ast.Call)
               and isinstance(node.args[0].func, ast.Name) and node.args[0].func.id == "_account_analytics_router"]
    assert len(include) == 1
    call = include[0].args[0]
    assert ast.unparse(call.args[0]) == "require_scope('generate')"
    assert ast.unparse(call.args[1]) == "_account_analytics_snapshot"
