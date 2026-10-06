import fs from "node:fs";
import {restoreCapsule} from "../pdim-restore.mjs";
const [capsule,manifest,target,sentinel]=process.argv.slice(2);
// Missing packed inputs must not be silently reported as restored.
if (!fs.existsSync(capsule) || !fs.existsSync(manifest)) {
  throw new Error(`Missing required runtime capsule: ${capsule}`);
}
if (!await restoreCapsule(capsule,manifest,target,sentinel)) {
  throw new Error(`Failed to restore ${target}`);
}
