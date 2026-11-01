"""Acceptance composition, not an application/test-framework implementation.

Run from the repository root with the prepared Python and Node on PATH:
  python -B reports/live-awareness-acceptance/2026-10-27/canonical-public-pipeline.py

Only four fixed public content feed adapters are fetched, once each; redirects
retain the production limit of three validated public hops. Transport performs public DNS
validation through its configured proxy. No app/server, scheduler, model,
learning loop, database, publisher, paid API or generation helper is started.
The actual canonical PDIM owner writes only its disposable private directory.
Reports retain counts/digests/timestamps, never source text or the channel token.
"""
import argparse
from collections import Counter
import datetime
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
import tempfile
import time
import urllib.request
from urllib.parse import urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
NAMES = ("apple_charts", "mastodon_trending", "marketing_dive", "guardian_culture")
TRANSPORT = ("PATH", "LD_LIBRARY_PATH", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
             "SSL_CERT_FILE", "SSL_CERT_DIR")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def owned_group(group):
    result = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
            if int(fields[2]) == group:
                result.append({"pid": int(entry.name), "state": fields[0], "startTicks": fields[19]})
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return sorted(result, key=lambda item: item["pid"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="/workspace/.cloud-tools/node_modules/.bin/node")
    parser.add_argument("--output", type=Path, default=HERE / "canonical-public-pipeline")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit("Use an empty output directory; historical runs are never overwritten")
    output.mkdir(parents=True, exist_ok=True)
    inherited = {name: os.environ[name] for name in TRANSPORT if os.environ.get(name)}
    # Remove inherited app/provider credentials before importing any repository
    # module, then construct only the fresh local channel configuration.
    os.environ.clear()
    os.environ.update(inherited)
    os.environ.update({"LANG": "C.UTF-8", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1",
                       "MKL_NUM_THREADS": "1", "PYTHONDONTWRITEBYTECODE": "1"})
    os.environ.setdefault("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt")
    if not Path(os.environ["SSL_CERT_FILE"]).is_file():
        raise SystemExit("Verified CA bundle is required")
    scratch = Path(tempfile.mkdtemp(prefix="maxbooster-live-canonical-"))
    token = secrets.token_hex(32)
    before = time.monotonic()
    evidence = {"startedAt": timestamp(), "status": "running", "productionReady": False,
                "scope": "Four actual public adapters -> actual canonical disposable PDIM publication -> fresh follower/context; no generation/provider/deployment proof",
                "checkpointRequired": False, "sourceNames": list(NAMES), "refreshConcurrency": 1,
                "sourceBodiesRetainedInReports": False, "phase": "initializing",
                "externalContentMethods": ["GET"], "maximumValidatedRedirectsPerFeed": 3,
                "transportPublicDnsValidation": True}
    tracked = [Path(__file__).resolve(), HERE / "canonical-pdim-owner.mjs",
               ROOT / "server/lib/localPdimServer.ts",
               ROOT / "external/pdim/artifacts/api-server/src/redis/store.ts",
               ROOT / "external/maxcore/artifacts/ai-training-server/ai_model/awareness/engine.py",
               ROOT / "external/maxcore/artifacts/ai-training-server/ai_model/awareness/sources.py",
               ROOT / "external/maxcore/artifacts/ai-training-server/ai_model/awareness/lease.py",
               ROOT / "external/maxcore/artifacts/ai-training-server/storage_client.py",
               ROOT / "external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/safe_http.py"]
    inputs = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in tracked}
    owner = None
    engine = None
    log = (output / "canonical-pdim.log").open("w")
    exit_code = 1
    try:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        (scratch / "home").mkdir()
        (scratch / "tmp").mkdir()
        node_env = {name: os.environ[name] for name in ("PATH", "LD_LIBRARY_PATH") if os.environ.get(name)}
        node_env.update({"HOME": str(scratch / "home"), "TMPDIR": str(scratch / "tmp"),
                         "NODE_ENV": "production", "LANG": "C.UTF-8", "LOG_LEVEL": "warn",
                         "LOCAL_PDIM_PORT": str(port), "LOCAL_PDIM_STORE_FILE": str(scratch / "pdim.json"),
                         "PDIM_LOCAL_CHANNEL_TOKEN": token, "PDIM_PERSISTENCE": "disk", "TSX_DISABLE_CACHE": "1"})
        command = [str(Path(args.node).resolve()), "--import", str(ROOT / "node_modules/tsx/dist/loader.mjs"),
                   str(HERE / "canonical-pdim-owner.mjs"), str(ROOT)]
        evidence["ownerCommand"] = command
        evidence["ownerEnvironmentNames"] = sorted(node_env)
        evidence["phase"] = "starting_owned_canonical_pdim"
        owner = subprocess.Popen(command, cwd=scratch, env=node_env, stdout=log, stderr=subprocess.STDOUT,
                                 start_new_session=True)
        evidence["ownerPid"] = owner.pid
        origin = f"http://127.0.0.1:{port}/api/redis/instances/local/exec"
        local = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def local_command(cmd, *values):
            req = urllib.request.Request(origin, data=json.dumps({"cmd": cmd, "args": list(values)}).encode(),
                                         headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
            with local.open(req, timeout=5) as response:
                return json.load(response)

        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if owner.poll() is not None:
                raise RuntimeError("Owned PDIM exited before readiness")
            try:
                if local_command("PING") == "PONG":
                    break
            except Exception:
                time.sleep(.1)
        else:
            raise TimeoutError("Owned PDIM startup deadline")
        os.environ.update({"HOME": str(scratch / "home"), "TMPDIR": str(scratch / "tmp"),
                           "STORAGE_HTTP_URL": origin, "PDIM_LOCAL_CHANNEL_TOKEN": token,
                           "PDIM_FORCE_REMOTE": "0", "MAXCORE_AWARENESS_USE_PROXY": "1"})
        evidence["pythonEnvironmentNames"] = sorted(os.environ)
        maxcore = ROOT / "external/maxcore/artifacts/ai-training-server"
        sys.path.insert(0, str(maxcore))
        from ai_model.awareness import sources
        from ai_model.awareness.engine import (Engine, PDIM, POINTER, BLOB, OBSERVATIONS_PREFIX,
                                               Snapshot, TTL, DOMAINS, canonical, conditioning,
                                               validate_source_observation_document, AwarenessUnavailable)
        from ai_model.awareness.lease import LEASE_KEY
        from ai_model.native_analysis import safe_http
        from storage_client import get_storage
        configured = sources.configured_sources()
        selected = {name: configured[name] for name in NAMES}
        allowed = {url: name for name, (_domain, url, _fetch) in selected.items()}
        assert len(allowed) == 4
        fetches = []
        hops = []
        evidence["publicFetches"] = fetches
        evidence["publicHttpHops"] = hops
        original_fetch = sources.legacy.fetch_bytes

        def audit_class(original, scheme):
            class AuditedConnection(original):
                def __init__(self, host, port, *values, **kwargs):
                    self.acceptance_host = host
                    self.acceptance_port = port
                    super().__init__(host, port, *values, **kwargs)

                def request(self, method, target, *values, **kwargs):
                    assert method == "GET", "Public transport must remain read-only"
                    self.acceptance_url = f"{scheme}://{self.acceptance_host}:{self.acceptance_port}{target}"
                    return super().request(method, target, *values, **kwargs)

                def getresponse(self, *values, **kwargs):
                    response = super().getresponse(*values, **kwargs)
                    location = response.getheader("Location")
                    destination = urljoin(self.acceptance_url, location) if location else None
                    hops.append({"host": self.acceptance_host, "method": "GET", "status": response.status,
                                 "urlSha256": sha(self.acceptance_url.encode()),
                                 "redirectDestinationHost": urlsplit(destination).hostname if destination else None,
                                 "redirectDestinationUrlSha256": sha(destination.encode()) if destination else None})
                    return response
            return AuditedConnection

        safe_http._PinnedHTTPSConnection = audit_class(safe_http._PinnedHTTPSConnection, "https")
        safe_http._PinnedHTTPConnection = audit_class(safe_http._PinnedHTTPConnection, "http")

        def audited_fetch(url, **kwargs):
            # Audit and constrain the existing real transport; no bytes or
            # adapter results are replaced. Prevent extra redirect feed GETs.
            assert url in allowed, "A non-selected feed was requested"
            assert len(fetches) < 4, "More than four content feed adapter requests"
            item = {"source": allowed[url], "urlSha256": sha(url.encode())}
            fetches.append(item)
            kwargs["max_redirects"] = 3
            first_hop = len(hops)
            try:
                body, metadata = original_fetch(url, **kwargs)
            except Exception as error:
                message = str(error)
                safe = ("Remote URL has too many redirects", "Remote fetch deadline exceeded", "Remote fetch failed",
                        "URL hostname resolution timed out", "URL hostname could not be resolved", "URL resolves to a non-public address")
                item.update({"errorType": type(error).__name__, "causeType": type(error.__cause__).__name__ if error.__cause__ else None,
                             "reason": message if message in safe or message.startswith("Remote server returned HTTP ") else "transport_or_response_failure"})
                raise
            item.update({"bodySha256": sha(body), "bodyBytes": len(body),
                         "httpHops": len(hops) - first_hop,
                         "redirects": sum(hop["status"] in (301, 302, 303, 307, 308) for hop in hops[first_hop:]),
                         "finalHost": urlsplit(metadata.final_url).hostname})
            return body, metadata

        sources.legacy.fetch_bytes = audited_fetch
        evidence["phase"] = "actual_public_scan_and_canonical_publication"
        store = PDIM()
        assert store.get(POINTER) is None, "The disposable PDIM must begin empty"
        engine = Engine(sources=selected, store=store, timeout=15, concurrency=1)
        snapshot = engine.refresh()
        assert len(fetches) == 4
        assert Counter(item["source"] for item in fetches) == Counter(NAMES)
        now = time.time()
        doc = snapshot.to_dict()
        parsed = Snapshot.parse(doc, now=now)
        pointer = store.get(POINTER)
        blob = store.get(BLOB + snapshot.id)
        assert pointer["id"] == snapshot.id == parsed.id
        assert Snapshot.parse(blob, now=now).id == snapshot.id
        assert canonical(blob) == canonical(doc)
        assert set(doc["domains"]) == DOMAINS and all(doc["domains"].values())
        assert now < snapshot.expires_at <= doc["created_at"] + TTL
        assert set(doc["source_health"]) == set(NAMES)
        assert all(item["ok"] for item in doc["source_health"].values())
        assert engine.status()["ready"] and not engine.status()["running"]
        assert store.get(LEASE_KEY) is None, "One-shot refresh must release its fenced ingestion lease"
        ledgers = []
        for name, (domain, _url, _fetch) in selected.items():
            document = store.get(OBSERVATIONS_PREFIX + name)
            rows = validate_source_observation_document(document, name, domain, now)
            assert rows, "Every selected source must persist validated live observations"
            assert now - 60 <= document["updated_at"] <= now + 5
            ttl = get_storage()._exec("TTL", get_storage()._ns(OBSERVATIONS_PREFIX + name))
            assert 0 < ttl <= TTL
            ledgers.append({"source": name, "domain": domain, "documentId": document["id"],
                            "records": len(rows), "ttlSeconds": ttl, "updatedAt": document["updated_at"],
                            "recordIds": sorted(row["id"] for row in rows),
                            "metrics": dict(Counter(row["metric"] for row in rows)),
                            "documentSha256": sha(canonical(document).encode())})
        evidence["phase"] = "fresh_follower_load_and_live_context"
        follower = Engine(sources=selected, store=PDIM(), concurrency=1)
        follower._load()
        assert follower.require_snapshot().id == snapshot.id
        assert follower.current_snapshot().id == snapshot.id
        status = follower.status()
        assert status["ready"] and not status["running"] and not status["ingest_owner"]
        assert len(fetches) == 4, "Follower loading must not fetch sources again"
        context = conditioning(follower.require_snapshot(), platform="instagram", modality="image")
        assert snapshot.id in context and "UNTRUSTED DATA" in context
        context_doc = json.loads(context.split("\n", 1)[1])
        assert context_doc["snapshot_id"] == snapshot.id
        for domain, rows in context_doc["observations"].items():
            actual_ids = {row["id"] for row in doc["domains"][domain]}
            assert rows and all(row["id"] in actual_ids for row in rows)
        try:
            Snapshot.parse(blob, now=snapshot.expires_at)
        except AwarenessUnavailable:
            pass
        else:
            raise AssertionError("Expired snapshot was accepted")
        evidence.update({"status": "passed", "phase": "verified", "snapshotId": snapshot.id,
                         "createdAt": doc["created_at"], "expiresAt": snapshot.expires_at,
                         "remainingFreshnessSeconds": snapshot.expires_at - now,
                         "snapshotSha256": sha(canonical(doc).encode()), "pointerSha256": sha(canonical(pointer).encode()),
                         "sourceLedgers": ledgers, "domainCounts": {k: len(v) for k, v in doc["domains"].items()},
                         "follower": {"ready": status["ready"], "running": status["running"], "ingestOwner": status["ingest_owner"],
                                      "sameSnapshot": True, "additionalContentFetches": 0},
                         "context": {"sha256": sha(context.encode()), "bytes": len(context.encode()),
                                     "sameSnapshot": True, "untrustedDataLabel": True,
                                     "domainCounts": {k: len(v) for k, v in context_doc["observations"].items()}},
                         "expirationRejected": True, "leaseReleased": True, "diskFallbackUsed": False,
                         "snapshotPointerBlobExpireByValidation": True})
        exit_code = 0
    except Exception as error:
        evidence.update({"status": "failed", "errorType": type(error).__name__,
                         "errorCode": getattr(error, "code", None)})
        if engine is not None:
            evidence["engineStatus"] = engine.status()
        # Intentionally do not print exception bodies, feed text or credentials.
    finally:
        if engine is not None:
            evidence["engineStopped"] = engine.stop()
        if owner is not None:
            evidence["ownedGroupBeforeStop"] = owned_group(owner.pid)
            if owner.poll() is None:
                owner.send_signal(signal.SIGTERM)
            try:
                owner.wait(timeout=12)
            except subprocess.TimeoutExpired:
                os.killpg(owner.pid, signal.SIGKILL)
                owner.wait(timeout=5)
                evidence["ownerForcedKill"] = True
                exit_code = 1
            evidence["ownerExitCode"] = owner.returncode
            evidence["ownerStopped"] = owner.poll() is not None
            if owner.returncode != 0:
                exit_code = 1
            deadline = time.monotonic() + 2
            remaining = owned_group(owner.pid)
            while any(item["state"] != "Z" for item in remaining) and time.monotonic() < deadline:
                time.sleep(.05)
                remaining = owned_group(owner.pid)
            evidence["ownedGroupAfterStop"] = remaining
            evidence["activeOwnedProcessesRemaining"] = [item for item in remaining if item["state"] != "Z"]
            evidence["defunctOwnedProcesses"] = [item for item in remaining if item["state"] == "Z"]
            if evidence["activeOwnedProcessesRemaining"]:
                exit_code = 1
        log.close()
        log_path = output / "canonical-pdim.log"
        raw = log_path.read_text(errors="replace")
        if token in raw:
            log_path.write_text(raw.replace(token, "[REDACTED_EPHEMERAL_CHANNEL]"))
            evidence["ephemeralTokenLogRedacted"] = True
        evidence["durableScratchFiles"] = [{"name": p.name, "bytes": p.stat().st_size, "sha256": sha(p.read_bytes())}
                                           for p in sorted(scratch.glob("pdim.json*")) if p.is_file()]
        shutil.rmtree(scratch)
        evidence["scratchRemoved"] = not scratch.exists()
        current = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in tracked}
        evidence["sourceInputsUnchanged"] = inputs == current
        evidence["sourceInputs"] = inputs
        if inputs != current or not evidence["scratchRemoved"]:
            exit_code = 1
        evidence["durationSeconds"] = round(time.monotonic() - before, 3)
        evidence["finishedAt"] = timestamp()
        evidence["exitCode"] = exit_code
        evidence["canonicalPdimLogSha256"] = sha(log_path.read_bytes())
        evidence["nodeVersion"] = subprocess.check_output([args.node, "--version"], text=True).strip()
        evidence["pythonVersion"] = sys.version.split()[0]
        if exit_code != 0:
            evidence["status"] = "failed"
        (output / "receipt.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print(json.dumps({"scope": evidence["scope"], "status": evidence["status"], "exitCode": exit_code,
                          "phase": evidence["phase"], "ownerStopped": evidence.get("ownerStopped"),
                          "scratchRemoved": evidence["scratchRemoved"]}))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
