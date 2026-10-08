import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { packCapsule, CAPSULE_COMPRESSION_ID, type PackCapsuleOptions } from "./capsulePack.js";

const exec = promisify(execFile);
const hashFile = async (file: string) => {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

// Content, path, permissions and symlink text all participate. Never use
// mtimes or lockfile identity alone to authorize replacement of a runtime tree.
export async function capsuleInputIdentity(options: PackCapsuleOptions) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ version: 1, dir: options.dir, capsule: options.capsule,
    codec: CAPSULE_COMPRESSION_ID, level: options.compressionLevel,
    excludes: options.excludePaths ?? [], required: options.requiredMembers ?? [] }));
  const records: unknown[][] = [];
  const jobs: { absolute: string; record: unknown[] }[] = [];
  function walk(relative: string) {
    const within = path.relative(options.dir, relative).split(path.sep).join("/");
    if ((options.excludePaths ?? []).some(pattern =>
      !/[*?]/.test(pattern) && (within === pattern || within.startsWith(pattern + "/")))) return;
    const absolute = path.join(options.root, relative);
    const stat = fs.lstatSync(absolute);
    const record: unknown[] = [relative, stat.mode & 0o7777];
    records.push(record);
    if (stat.isDirectory()) {
      record.push("directory");
      for (const name of fs.readdirSync(absolute).sort()) walk(path.join(relative, name));
    } else if (stat.isFile()) { record.push("file", stat.size); jobs.push({ absolute, record }); }
    else if (stat.isSymbolicLink()) record.push("link", fs.readlinkSync(absolute));
    else throw new Error(`Unsupported capsule input: ${relative}`);
  }
  walk(options.dir);
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      job.record.push(await hashFile(job.absolute));
    }
  }));
  for (const record of records) hash.update(JSON.stringify(record));
  return hash.digest("hex");
}

export async function packCachedDeploymentCapsule(options: PackCapsuleOptions) {
  const cache = path.join(options.root, ".deployment-capsule-cache");
  if (fs.existsSync(cache) && !fs.lstatSync(cache).isDirectory()) throw new Error("Invalid capsule cache root");
  fs.mkdirSync(cache, { recursive: true });
  const key = await capsuleInputIdentity(options);
  const entry = path.join(cache, key);
  const name = path.basename(options.capsule);
  const manifestName = name.replace(/\.pdim$/, ".manifest.json");
  if (!fs.existsSync(entry)) {
    const stage = fs.mkdtempSync(path.join(cache, ".building-"));
    try {
      const result = await packCapsule({ ...options, capsule: name, outputRoot: stage, preserveSource: true });
      if (!result) throw new Error("Capsule source disappeared");
      if (key !== await capsuleInputIdentity(options)) throw new Error("Capsule inputs changed while packing");
      // Validate the actual compressor output and archive traversal, not just
      // a checksum of potentially invalid bytes, before admitting cache reuse.
      await exec("tar", ["--zstd", "--compare", "-f", path.join(stage, name)], {
        cwd: options.root, maxBuffer: 1024 * 1024,
      });
      fs.writeFileSync(path.join(stage, "identity.json"), JSON.stringify({ key }));
      fs.renameSync(stage, entry);
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
  if (!fs.lstatSync(entry).isDirectory()) throw new Error("Invalid capsule cache entry");
  const record = JSON.parse(fs.readFileSync(path.join(entry, "identity.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(entry, manifestName), "utf8"));
  if (record.key !== key || manifest.compression !== CAPSULE_COMPRESSION_ID ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      await hashFile(path.join(entry, name)) !== manifest.sha256) {
    throw new Error("Capsule cache is corrupt; source retained");
  }
  const destination = path.join(options.outputRoot ?? options.root, options.capsule);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  for (const [source, target] of [[name, destination], [manifestName, destination.replace(/\.pdim$/, ".manifest.json")]]) {
    const temporary = `${target}.${randomUUID()}.partial`;
    try { fs.copyFileSync(path.join(entry, source), temporary); fs.renameSync(temporary, target); }
    finally { fs.rmSync(temporary, { force: true }); }
  }
  if (!options.preserveSource) fs.rmSync(path.join(options.root, options.dir), { recursive: true });
  console.log(`[capsule-cache] Verified ${name}; ${manifest.compression}; source ${options.preserveSource ? "retained" : "removed"}`);
  return manifest;
}
