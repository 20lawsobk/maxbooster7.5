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

**Full-codebase survey (round 2) — confirmed instances and the shape that separates bug from fine:**

- `contentVariantGenerator.ts` hashtag-set generation was a *more severe* sub-variant: a loop meant to
  return N distinct candidate sets never folded the loop index into any seed, and one shuffle used a
  hardcoded literal seed with no content-specific salt at all — so every one of the N "sets" was
  provably byte-identical, for every user, every time (not just frozen across separate calls, frozen
  *within a single call*). Fix pattern for this shape: a helper that calls the bandit sequentially per
  slot, shrinking the candidate pool after each pick (guarantees in-set distinctness for free), while the
  bandit's own persisted trial state gives cross-call rotation with no fabricated reward needed. Same
  file's hook-template pick was the plain frozen-per-content variant (one bandit call per hook type).
- A second confirmed plain instance: a chord-progression picker keyed on genre+mood only. A handful of
  fixed mood values intentionally short-circuit to a hardcoded progression *before* reaching the pick —
  that's a legitimate product override, not the bug — but every other mood (including blank) fell through
  to the frozen seeded pick and is a real, reachable, authenticated gap.
- **Verified NOT bugs, do not re-flag:** (a) a selector producing a continuous synthetic score instead of
  a discrete candidate choice — wrong shape for a bandit entirely; (b) a seed that already incorporates
  the live request/message text, not just stable attributes — genuinely request-scoped, not frozen; (c)
  cosmetic per-prompt formatting micro-choices (emoji, an inclusion gate, a phrase pick) — converting a
  coin-flip-level formatting detail into an async DB-backed bandit call is over-engineering, not a fix,
  even though it is technically "frozen for identical input."
- A whole legacy engine file full of `seededIndex` call sites (20+) turned out to be **dead code**: its
  singleton export was imported by exactly two otherwise-live files, but neither ever called a method on
  it. Always confirm a call site is actually *reached* (grep the singleton/import name for real usage in
  its importers, not just that the importer itself is wired up) before spending time classifying bug vs.
  intentional on that file's internals — dead code makes the whole question moot.
