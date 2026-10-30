import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// Filesystem only: never connects to a database or claims a SQL file was applied.
const root = resolve(process.argv[2] ?? "migrations");
const journal = JSON.parse(await readFile(resolve(root, "meta/_journal.json"), "utf8"));
const known = new Set(journal.entries.map(entry => `${entry.tag}.sql`));
const files = (await readdir(root)).filter(name => name.endsWith(".sql")).sort();
const artifacts = [];
for (const name of files) {
  const body = await readFile(resolve(root, name));
  artifacts.push({
    name, sha256: createHash("sha256").update(body).digest("hex"),
    journaled: known.has(name), applied: "unverified",
  });
}
const missingFiles = [...known].filter(name => !files.includes(name));
console.log(JSON.stringify({ artifacts, missingFiles }, null, 2));
if (missingFiles.length || artifacts.some(item => !item.journaled)) {
  console.error("Migration provenance incomplete. Reconcile reviewed SQL and deployment receipts before release.");
  process.exitCode = 1;
}