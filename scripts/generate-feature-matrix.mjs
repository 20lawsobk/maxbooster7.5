#!/usr/bin/env node
/**
 * Generate the production feature inventory from the authoritative audit lists.
 * Existing evidence is attached only when it is explicit; no row is promoted
 * to VERIFIED from route existence or aggregate test counts.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "production-readiness");
const OUTPUT = path.join(REPORT_DIR, "feature-matrix.csv");
const SOURCES = [
  ["backend-route-files.txt", "backend route"],
  ["backend-service-files.txt", "backend service"],
  ["frontend-page-files.txt", "frontend page"],
];

function readLines(file) {
  return fs
    .readFileSync(path.join(REPORT_DIR, file), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function domainFor(file, kind) {
  const normalized = file.toLowerCase();
  if (kind === "frontend page") return "frontend";
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("stripe") || normalized.includes("payment")) return "billing";
  if (normalized.includes("upload") || normalized.includes("storage")) return "storage";
  if (normalized.includes("distribution") || normalized.includes("release")) return "distribution";
  if (normalized.includes("social") || normalized.includes("content")) return "social";
  if (normalized.includes("beat") || normalized.includes("marketplace")) return "marketplace";
  if (normalized.includes("auth") || normalized.includes("session")) return "auth";
  if (normalized.includes("maxcore") || normalized.includes("ai")) return "ai";
  if (normalized.includes("health") || normalized.includes("monitor")) return "operations";
  return kind === "backend route" ? "api" : "backend";
}

function statusFor(file) {
  // These are explicit incomplete-feature markers from the prior audit.
  if (file === "server/services/automation-system.ts") {
    return {
      status: "BLOCKED",
      notes:
        "Explicit honest incomplete actions remain: payment, analytics, AI mix/master, and beat upload have no real side effect.",
    };
  }
  return { status: "UNREVIEWED", notes: "Requires feature-level evidence review." };
}

const rows = [];
const seen = new Set();
for (const [source, kind] of SOURCES) {
  for (const file of readLines(source)) {
    if (seen.has(file)) continue;
    seen.add(file);
    const status = statusFor(file);
    rows.push({
      path: file,
      domain: domainFor(file, kind),
      entrypoints: "",
      authz: "",
      side_effects: "",
      external_dependencies: "",
      success_evidence: "",
      failure_evidence: "",
      test_files: "",
      status: status.status,
      owner: "",
      notes: `${kind}; ${status.notes}`,
    });
  }
}

const header = [
  "path",
  "domain",
  "entrypoints",
  "authz",
  "side_effects",
  "external_dependencies",
  "success_evidence",
  "failure_evidence",
  "test_files",
  "status",
  "owner",
  "notes",
];
const output = [
  header.join(","),
  ...rows.map((row) => header.map((key) => csv(row[key])).join(",")),
  "",
].join("\n");
fs.writeFileSync(OUTPUT, output);
console.log(`[feature-matrix] wrote ${rows.length} rows to ${path.relative(ROOT, OUTPUT)}`);