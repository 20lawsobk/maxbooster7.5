---
name: Codemod debris bug classes
description: Two silent-failure bug classes left by past mass `?.`/underscore codemods, and how to scan for them
---

# Codemod debris bug classes (July 2026 cleanup)

Two distinct debris classes from earlier mass codemods caused silent runtime failures:

## 1. `?.` injected into literal SQL text
The optional-chaining codemod rewrote `alias.column` → `alias?.column` INSIDE the literal text of SQL template strings (e.g. `information_schema?.tables`, `JOIN x ON s.id = sd?.storefront_id`). Postgres then fails the query; callers often swallow the error (index creation "failed query", analytics silently empty).

**How to apply:** `scripts/fix-sql-optional-chain.mjs` is a state-machine scanner that removes `?.` only from literal segments of SQL-looking template strings, leaving `${...}` JS interpolations intact. CAVEAT: apostrophes inside `//` comments can desync its string tracker (it once appended a stray backtick to a file) — always verify with the "diff contains only `?.` removals" check and esbuild-transform each touched file.

## 2. Broken underscore renames (`let _x` declared, bare `x =` assigned)
The unused-var codemod renamed declarations to `_x` but left assignments as `x = ...` → ReferenceError in ESM strict mode, usually inside a try/catch that swallows it. This is how a perfectly working `sharp` was reported "not available" (3 services), how `subscriptionEndsAt` was computed but never saved (missing-impl: also was never passed to createUser), and how DSP `highFreqMod` was computed but never applied.

**How to detect:** per-file scan — for each `let|var _x`, flag bare `x =` assignments when `x` itself is not declared. Some hits are missing implementations, not just renames: check whether the value was *supposed* to be consumed (memory: unused-param-missing-impl).

**Why:** both classes fail silently (caught exceptions, suppressed SQL errors) — grep-based scans of logs for the *symptom* ("Failed query:", "not available") plus logging the caught error message are what surfaced them.
