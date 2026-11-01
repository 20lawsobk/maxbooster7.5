#!/usr/bin/env node
/**
 * fix-singleton-optional-chain.mjs — codemod debris: `?.` on always-defined
 * module singletons (router/db/storage/app). Only rewrites an identifier in a
 * file where its non-null provenance is proven:
 *   router  — file contains `const router = Router()` / `= express.Router()`
 *   db      — file imports { db } from a ../db module
 *   storage — file imports { storage } from a storage module
 *   app     — file contains `const app = express()` or `(app: Express`
 * Syntax-gated via esbuild transform.
 */
import fs from "node:fs";
import { transformSync } from "esbuild";
import { execSync } from "node:child_process";

const files = execSync(String.raw`grep -rlE "\b(router|db|storage|app)\?\." server --include=*.ts`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
let changed = 0, sites = 0, restored = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const ok = [];
  if (/const router(?::\s*[\w.]+)?\s*=\s*(?:express\.)?Router\(\)/.test(src)) ok.push("router");
  if (/import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*["'][^"']*\/db(?:\.js)?["']/.test(src)) ok.push("db");
  if (/import\s*\{[^}]*\bstorage\b[^}]*\}\s*from\s*["'][^"']*storage[^"']*["']/.test(src)) ok.push("storage");
  if (/const app\s*=\s*express\(\)|\bapp:\s*(?:express\.)?(?:Express|Application)\b/.test(src)) ok.push("app");
  if (!ok.length) continue;
  const re = new RegExp(`\\b(${ok.join("|")})\\?\\.`, "g");
  const out = src.replace(re, (_, n) => { sites++; return `${n}.`; });
  if (out === src) continue;
  try {
    transformSync(out, { loader: "ts", format: "esm" });
    fs.writeFileSync(file, out);
    changed++;
  } catch { restored++; }
}
console.log(`fix-singleton-optional-chain: files=${changed} sites~=${sites} syntax-restored=${restored}`);
