import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { inventory, fileDigest } from "./releaseInventory.js";
import { runBuildProcess } from "./buildProcess.js";
import { inspectArtifacts, inspectRestored } from "../../scripts/verify-runtime-artifacts.mjs";

export const identity = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function treeIdentity(root: string, directory: string) {
  return identity(await inventory(root, file => directory === file || file.startsWith(directory + "/")));
}

/** Only checksum-verified, previously restored artifacts enter this cache.
 * Cache files are immutable; a corrupt entry is an error, not a hidden rebuild. */
export async function cachedCapsule(options: {
  cache: string; payload: string; name: string; key: string;
  build: (output: string) => Promise<void>;
  verify: (output: string) => Promise<void>;
}) {
  const { cache, payload, name, key, build, verify } = options;
  fs.mkdirSync(cache, { recursive: true });
  const entry = path.join(cache, `${name}-${key}`);
  if (!fs.existsSync(entry)) {
    const temporary = fs.mkdtempSync(path.join(cache, ".building-"));
    try {
      await build(temporary);
      await verify(temporary);
      const result = await inspectArtifacts(temporary, [name]);
      if (!result.ready) throw new Error(result.failures.join("\n"));
      fs.writeFileSync(path.join(temporary, "verified.json"), JSON.stringify({ key, evidence: result.evidence }));
      for (const file of fs.readdirSync(temporary)) fs.chmodSync(path.join(temporary, file), 0o444);
      fs.renameSync(temporary, entry);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  } else {
    const record = JSON.parse(fs.readFileSync(path.join(entry, "verified.json"), "utf8"));
    const result = await inspectArtifacts(entry, [name]);
    if (record.key !== key || !result.ready || identity(result.evidence) !== identity(record.evidence)) {
      throw new Error(`Verified capsule cache is damaged: ${name}; refusing to reuse it`);
    }
    console.log(`[release] Reusing verified ${name} capsule`);
  }
  for (const file of [`${name}.pdim`, `${name}.manifest.json`]) {
    fs.linkSync(path.join(entry, file), path.join(payload, file));
  }
}

/** Round-trip one capsule using the actual production restorer, then release
 * its extraction area before another capsule is checked. */
export async function verifyCapsule(sourceRoot: string, work: string, output: string, name: string, dir: string) {
  const scratch = fs.mkdtempSync(path.join(work, "verify-"));
  try {
    fs.mkdirSync(path.join(scratch, "dist"));
    fs.copyFileSync(path.join(sourceRoot, "dist/pdim-restore.mjs"), path.join(scratch, "dist/pdim-restore.mjs"));
    for (const suffix of [".pdim", ".manifest.json"]) {
      fs.linkSync(path.join(output, name + suffix), path.join(scratch, name + suffix));
    }
    const args = name === "app_remainder"
      ? [name + ".pdim", name + ".manifest.json", ".verified-app"]
      : [name + ".pdim", name + ".manifest.json", dir, ".verified-runtime"];
    const fn = name === "app_remainder" ? "restoreAppRemainderCapsule" : "restoreCapsule";
    await runBuildProcess(process.execPath, ["--input-type=module", "-e",
      `import {${fn}} from './dist/pdim-restore.mjs'; if (!await ${fn}(...${JSON.stringify(args)})) process.exitCode=1;`],
      scratch, { PATH: process.env.PATH });
    if (name === "python_runtime") {
      await runBuildProcess(path.join(scratch, "python_runtime/bin/python3"), ["-I",
        path.join(sourceRoot, "script/lib/verifyPortablePython.py"), path.join(scratch, "python_runtime"), "--runtime"],
        scratch, { PATH: process.env.PATH });
    }
    if (name === "app_remainder") {
      const result = inspectRestored(scratch, [
        "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs",
        "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html", "bin/boosterstate",
        "scripts/startup-health.mjs", "scripts/redis-supervisor.sh",
      ]);
      if (!result.ready) throw new Error(result.failures.join("\n"));
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(output, name + ".manifest.json"), "utf8"));
    for (const member of manifest.requiredMembers ?? []) {
      if (await fileDigest(path.join(scratch, dir, member.path)) !== member.sha256) {
        throw new Error(`Restored required member differs: ${name}/${member.path}`);
      }
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}