#!/usr/bin/env node
/**
 * fix-table-optional-chain.mjs — codemod debris: `tableName?.col` on Drizzle
 * pgTable objects (typed {} under ?. and never nullish at runtime).
 * Per file, only identifiers imported from the shared schema module are fixed,
 * so same-named locals in other files are untouched. Syntax-gated via esbuild.
 */
import fs from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";
import { execSync } from "node:child_process";

const schemaSrc = fs.readFileSync("shared/schema.ts", "utf8");
const tables = new Set([...schemaSrc.matchAll(/export const (\w+) = pgTable/g)].map(m => m[1]));

const files = execSync(`grep -rlE "\\?\\." server --include=*.ts`, { encoding: "utf8" }).trim().split("\n");
let changedFiles = 0, sites = 0, restored = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  // which schema tables does this file import from a schema module?
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']*schema(?:\.js)?["']/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && tables.has(name)) imported.add(name);
    }
  }
  if (!imported.size) continue;
  const re = new RegExp(`\\b(${[...imported].join("|")})\\?\\.`, "g");
  const out = src.replace(re, (_, n) => { sites++; return `${n}.`; });
  if (out === src) continue;
  try {
    transformSync(out, { loader: "ts", format: "esm" });
    fs.writeFileSync(file, out);
    changedFiles++;
  } catch {
    restored++; sites = sites; // rolled back, counts stay approximate
  }
}
console.log(`fix-table-optional-chain: files=${changedFiles} sites~=${sites} syntax-restored=${restored}`);
