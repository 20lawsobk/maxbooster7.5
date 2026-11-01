"""Read-only live feed check, separate from the no-egress production rehearsal.

Run with env -i PATH="$PATH" python_runtime/bin/python3 -I -B <this file>.
No server, scheduler, database, publisher or paid search adapter is started.
This checks public ingestion, NOT full application readiness.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import sys

allowed_environment = {"PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE",
                       "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
                       "SSL_CERT_FILE", "SSL_CERT_DIR", "MAXCORE_AWARENESS_USE_PROXY"}
if set(os.environ) - allowed_environment:
    raise SystemExit("Run with a clean environment; credentials must not reach this probe")
# The portable interpreter's compiled OpenSSL path is not the host trust
# store. Use the verified system bundle, never disable certificate checking.
trust_store = Path(os.environ.get("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt"))
if not trust_store.is_file():
    raise SystemExit("System TLS trust store unavailable; public ingestion remains untested")
os.environ["SSL_CERT_FILE"] = str(trust_store)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] /
                       "external/maxcore/artifacts/ai-training-server"))
from ai_model.awareness.sources import configured_sources

sources = configured_sources()
# Fixed public, credential-free adapters only; no caller-supplied URLs.
names = ("apple_charts", "mastodon_trending", "marketing_dive", "guardian_culture")


def probe(name):
    domain, _url, fetch = sources[name]
    try:
        rows = fetch()
        valid = bool(rows) and all(
            isinstance(row, dict) and row.get("text") and row.get("citation")
            and row.get("metric") for row in rows
        )
        return {"source": name, "domain": domain, "rows": len(rows), "passed": valid}
    except Exception as error:
        # Never print provider bodies, user content or potentially sensitive URLs.
        safe_reasons = {
            "URL hostname resolution timed out", "URL hostname could not be resolved",
            "URL resolves to a non-public address", "Remote fetch deadline exceeded",
            "Remote URL has too many redirects",
        }
        return {"source": name, "domain": domain, "passed": False,
                "errorType": type(error).__name__,
                "causeType": type(error.__cause__).__name__ if error.__cause__ else None,
                "reason": str(error) if str(error) in safe_reasons else "transport_or_response_failure"}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(probe, names))
print(json.dumps({"check": "public-read-only-ingestion", "sources": results}, indent=2))
raise SystemExit(0 if all(result["passed"] for result in results) else 1)
