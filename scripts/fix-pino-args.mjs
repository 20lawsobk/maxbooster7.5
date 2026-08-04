#!/usr/bin/env node
/**
 * pino: `logger.warn("msg", expr)` silently DROPS `expr` at runtime (and is a
 * TS2769). Correct form is object-first: `logger.warn({ err: expr }, "msg")`.
 * Position-verified via the TS2769 diagnostics; skips anything ambiguous.
 * Usage: node scripts/fix-pino-args.mjs <tsc-output> [--exclude file1,file2]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2] || "reports/fix-all/tc-server.txt";
const exArg = process.argv.find((a) => a.startsWith("--exclude="));
const excluded = new Set(exArg ? exArg.slice(10).split(",").filter(Boolean) : []);
const lines = readFileSync(tscFile, "utf8").split("\n");

const LOG_RE = /(?:^|[\s({=;>&|?:!])((?:logger|log|childLogger|reqLogger|baseLogger|this\.logger|this\.log)(?:\??\.)(?:trace|debug|info|warn|error|fatal))\s*\($/;

const sites = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(.+?)\((\d+),(\d+)\): error TS2769: No overload matches this call\./);
  if (!m) continue;
  const detail = lines.slice(i + 1, i + 8).join("\n");
  if (!/Overload \d of \d, '\(obj:/.test(detail)) continue;
  sites.push({ file: m[1], line: +m[2], col: +m[3] });
}

function endOfString(src, i) {
  const q = src[i];
  if (q !== '"' && q !== "'" && q !== "`") return -1;
  i++;
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
      let d = 1; i += 2;
      while (i < src.length && d > 0) { if (src[i] === "{") d++; else if (src[i] === "}") d--; i++; }
      continue;
    }
    if (src[i] === q) return i + 1;
    if (q !== "`" && src[i] === "\n") return -1;
    i++;
  }
  return -1;
}
/** end index of an argument starting at i (stops at top-level , or )) */
function endOfArg(src, i) {
  let depth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { const e = endOfString(src, i); if (e === -1) return -1; i = e; continue; }
    if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if ("([{".includes(ch)) { depth++; i++; continue; }
    if (")]}".includes(ch)) { if (depth === 0) return ch === ")" ? i : -1; depth--; i++; continue; }
    if (ch === "," && depth === 0) return i;
    i++;
  }
  return -1;
}
function openParenOfCall(src, pos) {
  let depth = 0;
  for (let j = pos - 1; j >= 0; j--) {
    const ch = src[j];
    if (ch === ")" || ch === "]" || ch === "}") depth++;
    else if (ch === "(") { if (depth === 0) return j; depth--; }
    else if (ch === "[" || ch === "{") { if (depth === 0) return -1; depth--; }
  }
  return -1;
}

const byFile = {};
for (const s of sites) if (!excluded.has(s.file)) (byFile[s.file] ||= []).push(s);

let fixed = 0, skipped = 0, files = 0;
for (const [file, fsites] of Object.entries(byFile)) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, "utf8");
  let changed = false;
  fsites.sort((a, b) => b.line - a.line || b.col - a.col);
  for (const s of fsites) {
    const offs = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") offs.push(i + 1);
    const ls = offs[s.line - 1];
    if (ls === undefined) { skipped++; continue; }
    const open = openParenOfCall(src, ls + s.col - 1 + 1);
    if (open === -1) { skipped++; continue; }
    // callee must be a logger method
    if (!LOG_RE.test(src.slice(Math.max(0, open - 60), open + 1))) { skipped++; continue; }
    let a1 = open + 1;
    while (/\s/.test(src[a1])) a1++;
    const a1end = endOfString(src, a1);
    if (a1end === -1) { skipped++; continue; }              // arg0 not a string → leave alone
    let c = a1end;
    while (c < src.length && /\s/.test(src[c])) c++;
    if (src[c] !== ",") { skipped++; continue; }
    let a2 = c + 1;
    while (a2 < src.length && /\s/.test(src[a2])) a2++;
    const a2end = endOfArg(src, a2);
    if (a2end === -1) { skipped++; continue; }
    // accept `f("m", x)` and `f("m", x,\n)` (trailing comma) — reject 3+ args
    let close = a2end;
    if (src[close] === ",") {
      let k = close + 1;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] !== ")") { skipped++; continue; }
      close = k;
    } else if (src[close] !== ")") { skipped++; continue; }
    const msg = src.slice(a1, a1end);
    const expr = src.slice(a2, a2end).trim();
    if (!expr) { skipped++; continue; }
    const obj = src[a2] === "{" ? expr : /^err(or)?$/i.test(expr) || /\berr(or)?\b/i.test(expr) ? `{ err: ${expr} }` : `{ detail: ${expr} }`;
    src = src.slice(0, open + 1) + obj + ", " + msg + src.slice(a2end);
    fixed++; changed = true;
  }
  if (changed) { writeFileSync(file, src, "utf8"); files++; }
}
console.log(`pino object-first fixes: ${fixed} across ${files} files (skipped ${skipped})`);
