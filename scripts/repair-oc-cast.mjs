#!/usr/bin/env node
/**
 * Repairs the exact corruption introduced by fix-ts-errors-v2.mjs TS2339 handler:
 *   `(EXPR? as any).prop`  →  `(EXPR as any)?.prop`
 * The bug: receiver-walk included the `?` of `?.` in the receiver expression.
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync(
  `grep -rl '? as any)' server shared client/src 2>/dev/null || true`,
  { encoding: "utf8", cwd: "/home/runner/workspace" }
).split("\n").filter(Boolean);

let totalFixes = 0, leftover = 0;
for (const f of files) {
  const path = `/home/runner/workspace/${f}`;
  let src = readFileSync(path, "utf8");
  let out = "";
  let i = 0, fixes = 0;
  while (i < src.length) {
    const hit = src.indexOf("? as any)", i);
    if (hit === -1) { out += src.slice(i); break; }
    // find matching '(' scanning backwards from `hit` with depth counting
    let depth = 0, open = -1;
    for (let j = hit - 1; j >= 0; j--) {
      const ch = src[j];
      if (ch === ")" || ch === "]") depth++;
      else if (ch === "(" || ch === "[") {
        if (ch === "(" && depth === 0) { open = j; break; }
        depth--;
      } else if (ch === "\n" && depth === 0) break; // don't cross lines at depth 0
    }
    const closeIdx = hit + "? as any)".length - 1; // index of ')'
    const next = src[closeIdx + 1];
    if (open >= 0 && next === ".") {
      const expr = src.slice(open + 1, hit); // receiver without trailing ?
      out += src.slice(i, open) + `(${expr} as any)?.`;
      i = closeIdx + 2; // skip past ')' and '.'
      fixes++;
    } else {
      // unexpected form — keep as-is, report
      out += src.slice(i, hit + "? as any)".length);
      i = hit + "? as any)".length;
      leftover++;
      console.log(`LEFTOVER: ${f}: ...${src.slice(Math.max(0, hit - 40), hit + 20).replace(/\n/g, "\\n")}...`);
    }
  }
  if (fixes > 0) {
    writeFileSync(path, out, "utf8");
    totalFixes += fixes;
  }
}
console.log(`Repaired ${totalFixes} occurrences across ${files.length} files; ${leftover} leftover odd forms.`);
