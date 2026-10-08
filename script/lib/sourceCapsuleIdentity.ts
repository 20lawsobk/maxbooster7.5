import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Conservative superset of the source builder's admission rules. More inputs
// may invalidate reuse; an admitted file must never be omitted from identity.
export async function sourceCapsuleIdentity(root: string, excludes: string[], rootExcludes: string[] = []) {
  const hash = createHash("sha256").update(JSON.stringify({ version: 1, excludes, rootExcludes, node: process.version }));
  const excluded = (name: string) => excludes.some(pattern => {
    if (!/[*?]/.test(pattern)) return name === pattern || name.endsWith(pattern);
    const expression = pattern.split(/([*?])/g).map(part =>
      part === "*" ? ".*" : part === "?" ? "." : part.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("");
    return new RegExp(`^${expression}$`).test(name);
  });
  const records: unknown[][] = [];
  const jobs: { absolute: string; record: unknown[] }[] = [];
  let completed = 0;
  function walk(relative: string) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    const record: unknown[] = [relative, stat.mode & 0o777];
    records.push(record);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        if (!relative && rootExcludes.some(pattern => name === pattern ||
            (pattern.endsWith("*") && name.startsWith(pattern.slice(0, -1))))) continue;
        if (!excluded(name)) walk(path.join(relative, name));
      }
    } else if (stat.isFile()) {
      jobs.push({ absolute, record });
    } else if (stat.isSymbolicLink()) record.push("link", fs.readlinkSync(absolute));
    else throw new Error(`Unsupported source identity input: ${relative}`);
  }
  walk("");
  let cursor = 0;
  const progress = setInterval(() => console.log(`[source-identity] ${completed}/${jobs.length} files hashed`), 15000);
  try {
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const fileHash = createHash("sha256");
        for await (const chunk of fs.createReadStream(job.absolute)) fileHash.update(chunk);
        job.record.push("file", fileHash.digest("hex"));
        completed++;
      }
    }));
  } finally { clearInterval(progress); }
  for (const record of records) hash.update(JSON.stringify(record));
  return hash.digest("hex");
}
