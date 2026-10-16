"""Exercise the compiled DNS artifact without credentials or network egress."""
import fcntl
import json
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

if len(sys.argv) != 2 or os.readlink("/proc/self/ns/net") == sys.argv[1]:
    raise SystemExit("Run with unshare -Urn and pass the original network namespace ID")
with socket.socket() as sock:
    fcntl.ioctl(sock, 0x8914, struct.pack("16sH", b"lo", 1))
entry = Path("dist/dns-node.mjs").resolve()
if not entry.is_file():
    raise SystemExit("Run npm run build first")
with tempfile.TemporaryDirectory(prefix="dns-production-smoke-") as directory:
    zone = Path(directory) / "zone.json"
    zone.write_text(json.dumps({"domain": "example.invalid", "serial": 1,
                               "records": [{"type": "A", "name": "@",
                                            "value": "192.0.2.1", "ttl": 60}]}))
    env = {"PATH": os.environ["PATH"], "HOME": directory, "NODE_ENV": "production",
           "DNS_PORT": "15353", "DNS_HOST": "127.0.0.1",
           "HEALTH_PORT": "15380", "HEALTH_HOST": "127.0.0.1",
           "ZONE_FILE": str(zone), "DNSSEC_ENABLED": "false", "BGP_ENABLED": "false"}
    with open("/tmp/dns-production-smoke.log", "w") as log:
        child = subprocess.Popen(["node", str(entry)], cwd=directory, env=env,
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            for _ in range(40):
                if child.poll() is not None:
                    raise RuntimeError("Compiled DNS process exited; inspect /tmp/dns-production-smoke.log")
                try:
                    with urllib.request.urlopen("http://127.0.0.1:15380/health", timeout=.5) as response:
                        assert json.load(response)["ok"] is True
                    break
                except OSError:
                    time.sleep(.25)
            else:
                raise RuntimeError("Compiled DNS health did not become ready")
            question = (struct.pack("!6H", 1234, 0, 1, 0, 0, 0) +
                        b"\x07example\x07invalid\x00" + struct.pack("!HH", 1, 1))
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                udp.settimeout(2)
                udp.sendto(question, ("127.0.0.1", 15353))
                answer = udp.recv(4096)
                ident, flags, _, answers, _, _ = struct.unpack("!6H", answer[:12])
                assert ident == 1234 and flags & 15 == 0 and answers == 1
            with socket.create_connection(("127.0.0.1", 15353), timeout=2) as tcp:
                tcp.sendall(struct.pack("!H", len(question)) + question)
                assert tcp.recv(4096), "TCP DNS returned no answer"
            print("PASS: compiled production DNS health, UDP answer, TCP response; no tsx")
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
