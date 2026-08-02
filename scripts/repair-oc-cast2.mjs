#!/usr/bin/env node
/**
 * Round 2 debris repair:
 *  A: `(EXPR? as unknown as any).x` → `(EXPR as unknown as any)?.x`   (TS2352 rewrote the corrupted cast)
 *  B: `(...EXPR as any)?.x` / `(...EXPR as unknown as any)?.x` → `...(EXPR as any)?.x`  (spread captured in receiver)
 *  C: `( as any)?.x` → `?.x`  (empty receiver — drop cast)
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync(
  `grep -rlE '\\? as unknown as any\\)|\\(\\.\\.\\.[^()]* as (unknown as )?any\\)|\\( as any\\)' server shared client/src 2>/dev/null || true`,
  { encoding: "utf8", cwd: "/home/runner/workspace" }
).split("\n").filter(Boolean);

let a = 0, b = 0, c = 0;
for (const f of files) {
  const path = `/home/runner/workspace/${f}`;
  let src = readFileSync(path, "utf8");
  const before = src;

  // Pattern A: transpose `?` out of `(EXPR? as unknown as any).`
  // walk-based like round 1 to survive nested parens in EXPR
  let out = "";
  let i = 0;
  while (i < src.length) {
    const hit = src.indexOf("? as unknown as any)", i);
    if (hit === -1) { out += src.slice(i); break; }
    let depth = 0, open = -1;
    for (let j = hit - 1; j >= 0; j--) {
      const ch = src[j];
      if (ch === ")" || ch === "]") depth++;
      else if (ch === "(" || ch === "[") {
        if (ch === "(" && depth === 0) { open = j; break; }
        depth--;
      } else if (ch === "\n" && depth === 0) break;
    }
    const closeIdx = hit + "? as unknown as any)".length - 1;
    const next = src[closeIdx + 1];
    if (open >= 0 && next === ".") {
      const expr = src.slice(open + 1, hit);
      out += src.slice(i, open) + `(${expr} as unknown as any)?.`;
      i = closeIdx + 2;
      a++;
    } else {
      out += src.slice(i, hit + "? as unknown as any)".length);
      i = hit + "? as unknown as any)".length;
      console.log(`A-LEFTOVER ${f}: ...${src.slice(Math.max(0, hit - 50), hit + 25).replace(/\n/g, "\\n")}...`);
    }
  }
  src = out;

  // Pattern B: move spread out of the cast parens
  src = src.replace(/\(\.\.\.([^()]+?) as (unknown as )?any\)/g, (m, expr, unk) => {
    b++;
    return `...(${expr} as ${unk || ""}any)`;
  });

  // Pattern C: empty receiver cast
  src = src.replace(/\(\s+as any\)\?\./g, () => { c++; return "?."; });
  src = src.replace(/\(\s+as any\)\./g, () => { c++; return "."; });

  if (src !== before) writeFileSync(path, src, "utf8");
}
console.log(`A(transpose unknown-any): ${a}, B(spread-out): ${b}, C(empty-recv): ${c} across ${files.length} files`);
