#!/usr/bin/env node
/**
 * Codemod-debris repair: removes `?.` that was accidentally injected into the
 * LITERAL TEXT of SQL template strings (e.g. `information_schema?.tables`,
 * `JOIN x ON s.id = sd?.storefront_id`). JS expressions inside ${...} are
 * left untouched — `?.` is valid and intended there.
 *
 * Strategy: state-machine over each file tracking template-literal context
 * and ${} interpolation depth. Only rewrites `?.` found in literal text of
 * template strings whose content looks like SQL.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SQL_HINT = /\b(SELECT|INSERT INTO|UPDATE\s|DELETE FROM|JOIN|GROUP BY|ORDER BY|CREATE (TABLE|INDEX)|information_schema|LEFT JOIN)\b/i;

const files = execSync(
  String.raw`grep -rlE '\?\.' server shared scripts --include='*.ts' --include='*.js' --include='*.mjs'`,
  { encoding: "utf8", maxBuffer: 64e6 },
).trim().split("\n").filter(Boolean).filter((f) => !f.includes("fix-sql-optional-chain"));

let totalFixes = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = "";
  let i = 0;
  let changed = false;
  const n = src.length;
  // States: code | template(literal) | template-expr(depth)
  while (i < n) {
    const ch = src[i];
    if (ch === "`") {
      // Entering a template literal: capture until its end, tracking ${} depth.
      let j = i + 1;
      let depth = 0;
      let segStart = j;
      const parts = []; // {text, isLiteral}
      while (j < n) {
        const c = src[j];
        if (depth === 0) {
          if (c === "\\") { j += 2; continue; }
          if (c === "`") break;
          if (c === "$" && src[j + 1] === "{") {
            parts.push({ text: src.slice(segStart, j), isLiteral: true });
            segStart = j;
            depth = 1;
            j += 2;
            continue;
          }
        } else {
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              parts.push({ text: src.slice(segStart, j + 1), isLiteral: false });
              segStart = j + 1;
            }
          } else if (c === "`") {
            // nested template inside expr — skip it naively (rare)
            let k = j + 1;
            while (k < n && src[k] !== "`") { if (src[k] === "\\") k++; k++; }
            j = k;
          }
        }
        j++;
      }
      parts.push({ text: src.slice(segStart, j), isLiteral: depth === 0 });
      const literalText = parts.filter((p) => p.isLiteral).map((p) => p.text).join("");
      const isSql = SQL_HINT.test(literalText);
      let rebuilt = "";
      for (const p of parts) {
        if (p.isLiteral && isSql && /\?\./.test(p.text)) {
          const fixed = p.text.replace(/([A-Za-z_][A-Za-z0-9_]*)\?\./g, "$1.");
          if (fixed !== p.text) {
            totalFixes += (p.text.match(/\?\./g) || []).length;
            changed = true;
          }
          rebuilt += fixed;
        } else {
          rebuilt += p.text;
        }
      }
      out += "`" + rebuilt + "`";
      i = j + 1;
      continue;
    }
    // Skip normal strings and comments to avoid confusing the scanner.
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch) { if (src[j] === "\\") j++; j++; }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      let j = src.indexOf("\n", i);
      if (j === -1) j = n;
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  if (changed) {
    writeFileSync(file, out);
    console.log("fixed:", file);
  }
}
console.log("total ?. removed from SQL literals:", totalFixes);
