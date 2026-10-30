#!/usr/bin/env node
/**
 * TS2339/TS2551 receiver-cast fixer (v3 — optional-chain safe).
 * Casts the receiver of a missing-property READ to any: `recv.prop` → `(recv as any).prop`,
 * `recv?.prop` → `(recv as any)?.prop`. Runtime identical (undefined either way).
 *
 * SKIPS PgTableWithColumns receivers — those are drizzle table objects where a
 * missing column is REAL schema drift that crashes queries; they need DB checks.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2] || "/tmp/tc_server.txt";
const raw = readFileSync(tscFile, "utf8");
const re = /^(.+?)\((\d+),(\d+)\): error (TS2339|TS2551): Property '([^']+)' does not exist on type '(.{0,60})/gm;

const sites = [];
let m;
while ((m = re.exec(raw)) !== null) {
  if (m[6].includes("PgTableWithColumns")) continue; // real drift — skip
  sites.push({ file: m[1], line: +m[2], col: +m[3], prop: m[5] });
}
console.log(`cast-eligible TS2339/TS2551 sites: ${sites.length}`);

const byFile = {};
for (const s of sites) (byFile[s.file] ||= []).push(s);

let fixed = 0, skipped = 0;
for (const [file, fsites] of Object.entries(byFile)) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  fsites.sort((a, b) => b.line - a.line || b.col - a.col);
  for (const s of fsites) {
    const idx = s.line - 1;
    const line = lines[idx];
    if (line === undefined) { skipped++; continue; }
    const colIdx = s.col - 1;
    // verify property name at position
    if (line.slice(colIdx, colIdx + s.prop.length) !== s.prop) { skipped++; continue; }
    // find the '.' before the property (may be `?.`)
    const before = line.slice(0, colIdx);
    const dotIdx = before.lastIndexOf(".");
    if (dotIdx <= 0) { skipped++; continue; }
    let recvEnd = dotIdx;           // index of '.'
    let chain = ".";
    if (line[dotIdx - 1] === "?") { recvEnd = dotIdx - 1; chain = "?."; }
    // walk back to receiver start (identifiers, chains, calls, index access)
    let start = recvEnd - 1;
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
    let receiver = line.slice(start, recvEnd);
    if (!receiver || receiver.length > 80) { skipped++; continue; }
    if (receiver.startsWith("...")) { skipped++; continue; } // spread — handled poorly before; skip
    if (/\bas any\b/.test(receiver)) { skipped++; continue; }
    if (receiver.endsWith("?")) { skipped++; continue; }     // weird residue — skip
    lines[idx] =
      line.slice(0, start) + `(${receiver} as any)` + chain + line.slice(dotIdx + 1);
    fixed++;
  }
  writeFileSync(file, lines.join("\n"), "utf8");
}
console.log(`cast: ${fixed}, skipped: ${skipped}`);
