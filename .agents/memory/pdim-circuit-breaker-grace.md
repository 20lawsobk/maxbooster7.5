---
name: PDIM circuit breaker grace cap
description: Keep grace caps small to prevent 20-min timeout floods when PDIM is unreachable
---

## Rule
POST_GRACE_FAILURE_CAP ≤ 15, STARTUP_GRACE_MAX_MS ≤ 20,000ms in pdimCircuitBreaker.ts.

**Why:** Original values (800 failures, 120s grace) kept circuit CLOSED for 20+ minutes while PDIM was completely dead — hundreds of timeouts/second, AutonomousScheduler blocked.

**How:** Small cap means circuit opens in < 30s on genuine outage while recovering immediately on first success.
