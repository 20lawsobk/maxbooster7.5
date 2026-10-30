---
name: Embedded-string ?. debris
description: The optional-chain codemod corrupted non-JS code inside string literals (GLSL, shell, SQL identifiers, URLs, file paths); judgment rule for fixing
---

## Rule
`?.` inside a string/template literal is a bug ONLY if the embedded language isn't JavaScript. Fix (remove `?`) for: GLSL shaders, shell commands, SQL identifier text, URLs/domains (`youtube?.com`), file names (`font?.ttf`), prose. LEAVE alone: JS worker-code strings and browser-injected `<script>` strings — `?.` is legal there.

**Why:** the July 2026 sweep found 246 hits across 42 files; 109 were GLSL in ShaderPresets.ts (silently failing shader compiles), 137 were shell/SQL/URL/path corruption; 34 were legitimate embedded JS.

**How to apply:** `node scripts/_scan_oc.cjs` lists all string-literal `?.` hits; judge each by embedded language. Also: `scripts/fix-sql-optional-chain.mjs` can append a stray trailing backtick to a file (known caveat) — always check the file tail and typecheck after running it.
