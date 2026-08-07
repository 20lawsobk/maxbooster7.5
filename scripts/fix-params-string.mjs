#!/usr/bin/env node
/**
 * fix-params-string.mjs — Express 5 typed req.params values as string|string[].
 * Named route params are always strings at runtime; at every tsc-diagnosed site
 * whose message block mentions 'string | string[]', cast bare `req.params.x`
 * on the diagnosed line to `(req.params.x as string)`.
 * Position-verified: only lines named by a current diagnostic are touched.
 * Syntax-gated per file via esbuild transform; failed files are restored.
 */
import fs from "node:fs";
import { transformSync } from "esbuild";

const input = process.argv[2] || "/tmp/tc_server.txt";
const text = fs.readFileSync(input, "utf8");

// Group diagnostic blocks: header line + indented continuation lines
const lines = text.split("\n");
const targets = new Map(); // file -> Set(lineNo)
let cur = null;
for (const ln of lines) {
  const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(ln);
  if (m) {
    cur = { file: m[1], line: +m[2], block: m[5] };
  } else if (cur && /^\s/.test(ln)) {
    cur.block += "\n" + ln;
  } else {
    cur = null;
    continue;
  }
  if (cur && cur.block.includes("'string | string[]'")) {
    if (!targets.has(cur.file)) targets.set(cur.file, new Set());
    targets.get(cur.file).add(cur.line);
  }
}

const RE = /\breq\.params\.([A-Za-z_$][\w$]*)\b(?!\s*as\s)/g;
let filesChanged = 0, sites = 0, restored = 0;
for (const [file, lineSet] of targets) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  const srcLines = src.split("\n");
  let changed = false;
  for (const lineNo of lineSet) {
    const i = lineNo - 1;
    if (i < 0 || i >= srcLines.length) continue;
    const before = srcLines[i];
    // skip if already casted on this line
    const after = before.replace(RE, (full, name, off, s) => {
      // don't double-wrap "(req.params.x as string)"
      const rest = s.slice(off + full.length);
      if (/^\s*as\s/.test(rest)) return full;
      sites++;
      return `(req.params.${name} as string)`;
    });
    if (after !== before) { srcLines[i] = after; changed = true; }
  }
  if (!changed) continue;
  const out = srcLines.join("\n");
  try {
    transformSync(out, { loader: "ts", format: "esm" });
    fs.writeFileSync(file, out);
    filesChanged++;
  } catch {
    restored++;
  }
}
console.log(`fix-params-string: files=${filesChanged} sites=${sites} syntax-restored=${restored}`);
