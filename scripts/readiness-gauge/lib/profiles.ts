/**
 * readiness-gauge — industry profile loading, validation, and resolution.
 *
 * Profiles are plain JSON, so any team can tune the gauge to its industry
 * without touching code: adjust weights, mark checks required, add per-check
 * config, or move the GO thresholds.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECK_IDS } from "./checks.js";
import type {
  Check,
  CheckTuning,
  IndustryProfile,
  ResolvedCheck,
} from "./types.js";

/** Directory holding the built-in industry profile JSON files. */
export function resolveProfilesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");
}

export function listProfiles(profilesDir: string): string[] {
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();
}

function fail(msg: string): never {
  throw new Error(`invalid industry profile: ${msg}`);
}

/** Parse and validate a profile object (from JSON). */
export function validateProfile(raw: unknown): IndustryProfile {
  if (typeof raw !== "object" || raw === null) fail("profile must be a JSON object");
  const p = raw as Record<string, unknown>;
  for (const f of ["name", "displayName", "description", "version", "thresholds", "checks"]) {
    if (p[f] === undefined) fail(`missing required field "${f}"`);
  }
  const th = p.thresholds as Record<string, unknown>;
  if (typeof th.go !== "number" || typeof th.conditionalGo !== "number") {
    fail('thresholds.go and thresholds.conditionalGo must be numbers');
  }
  if (th.go <= th.conditionalGo) fail("thresholds.go must be greater than thresholds.conditionalGo");
  if (th.go > 100 || th.conditionalGo < 0) fail("thresholds must be within 0..100");

  const checks = p.checks as Record<string, unknown>;
  if (typeof checks !== "object" || checks === null) fail('"checks" must be an object');
  for (const [id, tuning] of Object.entries(checks)) {
    if (!CHECK_IDS.includes(id)) fail(`unknown check id "${id}"`);
    if (typeof tuning !== "object" || tuning === null) fail(`check "${id}" tuning must be an object`);
    const t = tuning as Record<string, unknown>;
    if (t.weight !== undefined && (typeof t.weight !== "number" || t.weight < 1 || t.weight > 5)) {
      fail(`check "${id}" weight must be a number between 1 and 5`);
    }
    if (t.enabled !== undefined && typeof t.enabled !== "boolean") fail(`check "${id}" enabled must be boolean`);
    if (t.required !== undefined && typeof t.required !== "boolean") fail(`check "${id}" required must be boolean`);
    if (t.config !== undefined && (typeof t.config !== "object" || t.config === null)) {
      fail(`check "${id}" config must be an object`);
    }
  }
  return raw as IndustryProfile;
}

/** Load a profile by name (from profilesDir) or by explicit file path. */
export function loadProfile(
  profilesDir: string,
  nameOrPath: string,
): IndustryProfile {
  let file: string;
  if (nameOrPath.endsWith(".json") || nameOrPath.includes("/")) {
    file = nameOrPath;
  } else {
    file = join(profilesDir, `${nameOrPath}.json`);
  }
  if (!existsSync(file)) {
    const known = listProfiles(profilesDir).join(", ");
    throw new Error(
      `unknown profile "${nameOrPath}" (looked at ${file}). Known profiles: ${known || "none"}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err: any) {
    throw new Error(`could not parse profile ${file}: ${err.message}`);
  }
  return validateProfile(raw);
}

/**
 * Merge a profile with the check library into an ordered, resolved list.
 * `only`/`skip` filter by check id after profile enablement.
 */
export function resolveChecks(
  profile: IndustryProfile,
  allChecks: Check[],
  only?: string[],
  skip?: string[],
): ResolvedCheck[] {
  const resolved: ResolvedCheck[] = [];
  for (const check of allChecks) {
    const tuning: CheckTuning = profile.checks[check.id] ?? {};
    let enabled = tuning.enabled ?? true;
    if (only && only.length > 0) enabled = only.includes(check.id);
    if (skip && skip.includes(check.id)) enabled = false;
    resolved.push({
      check,
      enabled,
      weight: tuning.weight ?? 1,
      required: tuning.required ?? false,
      config: tuning.config ?? {},
    });
  }
  return resolved;
}
