#!/usr/bin/env node
/**
 * Swap pino logger args at TS2769 sites: logger.X("msg", {obj}) → logger.X({obj}, "msg")
 * Driven by tsc diagnostics whose overload detail matches pino's LogFn.
 * Only swaps when: arg1 is a string literal AND arg2 starts with `{` (object literal).
 * Char-scanner handles nested braces, strings, template literals across lines.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2] || "/tmp/tc_server.txt";
const raw = readFileSync(tscFile, "utf8");
const lines = raw.split("\n");

// collect TS2769 sites whose following detail lines mention pino-like overloads
const sites = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(.+?)\((\d+),(\d+)\): error TS2769: No overload matches this call\./);
  if (!m) continue;
  const detail = lines.slice(i + 1, i + 8).join("\n");
  if (/Overload \d of \d, '\(obj:/.test(detail)) {
    sites.push({ file: m[1], line: +m[2], col: +m[3] });
  }
}
console.log(`pino-like TS2769 sites: ${sites.length}`);

const byFile = {};
for (const s of sites) (byFile[s.file] ||= []).push(s);

function parseString(src, i) {
  // src[i] is a quote char; returns index AFTER closing quote, or -1
  const q = src[i];
  if (q !== '"' && q !== "'" && q !== "`") return -1;
  i++;
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
      // template expr — balanced braces
      let d = 1; i += 2;
      while (i < src.length && d > 0) {
        if (src[i] === "{") d++;
        else if (src[i] === "}") d--;
        i++;
      }
      continue;
    }
    if (src[i] === q) return i + 1;
    if (q !== "`" && src[i] === "\n") return -1; // unterminated
    i++;
  }
  return -1;
}

function scanBalanced(src, i, stopAtDepth0) {
  // scan from i until one of stopAtDepth0 chars at depth 0; returns index of stop char
  let depth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const e = parseString(src, i);
      if (e === -1) return -1;
      i = e;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); if (i === -1) return -1; i += 2; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0 && stopAtDepth0.includes(ch)) return i;
      depth--;
      if (depth < 0) return -1;
    } else if (depth === 0 && stopAtDepth0.includes(ch)) return i;
    i++;
  }
  return -1;
}

let swapped = 0, skipped = 0;
for (const [file, fsites] of Object.entries(byFile)) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, "utf8");
  // line-start offsets (recomputed per edit since text shifts)
  fsites.sort((a, b) => b.line - a.line || b.col - a.col); // bottom-up
  for (const s of fsites) {
    const offs = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") offs.push(i + 1);
    const lineStart = offs[s.line - 1];
    if (lineStart === undefined) { skipped++; continue; }
    let p = lineStart + s.col - 1;
    // find the first '(' at/after p (the call paren)
    const openParen = src.indexOf("(", p);
    if (openParen === -1) { skipped++; continue; }
    // arg1 must be a string literal
    let a1 = openParen + 1;
    while (/\s/.test(src[a1])) a1++;
    if (!['"', "'", "`"].includes(src[a1])) { skipped++; continue; }
    const a1end = parseString(src, a1);
    if (a1end === -1) { skipped++; continue; }
    // expect comma
    let c = a1end;
    while (c < src.length && /\s/.test(src[c])) c++;
    if (src[c] !== ",") { skipped++; continue; }
    // arg2 must start with '{'
    let a2 = c + 1;
    while (a2 < src.length && /\s/.test(src[a2])) a2++;
    if (src[a2] !== "{") { skipped++; continue; }
    // find end of arg2: scan to ',' or ')' at depth 0
    const stop = scanBalanced(src, a2, ",)");
    if (stop === -1) { skipped++; continue; }
    // only swap simple 2-arg calls: stop must be ')' (no 3rd arg)
    if (src[stop] !== ")") { skipped++; continue; }
    const str = src.slice(a1, a1end);
    const obj = src.slice(a2, stop).trimEnd();
    src = src.slice(0, openParen + 1) + obj + ", " + str + src.slice(stop);
    swapped++;
  }
  writeFileSync(file, src, "utf8");
}
console.log(`Swapped ${swapped}, skipped ${skipped}`);
