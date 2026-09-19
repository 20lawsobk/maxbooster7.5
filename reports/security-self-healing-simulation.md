# Self-Healing Security Simulation

## Safety and isolation

The simulation exercised the production `SelfHealingSecurityEngine` class and
the production middleware factory. It did not call the admin
`/simulate-attack` route, did not use the live singleton for test traffic, and
did not connect to a real database or object store. Each case used an injected,
chain-compatible fake database, Vitest fake timers, and RFC 5737 TEST-NET
addresses (`192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24`) for
external clients. The private-address bypass regressions necessarily use
representative RFC 1918 addresses.

The focused command was run with an empty environment apart from the minimum
runtime values:

```text
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test \
  ./node_modules/.bin/vitest run --config vitest.config.ts \
  tests/unit/selfHealingSecurityEngine.test.ts --reporter=verbose
```

Result after the coverage audit: **1 file passed, 25 tests passed**. A focused quiet ESLint invocation
over the engine, middleware, and test file also passed with no findings.

### Coverage-preservation audit

The earlier suite rewrite reduced line and test counts because the legacy suite
ran three separate parameterized passes over the same attack table (detection,
alert, and block/rate response). The focused suite now makes those assertions
together for each attack vector, so one execution proves the connected
detect/respond/recover contract without three independent attacks mutating
shared singleton state. Raw test counts therefore are not one-for-one with the
legacy layout.

An explicit comparison against the previous file restored every distinct,
still-valid behavior that was not already covered:

- running lifecycle/status counters, latency samples, and all SLO flags;
- path traversal, command injection, LDAP, XXE, and NoSQL classification;
- alert, resolved recovery, and correct hard-block versus rate-limit response
  for every attack class;
- DDoS threshold behavior in addition to brute-force threshold behavior;
- blocked-event short circuit and `threatsBlocked` accounting;
- block listing and durable clear controls;
- the explicit loopback safety exception (the outdated blanket-private
  exception was intentionally not restored);
- clean middleware pass-through, finish-listener registration, known-block 403
  status, and response code.

No coverage was removed to make the final run pass. The restored checks were
run only in the focused isolated test file.

## Evidence covered

- Benign prose, SQL tutorial syntax, `CONCAT(...)`, and an ordinary HTML entity
  produced no detections, writes, or blocks.
- SQL injection completed the real detect/respond/recover path, produced one
  blacklist write, one alert, and one resolved recovery row, and was enforced
  in memory. Exact counts prove the immediate and queued paths no longer process
  the same event twice.
- XSS was detected and recovered but received a finite rate-limit response
  rather than a blanket hard block.
- Authentication abuse remained below threshold for 20 attempts, triggered on
  attempt 21, and recovered after its five-minute window.
- A persisted blacklist row was loaded and enforced, expired at its stored
  deadline, and a successful unblock performed durable deletion before removing
  in-memory enforcement.
- Initial blacklist-read failure left policy state explicitly `unknown`;
  middleware failed closed with `503 SECURITY_STATE_UNAVAILABLE`.
- A write outage still enforced a newly detected critical block in memory.
  Failed durable unblock propagated an error and retained enforcement.
- Middleware ignored a spoofed `X-Forwarded-For: 127.0.0.1` when the direct
  socket was external.
- RFC 1918 clients are no longer blanket-whitelisted: their events reach the
  engine, malicious payloads are blocked, and unknown initial policy fails
  closed. Only loopback and the explicit boot/readiness paths retain a narrow
  availability exception.
- A successful refresh removed a DB-backed block revoked by another instance,
  while a failed-write local security block survived the same empty refresh.
- Session invalidation, circuit-break, and feature-disable controls have no
  configured adapter. They now fail with explicit unsupported outcomes rather
  than recording fabricated success fields. Recovery rows persist per-action
  outcomes and count a threat healed only when a real block or rate limit was
  applied. The proof API lists these controls as limitations, not capabilities.

## Demonstrated defects fixed

- Removed duplicate processing of critical events and added event lookup
  independent of the background queue.
- Made queued rate-abuse events execute the complete response and recovery
  pipeline instead of detection only.
- Added real brute-force and DDoS windows with middleware-visible enforcement
  and expiry.
- Replaced an expiry-blind block set with finite block deadlines.
- Added explicit blocklist readiness so an unknown initial database state cannot
  silently fail open; a previously loaded finite cache remains usable during a
  later transient resync failure.
- Made unblock and clear operations persistence-first rather than reporting
  success after failed durable deletion.
- Removed overbroad SQL/XSS signatures that matched normal `ORDER BY`,
  `CONCAT`, and all numeric HTML entities.
- Removed raw forwarded-header trust, normalized IPv4-mapped addresses, and
  removed blanket RFC 1918 exemptions.
- Added injectable database/clock/start lifecycle and interval cleanup so the
  real engine can be tested safely without replacing it with a toy simulator.

## Limits

- This is deterministic component simulation, not a penetration test, load
  benchmark, proxy deployment test, or proof of the documented latency SLO.
- Session invalidation, circuit-break, and feature-disable actions remain
  unavailable until real adapters are configured; the engine reports them as
  failed/unsupported and does not represent them as executed controls.
- Database query semantics were exercised through the same chained calls but
  not against a live Drizzle/PostgreSQL instance.
- Trust-proxy correctness still depends on the application configuring Express
  with only known proxy hops; the middleware now consumes Express's resolved
  `req.ip` and deliberately does not reinterpret raw forwarding headers.