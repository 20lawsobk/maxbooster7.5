"""Run under `unshare -Urn` with disposable app and PostgreSQL directories.

Never uses workspace credentials. Both arguments must be private /tmp fixtures.
The PostgreSQL server must already be running with a Unix socket only.
"""
from concurrent.futures import ThreadPoolExecutor
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
from production_fixture_support import native_binary, udp_port_bound, wait_ports_released

root, pg = map(lambda value: Path(value).resolve(), sys.argv[1:3])
if not str(root).startswith("/tmp/npm-start-isolated-") or not str(pg).startswith("/tmp/npm-start-pg-"):
    raise SystemExit("Only disposable npm-start fixture directories are permitted")
if len(sys.argv) not in (4, 5) or not sys.argv[3].startswith("net:["):
    raise SystemExit("Pass the host network namespace ID captured before unshare")
cycle = int(sys.argv[4]) if len(sys.argv) == 5 else 1
if cycle not in (1, 2):
    raise SystemExit("Restart cycle must be 1 or 2")
if os.readlink("/proc/self/ns/net") == sys.argv[3]:
    raise SystemExit("Run in an isolated network namespace")
# Fail before starting the application when the copied production runtime is
# incomplete; a missing interpreter is not evidence about model capability.
native_binary(root)
python = root / "python_runtime/bin/python3"
if not python.is_file() or not os.access(python, os.X_OK):
    raise SystemExit("Production fixture requires executable python_runtime/bin/python3")
for relative in (".config", ".npm-cache", ".cache", "tmp", "maxcore-state", "pdim-results"):
    (root / relative).mkdir(parents=True, exist_ok=True)
subprocess.run([str(python), "-I", "-B", "-c",
                "import numpy, PIL, fastapi, uvicorn, pydantic"],
               env={"PATH": os.environ["PATH"], "HOME": str(root)},
               check=True, timeout=20)
with socket.socket() as sock:
    fcntl.ioctl(sock, 0x8914, struct.pack("16sH", b"lo", 1))
env = {
    "PATH": os.environ["PATH"], "HOME": str(root), "NODE_ENV": "production",
    "USER": "runner", "LOGNAME": "runner", "TMPDIR": str(root / "tmp"),
    "XDG_CONFIG_HOME": str(root / ".config"), "XDG_CACHE_HOME": str(root / ".cache"),
    "NPM_CONFIG_CACHE": str(root / ".npm-cache"),
    "STRIPE_SECRET_KEY": "sk_test_isolated_start_fixture",
    "PORT": "5000", "DISABLE_CLUSTER": "true", "SESSION_SECRET": secrets.token_hex(32),
    "DATABASE_URL": f"postgresql://fixture@localhost:55436/postgres?host={pg}/socket",
    "READINESS_ISOLATED_PG": "1", "READINESS_EGRESS_GUARD": "1",
    "MODEL_SINGLETON_LOCK": str(root / "maxcore-model-singleton.lock"),
    "DNS_AUTHORITY_PORT": "1053", "DNS_NODE_LOCAL_PORT": "5353",
    "DNS_NODE_LOCAL": "1", "DNS_NODE_LOCAL_HEALTH_PORT": "5380",
    "DNS_API_PORT": "8080", "LOCAL_PDIM_PORT": "5556",
    "VIDEO_DIFFUSION_PORT": "8008", "MAXCORE_LOCAL_PORT": "8090",
    "BOOSTERSTATE_SIDECAR_PORT": "9877", "MODEL_API_PORT": "9878",
    "MODEL_API_HEALTH_PORT": "9879", "PYTHON_AI_PORT": "9880",
    "ENABLE_LEGACY_AI_SIDECAR": "1", "MAXCORE_LOCAL": "1",
    "MAXCORE_SERVING_RELEASE": "live-awareness", "PDIM_FORCE_REMOTE": "0",
    "LOCAL_PDIM_STORE_FILE": str(root / "local-pdim-store.json"),
    "MAXCORE_PRIVATE_STATE_DIR": str(root / "maxcore-state"),
    "PDIM_RESULTS_DIR": str(root / "pdim-results"),
    "PDIM_RECOVERY_JOB_STORE_PATH": str(root / "pdim-recovery-jobs.json"),
    "DB_POOL_SIZE": "2", "MAXCORE_LOCAL_CLUSTER_WORKERS": "1",
    "ENABLE_BACKUPS": "false", "ENABLE_FAN_DELIVERY_WORKER": "false",
    "ACME_ENABLED": "false",
}
responses = {}
shutdown = {
    "signalRequested": None,
    "forcedKill": False,
    "processExitCode": None,
    "portsReleased": False,
}
runtime_ports = [1053, 5000, 5353, 5380, 5556, 8008, 8080, 8090, 9877, 9878, 9879, 9880]
udp_ports = [1053, 5353]
wait_ports_released(runtime_ports, timeout=15, udp_ports=udp_ports)
Path("/tmp/npm-start-bounded-load.json").unlink(missing_ok=True)
readiness_evidence_path = pg / f"readiness-cycle-{cycle}.json"
port_check_failures = []
load = None

def verify_configured_ports(stage, timeout_ms=30_000):
    health_specs = [
        ("web application", 5000, "/ready"),
        ("DNS API", 8080, "/ready"),
        ("local DNS health", 5380, "/health"),
        ("MaxCore diffusion gateway", 8008, "/health"),
        ("MaxCore API", 8090, "/healthz"),
        ("MaxCore model API", 9878, "/api/ready"),
        ("MaxCore model health", 9879, "/healthz"),
        ("MaxCore proxy sidecar", 9880, "/health"),
    ]

    def tcp_listening(port):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            return False

    deadline = time.monotonic() + timeout_ms / 1000
    missing_tcp = list(runtime_ports)
    missing_udp = list(udp_ports)
    while time.monotonic() <= deadline:
        missing_tcp = [port for port in runtime_ports if not tcp_listening(port)]
        missing_udp = [port for port in udp_ports if not udp_port_bound(port)]
        if not missing_tcp and not missing_udp:
            break
        time.sleep(0.5)
    if missing_tcp or missing_udp:
        detail = {
            "missingTcp": missing_tcp,
            "missingUdp": missing_udp,
            "timeoutMs": timeout_ms,
        }
        port_check_failures.append({"stage": stage, **detail})
        raise RuntimeError(f"Configured sockets did not all open {stage}: {detail}")

    def health_probe(spec):
        name, port, route = spec
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}{route}", timeout=2,
            ) as response:
                return {"name": name, "status": response.status}
        except urllib.error.HTTPError as error:
            return {"name": name, "status": error.code}
        except OSError:
            return {"name": name, "status": None}

    with ThreadPoolExecutor(max_workers=8) as workers:
        health_checks = list(workers.map(health_probe, health_specs))
    return {
        "ready": True,
        "count": len(runtime_ports),
        "tcpListeners": len(runtime_ports) - len(missing_tcp),
        "udpListeners": len(udp_ports) - len(missing_udp),
        "healthReady": all(item["status"] == 200 for item in health_checks),
        "healthChecks": health_checks,
    }

def failure_class(detail):
    value = str(detail or "").lower()
    if "control plane is not configured" in value or "not configured" in value:
        return "not_configured"
    if "econnrefused" in value or "connection refused" in value:
        return "connection_refused"
    if "timeout" in value or "timed out" in value:
        return "timeout"
    if "model" in value and ("not ready" in value or "not loaded" in value):
        return "model_not_ready"
    if "snapshot" in value and ("unavailable" in value or "missing" in value):
        return "fresh_snapshot_unavailable"
    if "initializ" in value:
        return "initializing"
    return "other" if value else None

def retain_redacted_readiness(http_status, body):
    try:
        payload = json.loads(body)
    except (TypeError, ValueError):
        payload = {}
    subsystems = payload.get("subsystems", [])
    unified = payload.get("unifiedAwareness", {})
    snapshot_present = bool(unified.get("snapshot_id"))
    awareness_ready = unified.get("ready") is True
    source_health = unified.get("latest_scan_health") or unified.get("source_health") or {}
    source_status_counts = {}
    if isinstance(source_health, dict):
        for state in source_health.values():
            if isinstance(state, dict):
                status = state.get("status")
                if isinstance(status, str):
                    source_status_counts[status] = source_status_counts.get(status, 0) + 1
    evidence = {
        "cycle": cycle,
        "httpStatus": http_status,
        "overallStatus": payload.get("status"),
        "subsystems": [
            {
                "name": item.get("name"),
                "status": item.get("status"),
                "failureClass": failure_class(item.get("detail")),
            }
            for item in subsystems if isinstance(item, dict)
        ],
        "unifiedAwareness": {
            "ready": unified.get("ready") is True,
            "status": unified.get("status"),
            "configuredSourceCount": (
                len(unified.get("configured_sources", []))
                if isinstance(unified.get("configured_sources"), list) else None
            ),
            "snapshotPresent": snapshot_present,
            "collectorRunning": unified.get("running") is True,
            "ingestOwner": unified.get("ingest_owner") is True,
            "sourceHealthStatusCounts": source_status_counts,
            "failureClass": (
                "fresh_snapshot_missing"
                if not awareness_ready and not snapshot_present
                else failure_class(unified.get("error") or unified.get("detail"))
            ),
        },
        "topLevelFailureClass": failure_class(payload.get("error")),
    }
    readiness_evidence_path.write_text(json.dumps(evidence, sort_keys=True) + "\n")
    return payload

with open("/tmp/npm-start-isolated-db.log", "w") as log:
    process = subprocess.Popen(["npm", "run", "start"], cwd=root, env=env,
                               stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        deadline = time.monotonic() + 300
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
                            payload = retain_redacted_readiness(response.status, body)
                            unified = payload.get("unifiedAwareness", {})
                            responses[route]["ready"] = (
                                payload.get("status") == "ok"
                                and unified.get("ready") is True
                            )
                            responses[route]["failureClass"] = (
                                "fresh_snapshot_missing"
                                if unified.get("ready") is not True and not unified.get("snapshot_id")
                                else failure_class(unified.get("error") or unified.get("detail"))
                            )
                except urllib.error.HTTPError as error:
                    responses[route] = {"status": error.code, "type": error.headers.get("Content-Type")}
                    if route == "/api/ready":
                        payload = retain_redacted_readiness(error.code, error.read())
                        unified = payload.get("unifiedAwareness", {})
                        responses[route]["ready"] = (
                            payload.get("status") == "ok"
                            and unified.get("ready") is True
                        )
                        responses[route]["failureClass"] = (
                            "fresh_snapshot_missing"
                            if unified.get("ready") is not True and not unified.get("snapshot_id")
                            else failure_class(unified.get("error") or unified.get("detail"))
                        )
                except OSError as error:
                    # Never retain an earlier 200/503 as the latest observation.
                    responses[route] = {"error": type(error).__name__}
                    if route == "/api/ready":
                        retain_redacted_readiness(None, json.dumps({
                            "status": "unreachable",
                            "error": type(error).__name__,
                        }))
            if responses.get("/", {}).get("status") == 200 and responses.get("/api/health", {}).get("status") == 200:
                if "configuredPortsAtLiveness" not in responses:
                    responses["configuredPortsAtLiveness"] = verify_configured_ports(
                        "after application liveness", timeout_ms=240_000,
                    )
                if responses.get("/api/ready", {}).get("ready") is True:
                    break
                # This isolated drill explicitly denies external traffic. Once
                # every listener is healthy, a missing live snapshot cannot be
                # repaired by waiting longer; retain the degraded readiness as
                # a separate, truthful result instead of timing out the launch.
                if responses.get("/api/ready", {}).get("failureClass") in {
                    "fresh_snapshot_missing", "not_configured",
                }:
                    break
        # Bounded public-read acceptance, separate from generation readiness.
        # SLOs come from tests/load/README.md; this is not a saturation/soak run.
        if responses.get("/", {}).get("status") == 200 and responses.get("/api/health", {}).get("status") == 200:
            def read_probe(index):
                route = "/api/health" if index % 2 else "/"
                started = time.monotonic()
                with urllib.request.urlopen("http://127.0.0.1:5000" + route, timeout=5) as reply:
                    if reply.status != 200:
                        raise RuntimeError("Bounded read probe returned unexpected status")
                    reply.read()
                return (time.monotonic() - started) * 1000
            with ThreadPoolExecutor(max_workers=8) as workers:
                latencies = sorted(workers.map(read_probe, range(96)))
            load = {"requests": 96, "concurrency": 8, "unexpected_responses": 0,
                    "p95_ms": round(latencies[91], 2), "p99_ms": round(latencies[95], 2),
                    "read_p95_limit_ms": 800, "read_p99_limit_ms": 1500,
                    "scope": "isolated compiled application homepage/health reads; not business/inference or worldwide capacity"}
            Path("/tmp/npm-start-bounded-load.json").write_text(json.dumps(load))
            if load["p95_ms"] >= 800 or load["p99_ms"] >= 1500:
                raise RuntimeError("Bounded public-read latency exceeded declared SLO")
            responses["configuredPortsAfterLoad"] = verify_configured_ports("after bounded load")
            responses["startCommandStillWaitingForFullReadiness"] = process.poll() is None
        print(json.dumps({"responses": responses, "exit": process.poll()}))
    finally:
        if process.poll() is None:
            shutdown["signalRequested"] = "SIGTERM"
            os.killpg(process.pid, signal.SIGTERM)
            try:
                shutdown["processExitCode"] = process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                shutdown["forcedKill"] = True
                os.killpg(process.pid, signal.SIGKILL)
                shutdown["processExitCode"] = process.wait()
                shutdown["portsReleased"] = False
                raise RuntimeError("Production shutdown exceeded 8s and required SIGKILL")
        else:
            shutdown["processExitCode"] = process.returncode
        wait_ports_released(runtime_ports, udp_ports=udp_ports)
        shutdown["portsReleased"] = True
        if readiness_evidence_path.exists():
            readiness_evidence = json.loads(readiness_evidence_path.read_text())
            readiness_evidence["shutdown"] = shutdown
            readiness_evidence["applicationAvailability"] = {
                "homepageStatus": responses.get("/", {}).get("status"),
                "healthStatus": responses.get("/api/health", {}).get("status"),
                "readinessStatus": responses.get("/api/ready", {}).get("status"),
                "readinessFailureClass": responses.get("/api/ready", {}).get("failureClass"),
                "configuredPortsAtLiveness": responses.get("configuredPortsAtLiveness"),
                "configuredPortsAfterLoad": responses.get("configuredPortsAfterLoad"),
                "startCommandStillWaitingForFullReadiness": responses.get(
                    "startCommandStillWaitingForFullReadiness",
                ),
                "portCheckFailures": port_check_failures,
                "boundedReadLoad": load,
            }
            readiness_evidence_path.write_text(json.dumps(readiness_evidence, sort_keys=True) + "\n")
if responses.get("/", {}).get("status") != 200:
    raise SystemExit("Built application did not serve its homepage")
if responses.get("/api/health", {}).get("status") != 200:
    raise SystemExit("Built application health endpoint did not return 200")
if not responses.get("configuredPortsAtLiveness", {}).get("ready"):
    raise SystemExit("All configured TCP and UDP sockets did not open")
if not responses.get("configuredPortsAfterLoad", {}).get("ready"):
    raise SystemExit("All configured TCP and UDP sockets did not remain open after load")
if shutdown["forcedKill"] or not shutdown["portsReleased"]:
    raise SystemExit("Production process did not stop cleanly and release its listeners")
