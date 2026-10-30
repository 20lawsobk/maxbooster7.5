#!/usr/bin/env node
/**
 * fix-params-string2.mjs — second pass for Express 5 req.params string|string[].
 * For every file that still carries a diagnostic mentioning 'string | string[]':
 *   - `... = req.params;` (destructure or alias) → `... = req.params as Record<string, string>;`
 *   - bare `req.params.x` reads → `(req.params.x as string)`
 * Named params are always strings at runtime; wildcard routes must be handled
 * manually (audited: only /api/storage/file/*key, already array-aware).
 * Syntax-gated per file via esbuild transform.
 */
import fs from "node:fs";
import { transformSync } from "esbuild";

const input = process.argv[2] || "/tmp/tc_server.txt";
const text = fs.readFileSync(input, "utf8");
const lines = text.split("\n");
const files = new Set();
let cur = null;
for (const ln of lines) {
  const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(ln);
  if (m) cur = { file: m[1], block: m[5] };
  else if (cur && /^\s/.test(ln)) cur.block += "\n" + ln;
  else { cur = null; continue; }
  if (cur && cur.block.includes("'string | string[]'")) files.add(cur.file);
}

let changed = 0, restored = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  let out = src
    .replace(/= req\.params;/g, "= req.params as Record<string, string>;")
    .replace(/\breq\.params\.([A-Za-z_$][\w$]*)\b(?!\s*as\s)(?!\s*\.join)/g, "(req.params.$1 as string)");
  // undo accidental double-wrap "((req.params.x as string) as string)"
  out = out.replace(/\(\((req\.params\.[\w$]+ as string)\) as string\)/g, "($1)");
  if (out === src) continue;
  try {
    transformSync(out, { loader: "ts", format: "esm" });
    fs.writeFileSync(file, out);
    changed++;
  } catch {
    restored++;
  }
}
console.log(`fix-params-string2: files=${changed} syntax-restored=${restored}`);
