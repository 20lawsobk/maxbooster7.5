---
name: "Looks-wired-but-inert" feature patterns
description: A route/field/mutation can be fully typed and present yet never actually take effect — checklist of the shapes this takes and how to catch each
---

## Patterns that look done but aren't

1. **Backend: accepted-but-unprocessed request field.** A route reads `req.body.someField` inside a working handler, but nothing in that handler's logic branches or acts on it — the response is still 200/201, so the client-visible symptom is silent wrong-behavior, not an error. (Real case: `POST /projects` accepted `duplicateFrom` from the live Save-As dialog but the handler never read it, always creating a blank project — a live data-loss bug that shipped without any error.) Check: for every field a frontend actually sends, grep the handler body for a real conditional/usage of that exact key, not just its presence in a destructure or type.

2. **Frontend: mutation defined but never `.mutate()`-invoked.** A component can have a fully correct `useMutation` (right endpoint, right invalidation, right toast) sitting unused because no `onClick`/`onSubmit` calls `.mutate()`. This makes a dead/unreachable component look further along than it is when skimmed. Check: grep for `.mutate(` call sites, not just `useMutation(` definitions, before trusting a component is wired.

3. **Frontend: whole component built but never imported/rendered anywhere.** A fully-built, production-quality component (real query hooks, real mutations, complete UI) can simply never appear in the app's route tree or any parent component — not a broken import, just dead code that looks finished. (Real case: `EarningsReconciliation.tsx`/`RoyaltyReconciliation.tsx` — both substantial, correctly wired to 13 real backend routes — were never rendered by `Distribution.tsx`, `App.tsx`, or anywhere else in `client/src`.) Check: grep the component's own filename/export across all of `client/src` for an actual JSX usage or route registration, not just confirm the file compiles and its hooks target real endpoints — a component can be perfect and still be unreachable.

4. **Related, narrower case:** see `unused-param-missing-impl.md` for the TS6133-codemod-specific version of pattern 1 (auto-prefixing unused params can bury the same class of bug).

**Why:** all three shapes pass a shallow "is this feature implemented" skim (the code compiles, the types line up, a handler/component exists) while doing nothing at runtime. **How to apply:** when auditing whether a feature is real, trace one full field/action from UI trigger through to the exact line that uses it, and confirm the component itself is actually reachable from a route — don't stop at "a handler/mutation/component exists for this."
