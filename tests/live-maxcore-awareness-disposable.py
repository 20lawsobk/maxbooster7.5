"""Manually verify local MaxCore awareness using disposable PostgreSQL.

Requires explicit approval because the public source adapters perform outbound
read-only requests. No model generation or provider-write credentials are passed.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

if len(sys.argv) != 4 or sys.argv[3] != "--allow-public-egress":
    raise SystemExit("Requires fixture, disposable PostgreSQL directory and --allow-public-egress")

root = Path(sys.argv[1]).resolve()
pg = Path(sys.argv[2]).resolve()
if not str(root).startswith("/tmp/npm-start-isolated-"):
    raise SystemExit("Application fixture must be under /tmp/npm-start-isolated-*")
if not str(pg).startswith("/tmp/npm-start-pg-"):
    raise SystemExit("Database fixture must be under /tmp/npm-start-pg-*")

source = Path(__file__).resolve().parents[1]
api_dir = root / "external/maxcore/artifacts/api-server"
entry = api_dir / "dist/index.mjs"
python = root / "python_runtime/bin/python3"
node = shutil.which("node")
if not entry.is_file() or not python.is_file() or not node:
    raise SystemExit("Disposable MaxCore bundle, interpreter, or Node is unavailable")
if not (pg / "socket").is_dir():
    raise SystemExit("Disposable PostgreSQL socket directory is missing")

LOCAL_PDIM_PORT = 5556
MAXCORE_API_PORT = 8090
MODEL_API_PORT = 9878
MODEL_API_HEALTH_PORT = 9879
ports = (LOCAL_PDIM_PORT, MAXCORE_API_PORT, MODEL_API_PORT, MODEL_API_HEALTH_PORT)
for port in ports:
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit("Refusing check because a required local MaxCore port is occupied")

base_db_url = f"postgresql://fixture@localhost:55436/postgres?host={pg}/socket"
db_url = base_db_url + "&options=-csearch_path%3Dmaxcore"
subprocess.run(
    ["psql", base_db_url, "-c", "CREATE SCHEMA IF NOT EXISTS maxcore"],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    timeout=10,
)

state_dir = pg / "maxcore-state"
(state_dir / "models").mkdir(parents=True, exist_ok=True)
pdim_token = secrets.token_urlsafe(48)
local_pdim_store = state_dir / "local-pdim-store.json"
prior_pdim_store_present = (
    local_pdim_store.is_file() and local_pdim_store.stat().st_size > 0
)
proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
pdim_env = {
    "PATH": os.environ["PATH"],
    "HOME": str(root),
    "NODE_ENV": "production",
    "LOCAL_PDIM_PORT": str(LOCAL_PDIM_PORT),
    "LOCAL_PDIM_STORE_FILE": str(local_pdim_store),
    "PDIM_LOCAL_CHANNEL_TOKEN": pdim_token,
    "SENTRY_DSN": "",
    "VITE_SENTRY_DSN": "",
}
if proxy:
    pdim_env["HTTPS_PROXY"] = proxy
local_pdim_entry = (
    "const pdim = await import('./server/lib/localPdimServer.ts');"
    "await pdim.startLocalPdimServer();"
    "const stop = async () => { await pdim.stopLocalPdimServer(); process.exit(0); };"
    "process.on('SIGTERM', stop); process.on('SIGINT', stop);"
)
env = {
    "PATH": os.environ["PATH"],
    "HOME": str(root),
    "NODE_ENV": "production",
    "PORT": str(MAXCORE_API_PORT),
    "MODEL_API_PORT": str(MODEL_API_PORT),
    "MODEL_API_HEALTH_PORT": str(MODEL_API_HEALTH_PORT),
    "SESSION_SECRET": secrets.token_hex(32),
    "DATABASE_URL": db_url,
    "STORAGE_HTTP_URL": (
        f"http://127.0.0.1:{LOCAL_PDIM_PORT}/api/redis/instances/local/exec"
    ),
    "PDIM_LOCAL_CHANNEL_TOKEN": pdim_token,
    "MAXBOOSTER_EMBEDDED": "1",
    "MAXBOOSTER_PYTHON": str(python),
    "MAXCORE_PRIVATE_STATE_DIR": str(state_dir),
    "MAXCORE_MODEL_STATE_DIR": str(state_dir / "models"),
    "LOCAL_PDIM_STORE_FILE": str(state_dir / "pdim.json"),
    "NODE_CLUSTER_WORKERS": "1",
    "MAXCORE_NODE_WORKER_HEAP_MB": "768",
    "MAXCORE_AWARENESS_USE_PROXY": "1",
    "MAXCORE_SERVING_RELEASE": "live-awareness",
    "MAXCORE_LOCAL": "1",
    "PDIM_FORCE_REMOTE": "0",
    "MAXCORE_NUM_STREAMS": "1",
    "UVICORN_WORKERS": "1",
    "UV_THREADPOOL_SIZE": "1",
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
    "VECLIB_MAXIMUM_THREADS": "1",
    "BLIS_NUM_THREADS": "1",
    "OMP_THREAD_LIMIT": "1",
    "OMP_MAX_ACTIVE_LEVELS": "1",
    "SENTRY_DSN": "",
    "VITE_SENTRY_DSN": "",
    "ENABLE_BACKUPS": "false",
    "ENABLE_FAN_DELIVERY_WORKER": "false",
    "ACME_ENABLED": "false",
    "DNS_NODE_LOCAL": "0",
}
if proxy:
    env["HTTPS_PROXY"] = proxy

opener = build_opener(ProxyHandler({}))
headers = {"Authorization": f"Bearer {pdim_token}"}
log_path = pg / "direct-maxcore-awareness.log"
process = None
forced_kill = False
exit_code = None
health_status = awareness_status = None
health_body = awareness_body = {}
snapshot_recovered = False

def get_json(path):
    try:
        with opener.open(
            Request(f"http://127.0.0.1:{MAXCORE_API_PORT}{path}", headers=headers),
            timeout=5,
        ) as response:
            try:
                body = json.loads(response.read(262_144))
            except (TypeError, ValueError):
                body = {}
            return response.status, body
    except HTTPError as error:
        try:
            body = json.loads(error.read(262_144))
        except (TypeError, ValueError):
            body = {}
        return error.code, body
    except (URLError, TimeoutError, OSError):
        return None, {}

def safe_code(value):
    if not isinstance(value, str):
        return None
    return value if re.fullmatch(r"[a-zA-Z0-9_:-]{1,80}", value) else "unclassified"

pdim_log_path = pg / "local-pdim-fixture.log"
pdim_process = None
pdim_exit_code = None
pdim_forced_kill = False
pdim_ready = False
with pdim_log_path.open("wb") as pdim_log:
    pdim_process = subprocess.Popen(
        [node, "--import", "tsx", "--input-type=module", "-e", local_pdim_entry],
        cwd=source,
        env=pdim_env,
        stdout=pdim_log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pdim_deadline = time.monotonic() + 15
    while time.monotonic() < pdim_deadline and pdim_process.poll() is None:
        with socket.socket() as sock:
            sock.settimeout(0.2)
            try:
                sock.connect(("127.0.0.1", LOCAL_PDIM_PORT))
                pdim_ready = True
                break
            except OSError:
                time.sleep(0.2)

with log_path.open("wb") as log:
    process = subprocess.Popen(
        [node, "dist/index.mjs"],
        cwd=api_dir,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.monotonic() + (270 if pdim_ready else 15)
    while time.monotonic() < deadline and process.poll() is None:
        health_status, health_body = get_json("/api/health")
        awareness_status, awareness_body = get_json("/api/awareness/unified/status")
        if prior_pdim_store_present and awareness_body.get("snapshot_id"):
            snapshot_recovered = True
        if awareness_status == 200 and awareness_body.get("ready") is True:
            break
        time.sleep(3)

    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            exit_code = process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            forced_kill = True
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            exit_code = process.wait(timeout=10)
    else:
        exit_code = process.returncode

if pdim_process and pdim_process.poll() is None:
    try:
        os.killpg(pdim_process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        pdim_exit_code = pdim_process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pdim_forced_kill = True
        try:
            os.killpg(pdim_process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        pdim_exit_code = pdim_process.wait(timeout=5)
else:
    pdim_exit_code = pdim_process.returncode if pdim_process else None

health = health_body if isinstance(health_body, dict) else {}
awareness = awareness_body if isinstance(awareness_body, dict) else {}
source_health = awareness.get("source_health")
if not isinstance(source_health, dict):
    source_health = {}
healthy_count = sum(
    1 for item in source_health.values()
    if isinstance(item, dict) and (
        item.get("ok") is True or item.get("status") in ("healthy", "ok", "success")
    )
)
failed_count = sum(
    1 for item in source_health.values()
    if isinstance(item, dict) and (
        item.get("ok") is False or item.get("status") in ("failed", "error", "unavailable")
    )
)
failure_categories = {}
failed_source_field_names = set()

def flatten_status_values(value):
    if isinstance(value, dict):
        return " ".join(flatten_status_values(child) for child in value.values())
    if isinstance(value, (list, tuple)):
        return " ".join(flatten_status_values(child) for child in value)
    if isinstance(value, (str, int, float)):
        return str(value).lower()
    return ""

for item in source_health.values():
    if not isinstance(item, dict) or not (
        item.get("ok") is False or item.get("status") in ("failed", "error", "unavailable")
    ):
        continue
    failed_source_field_names.update(
        key for key in item
        if key in {
            "ok", "status", "error", "failure", "last_error", "error_class",
            "error_code", "http_status", "status_code", "reason", "message", "type",
        }
    )
    detail = flatten_status_values(item)
    if "timeout" in detail or "timed out" in detail:
        category = "timeout"
    elif "429" in detail or "rate limit" in detail:
        category = "rate_limited"
    elif "403" in detail or "forbidden" in detail or "denied" in detail:
        category = "access_denied"
    elif "404" in detail or "not found" in detail:
        category = "not_found"
    elif re.search(r"\b5\d\d\b", detail):
        category = "upstream_5xx"
    elif any(word in detail for word in ("network", "connect", "dns", "ssl")):
        category = "network_error"
    elif any(word in detail for word in ("invalid", "parse", "schema")):
        category = "invalid_response"
    else:
        category = "unclassified"
    failure_categories[category] = failure_categories.get(category, 0) + 1
ports_released = True
for port in ports:
    with socket.socket() as sock:
        sock.settimeout(0.2)
        try:
            sock.connect(("127.0.0.1", port))
            ports_released = False
        except OSError:
            pass

try:
    log_text = log_path.read_text(errors="replace")
except OSError:
    log_text = ""
startup_failure = None
if "ModuleNotFoundError" in log_text:
    startup_failure = "python_dependency_missing"
elif "ECONNREFUSED" in log_text:
    startup_failure = "dependency_connection_refused"
elif "LiveModelUnavailable" in log_text and "Traceback (most recent call last)" in log_text:
    startup_failure = None
elif "Traceback (most recent call last)" in log_text:
    startup_failure = "python_startup_exception"
elif exit_code not in (None, 0):
    startup_failure = "service_exited_nonzero"

report = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "sourceRevision": subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=source, text=True,
        capture_output=True, check=True, timeout=5,
    ).stdout.strip(),
    "scope": "Local MaxCore health and awareness GETs; fixed public-source adapters only; disposable PostgreSQL",
    "modelLoaded": health.get("model_loaded") is True,
    "health": {
        "httpStatus": health_status,
        "status": health.get("status") if health.get("status") in ("healthy", "degraded", "unhealthy") else None,
    },
    "awareness": {
        "httpStatus": awareness_status,
        "ready": awareness.get("ready") is True,
        "running": awareness.get("running") is True,
        "ingestOwner": awareness.get("ingest_owner") is True,
        "phase": safe_code(awareness.get("phase")),
        "failureClass": safe_code(awareness.get("error")),
        "snapshotPresent": bool(awareness.get("snapshot_id")),
        "configuredSourceCount": (
            len(awareness.get("configured_sources", []))
            if isinstance(awareness.get("configured_sources"), list) else None
        ),
        "sourceHealthRecordCount": len(source_health),
        "healthySourceCount": healthy_count,
        "failedSourceCount": failed_count,
        "failedSourceCategories": failure_categories,
        "failedSourceFieldNames": sorted(failed_source_field_names),
        "snapshotRecoveredFromPriorStore": snapshot_recovered,
    },
    "refreshObserved": bool(
        awareness.get("snapshot_id") or source_health or awareness.get("phase") == "collecting_sources"
    ),
    "sentryDsnConfiguredForTest": False,
    "paymentOrDistributionCredentialsSupplied": False,
    "productionDatabaseUsed": False,
    "priorPdimStorePresent": prior_pdim_store_present,
    "localPdimBackendStarted": pdim_ready,
    "localPdimShutdownGraceful": pdim_exit_code == 0 and not pdim_forced_kill,
    "processExitCode": exit_code,
    "forcedKill": forced_kill,
    "pdimForcedKill": pdim_forced_kill,
    "portsReleased": ports_released,
    "startupFailureClass": startup_failure,
    "redactedLogRetained": True,
    "status": "passed" if (
        health_status == 200 and awareness_status == 200 and
        awareness.get("ready") is True and awareness.get("snapshot_id") and
        pdim_ready and not forced_kill and not pdim_forced_kill and
        pdim_exit_code == 0 and ports_released
    ) else "failed",
}
report_path = source / "reports/admin-gap-audit/live-awareness-direct.json"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
print(json.dumps({
    "status": report["status"],
    "healthHttpStatus": health_status,
    "awarenessHttpStatus": awareness_status,
    "modelLoaded": report["modelLoaded"],
    "awarenessReady": report["awareness"]["ready"],
    "snapshotPresent": report["awareness"]["snapshotPresent"],
    "phase": report["awareness"]["phase"],
    "sourceHealthRecordCount": len(source_health),
    "failedSourceCount": failed_count,
    "failedSourceCategories": failure_categories,
    "failedSourceFieldNames": sorted(failed_source_field_names),
    "snapshotRecoveredFromPriorStore": report["awareness"]["snapshotRecoveredFromPriorStore"],
    "localPdimBackendStarted": pdim_ready,
    "shutdownForced": forced_kill,
    "pdimShutdownForced": pdim_forced_kill,
    "portsReleased": ports_released,
    "report": report_path.relative_to(source).as_posix(),
}))
raise SystemExit(0 if report["status"] == "passed" else 1)
