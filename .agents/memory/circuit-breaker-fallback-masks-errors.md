---
name: CircuitBreaker.execute fallback masks real errors
description: A fallback passed to this project's shared CircuitBreaker.execute(fn, fallback) runs on every failure while CLOSED, not just when the breaker is actually OPEN — silently hiding the real error behind a generic message
---

## The rule
`server/infrastructure/circuitBreaker.ts`'s `execute<T>(fn, fallback?)` calls `fallback`
whenever `fn()` throws or rejects — including the very first real failure, while the
breaker is still CLOSED. It is NOT gated on the breaker actually being OPEN. Public
surface is `execute(fn, fallback?)`, `getState()`, `getStats()`, `reset()`,
`isAvailable()` — there are no public per-call `recordSuccess`/`recordFailure` hooks, so
you cannot bypass `execute()` and still get breaker accounting.

**Why this bites you:** a fallback written as `() => { throw new Error("circuit breaker
is open") }` (or any other generic message) becomes what EVERY caller sees for ANY
underlying failure — a real 401, a bad URL, a network timeout, a bug in your own request
code — for the entire lifetime of the breaker instance. Found in this project's LabelGrid
integration: this pattern hid a "the transport layer is completely broken and every call
throws before touching the network" bug (see axios-adapter-wrapping-gotcha.md) for an
unknown period, because the fallback's generic message looked like normal, expected
circuit-breaker behavior instead of an active fire.

## How to apply
- Prefer no fallback at all unless you have a genuinely safe, honest degraded value to
  return (e.g. a cached last-known-good result, or an explicit `{reachable: false}`
  shape a caller can branch on) — never a fabricated generic error string.
- If you do need a fallback, check `getState()` inside it and behave differently for
  OPEN vs. the (should-be-rare) CLOSED-but-still-failing case, or at minimum re-throw
  the ORIGINAL error's message instead of a synthetic one.
- When debugging "why does X always fail the same way," check whether a
  `CircuitBreaker.execute` fallback is swallowing the real per-call error before
  assuming the breaker itself is misconfigured, or before assuming the remote service
  itself is down.
