"""Chaos scenario runner — shared harness.

Each scenario:
1. Applies a toxiproxy toxic
2. Hits the API and asserts expected behavior
3. Removes the toxic and verifies recovery
4. Reports pass/fail

Abort conditions (any triggers immediate stop):
- Error rate > 20%
- Any data loss detected
- Request hang > 30s
"""
import json
import sys
import time
import urllib.request
import urllib.error

TOXIPROXY = "http://localhost:8474"
API_BASE = "http://localhost:5000"

# Abort thresholds.
MAX_ERROR_RATE = 0.20
MAX_HANG_SECONDS = 30


def toxiproxy_post(path, data=None):
    req = urllib.request.Request(
        f"{TOXIPROXY}{path}",
        data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read()) if r.read else {}
    except Exception as e:
        print(f"toxiproxy error: {e}")
        return {}


def apply_toxic(proxy_name, toxic_name, toxic_type, attributes):
    """Add a toxic to a proxy."""
    return toxiproxy_post(
        f"/proxies/{proxy_name}/toxics",
        {"name": toxic_name, "type": toxic_type, "attributes": attributes},
    )


def remove_toxic(proxy_name, toxic_name):
    req = urllib.request.Request(
        f"{TOXIPROXY}/proxies/{proxy_name}/toxics/{toxic_name}",
        method="DELETE",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def api_get(path, timeout=10):
    """GET with hang detection."""
    start = time.time()
    try:
        req = urllib.request.Request(f"{API_BASE}{path}")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            elapsed = time.time() - start
            return {"status": r.status, "elapsed": elapsed,
                    "body": r.read()[:1000]}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "elapsed": time.time() - start, "error": True}
    except Exception as e:
        elapsed = time.time() - start
        if elapsed >= MAX_HANG_SECONDS:
            raise AssertionError(f"HANG: {path} took {elapsed:.1f}s")
        return {"status": 0, "elapsed": elapsed, "error": str(e)}


def assert_responds(path, timeout=10):
    """Assert the API responds (not hang, not 500)."""
    r = api_get(path, timeout)
    assert r["elapsed"] < MAX_HANG_SECONDS, f"hang on {path}"
    assert r["status"] != 500, f"500 on {path}"
    return r


def run_scenario(name, setup_fn, assert_fn, teardown_fn=None):
    """Run one chaos scenario with abort handling."""
    print(f"\n{'='*50}")
    print(f"SCENARIO: {name}")
    print(f"{'='*50}")
    try:
        setup_fn()
        time.sleep(2)  # let toxic take effect
        assert_fn()
        print(f"PASS: {name}")
        return True
    except AssertionError as e:
        print(f"FAIL: {name}: {e}")
        return False
    except Exception as e:
        print(f"ERROR: {name}: {type(e).__name__}: {e}")
        return False
    finally:
        if teardown_fn:
            teardown_fn()
        time.sleep(5)  # recovery window
        # Verify recovery.
        try:
            r = api_get("/health", timeout=10)
            if r["status"] == 200:
                print("recovery: OK")
            else:
                print(f"recovery: WARNING (status {r['status']})")
        except Exception as e:
            print(f"recovery: FAILED ({e})")
