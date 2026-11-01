from __future__ import annotations

import pytest

from ai_model.intent import url_reader


def test_read_url_uses_bounded_safe_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, dict[str, object]]] = []

    def fake_fetch(url: str, **options: object):
        calls.append((url, options))
        return (
            b"<html><title>Safe title</title><p>A sufficiently long paragraph for extraction.</p></html>",
            object(),
        )

    monkeypatch.setattr(url_reader._safe_http, "fetch_bytes", fake_fetch)

    result = url_reader.read_url("https://example.com/release", timeout=1.25)

    assert result.title == "Safe title"
    assert calls == [
        (
            "https://example.com/release",
            {
                "max_bytes": 65536,
                "allowed_content_types": ("text/html", "application/xhtml+xml"),
                "deadline_seconds": 1.25,
                "max_redirects": 3,
            },
        )
    ]


def test_read_url_explicitly_rejects_unsafe_safe_http_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject(*_args: object, **_kwargs: object):
        raise url_reader._safe_http.SafeHTTPError(
            "URL resolves to a non-public address"
        )

    monkeypatch.setattr(url_reader._safe_http, "fetch_bytes", reject)

    result = url_reader.read_url("http://127.0.0.1/private")

    assert result.hostname == "127.0.0.1"
    assert result.is_empty()