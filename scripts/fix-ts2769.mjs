#!/usr/bin/env node
/**
 * TS2769 fixer, two families (locator: backward paren-scan from the diagnostic
 * position, which points at the FAILING ARG, to the enclosing call paren):
 *
 *  pino:  logger.X("msg", {obj})            → logger.X({obj}, "msg")
 *         detail lines contain "Overload N of M, '(obj:"
 *  date:  new Date(nullableOrUnknown)       → new Date(expr as any)
 *         detail lines contain "'(value: string | number | Date"  or
 *         "Overload N of M, '(value:"
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2] || "/tmp/tc_server.txt";
const raw = readFileSync(tscFile, "utf8");
const lines = raw.split("\n");

const sites = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(.+?)\((\d+),(\d+)\): error TS2769: No overload matches this call\./);
  if (!m) continue;
  const detail = lines.slice(i + 1, i + 9).join("\n");
  let kind = null;
  if (/Overload \d of \d, '\(obj:/.test(detail)) kind = "pino";
  else if (/'\(value: (?:string \| number \| Date|number)\b/.test(detail) || /Overload \d of \d, '\(value:/.test(detail)) kind = "date";
  const at = detail.match(/Argument of type '([^']+)' is not assignable to parameter of type 'undefined'/);
  if (kind) sites.push({ file: m[1], line: +m[2], col: +m[3], kind, argType: at ? at[1] : null });
}
const counts = sites.reduce((a, s) => ((a[s.kind] = (a[s.kind] || 0) + 1), a), {});
console.log(`TS2769 sites — pino: ${counts.pino || 0}, date: ${counts.date || 0}`);

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
      i = e;
      continue;
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

/** backward scan from pos to the '(' that opens the enclosing call */
function enclosingParen(src, pos) {
  let depth = 0;
  for (let j = pos - 1; j >= 0; j--) {
    const ch = src[j];
    if (ch === ")" || ch === "]" || ch === "}") depth++;
    else if (ch === "(") {
      if (depth === 0) return j;
      depth--;
    } else if (ch === "[" || ch === "{") {
      if (depth === 0) return -1; // inside an object/array literal, not a call arg boundary
      depth--;
    }
  }
  return -1;
}

const byFile = {};
for (const s of sites) (byFile[s.file] ||= []).push(s);

let pinoSwapped = 0, dateCast = 0, skipped = 0;
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

    if (s.kind === "pino") {
      // diagnostic points at the object arg (or the string when obj came 1st legitimately)
      const open = enclosingParen(src, s.col === 1 ? p + 1 : p + (src[p] === "{" ? 0 : 1));
      if (open === -1) { skipped++; continue; }
      let a1 = open + 1;
      while (/\s/.test(src[a1])) a1++;
      if (!['"', "'", "`"].includes(src[a1])) { skipped++; continue; }
      const a1end = parseString(src, a1);
      if (a1end === -1) { skipped++; continue; }
      let c = a1end;
      while (c < src.length && /\s/.test(src[c])) c++;
      if (src[c] !== ",") { skipped++; continue; }
      let a2 = c + 1;
      while (a2 < src.length && /\s/.test(src[a2])) a2++;
      const stop = scanBalanced(src, a2, ",)");
      if (stop === -1 || src[stop] !== ")") { skipped++; continue; }
      const str = src.slice(a1, a1end);
      const rawExpr = src.slice(a2, stop).trimEnd();
      let obj;
      if (src[a2] === "{") {
        obj = rawExpr; // object literal — plain swap
      } else {
        const t = (s.argType || "").trim();
        const primitive =
          /^(string|number|boolean|bigint|null|undefined)(\s*\|\s*(string|number|boolean|bigint|null|undefined))*$/.test(t) ||
          /^["'`0-9]/.test(t);
        if (primitive) obj = `{ value: ${rawExpr} }`;
        else if (/^err(or)?$/i.test(rawExpr) || /^Error\b/.test(t)) obj = `{ err: ${rawExpr} }`;
        else obj = rawExpr; // object-typed identifier — plain swap
      }
      src = src.slice(0, open + 1) + obj + ", " + str + src.slice(stop);
      pinoSwapped++;
      continue;
    }

    if (s.kind === "date") {
      // diagnostic points at the arg inside new Date(...)
      const open = enclosingParen(src, p + 1);
      if (open === -1) { skipped++; continue; }
      // verify call is new Date(
      const before = src.slice(Math.max(0, open - 12), open);
      if (!/new Date\s*$/.test(before) && !/Date\s*$/.test(before)) { skipped++; continue; }
      const stop = scanBalanced(src, open + 1, ")");
      if (stop === -1) { skipped++; continue; }
      const arg = src.slice(open + 1, stop);
      if (/\bas any\s*$/.test(arg.trim())) { skipped++; continue; }
      src = src.slice(0, stop) + " as any" + src.slice(stop);
      dateCast++;
      continue;
    }
  }
  writeFileSync(file, src, "utf8");
}
console.log(`pino swapped: ${pinoSwapped}, date cast: ${dateCast}, skipped: ${skipped}`);
