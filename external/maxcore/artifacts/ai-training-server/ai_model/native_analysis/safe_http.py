"""Small, bounded HTTP client for untrusted public URLs.

The client deliberately bypasses environment proxies and connects to an IP
address that was validated immediately before the connection.  HTTPS still
uses the original hostname for SNI and certificate verification.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import queue
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping
from urllib.parse import urljoin, urlsplit


class SafeHTTPError(Exception):
    """Invalid URL or network response."""


class ResponseTooLarge(SafeHTTPError):
    """The response exceeded its byte budget."""


class UnsupportedContentType(SafeHTTPError):
    """The response media type was not accepted."""


@dataclass(frozen=True)
class FetchResult:
    final_url: str
    content_type: str
    size: int


def _public_addresses(host: str, port: int, timeout: float = 5.0) -> list[str]:
    answers: queue.Queue[object] = queue.Queue(maxsize=1)

    def resolve() -> None:
        try:
            answers.put(socket.getaddrinfo(host, port, type=socket.SOCK_STREAM))
        except BaseException as exc:
            answers.put(exc)

    # libc DNS has no portable timeout argument. A daemon resolver plus bounded
    # wait keeps the request deadline enforceable even if the system resolver
    # stalls; the late answer is never used for a connection.
    threading.Thread(target=resolve, name="analysis-dns", daemon=True).start()
    try:
        resolved = answers.get(timeout=max(0.001, timeout))
    except queue.Empty as exc:
        raise SafeHTTPError("URL hostname resolution timed out") from exc
    if isinstance(resolved, BaseException):
        raise SafeHTTPError("URL hostname could not be resolved") from resolved
    records = resolved
    addresses: list[str] = []
    for record in records:
        raw = record[4][0].split("%", 1)[0]
        try:
            address = ipaddress.ip_address(raw)
        except ValueError as exc:
            raise SafeHTTPError("URL resolved to an invalid address") from exc
        # is_global excludes private, loopback, link-local, multicast,
        # unspecified, documentation/reserved, and IPv4-mapped private space.
        if not address.is_global:
            raise SafeHTTPError("URL resolves to a non-public address")
        if isinstance(address, ipaddress.IPv6Address):
            # Reject transition formats instead of trusting only the outer
            # globally-routable IPv6 prefix: these can encode a private IPv4
            # destination that an intermediary extracts.
            if (
                address.ipv4_mapped is not None
                or address.sixtofour is not None
                or address.teredo is not None
                or address in ipaddress.ip_network("64:ff9b::/96")
            ):
                raise SafeHTTPError("IPv6 transition addresses are not allowed")
        normalized = str(address)
        if normalized not in addresses:
            addresses.append(normalized)
    if not addresses:
        raise SafeHTTPError("URL hostname has no usable public address")
    return addresses


def _validate_url(url: str) -> tuple[str, str, int, str]:
    if not isinstance(url, str) or not url or len(url) > 4096:
        raise SafeHTTPError("A valid public HTTP(S) URL is required")
    if "\\" in url or any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise SafeHTTPError("URL contains unsafe characters")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"}:
        raise SafeHTTPError("Only public HTTP(S) URLs are allowed")
    if parsed.username is not None or parsed.password is not None:
        raise SafeHTTPError("URL credentials are not allowed")
    if not parsed.hostname:
        raise SafeHTTPError("URL hostname is required")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise SafeHTTPError("URL port is invalid") from exc
    host = parsed.hostname.rstrip(".")
    if not host:
        raise SafeHTTPError("URL hostname is invalid")
    if "%" in host:
        raise SafeHTTPError("Scoped URL hostnames are not allowed")
    try:
        # Use one canonical ASCII hostname for DNS, Host, SNI, and certificate
        # verification rather than allowing those layers to normalize it apart.
        host = host.encode("idna").decode("ascii").casefold()
    except UnicodeError as exc:
        raise SafeHTTPError("URL hostname is invalid") from exc
    target = parsed.path or "/"
    if parsed.query:
        target += "?" + parsed.query
    return parsed.scheme, host, port, target


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, ip: str, timeout: float):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self) -> None:
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, port: int, ip: str, timeout: float):
        super().__init__(
            host, port, timeout=timeout, context=ssl.create_default_context()
        )
        self._ip = ip

    def connect(self) -> None:
        raw = socket.create_connection((self._ip, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def fetch_to_file(
    url: str,
    destination: str | Path,
    *,
    max_bytes: int,
    allowed_content_types: Iterable[str],
    deadline_seconds: float = 20.0,
    max_redirects: int = 3,
    headers: Mapping[str, str] | None = None,
    append: bool = False,
) -> FetchResult:
    """Stream a public URL into ``destination`` under strict limits."""
    allowed = tuple(item.lower().rstrip("/") for item in allowed_content_types)
    started = time.monotonic()
    current = url
    destination = Path(destination)
    for redirect_count in range(max_redirects + 1):
        remaining = deadline_seconds - (time.monotonic() - started)
        if remaining <= 0:
            raise SafeHTTPError("Remote fetch deadline exceeded")
        scheme, host, port, target = _validate_url(current)
        # Resolve and validate every redirect, then pin this exact address.
        ip = _public_addresses(host, port, min(remaining, 5.0))[0]
        connection_class = (
            _PinnedHTTPSConnection if scheme == "https" else _PinnedHTTPConnection
        )
        connection = connection_class(host, port, ip, min(remaining, 10.0))
        try:
            display_host = f"[{host}]" if ":" in host else host
            default_port = 443 if scheme == "https" else 80
            host_header = (
                display_host if port == default_port else f"{display_host}:{port}"
            )
            extra_headers = dict(headers or {})
            if any(name.casefold() in {"host", "authorization", "cookie"} for name in extra_headers):
                raise SafeHTTPError("Sensitive public request headers are not allowed")
            connection.request(
                "GET",
                target,
                headers={
                    "Host": host_header,
                    "User-Agent": "MaxCore-NativeAnalysis/1",
                    "Accept": ", ".join(item if "/" in item else f"{item}/*" for item in allowed),
                    "Connection": "close",
                    **extra_headers,
                },
            )
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location or redirect_count >= max_redirects:
                    raise SafeHTTPError("Remote URL has too many redirects")
                current = urljoin(current, location)
                continue
            if response.status < 200 or response.status >= 300:
                raise SafeHTTPError(f"Remote server returned HTTP {response.status}")
            content_type = response.getheader("Content-Type", "").split(";", 1)[0].lower()
            if not any(
                content_type == prefix or content_type.startswith(prefix + "/")
                for prefix in allowed
            ):
                raise UnsupportedContentType("Remote Content-Type is not supported")
            declared = response.getheader("Content-Length")
            if declared:
                try:
                    declared_bytes = int(declared)
                    if declared_bytes < 0:
                        raise SafeHTTPError("Remote Content-Length is invalid")
                    if declared_bytes > max_bytes:
                        raise ResponseTooLarge("Remote response exceeds size limit")
                except ValueError as exc:
                    raise SafeHTTPError("Remote Content-Length is invalid") from exc
            total = 0
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("ab" if append else "xb") as output:
                while True:
                    remaining = deadline_seconds - (time.monotonic() - started)
                    if remaining <= 0:
                        raise SafeHTTPError("Remote fetch deadline exceeded")
                    if connection.sock is not None:
                        connection.sock.settimeout(min(remaining, 2.0))
                    chunk = response.read(min(64 * 1024, max_bytes - total + 1))
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ResponseTooLarge("Remote response exceeds size limit")
                    output.write(chunk)
            if total == 0:
                raise SafeHTTPError("Remote response is empty")
            return FetchResult(current, content_type, total)
        except SafeHTTPError:
            destination.unlink(missing_ok=True)
            raise
        except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
            destination.unlink(missing_ok=True)
            raise SafeHTTPError("Remote fetch failed") from exc
        finally:
            connection.close()
    raise SafeHTTPError("Remote URL has too many redirects")


def fetch_bytes(
    url: str,
    *,
    max_bytes: int,
    allowed_content_types: Iterable[str],
    deadline_seconds: float = 20.0,
    max_redirects: int = 3,
    headers: Mapping[str, str] | None = None,
) -> tuple[bytes, FetchResult]:
    """Fetch bytes without leaving a partial file behind."""
    import tempfile

    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="maxcore-fetch-", delete=False) as handle:
            path = Path(handle.name)
        path.unlink()
        result = fetch_to_file(
            url,
            path,
            max_bytes=max_bytes,
            allowed_content_types=allowed_content_types,
            deadline_seconds=deadline_seconds,
            max_redirects=max_redirects,
            headers=headers,
        )
        return path.read_bytes(), result
    finally:
        if path is not None:
            path.unlink(missing_ok=True)