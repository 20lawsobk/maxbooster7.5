# MaxCore isolated recovery and bounded HTTP acceptance

**Result:** PASSED

**Run:** `python3 scripts/maxcore-isolated-recovery-acceptance.py`

- scope: isolated production journal/recovery/readiness functions; disposable fixture storage transport and loopback HTTP only
- production_data_touched: False
- inference_invoked: False
- outage: committing retained with explicit delivery error and identical scratch SHA-256
- restart: interrupted render failed without rerender; readiness HTTP 503
- instance_loss: destroyed isolated state directory; restored copy to same path; delivery-only startup produced one validated fixture receipt
- fixture_artifact_sha256: 933912207f0318df35de7f60a7b503a27e3557fec60a5949af044d2318510d98
- http_load: {'requests': 96, 'max_concurrency': 8, 'expected_unready_responses': 32, 'unexpected_responses': 0, 'wall_seconds': 1.23, 'p50_ms': 5.55, 'p95_ms': 1158.44, 'p99_ms': 1160.09}
- idempotent_restart: completed job remained terminal; no second fixture delivery

## Limits

- Not the full MaxCore server or production inference; no model weights, quality, GPU or throughput-scale claims.
- Test-only fixture routes and local storage receipt; not a production PDIM or remote storage availability test.
- Instance-loss restore copied the same disposable filesystem to its original path; not off-host backup or cross-host failover.
- Bounded GET load measures only isolated journal/readiness HTTP, not generation throughput or application load.
