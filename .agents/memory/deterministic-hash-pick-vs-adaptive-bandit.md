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

**Full-codebase survey (round 3) — grep needs multiple hash-shape patterns, not just one:**

- The FNV-1a/`seededIndex`-named search from round 2 is not exhaustive. A separate inline
  Java-`String.hashCode()`-style idiom (`hash = (hash << 5) - hash + charCode; hash = hash & hash`, both as
  a `reduce` one-liner and as an unrolled `for` loop) hides the exact same bug shape and needs its own grep
  pass. Found this way: a content-angle picker keyed only on a feature's static registry `id` (`feature.id`
  never changes) — every piece of self-promotional content generated for a given product feature, on any
  platform, forever, used the identical "angle" out of several available. Same fix shape (bandit + fallback
  to the old hash on error), same ripple (the picking function and its one caller both had to become
  `async`, two call sites needed `await`).
- Confirmed duplicate-bug-in-sibling-files instance: two independent, structurally-parallel engine classes
  (`autopilot-engine.ts` and `autonomous-autopilot.ts`) each had their own near-identical
  `resolveUrlBrief(topic, platform)` method (params reversed order between the two files, same seed
  construction inside), both with the exact same stable-key-only hash bug, both needing the same fix
  independently — one already had the bandit imported (from a previously-fixed sibling method in the same
  file), the other needed a fresh import added. When one file in a pair/family has already been fixed for
  this bug class, always check its siblings for a copy-pasted twin before declaring the class closed.
- **Verified NOT bugs, expanding the round-2 catalog:** (d) a stable per-identity visual assignment (e.g.
  assigning each collaborator/user a consistent color from a fixed palette keyed on their user id) — users
  *expect* the same identity to render identically forever; that consistency is the entire point, not a
  variety failure. Same reasoning for a per-item deterministic placeholder visual (e.g. a fake waveform
  shape seeded by a stable item id so the same item always renders the same placeholder). (e) a hash
  labeled/used as a checksum, ETag, or content-addressed version identifier — these are correctness
  mechanisms (detect-if-changed / cache-validity / dedup key), not a "pick from N options," regardless of
  which hash algorithm they use internally. (f) a hash used only to break ties *within* the bandit's own
  forced-exploration logic, self-commented as such — that is part of the fix mechanism, not an instance of
  the bug. (g) a per-position round-robin over a fixed external list (`list.indexOf(x) % otherList.length`,
  no hashing at all) used to spread a small set of variants evenly across the items of a *single batch
  call* — legitimate batch-diversity distribution, not a disguised-as-random pick that's supposed to change
  across separate calls; do not "fix" this into a bandit, since per-batch positional spread is the actual
  intended property and an adaptive pick could cluster multiple items on the same variant within one batch.
- Live-verification trick worth reusing: when a fix's effect is only visible inside one field of a larger
  response (e.g. one content "format" among several echoes the picked value into its headline, the others
  don't), compute which specific input reaches that lucky format/branch ahead of time instead of sampling
  request shapes blindly — turns "call it a bunch of times and hope" into a deterministic, minimal repro.
- **Adjacent but NOT the same bug shape — do not force a bandit fix onto this:** a procedural generator
  (e.g. a melody generator making dozens of sequential note/rhythm decisions off one seeded PRNG instance)
  seeded only by stable, low-cardinality inputs (a hardcoded key + a tempo value collapsed to one of two
  buckets by an upstream mapping) is frozen for the same reason — no time/history/entropy component — but
  there is no enumerable candidate list for the *whole output*, so `selectArm` does not fit. The honest fix
  is mixing real per-call entropy (e.g. `randomBytes`) into the seed itself, not swapping the pick
  mechanism. Tell these apart by asking "can I enumerate the finite set of things being chosen between?" —
  yes (a named format/angle/hook/progression) → bandit; no (a whole generated artifact built from many
  internal pseudo-random decisions) → the seed needs real entropy instead. Verify this shape by importing
  the generator function directly in a throwaway script and diffing output across repeated identical calls
  — far cheaper than a live HTTP round-trip when the function has no auth/DB dependency of its own.
