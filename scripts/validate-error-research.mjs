#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "scripts", "error-research-catalog.json");
const kbPath = path.join(root, "server", "services", "errorKnowledgeBase.ts");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const errors = [];

if (catalog.schemaVersion !== 1) errors.push("unsupported catalog schema");
if (catalog.policy?.unknownErrors !== "report_only") {
  errors.push("unknown errors must remain report_only");
}
const families = catalog.families ?? [];
const ids = new Set();
const familyIds = new Set(families.map((family) => family.id));
for (const family of families) {
  if (!family.id || ids.has(family.id)) errors.push(`duplicate/missing family id: ${family.id}`);
  ids.add(family.id);
  for (const key of ["signals", "prevention", "safeAction", "verifyBy"]) {
    if (!family[key] || (Array.isArray(family[key]) && family[key].length === 0)) {
      errors.push(`${family.id}: missing ${key}`);
    }
  }
  const sources = catalog.sources?.[family.id];
  if (!Array.isArray(sources) || sources.length === 0 || sources.some((url) => !/^https:\/\//.test(url))) {
    errors.push(`${family.id}: missing authoritative HTTPS sources`);
  }
}

// Keep the catalog aligned with the live KB's categories and stable IDs.
const kb = fs.readFileSync(kbPath, "utf8");
const categories = [...kb.matchAll(/category:\s*"([^"]+)"/g)].map((m) => m[1]);
for (const category of new Set(categories)) {
  const mapped = catalog.categoryMap?.[category] ?? category;
  if (!familyIds.has(mapped)) {
    errors.push(`category ${category} maps to missing family ${mapped}`);
  }
}
const kbIds = [...kb.matchAll(/^\s*id:\s*"([^"]+)"/gm)].map((m) => m[1]);
if (new Set(kbIds).size !== kbIds.length) errors.push("duplicate knowledge-base IDs");

if (errors.length) {
  console.error("[error-research] FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  `[error-research] PASS — ${families.length} researched families cover ${new Set(categories).size} live KB categories and ${kbIds.length} unique entries; unknowns remain report-only`,
);