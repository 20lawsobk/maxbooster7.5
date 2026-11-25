#!/usr/bin/env node
/**
 * Repairs destructure shorthands that were wrongly underscore-prefixed:
 * TS2551 "Property '_x' does not exist ... Did you mean 'x'?"  →  `{ _x }`
 * becomes `{ x: _x }` (restores the real lookup key, keeps the local name).
 * Position-verified; skips anything that doesn't match exactly.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const input = process.argv[2] || "reports/fix-all/tc-server.txt";
const raw = readFileSync(input, "utf8");
const re = /^(.+?)\((\d+),(\d+)\): error TS2551: Property '(_[A-Za-z0-9_$]+)' does not exist on type .*Did you mean '([A-Za-z0-9_$]+)'\?/gm;

const sites = [];
let m;
while ((m = re.exec(raw))) {
  if (m[4] === "_" + m[5]) sites.push({ file: m[1], line: +m[2], col: +m[3], bad: m[4], good: m[5] });
}
console.log(`inverted _x destructure sites: ${sites.length}`);

const byFile = {};
for (const s of sites) (byFile[s.file] ||= []).push(s);
let fixed = 0, skipped = 0;
for (const [file, list] of Object.entries(byFile)) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  list.sort((a, b) => b.line - a.line || b.col - a.col);
  for (const s of list) {
    const idx = s.line - 1;
    const line = lines[idx];
    if (!line || line.slice(s.col - 1, s.col - 1 + s.bad.length) !== s.bad) { skipped++; continue; }
    const next = line[s.col - 1 + s.bad.length] ?? "";
    if (next === ":") { skipped++; continue; } // already keyed
    lines[idx] = line.slice(0, s.col - 1) + `${s.good}: ${s.bad}` + line.slice(s.col - 1 + s.bad.length);
    fixed++;
  }
  writeFileSync(file, lines.join("\n"));
}
console.log(`repaired: ${fixed}, skipped: ${skipped}`);
