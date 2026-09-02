---
name: "Looks-wired-but-inert" feature patterns
description: A route/field/mutation can be fully typed and present yet never actually take effect — checklist of the shapes this takes and how to catch each
---

## Patterns that look done but aren't

1. **Backend: accepted-but-unprocessed request field.** A route reads `req.body.someField` inside a working handler, but nothing in that handler's logic branches or acts on it — the response is still 200/201, so the client-visible symptom is silent wrong-behavior, not an error. (Real case: `POST /projects` accepted `duplicateFrom` from the live Save-As dialog but the handler never read it, always creating a blank project — a live data-loss bug that shipped without any error.) Check: for every field a frontend actually sends, grep the handler body for a real conditional/usage of that exact key, not just its presence in a destructure or type.

2. **Frontend: mutation defined but never `.mutate()`-invoked.** A component can have a fully correct `useMutation` (right endpoint, right invalidation, right toast) sitting unused because no `onClick`/`onSubmit` calls `.mutate()`. This makes a dead/unreachable component look further along than it is when skimmed. Check: grep for `.mutate(` call sites, not just `useMutation(` definitions, before trusting a component is wired.

3. **Related, narrower case:** see `unused-param-missing-impl.md` for the TS6133-codemod-specific version of pattern 1 (auto-prefixing unused params can bury the same class of bug).

**Why:** both shapes pass a shallow "is this feature implemented" skim (the code compiles, the types line up, a handler exists) while doing nothing at runtime. **How to apply:** when auditing whether a feature is real, trace one full field/action from UI trigger through to the exact line that uses it — don't stop at "a handler/mutation exists for this."
