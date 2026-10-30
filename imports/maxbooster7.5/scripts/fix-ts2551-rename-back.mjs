#!/usr/bin/env node
/**
 * TS2551 "Property 'X' does not exist on type 'T'. Did you mean '_X'?"
 * — v1 codemod _-prefixed class properties that ARE used elsewhere.
 * Fix: rename `_X` back to `X` throughout the file that DECLARES `_X`
 * (word-boundary token replace; usage sites already use `X`).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const tscFile = process.argv[2] || "/tmp/tc_server.txt";
const out = readFileSync(tscFile, "utf8");
const re = /^(.+?)\((\d+),(\d+)\): error TS2551: Property '([^']+)' does not exist on type '[^']*'\. Did you mean '(_\4)'\?/gm;

// collect (file → set of names) — rename in the file where the error occurred;
// declaration usually lives in the same class/file. If declared in another file,
// tsc's related-info isn't in this output, so also scan all server files for the decl.
const pairs = new Map(); // name → Set(files where error occurred)
let m;
while ((m = re.exec(out)) !== null) {
  const [, file, , , name] = m;
  if (!pairs.has(name)) pairs.set(name, new Set());
  pairs.get(name).add(file);
}
console.log(`Found ${pairs.size} distinct rename-back names`);

import { execSync } from "child_process";
let filesTouched = new Set(), renames = 0;
for (const [name, errFiles] of pairs) {
  const uname = `_${name}`;
  // find files that DECLARE _name (class field or method)
  let declFiles = [];
  try {
    declFiles = execSync(
      `grep -rlE '(private|public|protected|readonly)?\\s*${uname}\\s*[:=(;]' server shared 2>/dev/null || true`,
      { encoding: "utf8", cwd: "/home/runner/workspace" }
    ).split("\n").filter(Boolean);
  } catch { /* none */ }
  const targets = new Set([...errFiles, ...declFiles]);
  for (const f of targets) {
    const p = `/home/runner/workspace/${f}`;
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    // word-boundary replace _name → name; avoid double-underscore names
    const rx = new RegExp(`(?<![\\w$])${uname}(?![\\w$])`, "g");
    const next = src.replace(rx, name);
    if (next !== src) {
      writeFileSync(p, next, "utf8");
      filesTouched.add(f);
      renames++;
    }
  }
}
console.log(`Renamed ${renames} file-name pairs across ${filesTouched.size} files`);
