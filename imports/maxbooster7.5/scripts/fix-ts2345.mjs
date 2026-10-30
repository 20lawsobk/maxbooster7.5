#!/usr/bin/env node
/**
 * TS2345 cast fixer: Argument of type 'unknown'/'{}' is not assignable to
 * parameter of type '<SIMPLE>' → wrap the arg expression: (expr as SIMPLE)
 * Only when SIMPLE is a union of primitives/null/undefined (textually safe).
 * The diagnostic position points at the argument's first token; the arg ends
 * at the first ',' or ')' at depth 0 (balanced scan).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2] || "/tmp/tc_server.txt";
const raw = readFileSync(tscFile, "utf8");

const re = /^(.+?)\((\d+),(\d+)\): error TS2345: Argument of type '(unknown|\{\})' is not assignable to parameter of type '([^']+)'\.$/gm;
const SIMPLE = /^(string|number|boolean|bigint|null|undefined)(\s*\|\s*(string|number|boolean|bigint|null|undefined))*$/;

const sites = [];
let m;
while ((m = re.exec(raw)) !== null) {
  const target = m[5].trim();
  if (SIMPLE.test(target)) sites.push({ file: m[1], line: +m[2], col: +m[3], target });
}
console.log(`castable TS2345 sites: ${sites.length}`);

function parseString(src, i) {
  const q = src[i];
  if (q !== '"' && q !== "'" && q !== "`") return -1;
  i++;
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
      let d = 1; i += 2;
      while (i < src.length && d > 0) {
        if (src[i] === "{") d++;
        else if (src[i] === "}") d--;
        i++;
      }
      continue;
    }
    if (src[i] === q) return i + 1;
    if (q !== "`" && src[i] === "\n") return -1;
    i++;
  }
  return -1;
}
function scanBalanced(src, i, stopChars) {
  let depth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const e = parseString(src, i);
      if (e === -1) return -1;
      i = e; continue;
    }
    if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); if (i === -1) return -1; i += 2; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0 && stopChars.includes(ch)) return i;
      depth--;
      if (depth < 0) return -1;
    } else if (depth === 0 && stopChars.includes(ch)) return i;
    i++;
  }
  return -1;
}

const byFile = {};
for (const s of sites) (byFile[s.file] ||= []).push(s);

let fixed = 0, skipped = 0;
for (const [file, fsites] of Object.entries(byFile)) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, "utf8");
  fsites.sort((a, b) => b.line - a.line || b.col - a.col);
  for (const s of fsites) {
    const offs = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") offs.push(i + 1);
    const lineStart = offs[s.line - 1];
    if (lineStart === undefined) { skipped++; continue; }
    const p = lineStart + s.col - 1;
    const stop = scanBalanced(src, p, ",)");
    if (stop === -1) { skipped++; continue; }
    const expr = src.slice(p, stop).trimEnd();
    if (!expr || /\bas\s+(any|string|number|boolean)\b/.test(expr)) { skipped++; continue; }
    const end = p + expr.length;
    src = src.slice(0, p) + `(${expr} as ${s.target})` + src.slice(end);
    fixed++;
  }
  writeFileSync(file, src, "utf8");
}
console.log(`cast: ${fixed}, skipped: ${skipped}`);
