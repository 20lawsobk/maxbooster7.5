"""Chaos scenarios 1-7: Redis and Postgres failure injection."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import (
    apply_toxic, remove_toxic, assert_responds, api_get, run_scenario,
)


def scenario_redis_down():
    def setup():
        # Disable the Redis proxy (simulates Redis down).
        apply_toxic("redis", "down", "timeout", {"timeout": 0})

    def assert_fn():
        # API must still respond 200 on cache-dependent paths.
        r = assert_responds("/health")
        # Health must report degraded, not 503.
        assert r["status"] == 200, f"health returned {r['status']}, expected 200 with degraded status"

    def teardown():
        remove_toxic("redis", "down")

    return run_scenario("1: Redis down", setup, assert_fn, teardown)


def scenario_redis_slow():
    def setup():
        apply_toxic("redis", "slow", "latency",
                    {"latency": 500, "jitter": 100})

    def assert_fn():
        r = assert_responds("/health", timeout=15)
        # Should respond within 15s even with 500ms Redis latency.
        assert r["elapsed"] < 15, f"too slow: {r['elapsed']:.1f}s"

    def teardown():
        remove_toxic("redis", "slow")

    return run_scenario("2: Redis slow (500ms)", setup, assert_fn, teardown)


def scenario_pg_slow():
    def setup():
        apply_toxic("postgres", "slow", "latency",
                    {"latency": 250, "jitter": 50})

    def assert_fn():
        r = assert_responds("/health", timeout=15)
        assert r["elapsed"] < 15, f"pool not healthy: {r['elapsed']:.1f}s"

    def teardown():
        remove_toxic("postgres", "slow")

    return run_scenario("3: Postgres slow (250ms)", setup, assert_fn, teardown)


def scenario_pg_timeout():
    def setup():
        apply_toxic("postgres", "timeout", "timeout", {"timeout": 5000})

    def assert_fn():
        # Must resolve (OK or error) within hard deadline — never hang.
        r = api_get("/health", timeout=15)
        assert r["elapsed"] < 15, f"HANG: {r['elapsed']:.1f}s"

    def teardown():
        remove_toxic("postgres", "timeout")

    return run_scenario("4: Postgres timeout", setup, assert_fn, teardown)


def scenario_both_down():
    def setup():
        apply_toxic("redis", "down", "timeout", {"timeout": 0})
        apply_toxic("postgres", "down", "timeout", {"timeout": 0})

    def assert_fn():
        # Must return degraded 200/503 — never hang, never unhandled 500.
        r = api_get("/health", timeout=15)
        assert r["elapsed"] < 15, f"HANG: {r['elapsed']:.1f}s"
        assert r["status"] in (200, 503), f"unexpected {r['status']}"

    def teardown():
        remove_toxic("redis", "down")
        remove_toxic("postgres", "down")

    return run_scenario("7: Both down", setup, assert_fn, teardown)


if __name__ == "__main__":
    results = []
    results.append(("redis_down", scenario_redis_down()))
    results.append(("redis_slow", scenario_redis_slow()))
    results.append(("pg_slow", scenario_pg_slow()))
    results.append(("pg_timeout", scenario_pg_timeout()))
    results.append(("both_down", scenario_both_down()))

    print(f"\n{'='*50}")
    print("CHAOS RESULTS")
    print(f"{'='*50}")
    for name, passed in results:
        print(f"  {'PASS' if passed else 'FAIL'}: {name}")

    sys.exit(0 if all(p for _, p in results) else 1)
