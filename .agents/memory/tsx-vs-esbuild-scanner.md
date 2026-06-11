---
name: tsx vs esbuild standalone scanner
description: esbuild --bundle=false misses syntax errors in generic type args; use tsx's own esbuild transform API as the authoritative scanner
---

## Rule
When scanning TypeScript files for syntax errors, use tsx's own bundled esbuild (via `require('./node_modules/tsx/node_modules/esbuild').transform(code, {loader:'ts', target:'node18'})`) — NOT the standalone `npx esbuild --bundle=false --loader=tsx` CLI.

## Why
The standalone esbuild CLI with `--bundle=false --loader=tsx` processes files in a different mode and MISSES syntax errors that occur inside TypeScript generic type arguments. For example:
- `Promise<session?.Store>` — esbuild CLI reports no error; tsx reports "Expected > but found ?."
- `ReturnType<typeof this?.analyzeMetrics>` — same miss
- `typeof X?.Y` inside `keyof typeof [...]` — same miss

These errors are caught by tsx's own transform API because it uses the same esbuild invocation mode that tsx uses at runtime when actually loading the file.

## How to apply
Use this node snippet as the scanner:
```javascript
const esbuild = require('./node_modules/tsx/node_modules/esbuild');
const result = await esbuild.transform(code, {loader: 'ts', target: 'node18'});
// Errors thrown as TransformError with .errors array
```

The auto-fixer at `scripts/auto-fix-all-errors.sh` `run_esbuild_scan()` uses this approach.

## Corruption patterns found and fixed (June 2026 git corruption commit)

The commit added `?.` pervasively to ALL expressions. The error categories that emerged:

1. **`identifier.[`** — `?.` before `[` stripped to `.[`; fix: `s/([a-zA-Z0-9_\)\]>])\.(\[)/$1$2/g`
2. **`typeof X?.Y` in generics/type-index** — `typeof X?.Y` inside `<>` or `[keyof typeof...]`; fix: `s/typeof\s+([\w.]+)\?\.\s*(\w+)/typeof $1.$2/g` on flagged files only
3. **Module namespace type-annotations** — `session?.Store`, `multer?.MulterError`, `acme?.Client`, `cron?.ScheduledTask` in type position; fix: remove `?.`
4. **`functionName.(args)`** — standalone optional call `functionName?.()` had `?` stripped leaving `functionName.(args)`; fix: `s/\b(\w+)\.(\()/$1?.$2/g` at the specific line
5. **`++this?.prop`** / `this?.prop +=`** — optional chain on LHS of assignment; fix: remove `?.` from the chain
6. **Reserved keyword as variable** — `const class = ...`; rename to `qclass`
7. **Duplicate `const X` declarations** — commit duplicated static constants and added function-versions of same name; fix: delete the static duplicates, break circular self-reference in fallbacks
8. **`.method.()`** — broken optional method call (already covered by earlier fix): `s/\.(\w+)\.(\()/.$1?.$2/ge`
