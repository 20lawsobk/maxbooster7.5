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
from production_fixture_support import native_binary, wait_ports_released

root, pg = map(lambda value: Path(value).resolve(), sys.argv[1:3])
if not str(root).startswith("/tmp/npm-start-isolated-") or not str(pg).startswith("/tmp/npm-start-pg-"):
    raise SystemExit("Only disposable npm-start fixture directories are permitted")
if len(sys.argv) != 4 or not sys.argv[3].startswith("net:["):
    raise SystemExit("Pass the host network namespace ID captured before unshare")
if os.readlink("/proc/self/ns/net") == sys.argv[3]:
    raise SystemExit("Run in an isolated network namespace")
# Fail before starting the application when the copied production runtime is
# incomplete; a missing interpreter is not evidence about model capability.
native_binary(root)
python = root / "python_runtime/bin/python3"
if not python.is_file() or not os.access(python, os.X_OK):
    raise SystemExit("Production fixture requires executable python_runtime/bin/python3")
subprocess.run([str(python), "-I", "-B", "-c",
                "import numpy, PIL, fastapi, uvicorn, pydantic"],
               env={"PATH": os.environ["PATH"], "HOME": str(root)},
               check=True, timeout=20)
with socket.socket() as sock:
    fcntl.ioctl(sock, 0x8914, struct.pack("16sH", b"lo", 1))
env = {
    "PATH": os.environ["PATH"], "HOME": str(root), "NODE_ENV": "production",
    "STRIPE_SECRET_KEY": "sk_test_isolated_start_fixture",
    "PORT": "5000", "DISABLE_CLUSTER": "true", "SESSION_SECRET": secrets.token_hex(32),
    "DATABASE_URL": f"postgresql://fixture@localhost:55436/postgres?host={pg}/socket",
    "READINESS_ISOLATED_PG": "1", "READINESS_EGRESS_GUARD": "1",
}
responses = {}
runtime_ports = [5000, 5556, 8008, 8090, 9877, 9878, 9879, 9880]
wait_ports_released(runtime_ports, timeout=0)
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
                    with urllib.request.urlopen("http://127.0.0.1:5000" + route, timeout=10) as response:
                        responses[route] = {"status": response.status, "type": response.headers.get("Content-Type")}
                        if route == "/api/ready":
                            body = response.read()
                            Path("/tmp/npm-start-readiness.json").write_bytes(body)
                            payload = json.loads(body)
                            responses[route]["ready"] = (
                                payload.get("status") == "ok"
                                and payload.get("unifiedAwareness", {}).get("ready") is True
                            )
                except urllib.error.HTTPError as error:
                    responses[route] = {"status": error.code, "type": error.headers.get("Content-Type")}
                    if route == "/api/ready":
                        Path("/tmp/npm-start-readiness.json").write_bytes(error.read())
                except OSError as error:
                    # Never retain an earlier 200/503 as the latest observation.
                    responses[route] = {"error": type(error).__name__}
                    if route == "/api/ready":
                        Path("/tmp/npm-start-readiness.json").unlink(missing_ok=True)
            if responses.get("/", {}).get("status") == 200 and responses.get("/api/ready", {}).get("ready") is True:
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
                raise RuntimeError("Production shutdown exceeded 8s and required SIGKILL")
        wait_ports_released(runtime_ports)
if responses.get("/", {}).get("status") != 200:
    raise SystemExit("Built application did not serve its homepage")
if responses.get("/api/ready", {}).get("ready") is not True:
    raise SystemExit("Application readiness was not established")
