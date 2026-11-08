#!/usr/bin/env python3
"""Fail closed on non-UTF-8 publishing-root names without deleting user data."""
import os
from pathlib import Path
import sys


def invalid_utf8_names(names):
    invalid = []
    for name in names:
        try:
            name.decode("utf-8")
        except UnicodeDecodeError:
            invalid.append(name.hex())
    return invalid


def verify_utf8_root(workspace):
    root = Path(workspace).resolve(strict=True)
    if not root.is_dir():
        raise RuntimeError("publishing workspace root is not a directory")
    invalid = invalid_utf8_names(os.listdir(os.fsencode(root)))
    if invalid:
        sample = ", ".join(invalid[:10])
        raise RuntimeError(
            f"unsupported non-UTF-8 root filename(s), bytes in hex: {sample}; "
            "refusing to delete source files"
        )
    print("   Root filename encoding verified; no files were removed.")
    return True


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-utf8-root.py <publishing-workspace-root>")
    verify_utf8_root(sys.argv[1])
