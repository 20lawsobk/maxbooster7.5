/**
 * Build the Max Booster platform capsule: the entire platform packaged into
 * a single Pocket Dimension (content-addressed, deduplicated, compressed).
 *
 * Usage: npx tsx scripts/package-capsule.ts [version]
 * The capsule is the deployment artifact for the VM route — copy it to the
 * target machine and boot from it (extract-and-boot or stream-and-serve).
 */
import { readFileSync } from "node:fs";
import { packagePlatform } from "../server/pocket-dimension/platform-capsule.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version?: string };
const version = process.argv[2] ?? pkg.version ?? "0.0.0";

const meta = await packagePlatform(version);
console.log("\nCapsule built:");
console.log(`  id:      ${meta.id}`);
console.log(`  version: ${meta.version}`);
console.log(`  files:   ${meta.contents.totalFiles}`);
console.log(
  `  bytes:   ${meta.contents.totalSize} -> ${meta.contents.compressedSize} ` +
    `(${meta.contents.compressionRatio.toFixed(1)}x)`,
);
console.log(`  manifest sha256: ${meta.checksums.manifest}`);
