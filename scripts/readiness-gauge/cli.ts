#!/usr/bin/env npx tsx
/**
 * readiness-gauge — universal, tunable production-readiness gauge.
 *
 * Usage:
 *   npx tsx scripts/readiness-gauge/cli.ts --profile fintech
 *   npx tsx scripts/readiness-gauge/cli.ts --profile media --format json --out gauge.json
 *   npx tsx scripts/readiness-gauge/cli.ts --profile-file ./my-industry.json
 *   npx tsx scripts/readiness-gauge/cli.ts --list-profiles
 *   npx tsx scripts/readiness-gauge/cli.ts --list-checks
 *   npx tsx scripts/readiness-gauge/cli.ts --profile saas --only typecheck,unit-tests
 *   npx tsx scripts/readiness-gauge/cli.ts --profile generic --skip production-build
 *
 * npm script: npm run readiness-gauge -- --profile fintech
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ALL_CHECKS } from "./lib/checks.js";
import { buildGaugeReport, runChecks } from "./lib/engine.js";
import {
  listProfiles,
  loadProfile,
  resolveChecks,
  resolveProfilesDir,
} from "./lib/profiles.js";
import { renderJson, renderMarkdown } from "./lib/report.js";

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function usage(): string {
  return [
    "readiness-gauge — universal, tunable production-readiness gauge",
    "",
    "Options:",
    "  --profile <name>        industry profile (default: generic)",
    "  --profile-file <path>   custom profile JSON (overrides --profile)",
    "  --list-profiles         print available industry profiles",
    "  --list-checks           print the check catalog",
    "  --only <id,id>          run only these checks",
    "  --skip <id,id>          skip these checks",
    "  --format <md|json>      output format (default: md)",
    "  --out <file>            write report to file (default: stdout)",
    "  --cwd <dir>             repository root (default: current directory)",
    "",
    "Tuning:",
    "  Copy scripts/readiness-gauge/profiles/<name>.json, adjust weights,",
    "  required flags, per-check config, and thresholds, then pass it with",
    "  --profile-file. See READINESS_GAUGE.md for the full schema.",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    console.log(usage());
    return;
  }
  const profilesDir = resolveProfilesDir();

  if (hasFlag(args, "--list-profiles")) {
    for (const p of listProfiles(profilesDir)) console.log(p);
    return;
  }
  if (hasFlag(args, "--list-checks")) {
    for (const c of ALL_CHECKS) {
      console.log(`${c.id}  [${c.category}]  ${c.name} — ${c.description}`);
    }
    return;
  }

  const profileFile = argValue(args, "--profile-file");
  const profileName = argValue(args, "--profile") ?? "generic";
  const profile = profileFile
    ? loadProfile(profilesDir, resolve(profileFile))
    : loadProfile(profilesDir, profileName);

  const cwd = resolve(argValue(args, "--cwd") ?? process.cwd());
  const resolved = resolveChecks(
    profile,
    ALL_CHECKS,
    parseList(argValue(args, "--only")),
    parseList(argValue(args, "--skip")),
  );
  const enabledCount = resolved.filter((r) => r.enabled).length;
  if (enabledCount === 0) {
    console.error("readiness-gauge: no checks enabled — nothing to run.");
    process.exitCode = 2;
    return;
  }

  console.error(
    `readiness-gauge: profile "${profile.displayName}" — running ${enabledCount} check(s)`,
  );
  const scored = await runChecks({ cwd }, resolved, (id, i, total) => {
    console.error(`  [${i}/${total}] ${id}…`);
  });

  const report = buildGaugeReport(profile, cwd, scored);
  const format = argValue(args, "--format") ?? "md";
  const output = format === "json" ? renderJson(report) : renderMarkdown(report);

  const outFile = argValue(args, "--out");
  if (outFile) {
    writeFileSync(resolve(outFile), output);
    console.error(`readiness-gauge: report written to ${outFile}`);
  } else {
    process.stdout.write(output);
  }
  console.error(
    `readiness-gauge: score ${report.score ?? "n/a"} — ${report.verdict}`,
  );
  process.exitCode = report.verdict === "NO GO" ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(`readiness-gauge failed: ${err?.message ?? err}`);
    process.exit(1);
  });
}

export { main };
