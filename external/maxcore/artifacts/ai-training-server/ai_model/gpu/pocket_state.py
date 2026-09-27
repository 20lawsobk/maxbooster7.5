"""Lossless GPU state on the canonical PDIM Redis HTTP channel.

No SQLite/in-memory fallback. PDIM owns recursive fabric/capsule persistence;
this client only chunks transport payloads and publishes a checked manifest.
"""
import base64
import hashlib
import json
import os
from urllib.parse import urlsplit

import numpy as np

from trusted_http import request, validated_origin


class PDIMStateStore:
    def __init__(self, url=None, token=None, namespace=None):
        self.url = url or os.environ.get("STORAGE_HTTP_URL", "")
        self._token = token or os.environ.get("STORAGE_BEARER_TOKEN", "")
        self.namespace = namespace or os.environ.get("STORAGE_INSTANCE", "max-booster-training")
        if not self.url or not self._token:
            raise RuntimeError("GPU state requires canonical PDIM URL and private channel token")
        if (os.environ.get("PDIM_FORCE_REMOTE") != "1"
                and urlsplit(self.url).hostname not in {"127.0.0.1", "localhost", "::1"}):
            raise RuntimeError("Local GPU state requires the canonical loopback PDIM endpoint")
        self._origin = validated_origin(
            self.url, local_only=os.environ.get("PDIM_FORCE_REMOTE") != "1")

    def _exec(self, cmd, *args):
        response = request(
            "POST", self.url, origin=self._origin,
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
            body=json.dumps({"cmd": cmd, "args": list(args)}).encode(),
            timeout=30,
        )
        if not 200 <= response.status < 300:
            raise RuntimeError(f"GPU PDIM {cmd} failed (HTTP {response.status})")
        result = json.loads(response.body)
        if isinstance(result, dict):
            if "error" in result or "result" not in result:
                raise RuntimeError(f"GPU PDIM {cmd} returned an invalid/error response")
            return result["result"]
        # The local canonical owner returns the raw Redis result. Remote
        # compatible exec APIs may instead envelope it as {"result": ...}.
        return result

    def set(self, key, value):
        raw = json.dumps(value, separators=(",", ":"), allow_nan=False).encode()
        chunks = []
        # Content-addressed chunks are shared through the canonical store.
        for offset in range(0, len(raw), 192 * 1024):
            chunk = raw[offset:offset + 192 * 1024]
            digest = hashlib.sha256(chunk).hexdigest()
            chunk_key = f"{self.namespace}:gpu:chunk:{digest}"
            if self._exec("CAPSULE.SET", chunk_key, base64.b64encode(chunk).decode()) != "OK":
                raise RuntimeError("GPU PDIM rejected state chunk")
            chunks.append(digest)
        manifest = {"version": 1, "chunks": chunks, "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest()}
        if self._exec("CAPSULE.SET", f"{self.namespace}:{key}", json.dumps(manifest)) != "OK":
            raise RuntimeError("GPU PDIM rejected state manifest")
        return True

    def get(self, key):
        raw = self._exec("CAPSULE.GET", f"{self.namespace}:{key}")
        if raw is None:
            return None
        manifest = json.loads(raw)
        if manifest.get("version") != 1:
            raise ValueError("Unsupported GPU state manifest")
        parts = []
        for digest in manifest["chunks"]:
            chunk = self._exec("CAPSULE.GET", f"{self.namespace}:gpu:chunk:{digest}")
            if chunk is None:
                raise RuntimeError("GPU PDIM state chunk is missing")
            decoded = base64.b64decode(chunk, validate=True)
            if hashlib.sha256(decoded).hexdigest() != digest:
                raise ValueError("GPU PDIM state chunk checksum mismatch")
            parts.append(decoded)
        payload = b"".join(parts)
        if len(payload) != manifest["bytes"] or hashlib.sha256(payload).hexdigest() != manifest["sha256"]:
            raise ValueError("GPU PDIM state manifest checksum mismatch")
        return json.loads(payload)


def encode_array(array):
    shape = list(array.shape)
    array = np.ascontiguousarray(array)
    if array.dtype.hasobject or array.dtype.fields is not None:
        raise ValueError("GPU state requires a plain numeric dtype")
    return {"dtype": array.dtype.str, "shape": shape,
            "data": base64.b64encode(array.tobytes()).decode("ascii")}


def decode_array(record):
    dtype = np.dtype(record["dtype"])
    shape = record["shape"]
    if dtype.hasobject or dtype.fields is not None or any(type(n) is not int or n < 0 for n in shape):
        raise ValueError("Invalid GPU state dtype/shape")
    raw = base64.b64decode(record["data"], validate=True)
    import math
    if len(raw) != math.prod(shape) * dtype.itemsize:
        raise ValueError("GPU state byte length does not match dtype/shape")
    return np.frombuffer(raw, dtype=dtype).copy().reshape(shape)