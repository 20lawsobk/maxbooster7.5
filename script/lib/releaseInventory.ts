import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { shouldCopyProductionSimulationPath } from "../../scripts/lib/production-simulation-copy.mjs";

export type ReleaseEntry = { path: string; sha256: string; mode: number; bytes: number };

export function buildEnvironmentDigest(env: NodeJS.ProcessEnv) {
  const publicBuildInputs = Object.keys(env).filter(key => key.startsWith("VITE_")).sort()
    .map(key => [key, env[key]]);
  return createHash("sha256").update(JSON.stringify(publicBuildInputs)).digest("hex");
}

export async function fileDigest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function sourceIncluded(relative: string): boolean {
  const parts = relative.split("/");
  // These Vite aliases are build inputs even though they are not shipped as
  // raw runtime directories. Changes must invalidate a prepared frontend.
  if (["attached_assets", "built-in plugins dsp"].includes(parts[0])) return true;
  if (relative === "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt") return true;
  if ([".prepared-release", ".node_bin", "python_runtime", ".deployment-pack-state"].includes(parts[0])) return false;
  if (parts.includes("node_modules") || parts.includes("target")) return false;
  if (parts[0] === "dist") return relative === "dist" || relative === "dist/pdim-restore.mjs";
  return shouldCopyProductionSimulationPath(relative);
}

/** A content inventory also catches newly added/deleted inputs, not just edits
 * to paths named by an old manifest. Never follows a symlink outside the root. */
export async function inventory(root: string, include: (relative: string) => boolean = () => true): Promise<ReleaseEntry[]> {
  root = fs.realpathSync(root);
  const entries: ReleaseEntry[] = [];
  async function walk(relative: string) {
    const file = path.join(root, relative);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) {
      if (relative) entries.push({ path: relative, sha256: createHash("sha256").update("directory").digest("hex"),
        mode: stat.mode & 0o777, bytes: 0 });
      for (const name of fs.readdirSync(file).sort()) {
        const child = relative ? `${relative}/${name}` : name;
        if (include(child)) await walk(child);
      }
    } else if (stat.isFile()) {
      entries.push({ path: relative, sha256: await fileDigest(file), mode: stat.mode & 0o777, bytes: stat.size });
    } else if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(file);
      if (!resolved.startsWith(root + path.sep)) throw new Error(`External release input link: ${relative}`);
      // Do not silently omit links: bind their target text into source identity.
      entries.push({ path: relative, sha256: createHash("sha256").update(`link:${fs.readlinkSync(file)}`).digest("hex"),
        mode: stat.mode & 0o777, bytes: stat.size });
    } else throw new Error(`Unsupported release input: ${relative}`);
  }
  await walk("");
  return entries;
}

export function assertInventory(expected: ReleaseEntry[], actual: ReleaseEntry[], label: string) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`${label} changed. Run npm run release:prepare again; publishing will not rebuild.`);
  }
}