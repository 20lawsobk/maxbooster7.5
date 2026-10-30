---
name: TS6133 autofix hazards
description: Which unused-identifier sites are safe to underscore-prefix and which silently break code
---

# TS6133 (unused identifier) autofix hazards

Rule: only underscore-prefix **function/catch params and array-destructure elements**. Everything else breaks silently:

- **Object-destructure shorthand** `{ x }` → `{ _x }` changes the *looked-up property key* → new TS2551 at the same site. Safe form: `{ x: _x }` (keeps suppression, restores the key). Skip when already keyed (`next === ":"`).
- **Class properties** and **let/var locals**: TS6133 fires when a symbol is never *read* — but **writes don't count as reads**. `private isRunning` flagged unused may still have `this.isRunning = true` writers; prefixing the declaration breaks every write site (TS2551 "did you mean '_X'"). Skip via `before`-text guards for `private|protected|public|readonly|static` and `const|let|var`.

**Why:** this exact bug shipped twice (v1 codemod, then again in the fix-all native handler) and each time produced a ~120-error TS2551 spike that looked like progress reversal.

**How to apply:** any TS6133 auto-handler must guard on the text before the identifier. Repair path for prefixed-declaration damage: `scripts/fix-ts2551-rename-back.mjs` driven by a FRESH tsc output (it matches "did you mean '_X'" and renames declarations back). Repair for destructure damage: `scripts/repair-destructure-prefix.mjs` (inverted pairs "Property '_x' … did you mean 'x'").
