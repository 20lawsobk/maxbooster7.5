"""HTTP transport for operator-configured services and local test servers.

Unlike safe_http (which accepts untrusted public URLs), this module preserves
private/local destinations. The complete origin and its address policy are
retained, each request resolves and validates every answer, and the connection
is pinned to one of those answers. Redirects are rejected.
"""
from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
from dataclasses import dataclass
from typing import Mapping
from urllib.parse import urlsplit


class TrustedHTTPError(Exception):
    pass


@dataclass(frozen=True)
class TrustedOrigin:
    scheme: str
    host: str
    port: int
    local_only: bool = False


@dataclass(frozen=True)
class TrustedResponse:
    status: int
    body: bytes
    headers: Mapping[str, str]


def validated_origin(url: str, *, local_only: bool = False) -> TrustedOrigin:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise TrustedHTTPError("trusted service URL must be HTTP(S)")
    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise TrustedHTTPError("trusted service URL contains forbidden components")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise TrustedHTTPError("trusted service URL has an invalid port") from exc
    host = parsed.hostname.rstrip(".").casefold()
    if local_only:
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if host != "localhost":
                raise TrustedHTTPError("test service must use a loopback origin")
        else:
            if not address.is_loopback:
                raise TrustedHTTPError("test service must use a loopback origin")
    return TrustedOrigin(parsed.scheme, host, port, local_only)


def _resolved_addresses(origin: TrustedOrigin) -> list[tuple[int, str]]:
    try:
        records = socket.getaddrinfo(
            origin.host, origin.port, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise TrustedHTTPError("trusted service hostname could not be resolved") from exc
    addresses: list[tuple[int, str]] = []
    for family, _, _, _, sockaddr in records:
        raw = sockaddr[0].split("%", 1)[0]
        try:
            address = ipaddress.ip_address(raw)
        except ValueError as exc:
            raise TrustedHTTPError(
                "trusted service resolved to an invalid address"
            ) from exc
        if origin.local_only and not address.is_loopback:
            raise TrustedHTTPError(
                "test service origin did not resolve only to loopback"
            )
        item = (family, str(address))
        if item not in addresses:
            addresses.append(item)
    if not addresses:
        raise TrustedHTTPError("trusted service hostname has no addresses")
    return addresses


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, address: str, timeout: float):
        super().__init__(host, port, timeout=timeout)
        self._address = address

    def connect(self) -> None:
        self.sock = socket.create_connection(
            (self._address, self.port), self.timeout
        )


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, port: int, address: str, timeout: float):
        super().__init__(
            host, port, timeout=timeout, context=ssl.create_default_context()
        )
        self._address = address

    def connect(self) -> None:
        raw = socket.create_connection((self._address, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def request(
    method: str,
    url: str,
    *,
    origin: TrustedOrigin,
    body: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = 10,
    max_bytes: int = 8 * 1024 * 1024,
) -> TrustedResponse:
    parsed = urlsplit(url)
    if validated_origin(url, local_only=origin.local_only) != origin:
        raise TrustedHTTPError("request URL is outside the configured trusted origin")
    target = parsed.path or "/"
    if parsed.query:
        target += "?" + parsed.query
    addresses = _resolved_addresses(origin)
    connection_type = (
        _PinnedHTTPSConnection if origin.scheme == "https" else _PinnedHTTPConnection
    )
    connection = connection_type(
        origin.host, origin.port, addresses[0][1], timeout
    )
    display_host = f"[{origin.host}]" if ":" in origin.host else origin.host
    default_port = 443 if origin.scheme == "https" else 80
    outgoing = dict(headers or {})
    outgoing.setdefault(
        "Host",
        display_host
        if origin.port == default_port
        else f"{display_host}:{origin.port}",
    )
    try:
        connection.request(method, target, body=body, headers=outgoing)
        response = connection.getresponse()
        if response.status in {301, 302, 303, 307, 308}:
            raise TrustedHTTPError("redirects from trusted services are not allowed")
        declared = response.getheader("Content-Length")
        if declared is not None and int(declared) > max_bytes:
            raise TrustedHTTPError("trusted service response exceeds size limit")
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise TrustedHTTPError("trusted service response exceeds size limit")
        return TrustedResponse(response.status, data, dict(response.getheaders()))
    except TrustedHTTPError:
        raise
    except (OSError, ssl.SSLError, http.client.HTTPException, ValueError) as exc:
        raise TrustedHTTPError("trusted service request failed") from exc
    finally:
        connection.close()