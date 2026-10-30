"""Dependency-free HTTP transport with explicit SSRF and redirect boundaries."""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
from dataclasses import dataclass
from typing import Mapping, Optional
from urllib.parse import urlsplit


class UnsafeURL(ValueError):
    pass


class HTTPStatusError(RuntimeError):
    def __init__(self, status: int, body: bytes):
        super().__init__(f"HTTP {status}")
        self.code = status
        self.body = body


class ResponseTooLarge(ValueError):
    pass


@dataclass
class Response:
    status: int
    headers: Mapping[str, str]
    body: bytes

    def read(self) -> bytes:
        return self.body

    def __enter__(self) -> "Response":
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def _origin(parts) -> tuple[str, str, int]:
    if parts.scheme not in ("http", "https"):
        raise UnsafeURL("only http and https URLs are allowed")
    if not parts.hostname or parts.username is not None or parts.password is not None:
        raise UnsafeURL("URL must have a hostname and no user information")
    if parts.fragment:
        raise UnsafeURL("URL fragments are not allowed")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError as exc:
        raise UnsafeURL("invalid URL port") from exc
    return parts.scheme, parts.hostname.lower().rstrip("."), port


def _addresses(host: str, port: int) -> list[tuple[int, str]]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeURL(f"host cannot be resolved: {host}") from exc
    addresses = list(dict.fromkeys((family, sockaddr[0]) for family, _, _, _, sockaddr in infos))
    if not addresses:
        raise UnsafeURL(f"host has no addresses: {host}")
    return addresses


def _validate_addresses(
    addresses: list[tuple[int, str]], allow_private: bool, require_loopback: bool
) -> None:
    parsed = [ipaddress.ip_address(address) for _, address in addresses]
    if require_loopback:
        if any(not ip.is_loopback for ip in parsed):
            raise UnsafeURL("origin is not confined to loopback")
        return
    if allow_private:
        if any(ip.is_unspecified or ip.is_multicast or ip.is_link_local for ip in parsed):
            raise UnsafeURL("internal origin resolved to an unsafe address")
        return
    if any(not ip.is_global for ip in parsed):
        raise UnsafeURL("public origin resolved to a non-public address")


def request(
    url: str,
    *,
    trusted_origin: str,
    method: str = "GET",
    headers: Optional[Mapping[str, str]] = None,
    data: Optional[bytes] = None,
    timeout: float = 20,
    allow_private: bool = False,
    require_loopback: bool = False,
    max_bytes: int = 64 * 1024 * 1024,
    raise_for_status: bool = True,
) -> Response:
    """Perform one request pinned to a separately supplied trusted origin."""
    target = urlsplit(url)
    trusted = urlsplit(trusted_origin)
    scheme, host, port = _origin(target)
    if (scheme, host, port) != _origin(trusted):
        raise UnsafeURL("request URL is outside the trusted origin")

    addresses = _addresses(host, port)
    _validate_addresses(addresses, allow_private, require_loopback)
    family, address = addresses[0]
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((address, port))
        if scheme == "https":
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
        conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.sock = sock
        path = target.path or "/"
        if target.query:
            path += "?" + target.query
        outgoing = dict(headers or {})
        display_host = f"[{host}]" if ":" in host else host
        default_port = 443 if scheme == "https" else 80
        outgoing.setdefault(
            "Host",
            display_host if port == default_port else f"{display_host}:{port}",
        )
        conn.request(method.upper(), path, body=data, headers=outgoing)
        raw = conn.getresponse()
        if 300 <= raw.status < 400:
            raw.read()
            raise UnsafeURL(f"redirect refused (HTTP {raw.status})")
        declared = raw.getheader("Content-Length")
        if declared is not None:
            try:
                if int(declared) > max_bytes:
                    raise ResponseTooLarge("HTTP response exceeds configured size limit")
            except ValueError as exc:
                if isinstance(exc, ResponseTooLarge):
                    raise
                raise ValueError("invalid HTTP Content-Length") from exc
        body = raw.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise ResponseTooLarge("HTTP response exceeds configured size limit")
        if raise_for_status and raw.status >= 400:
            raise HTTPStatusError(raw.status, body)
        return Response(raw.status, raw.headers, body)
    finally:
        sock.close()