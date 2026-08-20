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

// Every family referenced by the per-error-type fix configuration must exist
// in the research catalog, so the two files cannot silently drift apart.
let fixConfig = null;
try {
  const fixConfigPath = path.join(process.cwd(), "scripts", "error-fix-configuration.json");
  fixConfig = JSON.parse(fs.readFileSync(fixConfigPath, "utf8"));
  const familyIds = new Set(families.map((f) => f.id));
  for (const id of fixConfig.researchFamilies?.ids ?? []) {
    if (!familyIds.has(id)) errors.push(`error-fix-configuration.json references unknown research family: ${id}`);
  }
  if (!fixConfig.typescriptDiagnostics || Object.keys(fixConfig.typescriptDiagnostics).length === 0) {
    errors.push("error-fix-configuration.json missing typescriptDiagnostics entries");
  }
  if (!fixConfig.eslintRules || Object.keys(fixConfig.eslintRules).length === 0) {
    errors.push("error-fix-configuration.json missing eslintRules entries");
  }
} catch (e) {
  errors.push(`error-fix-configuration.json invalid or unreadable: ${e.message}`);
}

// Derive the TS diagnostic codes ACTUALLY observed in the canonical live
// typecheck snapshot and require every one to have a bespoke entry in
// typescriptDiagnostics (this is what catches drift when a real diagnostic
// code appears that the JSON doesn't yet know about).
if (fixConfig) {
  const snapshotPaths = fixConfig.liveTsSnapshot?.sourceFiles ?? [];
  const liveCodes = new Set();
  for (const rel of snapshotPaths) {
    const abs = path.join(process.cwd(), rel);
    if (!fs.existsSync(abs)) {
      errors.push(`liveTsSnapshot source file missing: ${rel}`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const m of text.matchAll(/error (TS\d+)/g)) liveCodes.add(m[1]);
  }
  const configuredCodes = new Set(Object.keys(fixConfig.typescriptDiagnostics ?? {}));
  const uncoveredTs = [...liveCodes].filter((code) => !configuredCodes.has(code));
  if (uncoveredTs.length > 0) {
    errors.push(
      `error-fix-configuration.json does not cover ${uncoveredTs.length} live TS diagnostic code(s): ${uncoveredTs.join(", ")}`,
    );
  }
}

// Every external handler script fix-all.mjs actually invokes must be listed
// (and exist on disk); every listed handler must actually be referenced by
// fix-all.mjs, so the two can't silently drift apart.
if (fixConfig) {
  try {
    const fixAllPath = path.join(process.cwd(), "scripts", "fix-all.mjs");
    const fixAllSource = fs.readFileSync(fixAllPath, "utf8");
    const referenced = new Set(
      [...fixAllSource.matchAll(/["'](scripts\/fix-[a-z0-9-]+\.mjs)["']/g)].map((m) => m[1]),
    );
    const configured = new Set((fixConfig.externalHandlers ?? []).map((h) => h.script));
    for (const script of referenced) {
      if (!configured.has(script)) errors.push(`fix-all.mjs references handler not in externalHandlers: ${script}`);
    }
    for (const script of configured) {
      if (!referenced.has(script)) errors.push(`externalHandlers lists a script fix-all.mjs never references: ${script}`);
      if (!fs.existsSync(path.join(process.cwd(), script))) errors.push(`externalHandlers script does not exist on disk: ${script}`);
    }
  } catch (e) {
    errors.push(`could not validate externalHandlers against fix-all.mjs: ${e.message}`);
  }
}

// Derive the ESLint rules ACTUALLY enabled by the live flat config (not just
// what the JSON claims) and require every one of them to be accounted for,
// either with a bespoke entry in eslintRules or by name in
// baselineCorrectnessRules.ids. This is what prevents the catalog from
// silently drifting out of sync with eslint.config.js.
if (fixConfig) {
  try {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint({ overrideConfigFile: path.join(process.cwd(), "eslint.config.js") });
    const sampleFiles = ["server/index.ts", "AI enhancements/audio-processor.js"];
    const enabledRuleIds = new Set();
    for (const file of sampleFiles) {
      const cfg = await eslint.calculateConfigForFile(file).catch(() => null);
      if (!cfg?.rules) continue;
      for (const [ruleId, severity] of Object.entries(cfg.rules)) {
        const sev = Array.isArray(severity) ? severity[0] : severity;
        if (sev === 1 || sev === 2 || sev === "warn" || sev === "error") enabledRuleIds.add(ruleId);
      }
    }
    const covered = new Set([
      ...Object.keys(fixConfig.eslintRules ?? {}),
      ...(fixConfig.baselineCorrectnessRules?.ids ?? []),
    ]);
    const uncovered = [...enabledRuleIds].filter((id) => !covered.has(id));
    if (uncovered.length > 0) {
      errors.push(
        `error-fix-configuration.json does not cover ${uncovered.length} live-enabled ESLint rule(s): ${uncovered.join(", ")}`,
      );
    }
  } catch (e) {
    errors.push(`could not derive live ESLint rule coverage: ${e.message}`);
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