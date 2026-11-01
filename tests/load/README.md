"""k6 load testing for MaxBooster API.

Four scenarios per third-party audit standards:
1. Smoke — CI gate, catches wiring errors
2. Load — baseline capacity, finds the knee
3. Spike — elasticity, graceful degradation
4. Soak — memory leaks, slow degradation

SLOs (declared before the run — not fitted to results):
- p95 latency < 800ms (reads), p99 < 1500ms
- Error rate < 0.5%
- Sustained throughput declared per scenario

Usage:
  k6 run tests/load/smoke.js
  k6 run tests/load/load.js
  k6 run tests/load/spike.js
  k6 run tests/load/soak.js

Requires: k6 installed (https://k6.io/docs/get-started/installation/)
Target: BASE_URL env var (default: http://localhost:5000)
Auth: API_KEY env var for authenticated endpoints
"""
