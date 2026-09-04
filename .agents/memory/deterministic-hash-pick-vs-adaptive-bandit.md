---
name: Deterministic per-user hash pick disguised as variety
description: A pure hash(userId + stable inputs) selector looks personalized but returns the same choice forever; swapping in the shared adaptive bandit turns it async/stateful and breaks any test assuming pure repeatable output.
---

**Bug pattern:** a selection function keyed only on `userId + a stable candidate list` (e.g. FNV-1a/seeded
hash → index) has no time, history, or outcome component, so it is mathematically guaranteed to return
the identical choice for that user forever. It reads as "personalized variety" (different users get
different picks) but is actually frozen per-user — a real instance of "generation task stale/repeated
the same way." Found live in `AutopilotEngine.selectContentType()` in `server/autopilot-engine.ts`; worth
grep-checking any other `seededIndex`/hash-mod-length selector for the same shape before assuming a
"random-looking" pick is actually varying over time.

**Fix:** replace the seeded pick with the shared persisted UCB1 bandit (`selectArm`/`recordOutcome` in
`server/services/adaptiveGenerationEngine.ts`), and wire `recordOutcome` into whatever call site already
has a real, measured engagement/performance number (never a fabricated reward). This is strictly better
when a genuine reward signal already exists at a natural call site — it gets both anti-repetition AND
real self-optimization, not just rotation.

**Ripple effect (the part that isn't optional):** the old function was sync and pure; `selectArm` is
async and DB-backed, so the method signature must become `Promise<...>` and every call site needs
`await`. Any existing test that asserted **exact value equality across repeated calls with no state
change** (e.g. "deactivating an override reverts to the same baseline value as before") will now fail
even after adding `await` — not because the test is wrong about behavior, but because the underlying
assumption (pure function, same input → same output every time) is no longer true by design: `selectArm`
consumes an untried arm on every call, so a second call with the same inputs is expected to return a
*different* answer. The correct fix is to mock the adaptive layer (`selectArm`/`recordOutcome`) at the
test's module boundary — matching how every other heavy dependency in that test file is already
isolated — so the test stays focused on its real subject (override reversibility) instead of coupling to
the bandit's own stateful exploration, which is a separate concern with its own separate verification.

**Bonus finding from live verification:** exercising the changed function end-to-end (not just
typecheck + existing unit tests) surfaced an unrelated pre-existing bug one line above the edit:
`somePossiblyNullValue!.field` (a non-null assertion) threw `TypeError: Cannot read properties of null`
on every call where the value was legitimately null (the common, no-override case). `tsc` never flags
this — `!` tells the compiler to trust the author, not to prove non-null — and the existing test suite
only ever exercised the WITH-override path. It was silently caught by a surrounding try/catch and
logged as a warning, so it never crashed anything, but it meant a scary stack-trace-bearing warning fired
on nearly every real call. Caught only by actually running the changed code path live against real
inputs; fixed by switching to `?.`.
