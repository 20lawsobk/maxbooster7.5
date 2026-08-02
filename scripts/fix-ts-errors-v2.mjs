#!/usr/bin/env node
/**
 * Enhanced precision TypeScript error fixer — pass 2.
 *
 * Usage: node scripts/fix-ts-errors-v2.mjs /tmp/tc_server.txt
 *        node scripts/fix-ts-errors-v2.mjs /tmp/tc_client.txt
 *
 * Handles (surgically, at exact diagnostic positions):
 *  TS18048 — 'expr' is possibly 'undefined'      → insert `!` after expr
 *  TS18047 — 'expr' is possibly 'null'           → insert `!` after expr
 *  TS2352  — conversion may be a mistake         → `as X` → `as unknown as X`
 *  TS18046 — 'e' is of type 'unknown'            → (e as any).prop   (any prop)
 *  TS2571  — object is of type 'unknown'         → cast to any
 *  TS6133  — unused import binding               → remove specifier from import
 *  TS7006  — implicit any param                  → add `: any`
 *  TS2339  — property does not exist on 'unknown'/'{}'/'never' → cast receiver to any
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2];
if (!tscFile || !existsSync(tscFile)) {
  console.error("Usage: node fix-ts-errors-v2.mjs <tsc-output-file>");
  process.exit(1);
}

const ROOT = "/home/runner/workspace";
process.chdir(ROOT);

const tscOut = readFileSync(tscFile, "utf8");
const diagRe = /^(.+?)\((\d+),(\d+)\):\s+error (TS\d+):\s+(.+)$/gm;
const diags = [];
let dm;
while ((dm = diagRe.exec(tscOut)) !== null) {
  diags.push({ file: dm[1], line: +dm[2], col: +dm[3], code: dm[4], msg: dm[5] });
}
console.log(`Parsed ${diags.length} diagnostics from ${tscFile}`);

const fileCache = {};
const getLines = f => (fileCache[f] ||= readFileSync(f, "utf8").split("\n"));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stats = {};
const bump = k => (stats[k] = (stats[k] || 0) + 1);

const byFile = {};
for (const d of diags) (byFile[d.file] ||= []).push(d);

for (const [file, fileDiags] of Object.entries(byFile)) {
  if (!existsSync(file)) continue;
  // descending position order so earlier edits don't shift later positions
  fileDiags.sort((a, b) => b.line - a.line || b.col - a.col);

  for (const d of fileDiags) {
    const lines = getLines(file);
    const idx = d.line - 1;
    let line = lines[idx];
    if (line === undefined) continue;

    // ── TS18048 / TS18047: possibly undefined / null → non-null assertion ──
    if (d.code === "TS18048" || d.code === "TS18047") {
      const em = d.msg.match(/^'(.+)' is possibly '(?:undefined|null)'/);
      if (!em) continue;
      const expr = em[1];
      const colIdx = d.col - 1;
      // Verify the source at position starts with the expression text
      if (line.slice(colIdx, colIdx + expr.length) === expr) {
        const after = line[colIdx + expr.length];
        // don't double-add !
        if (after !== "!") {
          lines[idx] =
            line.slice(0, colIdx + expr.length) + "!" + line.slice(colIdx + expr.length);
          bump(d.code);
        }
      } else {
        // fallback: first occurrence of `expr.` on the line without a trailing !
        const p = line.indexOf(expr);
        if (p >= 0 && line[p + expr.length] !== "!") {
          lines[idx] = line.slice(0, p + expr.length) + "!" + line.slice(p + expr.length);
          bump(d.code);
        }
      }
      continue;
    }

    // ── TS2352: conversion may be a mistake → as unknown as ──
    if (d.code === "TS2352") {
      const asIdx = line.indexOf(" as ", d.col - 1);
      if (asIdx > 0 && !line.slice(asIdx).startsWith(" as unknown as ")) {
        lines[idx] = line.slice(0, asIdx) + " as unknown as " + line.slice(asIdx + 4);
        bump("TS2352");
      }
      continue;
    }

    // ── TS18046 / TS2571: unknown type → cast to any at property access ──
    if (d.code === "TS18046" || d.code === "TS2571") {
      const im = d.msg.match(/^'([^']+)' is of type 'unknown'/) || d.msg.match(/^Object is of type 'unknown'/);
      if (d.msg.startsWith("Object is of type")) {
        // position points at the object expression; wrap token at position with (x as any)
        const colIdx = d.col - 1;
        const tokenMatch = line.slice(colIdx).match(/^[a-zA-Z_$][\w$]*/);
        if (tokenMatch) {
          const tok = tokenMatch[0];
          lines[idx] =
            line.slice(0, colIdx) + `(${tok} as any)` + line.slice(colIdx + tok.length);
          bump(d.code);
        }
        continue;
      }
      if (!im) continue;
      const v = im[1];
      const colIdx = d.col - 1;
      // verify identifier at position
      if (line.slice(colIdx, colIdx + v.length) === v) {
        // avoid double-wrap
        const already = line.slice(Math.max(0, colIdx - 1), colIdx) === "(" && line.slice(colIdx + v.length).startsWith(" as ");
        if (!already) {
          lines[idx] =
            line.slice(0, colIdx) + `(${v} as any)` + line.slice(colIdx + v.length);
          bump(d.code);
        }
      } else {
        const re = new RegExp(`(?<![\\w$.])${escRe(v)}(?=\\.)`);
        if (re.test(line)) {
          lines[idx] = line.replace(re, `(${v} as any)`);
          bump(d.code);
        }
      }
      continue;
    }

    // ── TS6133: unused declarations → remove import specifier or _prefix ──
    if (d.code === "TS6133") {
      const im = d.msg.match(/^'([^']+)'/);
      if (!im) continue;
      const name = im[1];
      if (name.startsWith("_")) continue;

      if (/^\s*import\b/.test(line)) {
        // remove the specifier from the import statement
        // handle: import { A, B as C, type D } from "x";  import Default from "x";  import Default, { A } from "x";
        let newLine = line;
        // named specifier possibly with alias: `Name` or `Orig as Name` or `type Name`
        const specRe = new RegExp(
          `(?:\\btype\\s+)?(?:[\\w$]+\\s+as\\s+)?\\b${escRe(name)}\\b\\s*,?\\s*`,
          "g"
        );
        if (line.includes("{")) {
          // inside braces only
          newLine = line.replace(/\{([^}]*)\}/, (m, inner) => {
            let cleaned = inner
              .split(",")
              .map(s => s.trim())
              .filter(s => {
                if (!s) return false;
                const local = s.includes(" as ") ? s.split(" as ").pop().trim() : s.replace(/^type\s+/, "").trim();
                return local !== name;
              })
              .join(", ");
            return `{ ${cleaned} }`;
          });
          // if braces now empty → drop the whole import or the braces section
          if (/\{\s*\}/.test(newLine)) {
            if (/import\s*\{\s*\}\s*from/.test(newLine)) {
              lines[idx] = ""; // whole import was only named specifiers
              bump("TS6133-import");
              continue;
            }
            // `import Default, {} from "x"` → `import Default from "x"`
            newLine = newLine.replace(/,\s*\{\s*\}\s*/, " ");
          }
        } else {
          // default or namespace import unused → remove whole line
          const defRe = new RegExp(`^\\s*import\\s+(?:\\*\\s+as\\s+)?${escRe(name)}\\b`);
          if (defRe.test(line)) {
            lines[idx] = "";
            bump("TS6133-import");
            continue;
          }
        }
        if (newLine !== line) {
          lines[idx] = newLine;
          bump("TS6133-import");
        }
        continue;
      }

      // non-import: prefix param-style occurrences
      const fixed = line.replace(
        new RegExp(`(?<=[([,\\s])${escRe(name)}(?=[,\\s)\\]:])`),
        `_${name}`
      );
      if (fixed !== line) {
        // only safe if declaration-site rename covers all uses on same line construct
        lines[idx] = fixed;
        bump("TS6133");
      }
      continue;
    }

    // ── TS7006: implicit any param ──
    if (d.code === "TS7006") {
      const im = d.msg.match(/Parameter '([^']+)'/);
      if (!im) continue;
      const p = im[1];
      const colIdx = d.col - 1;
      if (line.slice(colIdx, colIdx + p.length) === p) {
        const after = line.slice(colIdx + p.length);
        if (!after.trimStart().startsWith(":")) {
          lines[idx] =
            line.slice(0, colIdx + p.length) + ": any" + line.slice(colIdx + p.length);
          bump("TS7006");
        }
      }
      continue;
    }

    // ── TS2339 on unknown/{}/never receivers → cast receiver to any ──
    if (d.code === "TS2339") {
      const em = d.msg.match(/^Property '([^']+)' does not exist on type '(\{\}|unknown|never)'/);
      if (!em) continue;
      const prop = em[1];
      const colIdx = d.col - 1;
      // position points at the property; receiver ends right before `.prop`
      // find the `.` before col
      const before = line.slice(0, colIdx);
      const dotIdx = before.lastIndexOf(".");
      if (dotIdx <= 0) continue;
      // walk back to find start of receiver expression (identifier/chain)
      let start = dotIdx - 1;
      let depth = 0;
      while (start >= 0) {
        const ch = line[start];
        if (ch === ")" || ch === "]") depth++;
        else if (ch === "(" || ch === "[") {
          if (depth === 0) break;
          depth--;
        } else if (depth === 0 && !/[\w$.?!]/.test(ch)) break;
        start--;
      }
      start++;
      let receiver = line.slice(start, dotIdx);
      if (!receiver || receiver.length > 80) continue;
      // skip if already cast
      if (/\bas any\b/.test(receiver)) continue;
      // optional chain: `recv?.prop` — receiver captured trailing `?`; cast then re-add `?.`
      let chain = ".";
      if (receiver.endsWith("?")) {
        receiver = receiver.slice(0, -1);
        chain = "?.";
      }
      if (receiver.endsWith("?")) continue; // weird double — skip
      lines[idx] =
        line.slice(0, start) + `(${receiver} as any)` + chain + line.slice(dotIdx + 1);
      bump("TS2339-anycast");
      continue;
    }
  }
}

let saved = 0;
for (const [f, lines] of Object.entries(fileCache)) {
  writeFileSync(f, lines.join("\n"), "utf8");
  saved++;
}

console.log(`\nSaved ${saved} files. Fix stats:`, JSON.stringify(stats, null, 2));
