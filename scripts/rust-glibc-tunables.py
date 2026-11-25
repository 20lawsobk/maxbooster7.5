#!/usr/bin/env python3
"""Merge the minimum glibc tunables required by the pinned Rust compiler."""

from __future__ import annotations

import sys

STATIC_TLS_TUNABLE = "glibc.rtld.optional_static_tls"
MINIMUM_STATIC_TLS_BYTES = 131072


def parse_size(value: str) -> int:
    try:
        if value.lower().startswith("0x"):
            parsed = int(value[2:], 16)
        else:
            parsed = int(value, 10)
    except ValueError as error:
        raise ValueError(
            f"{STATIC_TLS_TUNABLE} must be a nonnegative decimal or hexadecimal size"
        ) from error

    if parsed < 0:
        raise ValueError(f"{STATIC_TLS_TUNABLE} must not be negative")
    return parsed


def merge_glibc_tunables(current: str) -> str:
    preserved: list[str] = []
    static_tls_bytes = MINIMUM_STATIC_TLS_BYTES

    for entry in current.split(":"):
        if not entry:
            continue

        name, separator, value = entry.partition("=")
        if not separator or not name:
            raise ValueError("GLIBC_TUNABLES entries must use name=value syntax")

        if name == STATIC_TLS_TUNABLE:
            static_tls_bytes = max(static_tls_bytes, parse_size(value))
        else:
            preserved.append(entry)

    preserved.append(f"{STATIC_TLS_TUNABLE}={static_tls_bytes}")
    return ":".join(preserved)


if __name__ == "__main__":
    if len(sys.argv) > 2:
        raise SystemExit("Usage: rust-glibc-tunables.py [existing-tunables]")
    try:
        print(merge_glibc_tunables(sys.argv[1] if len(sys.argv) == 2 else ""))
    except ValueError as error:
        raise SystemExit(str(error)) from error
