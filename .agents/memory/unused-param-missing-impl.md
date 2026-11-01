---
name: Unused params can hide missing implementation
description: When auto-prefixing TS6133 unused params with `_`, two patterns signal a half-built feature that the prefix would silently bury — audit for them
---

## Rule
Auto-prefixing an unused parameter with `_` is behavior-preserving (the code already ignored it), but `_` means "intentionally unused" — applying it to a param that was *meant* to be used masks a latent bug. Before/after a bulk `_`-prefix codemod on TS6133 params, audit each renamed param for these two high-signal "missing implementation" patterns and surface (do not silently mask) any hits:

1. **Accepted-and-counted but not processed.** The function takes a collection param, reports a `*Queued`/count of it, but the body only processes a *sibling* collection. (Real case: `_processDistributorImport(..., isrcs, upcs)` looped MusicBrainz over `isrcs`, reported `upcsQueued`, but had no `upcs` processing — UPCs were dropped.)
2. **Sibling-inconsistency.** A param the function ignores is threaded through by every *sibling* function with the same shape. (Real case: `useRecoverableBatch(module)` ignored `module` while `useRecoverable`/delete/update variants all passed `module` into their action options.)

**Genuinely-intentional (prefix is correct, no flag needed):**
- Express `(req, res)` handlers that only use `res` (e.g. static/stub responses) — `req` is the required positional slot.
- A set of callbacks sharing one uniform signature where each uses only some params (e.g. a table of `(name, slug) => url` builders).
- Interface/override/event-handler signatures dictated by an external contract.

**Why:** behavior-preserving ≠ harmless — masking incomplete logic is a silent regression of intent. The user explicitly asked to confirm "unused" params weren't missing pieces. **How to apply:** keep the safe prefixes; for pattern-1/2 hits, report them as follow-ups (implementing them is behavior-CHANGING and out of scope for a type-cleanup pass), don't bundle a real feature fix into "behavior-preserving cleanup".
