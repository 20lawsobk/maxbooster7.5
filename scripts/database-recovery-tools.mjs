import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** Find versioned tools without requiring Nix or passing ambient credentials. */
export function discoverPostgresBins(searchPath, { readDirectory = readdirSync, spawn = spawnSync } = {}) {
  const candidates = new Set();
  try {
    for (const directory of readDirectory("/nix/store")) {
      if (/^[^-]+-postgresql-\d/.test(directory)) candidates.add(`/nix/store/${directory}/bin`);
    }
  } catch (error) {
    if (!["ENOENT", "ENOTDIR", "EACCES"].includes(error?.code)) throw error;
  }
  for (const directory of searchPath.split(":").filter(Boolean)) candidates.add(directory);
  const byMajor = new Map();
  for (const directory of candidates) {
    const probe = spawn(join(directory, "pg_dump"), ["--version"], {
      env: { PATH: searchPath, HOME: "/tmp", LANG: "C" },
      encoding: "utf8", timeout: 5_000,
    });
    const match = probe.status === 0 && probe.stdout.match(/\(PostgreSQL\)\s+(\d+)(?:\.(\d+))?/);
    if (!match) continue;
    const major = Number(match[1]), minor = Number(match[2] ?? 0);
    if (!byMajor.has(major) || byMajor.get(major).minor < minor) byMajor.set(major, { directory, minor });
  }
  return [...byMajor.entries()].sort(([a], [b]) => b - a).map(([, value]) => value.directory);
}

// Dumps preserve visible column order, while omitted dropped columns leave
// physical attnum gaps only in the source. Compare the logical ordinal.
export const RECOVERY_COLUMN_ORDINAL_SQL =
  "row_number() OVER (PARTITION BY a.attrelid ORDER BY a.attnum)::integer AS attnum";
