import json
from unittest.mock import patch

from secure_http import ResponseTooLarge
from server.services.diffusion.gen_engine_v2 import ltx_adapter


class _Response:
    def __init__(self, body: bytes):
        self.body = body

    def read(self) -> bytes:
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None


def test_finished_video_has_explicit_bound_and_oversize_is_failure(monkeypatch):
    monkeypatch.setenv("AI_SERVER_URL", "https://maxcore.example")
    generated = _Response(
        json.dumps({"url": "https://maxcore.example/video.mp4"}).encode()
    )
    calls = []

    def request(*args, **kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return generated
        raise ResponseTooLarge("too large")

    with patch.object(ltx_adapter, "secure_request", side_effect=request):
        result = ltx_adapter._maxcore_generate("prompt", 10, 24, 512, 512)

    assert result is None
    assert calls[1]["max_bytes"] == ltx_adapter._MAX_FINISHED_VIDEO_BYTES
    assert calls[1]["max_bytes"] > 64 * 1024 * 1024