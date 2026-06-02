---
name: TS error mass-cleanup codemods
description: Safe methodology for clearing large tsc-error backlogs (unused-family + the DOMPurify nesting corruption) without destabilizing the app
---

## The DOMPurify nesting corruption (StudioOne files)
A runaway "sanitize-wrapping" transform once wrapped a single `<style dangerouslySetInnerHTML={{ __html: X }} />`
value 8,191 levels deep in `(typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(<inner>) : <inner>)`.
Two files (StudioOneLayout, StudioOneWrapper) were affected; it accounted for ~32,764 of the client tsc errors.

**Key traps:**
- `grep -c DOMPurify file` counts *lines*, not occurrences — a one-lined corruption shows `1` while having 16,382 tokens. Use `grep -oE DOMPurify | wc -l`.
- The corruption is ~60+ commits deep, so git-restore to an "older clean" rev does NOT help — every reachable rev has it (a later commit only reformatted one giant line into 53k lines).
- It is **behavior-preserving to unwrap**: `DOMPurify` is never imported/defined anywhere (no Vite `define`, no global, no script tag), so every ternary condition is false at runtime and the whole nest always evaluated to the innermost value (`String(cssVariables)`). Replacing the nest with the innermost value changes nothing at runtime.

**Why:** removing the nest is the only tractable fix (no clean git rev, parser would stack-overflow on 8k-deep nesting). Behavior-identical because the guard is permanently false.
**How to apply:** find the innermost = argument of the *last* `DOMPurify.sanitize(` (deepest opened); replace the whole `__html` value with it.

## Unused-family codemod methodology (TS6133/6192/6196/6198/6138)
These errors only exist because `noUnusedLocals`/`noUnusedParameters` were enabled. Safe automated handling, by node kind:
- **Unused imports** (specifiers / whole-import / default): drive off tsc diagnostic line:col → map to exact AST node → only edit inside `ImportDeclaration` → rebuild the import from AST (preserve `type` modifiers + quote style) → **re-parse the edited file and revert if it gains parseDiagnostics**. Verify TS2304 ("cannot find name") count stays flat before/after to prove no *used* import was removed.
  - **Col-1 import trap (cost a whole no-op run):** for a whole-line single import `import { Slider } from "…";`, TS6133 is reported at **column 1** (the `import` keyword), so `findNodeAtPos` returns the `ImportDeclaration` and `node.getText()` yields the ENTIRE statement, not the symbol — the rebuild then can't match the name, keeps the import, and writes IDENTICAL content (silent no-op; the client count looked "pinned/reverted" but was never edited). **Fix:** extract the unused local name from the diagnostic message via `/^'([^']+)'/` (the message names the *local* symbol, so `import { A as B }`/default/`* as ns` all resolve to the right binding), falling back to node text only if the message shape is unexpected. A non-identifier apostrophe can't appear in a real name so truncation risk is nil; a localized/changed message degrades to a false-NEGATIVE (missed cleanup), never a false removal.
- **Unused simple params** → prefix name with `_` (noUnusedParameters ignores `_`-prefixed). Zero behavior change.
- **Unused locals** → NOT fixable by `_` prefix (noUnusedLocals does not ignore underscore). Must remove (pure-literal init) or convert `const x = sideEffectCall()` → `sideEffectCall();` to preserve side effects. Classifying purity by only the top-level init node is WRONG (`const x = {a: foo()}` looks pure but isn't) — scan the whole init subtree for Call/New/Await/TaggedTemplate.
- **Unused classes/functions/interfaces** → deletion is the proper fix but is a *significant change*; flagged-unused is reliable only within TS program visibility (`allowJs:false` hides any JS-side consumers).

**Side-effect-import guardrail (architect must-do):** before deleting a whole import, confirm the module isn't imported for evaluation side effects (CSS/SCSS, `reflect-metadata`, `*register*`, `dotenv/config`, `core-js`, polyfills). A pure `import "mod"` has no bindings so it never triggers TS6192 — the risk is a binding-import whose module also self-registers. If so, rewrite to `import "mod";` instead of deleting.

## AST ancestor-climb must respect scope boundaries (the regression that bit us)
When mapping a tsc diagnostic (line:col → AST node) up to the *declaration* it belongs to, the ancestor walk MUST stop at the first `ts.isFunctionLike(x) || ts.isClassLike(x) || ts.isStatement(x)` boundary. Otherwise an unused identifier **nested inside a callback within an initializer** (e.g. an unused param in `const m = useMutation({ onError: (e)=>... })`) climbs PAST the arrow function to the outer `const` and the codemod deletes/side-effect-converts a *still-used* declaration → TS2304 regressions.
**Also** require the diagnostic position to be AT the declaration's name (`decl.name.getStart(sf) === pos`) before treating it as a whole-declaration removal; checking only "name is an Identifier" is not enough.
**Why:** TS6133 on a nested node is about the nested node, not its enclosing declaration. **How to apply:** every kind-specific climb (variable/class/function/type/member) needs both guards; class/function/type/member already gated on name-position match — the variable handler was the one missing it.

## Completeness check for "removed-still-referenced" regressions
After a removal codemod, scan EVERY `TS2304` name and compare `git show HEAD:file | grep -c '\bname\b'` vs current. A drop (HEAD>cur) = a declaration was removed while uses remain → real regression. This is a high-signal **tripwire**, NOT a soundness proof: it misses count-equalizing cases (name also in comments/strings/keys), non-TS2304 fallout, and behavior changes with no type error. Pair it with a full baseline-vs-current diagnostic-multiset diff when stakes are high.

## Remediation pattern (surgical rollback)
To fix a few mis-edited files without re-running the whole codemod (whose tc positions are stale once files change): `git show HEAD:file > file` to restore each affected file to baseline, then re-run the FIXED codemod with an `ONLY_FILES` env filter on just those files — the original tc error positions are valid again because the files match HEAD. (Avoid `git checkout`/stash — destructive git is blocked for main agent; blob reads `git show` and working-tree writes are fine.)

## Measuring (critical)
The split typecheck uses incremental `.cache/tsbuildinfo.{server,client}`. After editing, **always `rm -f .cache/tsbuildinfo.server .cache/tsbuildinfo.client` before re-running** or the cache serves stale error counts (a fast ~40s run with unchanged counts = stale cache). Full clean re-check ≈160s per the `tccap` capture workflow (writes /tmp/tc_server.txt + /tmp/tc_client.txt + /tmp/tc_done).
