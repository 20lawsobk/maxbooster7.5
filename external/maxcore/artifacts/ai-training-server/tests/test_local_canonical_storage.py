"""Private local PDIM transport contracts; no real service or SQLite opened."""
import json
from types import SimpleNamespace

import pytest

import storage_client as storage


@pytest.fixture
def canonical(monkeypatch):
    monkeypatch.setenv("PDIM_LOCAL_CHANNEL_TOKEN", "test-channel-secret")
    monkeypatch.delenv("PDIM_FORCE_REMOTE", raising=False)
    monkeypatch.setattr(storage, "STORAGE_HTTP_URL",
                        "http://127.0.0.1:5999/api/redis/instances/local/exec")
    monkeypatch.setattr(storage, "STORAGE_BEARER_TOKEN", "stale-external-token")
    monkeypatch.setattr(storage.threading.Thread, "start", lambda self: None)
    monkeypatch.setattr(storage, "_DiskStore",
                        lambda: pytest.fail("canonical mode must not open SQLite"))
    values = {}
    calls = []

    def transport(method, url, *, origin, body, headers, timeout, max_bytes):
        assert origin.local_only
        assert max_bytes == 50 * 1024 * 1024
        assert headers["Authorization"] == "Bearer test-channel-secret"
        command = json.loads(body)
        cmd, args = command["cmd"], command["args"]
        calls.append(cmd)
        if cmd == "PING":
            result = "PONG"
        elif cmd == "SET":
            values[args[0]] = args[1]
            result = "OK"
        elif cmd == "GET":
            result = values.get(args[0])
        elif cmd == "LRANGE":
            result = values.get(args[0], [])
        else:
            raise AssertionError(cmd)
        return SimpleNamespace(status=200, body=json.dumps({"result": result}).encode())

    monkeypatch.setattr(storage, "trusted_request", transport)
    return storage.StorageClient(), values, calls


def test_canonical_missing_value_never_replays_stale_local_copy(canonical):
    client, values, calls = canonical
    assert client.set("item", {"real": 1})
    assert client.get("item") == {"real": 1}
    values.clear()  # authoritative expiry/deletion
    assert client.get("item") is None
    assert client._fallback == {}
    assert client._disk is None
    assert client.disk_store_available is False


def test_canonical_failure_is_explicit_not_sqlite_success(canonical, monkeypatch):
    client, _, _ = canonical
    monkeypatch.setattr(storage, "trusted_request", lambda *a, **k:
                        SimpleNamespace(status=503, body=b'{"error":"offline"}'))
    with pytest.raises(storage.StorageUnavailable, match="no fallback"):
        client.set("item", "value")
    with pytest.raises(storage.StorageUnavailable, match="no fallback"):
        client.mget("one", "two", "three", "four")
    assert client._fallback == {}
    assert client.status()["available"] is False


def test_curriculum_read_distinguishes_authoritative_empty_from_failure(canonical, monkeypatch):
    client, _, _ = canonical
    curriculum = storage.CurriculumStateClient(client)

    assert curriculum.get_user_curriculum("creator-1") == []

    monkeypatch.setattr(
        storage,
        "trusted_request",
        lambda *a, **k: SimpleNamespace(status=503, body=b'{"error":"offline"}'),
    )
    with pytest.raises(storage.StorageUnavailable):
        curriculum.get_user_curriculum("creator-1")


def test_legacy_curriculum_read_does_not_use_empty_fallback_on_pdim_failure(monkeypatch):
    monkeypatch.delenv("PDIM_LOCAL_CHANNEL_TOKEN", raising=False)
    monkeypatch.setenv("PDIM_FORCE_REMOTE", "1")
    monkeypatch.setattr(
        storage,
        "STORAGE_HTTP_URL",
        "https://storage.example.invalid/api/redis/instances/test/exec",
    )
    monkeypatch.setattr(storage, "STORAGE_BEARER_TOKEN", "test-remote-token")
    monkeypatch.setattr(storage.threading.Thread, "start", lambda self: None)
    monkeypatch.setattr(storage, "_DiskStore", lambda: None)
    monkeypatch.setattr(storage, "_get_ping_pool", lambda: None)
    monkeypatch.setattr(storage, "_get_pool", lambda: None)
    monkeypatch.setattr(
        storage,
        "validated_origin",
        lambda url, local_only=False: SimpleNamespace(local_only=local_only),
    )
    monkeypatch.setattr(
        storage,
        "trusted_request",
        lambda *a, **k: SimpleNamespace(status=503, body=b'{"error":"offline"}'),
    )

    client = storage.StorageClient()
    stale_local_value = [{"user_id": "creator-1", "engagement_rate": 0.9}]
    client._fallback["mb:curriculum:creator-1:feedback"] = stale_local_value

    with pytest.raises(storage.StorageUnavailable):
        storage.CurriculumStateClient(client).get_user_curriculum("creator-1")
    assert client._fallback["mb:curriculum:creator-1:feedback"] == stale_local_value


def test_local_secret_cannot_be_sent_to_stale_external_origin(monkeypatch):
    monkeypatch.setenv("PDIM_LOCAL_CHANNEL_TOKEN", "test-channel-secret")
    monkeypatch.delenv("PDIM_FORCE_REMOTE", raising=False)
    monkeypatch.setattr(storage, "STORAGE_HTTP_URL", "https://external.example/exec")
    with pytest.raises(Exception, match="loopback"):
        storage.StorageClient()


def test_raw_owner_wire_protocol_over_loopback_http(monkeypatch):
    """Exercise real trusted transport against the owner's raw JSON protocol."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import threading

    values = {}
    seen = []

    class Owner(BaseHTTPRequestHandler):
        def do_POST(self):
            assert self.headers["Authorization"] == "Bearer wire-test-secret"
            command = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            cmd, args = command["cmd"], command["args"]
            seen.append(cmd)
            status = 200
            if cmd == "PING":
                result = "PONG"
            elif cmd == "SET":
                values[args[0]] = args[1]
                result = "OK"
            elif cmd == "GET":
                result = "a" * (8 * 1024 * 1024 + 1) if args[0] == "mb:media" else values.get(args[0])
            elif cmd == "HGETALL":
                result = {"field": '{"value": 3}'}
            elif cmd == "LRANGE":
                result = ["one", "two"]
            elif cmd == "EXISTS":
                result = 0
            else:
                status, result = 400, {"error": "unsupported command"}
            payload = json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    owner = HTTPServer(("127.0.0.1", 0), Owner)
    thread = threading.Thread(target=owner.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("PDIM_LOCAL_CHANNEL_TOKEN", "wire-test-secret")
    monkeypatch.delenv("PDIM_FORCE_REMOTE", raising=False)
    monkeypatch.setattr(storage, "STORAGE_HTTP_URL",
                        f"http://127.0.0.1:{owner.server_port}/api/redis/instances/local/exec")
    monkeypatch.setattr(storage.StorageClient, "_periodic_health_check", lambda self: None)
    try:
        client = storage.StorageClient()
        assert client.ping()
        assert client.set("real", {"value": 7})
        assert client.get("real") == {"value": 7}
        assert client.get("missing") is None
        assert len(client.get("media")) == 8 * 1024 * 1024 + 1
        assert client.hgetall("hash") == {"field": {"value": 3}}
        assert client.lrange("list", 0, -1) == ["one", "two"]
        assert not client.exists("missing")
        with pytest.raises(storage.StorageUnavailable):
            client._exec("UNSUPPORTED")
        assert {"PING", "SET", "GET", "HGETALL", "LRANGE", "EXISTS"} <= set(seen)
    finally:
        owner.shutdown()
        owner.server_close()
        thread.join(timeout=2)