# Chaos Testing for MaxBooster

Failure injection via Toxiproxy (no Kubernetes required).

## Setup

```bash
# Start toxiproxy
docker run -d -p 8474:8474 -p 8475:8475 shopify/toxiproxy

# Configure proxies (Postgres :5432 -> :25432, Redis :6379 -> :26379)
python3 tests/chaos/setup_proxies.py
```

## Scenarios

| # | Scenario | Script | Expected |
|---|----------|--------|----------|
| 1 | Redis down | `chaos_redis_down.py` | API 200, `/health` reports degraded, no 500s |
| 2 | Redis slow (500ms) | `chaos_redis_slow.py` | p95 within SLO or graceful, recovery <30s |
| 3 | Postgres slow | `chaos_pg_slow.py` | Pool healthy, no false terminations |
| 4 | Postgres timeout | `chaos_pg_timeout.py` | Transient error, never hangs (>15s = fail) |
| 5 | Postgres reset | `chaos_pg_reset.py` | Retries 2x, bounded time |
| 6 | Pool exhaustion | `chaos_pool_exhaust.py` | Queues not 500s, error <15% |
| 7 | Both down | `chaos_both_down.py` | Degraded 200/503, never hang |

## Rules

- Run against isolated chaos stack, NEVER production data.
- Abort if: error rate >20%, any data loss, hang >30s.
- Weekly CI schedule (not PR-blocking).
- Failures auto-file issue labeled `chaos-failure`.

## Runbook

See `tests/chaos/RUNBOOK.md` for operator procedures per scenario.
