"""One-shot public-awareness refresh in a disposable app/database fixture.

This is an explicitly manual live check, not a CI test. It supplies no payment,
social, marketing, or search-provider credentials; only the fixed anonymous
public adapters in MaxCore's awareness source registry can make outbound reads.
Run only after separate approval, with --allow-public-egress.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

local_http = build_opener(ProxyHandler({}))

if len(sys.argv) != 4 or sys.argv[3] != "--allow-public-egress":
    raise SystemExit("Requires fixture, disposable PostgreSQL directory and --allow-public-egress")

root = Path(sys.argv[1]).resolve()
pg = Path(sys.argv[2]).resolve()
if not str(root).startswith("/tmp/npm-start-isolated-"):
    raise SystemExit("Application fixture must be under /tmp/npm-start-isolated-*")
if not str(pg).startswith("/tmp/npm-start-pg-"):
    raise SystemExit("Database fixture must be under /tmp/npm-start-pg-*")
if not (root / "package.json").is_file() or not (pg / "socket").is_dir():
    raise SystemExit("Fixture or disposable PostgreSQL socket is missing")

source = Path(__file__).resolve().parents[1]
runtime_ports = {
    "PORT": "5000",
    "LOCAL_PDIM_PORT": "5556",
    "VIDEO_DIFFUSION_PORT": "8008",
    "MAXCORE_LOCAL_PORT": "8090",
    "BOOSTERSTATE_SIDECAR_PORT": "9877",
    "MODEL_API_PORT": "9878",
    "MODEL_API_HEALTH_PORT": "9879",
    "PYTHON_AI_PORT": "9880",
}

busy_ports = []
for port in runtime_ports.values():
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", int(port)))
        except OSError:
            busy_ports.append(int(port))
if busy_ports:
    raise SystemExit("Refusing live check because a required isolated test port is occupied")

def http_json(url, timeout=3, headers=None):
    try:
        request = Request(url, headers=headers or {})
        with local_http.open(request, timeout=timeout) as response:
            body = response.read(1_048_576)
            try:
                payload = json.loads(body)
            except (TypeError, ValueError):
                payload = {}
            return response.status, payload
    except HTTPError as error:
        try:
            body = error.read(1_048_576)
            try:
                payload = json.loads(body)
            except (TypeError, ValueError):
                payload = {}
            return error.code, payload
        except (ValueError, OSError):
            return error.code, {}
    except (URLError, TimeoutError, OSError, ValueError):
        return None, {}

def remote_maxcore_probe():
    # The child reads the configured endpoint and bearer key but emits only
    # status fields; neither value nor response content is logged or retained.
    js = r"""
const base = process.env.AI_SERVER_URL?.trim();
if (!base) {
  console.log(JSON.stringify({configuredEndpointAvailable:false}));
  process.exit(0);
}
const key = process.env.AI_SERVER_KEY ?? "";
const origin = base.replace(/\/+$/, "");
async function probe(path, awareness=false) {
  try {
    const response = await fetch(origin + path, {
      method: "GET",
      headers: key ? {Authorization: `Bearer ${key}`} : {},
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!awareness) return {
      httpStatus: response.status,
      status: body.status === "healthy" ? "healthy" : null,
      modelLoaded: body.model_loaded === true,
    };
    const health = body.source_health && typeof body.source_health === "object"
      ? Object.values(body.source_health) : [];
    return {
      httpStatus: response.status,
      ready: body.ready === true,
      running: body.running === true,
      configuredSourceCount: Array.isArray(body.configured_sources)
        ? body.configured_sources.length : null,
      snapshotPresent: typeof body.snapshot_id === "string" && body.snapshot_id.length > 0,
      healthySourceCount: health.filter(item => item?.ok === true).length,
      failedSourceCount: health.filter(item => item?.ok === false).length,
    };
  } catch (error) {
    return {httpStatus:null, errorClass:error?.name === "TimeoutError" ? "timeout" : "network_error"};
  }
}
console.log(JSON.stringify({
  configuredEndpointAvailable:true,
  health:await probe("/api/health"),
  awareness:await probe("/api/awareness/unified/status", true),
}));
"""
    try:
        remote_env = {"PATH": os.environ["PATH"]}
        for name in ("AI_SERVER_URL", "AI_SERVER_KEY"):
            if name in os.environ:
                remote_env[name] = os.environ[name]
        result = subprocess.run(
            ["node", "--input-type=module", "-e", js],
            env=remote_env, capture_output=True, text=True, timeout=30, check=False,
        )
        if result.returncode == 0:
            return json.loads(result.stdout.strip().splitlines()[-1])
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        pass
    return {"configuredEndpointAvailable": None, "probeError": "probe_failed"}

def source_summary(body):
    unified = body.get("unifiedAwareness")
    if not isinstance(unified, dict):
        unified = body
    subsystems = body.get("subsystems")
    if not isinstance(subsystems, list):
        subsystems = []
    maxcore = next((row for row in subsystems
                    if isinstance(row, dict) and row.get("name") == "maxcore"), {})
    health = unified.get("source_health")
    health_rows = list(health.values()) if isinstance(health, dict) else []
    return {
        "ready": unified.get("ready") is True,
        "snapshotPresent": bool(unified.get("snapshotPresent") or unified.get("snapshot_id")),
        "configuredSourceCount": (
            unified.get("configuredSourceCount")
            if isinstance(unified.get("configuredSourceCount"), int)
            else len(unified.get("configured_sources", []))
            if isinstance(unified.get("configured_sources"), list) else None
        ),
        "collectorRunning": unified.get("collectorRunning") is True or unified.get("running") is True,
        "ingestOwner": unified.get("ingestOwner") is True or unified.get("ingest_owner") is True,
        "healthySourceCount": sum(
            1 for item in health_rows if isinstance(item, dict) and (
                item.get("ok") is True or item.get("status") in ("healthy", "ok", "success")
            )
        ),
        "failedSourceCount": sum(
            1 for item in health_rows if isinstance(item, dict) and (
                item.get("ok") is False or item.get("status") in ("failed", "error", "unavailable")
            )
        ),
        "maxcoreStatus": maxcore.get("status") if maxcore.get("status") in ("ok", "degraded") else "unknown",
        "maxcoreFailureClass": maxcore.get("failureClass")
        if maxcore.get("failureClass") in {
            "model_not_ready", "connection_refused", "timeout", "not_configured", "other",
        } else None,
    }

def ports_released():
    for port in runtime_ports.values():
        try:
            with socket.create_connection(("127.0.0.1", int(port)), timeout=0.2):
                return False
        except OSError:
            continue
    return True

def startup_failure_class(path, exit_code, ready_status):
    try:
        text = path.read_text(errors="replace")
    except OSError:
        return "startup_log_unavailable"
    for phrase, category in (
        ("Public build asset list changed since build", "public_asset_list_changed"),
        ("Source file list changed since build", "source_file_list_changed"),
        ("Changed since build:", "build_hash_mismatch"),
        ("Production build is missing, incomplete, or changed", "invalid_build_contract"),
        ("ERR_MODULE_NOT_FOUND", "node_dependency_missing"),
        ("Cannot find module", "node_dependency_missing"),
        ("FATAL:", "runtime_dependency_fatal"),
        ("EADDRINUSE", "port_conflict"),
        ("ECONNREFUSED", "dependency_connection_refused"),
        ("MODULE_NOT_FOUND", "node_dependency_missing"),
        ("ModuleNotFoundError", "python_dependency_missing"),
        ("No working Node executable", "node_runtime_missing"),
    ):
        if phrase in text:
            return category
    if exit_code not in (None, 0) and ready_status is None:
        return "application_exited_before_http"
    return None

def sentry_initialized(path):
    try:
        return "Sentry active" in path.read_text(errors="replace")
    except OSError:
        return False

asset_phase = subprocess.run(
    ["bash", "build.sh", "--executive-task", "assets"],
    cwd=root, env={"PATH": os.environ["PATH"], "HOME": str(root)},
    capture_output=True, text=True, timeout=120, check=False,
)
remote_probe = remote_maxcore_probe()
readiness_status = None
readiness_body = {}
home_status = None
health_status = None
ping_status = None
maxcore_health_status = None
maxcore_health_body = {}
awareness_status = None
awareness_body = {}
process_exit = None
forced_kill = False
started = False
log_path = pg / "live-awareness-app.log"
port = runtime_ports["PORT"]
proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
env = {
    "PATH": os.environ["PATH"],
    "HOME": str(root),
    "NODE_ENV": "production",
    "PORT": port,
    "DISABLE_CLUSTER": "true",
    "MAXCORE_LOCAL": "1",
    "PDIM_FORCE_REMOTE": "0",
    "MAXCORE_SERVING_RELEASE": "live-awareness",
    "ENABLE_BACKUPS": "false",
    "ENABLE_FAN_DELIVERY_WORKER": "false",
    "ACME_ENABLED": "false",
    "DNS_NODE_LOCAL": "0",
    "MAXCORE_AWARENESS_USE_PROXY": "1",
    "SENTRY_DSN": "",
    "VITE_SENTRY_DSN": "",
    "AI_SERVER_KEY": os.environ.get("AI_SERVER_KEY", ""),
    "READINESS_ISOLATED_PG": "1",
    "READINESS_EGRESS_GUARD": "0",
    "DATABASE_URL": f"postgresql://fixture@localhost:55436/postgres?host={pg}/socket",
    "SESSION_SECRET": secrets.token_hex(32),
    **runtime_ports,
}
database_url = env["DATABASE_URL"]
if proxy:
    env["HTTPS_PROXY"] = proxy

if asset_phase.returncode == 0:
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            ["npm", "start"], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
        )
        deadline = time.monotonic() + 210
        try:
            while time.monotonic() < deadline and process.poll() is None:
                home_status, _ = http_json(f"http://127.0.0.1:{port}/", timeout=2)
                health_status, _ = http_json(f"http://127.0.0.1:{port}/health", timeout=2)
                ping_status, _ = http_json(f"http://127.0.0.1:{port}/api/ping", timeout=2)
                readiness_status, readiness_body = http_json(
                    f"http://127.0.0.1:{port}/ready", timeout=3,
                )
                local_auth = (
                    {"Authorization": f"Bearer {env['AI_SERVER_KEY']}"}
                    if env["AI_SERVER_KEY"] else {}
                )
                maxcore_health_status, maxcore_health_body = http_json(
                    f"http://127.0.0.1:{runtime_ports['MAXCORE_LOCAL_PORT']}/api/health",
                    timeout=4, headers=local_auth,
                )
                awareness_status, awareness_body = http_json(
                    f"http://127.0.0.1:{runtime_ports['MAXCORE_LOCAL_PORT']}/api/awareness/unified/status",
                    timeout=6, headers=local_auth,
                )
                summary = source_summary(awareness_body)
                if awareness_status == 200 and summary["ready"]:
                    started = True
                    break
                time.sleep(2)
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                try:
                    process_exit = process.wait(timeout=35)
                except subprocess.TimeoutExpired:
                    forced_kill = True
                    process.kill()
                    process_exit = process.wait(timeout=10)
            else:
                process_exit = process.returncode
        finally:
            if process.poll() is None:
                process.kill()
                process_exit = process.wait(timeout=10)
                forced_kill = True

summary = source_summary(awareness_body)
sentry_sdk_initialized = sentry_initialized(log_path)
report = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "sourceRevision": subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=source, text=True,
        capture_output=True, check=True, timeout=5,
    ).stdout.strip(),
    "scope": "Disposable app and PostgreSQL; anonymous public awareness sources only; no payment, social, marketing, or generation credentials",
    "deploymentAssetPhasePassed": asset_phase.returncode == 0,
    "proxyAvailable": bool(proxy),
    "configuredRemoteMaxcore": remote_probe,
    "localApp": {
        "homepageHttpStatus": home_status,
        "healthHttpStatus": health_status,
        "pingHttpStatus": ping_status,
        "readinessHttpStatus": readiness_status,
        "maxcoreHealthHttpStatus": maxcore_health_status,
        "maxcoreHealthStatus": (
            maxcore_health_body.get("status")
            if maxcore_health_body.get("status") in ("healthy", "degraded", "unhealthy")
            else None
        ),
        "maxcoreModelLoaded": maxcore_health_body.get("model_loaded") is True,
        "awarenessHttpStatus": awareness_status,
        "awareness": summary,
        "processExitCode": process_exit,
        "stoppedGracefully": not forced_kill and ports_released(),
        "forcedKill": forced_kill,
        "portsReleased": ports_released(),
        "startupFailureClass": startup_failure_class(log_path, process_exit, readiness_status),
        "diagnosticLogRetained": bool(log_path.exists()),
        "sentrySdkInitialized": sentry_sdk_initialized,
        "sentryDsnConfiguredForTest": False,
    },
    "sourceRefreshObserved": started or summary["snapshotPresent"],
    "productionDatabaseUsed": not (
        database_url.startswith("postgresql://fixture@localhost:") and
        f"host={pg}/socket" in database_url
    ),
    "paymentProviderCredentialsSupplied": any(
        key in env for key in (
            "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TWILIO_AUTH_TOKEN",
            "TIKTOK_CLIENT_SECRET", "YOUTUBE_CLIENT_SECRET",
        )
    ),
    "status": "passed" if (
        asset_phase.returncode == 0 and health_status == 200 and
        maxcore_health_status == 200 and awareness_status == 200 and
        summary["ready"] and summary["snapshotPresent"] and
        not forced_kill and ports_released()
    ) else "failed",
}
report_path = source / "reports/admin-gap-audit/live-awareness.json"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
if process_exit == 0 and readiness_status == 200:
    log_path.unlink(missing_ok=True)
print(json.dumps({
    "status": report["status"],
    "remoteMaxcoreHealth": remote_probe.get("health", {}).get("httpStatus"),
    "remoteAwareness": remote_probe.get("awareness", {}).get("httpStatus"),
    "localReadiness": readiness_status,
    "localAppHealth": health_status,
    "localMaxcoreHealth": maxcore_health_status,
    "localAwareness": awareness_status,
    "awarenessReady": summary["ready"],
    "snapshotPresent": summary["snapshotPresent"],
    "maxcoreStatus": summary["maxcoreStatus"],
    "shutdownGraceful": report["localApp"]["stoppedGracefully"],
    "portsReleased": report["localApp"]["portsReleased"],
    "sentrySdkInitialized": sentry_sdk_initialized,
    "report": report_path.relative_to(source).as_posix(),
}))
raise SystemExit(0 if report["status"] == "passed" else 1)
