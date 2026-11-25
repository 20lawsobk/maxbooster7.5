#!/usr/bin/env node
/**
 * Precision TypeScript error fixer.
 *
 * Reads `tsc --noEmit` output, groups errors by code, then surgically edits
 * each file at the exact reported location.
 *
 * Error codes handled:
 *  TS18046 / TS2571 — 'e' is of type 'unknown' → (e as Error).prop
 *  TS7006           — parameter implicitly has 'any' type → add `: any`
 *  TS6133           — declared but never read (unused params/vars) → prefix `_`
 *  TS2769           — pino logger "msg first" → swap arg order
 *  TS2307           — cannot find module 'X' with no type defs → add declaration
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
process.chdir(ROOT);

// ── Step 1: collect diagnostics ─────────────────────────────────────────────
console.log("Running tsc to collect diagnostics (this takes ~60s)…");
let tscOut = "";
try {
  execSync("npx tsc -p tsconfig.server.json --noEmit", {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 180_000,
  });
} catch (e) {
  tscOut = (e.stdout || "") + (e.stderr || "");
}

// Parse: "file(line,col): error TSxxxx: message"
const diagRe = /^(.+?)\((\d+),(\d+)\):\s+error (TS\d+):\s+(.+)$/gm;
const diags = [];
let dm;
while ((dm = diagRe.exec(tscOut)) !== null) {
  diags.push({
    file: dm[1],
    line: parseInt(dm[2], 10),
    col: parseInt(dm[3], 10),
    code: dm[4],
    msg: dm[5],
  });
}
console.log(`Found ${diags.length} errors across ${new Set(diags.map(d => d.file)).size} files.`);

// ── Step 2: group by file ────────────────────────────────────────────────────
const byFile = {};
for (const d of diags) {
  (byFile[d.file] ||= []).push(d);
}

// ── Step 3: fix helpers ──────────────────────────────────────────────────────
const fileCache = {};
function getLines(file) {
  if (!fileCache[file]) {
    fileCache[file] = readFileSync(file, "utf8").split("\n");
  }
  return fileCache[file];
}
function saveFile(file) {
  const lines = fileCache[file];
  if (lines) writeFileSync(file, lines.join("\n"), "utf8");
}

const stats = { TS18046: 0, TS2571: 0, TS7006: 0, TS6133: 0, TS2769: 0, TS2307: 0, other: 0 };

// ── TS18046 / TS2571: 'x' is of type 'unknown' ──────────────────────────────
// Fix: wrap the unknown identifier with (x as Error) when accessing .message/.stack/.name/.code
function fixUnknown(file, diag) {
  const lines = getLines(file);
  const idx = diag.line - 1;
  const line = lines[idx];
  if (!line) return false;
  // Extract identifier name from diagnostic message: "'e' is of type 'unknown'"
  const identMatch = diag.msg.match(/^'([^']+)'/);
  if (!identMatch) return false;
  const id = identMatch[1];
  // Replace `id.message` / `id.stack` / `id.name` / `id.code` with `(id as Error).prop`
  const before = line;
  // Only replace when not already inside a cast: !(id as Error).prop
  const fixed = line.replace(
    new RegExp(`(?<!\\(${escRe(id)} as \\w+\\)\\.)\\b${escRe(id)}\\.(message|stack|name|code)\\b`, "g"),
    (m, prop) => `(${id} as Error).${prop}`
  );
  if (fixed !== before) {
    lines[idx] = fixed;
    return true;
  }
  return false;
}

// ── TS7006: parameter 'x' implicitly has an 'any' type ──────────────────────
// Fix: add `: any` after the parameter name at the reported column
function fixImplicitAny(file, diag) {
  const lines = getLines(file);
  const idx = diag.line - 1;
  const line = lines[idx];
  if (!line) return false;
  // Extract param name from message: "Parameter 'x' implicitly has an 'any' type."
  const identMatch = diag.msg.match(/Parameter '([^']+)'/);
  if (!identMatch) return false;
  const param = identMatch[1];
  // Find the param in the line and add `: any` if not already there
  const before = line;
  // Match the param followed by `)` or `,` (but not followed by `:`)
  const fixed = line.replace(
    new RegExp(`\\b${escRe(param)}\\b(?!\\s*[?!:])(?=\\s*[,)=])`, "g"),
    `${param}: any`
  );
  if (fixed !== before) {
    lines[idx] = fixed;
    return true;
  }
  return false;
}

// ── TS6133: 'x' is declared but its value is never read ─────────────────────
// Fix: prefix with `_` (suppresses noUnusedParameters/noUnusedLocals for params)
// Only safe for FUNCTION PARAMETERS, not locals (locals need removal, not prefix)
function fixUnused(file, diag) {
  const lines = getLines(file);
  const idx = diag.line - 1;
  const line = lines[idx];
  if (!line) return false;
  // Extract name from message
  const identMatch = diag.msg.match(/^'([^']+)'/);
  if (!identMatch) return false;
  const name = identMatch[1];
  if (name.startsWith("_")) return false; // already prefixed
  // Only fix if it looks like a parameter context (inside function signature or destructure)
  // Conservative: only replace in destructure patterns like `[id, val]` or `(id, val)`
  const before = line;
  // Replace the exact identifier when it appears as a function param or destructure key
  // Pattern: preceded by `(`, `,`, `[`, or whitespace at param position
  const fixed = line.replace(
    new RegExp(`(?<=[([,\\s])${escRe(name)}(?=[,\\s)\\]])`, "g"),
    `_${name}`
  );
  if (fixed !== before) {
    lines[idx] = fixed;
    return true;
  }
  return false;
}

// ── TS2769: No overload matches (pino logger string-first pattern) ────────────
// Fix: swap logger.level("msg", {obj}) → logger.level({obj}, "msg")
function fixPinoOverload(file, diag) {
  const lines = getLines(file);
  const idx = diag.line - 1;
  const line = lines[idx];
  if (!line) return false;
  // Only attempt if line contains logger.X and string literal first
  if (!/\blogger\.(info|warn|error|debug|trace|fatal)/.test(line)) return false;
  const before = line;
  // Single-line simple swap: logger.X("msg", {obj})  →  logger.X({obj}, "msg")
  const fixed = line.replace(
    /\blogger\.(info|warn|error|debug|trace|fatal)\(\s*(["'`])(.+?)\2\s*,\s*(\{[^{}]*\})\s*\)/g,
    (m, lvl, q, msg, obj) => `logger.${lvl}(${obj}, ${q}${msg}${q})`
  );
  if (fixed !== before) {
    lines[idx] = fixed;
    return true;
  }
  return false;
}

// ── TS2307: cannot find module ────────────────────────────────────────────────
// Fix: create minimal type declaration file for unknown modules
const missingModules = new Set();
function collectMissingModule(diag) {
  const m = diag.msg.match(/Cannot find module '([^']+)'/);
  if (m) missingModules.add(m[1]);
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Step 4: process all diagnostics ─────────────────────────────────────────
for (const [file, fileDiags] of Object.entries(byFile)) {
  // Sort by line descending so edits don't shift later line numbers
  fileDiags.sort((a, b) => b.line - a.line || b.col - a.col);

  for (const d of fileDiags) {
    let fixed = false;
    if (d.code === "TS18046" || d.code === "TS2571") {
      fixed = fixUnknown(file, d);
      if (fixed) stats.TS18046++;
    } else if (d.code === "TS7006") {
      fixed = fixImplicitAny(file, d);
      if (fixed) stats.TS7006++;
    } else if (d.code === "TS6133") {
      fixed = fixUnused(file, d);
      if (fixed) stats.TS6133++;
    } else if (d.code === "TS2769") {
      fixed = fixPinoOverload(file, d);
      if (fixed) stats.TS2769++;
    } else if (d.code === "TS2307") {
      collectMissingModule(d);
    } else {
      stats.other++;
    }
  }
}

// Save all modified files
for (const file of Object.keys(fileCache)) {
  saveFile(file);
}

// ── Step 5: create missing module declarations ──────────────────────────────
if (missingModules.size > 0) {
  let decls = "// Auto-generated module declarations for missing type definitions\n";
  for (const mod of missingModules) {
    if (!mod.startsWith(".") && !mod.startsWith("/")) {
      decls += `declare module '${mod}';\n`;
    }
  }
  const declFile = resolve(ROOT, "server/types/missing-modules.d.ts");
  try {
    writeFileSync(declFile, decls, "utf8");
    console.log(`Created ${declFile} with ${missingModules.size} module declarations.`);
  } catch {
    // parent dir may not exist
    import("fs").then(({ mkdirSync }) => {
      mkdirSync(resolve(ROOT, "server/types"), { recursive: true });
      writeFileSync(declFile, decls, "utf8");
    });
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
const totalFixed = Object.values(stats).reduce((a, b) => a + b, 0) - stats.other;
console.log("\n── Fix summary ──────────────────────────────────────────────");
console.log(`  TS18046/TS2571 (unknown error): ${stats.TS18046}`);
console.log(`  TS7006 (implicit any):          ${stats.TS7006}`);
console.log(`  TS6133 (unused vars):           ${stats.TS6133}`);
console.log(`  TS2769 (pino overload):         ${stats.TS2769}`);
console.log(`  TS2307 (missing modules):       ${missingModules.size} declarations`);
console.log(`  Remaining (unhandled):          ${stats.other}`);
console.log(`  Total fixes applied:            ${totalFixed}`);
