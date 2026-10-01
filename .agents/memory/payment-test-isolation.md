---
name: Payment verification isolation
description: Why Stripe test credentials alone do not isolate this project's payment verification.
---

Payment verification must isolate both Stripe and application persistence. Use the dedicated test credentials explicitly; never temporarily switch the running application's payment keys or run its schedulers to obtain test coverage.

**Why:** This project's development and production application share the same self-managed database. Stripe test-mode events can still reach enabled webhook endpoints and cause application writes. A test key prevents real money movement, not shared-database side effects.

**How to apply:** Before any remote test writes, verify test-key formats, Stripe's authoritative `livemode: false`, and the complete enabled-webhook inventory. Block if events could reach shared data; do not disable existing endpoints without approval. Execute production code against disposable local SQL or isolated repositories. Separate real-provider acceptance, production contract tests, SQL accounting tests, and browser confirmation evidence in reports.

The project owner confirms that separate sandbox/development and production credentials are configured for both Stripe and Too Lost. Treat provider-environment separation as present; do not describe missing sandbox credentials or a need to switch live credentials as a readiness blocker. This does not by itself establish application-database or webhook isolation.

Successful card confirmation can precede availability of the charge's balance transaction.

**Why:** Real Stripe test payments demonstrated this timing gap. Immediate accounting verification correctly refused to invent settled provider fees.

**How to apply:** Test transient rejection explicitly, then use a bounded readiness poll of the owned provider record before testing final settlement. Never replace missing accounting with assumed fees or classify the timing gap as a completed settlement.

Remote payment fixtures need a durable ownership journal before creation and an exact ID entry immediately after each provider response. Preserve earlier manifests before publishing a new run, including through failed credential or webhook preflight.

**Why:** An earlier harness lost exact cleanup identifiers when it exited. Safe cleanup then could not prove ownership; a later guard failure must not make that loss worse by replacing an existing manifest with an empty one.

**How to apply:** Persist a unique metadata/idempotency tag before a write, journal returned IDs before assertions or retries, and archive unresolved manifests across runs. Recover only provably owned resources. Keep unknown cleanup distinct from immutable provider history and never turn either into a false clean verdict.