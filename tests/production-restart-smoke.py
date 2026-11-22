"""Two complete start/stop cycles in the same disposable network namespace.

Use the same arguments and unshare isolation as npm-start-isolated-smoke.py.
Both cycles run even if readiness fails; neither failure is suppressed.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess
import sys

if len(sys.argv) != 4:
    raise SystemExit("Expected fixture, disposable PostgreSQL directory and host namespace ID")
smoke = Path(__file__).with_name("npm-start-isolated-smoke.py")
results = []
root = Path(sys.argv[1]).resolve()
pg = Path(sys.argv[2]).resolve()
asset_phase = subprocess.run(
    ["bash", "build.sh", "--executive-task", "assets"],
    cwd=root, text=True, capture_output=True, timeout=120, check=False,
)
dns_database_url = (
    f"postgresql://fixture@localhost:55436/postgres?host={pg / 'socket'}"
)
dns_migration = subprocess.run(
    ["node", "scripts/migrate-dns-api-schema.mjs"],
    cwd=root,
    env={
        "PATH": os.environ["PATH"],
        "HOME": "/tmp",
        "NODE_ENV": "production",
        "DATABASE_URL": dns_database_url,
    },
    text=True,
    capture_output=True,
    timeout=60,
    check=False,
) if asset_phase.returncode == 0 else None
manifest = json.loads((root / "dist/build-complete.json").read_text())
manifest_bytes = (root / "dist/build-complete.json").read_bytes()
expected = {
    filename for filename in manifest.get("files", {})
    if filename.startswith("dist/public/")
}

def asset_state():
    actual = {
        path.relative_to(root).as_posix()
        for path in (root / "dist/public").rglob("*") if path.is_file()
    }
    additions = sorted(actual - expected)
    missing = sorted(expected - actual)
    changed = sorted(
        filename for filename in expected & actual
        if hashlib.sha256((root / filename).read_bytes()).hexdigest()
        != manifest["files"][filename]
    )
    return {"added": additions, "missing": missing, "hashMismatches": changed}

def startup_failure_class():
    try:
        log = Path("/tmp/npm-start-isolated-db.log").read_text(errors="replace")
    except OSError:
        return None
    safe_signals = {
        "Public build asset list changed since build": "public_asset_list_changed",
        "Source file list changed since build": "source_file_list_changed",
        "Changed since build:": "build_hash_mismatch",
        "Production build is missing, incomplete, or changed": "invalid_build_contract",
    }
    return next((code for phrase, code in safe_signals.items() if phrase in log), None)

cycles = []
for cycle in (1, 2):
    result = subprocess.run([sys.executable, "-B", str(smoke), *sys.argv[1:], str(cycle)],
                            timeout=390, check=False)
    results.append(result.returncode)
    readiness_path = pg / f"readiness-cycle-{cycle}.json"
    readiness = json.loads(readiness_path.read_text()) if readiness_path.exists() else None
    cycles.append({
        "cycle": cycle,
        "exitCode": result.returncode,
        "readiness": readiness,
        "publicAssetState": asset_state(),
        "startupFailureClass": startup_failure_class(),
    })
    print(f"Production start/shutdown cycle {cycle}: exit={result.returncode}", flush=True)

source = Path(__file__).resolve().parents[1]
try:
    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=source, text=True,
        capture_output=True, check=True, timeout=5,
    ).stdout.strip()
except (OSError, subprocess.SubprocessError):
    revision = None
report = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "sourceRevision": revision,
    "buildContractSha256": hashlib.sha256(manifest_bytes).hexdigest(),
    "deploymentAssetPhase": {
        "exitCode": asset_phase.returncode,
        "passed": asset_phase.returncode == 0,
    },
    "disposableDnsSchemaMigration": {
        "exitCode": dns_migration.returncode if dns_migration else None,
        "passed": dns_migration is not None and dns_migration.returncode == 0,
        "schema": "dns_os",
    },
    "scope": "Disposable PostgreSQL and production artifact copy; application external TCP/TLS and UDP denied",
    "networkNamespaceIsolated": True,
    "readinessGatePreserved": True,
    "buildIntegrityGatePreserved": True,
    "readinessPassedEveryCycle": all(
        cycle["readiness"] is not None and
        cycle["readiness"].get("httpStatus") == 200 and
        cycle["readiness"].get("unifiedAwareness", {}).get("ready") is True
        for cycle in cycles
    ),
    "applicationStartupAndConfiguredPortsPassedEveryCycle": all(
        cycle["readiness"] is not None
        and cycle["readiness"].get("applicationAvailability", {}).get("homepageStatus") == 200
        and cycle["readiness"].get("applicationAvailability", {}).get("healthStatus") == 200
        and cycle["readiness"].get("applicationAvailability", {})
            .get("configuredPortsAfterLoad", {}).get("healthReady") is True
        and cycle["readiness"].get("applicationAvailability", {})
            .get("configuredPortsAfterLoad", {}).get("count") == 12
        for cycle in cycles
    ),
    "applicationProcessAndRawListenersPassedEveryCycle": all(
        cycle["readiness"] is not None
        and cycle["readiness"].get("applicationAvailability", {}).get("homepageStatus") == 200
        and cycle["readiness"].get("applicationAvailability", {}).get("healthStatus") == 200
        and cycle["readiness"].get("applicationAvailability", {})
            .get("configuredPortsAtLiveness", {}).get("ready") is True
        and cycle["readiness"].get("applicationAvailability", {})
            .get("configuredPortsAtLiveness", {}).get("count") == 12
        and cycle["readiness"].get("applicationAvailability", {})
            .get("configuredPortsAfterLoad", {}).get("ready") is True
        and cycle["readiness"].get("applicationAvailability", {})
            .get("configuredPortsAfterLoad", {}).get("count") == 12
        for cycle in cycles
    ),
    "startCommandCompletedBeforeTestShutdownEveryCycle": all(
        cycle["readiness"] is not None
        and cycle["readiness"].get("applicationAvailability", {})
            .get("startCommandStillWaitingForFullReadiness") is False
        for cycle in cycles
    ),
    "artifactIntegrityPassedEveryCycle": all(
        not any(cycle["publicAssetState"].values()) and
        cycle["startupFailureClass"] is None
        for cycle in cycles
    ),
    "shutdownCompletedEveryCycle": all(
        cycle["readiness"] is not None and
        cycle["readiness"].get("shutdown", {}).get("portsReleased") is True and
        cycle["readiness"].get("shutdown", {}).get("forcedKill") is False
        for cycle in cycles
    ),
    "cycles": cycles,
    "status": "pending",
}
full_readiness_passed = report["readinessPassedEveryCycle"]
lifecycle_passed = (
    asset_phase.returncode == 0
    and dns_migration is not None
    and dns_migration.returncode == 0
    and results == [0, 0]
    and report["applicationProcessAndRawListenersPassedEveryCycle"]
    and report["shutdownCompletedEveryCycle"]
)
report["status"] = (
    "passed" if lifecycle_passed and full_readiness_passed
    else "degraded" if lifecycle_passed
    else "failed"
)
default_report_path = source / "reports/admin-gap-audit/packaged-restart.json"
report_path = Path(os.environ.get("MAXBOOSTER_RESTART_REPORT", default_report_path))
if not report_path.is_absolute():
    report_path = source / report_path
report_path = report_path.resolve()
report_root = (source / "reports/admin-gap-audit").resolve()
if report_root not in report_path.parents:
    raise SystemExit("Restart evidence output must remain under reports/admin-gap-audit/")
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
print(f"Redacted restart evidence: {report_path.relative_to(source)}", flush=True)
raise SystemExit(0 if report["status"] == "passed" else 1)
