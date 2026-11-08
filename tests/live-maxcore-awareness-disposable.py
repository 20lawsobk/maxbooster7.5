"""Manually verify local MaxCore awareness using disposable PostgreSQL.

Requires explicit approval because the public source adapters perform outbound
read-only requests. No model generation or provider-write credentials are passed.
"""
from datetime import datetime, timezone
import hashlib
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


def source_summary(source_health):
    if not isinstance(source_health, dict):
        source_health = {}
    healthy = 0
    failures = []
    categories = {}
    actions = {
        "access_denied": "Respect the source access decision; do not retry with credentials.",
        "dns_resolution_failed": "Retry after DNS recovery; do not substitute an unverified endpoint.",
        "not_found": "Treat this public URL as unavailable; verify a published feed before changing it.",
        "invalid_response": "Review the public feed format and parser; retain no unvalidated content.",
        "invalid_json": "Review the public JSON contract; retain no unvalidated content.",
        "invalid_feed": "Review the public feed format; retain no unvalidated content.",
        "unsafe_feed_markup": "Keep DTD/entity rejection; request a safe public feed from the publisher.",
        "feed_structure_limit": "Keep XML size and nesting limits; request a bounded public feed.",
        "rate_limited": "Retry only after the source's rate limit permits.",
        "upstream_error": "Treat the source service as temporarily unavailable and retry later.",
        "source_timeout": "Retry the public read in a later scan.",
        "network_unavailable": "Retry after network recovery; do not weaken URL or TLS validation.",
    }
    for source, item in sorted(source_health.items()):
        if not isinstance(source, str) or not isinstance(item, dict):
            continue
        if item.get("ok") is True:
            healthy += 1
            continue
        if item.get("ok") is not False:
            continue
        code = safe_code(item.get("failure_class") or item.get("error")) or "unclassified"
        status = item.get("http_status")
        if type(status) is not int or not 100 <= status <= 599:
            status = None
        categories[code] = categories.get(code, 0) + 1
        failures.append({
            "source": safe_code(source) or "unclassified_source",
            "domain": safe_code(item.get("domain")),
            "failureClass": code,
            "httpStatus": status,
            "suggestedAction": actions.get(
                code, "Review the source-specific health code; do not retain raw response data."
            ),
        })
    return {
        "recordCount": len(source_health),
        "healthyCount": healthy,
        "failedCount": len(failures),
        "failedCategories": categories,
        "failures": failures,
    }


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
        latest_health = awareness_body.get("latest_scan_health")
        scan_state = awareness_body.get("source_scan_state")
        expected_count = (
            len(awareness_body.get("configured_sources", []))
            if isinstance(awareness_body.get("configured_sources"), list) else None
        )
        terminal_scan = (
            scan_state in ("complete", "failed")
            and isinstance(latest_health, dict)
            and len(latest_health) == expected_count
        )
        if (awareness_status == 200 and awareness_body.get("ready") is True
                and terminal_scan):
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
snapshot_source_health = awareness.get("snapshot_source_health")
if not isinstance(snapshot_source_health, dict):
    snapshot_source_health = awareness.get("source_health")
latest_source_health = awareness.get("latest_scan_health")
snapshot_health_summary = source_summary(snapshot_source_health)
latest_health_summary = source_summary(latest_source_health)
source_scan_state = safe_code(awareness.get("source_scan_state"))
configured_source_count = (
    len(awareness.get("configured_sources", []))
    if isinstance(awareness.get("configured_sources"), list) else None
)
latest_scan_complete = (
    source_scan_state == "complete"
    and latest_health_summary["recordCount"] == configured_source_count
)
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
    "sourceInputsSha256": {
        name: hashlib.sha256((source / name).read_bytes()).hexdigest()
        for name in (
            "external/maxcore/artifacts/ai-training-server/ai_model/awareness/engine.py",
            "external/maxcore/artifacts/ai-training-server/ai_model/awareness/sources.py",
            "tests/live-maxcore-awareness-disposable.py",
        )
    },
    "scope": "Local MaxCore health and awareness GETs; fixed public-source adapters only; disposable PostgreSQL",
    "modelLoaded": health.get("model_loaded") is True,
    "health": {
        "httpStatus": health_status,
        "status": health.get("status") if health.get("status") in ("healthy", "degraded", "unhealthy") else None,
    },
    "awareness": {
        "httpStatus": awareness_status,
        "ready": awareness.get("ready") is True,
        "snapshotReady": awareness.get("snapshot_ready", awareness.get("ready")) is True,
        "running": awareness.get("running") is True,
        "ingestOwner": awareness.get("ingest_owner") is True,
        "phase": safe_code(awareness.get("phase")),
        "sourceScanState": source_scan_state,
        "sourceScanInProgress": awareness.get("source_scan_in_progress") is True,
        "failureClass": safe_code(awareness.get("error")),
        "snapshotPresent": bool(awareness.get("snapshot_id")),
        "configuredSourceCount": configured_source_count,
        "snapshotSourceHealth": snapshot_health_summary,
        "latestScanHealth": latest_health_summary,
        "latestScanComplete": latest_scan_complete,
        "snapshotRecoveredFromPriorStore": snapshot_recovered,
    },
    "refreshObserved": bool(
        awareness.get("snapshot_id") or latest_health_summary["recordCount"]
        or awareness.get("phase") == "collecting_sources"
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
    "redactedSourceFailureEvidenceRetained": bool(
        latest_scan_complete and latest_health_summary["recordCount"]
    ),
    "status": (
        "failed" if not (
            health_status == 200 and awareness_status == 200 and
            awareness.get("ready") is True and awareness.get("snapshot_id") and
            latest_scan_complete and pdim_ready and not forced_kill and
            not pdim_forced_kill and pdim_exit_code == 0 and ports_released
        ) else "passed_with_source_failures"
        if latest_health_summary["failedCount"] else "passed"
    ),
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
    "sourceScanState": source_scan_state,
    "latestScanHealth": latest_health_summary,
    "snapshotSourceHealth": snapshot_health_summary,
    "snapshotRecoveredFromPriorStore": report["awareness"]["snapshotRecoveredFromPriorStore"],
    "localPdimBackendStarted": pdim_ready,
    "shutdownForced": forced_kill,
    "pdimShutdownForced": pdim_forced_kill,
    "portsReleased": ports_released,
    "report": report_path.relative_to(source).as_posix(),
}))
raise SystemExit(0 if report["status"] in ("passed", "passed_with_source_failures") else 1)
