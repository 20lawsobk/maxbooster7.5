"""Run under `unshare -Urn` with disposable app and PostgreSQL directories.

Never uses workspace credentials. Both arguments must be private /tmp fixtures.
The PostgreSQL server must already be running with a Unix socket only.
"""
import fcntl
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request

root, pg = map(lambda value: Path(value).resolve(), sys.argv[1:3])
if not str(root).startswith("/tmp/npm-start-isolated-") or not str(pg).startswith("/tmp/npm-start-pg-"):
    raise SystemExit("Only disposable npm-start fixture directories are permitted")
if len(sys.argv) != 4 or not sys.argv[3].startswith("net:["):
    raise SystemExit("Pass the host network namespace ID captured before unshare")
if os.readlink("/proc/self/ns/net") == sys.argv[3]:
    raise SystemExit("Run in an isolated network namespace")
with socket.socket() as sock:
    fcntl.ioctl(sock, 0x8914, struct.pack("16sH", b"lo", 1))
env = {
    "PATH": os.environ["PATH"], "HOME": str(root), "NODE_ENV": "production",
    "PORT": "5012", "DISABLE_CLUSTER": "true", "SESSION_SECRET": secrets.token_hex(32),
    "DATABASE_URL": f"postgresql://fixture@localhost:55436/postgres?host={pg}/socket",
    "READINESS_ISOLATED_PG": "1", "READINESS_EGRESS_GUARD": "1",
}
responses = {}
Path("/tmp/npm-start-readiness.json").unlink(missing_ok=True)
with open("/tmp/npm-start-isolated-db.log", "w") as log:
    process = subprocess.Popen(["npm", "run", "start"], cwd=root, env=env,
                               stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            time.sleep(1)
            if process.poll() is not None:
                break
            for route in ["/", "/api/ready", "/api/health"]:
                try:
                    # Registry probes (3s) precede awareness (5s).
                    with urllib.request.urlopen("http://127.0.0.1:5012" + route, timeout=10) as response:
                        responses[route] = {"status": response.status, "type": response.headers.get("Content-Type")}
                except urllib.error.HTTPError as error:
                    responses[route] = {"status": error.code, "type": error.headers.get("Content-Type")}
                    if route == "/api/ready":
                        Path("/tmp/npm-start-readiness.json").write_bytes(error.read())
                except OSError as error:
                    # Never retain an earlier 200/503 as the latest observation.
                    responses[route] = {"error": type(error).__name__}
                    if route == "/api/ready":
                        Path("/tmp/npm-start-readiness.json").unlink(missing_ok=True)
            if responses.get("/", {}).get("status") == 200 and responses.get("/api/ready", {}).get("status") == 200:
                break
        print(json.dumps({"responses": responses, "exit": process.poll()}))
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
if responses.get("/", {}).get("status") != 200:
    raise SystemExit("Built application did not serve its homepage")
if responses.get("/api/ready", {}).get("status") != 200:
    raise SystemExit("Application readiness was not established")
