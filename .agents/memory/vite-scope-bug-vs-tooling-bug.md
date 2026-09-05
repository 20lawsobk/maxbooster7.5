---
name: Diagnose cross-scope JSX reference bugs before blaming Vite/esbuild
description: A hook declared in one component but referenced (via misplaced JSX) in a sibling component can look like a dev-server transform bug; check function boundaries first, and never trust a clean tsc on a file with @ts-nocheck
---

# A "renamed declaration vs. unsuffixed usage" pattern usually means YOUR code is out of scope, not that the bundler is broken

## The trap

Vite's dev server served a React component file where a `useState` destructured
variable appeared as `fooBar` at its declaration site but the JSX usages elsewhere
in the same file referenced what looked like the same name. It's tempting to read
this as evidence of a Babel/react-refresh/esbuild transform corruption bug,
especially if disabling other plugins and building a small isolated repro of the
same hook pattern both fail to reproduce it (the repro looking "clean" feels like
confirmation the transform is fine for small files but breaks on large ones).

**That theory is almost always wrong.** The real cause found here: JSX referencing
a component's local state (`isFooOpen`/`setIsFooOpen`, declared inside
`export default function ComponentA()`) had been inserted, during an earlier
edit, into a completely different sibling top-level function
(`function ComponentB()`) later in the same file — a copy/insertion mistake, not
a tooling defect. A reference to a variable that only exists in a sibling
function's scope is invalid in *any* JS environment (dev transform or production
bundle) — there is no scope-chain path from `ComponentB` up to a `const` local to
`ComponentA`. Any renamed/suffixed appearance in dev output is a side effect of
the dev transform's handling of that already-invalid reference, not the root
cause.

## How to diagnose correctly

1. Before suspecting the bundler, find the top-level function boundaries and
   confirm the declaration site and *every* usage site fall inside the *same*
   function. Grep for `^function `/`^export default function ` line numbers and
   bracket the range, then check each usage line falls inside it.
2. Be especially suspicious when an edit was anchored on a nearby comment or
   text landmark (e.g. "insert after the button that says X") rather than a line
   number — landmark text can exist verbatim inside an unrelated sibling
   component later in the file, causing edits to land in the wrong function.
3. Isolated small repros of "the same hook pattern" proving clean is NOT
   evidence the large file's transform is the problem — it just proves the
   *pattern* is fine in correct scope. It says nothing about whether the real
   file's specific insertion point was correctly scoped.
4. **Check for `// @ts-nocheck` at the top of the file before trusting a clean
   `tsc --noEmit` as proof of correctness.** A file with this pragma is invisible
   to the typechecker — "tsc reported zero errors" means nothing for that file.
   This is what let the scope bug ship past typecheck in the first place.
5. Live click-through testing (real browser, real click) is the tiebreaker once
   the theory doesn't match reality — e.g. predicting a `ReferenceError` crash on
   click but observing no crash and no dialog opening at all was the signal that
   the transform-bug theory didn't fit and the real cause needed to be
   re-investigated from scratch.
