#!/usr/bin/env node
/**
 * fix-ts2724-underscore.mjs — import-rename debris: `import { _X }` where the
 * module exports `X` and tsc says "Did you mean 'X'". Only applies when the
 * suggestion is exactly the imported name minus a leading underscore, so no
 * guessing. Rewrites the import to `X as _X` if `_X` is used in the file, else
 * renames the specifier. Syntax-gated via esbuild.
 */
import fs from "node:fs";
import { transformSync } from "esbuild";

const input = process.argv[2] || "/tmp/tc_server.txt";
const text = fs.readFileSync(input, "utf8");
const RE = /^(.+?)\((\d+),(\d+)\): error TS2724: .+ has no exported member named '(_\w+)'\. Did you mean '(\w+)'\?/gm;
const perFile = new Map();
let m;
while ((m = RE.exec(text))) {
  const [, file, , , bad, good] = m;
  if (bad !== "_" + good) continue; // only exact underscore-debris
  if (!perFile.has(file)) perFile.set(file, []);
  perFile.get(file).push({ bad, good });
}
let changed = 0, fixed = 0, restored = 0;
for (const [file, pairs] of perFile) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  for (const { bad, good } of pairs) {
    const importRe = new RegExp(`(import\\s*(?:type\\s*)?\\{[^}]*?)\\b${bad}\\b([^}]*\\}\\s*from)`);
    if (!importRe.test(src)) continue;
    // keep local name _X (other refs use it) by aliasing the real export
    src = src.replace(importRe, `$1${good} as ${bad}$2`);
    fixed++;
  }
  if (src === orig) continue;
  try {
    transformSync(src, { loader: "ts", format: "esm" });
    fs.writeFileSync(file, src);
    changed++;
  } catch { restored++; }
}
console.log(`fix-ts2724-underscore: files=${changed} fixed=${fixed} syntax-restored=${restored}`);
