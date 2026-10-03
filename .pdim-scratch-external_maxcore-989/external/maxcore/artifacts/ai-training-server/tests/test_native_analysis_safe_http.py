from __future__ import annotations

import socket

import pytest

from ai_model.native_analysis import safe_http


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "data:text/plain,hello",
        "http://user:password@example.com/",
        "http://127.0.0.1/",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
    ],
)
def test_rejects_non_public_and_non_http_urls(
    url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    if "127.0.0.1" in url or "169.254" in url:
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda *args, **kwargs: [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", (url.split("//")[1].split("/")[0], 80))
            ],
        )
    with pytest.raises(safe_http.SafeHTTPError):
        safe_http._validate_url(url) if not url.startswith("http") else (
            safe_http._public_addresses(safe_http._validate_url(url)[1], 80)
        )


def test_dns_answer_is_rejected_if_any_address_is_private(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", 443)),
        ],
    )
    with pytest.raises(safe_http.SafeHTTPError, match="non-public"):
        safe_http._public_addresses("example.com", 443)


@pytest.mark.parametrize(
    "address",
    ["::ffff:8.8.8.8", "2002:0808:0808::1", "64:ff9b::0808:0808"],
)
def test_rejects_ipv6_transition_addresses(
    address: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (address, 443, 0, 0))
        ],
    )
    with pytest.raises(safe_http.SafeHTTPError):
        safe_http._public_addresses("example.com", 443)


def test_redirect_target_is_validated_again(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_addresses(host: str, port: int, timeout: float = 5.0) -> list[str]:
        calls.append(host)
        if host == "private.invalid":
            raise safe_http.SafeHTTPError("URL resolves to a non-public address")
        return ["93.184.216.34"]

    class Response:
        status = 302
        def getheader(self, name: str, default=None):
            return "http://private.invalid/secret" if name == "Location" else default

    class Connection:
        def __init__(self, *args, **kwargs):
            self.sock = None
        def request(self, *args, **kwargs):
            pass
        def getresponse(self):
            return Response()
        def close(self):
            pass

    monkeypatch.setattr(safe_http, "_public_addresses", fake_addresses)
    monkeypatch.setattr(safe_http, "_PinnedHTTPConnection", Connection)
    with pytest.raises(safe_http.SafeHTTPError, match="non-public"):
        safe_http.fetch_to_file(
            "http://public.example/start",
            "/tmp/maxcore-redirect-test",
            max_bytes=100,
            allowed_content_types=("text/html",),
        )
    assert calls == ["public.example", "private.invalid"]


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("http://example.com:443/file", "example.com:443"),
        ("https://example.com:80/file", "example.com:80"),
        ("http://[2001:4860:4860::8888]/file", "[2001:4860:4860::8888]"),
    ],
)
def test_host_header_brackets_ipv6_and_uses_scheme_default_port(
    url: str, expected: str, tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, str] = {}

    class Response:
        status = 200
        reads = 0

        def getheader(self, name: str, default=None):
            return "text/plain" if name == "Content-Type" else default

        def read(self, _size: int) -> bytes:
            self.reads += 1
            return b"x" if self.reads == 1 else b""

    class Connection:
        sock = None

        def __init__(self, *args, **kwargs):
            pass

        def request(self, *args, **kwargs):
            captured.update(kwargs["headers"])

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr(
        safe_http, "_public_addresses", lambda *args, **kwargs: ["93.184.216.34"]
    )
    monkeypatch.setattr(safe_http, "_PinnedHTTPConnection", Connection)
    monkeypatch.setattr(safe_http, "_PinnedHTTPSConnection", Connection)
    safe_http.fetch_to_file(
        url,
        tmp_path / "response",
        max_bytes=10,
        allowed_content_types=("text/plain",),
    )
    assert captured["Host"] == expected